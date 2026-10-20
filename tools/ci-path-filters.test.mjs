// Repository tests for the CI path filter of .github/workflows/ci.yml (I1 F1.1 spec addendum 3; Afik 14.10.2026, "CI
// once per part"): the db job runs on every pull request that changes supabase/, apps/server/, packages/shared/, the
// lockfile, the Node/TS base config or ci.yml, and on every other event (push to main, schedule, workflow_dispatch). The db
// job may be skipped only by the workflow's own change-detection job `changes`, which fails safe; nothing else may skip
// or soften it. The same job lists a pull request's changed specs (outputs browser and specs; CI contract of 20.10.2026),
// failing safe to the whole Chrome suite. The rest of the db job is in tools/db-workflows.test.mjs.
// They parse the workflow file as data. They never run a workflow. The YAML reader is tools/workflow-yaml.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOf, has, nameOf, needsOf, parseYaml, runOf, stepsOf, swallowProblems } from './workflow-yaml.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ci = parseYaml(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));

const db = ci.jobs?.db;
const dbSteps = db ? stepsOf(db) : [];

// Spec addendum 3: the db job may carry exactly one job-level `if`, and only the one that reads the `changes` job's db
// output. Any other `if`, `continue-on-error` or `strategy` still skips or softens it.
const DB_IF = /^(?:\$\{\{\s*)?needs\.changes\.outputs\.db\s*==\s*'true'(?:\s*\}\})?$/;

function dbConditionProblems(job) {
  const problems = [];
  for (const key of ['continue-on-error', 'strategy']) {
    if (has(job, key)) problems.push(`the db job has ${key}`);
  }
  if (has(job, 'if')) {
    if (typeof job.if !== 'string' || !DB_IF.test(job.if.trim())) {
      problems.push(`the db job has an if that is not "needs.changes.outputs.db == 'true'": ${String(job.if)}`);
    } else if (!needsOf(job).includes('changes')) {
      problems.push('the db job reads the changes output but does not need the changes job');
    }
  }
  return problems;
}

test('[F1.1-a c1 addendum 3] the db job cannot be skipped or made non-blocking by a condition, except the one that reads the changes job db output', () => {
  assert.deepEqual(dbConditionProblems(db), []);
  for (const step of dbSteps) {
    assert.equal(has(step, 'continue-on-error'), false, `step "${step.name}" has continue-on-error: its failure would not turn CI red`);
  }
});

test('[F1.1-a c1 addendum 3] the db-condition check can fail: every other way to skip or soften the db job is caught (guards the test above)', () => {
  const base = { needs: 'changes', if: "needs.changes.outputs.db == 'true'", steps: [] };
  assert.deepEqual(dbConditionProblems(base), [], 'the allowed form is flagged');
  assert.deepEqual(dbConditionProblems({ ...base, if: "${{ needs.changes.outputs.db == 'true' }}" }), [], 'the wrapped form is flagged');
  assert.deepEqual(dbConditionProblems({ steps: [] }), [], 'no if at all is flagged by this check (the next tests require it)');
  const mutants = {
    'always()': { ...base, if: 'always()' },
    'false': { ...base, if: 'false' },
    'an actor condition': { ...base, if: "github.actor != 'dependabot[bot]'" },
    'the web output': { ...base, if: "needs.changes.outputs.web == 'true'" },
    'db output or true': { ...base, if: "needs.changes.outputs.db == 'true' || true" },
    'db output and failure()': { ...base, if: "needs.changes.outputs.db == 'true' && !failure()" },
    'a condition on the event': { ...base, if: "github.event_name == 'pull_request'" },
    'the allowed if without needs changes': { if: "needs.changes.outputs.db == 'true'", steps: [] },
    'the allowed if with other needs only': { needs: 'build', if: "needs.changes.outputs.db == 'true'", steps: [] },
    'continue-on-error': { ...base, 'continue-on-error': 'true' },
    'strategy': { ...base, strategy: { 'fail-fast': 'false' } },
  };
  for (const [label, job] of Object.entries(mutants)) {
    assert.notDeepEqual(dbConditionProblems(job), [], `${label} was not caught`);
  }
});

// ---- the `changes` job ---------------------------------------------------------------------------------------------------
// Failure being guarded: a db filter that skips a push to main, a default of "false", a diff that cannot be read and
// reports "nothing changed", or a `changes` job that is itself skippable -> the database job silently not run.

const changes = ci.jobs?.changes;
const changesSteps = changes ? stepsOf(changes) : [];
const detectionStep = changesSteps.find((s) => /\bdb=/.test(runOf(s)) && /GITHUB_OUTPUT/.test(runOf(s)));

function failSafeProblems(run) {
  const problems = [];
  const code = codeOf(run);
  const dbAssignments = [...code.matchAll(/\bdb=(true|false)\b/g)];
  const initial = dbAssignments[0];
  if (!initial) return ['the detection never assigns db'];
  if (initial[1] !== 'true') problems.push('db does not default to true: a push to main, or an unreadable diff, would skip the db job');
  const falseAssignments = dbAssignments.filter((m) => m[1] === 'false');
  if (falseAssignments.length !== 1) problems.push(`db=false is assigned ${falseAssignments.length} times; exactly one, in the readable pull-request branch, is allowed`);
  if (falseAssignments.length >= 1) {
    const idxFalse = falseAssignments[0].index;
    const before = code.slice(0, idxFalse);
    const pr = before.search(/\[\[?\s*"?\$\{?EVENT_NAME\}?"?\s*(=|==)\s*"?pull_request"?\s*\]\]?/);
    if (pr < 0) {
      problems.push('db=false is not inside a branch gated on the pull_request event: a push to main could skip the db job');
    } else {
      const between = before.slice(pr);
      if (/\bfi\b|\belse\b|\belif\b/.test(between)) problems.push('db=false sits outside the pull_request branch');
      if (!/\bif\b[^\n]*\bgit\s+diff\b/.test(between)) problems.push('db=false is not inside an if whose condition is the git diff: an unreadable diff would still set it');
      if (!/\bgit\s+diff\b/.test(between)) problems.push('db=false is set before the diff is read');
    }
    const after = code.slice(idxFalse);
    if (!/\belse\b/.test(after)) problems.push('no else branch: nothing says what happens when the diff cannot be read');
  }
  if (/\bset\s+\+e\b/.test(code)) problems.push('the detection turns errexit off');
  if (!/echo\s+"?db=\$\{?[A-Za-z_]+\}?"?\s*>>\s*"?\$\{?GITHUB_OUTPUT\}?"?/.test(code)) problems.push('the detection does not write db to GITHUB_OUTPUT');
  problems.push(...swallowProblems('changes', [{ name: 'detection', run }]));
  return problems;
}

test('[F1.1-a c1 addendum 3] the changes job exists, needs nothing, and runs on every event: no if, no continue-on-error, no strategy', () => {
  assert.ok(changes, 'jobs.changes is missing');
  for (const key of ['if', 'continue-on-error', 'strategy']) {
    assert.equal(has(changes, key), false, `the changes job has ${key}: it could be skipped, and the db job with it`);
  }
  assert.deepEqual(needsOf(changes), [], 'the changes job waits for another job, which can fail or be skipped');
  for (const step of changesSteps) {
    assert.equal(has(step, 'continue-on-error'), false, `changes step "${nameOf(step)}" has continue-on-error`);
    assert.equal(has(step, 'if'), false, `changes step "${nameOf(step)}" has an if`);
  }
  assert.ok(detectionStep, 'no step of the changes job writes db= to GITHUB_OUTPUT');
});

test('[F1.1-a c1 addendum 3] the changes job exports a db output from its detection step, next to web', () => {
  assert.ok(changes, 'jobs.changes is missing');
  assert.ok(has(changes.outputs, 'web'), 'the web output was removed');
  assert.ok(has(changes.outputs, 'db'), 'the changes job has no db output');
  const match = /^\$\{\{\s*steps\.([A-Za-z0-9_-]+)\.outputs\.db\s*\}\}$/.exec(String(changes.outputs.db).trim());
  assert.ok(match, `the db output is not read from a step output: ${String(changes.outputs.db)}`);
  assert.equal(detectionStep?.id, match[1], 'the db output reads a step other than the one that writes db=');
});

test('[F1.1-a c1 addendum 3] the db job needs the changes job and is gated by its db output, and only by it', () => {
  assert.ok(db, 'jobs.db is missing');
  assert.ok(needsOf(db).includes('changes'), 'the db job does not need the changes job');
  assert.equal(typeof db.if, 'string', 'the db job has no condition: it would run on pull requests that change nothing it covers');
  assert.match(db.if.trim(), DB_IF);
  assert.deepEqual(dbConditionProblems(db), []);
});

test('[F1.1-a c1 addendum 3] the db detection fails safe: db defaults to true, and only a readable pull-request diff with no matching file sets it false', () => {
  assert.ok(detectionStep, 'no step of the changes job writes db= to GITHUB_OUTPUT');
  assert.deepEqual(failSafeProblems(runOf(detectionStep)), []);
});

test('[F1.1-a c1 addendum 3] the fail-safe check can fail: each way to skip db on a push or an unreadable diff is caught (guards the test above)', () => {
  assert.ok(detectionStep, 'no step of the changes job writes db= to GITHUB_OUTPUT');
  const run = runOf(detectionStep);
  const mutants = {
    'db defaults to false': run.replace(/\bdb=true\b/, 'db=false'),
    'a second db=false (an else branch that skips)': `${run}\ndb=false`,
    'the pull_request gate is gone': run.replace(/pull_request/g, 'push'),
    'errexit turned off': `set +e\n${run}`,
    'a failure swallowed': `${run}\ngit diff --name-only HEAD^1 HEAD || true`,
    'db is never written to the output': run.replace(/GITHUB_OUTPUT/g, 'SOMEWHERE_ELSE'),
  };
  for (const [label, mutant] of Object.entries(mutants)) {
    assert.notEqual(mutant, run, `${label}: the mutation changed nothing, so it proves nothing`);
    assert.notDeepEqual(failSafeProblems(mutant), [], `${label} was not caught`);
  }
});

// The shell glob of a `case` pattern, as a RegExp: `*` matches anything including `/`, as in `case`.
const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+?^${}()[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

function dbPatternsOf(run) {
  const patterns = [];
  for (const line of codeOf(run).split('\n')) {
    const match = /^\s*([^()\s][^()]*)\)\s.*\bdb=true\b/.exec(line);
    if (match) patterns.push(...match[1].split('|').map((p) => p.trim()).filter((p) => p !== ''));
  }
  return patterns;
}

test('[F1.1-a c1 addendum 3] the db filter covers supabase/, apps/server/, packages/shared/, the lockfile, the Node/TS base config and ci.yml', () => {
  assert.ok(detectionStep, 'no step of the changes job writes db= to GITHUB_OUTPUT');
  const patterns = dbPatternsOf(runOf(detectionStep));
  assert.ok(patterns.length > 0, 'no case pattern sets db=true');
  const mustTrigger = [
    'supabase/migrations/20261014000000_x.sql',
    'supabase/bootstrap/01-roles.sql',
    'supabase/tests/identity.sql',
    'supabase/ci/rls-gate.sql',
    'apps/server/src/index.ts',
    'apps/server/package.json',
    'packages/shared/src/index.ts',
    'package-lock.json',
    'tsconfig.base.json',
    '.github/workflows/ci.yml',
  ];
  for (const file of mustTrigger) {
    assert.ok(patterns.some((p) => globToRegExp(p).test(file)), `a change to ${file} does not set db=true (patterns: ${patterns.join(' ')})`);
  }
});

test('[F1.1-a c1 addendum 3] the db filter helper reads case patterns and matches them as the shell does (guards the test above)', () => {
  const run = ['case "${file}" in', '  supabase/*|apps/server/*) web=false; db=true ;;', '  package-lock.json) db=true ;;', '  apps/web/*) web=true ;;', 'esac'].join('\n');
  const patterns = dbPatternsOf(run);
  assert.deepEqual(patterns, ['supabase/*', 'apps/server/*', 'package-lock.json']);
  assert.equal(globToRegExp('supabase/*').test('supabase/migrations/a.sql'), true);
  assert.equal(globToRegExp('supabase/*').test('apps/supabase/a.sql'), false);
  assert.equal(globToRegExp('package-lock.json').test('package-lockXjson'), false);
});

// ---- the browser and specs outputs (CI contract of 20.10.2026) -----------------------------------------------------------------
// Failure being guarded: a default other than "full", or a "none"/"changed" that can be reached on a push or an unreadable
// diff -> the Chrome suite silently not run. The behaviour itself is run in tools/ci-path-filters.run.test.mjs.

function browserFailSafeProblems(run) {
  const code = codeOf(run);
  const problems = [];
  const assignments = [...code.matchAll(/\bbrowser=([a-z]+)\b/g)];
  if (assignments[0]?.[1] !== 'full') problems.push(`browser does not default to full: ${assignments[0]?.[0]}`);
  const dbFalse = code.search(/\bdb=false\b/);
  const unreadable = code.search(/could not read the changed files/);
  if (dbFalse < 0 || unreadable < 0) return [...problems, 'the readable pull-request branch or its else could not be found'];
  for (const m of assignments.filter((a) => a[1] !== 'full')) {
    if (!(m.index > dbFalse && m.index < unreadable)) problems.push(`${m[0]} is set outside the readable pull-request branch`);
  }
  if (!assignments.some((a) => a[1] === 'none')) problems.push('browser is never none: a pull request without a changed spec would run the suite');
  if (!/echo\s+"?browser=\$\{?browser\}?"?\s*>>\s*"?\$\{?GITHUB_OUTPUT\}?"?/.test(code)) problems.push('browser is not written to GITHUB_OUTPUT');
  if (!/echo\s+"?specs=\$\{?specs\}?"?\s*>>\s*"?\$\{?GITHUB_OUTPUT\}?"?/.test(code)) problems.push('specs is not written to GITHUB_OUTPUT');
  // A changed spec with any other character falls back to the whole suite rather than reaching a command line.
  if (!/\*\[!A-Za-z0-9\._\/-\]\*\)\s*unsafe=true/.test(code)) problems.push('a spec path with unusual characters is not caught');
  if (!/if \[ "\$\{unsafe\}" = true \]; then[^]*?browser=full/.test(code)) problems.push('an unusual spec path does not fall back to browser=full');
  return problems;
}

test('[CI contract] the changes job exports browser and specs from its detection step', () => {
  for (const name of ['browser', 'specs']) {
    const match = new RegExp(`^\\$\\{\\{\\s*steps\\.([A-Za-z0-9_-]+)\\.outputs\\.${name}\\s*\\}\\}$`).exec(String(changes?.outputs?.[name] ?? '').trim());
    assert.ok(match, `the ${name} output is not read from a step output: ${String(changes?.outputs?.[name])}`);
    assert.equal(detectionStep?.id, match[1], `the ${name} output reads a step other than the detection step`);
  }
});

test('[CI contract] browser fails safe: it defaults to full, and only a readable pull-request diff sets none or changed', () => {
  assert.deepEqual(browserFailSafeProblems(runOf(detectionStep)), []);
});

test('[CI contract] the browser fail-safe check can fail (guards the test above)', () => {
  const run = runOf(detectionStep);
  const mutants = {
    'browser defaults to none': run.replace(/\bbrowser=full\b/, 'browser=none'),
    'none set after the unreadable branch too': run.replace('running everything"', 'running everything"\n              browser=none'),
    'none set before the event check': run.replace('specs=""\n', 'specs=""\nbrowser=none\n'),
    'browser never written': run.replace(/echo "browser=\$\{browser\}" >> "\$\{GITHUB_OUTPUT\}"/, ''),
    'specs never written': run.replace(/echo "specs=\$\{specs\}" >> "\$\{GITHUB_OUTPUT\}"/, ''),
    'odd paths accepted': run.replace('*[!A-Za-z0-9._/-]*) unsafe=true ;;', ''),
    'odd paths skip the suite': run.replace(/(if \[ "\$\{unsafe\}" = true \]; then[^]*?)browser=full/, '$1browser=none'),
  };
  for (const [label, mutant] of Object.entries(mutants)) {
    assert.notEqual(mutant, run, `${label}: the mutation changed nothing, so it proves nothing`);
    assert.notDeepEqual(browserFailSafeProblems(mutant), [], `${label} was not caught`);
  }
});
