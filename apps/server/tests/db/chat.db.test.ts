import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { readReportDetail, readReportQueue } from '../../src/services/admin-service.js';
import { acceptChatRequest, changeChatBlock, endChatRequest, openThread, readOverview, readUnread, sendMessage, startChat } from '../../src/services/chat-service.js';
import { fileReport } from '../../src/services/reports-service.js';
import {
  changeSupportStatus,
  createSupportRequest,
  listOwnRequests,
  openOwnThread,
  readSupportInbox,
  readSupportRequest,
  replyAsSupport,
  replyOwn,
  viewReportedMessage,
} from '../../src/services/support-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// Chat and Support (I8) through the services against the real database (CI `db` job, as app_server): the path of a first message (FR-CHAT-002), a
// request accepted or declined (a decline is no block, §9.3), the thread and its unread state (FR-CHAT-001), a Chat Block that stops both sides
// (§9.4), a reported message opened by staff with an Audit entry (§9.6), and a Support request from the form to the inbox, a reply as "Support",
// an internal note, closing (final) (FR-ADMIN-001/002, FR-CHAT-004, AC-024, AC-053). The policies themselves are pgTAP's (file 94). Chat rows are
// never deleted (§9.2): every account here is registered fresh, so earlier runs' rows never meet these.

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let ana = '';
let ben = '';
let cal = '';
let admin = '';
let moderator = '';

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const as = (userId: string) => ({ userId });
const auditCount = async (action: string): Promise<number> => Number(await text(side`select tests.fx_sf_audit(${action}) as v`));
const isOk = <T extends { kind: string }>(outcome: T): outcome is Extract<T, { kind: 'ok' }> => outcome.kind === 'ok';
function ok<T extends { kind: string }>(outcome: T): Extract<T, { kind: 'ok' }> {
  expect(outcome.kind).toBe('ok');
  if (!isOk(outcome)) throw new Error(`expected ok, got ${outcome.kind}`);
  return outcome;
}

beforeAll(async () => {
  key = await newKey('chat-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() }, { database, clock: () => CLOCK_NOW });
  const made: string[] = [];
  for (const fullName of ['Ana Chat', 'Ben Chat', 'Cal Chat']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [ana = '', ben = '', cal = ''] = made;
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  moderator = await text(side`select tests.fx_fr_id('fr_m')::text as v`);
  await side.begin(async (tx) => {
    await tx`select 1`;
    await tx`select tests.fx_fr_add(${ana}::uuid, ${cal}::uuid, 'accepted', false)`;
  });
}, COLD_START_MS * 3);

afterAll(async () => {
  await app.close();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[FR-CHAT-002 FR-CHAT-003 AC-051] a first message', () => {
  it('to a non-Friend is a chat request the target sees with the name and text; a second one waits for the answer', T, async () => {
    expect(ok(await startChat(database, as(ana), ben, 'שלום, נפגשנו בקבוצה')).result).toEqual({ kind: 'request' });
    const benView = await readOverview(database, as(ben));
    expect(benView.incoming.map((r) => [r.userId, r.name, r.text])).toEqual([[ana, 'Ana Chat', 'שלום, נפגשנו בקבוצה']]);
    expect(benView.unreadTotal).toBe(1);
    expect((await readOverview(database, as(ana))).outgoing.map((r) => r.userId)).toEqual([ben]);
    expect(await startChat(database, as(ana), ben, 'שוב')).toEqual({ kind: 'request_pending' });
    expect(await startChat(database, as(ben), ana, 'ובכיוון השני')).toEqual({ kind: 'request_pending' });
  });

  it('[§9.3] a decline ends that request only: the requester may ask again later', T, async () => {
    const [request] = (await readOverview(database, as(ben))).incoming;
    expect(await endChatRequest(database, as(ben), request?.id ?? '', 'target')).toEqual({ kind: 'ok' });
    expect((await readOverview(database, as(ana))).outgoing).toEqual([]);
    expect(ok(await startChat(database, as(ana), ben, 'אולי עכשיו?')).result).toEqual({ kind: 'request' });
  });

  it('[AC-051 FR-CHAT-001] an accept opens the conversation with the opening message first; a message is unread until the thread opens', T, async () => {
    const [request] = (await readOverview(database, as(ben))).incoming;
    const { conversationId } = ok(await acceptChatRequest(database, as(ben), request?.id ?? ''));
    expect(await acceptChatRequest(database, as(ben), request?.id ?? '')).toEqual({ kind: 'unavailable' });
    ok(await sendMessage(database, as(ana), conversationId, 'תודה שאישרת'));
    const benList = await readOverview(database, as(ben));
    expect(benList.conversations.map((c) => [c.otherUserId, c.otherName, c.unread, c.lastMessage?.text])).toEqual([[ana, 'Ana Chat', 1, 'תודה שאישרת']]);
    expect(await readUnread(database, as(ben))).toBe(1);
    const thread = ok(await openThread(database, as(ben), conversationId)).thread;
    expect(thread.messages.map((m) => [m.text, m.mine, m.isOpening])).toEqual([
      ['אולי עכשיו?', false, true],
      ['תודה שאישרת', false, false],
    ]);
    expect(await readUnread(database, as(ben))).toBe(0);
    expect(ok(await startChat(database, as(ben), ana, 'גם אני כאן')).result).toEqual({ kind: 'conversation', conversationId });
    expect(await openThread(database, as(cal), conversationId)).toEqual({ kind: 'unavailable' });
  });

  it('[FR-CHAT-002 AC-045] Friends open a conversation directly', T, async () => {
    const started = ok(await startChat(database, as(ana), cal, 'היי חברה'));
    expect(started.result.kind).toBe('conversation');
    expect((await readOverview(database, as(cal))).conversations.map((c) => c.otherUserId)).toEqual([ana]);
  });
});

describe('[FR-SERV-009 AC-052 §9.4] a Chat Block', () => {
  it('stops both sides; the blocker lifts it', T, async () => {
    const conversationId = (await readOverview(database, as(ana))).conversations.find((c) => c.otherUserId === ben)?.id ?? '';
    expect(await changeChatBlock(database, as(ben), ana, true)).toEqual({ kind: 'ok' });
    expect(await changeChatBlock(database, as(ben), ana, true)).toEqual({ kind: 'ok' });
    expect(await sendMessage(database, as(ana), conversationId, 'שומע?')).toEqual({ kind: 'blocked' });
    expect(await sendMessage(database, as(ben), conversationId, 'ואני?')).toEqual({ kind: 'blocked' });
    expect(await startChat(database, as(ana), ben, 'דרך ההתחלה')).toEqual({ kind: 'blocked' });
    const anaThread = ok(await openThread(database, as(ana), conversationId)).thread;
    expect([anaThread.canSend, anaThread.blockedByMe]).toEqual([false, false]);
    expect(ok(await openThread(database, as(ben), conversationId)).thread.blockedByMe).toBe(true);
    expect(await changeChatBlock(database, as(ana), ben, false)).toEqual({ kind: 'ok' }); // the blocked side lifts nothing
    expect(await sendMessage(database, as(ana), conversationId, 'עדיין?')).toEqual({ kind: 'blocked' });
    expect(await changeChatBlock(database, as(ben), ana, false)).toEqual({ kind: 'ok' });
    ok(await sendMessage(database, as(ana), conversationId, 'חזרנו'));
    expect(await changeChatBlock(database, as(ben), ben, true)).toEqual({ kind: 'invalid' });
  });
});

describe('[§9.6] a reported message', () => {
  it('the other party reports it; staff see the report without the text, open the one message with an Audit entry, never the conversation', T, async () => {
    const conversationId = (await readOverview(database, as(ben))).conversations.find((c) => c.otherUserId === ana)?.id ?? '';
    const sent = ok(await sendMessage(database, as(ana), conversationId, 'הודעה מטרידה'));
    expect(await fileReport(database, as(ben), { targetKind: 'message', targetId: sent.id, reason: 'harassment', details: null })).toEqual({ kind: 'received' });
    const queue = ok(await readReportQueue(database, as(admin))).items;
    expect(queue.some((item) => item.targetKind === 'message' && item.targetId === sent.id)).toBe(true);
    const detail = ok(await readReportDetail(database, as(admin), 'message', sent.id)).detail;
    expect([detail.content, detail.reports.map((r) => r.copiedText)]).toEqual([null, [null]]);
    const before = await auditCount('reported_message_viewed');
    const opened = ok(await viewReportedMessage(database, as(admin), sent.id)).message;
    expect([opened.text, opened.senderId, opened.user?.fullName]).toEqual(['הודעה מטרידה', ana, 'Ana Chat']);
    expect(await auditCount('reported_message_viewed')).toBe(before + 1);
    expect(await openThread(database, as(admin), conversationId)).toEqual({ kind: 'unavailable' });
    expect(await viewReportedMessage(database, as(moderator), sent.id)).toEqual({ kind: 'forbidden' });
    expect(await viewReportedMessage(database, as(admin), conversationId)).toEqual({ kind: 'not_found' });
  });
});

describe('[FR-ADMIN-001 FR-ADMIN-002 FR-CHAT-004 AC-024 AC-053] Support', () => {
  it('a request reaches the inbox; a reply shows in Chat as Support; an internal note never does; closed is final', T, async () => {
    const { id } = ok(await createSupportRequest(database, as(cal), 'privacy_safety', 'מישהו משתמש בתמונה שלי'));
    expect((await listOwnRequests(database, as(cal))).map((r) => [r.id, r.topic, r.status])).toEqual([[id, 'privacy_safety', 'open']]);
    expect((await readOverview(database, as(cal))).support).toEqual([]); // no reply yet: no thread in Chat
    const inbox = ok(await readSupportInbox(database, as(admin), 'open')).items;
    expect(inbox.find((item) => item.id === id)?.userName).toBe('Cal Chat');
    expect(await readSupportInbox(database, as(moderator), undefined)).toEqual({ kind: 'forbidden' });

    const audited = await auditCount('support_replied');
    expect(await replyAsSupport(database, as(admin), id, 'בודקים, תודה', false)).toEqual({ kind: 'ok' });
    expect(await replyAsSupport(database, as(admin), id, 'לבדוק מול הדיווחים', true)).toEqual({ kind: 'ok' });
    expect(await auditCount('support_replied')).toBe(audited + 1);
    const chat = await readOverview(database, as(cal));
    expect(chat.support.map((s) => [s.id, s.lastMessage?.text, s.lastMessage?.fromSupport, s.unread])).toEqual([[id, 'בודקים, תודה', true, 1]]);
    const thread = ok(await openOwnThread(database, as(cal), id)).thread;
    expect(thread.messages.map((m) => [m.text, m.fromSupport])).toEqual([['בודקים, תודה', true]]);
    expect(await replyOwn(database, as(cal), id, 'תודה רבה')).toEqual({ kind: 'ok' });
    expect(ok(await readSupportRequest(database, as(admin), id)).detail.messages.map((m) => [m.author, m.internal])).toEqual([
      ['support', false],
      ['support', true],
      ['user', false],
    ]);

    expect(await changeSupportStatus(database, as(admin), id, 'closed')).toEqual({ kind: 'ok' });
    expect(await replyOwn(database, as(cal), id, 'עוד שאלה')).toEqual({ kind: 'closed' });
    expect(await replyAsSupport(database, as(admin), id, 'עוד תשובה', false)).toEqual({ kind: 'not_applicable' });
    expect(await changeSupportStatus(database, as(admin), id, 'open')).toEqual({ kind: 'not_applicable' });
    expect(await createSupportRequest(database, as(moderator), 'bug', 'צוות לא שולח')).toEqual({ kind: 'not_allowed' });
    expect(await openOwnThread(database, as(ana), id)).toEqual({ kind: 'unavailable' });
  });
});
