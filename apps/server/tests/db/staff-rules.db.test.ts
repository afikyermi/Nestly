import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { handleReports, readReportDetail, readReportQueue, readUser } from '../../src/services/admin-service.js';
import { createComment, readThread } from '../../src/services/comments-service.js';
import { decideBlockListMatch } from '../../src/services/media-queue-service.js';
import { readUserProfile } from '../../src/services/profile-view-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, post, validBody } from '../helpers/register-app.js';

// The staff's rules, second completion, against the real database (CI `db` job, as app_server; I14 completion B, Afik 21.10.2026 (b),
// decisions-in-force.md §10.3, §10.4, §10.9, and the night approval of the ten-identical-reports hide). The services run in the identity
// transaction exactly as the routes call them; the policies, triggers and the definer are pgTAP's (file 103).

const T = { timeout: COLD_START_MS };
const REPORTERS = 10;

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let author = '';
let viewer = '';
let reporters: string[] = [];
let content = ''; // sf_m1: REPORTS_VIEW + CONTENT_MODERATE + USER_VIEW
let reportsOnly = ''; // sf_m2: REPORTS_VIEW

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
const seedPost = async (by: string, body = 'a post for the staff rules'): Promise<string> => {
  let out = '';
  await inTx(async (tx) => {
    out = await text(tx`select tests.fx_po_add(${by}::uuid, 'everyone', false, 'active', ${body}, null, null)::text as v`);
  });
  return out;
};
const seedReport = (by: string, kind: 'post' | 'comment' | 'user', target: string, reason: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by}::uuid, ${kind}, ${target}::uuid, ${reason}, null)`));
const auditCount = async (action: string): Promise<number> => Number(await text(side`select tests.fx_sf_audit(${action}) as v`));
const visibleTo = async (who: string, postId: string): Promise<boolean> => (await readThread(database, id(who), postId, null)).kind === 'thread';

beforeAll(async () => {
  key = await newKey('staff-rules-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  const env = { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() };
  const app: App = await buildRegisterApp(env, { database, clock: () => new Date('2026-06-15T10:00:00.000Z') });
  const made: string[] = [];
  const names = ['Rina Author', 'Yael Viewer', ...Array.from({ length: REPORTERS }, (_, i) => `Reporter Number${String.fromCharCode(65 + i)}`)];
  for (const fullName of names) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [author = '', viewer = '', ...reporters] = made;
  await app.close();
  content = await text(side`select tests.fx_sf_id('sf_m1')::text as v`);
  reportsOnly = await text(side`select tests.fx_sf_id('sf_m2')::text as v`);
}, COLD_START_MS * 6);

async function reset(): Promise<void> {
  await side`select tests.fx_feed_clear()`;
  for (const who of [content, reportsOnly]) await side`select tests.fx_sf_revoke_all(${who}::uuid)`;
}
beforeEach(async () => {
  await reset();
  await grant(content, ['REPORTS_VIEW', 'CONTENT_MODERATE', 'USER_VIEW']);
  await grant(reportsOnly, ['REPORTS_VIEW']);
});
afterAll(async () => {
  await reset();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[F14.3-b FR-MOD-003 OP-053] a justified report deletes the content', () => {
  it('[AC-159 AC-131 FR-MOD-002] the post is gone for everyone, the Audit Log has it, and the author\'s history keeps the rule and 100 characters', T, async () => {
    const long = `${'מבצע ענק על עגלות '.repeat(8)}סוף`;
    const postId = await seedPost(author, long);
    await seedReport(viewer, 'post', postId, 'spam');
    // the reversible hide is gone; "removed" closes as justified only
    expect((await handleReports(database, id(content), { targetKind: 'post', targetId: postId, resolution: 'action_taken', moderation: { status: 'hidden', reason: 'x' } })).kind).toBe('invalid');
    expect((await handleReports(database, id(content), { targetKind: 'post', targetId: postId, resolution: 'dismissed', moderation: { status: 'removed', reason: 'x' } })).kind).toBe('invalid');
    expect((await handleReports(database, id(reportsOnly), { targetKind: 'post', targetId: postId, resolution: 'action_taken', moderation: { status: 'removed', reason: 'x' } })).kind).toBe('forbidden');
    expect(await visibleTo(viewer, postId), 'the reporter alone stops seeing a post they reported (BR-074)').toBe(false);
    expect(await visibleTo(reporters[0] ?? '', postId)).toBe(true);
    const before = await auditCount('content_deleted');
    const done = await handleReports(database, id(content), { targetKind: 'post', targetId: postId, resolution: 'action_taken', moderation: { status: 'removed', reason: 'פרסום ללא שיתוף ידע' } });
    expect(done).toMatchObject({ kind: 'ok', closed: 1 });
    expect(await auditCount('content_deleted')).toBe(before + 1);
    expect(await visibleTo(reporters[0] ?? '', postId)).toBe(false);
    expect(await visibleTo(author, postId), 'its author too').toBe(false);
    const user = await readUser(database, id(content), author);
    expect(user.kind).toBe('ok');
    const decisions = user.kind === 'ok' ? (user.user.contentDecisions ?? []) : [];
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ targetKind: 'post', rule: 'spam' });
    expect([...(decisions[0]?.excerpt ?? '')].length).toBeLessThanOrEqual(100);
    expect(long.startsWith(decisions[0]?.excerpt ?? '-')).toBe(true);
    // the queue no longer has it; a second decision finds nothing
    const queue = await readReportQueue(database, id(content));
    expect(queue.kind === 'ok' && queue.items.some((item) => item.targetId === postId)).toBe(false);
  });

  it('[AC-159] without USER_VIEW no history is shown; dismissing deletes nothing', T, async () => {
    const postId = await seedPost(author);
    await seedReport(viewer, 'post', postId, 'harassment');
    expect(await handleReports(database, id(content), { targetKind: 'post', targetId: postId, resolution: 'dismissed' })).toMatchObject({ kind: 'ok', closed: 1 });
    expect(await visibleTo(reporters[1] ?? '', postId)).toBe(true);
    expect((await readUser(database, id(reportsOnly), author)).kind).toBe('forbidden');
  });
});

describe('[F14.3-b BR-074 Afik 21.10 night] ten different people with the same reason hide the item until a decision', () => {
  it('[AC-160 OP-062] hidden from everyone else; the queue says why and puts it right after child safety; a closing decision lifts it', T, async () => {
    const older = await seedPost(author, 'an older reported post');
    await seedReport(viewer, 'post', older, 'spam');
    const postId = await seedPost(author, 'a post many people report');
    for (const who of reporters.slice(0, REPORTERS - 1)) await seedReport(who, 'post', postId, 'harassment');
    expect(await visibleTo(viewer, postId), 'nine identical reports hide nothing').toBe(true);
    await seedReport(reporters[REPORTERS - 1] ?? '', 'post', postId, 'harassment');
    expect(await visibleTo(viewer, postId), 'the tenth person hides it from everyone else').toBe(false);
    expect(await visibleTo(author, postId), 'its author sees no change').toBe(true);
    const queue = await readReportQueue(database, id(reportsOnly));
    if (queue.kind !== 'ok') throw new Error('queue refused');
    expect(queue.items.map((item) => item.targetId)).toEqual([postId, older]);
    expect(queue.items[0]).toMatchObject({ autoHidden: true, autoHiddenReporters: REPORTERS, reportCount: REPORTERS });
    expect(queue.items[0]?.autoHiddenReasonLabel).toBeTruthy();
    expect(queue.items[1]?.autoHidden).toBe(false);
    expect(await handleReports(database, id(content), { targetKind: 'post', targetId: postId, resolution: 'dismissed', note: 'לא הפרה' })).toMatchObject({ kind: 'ok', closed: REPORTERS });
    expect(await visibleTo(viewer, postId), 'the decision lifts the hide').toBe(true);
  });
});

describe('[F14.3-b decision 10.9] a reported comment opens alone, and every opening is audited', () => {
  it('[AC-161 FR-MOD-001 FR-MOD-003] no post and no thread; also after the report closed; each opening is in the Audit Log', T, async () => {
    const postId = await seedPost(author, 'the post under the comment');
    const made = await createComment(database, id(author), postId, { body: 'the reported comment' });
    if (made.kind !== 'comment') throw new Error(`comment refused: ${made.kind}`);
    const commentId = made.comment.id;
    expect((await createComment(database, id(viewer), postId, { body: 'another comment in the thread' })).kind).toBe('comment');
    await seedReport(viewer, 'comment', commentId, 'harassment');
    const before = await auditCount('reported_comment_viewed');
    const first = await readReportDetail(database, id(reportsOnly), 'comment', commentId);
    if (first.kind !== 'ok') throw new Error('detail refused');
    expect(first.detail.content?.text).toBe('the reported comment');
    expect(first.detail.context, 'only the reported item: no post, no thread').toBeUndefined();
    expect(await auditCount('reported_comment_viewed')).toBe(before + 1);
    expect(await handleReports(database, id(content), { targetKind: 'comment', targetId: commentId, resolution: 'dismissed' })).toMatchObject({ kind: 'ok', closed: 1 });
    const again = await readReportDetail(database, id(content), 'comment', commentId);
    expect(again.kind === 'ok' && again.detail.context).toBeUndefined();
    expect(await auditCount('reported_comment_viewed')).toBe(before + 2);
    // a reported post still shows its thread (FR-MOD-003)
    await seedReport(viewer, 'post', postId, 'spam');
    const onPost = await readReportDetail(database, id(reportsOnly), 'post', postId);
    expect(onPost.kind === 'ok' && onPost.detail.context?.comments.length).toBe(2);
  });
});

describe('[F14.3-b §10.3 BR-081] staff open a restricted profile in full, audited', () => {
  it('[AC-161 BR-081 OP-058] a stranger sees the restricted profile; a staff member sees it as a Friend does, and the opening is audited', T, async () => {
    await inTx(async (tx) => void (await tx`select tests.fx_privacy_put(${author}::uuid, 'restricted', true, true)`));
    try {
      const stranger = await readUserProfile(database, id(viewer), author);
      expect(stranger.kind === 'profile' && stranger.profile.gender).toBeNull();
      const before = await auditCount('staff_profile_viewed');
      const staff = await readUserProfile(database, id(reportsOnly), author);
      expect(staff.kind).toBe('profile');
      expect(staff.kind === 'profile' && staff.profile.gender).not.toBeNull();
      expect(await auditCount('staff_profile_viewed')).toBe(before + 1);
    } finally {
      await inTx(async (tx) => void (await tx`select tests.fx_privacy_put(${author}::uuid, 'open', true, true)`));
    }
  });
});

describe('[F14.3-b AC-162 §11.7] a block-list match is decided by CONTENT_MODERATE only', () => {
  it('nothing to decide, or no key: not found (the database decides; nothing written)', T, async () => {
    const before = await auditCount('media_hash_not_abuse');
    const unknown = '00000000-0000-4000-8000-000000000162';
    expect(await decideBlockListMatch(database, id(reportsOnly), unknown, 'not_abuse')).toEqual({ kind: 'not_found' });
    expect(await decideBlockListMatch(database, id(content), unknown, 'confirmed')).toEqual({ kind: 'not_found' });
    expect(await decideBlockListMatch(database, id(viewer), unknown, 'not_abuse')).toEqual({ kind: 'not_found' });
    expect(await auditCount('media_hash_not_abuse')).toBe(before);
  });
});
