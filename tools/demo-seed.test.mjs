// The demo seed (docs/lecturer-demo-plan-HE.md v2 §2-§3; tools/demo-seed): the content is complete and consistent, every request body
// passes the product's own validation, the plan's order respects every dependency, the runner is safe to run twice, nothing but demo
// rows can be moved by the time shift, and the workflow runs by hand from main only, production behind its protected environment.
// No network: the API and Supabase Auth are fakes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as shared from '@nestly/shared';
import { generateAccounts, maskAccounts, parseAccounts } from './demo-seed/accounts.ts';
import { searchText, snippetMatches } from './demo-seed/actions-content.ts';
import { actionHandlers } from './demo-seed/actions.ts';
import * as bodies from './demo-seed/bodies.ts';
import { checkContent } from './demo-seed/check.ts';
import { loadContent } from './demo-seed/content.ts';
import { Api, Auth } from './demo-seed/http.ts';
import { illustrationPng, knownMotif } from './demo-seed/illustration.ts';
import { firstListLength, SCREENS, walk } from './demo-seed/walk.ts';
import { buildPlan, describeStep } from './demo-seed/plan.ts';
import { createContext, dryRun, runPlan } from './demo-seed/runner.ts';
import { buildShift, SHIFT_COLUMNS, touchedTables } from './demo-seed/shift.ts';
import { runShift } from './demo-seed/shift-run.ts';
import { checkAdminUrl, checkTarget } from './demo-seed/target.ts';
import { parseYaml } from './workflow-yaml.mjs';

const content = loadContent();
const personas = [...content.regulars, ...content.professionals];
const keys = personas.map((p) => p.key);
const NOW = new Date('2026-10-27T08:00:00.000Z');
const GUID = '11111111-2222-4333-8444-555555555555';
const silent = () => undefined;

test('the content is consistent: every name, key, group membership and time order checks out', () => {
  assert.deepEqual(checkContent(content), []);
});

test('the content covers the idea document (§5-§6): statuses, a father, seven kinds of professionals, the volumes', () => {
  const r = content.regulars;
  assert.ok(r.length >= 10);
  assert.ok(r.some((p) => p.stages.includes('planning')));
  const weeks = r.flatMap((p) => (p.pregnancyWeek === undefined ? [] : [p.pregnancyWeek]));
  assert.ok(weeks.some((w) => w < 14) && weeks.some((w) => w >= 14 && w < 28) && weeks.some((w) => w >= 28));
  const ages = r.flatMap((p) => p.children.map((c) => c.ageMonths));
  assert.ok(ages.some((a) => a <= 6) && ages.some((a) => a >= 12 && a <= 24) && ages.some((a) => a >= 36 && a < 72));
  assert.ok(r.some((p) => p.children.length >= 3), 'a parent of several children');
  assert.ok(r.some((p) => p.stages.includes('pregnant') && p.stages.includes('has_child')), 'a parent who is also pregnant');
  assert.ok(r.some((p) => p.parentGender === 'man'), 'a father');
  const fields = content.professionals.map((p) => p.field);
  for (const f of ['lactation', 'sleep', 'doula', 'nutrition', 'psychology']) assert.ok(fields.includes(f), f);
  assert.ok(content.professionals.length >= 7);
  assert.ok(content.posts.length >= 50);
  assert.ok(content.posts.every((p) => p.comments.length <= 10));
  assert.ok(content.posts.some((p) => p.anonymous === true), 'an anonymous post');
  assert.ok(content.groups.length >= 5 && content.groups.some((g) => g.privacy === 'private'));
  assert.ok(content.friendships.some((f) => !f.accept), 'pending friend requests');
  assert.ok(content.articles.length >= content.professionals.length);
  assert.ok(content.helpOffers.filter((h) => h.review !== undefined).length >= 3);
  assert.ok(content.posts.some((p) => (p.reports ?? []).length >= 3), 'a post reported by several users');
});

test('every request body passes the product validation (@nestly/shared)', () => {
  const today = bodies.isoDay(NOW);
  const registration = shared.createRegistrationRequestSchema(today, today);
  for (const r of content.regulars) assert.ok(registration.safeParse(bodies.registrationBody(r, NOW)).success, `register ${r.key}`);
  for (const p of content.professionals) assert.ok(shared.professionalRegistrationSchema.safeParse(bodies.professionalBody(p)).success, `pro ${p.key}`);
  for (const g of content.groups) assert.ok(shared.createGroupBody.safeParse(bodies.groupBody(g)).success, `group ${g.key}`);
  for (const a of content.articles) assert.ok(shared.articleSchema.safeParse(bodies.articleBody(a)).success, `article ${a.key}`);
  for (const p of content.posts) {
    assert.equal(shared.checkCreatePost(bodies.postBody(p, p.group === undefined ? undefined : GUID)).ok, true, `post ${p.key}`);
    for (const c of p.comments) {
      assert.equal(shared.checkCreateComment(c.replyTo === undefined ? { body: c.body } : { body: c.body, parentId: GUID }).ok, true, c.key);
      for (const rep of c.reports ?? []) assert.equal(shared.checkCreateReport({ targetKind: 'comment', targetId: GUID, reason: rep.reason, ...(rep.details ? { details: rep.details } : {}) }).ok, true);
    }
    for (const s of p.shares ?? []) assert.ok(shared.createShareSchema.safeParse({ text: s.text ?? null, audience: s.audience }).success);
    for (const rep of p.reports ?? []) assert.equal(shared.checkCreateReport({ targetKind: 'post', targetId: GUID, reason: rep.reason }).ok, true);
  }
  for (const l of content.listings) assert.ok(shared.listingSchema.safeParse(bodies.listingBody(l, [GUID])).success, `listing ${l.key}`);
  for (const c of content.contacts) {
    assert.ok(shared.listingContactSchema.safeParse({ text: c.text }).success);
    for (const m of c.replies) assert.ok(shared.chatMessageSchema.safeParse({ text: m.text }).success);
  }
  for (const h of content.helpOffers) {
    assert.ok(shared.offerHelpSchema.safeParse({ text: h.text }).success, `offer ${h.post}`);
    for (const m of h.conversation ?? []) assert.ok(shared.chatMessageSchema.safeParse({ text: m.text }).success);
    if (h.review) assert.ok(shared.reviewSchema.safeParse({ rating: h.review.rating, text: h.review.text }).success);
  }
  for (const c of content.chats) {
    assert.ok(shared.chatStartSchema.safeParse({ userId: GUID, text: c.messages[0].text }).success);
    if (c.review) assert.ok(shared.reviewSchema.safeParse({ rating: c.review.rating, text: c.review.text }).success);
  }
  for (const t of content.trackers) {
    for (const e of t.events) assert.equal(shared.checkTrackerEventWrite(bodies.trackerBody(e, GUID, NOW), NOW, true).ok, true, `${t.persona} ${e.kind}`);
  }
  for (const c of content.cycles) assert.equal(shared.checkCycleWrite(bodies.cycleBody(c.startDaysAgo, c.cycleLengthDays, NOW), today).ok, true);
  for (const s of content.support) assert.ok(shared.supportRequestSchema.safeParse({ topic: s.topic, text: s.text }).success);
  for (const r of content.userReports) assert.equal(shared.checkCreateReport({ targetKind: 'user', targetId: GUID, reason: r.reason, details: r.details }).ok, true);
  for (const p of content.promotions) {
    const target = p.target.kind === 'profile' ? { kind: 'profile' } : p.target.kind === 'post' ? { kind: 'post', postId: GUID } : { kind: 'listing', listingId: GUID };
    assert.ok(shared.promotionPurchaseSchema.safeParse({ planKey: p.planKey, target }).success, p.planKey);
  }
  for (const s of content.stories) assert.ok(shared.createStoryBody.safeParse({ mediaId: GUID, caption: s.caption, audience: s.audience }).success);
  for (const r of content.regulars) {
    assert.ok(shared.privacySettingsRequest.safeParse({ profileVisibility: r.profileVisibility, isEmptyJourneySentenceShown: true, isChildBirthdayShared: false }).success);
  }
});

test('a category the product does not know yet falls back; a giveaway price follows the product rule', () => {
  const warmer = content.listings.find((l) => l.category[0] === 'electronics');
  assert.ok(warmer, 'the data has an electrical-appliance listing (the parallel I12 change)');
  assert.equal(bodies.listingCategory(warmer, ['strollers', 'other']), 'other');
  assert.equal(bodies.listingCategory(warmer, ['electronics', 'other']), 'electronics');
  const free = content.listings.find((l) => l.price === 0);
  assert.ok(free);
  assert.equal(bodies.listingPrice(free, 1), null);
  assert.equal(bodies.listingPrice(free, 0), 0);
});

test('dates are relative to the run: a week-34 pregnancy is due in six weeks, a 3-month-old was born three months ago', () => {
  assert.equal(bodies.dueDateFor(34, NOW), '2026-12-08');
  assert.equal(bodies.birthDateFor(3, NOW), '2026-07-25');
  const ev = bodies.trackerBody({ kind: 'breastfeeding', hoursAgo: 2, minutes: 18, choice: 'left' }, GUID, NOW);
  assert.equal(ev.occurredAt, '2026-10-27T06:00:00.000Z');
  assert.equal(ev.endedAt, '2026-10-27T06:18:00.000Z');
});

test('the plan: accounts first, then every step after what it needs', () => {
  const steps = buildPlan(content, 'seed');
  const index = (pred) => steps.findIndex(pred);
  assert.deepEqual(steps.slice(0, keys.length).map((s) => s.kind), keys.map(() => 'account'));
  for (const p of content.posts) {
    const at = index((s) => s.kind === 'post' && s.post === p.key);
    assert.ok(at > 0);
    if (p.group) assert.ok(index((s) => s.kind === 'group' && s.group === p.group) < at);
    for (const s of steps) if ((s.kind === 'comment' || s.kind === 'share') && s.post === p.key) assert.ok(steps.indexOf(s) > at);
    for (const c of p.comments) {
      if (c.replyTo) assert.ok(index((s) => s.kind === 'comment' && s.comment === c.replyTo) < index((s) => s.kind === 'comment' && s.comment === c.key));
    }
  }
  for (const s of steps) {
    if (s.kind === 'friend-accept') assert.ok(index((x) => x.kind === 'friend-request' && x.actor === s.requester && x.target === s.actor) < steps.indexOf(s));
    if (s.kind === 'offer-accept') assert.ok(index((x) => x.kind === 'offer-help' && x.post === s.post) < steps.indexOf(s));
    if (s.kind === 'review') assert.ok(index((x) => x.kind === 'message' && x.actor === s.professional) < steps.indexOf(s));
    assert.equal(s.kind === 'story', false, 'no Story in the seed');
  }
  const stories = buildPlan(content, 'stories');
  assert.deepEqual([...new Set(stories.map((s) => s.kind))], ['account', 'story']);
  assert.equal(stories.filter((s) => s.kind === 'story').length, content.stories.length);
  for (const s of steps) assert.ok(actionHandlers[s.kind] !== undefined || s.kind === 'account', `a handler for ${s.kind}`);
});

test('the dry run prints the plan with keys only (no text) and needs no network', () => {
  const lines = [];
  const counts = dryRun(buildPlan(content, 'seed'), (l) => lines.push(l));
  assert.equal(counts.post, content.posts.length);
  assert.equal(counts.account, keys.length);
  const all = lines.join('\n');
  assert.ok(!all.includes(content.posts[0].body.slice(0, 12)), 'a post text is never printed');
  assert.match(describeStep({ kind: 'comment', actor: 'dana', post: 'p', comment: 'c' }), /^comment\s+dana\s+p\/c$/);
});

test('DEMO_ACCOUNTS: every persona, no stranger, no shared email, never the preview-e2e test-user shape', () => {
  const good = generateAccounts(keys, 'nestly-demo-{key}@gmail.com');
  assert.equal(parseAccounts(JSON.stringify(good), keys).ok, true);
  assert.match(parseAccounts(undefined, keys).reason, /not set/);
  const { michal: _m, ...missing } = good;
  assert.match(parseAccounts(JSON.stringify(missing), keys).reason, /no account for: michal/);
  assert.match(parseAccounts(JSON.stringify({ ...good, eve: good.dana }), keys).reason, /unknown personas: eve/);
  assert.match(parseAccounts(JSON.stringify({ ...good, dana: { ...good.dana, email: good.roni.email } }), keys).reason, /share an email/);
  const e2e = { ...good, dana: { ...good.dana, email: 'nestly-e2e-123-1-0123456789abcdef@gmail.com' } };
  assert.match(parseAccounts(JSON.stringify(e2e), keys).reason, /test-user shape/);
  for (const email of ['afik.yermi@gmail.com', 'nestly-demo-dana@example.com', 'x.nestly-demo-dana@gmail.com', 'nestly-demo-da_na@gmail.com']) {
    assert.match(parseAccounts(JSON.stringify({ ...good, dana: { ...good.dana, email } }), keys).reason, /not of the demo shape/, email);
  }
  const bad = parseAccounts(JSON.stringify({ ...good, dana: { email: 'x', password: 'short' } }), keys);
  assert.equal(bad.ok, false);
  assert.ok(!bad.reason.includes(good.dana.password));
  const lines = [];
  maskAccounts(new Map(Object.entries(good)), (l) => lines.push(l), true);
  assert.equal(lines.length, keys.length * 2);
  assert.ok(lines.every((l) => l.startsWith('::add-mask::')));
});

test('targets: a Preview deployment URL or the production site only; the shift URL is postgres of the same project', () => {
  assert.equal(checkTarget('preview', 'https://nestly-abc123-afikyermis-projects.vercel.app').ok, true);
  assert.equal(checkTarget('preview', 'https://nestly-blue.vercel.app').ok, false);
  assert.equal(checkTarget('preview', undefined).ok, false);
  const prod = checkTarget('production', '');
  assert.equal(prod.ok && prod.baseUrl, 'https://nestly-blue.vercel.app');
  assert.equal(prod.ok && prod.supabaseUrl, 'https://cihugbwafnaujsqabgyp.supabase.co');
  assert.equal(checkTarget('production', 'https://evil.example').ok, false);
  const url = (user, port = '5432') => `${'postgres' + 'ql://'}${user}:pw${String.fromCharCode(64)}aws-0-eu-central-1.pooler.supabase.com:${port}/postgres`;
  assert.equal(checkAdminUrl('preview', url('postgres.xmihorrkegrdlbhpktny')).ok, true);
  assert.equal(checkAdminUrl('production', url('postgres.xmihorrkegrdlbhpktny')).ok, false, 'the preview project for production');
  assert.equal(checkAdminUrl('production', url('postgres.cihugbwafnaujsqabgyp', '6543')).ok, false);
  const refused = checkAdminUrl('production', url('app_owner.cihugbwafnaujsqabgyp'));
  assert.equal(refused.ok, false);
  assert.ok(!refused.reason.includes('pw'));
});

// ---- the runner over a fake product -----------------------------------------------------------------------------------------------

function fakeProduct() {
  const users = new Map(); // email -> { id, password, registered, recovery, privacy }
  const calls = [];
  let n = 0;
  const reply = (status, body) => ({ status, headers: { get: () => null }, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const fetch = async (url, init) => {
    assert.equal(init.redirect, 'manual', 'a redirect is never followed');
    const u = new URL(url);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push(`${init.method} ${u.pathname}`);
    if (u.hostname.endsWith('supabase.co')) {
      assert.ok(init.headers.apikey, 'Auth gets the publishable key');
      const user = users.get(body.email);
      if (u.pathname === '/auth/v1/signup') {
        if (user) return reply(422, { error_code: 'user_already_exists' });
        n += 1;
        const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
        users.set(body.email, { id, password: body.password, registered: false, recovery: false, privacy: 'open' });
        return reply(200, { access_token: `t:${body.email}`, user: { id } });
      }
      if (!user || user.password !== body.password) return reply(400, { error_code: 'invalid_credentials' });
      return reply(200, { access_token: `t:${body.email}`, user: { id: user.id } });
    }
    assert.equal(u.origin, 'https://nestly-abc123-afikyermis-projects.vercel.app');
    assert.equal(init.headers['x-vercel-protection-bypass'], 'bypass');
    const me = users.get(init.headers.authorization.slice('Bearer t:'.length));
    if (!me) return reply(401, { error: 'unauthenticated' });
    const route = `${init.method} ${u.pathname}`;
    if (route === 'GET /api/me') return reply(200, me.registered ? { state: 'active', recoveryQuestions: me.recovery ? 'set' : 'missing' } : { state: 'unregistered' });
    if (route === 'POST /api/register') return (me.registered = true), reply(201, { status: 'created' });
    if (route === 'POST /api/recovery-questions') return (me.recovery = true), reply(201, { ok: true });
    if (route === 'GET /api/privacy') return reply(200, { profileVisibility: me.privacy, isEmptyJourneySentenceShown: me.sentence === true, isChildBirthdayShared: false });
    if (route === 'PUT /api/privacy') return (me.privacy = body.profileVisibility), (me.sentence = body.isEmptyJourneySentenceShown), reply(200, body);
    return reply(404, { error: 'not_found' });
  };
  return { fetch, calls, users };
}

test('the runner creates a missing account, registers it, and on a second run changes nothing', async () => {
  const product = fakeProduct();
  const accounts = new Map(Object.entries(generateAccounts(keys, 'nestly-demo-{key}@gmail.com')));
  const make = () =>
    createContext({
      api: new Api({ baseUrl: 'https://nestly-abc123-afikyermis-projects.vercel.app', fetch: product.fetch, bypassSecret: 'bypass', sleep: async () => undefined }),
      auth: new Auth({ supabaseUrl: 'https://xmihorrkegrdlbhpktny.supabase.co', publishableKey: 'sb_publishable_x', fetch: product.fetch }),
      accounts,
      content,
      now: NOW,
      log: silent,
      allowSignUp: true,
    });
  const steps = [{ kind: 'account', actor: 'dana' }, { kind: 'privacy', actor: 'dana', visibility: 'open' }];
  const first = await runPlan(steps, make(), actionHandlers);
  assert.deepEqual(first, { done: 2, skipped: 0, failed: [] });
  assert.ok(product.calls.includes('POST /api/register') && product.calls.includes('POST /api/recovery-questions'));
  product.calls.length = 0;
  const second = await runPlan(steps, make(), actionHandlers);
  assert.deepEqual(second, { done: 0, skipped: 2, failed: [] });
  assert.ok(!product.calls.some((c) => c.startsWith('POST /api/') || c.startsWith('PUT /api/') || c === 'POST /auth/v1/signup'));
});

test('without sign-up a missing account fails, and every later step of that persona is reported, not attempted', async () => {
  const product = fakeProduct();
  const ctx = createContext({
    api: new Api({ baseUrl: 'https://nestly-abc123-afikyermis-projects.vercel.app', fetch: product.fetch, bypassSecret: 'bypass', sleep: async () => undefined }),
    auth: new Auth({ supabaseUrl: 'https://xmihorrkegrdlbhpktny.supabase.co', publishableKey: 'k', fetch: product.fetch }),
    accounts: new Map(Object.entries(generateAccounts(keys, 'x-{key}@gmail.com'))),
    content,
    now: NOW,
    log: silent,
    allowSignUp: false,
  });
  const report = await runPlan([{ kind: 'account', actor: 'avi' }, { kind: 'privacy', actor: 'avi', visibility: 'open' }], ctx, actionHandlers);
  assert.equal(report.failed.length, 2);
  assert.match(report.failed[0].reason, /invalid_credentials/);
  assert.equal(product.users.size, 0);
});

test('the API client: a read retries a 429 and a network failure; a POST retries only a 429; a 3xx or a 4xx is never followed or retried', async () => {
  let n = 0;
  const waits = [];
  const fetch = async () => {
    n += 1;
    if (n === 1) throw new Error('reset');
    if (n === 2) return { status: 429, headers: { get: () => null }, text: async () => '' };
    return { status: 201, headers: { get: () => null }, text: async () => '{"id":"x"}' };
  };
  const api = new Api({ baseUrl: 'https://h', fetch, sleep: async (ms) => void waits.push(ms), retryDelaysMs: [1, 2, 3] });
  assert.deepEqual(await api.call('t', 'GET', '/api/me'), { status: 201, body: { id: 'x' } });
  assert.deepEqual(waits, [1, 2]);
  const once = (status) => {
    let calls = 0;
    const f = async () => ((calls += 1), { status, headers: { get: () => null }, text: async () => '' });
    return { f, count: () => calls };
  };
  for (const status of [503, 302]) {
    const probe = once(status);
    const post = new Api({ baseUrl: 'https://h', fetch: probe.f, sleep: async () => undefined, retryDelaysMs: [1, 2] });
    assert.equal((await post.call('t', 'POST', '/api/posts', {})).status, status);
    assert.equal(probe.count(), 1, `a POST answered ${status} is not sent again`);
  }
  const limited = once(429);
  await new Api({ baseUrl: 'https://h', fetch: limited.f, sleep: async () => undefined, retryDelaysMs: [1, 2] }).call('t', 'POST', '/x', {});
  assert.equal(limited.count(), 3);
  const four = new Api({ baseUrl: 'https://h', fetch: async () => ({ status: 400, headers: { get: () => null }, text: async () => '' }), sleep: async () => assert.fail('no retry') });
  assert.equal((await four.call('t', 'GET', '/x')).status, 400);
});

test('posts are found again by Search: the query stays inside the first line, the snippet must start the text', () => {
  assert.equal(searchText('שורה ראשונה\nשורה שנייה'), 'שורה ראשונה');
  assert.equal([...searchText('א'.repeat(90))].length, 40);
  assert.equal(snippetMatches('שבוע 34 ואני כבר חושבת…', 'שבוע 34 ואני כבר חושבת על הלילות'), true);
  assert.equal(snippetMatches('…באמצע הטקסט', 'שבוע 34 ואני באמצע הטקסט'), false);
});

// ---- the time shift -------------------------------------------------------------------------------------------------------------------

const ids = new Map(keys.map((k, i) => [k, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));

test('the shift: every statement is bound to a demo account ($1), touches known columns only, and moves to the content ages', () => {
  const statements = buildShift(content, ids, NOW);
  const demo = new Set(ids.values());
  assert.ok(statements.length > 200);
  for (const s of statements) {
    assert.ok(Object.hasOwn(SHIFT_COLUMNS, s.table), s.table);
    assert.match(s.text, /^update nestly\./);
    assert.match(s.text, /where /);
    assert.match(s.text.slice(s.text.indexOf('where ')), /\$1/, `${s.label}: $1 in the WHERE`);
    const owner = s.params[0];
    if (s.table === 'reactions') assert.deepEqual(owner.slice(1, -1).split(',').sort(), [...demo].sort());
    else assert.ok(demo.has(owner), `${s.label}: $1 is a demo id`);
    assert.ok(!/delete |insert |drop |truncate /i.test(s.text));
  }
  const post = statements.find((s) => s.label === 'post michal-sleep-question');
  const at = new Date(post.params[2]).getTime();
  const expected = NOW.getTime() - 118 * 3600 * 1000;
  assert.ok(at <= expected && at > expected - 41 * 60 * 1000);
  assert.ok(!statements.some((s) => /stories|tracker_events/.test(s.text)), 'Stories and tracker events are never moved');
  for (const s of statements.filter((x) => x.table === 'support_messages')) assert.match(s.text, /author_kind = 'user'/);
  const likes = statements.find((s) => s.table === 'reactions');
  assert.ok(likes.text.includes('and (r.post_id in (select id from nestly.posts where author_id = any($1::uuid[])'), 'likes on demo posts only');
  const without = buildShift(content, new Map([...ids].filter(([k]) => k !== 'michal')), NOW);
  assert.ok(!without.some((s) => s.label === 'post michal-sleep-question'));
  assert.ok(touchedTables(statements).includes('posts'));
});

function fakeDb({ who = 'postgres', bypass = true, dropColumn = null, staffFor = null, zeroFor = null, guardOn = null } = {}) {
  const triggersOff = new Set();
  const log = [];
  const db = {
    async transaction(work) {
      log.push('begin');
      try {
        await work({
          async run(text, params = []) {
            log.push(text.split(' ').slice(0, 4).join(' '));
            if (text.startsWith('select current_user')) return { count: 1, rows: [{ who, bypass }] };
            if (text.startsWith('select table_name')) {
              const rows = Object.entries(SHIFT_COLUMNS).flatMap(([t, cols]) => cols.filter((c) => `${t}.${c}` !== dropColumn).map((c) => ({ table_name: t, column_name: c })));
              return { count: rows.length, rows };
            }
            if (text.startsWith('select u.id')) {
              const emails = params[0].slice(1, -1).split(',').map((e) => e.replace(/"/g, ''));
              const rows = emails.map((email, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, email, kind: 'regular', staff: email === staffFor }));
              return { count: rows.length, rows };
            }
            const m = /^alter table nestly\.(\w+) (disable|enable) trigger user$/.exec(text);
            if (m) {
              if (m[2] === 'disable') triggersOff.add(m[1]);
              else triggersOff.delete(m[1]);
              return { count: 0, rows: [] };
            }
            const table = /^update nestly\.(\w+)/.exec(text)?.[1];
            if (table !== undefined && table === guardOn && !triggersOff.has(table)) throw Object.assign(new Error('guard'), { code: '42501' });
            if (table !== undefined && zeroFor !== null && text.startsWith(`update nestly.${zeroFor} `)) return { count: 0, rows: [] };
            return { count: 1, rows: [] };
          },
        });
        log.push('commit');
      } catch (error) {
        log.push('rollback');
        throw error;
      }
    },
  };
  return { db, log };
}

const emails = new Map(keys.map((k) => [k, `nestly-demo-${k}@gmail.com`]));

test('the shift run: dry run rolls back, apply commits, triggers off only inside the transaction', async () => {
  const dry = fakeDb();
  const report = await runShift({ db: dry.db, content, emails, anchor: NOW, apply: false, log: silent });
  assert.equal(report.ok, true);
  assert.equal(dry.log.at(-1), 'rollback');
  const applied = fakeDb();
  const lines = [];
  assert.equal((await runShift({ db: applied.db, content, emails, anchor: NOW, apply: true, log: (l) => lines.push(l) })).ok, true);
  assert.equal(applied.log.at(-1), 'commit');
  assert.equal(applied.log.filter((l) => l.startsWith('alter table')).length, 0, 'no guard refused: no trigger is switched off');
  assert.ok(!lines.join('\n').includes('@'), 'no email in the log');
});

test('the shift switches triggers off only on a table whose guard refuses the move, and only inside the transaction', async () => {
  const guarded = fakeDb({ guardOn: 'friendships' });
  const report = await runShift({ db: guarded.db, content, emails, anchor: NOW, apply: true, log: silent });
  assert.equal(report.ok, true);
  assert.deepEqual(report.triggersOff, ['friendships']);
  assert.ok(guarded.log.includes('rollback to savepoint demo_shift_table'));
  assert.equal(guarded.log.at(-1), 'commit');
});

test('a statement that moves no row is flagged in the dry run, stops an apply, and passes only when allow-listed', async () => {
  const lines = [];
  const dry = await runShift({ db: fakeDb({ zeroFor: 'professional_reviews' }).db, content, emails, anchor: NOW, apply: false, log: (l) => lines.push(l) });
  assert.equal(dry.ok, true);
  assert.ok(dry.empty.length >= 4 && lines.some((l) => l.includes('0 ROWS')));
  const applied = fakeDb({ zeroFor: 'professional_reviews' });
  const refused = await runShift({ db: applied.db, content, emails, anchor: NOW, apply: true, log: silent });
  assert.match(refused.reason, /moved no row/);
  assert.equal(applied.log.at(-1), 'rollback');
  const allowed = fakeDb({ zeroFor: 'professional_reviews' });
  assert.equal((await runShift({ db: allowed.db, content, emails, anchor: NOW, apply: true, log: silent, allowEmpty: ['review '] })).ok, true);
  assert.equal(allowed.log.at(-1), 'commit');
  const optional = await runShift({ db: fakeDb({ zeroFor: 'chat_requests' }).db, content, emails, anchor: NOW, apply: true, log: silent });
  assert.equal(optional.ok, true, 'a friends chat has no request: optional');
});

test('the shift refuses: not postgres with BYPASSRLS, a changed schema, or a staff account among the emails', async () => {
  assert.match((await runShift({ db: fakeDb({ bypass: false }).db, content, emails, anchor: NOW, apply: true, log: silent })).reason, /BYPASSRLS/);
  assert.match((await runShift({ db: fakeDb({ dropColumn: 'posts.body' }).db, content, emails, anchor: NOW, apply: true, log: silent })).reason, /posts\.body/);
  const staff = await runShift({ db: fakeDb({ staffFor: 'nestly-demo-dana@gmail.com' }).db, content, emails, anchor: NOW, apply: true, log: silent });
  assert.match(staff.reason, /dana is not a Regular or Professional/);
});

test('illustrations are PNGs of known motifs, the same bytes every time, and every motif in the content is known', () => {
  const png = illustrationPng('moon');
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(Buffer.from(png.subarray(12, 16)).toString('ascii'), 'IHDR');
  assert.deepEqual(illustrationPng('moon'), png);
  for (const m of [...personas.map((p) => p.avatar), ...content.stories.map((s) => s.image), ...content.listings.flatMap((l) => (l.image ? [l.image] : []))]) {
    assert.ok(knownMotif(m), m);
  }
});

test('the workflow: by hand only, from main, production behind its own environment, secrets only in the steps that use them', () => {
  const text = readFileSync(new URL('../.github/workflows/demo-seed.yml', import.meta.url), 'utf8');
  const wf = parseYaml(text);
  assert.deepEqual(Object.keys(wf.on), ['workflow_dispatch']);
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.equal(wf.jobs.plan.environment, undefined);
  assert.ok(!/secrets\./.test(JSON.stringify(wf.jobs.plan)));
  assert.equal(wf.jobs.production.environment, 'demo-production');
  assert.equal(wf.jobs.preview.environment, 'preview-e2e');
  for (const job of [wf.jobs.preview, wf.jobs.production]) {
    assert.match(job.if, /github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
    for (const step of job.steps) {
      if (step.run !== undefined) assert.ok(!/\$\{\{/.test(step.run), 'inputs reach run: through env only');
      if (step.run === 'npm ci --ignore-scripts' || step.run === 'npm run build -w @nestly/shared') assert.equal(step.env, undefined);
    }
  }
  assert.ok(!/PREVIEW_DB_ADMIN_URL/.test(JSON.stringify(wf.jobs.production)), 'production never reads the preview credential');
  assert.ok(!/PRODUCTION_DB_ADMIN_URL/.test(JSON.stringify(wf.jobs.preview)));
});

test('the role walk: GET only, every screen of every persona, a non-200 or an empty filled list fails, nothing secret is logged', async () => {
  assert.equal(firstListLength([1, 2]), 2);
  assert.equal(firstListLength({ next: null, items: [1] }), 1);
  assert.equal(firstListLength({ name: 'x' }), null);
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.authorization });
    if (url.includes('/auth/v1/token')) {
      const { email } = JSON.parse(init.body);
      if (email === 'nestly-demo-bad@gmail.com') return { status: 400, headers: { get: () => null }, text: async () => '{}' };
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ access_token: `tok-${email}`, user: { id: 'u' } }) };
    }
    if (url.endsWith('/api/outreach')) return { status: 500, headers: { get: () => null }, text: async () => '{}' };
    if (url.endsWith('/api/feed')) return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ items: url.includes('x') ? [1] : [] }) };
    return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ items: [1, 2] }) };
  };
  const lines = [];
  const accounts = new Map([
    ['michal', { email: 'nestly-demo-michal@gmail.com', password: 'secret-pw-1' }],
    ['inbal', { email: 'nestly-demo-inbal@gmail.com', password: 'secret-pw-2' }],
    ['bad', { email: 'nestly-demo-bad@gmail.com', password: 'secret-pw-3' }],
  ]);
  const report = await walk({
    api: new Api({ baseUrl: 'https://nestly-abc123-afikyermis-projects.vercel.app', fetch, sleep: async () => undefined }),
    auth: new Auth({ supabaseUrl: 'https://xmihorrkegrdlbhpktny.supabase.co', publishableKey: 'k', fetch }),
    accounts,
    personas: [{ key: 'michal', kind: 'regular' }, { key: 'inbal', kind: 'professional' }, { key: 'bad', kind: 'regular' }, { key: 'nobody', kind: 'regular' }],
    log: (l) => lines.push(l),
  });
  assert.equal(report.screens, SCREENS.regular.length + SCREENS.professional.length);
  assert.ok(calls.filter((c) => c.url.includes('/api/')).every((c) => c.method === 'GET'));
  assert.ok(report.failed.includes('inbal /api/outreach: HTTP 500'));
  assert.ok(report.failed.includes('michal /api/feed: empty'));
  assert.ok(report.failed.some((f) => f.startsWith('bad: sign-in invalid_credentials')));
  assert.ok(report.failed.includes('nobody: no demo account'));
  const logged = [...lines, ...report.failed].join('\n');
  assert.ok(!/secret-pw|@gmail|tok-/.test(logged));
});
