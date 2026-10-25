// Stable image read addresses (Afik 25.10.2026, decisions-in-force.md §21): the browser reuses an image it already downloaded only while
// its address stays the same, so an address signed for one request is kept here and handed out again while enough of its lifetime remains.
// Per function instance, in memory, lost on a cold start (conventions: a cache that may be lost); another instance signs its own.
//
// The cache replaces the signing call only, never the visibility decision: the callers still pass only the ids the caller's own RLS-checked
// read returned in the same request, so an image the caller may not see (hidden, deleted, rejected, not theirs) never reaches this module
// and no kept address is handed out for it. An address already handed out stays valid until it expires, as before this cache. Every
// address handed out keeps at least `seconds` (MEDIA_URL_TTL_SECONDS) of life, as before; to reuse it for a while it is signed for
// `seconds + REUSE_WINDOW_SECONDS`. A removal made through this instance drops the kept address (and a signing in flight for it); a removal
// elsewhere (the background job, a database cascade, another instance) does not, and needs nothing: the row is gone, so no read passes its id.
// Only a call that asks for reuse is served from here: the image queue signs a fresh address on every read.

import type { MediaStorage, SignOptions } from './storage-admin.js';

/** How long a kept address is handed out again: it is signed for this much longer than the life every answer promises. */
export const REUSE_WINDOW_SECONDS = 300;
/** At most this many addresses are kept per instance (a few hundred bytes each); the least recently used one goes first. */
export const MAX_ENTRIES = 5_000;

interface Entry {
  readonly url: string;
  /** The life the answer promises (the `seconds` asked for); an entry is reused only by a call that asks for the same. */
  readonly seconds: number;
  readonly expiresAt: number;
}

export interface SignedUrlCacheOptions {
  readonly now?: () => number;
  readonly maxEntries?: number;
}

/** `storage` with its read addresses reused while each still has the life asked for; everything else passes through unchanged. */
export function reuseSignedUrls(storage: MediaStorage, options: SignedUrlCacheOptions = {}): MediaStorage {
  const now = options.now ?? Date.now;
  const maxEntries = Math.max(1, options.maxEntries ?? MAX_ENTRIES);
  const entries = new Map<string, Entry>();
  /** Signings in flight, per id: a second request for the same image waits for the first instead of signing again. */
  const inFlight = new Map<string, { readonly seconds: number; readonly signing: Promise<Map<string, string>> }>();

  const keep = (id: string, entry: Entry): void => {
    entries.delete(id);
    entries.set(id, entry);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done === true) break;
      entries.delete(oldest.value);
    }
  };

  const freshFor = (id: string, seconds: number, at: number): string | undefined => {
    const entry = entries.get(id);
    if (entry === undefined) return undefined;
    if (entry.seconds !== seconds || entry.expiresAt - at < seconds * 1_000) {
      entries.delete(id);
      return undefined;
    }
    keep(id, entry);
    return entry.url;
  };

  return {
    isConfigured: () => storage.isConfigured(),
    upload: (id, bytes, mime) => storage.upload(id, bytes, mime),
    remove: (ids) => {
      for (const id of ids) {
        entries.delete(id);
        inFlight.delete(id);
      }
      return storage.remove(ids);
    },
    signedUrls: async (ids, seconds, signOptions?: SignOptions) => {
      if (signOptions?.reuse !== true) return storage.signedUrls(ids, seconds);
      const at = now();
      const out = new Map<string, string>();
      const waits: Array<{ id: string; signing: Promise<Map<string, string>> }> = [];
      const missing: string[] = [];
      for (const id of new Set(ids)) {
        const url = freshFor(id, seconds, at);
        if (url !== undefined) out.set(id, url);
        else {
          const pending = inFlight.get(id);
          if (pending !== undefined && pending.seconds === seconds) waits.push({ id, signing: pending.signing });
          else missing.push(id);
        }
      }
      if (missing.length > 0) {
        const lifetime = seconds + REUSE_WINDOW_SECONDS;
        // The life is counted from before the call, so a kept address never outlives what this module believes.
        const signedAt = now();
        const signing = storage.signedUrls(missing, lifetime);
        const flight = { seconds, signing };
        for (const id of missing) inFlight.set(id, flight);
        let fresh: Map<string, string>;
        // An id is kept only while this signing is still the one on record: a removal during the call cleared it.
        const stillOurs = new Set<string>();
        try {
          fresh = await signing;
        } finally {
          for (const id of missing) {
            if (inFlight.get(id) !== flight) continue;
            stillOurs.add(id);
            inFlight.delete(id);
          }
        }
        for (const id of missing) {
          const url = fresh.get(id);
          if (url === undefined) continue;
          out.set(id, url);
          if (stillOurs.has(id)) keep(id, { url, seconds, expiresAt: signedAt + lifetime * 1_000 });
        }
      }
      for (const { id, signing } of waits) {
        const url = (await signing.catch(() => new Map<string, string>())).get(id);
        if (url !== undefined) out.set(id, url);
      }
      return out;
    },
  };
}
