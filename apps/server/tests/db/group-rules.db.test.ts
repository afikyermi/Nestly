import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  feedPageResponse,
  groupDetail,
  groupEnforcementsResponse,
  groupInvitationsResponse,
  groupPendingInvitationsResponse,
  groupsListResponse,
  notificationsResponse,
  searchResponse,
  type FeedPageResponse,
  type FeedUnit,
} from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { withoutRewriteParam } from '../../src/lib/vercel-rewrite.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// I10 completion C (Afik 21.10.2026, decisions-in-force §11.13-11.17) through the API against the real database (CI `db` job, as app_server):
// only a Group's Highlights reach its members' main feed, labelled with the Group, never a non-member's; the threshold is 5% of the members,
// 3 to 20; active Groups are lifted in search, discovery and a non-member's feed; any member invites a Friend, a Private Group's invitation
// waits for approval; warning + mute, removal + block and unblock, no plain removal. The policies are pgTAP's (files 96 and 106).

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let owner = '';
let a = '';
let b = '';
let c = '';
let outsider = '';

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const bearer = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, who: string, payload?: Record<string, unknown>) =>
  app.inject({ method, url: path, headers: { authorization: await bearer(who) }, ...(payload === undefined ? {} : { payload }) });
const body = (res: { body: string }): unknown => JSON.parse(res.body);
const idOf = (res: { body: string }): string => String(Reflect.get(Object(body(res)), 'id'));
const createGroup = async (who: string, name: string, privacy: 'public' | 'private'): Promise<string> =>
  groupDetail.parse(body(await call('POST', '/api/groups', who, { name, privacy, description: 'קבוצה לבדיקה' }))).id;
const groupPost = async (who: string, group: string, text_: string, isAnonymous = false): Promise<string> => {
  const res = await call('POST', '/api/posts', who, { body: text_, audience: 'everyone', groupId: group, ...(isAnonymous ? { isAnonymous } : {}) });
  if (res.statusCode !== 201) throw new Error(`group post failed: ${res.statusCode} ${res.body}`);
  return idOf(res);
};
const like = async (who: string, postId: string) => expect((await call('PUT', `/api/posts/${postId}/like`, who)).statusCode).toBeLessThan(300);
const commentOn = async (who: string, postId: string) =>
  expect((await call('POST', `/api/posts/${postId}/comments`, who, { body: 'תגובה' })).statusCode).toBe(201);

/** The viewer's whole feed (every page, at most 40), in order, and the first page. */
async function wholeFeed(who: string): Promise<{ units: FeedUnit[]; first: FeedPageResponse }> {
  const units: FeedUnit[] = [];
  let cursor: string | null = null;
  let first: FeedPageResponse | null = null;
  for (let i = 0; i < 40; i += 1) {
    const res = await call('GET', `/api/feed${cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`}`, who);
    const page = feedPageResponse.parse(body(res));
    first ??= page;
    units.push(...page.items);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  if (first === null) throw new Error('no feed page');
  return { units, first };
}

beforeAll(async () => {
  key = await newKey('group-rules-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  app = await buildRegisterApp(
    { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() },
    { database, clock: () => CLOCK_NOW },
  );
  const made: string[] = [];
  for (const fullName of ['Rina Owner', 'Avi Member', 'Bat Member', 'Chen Member', 'Dor Outsider']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, await bearer(userId), validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [owner = '', a = '', b = '', c = '', outsider = ''] = made;
  await side.begin(async (tx) => {
    await tx`select 1`;
    await tx`select tests.fx_fr_add(${a}::uuid, ${outsider}::uuid, 'accepted', false)`;
    await tx`select tests.fx_fr_add(${c}::uuid, ${outsider}::uuid, 'accepted', false)`;
  });
}, COLD_START_MS * 3);

afterAll(async () => {
  await side`select tests.fx_fr_purge(${a}::uuid)`.catch(() => undefined);
  await side`select tests.fx_fr_purge(${c}::uuid)`.catch(() => undefined);
  await app.close();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[I10-C] Group Highlights, exposure, invitations and enforcement', () => {
  let pub = '';
  let priv = '';
  let highlight = '';
  let quiet = '';
  let anonymous = '';
  let privHighlight = '';

  it('[FR-GRP-001 FR-ALG-010 AC-066 BR-060 §11.13] a Group post reaches its members\' main feed only as a Highlight, with "מתוך"; the rest stays in the Group', T, async () => {
    pub = await createGroup(owner, 'שכונה ערה', 'public');
    for (const who of [a, b, c]) expect((await call('PUT', `/api/groups/${pub}/membership`, who)).statusCode).toBe(200);
    const detail = groupDetail.parse(body(await call('GET', `/api/groups/${pub}`, a)));
    expect(detail.highlightThreshold, 'four members: 5% rounded up, at least 3').toBe(3);
    highlight = await groupPost(owner, pub, 'שאלה טובה לכולם');
    quiet = await groupPost(owner, pub, 'פוסט רגיל בקבוצה');
    await like(a, highlight);
    await like(b, highlight);
    let feed = await wholeFeed(a);
    expect(feed.units.map((u) => u.id), 'two engagements by others: not yet a Highlight').not.toContain(highlight);
    await commentOn(c, highlight);
    feed = await wholeFeed(a);
    const unit = feed.units.find((u) => u.id === highlight);
    expect(unit?.kind === 'post' ? unit.group : undefined).toEqual({ id: pub, name: 'שכונה ערה', privacy: 'public' });
    expect(feed.units.map((u) => u.id), 'a post that is not a Highlight stays on the Group page').not.toContain(quiet);
    const page = feedPageResponse.parse(body(await call('GET', `/api/groups/${pub}/posts`, a)));
    expect(page.items.map((u) => u.id)).toEqual(expect.arrayContaining([highlight, quiet]));
    expect(page.items.every((u) => u.kind !== 'post' || u.group === undefined), 'no "מתוך" label on the Group\'s own page').toBe(true);
    const highlights = feedPageResponse.parse(body(await call('GET', `/api/groups/${pub}/posts?view=highlights`, a)));
    expect(highlights.items.map((u) => u.id)).toEqual([highlight]);
  });

  it('[§11.13 FR-FEED-001] a non-member never gets a Group\'s Highlight in the main feed (a Public one neither); it gets the active Group as a unit', T, async () => {
    const feed = await wholeFeed(outsider);
    expect(feed.units.map((u) => u.id)).not.toContain(highlight);
    expect((feed.first.suggestedGroups ?? []).map((g) => g.id), '§11.14: an active Public Group is suggested to a non-member').toContain(pub);
    const suggestion = (feed.first.suggestedGroups ?? []).find((g) => g.id === pub);
    expect(suggestion).toEqual({ id: pub, name: 'שכונה ערה', description: 'קבוצה לבדיקה', memberCount: 4 });
    const mine = await wholeFeed(a);
    expect((mine.first.suggestedGroups ?? []).map((g) => g.id), 'never a Group one is already in').not.toContain(pub);
  });

  it('[§11.13 OP-045 FR-FEED-005] an anonymous Highlight stays anonymous in the feed, with its Group', T, async () => {
    anonymous = await groupPost(a, pub, 'שאלה אנונימית', true);
    for (const who of [owner, b, c]) await like(who, anonymous);
    const unit = (await wholeFeed(b)).units.find((u) => u.id === anonymous);
    expect(unit?.isAnonymous).toBe(true);
    expect(unit !== undefined && 'author' in unit).toBe(false);
    expect(unit?.kind === 'post' ? unit.group?.id : undefined).toBe(pub);
  });

  it('[§11.13 BR-032] a Private Group\'s Highlight reaches its members and no one else', T, async () => {
    priv = await createGroup(owner, 'סוד קטן', 'private');
    for (const who of [a, b, c]) {
      expect((await call('PUT', `/api/groups/${priv}/membership`, who)).statusCode).toBe(200);
      expect((await call('PUT', `/api/groups/${priv}/requests/${who}`, owner, { decision: 'approve' })).statusCode).toBe(204);
    }
    privHighlight = await groupPost(owner, priv, 'רק לחברים');
    await like(a, privHighlight);
    await like(b, privHighlight);
    await commentOn(c, privHighlight);
    const member = (await wholeFeed(b)).units.find((u) => u.id === privHighlight);
    expect(member?.kind === 'post' ? member.group?.name : undefined).toBe('סוד קטן');
    const out = await wholeFeed(outsider);
    expect(out.units.map((u) => u.id)).not.toContain(privHighlight);
    expect((out.first.suggestedGroups ?? []).map((g) => g.id), 'a Private Group is never suggested from its activity').not.toContain(priv);
  });

  it('[§11.14 FR-SEARCH-001] two Groups that match alike: the active one ranks first in search and discovery; a quiet one is not lifted', T, async () => {
    const still = await createGroup(owner, 'מפגש גלים שקט', 'public');
    const lively = await createGroup(owner, 'מפגש גלים חי', 'public');
    for (const who of [a, b, c]) expect((await call('PUT', `/api/groups/${lively}/membership`, who)).statusCode).toBe(200);
    await groupPost(a, lively, 'מי מגיע מחר?');
    const found = searchResponse.parse(body(await call('POST', '/api/search', outsider, { q: 'מפגש גלים', type: 'groups' })));
    const order = found.groups.map((g) => g.id).filter((id) => id === still || id === lively);
    expect(order).toEqual([lively, still]);
    const listed = groupsListResponse.parse(body(await call('GET', '/api/groups?scope=discover&q=%D7%9E%D7%A4%D7%92%D7%A9%20%D7%92%D7%9C%D7%99%D7%9D', outsider)));
    expect(listed.groups.map((g) => g.id).filter((id) => id === still || id === lively)).toEqual([lively, still]);
    const out = await wholeFeed(outsider);
    expect((out.first.suggestedGroups ?? []).map((g) => g.id), 'a quiet Group is never suggested').not.toContain(still);
  });

  it('[FR-GRP-002 §11.15] any member invites a Friend; in a Private Group it waits for the Owner, who approves; the invitee joins', T, async () => {
    const sent = await call('POST', `/api/groups/${priv}/invitations`, a, { userId: outsider });
    expect([sent.statusCode, body(sent)]).toEqual([200, { status: 'awaiting_approval' }]);
    const before = groupInvitationsResponse.parse(body(await call('GET', '/api/group-invitations', outsider)));
    expect(before.invitations.map((i) => i.group.id), 'the invitee sees nothing yet').not.toContain(priv);
    expect((await call('GET', `/api/groups/${priv}/invitations`, a)).statusCode, 'a plain member reads no queue').toBe(403);
    const queue = groupPendingInvitationsResponse.parse(body(await call('GET', `/api/groups/${priv}/invitations`, owner)));
    const waiting = queue.invitations.find((i) => i.invitee.userId === outsider);
    expect([waiting?.inviter.fullName, waiting?.invitee.fullName]).toEqual(['Avi Member', 'Dor Outsider']);
    const notes = notificationsResponse.parse(body(await call('GET', '/api/notifications', owner))).items;
    expect(notes.map((n) => n.type)).toContain('group_invitation_pending');
    expect((await call('PUT', `/api/groups/${priv}/invitations/${waiting?.id ?? ''}`, a, { decision: 'approve' })).statusCode).toBe(403);
    expect((await call('PUT', `/api/groups/${priv}/invitations/${waiting?.id ?? ''}`, owner, { decision: 'approve' })).statusCode).toBe(204);
    const after = groupInvitationsResponse.parse(body(await call('GET', '/api/group-invitations', outsider)));
    const mine = after.invitations.find((i) => i.group.id === priv);
    expect(mine?.inviterName).toBe('Avi Member');
    const answered = await call('PUT', `/api/group-invitations/${mine?.id ?? ''}`, outsider, { answer: 'accept' });
    expect([answered.statusCode, body(answered)]).toEqual([200, { groupId: priv }]);
    const inviterNotes = notificationsResponse.parse(body(await call('GET', '/api/notifications', a))).items;
    expect(inviterNotes.map((n) => n.type)).toContain('group_invitation_approved');
    const publicInvite = await call('POST', `/api/groups/${pub}/invitations`, c, { userId: outsider });
    expect([publicInvite.statusCode, body(publicInvite)], 'a Public Group: sent at once').toEqual([200, { status: 'sent' }]);
  });

  it('[FR-GRP-003 AC-038 §11.16] warning + mute: read-only with a notice; remove + block; unblock; a plain member enforces nothing', T, async () => {
    expect((await call('PATCH', `/api/groups/${pub}/members/${b}`, owner, { role: 'moderator' })).statusCode).toBe(200);
    expect((await call('POST', `/api/groups/${pub}/enforcements`, a, { userId: c, kind: 'warn_mute', reason: 'spam', muteHours: 24 })).statusCode).toBe(403);
    expect((await call('POST', `/api/groups/${pub}/enforcements`, b, { userId: c, kind: 'warn_mute', reason: 'spam' })).statusCode, 'a mute has its duration').toBe(400);
    expect((await call('POST', `/api/groups/${pub}/enforcements`, b, { userId: c, kind: 'warn_mute', reason: 'other', muteHours: 24 })).statusCode).toBe(400);
    expect((await call('POST', `/api/groups/${pub}/enforcements`, b, { userId: owner, kind: 'warn_mute', reason: 'spam', muteHours: 24 })).statusCode).toBe(403);
    const warned = await call('POST', `/api/groups/${pub}/enforcements`, b, { userId: c, kind: 'warn_mute', reason: 'other', reasonText: 'נא לשמור על טון מכבד', muteHours: 168 });
    expect(warned.statusCode).toBe(204);
    const seen = groupDetail.parse(body(await call('GET', `/api/groups/${pub}`, c)));
    expect([seen.myMute?.reason, seen.myMute?.reasonText]).toEqual(['other', 'נא לשמור על טון מכבד']);
    expect(Date.parse(seen.myMute?.until ?? '') - Date.now()).toBeGreaterThan(6 * 24 * 3600_000);
    expect(groupDetail.parse(body(await call('GET', `/api/groups/${pub}`, a))).myMute, 'no one else sees it').toBeNull();
    const notes = notificationsResponse.parse(body(await call('GET', '/api/notifications', c))).items;
    const notice = notes.find((n) => n.type === 'group_member_muted');
    expect([notice?.targetKind, notice?.targetId, notice?.actorName], 'no manager is named').toEqual(['group', pub, null]);
    expect((await call('POST', '/api/posts', c, { body: 'מושתק', audience: 'everyone', groupId: pub })).statusCode).toBe(403);
    expect((await call('POST', `/api/groups/${pub}/invitations`, c, { userId: outsider })).statusCode).toBe(403);
    expect(feedPageResponse.parse(body(await call('GET', `/api/groups/${pub}/posts`, c))).items.length, 'a muted member still reads').toBeGreaterThan(0);
    const history = groupEnforcementsResponse.parse(body(await call('GET', `/api/groups/${pub}/enforcements`, b)));
    expect(history.records.map((r) => [r.kind, r.userId, r.fullName])).toEqual([['warn_mute', c, 'Chen Member']]);
    expect(JSON.stringify(history), 'never who acted').not.toContain(b);
    expect((await call('GET', `/api/groups/${pub}/enforcements`, a)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/groups/${pub}/members/${c}`, b)).statusCode, 'no plain removal').toBe(404);
    expect((await call('POST', `/api/groups/${pub}/enforcements`, b, { userId: c, kind: 'remove_block', reason: 'offensive' })).statusCode).toBe(204);
    expect(groupDetail.parse(body(await call('GET', `/api/groups/${pub}`, c))).state).toBe('blocked');
    expect((await call('PUT', `/api/groups/${pub}/membership`, c)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/groups/${pub}/bans/${c}`, b)).statusCode).toBe(204);
    expect(groupDetail.parse(body(await call('GET', `/api/groups/${pub}`, c))).state).toBe('none');
    const after = groupEnforcementsResponse.parse(body(await call('GET', `/api/groups/${pub}/enforcements`, owner)));
    expect(after.records.map((r) => r.kind)).toEqual(['unblock', 'remove_block', 'warn_mute']);
  });

  it('[#147 strict query] the Group page\'s query, as Vercel\'s rewrite sends it, is accepted after the adapter', T, async () => {
    const path = withoutRewriteParam(`/api/groups/${pub}/posts?view=highlights&path=groups/${pub}/posts`);
    expect(path).toBe(`/api/groups/${pub}/posts?view=highlights`);
    expect((await call('GET', path, a)).statusCode).toBe(200);
    expect((await call('GET', `/api/groups/${pub}/posts?view=loud`, a)).statusCode).toBe(400);
  });
});
