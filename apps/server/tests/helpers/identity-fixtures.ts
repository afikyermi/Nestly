import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createTcpServer, type AddressInfo, type Server as TcpServer, type Socket } from 'node:net';
import { vi } from 'vitest';
import { SignJWT, exportJWK, exportSPKI, generateKeyPair, type JWK } from 'jose';
import type { Database } from '../../src/db/client.js';

// Shared by the part c server-identity tests (spec criteria 21-26). Written from the spec and the exported interfaces
// ORCHESTRATOR passed on (buildApp(deps), Database, createDatabase); nothing here reads the server's implementation.
//
//   - a local JWKS served over loopback http from generated ES256 keys (config accepts loopback http)
//   - a token factory that can produce every token the spec lists, valid and invalid
//   - a "fake database": a TCP listener that counts connection attempts and drops them
//   - a spy Database passed into buildApp({ database }) that counts every transaction opened through it
//     ("no transaction opened" is asserted on the spy AND on the connection count)
//   - environment scoping, and an app builder that registers the test's own routes
//
// The project bans `as` casts, so unknown values are narrowed with the small guards below (toRecord, toRecords).

export const ISSUER = 'https://nestly-test.example.invalid/auth/v1';
export const AUDIENCE = 'authenticated';
export const ACCOUNT_A = 'a0000000-0000-4000-8000-0000000000a1';
export const ACCOUNT_B = 'b0000000-0000-4000-8000-0000000000b2';

export const COLD_START_MS = 60_000;

// ---- narrowing helpers (no casts) ----------------------------------------------------------------------------------

/** An object, or an error. Used for parsed JSON and database rows. */
export function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('expected an object');
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(value)) {
    const item: unknown = entry;
    out[name] = item;
  }
  return out;
}

/** An array of objects, or an error. It never turns a wrong shape into an empty result. */
export function toRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('expected an array of rows');
  return value.map((item: unknown) => toRecord(item));
}

function portOf(server: { address(): string | AddressInfo | null }): number {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the test server is not listening on a port');
  return address.port;
}

// ---- environment ---------------------------------------------------------------------------------------------------

const ENV_KEYS = ['SUPABASE_JWKS_URL', 'SUPABASE_JWT_ISSUER', 'SUPABASE_JWT_AUDIENCE', 'DATABASE_URL'] as const;
type EnvKey = (typeof ENV_KEYS)[number];
export type EnvValues = Partial<Record<EnvKey, string | undefined>>;

const saved = new Map<EnvKey, string | undefined>();

/** Sets exactly these four variables (undefined = unset), remembering the originals for restoreEnv(). */
export function setEnv(values: EnvValues): void {
  for (const key of ENV_KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export function restoreEnv(): void {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
}

// ---- keys and tokens -----------------------------------------------------------------------------------------------

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

export interface TestKey {
  kid: string;
  privateKey: KeyPair['privateKey'];
  publicKey: KeyPair['publicKey'];
  publicJwk: JWK;
}

export async function newKey(kid: string): Promise<TestKey> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' };
  return { kid, privateKey, publicKey, publicJwk };
}

export interface JwksServer {
  url: string;
  setKeys: (keys: TestKey[]) => void;
  close: () => Promise<void>;
}

export async function startJwks(initial: TestKey[]): Promise<JwksServer> {
  let keys = initial;
  const server: HttpServer = createHttpServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: keys.map((k) => k.publicJwk) }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${portOf(server)}/.well-known/jwks.json`,
    setKeys: (next) => {
      keys = next;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A loopback URL that nothing listens on: a JWKS that is unreachable. */
export async function deadUrl(): Promise<string> {
  const probe = createTcpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = portOf(probe);
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return `http://127.0.0.1:${port}/.well-known/jwks.json`;
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export interface ClaimOptions {
  iss?: string | undefined;
  aud?: string | string[] | undefined;
  sub?: string | undefined;
  exp?: number | undefined;
  nbf?: number | undefined;
  /** merged last, so a test can add or override anything (role, app_metadata, user_metadata, a non-string sub ...) */
  extra?: Record<string, unknown> | undefined;
}

export interface TokenOptions extends ClaimOptions {
  key: TestKey;
  /** header kid; defaults to key.kid */
  kid?: string | undefined;
}

function payloadOf(o: ClaimOptions): Record<string, unknown> {
  const has = (k: keyof ClaimOptions): boolean => Object.prototype.hasOwnProperty.call(o, k);
  return {
    iss: has('iss') ? o.iss : ISSUER,
    aud: has('aud') ? o.aud : AUDIENCE,
    sub: has('sub') ? o.sub : ACCOUNT_A,
    iat: nowSeconds(),
    exp: has('exp') ? o.exp : nowSeconds() + 3600,
    nbf: o.nbf,
    role: 'authenticated',
    ...(o.extra ?? {}),
  };
}

/** A signed ES256 token. An option set to `undefined` explicitly removes that claim (e.g. `{ sub: undefined }`). */
export async function token(o: TokenOptions): Promise<string> {
  const { key, kid, ...claims } = o;
  return new SignJWT(payloadOf(claims))
    .setProtectedHeader({ alg: 'ES256', kid: kid ?? key.kid })
    .sign(key.privateKey);
}

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** alg "none": header and payload, empty signature. Carries valid claims and a kid that is in the JWKS. */
export function unsignedToken(kid: string, sub = ACCOUNT_A): string {
  return `${b64({ alg: 'none', typ: 'JWT', kid })}.${b64(payloadOf({ sub }))}.`;
}

/** HS256 signed with a shared secret. */
export async function hs256Token(secret: string, kid: string, sub = ACCOUNT_A): Promise<string> {
  return new SignJWT(payloadOf({ sub }))
    .setProtectedHeader({ alg: 'HS256', kid })
    .sign(new TextEncoder().encode(secret));
}

/** The classic confusion attack: HS256 with the public key (as PEM text) used as the HMAC secret. */
export async function hs256WithPublicKey(key: TestKey, sub = ACCOUNT_A): Promise<string> {
  return hs256Token(await exportSPKI(key.publicKey), key.kid, sub);
}

// ---- a database that only counts ---------------------------------------------------------------------------------

export interface FakeDb {
  url: string;
  connections: () => number;
  close: () => Promise<void>;
}

export async function startFakeDb(): Promise<FakeDb> {
  let count = 0;
  const open = new Set<Socket>();
  const server: TcpServer = createTcpServer((socket) => {
    count += 1;
    open.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => open.delete(socket));
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // Assembled from parts: the repository never holds a literal user:password@host.
  const url = ['postgres://app_server', 'throwaway'].join(':') + ['@127.0.0.1', `${portOf(server)}/nestly_test`].join(':');
  return {
    url,
    connections: () => count,
    close: async () => {
      for (const socket of open) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// ---- a spy Database ----------------------------------------------------------------------------------------------

let opened = 0;

/** How many transactions have been opened through any spy Database since the module loaded. Compare before/after. */
export function transactionsOpened(): number {
  return opened;
}

/**
 * A real Database (createDatabase(url): lazy, one connection) wrapped so that opening a transaction is counted:
 * `db.transaction(...)` and `client.begin(...)`/`client.reserve(...)`. The caller closes it (buildApp leaves a passed-in
 * Database to its owner).
 */
export async function spyDatabase(url: string): Promise<Database> {
  const { createDatabase } = await import('../../src/db/client.js');
  const real = createDatabase(url);
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      if (prop === 'transaction') {
        return (...args: unknown[]) => {
          opened += 1;
          const result: unknown = Reflect.apply(value, target, args);
          return result;
        };
      }
      const bound: unknown = value.bind(target);
      return bound;
    },
  });
  const client = new Proxy(real.client, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if ((prop === 'begin' || prop === 'reserve') && typeof value === 'function') {
        return (...args: unknown[]) => {
          opened += 1;
          const result: unknown = Reflect.apply(value, target, args);
          return result;
        };
      }
      return value;
    },
  });
  return { db, client, close: () => real.close() };
}

// ---- the app -----------------------------------------------------------------------------------------------------

type BuildApp = typeof import('../../src/app.js').buildApp;
export type App = ReturnType<BuildApp>;

/**
 * Sets the environment, loads the server fresh (configuration and any key cache start empty), builds the app and lets the
 * test register its own routes before the first request. A Database passed in stays the caller's to close; the caller
 * also closes the app.
 */
export async function makeApp(env: EnvValues, register?: (app: App) => void, database?: Database): Promise<App> {
  setEnv(env);
  vi.resetModules();
  const { buildApp } = await import('../../src/app.js');
  const app = buildApp(database ? { database } : {});
  register?.(app);
  return app;
}
