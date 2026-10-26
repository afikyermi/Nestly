import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listingSchema, type ListingWrite, type ProfessionalProfileWrite } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { readReportDetail } from '../../src/services/admin-service.js';
import {
  changeListingStatus,
  contactSeller,
  createListing,
  editListing,
  listMarketplace,
  listOwnListings,
  readListingPage,
} from '../../src/services/marketplace-service.js';
import { registerProfessional } from '../../src/services/professionals-service.js';
import { fileReport } from '../../src/services/reports-service.js';
import { readAdminAnalytics } from '../../src/services/team-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// I12 part B (Afik §10.5–§10.6) through the services against the real database (CI `db` job, as app_server): "מכשירי חשמל", a description,
// a price of 0 shown as "למסירה" (AC-200, AC-201, AC-204); a sold listing leaves the Marketplace and is kept, and does not return to sale after
// its 60 days (AC-202, ERR-054); a Professional browses and contacts but does not publish (AC-205, §10.5); the Admin's daily graph of sold
// listings (AC-206). The expiry purge and its policies are pgTAP's (file 120): the job role is not app_server's.

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let seller = '';
let buyer = '';
let pro = '';
let admin = '';
const tag = `i12b${Date.now().toString(36)}`;

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
/** What the route hands the service: the shared schema's output (0 becomes "למסירה", a blank description none). */
const listing = (over: Record<string, unknown> = {}): ListingWrite =>
  listingSchema.parse({ title: `מחמם בקבוקים ${tag}`, category: 'electrical', condition: 'like_new', price: 0, city: 'haifa', description: 'עובד מצוין, עם קופסה', ...over });

const profile: ProfessionalProfileWrite = {
  fullName: 'Pazit Pro',
  businessName: null,
  gender: 'woman',
  field: 'photography',
  fieldOther: null,
  yearsExperience: 3,
  area: 'haifa',
  about: `צילום ${tag}`,
  priceFrom: 500,
};

beforeAll(async () => {
  key = await newKey('market-b-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Shani Seller', 'Bina Buyer']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [seller = '', buyer = ''] = made;
  pro = await text(side`select tests.fx_new_auth_user()::text as v`);
  expect(await registerProfessional(database, as(pro), profile)).toEqual({ kind: 'created' });
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
}, COLD_START_MS * 3);

afterAll(async () => {
  await app.close();
  await database.close();
  await side.end();
  await jwks.close();
  restoreEnv();
});

describe('[I12-B] Marketplace part B (Afik §10.5–§10.6)', () => {
  let warmer = '';
  let monitor = '';

  it('[AC-200 AC-201 AC-204 FR-MKT-002] "מכשירי חשמל", a description and price 0 ("למסירה"); a buyer finds it by the category and "for free"', T, async () => {
    warmer = ok(await createListing(database, as(seller), listing())).id;
    monitor = ok(await createListing(database, as(seller), listing({ title: `מוניטור תינוק ${tag}`, price: 180, description: '' }))).id;
    const ids = async (query: Parameters<typeof listMarketplace>[3]) => (await listMarketplace(database, as(buyer), undefined, { q: tag, ...query })).listings.map((card) => card.id);
    expect((await ids({ category: 'electrical' })).sort()).toEqual([warmer, monitor].sort());
    expect(await ids({ free: '1' })).toEqual([warmer]);
    const page = ok(await readListingPage(database, as(buyer), undefined, warmer)).page;
    expect(page).toMatchObject({ category: 'electrical', price: null, description: 'עובד מצוין, עם קופסה' });
    expect(ok(await readListingPage(database, as(buyer), undefined, monitor)).page.description, 'a blank description is none').toBeNull();
    ok(await editListing(database, as(seller), warmer, listing({ description: 'עובד מצוין, בלי קופסה' })));
    expect(ok(await readListingPage(database, as(buyer), undefined, warmer)).page.description).toBe('עובד מצוין, בלי קופסה');
  });

  it('[AC-201 FR-MOD-003] staff reviewing a reported listing read its description with the title', T, async () => {
    expect(await fileReport(database, as(buyer), { targetKind: 'listing', targetId: monitor, reason: 'spam', details: null })).toEqual({ kind: 'received' });
    ok(await editListing(database, as(seller), monitor, listing({ title: `מוניטור תינוק ${tag}`, price: 180, description: 'כתובת בתיאור' })));
    const detail = ok(await readReportDetail(database, as(admin), 'listing', monitor)).detail;
    expect(detail.content?.text).toBe(`מוניטור תינוק ${tag}\n\nכתובת בתיאור`);
  });

  it('[AC-205 FR-MKT-001 FR-MKT-005 AC-059 §10.5] a Professional browses and contacts a seller, and never publishes', T, async () => {
    expect((await listMarketplace(database, as(pro), undefined, { q: tag })).listings.map((card) => card.id)).toContain(warmer);
    expect(await createListing(database, as(pro), listing({ title: `מודעה של בעלת מקצוע ${tag}` }))).toEqual({ kind: 'not_allowed' });
    const first = ok(await contactSeller(database, as(pro), warmer, 'שלום, עדיין זמין?'));
    expect(first.conversationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('[AC-202 BR-091 ERR-054] sold: out of the Marketplace, kept for the seller; past its 60 days it does not return to sale', T, async () => {
    ok(await changeListingStatus(database, as(seller), warmer, 'sold'));
    expect((await listMarketplace(database, as(buyer), undefined, { q: tag })).listings.map((card) => card.id)).not.toContain(warmer);
    expect((await readListingPage(database, as(buyer), undefined, warmer)).kind, 'a buyer no longer opens it').toBe('unavailable');
    expect((await listOwnListings(database, as(seller), undefined)).find((card) => card.id === warmer)?.status).toBe('sold');
    // the 60 days pass (a test fixture moves the clocks back; committed, as this file's other rows)
    await side.begin(async (tx) => {
      await tx`select 1`;
      await tx`select tests.fx_mkt_expire(${warmer}::uuid)`;
    });
    expect(await changeListingStatus(database, as(seller), warmer, 'active')).toEqual({ kind: 'expired' });
    expect((await listOwnListings(database, as(seller), undefined)).find((card) => card.id === warmer)).toMatchObject({ status: 'sold', isExpired: true });
    expect(await changeListingStatus(database, as(buyer), warmer, 'active'), 'never another user\'s').toEqual({ kind: 'unavailable' });
    // an expired listing is not marked sold either: it would escape the deletion (BR-090)
    const late = ok(await createListing(database, as(seller), listing({ title: `מאוורר ${tag}`, price: 40 }))).id;
    await side.begin(async (tx) => {
      await tx`select 1`;
      await tx`select tests.fx_mkt_expire(${late}::uuid)`;
    });
    expect(await changeListingStatus(database, as(seller), late, 'sold')).toEqual({ kind: 'expired' });
  });

  it('[AC-201] an edit that leaves the description out keeps the stored one (an older client)', T, async () => {
    const { description: omitted, ...withoutDescription } = listing({ title: `מוניטור תינוק ${tag}`, price: 180 });
    expect(omitted).toBe('עובד מצוין, עם קופסה');
    ok(await editListing(database, as(seller), monitor, withoutDescription));
    expect(ok(await readListingPage(database, as(seller), undefined, monitor)).page.description).toBe('כתובת בתיאור');
  });

  it('[AC-206 FR-ADMIN-010] the Admin\'s graph: listings marked sold, by day, every day of the period', T, async () => {
    const view = ok(await readAdminAnalytics(database, as(admin), 7)).view;
    expect(view.marketplace.soldByDay).toHaveLength(7);
    const total = view.marketplace.soldByDay.reduce((sum, point) => sum + point.count, 0);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(view.marketplace.soldByDay.at(-1)?.count, 'today holds this file\'s sale').toBeGreaterThanOrEqual(1);
    expect((await readAdminAnalytics(database, as(buyer), 7)).kind).toBe('forbidden');
  });
});
