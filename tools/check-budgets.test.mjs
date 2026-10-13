// Tests for tools/check-budgets.mjs, from .work/agent-slim/stage5-budgets.md (acceptance criteria 1-12).
// Black-box through the CLI: node tools/check-budgets.mjs --config <path> --root <dir>
// Each case builds a throwaway git repo; "tracked" means `git add`-ed, "untracked" is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-budgets.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const MAX = 20;
const TEST_MAX = 40;

const lines = (n) => 'x\n'.repeat(n);

function baseConfig(over = {}) {
  return {
    alwaysRead: { 'CLAUDE.md': 10 },
    code: { max: MAX, testMax: TEST_MAX, exclude: ['apps/*/src/**'], exceptions: {} },
    ...over,
  };
}

// files: { path: content }, untracked: [paths left out of the git index]
function setup(files, config = baseConfig(), untracked = []) {
  const dir = mkdtempSync(join(tmpdir(), 'budgets-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const withClaude = { 'CLAUDE.md': lines(3), ...files };
  for (const [p, content] of Object.entries(withClaude)) {
    const full = join(dir, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const tracked = Object.keys(withClaude).filter((p) => !untracked.includes(p));
  if (tracked.length) spawnSync('git', ['add', '--', ...tracked], { cwd: dir });
  const configPath = join(dir, '..', `${dir.split(/[\\/]/).pop()}.config.json`);
  writeFileSync(configPath, typeof config === 'string' ? config : JSON.stringify(config));
  return { dir, configPath };
}

function run(files, config, untracked) {
  const { dir, configPath } = setup(files, config, untracked);
  try {
    return exec(['--config', configPath, '--root', dir]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(configPath, { force: true });
  }
}

function exec(args, cwd) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// The line naming a path, so we can check the numbers sit with it.
const lineFor = (out, path) => out.split(/\r?\n/).find((l) => l.includes(path)) ?? '';

test('criterion 1: everything within budget and caps exits 0 with "budgets: ok"', () => {
  const r = run({
    'src/a.js': lines(MAX),
    'src/a.test.ts': lines(TEST_MAX),
    'apps/web/src/big.ts': lines(500),
  });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /budgets: ok/);
});

test('criterion 1: alwaysRead file exactly at its budget passes', () => {
  const r = run({ 'CLAUDE.md': lines(10) });
  assert.equal(r.status, 0, r.out);
});

test('criterion 1: a code file exactly at max passes, at max+1 fails', () => {
  assert.equal(run({ 'a.js': lines(MAX) }).status, 0);
  assert.equal(run({ 'a.js': lines(MAX + 1) }).status, 1);
});

test('criterion 2: alwaysRead file over budget exits 1 naming path, line count and budget', () => {
  const r = run({ 'CLAUDE.md': lines(13) });
  assert.equal(r.status, 1);
  const l = lineFor(r.out, 'CLAUDE.md');
  assert.match(l, /\b13\b/);
  assert.match(l, /\b10\b/);
  assert.doesNotMatch(r.out, /budgets: ok/);
});

test('criterion 2: one past the budget fails', () => {
  assert.equal(run({ 'CLAUDE.md': lines(11) }).status, 1);
});

test('criterion 2: every over-budget alwaysRead file is reported, not just the first', () => {
  const cfg = baseConfig({ alwaysRead: { 'CLAUDE.md': 5, 'docs/one.md': 5, 'docs/two.md': 5 } });
  const r = run({ 'CLAUDE.md': lines(9), 'docs/one.md': lines(9), 'docs/two.md': lines(9) }, cfg);
  assert.equal(r.status, 1);
  for (const p of ['CLAUDE.md', 'docs/one.md', 'docs/two.md']) assert.ok(r.out.includes(p), `missing ${p} in: ${r.out}`);
});

test('criterion 3: alwaysRead file that does not exist exits 1 naming path and "missing"', () => {
  const cfg = baseConfig({ alwaysRead: { 'CLAUDE.md': 10, 'nope/gone.md': 50 } });
  const r = run({}, cfg);
  assert.equal(r.status, 1);
  assert.match(lineFor(r.out, 'nope/gone.md'), /missing/i);
});

test('criterion 4: tracked non-test code file over max exits 1 naming path, lines and cap', () => {
  const r = run({ 'lib/big.js': lines(25) });
  assert.equal(r.status, 1);
  const l = lineFor(r.out, 'lib/big.js');
  assert.match(l, /\b25\b/);
  assert.match(l, new RegExp(`\\b${MAX}\\b`));
});

test('criterion 4: every checked extension is enforced', () => {
  for (const ext of ['js', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']) {
    const r = run({ [`lib/big.${ext}`]: lines(MAX + 5) });
    assert.equal(r.status, 1, `.${ext} should be checked`);
    assert.ok(r.out.includes(`lib/big.${ext}`));
  }
});

test('criterion 4: non-code extensions are not checked', () => {
  const r = run({ 'lib/big.md': lines(500), 'lib/big.json': lines(500), 'lib/big.css': lines(500) });
  assert.equal(r.status, 0, r.out);
});

test('criterion 4: all offending files are reported in one run', () => {
  const r = run({ 'a/one.js': lines(30), 'b/two.ts': lines(30) });
  assert.equal(r.status, 1);
  assert.ok(r.out.includes('a/one.js') && r.out.includes('b/two.ts'), r.out);
});

test('criterion 5: test files (.test.ts, .spec.mjs) pass at testMax and fail at testMax+1', () => {
  for (const name of ['t/x.test.ts', 't/y.spec.mjs']) {
    assert.equal(run({ [name]: lines(TEST_MAX) }).status, 0, `${name} at testMax`);
    const r = run({ [name]: lines(TEST_MAX + 1) });
    assert.equal(r.status, 1, `${name} at testMax+1`);
    const l = lineFor(r.out, name);
    assert.match(l, new RegExp(`\\b${TEST_MAX + 1}\\b`));
    assert.match(l, new RegExp(`\\b${TEST_MAX}\\b`));
  }
});

test('criterion 5: a test file between max and testMax is not held to max', () => {
  assert.equal(run({ 't/x.test.ts': lines(MAX + 10) }).status, 0);
});

test('criterion 5: a non-test file named like a test dir is still held to max', () => {
  assert.equal(run({ 'test/helper.js': lines(MAX + 10) }).status, 1);
});

test('criterion 6: files under apps/<any>/src/ over max are not reported', () => {
  const r = run({
    'apps/web/src/big.ts': lines(500),
    'apps/server/src/deep/er/big.ts': lines(500),
    'apps/mobile/src/big.test.ts': lines(5000),
  });
  assert.equal(r.status, 0, r.out);
});

test('criterion 6: the exclusion is only apps/*/src - other app paths and other src dirs are checked', () => {
  assert.equal(run({ 'apps/web/scripts/big.ts': lines(MAX + 1) }).status, 1);
  assert.equal(run({ 'packages/shared/src/big.ts': lines(MAX + 1) }).status, 1);
});

test('criterion 7: an exception raises the cap for that file only', () => {
  const cfg = baseConfig();
  cfg.code.exceptions = { 'tools/special.js': { max: 30, reason: 'test' } };
  // within the exception, other file untouched
  assert.equal(run({ 'tools/special.js': lines(30) }, cfg).status, 0);
  // over the exception
  const over = run({ 'tools/special.js': lines(31) }, cfg);
  assert.equal(over.status, 1);
  assert.ok(over.out.includes('tools/special.js'));
  // another file of the same size, no exception
  const other = run({ 'tools/special.js': lines(25), 'tools/other.js': lines(25) }, cfg);
  assert.equal(other.status, 1);
  assert.ok(other.out.includes('tools/other.js'));
  assert.ok(!other.out.includes('tools/special.js'), 'excepted file must not be reported');
});

test('criterion 8: exception for a file that is not tracked exits 1 "stale exception"', () => {
  const cfg = baseConfig();
  cfg.code.exceptions = { 'tools/ghost.js': { max: 30, reason: 'test' } };
  const r = run({}, cfg);
  assert.equal(r.status, 1);
  assert.match(r.out, /stale exception/i);
  assert.ok(r.out.includes('tools/ghost.js'));
});

test('criterion 8: exception for a file that exists but is untracked is stale', () => {
  const cfg = baseConfig();
  cfg.code.exceptions = { 'tools/u.js': { max: 30, reason: 'test' } };
  const r = run({ 'tools/u.js': lines(25) }, cfg, ['tools/u.js']);
  assert.equal(r.status, 1);
  assert.match(r.out, /stale exception/i);
});

test('criterion 8: exception for a file within the default cap is stale (including exactly at max)', () => {
  const cfg = baseConfig();
  cfg.code.exceptions = { 'tools/small.js': { max: 30, reason: 'test' } };
  for (const n of [5, MAX]) {
    const r = run({ 'tools/small.js': lines(n) }, cfg);
    assert.equal(r.status, 1, `${n} lines`);
    assert.match(r.out, /stale exception/i);
  }
});

test('criterion 8: a still-needed exception is not called stale', () => {
  const cfg = baseConfig();
  cfg.code.exceptions = { 'tools/needed.js': { max: 30, reason: 'test' } };
  const r = run({ 'tools/needed.js': lines(MAX + 1) }, cfg);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /stale/i);
});

test('criterion 9: an untracked code file over the cap is not reported', () => {
  const r = run({ 'lib/untracked.js': lines(500), 'lib/untracked.test.ts': lines(5000) }, baseConfig(), [
    'lib/untracked.js',
    'lib/untracked.test.ts',
  ]);
  assert.equal(r.status, 0, r.out);
  assert.ok(!r.out.includes('untracked'));
});

test('criterion 9: the same file is reported once it is tracked', () => {
  assert.equal(run({ 'lib/t.js': lines(500) }).status, 1);
});

test('criterion 10: lines = count of \\n, plus one if the file does not end with \\n', () => {
  const cfg = (b) => baseConfig({ alwaysRead: { 'E.md': b } });
  // empty file is 0
  assert.equal(run({ 'E.md': '' }, cfg(0)).status, 0);
  // single char, no newline = 1
  assert.equal(run({ 'E.md': 'x' }, cfg(1)).status, 0);
  const one = run({ 'E.md': 'x' }, cfg(0));
  assert.equal(one.status, 1);
  assert.match(lineFor(one.out, 'E.md'), /\b1\b/);
  // lone newline = 1
  assert.equal(run({ 'E.md': '\n' }, cfg(1)).status, 0);
  assert.equal(run({ 'E.md': '\n' }, cfg(0)).status, 1);
  // blank lines count
  assert.equal(run({ 'E.md': '\n\n\n' }, cfg(3)).status, 0);
  assert.equal(run({ 'E.md': '\n\n\n' }, cfg(2)).status, 1);
  // 3 newlines + trailing text without newline = 4
  assert.equal(run({ 'E.md': '\n\n\nz' }, cfg(4)).status, 0);
  assert.equal(run({ 'E.md': '\n\n\nz' }, cfg(3)).status, 1);
  // CRLF counts one per \n
  assert.equal(run({ 'E.md': 'a\r\nb\r\n' }, cfg(2)).status, 0);
  assert.equal(run({ 'E.md': 'a\r\nb\r\n' }, cfg(1)).status, 1);
});

test('criterion 10: same counting for code files at the cap (trailing newline or not)', () => {
  assert.equal(run({ 'a.js': lines(MAX - 1) + 'x' }).status, 0); // 20 lines, no final \n
  assert.equal(run({ 'a.js': lines(MAX) + 'x' }).status, 1); // 21 lines
  assert.equal(run({ 'a.js': lines(MAX) }).status, 0); // 20 lines with final \n
  assert.equal(run({ 'a.js': '' }).status, 0);
});

test('criterion 11: missing config file exits 1 with a message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budgets-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    const r = exec(['--config', join(dir, 'does-not-exist.json'), '--root', dir]);
    assert.equal(r.status, 1);
    assert.ok(r.out.trim().length > 0, 'expected a message');
    assert.doesNotMatch(r.out, /budgets: ok/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('criterion 11: invalid JSON, empty file, or lacking alwaysRead / code.max exits 1 with a message', () => {
  const bad = {
    'not json': '{ this is not json',
    'empty file': '',
    'no alwaysRead': JSON.stringify({ code: { max: MAX } }),
    'no code': JSON.stringify({ alwaysRead: {} }),
    'no code.max': JSON.stringify({ alwaysRead: {}, code: { testMax: 40 } }),
    'JSON null': 'null',
    'JSON array': '[]',
  };
  for (const [label, content] of Object.entries(bad)) {
    const r = run({ 'a.js': lines(1) }, content);
    assert.equal(r.status, 1, `${label}: ${r.out}`);
    assert.ok(r.out.trim().length > 0, `${label}: expected a message`);
    assert.doesNotMatch(r.out, /budgets: ok/, label);
  }
});

test('criterion 11: a valid config with empty alwaysRead and a minimal code section is accepted', () => {
  const r = run({ 'a.js': lines(1) }, JSON.stringify({ alwaysRead: {}, code: { max: MAX } }));
  assert.equal(r.status, 0, r.out);
});

test('criterion 1: --root defaults to the current directory', () => {
  const { dir, configPath } = setup({ 'a.js': lines(MAX + 5) });
  try {
    const r = exec(['--config', configPath], dir);
    assert.equal(r.status, 1);
    assert.ok(r.out.includes('a.js'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(configPath, { force: true });
  }
});

test('criterion 12: this repository passes with the default config (exit 0, "budgets: ok")', () => {
  const r = exec([], repoRoot);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /budgets: ok/);
});
