import { appendFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FEED_GROUP_SUGGESTIONS,
  feedPageResponse,
  groupDetail,
  resolveFeedConfig,
  selectFeedPage,
  serializeFeedCursor,
  TOPIC_RULES,
  topicPatternSource,
  type FeedCursor,
  type FeedPageResponse,
  type FeedUnit,
  parseFeedCursor,
} from '@nestly/shared';
import type { Database } from '../../src/db/client.js';
import { createDatabase } from '../../src/db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../../src/db/identity-transaction.js';
import { readOwnAccounts } from '../../src/repositories/account-state-repository.js';
import { readDisplayPosts, readFeedConfigRows, readRankedPosts, readSnapshotClock, type RankingParameters } from '../../src/repositories/feed-repository.js';
import { readFeedGroupSuggestions } from '../../src/repositories/group-activity-repository.js';
import { readMutedGroupIds } from '../../src/repositories/group-rules-repository.js';
import { readOwnStages } from '../../src/repositories/journeys-repository.js';
import { readCommentCounts, readLikeCounts, readLikedTargetIds } from '../../src/repositories/likes-repository.js';
import type { PostImageRow } from '../../src/repositories/media-repository.js';
import { readProfessionalAuthors } from '../../src/repositories/promotions-repository.js';
import { readOwnTopicWeights, recordTopics } from '../../src/repositories/search-repository.js';
import { readPublishedAnnouncements } from '../../src/repositories/team-repository.js';
import { FeedFault, rankingProfileOf, readFeedPageIn, readsViewerStages, unitOf, type FeedOutcome } from '../../src/services/feed-service.js';
import { readPostImageRows, createPost } from '../../src/services/posts-service.js';
import { promotedPosts } from '../../src/services/promoted-units.js';
import { registerProfessional } from '../../src/services/professionals-service.js';
import { buyPromotion } from '../../src/services/promotions-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';
import { statementCountingDatabase } from '../helpers/statement-count.js';

// Performance plan ט'1 (no migration, no change in what anyone sees): a feed page reads the caller's account, the clock and the float
// precision in one statement, and a post's two displayed counts in one statement (organic and promoted); the promoted path does not read the
// account type again. This file proves the page is the same, item by item and in order, as the path before the change,
// kept here frozen (`frozenReadPage`, a copy of feed-service.ts's readPage at main 8326faa), on varied data: Friends, a Friends-only post,
// anonymous posts, a share, a blocked author, likes and comments (and a reply) from several accounts, the viewer's own likes, a Public and a
// Private Group's Highlights with the viewer muted in one, a promoted post, a Regular, a Professional and a staff reviewer, pages 1 to 3.
// Both paths run inside one REPEATABLE READ identity transaction, so they read the same snapshot; and the statements of each are counted.

const T = { timeout: COLD_START_MS * 2 };
/** A measurement line: to FEED_MEASURE_OUT when set (a local run, performance plan ט'1), else nowhere. */
const report = (line: string): void => {
  const out = process.env.FEED_MEASURE_OUT;
  if (out !== undefined && out !== '') appendFileSync(out, `${line}
`);
};

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let counting: ReturnType<typeof statementCountingDatabase> | undefined;
const tag = `ft${Date.now().toString(36)}`;
let viewer = '';
let pro = '';
let staff = '';

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const as = (userId: string) => ({ userId });
const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, who: string, payload?: Record<string, unknown>) =>
  app.inject({ method, url: path, headers: { authorization: `Bearer ${await token({ key, sub: who })}` }, ...(payload === undefined ? {} : { payload }) });
const expectOk = async (res: Promise<{ statusCode: number; body: string }>): Promise<string> => {
  const done = await res;
  if (done.statusCode >= 300) throw new Error(`${done.statusCode} ${done.body}`);
  return done.body;
};
const idOf = (body: string): string => String(Reflect.get(Object(JSON.parse(body)), 'id'));
const sideTx = async (work: (tx: postgres.TransactionSql) => Promise<unknown>): Promise<void> => {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
};
const seedPost = async (by: string, over: { aud?: 'everyone' | 'friends'; anon?: boolean; body?: string; shared?: string } = {}): Promise<string> => {
  let id = '';
  await sideTx(async (tx) => {
    id = await text(tx`select tests.fx_po_add(${by}::uuid, ${over.aud ?? 'everyone'}, ${over.anon ?? false}, 'active', ${over.body ?? `post ${tag}`}, null::text, ${over.shared ?? null}::uuid)::text as v`);
  });
  return id;
};
const like = (who: string, postId: string) => expectOk(call('PUT', `/api/posts/${postId}/like`, who));
const commentOn = async (who: string, postId: string, parentId?: string): Promise<string> =>
  String(Reflect.get(Object(Reflect.get(Object(JSON.parse(await expectOk(call('POST', `/api/posts/${postId}/comments`, who, { body: 'תגובה', ...(parentId === undefined ? {} : { parentId }) })))), 'comment')), 'id'));

// ---- the path before the change, frozen (feed-service.ts readPage and classifyViewer at main 8326faa) -------------------------------------

async function frozenClassifyViewer(tx: IdentityTx) {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new FeedFault('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' } as const;
  if (account.status !== 'active') return { kind: 'stopped' } as const;
  const profile = rankingProfileOf(account.accountType);
  if (profile === null) return { kind: 'viewer', profile: 'content', review: true } as const;
  return { kind: 'viewer', profile } as const;
}

async function frozenReadIntents(tx: IdentityTx, asOf: string, halfLifeHours: number): Promise<{ pattern: string; weight: number }[]> {
  return (await readOwnTopicWeights(tx, asOf, halfLifeHours)).flatMap(({ topic, weight }) =>
    TOPIC_RULES[topic] === undefined || weight <= 0 ? [] : [{ pattern: topicPatternSource(topic), weight }],
  );
}

async function frozenReadPage(tx: IdentityTx, viewerId: string, cursor: FeedCursor | null, imageRows: PostImageRow[], professionalAuthors: { id: string; posts: number }[]): Promise<FeedOutcome> {
  const viewer = await frozenClassifyViewer(tx);
  if (viewer.kind !== 'viewer') return viewer;
  const clock = await readSnapshotClock(tx, cursor === null ? null : cursor.asOf);
  if (!clock.isCursorUsable) return { kind: 'cursor_invalid' };
  const resolution = resolveFeedConfig(await readFeedConfigRows(tx), cursor === null ? null : cursor.configVersion);
  const { config, configVersion } = resolution;
  const after = cursor !== null && !resolution.restarted ? cursor : null;
  const asOf = after === null ? clock.nowText : after.asOf;
  const parameters: RankingParameters =
    viewer.profile === 'regular'
      ? {
          profile: 'regular',
          asOf,
          config,
          after,
          stages: readsViewerStages(viewer.profile, config.wStage) ? await readOwnStages(tx) : [],
          intents: config.wIntent > 0 ? await frozenReadIntents(tx, asOf, config.intentHalfLifeHours) : [],
        }
      : 'review' in viewer
        ? { profile: 'content', asOf, config, after }
        : { profile: 'content', asOf, config, after, viewerId };
  const ranked = await readRankedPosts(tx, parameters);
  const selection = selectFeedPage(ranked, config);
  const pageIds = selection.units.map((unit) => unit.id);
  const display = new Map((await readDisplayPosts(tx, pageIds)).map((row) => [row.id, row]));
  const likeCounts = await readLikeCounts(tx, 'post', pageIds);
  const commentCounts = await readCommentCounts(tx, pageIds);
  const liked = await readLikedTargetIds(tx, pageIds);
  imageRows.push(...(await readPostImageRows(tx, undefined, pageIds)));
  const mutedGroups = await readMutedGroupIds(tx, [...new Set([...display.values()].flatMap((row) => (row.groupId === null ? [] : [row.groupId])))]);
  const items: FeedUnit[] = [];
  for (const unit of selection.units) {
    const row = display.get(unit.id);
    const reactions = { likeCount: likeCounts.get(unit.id) ?? 0, commentCount: commentCounts.get(unit.id) ?? 0, likedByMe: liked.has(unit.id) };
    const item = row === undefined ? undefined : unitOf(row, reactions, true, mutedGroups);
    if (item !== undefined) items.push(item);
  }
  const last = selection.cursorFrom;
  const nextCursor = last === null ? null : serializeFeedCursor({ asOf, configVersion, tier: last.tier, score: last.score, createdAt: last.createdAt, id: last.id });
  const review = 'review' in viewer;
  const promoted: { promotionId: string; afterIndex: number; unit: FeedUnit }[] = [];
  if (!review) {
    const intents = parameters.profile === 'regular' && (parameters.intents?.length ?? 0) > 0 ? (parameters.intents ?? []) : await frozenReadIntents(tx, asOf, config.intentHalfLifeHours);
    const slots = await promotedPosts(tx, intents.map((intent) => intent.pattern), new Set(pageIds), items.length, after !== null);
    if (slots.length > 0) {
      const ids = slots.map((slot) => slot.postId);
      const promotedRows = new Map((await readDisplayPosts(tx, ids)).map((row) => [row.id, row]));
      const promotedLikes = await readLikeCounts(tx, 'post', ids);
      const promotedComments = await readCommentCounts(tx, ids);
      const promotedLiked = await readLikedTargetIds(tx, ids);
      imageRows.push(...(await readPostImageRows(tx, undefined, ids)));
      for (const slot of slots) {
        const row = promotedRows.get(slot.postId);
        const unit =
          row === undefined
            ? undefined
            : unitOf(row, { likeCount: promotedLikes.get(slot.postId) ?? 0, commentCount: promotedComments.get(slot.postId) ?? 0, likedByMe: promotedLiked.has(slot.postId) });
        if (unit !== undefined) promoted.push({ promotionId: slot.promotionId, afterIndex: slot.afterIndex, unit: { ...unit, source: 'promoted' } });
      }
    }
  }
  if (!review) professionalAuthors.push(...(await readProfessionalAuthors(tx, pageIds)));
  const announcements = after === null ? await readPublishedAnnouncements(tx) : [];
  const suggestedGroups = after === null && !review ? await readFeedGroupSuggestions(tx, FEED_GROUP_SUGGESTIONS) : [];
  const page = feedPageResponse.parse({
    items,
    nextCursor,
    configVersion,
    ...(resolution.restarted ? { restarted: true } : {}),
    ...(announcements.length > 0 ? { announcements } : {}),
    ...(suggestedGroups.length > 0 ? { suggestedGroups } : {}),
    ...(promoted.length > 0 ? { promoted } : {}),
  });
  return { kind: 'page', page, fallback: resolution.fallback };
}


// ---------------------------------------------------------------------------------------------------------------------------------------------

interface Run {
  readonly outcome: FeedOutcome;
  readonly imageRows: PostImageRow[];
  readonly authors: { id: string; posts: number }[];
  readonly statements: number;
}

/** Both paths for `who` at `cursor`, in one REPEATABLE READ identity transaction (one snapshot): the new one first, then the frozen one. */
async function both(who: string, cursor: FeedCursor | null): Promise<{ current: Run; frozen: Run }> {
  const count = counting;
  if (count === undefined) throw new Error('no counting database');
  return inIdentityTransaction(
    count.database,
    as(who),
    async (tx) => {
      count.reset();
      const currentRows: PostImageRow[] = [];
      const currentAuthors: { id: string; posts: number }[] = [];
      const currentOutcome = await readFeedPageIn(tx, who, cursor, undefined, currentRows, currentAuthors);
      const currentCount = count.statements();
      count.reset();
      const frozenRows: PostImageRow[] = [];
      const frozenAuthors: { id: string; posts: number }[] = [];
      const frozenOutcome = await frozenReadPage(tx, who, cursor, frozenRows, frozenAuthors);
      return {
        current: { outcome: currentOutcome, imageRows: currentRows, authors: currentAuthors, statements: currentCount },
        frozen: { outcome: frozenOutcome, imageRows: frozenRows, authors: frozenAuthors, statements: count.statements() },
      };
    },
    { isolationLevel: 'repeatable read' },
  );
}

const pageOf = (outcome: FeedOutcome): FeedPageResponse => {
  if (outcome.kind !== 'page') throw new Error(`expected a page, got ${outcome.kind}`);
  return outcome.page;
};

/** Pages 1..n of `who`, each compared path to path; returns the pages (new path) and the statement counts. */
async function compareScroll(who: string, pages: number): Promise<{ pages: FeedPageResponse[]; counts: { current: number; frozen: number }[] }> {
  const out: FeedPageResponse[] = [];
  const counts: { current: number; frozen: number }[] = [];
  let cursor: FeedCursor | null = null;
  for (let i = 0; i < pages; i += 1) {
    const { current, frozen } = await both(who, cursor);
    expect(current.outcome, `page ${i + 1}`).toEqual(frozen.outcome);
    expect(current.imageRows).toEqual(frozen.imageRows);
    expect(current.authors).toEqual(frozen.authors);
    const page = pageOf(current.outcome);
    out.push(page);
    counts.push({ current: current.statements, frozen: frozen.statements });
    if (page.nextCursor === null) break;
    cursor = parseFeedCursor(page.nextCursor);
  }
  return { pages: out, counts };
}

beforeAll(async () => {
  key = await newKey('feed-statements-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  counting = statementCountingDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Vered Viewer', 'Fanny Friend', 'Gali Friend', 'Sara Stranger', 'Tova Stranger', 'Bina Blocked', 'Orna Owner', 'Miri Member', 'Nava Member']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  const [v = '', f1 = '', f2 = '', s1 = '', s2 = '', blocked = '', owner = '', m1 = '', m2 = ''] = made;
  viewer = v;
  pro = await text(side`select tests.fx_new_auth_user()::text as v`);
  expect(
    await registerProfessional(database, as(pro), {
      fullName: 'Shoshi Sleep', businessName: null, gender: 'woman', field: 'sleep', fieldOther: null, yearsExperience: 3, area: 'center', about: null, priceFrom: 200,
    }),
  ).toEqual({ kind: 'created' });
  staff = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  await sideTx(async (tx) => {
    await tx`select tests.fx_fr_add(${viewer}::uuid, ${f1}::uuid, 'accepted', false)`;
    await tx`select tests.fx_fr_add(${f2}::uuid, ${viewer}::uuid, 'accepted', false)`;
  });
  // the promoted post first (the oldest of these), so it is off the first organic pages and served as a paid slot; the viewer searched "sleep"
  const promotedPost = (await createPost(database, as(pro), { body: `שינה טובה לתינוק ${tag}`, audience: 'everyone' })).id;
  const bought = await buyPromotion(database, as(pro), { planKey: 'post_3', target: { kind: 'post', postId: promotedPost } });
  expect(bought.kind).toBe('ok');
  await inIdentityTransaction(database, as(viewer), (tx) => recordTopics(tx, ['sleep']));
  // Groups: a Public and a Private one, each with a Highlight (3 engagements by others); the viewer is muted in the Public one
  const groups: string[] = [];
  for (const [name, privacy] of [[`ציבורית ${tag}`, 'public'], [`פרטית ${tag}`, 'private']] as const) {
    const group = groupDetail.parse(JSON.parse(await expectOk(call('POST', '/api/groups', owner, { name, privacy, description: 'קבוצה לבדיקה' })))).id;
    for (const member of [viewer, m1, m2]) {
      await expectOk(call('PUT', `/api/groups/${group}/membership`, member));
      if (privacy === 'private') await expectOk(call('PUT', `/api/groups/${group}/requests/${member}`, owner, { decision: 'approve' }));
    }
    const highlight = idOf(await expectOk(call('POST', '/api/posts', owner, { body: `הדגשה ${name}`, audience: 'everyone', groupId: group })));
    await like(m1, highlight);
    await like(viewer, highlight);
    await commentOn(m2, highlight);
    const anonymous = idOf(await expectOk(call('POST', '/api/posts', m1, { body: `אנונימי ${name}`, audience: 'everyone', groupId: group, isAnonymous: true })));
    for (const who_ of [owner, m2, viewer]) await like(who_, anonymous);
    await expectOk(call('POST', '/api/posts', m2, { body: `רגיל ${name}`, audience: 'everyone', groupId: group }));
    groups.push(group);
  }
  await expectOk(call('POST', `/api/groups/${groups[0] ?? ''}/enforcements`, owner, { userId: viewer, kind: 'warn_mute', reason: 'spam', muteHours: 24 }));
  // organic posts: Friends (one for Friends only), strangers, anonymous ones, a share, a blocked author; 3+ pages for the viewer
  const authors = [f1, f2, s1, s2, owner, m1, m2];
  const organic: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    const by = authors[i % authors.length] ?? s1;
    organic.push(await seedPost(by, { aud: i % 9 === 0 && (by === f1 || by === f2) ? 'friends' : 'everyone', anon: i % 7 === 3, body: `פוסט ${i} ${tag}` }));
  }
  organic.push(await seedPost(s1, { body: `שיתוף ${tag}`, shared: organic[5] ?? '' }));
  organic.push(await seedPost(blocked, { body: `חסומה ${tag}` }));
  await expectOk(call('PUT', `/api/users/${blocked}/block`, viewer));
  // likes and comments from several accounts, the viewer's own among them, and a reply
  const likers = [viewer, f1, f2, s1, s2, m1];
  for (let i = 0; i < organic.length; i += 3) {
    const target = organic[i] ?? '';
    for (const liker of likers.slice(0, 1 + (i % likers.length))) await like(liker, target).catch(() => undefined);
    if (i % 2 === 0) {
      const first = await commentOn(f1, target).catch(() => '');
      if (first !== '' && i % 4 === 0) await commentOn(s2, target, first).catch(() => '');
    }
  }
}, COLD_START_MS * 6);

afterAll(async () => {
  await side`select tests.fx_fr_purge(${viewer}::uuid)`.catch(() => undefined);
  await app.close();
  await database.close();
  await counting?.database.close();
  await side.end({ timeout: 5 });
  await jwks.close();
  restoreEnv();
});

describe("[perf ט'1] the feed page in fewer statements is the same page", () => {
  it('[FR-FEED-001 FR-ALG-002 AC-061] a Regular viewer: pages 1-3 identical to the frozen path, item by item and in order; 4 or 5 statements fewer', T, async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5); // rankPaid's tie-break: the same draw on both paths
    try {
      const { pages, counts } = await compareScroll(viewer, 3);
      expect(pages.length, 'the data gives the viewer more than two pages').toBe(3);
      const units = pages.flatMap((page) => page.items);
      expect(units.length).toBeGreaterThan(40);
      // the data is varied as intended (so the equality is not vacuous)
      expect(units.some((unit) => unit.isAnonymous)).toBe(true);
      expect(units.some((unit) => unit.kind === 'share')).toBe(true);
      expect(units.some((unit) => unit.audience === 'friends')).toBe(true);
      expect(units.some((unit) => unit.likedByMe)).toBe(true);
      expect(units.some((unit) => unit.likeCount > 1 && unit.commentCount > 0)).toBe(true);
      expect(units.some((unit) => unit.kind === 'post' && unit.group?.muted === true), 'a Highlight of the Group the viewer is muted in').toBe(true);
      expect(units.some((unit) => unit.kind === 'post' && unit.group?.privacy === 'private')).toBe(true);
      expect(pages.some((page) => (page.promoted ?? []).length > 0), 'a promoted slot').toBe(true);
      for (const [i, page] of pages.entries()) {
        // 2 (account, clock and the float setting: one statement), 1 (the two counts: one statement), 1 (the account type of the promoted
        // path), and 1 more for the promoted card's counts when the page has one
        const saved = 4 + ((page.promoted ?? []).length > 0 ? 1 : 0);
        expect(counts[i]?.current, `page ${i + 1}: ${JSON.stringify(counts[i])}`).toBe((counts[i]?.frozen ?? 0) - saved);
      }
      report(`[perf ט'1] statements per page (regular, new vs frozen): ${JSON.stringify(counts)}`);
    } finally {
      random.mockRestore();
    }
  });

  it('[AC-061 FR-ALG-003] a Professional viewer (content profile, Follow term) and a staff reviewer: the same pages', T, async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const professional = await compareScroll(pro, 2);
      expect(professional.pages[0]?.items.length ?? 0).toBeGreaterThan(0);
      const review = await compareScroll(staff, 2);
      expect(review.pages[0]?.items.length ?? 0).toBeGreaterThan(0);
      expect(review.pages.every((page) => page.promoted === undefined)).toBe(true);
      report(`[perf ט'1] statements per page (professional, staff): ${JSON.stringify([professional.counts, review.counts])}`);
    } finally {
      random.mockRestore();
    }
  });

  it('[ERR-037 ERR-027] the refusals and a cursor from the future answer as before', T, async () => {
    const future = parseFeedCursor(serializeFeedCursor({ asOf: '2999-01-01T00:00:00.000000Z', configVersion: 1, tier: 0, score: 1, createdAt: '2999-01-01T00:00:00.000000Z', id: viewer }));
    const futureRun = await both(viewer, future);
    expect(futureRun.current.outcome).toEqual({ kind: 'cursor_invalid' });
    expect(futureRun.current.outcome).toEqual(futureRun.frozen.outcome);
    const unregistered = await text(side`select tests.fx_new_auth_user()::text as v`);
    const none = await both(unregistered, null);
    expect(none.current.outcome).toEqual({ kind: 'forbidden' });
    expect(none.current.outcome).toEqual(none.frozen.outcome);
  });

  it.runIf(process.env.FEED_MEASURE === '1')("[perf ט'1] measure: statements and db ms per page (median of 30), new vs frozen", { timeout: 600_000 }, async () => {
    const count = counting;
    if (count === undefined) throw new Error('no counting database');
    const first = await both(viewer, null);
    const second = parseFeedCursor(pageOf(first.current.outcome).nextCursor ?? '');
    const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN;
    const once = async (path: 'current' | 'frozen', cursor: FeedCursor | null): Promise<{ statements: number; ms: number }> => {
      count.reset();
      const started = performance.now();
      await inIdentityTransaction(
        count.database,
        as(viewer),
        (tx) => (path === 'current' ? readFeedPageIn(tx, viewer, cursor, undefined, [], []) : frozenReadPage(tx, viewer, cursor, [], [])),
        { isolationLevel: 'repeatable read' },
      );
      return { statements: count.statements(), ms: performance.now() - started };
    };
    // interleaved (frozen and new alternate which goes first), after one warm-up of each: the machine's drift falls on both alike
    const measure = async (cursor: FeedCursor | null) => {
      const runs: Record<'frozen' | 'current', number[]> = { frozen: [], current: [] };
      const statements = { frozen: (await once('frozen', cursor)).statements, current: (await once('current', cursor)).statements };
      for (let i = 0; i < 30; i += 1) {
        for (const path of i % 2 === 0 ? (['frozen', 'current'] as const) : (['current', 'frozen'] as const)) runs[path].push((await once(path, cursor)).ms);
      }
      const ms = (values: number[]): number => Math.round(median(values) * 10) / 10;
      return { frozen: { statements: statements.frozen, ms: ms(runs.frozen) }, current: { statements: statements.current, ms: ms(runs.current) } };
    };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const result = { page1: await measure(null), page2: await measure(second) };
      report(`[perf ט'1] measured (statements incl. the transaction's 3 opening ones; ms = whole transaction, median of 30): ${JSON.stringify(result)}`);
    } finally {
      random.mockRestore();
    }
  });
});
