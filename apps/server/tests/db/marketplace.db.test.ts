import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListingWrite, SponsoredWrite } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { handleReports, readReportDetail } from '../../src/services/admin-service.js';
import { openThread } from '../../src/services/chat-service.js';
import {
  changeListingStatus,
  changeListingVisibility,
  changeSponsoredStatus,
  contactSeller,
  createListing,
  createSponsored,
  editListing,
  editSponsored,
  listMarketplace,
  listOwnListings,
  listSponsored,
  listStaffListings,
  readListingPage,
  removeOwnListing,
} from '../../src/services/marketplace-service.js';
import { fileReport } from '../../src/services/reports-service.js';
import { search } from '../../src/services/search-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// Marketplace (I12) through the services against the real database (CI `db` job, as app_server): a Regular publishes, edits, marks sold and deletes
// a listing (FR-MKT-002, decisions §3 item 11); the Marketplace filters and ranks by the reader's search topic (FR-MKT-001, FR-ALG-006/008); a
// buyer contacts the seller through a Marketplace conversation (FR-MKT-005, AC-059); a listing report reaches staff with the listing as it is now
// and its owner (Afik 21.10.2026), and MARKETPLACE_MODERATE hides it (audited); the Admin alone manages Sponsored Products (FR-ADMIN-009, AC-058).
// The policies themselves are pgTAP's (file 99). Images need storage, which these tests do not have: their rules are file 99's.

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let seller = '';
let buyer = '';
let admin = '';
let marketMod = ''; // sf_m3: MARKETPLACE_MODERATE + REPORTS_VIEW + USER_VIEW (granted here, removed after)
const tag = `i12${Date.now().toString(36)}`;

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
const listing = (over: Partial<ListingWrite> = {}): ListingWrite => ({
  title: `עגלת תינוק ${tag}`,
  category: 'strollers',
  condition: 'like_new',
  price: 450,
  city: 'tel_aviv',
  imageIds: [],
  ...over,
});
const product = (over: Partial<SponsoredWrite> = {}): SponsoredWrite => ({
  sponsorName: 'בייבי סטור',
  title: `קופון 10% ${tag}`,
  description: 'דוגמה: קופון לדוגמה בלבד',
  category: 'strollers',
  linkUrl: 'https://example.com/coupon',
  imageId: null,
  ...over,
});
const auditCount = async (action: string): Promise<number> => Number(await text(side`select tests.fx_sf_audit(${action}) as v`));

beforeAll(async () => {
  key = await newKey('market-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Shira Seller', 'Boaz Buyer']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [seller = '', buyer = ''] = made;
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  marketMod = await text(side`select tests.fx_sf_id('sf_m3')::text as v`);
  await side`select tests.fx_sf_revoke_all(${marketMod}::uuid)`;
  await side.begin(async (tx) => {
    await tx`select 1`;
    await tx`select tests.fx_sf_grant(${marketMod}::uuid, ${['MARKETPLACE_MODERATE', 'REPORTS_VIEW', 'USER_VIEW']}::text[])`;
  });
}, COLD_START_MS * 3);

afterAll(async () => {
  await side`select tests.fx_sf_revoke_all(${marketMod}::uuid)`;
  await app.close();
  await database.close();
  await side.end();
  await jwks.close();
  restoreEnv();
});

describe('[I12] Marketplace', () => {
  let stroller = '';
  let toy = '';

  it('[FR-MKT-002 AC-019] a Regular publishes listings; the Marketplace shows them with the seller; a Professional-free check of the fields', T, async () => {
    stroller = ok(await createListing(database, as(seller), listing())).id;
    toy = ok(await createListing(database, as(seller), listing({ title: `בובה ${tag}`, category: 'toys', price: null, city: 'haifa' }))).id;
    const all = await listMarketplace(database, as(buyer), undefined, { q: tag });
    expect(all.listings.map((card) => card.id)).toEqual(expect.arrayContaining([stroller, toy]));
    const card = all.listings.find((item) => item.id === stroller);
    expect(card).toMatchObject({ title: `עגלת תינוק ${tag}`, price: 450, city: 'tel_aviv', status: 'active', isMine: false, sellerName: 'Shira Seller' });
    expect(all.listings.find((item) => item.id === toy)?.price).toBeNull();
    const page = ok(await readListingPage(database, as(buyer), undefined, stroller)).page;
    expect(page.sellerId).toBe(seller);
    expect(page.conversationId).toBeNull();
  });

  it('[FR-MKT-001] filters: category, city, for free, maximum price', T, async () => {
    const ids = async (query: Parameters<typeof listMarketplace>[3]) => (await listMarketplace(database, as(buyer), undefined, { q: tag, ...query })).listings.map((card) => card.id);
    expect(await ids({ category: 'toys' })).toEqual([toy]);
    expect(await ids({ city: 'tel_aviv' })).toEqual([stroller]);
    expect(await ids({ free: '1' })).toEqual([toy]);
    expect(await ids({ maxPrice: 100 })).toEqual([toy]);
    expect(await ids({ sort: 'price_low' })).toEqual([toy, stroller]);
  });

  it('[FR-ALG-006 FR-ALG-008] the order `match` puts the category of the reader search topic first', T, async () => {
    expect((await listMarketplace(database, as(buyer), undefined, { q: tag, sort: 'new' })).listings.map((card) => card.id)).toEqual([toy, stroller]);
    await search(database, as(buyer), 'מחפשת עגלה', 'posts');
    expect((await listMarketplace(database, as(buyer), undefined, { q: tag, sort: 'match' })).listings.map((card) => card.id)).toEqual([stroller, toy]);
  });

  it('[FR-MKT-002] the owner edits and marks sold/given; nobody else does; a sold listing leaves the Marketplace', T, async () => {
    expect(await editListing(database, as(buyer), stroller, listing({ title: 'נפרץ' }))).toEqual({ kind: 'unavailable' });
    ok(await editListing(database, as(seller), stroller, listing({ price: 400 })));
    expect(ok(await readListingPage(database, as(buyer), undefined, stroller)).page.price).toBe(400);
    ok(await changeListingStatus(database, as(seller), toy, 'sold'));
    expect((await listMarketplace(database, as(buyer), undefined, { q: tag })).listings.map((card) => card.id)).toEqual([stroller]);
    expect((await listOwnListings(database, as(seller), undefined)).find((card) => card.id === toy)?.status).toBe('sold');
    expect(await changeListingStatus(database, as(buyer), stroller, 'sold')).toEqual({ kind: 'unavailable' });
    expect(await createListing(database, as(admin), listing())).toEqual({ kind: 'not_allowed' });
  });

  it('[FR-MKT-005 FR-CHAT-002 AC-059] a buyer contacts the seller; the conversation carries the listing; the seller cannot contact itself', T, async () => {
    expect(await contactSeller(database, as(seller), stroller, 'שלום')).toEqual({ kind: 'unavailable' });
    expect(await contactSeller(database, as(buyer), toy, 'עדיין זמין?')).toEqual({ kind: 'unavailable' });
    const first = ok(await contactSeller(database, as(buyer), stroller, 'שלום, העגלה עדיין זמינה?'));
    const thread = ok(await openThread(database, as(seller), first.conversationId)).thread;
    expect(thread.listing).toEqual({ id: stroller, title: `עגלת תינוק ${tag}` });
    expect(thread.messages.at(-1)).toMatchObject({ text: 'שלום, העגלה עדיין זמינה?', mine: false });
    const again = ok(await contactSeller(database, as(buyer), stroller, 'ועוד שאלה'));
    expect(again.conversationId).toBe(first.conversationId);
    expect(ok(await readListingPage(database, as(buyer), undefined, stroller)).page.conversationId).toBe(first.conversationId);
  });

  it('[Afik 21.10 §3.2] a listing report: staff see it now, the title at the report and the owner; MARKETPLACE_MODERATE hides it (audited)', T, async () => {
    expect(await fileReport(database, as(buyer), { targetKind: 'listing', targetId: stroller, reason: 'spam', details: null })).toEqual({ kind: 'received' });
    ok(await editListing(database, as(seller), stroller, listing({ title: `עגלה מחודשת ${tag}` })));
    const detail = ok(await readReportDetail(database, as(marketMod), 'listing', stroller)).detail;
    expect(detail.content).toMatchObject({ text: `עגלה מחודשת ${tag}`, status: 'active' });
    expect(detail.reports[0]?.copiedText).toBe(`עגלת תינוק ${tag}`);
    expect(detail.user?.userId).toBe(seller);
    const before = await auditCount('listing_hidden');
    ok(await handleReports(database, as(marketMod), { targetKind: 'listing', targetId: stroller, resolution: 'action_taken', moderation: { status: 'hidden', reason: 'ספאם' } }));
    expect(await auditCount('listing_hidden')).toBe(before + 1);
    expect((await listMarketplace(database, as(buyer), undefined, { q: tag })).listings).toEqual([]);
    expect((await listOwnListings(database, as(seller), undefined)).find((card) => card.id === stroller)?.isHidden).toBe(true);
    const staffList = ok(await listStaffListings(database, as(marketMod), undefined, tag)).listings;
    expect(staffList.map((card) => card.id)).toContain(stroller);
    expect((await listStaffListings(database, as(buyer), undefined, tag)).kind).toBe('forbidden');
    ok(await changeListingVisibility(database, as(marketMod), stroller, { hidden: false, reason: 'שוחזר' }));
    expect(await auditCount('listing_restored')).toBeGreaterThanOrEqual(1);
    expect(await changeListingVisibility(database, as(seller), stroller, { hidden: true, reason: 'x' })).toEqual({ kind: 'forbidden' });
  });

  it('[decision: deleted at once] the owner deletes its listing; nobody else can', T, async () => {
    expect(await removeOwnListing(database, as(buyer), toy)).toEqual({ kind: 'unavailable' });
    ok(await removeOwnListing(database, as(seller), toy));
    expect((await readListingPage(database, as(seller), undefined, toy)).kind).toBe('unavailable');
  });

  it('[FR-ADMIN-009 BR-046 AC-058] the Admin alone manages Sponsored Products; users see a published one apart from the listings', T, async () => {
    expect((await createSponsored(database, as(marketMod), undefined, product())).kind).toBe('forbidden');
    expect((await listSponsored(database, as(buyer), undefined)).kind).toBe('forbidden');
    const created = ok(await createSponsored(database, as(admin), undefined, product())).item;
    expect(created.status).toBe('draft');
    expect((await listMarketplace(database, as(buyer), undefined, { q: tag })).sponsored.some((unit) => unit.id === created.id)).toBe(false);
    ok(await changeSponsoredStatus(database, as(admin), undefined, created.id, 'published'));
    const units = (await listMarketplace(database, as(buyer), undefined, { category: 'strollers' })).sponsored;
    expect(units.find((unit) => unit.id === created.id)).toMatchObject({ sponsorName: 'בייבי סטור', title: `קופון 10% ${tag}` });
    expect(ok(await editSponsored(database, as(admin), undefined, created.id, product({ title: `קופון 15% ${tag}` }))).item.title).toBe(`קופון 15% ${tag}`);
    ok(await changeSponsoredStatus(database, as(admin), undefined, created.id, 'paused'));
    expect((await listMarketplace(database, as(buyer), undefined, {})).sponsored.some((unit) => unit.id === created.id)).toBe(false);
    ok(await changeSponsoredStatus(database, as(admin), undefined, created.id, 'removed'));
    expect(await changeSponsoredStatus(database, as(admin), undefined, created.id, 'published')).toEqual({ kind: 'unavailable' });
    expect(await auditCount('sponsored_product_removed')).toBeGreaterThanOrEqual(1);
  });
});
