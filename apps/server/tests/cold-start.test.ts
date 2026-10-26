import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createTokenVerifier, TokenRejected } from '../src/lib/token-verifier.js';
import { ACCOUNT_A, AUDIENCE, deadUrl, ISSUER, newKey, token, type TestKey } from './helpers/identity-fixtures.js';

// A new server instance's start (performance plan כ'): the signing keys can be fetched at start, in parallel, with verification unchanged;
// the image library is loaded on the first upload only (the upload itself: tests/media-processing.test.ts and the media route tests).

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

/** A JWKS endpoint that counts how often it is asked. */
async function countingJwks(key: TestKey): Promise<{ url: URL; hits: () => number }> {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [key.publicJwk] }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: string | AddressInfo | null = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { url: new URL(`http://127.0.0.1:${port}/.well-known/jwks.json`), hits: () => hits };
}

const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
};

describe('the signing keys at instance start', () => {
  it('with prefetch the keys are fetched before any request, and the first token is verified with that one fetch', async () => {
    const key = await newKey('prefetch-key');
    const jwks = await countingJwks(key);
    const verify = createTokenVerifier({ jwksUrl: jwks.url, issuer: ISSUER, audience: AUDIENCE }, { prefetch: true });
    await until(() => jwks.hits() === 1);
    expect(jwks.hits()).toBe(1);
    const verified = await verify(await token({ key, sub: ACCOUNT_A }));
    expect(verified.identity.userId).toBe(ACCOUNT_A);
    expect(jwks.hits()).toBe(1);
  });

  it('a token that arrives while the prefetch is in flight waits for the same fetch (no second one)', async () => {
    const key = await newKey('inflight-key');
    const jwks = await countingJwks(key);
    const verify = createTokenVerifier({ jwksUrl: jwks.url, issuer: ISSUER, audience: AUDIENCE }, { prefetch: true });
    const verified = await verify(await token({ key, sub: ACCOUNT_A }));
    expect(verified.identity.userId).toBe(ACCOUNT_A);
    expect(jwks.hits()).toBe(1);
  });

  it('a prefetch that fails late does not refuse the request waiting on it: that request fetches again and verifies', async () => {
    const key = await newKey('late-fail-key');
    let hits = 0;
    const server = createServer((_req, res) => {
      hits += 1;
      if (hits === 1) {
        // the prefetch: answered late, and with a failure
        setTimeout(() => {
          res.statusCode = 500;
          res.end('{}');
        }, 150);
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [key.publicJwk] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address: string | AddressInfo | null = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const verify = createTokenVerifier({ jwksUrl: new URL(`http://127.0.0.1:${port}/.well-known/jwks.json`), issuer: ISSUER, audience: AUDIENCE }, { prefetch: true });
    await until(() => hits === 1); // the prefetch is in flight; the request below arrives while it is
    const verified = await verify(await token({ key, sub: ACCOUNT_A }));
    expect(verified.identity.userId).toBe(ACCOUNT_A);
    expect(hits).toBe(2);
  });

  it('without prefetch nothing is fetched until the first token (the default, as before)', async () => {
    const key = await newKey('lazy-key');
    const jwks = await countingJwks(key);
    const verify = createTokenVerifier({ jwksUrl: jwks.url, issuer: ISSUER, audience: AUDIENCE });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(jwks.hits()).toBe(0);
    await verify(await token({ key, sub: ACCOUNT_A }));
    expect(jwks.hits()).toBe(1);
  });

  it('a prefetch that cannot reach the keys is dropped: no unhandled rejection, and a token is refused as unavailable, as before', async () => {
    const key = await newKey('dead-key');
    const verify = createTokenVerifier({ jwksUrl: new URL(await deadUrl()), issuer: ISSUER, audience: AUDIENCE }, { prefetch: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const outcome = await verify(await token({ key, sub: ACCOUNT_A })).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(TokenRejected);
    expect(outcome instanceof TokenRejected ? outcome.reason : null).toBe('unavailable');
  });
});

// Reads source on purpose (like the other *.static tests): the promise is that the request server's code never loads the image library at
// module load. Only the background job (src/jobs/, its own function) imports it statically.
describe('the image library is not loaded when the request server starts', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? (name === 'jobs' ? [] : files(path)) : path.endsWith('.ts') ? [path] : [];
    });

  it('no module outside src/jobs/ imports sharp statically; the upload loads it on first use', () => {
    const staticImport = /^\s*import\s+[^;]*?from\s+['"]sharp['"]/m;
    const offenders = files(src).filter((path) => staticImport.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(src, 'media', 'image-processing.ts'), 'utf8')).toContain("await import('sharp')");
  });
});
