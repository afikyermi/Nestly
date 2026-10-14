// Behavioural tests for the `changes` job of .github/workflows/ci.yml (Spec addendum 3, .work/identity-platform/spec.md;
// CRITIC findings 1-3 of PR 18, .work/ci-path-filters/findings.md). tools/ci-path-filters.test.mjs checks the script's
// wording; this file RUNS it. The step's `run` block is taken from the workflow (tools/workflow-yaml.mjs), written to a
// file and executed with bash inside a throw-away git repository whose HEAD is a merge commit (HEAD^1 = base, HEAD^2 =
// the pull request), exactly as actions/checkout leaves a pull request. GITHUB_OUTPUT points at a temp file, EVENT_NAME
// is set as the step expects and RUNNER_TEMP is a temp directory, as on the runner. The outputs web= and db= are what the
// other jobs read, and they are asserted.
//
// Expected behaviour (Spec addendum 3 plus CRITIC 1-2):
//   db  = true when a changed path is under supabase/ or apps/server/, or is packages/shared/*, package-lock.json,
//         tsconfig.base.json, .nvmrc or .github/workflows/ci.yml
//   web = true for the web list (apps/web, e2e, the Playwright config, the root package.json, .nvmrc, the three tools the
//         browser/storybook jobs run, and the shared files above)
//   both true on a push, and both true whenever the diff of a pull request cannot be read
//   a path with non-ASCII characters (git quotes them by default) must match like any other
//
// Skipped only when bash or git is absent from the machine (GitHub's runner has both).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ci = parseYaml(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
const detectionStep = ci.jobs?.changes ? stepsOf(ci.jobs.changes).find((s) => /\bdb=/.test(runOf(s)) && /GITHUB_OUTPUT/.test(runOf(s))) : undefined;

const fwd = (p) => p.replace(/\\/g, '/');
const works = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return !r.error && r.status === 0 && r.stdout.trim() !== '';
};
const canRun = works('bash', ['-c', 'echo ok']) && works('git', ['--version']);
const skip = canRun ? false : 'bash or git is not available';

// ---- the sandbox -----------------------------------------------------------------------------------------------------

const sandbox = mkdtempSync(join(tmpdir(), 'ci-path-filters-'));
process.on('exit', () => rmSync(sandbox, { recursive: true, force: true }));
const emptyConfig = join(sandbox, 'empty-gitconfig');
writeFileSync(emptyConfig, '');
const runnerTemp = join(sandbox, 'runner-temp');
mkdirSync(runnerTemp);
let counter = 0;

// A clean git environment: no user or system config, so git's own defaults (core.quotePath = true) apply, as on a runner.
// RUNNER_TEMP is the runner's temp directory, which the step may use.
const gitEnv = (extra = {}) => ({
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: fwd(emptyConfig),
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  RUNNER_TEMP: fwd(runnerTemp),
  ...extra,
});

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, env: gitEnv(), encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.error ?? ''}${r.stderr}`);
  return r.stdout.trim();
}

function put(repo, path, content) {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function newRepo() {
  counter += 1;
  const repo = join(sandbox, `repo-${counter}`);
  mkdirSync(repo);
  git(repo, 'init', '-q');
  return repo;
}

// Builds a repository: `base` files committed on main, `change` applied on a branch `pr`, an optional `advance` commit
// on main after the branch point (the base moved on), then `pr` merged with --no-ff so HEAD is a merge commit.
// change = { write: {path: content}, remove: [path], move: [[from, to]] }
function makeMergeRepo({ base = {}, change = {}, advance = {} }) {
  const repo = newRepo();
  put(repo, 'README.md', '# base\n');
  for (const [path, content] of Object.entries(base)) put(repo, path, content);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'branch', '-M', 'main');
  git(repo, 'checkout', '-q', '-b', 'pr');
  for (const [path, content] of Object.entries(change.write ?? {})) put(repo, path, content);
  for (const path of change.remove ?? []) rmSync(join(repo, path));
  for (const [from, to] of change.move ?? []) {
    mkdirSync(dirname(join(repo, to)), { recursive: true });
    renameSync(join(repo, from), join(repo, to));
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'pull request');
  git(repo, 'checkout', '-q', 'main');
  if (Object.keys(advance).length > 0) {
    for (const [path, content] of Object.entries(advance)) put(repo, path, content);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'main moved on');
  }
  git(repo, 'merge', '-q', '--no-ff', 'pr', '-m', 'merge pull request');
  return repo;
}

// Executes `scriptText` with bash -e (GitHub's default shell for `run`) in `repo`; returns the parsed GITHUB_OUTPUT lines
// (the last write of a key wins, as on GitHub) plus the exit status and the streams.
function execScript(repo, scriptText, eventName) {
  const tag = `${counter}-${Math.random().toString(36).slice(2)}`;
  const script = join(sandbox, `step-${tag}.sh`);
  const out = join(sandbox, `out-${tag}.txt`);
  writeFileSync(script, `${scriptText}\n`);
  writeFileSync(out, '');
  const r = spawnSync('bash', ['-e', fwd(script)], {
    cwd: repo,
    env: gitEnv({ EVENT_NAME: eventName, GITHUB_OUTPUT: fwd(out) }),
    encoding: 'utf8',
  });
  const lines = readFileSync(out, 'utf8').split(/\r?\n/).filter((l) => l !== '');
  const outputs = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) outputs[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { ...outputs, lines, status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Runs the workflow's own `changes` step.
function runStep(repo, eventName = 'pull_request') {
  assert.ok(detectionStep, 'no step of the changes job writes db= to GITHUB_OUTPUT');
  return execScript(repo, runOf(detectionStep), eventName);
}

function expectOutputs(result, web, db, label) {
  const log = `\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
  assert.equal(result.status, 0, `${label}: the step failed (exit ${result.status})${log}`);
  assert.equal(result.web, String(web), `${label}: web=${result.web}, expected ${web}${log}`);
  assert.equal(result.db, String(db), `${label}: db=${result.db}, expected ${db}${log}`);
}

const BASE = {
  'supabase/migrations/20261001000000_old.sql': 'create table old_one (id int);\n-- a body long enough for rename detection to pair it\n',
  'apps/web/src/old.ts': 'export const old = 1;\n// a body long enough for rename detection to pair it\n',
  'apps/server/src/old.ts': 'export const old = 1;\n',
  'docs/guide.md': '# guide\n',
};

// ---- the promise: the pull request cases ------------------------------------------------------------------------------

test('[F1.1-a c1 addendum 3] a migration added: db=true, web=false', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { write: { 'supabase/migrations/20261014000000_new.sql': 'create table t (id int);\n' } } });
  expectOutputs(runStep(repo), false, true, 'migration added');
});

test('[F1.1-a c1 addendum 3] a file deleted: a deleted migration sets db, a deleted web file sets web', { skip }, () => {
  expectOutputs(runStep(makeMergeRepo({ base: BASE, change: { remove: ['supabase/migrations/20261001000000_old.sql'] } })), false, true, 'migration deleted');
  expectOutputs(runStep(makeMergeRepo({ base: BASE, change: { remove: ['apps/web/src/old.ts'] } })), true, false, 'web file deleted');
  expectOutputs(runStep(makeMergeRepo({ base: BASE, change: { remove: ['apps/server/src/old.ts'] } })), false, true, 'server file deleted');
});

test('[F1.1-a c1 addendum 3] a rename out of supabase/ or apps/web/ still counts: the old path is part of the change', { skip }, () => {
  const fromSupabase = makeMergeRepo({ base: BASE, change: { move: [['supabase/migrations/20261001000000_old.sql', 'docs/old-migration.md']] } });
  expectOutputs(runStep(fromSupabase), false, true, 'moved out of supabase/');
  const fromWeb = makeMergeRepo({ base: BASE, change: { move: [['apps/web/src/old.ts', 'docs/old-web.md']] } });
  expectOutputs(runStep(fromWeb), true, false, 'moved out of apps/web/');
});

test('[F1.1-a c1 addendum 3] a rename into supabase/ counts', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { move: [['docs/guide.md', 'supabase/migrations/guide.sql']] } });
  expectOutputs(runStep(repo), false, true, 'moved into supabase/');
});

test('[F1.1-a c1 addendum 3] CRITIC 1: Hebrew file names (git quotes them) still match under supabase/ and apps/web/', { skip }, () => {
  const migration = makeMergeRepo({ base: BASE, change: { write: { 'supabase/migrations/20261014000000_הגירה_חדשה.sql': 'select 1;\n' } } });
  expectOutputs(runStep(migration), false, true, 'Hebrew migration');
  const tests = makeMergeRepo({ base: BASE, change: { write: { 'supabase/tests/בדיקת_זהות.sql': 'select 1;\n' } } });
  expectOutputs(runStep(tests), false, true, 'Hebrew pgTAP file');
  const web = makeMergeRepo({ base: BASE, change: { write: { 'apps/web/src/דף_הבית.tsx': 'export {};\n' } } });
  expectOutputs(runStep(web), true, false, 'Hebrew web file');
  const server = makeMergeRepo({ base: BASE, change: { write: { 'apps/server/src/שירות.ts': 'export {};\n' } } });
  expectOutputs(runStep(server), false, true, 'Hebrew server file');
});

test('[F1.1-a c1 addendum 3] CRITIC 1: a file name with a space under supabase/ matches', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { write: { 'supabase/migrations/a b.sql': 'select 1;\n' } } });
  expectOutputs(runStep(repo), false, true, 'space in the name');
});

test('[F1.1-a c1 addendum 3] CRITIC 1: a file name with a newline cannot smuggle a second path (NUL-separated read)', { skip: skip || (process.platform === 'win32' ? 'file names cannot hold a newline on Windows' : false) }, () => {
  // One file under docs/ whose name continues "on a second line" as apps/server/x.ts. A newline-split read sees a path
  // under apps/server/ that is not in the diff; the NUL-separated read sees one docs/ path, so both stay false.
  const sneaky = makeMergeRepo({ base: BASE, change: { write: { 'docs/note\napps/server/x.ts': 'x\n' } } });
  expectOutputs(runStep(sneaky), false, false, 'newline in a docs/ name');
  // And the real thing under supabase/ with a newline in its name still counts.
  const real = makeMergeRepo({ base: BASE, change: { write: { 'supabase/migrations/a\nb.sql': 'x\n' } } });
  expectOutputs(runStep(real), false, true, 'newline in a supabase/ name');
});

test('[F1.1-a c1 addendum 3] CRITIC 2: only .nvmrc changed: db=true and web=true (the db job runs under that Node version)', { skip }, () => {
  const repo = makeMergeRepo({ base: { ...BASE, '.nvmrc': '22\n' }, change: { write: { '.nvmrc': '24\n' } } });
  expectOutputs(runStep(repo), true, true, '.nvmrc');
});

test('[F1.1-a c1 addendum 3] only apps/web changed: web=true, db=false', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { write: { 'apps/web/src/new.tsx': 'export {};\n' } } });
  expectOutputs(runStep(repo), true, false, 'apps/web only');
});

test('[F1.1-a c1 addendum 3] only docs changed: web=false and db=false', { skip }, () => {
  const repo = makeMergeRepo({
    base: BASE,
    change: { write: { 'docs/srs/INDEX.md': 'x\n', 'README.md': '# changed\n', '.work/x/spec.md': 'x\n', 'decisions.md': 'x\n', '.claude/knowledge/x.md': 'x\n' } },
  });
  expectOutputs(runStep(repo), false, false, 'docs only');
});

// ---- the fail-safe: push and unreadable diff -------------------------------------------------------------------------

test('[F1.1-a c1 addendum 3] a push to main runs everything: web=true and db=true even when the commit only touches docs', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { write: { 'docs/guide.md': '# changed\n' } } });
  expectOutputs(runStep(repo, 'push'), true, true, 'push, docs-only merge commit');
});

test('[F1.1-a c1 addendum 3] a push whose HEAD is an ordinary commit runs everything', { skip }, () => {
  const repo = newRepo();
  put(repo, 'docs/a.md', 'a\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'one');
  put(repo, 'docs/a.md', 'b\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'two');
  expectOutputs(runStep(repo, 'push'), true, true, 'push, ordinary commit');
});

test('[F1.1-a c1 addendum 3] a pull request without HEAD^2 (no merge commit) cannot be diffed: both true, not a skip', { skip }, () => {
  const repo = newRepo();
  put(repo, 'docs/a.md', 'a\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'one');
  put(repo, 'supabase/migrations/n.sql', 'select 1;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'two');
  expectOutputs(runStep(repo), true, true, 'no HEAD^2');
  // A docs-only ordinary commit must not be read as "nothing changed" either.
  put(repo, 'docs/a.md', 'c\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'three');
  expectOutputs(runStep(repo), true, true, 'no HEAD^2, docs only');
});

test('[F1.1-a c1 addendum 3] a pull request whose diff cannot be read (HEAD^1 object missing) runs everything', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { write: { 'docs/guide.md': '# changed\n' } } });
  // Without this, the test would pass on a docs-only diff for the wrong reason.
  expectOutputs(runStep(repo), false, false, 'precondition: the readable docs-only diff is both false');
  const baseSha = git(repo, 'rev-parse', 'HEAD^1');
  const object = join(repo, '.git', 'objects', baseSha.slice(0, 2), baseSha.slice(2));
  assert.ok(existsSync(object), 'precondition: the base commit is a loose object that can be removed');
  chmodSync(object, 0o666);
  rmSync(object);
  const diff = spawnSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], { cwd: repo, env: gitEnv(), encoding: 'utf8' });
  assert.notEqual(diff.status, 0, 'precondition: git can no longer diff against HEAD^1');
  expectOutputs(runStep(repo), true, true, 'unreadable diff');
});

// ---- the patterns, one path at a time --------------------------------------------------------------------------------

// [path, web, db]. Each is a one-file pull request.
const PATHS = [
  ['supabase/migrations/20261014000000_x.sql', false, true],
  ['supabase/bootstrap/01-roles.sql', false, true],
  ['supabase/tests/identity.sql', false, true],
  ['supabase/ci/rls-gate.sql', false, true],
  ['apps/server/src/index.ts', false, true],
  ['apps/server/package.json', false, true],
  ['packages/shared/src/index.ts', true, true],
  ['package-lock.json', true, true],
  ['tsconfig.base.json', true, true],
  ['.github/workflows/ci.yml', true, true],
  ['.nvmrc', true, true],
  ['apps/web/src/main.tsx', true, false],
  ['e2e/home.spec.ts', true, false],
  ['playwright.config.ts', true, false],
  ['tsconfig.playwright.json', true, false],
  ['package.json', true, false],
  ['tools/serve-static.mjs', true, false],
  ['tools/build-design-tokens.js', true, false],
  ['tools/check-stories.mjs', true, false],
  // near misses: a prefix that is not the directory, a similar name elsewhere, a workflow that is not ci.yml
  ['apps/webhooks/x.ts', false, false],
  ['apps/serverless/x.ts', false, false],
  ['docs/supabase/x.md', false, false],
  ['supabase-notes.md', false, false],
  ['packages/shared-extra/x.ts', false, false],
  ['tools/other.mjs', false, false],
  ['.github/workflows/other.yml', false, false],
  ['.github/dependabot.yml', false, false],
  ['docs/package-lock.json', false, false],
];

for (const [path, web, db] of PATHS) {
  test(`[F1.1-a c1 addendum 3] one changed file ${path}: web=${web} db=${db}`, { skip }, () => {
    const repo = makeMergeRepo({ base: BASE, change: { write: { [path]: `changed ${Math.random()}\n` } } });
    expectOutputs(runStep(repo), web, db, path);
  });
}

// ---- order and the shape of the diff ----------------------------------------------------------------------------------

test('[F1.1-a c1 addendum 3] a matching file is not undone by a non-matching one after it, nor before it', { skip }, () => {
  // git lists paths in byte order: docs/ < supabase/ < tools/
  const before = makeMergeRepo({ base: BASE, change: { write: { 'docs/a.md': 'x\n', 'supabase/migrations/n.sql': 'x\n' } } });
  expectOutputs(runStep(before), false, true, 'docs before supabase');
  const after = makeMergeRepo({ base: BASE, change: { write: { 'supabase/migrations/n.sql': 'x\n', 'tools/other.mjs': 'x\n' } } });
  expectOutputs(runStep(after), false, true, 'supabase before tools');
  const both = makeMergeRepo({ base: BASE, change: { write: { 'apps/web/src/n.tsx': 'x\n', 'docs/a.md': 'x\n', 'supabase/migrations/n.sql': 'x\n', 'tools/other.mjs': 'x\n' } } });
  expectOutputs(runStep(both), true, true, 'web and db apart, docs between');
  const last = makeMergeRepo({ base: BASE, change: { write: { 'apps/web/src/n.tsx': 'x\n', 'zzz/last.md': 'x\n' } } });
  expectOutputs(runStep(last), true, false, 'web first, a non-matching file last');
});

test('[F1.1-a c1 addendum 3] the diff is what the merge changes, not what the base gained after the branch point', { skip }, () => {
  // main moved on with a migration and a web file after the pull request branched; the pull request itself is docs only.
  const repo = makeMergeRepo({
    base: BASE,
    change: { write: { 'docs/guide.md': '# changed\n' } },
    advance: { 'supabase/migrations/20261015000000_other.sql': 'select 1;\n', 'apps/web/src/other.ts': 'export {};\n' },
  });
  expectOutputs(runStep(repo), false, false, 'base moved on, docs-only pull request');
  // and the other way round: a real change in the pull request is still seen when the base also moved
  const real = makeMergeRepo({
    base: BASE,
    change: { write: { 'supabase/migrations/20261014000000_mine.sql': 'select 1;\n' } },
    advance: { 'docs/other.md': 'x\n' },
  });
  expectOutputs(runStep(real), false, true, 'base moved on, migration in the pull request');
});

test('[F1.1-a c1 addendum 3] the step writes exactly one web= and one db= line to the output file, each "true" or "false"', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { write: { 'apps/web/src/n.tsx': 'x\n' } } });
  const result = runStep(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines.map((l) => l.split('=')[0]).sort(), ['db', 'web']);
  for (const line of result.lines) assert.match(line, /^(web|db)=(true|false)$/);
});

// ---- guard: the harness itself can fail -------------------------------------------------------------------------------

test('[F1.1-a c1 addendum 3] the harness can fail: a script that always says false is seen as wrong (guards the tests above)', { skip }, () => {
  const repo = makeMergeRepo({ base: BASE, change: { write: { 'supabase/migrations/n.sql': 'x\n' } } });
  const wrong = execScript(repo, 'echo "web=false" >> "${GITHUB_OUTPUT}"\necho "db=false" >> "${GITHUB_OUTPUT}"', 'pull_request');
  assert.throws(() => expectOutputs(wrong, false, true, 'guard'), /db=false, expected true/);
  const failing = execScript(repo, 'echo "web=true" >> "${GITHUB_OUTPUT}"\necho "db=true" >> "${GITHUB_OUTPUT}"\nexit 3', 'pull_request');
  assert.throws(() => expectOutputs(failing, true, true, 'guard'), /the step failed/);
  const right = execScript(repo, 'echo "web=false" >> "${GITHUB_OUTPUT}"\necho "db=true" >> "${GITHUB_OUTPUT}"', 'pull_request');
  expectOutputs(right, false, true, 'guard');
});
