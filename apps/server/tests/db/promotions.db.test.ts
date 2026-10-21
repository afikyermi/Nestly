import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListingWrite, ProfessionalProfileWrite } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { inIdentityTransaction } from '../../src/db/identity-transaction.js';
import { readPromotionConfig } from '../../src/repositories/promotions-repository.js';
import { createListing, listMarketplace } from '../../src/services/marketplace-service.js';
import { listProfessionals, registerProfessional } from '../../src/services/professionals-service.js';
import {
  buyPromotion,
  readAdminView,
  readBilling,
  readOverview,
  readSettings,
  recordClick,
  staffStop,
  stopOwnPromotion,
  writeSettings,
} from '../../src/services/promotions-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

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

  it('[FR-SERV-010 NFR-SEC-007 AC-098 BR-047] a Professional buys a profile promotion with a simulated payment of the sample price', T, async () => {
    const overview = await readOverview(database, as(pro));
    expect(overview.plans.map((plan) => plan.targetKind)).toEqual(expect.arrayContaining(['profile', 'post']));
    expect(overview.plans.some((plan) => plan.targetKind === 'listing')).toBe(false);
    const bought = ok(await buyPromotion(database, as(pro), { planKey: 'profile_7', target: { kind: 'profile' } }));
    profilePromotion = bought.promotionId;
    expect(bought.receipt).toMatchObject({ amountIls: 49, isSimulated: true });
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
    ok(await recordClick(database, as(viewer), profilePromotion));
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

  it('[§11.1 FR-ADMIN-005] a Moderator with CONTENT_MODERATE stops a Professional promotion with a reason; audited; no refund; the promoter sees it was staff', T, async () => {
    const before = await auditCount('promotion_stopped');
    expect(await readAdminView(database, as(viewer))).toEqual({ kind: 'forbidden' });
    const view = ok(await readAdminView(database, as(contentMod))).view;
    expect(view.isFinance).toBe(false);
    expect(view.promotions.map((row) => row.id)).toContain(profilePromotion);
    expect(view.promotions.map((row) => row.targetKind)).not.toContain('listing');
    expect(view.totals.payments).toBe(0);
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
  });

  it('[§11.2 BR-059 FR-ADMIN-005] the Admin alone adds a settings version, with a reason; it is in force', T, async () => {
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
