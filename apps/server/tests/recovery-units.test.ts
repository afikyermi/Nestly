import { createHmac, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { isAdminConfigured, resetPassword } from '../src/recovery/auth-admin.js';
import { clientAddress } from '../src/recovery/client-ip.js';
import { emailHandle, ipHash } from '../src/recovery/hashing.js';
import { readRecoveryKeys } from '../src/recovery/pepper.js';

// F1.6 parts a and b, the units that need no database. Derived from spec.md criteria 8 (the handle is a keyed hash of the
// normalised email), 12 (stored IP is a keyed hash; IPv6 by /64), 15 and 20 (the isolated Auth admin module and its outcomes),
// 9 (every session ends: the third call) and interface.md "Exports". The module is driven through its exported function against
// a local HTTP stand-in for Auth; nothing here reads the module's text.

const T = { timeout: 60_000 };
const USER = 'a0000000-0000-4000-8000-0000000000a1';
const PASSWORD = 'סיסמה חדשה ארוכה 123';
const EMAIL = 'dana.recovery@example.invalid';
const SECRET_KEY = ['sb', 'secret', 'test_value_that_must_never_leak'].join('_');
const CLIENT_IP = '203.0.113.9';

const hex = (value: unknown): string => {
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (typeof value === 'string') return value;
  throw new Error('expected a Buffer or a string');
};
const pepper = (bytes = 32): string => randomBytes(bytes).toString('base64');

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c8 c12 c15 NFR-SEC-001] the pepper: at least 32 random bytes, read from one place', () => {
  it('[F1.6 c15] 32 bytes of base64 give three keys (handle, ip, answer), each its own', () => {
    const keys = readRecoveryKeys({ RECOVERY_PEPPER: pepper() });
    if (keys === undefined) throw new Error('a 32-byte pepper must be accepted');
    const [handle, ip, answer] = [hex(keys.handle), hex(keys.ip), hex(keys.answer)];
    expect(new Set([handle, ip, answer]).size, 'one secret serves three purposes with no overlap').toBe(3);
    for (const key of [handle, ip, answer]) expect(key.length).toBeGreaterThanOrEqual(64);
  });

  it('[F1.6 c15] base64url is accepted and gives the same keys as the same bytes in base64', () => {
    const bytes = Buffer.from(Array.from({ length: 32 }, (_, i) => 0xf0 + (i % 16)));
    const standard = bytes.toString('base64');
    const url = bytes.toString('base64url');
    expect(standard).not.toBe(url);
    const a = readRecoveryKeys({ RECOVERY_PEPPER: standard });
    const b = readRecoveryKeys({ RECOVERY_PEPPER: url });
    if (a === undefined || b === undefined) throw new Error('both spellings must be accepted');
    expect(hex(a.handle)).toBe(hex(b.handle));
    expect(hex(a.answer)).toBe(hex(b.answer));
  });

  it('[F1.6 c15] the same pepper gives the same keys, another pepper gives other keys', () => {
    const one = pepper();
    const a = readRecoveryKeys({ RECOVERY_PEPPER: one });
    const b = readRecoveryKeys({ RECOVERY_PEPPER: one });
    const c = readRecoveryKeys({ RECOVERY_PEPPER: pepper() });
    if (a === undefined || b === undefined || c === undefined) throw new Error('valid peppers must be accepted');
    expect(hex(a.handle)).toBe(hex(b.handle));
    expect(hex(a.handle)).not.toBe(hex(c.handle));
  });

  it.each([
    ['unset', {}],
    ['undefined', { RECOVERY_PEPPER: undefined }],
    ['empty', { RECOVERY_PEPPER: '' }],
    ['spaces only', { RECOVERY_PEPPER: '   ' }],
    ['31 bytes', { RECOVERY_PEPPER: randomBytes(31).toString('base64') }],
    ['1 byte', { RECOVERY_PEPPER: randomBytes(1).toString('base64') }],
    ['not base64', { RECOVERY_PEPPER: 'this is not base64 !!! ***' }],
    ['a short word', { RECOVERY_PEPPER: 'hunter2' }],
  ])('[F1.6 c15] %s counts as missing (the three endpoints then answer 503)', (_label, env) => {
    expect(readRecoveryKeys(env)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c8] the email handle is a keyed hash of the normalised email, never the email', () => {
  const keys = readRecoveryKeys({ RECOVERY_PEPPER: pepper() });
  if (keys === undefined) throw new Error('test pepper rejected');

  it('[F1.6 c8] the same email twice gives one handle; case and surrounding space do not change it', () => {
    const a = hex(emailHandle(keys, 'Dana@Example.com'));
    expect(hex(emailHandle(keys, 'Dana@Example.com'))).toBe(a);
    expect(hex(emailHandle(keys, 'dana@example.com'))).toBe(a);
    expect(hex(emailHandle(keys, '  DANA@EXAMPLE.COM  '))).toBe(a);
  });

  it('[F1.6 c8] a different email, or the same email under another pepper, gives a different handle', () => {
    expect(hex(emailHandle(keys, 'dana@example.com'))).not.toBe(hex(emailHandle(keys, 'dana2@example.com')));
    const other = readRecoveryKeys({ RECOVERY_PEPPER: pepper() });
    if (other === undefined) throw new Error('test pepper rejected');
    expect(hex(emailHandle(keys, 'dana@example.com'))).not.toBe(hex(emailHandle(other, 'dana@example.com')));
  });

  it('[F1.6 c8] the handle is 32 bytes and does not contain the email, its hex or its base64', () => {
    const email = 'dana@example.com';
    const handle = hex(emailHandle(keys, email));
    expect(handle).toMatch(/^[0-9a-f]{64}$/);
    expect(handle).not.toContain(Buffer.from(email).toString('hex'));
    expect(Buffer.from(handle, 'hex').toString('base64')).not.toContain(Buffer.from(email).toString('base64'));
  });

  it('[F1.6 c8] it is not a plain hash of the email: an attacker with the database but without the pepper cannot recompute it', () => {
    const plain = createHmac('sha256', 'nestly').update('dana@example.com').digest('hex');
    expect(hex(emailHandle(keys, 'dana@example.com'))).not.toBe(plain);
  });

  it('[F1.6 c12] the IP hash is a keyed 32-byte hash: stable, different per address, different from an email handle of the same text', () => {
    const a = hex(ipHash(keys, '203.0.113.7'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hex(ipHash(keys, '203.0.113.7'))).toBe(a);
    expect(hex(ipHash(keys, '203.0.113.8'))).not.toBe(a);
    expect(a).not.toContain('203.0.113.7');
    expect(hex(ipHash(keys, 'dana@example.com'))).not.toBe(hex(emailHandle(keys, 'dana@example.com')));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c12] the client address: IPv6 counts by its /64, IPv4-mapped counts as IPv4, a non-address counts under one key', () => {
  it('[F1.6 c12] two hosts in one IPv6 /64 are one key; two different /64 are two keys', () => {
    expect(clientAddress('2001:db8:1:2::1').key).toBe(clientAddress('2001:db8:1:2:ffff:ffff:ffff:ffff').key);
    expect(clientAddress('2001:db8:1:2::1').key).not.toBe(clientAddress('2001:db8:1:3::1').key);
    expect(clientAddress('2001:db8:1:2::1').key).not.toBe(clientAddress('2001:db8:2:2::1').key);
  });

  it('[F1.6 c12] spelling does not matter: compressed, expanded and upper-case IPv6 are one key', () => {
    const expected = clientAddress('2001:db8::1').key;
    expect(clientAddress('2001:0db8:0000:0000:0000:0000:0000:0001').key).toBe(expected);
    expect(clientAddress('2001:DB8::1').key).toBe(expected);
  });

  it('[F1.6 c12] an IPv4-mapped IPv6 address is the IPv4 address', () => {
    expect(clientAddress('::ffff:203.0.113.7').key).toBe(clientAddress('203.0.113.7').key);
  });

  it('[F1.6 c12] two IPv4 addresses are two keys', () => {
    expect(clientAddress('203.0.113.7').key).not.toBe(clientAddress('203.0.113.8').key);
  });

  it.each(['', 'unknown', 'not-an-ip', '999.1.1.1', '1.2.3', '203.0.113.7:8080', '<script>', "1.1.1.1'; drop table users;--"])(
    '[F1.6 c12] %j is not an address: it counts under the single key "unknown" (so garbage cannot mint new counters)',
    (raw) => {
      expect(clientAddress(raw).key).toBe('unknown');
    },
  );

  it('[F1.6 c12] the address Auth is told about is the real one for IPv4', () => {
    expect(clientAddress('203.0.113.7').forAuth).toBe('203.0.113.7');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c15] isAdminConfigured: the key and a safe issuer, nothing else', () => {
  const good = { SUPABASE_SECRET_KEY: SECRET_KEY, SUPABASE_JWT_ISSUER: 'https://nestly-test.example.invalid/auth/v1' };

  it('[F1.6 c15] a key and an https issuer: configured; a key and a loopback http issuer: configured', () => {
    expect(isAdminConfigured(good)).toBe(true);
    expect(isAdminConfigured({ ...good, SUPABASE_JWT_ISSUER: 'http://127.0.0.1:54321/auth/v1' })).toBe(true);
    expect(isAdminConfigured({ ...good, SUPABASE_JWT_ISSUER: 'http://localhost:54321/auth/v1' })).toBe(true);
  });

  it.each([
    ['no key', { SUPABASE_JWT_ISSUER: good.SUPABASE_JWT_ISSUER }],
    ['an empty key', { ...good, SUPABASE_SECRET_KEY: '' }],
    ['no issuer', { SUPABASE_SECRET_KEY: SECRET_KEY }],
    ['an empty issuer', { ...good, SUPABASE_JWT_ISSUER: '' }],
    ['an issuer that is not a URL', { ...good, SUPABASE_JWT_ISSUER: 'not a url' }],
    ['plain http on a public host (the key would travel in clear)', { ...good, SUPABASE_JWT_ISSUER: 'http://nestly-test.example.invalid/auth/v1' }],
    ['another scheme', { ...good, SUPABASE_JWT_ISSUER: 'ftp://nestly-test.example.invalid/auth/v1' }],
    ['a look-alike loopback host', { ...good, SUPABASE_JWT_ISSUER: 'http://127.0.0.1.evil.example.invalid/auth/v1' }],
  ])('[F1.6 c15] %s: not configured (the reset endpoint then answers 503, uncounted)', (_label, env) => {
    expect(isAdminConfigured(env)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
interface Seen {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: string;
}
type Reply = { status: number; json?: unknown; hang?: boolean; destroy?: boolean; location?: string };

interface AuthStub {
  issuer: string;
  seen: Seen[];
  close: () => Promise<void>;
}

const open: Server[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); })));
});

async function listen(handler: (req: IncomingMessage, res: ServerResponse, body: string) => void): Promise<{ port: number }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => handler(req, res, Buffer.concat(chunks).toString('utf8')));
  });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: string | AddressInfo | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { port: address.port };
}

/** A stand-in for Auth: `replies[n]` answers the n-th request (0, 1, 2 = admin, token, logout); anything past the list is 200 {}. */
async function authStub(replies: Reply[]): Promise<AuthStub> {
  const seen: Seen[] = [];
  const { port } = await listen((req, res, body) => {
    const n = seen.length;
    seen.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body });
    const reply = replies[n] ?? { status: 200, json: {} };
    if (reply.hang) return;
    if (reply.destroy) {
      req.socket.destroy();
      return;
    }
    res.statusCode = reply.status;
    if (reply.location) res.setHeader('location', reply.location);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(reply.json ?? {}));
  });
  return { issuer: `http://127.0.0.1:${port}/auth/v1`, seen, close: async () => undefined };
}

const TOKEN_OK: Reply = { status: 200, json: { access_token: 'ACCESS-TOKEN-FROM-AUTH', refresh_token: 'REFRESH-TOKEN-FROM-AUTH', token_type: 'bearer' } };
const env = (issuer: string) => ({ SUPABASE_SECRET_KEY: SECRET_KEY, SUPABASE_JWT_ISSUER: issuer });
const input = { userId: USER, email: EMAIL, password: PASSWORD, clientIp: CLIENT_IP };

describe('[F1.6 c9 c15 c20] resetPassword: three calls in a fixed order, and exactly one of three outcomes', () => {
  it('[F1.6 c9] all three calls succeed -> "completed", in the order set-password, password grant, global logout', T, async () => {
    const stub = await authStub([{ status: 200, json: { id: USER } }, TOKEN_OK, { status: 204 }]);
    const outcome = await resetPassword(input, env(stub.issuer));
    expect(outcome).toBe('completed');
    expect(stub.seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      `PUT /auth/v1/admin/users/${USER}`,
      'POST /auth/v1/token?grant_type=password',
      'POST /auth/v1/logout?scope=global',
    ]);
  });

  it('[F1.6 c9] call 1 sets the password of THE USER ID it was given, with the secret key as apikey, and sends the new password', T, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 204 }]);
    await resetPassword(input, env(stub.issuer));
    const first = stub.seen[0];
    expect(first?.headers.apikey).toBe(SECRET_KEY);
    expect(JSON.parse(first?.body ?? '{}')).toEqual({ password: PASSWORD });
    expect(first?.path).toContain(USER);
  });

  it('[F1.6 c9] call 2 is a password sign-in with the email and the new password; call 3 ends every session using the access token it got', T, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 204 }]);
    await resetPassword(input, env(stub.issuer));
    const [, second, third] = stub.seen;
    expect(JSON.parse(second?.body ?? '{}')).toEqual({ email: EMAIL, password: PASSWORD });
    expect(third?.headers.authorization).toBe('Bearer ACCESS-TOKEN-FROM-AUTH');
    expect(third?.path).toContain('scope=global');
  });

  it('[F1.6 c9] the platform-verified client address is forwarded to Auth on the sign-in and the logout (Sb-Forwarded-For), so Auth counts the IP of the owner', T, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 204 }]);
    await resetPassword(input, env(stub.issuer));
    expect(stub.seen[1]?.headers['sb-forwarded-for']).toBe(CLIENT_IP);
    expect(stub.seen[2]?.headers['sb-forwarded-for']).toBe(CLIENT_IP);
  });

  it('[F1.6 c15] call 1 refused (422, 400, 401, 403, 404, 429, 500) -> "admin_failed", and calls 2 and 3 are never made (the password is unchanged)', T, async () => {
    for (const status of [400, 401, 403, 404, 422, 429, 500, 503]) {
      const stub = await authStub([{ status, json: { msg: 'Password should be at least 8 characters' } }, TOKEN_OK, { status: 204 }]);
      const outcome = await resetPassword(input, env(stub.issuer));
      expect(outcome, `status ${status}`).toBe('admin_failed');
      expect(stub.seen.length, `status ${status}: no sign-in and no logout after a refused set-password`).toBe(1);
    }
  });

  it('[F1.6 c15] call 1 dropped (connection destroyed) -> "admin_failed", no further call', T, async () => {
    const stub = await authStub([{ status: 0, destroy: true }]);
    expect(await resetPassword(input, env(stub.issuer))).toBe('admin_failed');
    expect(stub.seen.length).toBe(1);
  });

  it('[F1.6 c15] Auth unreachable (nothing listens) -> "admin_failed", and the function does not throw', T, async () => {
    const stub = await authStub([]);
    const url = stub.issuer;
    for (const server of open.splice(0)) await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
    expect(await resetPassword(input, env(url))).toBe('admin_failed');
  });

  it('[F1.6 c15] a redirect is never followed: the target sees nothing and the outcome is "admin_failed"', T, async () => {
    const target = await authStub([]);
    const stub = await authStub([{ status: 302, location: `${target.issuer}/stolen` }]);
    expect(await resetPassword(input, env(stub.issuer))).toBe('admin_failed');
    expect(target.seen).toEqual([]);
  });

  it('[F1.6 c15] call 1 never answers -> "admin_failed" within the 12 s total budget (5 s per call)', { timeout: 30_000 }, async () => {
    const stub = await authStub([{ status: 0, hang: true }]);
    const started = Date.now();
    expect(await resetPassword(input, env(stub.issuer))).toBe('admin_failed');
    expect(Date.now() - started).toBeLessThan(12_500);
  });

  it('[F1.6 c20] the password is set but the sign-in is refused (400, 422, 429, 500) -> "revoke_failed", and no logout is attempted', T, async () => {
    for (const status of [400, 422, 429, 500]) {
      const stub = await authStub([{ status: 200 }, { status, json: { msg: 'rate limit' } }, { status: 204 }]);
      expect(await resetPassword(input, env(stub.issuer)), `status ${status}`).toBe('revoke_failed');
      expect(stub.seen.length, `status ${status}`).toBe(2);
    }
  });

  it('[F1.6 c20] the sign-in answers 200 with no access token -> "revoke_failed" (never "completed" without a session to end)', T, async () => {
    for (const json of [{}, { access_token: '' }, { access_token: null }, { access_token: 12345 }, { refresh_token: 'only-this' }]) {
      const stub = await authStub([{ status: 200 }, { status: 200, json }, { status: 204 }]);
      expect(await resetPassword(input, env(stub.issuer)), JSON.stringify(json)).toBe('revoke_failed');
      expect(stub.seen.length).toBe(2);
    }
  });

  it('[F1.6 c20] the logout is refused or fails (401, 403, 500) -> "revoke_failed": the password changed but the sessions are not confirmed ended', T, async () => {
    for (const status of [401, 403, 429, 500]) {
      const stub = await authStub([{ status: 200 }, TOKEN_OK, { status }]);
      expect(await resetPassword(input, env(stub.issuer)), `status ${status}`).toBe('revoke_failed');
      expect(stub.seen.length).toBe(3);
    }
  });

  it('[F1.6 c20] the logout connection is dropped -> "revoke_failed"', T, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 0, destroy: true }]);
    expect(await resetPassword(input, env(stub.issuer))).toBe('revoke_failed');
  });

  it('[F1.6 c20] the logout never answers -> "revoke_failed" within the total budget', { timeout: 30_000 }, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 0, hang: true }]);
    const started = Date.now();
    expect(await resetPassword(input, env(stub.issuer))).toBe('revoke_failed');
    expect(Date.now() - started).toBeLessThan(12_500);
  });

  it('[F1.6 c9 c20] a retry after "revoke_failed" runs all three calls again and converges to "completed"', T, async () => {
    const first = await authStub([{ status: 200 }, TOKEN_OK, { status: 500 }]);
    expect(await resetPassword(input, env(first.issuer))).toBe('revoke_failed');
    const second = await authStub([{ status: 200 }, TOKEN_OK, { status: 204 }]);
    expect(await resetPassword(input, env(second.issuer))).toBe('completed');
    expect(second.seen.length).toBe(3);
  });

  it('[F1.6 c15 NFR-SEC-001] the outcome is one of three plain strings and carries nothing from Auth (no token, key, password, email or error text)', T, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 500, json: { msg: `leak ${SECRET_KEY} ${PASSWORD} ${EMAIL}` } }]);
    const outcome = await resetPassword(input, env(stub.issuer));
    expect(['completed', 'admin_failed', 'revoke_failed']).toContain(outcome);
    for (const secret of [SECRET_KEY, PASSWORD, EMAIL, 'ACCESS-TOKEN-FROM-AUTH', 'REFRESH-TOKEN-FROM-AUTH']) expect(String(outcome)).not.toContain(secret);
  });

  it('[F1.6 c15] the module is inert when its configuration is missing: no request leaves the process and the outcome is "admin_failed"', T, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 204 }]);
    expect(await resetPassword(input, { SUPABASE_JWT_ISSUER: stub.issuer })).toBe('admin_failed');
    expect(await resetPassword(input, { SUPABASE_SECRET_KEY: SECRET_KEY })).toBe('admin_failed');
    expect(stub.seen).toEqual([]);
  });

  it('[F1.6 c15 NFR-SEC-001] the password is sent only in the two bodies that need it: never in a URL or a header', T, async () => {
    const stub = await authStub([{ status: 200 }, TOKEN_OK, { status: 204 }]);
    await resetPassword(input, env(stub.issuer));
    for (const s of stub.seen) {
      expect(s.path).not.toContain(encodeURIComponent(PASSWORD));
      expect(JSON.stringify(s.headers)).not.toContain(PASSWORD);
    }
    expect(stub.seen[2]?.body ?? '').not.toContain(PASSWORD);
  });
});
