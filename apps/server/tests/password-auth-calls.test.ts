import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { cancelPassword, readSignInIdentities, setUserPassword } from '../src/recovery/auth-admin.js';

// F2.0 part a, the real Auth calls against a loopback stand-in (no database): c11 "Auth's same_password stays a success",
// c3 (the clear's password is random and never kept; since A6 the admin set itself ends every session, there is no separate sign-out call),
// c1 (the identities are read with the caller's token), c12 (the user id is the one given). Derived from spec.md and
// interface.md "Test seams" (routes of the default port). Real Auth behaviour is the Preview run (c17).

interface Seen { method: string; path: string; headers: IncomingHttpHeaders; body: string }
const open: Server[] = [];
afterEach(() => {
  for (const server of open.splice(0)) server.close();
});

const USER = 'a0000000-0000-4000-8000-0000000000a1';
const KEY = ['sb', 'secret', 'unit-test-key-0123456789'].join('_');
const PUBLISHABLE = ['sb', 'publishable', 'unit-test-key-9876543210'].join('_');

async function stub(status: number, json: unknown = {}): Promise<{ env: Record<string, string>; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(json));
    });
  });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: string | AddressInfo | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { env: { SUPABASE_SECRET_KEY: KEY, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_JWT_ISSUER: `http://127.0.0.1:${address.port}/auth/v1` }, seen };
}

describe('[F2.0-a c11] setUserPassword', () => {
  it('[F2.0-a c11] a 200 is "set", and the password goes to THE user id given', async () => {
    const { env, seen } = await stub(200, { id: USER });
    expect(await setUserPassword({ userId: USER, password: 'סיסמה ארוכה 12345' }, env)).toBe('set');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('PUT');
    expect(seen[0]?.path).toContain(USER);
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ password: 'סיסמה ארוכה 12345' });
  });

  it('[F2.0-a c11] Auth\'s same_password stays a success (a retry after a failed registration)', async () => {
    const { env } = await stub(422, { error_code: 'same_password', msg: 'New password should be different from the old password.' });
    expect(await setUserPassword({ userId: USER, password: 'סיסמה ארוכה 12345' }, env)).toBe('set');
  });

  it('[F2.0-a c3 c7] any other refusal is "failed", and so is a user id that is not a uuid or a missing key', async () => {
    const { env } = await stub(500, { error_code: 'unexpected_failure' });
    expect(await setUserPassword({ userId: USER, password: 'סיסמה ארוכה 12345' }, env)).toBe('failed');
    const ok = await stub(200);
    expect(await setUserPassword({ userId: 'not-a-uuid', password: 'סיסמה ארוכה 12345' }, ok.env)).toBe('failed');
    expect(ok.seen).toEqual([]);
    expect(await setUserPassword({ userId: USER, password: 'סיסמה ארוכה 12345' }, {})).toBe('failed');
  });
});

describe('[F2.0-a c3 c2] cancelPassword', () => {
  it('[F2.0-a c3] sets a different random password each time, and returns nothing of it', async () => {
    const { env, seen } = await stub(200);
    expect(await cancelPassword({ userId: USER }, env)).toBe('set');
    expect(await cancelPassword({ userId: USER }, env)).toBe('set');
    const [first, second] = seen.map((s) => String(Reflect.get(JSON.parse(s.body), 'password')));
    expect(first?.length).toBeGreaterThanOrEqual(32);
    expect(first).not.toBe(second);
  });
});

describe('[F2.0-a c1] readSignInIdentities', () => {
  it('[F2.0-a c1] GET /user with the caller\'s own token; the identities come back with provider and creation time', async () => {
    const { env, seen } = await stub(200, {
      id: USER,
      identities: [
        { provider: 'email', created_at: '2026-01-01T00:00:00Z' },
        { provider: 'google', created_at: '2026-02-01T00:00:00Z' },
      ],
    });
    const read = await readSignInIdentities({ accessToken: 'CALLER-TOKEN', clientIp: undefined }, env);
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.path).toMatch(/\/user$/);
    expect(seen[0]?.headers.authorization).toBe('Bearer CALLER-TOKEN');
    expect(seen[0]?.headers.apikey).toBe(PUBLISHABLE);
    expect(read).toEqual({
      kind: 'ok',
      identities: [
        { provider: 'email', createdAt: new Date('2026-01-01T00:00:00Z') },
        { provider: 'google', createdAt: new Date('2026-02-01T00:00:00Z') },
      ],
    });
  });

  it('[F2.0-a c1 c3] a refusal or a body with no identities is "failed", never an empty list', async () => {
    expect(await readSignInIdentities({ accessToken: 't', clientIp: undefined }, (await stub(401)).env)).toEqual({ kind: 'failed' });
    expect(await readSignInIdentities({ accessToken: 't', clientIp: undefined }, (await stub(200, { id: USER })).env)).toEqual({ kind: 'failed' });
  });
});
