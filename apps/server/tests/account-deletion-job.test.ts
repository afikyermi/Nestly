import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_BUDGET_MS, AUTH_REMOVALS_PER_RUN, runAccountDeletion, type AccountDeletionDb } from '../src/jobs/account-deletion.js';
import { deleteAuthUser, type AuthUserRemoval } from '../src/recovery/auth-admin.js';

// I9, decisions-in-force §22.6 (SRS BR-073, AC-191): at the end of the 30 days the deletion job removes the account's Auth user — one
// DELETE per account, only from the job. Here: the Auth call against a loopback stand-in (no database), and the job's step with a fake
// database (the claim, the stamp and the policies are pgTAP's, file 114; the real claim against the database is tests/db).

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

async function stub(status: number, json: unknown = {}): Promise<{ env: Record<string, string>; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers });
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(json));
    });
  });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: string | AddressInfo | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { env: { SUPABASE_SECRET_KEY: KEY, SUPABASE_JWT_ISSUER: `http://127.0.0.1:${address.port}/auth/v1` }, seen };
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

  it('[AC-191] Auth\'s user_not_found (the user is already gone) is "removed" too: the goal is reached, nothing to retry', async () => {
    const { env } = await stub(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
    expect(await deleteAuthUser({ userId: USER }, env)).toBe('removed');
  });

  it('[AC-191] any other 404 (a wrong Auth address) is "failed": the account is not stamped as removed while its Auth user may exist', async () => {
    const { env } = await stub(404, { message: 'no Route matched with those values' });
    expect(await deleteAuthUser({ userId: USER }, env)).toBe('failed');
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

/** A fake deletion record: `waiting` accounts executed and not yet removed from Auth (oldest first); a claim skips `skip`; stamped on removed. */
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
    async removeNextAuthUser(skip: readonly string[], remove: (accountId: string) => Promise<AuthUserRemoval>) {
      const accountId = queue.find((candidate) => !skip.includes(candidate));
      if (accountId === undefined) return undefined;
      const outcome = await remove(accountId);
      if (outcome === 'removed') {
        queue.splice(queue.indexOf(accountId), 1);
        stamped.push(accountId);
      }
      return { accountId, outcome };
    },
  };
  return db;
}

const removed = (calls: string[]) => (id: string): Promise<AuthUserRemoval> => (calls.push(id), Promise.resolve('removed'));

describe('[I9 §22.6 BR-073 AC-191] the deletion job: execute, then one Auth removal per executed account', () => {
  const plenty = (): number => 50_000;

  it('[AC-191] runs the execution, then removes each executed account from Auth exactly once and stamps it', async () => {
    const db = fakeDb(['u1', 'u2'], { executed: 2, waiting: 1, failed: 0 });
    const calls: string[] = [];
    const report = await runAccountDeletion({ db, removeAuthUser: removed(calls), timeLeft: plenty });
    expect(db.executeCalls).toBe(1);
    expect(calls).toEqual(['u1', 'u2']);
    expect(db.stamped).toEqual(['u1', 'u2']);
    expect(report).toEqual({ executed: 2, waiting: 1, failed: 0, authRemoved: 2, authFailed: 0 });
  });

  it('[AC-191] a failing account is called once per run, left unstamped for the next run, and does not hold back the ones after it', async () => {
    const db = fakeDb(['bad', 'u2']);
    const calls: string[] = [];
    const report = await runAccountDeletion({
      db,
      removeAuthUser: (id) => (calls.push(id), Promise.resolve(id === 'bad' ? 'failed' : 'removed')),
      timeLeft: plenty,
    });
    expect(calls).toEqual(['bad', 'u2']);
    expect(db.stamped).toEqual(['u2']);
    expect(report).toMatchObject({ authRemoved: 1, authFailed: 1 });
  });

  it('[AC-191] stops at the per-run cap, at its share of the budget, and when the function\'s time runs low', async () => {
    const many = Array.from({ length: AUTH_REMOVALS_PER_RUN + 5 }, (_, i) => `u${i}`);
    const db = fakeDb(many);
    expect((await runAccountDeletion({ db, removeAuthUser: removed([]), timeLeft: plenty })).authRemoved).toBe(AUTH_REMOVALS_PER_RUN);

    let clock = 50_000;
    const slow = fakeDb(['a', 'b', 'c', 'd', 'e']);
    const slowCalls: string[] = [];
    await runAccountDeletion({
      db: slow,
      removeAuthUser: (id) => {
        clock -= 4_000; // each call takes four seconds
        return removed(slowCalls)(id);
      },
      timeLeft: () => clock,
    });
    // 15 s budget, 8 s margin: two calls fit, the third would cross the share
    expect(slowCalls.length).toBeLessThanOrEqual(Math.ceil((AUTH_BUDGET_MS - 8_000) / 4_000));
    expect(slowCalls.length).toBeGreaterThan(0);

    const late = fakeDb(['u1']);
    expect((await runAccountDeletion({ db: late, removeAuthUser: removed([]), timeLeft: () => 1_000 })).authRemoved).toBe(0);
    expect(late.stamped).toEqual([]);
  });

  it('[§22.6] the execution refused (not bootstrapped) throws, so the handler reports it unavailable and calls no Auth', async () => {
    const calls: string[] = [];
    const db: AccountDeletionDb = {
      executeDue: () => Promise.reject(new Error('permission denied to set role "app_jobs"')),
      removeNextAuthUser: () => Promise.reject(new Error('unreachable')),
    };
    await expect(runAccountDeletion({ db, removeAuthUser: removed(calls), timeLeft: plenty })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('[§22.6] a failure of the Auth step after the execution keeps the execution counts in the report', async () => {
    const db: AccountDeletionDb = {
      executeDue: () => Promise.resolve({ executed: 3, waiting: 0, failed: 0 }),
      removeNextAuthUser: () => Promise.reject(new Error('column "auth_removed_at" does not exist')),
    };
    expect(await runAccountDeletion({ db, removeAuthUser: removed([]), timeLeft: plenty })).toEqual({
      executed: 3,
      waiting: 0,
      failed: 0,
      authRemoved: 0,
      authFailed: 0,
      authUnavailable: true,
    });
  });
});
