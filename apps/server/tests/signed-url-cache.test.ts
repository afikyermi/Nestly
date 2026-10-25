import { MEDIA_URL_TTL_SECONDS } from '@nestly/shared';
import { describe, expect, it } from 'vitest';
import { MAX_ENTRIES, REUSE_WINDOW_SECONDS, reuseSignedUrls } from '../src/media/signed-url-cache.js';
import type { MediaStorage } from '../src/media/storage-admin.js';
import type { ImageRow, MediaStatus } from '../src/repositories/media-repository.js';
import { withUrls } from '../src/services/media-service.js';

// Stable image read addresses (Afik 25.10.2026, decisions-in-force.md §21): an address signed for one request comes back while it still has
// the full life an answer promises, so the browser reuses the image; the cache replaces the signing call only, never which images the
// caller may see.

const A = '10000000-0000-4000-8000-00000000000a';
const B = '10000000-0000-4000-8000-00000000000b';
const C = '10000000-0000-4000-8000-00000000000c';
const TTL = MEDIA_URL_TTL_SECONDS;

/** A Storage stand-in whose every signing gives a new address (as Storage does) and records the call; `hold` keeps a signing open. */
function signingStorage(options: { refuse?: ReadonlySet<string>; hold?: boolean } = {}) {
  const calls: Array<{ ids: string[]; seconds: number }> = [];
  const held: Array<() => void> = [];
  let serial = 0;
  const storage: MediaStorage = {
    isConfigured: () => true,
    upload: () => Promise.resolve('ok'),
    remove: () => Promise.resolve('ok'),
    signedUrls: (ids, seconds) => {
      calls.push({ ids: [...ids], seconds });
      serial += 1;
      const answer = new Map(ids.filter((id) => options.refuse?.has(id) !== true).map((id) => [id, `https://storage.example.invalid/${id}?token=${serial}`]));
      if (options.hold !== true) return Promise.resolve(answer);
      return new Promise((resolve) => held.push(() => resolve(answer)));
    },
  };
  return { storage, calls, ids: () => calls.map((c) => c.ids), release: () => held.splice(0).forEach((go) => go()) };
}

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (seconds: number) => (at += seconds * 1_000) };
}

const reuse = { reuse: true } as const;

describe('reuseSignedUrls', () => {
  it('signs for the promised life plus the reuse window, and hands the same address out while the promised life remains', async () => {
    const inner = signingStorage();
    const time = clock();
    const cached = reuseSignedUrls(inner.storage, { now: time.now });
    const first = await cached.signedUrls([A, B], TTL, reuse);
    expect(inner.calls).toEqual([{ ids: [A, B], seconds: TTL + REUSE_WINDOW_SECONDS }]);
    time.advance(REUSE_WINDOW_SECONDS);
    expect(await cached.signedUrls([A, B], TTL, reuse)).toEqual(first);
    expect(inner.calls).toHaveLength(1);
  });

  it('signs again once less than the promised life remains, and keeps the new address', async () => {
    const inner = signingStorage();
    const time = clock();
    const cached = reuseSignedUrls(inner.storage, { now: time.now });
    const first = await cached.signedUrls([A], TTL, reuse);
    time.advance(REUSE_WINDOW_SECONDS + 1);
    const second = await cached.signedUrls([A], TTL, reuse);
    expect(second.get(A)).not.toBe(first.get(A));
    expect((await cached.signedUrls([A], TTL, reuse)).get(A)).toBe(second.get(A));
    expect(inner.ids()).toEqual([[A], [A]]);
  });

  it('signs only the ids it has no fresh address for', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A], TTL, reuse);
    const both = await cached.signedUrls([A, B, B], TTL, reuse);
    expect([...both.keys()].sort()).toEqual([A, B]);
    expect(inner.ids()).toEqual([[A], [B]]);
  });

  it('returns only the ids asked for, never another kept address', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A, B], TTL, reuse);
    expect([...(await cached.signedUrls([B], TTL, reuse)).keys()]).toEqual([B]);
    expect((await cached.signedUrls([], TTL, reuse)).size).toBe(0);
  });

  it('signs fresh, for exactly the life asked, every time without reuse (the image queue)', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A], TTL, reuse);
    const one = await cached.signedUrls([A], 600);
    const two = await cached.signedUrls([A], 600);
    expect(one.get(A)).not.toBe(two.get(A));
    expect(inner.calls.slice(1)).toEqual([{ ids: [A], seconds: 600 }, { ids: [A], seconds: 600 }]);
  });

  it('keeps no address Storage did not sign', async () => {
    const inner = signingStorage({ refuse: new Set([B]) });
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    expect((await cached.signedUrls([A, B], TTL, reuse)).has(B)).toBe(false);
    await cached.signedUrls([A, B], TTL, reuse);
    expect(inner.ids()).toEqual([[A, B], [B]]);
  });

  it('drops the address of a removed image at once', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    const first = await cached.signedUrls([A, B], TTL, reuse);
    await cached.remove([A]);
    const second = await cached.signedUrls([A, B], TTL, reuse);
    expect(second.get(A)).not.toBe(first.get(A));
    expect(second.get(B)).toBe(first.get(B));
  });

  it('two requests at once for the same image share one signing and one address', async () => {
    const inner = signingStorage({ hold: true });
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    const one = cached.signedUrls([A, B], TTL, reuse);
    const two = cached.signedUrls([B, C], TTL, reuse);
    inner.release();
    await Promise.resolve();
    inner.release();
    const [first, second] = await Promise.all([one, two]);
    expect(second.get(B)).toBe(first.get(B));
    expect(inner.ids()).toEqual([[A, B], [C]]);
  });

  it('does not keep the address of an image removed while it was being signed', async () => {
    const inner = signingStorage({ hold: true });
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    const pending = cached.signedUrls([A], TTL, reuse);
    await cached.remove([A]);
    inner.release();
    await pending;
    const again = cached.signedUrls([A], TTL, reuse);
    inner.release();
    await again;
    expect(inner.ids()).toEqual([[A], [A]]);
  });

  it('keeps at most maxEntries addresses, dropping the least recently used', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now, maxEntries: 2 });
    await cached.signedUrls([A], TTL, reuse);
    await cached.signedUrls([B], TTL, reuse);
    await cached.signedUrls([A], TTL, reuse); // A is now the most recent
    await cached.signedUrls([C], TTL, reuse); // B goes
    inner.calls.length = 0;
    await cached.signedUrls([A, C], TTL, reuse);
    expect(inner.calls).toEqual([]);
    await cached.signedUrls([B], TTL, reuse);
    expect(inner.ids()).toEqual([[B]]);
  });

  it('the default bound holds: past MAX_ENTRIES the oldest address is signed again', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    const id = (n: number) => `20000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
    await cached.signedUrls(Array.from({ length: MAX_ENTRIES + 1 }, (_, n) => id(n)), TTL, reuse);
    inner.calls.length = 0;
    await cached.signedUrls([id(MAX_ENTRIES), id(0)], TTL, reuse);
    expect(inner.ids()).toEqual([[id(0)]]);
  });

  it('an address kept for one promised life is not handed out for another', async () => {
    const inner = signingStorage();
    const cached = reuseSignedUrls(inner.storage, { now: clock().now });
    await cached.signedUrls([A], TTL, reuse);
    await cached.signedUrls([A], TTL * 2, reuse);
    expect(inner.calls.map((c) => c.seconds)).toEqual([TTL + REUSE_WINDOW_SECONDS, TTL * 2 + REUSE_WINDOW_SECONDS]);
  });
});

describe('withUrls over the cache', () => {
  const row = (id: string, status: MediaStatus): ImageRow => ({ id, status, width: 10, height: 10 });

  it('gives a rejected image no address even when one is kept for it', async () => {
    const cached = reuseSignedUrls(signingStorage().storage, { now: clock().now });
    expect((await withUrls(cached, [row(A, 'passed')])).get(A)?.url).not.toBeNull();
    expect((await withUrls(cached, [row(A, 'rejected')])).get(A)).toMatchObject({ state: 'rejected', url: null });
  });

  it('gives an image the caller did not read no address: only the rows of this request are looked up', async () => {
    const cached = reuseSignedUrls(signingStorage().storage, { now: clock().now });
    await withUrls(cached, [row(A, 'passed'), row(B, 'passed')]);
    expect([...(await withUrls(cached, [row(B, 'passed')])).keys()]).toEqual([B]);
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
