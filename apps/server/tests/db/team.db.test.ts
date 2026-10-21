import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { readFeedPage } from '../../src/services/feed-service.js';
import {
  activeReportReasons,
  addReportReason,
  changeAnnouncementStatus,
  changeReportReason,
  createAnnouncement,
  editAnnouncement,
  inviteModerator,
  joinTeam,
  listAnnouncements,
  readAdminAnalytics,
  readStaffInbox,
  readTeam,
  revokeModeratorInvitation,
  setModeratorKeys,
} from '../../src/services/team-service.js';
import {
  AUDIENCE,
  COLD_START_MS,
  ISSUER,
  newKey,
  restoreEnv,
  startJwks,
  token,
  type App,
  type JwksServer,
  type TestKey,
} from '../helpers/identity-fixtures.js';
import { buildRegisterApp, post, validBody } from '../helpers/register-app.js';

// The Moderators team's services against the real database (CI `db` job, as app_server): FR-ADMIN-004 (the team, invitations, keys), FR-ADMIN-008
// (System Announcements), FR-ADMIN-007 (report reasons), FR-ADMIN-010 / BR-058 (the analytics: numbers only), AC-044 (the staff inbox). The services
// run in the identity transaction exactly as the routes call them; the policies and triggers are pgTAP's (file 95).

const T = { timeout: COLD_START_MS };

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let regular = '';
let admin = '';
let everyKey = ''; // sf_m3 with every key
let reportsOnly = ''; // sf_m2 with REPORTS_VIEW

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
const id = (who: string) => ({ userId: who });
const auditCount = async (action: string): Promise<number> => Number(await text(side`select tests.fx_sf_audit(${action}) as v`));
const newAuthUser = (): Promise<string> => text(side`select tests.fx_new_auth_user()::text as v`);
const ALL_KEYS = [
  'SUPPORT_VIEW',
  'SUPPORT_HANDLE',
  'REPORTS_VIEW',
  'CONTENT_MODERATE',
  'MARKETPLACE_MODERATE',
  'USER_VIEW',
  'USER_WARN',
  'USER_SUSPEND',
  'USER_BAN',
  'ANALYTICS_VIEW',
  'AUDIT_LOG_VIEW',
  'COMMUNITY_CONFIG',
  'SYSTEM_ANNOUNCEMENTS',
  'PRIVATE_GROUP_MODERATE',
];
const grant = (who: string, keys: string[]) =>
  side.begin(async (tx) => {
    await tx`select 1`;
    await tx`select tests.fx_sf_grant(${who}::uuid, ${keys}::text[])`;
  });

beforeAll(async () => {
  key = await newKey('team-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  const env = {
    SUPABASE_JWKS_URL: jwks.url,
    SUPABASE_JWT_ISSUER: ISSUER,
    SUPABASE_JWT_AUDIENCE: AUDIENCE,
    DATABASE_URL: url(),
  };
  const app: App = await buildRegisterApp(env, {
    database,
    clock: () => new Date('2026-06-15T10:00:00.000Z'),
  });
  regular = await newAuthUser();
  const res = await post(app, `Bearer ${await token({ key, sub: regular })}`, validBody({ fullName: 'Noa Regular' }));
  if (res.statusCode !== 201) throw new Error(`could not register: ${res.statusCode} ${res.body}`);
  await app.close();
  admin = await text(side`select tests.fx_fr_id('fr_d')::text as v`);
  everyKey = await text(side`select tests.fx_sf_id('sf_m3')::text as v`);
  reportsOnly = await text(side`select tests.fx_sf_id('sf_m2')::text as v`);
}, COLD_START_MS * 3);

async function reset(): Promise<void> {
  await side`select tests.fx_mt_announcements_clear()`;
  for (const who of [everyKey, reportsOnly]) await side`select tests.fx_sf_revoke_all(${who}::uuid)`;
}
beforeEach(async () => {
  await reset();
  await grant(everyKey, ALL_KEYS);
  await grant(reportsOnly, ['REPORTS_VIEW']);
});
afterAll(async () => {
  await reset();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[I14 FR-ADMIN-004 BR-022 BR-023] the team and its invitations', () => {
  it('[BR-022] only the Admin reads the team; a Moderator holding every key and a user are forbidden', T, async () => {
    const team = await readTeam(database, id(admin));
    if (team.kind !== 'ok') throw new Error('team refused');
    expect(team.team.moderators.some((m) => m.userId === everyKey)).toBe(true);
    expect((await readTeam(database, id(everyKey))).kind).toBe('forbidden');
    expect((await readTeam(database, id(regular))).kind).toBe('forbidden');
  });

  it('[FR-ADMIN-004 BR-023 AC-026] an invitation makes one Moderator with no key; the code works once; the Admin then assigns keys', T, async () => {
    expect((await inviteModerator(database, id(everyKey), 'דנה')).kind).toBe('forbidden');
    const made = await inviteModerator(database, id(admin), 'דנה כהן');
    if (made.kind !== 'ok') throw new Error('invite refused');
    expect(made.invitation.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const before = await auditCount('moderator_joined');
    const first = await newAuthUser();
    expect(await joinTeam(database, id(first), made.invitation.code)).toEqual({ kind: 'joined' });
    expect(await auditCount('moderator_joined')).toBe(before + 1);
    expect(await joinTeam(database, id(await newAuthUser()), made.invitation.code)).toEqual({ kind: 'invalid_code' });
    expect(await joinTeam(database, id(regular), made.invitation.code), 'an account with a Nestly row').toEqual({ kind: 'has_account' });
    const team = await readTeam(database, id(admin));
    if (team.kind !== 'ok') throw new Error('team refused');
    const member = team.team.moderators.find((m) => m.userId === first);
    expect(member).toMatchObject({
      label: 'דנה כהן',
      status: 'active',
      permissions: [],
    });
    expect(team.team.invitations.find((i) => i.id === made.invitation.id)?.state).toBe('accepted');
    expect(await setModeratorKeys(database, id(admin), first, ['USER_VIEW', 'USER_WARN'])).toEqual({ kind: 'ok' });
    expect(await setModeratorKeys(database, id(everyKey), first, ['REPORTS_VIEW']), 'BR-027').toEqual({ kind: 'forbidden' });
    expect(await setModeratorKeys(database, id(admin), regular, ['REPORTS_VIEW']), 'not a Moderator').toEqual({ kind: 'not_found' });
    const after = await readTeam(database, id(admin));
    expect(after.kind === 'ok' && after.team.moderators.find((m) => m.userId === first)?.permissions).toEqual(['USER_VIEW', 'USER_WARN']);
    expect(await setModeratorKeys(database, id(admin), first, [])).toEqual({
      kind: 'ok',
    });
  });

  it('[FR-ADMIN-004] a revoked or unknown code creates nothing; a revoked invitation is not revoked again', T, async () => {
    const made = await inviteModerator(database, id(admin), 'רון');
    if (made.kind !== 'ok') throw new Error('invite refused');
    expect(await revokeModeratorInvitation(database, id(everyKey), made.invitation.id)).toEqual({ kind: 'forbidden' });
    expect(await revokeModeratorInvitation(database, id(admin), made.invitation.id)).toEqual({ kind: 'ok' });
    expect(await revokeModeratorInvitation(database, id(admin), made.invitation.id)).toEqual({ kind: 'not_found' });
    expect(await joinTeam(database, id(await newAuthUser()), made.invitation.code)).toEqual({ kind: 'invalid_code' });
    expect(await joinTeam(database, id(await newAuthUser()), 'A'.repeat(43))).toEqual({ kind: 'invalid_code' });
  });
});

describe('[I14 FR-ADMIN-008 AC-049] System Announcements', () => {
  it('[AC-049] SYSTEM_ANNOUNCEMENTS creates, edits, publishes and removes; the feed shows a published one on its first page only', T, async () => {
    expect(
      (
        await createAnnouncement(database, id(reportsOnly), {
          title: 'תחזוקה',
          body: 'x',
        })
      ).kind,
    ).toBe('forbidden');
    const made = await createAnnouncement(database, id(everyKey), {
      title: 'תחזוקה',
      body: 'האתר ייסגר לשעה',
    });
    if (made.kind !== 'ok') throw new Error('create refused');
    expect(made.item).toMatchObject({ status: 'draft', publishedAt: null });
    const feedBefore = await readFeedPage(database, id(regular), null);
    expect(feedBefore.kind === 'page' && feedBefore.page.announcements).toBeUndefined();
    const edited = await editAnnouncement(database, id(everyKey), made.item.id, { title: 'תחזוקה', body: 'האתר ייסגר לשעתיים' });
    expect(edited.kind === 'ok' && edited.item?.body).toBe('האתר ייסגר לשעתיים');
    const published = await changeAnnouncementStatus(database, id(admin), made.item.id, 'published');
    expect(published.kind === 'ok' && published.item.publishedAt).not.toBeNull();
    expect(await changeAnnouncementStatus(database, id(admin), made.item.id, 'published')).toEqual({ kind: 'not_applicable' });
    const feed = await readFeedPage(database, id(regular), null);
    expect(feed.kind === 'page' && feed.page.announcements?.map((a) => a.title)).toEqual(['תחזוקה']);
    expect(feed.kind === 'page' && Object.keys(feed.page.announcements?.[0] ?? {}).sort()).toEqual(['body', 'id', 'publishedAt', 'title']);
    expect((await changeAnnouncementStatus(database, id(everyKey), made.item.id, 'removed')).kind).toBe('ok');
    const gone = await readFeedPage(database, id(regular), null);
    expect(gone.kind === 'page' && gone.page.announcements).toBeUndefined();
    expect(
      await editAnnouncement(database, id(everyKey), made.item.id, {
        title: 'x y',
        body: 'z',
      }),
    ).toEqual({ kind: 'not_applicable' });
    const list = await listAnnouncements(database, id(admin));
    expect(list.kind === 'ok' && list.items.find((a) => a.id === made.item.id)?.status).toBe('removed');
    expect((await listAnnouncements(database, id(reportsOnly))).kind).toBe('forbidden');
  });
});

describe('[I14 FR-ADMIN-007 AC-048] report reasons', () => {
  it('[AC-048] COMMUNITY_CONFIG changes a reason and adds one; a reporter then reads the active list; others are forbidden', T, async () => {
    expect(
      (
        await changeReportReason(database, id(reportsOnly), 'spam', {
          label: 'ספאם',
          priority: 4,
          sortOrder: 70,
          isActive: true,
        })
      ).kind,
    ).toBe('forbidden');
    const changed = await changeReportReason(database, id(everyKey), 'impersonation', {
      label: 'התחזות לאדם אחר',
      priority: 3,
      sortOrder: 60,
      isActive: false,
    });
    expect(changed.kind === 'ok' && changed.item).toMatchObject({
      key: 'impersonation',
      isActive: false,
    });
    expect(
      (
        await changeReportReason(database, id(everyKey), 'child_safety', {
          label: 'תוכן שמסכן ילד',
          priority: 2,
          sortOrder: 10,
          isActive: true,
        })
      ).kind,
    ).toBe('invalid');
    const added = await addReportReason(database, id(admin), {
      label: 'הונאה',
      priority: 3,
      sortOrder: 75,
    });
    if (added.kind !== 'ok') throw new Error('add refused');
    expect(added.item.key).toMatch(/^custom_[0-9a-f]{8}$/);
    const active = await activeReportReasons(database, id(regular));
    expect(active.map((r) => r.key)).toContain(added.item.key);
    expect(active.map((r) => r.key)).not.toContain('impersonation');
    // back as it was, for the other suites (a switched-off reason refuses new reports)
    await changeReportReason(database, id(admin), 'impersonation', {
      label: 'התחזות',
      priority: 3,
      sortOrder: 60,
      isActive: true,
    });
    await changeReportReason(database, id(admin), added.item.key, {
      label: 'הונאה',
      priority: 3,
      sortOrder: 75,
      isActive: false,
    });
  });
});

describe('[I14 FR-ADMIN-010 BR-058 AC-071 AC-044] numbers only', () => {
  it('[BR-058] ANALYTICS_VIEW and the Admin read counts with no id, name or text; without the key it is forbidden', T, async () => {
    const view = await readAdminAnalytics(database, id(everyKey), 30);
    if (view.kind !== 'ok') throw new Error('analytics refused');
    expect(view.view.accounts.byType.regular).toBeGreaterThan(0);
    expect(view.view.content.posts).toHaveLength(30);
    expect(JSON.stringify(view.view)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no id anywhere
    expect(JSON.stringify(view.view)).not.toContain('Noa');
    expect((await readAdminAnalytics(database, id(admin), 7)).kind).toBe('ok');
    expect((await readAdminAnalytics(database, id(reportsOnly), 30)).kind).toBe('forbidden');
    expect((await readAdminAnalytics(database, id(regular), 30)).kind).toBe('forbidden');
  });

  it('[FR-ADMIN-010 AC-071 SRS audit] a Moderator holding ANALYTICS_VIEW gets the Groups, Professionals and Marketplace counts, numbers only, with no error', T, async () => {
    await grant(reportsOnly, ['ANALYTICS_VIEW']);
    for (const days of [7, 30, 90] as const) {
      const view = await readAdminAnalytics(database, id(reportsOnly), days);
      if (view.kind !== 'ok') throw new Error(`analytics refused for ${days} days: ${view.kind}`);
      const { groups, professionals, marketplace } = view.view;
      for (const n of [groups.active.public, groups.active.private, groups.created, groups.publicMembers, groups.publicJoins, groups.publicPosts, groups.publicComments]) expect(n).toBeGreaterThanOrEqual(0);
      for (const n of [professionals.active, professionals.follows, professionals.chatStarts, professionals.reviews]) expect(n).toBeGreaterThanOrEqual(0);
      for (const n of [marketplace.active, marketplace.created, marketplace.sold, marketplace.chats]) expect(n).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(professionals.byField) && Array.isArray(marketplace.byCategory)).toBe(true);
      expect(JSON.stringify({ groups, professionals, marketplace })).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no id
    }
  });

  it('[AC-044] the staff inbox counts only the areas the keys cover', T, async () => {
    const reports = await readStaffInbox(database, id(reportsOnly));
    expect(reports.kind === 'ok' && Object.keys(reports.inbox).sort()).toEqual(['openReports']);
    const all = await readStaffInbox(database, id(admin));
    expect(all.kind === 'ok' && Object.keys(all.inbox).sort()).toEqual(['openReports', 'queuedImages']);
    expect((await readStaffInbox(database, id(regular))).kind).toBe('forbidden');
  });
});
