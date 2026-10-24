import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFeedCursor, type FeedPageResponse, type ListingWrite, type ProfessionalProfileWrite } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { inIdentityTransaction } from '../../src/db/identity-transaction.js';
import { insertProfessionalView, readPromotionConfig } from '../../src/repositories/promotions-repository.js';
import { readProfessionalHead } from '../../src/repositories/professionals-repository.js';
import { recordTopics } from '../../src/repositories/search-repository.js';
import { readFeedPage } from '../../src/services/feed-service.js';
import { createPost } from '../../src/services/posts-service.js';
import { onPromotionSkip, type SkipReason } from '../../src/services/promoted-units.js';
import { readAdminAnalytics } from '../../src/services/team-service.js';
import { changeListingStatus, createListing, listMarketplace } from '../../src/services/marketplace-service.js';
import { listProfessionals, readProfessional, registerProfessional } from '../../src/services/professionals-service.js';
import {
  buyPromotion,
  readAdminView,
  readBilling,
  readOverview,
  readSettings,
  recordPromotionEvent,
  staffStop,
  stopOwnPromotion,
  writeSettings,
} from '../../src/services/promotions-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, EMPTY_DATE, post, validBody } from '../helpers/register-app.js';

// Monetization (I13; Afik 21.10.2026 §11.1–11.6) through the services against the real database (CI `db` job, as app_server): a Professional
// buys a promotion of its profile with a simulated payment (FR-SERV-010, NFR-SEC-007, AC-098); the Directory shows it apart from the organic list
// only when it matches the filters (FR-ALG-007, AC-063); a Regular promotes a listing and the Marketplace shows every matching promoted listing at
// the top (FR-MKT-004, §11.3); a Moderator with CONTENT_MODERATE stops it with a reason, audited, no refund, and the promoter sees who stopped it
// (§11.1); the Admin alone keeps the settings (§11.2). The policies and triggers are pgTAP's (files 101 and 104).

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let seller = '';
let viewer = '';
let viewer2 = '';
let pro = '';
let admin = '';
let contentMod = ''; // sf_m4: CONTENT_MODERATE (granted here, removed after)
const tag = `i13${Date.now().toString(36)}`;

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const as = (userId: string) => ({ userId });
const isOk = <T extends { kind: string }>(outcome: T): outcome is Extract<T, { kind: 'ok' }> => outcome.kind === 'ok';
function ok<T extends { kind: string }>(outcome: T): Extract<T, { kind: 'ok' }> {
  expect(outcome.kind).toBe('ok');
  if (!isOk(outcome)) throw new Error(`expected ok, got ${outcome.kind}`);
  return outcome;
}
const auditCount = async (action: string): Promise<number> => Number(await text(side`select tests.fx_sf_audit(${action}) as v`));

const profile: ProfessionalProfileWrite = {
  fullName: 'Pnina Photographer',
  businessName: null,
  gender: 'woman',
  field: 'photography',
  fieldOther: null,
  yearsExperience: 4,
  area: 'eilat',
  about: `צילומי ניובורן ${tag}`,
  priceFrom: 800,
};
const listing = (over: Partial<ListingWrite> = {}): ListingWrite => ({
  title: `מנשא ${tag}`,
  category: 'feeding',
  condition: 'like_new',
  price: 200,
  city: 'eilat',
  imageIds: [],
  ...over,
});

beforeAll(async () => {
  key = await newKey('promotions-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Sigal Seller', 'Vered Viewer', 'Vika Viewer']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [seller = '', viewer = '', viewer2 = ''] = made;
  pro = await text(side`select tests.fx_new_auth_user()::text as v`);
  expect(await registerProfessional(database, as(pro), profile)).toEqual({ kind: 'created' });
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  contentMod = await text(side`select tests.fx_sf_id('sf_m4')::text as v`);
  await side`select tests.fx_sf_revoke_all(${contentMod}::uuid)`;
  await side.begin(async (tx) => {
    await tx`select 1`;
    await tx`select tests.fx_sf_grant(${contentMod}::uuid, ${['CONTENT_MODERATE']}::text[])`;
  });
}, COLD_START_MS * 3);

afterAll(async () => {
  await side`select tests.fx_sf_revoke_all(${contentMod}::uuid)`;
  await app.close();
  await database.close();
  await side.end();
  await jwks.close();
  restoreEnv();
});

describe('[I13] promotions', () => {
  let profilePromotion = '';
  let listingPromotion = '';
  let stroller = '';

  it('[FR-SERV-010 NFR-SEC-007 AC-098 AC-057 BR-047 ERR-047] a Professional buys reach with a simulated payment, without changing organic reputation', T, async () => {
    const overview = await readOverview(database, as(pro));
    const before = await inIdentityTransaction(database, as(viewer), (tx) => readProfessionalHead(tx, pro));
    expect(before).toBeDefined();
    expect(overview.plans.map((plan) => plan.targetKind)).toEqual(expect.arrayContaining(['profile', 'post']));
    expect(overview.plans.some((plan) => plan.targetKind === 'listing')).toBe(false);
    const bought = ok(await buyPromotion(database, as(pro), { planKey: 'profile_7', target: { kind: 'profile' } }));
    profilePromotion = bought.promotionId;
    expect(bought.receipt).toMatchObject({ amountIls: 49, isSimulated: true });
    const after = await inIdentityTransaction(database, as(viewer), (tx) => readProfessionalHead(tx, pro));
    expect({ rating: after?.rating, reviews: after?.reviewCount }).toEqual({ rating: before?.rating, reviews: before?.reviewCount });
    expect((await readOverview(database, as(pro))).analytics?.organic).toEqual(overview.analytics?.organic);
    // ERR-047: a target that already has a running promotion is refused (no second payment)
    expect(await buyPromotion(database, as(pro), { planKey: 'profile_30', target: { kind: 'profile' } })).toEqual({ kind: 'already_promoted' });
    const billing = await readBilling(database, as(pro));
    expect(billing).toContainEqual(expect.objectContaining({ planKey: 'profile_7', amountIls: 49, isSimulated: true }));
    // BR-047: a Regular does not buy a Professional plan
    expect((await buyPromotion(database, as(seller), { planKey: 'profile_7', target: { kind: 'profile' } })).kind).not.toBe('ok');
  });

  it('[FR-ALG-007 BR-005 AC-063 AC-062] the Directory shows the promoted Professional apart, only when it matches the filters; the organic list is unchanged', T, async () => {
    const matching = await listProfessionals(database, as(viewer), { field: 'photography', area: 'eilat' });
    expect(matching.promoted.map((unit) => unit.promotionId)).toContain(profilePromotion);
    expect(matching.promoted.find((unit) => unit.promotionId === profilePromotion)?.card.id).toBe(pro);
    const other = await listProfessionals(database, as(viewer), { field: 'doula' });
    expect(other.promoted.map((unit) => unit.promotionId)).not.toContain(profilePromotion);
    // the owner is never shown its own promotion
    expect((await listProfessionals(database, as(pro), { field: 'photography' })).promoted.map((unit) => unit.promotionId)).not.toContain(profilePromotion);
    // a paid click is recorded; the owner's analytics count it apart from the organic numbers (FR-PRO-002, AC-072)
    ok(await recordPromotionEvent(database, as(viewer), profilePromotion, 'click'));
    const analytics = (await readOverview(database, as(pro))).analytics;
    expect(analytics?.paid.clicks).toBeGreaterThanOrEqual(1);
    expect(analytics?.paid.impressions).toBeGreaterThanOrEqual(1);
  });

  it('[FR-MKT-004 BR-020 §11.3 §11.5] a Regular promotes a listing; the Marketplace shows every matching promoted listing at the top, apart from the organic list', T, async () => {
    stroller = ok(await createListing(database, as(seller), listing())).id;
    const plans = (await readOverview(database, as(seller))).plans;
    expect(plans.every((plan) => plan.targetKind === 'listing')).toBe(true);
    listingPromotion = ok(await buyPromotion(database, as(seller), { planKey: 'listing_3', target: { kind: 'listing', listingId: stroller } })).promotionId;
    const page = await listMarketplace(database, as(viewer), undefined, { q: tag });
    expect(page.promoted.map((unit) => unit.listing.id)).toContain(stroller);
    // AC-062: the organic list is exactly as without promotions (the listing matches the search, so it is there too)
    expect(page.listings.map((card) => card.id)).toContain(stroller);
    expect((await listMarketplace(database, as(viewer), undefined, { q: tag, category: 'toys' })).promoted.map((unit) => unit.listing.id)).not.toContain(stroller);
    // no daily cap on the Marketplace (§11.3): the same viewer keeps seeing it
    for (let i = 0; i < 4; i += 1) await listMarketplace(database, as(viewer2), undefined, { q: tag });
    expect((await listMarketplace(database, as(viewer2), undefined, { q: tag })).promoted.map((unit) => unit.listing.id)).toContain(stroller);
  });

  it('[FR-PRO-002 AC-072 BR-057] a paid profile arrival is not also organic; an unrelated source cannot suppress an organic view', T, async () => {
    const before = (await readOverview(database, as(pro))).analytics?.organic.profileViews ?? 0;
    ok(await readProfessional(database, as(viewer), pro, profilePromotion));
    expect((await readOverview(database, as(pro))).analytics?.organic.profileViews).toBe(before);
    ok(await readProfessional(database, as(viewer), pro, listingPromotion));
    expect((await readOverview(database, as(pro))).analytics?.organic.profileViews).toBe(before + 1);
    ok(await readProfessional(database, as(viewer), pro));
    expect((await readOverview(database, as(pro))).analytics?.organic.profileViews).toBe(before + 2);
  });

  it('[§11.1 FR-ADMIN-005] a Moderator with CONTENT_MODERATE stops a Professional promotion with a reason; audited; no refund; the promoter sees it was staff', T, async () => {
    const before = await auditCount('promotion_stopped');
    expect(await readAdminView(database, as(viewer))).toEqual({ kind: 'forbidden' });
    const view = ok(await readAdminView(database, as(contentMod))).view;
    expect(view.isFinance).toBe(false);
    expect(view.promotions.map((row) => row.id)).toContain(profilePromotion);
    expect(view.promotions.map((row) => row.targetKind)).not.toContain('listing');
    // a Moderator reads no payment and no paid event: those are null, never a misleading 0 or the plan's price
    expect(view.promotions.find((row) => row.id === profilePromotion)).toMatchObject({ amountIls: null, impressions: null, clicks: null });
    expect(view.totals).toMatchObject({ payments: null, sampleRevenueIls: null, impressions: null, clicks: null });
    expect(view.totals.running).toBeGreaterThanOrEqual(1);
    // CONTENT_MODERATE does not stop a listing promotion
    expect(await staffStop(database, as(contentMod), listingPromotion, { reason: 'לא קשור' })).toEqual({ kind: 'unavailable' });
    ok(await staffStop(database, as(contentMod), profilePromotion, { reason: 'טענות רפואיות מטעות' }));
    expect(await auditCount('promotion_stopped')).toBe(before + 1);
    const mine = (await readOverview(database, as(pro))).promotions.find((item) => item.id === profilePromotion);
    expect(mine).toMatchObject({ state: 'stopped', stoppedBy: 'staff' });
    expect(await readBilling(database, as(pro))).toContainEqual(expect.objectContaining({ planKey: 'profile_7', amountIls: 49 }));
    expect((await listProfessionals(database, as(viewer2), { field: 'photography' })).promoted.map((unit) => unit.promotionId)).not.toContain(profilePromotion);
  });

  it('[§11.1] the owner stops its own promotion (no staff entry); the Admin sees every promotion and the payments', T, async () => {
    const before = await auditCount('promotion_stopped');
    ok(await stopOwnPromotion(database, as(seller), listingPromotion));
    expect(await auditCount('promotion_stopped')).toBe(before);
    expect((await readOverview(database, as(seller))).promotions.find((item) => item.id === listingPromotion)).toMatchObject({ state: 'stopped', stoppedBy: 'owner' });
    const view = ok(await readAdminView(database, as(admin))).view;
    expect(view.isFinance).toBe(true);
    expect(view.promotions.map((row) => row.id)).toEqual(expect.arrayContaining([profilePromotion, listingPromotion]));
    expect(view.totals.payments).toBeGreaterThanOrEqual(2);
    // the Admin sees each promotion's own paid amount (its payment's amount_ils) and its paid counts
    expect(view.promotions.find((row) => row.id === profilePromotion)).toMatchObject({ amountIls: 49 });
    expect(view.promotions.find((row) => row.id === listingPromotion)).toMatchObject({ amountIls: 9 });
    expect(view.promotions.find((row) => row.id === profilePromotion)?.clicks).toBeGreaterThanOrEqual(1);
    expect(view.promotions.find((row) => row.id === profilePromotion)?.impressions).toBeGreaterThanOrEqual(1);
  });

  it('[§11.2 AC-073 BR-059 FR-ADMIN-005] the Admin alone adds a settings version, with a reason; it is in force', T, async () => {
    expect(await readSettings(database, as(contentMod))).toEqual({ kind: 'forbidden' });
    const current = await inIdentityTransaction(database, as(viewer), (tx) => readPromotionConfig(tx));
    const write = {
      dailyCap: current.dailyCap,
      directoryUnitsPerPage: current.directoryUnitsPerPage,
      feedGapMin: current.feedGapMin,
      feedGapMax: current.feedGapMax,
      feedLowPosts: current.feedLowPosts,
      feedHighPosts: current.feedHighPosts,
      reason: `test ${tag}`,
    };
    expect(await writeSettings(database, as(contentMod), write)).toEqual({ kind: 'forbidden' });
    const before = await auditCount('promotion_settings_changed');
    const { version } = ok(await writeSettings(database, as(admin), write));
    expect(version).toBeGreaterThan(current.version);
    expect(await auditCount('promotion_settings_changed')).toBe(before + 1);
    expect((await inIdentityTransaction(database, as(viewer), (tx) => readPromotionConfig(tx))).version).toBe(version);
    expect(ok(await readSettings(database, as(admin))).settings.versions[0]).toMatchObject({ version, reason: `test ${tag}` });
  });
});

// ---- the rules around a running promotion: purchase refusals, the feed, privacy and the staff views ----------------------------------------
const recording = (statements: string[]): Database => {
  const client = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined, debug: (_c: number, query: string) => void statements.push(query) });
  return { db: drizzle({ client }), client, close: () => client.end() };
};
/** The promoted slot of the viewer's feed that serves `promotionId`, page by page (at most 4); undefined when none does. */
async function feedSlotOf(userId: string, promotionId: string, db: Database = database): Promise<{ afterIndex: number; organic: number } | undefined> {
  let cursor: string | null = null;
  for (let pageNo = 0; pageNo < 4; pageNo += 1) {
    const outcome = await readFeedPage(db, as(userId), cursor === null ? null : parseFeedCursor(cursor));
    if (outcome.kind !== 'page') throw new Error(`feed: ${outcome.kind}`);
    const page: FeedPageResponse = outcome.page;
    const slot = (page.promoted ?? []).find((unit) => unit.promotionId === promotionId);
    if (slot !== undefined) return { afterIndex: slot.afterIndex, organic: page.items.length };
    if (page.nextCursor === null) return undefined;
    cursor = page.nextCursor;
  }
  return undefined;
}
const sumOf = (days: ReadonlyArray<{ count: number }> | undefined): number => (days ?? []).reduce((sum, day) => sum + day.count, 0);

describe('[I13] the rules of a running promotion', () => {
  let pro2 = '';
  let proPost = '';
  let followersPost = '';
  let postPromotion = '';
  let planner = '';
  let sleeper = '';
  let marketMod = ''; // sf_m5: MARKETPLACE_MODERATE (granted here, removed after)
  let analyst = ''; // sf_m3: ANALYTICS_VIEW only
  let bare = ''; // sf_m1: staff with no key
  const skips: SkipReason[] = [];
  const settings = { dailyCap: 3, directoryUnitsPerPage: 1, feedGapMin: 4, feedGapMax: 7, feedLowPosts: 20, feedHighPosts: 200 };

  beforeAll(async () => {
    const register = async (fullName: string, over: Record<string, unknown>): Promise<string> => {
      const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
      const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName, ...over }));
      if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
      return userId;
    };
    const planning = { stages: ['planning'], dueDate: EMPTY_DATE, children: [] };
    planner = await register('Pele Planner', planning);
    sleeper = await register('Shira Sleeper', planning);
    // a search topic, as the search screen stores it (the topic only, never the text: FR-ALG-008)
    for (const who of [viewer, viewer2, sleeper]) await inIdentityTransaction(database, as(who), (tx) => recordTopics(tx, ['sleep']));
    pro2 = await text(side`select tests.fx_new_auth_user()::text as v`);
    expect(await registerProfessional(database, as(pro2), { ...profile, fullName: 'Shoshi Sleep', field: 'sleep', about: `יועצת שינה ${tag}` })).toEqual({ kind: 'created' });
    proPost = (await createPost(database, as(pro2), { body: `שינה טובה לתינוק ${tag}`, audience: 'everyone' })).id;
    followersPost = (await createPost(database, as(pro2), { body: `לעוקבים בלבד ${tag}`, audience: 'followers' })).id;
    // Keep the paid candidate off the first organic page: equally relevant newer posts from 11 authors survive the per-author cap.
    for (const name of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven']) {
      const author = await register('Rina Organic ' + name, {});
      for (let i = 0; i < 2; i += 1) await createPost(database, as(author), { body: `שינה טובה פוסט רגיל ${i} ${tag}`, audience: 'everyone' });
    }
    postPromotion = ok(await buyPromotion(database, as(pro2), { planKey: 'post_3', target: { kind: 'post', postId: proPost } })).promotionId;
    marketMod = await text(side`select tests.fx_sf_id('sf_m5')::text as v`);
    analyst = await text(side`select tests.fx_sf_id('sf_m3')::text as v`);
    bare = await text(side`select tests.fx_sf_id('sf_m1')::text as v`);
    for (const who of [marketMod, analyst, bare].filter((id) => id !== '')) await side`select tests.fx_sf_revoke_all(${who}::uuid)`;
    await side.begin(async (tx) => {
      await tx`select 1`;
      await tx`select tests.fx_sf_grant(${marketMod}::uuid, ${['MARKETPLACE_MODERATE']}::text[])`;
      await tx`select tests.fx_sf_grant(${analyst}::uuid, ${['ANALYTICS_VIEW']}::text[])`;
    });
    onPromotionSkip((reason) => void skips.push(reason));
  }, COLD_START_MS * 3);

  afterAll(async () => {
    onPromotionSkip(() => undefined);
    for (const who of [marketMod, analyst, bare]) await side`select tests.fx_sf_revoke_all(${who}::uuid)`;
    // v1's values are put back as the newest version
    await writeSettings(database, as(admin), { ...settings, reason: `restore ${tag}` });
  });

  it("[ERR-047 VAL-051 BR-047 FR-MKT-004] a purchase is refused for another account's post or listing, a plan of the wrong kind, and a target that is not active or not public", T, async () => {
    // another Professional's post
    expect((await buyPromotion(database, as(pro), { planKey: 'post_3', target: { kind: 'post', postId: proPost } })).kind).not.toBe('ok');
    // another account's listing
    const theirs = ok(await createListing(database, as(seller), listing({ title: `עגלה של אחרת ${tag}` }))).id;
    expect((await buyPromotion(database, as(viewer), { planKey: 'listing_3', target: { kind: 'listing', listingId: theirs } })).kind).not.toBe('ok');
    // a plan of the wrong kind: a profile plan for a post, a post plan for the profile, a post plan for a listing
    expect((await buyPromotion(database, as(pro2), { planKey: 'profile_7', target: { kind: 'post', postId: proPost } })).kind).not.toBe('ok');
    expect((await buyPromotion(database, as(pro2), { planKey: 'post_7', target: { kind: 'profile' } })).kind).not.toBe('ok');
    expect((await buyPromotion(database, as(seller), { planKey: 'post_3', target: { kind: 'listing', listingId: theirs } })).kind).not.toBe('ok');
    // ERR-047: a target that is no longer eligible — a sold listing, a post not shown to everyone
    ok(await changeListingStatus(database, as(seller), theirs, 'sold'));
    expect((await buyPromotion(database, as(seller), { planKey: 'listing_3', target: { kind: 'listing', listingId: theirs } })).kind).not.toBe('ok');
    expect((await buyPromotion(database, as(pro2), { planKey: 'post_3', target: { kind: 'post', postId: followersPost } })).kind).not.toBe('ok');
    // nothing was paid for any refusal (the payment and the promotion are one step)
    expect((await readBilling(database, as(pro2))).map((item) => item.planKey)).toEqual(['post_3']);
    expect(await readBilling(database, as(viewer))).toEqual([]);
  });

  it("[FR-ALG-007 §11.2 BR-059] the feed places the promoted post after every N organic posts, N from the Admin's thresholds and the last 48 hours' posts", T, async () => {
    // fewer posts than the "few" threshold: the smaller gap
    ok(await writeSettings(database, as(admin), { ...settings, feedLowPosts: 99_998, feedHighPosts: 99_999, reason: `few ${tag}` }));
    const few = await feedSlotOf(viewer, postPromotion);
    expect(few, 'the topic-matching viewer is served the promoted post').toBeDefined();
    expect((few?.afterIndex ?? 1) % 4).toBe(0);
    expect(few?.afterIndex ?? 99).toBeLessThanOrEqual(few?.organic ?? 0);
    // at least the "many" threshold: the larger gap
    ok(await writeSettings(database, as(admin), { ...settings, feedLowPosts: 0, feedHighPosts: 1, reason: `many ${tag}` }));
    const many = await feedSlotOf(viewer2, postPromotion);
    expect(many).toBeDefined();
    expect((many?.afterIndex ?? 1) % 7).toBe(0);
    // the Admin's own gap (the gradual middle is packages/shared/tests/promotions.test.ts)
    ok(await writeSettings(database, as(admin), { ...settings, feedGapMin: 5, feedGapMax: 5, reason: `five ${tag}` }));
    expect(((await feedSlotOf(viewer, postPromotion))?.afterIndex ?? 1) % 5).toBe(0);
  });

  it('[FR-ALG-007 §11.2 ERR-028 AC-063] relevance by search topic; no match means no promoted post, and the skip is logged by reason only', T, async () => {
    ok(await writeSettings(database, as(admin), { ...settings, reason: `relevance ${tag}` }));
    // Professionals post without a Stage tag (VAL-049); the viewers' stored search topic (sleep) matches this public post's text.
    expect(await feedSlotOf(viewer, postPromotion)).toBeDefined();
    expect(await feedSlotOf(sleeper, postPromotion)).toBeDefined();
    // a planner with no search topic: neither matches, so no promoted post, and ERR-028's reason code is recorded
    skips.length = 0;
    expect(await feedSlotOf(planner, postPromotion)).toBeUndefined();
    // Afik, 23.10.2026: a Stage alone is not paid targeting; this has-child viewer has no search topics.
    expect(await feedSlotOf(seller, postPromotion)).toBeUndefined();
    expect(skips).toContain('not_matching');
    // the owner is never served its own promotion
    expect(await feedSlotOf(pro2, postPromotion)).toBeUndefined();
  });

  it('[AC-068 BR-053 VAL-030] paid targeting reads no child, birth date or tracker data, and the analytics carry none', T, async () => {
    const statements: string[] = [];
    const db = recording(statements);
    try {
      await feedSlotOf(viewer, postPromotion, db);
      await listProfessionals(db, as(viewer), { field: 'sleep' });
      await listMarketplace(db, as(viewer), undefined, { q: tag });
      const overview = await readOverview(db, as(pro2));
      const view = ok(await readAdminAnalytics(database, as(admin), 30)).view;
      const childData = /\bnestly\.(children|tracker_events|cycle_entries|journey_contexts)\b|birth_date|due_date/i;
      expect(statements.length).toBeGreaterThan(0);
      expect(statements.filter((q) => childData.test(q))).toEqual([]);
      for (const shown of [JSON.stringify(overview.analytics), JSON.stringify(view.promotions), JSON.stringify(view.usage)]) {
        expect(shown).not.toMatch(/child|birth|due|tracker|cycle|stage/i);
      }
    } finally {
      await db.close();
    }
  });

  it("[AC-072 BR-057 VAL-032 FR-PRO-002] the Professional's analytics are its own aggregates: no viewer identity and no search text", T, async () => {
    await listProfessionals(database, as(sleeper), { field: 'sleep' });
    await feedSlotOf(sleeper, postPromotion);
    ok(await recordPromotionEvent(database, as(sleeper), postPromotion, 'click'));
    const analytics = (await readOverview(database, as(pro2))).analytics;
    expect(analytics?.paid.clicks).toBeGreaterThanOrEqual(1);
    const shown = JSON.stringify(analytics);
    for (const who of [sleeper, viewer, viewer2, planner]) expect(shown).not.toContain(who);
    // no search text or topic: numbers only, under the fixed keys
    expect(shown).not.toMatch(new RegExp(`sleep|שינה|תינוק|${tag}`));
    expect(Object.keys(analytics?.organic ?? {}).sort()).toEqual(['chatStarts', 'engagement', 'followers', 'postReach', 'postViews', 'profileViewers', 'profileViews']);
    expect(Object.values({ ...analytics?.organic, ...analytics?.paid }).every((value) => value === null || typeof value === 'number')).toBe(true);
  });

  it('[§11.1 PG-059] a Moderator sees only the promotions of its key, with no payments; staff with no key is refused', T, async () => {
    const market = ok(await readAdminView(database, as(marketMod))).view;
    expect(market.isFinance).toBe(false);
    expect(new Set(market.promotions.map((row) => row.targetKind))).toEqual(new Set(['listing']));
    expect(market.totals.payments).toBeNull();
    expect(market.totals.sampleRevenueIls).toBeNull();
    expect(market.promotions.every((row) => row.amountIls === null && row.impressions === null && row.clicks === null)).toBe(true);
    expect(await readAdminView(database, as(bare))).toEqual({ kind: 'forbidden' });
    expect(await readSettings(database, as(marketMod))).toEqual({ kind: 'forbidden' });
  });

  it('[BR-005 §11.5 FR-ALG-007] a staff viewer is served no promoted unit on the feed, the Directory or the Marketplace, and records no paid event', T, async () => {
    const shelf = ok(await createListing(database, as(seller), listing({ title: `שידה ${tag}` }))).id;
    const shelfPromotion = ok(await buyPromotion(database, as(seller), { planKey: 'listing_3', target: { kind: 'listing', listingId: shelf } })).promotionId;
    const proPromotion = ok(await buyPromotion(database, as(pro2), { planKey: 'profile_7', target: { kind: 'profile' } })).promotionId;
    const paidOf = async (owner: string, id: string): Promise<number> => {
      const item = (await readOverview(database, as(owner))).promotions.find((row) => row.id === id);
      return (item?.counts.impressions ?? 0) + (item?.counts.clicks ?? 0);
    };
    // a Regular is served them (the units are live; its impression is counted before the baseline), so an empty staff result is the rule
    expect((await listMarketplace(database, as(viewer2), undefined, { q: `שידה ${tag}` })).promoted.map((unit) => unit.listing.id)).toContain(shelf);
    const before = { post: await paidOf(pro2, postPromotion), profile: await paidOf(pro2, proPromotion), shelf: await paidOf(seller, shelfPromotion) };
    for (const staff of [contentMod, marketMod, admin]) {
      const feed = await readFeedPage(database, as(staff), null);
      if (feed.kind === 'page') expect(feed.page.promoted ?? []).toEqual([]);
      expect((await listProfessionals(database, as(staff), { field: 'sleep' })).promoted).toEqual([]);
      expect((await listMarketplace(database, as(staff), undefined, { q: `שידה ${tag}` })).promoted).toEqual([]);
      // a click a staff account sends is not recorded either (checked by the counts below)
      await recordPromotionEvent(database, as(staff), shelfPromotion, 'click');
    }
    expect({ post: await paidOf(pro2, postPromotion), profile: await paidOf(pro2, proPromotion), shelf: await paidOf(seller, shelfPromotion) }).toEqual(before);
    ok(await stopOwnPromotion(database, as(seller), shelfPromotion));
    ok(await stopOwnPromotion(database, as(pro2), proPromotion));
  });

  it('[OP-039 FR-PRO-002] a feed page counts one post view per post it shows; a Professional gets one organic post view per post of theirs', T, async () => {
    const ownPostViews = async (who: string): Promise<number> =>
      Number(
        (await inIdentityTransaction(database, as(who), (tx) => tx.execute(sql`select coalesce(sum(times), 0)::integer as n from nestly.usage_events where kind = 'post_view'`)))[0]?.n ?? 0,
      );
    const before = await ownPostViews(planner);
    const outcome = await readFeedPage(database, as(planner), null);
    if (outcome.kind !== 'page') throw new Error(`feed: ${outcome.kind}`);
    const shown = outcome.page.items.length + (outcome.page.promoted ?? []).length;
    expect(shown, 'the page shows posts').toBeGreaterThan(1);
    expect(await ownPostViews(planner)).toBe(before + shown);
    // three posts of one Professional on a page are three views of theirs, from one viewer (reach one)
    const organic = async () => (await readOverview(database, as(pro2))).analytics?.organic;
    const was = await organic();
    await inIdentityTransaction(database, as(sleeper), (tx) => insertProfessionalView(tx, pro2, 'post_view', 3));
    const now = await organic();
    expect((now?.postViews ?? 0) - (was?.postViews ?? 0)).toBe(3);
    expect((now?.postReach ?? 0) - (was?.postReach ?? 0)).toBeLessThanOrEqual(1);
  });

  it('[AC-071 OP-039 FR-ADMIN-010] Admin Analytics: usage by day for ANALYTICS_VIEW; the Promotions domain for the Admin only', T, async () => {
    const forAdmin = ok(await readAdminAnalytics(database, as(admin), 30)).view;
    expect(forAdmin.usage.dailyLogins).toHaveLength(30);
    expect(sumOf(forAdmin.usage.postViews)).toBeGreaterThanOrEqual(1);
    expect(sumOf(forAdmin.promotions?.purchases)).toBeGreaterThanOrEqual(1);
    expect(forAdmin.promotions?.running.post).toBeGreaterThanOrEqual(1);
    const forAnalyst = ok(await readAdminAnalytics(database, as(analyst), 30)).view;
    expect(sumOf(forAnalyst.usage.postViews)).toBe(sumOf(forAdmin.usage.postViews));
    expect(forAnalyst.promotions).toBeUndefined();
    expect(await readAdminAnalytics(database, as(viewer), 30)).toEqual({ kind: 'forbidden' });
  });

  it('[FR-MKT-004 §11.3 AC-063] all 501 matching promoted listings are shown, beyond the feed and Directory sampling size', T, async () => {
    const query = 'batch' + tag;
    const listingIds = await inIdentityTransaction(database, as(seller), async (tx) => {
      // Real RLS writes as the seller, in bulk so this boundary regression does not require 1,503 round trips.
      const listings = await tx.execute(sql`insert into nestly.marketplace_listings (title, category, item_condition, price, city)
        select ${query} || n::text, 'feeding', 'like_new', 200, 'eilat' from generate_series(1, 501) as n returning id`);
      const payments = await tx.execute(sql`insert into nestly.promotion_payments (plan_key)
        select 'listing_3' from generate_series(1, 501) returning id`);
      expect(listings).toHaveLength(501);
      expect(payments).toHaveLength(501);
      const values = listings.map((row, index) => sql`('listing', 'listing_3', ${payments[index]?.id}::uuid, ${row.id}::uuid)`);
      await tx.execute(sql`insert into nestly.promotions (target_kind, plan_key, payment_id, listing_id) values ${sql.join(values, sql`,`)}`);
      return listings.map((row) => String(row.id));
    });
    const page = await listMarketplace(database, as(viewer2), undefined, { q: query });
    expect(page.promoted).toHaveLength(501);
    expect(new Set(page.promoted.map((unit) => unit.listing.id))).toEqual(new Set(listingIds));
  });

});
