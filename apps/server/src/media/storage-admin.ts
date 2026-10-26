// Image storage (I5; Afik 20.10.2026, decisions-in-force.md §7; data-model "Approved exceptions", I5 media). With recovery/auth-admin.ts, the
// ONLY file that reads the Supabase secret key, which carries service_role power over the whole project: tests/credentials.static.test.ts
// fails when the key's name appears anywhere else, and when the training bucket or the job-only operations are named outside this file and
// src/jobs/. The fence is this file and that check, not the credential.
//
// Two private buckets, created by Afik per environment:
//   media            every uploaded image, file name = media_assets.id. The request server uploads (after the caller's own insert of the row
//                    in the same transaction), removes, and signs short-lived read addresses, ONLY for rows the caller's RLS-checked read
//                    returned (the callers pass ids they read under the caller's identity; this module checks nothing itself).
//   media-training   the training set, file name = media_training_samples.id. Only the background job (src/jobs/) reads or writes it.
// Every operation is one fixed call, never a generic request function. Errors are a word, never Storage's text.

import { ENV } from '../lib/config.js';

const SECRET_ENV = 'SUPABASE_SECRET_KEY';
const MEDIA_BUCKET = 'media';
const TRAINING_BUCKET = 'media-training';
const CALL_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

type Env = Readonly<Record<string, string | undefined>>;

interface Target {
  readonly base: string;
  readonly key: string;
}

/** The Storage endpoint (the project origin of the Auth issuer) and the key, or undefined: every operation then fails closed. */
function targetFrom(env: Env): Target | undefined {
  const key = env[SECRET_ENV]?.trim();
  const issuer = env[ENV.issuer]?.trim();
  if (key === undefined || key === '' || issuer === undefined || !URL.canParse(issuer)) return undefined;
  const url = new URL(issuer);
  const safe = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!safe) return undefined;
  return { base: `${url.origin}/storage/v1`, key };
}

function objectPath(id: string): string {
  if (!UUID.test(id)) throw new Error('storage: not an image id');
  return id;
}

async function call(target: Target, path: string, init: { method: string; body?: RequestInit['body']; contentType?: string }): Promise<Response> {
  return fetch(`${target.base}${path}`, {
    method: init.method,
    headers: {
      apikey: target.key,
      authorization: `Bearer ${target.key}`,
      ...(init.contentType === undefined ? {} : { 'content-type': init.contentType }),
    },
    ...(init.body === undefined ? {} : { body: init.body }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
}

export type StorageOutcome = 'ok' | 'failed' | 'unconfigured';

async function put(target: Target | undefined, bucket: string, id: string, bytes: Uint8Array, mime: string): Promise<StorageOutcome> {
  if (target === undefined) return 'unconfigured';
  try {
    const response = await call(target, `/object/${bucket}/${objectPath(id)}`, { method: 'POST', body: Buffer.from(bytes), contentType: mime });
    return response.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Storage removes at most this many objects per call. */
const REMOVE_CHUNK = 1_000;

async function remove(target: Target | undefined, bucket: string, ids: readonly string[]): Promise<StorageOutcome> {
  if (target === undefined) return 'unconfigured';
  try {
    for (let start = 0; start < ids.length; start += REMOVE_CHUNK) {
      const response = await call(target, `/object/${bucket}`, {
        method: 'DELETE',
        body: JSON.stringify({ prefixes: ids.slice(start, start + REMOVE_CHUNK).map(objectPath) }),
        contentType: 'application/json',
      });
      if (!response.ok) return 'failed';
    }
    return 'ok';
  } catch {
    return 'failed';
  }
}

async function get(target: Target | undefined, bucket: string, id: string): Promise<Uint8Array | undefined> {
  if (target === undefined) return undefined;
  try {
    const response = await call(target, `/object/authenticated/${bucket}/${objectPath(id)}`, { method: 'GET' });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

// ---- the request server ------------------------------------------------------------------------------------------------------

/** What the request server may do with images: upload one it just inserted, remove its own, sign read addresses for rows it read. */
export interface MediaStorage {
  isConfigured(): boolean;
  upload(id: string, bytes: Uint8Array, mime: string): Promise<StorageOutcome>;
  remove(ids: readonly string[]): Promise<StorageOutcome>;
  /** id -> a read address valid for `seconds`; an id Storage did not sign is missing from the map. `reuse`: an address signed earlier may
   *  come back while enough of its lifetime remains (media/signed-url-cache.ts; this module itself always signs). */
  signedUrls(ids: readonly string[], seconds: number, options?: SignOptions): Promise<Map<string, string>>;
}

export interface SignOptions {
  readonly reuse?: boolean;
}

const signedRow = (value: unknown): { path: string; url: string } | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const path: unknown = Reflect.get(value, 'path');
  const url: unknown = Reflect.get(value, 'signedURL');
  return typeof path === 'string' && typeof url === 'string' ? { path, url } : undefined;
};

export function createMediaStorage(env: Env = process.env): MediaStorage {
  const target = targetFrom(env);
  return {
    isConfigured: () => target !== undefined,
    upload: (id, bytes, mime) => put(target, MEDIA_BUCKET, id, bytes, mime),
    remove: (ids) => remove(target, MEDIA_BUCKET, ids),
    signedUrls: async (ids, seconds) => {
      const out = new Map<string, string>();
      if (target === undefined || ids.length === 0) return out;
      try {
        const response = await call(target, `/object/sign/${MEDIA_BUCKET}`, {
          method: 'POST',
          body: JSON.stringify({ expiresIn: seconds, paths: ids.map(objectPath) }),
          contentType: 'application/json',
        });
        if (!response.ok) return out;
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) return out;
        for (const value of rows) {
          const row = signedRow(value);
          if (row !== undefined && UUID.test(row.path)) out.set(row.path, `${target.base}${row.url.startsWith('/') ? '' : '/'}${row.url}`);
        }
      } catch {
        // no address: the image shows as unavailable this time
      }
      return out;
    },
  };
}

// ---- the background job only (src/jobs/; the static check fences these to it) -------------------------------------------------

export interface JobStorage {
  isConfigured(): boolean;
  /** The bytes of an image, for the check and for the training copy. */
  readImage(id: string): Promise<Uint8Array | undefined>;
  removeImages(ids: readonly string[]): Promise<StorageOutcome>;
  /** One page of the image bucket, oldest first, from `offset`: the ids of files created before `before` (the sweep of files that have no
   *  row), and whether the listing goes on past this page. */
  listImagesBefore(before: Date, limit: number, offset: number): Promise<{ ids: string[]; more: boolean } | undefined>;
  writeTrainingSample(id: string, bytes: Uint8Array, mime: string): Promise<StorageOutcome>;
  /** A training file's bytes, read only after `recordAccess` has written the access event (Afik 20.10.2026: every access audited); a
   *  failed record reads nothing. The only read of the training bucket. */
  readTrainingSample(id: string, recordAccess: (id: string) => Promise<boolean>): Promise<Uint8Array | undefined>;
  removeTrainingSamples(ids: readonly string[]): Promise<StorageOutcome>;
}

export function createJobStorage(env: Env = process.env): JobStorage {
  const target = targetFrom(env);
  return {
    isConfigured: () => target !== undefined,
    readImage: (id) => get(target, MEDIA_BUCKET, id),
    removeImages: (ids) => remove(target, MEDIA_BUCKET, ids),
    listImagesBefore: async (before, limit, offset) => {
      if (target === undefined) return undefined;
      try {
        const response = await call(target, `/object/list/${MEDIA_BUCKET}`, {
          method: 'POST',
          body: JSON.stringify({ prefix: '', limit, offset, sortBy: { column: 'created_at', order: 'asc' } }),
          contentType: 'application/json',
        });
        if (!response.ok) return undefined;
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) return undefined;
        const ids: string[] = [];
        let reachedNewer = false;
        for (const row of rows) {
          if (typeof row !== 'object' || row === null) continue;
          const name: unknown = Reflect.get(row, 'name');
          const created: unknown = Reflect.get(row, 'created_at');
          if (typeof created === 'string' && new Date(created) >= before) reachedNewer = true;
          else if (typeof name === 'string' && UUID.test(name) && typeof created === 'string') ids.push(name);
        }
        return { ids, more: rows.length === limit && !reachedNewer };
      } catch {
        return undefined;
      }
    },
    writeTrainingSample: (id, bytes, mime) => put(target, TRAINING_BUCKET, id, bytes, mime),
    readTrainingSample: async (id, recordAccess) => {
      if (target === undefined || !UUID.test(id) || !(await recordAccess(id))) return undefined;
      return get(target, TRAINING_BUCKET, id);
    },
    removeTrainingSamples: (ids) => remove(target, TRAINING_BUCKET, ids),
  };
}
