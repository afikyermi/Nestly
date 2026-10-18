// F3.2-a1: pure ranking core. Expected values come from spec.md c4/c6/c8-c10/c12 and I3-algorithm.md only.
// API ASSUMED (BUILDER had not landed any source when written; align names in this import block only):
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_FEED_CONFIG,
  assembleFeedPage,
  feedConfigSchema,
  feedCursorSchema,
  feedItemSchema,
  feedTier,
  resolveFeedConfig,
  scoreFeedUnit,
} from '../src/index.js';

const V1 = {
  wFresh: 1, halfLifeHours: 24, wFriend: 0.5, wQuality: 0.2, qualityCap: 20, wStage: 0,
  scoredWindowDays: 14, maxSameCreatorInWindow: 2, diversityWindow: 5, maxAnonymousInWindow: 2, pageSize: 20,
};
const base = { ageHours: 0, isFriend: false, isAnonymous: false, n: 0, stageTag: null as string | null };
const score = (u: Partial<typeof base>, cfg = V1, stages: string[] = []) => scoreFeedUnit(cfg, { ...base, ...u }, stages);
const ID = '123e4567-e89b-42d3-a456-426614174000';
const cur = { asOf: '2026-10-18T10:00:00.120000Z', configVersion: 1, tier: 0, score: 0.75, createdAt: '2026-10-18T09:00:00.000000Z', id: ID };

describe('score [F3.2-a1 c4 c3]', () => {
  it('freshness halves per half-life; a Friend adds wFriend; anonymous Friend term is 0', () => {
    expect(score({ ageHours: 0 })).toBeCloseTo(1, 12);
    expect(score({ ageHours: 24 })).toBeCloseTo(0.5, 12);
    expect(score({ ageHours: 0, isFriend: true })).toBeCloseTo(1.5, 12);
    expect(score({ ageHours: 0, isFriend: true, isAnonymous: true })).toBeCloseTo(1, 12);
  });
  it('quality is capped: n=20 equals n=200, n=0 adds nothing, n=3 follows ln(1+n)/ln(1+cap)', () => {
    expect(score({ n: 20 })).toBeCloseTo(score({ n: 200 }), 12);
    expect(score({ n: 20 })).toBeCloseTo(1.2, 12);
    expect(score({ n: 3 })).toBeCloseTo(1 + (0.2 * Math.log(4)) / Math.log(21), 12);
  });
  it('stage is a signal: wStage 0 ignores tags; wStage 1 adds 1 only for a tag in the viewer set', () => {
    const on = { ...V1, wStage: 1 };
    const stages = ['pregnant'];
    expect(score({ stageTag: 'pregnant' }, V1, stages)).toBe(score({ stageTag: 'has_child' }, V1, stages));
    expect(score({ stageTag: 'pregnant' }, V1, stages)).toBe(score({}, V1, stages));
    expect(score({ stageTag: 'pregnant' }, on, stages)).toBeCloseTo(2, 12);
    expect(score({ stageTag: 'has_child' }, on, stages)).toBeCloseTo(1, 12);
    expect(score({}, on, stages)).toBeCloseTo(1, 12);
    expect(score({ stageTag: 'pregnant' }, on, [])).toBeCloseTo(1, 12);
  });
  it('tier boundary: exactly 14 days is tier 0, past it tier 1 with score 0', () => {
    expect(feedTier(V1, 14 * 24)).toBe(0);
    expect(feedTier(V1, 14 * 24 + 1 / 3600)).toBe(1);
    expect(score({ ageHours: 14 * 24 + 1, isFriend: true, n: 50 })).toBe(0);
  });
});

describe('config [F3.2-a1 c10]', () => {
  const row = (version: number, over: Record<string, unknown> = {}) => ({ version, config: { ...V1, ...over } });
  it('ranges: pageSize 5..50 only; v1 valid', () => {
    expect(feedConfigSchema.safeParse(V1).success).toBe(true);
    for (const p of [5, 50]) expect(feedConfigSchema.safeParse({ ...V1, pageSize: p }).success).toBe(true);
    for (const p of [4, 51, 20.5]) expect(feedConfigSchema.safeParse({ ...V1, pageSize: p }).success).toBe(false);
  });
  it('built-in version 0 is pure recency with the v1 caps and page size', () => {
    expect(FALLBACK_FEED_CONFIG).toMatchObject({ wFresh: 1, wFriend: 0, wQuality: 0, wStage: 0, maxSameCreatorInWindow: 2, diversityWindow: 5, maxAnonymousInWindow: 2, pageSize: 20 });
  });
  it('seeded v1 active -> configVersion 1', () => {
    const r = resolveFeedConfig({ rows: [row(1)], activeVersion: 1, pinnedVersion: null });
    expect(r).toMatchObject({ configVersion: 1, restarted: false });
  });
  it('no active row -> highest valid version', () => {
    const r = resolveFeedConfig({ rows: [row(1), row(2), row(3, { pageSize: 1 })], activeVersion: null, pinnedVersion: null });
    expect(r.configVersion).toBe(2);
  });
  it('active fails Zod -> highest valid below the active one; the log holds version + error class only', () => {
    const r = resolveFeedConfig({ rows: [row(1), row(2), row(3, { wFresh: 99 }), row(4)], activeVersion: 3, pinnedVersion: null });
    expect(r.configVersion).toBe(2);
    expect(r.fallbackLog).toEqual({ version: 3, errorClass: expect.any(String) });
    expect(JSON.stringify(r.fallbackLog)).not.toContain('99');
  });
  it('none valid -> built-in 0', () => {
    const r = resolveFeedConfig({ rows: [row(1, { pageSize: 0 })], activeVersion: 1, pinnedVersion: null });
    expect(r.configVersion).toBe(0);
    expect(r.config).toEqual(FALLBACK_FEED_CONFIG);
    expect(resolveFeedConfig({ rows: [], activeVersion: null, pinnedVersion: null }).configVersion).toBe(0);
  });
  it('pinned version: valid is kept while a newer one is active; missing or invalid restarts', () => {
    const rows = [row(1), row(2, { halfLifeHours: 0 }), row(3)];
    expect(resolveFeedConfig({ rows, activeVersion: 3, pinnedVersion: 1 })).toMatchObject({ configVersion: 1, restarted: false });
    expect(resolveFeedConfig({ rows, activeVersion: 3, pinnedVersion: 2 })).toMatchObject({ configVersion: 3, restarted: true });
    expect(resolveFeedConfig({ rows, activeVersion: 3, pinnedVersion: 9 })).toMatchObject({ configVersion: 3, restarted: true });
  });
});

describe('cursor [F3.2-a1 c6]', () => {
  it('round-trips with microseconds 000000 and 120000 unchanged (text, never a Date)', () => {
    const out = feedCursorSchema.parse(JSON.parse(JSON.stringify(cur)));
    expect(out).toEqual(cur);
    expect(out.asOf).toBe('2026-10-18T10:00:00.120000Z');
    expect(out.createdAt).toBe('2026-10-18T09:00:00.000000Z');
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
    expect(feedCursorSchema.safeParse({ ...cur, ...patch }).success).toBe(false);
  });
  it('accepts configVersion 0 and tier 1; rejects a missing key and non-objects', () => {
    expect(feedCursorSchema.safeParse({ ...cur, configVersion: 0, tier: 1 }).success).toBe(true);
    const noScore = { ...cur, score: undefined };
    expect(feedCursorSchema.safeParse(noScore).success).toBe(false);
    for (const v of [null, 'x', 5, []]) expect(feedCursorSchema.safeParse(v).success).toBe(false);
  });
});

// A ranked unit; creator null = anonymous (its own creator).
const u = (id: string, creator: string | null, sharedPostId: string | null = null) => ({
  id, creatorId: creator, isAnonymous: creator === null, sharedPostId,
  tier: 0, score: 1, createdAt: '2026-10-18T09:00:00.000000Z',
});
const page = (ranked: ReturnType<typeof u>[], over: Record<string, unknown> = {}, pageSize = 5) =>
  assembleFeedPage({ ranked, config: { ...V1, pageSize, ...over }, asOf: cur.asOf, configVersion: 1 });
const ids = (p: ReturnType<typeof page>) => p.items.map((i) => i.id);

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
    const own = [u('a1', null), u('a2', null), u('a3', null)];
    expect(ids(page(own, { maxSameCreatorInWindow: 1, diversityWindow: 3, maxAnonymousInWindow: 3 }, 5))).toEqual(['a1', 'a2', 'a3']);
  });
  it('shares of one original (and the original) are one group: first-ranked kept, rest suppressed', () => {
    expect(ids(page([u('S1', 'X', 'O'), u('S2', 'Y', 'O')]))).toEqual(['S1']);
    expect(ids(page([u('S1', 'X', 'O'), u('P', 'Z'), u('O', 'W'), u('S2', 'Y', 'O')]))).toEqual(['S1', 'P']);
    expect(ids(page([u('O', 'W'), u('S1', 'X', 'O')]))).toEqual(['O']);
  });
});

describe('nextCursor [F3.2-a1 c9]', () => {
  it('is the last ranked unit of the page even when displaced to mid-page', () => {
    const r = [u('A1', 'A'), u('A2', 'A'), u('A3', 'A'), u('A4', 'A'), u('B1', 'B'), u('Z', 'Z')];
    const p = page(r);
    expect(ids(p)).toEqual(['A1', 'A2', 'B1', 'A3', 'A4']);
    expect(p.nextCursor).toMatchObject({ id: 'B1', asOf: cur.asOf, configVersion: 1 });
  });
  it('is the last ranked unit even when that unit is suppressed', () => {
    const r = [u('S1', 'X', 'O'), u('P', 'P'), u('Q', 'Q'), u('R', 'R'), u('S2', 'Y', 'O'), u('Z', 'Z')];
    const p = page(r);
    expect(ids(p)).toEqual(['S1', 'P', 'Q', 'R']);
    expect(p.nextCursor?.id).toBe('S2');
  });
  it('is null when nothing beyond the page was fetched; empty set gives empty items', () => {
    expect(page([u('A', 'A'), u('B', 'B')]).nextCursor).toBeNull();
    expect(page([])).toMatchObject({ items: [], nextCursor: null });
  });
});

describe('response item [F3.2-a1 c12]', () => {
  const post = { id: ID, kind: 'post', source: 'organic', body: 'x', audience: 'everyone', stageTag: null, createdAt: cur.createdAt, isMine: false, isAnonymous: false, author: { name: 'Dana Levi' } };
  const ok = (v: unknown) => feedItemSchema.safeParse(v).success;
  const share = { ...post, kind: 'share', sharerText: 'hi' };
  const orig = { available: true, id: ID, body: 'o', audience: 'everyone', createdAt: cur.createdAt, isAnonymous: true };
  it('accepts named (name or null), anonymous without author, shares with available/unavailable original', () => {
    expect(ok(post)).toBe(true);
    expect(ok({ ...post, author: { name: null } })).toBe(true);
    const anon = { ...post, isAnonymous: true, author: undefined };
    expect(ok(anon)).toBe(true);
    expect(ok({ ...share, original: orig })).toBe(true);
    expect(ok({ ...share, original: { ...orig, isAnonymous: false, author: { name: null } } })).toBe(true);
    expect(ok({ ...share, original: { available: false } })).toBe(true);
  });
  it.each([
    ['authorId', { authorId: ID }],
    ['score', { score: 1 }],
    ['tier', { tier: 0 }],
    ['isFriend', { isFriend: true }],
    ['a count', { likeCount: 3 }],
    ['source other than organic', { source: 'paid' }],
    ['an anonymous unit carrying author', { isAnonymous: true }],
  ])('rejects %s', (_n, patch) => {
    expect(ok({ ...post, ...patch })).toBe(false);
  });
  it('rejects extra content on an unavailable original, author on an anonymous original, share fields on a post', () => {
    expect(ok({ ...share, original: { available: false, body: 'leak' } })).toBe(false);
    expect(ok({ ...share, original: { ...orig, author: { name: 'N' } } })).toBe(false);
    expect(ok({ ...post, sharerText: 'no share fields on a post' })).toBe(false);
  });
});
