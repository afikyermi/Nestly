import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { feedPageResponse, groupDetail, groupMembersResponse, groupsListResponse, groupFriendsResponse, groupInvitationsResponse, searchResponse } from '@nestly/shared';
import { createDatabase, type Database } from '../../src/db/client.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, CLOCK_NOW, post, validBody } from '../helpers/register-app.js';

// Groups (I10; FR-GRP-001..004, FR-ALG-010) through the API against the real database (CI `db` job, as app_server): create, discover, Join and
// Request to Join, the discussion of a Public and a Private Group, Roles and the ownership transfer, invitations, recommendations and the
// staff refusal. The policies themselves are pgTAP's (file 96).

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let app: App;
let owner = '';
let member = '';
let outsider = '';
let staff = '';

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const bearer = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, who: string, payload?: unknown) =>
  app.inject({ method, url: path, headers: { authorization: await bearer(who) }, ...(payload === undefined ? {} : { payload: payload as object }) });
const body = (res: { body: string }): unknown => JSON.parse(res.body);

beforeAll(async () => {
  key = await newKey('groups-db-key');
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
  for (const fullName of ['Ora Owner', 'Mia Member', 'Oded Outsider']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, await bearer(userId), validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [owner = '', member = '', outsider = ''] = made;
  staff = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  await side.begin(async (tx) => {
    await tx`select 1`;
    await tx`select tests.fx_fr_add(${owner}::uuid, ${member}::uuid, 'accepted', false)`;
  });
}, COLD_START_MS * 3);

afterAll(async () => {
  await app.close();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[I10] Groups', () => {
  let pub = '';
  let priv = '';

  it('[FR-GRP-004 AC-056] a member creates Public and Private Groups and is their Owner; staff cannot (ERR-022); a short name is 422', T, async () => {
    const a = await call('POST', '/api/groups', owner, { name: 'הליכות בוקר', description: 'עגלות ושמש', privacy: 'public' });
    expect(a.statusCode).toBe(201);
    const created = groupDetail.parse(body(a));
    expect([created.myRole, created.state, created.memberCount, created.notificationMode]).toEqual(['owner', 'member', 1, 'highlights']);
    pub = created.id;
    const b = await call('POST', '/api/groups', owner, { name: 'הורים בשקט', privacy: 'private', rules: 'בלי פרסומות' });
    priv = groupDetail.parse(body(b)).id;
    expect((await call('POST', '/api/groups', staff, { name: 'צוות', privacy: 'public' })).statusCode).toBe(403);
    const short = await call('POST', '/api/groups', owner, { name: 'אב', privacy: 'public' });
    expect([short.statusCode, body(short)]).toEqual([422, { error: 'name_too_short' }]);
    expect((await call('POST', '/api/groups', owner, { name: 'שם טוב', privacy: 'public', ownerId: member })).statusCode).toBe(400);
  });

  it('[BR-031 BR-032] discovery shows both; a Private Group hides its member count from an outsider; search finds Groups', T, async () => {
    const list = groupsListResponse.parse(body(await call('GET', '/api/groups?scope=discover', outsider)));
    const mine = list.groups.filter((g) => g.id === pub || g.id === priv);
    expect(mine.map((g) => [g.privacy, g.state, g.memberCount]).sort()).toEqual([['private', 'none', null], ['public', 'none', 1]]);
    const found = searchResponse.parse(body(await call('POST', '/api/search', outsider, { q: 'הורים בשקט', type: 'groups' })));
    expect(found.groups.map((g) => g.id)).toContain(priv);
    expect(groupsListResponse.parse(body(await call('GET', '/api/groups?scope=mine', owner))).groups.map((g) => g.id).sort()).toEqual([pub, priv].sort());
  });

  it('[AC-036 BR-031] Join of a Public Group is immediate; only members post; everyone reads; the main feed does not carry group posts', T, async () => {
    const posted = await call('POST', '/api/posts', outsider, { body: 'לא חבר', audience: 'everyone', groupId: pub });
    expect(posted.statusCode).toBe(403);
    const joined = groupDetail.parse(body(await call('PUT', `/api/groups/${pub}/membership`, member)));
    expect([joined.state, joined.myRole, joined.memberCount]).toEqual(['member', 'member', 2]);
    const ok = await call('POST', '/api/posts', member, { body: 'בוקר טוב לכולם', audience: 'everyone', groupId: pub });
    expect(ok.statusCode).toBe(201);
    const postId = String((body(ok) as { id: string }).id);
    const page = feedPageResponse.parse(body(await call('GET', `/api/groups/${pub}/posts`, outsider)));
    expect(page.items.map((u) => u.id)).toContain(postId);
    const feed = feedPageResponse.parse(body(await call('GET', '/api/feed', member)));
    expect(feed.items.map((u) => u.id)).not.toContain(postId);
    expect((await call('POST', '/api/posts', member, { body: 'x', audience: 'friends', groupId: pub })).statusCode).toBe(422);
  });

  it('[AC-037 BR-032 VAL-020 ERR-018] a Private Group: a request, a second one 409, approval; an outsider reads none of its posts', T, async () => {
    const asked = groupDetail.parse(body(await call('PUT', `/api/groups/${priv}/membership`, member)));
    expect(asked.state).toBe('requested');
    const again = await call('PUT', `/api/groups/${priv}/membership`, member);
    expect(groupDetail.parse(body(again)).state).toBe('requested');
    const requests = await call('GET', `/api/groups/${priv}/requests`, owner);
    expect((body(requests) as { people: { userId: string; fullName: string }[] }).people.map((p) => [p.userId, p.fullName])).toEqual([[member, 'Mia Member']]);
    expect((await call('GET', `/api/groups/${priv}/requests`, member)).statusCode).toBe(403);
    expect((await call('PUT', `/api/groups/${priv}/requests/${member}`, owner, { decision: 'approve' })).statusCode).toBe(204);
    const detail = groupDetail.parse(body(await call('GET', `/api/groups/${priv}`, member)));
    expect(detail.myRole).toBe('member');
    const posted = await call('POST', '/api/posts', owner, { body: 'רק לחברי הקבוצה', audience: 'everyone', groupId: priv });
    const postId = String((body(posted) as { id: string }).id);
    expect(feedPageResponse.parse(body(await call('GET', `/api/groups/${priv}/posts`, member))).items.map((u) => u.id)).toContain(postId);
    expect(feedPageResponse.parse(body(await call('GET', `/api/groups/${priv}/posts`, outsider))).items).toEqual([]);
    expect((await call('GET', `/api/posts/${postId}`, outsider)).statusCode).toBe(404);
    expect((await call('GET', `/api/groups/${priv}/members`, outsider)).statusCode).toBe(403);
  });

  it('[AC-038 ERR-026 ERR-019] Roles: the Owner cannot leave; a member changes no Role; a transfer makes a new Owner', T, async () => {
    const leave = await call('DELETE', `/api/groups/${pub}/membership`, owner);
    expect([leave.statusCode, body(leave)]).toEqual([409, { error: 'owner_must_transfer' }]);
    expect((await call('PATCH', `/api/groups/${pub}/members/${owner}`, member, { role: 'member' })).statusCode).toBe(403);
    const moved = await call('PATCH', `/api/groups/${pub}/members/${member}`, owner, { role: 'owner' });
    expect(moved.statusCode).toBe(200);
    const roles = groupMembersResponse.parse(body(moved)).members.map((m) => [m.userId, m.role]).sort();
    expect(roles).toEqual([[member, 'owner'], [owner, 'admin']].sort());
    expect((await call('DELETE', `/api/groups/${pub}/membership`, owner)).statusCode).toBe(200);
  });

  it('[FR-GRP-002 AC-050] invitations to a Friend, accepted; a recommendation notifies the Friend with the Group as target', T, async () => {
    const g = groupDetail.parse(body(await call('POST', '/api/groups', owner, { name: 'מעגל קטן', privacy: 'private' }))).id;
    const friends = groupFriendsResponse.parse(body(await call('GET', `/api/groups/${g}/friends`, owner)));
    expect(friends.friends.map((f) => [f.userId, f.isMember, f.isInvited])).toEqual([[member, false, false]]);
    expect((await call('POST', `/api/groups/${g}/invitations`, owner, { userId: outsider })).statusCode).toBe(422);
    expect((await call('POST', `/api/groups/${g}/invitations`, owner, { userId: member })).statusCode).toBe(204);
    const mine = groupInvitationsResponse.parse(body(await call('GET', '/api/group-invitations', member)));
    const invitation = mine.invitations.find((i) => i.group.id === g);
    expect(invitation?.inviterName).toBe('Ora Owner');
    const answered = await call('PUT', `/api/group-invitations/${invitation?.id ?? ''}`, member, { answer: 'accept' });
    expect([answered.statusCode, body(answered)]).toEqual([200, { groupId: g }]);
    expect(groupDetail.parse(body(await call('GET', `/api/groups/${g}`, member))).myRole).toBe('member');
    expect((await call('POST', `/api/groups/${pub}/recommendations`, owner, { userId: member })).statusCode).toBe(204);
    const notes = await call('GET', '/api/notifications', member);
    const items = (body(notes) as { items: { type: string; targetKind: string; targetId: string; targetName?: string | null }[] }).items;
    expect(items.find((n) => n.type === 'group_recommended')).toMatchObject({ targetKind: 'group', targetId: pub, targetName: 'הליכות בוקר' });
    expect((await call('POST', `/api/groups/${pub}/recommendations`, owner, { userId: outsider })).statusCode).toBe(422);
  });

  it('[VAL-035] a member sets the Group notification mode; an outsider cannot', T, async () => {
    expect((await call('PUT', `/api/groups/${priv}/notifications`, member, { mode: 'all' })).statusCode).toBe(204);
    expect(groupDetail.parse(body(await call('GET', `/api/groups/${priv}`, member))).notificationMode).toBe('all');
    expect((await call('PUT', `/api/groups/${priv}/notifications`, outsider, { mode: 'all' })).statusCode).toBe(403);
    expect((await call('PUT', `/api/groups/${priv}/notifications`, member, { mode: 'loud' })).statusCode).toBe(400);
  });

  it('[FR-GRP-003] remove and block, then unblock; the Owner deletes the Group and it is gone', T, async () => {
    expect((await call('DELETE', `/api/groups/${priv}/members/${member}?block=true`, owner)).statusCode).toBe(204);
    expect(groupDetail.parse(body(await call('GET', `/api/groups/${priv}`, member))).state).toBe('blocked');
    const asked = await call('PUT', `/api/groups/${priv}/membership`, member);
    expect([asked.statusCode, body(asked)]).toEqual([403, { error: 'blocked_from_group' }]);
    expect((await call('DELETE', `/api/groups/${priv}/bans/${member}`, owner)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/groups/${priv}`, member)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/groups/${priv}`, owner)).statusCode).toBe(204);
    expect((await call('GET', `/api/groups/${priv}`, owner)).statusCode).toBe(404);
  });
});
