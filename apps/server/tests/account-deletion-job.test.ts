import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_REMOVALS_PER_RUN, runAccountDeletion, type AccountDeletionDb } from '../src/jobs/account-deletion.js';
import { deleteAuthUser, type AuthUserRemoval } from '../src/recovery/auth-admin.js';

// I9, decisions-in-force §22.6 (SRS BR-073, AC-191): at the end of the 30 days the deletion job removes the account's Auth user — one
// DELETE per account, only from the job. Here: the Auth call against a loopback stand-in (no database), and the job's step with a fake
// database (the claim, the stamp and the policies are pgTAP's, file 114).

interface Seen {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
}
const open: Server[] = [];
afterEach(() => {
  for (const server of open.splice(0)) server.close();
});

const USER = 'd0000000-0000-4000-8000-0000000000d1';
const KEY = ['sb', 'secret', 'unit-test-key-0123456789'].join('_');

async function stub(status: number): Promise<{ env: Record<string, string>; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        path: req.url ?? '',
        headers: req.headers,
      });
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end('{}');
    });
  });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: string | AddressInfo | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return {
    env: {
      SUPABASE_SECRET_KEY: KEY,
      SUPABASE_JWT_ISSUER: `http://127.0.0.1:${address.port}/auth/v1`,
    },
    seen,
  };
}

describe('[I9 §22.6 AC-191] deleteAuthUser: one DELETE of one Auth user', () => {
  it('[AC-191] a 200 is "removed", after exactly one DELETE of THE user id given, with the admin key', async () => {
    const { env, seen } = await stub(200);
    expect(await deleteAuthUser({ userId: USER }, env)).toBe('removed');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('DELETE');
    expect(seen[0]?.path).toBe(`/auth/v1/admin/users/${USER}`);
    expect(seen[0]?.headers.apikey).toBe(KEY);
  });

  it('[AC-191] a 404 (the user is already gone) is "removed" too: the goal is reached, nothing to retry', async () => {
    const { env } = await stub(404);
    expect(await deleteAuthUser({ userId: USER }, env)).toBe('removed');
  });

  it('[AC-191] any other answer is "failed" (the job tries again next run); a non-uuid id or a missing key makes no call', async () => {
    const { env } = await stub(500);
    expect(await deleteAuthUser({ userId: USER }, env)).toBe('failed');
    const ok = await stub(200);
    expect(await deleteAuthUser({ userId: 'not-a-uuid' }, ok.env)).toBe('failed');
    expect(await deleteAuthUser({ userId: `${USER}/../../users` }, ok.env)).toBe('failed');
    expect(ok.seen).toEqual([]);
    expect(await deleteAuthUser({ userId: USER }, { SUPABASE_JWT_ISSUER: ok.env.SUPABASE_JWT_ISSUER ?? '' })).toBe('failed');
    expect(ok.seen).toEqual([]);
  });

  it('[AC-191] an unreachable Auth is "failed", never a throw', async () => {
    const { env } = await stub(200);
    for (const server of open.splice(0)) server.close();
    expect(await deleteAuthUser({ userId: USER }, env)).toBe('failed');
  });
});

/** A fake deletion record: `waiting` accounts executed and not yet removed from Auth; a claimed account is stamped only on `removed`. */
function fakeDb(waiting: string[], execution = { executed: 0, waiting: 0, failed: 0 }): AccountDeletionDb & { stamped: string[]; executeCalls: number } {
  const queue = [...waiting];
  const stamped: string[] = [];
  const db = {
    stamped,
    executeCalls: 0,
    executeDue() {
      db.executeCalls += 1;
      return Promise.resolve(execution);
    },
    async removeNextAuthUser(remove: (accountId: string) => Promise<AuthUserRemoval>) {
      const next = queue[0];
      if (next === undefined) return undefined;
      const outcome = await remove(next);
      if (outcome === 'removed') {
        queue.shift();
        db.stamped.push(next);
      }
      return outcome;
    },
  };
  return db;
}

describe('[I9 §22.6 BR-073 AC-191] the deletion job: execute, then one Auth removal per executed account', () => {
  const plenty = (): number => 50_000;

  it('[AC-191] runs the execution, then removes each executed account from Auth exactly once and stamps it', async () => {
    const db = fakeDb(['u1', 'u2'], { executed: 2, waiting: 1, failed: 0 });
    const calls: string[] = [];
    const report = await runAccountDeletion({
      db,
      removeAuthUser: (id) => (calls.push(id), Promise.resolve('removed')),
      timeLeft: plenty,
    });
    expect(db.executeCalls).toBe(1);
    expect(calls).toEqual(['u1', 'u2']);
    expect(db.stamped).toEqual(['u1', 'u2']);
    expect(report).toEqual({
      executed: 2,
      waiting: 1,
      failed: 0,
      authRemoved: 2,
      authFailed: 0,
    });
  });

  it('[AC-191] a failed call is not repeated in the same run and leaves the account for the next run (not stamped)', async () => {
    const db = fakeDb(['u1', 'u2']);
    const calls: string[] = [];
    const report = await runAccountDeletion({
      db,
      removeAuthUser: (id) => (calls.push(id), Promise.resolve('failed')),
      timeLeft: plenty,
    });
    expect(calls).toEqual(['u1']);
    expect(db.stamped).toEqual([]);
    expect(report.authFailed).toBe(1);
  });

  it('[AC-191] stops at the per-run cap and when the time budget runs low', async () => {
    const many = Array.from({ length: AUTH_REMOVALS_PER_RUN + 5 }, (_, i) => `u${i}`);
    const db = fakeDb(many);
    const report = await runAccountDeletion({
      db,
      removeAuthUser: () => Promise.resolve('removed'),
      timeLeft: plenty,
    });
    expect(report.authRemoved).toBe(AUTH_REMOVALS_PER_RUN);
    const late = fakeDb(['u1']);
    const none = await runAccountDeletion({
      db: late,
      removeAuthUser: () => Promise.resolve('removed'),
      timeLeft: () => 1_000,
    });
    expect(none.authRemoved).toBe(0);
    expect(late.stamped).toEqual([]);
  });

  it('[§22.6] a database that refuses the job (not bootstrapped) throws, so the handler reports it unavailable and calls no Auth', async () => {
    const calls: string[] = [];
    const db: AccountDeletionDb = {
      executeDue: () => Promise.reject(new Error('permission denied to set role "app_jobs"')),
      removeNextAuthUser: () => Promise.reject(new Error('unreachable')),
    };
    await expect(
      runAccountDeletion({
        db,
        removeAuthUser: (id) => (calls.push(id), Promise.resolve('removed')),
        timeLeft: plenty,
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
