import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { readAudit, readReportDetail, readReportQueue } from '../../src/services/admin-service.js';
import { createComment, readThread } from '../../src/services/comments-service.js';
import { readFeedPage } from '../../src/services/feed-service.js';
import { likeTarget } from '../../src/services/likes-service.js';
import { escalateReport, readAdminOverview, readChildTrendsView, readMyWork } from '../../src/services/staff-work-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, post, validBody } from '../helpers/register-app.js';

// The staff's work against the real database (CI `db` job, as app_server; I14 completion, Afik 21.10.2026, decisions-in-force.md §9): "my work"
// by key, the Admin's home, escalation, the queue's time targets, the report's handling status, independent review (the staff feed reads every
// active post, staff write nothing), the Audit Log filters and children's trends (CHILD_DATA_VIEW). The policies and the function are pgTAP's
// (file 100); here the services run in the identity transaction exactly as the routes call them.

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let author = '';
let reporter = '';
let admin = '';
let reportsOnly = ''; // sf_m2: REPORTS_VIEW
let content = ''; // sf_m1: REPORTS_VIEW + CONTENT_MODERATE + AUDIT_LOG_VIEW
let bare = ''; // fr_m: no key

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const id = (who: string) => ({ userId: who });
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
const grant = (who: string, keys: string[]) => inTx(async (tx) => void (await tx`select tests.fx_sf_grant(${who}::uuid, ${keys}::text[])`));
const seedPost = async (by: string, audience: 'everyone' | 'friends'): Promise<string> => {
  let out = '';
  await inTx(async (tx) => {
    out = await text(tx`select tests.fx_po_add(${by}::uuid, ${audience}, false, 'active', 'a post for review', null, null)::text as v`);
  });
  return out;
};
const seedReport = (by: string, kind: 'post' | 'user', target: string, reason: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by}::uuid, ${kind}, ${target}::uuid, ${reason}, null)`));

beforeAll(async () => {
  key = await newKey('staff-work-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  const env = { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() };
  const app: App = await buildRegisterApp(env, { database, clock: () => new Date('2026-06-15T10:00:00.000Z') });
  const made: string[] = [];
  for (const fullName of ['Shira Author', 'Dana Reporter']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [author = '', reporter = ''] = made;
  await app.close();
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  bare = await text(side`select tests.fx_fr_id('fr_m')::text as v`);
  content = await text(side`select tests.fx_sf_id('sf_m1')::text as v`);
  reportsOnly = await text(side`select tests.fx_sf_id('sf_m2')::text as v`);
}, COLD_START_MS * 3);

async function reset(): Promise<void> {
  await side`select tests.fx_feed_clear()`;
  for (const who of [content, reportsOnly, bare]) await side`select tests.fx_sf_revoke_all(${who}::uuid)`;
}
beforeEach(async () => {
  await reset();
  await grant(content, ['REPORTS_VIEW', 'CONTENT_MODERATE', 'AUDIT_LOG_VIEW']);
  await grant(reportsOnly, ['REPORTS_VIEW']);
});
afterAll(async () => {
  await reset();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[I14c §9.9] my work, by key', () => {
  it('counts only the areas the keys cover, names the oldest and the next item, and refuses a community account', T, async () => {
    await seedReport(reporter, 'user', author, 'spam');
    expect((await readMyWork(database, id(author))).kind).toBe('forbidden');
    const none = await readMyWork(database, id(bare));
    expect(none).toMatchObject({ kind: 'ok', work: { counters: {}, oldest: null, next: null } });
    const reports = await readMyWork(database, id(reportsOnly));
    expect(reports.kind === 'ok' && reports.work.counters).toMatchObject({ openReports: 1, childSafetyReports: 0, pastTargetReports: 0 });
    expect(reports.kind === 'ok' && reports.work.counters.queuedImages).toBeUndefined();
    expect(reports.kind === 'ok' && reports.work.next).toMatchObject({ targetKind: 'user', targetId: author, timeTargetHours: 24, pastTarget: false });
    const images = await readMyWork(database, id(content));
    expect(images.kind === 'ok' && typeof images.work.counters.queuedImages).toBe('number');
  });

  it('[§9.9] the queue gives each item its time target: child safety one hour, other reports 24 hours', T, async () => {
    const postId = await seedPost(author, 'everyone');
    await seedReport(reporter, 'post', postId, 'child_safety');
    await seedReport(reporter, 'user', author, 'spam');
    const queue = await readReportQueue(database, id(reportsOnly));
    expect(queue.kind === 'ok' && queue.items.map((item) => [item.targetKind, item.timeTargetHours, item.pastTarget])).toEqual([
      ['post', 1, false],
      ['user', 24, false],
    ]);
  });
});

describe('[I14c §9.9 §9.10] escalation and handling status', () => {
  it('a Moderator escalates with a note (again if needed); the Admin sees it and who opened the report', T, async () => {
    await seedReport(reporter, 'user', author, 'harassment');
    expect((await escalateReport(database, id(admin), { targetKind: 'user', targetId: author, note: 'נא להחליט' })).kind).toBe('forbidden');
    expect((await escalateReport(database, id(bare), { targetKind: 'user', targetId: author, note: 'נא להחליט' })).kind).toBe('forbidden');
    expect((await escalateReport(database, id(reportsOnly), { targetKind: 'user', targetId: reporter, note: 'נא להחליט' })).kind).toBe('not_found');
    expect((await escalateReport(database, id(reportsOnly), { targetKind: 'user', targetId: author, note: 'נא להחליט' })).kind).toBe('ok');
    expect((await escalateReport(database, id(reportsOnly), { targetKind: 'user', targetId: author, note: 'שוב, דחוף' })).kind).toBe('ok');
    expect((await readReportDetail(database, id(reportsOnly), 'user', author)).kind).toBe('ok');
    const detail = await readReportDetail(database, id(admin), 'user', author);
    expect(detail.kind === 'ok' && detail.detail.handling?.escalation?.isMe).toBe(false);
    expect(['נא להחליט', 'שוב, דחוף']).toContain(detail.kind === 'ok' ? detail.detail.handling?.escalation?.note : '');
    expect(detail.kind === 'ok' && detail.detail.handling?.openings.map((o) => o.isMe).sort()).toEqual([false, true]);
    const queue = await readReportQueue(database, id(admin));
    expect(queue.kind === 'ok' && queue.items[0]).toMatchObject({ escalated: true, openedBy: 2 });
    const overview = await readAdminOverview(database, id(admin));
    expect(overview.kind === 'ok' && overview.overview.attention.escalatedReports).toBe(1);
  });

  it('[§9.10] the Admin alone has the Admin home', T, async () => {
    expect((await readAdminOverview(database, id(content))).kind).toBe('forbidden');
    expect((await readAdminOverview(database, id(author))).kind).toBe('forbidden');
    const overview = await readAdminOverview(database, id(admin));
    expect(overview.kind).toBe('ok');
    expect(overview.kind === 'ok' && overview.overview.metrics.map((m) => m.key)).toEqual(['registrations', 'posts', 'comments', 'reports', 'enforcements', 'support']);
  });
});

describe('[I14c §9.7] independent review: staff read every active post and write nothing', () => {
  it('the staff feed shows a Friends-only post of a stranger; a comment and a like are refused; the thread opens', T, async () => {
    const postId = await seedPost(author, 'friends');
    const feed = await readFeedPage(database, id(admin), null);
    expect(feed.kind).toBe('page');
    expect(feed.kind === 'page' && feed.page.items.some((item) => item.id === postId)).toBe(true);
    const moderatorFeed = await readFeedPage(database, id(bare), null);
    expect(moderatorFeed.kind === 'page' && moderatorFeed.page.items.some((item) => item.id === postId)).toBe(true);
    const stranger = await readFeedPage(database, id(reporter), null);
    expect(stranger.kind === 'page' && stranger.page.items.some((item) => item.id === postId)).toBe(false);
    expect((await createComment(database, id(admin), postId, { body: 'staff comment' })).kind).toBe('forbidden');
    expect((await likeTarget(database, id(bare), 'post', postId)).kind).toBe('forbidden');
    expect((await readThread(database, id(admin), postId, null)).kind).toBe('thread');
  });
});

describe('[I14c §9.2 §9.10] children trends and the Audit Log filters', () => {
  it('only CHILD_DATA_VIEW reads the trends (suppressed cells carry no number), and every query is in the sensitive view', T, async () => {
    const query = { metric: 'bottle', field: 'amount_ml', dimension: 'child_sex', days: 30 } as const;
    expect((await readChildTrendsView(database, id(content), query)).kind).toBe('forbidden');
    expect((await readChildTrendsView(database, id(author), query)).kind).toBe('forbidden');
    const trends = await readChildTrendsView(database, id(admin), query);
    expect(trends.kind === 'ok' && trends.trends.cells.map((cell) => cell.bucket)).toEqual(['girl', 'boy', 'unknown']);
    for (const cell of trends.kind === 'ok' ? trends.trends.cells : []) if (cell.suppressed) expect([cell.children, cell.value]).toEqual([null, null]);
    const audit = await readAudit(database, id(admin), undefined, { sensitive: 'true' });
    expect(audit.kind === 'ok' && audit.page.entries[0]?.action).toBe('child_data_queried');
    const byRole = await readAudit(database, id(admin), undefined, { role: 'moderator', action: 'child_data_queried' });
    expect(byRole.kind === 'ok' && byRole.page.entries.every((entry) => entry.actorRole === 'moderator')).toBe(true);
  });
});
