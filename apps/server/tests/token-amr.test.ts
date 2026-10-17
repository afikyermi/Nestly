import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTokenVerifier } from '../src/lib/token-verifier.js';
import { ACCOUNT_A, AUDIENCE, ISSUER, newKey, startJwks, token, type JwksServer, type TestKey } from './helpers/identity-fixtures.js';

// F2.0 part a fix round, schema.md Gate 2 amendment A7: the token's `amr` is read all-or-nothing. A claim with more than eight
// entries, or with any entry that is not a recognised { method } shape, yields NO auth methods, so the session guard reads the
// session as stale (a missing amr fails closed) and detection does not treat it as an oauth session. In particular a `password`
// entry can never be dropped by truncation or filtering while the rest of the claim is kept (that would fail open).
// Derived from the A7 text; the verifier is called through its exported factory.

let key: TestKey;
let jwks: JwksServer;

beforeAll(async () => {
  key = await newKey('amr-key');
  jwks = await startJwks([key]);
}, 60_000);

afterAll(async () => {
  await jwks.close();
});

async function methodsOf(amr: unknown): Promise<readonly string[] | undefined> {
  const verify = createTokenVerifier({ jwksUrl: new URL(jwks.url), issuer: ISSUER, audience: AUDIENCE });
  const verified = await verify(await token({ key, sub: ACCOUNT_A, extra: { session_id: '11111111-1111-4111-8111-111111111111', amr } }));
  return verified.identity.authMethods;
}

const entry = (method: string) => ({ method, timestamp: 1 });

describe('[F2.0-a A7] amr is read all-or-nothing', () => {
  it('[F2.0-a A7] a normal claim keeps every method, in order', async () => {
    expect(await methodsOf([entry('oauth')])).toEqual(['oauth']);
    expect(await methodsOf([entry('password'), entry('oauth')])).toEqual(['password', 'oauth']);
  });

  it('[F2.0-a A7] eight entries are read; nine or more yield no methods at all (a trailing password entry cannot be cut off)', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => entry(i === 7 ? 'password' : 'otp'));
    expect(await methodsOf(eight)).toEqual(['otp', 'otp', 'otp', 'otp', 'otp', 'otp', 'otp', 'password']);
    const nine = [...Array.from({ length: 8 }, () => entry('oauth')), entry('password')];
    expect(await methodsOf(nine)).toBeUndefined();
    expect(await methodsOf(Array.from({ length: 200 }, () => entry('oauth')))).toBeUndefined();
  });

  it.each([
    ['an entry that is not an object', [entry('oauth'), 'password']],
    ['an entry with no method', [entry('oauth'), { timestamp: 1 }]],
    ['an entry whose method is not a string', [entry('oauth'), { method: 7 }]],
    ['an entry whose method is not a recognised word', [entry('password'), { method: 'PASSWORD!!' }]],
    ['an empty method', [entry('oauth'), { method: '' }]],
    ['a null entry', [entry('oauth'), null]],
  ])('[F2.0-a A7] %s: no methods at all, even though another entry was fine', async (_label, amr) => {
    expect(await methodsOf(amr)).toBeUndefined();
  });

  it.each([
    ['a string', 'oauth'],
    ['an object', { method: 'oauth' }],
    ['a number', 1],
    ['null', null],
  ])('[F2.0-a A7] amr as %s: no methods', async (_label, amr) => {
    expect(await methodsOf(amr)).toBeUndefined();
  });

  it('[F2.0-a A7] a token with no amr claim: no methods', async () => {
    const verify = createTokenVerifier({ jwksUrl: new URL(jwks.url), issuer: ISSUER, audience: AUDIENCE });
    const verified = await verify(await token({ key, sub: ACCOUNT_A }));
    expect(verified.identity.authMethods).toBeUndefined();
  });
});
