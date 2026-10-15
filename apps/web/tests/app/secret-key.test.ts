// I1 F1.4 part c, CRITIC part c finding 5: a secret / service_role key pasted into VITE_SUPABASE_PUBLISHABLE_KEY would be inlined into the
// public bundle. The build guard `isSecretKey(value)` (src/services/auth/secret-key.ts) must reject a secret-key prefix and a JWT whose
// payload role is the privileged service role, accept a publishable key, never throw, and never print or return the value.
// Derived from interface.md "CRITIC part c fixes". No build is run with a secret: the module is tested directly, and the Auth port
// built from such a value is shown to stay unconfigured and silent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthPort } from '@/services/auth/auth-client';
import { isSecretKey } from '@/services/auth/secret-key';

afterEach(() => vi.restoreAllMocks());

const b64 = (value: unknown): string => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const jwt = (payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }): string => `${b64(header)}.${b64(payload)}.signaturepart`;
// Assembled from parts: this file is not scanned, but a literal key-looking string in a repository is a bad habit.
const SECRET_PREFIX = ['sb', 'secret', ''].join('_');
const PRIVILEGED = ['service', 'role'].join('_');

describe('[CRITIC part c 5] isSecretKey: what it rejects', () => {
  it.each([
    ['a secret-key prefix with a body', `${SECRET_PREFIX}abcdefghijklmnop`],
    ['the bare secret-key prefix', SECRET_PREFIX],
    ['a secret key with surrounding spaces', `  ${SECRET_PREFIX}abc123  `],
    ['a JWT whose payload role is the privileged service role', jwt({ iss: 'supabase', role: PRIVILEGED, exp: 4102444800 })],
    ['the same with a different header', jwt({ role: PRIVILEGED }, { alg: 'HS512', typ: 'JWT', kid: 'x' })],
    ['the same with extra claims', jwt({ aud: 'authenticated', role: PRIVILEGED, sub: 'x', iat: 1 })],
  ])('[CRITIC part c 5] %s -> true', (_label, value) => {
    expect(isSecretKey(value)).toBe(true);
  });
});

describe('[CRITIC part c 5] isSecretKey: what it accepts', () => {
  it.each([
    ['a new-style publishable key', 'sb_publishable_AbCdEfGhIjKlMnOpQrStUv'],
    ['a legacy anon JWT', jwt({ iss: 'supabase', role: 'anon', exp: 4102444800 })],
    ['a JWT with an authenticated role', jwt({ role: 'authenticated' })],
    ['the e2e stub placeholder', 'e2e-stub-placeholder-not-a-real-key'],
    ['an empty string', ''],
    ['spaces only', '   '],
    ['a string that merely contains the secret prefix later on', `x-${SECRET_PREFIX}abc`],
    ['a string that merely mentions the privileged role', `note about ${PRIVILEGED}`],
    ['a JWT with no role claim', jwt({ iss: 'supabase' })],
  ])('[CRITIC part c 5] %s -> false', (_label, value) => {
    expect(isSecretKey(value)).toBe(false);
  });
});

describe('[CRITIC part c 5] isSecretKey: never throws, never speaks', () => {
  const HOSTILE = [
    'a.b.c',
    '..',
    '.....',
    'x.y',
    `${b64({ role: 1 })}.${b64('not json at all')}.sig`,
    `${b64({})}.${b64('{"role":')}.sig`,
    `${b64({})}.${b64([PRIVILEGED])}.sig`,
    `${b64({})}.${b64(null)}.sig`,
    `${b64({})}.${b64({ role: [PRIVILEGED] })}.sig`,
    `${b64({})}.${b64({ role: { name: PRIVILEGED } })}.sig`,
    'eyJ.eyJ.eyJ',
    '%%%.%%%.%%%',
    'é'.repeat(5000),
    `${'a'.repeat(100_000)}.${'b'.repeat(100_000)}.c`,
  ];

  it('[CRITIC part c 5] malformed, hostile and huge inputs return a boolean and do not throw', () => {
    for (const value of HOSTILE) {
      expect(() => isSecretKey(value), value.slice(0, 20)).not.toThrow();
      expect(typeof isSecretKey(value)).toBe('boolean');
    }
  });

  it('[CRITIC part c 5] a payload whose role is not a plain string "service role" is not mistaken for one', () => {
    expect(isSecretKey(`${b64({})}.${b64({ role: [PRIVILEGED] })}.sig`)).toBe(false);
    expect(isSecretKey(`${b64({})}.${b64({ role: { name: PRIVILEGED } })}.sig`)).toBe(false);
    expect(isSecretKey(`${b64({})}.${b64({ role: `${PRIVILEGED}x` })}.sig`)).toBe(false);
  });

  it('[CRITIC part c 5] non-string values (a build config may hand over undefined) do not throw', () => {
    for (const value of [undefined, null, 0, 42, {}, [], true]) {
      expect(() => Reflect.apply(isSecretKey, undefined, [value])).not.toThrow();
      expect(Reflect.apply(isSecretKey, undefined, [value])).toBe(false);
    }
  });

  it('[CRITIC part c 5] it prints nothing: no console output, whatever it is given', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    for (const value of [`${SECRET_PREFIX}topsecretvalue`, jwt({ role: PRIVILEGED }), 'sb_publishable_x', ...HOSTILE]) isSecretKey(value);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('[CRITIC part c 5] it answers true or false only: the value is never part of the result', () => {
    const secret = `${SECRET_PREFIX}topsecretvalue`;
    const answer: unknown = isSecretKey(secret);
    expect(answer).toBe(true);
    expect(JSON.stringify(answer)).not.toContain('topsecretvalue');
  });
});

describe('[CRITIC part c 5] the Auth port built from the BUILD environment with a secret key stays unconfigured and silent', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['a secret-key prefix', `${SECRET_PREFIX}topsecretvalue`],
    ['a service-role JWT', jwt({ role: PRIVILEGED })],
  ])('[CRITIC part c 5] VITE_SUPABASE_PUBLISHABLE_KEY holding %s -> AuthNotConfigured, no network, the value not in the answer', async (_label, secret) => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', secret);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    const answer = await createAuthPort().signUp({ email: 'a@b.co', password: 'abcdefgh' });
    expect(answer.accessToken).toBeNull();
    expect(answer.failure?.name).toBe('AuthNotConfigured');
    expect(JSON.stringify(answer)).not.toContain(secret);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('[CRITIC part c 5] an Auth port built with an explicit config holding a secret key stays unconfigured and silent', () => {
  it('[CRITIC part c 5] sign-up with a secret key as the publishable key: AuthNotConfigured, no network, and the key is not in the answer', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    const secret = `${SECRET_PREFIX}topsecretvalue`;
    const port = createAuthPort({ url: 'https://example.invalid', publishableKey: secret });
    const answer = await port.signUp({ email: 'a@b.co', password: 'abcdefgh' });
    expect(answer.accessToken).toBeNull();
    expect(answer.failure?.name).toBe('AuthNotConfigured');
    expect(JSON.stringify(answer)).not.toContain('topsecretvalue');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('[CRITIC part c 5] the same for a service-role JWT', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    const key = jwt({ role: PRIVILEGED });
    const answer = await createAuthPort({ url: 'https://example.invalid', publishableKey: key }).signUp({ email: 'a@b.co', password: 'abcdefgh' });
    expect(answer.failure?.name).toBe('AuthNotConfigured');
    expect(JSON.stringify(answer)).not.toContain(key);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('[CRITIC part c 5] a publishable key is accepted (the port is configured: it reaches for the network)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const answer = await createAuthPort({ url: 'https://example.invalid', publishableKey: 'sb_publishable_AbCdEfGhIjKlMnOpQrStUv' })
      .signUp({ email: 'a@b.co', password: 'abcdefgh' })
      .catch(() => null);
    expect(fetchSpy).toHaveBeenCalled();
    expect(answer?.failure?.name ?? '').not.toBe('AuthNotConfigured');
  });
});
