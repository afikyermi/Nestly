// F3.2-a1: pure ranking core. Expected values come from spec.md c4/c6/c8-c10/c12 and I3-algorithm.md only.
import { describe, expect, it } from 'vitest';
import {
  FEED_FALLBACK_CONFIG,
  feedConfigValues,
  feedCursor,
  feedPageResponse,
  feedUnit,
  parseFeedCursor,
  rankTier,
  resolveFeedConfig,
  scorePost,
  selectFeedPage,
  serializeFeedCursor,
  type FeedConfig,
  type ScoreInput,
} from '../src/index.js';

const V1: FeedConfig = {
  wFresh: 1, halfLifeHours: 24, wFriend: 0.5, wQuality: 0.2, qualityCap: 20, wStage: 0,
  scoredWindowDays: 14, maxSameCreatorInWindow: 2, diversityWindow: 5, maxAnonymousInWindow: 2, pageSize: 20,
};
const base: ScoreInput = { ageHours: 0, isFriend: false, isAnonymous: false, n: 0, stageTag: null, viewerStages: [] };
const score = (u: Partial<ScoreInput>, cfg = V1) => scorePost(cfg, { ...base, ...u });
const ID = '123e4567-e89b-42d3-a456-426614174000';
const cur = { asOf: '2026-10-18T10:00:00.120000Z', configVersion: 1, tier: 0 as const, score: 0.75, createdAt: '2026-10-18T09:00:00.000000Z', id: ID };

describe('score [F3.2-a1 c3 c4]', () => {
  it('freshness halves per half-life; a Friend adds wFriend; anonymous Friend term is 0', () => {
    expect(score({ ageHours: 0 })).toBeCloseTo(1, 12);
    expect(score({ ageHours: 24 })).toBeCloseTo(0.5, 12);
    expect(score({ isFriend: true })).toBeCloseTo(1.5, 12);
    expect(score({ isFriend: true, isAnonymous: true })).toBeCloseTo(1, 12);
  });
  it('quality is capped: n=20 equals n=200, n=0 adds nothing, n=3 follows ln(1+n)/ln(1+cap)', () => {
    expect(score({ n: 20 })).toBeCloseTo(score({ n: 200 }), 12);
    expect(score({ n: 20 })).toBeCloseTo(1.2, 12);
    expect(score({ n: 3 })).toBeCloseTo(1 + (0.2 * Math.log(4)) / Math.log(21), 12);
  });
  it('stage is a signal: wStage 0 ignores tags; wStage 1 adds 1 only for a tag in the viewer set', () => {
    const on = { ...V1, wStage: 1 };
    const viewerStages = ['pregnant'] as const;
    expect(score({ stageTag: 'pregnant', viewerStages })).toBe(score({ stageTag: 'has_child', viewerStages }));
    expect(score({ stageTag: 'pregnant', viewerStages })).toBe(score({ viewerStages }));
    expect(score({ stageTag: 'pregnant', viewerStages }, on)).toBeCloseTo(2, 12);
    expect(score({ stageTag: 'has_child', viewerStages }, on)).toBeCloseTo(1, 12);
    expect(score({ viewerStages }, on)).toBeCloseTo(1, 12);
    expect(score({ stageTag: 'pregnant' }, on)).toBeCloseTo(1, 12);
  });
  it('tier boundary: exactly 14 days is tier 0, past it tier 1 with score 0', () => {
    expect(rankTier(V1, 14 * 24)).toBe(0);
    expect(rankTier(V1, 14 * 24 + 1 / 3600)).toBe(1);
    expect(score({ ageHours: 14 * 24 + 1, isFriend: true, n: 50 })).toBe(0);
  });
});

describe('config [F3.2-a1 c10]', () => {
  const row = (version: number, over: Record<string, unknown> = {}, isActive = false) => ({ version, isActive, values: { ...V1, ...over } });
  it('ranges: pageSize 5..50 only; v1 valid', () => {
    expect(feedConfigValues.safeParse(V1).success).toBe(true);
    for (const p of [5, 50]) expect(feedConfigValues.safeParse({ ...V1, pageSize: p }).success).toBe(true);
    for (const p of [4, 51, 20.5]) expect(feedConfigValues.safeParse({ ...V1, pageSize: p }).success).toBe(false);
  });
  it('built-in version 0 is pure recency with the v1 caps and page size', () => {
    expect(FEED_FALLBACK_CONFIG).toMatchObject({ wFresh: 1, wFriend: 0, wQuality: 0, wStage: 0, maxSameCreatorInWindow: 2, diversityWindow: 5, maxAnonymousInWindow: 2, pageSize: 20 });
  });
  it('seeded v1 active -> configVersion 1', () => {
    expect(resolveFeedConfig([row(1, {}, true)], null)).toMatchObject({ configVersion: 1, restarted: false, fallback: null });
  });
  it('no active row -> highest valid version', () => {
    const r = resolveFeedConfig([row(1), row(2), row(3, { pageSize: 1 })], null);
    expect(r.configVersion).toBe(2);
  });
  it('active fails Zod -> highest valid below the active one; the log holds version and error class only', () => {
    const r = resolveFeedConfig([row(1), row(2), row(3, { wFresh: 99 }, true), row(4)], null);
    expect(r.configVersion).toBe(2);
    expect(Object.keys(r.fallback ?? {}).sort()).toEqual(['configVersion', 'errorClass']);
    expect(r.fallback?.configVersion).toBe(2);
    expect(JSON.stringify(r.fallback)).not.toContain('99');
  });
  it('none valid -> built-in 0', () => {
    const r = resolveFeedConfig([row(1, { pageSize: 0 }, true)], null);
    expect(r.configVersion).toBe(0);
    expect(r.config).toEqual(FEED_FALLBACK_CONFIG);
    expect(resolveFeedConfig([], null).configVersion).toBe(0);
  });
  it('pinned version: valid is kept while a newer one is active; missing or invalid restarts', () => {
    const rows = [row(1), row(2, { halfLifeHours: 0 }), row(3, {}, true)];
    expect(resolveFeedConfig(rows, 1)).toMatchObject({ configVersion: 1, restarted: false });
    expect(resolveFeedConfig(rows, 2)).toMatchObject({ configVersion: 3, restarted: true });
    expect(resolveFeedConfig(rows, 9)).toMatchObject({ configVersion: 3, restarted: true });
    expect(resolveFeedConfig(rows, 9).fallback).not.toBeNull();
  });
});

describe('cursor [F3.2-a1 c6]', () => {
  it('round-trips with microseconds 000000 and 120000 unchanged (text, never a Date)', () => {
    const out = parseFeedCursor(serializeFeedCursor(cur));
    expect(out).toEqual(cur);
    expect(out?.asOf).toBe('2026-10-18T10:00:00.120000Z');
    expect(out?.createdAt).toBe('2026-10-18T09:00:00.000000Z');
  });
  it.each([
    ['3 fractional digits', { asOf: '2026-10-18T10:00:00.120Z' }],
    ['7 fractional digits', { createdAt: '2026-10-18T09:00:00.0000000Z' }],
    ['no zone', { asOf: '2026-10-18T10:00:00.120000' }],
    ['score as string', { score: '0.75' }],
    ['score NaN', { score: Number.NaN }],
    ['score Infinity', { score: Number.POSITIVE_INFINITY }],
    ['configVersion -1', { configVersion: -1 }],
    ['configVersion 1.5', { configVersion: 1.5 }],
    ['tier 2', { tier: 2 }],
    ['non-uuid id', { id: 'abc' }],
    ['extra key', { extra: 1 }],
  ])('rejects %s', (_n, patch) => {
    expect(feedCursor.safeParse({ ...cur, ...patch }).success).toBe(false);
  });
  it.each([
    ['2026-02-29 (not a leap year)', '2026-02-29T10:00:00.000000Z'],
    ['month 13', '2026-13-01T10:00:00.000000Z'],
    ['day 00', '2026-10-00T10:00:00.000000Z'],
    ['T24:00:00', '2026-10-18T24:00:00.000000Z'],
    ['second 60', '2026-10-18T10:00:60.000000Z'],
  ])('rejects the impossible timestamp %s in both fields', (_n, ts) => {
    expect(feedCursor.safeParse({ ...cur, asOf: ts }).success).toBe(false);
    expect(feedCursor.safeParse({ ...cur, createdAt: ts }).success).toBe(false);
  });
  it('accepts a real leap day, 2028-02-29', () => {
    expect(feedCursor.safeParse({ ...cur, asOf: '2028-02-29T10:00:00.000000Z' }).success).toBe(true);
  });
  it('cursor text longer than 512 characters parses to null', () => {
    expect(parseFeedCursor('A'.repeat(513))).toBeNull();
    expect(parseFeedCursor('A'.repeat(5000))).toBeNull();
  });
  it('accepts configVersion 0 and tier 1; a missing key and non-objects fail', () => {
    expect(feedCursor.safeParse({ ...cur, configVersion: 0, tier: 1 }).success).toBe(true);
    expect(feedCursor.safeParse({ ...cur, score: undefined }).success).toBe(false);
    for (const v of [null, 'x', 5, []]) expect(feedCursor.safeParse(v).success).toBe(false);
  });
  it('the client text: malformed and non-text cursors parse to null; version 0 survives', () => {
    for (const t of ['', '!!!', 'not-json', 'eA', undefined, 5, null]) expect(parseFeedCursor(t)).toBeNull();
    expect(parseFeedCursor(serializeFeedCursor({ ...cur, configVersion: 0 }))?.configVersion).toBe(0);
  });
});

// A ranked unit; authorId null = anonymous (its own creator).
const u = (id: string, authorId: string | null, sharedPostId: string | null = null) => ({ id, authorId, isAnonymous: authorId === null, sharedPostId });
const page = (ranked: ReturnType<typeof u>[], over: Partial<FeedConfig> = {}, pageSize = 5) =>
  selectFeedPage(ranked, { ...V1, pageSize, ...over });
const ids = (p: ReturnType<typeof page>) => p.units.map((i) => i.id);

describe('re-ranking [F3.2-a1 c8]', () => {
  it('satisfiable: displaced down, never out; deterministic', () => {
    const r = [u('A1', 'A'), u('A2', 'A'), u('A3', 'A'), u('B1', 'B'), u('C1', 'C')];
    expect(ids(page(r))).toEqual(['A1', 'A2', 'B1', 'C1', 'A3']);
    expect(ids(page(r))).toEqual(ids(page(r)));
  });
  it('impossible caps (one creator): order unchanged, none lost', () => {
    const r = ['1', '2', '3', '4', '5'].map((i) => u(`A${i}`, 'A'));
    expect(ids(page(r))).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
  });
  it('anonymous cap per window; each anonymous unit is its own creator', () => {
    const r = [u('a1', null), u('a2', null), u('a3', null), u('n1', 'N1'), u('n2', 'N2'), u('n3', 'N3')];
    expect(ids(page(r, {}, 6))).toEqual(['a1', 'a2', 'n1', 'n2', 'n3', 'a3']);
    const mixed = [u('a1', null), u('a2', null), u('n1', 'N1')];
    expect(ids(page(mixed, { maxSameCreatorInWindow: 1, diversityWindow: 3, maxAnonymousInWindow: 3 }))).toEqual(['a1', 'a2', 'n1']);
  });
  it('shares of one original (and the original) are one group: first-ranked kept, rest suppressed', () => {
    expect(ids(page([u('S1', 'X', 'O'), u('S2', 'Y', 'O')]))).toEqual(['S1']);
    expect(ids(page([u('S1', 'X', 'O'), u('P', 'Z'), u('O', 'W'), u('S2', 'Y', 'O')]))).toEqual(['S1', 'P']);
    expect(ids(page([u('O', 'W'), u('S1', 'X', 'O')]))).toEqual(['O']);
  });
});

describe('nextCursor source [F3.2-a1 c9]', () => {
  it('is the last ranked unit of the page even when displaced to mid-page', () => {
    const r = [u('A1', 'A'), u('A2', 'A'), u('A3', 'A'), u('A4', 'A'), u('B1', 'B'), u('Z', 'Z')];
    const p = page(r);
    expect(ids(p)).toEqual(['A1', 'A2', 'B1', 'A3', 'A4']);
    expect(p.cursorFrom?.id).toBe('B1');
  });
  it('is the last ranked unit even when that unit is suppressed', () => {
    const r = [u('S1', 'X', 'O'), u('P', 'P'), u('Q', 'Q'), u('R', 'R'), u('S2', 'Y', 'O'), u('Z', 'Z')];
    const p = page(r);
    expect(ids(p)).toEqual(['S1', 'P', 'Q', 'R']);
    expect(p.cursorFrom?.id).toBe('S2');
  });
  it('is null when nothing beyond the page was fetched; empty set gives empty page', () => {
    expect(page([u('A', 'A'), u('B', 'B')]).cursorFrom).toBeNull();
    expect(page([u('1', 'A'), u('2', 'B'), u('3', 'C'), u('4', 'D'), u('5', 'E')]).cursorFrom).toBeNull();
    expect(page([])).toEqual({ units: [], cursorFrom: null });
  });
});

describe('response [F3.2-a1 c12]', () => {
  const post = { id: ID, kind: 'post', source: 'organic', body: 'x', audience: 'everyone', stageTag: null, createdAt: '2026-10-18T09:00:00.000Z', isMine: false, isAnonymous: false, author: { name: 'Dana Levi' }, likeCount: 0, commentCount: 0, likedByMe: false };
  const ok = (v: unknown) => feedUnit.safeParse(v).success;
  const share = { ...post, kind: 'share', body: null, sharerText: 'hi' };
  const orig = { available: true, id: ID, body: 'o', audience: 'everyone', createdAt: post.createdAt, isAnonymous: false, isMine: false, author: { name: null } }; // F3.5 c7 amends F3.2 c12: original.isMine
  it('accepts named (name or null), anonymous without author, shares with available/unavailable original', () => {
    expect(ok(post)).toBe(true);
    expect(ok({ ...post, author: { name: null } })).toBe(true);
    expect(ok({ id: ID, kind: 'post', source: 'organic', body: 'x', audience: 'everyone', stageTag: null, createdAt: post.createdAt, isMine: false, isAnonymous: true, likeCount: 0, commentCount: 0, likedByMe: false })).toBe(true);
    expect(ok({ ...share, original: orig })).toBe(true);
    expect(ok({ ...share, original: { ...orig, author: { name: 'N' } } })).toBe(true);
    expect(ok({ ...share, original: { ...orig, isAnonymous: true, author: undefined } })).toBe(false);
    expect(ok({ ...share, original: { available: false } })).toBe(true);
    expect(ok({ ...share, original: { ...orig, isMine: true } })).toBe(true); // F3.5 c7
    expect(ok({ ...share, original: { ...orig, isMine: undefined } })).toBe(false); // F3.5 c7: the available original always says whose it is
    expect(ok({ ...share, original: { available: false, isMine: false } })).toBe(false); // an unavailable original holds nothing
  });
  it.each([
    ['authorId', { authorId: ID }],
    ['score', { score: 1 }],
    ['tier', { tier: 0 }],
    ['isFriend', { isFriend: true }],
    ['n', { n: 3 }],
    ['a liker identity', { userId: ID }],
    ['a negative count', { likeCount: -1 }],
    ['source other than organic', { source: 'paid' }],
    ['an anonymous unit carrying an author key', { isAnonymous: true }],
  ])('rejects %s', (_n, patch) => {
    expect(ok({ ...post, ...patch })).toBe(false);
  });
  it('rejects an anonymous unit without author that isMine; an anonymous share is rejected', () => {
    const anonPost = { id: ID, kind: 'post', source: 'organic', body: 'x', audience: 'everyone', stageTag: null, createdAt: post.createdAt, isMine: false, likeCount: 0, commentCount: 0, likedByMe: false };
    expect(ok({ ...anonPost, isAnonymous: true })).toBe(true);
    expect(ok({ ...anonPost, isAnonymous: true, isMine: true })).toBe(false);
    const anonShare = { ...anonPost, kind: 'share', body: null, sharerText: 'hi' };
    expect(ok({ ...anonShare, isAnonymous: true, original: { available: false } })).toBe(false);
  });
  it('rejects extra content on an unavailable original, share fields on a post', () => {
    expect(ok({ ...share, original: { available: false, body: 'leak' } })).toBe(false);
    expect(ok({ ...share, original: { ...orig, isAnonymous: true, author: { name: 'N' } } })).toBe(false);
    expect(ok({ ...post, sharerText: 'no share fields on a post' })).toBe(false);
  });
  it('page envelope is strict and carries configVersion', () => {
    expect(feedPageResponse.safeParse({ items: [], nextCursor: null, configVersion: 0 }).success).toBe(true);
    expect(feedPageResponse.safeParse({ items: [], nextCursor: null, configVersion: 0, total: 3 }).success).toBe(false);
    expect(feedPageResponse.safeParse({ items: [], nextCursor: null }).success).toBe(false);
  });
});
