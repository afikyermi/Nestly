// Tests for the agent-slim stage 1 guard (spec: .work/agent-slim/stage1-guard.md, "Round 4" and the rounds it
// builds on). Written from the spec only. Each case pipes a hook payload into the script, as Claude Code does.
// Run: node --test .claude/hooks/guard-readers.test.js
// GUARD points at the live guard.js (swapped in from guard.next.js, stage 1).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');

let canLink = true;

function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-next-'));
  const w = (rel, body = '') => {
    const f = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  };
  w('incidents.md', '# Incidents\n');
  w('package.json', '{}\n');
  w('.work/x/notes.md', 'SECRET NOTES\n');
  w('.work/x/notes.md.orig', 'SECRET NOTES\n');
  w('.work/x/notes~1.md', 'SECRET NOTES\n');
  w('.work/x/review.diff', 'diff\n');
  w('.work/x/spec.md', 'spec\n');
  w('.work/s/spec.md', 'spec\n');
  w('docs/release-notes.md', 'rel\n');
  w('apps/web/src/main.tsx', 'export const m = 1;\n');
  w('apps/web/src/in.test.ts', 'x\n');
  w('apps/server/api/h.ts', 'export const h = 1;\n');
  w('apps/web/tests/a.test.ts', 'x\n');
  w('apps/web/tests/helper.ts', 'x\n');
  w('packages/shared/tests/b.test.ts', 'x\n');
  w('apps/server/tests/b.test.ts', 'x\n');
  w('apps/web/tsconfig.json', '{}\n');
  w('node_modules/x/tsconfig.json', '{}\n');
  w('.claude/worktrees/w/tsconfig.json', '{}\n');
  w('e2e/c.spec.ts', 'x\n');
  w('supabase/tests/d.test.js', 'x\n');
  w('tools/t.test.mjs', 'x\n');
  try {
    fs.symlinkSync(path.join('..', '.work', 'x', 'notes.md'), path.join(root, 'docs', 'link-notes.md'), 'file');
    fs.symlinkSync(path.join('..', 'apps', 'web', 'src', 'main.tsx'), path.join(root, 'docs', 'link-src.ts'), 'file');
    fs.symlinkSync(path.join('..', 'src', 'main.tsx'), path.join(root, 'apps', 'web', 'tests', 'evil.test.ts'), 'file');
  } catch {
    canLink = false;
  }
  return root;
}

const ROOT = mkRoot();
const P = (...s) => path.join(ROOT, ...s);

let last = '';
function run(role, tool, input, opts = {}) {
  const root = opts.root || ROOT;
  const payload =
    typeof input === 'string'
      ? input
      : JSON.stringify({ tool_name: tool, tool_input: input, cwd: root, ...(opts.session !== undefined ? { session_id: opts.session } : {}) });
  const r = spawnSync(process.execPath, [GUARD, role], {
    input: payload,
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  last = r.stderr;
  return r.status;
}
// A block must come from a rule, not from the guard failing closed on its own error.
const blocks = (role, tool, input, opts) => {
  assert.strictEqual(run(role, tool, input, opts), 2, JSON.stringify(input));
  assert.doesNotMatch(last, /guard error/, last);
};
const allows = (role, tool, input, opts) => assert.strictEqual(run(role, tool, input, opts), 0, JSON.stringify(input) + ' :: ' + last);
const needLinks = (t) => {
  if (!canLink) {
    t.skip('platform refuses symlinks');
    return false;
  }
  return true;
};

// ---------------------------------------------------------------- CRITIC

test('[R1,F6] critic: every Bash call is blocked', () => {
  for (const c of ['ls', 'git diff main...HEAD', 'cat .work/x/review.diff', 'echo hi', 'npm test', 'node -v', 'git status']) {
    blocks('critic', 'Bash', { command: c });
  }
});

test('[R1] critic: Read of a notes.md is blocked in any case and for lookalike names', () => {
  for (const f of ['notes.md', 'NOTES.md', 'Notes.MD', 'nOtEs.md', 'notes.md.orig', 'notes~1.md']) {
    blocks('critic', 'Read', { file_path: P('.work', 'x', f) });
  }
  // a notes.md that does not exist is still a notes.md
  blocks('critic', 'Read', { file_path: P('.work', 'other', 'notes.md') });
  // reached through ..
  blocks('critic', 'Read', { file_path: P('.work', 'x', '..', 'x', 'notes.md') });
  blocks('critic', 'Read', { file_path: P('apps', '..', '.work', 'x', 'NOTES.md') });
});

test('[R1] critic: Read through a symlink to notes.md is blocked', (t) => {
  if (!needLinks(t)) return;
  blocks('critic', 'Read', { file_path: P('docs', 'link-notes.md') });
});

test('[R1] critic: Read of the prepared diff, spec and source is allowed', () => {
  allows('critic', 'Read', { file_path: P('.work', 'x', 'review.diff') });
  allows('critic', 'Read', { file_path: P('.work', 'x', 'spec.md') });
  allows('critic', 'Read', { file_path: P('apps', 'web', 'src', 'main.tsx') });
  allows('critic', 'Read', { file_path: P('apps', 'server', 'api', 'h.ts') });
  allows('critic', 'Read', { file_path: P('docs', 'release-notes.md') });
});

test('[R1] critic: Grep reaching .work without a notes-excluding glob or type is blocked', () => {
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work') });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'x') });
  blocks('critic', 'Grep', { pattern: 'x', path: ROOT });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'x'), glob: '*.md' });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'x'), glob: '*' });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'x'), type: 'md' });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'x', 'notes.md') });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'x', 'NOTES.md') });
});

test('[R1] critic: Grep through a symlink to notes.md is blocked', (t) => {
  if (!needLinks(t)) return;
  blocks('critic', 'Grep', { pattern: 'x', path: P('docs', 'link-notes.md') });
});

test('[R1] critic: Grep with a notes-excluding glob or type is allowed', () => {
  allows('critic', 'Grep', { pattern: 'x', path: P('.work'), glob: '*.ts' });
  allows('critic', 'Grep', { pattern: 'x', path: ROOT, glob: '*.ts' });
  allows('critic', 'Grep', { pattern: 'x', path: P('.work'), type: 'ts' });
  allows('critic', 'Grep', { pattern: 'x', path: P('apps', 'web', 'src') });
});

test('[R2-3] critic: Grep on one existing non-notes file, in .work too, is allowed', () => {
  allows('critic', 'Grep', { pattern: 'x', path: P('.work', 'x', 'spec.md') });
  allows('critic', 'Grep', { pattern: 'x', path: P('.work', 'x', 'review.diff') });
});

test('[R1] critic: Glob is allowed', () => {
  allows('critic', 'Glob', { pattern: '**/*' });
  allows('critic', 'Glob', { pattern: '**/*.md', path: P('.work') });
  allows('critic', 'Glob', { pattern: 'notes.md', path: P('.work', 'x') });
});

test('[F3,round4] critic: Write only to .work/<slug>/findings.md and .work/<slug>/*-findings.md', () => {
  allows('critic', 'Write', { file_path: P('.work', 's', 'findings.md'), content: 'f' });
  allows('critic', 'Write', { file_path: P('.work', 'brand-new', 'findings.md'), content: 'f' });
  allows('critic', 'Write', { file_path: P('.work', 'agent-slim', 'stage1-findings.md'), content: 'f' });
  for (const rel of [
    ['.work', 's', 'notes.md'],
    ['.work', 's', 'NOTES.md'],
    ['.work', 's', 'spec.md'],
    ['.work', 's', 'findings.md.bak'],
    ['.work', 's', 'findings.txt'],
    ['.work', 's', 'review.diff'],
    ['.work', 'findings.md'],
    ['findings.md'],
    ['apps', 'web', 'src', 'findings.md'],
    ['apps', 'web', 'src', 'main.tsx'],
    ['.work', 's', '..', '..', 'apps', 'web', 'src', 'findings.md'],
  ]) {
    blocks('critic', 'Write', { file_path: P(...rel), content: 'x' });
  }
});

// ---------------------------------------------------------------- TEST ENGINEER, readers

test('[R2] test-engineer: Read of app implementation is allowed, Read of notes is blocked', () => {
  allows('test-engineer', 'Read', { file_path: P('apps', 'web', 'src', 'main.tsx') });
  allows('test-engineer', 'Read', { file_path: P('apps', 'server', 'api', 'h.ts') });
  allows('test-engineer', 'Read', { file_path: P('apps', 'web', 'src', '..', 'src', 'main.tsx') });
  blocks('test-engineer', 'Read', { file_path: P('.work', 'x', 'notes.md') });
  blocks('test-engineer', 'Read', { file_path: P('.work', 'x', 'NOTES.md') });
});

test('[R2] test-engineer: Read through a symlink to notes is blocked, to app source is allowed', (t) => {
  if (!needLinks(t)) return;
  allows('test-engineer', 'Read', { file_path: P('docs', 'link-src.ts') });
  blocks('test-engineer', 'Read', { file_path: P('docs', 'link-notes.md') });
  allows('test-engineer', 'Read', { file_path: P('apps', 'web', 'tests', 'evil.test.ts') });
});

test('[R2] test-engineer: Read of specs and tests is allowed', () => {
  allows('test-engineer', 'Read', { file_path: P('.work', 'x', 'spec.md') });
  allows('test-engineer', 'Read', { file_path: P('apps', 'web', 'tests', 'a.test.ts') });
  allows('test-engineer', 'Read', { file_path: P('packages', 'shared', 'tests', 'b.test.ts') });
});

test('[R2] test-engineer: Grep and Glob reaching app implementation are allowed, Grep on notes is blocked', () => {
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('apps', 'web', 'src') });
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('apps', 'server', 'api') });
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('apps') });
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('apps'), glob: 'apps/**/src/**' });
  allows('test-engineer', 'Grep', { pattern: 'x', path: ROOT, glob: 'apps/**/src/**/*.ts' });
  blocks('test-engineer', 'Grep', { pattern: 'x', path: ROOT, glob: 'apps/**/src/**' });
  blocks('test-engineer', 'Grep', { pattern: 'x', path: P('.work', 'x', 'notes.md') });
  blocks('test-engineer', 'Grep', { pattern: 'x', path: P('.work') });
  allows('test-engineer', 'Glob', { pattern: 'apps/web/src/**' });
  allows('test-engineer', 'Glob', { pattern: '**/*.tsx', path: P('apps') });
  allows('test-engineer', 'Glob', { pattern: '*', path: P('apps', 'web', 'src') });
});

test('[R2] test-engineer: Grep through a symlink into app source is allowed', (t) => {
  if (!needLinks(t)) return;
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('docs', 'link-src.ts') });
});

test('[R2,R2-3] test-engineer: Grep and Glob in test areas, and Grep on one non-notes file in .work, are allowed', () => {
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('apps', 'web', 'tests') });
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('e2e') });
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('.work', 'x', 'spec.md') });
  allows('test-engineer', 'Glob', { pattern: '**/*.test.ts', path: P('apps', 'web', 'tests') });
  allows('test-engineer', 'Glob', { pattern: '*', path: P('packages', 'shared', 'tests') });
});

// ---------------------------------------------------------------- TEST ENGINEER, Bash

test('[round4] test-engineer: Bash, a single test run with explicit existing test files, is allowed', () => {
  for (const c of [
    'npx vitest run apps/web/tests/a.test.ts',
    'npx vitest run apps/web/tests/a.test.ts packages/shared/tests/b.test.ts',
    'npx vitest run apps/web/tests/a.test.ts --reporter=verbose --bail=1 --no-color --testNamePattern=foo',
    'npx vitest run apps/web/tests/a.test.ts --reporter=default',
    'npx vitest run apps/web/tests/a.test.ts --reporter=dot',
    'npx playwright test e2e/c.spec.ts',
    'npx playwright test e2e/c.spec.ts --project=chromium --grep=login --reporter=list --workers=2',
    'npx playwright test e2e/c.spec.ts --reporter=line',
    'node --test supabase/tests/d.test.js',
    'node --test supabase/tests/d.test.js --test-name-pattern=foo --test-reporter=spec',
    'node --test supabase/tests/d.test.js --test-reporter=tap',
    'node --test tools/t.test.mjs',
  ]) {
    allows('test-engineer', 'Bash', { command: c });
  }
});

test('[dev-speed,C3] test-engineer: Bash typecheck on a tsconfig and lint on explicit test files are allowed', () => {
  for (const c of [
    'npx tsc -p apps/web/tsconfig.json --noEmit',
    'npx eslint apps/web/tests/a.test.ts',
    'npx eslint apps/web/tests/a.test.ts --max-warnings=0',
    'npx eslint apps/web/tests/a.test.ts apps/server/tests/b.test.ts --no-color',
  ]) {
    allows('test-engineer', 'Bash', { command: c });
  }
});

// ---------------------------------------------------------------- TEST ENGINEER, Write / Edit

test('[F3] test-engineer: Write and Edit of test files in test areas and .work md files are allowed', () => {
  for (const f of [
    P('apps', 'web', 'tests', 'new.test.ts'),
    P('apps', 'web', 'tests', 'sub', 'new.test.tsx'),
    P('packages', 'shared', 'tests', 'new.test.ts'),
    P('e2e', 'new.spec.ts'),
    P('supabase', 'tests', 'new.test.js'),
    P('.claude', 'hooks', 'new.test.js'),
    P('.work', 's', 'x.md'),
    P('.work', 'brand-new', 'test-report.md'),
  ]) {
    allows('test-engineer', 'Write', { file_path: f, content: 'x' });
    allows('test-engineer', 'Edit', { file_path: f, old_string: 'a', new_string: 'b' });
  }
});

test('[F3] test-engineer: package.json, npm and tool configs are blocked, even inside a test area', () => {
  for (const rel of [
    ['package.json'],
    ['apps', 'web', 'package.json'],
    ['apps', 'web', 'tests', 'package.json'],
    ['e2e', 'package.json'],
    ['.npmrc'],
    ['apps', 'web', 'tests', '.npmrc'],
    ['vitest.config.ts'],
    ['apps', 'web', 'vitest.config.ts'],
    ['apps', 'web', 'tests', 'vitest.config.ts'],
    ['apps', 'web', 'tests', 'vitest.workspace.ts'],
    ['tsconfig.json'],
    ['apps', 'web', 'tests', 'tsconfig.json'],
    ['apps', 'web', 'tests', 'tsconfig.test.json'],
    ['playwright.config.ts'],
    ['e2e', 'playwright.config.ts'],
    ['e2e', 'playwright.config.js'],
    ['supabase', 'tests', 'eslint.config.js'],
  ]) {
    blocks('test-engineer', 'Write', { file_path: P(...rel), content: 'x' });
    blocks('test-engineer', 'Edit', { file_path: P(...rel), old_string: 'a', new_string: 'b' });
  }
});

test('[F3] test-engineer: Write outside test areas, or a non-md file under .work, is blocked', () => {
  for (const rel of [
    ['apps', 'web', 'src', 'main.tsx'],
    ['apps', 'web', 'src', 'new.test.ts'],
    ['apps', 'server', 'api', 'h.ts'],
    ['tools', 'x.mjs'],
    ['docs', 'a.md'],
    ['.work', 's', 'x.json'],
    ['.work', 's', 'x.ts'],
    ['.work', 's', 'x.js'],
    ['.work', 's', 'x.mjs'],
    ['.work', 's', 'x'],
    ['.work', 'x.md'],
    ['.claude', 'hooks', 'guard.js'],
    ['.claude', 'settings.json'],
    ['apps', 'web', 'tests', '..', 'src', 'main.tsx'],
  ]) {
    blocks('test-engineer', 'Write', { file_path: P(...rel), content: 'x' });
  }
});

// ---------------------------------------------------------------- block log

function logLines(root) {
  const f = path.join(root, '.claude', 'logs', 'blocks.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
const incidentLines = (root) =>
  fs
    .readFileSync(path.join(root, 'incidents.md'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));

test('[round4,d] a block appends one JSON line with the specified fields, creating the directory', () => {
  const root = mkRoot();
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'logs')));
  blocks('critic', 'Bash', { command: 'ls TOPSECRETVALUE' }, { root, session: 'sess-1' });
  const lines = logLines(root);
  assert.strictEqual(lines.length, 1);
  const l = lines[0];
  for (const k of ['time', 'role', 'tool', 'rule', 'reason', 'session']) assert.ok(k in l, `field ${k}`);
  assert.strictEqual(l.role, 'critic');
  assert.strictEqual(l.tool, 'Bash');
  assert.strictEqual(l.rule, 'reader');
  assert.strictEqual(l.session, 'sess-1');
  assert.ok(typeof l.reason === 'string' && l.reason.length > 0);
  assert.ok(!Number.isNaN(Date.parse(l.time)), 'time parses as a date');
  assert.doesNotMatch(JSON.stringify(l), /TOPSECRETVALUE/, 'the command is never logged');
});

test('[round4,d] session is "" when the input has no session_id; an allowed call logs nothing', () => {
  const root = mkRoot();
  allows('critic', 'Read', { file_path: path.join(root, '.work', 'x', 'spec.md') }, { root });
  assert.strictEqual(logLines(root).length, 0);
  blocks('critic', 'Bash', { command: 'ls' }, { root });
  assert.strictEqual(logLines(root)[0].session, '');
});

test('[round4,d] rule classification: reader, r4-critical, builder', () => {
  const root = mkRoot();
  blocks('test-engineer', 'Read', { file_path: path.join(root, '.work', 'x', 'notes.md') }, { root });
  blocks('all', 'Bash', { command: 'cat .env' }, { root });
  blocks('all', 'Bash', { command: 'git push --force' }, { root });
  blocks('builder', 'Write', { file_path: path.join(root, 'apps', 'web', 'src', 'a.test.ts'), content: '' }, { root });
  assert.deepStrictEqual(
    logLines(root).map((l) => l.rule),
    ['reader', 'r4-critical', 'r4-critical', 'builder'],
  );
});

test('[round4,d] a failed log write never changes the block', () => {
  const root = mkRoot();
  // .claude/logs is a file, so creating the directory / appending fails
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'logs'), 'not a directory');
  blocks('critic', 'Bash', { command: 'ls' }, { root });
  blocks('all', 'Bash', { command: 'git push --force' }, { root });
  allows('critic', 'Read', { file_path: path.join(root, '.work', 'x', 'spec.md') }, { root });
});

test('[round4,F5] incidents.md: an r4-critical block adds a line; reader and builder blocks never do, however many', () => {
  const root = mkRoot();
  for (let i = 0; i < 4; i++) blocks('critic', 'Bash', { command: 'ls' }, { root, session: 's' });
  blocks('builder', 'Write', { file_path: path.join(root, 'apps', 'web', 'src', 'a.test.ts'), content: '' }, { root, session: 's' });
  assert.strictEqual(incidentLines(root).length, 0);
  blocks('all', 'Bash', { command: 'cat .env' }, { root, session: 's' });
  assert.strictEqual(incidentLines(root).length, 1);
  assert.doesNotMatch(incidentLines(root)[0], /cat \.env/, 'the command is not written to incidents.md');
});

// ---------------------------------------------------------------- regression: R4 and BUILDER unchanged

test('regression: fails closed on bad input and unknown role', () => {
  blocks('nobody', 'Bash', { command: 'ls' });
  assert.strictEqual(run('all', 'Bash', 'not json'), 2);
  assert.strictEqual(run('all', 'Bash', JSON.stringify({ tool_name: 'Bash' })), 2);
});

test('regression [R4]: force push is blocked, ordinary forms and git add -A are not', () => {
  for (const c of ['git push --force', 'git push -f', 'git push origin +main', 'git push --force-with-lease']) blocks('all', 'Bash', { command: c });
  for (const c of ['git push', 'git push origin main', 'git status', 'git add -u', 'git add apps/web/src/a.ts', 'git add -A', 'git add .']) allows('all', 'Bash', { command: c });
});

test('regression [R4]: .env in a shell command is blocked', () => {
  for (const c of ['cat .env.preview', 'type .env', 'node -e "require(\'fs\').readFileSync(\'.env.preview\')"']) blocks('all', 'Bash', { command: c });
});

test('regression [R3]: builder cannot write test files, can write source', () => {
  for (const f of [P('apps', 'web', 'src', 'a.test.ts'), P('apps', 'web', 'tests', 'b.spec.ts'), P('e2e', 'c.spec.ts')]) {
    blocks('builder', 'Write', { file_path: f, content: '' });
    blocks('builder', 'Edit', { file_path: f, old_string: 'a', new_string: 'b' });
  }
  allows('builder', 'Write', { file_path: P('apps', 'web', 'src', 'main.tsx'), content: '' });
});

// ---------------------------------------------------------------- I-1: paths that do not resolve under the root

const IS_WIN = process.platform === 'win32';
const winSkip = (t) => {
  if (!IS_WIN) {
    t.skip('Windows only');
    return false;
  }
  return true;
};
// \\localhost\C$\<rest of ROOT>
const rootNoDrive = () => ROOT.slice(path.parse(ROOT).root.length);
const driveLetter = () => path.parse(ROOT).root.slice(0, 1);
const unc = (...s) => `\\\\localhost\\${driveLetter()}$\\${path.join(rootNoDrive(), ...s)}`;
const uncFwd = (...s) => unc(...s).split('\\').join('/');
const devicePath = (...s) => `\\\\?\\${path.join(ROOT, ...s)}`;
const otherDrive = () => (driveLetter().toUpperCase() === 'Z' ? 'Y' : 'Z') + ':\\nestly-x\\';

test('[I-1] critic: UNC alias of the root, Grep on .work with no glob, is blocked', (t) => {
  if (!winSkip(t)) return;
  blocks('critic', 'Grep', { pattern: '.', path: unc('.work') });
  blocks('critic', 'Grep', { pattern: '.', path: uncFwd('.work') });
  blocks('critic', 'Grep', { pattern: '.', path: unc('.work', 'x') });
  blocks('critic', 'Grep', { pattern: '.', path: unc() });
});

test('[PR 37 CRITIC 1] both readers: a Grep outside the root needs a notes-excluding glob or type', () => {
  for (const role of ['critic', 'test-engineer']) {
    for (const p of [path.dirname(ROOT), path.join(path.dirname(ROOT), 'other-clone'), otherDrive(), devicePath('.work')]) {
      blocks(role, 'Grep', { pattern: '.', path: p });
      allows(role, 'Grep', { pattern: '.', path: p, glob: '*.ts' });
      allows(role, 'Grep', { pattern: '.', path: p, type: 'ts' });
    }
  }
});

test('[I-1] regression: ordinary in-root absolute paths stay allowed', () => {
  allows('critic', 'Read', { file_path: P('apps', 'web', 'src', 'main.tsx') });
  allows('critic', 'Write', { file_path: P('.work', 's', 'findings.md'), content: 'f' });
  allows('test-engineer', 'Read', { file_path: P('apps', 'web', 'tests', 'a.test.ts') });
  allows('test-engineer', 'Write', { file_path: P('apps', 'web', 'tests', 'new.test.ts'), content: 'x' });
});

// ---------------------------------------------------------------- I-3: escalation once the count reaches 3, even if the 3rd was skipped

function seedReaderBlocks(root, role, session, n) {
  const dir = path.join(root, '.claude', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ time: new Date().toISOString(), role, tool: 'Bash', rule: 'reader', reason: 'seeded', session }) + '\n';
  fs.appendFileSync(path.join(dir, 'blocks.jsonl'), line.repeat(n));
}

