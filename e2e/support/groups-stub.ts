// Shared by e2e/groups.spec.ts (I10; FR-GRP-001..004). The stub plays the server for the Groups API in the shapes of packages/shared (the
// strict response schemas) and records every write. Auth, /api/me, /api/profile, the feed and the notifications repeat notifications-stub.ts.
import type { Page } from '@playwright/test';
import { CORS, json } from './journeys-stub';
import { NID, setupNotifications } from './notifications-stub';

export const GID = (n: number): string => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export interface StubGroup {
  id: string;
  name: string;
  description: string | null;
  privacy: 'public' | 'private';
  memberCount: number | null;
  myRole: 'owner' | 'admin' | 'moderator' | 'member' | null;
  state: 'member' | 'requested' | 'invited' | 'none' | 'blocked';
  rules: string | null;
  /** I10-C: the caller's own mute, when muted. */
  myMute?: { until: string; reason: 'spam' | 'other'; reasonText: string | null } | null;
}

export interface GroupsNet {
  groups: StubGroup[];
  posts: { id: string; groupId: string; body: string }[];
  writes: { method: string; path: string; body: unknown }[];
}

const detailOf = (g: StubGroup) => ({
  ...g,
  pinnedPostId: null,
  notificationMode: g.myRole === null ? null : 'highlights',
  invitationId: null,
  createdAt: '2026-06-01T09:00:00.000Z',
  myMute: g.myMute ?? null,
  highlightThreshold: g.myRole === null ? null : 3,
  managementPaused: (g.myRole === 'admin' || g.myRole === 'moderator') && g.myMute !== undefined && g.myMute !== null ? { until: g.myMute.until } : null,
});
const summaryOf = (g: StubGroup) => ({ id: g.id, name: g.name, description: g.description, privacy: g.privacy, memberCount: g.memberCount, myRole: g.myRole, state: g.state });

export const WALKS: StubGroup = {
  id: GID(1), name: 'הליכות בוקר עם עגלה', description: 'יוצאים יחד בבוקר', privacy: 'public', memberCount: 12, myRole: null, state: 'none', rules: 'נעים ומכבד',
};

export async function setupGroups(page: Page, start: StubGroup[] = [WALKS]): Promise<GroupsNet> {
  await setupNotifications(page, { items: [] });
  const net: GroupsNet = { groups: start.map((g) => ({ ...g })), posts: [], writes: [] };
  const find = (id: string) => net.groups.find((g) => g.id === id);
  let made = 50;
  await page.route(/\/api\/group-invitations(\/.*)?$/, (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { invitations: [] }),
  );
  await page.route(/\/api\/posts\/[^/?]+\/comments(\?.*)?$/, (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [], nextCursor: null }),
  );
  await page.route(/\/api\/posts$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body: unknown = req.postDataJSON();
    net.writes.push({ method: 'POST', path: '/api/posts', body });
    const text = typeof body === 'object' && body !== null ? String(Reflect.get(body, 'body')) : '';
    const groupId = typeof body === 'object' && body !== null ? String(Reflect.get(body, 'groupId')) : '';
    const id = NID((made += 1));
    net.posts.unshift({ id, groupId, body: text });
    return json(route, 201, { id, body: text, audience: 'everyone', stageTag: null, createdAt: '2026-06-15T11:59:00.000Z', isAnonymous: false });
  });
  await page.route(/\/api\/groups(\/.*)?(\?.*)?$/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const parts = url.pathname.split('/').filter(Boolean); // api, groups, :id, sub
    const body: unknown = req.method() === 'GET' || req.method() === 'DELETE' ? null : req.postDataJSON();
    if (req.method() !== 'GET') net.writes.push({ method: req.method(), path: url.pathname, body });
    if (parts.length === 2) {
      if (req.method() === 'POST') {
        const get = (k: string): unknown => (typeof body === 'object' && body !== null ? Reflect.get(body, k) : undefined);
        const group: StubGroup = {
          id: GID((made += 1)),
          name: String(get('name')),
          description: typeof get('description') === 'string' ? String(get('description')) : null,
          privacy: get('privacy') === 'private' ? 'private' : 'public',
          memberCount: 1,
          myRole: 'owner',
          state: 'member',
          rules: null,
        };
        net.groups.push(group);
        return json(route, 201, detailOf(group));
      }
      const scope = url.searchParams.get('scope');
      const list = scope === 'mine' ? net.groups.filter((g) => g.myRole !== null) : net.groups;
      return json(route, 200, { groups: list.map(summaryOf) });
    }
    const group = find(parts[2] ?? '');
    if (group === undefined) return json(route, 404, { error: 'group_unavailable' });
    const sub = parts[3];
    if (sub === undefined) return json(route, 200, detailOf(group));
    if (sub === 'membership' && req.method() === 'PUT') {
      if (group.privacy === 'public') Object.assign(group, { myRole: 'member', state: 'member', memberCount: (group.memberCount ?? 0) + 1 });
      else Object.assign(group, { state: 'requested' });
      return json(route, 200, detailOf(group));
    }
    if (sub === 'posts') {
      const items = net.posts
        .filter((p) => p.groupId === group.id)
        .map((p) => ({
          id: p.id, source: 'organic', audience: 'everyone', stageTag: null, createdAt: '2026-06-15T11:59:00.000Z', likeCount: 0, commentCount: 0,
          likedByMe: false, kind: 'post', body: p.body, isMine: true, isAnonymous: false, author: { name: 'דנה כהן' },
        }));
      return json(route, 200, { items, nextCursor: null, configVersion: 0 });
    }
    if (sub === 'members') {
      const members = [
        { userId: NID(11), fullName: 'דנה כהן', role: group.myRole ?? 'member', isMe: true, joinedAt: '2026-06-15T09:00:00.000Z' },
        { userId: NID(12), fullName: 'יוסי כהן', role: group.myRole === 'owner' ? 'member' : 'owner', isMe: false, joinedAt: '2026-06-01T09:00:00.000Z' },
      ];
      return json(route, 200, { members });
    }
    if (sub === 'requests') {
      if (req.method() === 'PUT') return route.fulfill({ status: 204, headers: CORS });
      return json(route, 200, { people: [{ userId: NID(13), fullName: 'מירי אברהם', at: '2026-06-15T10:00:00.000Z' }] });
    }
    if (sub === 'bans') return json(route, 200, { people: [] });
    // I10-C (§11.15, §11.16)
    if (sub === 'enforcements') {
      if (req.method() === 'POST') return route.fulfill({ status: 204, headers: CORS });
      // OP-070: the caller's own records — the current mute, when there is one
      const mute = group.myMute ?? null;
      if (parts[4] === 'mine' && mute !== null) {
        const record = { id: NID(31), userId: NID(11), fullName: 'דנה כהן', kind: 'warn_mute', reason: mute.reason, reasonText: mute.reasonText, muteUntil: mute.until, createdAt: '2026-06-15T10:00:00.000Z' };
        return json(route, 200, { records: [record] });
      }
      return json(route, 200, { records: [] });
    }
    if (sub === 'invitations') {
      if (req.method() === 'PUT') return route.fulfill({ status: 204, headers: CORS });
      if (req.method() === 'POST') return json(route, 200, { status: group.privacy === 'private' && (group.myRole === 'member' || group.myRole === 'moderator') ? 'awaiting_approval' : 'sent' });
      return json(route, 200, {
        invitations: [
          { id: NID(21), inviter: { userId: NID(12), fullName: 'יוסי כהן' }, invitee: { userId: NID(14), fullName: 'נועה לוי' }, createdAt: '2026-06-15T10:00:00.000Z' },
        ],
      });
    }
    if (sub === 'friends') {
      return json(route, 200, {
        friends: [{ userId: NID(14), fullName: 'נועה לוי', isMember: false, isInvited: false, isAwaitingApproval: false, isRecommended: false }],
      });
    }
    return json(route, 404, { error: 'group_unavailable' });
  });
  return net;
}
