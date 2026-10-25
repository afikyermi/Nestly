import { MEDIA_URL_TTL_SECONDS } from '@nestly/shared';
import { describe, expect, it } from 'vitest';
import { MAX_ENTRIES, MIN_REMAINING_SECONDS, reuseSignedUrls } from '../src/media/signed-url-cache.js';
import type { MediaStorage } from '../src/media/storage-admin.js';
import type { ImageRow, MediaStatus } from '../src/repositories/media-repository.js';
import { withUrls } from '../src/services/media-service.js';

// Stable image read addresses (Afik 25.10.2026): an address signed for one request comes back while enough of its lifetime remains, so the
// browser reuses the image; the cache replaces the signing call only, never which images the caller may see.

const A = '10000000-0000-4000-8000-00000000000a';
const B = '10000000-0000-4000-8000-00000000000b';
const C = '10000000-0000-4000-8000-00000000000c';

/** A Storage stand-in whose every signing gives a new address (as Storage does) and records the call. */
function signingStorage(options: { refuse?: ReadonlySet<string> } = {}) {
  const calls: string[][] = [];
  let serial = 0;
  const storage: MediaStorage = {
    isConfigured: () => true,
    upload: () => Promise.resolve('ok'),
    remove: () => Promise.resolve('ok'),
    signedUrls: (ids) => {
      calls.push([...ids]);
      serial += 1;
      return Promise.resolve(new Map(ids.filter((id) => options.refuse?.has(id) !== true).map((id) => [id, `https://storage.example.invalid/${id}?token=${serial}`])));
    },
  };
  return { storage, calls };
}

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (seconds: number) => (at += seconds * 1_000) };
}

const reuse = { reuse: true } as const;

describe('reuseSignedUrls', () => {
  it('returns the same address while at least the margin of its lifetime remains, without signing again', async () => {
    const inner = signingStorage();
    const time = clock();
    const cached = reuseSignedUrls(inner.storage, { now: time.now });
    const first = await cached.signedUrls([A, B], MEDIA_URL_TTL_SECONDS, reuse);
    time.advance(MEDIA_URL_TTL_SECONDS - MIN_REMAINING_SECONDS);
    const second = await cached.signedUrls([A, B], MEDIA_URL_TTL_SECONDS, reuse);
    expect(second).toEqual(first);
    expect(inner.calls).toEqual([[A, B]]);
  });

  it('signs again once less than the margin remains, and keeps the new address', async () => {
    const inner = signingStorage();
    const time = clock();
    const cached = reuseSignedUrls(inner.storage, { now: time.now });
    const first = await cached.signedUrls([A], MEDIA_URL_TTL_SECONDS, reuse);
    time.advance(MEDIA_URL_TTL_SECONDS - MIN_REMAINING_SECONDS + 1);
    const second = await cached.signedUrls([A], MEDIA_URL_TTL_SECONDS, reuse);
    expect(second.get(A)).not.toBe(first.get(A));
    const third = await cached.signedUrls([A], MEDIA_URL_TTL_SECONDS, reuse);
    expect(third.get(A)).toBe(second.get(A));
    expect(inner.calls).toEqual([[A], [A]]);
  });

  it('signs only the ids it has no fresh address for', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A], MEDIA_URL_TTL_SECONDS, reuse);
    const both = await cached.signedUrls([A, B, B], MEDIA_URL_TTL_SECONDS, reuse);
    expect([...both.keys()].sort()).toEqual([A, B]);
    expect(inner.calls).toEqual([[A], [B]]);
  });

  it('returns only the ids asked for, never another kept address', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A, B], MEDIA_URL_TTL_SECONDS, reuse);
    expect([...(await cached.signedUrls([B], MEDIA_URL_TTL_SECONDS, reuse)).keys()]).toEqual([B]);
    expect((await cached.signedUrls([], MEDIA_URL_TTL_SECONDS, reuse)).size).toBe(0);
  });

  it('signs fresh every time without reuse (the image queue)', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A], MEDIA_URL_TTL_SECONDS, reuse);
    const one = await cached.signedUrls([A], 600);
    const two = await cached.signedUrls([A], 600);
    expect(one.get(A)).not.toBe(two.get(A));
    expect(inner.calls).toEqual([[A], [A], [A]]);
  });

  it('keeps no address Storage did not sign', async () => {
    const inner = signingStorage({ refuse: new Set([B]) });
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    expect((await cached.signedUrls([A, B], MEDIA_URL_TTL_SECONDS, reuse)).has(B)).toBe(false);
    await cached.signedUrls([A, B], MEDIA_URL_TTL_SECONDS, reuse);
    expect(inner.calls).toEqual([[A, B], [B]]);
  });

  it('drops the address of a removed image at once', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    const first = await cached.signedUrls([A, B], MEDIA_URL_TTL_SECONDS, reuse);
    await cached.remove([A]);
    const second = await cached.signedUrls([A, B], MEDIA_URL_TTL_SECONDS, reuse);
    expect(second.get(A)).not.toBe(first.get(A));
    expect(second.get(B)).toBe(first.get(B));
  });

  it('keeps at most maxEntries addresses, dropping the least recently used', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now, maxEntries: 2 });
    await cached.signedUrls([A], MEDIA_URL_TTL_SECONDS, reuse);
    await cached.signedUrls([B], MEDIA_URL_TTL_SECONDS, reuse);
    await cached.signedUrls([A], MEDIA_URL_TTL_SECONDS, reuse); // A is now the most recent
    await cached.signedUrls([C], MEDIA_URL_TTL_SECONDS, reuse); // B goes
    inner.calls.length = 0;
    await cached.signedUrls([A, C], MEDIA_URL_TTL_SECONDS, reuse);
    expect(inner.calls).toEqual([]);
    await cached.signedUrls([B], MEDIA_URL_TTL_SECONDS, reuse);
    expect(inner.calls).toEqual([[B]]);
    expect(MAX_ENTRIES).toBeGreaterThan(0);
  });

  it('never reuses when the lifetime asked for is not longer than the margin', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A], MIN_REMAINING_SECONDS, reuse);
    await cached.signedUrls([A], MIN_REMAINING_SECONDS, reuse);
    expect(inner.calls).toEqual([[A], [A]]);
  });
});

describe('withUrls over the cache', () => {
  const row = (id: string, status: MediaStatus): ImageRow => ({ id, status, width: 10, height: 10 });

  it('gives a rejected image no address even when one is kept for it', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    const before = await withUrls(cached, [row(A, 'passed')]);
    expect(before.get(A)?.url).not.toBeNull();
    const after = await withUrls(cached, [row(A, 'rejected')]);
    expect(after.get(A)).toMatchObject({ state: 'rejected', url: null });
  });

  it('gives an image the caller did not read no address: only the rows of this request are looked up', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await withUrls(cached, [row(A, 'passed'), row(B, 'passed')]);
    const views = await withUrls(cached, [row(B, 'passed')]);
    expect([...views.keys()]).toEqual([B]);
  });

  it('hands the same address to a second load of the same images', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    const one = await withUrls(cached, [row(A, 'passed'), row(B, 'pending')]);
    const two = await withUrls(cached, [row(A, 'passed'), row(B, 'pending')]);
    expect(two.get(A)?.url).toBe(one.get(A)?.url);
    expect(two.get(B)?.url).toBe(one.get(B)?.url);
    expect(inner.calls).toHaveLength(1);
  });
});
