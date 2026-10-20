import { Writable } from 'node:stream';
import { vi } from 'vitest';
import type { Database } from '../../src/db/client.js';
import { setEnv, type App, type EnvValues } from './identity-fixtures.js';
import type { MediaDependencies } from '../../src/services/media-service.js';

// Shared by the route tests for POST /api/register (I1 F1.4 part b, spec criteria 2, 3, 8, 10, 11, 13, 15). Written from
// interface.md "part b, route": buildApp({ config?, database?, logStream?, clock? }). Nothing here reads the implementation.
//
//   buildRegisterApp(env, { database, clock, logStream })  like makeApp(), plus the two seams the route adds
//   captureLog()                                           a writable that keeps every log line the app writes
//   VALID_BODY(over)                                       a body that passes the schema at CLOCK_NOW, with overrides
//   post(app, token, payload)                              POST /api/register with a Bearer token and a JSON payload

/** The server's fixed clock: 2026-06-15 10:00 UTC. The schema's "today" is this UTC date + 1 day (Q4). */
export const CLOCK_NOW = new Date('2026-06-15T10:00:00.000Z');

export interface LogCapture {
  stream: Writable;
  lines: () => string[];
  text: () => string;
}

export function captureLog(): LogCapture {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      callback();
    },
  });
  return { stream, lines: () => [...lines], text: () => lines.join('') };
}

export interface RegisterSeams {
  database?: Database;
  clock?: () => Date;
  logStream?: Writable;
  /** I5: fakes for image storage, the re-encoder and the job trigger. */
  media?: Partial<MediaDependencies>;
}

export async function buildRegisterApp(env: EnvValues, seams: RegisterSeams = {}): Promise<App> {
  setEnv(env);
  vi.resetModules();
  const { buildApp } = await import('../../src/app.js');
  return buildApp({
    ...(seams.database ? { database: seams.database } : {}),
    ...(seams.clock ? { clock: seams.clock } : {}),
    ...(seams.logStream ? { logStream: seams.logStream } : {}),
    ...(seams.media ? { media: seams.media } : {}),
  });
}

export interface RefusingDatabase {
  database: Database;
  /** How many times anything asked this Database for a transaction or a connection. */
  attempts: () => number;
}

/**
 * A Database that never touches the network: the first time the route asks for a transaction (db.transaction) or a
 * connection (client.begin / reserve) the attempt is counted and rejected at once. "The request reached the database" is
 * then `attempts() > 0`, and a request that was refused earlier leaves it at 0. (A fake TCP database that drops
 * connections makes the driver retry in the background, which blurs both the count and the timing.)
 */
export async function refusingDatabase(url: string): Promise<RefusingDatabase> {
  const { createDatabase } = await import('../../src/db/client.js');
  const real = createDatabase(url);
  let attempts = 0;
  const refuse = (): Promise<never> => {
    attempts += 1;
    return Promise.reject(new Error('stub database: refused'));
  };
  const db = new Proxy(real.db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === 'transaction') return refuse;
      if (typeof value !== 'function') return value;
      const bound: unknown = value.bind(target);
      return bound;
    },
  });
  const client = new Proxy(real.client, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === 'begin' || prop === 'reserve') return refuse;
      return value;
    },
  });
  return { database: { db, client, close: () => real.close() }, attempts: () => attempts };
}

export const parts =(iso: string): { day: string; month: string; year: string } => {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { day, month, year };
};
export const EMPTY_DATE = { day: '', month: '', year: '' };

export function child(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'נועה', sex: 'girl', birthDate: parts('2024-02-29'), ...over };
}

/** A body that passes the route's schema at CLOCK_NOW. */
export function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stages: ['pregnant', 'has_child'],
    fullName: 'דנה כהן',
    parentGender: 'woman',
    dueDate: parts('2026-12-01'),
    children: [child(), child({ name: 'אלי', sex: 'boy', birthDate: parts('2022-01-15') })],
    consent: true,
    ...over,
  };
}

export function post(app: App, bearer: string | null, payload: string | Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extraHeaders };
  if (bearer !== null) headers.authorization = bearer;
  return app.inject({ method: 'POST', url: '/api/register', headers, payload: typeof payload === 'string' ? payload : JSON.stringify(payload) });
}

export function jsonOf(body: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('expected a JSON object body');
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const item: unknown = value;
    out[key] = item;
  }
  return out;
}
