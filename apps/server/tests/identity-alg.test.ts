import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AUDIENCE,
  COLD_START_MS,
  ISSUER,
  makeApp,
  newKey,
  restoreEnv,
  spyDatabase,
  startFakeDb,
  token,
  transactionsOpened,
  type App,
  type FakeDb,
  type JwksServer,
  type TestKey,
} from './helpers/identity-fixtures.js';
import {
  altToken,
  newAltKey,
  newSecretKey,
  secretToken,
  startJwksOf,
  type AltKey,
  type SecretKey,
} from './helpers/identity-alg-fixtures.js';
import type { Database } from '../src/db/client.js';

// I1 F1.1 part c, spec criterion 22: the verifier accepts ES256 only; "alg none and HS256" are rejected (NFR-SEC-002,
// SRS section 12; platform r2, r3). Derived from .work/identity-platform/spec.md.
//
// These tests exist because the main token matrix (identity.test.ts) serves an EC-only JWKS, where an HS256 token has no
// key to verify against and is rejected for that reason alone. Here the JWKS also holds keys of other algorithms (ES384,
// RS256, and a symmetric HS256 key), and a token signed by each of them, with the right kid and otherwise valid claims,
// must still be refused: the rejection has to come from the algorithm allow-list. The same 401 as any other rejection,
// and no database transaction or connection.

const T = { timeout: COLD_START_MS };
const PROTECTED = '/api/_f11c/alg';

let es256: TestKey;
let es384: AltKey;
let rs256: AltKey;
let oct: SecretKey;
let jwks: JwksServer;
let db: FakeDb;
let database: Database;
let app: App;
let referenceBody = '';

beforeAll(async () => {
  es256 = await newKey('alg-es256');
  es384 = await newAltKey('alg-es384', 'ES384');
  rs256 = await newAltKey('alg-rs256', 'RS256');
  oct = newSecretKey('alg-oct');
  jwks = await startJwksOf([es256.publicJwk, es384.publicJwk, rs256.publicJwk, oct.publicJwk]);
  db = await startFakeDb();
  database = await spyDatabase(db.url);
  app = await makeApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: db.url },
    (a) => {
      a.get(PROTECTED, () => ({ reached: true }));
    },
    database,
  );
  const res = await app.inject({ method: 'GET', url: PROTECTED });
  expect(res.statusCode).toBe(401);
  referenceBody = res.body;
}, COLD_START_MS);

afterAll(async () => {
  await app.close();
  await database.close();
  await jwks.close();
  await db.close();
  restoreEnv();
});

async function get(authorization: string): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({ method: 'GET', url: PROTECTED, headers: { authorization } });
  return { statusCode: res.statusCode, body: res.body };
}

describe('[F1.1-c c22] the algorithm allow-list: ES256 only, even when the JWKS holds a key of another algorithm (NFR-SEC-002, SRS section 12)', () => {
  it('control: a valid ES256 token signed by the ES256 key of this same JWKS is accepted (the JWKS and the claims are good)', T, async () => {
    const res = await get(`Bearer ${await token({ key: es256 })}`);
    expect(res.statusCode).toBe(200);
  });

  const CASES: Array<[string, () => Promise<string>]> = [
    ['ES384, signed by an ES384 key that is in the JWKS, its own kid', () => altToken(es384)],
    ['ES384, in-set key, no kid in the header', () => altToken(es384, undefined)],
    ['ES384, in-set key, header kid names the ES256 key', () => altToken(es384, es256.kid)],
    ['RS256, signed by an RS256 key that is in the JWKS, its own kid', () => altToken(rs256)],
    ['RS256, in-set key, no kid in the header', () => altToken(rs256, undefined)],
    ['RS256, in-set key, header kid names the ES256 key', () => altToken(rs256, es256.kid)],
    ['HS256, signed with the symmetric key the JWKS publishes, its own kid', () => secretToken(oct)],
    ['HS256, symmetric key in the JWKS, no kid in the header', () => secretToken(oct, undefined)],
  ];

  it.each(CASES)('[F1.1-c c22] 401, the same body as any rejection, no transaction: %s', T, async (_label, make) => {
    const tx = transactionsOpened();
    const conn = db.connections();
    const res = await get(`Bearer ${await make()}`);
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe(referenceBody);
    expect(res.body).not.toContain('reached');
    expect(transactionsOpened(), 'a transaction was opened (spy)').toBe(tx);
    expect(db.connections(), 'a database connection was opened').toBe(conn);
  });

  it('[F1.1-c c22] after the refused tokens the ES256 token is still accepted (a rejection leaves nothing behind)', T, async () => {
    const res = await get(`Bearer ${await token({ key: es256 })}`);
    expect(res.statusCode).toBe(200);
  });
});
