// preview-e2e cleanup (.work/preview-e2e/spec.md, criteria 8 and 9; A2 and DR-E1 option 1): the DB URL guard, the preflight,
// victim selection, runCleanup and the cleanup workflow. Split out of preview-e2e.test.mjs to stay under the line budget;
// the assertions are unchanged. Afik 17.10.2026 "Preview cleanup": the ninth table (identity_link_checks) and the manual modes. Expected values come from the spec, schema.md (ref xmihorrkegrdlbhpktny, 3 h age, cap of 10,
// port 5432, the tables) and the F1.6 limit, never from the code under test.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const ROOT = new URL('..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const workflowText = read('.github/workflows/preview-e2e.yml');
const wf = parseYaml(workflowText);
const job = wf.jobs.e2e;
const steps = stepsOf(job);

async function capture(fn) {
  const chunks = [];
  const outW = process.stdout.write;
  const errW = process.stderr.write;
  const logW = console.log;
  const errL = console.error;
  process.stdout.write = (c) => (chunks.push(String(c)), true);
  process.stderr.write = (c) => (chunks.push(String(c)), true);
  console.log = (...a) => chunks.push(a.join(' '));
  console.error = (...a) => chunks.push(a.join(' '));
  try {
    await fn();
  } finally {
    process.stdout.write = outW;
    process.stderr.write = errW;
    console.log = logW;
    console.error = errL;
  }
  return chunks.join('');
}

// ---- criteria 8 and 9 (A2, DR-E1 option 1): cleanup and sweep -----------------------------------------------------------------
const cleanup = await import(new URL('tools/preview-e2e-cleanup.ts', ROOT).href);
const PW = 'PW-sentinel-3c8e1a';
const dbUrl = (over = {}) => {
  const o = { user: 'postgres.xmihorrkegrdlbhpktny', host: 'aws-0-eu-central-1.pooler.supabase.com', port: '5432', query: '', ...over };
  return `postgresql://${o.user}:${PW}@${o.host}${o.port ? `:${o.port}` : ''}/postgres${o.query}`;
};

for (const [label, url] of [['plain', dbUrl()], ['sslmode=require', dbUrl({ query: '?sslmode=require' })], ['sslmode=verify-full', dbUrl({ query: '?sslmode=verify-full' })]]) {
  test(`[E c8] DB URL guard accepts the preview pooler URL (${label})`, () => {
    assert.equal(cleanup.checkCleanupUrl(url).ok, true);
  });
}

for (const [label, url] of [
  ['the plain postgres user', dbUrl({ user: 'postgres' })],
  ['another project ref', dbUrl({ user: 'postgres.cihugbwafnaujsqabgyp' })],
  ['a ref with a suffix', dbUrl({ user: 'postgres.xmihorrkegrdlbhpktnyx' })],
  ['port 6543', dbUrl({ port: '6543' })],
  ['no port', dbUrl({ port: '' })],
  ['a direct db host', dbUrl({ host: 'db.xmihorrkegrdlbhpktny.supabase.co' })],
  ['a look-alike host suffix', dbUrl({ host: 'aws-0-eu-central-1.pooler.supabase.com.evil.com' })],
  ['a look-alike host prefix', dbUrl({ host: 'evilpooler.supabase.com' })],
  ['another TLD', dbUrl({ host: 'aws-0-eu-central-1.pooler.supabase.co' })],
  ['an extra query key', dbUrl({ query: '?sslmode=require&host=evil.com' })],
  ['only a foreign query key', dbUrl({ query: '?options=-c%20x' })],
  ['sslmode=disable', dbUrl({ query: '?sslmode=disable' })],
  ['an https URL', 'https://aws-0-eu-central-1.pooler.supabase.com:5432/'],
  ['no password', 'postgresql://postgres.xmihorrkegrdlbhpktny@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'],
  ['an empty string', ''],
  ['whitespace only', '   '],
  ['undefined', undefined],
]) {
  test(`[E c8] DB URL guard refuses ${label}, and the reason never echoes the input`, () => {
    const r = cleanup.checkCleanupUrl(url);
    assert.equal(r.ok, false);
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
    assert.ok(!r.reason.includes(PW));
    if (typeof url === 'string' && url.trim() !== '') assert.ok(!r.reason.includes(url.trim()));
  });
}

const GOOD_FACTS = {
  dbUser: 'postgres',
  bypassRls: true,
  canDeleteAuthUsers: true,
  nestlyTables: ['children', 'friendships', 'identity_link_checks', 'journey_contexts', 'legal_consents', 'recovery_answers', 'recovery_events', 'recovery_throttles', 'regular_names', 'regular_profiles', 'users'],
};

test('[E c8] preflight passes only for the exact expected facts, in any table order', () => {
  assert.equal(cleanup.decidePreflight(GOOD_FACTS).ok, true);
  assert.equal(cleanup.decidePreflight({ ...GOOD_FACTS, nestlyTables: [...GOOD_FACTS.nestlyTables].reverse() }).ok, true);
});

for (const [label, over] of [
  ['a session role other than postgres', { dbUser: 'app_user' }],
  ['an empty session role', { dbUser: '' }],
  ['no BYPASSRLS', { bypassRls: false }],
  ['BYPASSRLS unknown (null)', { bypassRls: null }],
  ['no DELETE on auth.users', { canDeleteAuthUsers: false }],
  ['DELETE on auth.users unknown (null)', { canDeleteAuthUsers: null }],
  ['a missing nestly table', { nestlyTables: GOOD_FACTS.nestlyTables.slice(1) }],
  ['an extra nestly table', { nestlyTables: [...GOOD_FACTS.nestlyTables, 'posts'] }],
  ['no nestly tables', { nestlyTables: [] }],
  ['a table swapped for another', { nestlyTables: [...GOOD_FACTS.nestlyTables.slice(1), 'posts'] }],
]) {
  test(`[E c8] preflight fails closed on ${label}`, () => {
    const r = cleanup.decidePreflight({ ...GOOD_FACTS, ...over });
    assert.equal(r.ok, false);
    assert.ok(r.reason.length > 0);
  });
}

test('[E c9] the sweep age is 3 hours, the sweep cap 10 per run, the pattern ceiling 50', () => {
  assert.equal(cleanup.SWEEP_AGE_HOURS, 3);
  assert.equal(cleanup.MAX_SWEEP_PER_RUN, 10);
  assert.equal(cleanup.MAX_PATTERN_USERS, 50);
  assert.equal(cleanup.MAX_VICTIMS, undefined);
});

test('[E c9] decoys and prefix-only look-alikes are not pattern matches; generated users are', () => {
  const hex = '0123456789abcdef';
  assert.equal(cleanup.matchesTestEmail(`nestly-e2e-12-1-${hex}@gmail.com`), true);
  for (const decoy of [
    'alice@gmail.com',
    'alice@example.com',
    'nestly-e2e-keep-me@gmail.com',
    `nestly-e2e-12-1-${hex}`,
    `nestly-e2e-12-1-${hex}@gmail.com.evil.com`,
    `xnestly-e2e-12-1-${hex}@gmail.com`,
    `nestly-e2e-12-1-${hex}@gmail.com\nalice@gmail.com`,
    `nestly-e2e-12-1-${hex}0@gmail.com`,
  ]) {
    assert.equal(cleanup.matchesTestEmail(decoy), false, decoy);
  }
});

test('[E c8][E c9] the run prefix is nestly-e2e-<run>-<attempt>-%, and a non-numeric part is refused', () => {
  assert.equal(cleanup.runEmailPrefix('123', '2'), 'nestly-e2e-123-2-%');
  for (const [run, attempt] of [['', '1'], ['1', ''], ['1%', '1'], ['1', '1_'], ['a', '1'], ['1; drop', '1'], ['1', '1000']]) {
    assert.throws(() => cleanup.runEmailPrefix(run, attempt), `${run}/${attempt}`);
  }
});

const cands = (n, own = false, tag = 'u') => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, own }));

test("[E c9] this run's users and leftovers are both selected", () => {
  const r = cleanup.selectVictims([{ id: 'mine', own: true }, { id: 'old', own: false }], 2);
  assert.equal(r.ok, true);
  assert.deepEqual(r.victims.map((v) => v.id).sort(), ['mine', 'old']);
  assert.equal(cleanup.selectVictims([], 0).ok, true);
});

test("[E c9] this run's users are never capped: 12 own and no leftovers are all selected", () => {
  const r = cleanup.selectVictims(cands(12, true, 'own'), 12);
  assert.equal(r.ok, true);
  assert.equal(r.victims.length, 12);
});

test("[E c9] own users are all kept and the sweep takes at most 10 leftovers: 12 own + 15 leftovers -> 22", () => {
  const r = cleanup.selectVictims([...cands(12, true, 'own'), ...cands(15, false, 'old')], 27);
  assert.equal(r.ok, true);
  assert.equal(r.victims.filter((v) => v.own).length, 12);
  assert.equal(r.victims.filter((v) => !v.own).length, 10);
});

test('[E c9] exactly 10 leftovers are swept, oldest first, when more exist (candidates arrive oldest first)', () => {
  const r = cleanup.selectVictims(cands(14, false, 'old'), 14);
  assert.equal(r.ok, true);
  assert.deepEqual(r.victims.map((v) => v.id), Array.from({ length: 10 }, (_, i) => `old${i}`));
});

test('[E c9] fewer than 10 leftovers are all swept', () => {
  const r = cleanup.selectVictims(cands(3, false, 'old'), 3);
  assert.equal(r.victims.length, 3);
});

test('[E c9] 50 pattern users in total is allowed; 51 (or more) selects nothing and fails, even when all are this run\'s', () => {
  assert.equal(cleanup.selectVictims(cands(5, true, 'own'), 50).ok, true);
  for (const [list, total] of [[cands(5, true, 'own'), 51], [cands(20, false), 51], [[], 500]]) {
    const r = cleanup.selectVictims(list, total);
    assert.equal(r.ok, false);
    assert.ok(r.reason.length > 0);
    assert.equal(r.victims, undefined);
  }
});

test('[E c9] a negative or non-numeric pattern total selects nothing', () => {
  for (const total of [-1, Number.NaN, undefined, '3']) {
    assert.equal(cleanup.selectVictims(cands(2, true), total).ok, false, String(total));
  }
});

const found = (candidates, patternTotal = candidates.length) => ({ candidates, patternTotal });

// A stub client: records every call so a test can say what was and was not deleted.
function stubClient(over = {}) {
  const calls = { deleted: [], counted: 0 };
  const client = {
    preflight: async () => GOOD_FACTS,
    findCandidates: async () => found([]),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      return { 'auth.users': 1, 'nestly.users': 1 };
    },
    countRunLeftovers: async () => {
      calls.counted += 1;
      return 0;
    },
    ...over,
  };
  return { client, calls };
}
const runIt = async (client, log = () => {}) => cleanup.runCleanup({ client, runId: '4242', runAttempt: '1', log });

test('[E c8] flow passed (it deleted its own user): cleanup succeeds with zero deletions and zero leftovers', async () => {
  const { client, calls } = stubClient();
  const r = await runIt(client);
  assert.equal(r.ok, true);
  assert.equal(calls.deleted.length, 0);
  assert.equal(r.leftovers, 0);
});

test('[E c8] flow threw (its user is still there): cleanup deletes it and succeeds', async () => {
  const { client, calls } = stubClient({ findCandidates: async () => found([{ id: 'mine', own: true }]) });
  const r = await runIt(client);
  assert.deepEqual(calls.deleted, ['mine']);
  assert.equal(r.ok, true);
  assert.equal(r.deletedOwn, 1);
  assert.equal(r.deletedSwept, 0);
});

test("[E c9] leftovers of earlier runs are swept and counted apart from this run's", async () => {
  const { client, calls } = stubClient({ findCandidates: async () => found([{ id: 'mine', own: true }, { id: 'old', own: false }]) });
  const r = await runIt(client);
  assert.deepEqual(calls.deleted.sort(), ['mine', 'old']);
  assert.equal(r.deletedOwn, 1);
  assert.equal(r.deletedSwept, 1);
  assert.equal(r.ok, true);
});

test("[E c8] this run's users remain after the deletes: the cleanup fails even though no delete threw", async () => {
  const { client } = stubClient({ countRunLeftovers: async () => 1 });
  const r = await runIt(client);
  assert.equal(r.ok, false);
  assert.equal(r.leftovers, 1);
});

test('[E c8] the final count itself failing is a failure, not a pass', async () => {
  const { client } = stubClient({
    countRunLeftovers: async () => {
      throw new Error('boom');
    },
  });
  assert.equal((await runIt(client)).ok, false);
});

test("[E c8] one user's delete failing: the others still run, and the job fails", async () => {
  const ids = ['a', 'b', 'c'];
  const { client, calls } = stubClient({
    findCandidates: async () => found(ids.map((id) => ({ id, own: true }))),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      if (id === 'a') throw Object.assign(new Error('restrict'), { code: '23503' });
      return { 'auth.users': 1 };
    },
  });
  const r = await runIt(client);
  assert.deepEqual(calls.deleted, ids);
  assert.equal(r.ok, false);
  assert.equal(r.failedUsers, 1);
  assert.equal(r.deletedOwn, 2);
});

test('[E c9] more than 50 pattern users in total: no delete is attempted and the cleanup fails', async () => {
  const { client, calls } = stubClient({ findCandidates: async () => found(cands(11, true), 51) });
  const r = await runIt(client);
  assert.equal(r.ok, false);
  assert.equal(calls.deleted.length, 0);
});

test('[E c9] 12 own users and no leftovers: all 12 are deleted and the cleanup succeeds', async () => {
  const { client, calls } = stubClient({ findCandidates: async () => found(cands(12, true, 'own')) });
  const r = await runIt(client);
  assert.equal(calls.deleted.length, 12);
  assert.equal(r.deletedOwn, 12);
  assert.equal(r.ok, true);
});

test('[E c9] 15 leftovers: exactly 10 are deleted, oldest first, and the cleanup succeeds', async () => {
  const { client, calls } = stubClient({ findCandidates: async () => found(cands(15, false, 'old')) });
  const r = await runIt(client);
  assert.deepEqual(calls.deleted, Array.from({ length: 10 }, (_, i) => `old${i}`));
  assert.equal(r.deletedSwept, 10);
  assert.equal(r.ok, true);
});

for (const [label, facts] of [
  ['no BYPASSRLS', { ...GOOD_FACTS, bypassRls: false }],
  ['an unknown nestly table', { ...GOOD_FACTS, nestlyTables: [...GOOD_FACTS.nestlyTables, 'x'] }],
]) {
  test(`[E c8] a failed preflight (${label}): the candidates are never read, nothing is deleted, the cleanup fails`, async () => {
    let read = false;
    const { client, calls } = stubClient({
      preflight: async () => facts,
      findCandidates: async () => {
        read = true;
        return found(cands(1, true));
      },
    });
    const r = await runIt(client);
    assert.equal(r.ok, false);
    assert.equal(calls.deleted.length, 0);
    assert.equal(read, false);
  });
}

test('[E c8] a preflight that throws fails the cleanup with nothing deleted', async () => {
  const { client, calls } = stubClient({
    preflight: async () => {
      throw new Error('connect ECONNREFUSED');
    },
  });
  const r = await runIt(client);
  assert.equal(r.ok, false);
  assert.equal(calls.deleted.length, 0);
});

test('[E c8] a non-numeric run id fails the cleanup before the client is touched', async () => {
  let touched = false;
  const { client } = stubClient({
    preflight: async () => {
      touched = true;
      return GOOD_FACTS;
    },
  });
  const r = await cleanup.runCleanup({ client, runId: '1%', runAttempt: '1', log: () => {} });
  assert.equal(r.ok, false);
  assert.equal(touched, false);
});

test('[E c8] nothing is logged beyond counts: sentinel emails, URL and ids in errors never reach the log, stdout or the report', async () => {
  const EMAIL = 'nestly-e2e-4242-1-0123456789abcdef@gmail.com';
  const URLS = `postgresql://postgres.xmihorrkegrdlbhpktny:${PW}@host.pooler.supabase.com:5432/postgres`;
  const leak = `${EMAIL} ${URLS} user-id-sentinel-77`;
  const { client } = stubClient({
    findCandidates: async () => found([{ id: 'user-id-sentinel-77', own: true }, { id: 'ok', own: true }]),
    deleteUser: async (id) => {
      if (id !== 'ok') throw Object.assign(new Error(leak), { code: '23503' });
      return { 'auth.users': 1 };
    },
    countRunLeftovers: async () => {
      throw new Error(leak);
    },
  });
  const lines = [];
  let report;
  const out = await capture(async () => {
    report = await runIt(client, (l) => lines.push(l));
  });
  const everything = `${lines.join('\n')}\n${out}\n${JSON.stringify(report)}`;
  for (const secret of [EMAIL, PW, 'pooler.supabase.com', 'user-id-sentinel-77', 'nestly-e2e-4242']) {
    assert.ok(!everything.includes(secret), `leaked ${secret}`);
  }
  assert.equal(report.ok, false);
});

test('[E c8] a preflight error message carrying a secret is not echoed in the report', async () => {
  const { client } = stubClient({
    preflight: async () => {
      throw new Error(`bad ${PW}`);
    },
  });
  const r = await runIt(client);
  assert.ok(!JSON.stringify(r).includes(PW));
});

// ---- criteria 8 and 9: the cleanup step in the workflow ---------------------------------------------------------------------
// Decision 17.10: cleanup is its own workflow on workflow_run, default-branch checkout, environment preview-e2e.
const cleanupText = read('.github/workflows/preview-e2e-cleanup.yml');
const cwf = parseYaml(cleanupText);
const cjob = Object.values(cwf.jobs)[0];
const csteps = stepsOf(cjob);
const secretIdx = csteps.findIndex((s) => JSON.stringify(s.env ?? {}).includes('PREVIEW_DB_ADMIN_URL'));
const pwIdx = steps.findIndex((s) => /playwright test/.test(runOf(s)));
const summaryIdx = steps.findIndex((s) => /GITHUB_STEP_SUMMARY/.test(runOf(s)));

test('[E c8] the cleanup workflow triggers only on workflow_run completed of preview-e2e, or by hand (workflow_dispatch)', () => {
  assert.deepEqual(Object.keys(cwf.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual([...cwf.on.workflow_run.workflows], ['preview-e2e']);
  assert.deepEqual([...cwf.on.workflow_run.types], ['completed']);
});

test("[E c8] the cleanup checkout is not the event's head sha, head branch or any github.event.workflow_run value", () => {
  const checkouts = csteps.filter((s) => /actions\/checkout/.test(String(s.uses)));
  assert.equal(checkouts.length, 1);
  const ref = String(checkouts[0].with?.ref ?? '');
  assert.doesNotMatch(ref, /head_sha|head_branch|workflow_run|pull_request|github\.sha|github\.head_ref/);
  assert.doesNotMatch(JSON.stringify(checkouts[0].with ?? {}), /head_sha|head_branch|head_repository/);
  assert.doesNotMatch(cleanupText, /head_sha|head_branch|head_repository/);
});

test('[E c8] the cleanup run id and attempt arrive through env from github.event.workflow_run, never in a run body', () => {
  const step = csteps[secretIdx];
  const values = JSON.stringify(step.env);
  assert.match(values, /github\.event\.workflow_run\.id/);
  assert.match(values, /github\.event\.workflow_run\.run_attempt/);
  for (const s of csteps) {
    assert.doesNotMatch(runOf(s), /\$\{\{/, `an expression in the run body of "${s.name ?? s.uses ?? runOf(s)}"`);
  }
});

test('[E c8] the cleanup job declares environment preview-e2e', () => {
  assert.equal(cjob.environment, 'preview-e2e');
});

test('[E c8] PREVIEW_DB_ADMIN_URL is in the env of one cleanup step only, as a secrets reference, never in a run body or a broader env', () => {
  assert.ok(secretIdx >= 0, 'no cleanup step carries PREVIEW_DB_ADMIN_URL');
  const holders = csteps.filter((s) => JSON.stringify(s.env ?? {}).includes('PREVIEW_DB_ADMIN_URL'));
  assert.equal(holders.length, 1);
  assert.match(String(holders[0].env.PREVIEW_DB_ADMIN_URL), /^\$\{\{\s*secrets\.PREVIEW_DB_ADMIN_URL\s*\}\}$/);
  assert.equal((cleanupText.match(/\$\{\{\s*secrets\./g) ?? []).length, 1, 'exactly one secrets.* reference in the file');
  for (const s of csteps) assert.doesNotMatch(runOf(s), /PREVIEW_DB_ADMIN_URL/);
  for (const env of [cwf.env, cjob.env]) assert.doesNotMatch(JSON.stringify(env ?? {}), /secrets\.|PREVIEW_DB_ADMIN_URL/);
});

test('[E c8] the cleanup step does not get the bypass secret, and the job timeout exceeds the step timeout', () => {
  assert.doesNotMatch(cleanupText, /VERCEL_AUTOMATION_BYPASS_SECRET/);
  const t = Number(csteps[secretIdx]['timeout-minutes']);
  assert.ok(t > 0 && t < Number(cjob['timeout-minutes']));
});

test('[E c8] the cleanup workflow has contents: read only', () => {
  assert.deepEqual(cwf.permissions, { contents: 'read' });
  assert.ok(cjob.permissions === undefined || cjob.permissions === null);
});

test('[E c8] the test workflow has no cleanup step and no PREVIEW_DB_ADMIN_URL anywhere', () => {
  const code = workflowText.replace(/^\s*#.*$/gm, ''); // comments may explain where the cleanup went
  assert.doesNotMatch(code, /PREVIEW_DB_ADMIN_URL/);
  for (const s of steps) assert.doesNotMatch(runOf(s), /preview-e2e-cleanup(-cli)?\.ts/);
});

test('[E c8] the test workflow summary is the last step, after Playwright, and does not claim users are left behind', () => {
  assert.ok(pwIdx >= 0 && summaryIdx > pwIdx);
  assert.doesNotMatch(runOf(steps[summaryIdx]), /not deleted|are left|stay on preview|not removed/i);
});

// ---- Afik 17.10.2026 "Preview cleanup" (a): the ninth table and the delete order ------------------------------------------
const cliText = read('tools/preview-e2e-cleanup-cli.ts');

test('[cleanup a] the expected tables are exactly the nestly tables the migrations on this branch create', () => {
  const dir = new URL('supabase/migrations/', ROOT);
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const code = sql.replace(/--.*$/gm, '');
  const created = new Set([...code.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?nestly\.([a-z_]+)/gi)].map((m) => m[1]));
  for (const m of code.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?nestly\.([a-z_]+)/gi)) created.delete(m[1]);
  assert.doesNotMatch(code, /alter\s+table\s+(?:if\s+exists\s+)?nestly\.[a-z_]+\s+rename\s+to/i, 'a renamed table: update this test');
  assert.deepEqual([...cleanup.EXPECTED_NESTLY_TABLES], [...created].sort());
  assert.ok(created.has('identity_link_checks'));
  assert.equal(cleanup.EXPECTED_NESTLY_TABLES.length, 11);
});

test('[cleanup a] the preflight with all eleven tables passes; the eight of before (no identity_link_checks) fails', () => {
  assert.equal(cleanup.decidePreflight(GOOD_FACTS).ok, true);
  const eight = GOOD_FACTS.nestlyTables.filter((t) => t !== 'identity_link_checks');
  assert.equal(eight.length, 10);
  assert.equal(cleanup.decidePreflight({ ...GOOD_FACTS, nestlyTables: eight }).ok, false);
});

test('[cleanup a] every expected table is deleted from in the user transaction; identity_link_checks just before nestly.users', () => {
  const order = [...cliText.matchAll(/delete from (nestly\.[a-z_]+|auth\.users)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(order.filter((t) => t.startsWith('nestly.')))].sort(), cleanup.EXPECTED_NESTLY_TABLES.map((t) => `nestly.${t}`));
  const users = order.indexOf('nestly.users');
  assert.equal(order[users - 1], 'nestly.identity_link_checks');
  assert.equal(order.at(-1), 'auth.users');
  // the order of the eight before is unchanged; friendships and regular_names (F2.4a) sit after journey_contexts, before regular_profiles
  assert.deepEqual(order.filter((t) => t !== 'nestly.identity_link_checks'), [
    'nestly.recovery_throttles', 'nestly.recovery_events', 'nestly.legal_consents', 'nestly.recovery_answers', 'nestly.children',
    'nestly.journey_contexts', 'nestly.friendships', 'nestly.regular_names', 'nestly.regular_profiles', 'nestly.users', 'auth.users',
  ]);
  assert.match(cliText, /counts\['friendships'\] = \(\s*await tx`delete from nestly\.friendships where requester_id = \$\{id\} or addressee_id = \$\{id\}`\s*\)\.count/);
  assert.match(cliText, /counts\['regular_names'\] = \(await tx`delete from nestly\.regular_names where user_id = \$\{id\}`\)\.count/);
  assert.match(cliText, /counts\['identity_link_checks'\] = \(await tx`delete from nestly\.identity_link_checks where user_id = \$\{id\}`\)\.count/);
});

// ---- Afik 17.10.2026 "Preview cleanup" (c): the manual modes -------------------------------------------------------------
test('[cleanup c] mode: workflow_run carries none; workflow_dispatch needs dry-run or backlog; anything else stops', () => {
  assert.deepEqual(cleanup.parseMode('workflow_run', ''), { ok: true, mode: 'run' });
  assert.deepEqual(cleanup.parseMode('workflow_run', undefined), { ok: true, mode: 'run' });
  assert.deepEqual(cleanup.parseMode('workflow_dispatch', 'dry-run'), { ok: true, mode: 'dry-run' });
  assert.deepEqual(cleanup.parseMode('workflow_dispatch', 'backlog'), { ok: true, mode: 'backlog' });
  for (const [event, mode] of [['workflow_run', 'backlog'], ['workflow_run', 'dry-run'], [undefined, 'backlog'], ['workflow_dispatch', ''],
    ['workflow_dispatch', undefined], ['workflow_dispatch', 'BACKLOG'], ['workflow_dispatch', 'run'], ['push', 'backlog']]) {
    assert.equal(cleanup.parseMode(event, mode).ok, false, `${event}/${mode}`);
  }
});

test('[cleanup c] the backlog cap is 50, the same number as the pattern ceiling, which is unchanged', () => {
  assert.equal(cleanup.MAX_BACKLOG_PER_RUN, 50);
  assert.equal(cleanup.MAX_PATTERN_USERS, 50);
});

const HEX = '0123456789abcdef';
const H = 3600;
// n pattern users; user i is (base + i) hours old, so the last is the oldest
const pusers = (n, base = 4, tag = 'p') =>
  Array.from({ length: n }, (_, i) => ({ id: `${tag}${String(i).padStart(3, '0')}`, email: `nestly-e2e-1-1-${HEX}@gmail.com`, ageSeconds: (base + i) * H }));

test('[cleanup c] backlog selection: oldest first, at most 50, of 120 eligible', () => {
  const users = pusers(120);
  const ids = cleanup.selectBacklog(users);
  assert.equal(ids.length, 50);
  assert.deepEqual(ids, Array.from({ length: 50 }, (_, i) => `p${String(119 - i).padStart(3, '0')}`));
});

test('[cleanup c] backlog selection: only users older than 3 h; exactly 3 h and younger stay', () => {
  const users = [
    { id: 'young', email: `nestly-e2e-1-1-${HEX}@gmail.com`, ageSeconds: 1 * H },
    { id: 'edge', email: `nestly-e2e-1-1-${HEX}@gmail.com`, ageSeconds: 3 * H },
    { id: 'old', email: `nestly-e2e-1-1-${HEX}@gmail.com`, ageSeconds: 3 * H + 1 },
    { id: 'nullage', email: `nestly-e2e-1-1-${HEX}@gmail.com`, ageSeconds: null },
  ];
  assert.deepEqual(cleanup.selectBacklog(users), ['old']);
  assert.deepEqual(cleanup.selectBacklog(pusers(5, 0)), ['p004']); // ages 0..4 h: only the 4 h one
});

test('[cleanup c] backlog selection: a non-pattern email is never selected, whatever its age; duplicates count once', () => {
  const users = [
    { id: 'alice', email: 'alice@gmail.com', ageSeconds: 100 * H },
    { id: 'keep', email: 'nestly-e2e-keep-me@gmail.com', ageSeconds: 100 * H },
    { id: 'evil', email: `nestly-e2e-1-1-${HEX}@gmail.com.evil.com`, ageSeconds: 100 * H },
    { id: 'ok', email: `nestly-e2e-1-1-${HEX}@gmail.com`, ageSeconds: 10 * H },
    { id: 'ok', email: `nestly-e2e-1-1-${HEX}@gmail.com`, ageSeconds: 10 * H },
  ];
  assert.deepEqual(cleanup.selectBacklog(users), ['ok']);
  assert.deepEqual(cleanup.selectBacklog([]), []);
});

test('[cleanup c] the summary: pattern count, older than 3 h, age range in hours; no email or id', () => {
  const users = [...pusers(3, 1), { id: 'alice', email: 'alice@gmail.com', ageSeconds: 500 * H }];
  const s = cleanup.summarizeBacklog(users);
  assert.deepEqual(s, { patternTotal: 3, eligible: 0, oldestHours: 3, newestHours: 1 });
  assert.deepEqual(cleanup.summarizeBacklog([]), { patternTotal: 0, eligible: 0, oldestHours: null, newestHours: null });
  assert.equal(cleanup.summarizeBacklog(pusers(60)).eligible, 60);
  assert.ok(!JSON.stringify(cleanup.summarizeBacklog(pusers(3))).includes('nestly-e2e'));
});

function backlogClient(over = {}) {
  const calls = { deleted: [], listed: 0 };
  const client = {
    preflight: async () => GOOD_FACTS,
    listPatternUsers: async () => {
      calls.listed += 1;
      return pusers(120);
    },
    deleteUser: async (id) => {
      calls.deleted.push(id);
      return { 'auth.users': 1, identity_link_checks: 1, users: 1 };
    },
    ...over,
  };
  return { client, calls };
}

test('[cleanup c] dry-run: preflight and counts only, nothing is deleted, even with 120 pattern users', async () => {
  const { client, calls } = backlogClient();
  const r = await cleanup.runBacklog({ client, mode: 'dry-run', log: () => {} });
  assert.equal(r.ok, true);
  assert.equal(calls.deleted.length, 0);
  assert.equal(r.selected, 0);
  assert.equal(r.deleted, 0);
  assert.equal(r.summary.patternTotal, 120);
  assert.equal(r.summary.eligible, 120);
});

test('[cleanup c] backlog: deletes the 50 oldest, one transaction each, above the per-run refusal of 50', async () => {
  const { client, calls } = backlogClient();
  const r = await cleanup.runBacklog({ client, mode: 'backlog', log: () => {} });
  assert.equal(r.ok, true);
  assert.equal(calls.deleted.length, 50);
  assert.equal(calls.deleted[0], 'p119');
  assert.equal(r.deleted, 50);
  assert.equal(r.tableCounts.identity_link_checks, 50);
});

for (const mode of ['dry-run', 'backlog']) {
  for (const [label, facts] of [
    ['no BYPASSRLS', { ...GOOD_FACTS, bypassRls: false }],
    ['the eight tables of before', { ...GOOD_FACTS, nestlyTables: GOOD_FACTS.nestlyTables.filter((t) => t !== 'identity_link_checks') }],
    ['an unknown nestly table', { ...GOOD_FACTS, nestlyTables: [...GOOD_FACTS.nestlyTables, 'posts'] }],
  ]) {
    test(`[cleanup c] ${mode} refuses on a failed preflight (${label}): users never listed, nothing deleted`, async () => {
      const { client, calls } = backlogClient({ preflight: async () => facts });
      const r = await cleanup.runBacklog({ client, mode, log: () => {} });
      assert.equal(r.ok, false);
      assert.equal(calls.listed, 0);
      assert.equal(calls.deleted.length, 0);
    });
  }
}

test('[cleanup c] backlog: a failed user delete fails the run, the others still run, and nothing secret is logged', async () => {
  const EMAIL = `nestly-e2e-1-1-${HEX}@gmail.com`;
  const { client, calls } = backlogClient({
    listPatternUsers: async () => pusers(3),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      if (id === 'p001') throw Object.assign(new Error(`${EMAIL} ${id} ${PW}`), { code: '23503' });
      return { 'auth.users': 1 };
    },
  });
  const lines = [];
  const r = await cleanup.runBacklog({ client, mode: 'backlog', log: (l) => lines.push(l) });
  assert.equal(r.ok, false);
  assert.equal(calls.deleted.length, 3);
  assert.equal(r.deleted, 2);
  assert.equal(r.failedUsers, 1);
  const everything = `${lines.join('\n')}\n${JSON.stringify(r)}`;
  for (const secret of [EMAIL, PW, 'p001', 'nestly-e2e']) assert.ok(!everything.includes(secret), `leaked ${secret}`);
});

test('[cleanup c] the listing throwing fails the run before any delete, without echoing the error', async () => {
  const { client, calls } = backlogClient({
    listPatternUsers: async () => {
      throw new Error(`boom ${PW}`);
    },
  });
  const r = await cleanup.runBacklog({ client, mode: 'backlog', log: () => {} });
  assert.equal(r.ok, false);
  assert.equal(calls.deleted.length, 0);
  assert.ok(!JSON.stringify(r).includes(PW));
});

test('[cleanup c] the workflow: dispatch input mode is a choice of dry-run (default) and backlog, passed through env only', () => {
  const input = cwf.on.workflow_dispatch.inputs.mode;
  assert.equal(input.type, 'choice');
  assert.equal(input.default, 'dry-run');
  assert.deepEqual([...input.options], ['dry-run', 'backlog']);
  assert.match(String(csteps[secretIdx].env.CLEANUP_MODE), /^\$\{\{\s*inputs\.mode\s*\}\}$/);
  assert.match(String(cjob.if), /github\.event_name == 'workflow_dispatch' && github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.match(String(cjob.if), /github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion != 'skipped'/);
  assert.equal(cjob.environment, 'preview-e2e');
});

test('[cleanup c] the backlog SQL lists by the same pattern; the delete guard is unchanged', () => {
  assert.match(cliText, /where email ~ \$\{TEST_EMAIL_PATTERN\}\s+order by created_at asc, id asc`/);
  assert.match(cliText, /delete from auth\.users where id = \$\{id\} and email ~ \$\{TEST_EMAIL_PATTERN\}/);
  assert.match(cliText, /for update/);
});
