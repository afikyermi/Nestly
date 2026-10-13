// Repository tests for the two database workflows (I1 F1.1 part a, .work/identity-platform/spec.md):
//   criterion 1  the `db` job of .github/workflows/ci.yml: triggers, no secret, no environment, order, fail-closed
//   criterion 5  .github/workflows/migrate.yml: triggers, job order and gating, the one secret
//   criteria 6, 7 (static side only; the proof is the CI job itself): the steps and the fixture exist and are wired
// They parse the workflow files as data. They never run a workflow. The URL guard has its own file.
//
// The repo has no YAML dependency and a test must not add one, so parseYaml below reads the small subset the workflows
// use. Every scalar stays a STRING. An unsupported construct throws, so it fails loudly instead of being misread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------------
// the YAML subset reader

function lineOf(raw) {
  return { raw, indent: raw.length - raw.trimStart().length, text: raw.trim(), blank: /^\s*(#.*)?$/.test(raw) };
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function scalar(rest) {
  const value = rest.trim();
  if (/^[&*!]/.test(value) || value.startsWith('{')) throw new Error(`mini-yaml: unsupported value ${value}`);
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error(`mini-yaml: unsupported flow sequence ${value}`);
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((item) => unquote(item.trim()));
  }
  if (value.startsWith('"') || value.startsWith("'")) return unquote(value);
  return value.replace(/\s+#.*$/, '');
}

function parseYaml(source) {
  const lines = source.split(/\r?\n/).map(lineOf);
  let pos = 0;
  const isDash = (l) => l.text === '-' || l.text.startsWith('- ');

  const peek = () => {
    while (pos < lines.length && lines[pos].blank) pos += 1;
    return lines[pos];
  };

  function blockScalar(parentIndent, folded) {
    const body = [];
    let minIndent = Infinity;
    while (pos < lines.length && (lines[pos].text === '' || lines[pos].indent > parentIndent)) {
      body.push(lines[pos]);
      if (lines[pos].text !== '') minIndent = Math.min(minIndent, lines[pos].indent);
      pos += 1;
    }
    const text = body.map((l) => (l.text === '' ? '' : l.raw.slice(minIndent))).join(folded ? ' ' : '\n');
    return text.replace(/\s+$/, '');
  }

  function parseBlock(indent) {
    const line = peek();
    if (!line || line.indent < indent) return null;
    return isDash(line) ? parseSequence(line.indent) : parseMapping(line.indent);
  }

  function parseMapping(indent) {
    const result = {};
    for (;;) {
      const line = peek();
      if (!line || line.indent !== indent || isDash(line)) break;
      const match = /^([A-Za-z0-9_.\-/]+):(?:\s+(.*))?$/.exec(line.text);
      if (!match) throw new Error(`mini-yaml: cannot read line ${pos + 1}: ${line.text}`);
      const [, key, restRaw] = match;
      const rest = (restRaw ?? '').replace(/^#.*$/, '').trim();
      pos += 1;
      if (rest === '') {
        const next = peek();
        if (next && next.indent > indent) result[key] = parseBlock(next.indent);
        else if (next && next.indent === indent && isDash(next)) result[key] = parseSequence(indent);
        else result[key] = null;
      } else if (/^[|>][+-]?\s*(#.*)?$/.test(rest)) {
        result[key] = blockScalar(indent, rest.startsWith('>'));
      } else {
        result[key] = scalar(rest);
      }
    }
    return result;
  }

  function parseSequence(indent) {
    const result = [];
    for (;;) {
      const line = peek();
      if (!line || line.indent !== indent || !isDash(line)) break;
      const content = line.text === '-' ? '' : line.text.slice(2).trim();
      if (content === '') {
        pos += 1;
        const next = peek();
        result.push(next && next.indent > indent ? parseBlock(next.indent) : null);
      } else if (/^[A-Za-z0-9_.\-/]+:(\s|$)/.test(content)) {
        // "- key: value": the item is a mapping whose first line sits two columns right of the dash.
        lines[pos] = lineOf(' '.repeat(indent + 2) + content);
        result.push(parseMapping(indent + 2));
      } else {
        pos += 1;
        result.push(scalar(content));
      }
    }
    return result;
  }

  const root = parseBlock(0);
  if (peek()) throw new Error(`mini-yaml: unread content at line ${pos + 1}: ${lines[pos].text}`);
  return root;
}

// ---------------------------------------------------------------------------------------------------------------------
// helpers

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const load = (rel) => parseYaml(read(rel));

const ci = load('.github/workflows/ci.yml');
const migrate = load('.github/workflows/migrate.yml');

const has = (obj, key) => obj !== null && typeof obj === 'object' && Object.hasOwn(obj, key);
const runOf = (step) => (typeof step.run === 'string' ? step.run : '');
const stepsOf = (job) => (Array.isArray(job.steps) ? job.steps : []);
const needsOf = (job) => (job.needs === undefined || job.needs === null ? [] : [job.needs].flat());
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

test('[F1.1-a c1] the db job cannot be skipped or made non-blocking by a condition', () => {
  for (const key of ['if', 'continue-on-error', 'strategy']) {
    assert.equal(has(db, key), false, `the db job has ${key}`);
  }
  for (const step of dbSteps) {
    assert.equal(has(step, 'continue-on-error'), false, `step "${step.name}" has continue-on-error: its failure would not turn CI red`);
  }
});

test('[F1.1-a c1] any failure turns CI red: no step swallows an error (only the failure-only log step may)', () => {
  for (const step of dbSteps) {
    const failureOnly = typeof step.if === 'string' && /\bfailure\(\)/.test(step.if);
    if (failureOnly) continue;
    assert.doesNotMatch(runOf(step), /\|\|\s*(true|:)\b/, `step "${step.name}" swallows a failure with || true`);
    assert.doesNotMatch(runOf(step), /\bset\s+\+e\b/, `step "${step.name}" turns errexit off`);
  }
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

test('[F1.1-a c5] nothing in migrate prints or exports the URL', () => {
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
        assert.doesNotMatch(line, />\s*[^&\s]/, `${id}: writes the URL to a file: ${line.trim()}`);
      }
      assert.doesNotMatch(run, /\bprintenv\b|(^|\n)\s*env\s*(\n|$)/, `${id}: dumps the environment`);
    }
  }
});

test('[F1.1-a c5] the guard step in each job calls tools/migrate-url-guard.mjs, and that file exists', () => {
  assert.ok(existsSync(join(root, 'tools/migrate-url-guard.mjs')));
  for (const [id, job] of jobs) {
    assert.ok(stepsOf(job).some((s) => /node\s+tools\/migrate-url-guard\.mjs/.test(runOf(s))), `${id}: wrong guard path`);
  }
});
