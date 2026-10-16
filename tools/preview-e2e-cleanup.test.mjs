// preview-e2e cleanup (.work/preview-e2e/spec.md, criteria 8 and 9; A2 and DR-E1 option 1): the DB URL guard, the preflight,
// victim selection, runCleanup and the cleanup workflow. Split out of preview-e2e.test.mjs to stay under the line budget;
// the assertions are unchanged. Expected values come from the spec, schema.md (ref xmihorrkegrdlbhpktny, 3 h age, cap of 10,
// port 5432, the eight tables) and the F1.6 limit, never from the code under test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  nestlyTables: ['children', 'journey_contexts', 'legal_consents', 'recovery_answers', 'recovery_events', 'recovery_throttles', 'regular_profiles', 'users'],
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

test('[E c8] the cleanup workflow triggers only on workflow_run completed of preview-e2e', () => {
  assert.deepEqual(Object.keys(cwf.on), ['workflow_run']);
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
