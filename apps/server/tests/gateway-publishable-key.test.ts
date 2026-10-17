import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelPassword, isAdminConfigured, readSignInIdentities, resetPassword, setUserPassword } from '../src/recovery/auth-admin.js';

// Gateway publishable key (.work/gateway-publishable-key/spec.md c1-c10): the two calls that act with the caller's own token
// (GET /user, POST /logout?scope=global) send the publishable key as apikey; the admin calls keep the secret key. A fake Auth on
// loopback records every request. Sentinel key values only, assembled from parts.

interface Seen { method: string; path: string; headers: IncomingHttpHeaders; body: string }
const open: Server[] = [];
afterEach(() => {
  for (const server of open.splice(0)) server.close();
  vi.restoreAllMocks();
});

const USER = 'a0000000-0000-4000-8000-0000000000a1';
const EMAIL = 'owner@example.com';
const PASSWORD = 'סיסמה ארוכה 12345';
const SECRET = ['sb', 'secret', 'SENTINEL-SECRET-0123456789'].join('_');
const PUBLISHABLE = ['sb', 'publishable', 'SENTINEL-PUBLIC-9876543210'].join('_');
const SIGN_IN_TOKEN = 'SIGN-IN-TOKEN-ABC';

/** A fake Auth: routes by method and path, records everything. `logoutStatus` lets a test fail the sign-out. */
async function fakeAuth(options: { logoutStatus?: number } = {}): Promise<{ base: string; issuer: Record<string, string>; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = req.url ?? '';
      seen.push({ method: req.method ?? '', path, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.setHeader('content-type', 'application/json');
      res.statusCode = 200;
      let json: unknown = {};
      if (path.includes('/logout')) {
        res.statusCode = options.logoutStatus ?? 204;
        res.end(res.statusCode === 204 ? undefined : '{}');
        return;
      }
      if (path.includes('/admin/users/') && req.method === 'GET') json = { id: USER, email: EMAIL };
      else if (path.includes('/token')) json = { access_token: SIGN_IN_TOKEN, refresh_token: 'r' };
      else if (path.endsWith('/user')) json = { id: USER, identities: [{ provider: 'email', created_at: '2026-01-01T00:00:00Z' }] };
      res.end(JSON.stringify(json));
    });
  });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: string | AddressInfo | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${address.port}/auth/v1`;
  return { base, issuer: { SUPABASE_JWT_ISSUER: base }, seen };
}

const both = (issuer: Record<string, string>): Record<string, string> => ({ ...issuer, SUPABASE_SECRET_KEY: SECRET, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE });
const reset = { userId: USER, email: EMAIL, password: PASSWORD, clientIp: undefined };
const pathOf = (s: Seen): string => s.path.split('?')[0] ?? '';

describe('[gateway-key c1] readSignInIdentities sends the publishable key', () => {
  it('[gateway-key c1] GET /user carries apikey = publishable and the caller token as bearer, never the secret key', async () => {
    const { issuer, seen } = await fakeAuth();
    const read = await readSignInIdentities({ accessToken: 'CALLER-TOKEN', clientIp: undefined }, both(issuer));
    expect(read.kind).toBe('ok');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('GET');
    expect((seen[0]?.path ?? '').split('?')[0]).toMatch(/\/user$/);
    expect(seen[0]?.headers.apikey).toBe(PUBLISHABLE);
    expect(seen[0]?.headers.apikey).not.toBe(SECRET);
    expect(seen[0]?.headers.authorization).toBe('Bearer CALLER-TOKEN');
  });
});

describe('[gateway-key c2 c3] resetPassword', () => {
  it('[gateway-key c2] the global sign-out sends apikey = publishable and the bearer from the sign-in response; outcome completed', async () => {
    const { issuer, seen } = await fakeAuth();
    expect(await resetPassword(reset, both(issuer))).toBe('completed');
    const logout = seen.filter((s) => s.method === 'POST' && pathOf(s).endsWith('/logout'));
    expect(logout).toHaveLength(1);
    expect(logout[0]?.path).toContain('scope=global');
    expect(logout[0]?.headers.apikey).toBe(PUBLISHABLE);
    expect(logout[0]?.headers.authorization).toBe(`Bearer ${SIGN_IN_TOKEN}`);
  });

  it('[gateway-key c3] admin GET/PUT keep the secret key; the secret value is on no /user or /logout request (headers or body)', async () => {
    const { issuer, seen } = await fakeAuth();
    await resetPassword(reset, both(issuer));
    const admin = seen.filter((s) => pathOf(s).includes('/admin/users/'));
    expect(admin.map((s) => s.method)).toEqual(['GET', 'PUT']);
    for (const s of admin) expect(s.headers.apikey).toBe(SECRET);
    const caller = seen.filter((s) => /\/(user|logout)$/.test(pathOf(s)));
    expect(caller.length).toBeGreaterThan(0);
    for (const s of caller) {
      expect(JSON.stringify(s.headers)).not.toContain(SECRET);
      expect(s.body).not.toContain(SECRET);
    }
  });
});

describe('[gateway-key c4] the admin set-password operations are unchanged', () => {
  it('[gateway-key c4] setUserPassword and cancelPassword send apikey = secret on PUT /admin/users/{id}, never the publishable value, and need only the secret key', async () => {
    const { issuer, seen } = await fakeAuth();
    expect(await setUserPassword({ userId: USER, password: PASSWORD }, both(issuer))).toBe('set');
    expect(await cancelPassword({ userId: USER }, both(issuer))).toBe('set');
    // Only the secret key and the issuer set: still works.
    expect(await setUserPassword({ userId: USER, password: PASSWORD }, { ...issuer, SUPABASE_SECRET_KEY: SECRET })).toBe('set');
    expect(await cancelPassword({ userId: USER }, { ...issuer, SUPABASE_SECRET_KEY: SECRET })).toBe('set');
    expect(seen).toHaveLength(4);
    for (const s of seen) {
      expect(s.method).toBe('PUT');
      expect(pathOf(s)).toContain(`/admin/users/${USER}`);
      expect(s.headers.apikey).toBe(SECRET);
      expect(JSON.stringify(s.headers)).not.toContain(PUBLISHABLE);
    }
  });
});

describe('[gateway-key c5 c6 c7] a missing publishable key fails closed, with no fallback to the secret key', () => {
  it.each([['unset', undefined], ['empty', ''], ['whitespace', '   ']])('[gateway-key c5] readSignInIdentities with the publishable key %s is failed and Auth is not called', async (_label, value) => {
    const { issuer, seen } = await fakeAuth();
    const env: Record<string, string> = { ...issuer, SUPABASE_SECRET_KEY: SECRET };
    if (value !== undefined) env['SUPABASE_PUBLISHABLE_KEY'] = value;
    expect(await readSignInIdentities({ accessToken: 'CALLER-TOKEN', clientIp: undefined }, env)).toEqual({ kind: 'failed' });
    expect(seen).toEqual([]);
  });

  it.each([['unset', undefined], ['empty', ''], ['whitespace', '  ']])('[gateway-key c6] resetPassword with the publishable key %s is admin_failed and Auth is not called', async (_label, value) => {
    const { issuer, seen } = await fakeAuth();
    const env: Record<string, string> = { ...issuer, SUPABASE_SECRET_KEY: SECRET };
    if (value !== undefined) env['SUPABASE_PUBLISHABLE_KEY'] = value;
    expect(await resetPassword(reset, env)).toBe('admin_failed');
    expect(seen).toEqual([]);
  });

  it('[gateway-key c7] isAdminConfigured is true only with secret key, publishable key and a safe issuer', async () => {
    const { issuer } = await fakeAuth();
    expect(isAdminConfigured(both(issuer))).toBe(true);
    expect(isAdminConfigured({ ...issuer, SUPABASE_SECRET_KEY: SECRET })).toBe(false);
    expect(isAdminConfigured({ ...issuer, SUPABASE_SECRET_KEY: SECRET, SUPABASE_PUBLISHABLE_KEY: '' })).toBe(false);
    expect(isAdminConfigured({ ...issuer, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toBe(false);
    expect(isAdminConfigured({ SUPABASE_SECRET_KEY: SECRET, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toBe(false);
    expect(isAdminConfigured({ ...both(issuer), SUPABASE_JWT_ISSUER: 'http://auth.example.com/auth/v1' })).toBe(false);
  });

  it('[gateway-key c7] setUserPassword and cancelPassword need only the secret key and the issuer (no publishable key)', async () => {
    const { issuer, seen } = await fakeAuth();
    const env = { ...issuer, SUPABASE_SECRET_KEY: SECRET };
    expect(await setUserPassword({ userId: USER, password: PASSWORD }, env)).toBe('set');
    expect(await cancelPassword({ userId: USER }, env)).toBe('set');
    expect(seen).toHaveLength(2);
  });
});

describe('[gateway-key c8] neither key value leaks, in success or failure', () => {
  const spyOutput = (): Array<{ mock: { calls: unknown[] } }> => [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'info').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
    vi.spyOn(console, 'debug').mockImplementation(() => undefined),
  ];
  const leaks = (text: string): boolean => text.includes(SECRET) || text.includes(PUBLISHABLE);

  it('[gateway-key c8] outcomes and console output hold neither key value on the happy path and on each failure path', async () => {
    const spies = spyOutput();
    const results: unknown[] = [];
    const thrown: string[] = [];
    const run = async (fn: () => Promise<unknown>): Promise<void> => {
      try {
        results.push(await fn());
      } catch (error) {
        thrown.push(String(error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : error));
      }
    };

    const ok = await fakeAuth();
    await run(() => resetPassword(reset, both(ok.issuer)));
    await run(() => readSignInIdentities({ accessToken: 'T', clientIp: undefined }, both(ok.issuer)));
    await run(() => setUserPassword({ userId: USER, password: PASSWORD }, both(ok.issuer)));
    await run(() => cancelPassword({ userId: USER }, both(ok.issuer)));

    const badLogout = await fakeAuth({ logoutStatus: 500 });
    await run(() => resetPassword(reset, both(badLogout.issuer)));

    const noPublishable = { ...ok.issuer, SUPABASE_SECRET_KEY: SECRET };
    await run(() => resetPassword(reset, noPublishable));
    await run(() => readSignInIdentities({ accessToken: 'T', clientIp: undefined }, noPublishable));
    const noSecret = { ...ok.issuer, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE };
    await run(() => resetPassword(reset, noSecret));
    await run(() => readSignInIdentities({ accessToken: 'T', clientIp: undefined }, noSecret));
    // a dead Auth: the network fault path
    const dead = await fakeAuth();
    const deadEnv = both({ SUPABASE_JWT_ISSUER: 'http://127.0.0.1:1/auth/v1' });
    await run(() => resetPassword(reset, deadEnv));
    await run(() => readSignInIdentities({ accessToken: 'T', clientIp: undefined }, deadEnv));
    expect(dead.seen).toEqual([]);

    expect(thrown.filter(leaks)).toEqual([]);
    expect(results.filter((r) => leaks(JSON.stringify(r)))).toEqual([]);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/SENTINEL-(SECRET|PUBLIC)/);
    expect(results).toContain('revoke_failed');
  }, 60_000);
});
