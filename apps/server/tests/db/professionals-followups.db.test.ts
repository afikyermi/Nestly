import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProfessionalProfileWrite } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { handleReports, moderateContent, readReportDetail, readReportQueue } from '../../src/services/admin-service.js';
import { readAdminAnalytics } from '../../src/services/team-service.js';
import { search } from '../../src/services/search-service.js';
import { openThread, sendMessage, startChat } from '../../src/services/chat-service.js';
import { readNotifications, readPreferences } from '../../src/services/notifications-service.js';
import { createPost } from '../../src/services/posts-service.js';
import {
  acceptOutreach,
  changeFollow,
  createArticle,
  declineOutreach,
  listFollowing,
  offerHelp,
  readProfessional,
  readProfessionalHome,
  registerProfessional,
  removeArticle,
  writeReview,
} from '../../src/services/professionals-service.js';
import { readDatabaseFault } from '../../src/lib/pg-error.js';
import { fileReport } from '../../src/services/reports-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// I11 follow-ups through the services against the real database (CI `db` job, as app_server): the "following" list (PG-039), the Professional's
// notifications (OP-051 cancelled, Afik 21.10.2026: an Offer Help accepted or declined, a new review; new followers as a weekly digest), the
// dashboard's "waiting for you", acceptance rate and completeness (§9.8), the qualification declaration recorded with the consent, a report on a
// review or an article and its moderation (FR-MOD-001), and an Offer Help accepted into a conversation the pair already had. The policies and the
// definer's conditions are pgTAP's (file 98). Every account is registered fresh.

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let mia = '';
let noa = '';
let pro = '';
let admin = '';
const tag = `i11f${Date.now().toString(36)}`;

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
const count = async (from: string): Promise<number> => Number(await text(side`select tests.fx_pr_count(${from}) as v`));
const types = async (who: string): Promise<string[]> => {
  const outcome = await readNotifications(database, as(who));
  if (outcome.kind !== 'ok') throw new Error(`notifications: ${outcome.kind}`);
  return outcome.items.map((item) => item.type);
};

const profile = (over: Partial<ProfessionalProfileWrite> = {}): ProfessionalProfileWrite => ({
  fullName: 'Lea Lactation',
  businessName: null,
  gender: 'woman',
  field: 'lactation',
  fieldOther: null,
  yearsExperience: 7,
  area: 'center',
  about: null,
  priceFrom: 400,
  ...over,
});

beforeAll(async () => {
  key = await newKey('pro-followups-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Mia Regular', 'Noa Regular']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [mia = '', noa = ''] = made;
  pro = await text(side`select tests.fx_new_auth_user()::text as v`);
  expect(await registerProfessional(database, as(pro), profile())).toEqual({ kind: 'created' });
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
}, COLD_START_MS * 3);

afterAll(async () => {
  await app.close();
  await database.close();
  await side.end();
  await jwks.close();
  restoreEnv();
});

describe('[I11 follow-ups] Professionals', () => {
  it('[Afik 21.10.2026] the Professional consent records the qualification declaration', T, async () => {
    expect(await count(`nestly.legal_consents where user_id = '${pro}' and has_declared_qualification`)).toBe(1);
    expect(await count(`nestly.legal_consents where user_id = '${mia}' and not has_declared_qualification`)).toBe(1);
  });

  it('[FR-SEARCH-001 SRS audit 21.10] People Search finds a Professional, marked as one; a Regular account unmarked', T, async () => {
    const found = await search(database, as(mia), 'Lea Lactation', 'people');
    if (found.kind !== 'ok') throw new Error(`search: ${found.kind}`);
    expect(found.response.people).toContainEqual({ userId: pro, fullName: 'Lea Lactation', isProfessional: true });
    const regular = await search(database, as(pro), 'Mia Regular', 'people');
    if (regular.kind !== 'ok') throw new Error(`search: ${regular.kind}`);
    expect(regular.response.people).toContainEqual({ userId: mia, fullName: 'Mia Regular', isProfessional: false });
  });

  it('[PG-039 FR-FOLLOW-001] the following list shows whom the caller follows, and unfollow removes it', T, async () => {
    expect(await listFollowing(database, as(mia))).toEqual([]);
    ok(await changeFollow(database, as(mia), pro, true));
    expect((await listFollowing(database, as(mia))).map((card) => card.id)).toEqual([pro]);
    expect(await listFollowing(database, as(pro))).toEqual([]); // the rows naming the Professional are not its follows
    ok(await changeFollow(database, as(mia), pro, false));
    expect(await listFollowing(database, as(mia))).toEqual([]);
  });

  it('[OP-051 cancelled] a new follower makes the weekly digest, shown only when the week closes', T, async () => {
    ok(await changeFollow(database, as(noa), pro, true));
    expect(await count(`nestly.notifications where recipient_id = '${pro}' and type = 'followers_weekly' and created_at > now()`)).toBe(1);
    expect(await types(pro)).not.toContain('followers_weekly');
    const prefs = await readPreferences(database, as(pro));
    expect(prefs.kind === 'ok' && prefs.categories.map((c) => c.category)).toEqual(expect.arrayContaining(['offers', 'reviews', 'followers']));
    // FR-NOTIF-002 (SRS audit 21.10.2026): a Professional has no Friends, so no Friends, Friends' posts or children's birthdays categories
    expect(prefs.kind === 'ok' && prefs.categories.map((c) => c.category).filter((c) => ['friends', 'friend_posts', 'birthdays'].includes(c))).toEqual([]);
    const regular = await readPreferences(database, as(mia));
    expect(regular.kind === 'ok' && regular.categories.map((c) => c.category)).not.toContain('offers');
  });

  it('[OP-051 cancelled AC-012] Offer Help accepted into a conversation the pair already had; both answers notify the Professional', T, async () => {
    // mia already wrote to the Professional (FR-SERV-004): an accepted Offer Help reuses that conversation and shows its first message there
    const started = ok(await startChat(database, as(mia), pro, 'שלום, שאלה על הנקה'));
    if (started.result.kind !== 'conversation') throw new Error('no conversation');
    const conversationId = started.result.conversationId;
    const help = await createPost(database, as(mia), { body: `עזרה בהנקה ${tag}`, audience: 'everyone' });
    const other = await createPost(database, as(noa), { body: `עזרה בשינה ${tag}`, audience: 'everyone' });
    const offer = ok(await offerHelp(database, as(pro), help.id, `אשמח לעזור ${tag}`));
    const declined = ok(await offerHelp(database, as(pro), other.id, 'גם כאן'));
    ok(await declineOutreach(database, as(noa), declined.id));
    const accepted = ok(await acceptOutreach(database, as(mia), offer.id));
    expect(accepted.conversationId).toBe(conversationId);
    for (const who of [mia, pro]) {
      const thread = ok(await openThread(database, as(who), conversationId)).thread;
      expect(thread.messages.find((message) => message.isOpening)).toMatchObject({ text: `אשמח לעזור ${tag}`, mine: who === pro });
    }
    expect(await types(pro)).toEqual(expect.arrayContaining(['offer_accepted', 'offer_declined']));
    const notes = await readNotifications(database, as(pro));
    expect(notes.kind === 'ok' && notes.items.filter((item) => item.type.startsWith('offer_')).every((item) => item.actor === 'author' && item.actorName === null)).toBe(true);
    expect(await types(mia)).not.toContain('offer_accepted');

    ok(await sendMessage(database, as(pro), conversationId, 'בשמחה'));
    ok(await writeReview(database, as(mia), pro, { rating: 5, text: `מצוינת ${tag}` }));
    expect(await types(pro)).toContain('review_received');
    ok(await sendMessage(database, as(mia), conversationId, 'תודה רבה'));

    const home = ok(await readProfessionalHome(database, as(pro))).dashboard;
    expect(home).toMatchObject({ acceptedOffersNew: 1, reviewsNew: 1, offersAccepted: 1, offersDeclined: 1 });
    expect(home.profileMissing).toEqual(['businessName', 'about']);
    expect(home.unreadChats).toBeGreaterThanOrEqual(1);
  });

  it('[FR-MOD-001 FR-SERV-011 FR-PRO-003] a review and an article are reported, queued and moderated with an audited reason', T, async () => {
    const page = ok(await readProfessional(database, as(noa), pro)).page;
    const review = page.reviews.find((item) => item.text === `מצוינת ${tag}`);
    if (review === undefined) throw new Error('no review');
    const article = ok(await createArticle(database, as(pro), { title: `מאמר ${tag}`, body: 'גוף', field: 'lactation', status: 'published' }));
    expect(await fileReport(database, as(noa), { targetKind: 'review', targetId: review.id, reason: 'harassment', details: null })).toEqual({ kind: 'received' });
    expect(await fileReport(database, as(noa), { targetKind: 'article', targetId: article.id, reason: 'medical_misinformation', details: null })).toEqual({ kind: 'received' });
    const refused = await fileReport(database, as(pro), { targetKind: 'article', targetId: article.id, reason: 'spam', details: null }).then(
      () => undefined,
      (error: unknown) => readDatabaseFault(error)?.code,
    );
    expect(refused).toBe('42501'); // never the author's own article

    const queue = ok(await readReportQueue(database, as(admin))).items;
    expect(queue).toEqual(expect.arrayContaining([expect.objectContaining({ targetKind: 'review', targetId: review.id }), expect.objectContaining({ targetKind: 'article', targetId: article.id })]));
    const detail = ok(await readReportDetail(database, as(admin), 'article', article.id)).detail;
    expect(detail.content).toMatchObject({ text: `מאמר ${tag}\n\nגוף`, status: 'active' });
    expect(detail.reports[0]?.copiedText).toBe(`מאמר ${tag}\n\nגוף`);
    const reviewDetail = ok(await readReportDetail(database, as(admin), 'review', review.id)).detail;
    expect(reviewDetail.user).toBeNull(); // a review never names its writer

    // I14 completion B (OP-053, AC-159): no hide on its own any more; a justified report deletes the review (audited)
    expect(await moderateContent(database, as(admin), { targetKind: 'review', targetId: review.id, status: 'hidden', reason: 'פוגעני' })).toEqual({ kind: 'invalid' });
    const before = Number(await text(side`select tests.fx_sf_audit('content_deleted') as v`));
    ok(await handleReports(database, as(admin), { targetKind: 'review', targetId: review.id, resolution: 'action_taken', moderation: { status: 'removed', reason: 'פוגעני' } }));
    expect(Number(await text(side`select tests.fx_sf_audit('content_deleted') as v`))).toBe(before + 1);
    const shown = ok(await readProfessional(database, as(noa), pro)).page;
    expect(shown.reviews.map((item) => item.id)).not.toContain(review.id);
    // BR-072 (SRS audit 21.10): the Professional's own dashboard shows the public rating, without the deleted review
    const dashboard = ok(await readProfessionalHome(database, as(pro))).dashboard;
    expect({ rating: dashboard.rating, reviewCount: dashboard.reviewCount }).toEqual({ rating: shown.rating, reviewCount: shown.reviewCount });
    expect(dashboard.reviewCount).toBe(0);
    expect(await moderateContent(database, as(noa), { targetKind: 'article', targetId: article.id, status: 'active', reason: 'x' })).toEqual({ kind: 'forbidden' });

    // the owner deletes the reported article: its open report expires with it
    ok(await removeArticle(database, as(pro), article.id));
    expect(await count(`nestly.reports where target_kind = 'article' and article_id is null and status = 'expired' and reason = 'medical_misinformation'`)).toBeGreaterThanOrEqual(1);
  });
it('[FR-ADMIN-010 BR-058 SRS audit 21.10] the analytics screen counts Groups, Professionals and Marketplace: numbers only', T, async () => {
    const read = async () => {
      const outcome = await readAdminAnalytics(database, as(admin), 7);
      if (outcome.kind !== 'ok') throw new Error(`analytics: ${outcome.kind}`);
      return outcome.view;
    };
    const before = await read();
    ok(await changeFollow(database, as(mia), pro, true));
    const after = await read();
    expect(after.professionals.follows).toBe(before.professionals.follows + 1);
    expect(after.professionals.active).toBe(await count(`nestly.professional_profiles where user_status = 'active'`));
    expect(after.professionals.byField.find((row) => row.field === 'lactation')?.count).toBeGreaterThanOrEqual(1);
    expect(after.professionals.chatStarts).toBeGreaterThanOrEqual(1); // mia's chat with the Professional, this week
    const since = `(date_trunc('day', now() at time zone 'Asia/Jerusalem') - interval '6 days') at time zone 'Asia/Jerusalem'`;
    expect(after.marketplace.created).toBe(await count(`nestly.marketplace_listings where created_at >= ${since}`));
    expect(after.groups.active.public).toBe(await count(`nestly.groups where status = 'active' and privacy = 'public'`));
    expect(after.groups.active.private).toBe(await count(`nestly.groups where status = 'active' and privacy = 'private'`));
    // Public Group content is counted in active Groups only, as the members are (a deleted Group's posts are not)
    const inPublic = (table: string) => `nestly.${table} x join nestly.groups g on g.id = x.group_id where g.status = 'active' and g.privacy = 'public' and x.created_at >= ${since}`;
    expect(after.groups.publicPosts).toBe(await count(inPublic('posts')));
    expect(after.groups.publicComments).toBe(await count(inPublic('comments')));
    expect(JSON.stringify({ g: after.groups, p: after.professionals, m: after.marketplace })).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect((await readAdminAnalytics(database, as(mia), 7)).kind).toBe('forbidden');
  });
});
