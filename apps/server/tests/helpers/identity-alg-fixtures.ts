import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { ACCOUNT_A, AUDIENCE, ISSUER, type JwksServer } from './identity-fixtures.js';

// Keys and tokens for the algorithm allow-list test (spec criterion 22: only ES256 is accepted; alg none and HS256 are
// rejected). The point of these fixtures: the rejected token is signed with a key that IS in the JWKS, so the only thing
// that can reject it is the algorithm allow-list. A JWKS that holds nothing but EC keys cannot tell an allow-list from a
// missing key.

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
export type OtherAlg = 'ES384' | 'RS256';

export interface AltKey {
  alg: OtherAlg;
  kid: string;
  privateKey: KeyPair['privateKey'];
  publicJwk: JWK;
}

export async function newAltKey(kid: string, alg: OtherAlg): Promise<AltKey> {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg, use: 'sig' };
  return { alg, kid, privateKey, publicJwk };
}

export interface SecretKey {
  kid: string;
  secret: string;
  publicJwk: JWK;
}

/** A symmetric (oct) key, published in the JWKS under its kid, as a misconfigured issuer might. */
export function newSecretKey(kid: string): SecretKey {
  const secret = `hs256-secret-${kid}-0123456789abcdef0123456789abcdef`;
  return { kid, secret, publicJwk: { kty: 'oct', k: Buffer.from(secret).toString('base64url'), kid, alg: 'HS256', use: 'sig' } };
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);
const claims = (): Record<string, unknown> => ({
  iss: ISSUER,
  aud: AUDIENCE,
  sub: ACCOUNT_A,
  iat: nowSeconds(),
  exp: nowSeconds() + 3600,
  role: 'authenticated',
});

/** A token with otherwise valid claims, signed by an in-set key of another algorithm. `kid: undefined` drops the header kid. */
export async function altToken(key: AltKey, kid: string | undefined = key.kid): Promise<string> {
  const header = kid === undefined ? { alg: key.alg } : { alg: key.alg, kid };
  return new SignJWT(claims()).setProtectedHeader(header).sign(key.privateKey);
}

/** An HS256 token signed with the oct key that the JWKS publishes. */
export async function secretToken(key: SecretKey, kid: string | undefined = key.kid): Promise<string> {
  const header = kid === undefined ? { alg: 'HS256' } : { alg: 'HS256', kid };
  return new SignJWT(claims()).setProtectedHeader(header).sign(new TextEncoder().encode(key.secret));
}

/** A JWKS over loopback http that serves exactly these public JWKs, whatever their type. */
export async function startJwksOf(publicJwks: JWK[]): Promise<JwksServer> {
  const server: HttpServer = createHttpServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: publicJwks }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: string | AddressInfo | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('the test server is not listening on a port');
  return {
    url: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
    setKeys: () => {
      throw new Error('this JWKS is fixed');
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
