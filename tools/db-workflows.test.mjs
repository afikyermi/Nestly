// Repository tests for the two database workflows (I1 F1.1 part a, .work/identity-platform/spec.md):
//   criterion 1  the `db` job of .github/workflows/ci.yml: triggers, no secret, no environment, order, fail-closed
//   criterion 5  .github/workflows/migrate.yml: triggers, job order and gating, the one secret
//   criteria 6, 7 (static side only; the proof is the CI job itself): the steps and the fixture exist and are wired
// and, carried into part b (spec criteria 2, 9, 20; findings.md "Part a" findings 1 and 2):
//   finding 2    no step of the db job or of either migrate job can swallow a failure or be skipped
//   finding 1    the migrate steps that hold the URL require TLS and never write it (or psql's output) anywhere
//   criterion 9  bootstrap step 2 is a versioned file with a check, run twice as postgres in one db step
//   criterion 20 the db job compares the Drizzle schema with the migrated database, before the suite
//   criterion 2  every pgTAP file asserts session_user = 'app_server' before anything else
// The path filter of Spec addendum 3 (the `changes` job and the db job's one allowed `if`) is in tools/ci-path-filters.test.mjs.
// They parse the workflow files as data. They never run a workflow. The URL guard has its own file.
// The YAML reader and the helpers both files share are in tools/workflow-yaml.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOf, has, isLogStep, nameOf, needsOf, parseYaml, runOf, stepsOf, swallowProblems, swallows, unquote } from './workflow-yaml.mjs';

// ---------------------------------------------------------------------------------------------------------------------
// helpers

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const load = (rel) => parseYaml(read(rel));

const ci = load('.github/workflows/ci.yml');
const migrate = load('.github/workflows/migrate.yml');

const expressions = (value) => [...JSON.stringify(value).matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1]);
const firstIndex = (steps, re) => steps.findIndex((s) => re.test(runOf(s)));

test('the YAML subset reader reads the shapes the workflows use (guards the tests below)', () => {
  const doc = parseYaml(
    [
      '# comment',
      'on:',
      '  pull_request:',
      '  push:',
      '    branches: [main]',
      '    paths:',
      '      - "a/**"',
      'jobs:',
      '  j:',
      '    steps:',
      '      - uses: x@v4',
      '        with:',
      '          k: v',
      '      - name: n',
      '        run: |',
      '          line one',
      '',
      '          # not a comment here',
      '      - run: echo hi # trailing',
    ].join('\n'),
  );
  assert.deepEqual(Object.keys(doc.on), ['pull_request', 'push']);
  assert.equal(doc.on.pull_request, null);
  assert.deepEqual(doc.on.push.branches, ['main']);
  assert.deepEqual(doc.on.push.paths, ['a/**']);
  assert.equal(doc.jobs.j.steps[0].with.k, 'v');
  assert.equal(doc.jobs.j.steps[1].run, 'line one\n\n# not a comment here');
  assert.equal(doc.jobs.j.steps[2].run, 'echo hi');
});

// ---------------------------------------------------------------------------------------------------------------------
// criterion 1 - the CI `db` job

const db = ci.jobs?.db;
const dbSteps = db ? stepsOf(db) : [];

test('[F1.1-a c1] ci.yml has a job named db', () => {
  assert.ok(db, 'jobs.db is missing');
  assert.ok(dbSteps.length > 0, 'the db job has no steps');
});

test('[F1.1-a c1] the workflow runs on every pull request and every push to main, with no filter that skips any', () => {
  assert.ok(has(ci.on, 'pull_request'), 'no pull_request trigger');
  const pr = ci.on.pull_request;
  if (pr !== null) {
    for (const filter of ['branches', 'branches-ignore', 'paths', 'paths-ignore', 'types']) {
      assert.equal(has(pr, filter), false, `pull_request has a ${filter} filter: some pull requests would skip the db job`);
    }
  }
  assert.ok(has(ci.on, 'push'), 'no push trigger');
  assert.ok([ci.on.push.branches].flat().includes('main'), 'push does not include main');
  for (const filter of ['paths', 'paths-ignore', 'tags']) {
    assert.equal(has(ci.on.push, filter), false, `push has a ${filter} filter: a push to main could skip the db job`);
  }
});

// ---- part a CRITIC finding 2: no step swallows a failure (the detector is in tools/workflow-yaml.mjs) ---------------------

test('[F1.1-a c1 finding 2] the swallow detector flags what hides a failure and lets the rest through (guards the tests below)', () => {
  for (const hidden of [
    'supabase db push --db-url "$U" || true',
    'psql -f a.sql ||true',
    'cmd || :',
    'cmd || exit 0',
    'cmd || exit   0;',
    'cmd ||\n  true',
    'a && b || true\nnext',
    'cmd \\\n  || true',
    '(cmd || true)',
  ]) {
    assert.equal(swallows(hidden), true, `not flagged: ${JSON.stringify(hidden)}`);
  }
  for (const fine of [
    'cmd || fail "x"',
    'cmd || exit 1',
    '[ -f a ] || { echo no; exit 1; }',
    'cmd || true_value=1',
    'cmd || :foo',
    'if ! cmd; then exit 1; fi',
    '# cmd || true',
    'echo ok\n# a || true\necho done',
  ]) {
    assert.equal(swallows(fine), false, `flagged: ${JSON.stringify(fine)}`);
  }
});

test('[F1.1-a c1 finding 2] no step of the db job swallows a failure or can be skipped (only the failure-only docker logs step has an if)', () => {
  assert.deepEqual(swallowProblems('db', dbSteps), []);
  assert.equal(dbSteps.filter((s) => has(s, 'if')).length <= 1, true, 'more than one conditional step in the db job');
});

test('[F1.1-a c1] the db job uses no GitHub secret and no environment', () => {
  assert.equal(has(db, 'environment'), false, 'the db job names an environment');
  assert.equal(has(db, 'secrets'), false);
  assert.equal(has(db, 'uses'), false, 'the db job calls a reusable workflow, which could pass secrets');
  for (const step of dbSteps) assert.equal(has(step, 'environment'), false);
  for (const expr of expressions(ci)) {
    assert.doesNotMatch(expr, /\bsecrets\b/, `an expression in ci.yml reads a secret: \${{ ${expr.trim()} }}`);
  }
  const serialised = JSON.stringify(db);
  assert.doesNotMatch(serialised, /secrets\./);
  assert.doesNotMatch(serialised, /GITHUB_TOKEN/, 'the db job reads the repository token');
  assert.doesNotMatch(serialised, /\bvars\./, 'the db job reads a repository variable');
});

test('[F1.1-a c1] the order is bootstrap step 1, then migrations, then bootstrap step 2, then the pgTAP suite', () => {
  const step1 = firstIndex(dbSteps, /bootstrap\/01-roles\.sql/);
  const push = firstIndex(dbSteps, /supabase\s+db\s+push/);
  const step2 = firstIndex(dbSteps, /02-anchor-fk\.sql/);
  const prove = firstIndex(dbSteps, /\bpg_prove\b/);
  for (const [name, idx] of Object.entries({ step1, push, step2, prove })) assert.ok(idx >= 0, `no step runs ${name}`);
  assert.ok(step1 < push, 'migrations run before bootstrap step 1');
  assert.ok(push < step2, 'bootstrap step 2 runs before the migrations');
  assert.ok(step2 < prove, 'pgTAP runs before bootstrap step 2');
});

test('[F1.1-a c1] bootstrap runs as postgres, migrations as app_owner, and the suite as app_server', () => {
  const asOf = (step) => step.env?.PGUSER;
  const step1 = dbSteps[firstIndex(dbSteps, /bootstrap\/01-roles\.sql/)];
  const step2 = dbSteps[firstIndex(dbSteps, /02-anchor-fk\.sql/)];
  const prove = dbSteps[firstIndex(dbSteps, /\bpg_prove\b/)];
  assert.equal(asOf(step1), 'postgres');
  assert.equal(asOf(step2), 'postgres');
  assert.equal(asOf(prove), 'app_server');
  assert.match(runOf(prove), /--username\s+app_server\b/);
  // The migration connection is a URL (--db-url), so it is the URL's user that counts, not PGUSER.
  const urlDefinition = dbSteps.map(runOf).join('\n').match(/postgres(?:ql)?:\/\/([a-z_]+):/);
  assert.ok(urlDefinition, 'no step builds the migration URL');
  assert.equal(urlDefinition[1], 'app_owner', 'the migration connection is not app_owner');
  const pushSteps = dbSteps.filter((s) => /supabase\s+db\s+push/.test(runOf(s)));
  assert.ok(pushSteps.length >= 1);
  for (const step of pushSteps) {
    assert.match(runOf(step), /--db-url\s/, `"${step.name}" pushes without an explicit --db-url`);
    assert.doesNotMatch(runOf(step), /postgres(?:ql)?:\/\/(postgres|app_server)\b/);
  }
});

test('[F1.1-a c1] the pgTAP step runs every file under supabase/tests and fails when there is none', () => {
  const prove = dbSteps[firstIndex(dbSteps, /\bpg_prove\b/)];
  assert.match(runOf(prove), /supabase\/tests/);
  assert.match(runOf(prove), /exit 1/, 'an empty suite does not fail the job');
  const dir = join(root, 'supabase/tests');
  assert.ok(existsSync(dir), 'supabase/tests does not exist');
  const files = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.sql') && !String(f).startsWith('setup'));
  assert.ok(files.length >= 3, `expected the part-a pgTAP files, found ${files.length}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// criteria 6 and 7 - the static side. The proof that they hold is the db job itself.

test('[F1.1-a c6] the db job pushes a second time with nothing pending and fails if the database changed', () => {
  const pushes = dbSteps.flatMap((s, i) => (/supabase\s+db\s+push/.test(runOf(s)) ? [i] : []));
  assert.ok(pushes.length >= 2, 'no second push step');
  const second = dbSteps[pushes[1]];
  assert.match(runOf(second), /fingerprint/, 'the second push does not compare the database before and after');
  assert.match(runOf(second), /exit 1/);
  assert.ok(/!=/.test(runOf(second)) || /\bdiff\b|\bcmp\b/.test(runOf(second)), 'before and after are not compared');
});

test('[F1.1-a c7] the failing-migration fixture is outside supabase/migrations, ends in a failure, and sorts last', () => {
  const dir = join(root, 'supabase/ci/fixtures');
  const fixtures = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  assert.ok(fixtures.length >= 1, 'no fixture migration');
  const version = (name) => name.split('_')[0];
  for (const f of fixtures) {
    const sql = read(`supabase/ci/fixtures/${f}`).replace(/--.*$/gm, '').toLowerCase();
    const creates = [...sql.matchAll(/\bcreate\b/g)].length;
    assert.ok(creates >= 2, `${f}: fewer than two statements before the failing one, so atomicity is not shown`);
    assert.ok(sql.includes('raise exception'), `${f}: nothing fails`);
    assert.ok(sql.lastIndexOf('raise exception') > sql.lastIndexOf('create'), `${f}: the failure is not the last statement`);
    assert.match(f, /^\d{14}_/);
    const migrationsDir = join(root, 'supabase/migrations');
    const real = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter((m) => m.endsWith('.sql')) : [];
    for (const m of real) {
      assert.ok(version(m) < version(f), `${m} sorts after the fixture ${f}: the fixture would not be the last migration`);
      assert.notEqual(m, f);
      assert.doesNotMatch(read(`supabase/migrations/${m}`), /atomicity probe|ci_atomicity_probe/, `${m} contains the fixture`);
    }
  }
  const step = dbSteps.find((s) => /ci\/fixtures/.test(runOf(s)));
  assert.ok(step, 'no db-job step uses the fixture');
  assert.match(runOf(step), /exit 1/);
  assert.match(runOf(step), /fingerprint/);
});

test('[F1.1-a c7] the fixture step expects the push to fail, and fails the job if it succeeds', () => {
  const step = dbSteps.find((s) => /ci\/fixtures/.test(runOf(s)));
  assert.ok(step, 'no db-job step uses the fixture');
  const run = runOf(step);
  assert.match(run, /supabase\s+db\s+push/);
  assert.match(run, /if\s+supabase\s+db\s+push/, 'the push is not under a condition that expects its failure');
  assert.match(run, /applied without/i, 'a push that succeeds does not fail the job');
});

// ---------------------------------------------------------------------------------------------------------------------
// criterion 5 - the migrate workflow

const jobs = Object.entries(migrate.jobs ?? {});
const jobFor = (environment) => jobs.find(([, j]) => j.environment === environment);

test('[F1.1-a c5] migrate triggers only on push to main limited to supabase/migrations/** and on workflow_dispatch', () => {
  assert.deepEqual(Object.keys(migrate.on).sort(), ['push', 'workflow_dispatch']);
  assert.equal(has(migrate.on, 'pull_request'), false);
  assert.equal(has(migrate.on, 'pull_request_target'), false);
  assert.deepEqual([migrate.on.push.branches].flat(), ['main']);
  assert.deepEqual([migrate.on.push.paths].flat(), ['supabase/migrations/**']);
  assert.equal(has(migrate.on.push, 'tags'), false);
  assert.equal(has(migrate.on.push, 'branches-ignore'), false);
  assert.equal(has(migrate.on.push, 'paths-ignore'), false);
});

test('[F1.1-a c5] migrate has two jobs, each bound to its own environment', () => {
  assert.equal(jobs.length, 2);
  for (const [id, job] of jobs) assert.ok(typeof job.environment === 'string' && job.environment !== '', `job ${id} has no environment`);
  assert.ok(jobFor('db-preview'), 'no job on db-preview');
  assert.ok(jobFor('db-production'), 'no job on db-production');
  assert.notEqual(jobFor('db-preview')[0], jobFor('db-production')[0]);
});

test('[F1.1-a c5] the db-preview job runs first and the db-production job needs it', () => {
  const [previewId, preview] = jobFor('db-preview');
  const [, production] = jobFor('db-production');
  assert.deepEqual(needsOf(preview), [], 'the preview job waits for something');
  assert.ok(needsOf(production).includes(previewId), 'the production job does not need the preview job');
});

test('[F1.1-a c5] the db-production job runs only from main and cannot run after a failed or skipped preview', () => {
  const [, production] = jobFor('db-production');
  assert.equal(typeof production.if, 'string', 'the production job has no condition on the ref');
  assert.match(production.if, /github\.ref(_name)?\s*==\s*'(refs\/heads\/)?main'/);
  assert.doesNotMatch(production.if, /\|\|/, 'the main-only condition can be bypassed with ||');
  assert.doesNotMatch(production.if, /\b(always|failure|cancelled|success)\s*\(/i, 'a status function overrides the needs gate');
  for (const [id, job] of jobs) {
    assert.equal(has(job, 'continue-on-error'), false, `${id} can fail without stopping the next job`);
    for (const step of stepsOf(job)) assert.equal(has(step, 'continue-on-error'), false, `${id}: ${step.name}`);
  }
});

test('[F1.1-a c5] the db-production environment is a literal, not an expression chosen at run time', () => {
  for (const [id, job] of jobs) assert.doesNotMatch(String(job.environment), /\$\{\{/, `${id} picks its environment dynamically`);
  assert.equal(jobFor('db-production')[1].environment, 'db-production');
});

test('[F1.1-a c5] migrate reads only APP_OWNER_DATABASE_URL, and each job reads it', () => {
  for (const expr of expressions(migrate)) {
    if (!/\bsecrets\b/.test(expr)) continue;
    assert.match(expr.trim(), /^secrets\.APP_OWNER_DATABASE_URL$/, `migrate reads something else: \${{ ${expr.trim()} }}`);
  }
  assert.doesNotMatch(JSON.stringify(migrate), /secrets:\s*inherit|toJSON\(\s*secrets|secrets\[/);
  for (const [id, job] of jobs) {
    assert.equal(has(job, 'secrets'), false, `${id} passes secrets`);
    assert.equal(has(job, 'uses'), false, `${id} calls a reusable workflow`);
    assert.match(JSON.stringify(job), /secrets\.APP_OWNER_DATABASE_URL/, `${id} never reads the secret`);
  }
  assert.doesNotMatch(JSON.stringify(migrate), /GITHUB_TOKEN|github\.token/, 'migrate reads the repository token');
});

test('[F1.1-a c5] the secret is given to the steps that need it, not to the whole workflow or job', () => {
  assert.doesNotMatch(JSON.stringify(migrate.env ?? {}), /APP_OWNER|secrets/);
  for (const [id, job] of jobs) {
    assert.doesNotMatch(JSON.stringify(job.env ?? {}), /APP_OWNER|secrets/, `${id} exposes the secret to every step`);
    const steps = stepsOf(job);
    const firstWithSecret = steps.findIndex((s) => /APP_OWNER_DATABASE_URL/.test(JSON.stringify(s)));
    assert.ok(firstWithSecret > 0, `${id}: no step before the first that holds the secret (the CLI install must not hold it)`);
    for (const step of steps.slice(0, firstWithSecret)) assert.doesNotMatch(JSON.stringify(step), /APP_OWNER_DATABASE_URL/);
  }
});

test('[F1.1-a c5] each job runs the URL guard for its own environment, before it applies anything', () => {
  for (const environment of ['db-preview', 'db-production']) {
    const [id, job] = jobFor(environment);
    const steps = stepsOf(job);
    const guardIdx = steps.findIndex((s) => /migrate-url-guard\.mjs/.test(runOf(s)));
    const applyIdx = firstIndex(steps, /supabase\s+db\s+push/);
    assert.ok(guardIdx >= 0, `${id}: no guard step`);
    assert.ok(applyIdx >= 0, `${id}: no apply step`);
    assert.ok(guardIdx < applyIdx, `${id}: the guard runs after the apply`);
    const arg = /migrate-url-guard\.mjs\s+(\S+)/.exec(runOf(steps[guardIdx]))?.[1];
    assert.equal(arg, environment, `${id}: the guard checks ${arg}, not ${environment}`);
    assert.match(JSON.stringify(steps[guardIdx]), /secrets\.APP_OWNER_DATABASE_URL/, `${id}: the guard does not see the secret`);
    assert.match(JSON.stringify(steps[applyIdx]), /secrets\.APP_OWNER_DATABASE_URL/);
    assert.equal(steps.filter((s) => /supabase\s+db\s+push/.test(runOf(s))).length, 1, `${id}: more than one apply step`);
    assert.doesNotMatch(runOf(steps[guardIdx]), /\|\|/, `${id}: the guard result is ignored`);
  }
});

// ---- URL hygiene: the URL, and psql's output (which can quote it), are written nowhere --------------------------------
// Spec criterion 5 "it never prints the URL" and part a finding 1. A step that holds the secret may send output to
// /dev/null or duplicate a file descriptor (2>&1); it may not write to a file, append to a GitHub file command, use
// tee, or ask psql for an output/log file. (A redirect on a line of its own, such as `probe >/dev/null 2>&1`, is judged
// by where it goes, not by whether the URL happens to be on the same line.)

const REDIRECT = /(\d*)>{1,2}\s*(&\d+|&-|[^\s;|&)]+)/g;
const writtenTo = (run) =>
  [...codeOf(run).matchAll(REDIRECT)]
    .map((m) => unquote(m[2]))
    .filter((target) => !(target === '/dev/null' || /^&(\d+|-)$/.test(target)));
const writesOutput = (run) => writtenTo(run).length > 0 || /\btee\b/.test(codeOf(run)) || /\s(-o|--output|-L|--log-file)\b/.test(codeOf(run));

test('[F1.1-a c5] the output-writing detector flags every way to put output in a file and lets /dev/null and fd copies through (guards the tests below)', () => {
  for (const bad of [
    'psql "$APP_OWNER_DATABASE_URL" -c x > out.txt',
    'psql "$APP_OWNER_DATABASE_URL" -c x >> "$GITHUB_STEP_SUMMARY"',
    'psql "$APP_OWNER_DATABASE_URL" 2> err.log',
    'psql "$APP_OWNER_DATABASE_URL" &> all.log',
    'psql "$APP_OWNER_DATABASE_URL" -c x | tee log.txt',
    'psql "$APP_OWNER_DATABASE_URL" -o result.txt -c x',
    'psql "$APP_OWNER_DATABASE_URL" --log-file log.txt',
    'probe() { psql "$U"; }\nprobe > "${RUNNER_TEMP}/probe.log" 2>&1',
    'echo "$APP_OWNER_DATABASE_URL" >> "$GITHUB_ENV"',
  ]) {
    assert.equal(writesOutput(bad), true, `not flagged: ${JSON.stringify(bad)}`);
  }
  for (const fine of [
    'if ! probe >/dev/null 2>&1; then exit 1; fi',
    'psql "$U" -c x >/dev/null',
    'psql "$U" -c x > /dev/null 2>&1',
    'psql "$U" -c x 2>&1',
    'psql "$U" -c x 1>&2',
    'psql "$U" -c x >&2',
    'node tools/migrate-url-guard.mjs db-preview',
    '# probe > file.txt',
  ]) {
    assert.equal(writesOutput(fine), false, `flagged: ${JSON.stringify(fine)}`);
  }
});

test('[F1.1-a c5] nothing in migrate prints or exports the URL, and no step that holds it writes any output anywhere', () => {
  for (const [id, job] of jobs) {
    for (const step of stepsOf(job)) {
      const run = runOf(step);
      assert.doesNotMatch(run, /\bset\s+-[a-zA-Z]*x/, `${id}: ${step.name} turns on shell tracing`);
      assert.doesNotMatch(run, /\bxtrace\b/);
      assert.doesNotMatch(run, /ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG/);
      for (const line of run.split('\n')) {
        if (!/APP_OWNER_DATABASE_URL/.test(line)) continue;
        assert.doesNotMatch(line, /^\s*(echo|printf|cat|env|printenv|tee|export)\b/, `${id}: prints the URL: ${line.trim()}`);
        assert.doesNotMatch(line, /GITHUB_(ENV|OUTPUT|STEP_SUMMARY|PATH)/, `${id}: exports the URL: ${line.trim()}`);
      }
      assert.doesNotMatch(run, /\bprintenv\b|(^|\n)\s*env\s*(\n|$)/, `${id}: dumps the environment`);
      if (/APP_OWNER_DATABASE_URL/.test(JSON.stringify(step))) {
        assert.deepEqual(writtenTo(run), [], `${id}: ${step.name} redirects output into a file (it can quote the URL)`);
        assert.doesNotMatch(codeOf(run), /\btee\b/, `${id}: ${step.name} pipes through tee`);
        assert.doesNotMatch(codeOf(run), /\s(-o|--output|-L|--log-file)\b/, `${id}: ${step.name} asks a tool for an output file`);
      }
    }
  }
});

test('[F1.1-a c5] the guard step in each job calls tools/migrate-url-guard.mjs, and that file exists', () => {
  assert.ok(existsSync(join(root, 'tools/migrate-url-guard.mjs')));
  for (const [id, job] of jobs) {
    assert.ok(stepsOf(job).some((s) => /node\s+tools\/migrate-url-guard\.mjs/.test(runOf(s))), `${id}: wrong guard path`);
  }
});

// ---- part a CRITIC finding 1: the guard comes first, TLS is required ----------------------------------------------------

test('[F1.1-a c5 finding 1] the URL guard is the first step in each migrate job that holds the secret, so nothing parses an unchecked URL', () => {
  for (const [id, job] of jobs) {
    const steps = stepsOf(job);
    const first = steps.findIndex((s) => /APP_OWNER_DATABASE_URL/.test(JSON.stringify(s)));
    assert.ok(first >= 0, `${id}: no step holds the secret`);
    assert.match(runOf(steps[first]), /migrate-url-guard\.mjs/, `${id}: the first step that holds the secret is "${nameOf(steps[first])}", not the guard`);
    steps.forEach((step, i) => {
      if (i < first) {
        assert.doesNotMatch(runOf(step), /\bpsql\b[^\n]*(\$\{?APP_OWNER_DATABASE_URL|postgres(ql)?:\/\/)/, `${id}: psql sees a URL before the guard`);
      }
    });
  }
});

test('[F1.1-a c5 finding 1] every migrate step that runs psql with the URL requires TLS (PGSSLMODE=require)', () => {
  for (const [id, job] of jobs) {
    const psqlSteps = stepsOf(job).filter((s) => /\bpsql\b/.test(runOf(s)) && /APP_OWNER_DATABASE_URL/.test(JSON.stringify(s)));
    assert.ok(psqlSteps.length >= 1, `${id}: no psql step with the URL (the auth-functions hash check is missing)`);
    for (const step of psqlSteps) {
      assert.equal(step.env?.PGSSLMODE, 'require', `${id}: "${nameOf(step)}" does not set PGSSLMODE=require`);
    }
  }
});

test('[F1.1-a c5 finding 1] the hash check runs before the push in each migrate job and stops psql on an error', () => {
  for (const [id, job] of jobs) {
    const steps = stepsOf(job);
    const check = firstIndex(steps, /auth-functions-check\.sql/);
    const push = firstIndex(steps, /supabase\s+db\s+push/);
    assert.ok(check >= 0, `${id}: no auth-functions hash check`);
    assert.ok(check < push, `${id}: the hash check runs after the push`);
    assert.match(runOf(steps[check]), /ON_ERROR_STOP=1/, `${id}: a failing check would not stop psql with an error`);
  }
});

// ---- part a CRITIC finding 2, the migrate jobs -------------------------------------------------------------------------

test('[F1.1-a c5 finding 2] no step of either migrate job swallows a failure or can be skipped; neither has a step-level if', () => {
  for (const [id, job] of jobs) {
    assert.deepEqual(swallowProblems(`migrate ${id}`, stepsOf(job)), []);
    assert.equal(stepsOf(job).filter((s) => has(s, 'if')).length, 0, `${id}: a step has an if`);
  }
  assert.equal(has(jobFor('db-preview')[1], 'if'), false, 'the preview job has a job-level if: it can be skipped, and the production job would not follow');
});

test('[F1.1-a c5 finding 2] the swallow check can fail: every mutation from the finding is caught (a test that has never failed tells nothing)', () => {
  const previewSteps = stepsOf(jobFor('db-preview')[1]);
  const productionSteps = stepsOf(jobFor('db-production')[1]);
  const isPush = (s) => /supabase\s+db\s+push/.test(runOf(s));
  const isHash = (s) => /auth-functions-check\.sql/.test(runOf(s));
  const isGuard = (s) => /migrate-url-guard\.mjs/.test(runOf(s));
  const isProve = (s) => /\bpg_prove\b/.test(runOf(s));
  const isDrift = (s) => /db:drift|db-drift/.test(runOf(s));
  const isStep2 = (s) => /02-anchor-fk\.sql/.test(runOf(s));
  const append = (tail) => (s) => ({ run: `${runOf(s)}${tail}` });
  const cases = [
    ['|| true on the preview push', 'preview', previewSteps, isPush, append(' || true')],
    ['|| true on the production push', 'production', productionSteps, isPush, append(' || true')],
    ['|| : on the preview hash check', 'preview', previewSteps, isHash, append(' || :')],
    ['|| exit 0 on the production hash check', 'production', productionSteps, isHash, append(' || exit 0')],
    ['|| true on the URL guard', 'preview', previewSteps, isGuard, append(' || true')],
    ['|| true on a continuation line of the push', 'preview', previewSteps, isPush, append(' \\\n  || true')],
    ['if: false on the preview push', 'preview', previewSteps, isPush, () => ({ if: 'false' })],
    ['if: always() on the hash check', 'production', productionSteps, isHash, () => ({ if: 'always()' })],
    ['continue-on-error on the preview push', 'preview', previewSteps, isPush, () => ({ 'continue-on-error': 'true' })],
    ['|| true on pg_prove', 'db', dbSteps, isProve, append(' || true')],
    ['if: false on pg_prove', 'db', dbSteps, isProve, () => ({ if: 'false' })],
    ['|| : on the drift check', 'db', dbSteps, isDrift, append(' || :')],
    ['|| true on bootstrap step 2', 'db', dbSteps, isStep2, append(' || true')],
    ['set +e in the push step', 'preview', previewSteps, isPush, (s) => ({ run: `set +e\n${runOf(s)}` })],
    ['failure() on a step that is not the docker logs step', 'db', dbSteps, isProve, () => ({ if: 'failure()' })],
  ];
  for (const [label, jobLabel, steps, matcher, change] of cases) {
    assert.ok(steps.some(matcher), `${label}: there is no such step to mutate`);
    const mutant = steps.map((s) => (matcher(s) ? { ...s, ...change(s) } : s));
    assert.notDeepEqual(swallowProblems(`mutant ${jobLabel}`, mutant), [], `${label} was not caught`);
  }
});

test('[F1.1-a c1 finding 2] the one allowed exception is exactly the failure-only docker logs step, last in the db job', () => {
  const last = dbSteps[dbSteps.length - 1];
  assert.equal(isLogStep(last), true, 'the last db step is not the failure-only docker logs step');
  assert.equal(dbSteps.filter(isLogStep).length, 1);
  // The exception does not stretch: hide a second command in it, or move it, and the check complains.
  const stretched = [...dbSteps.slice(0, -1), { ...last, run: `${runOf(last)}\ncurl -s https://example.invalid || true` }];
  assert.notDeepEqual(swallowProblems('stretched', stretched), []);
  const moved = [last, ...dbSteps.slice(0, -1)];
  assert.notDeepEqual(swallowProblems('moved', moved), []);
});

// ---------------------------------------------------------------------------------------------------------------------
// part b, criteria 2, 9 and 20 - the static side. The proof that they hold is the db job itself.

test('[F1.1-b c9] bootstrap step 2 is a versioned file in supabase/bootstrap with a check script, and one db step runs it twice as postgres and compares the database', () => {
  for (const f of ['supabase/bootstrap/02-anchor-fk.sql', 'supabase/bootstrap/02-anchor-fk-check.sql']) {
    assert.ok(existsSync(join(root, f)), `${f} is missing`);
  }
  const step = dbSteps.find((s) => /02-anchor-fk\.sql/.test(runOf(s)));
  assert.ok(step, 'no db step runs bootstrap step 2');
  assert.equal(step.env?.PGUSER, 'postgres', 'bootstrap step 2 does not run as postgres');
  const run = runOf(step);
  const runs = [...run.matchAll(/psql[^\n]*-f\s+"?(\$\{step\}|supabase\/bootstrap\/02-anchor-fk\.sql)"?/g)];
  assert.ok(runs.length >= 2, `step 2 is run ${runs.length} time(s); a second run must prove it changes nothing`);
  assert.match(run, /fingerprint/, 'the database is not compared between the first and the second run');
  assert.match(run, /exit 1/);
  assert.match(run, /02-anchor-fk-check\.sql/, 'the check script is not run');
  assert.deepEqual(swallowProblems('step 2', [step]), []);
});

test('[F1.1-b c9] once a migration exists, a missing bootstrap step 2 file fails the db job instead of being skipped', () => {
  const step = dbSteps.find((s) => /02-anchor-fk\.sql/.test(runOf(s)));
  assert.ok(step, 'no db step runs bootstrap step 2');
  const run = runOf(step);
  assert.match(run, /supabase\/migrations/, 'the step does not look at whether migrations exist');
  const failIdx = run.search(/exit 1/);
  const skipIdx = run.search(/exit 0/);
  assert.ok(failIdx >= 0, 'the step has no failure exit');
  assert.ok(skipIdx < 0 || failIdx < skipIdx, 'the skip (exit 0) comes before any failure (exit 1): a missing file is skipped without looking at the migrations');
});

test('[F1.1-b c20] the db job compares the Drizzle schema with the migrated database after the migrations and before the suite, and the comparison fails the job', () => {
  const drift = firstIndex(dbSteps, /db:drift|db-drift/);
  assert.ok(drift >= 0, 'no db step runs the Drizzle drift check');
  const push = firstIndex(dbSteps, /supabase\s+db\s+push/);
  const prove = firstIndex(dbSteps, /\bpg_prove\b/);
  assert.ok(push < drift, 'the drift check runs before the migrations');
  assert.ok(drift < prove, 'the drift check runs after the suite');
  const install = firstIndex(dbSteps, /\bnpm\s+ci\b/);
  assert.ok(install >= 0 && install < drift, 'dependencies are not installed before the drift check');
  const run = runOf(dbSteps[drift]);
  assert.match(run, /catalog-columns\.sql/, 'the drift check does not read the column catalog from the database');
  assert.deepEqual(swallowProblems('drift', [dbSteps[drift]]), []);
});

test('[F1.1-b c2] the fixtures under supabase/tests/setup run as postgres before the suite, and the suite does not try to run them as tests', () => {
  assert.ok(existsSync(join(root, 'supabase/tests/setup')), 'supabase/tests/setup does not exist');
  const setupFiles = readdirSync(join(root, 'supabase/tests/setup')).filter((f) => f.endsWith('.sql'));
  assert.ok(setupFiles.length >= 1, 'no fixture file');
  const fixtures = firstIndex(dbSteps, /supabase\/tests\/setup/);
  const prove = firstIndex(dbSteps, /\bpg_prove\b/);
  assert.ok(fixtures >= 0, 'no db step runs the fixtures');
  assert.ok(fixtures < prove, 'the fixtures run after the suite');
  assert.equal(dbSteps[fixtures].env?.PGUSER, 'postgres');
  assert.match(runOf(dbSteps[prove]), /-path\s+supabase\/tests\/setup\s+-prune/, 'pg_prove would run the fixture files as tests');
  assert.deepEqual(swallowProblems('fixtures', [dbSteps[fixtures]]), []);
});

test('[F1.1-b c2] every pgTAP file asserts session_user = app_server before anything else, runs in a rolled-back transaction and tags its tests', () => {
  const dir = join(root, 'supabase/tests');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.length >= 8, `expected the part a and part b pgTAP files, found ${files.length}: ${files.join(', ')}`);
  for (const f of files) {
    const raw = read(`supabase/tests/${f}`);
    const sql = raw.replace(/--.*$/gm, '');
    assert.match(sql, /^\s*begin\s*;/i, `${f}: does not open a transaction first`);
    assert.match(sql, /select\s+\*\s+from\s+finish\(\)\s*;\s*rollback\s*;\s*$/i, `${f}: does not end with finish() and a rollback`);
    const first = /select\s+(is|isnt|ok|is_empty|lives_ok|throws_ok|results_eq|cmp_ok|matches|alike)\s*\(/i.exec(sql);
    assert.ok(first, `${f}: has no assertion`);
    assert.match(
      sql.slice(first.index, first.index + 80),
      /^select\s+is\(\s*session_user::text\s*,\s*'app_server'/i,
      `${f}: its first assertion is not session_user = 'app_server'`,
    );
    // Any feature's tag: [F1.1-a c10], [F1.3-a c1], ... (the session_user-first and rollback checks above are unchanged).
    assert.match(raw, /\[F\d+\.\d+-[a-z] c\d+/, `${f}: no test name carries a [Fn.n-x cN] tag`);
  }
});
