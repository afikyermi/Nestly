// Stable image read addresses (Afik 25.10.2026): the browser keeps an image it already downloaded only while its address stays the same,
// so a read address signed for one request is kept here and handed out again while enough of its lifetime remains. Per function instance,
// in memory, lost on a cold start (conventions: a cache that may be lost).
//
// The cache replaces the signing call only, never the visibility decision: the callers still pass only the ids the caller's own RLS-checked
// read returned in the same request, and a caller who may not see an image never reaches this module with its id. An address already
// handed out stays valid until it expires, as it did before this cache (the signed lifetime is unchanged); removing an image drops its
// address here at once. Only a call that asks for reuse is served from the cache (the image queue signs fresh addresses each time).

import type { MediaStorage, SignOptions } from './storage-admin.js';

/** A kept address is handed out again only while at least this much of its lifetime remains, so the page that receives it can still load
 *  an image far down the page (lazy loading) minutes later. */
export const MIN_REMAINING_SECONDS = 300;
/** At most this many addresses are kept per instance (a few hundred bytes each); the least recently used one goes first. */
export const MAX_ENTRIES = 5_000;

interface Entry {
  readonly url: string;
  readonly expiresAt: number;
}

export interface SignedUrlCacheOptions {
  readonly now?: () => number;
  readonly maxEntries?: number;
  readonly minRemainingSeconds?: number;
}

/** `storage` with its read addresses reused while they have `minRemainingSeconds` left; everything else passes through unchanged. */
export function reuseSignedUrls(storage: MediaStorage, options: SignedUrlCacheOptions = {}): MediaStorage {
  const now = options.now ?? Date.now;
  const maxEntries = Math.max(1, options.maxEntries ?? MAX_ENTRIES);
  const minRemainingMs = (options.minRemainingSeconds ?? MIN_REMAINING_SECONDS) * 1_000;
  const entries = new Map<string, Entry>();
  const keyOf = (id: string, seconds: number): string => `${seconds}:${id}`;

  const keep = (key: string, entry: Entry): void => {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done === true) break;
      entries.delete(oldest.value);
    }
  };

  return {
    isConfigured: () => storage.isConfigured(),
    upload: (id, bytes, mime) => storage.upload(id, bytes, mime),
    remove: (ids) => {
      const gone = new Set(ids);
      for (const [key] of entries) if (gone.has(key.slice(key.indexOf(':') + 1))) entries.delete(key);
      return storage.remove(ids);
    },
    signedUrls: async (ids, seconds, signOptions?: SignOptions) => {
      if (signOptions?.reuse !== true || seconds * 1_000 <= minRemainingMs) return storage.signedUrls(ids, seconds, signOptions);
      const at = now();
      const out = new Map<string, string>();
      const missing: string[] = [];
      for (const id of new Set(ids)) {
        const key = keyOf(id, seconds);
        const entry = entries.get(key);
        if (entry !== undefined && entry.expiresAt - at >= minRemainingMs) {
          keep(key, entry);
          out.set(id, entry.url);
        } else {
          if (entry !== undefined) entries.delete(key);
          missing.push(id);
        }
      }
      if (missing.length === 0) return out;
      // The lifetime is counted from before the call, so a kept address never outlives what this module believes.
      const signedAt = now();
      const fresh = await storage.signedUrls(missing, seconds, signOptions);
      const expiresAt = signedAt + seconds * 1_000;
      for (const id of missing) {
        const url = fresh.get(id);
        if (url === undefined) continue;
        out.set(id, url);
        keep(keyOf(id, seconds), { url, expiresAt });
      }
      return out;
    },
  };
}
