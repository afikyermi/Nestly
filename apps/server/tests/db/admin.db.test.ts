import { PERMISSION_KEYS } from '@nestly/shared';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { readAccountState } from '../../src/services/account-state-service.js';
import {
  enforce,
  handleReports,
  listUsers,
  moderateContent,
  readAccess,
  readAudit,
  readReportDetail,
  readReportQueue,
  readUser,
  revealAnonymousAuthor,
} from '../../src/services/admin-service.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { buildRegisterApp, post, validBody } from '../helpers/register-app.js';

// The admin core's services against the real database (CI `db` job, as app_server): FR-MOD-002, FR-MOD-003, FR-ADMIN-005, BR-074, AC-022, AC-027,
// AC-028, AC-029, AC-031, AC-077, AC-106, AC-107, AC-110. The services run in the identity transaction exactly as the routes call them; the staff
// accounts are the fixtures (fr_d Admin, sf_m1.. Moderators) and their keys are committed by tests.fx_sf_grant and removed again after each test.
// The policies, triggers and the two definer functions are pgTAP's (file 90); here: what the services return and refuse.

const T = { timeout: COLD_START_MS };
const NOBODY = '99999999-9999-4999-8999-999999999999';

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
let database: Database;
let author = '';
let reporter = '';
let third = '';
let admin = '';
let content = ''; // M1: REPORTS_VIEW + CONTENT_MODERATE + AUDIT_LOG_VIEW
let viewer = ''; // M2: REPORTS_VIEW only
let enforcer = ''; // M4: USER_VIEW + USER_WARN + USER_SUSPEND + REPORTS_VIEW
let banner = ''; // M5: USER_VIEW + USER_BAN
let bare = ''; // fr_m: no key

const url = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
};
const text = async (query: PromiseLike<ReadonlyArray<Record<string, unknown>>>): Promise<string> => String((await query)[0]?.v);
async function inTx(work: (tx: postgres.TransactionSql) => Promise<void>): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await work(tx);
  });
}
const id = (who: string) => ({ userId: who });
const grant = (who: string, keys: string[]) => inTx(async (tx) => void (await tx`select tests.fx_sf_grant(${who}::uuid, ${keys}::text[])`));
const seedPost = (by: string, anonymous = false): Promise<string> =>
  (async () => {
    let out = '';
    await inTx(async (tx) => {
      out = await text(tx`select tests.fx_po_add(${by}::uuid, 'everyone', ${anonymous}, 'active', 'post body', null, null)::text as v`);
    });
    return out;
  })();
const seedReport = (by: string, kind: 'post' | 'comment' | 'user', target: string, reason: string): Promise<void> =>
  inTx(async (tx) => void (await tx`select tests.fx_rp_add(${by}::uuid, ${kind}, ${target}::uuid, ${reason}, null)`));
const statusOf = async (who: string): Promise<string> => text(side`select split_part(tests.fx_user(${who}::uuid), '/', 2) as v`);
const auditCount = async (action: string): Promise<number> => Number(await text(side`select tests.fx_sf_audit(${action}) as v`));

beforeAll(async () => {
  key = await newKey('admin-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  database = createDatabase(url());
  const env = { SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() };
  const app: App = await buildRegisterApp(env, { database, clock: () => new Date('2026-06-15T10:00:00.000Z') });
  const made: string[] = [];
  for (const fullName of ['Adi Author', 'Rina Reporter', 'Tali Third']) {
    const userId = await text(side`select tests.fx_new_auth_user()::text as v`);
    const res = await post(app, `Bearer ${await token({ key, sub: userId })}`, validBody({ fullName }));
    if (res.statusCode !== 201) throw new Error(`could not register ${fullName}: ${res.statusCode} ${res.body}`);
    made.push(userId);
  }
  [author = '', reporter = '', third = ''] = made;
  await app.close();
  const staff = async (name: string, kind: 'fr' | 'sf') =>
    text(kind === 'fr' ? side`select tests.fx_fr_id(${name})::text as v` : side`select tests.fx_sf_id(${name})::text as v`);
  admin = await staff('fr_d', 'fr');
  bare = await staff('fr_m', 'fr');
  content = await staff('sf_m1', 'sf');
  viewer = await staff('sf_m2', 'sf');
  enforcer = await staff('sf_m4', 'sf');
  banner = await staff('sf_m5', 'sf');
}, COLD_START_MS * 3);

async function reset(): Promise<void> {
  await side`select tests.fx_feed_clear()`;
  for (const who of [author, reporter, third]) {
    await side`select tests.fx_fr_purge(${who}::uuid)`.catch(() => undefined);
  }
  for (const who of [content, viewer, enforcer, banner, bare]) await side`select tests.fx_sf_revoke_all(${who}::uuid)`;
}
beforeEach(async () => {
  await reset();
  await grant(content, ['REPORTS_VIEW', 'CONTENT_MODERATE', 'AUDIT_LOG_VIEW']);
  await grant(viewer, ['REPORTS_VIEW']);
  await grant(enforcer, ['USER_VIEW', 'USER_WARN', 'USER_SUSPEND', 'REPORTS_VIEW']);
  await grant(banner, ['USER_VIEW', 'USER_BAN']);
});
afterAll(async () => {
  await reset();
  await database.close();
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[I4 FR-MOD-002 AC-025 AC-031] who is staff, and with which keys', () => {
  it('[AC-025] the Admin holds every Moderator key; [AC-031] a Moderator only its own; a Regular account and a key-less Moderator are forbidden', T, async () => {
    const a = await readAccess(database, id(admin));
    expect(a.kind === 'ok' && a.access.role).toBe('admin');
    expect(a.kind === 'ok' && a.access.permissions.length).toBe(14);
    const m = await readAccess(database, id(content));
    expect(m.kind === 'ok' && m.access.permissions).toEqual(['AUDIT_LOG_VIEW', 'CONTENT_MODERATE', 'REPORTS_VIEW']);
    expect((await readAccess(database, id(author))).kind).toBe('forbidden');
    expect(await readAccess(database, id(bare))).toMatchObject({ kind: 'ok', access: { role: 'moderator', permissions: [] } });
  });

  it('[AC-031] without the key every admin read is forbidden', T, async () => {
    expect((await readReportQueue(database, id(bare))).kind).toBe('forbidden');
    expect((await readAudit(database, id(viewer), undefined)).kind).toBe('forbidden');
    expect((await listUsers(database, id(content), 'x')).kind).toBe('forbidden');
    expect((await readReportQueue(database, id(author))).kind).toBe('forbidden');
  });
});

describe('[I4 FR-MOD-003 AC-022 AC-106 AC-107 BR-074] the moderation queue', () => {
  it('[AC-106] a child-safety report comes first, before older reports of lower priority; [AC-107] a post with 3 reports rises one level and stays visible', T, async () => {
    const spam = await seedPost(author);
    const rising = await seedPost(author);
    const child = await seedPost(author);
    await seedReport(reporter, 'post', spam, 'spam');
    await seedReport(reporter, 'post', rising, 'impersonation');
    await seedReport(third, 'post', rising, 'impersonation');
    await seedReport(admin, 'post', rising, 'impersonation');
    await seedReport(third, 'post', child, 'child_safety');
    const q = await readReportQueue(database, id(content));
    if (q.kind !== 'ok') throw new Error('queue refused');
    expect(q.items.map((i) => i.targetId)).toEqual([child, rising, spam]);
    expect(q.items.find((i) => i.targetId === child)?.priority).toBe(1);
    expect(q.items.find((i) => i.targetId === spam)?.priority).toBe(4);
    // three people reported it: the priority of its reason (3) rises one level
    expect(q.items.find((i) => i.targetId === rising)).toMatchObject({ reportCount: 3, priority: 2, isRising: true });
  });

  it('[AC-106] child safety stays first even when an older post has risen with three reports of a high-priority reason', T, async () => {
    const risen = await seedPost(author);
    const child = await seedPost(author);
    await seedReport(reporter, 'post', risen, 'harassment');
    await seedReport(third, 'post', risen, 'harassment');
    await seedReport(admin, 'post', risen, 'harassment');
    await seedReport(reporter, 'post', child, 'child_safety');
    const q = await readReportQueue(database, id(content));
    if (q.kind !== 'ok') throw new Error('queue refused');
    expect(q.items.map((i) => i.targetId)).toEqual([child, risen]);
    expect(q.items.find((i) => i.targetId === risen)).toMatchObject({ reportCount: 3, priority: 2, isRising: false });
  });

  it('[AC-022] the Admin and a Moderator with REPORTS_VIEW read the report; the detail carries the copy of the text; a Moderator without the key is forbidden', T, async () => {
    const p = await seedPost(author);
    await seedReport(reporter, 'post', p, 'harassment');
    const d = await readReportDetail(database, id(viewer), 'post', p);
    if (d.kind !== 'ok') throw new Error('detail refused');
    expect(d.detail.reports[0]).toMatchObject({ reason: 'harassment', copiedText: 'post body' });
    expect(d.detail.content).toMatchObject({ text: 'post body', status: 'active', isAnonymous: false });
    expect(d.detail.user).toBeNull(); // no USER_VIEW: no account
    expect((await readReportDetail(database, id(admin), 'post', p)).kind).toBe('ok');
    expect((await readReportDetail(database, id(banner), 'post', p)).kind).toBe('forbidden');
    expect((await readReportDetail(database, id(admin), 'post', NOBODY)).kind).toBe('not_found');
  });
});

describe('[I4 FR-MOD-003 AC-029 BR-080] handling reports and moderating content', () => {
  it('hides the post and closes the report in one step; the audit has both entries with the reason; the report leaves the queue', T, async () => {
    const p = await seedPost(author);
    await seedReport(reporter, 'post', p, 'harassment');
    const before = await auditCount('content_hidden');
    const r = await handleReports(database, id(content), {
      targetKind: 'post',
      targetId: p,
      resolution: 'action_taken',
      moderation: { status: 'hidden', reason: 'against the rules' },
    });
    expect(r).toMatchObject({ kind: 'ok', closed: 1 });
    expect(await auditCount('content_hidden')).toBe(before + 1);
    expect(await auditCount('report_handled')).toBeGreaterThan(0);
    const q = await readReportQueue(database, id(content));
    expect(q.kind === 'ok' && q.items.length).toBe(0);
    const detail = await readReportDetail(database, id(content), 'post', p);
    expect(detail.kind === 'ok' && detail.detail.content?.status).toBe('hidden');
  });

  it('a moderation move needs CONTENT_MODERATE and a reason; a report is not closed twice; the content is restored by a later move', T, async () => {
    const p = await seedPost(author);
    await seedReport(reporter, 'post', p, 'spam');
    expect((await handleReports(database, id(viewer), { targetKind: 'post', targetId: p, resolution: 'dismissed', moderation: { status: 'removed', reason: 'x' } })).kind).toBe('forbidden');
    expect((await handleReports(database, id(viewer), { targetKind: 'post', targetId: p, resolution: 'dismissed' })).kind).toBe('forbidden'); // REPORTS_VIEW alone closes nothing (AC-022): the report is there, the move is refused
    expect((await handleReports(database, id(content), { targetKind: 'post', targetId: NOBODY, resolution: 'dismissed' })).kind).toBe('not_found');
    expect(await handleReports(database, id(content), { targetKind: 'post', targetId: p, resolution: 'dismissed', note: 'no problem' })).toMatchObject({ kind: 'ok', closed: 1 });
    expect((await handleReports(database, id(content), { targetKind: 'post', targetId: p, resolution: 'dismissed' })).kind).toBe('not_found');
    expect((await moderateContent(database, id(content), { targetKind: 'post', targetId: p, status: 'removed', reason: 'later' })).kind).toBe('ok');
    expect((await moderateContent(database, id(content), { targetKind: 'post', targetId: p, status: 'active', reason: 'restored' })).kind).toBe('ok');
    expect(await auditCount('content_restored')).toBeGreaterThan(0);
  });
});

describe('[I4 AC-077 BR-062] revealing the author of an anonymous post', () => {
  it('works from the handling of an open report, with both keys, and is audited; without CONTENT_MODERATE or after the report is closed it is refused', T, async () => {
    const p = await seedPost(author, true);
    await seedReport(reporter, 'post', p, 'spam');
    const before = await auditCount('author_revealed');
    const revealed = await revealAnonymousAuthor(database, id(content), p);
    expect(revealed).toMatchObject({ kind: 'ok', author: { userId: author, fullName: 'Adi Author' } });
    expect(await auditCount('author_revealed')).toBe(before + 1);
    expect((await revealAnonymousAuthor(database, id(viewer), p)).kind).toBe('forbidden');
    expect((await revealAnonymousAuthor(database, id(author), p)).kind).toBe('forbidden');
    await handleReports(database, id(content), { targetKind: 'post', targetId: p, resolution: 'dismissed' });
    expect((await revealAnonymousAuthor(database, id(content), p)).kind).toBe('forbidden');
    expect(await auditCount('author_revealed')).toBe(before + 1);
  });

  it('the detail of an anonymous post names no author', T, async () => {
    const p = await seedPost(author, true);
    await seedReport(reporter, 'post', p, 'spam');
    const d = await readReportDetail(database, id(admin), 'post', p);
    expect(d.kind === 'ok' && d.detail.user).toBeNull();
    expect(d.kind === 'ok' && d.detail.content?.isAnonymous).toBe(true);
  });
});

describe('[I4 FR-MOD-002 BR-074 AC-027 AC-028 AC-107 AC-110] enforcement', () => {
  it('[AC-107] the ladder suggests a warning first; a warning leaves the account active and is audited with the reason', T, async () => {
    const u = await readUser(database, id(enforcer), reporter);
    expect(u.kind === 'ok' && u.user.suggestion).toEqual({ kind: 'warning', hours: null });
    const r = await enforce(database, id(enforcer), { userId: reporter, kind: 'warning', reason: 'first warning' });
    expect(r).toMatchObject({ kind: 'ok', user: { status: 'active', suggestion: { kind: 'suspension', hours: 24 } } });
    expect(await auditCount('user_warn')).toBeGreaterThan(0);
  });

  it('[AC-028] a suspension has a duration and a reason; the account is suspended until the end time and then reads nothing; a reinstatement ends it', T, async () => {
    const r = await enforce(database, id(enforcer), { userId: reporter, kind: 'suspension', reason: 'rude', durationHours: 24 });
    expect(r.kind === 'ok' && r.user.status).toBe('suspended');
    expect(r.kind === 'ok' && r.user.suspendedUntil).not.toBeNull();
    expect(await statusOf(reporter)).toBe('suspended');
    expect((await enforce(database, id(enforcer), { userId: reporter, kind: 'reinstate', reason: 'enough' })).kind).toBe('ok');
    expect(await statusOf(reporter)).toBe('active');
    expect((await enforce(database, id(enforcer), { userId: reporter, kind: 'reinstate', reason: 'again' })).kind).toBe('not_applicable');
  });

  it('[AC-027] only USER_BAN bans and unbans; staff cannot be acted on; [AC-110] the child-safety ban cites a child-safety report', T, async () => {
    expect((await enforce(database, id(enforcer), { userId: third, kind: 'ban', reason: 'x' })).kind).toBe('forbidden');
    expect((await enforce(database, id(banner), { userId: admin, kind: 'ban', reason: 'x' })).kind).toBe('forbidden');
    expect((await enforce(database, id(banner), { userId: content, kind: 'ban', reason: 'x' })).kind).toBe('forbidden');
    expect((await enforce(database, id(banner), { userId: banner, kind: 'ban', reason: 'x' })).kind).toBe('forbidden');
    expect((await enforce(database, id(banner), { userId: third, kind: 'ban', reason: 'child', childSafety: true })).kind).toBe('invalid');
    const p = await seedPost(third);
    await seedReport(reporter, 'post', p, 'child_safety');
    const reportId = await text(side`select tests.fx_rp_id(${reporter}::uuid, ${p}::uuid)::text as v`);
    await grant(banner, ['REPORTS_VIEW']);
    const banned = await enforce(database, id(banner), { userId: third, kind: 'ban', reason: 'child endangerment', childSafety: true, reportId });
    expect(banned).toMatchObject({ kind: 'ok', user: { status: 'banned' } });
    expect(await statusOf(third)).toBe('banned');
    expect((await enforce(database, id(enforcer), { userId: third, kind: 'unban', reason: 'x' })).kind).toBe('forbidden');
    expect((await enforce(database, id(banner), { userId: third, kind: 'unban', reason: 'mistake' })).kind).toBe('ok');
    expect(await statusOf(third)).toBe('active');
  });

  it('[FR-MOD-002] a suspended account is unavailable until the end time; the next state read after it returns the account to active', T, async () => {
    await enforce(database, id(enforcer), { userId: reporter, kind: 'suspension', reason: 'rude', durationHours: 24 });
    expect(await readAccountState(database, id(reporter))).toEqual({ state: 'unavailable' });
    await side`select tests.fx_sf_expire(${reporter}::uuid)`;
    expect(await readAccountState(database, id(reporter))).toMatchObject({ state: 'active' });
    expect(await statusOf(reporter)).toBe('active');
  });

  it('an enforcement on an account that does not exist is not found', T, async () => {
    expect((await enforce(database, id(enforcer), { userId: NOBODY, kind: 'warning', reason: 'x' })).kind).toBe('not_found');
  });

  it('the user list needs USER_VIEW and a search narrows it by name', T, async () => {
    const all = await listUsers(database, id(banner), 'Rina');
    // other test files leave accounts behind, so: every row matches the text, and the account searched for is among them
    expect(all.kind === 'ok' && all.users.every((u) => (u.fullName ?? '').toLowerCase().includes('rina'))).toBe(true);
    expect(all.kind === 'ok' && all.users.some((u) => u.userId === reporter && u.fullName === 'Rina Reporter')).toBe(true);
    expect((await readUser(database, id(banner), NOBODY)).kind).toBe('not_found');
  });
});

describe('[I4 FR-ADMIN-005] the audit log', () => {
  it('is read by the Admin and by AUDIT_LOG_VIEW, newest first, one page at a time; a Moderator without the key is forbidden', T, async () => {
    await enforce(database, id(enforcer), { userId: reporter, kind: 'warning', reason: 'w' });
    const page = await readAudit(database, id(admin), undefined);
    if (page.kind !== 'ok') throw new Error('audit refused');
    expect(page.page.entries.length).toBeGreaterThan(0);
    expect(page.page.entries[0]?.action).toBe('user_warn');
    const mod = await readAudit(database, id(content), undefined);
    expect(mod.kind).toBe('ok');
    expect((await readAudit(database, id(enforcer), undefined)).kind).toBe('forbidden');
  });

  it('pages by (time, id): more than a page of entries written in one transaction are all read, none twice', T, async () => {
    const mods = [content, viewer, enforcer, banner];
    let written = '';
    await inTx(async (tx) => {
      for (const who of mods) await tx`select tests.fx_sf_revoke_all(${who}::uuid)`;
      const insert = `insert into nestly.moderator_permissions (user_id, permission_key)
        select m, k from unnest(array['${mods.join("','")}']::uuid[]) m cross join unnest(array['${PERMISSION_KEYS.join("','")}']::text[]) k`;
      written = await text(tx`select tests.dml_staff(tests.claims(${admin}::uuid), ${insert}) as v`);
    });
    expect(written).toBe(`OK:${mods.length * PERMISSION_KEYS.length}`);
    const first = await readAudit(database, id(admin), undefined);
    if (first.kind !== 'ok') throw new Error('audit refused');
    expect(first.page.entries).toHaveLength(50);
    const [at = '', entryId = ''] = (first.page.next ?? '').split('|');
    const second = await readAudit(database, id(admin), { at, id: entryId });
    if (second.kind !== 'ok') throw new Error('audit refused');
    const granted = [...first.page.entries, ...second.page.entries].filter((e) => e.action === 'permission_granted');
    expect(new Set(granted.map((e) => e.id)).size).toBe(granted.length);
    expect(granted.length).toBeGreaterThanOrEqual(mods.length * PERMISSION_KEYS.length);
  });
});
