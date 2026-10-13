// Tests for guard-loader.js (spec: .work/agent-slim/stage1-guard.md, b and F4): the loader runs ./guard.js, falls
// back to `git show origin/main:.claude/hooks/guard.js` when that does not load, and never fails open.
// Fake guards stand in for the real one. Run: node --test .claude/hooks/guard-loader.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const LOADER_SRC = path.join(__dirname, 'guard-loader.js');
const HOOKS = ['.claude', 'hooks'];

// A guard that behaves like the real one at its edges: bad stdin fails closed, otherwise it says `marker` and exits `code`.
const good = (marker, code) => `'use strict';
exports.main = function main() {
  let d = '';
  process.stdin.on('data', (c) => (d += c));
  process.stdin.on('end', () => {
    try { JSON.parse(d); } catch { process.stderr.write('bad json\\n'); process.exit(2); }
    process.stderr.write(${JSON.stringify(marker)});
    process.exit(${code});
  });
};
`;

const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Builds a repo whose origin/main holds `remoteGuard` (or no origin at all), and whose working copy holds `localGuard`
// (committed locally but not pushed, so only origin/main can be the fallback).
function setup({ remoteGuard, localGuard }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-loader-'));
  const work = path.join(base, 'work');
  fs.mkdirSync(path.join(work, ...HOOKS), { recursive: true });
  git(work, 'init', '-q', '-b', 'main');
  git(work, 'config', 'user.email', 't@example.com');
  git(work, 'config', 'user.name', 't');
  fs.copyFileSync(LOADER_SRC, path.join(work, ...HOOKS, 'guard-loader.js'));
  const guardPath = path.join(work, ...HOOKS, 'guard.js');
  if (remoteGuard !== undefined) {
    fs.writeFileSync(guardPath, remoteGuard);
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'merged guard');
    const remote = path.join(base, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
    git(work, 'remote', 'add', 'origin', remote);
    git(work, 'push', '-q', 'origin', 'main');
    git(work, 'fetch', '-q', 'origin');
  }
  if (localGuard === null) {
    fs.rmSync(guardPath, { force: true });
  } else if (localGuard !== undefined) {
    fs.writeFileSync(guardPath, localGuard);
  }
  return { work, guardPath };
}

let last = { stderr: '', stdout: '' };
function runLoader(work, stdin = '{"tool_name":"Bash","tool_input":{"command":"ls"}}', role = 'all', env = {}) {
  const r = spawnSync(process.execPath, [path.join(work, ...HOOKS, 'guard-loader.js'), role], {
    input: stdin,
    cwd: work,
    env: { ...process.env, CLAUDE_PROJECT_DIR: work, ...env },
    encoding: 'utf8',
    timeout: 60000,
  });
  last = { stderr: r.stderr, stdout: r.stdout };
  return r.status;
}

const REMOTE_BLOCKS = good('FALLBACK-BLOCK', 2);
const REMOTE_ALLOWS = good('FALLBACK-ALLOW', 0);

test('the loader file exists', () => {
  assert.ok(fs.existsSync(LOADER_SRC), 'guard-loader.js is missing');
});

test('[b] a loadable guard.js runs and its verdict passes through (exit 0 and exit 2)', () => {
  let s = setup({ remoteGuard: REMOTE_BLOCKS, localGuard: good('LOCAL-ALLOW', 0) });
  assert.strictEqual(runLoader(s.work), 0, last.stderr);
  assert.match(last.stderr, /LOCAL-ALLOW/);
  s = setup({ remoteGuard: REMOTE_ALLOWS, localGuard: good('LOCAL-BLOCK', 2) });
  assert.strictEqual(runLoader(s.work), 2);
  assert.match(last.stderr, /LOCAL-BLOCK/);
  assert.doesNotMatch(last.stderr, /FALLBACK/);
});

test('[b] the role argument reaches the guard', () => {
  const echoRole = `exports.main = function () { process.stderr.write('ROLE=' + process.argv[2]); process.exit(0); };\n`;
  const s = setup({ remoteGuard: REMOTE_BLOCKS, localGuard: echoRole });
  assert.strictEqual(runLoader(s.work, undefined, 'critic'), 0, last.stderr);
  assert.match(last.stderr, /ROLE=critic/);
});

const BROKEN = {
  'throws at load': `throw new Error('boom at load');\n`,
  'has a syntax error': `exports.main = function ( {{{ \n`,
  'is missing': null,
  'exports no main': `exports.other = 1;\n`,
  'main is not a function': `exports.main = 42;\n`,
  'is empty': ``,
};

for (const [what, src] of Object.entries(BROKEN)) {
  test(`[F4] guard.js ${what} + working fallback: the fallback's verdict (block)`, () => {
    const s = setup({ remoteGuard: REMOTE_BLOCKS, localGuard: src });
    assert.strictEqual(runLoader(s.work), 2, last.stderr);
    assert.match(last.stderr, /FALLBACK-BLOCK/);
  });

  test(`[F4] guard.js ${what} + working fallback: the fallback's verdict (allow)`, () => {
    const s = setup({ remoteGuard: REMOTE_ALLOWS, localGuard: src });
    assert.strictEqual(runLoader(s.work), 0, last.stderr);
    assert.match(last.stderr, /FALLBACK-ALLOW/);
  });

  test(`[F4] guard.js ${what} + no origin: exit 2 with "guard could not load"`, () => {
    const s = setup({ remoteGuard: undefined, localGuard: src === null ? undefined : src });
    assert.strictEqual(runLoader(s.work), 2, last.stderr);
    assert.match(last.stderr, /guard could not load/i);
  });

  test(`[F4] guard.js ${what} + fallback also broken: exit 2`, () => {
    const s = setup({ remoteGuard: `throw new Error('fallback boom');\n`, localGuard: src });
    assert.strictEqual(runLoader(s.work), 2, last.stderr);
    assert.match(last.stderr, /guard could not load/i);
  });
}

test('[F4] fallback with a syntax error or no main: exit 2', () => {
  for (const remote of [`exports.main = function ( {{{ \n`, `exports.other = 1;\n`]) {
    const s = setup({ remoteGuard: remote, localGuard: `throw new Error('x');\n` });
    assert.strictEqual(runLoader(s.work), 2, last.stderr);
  }
});

test('[F4] the fallback is origin/main, not the local HEAD or the working tree', () => {
  // Local HEAD carries a different (allowing) guard, committed but not pushed; guard.js on disk is broken.
  const s = setup({ remoteGuard: REMOTE_BLOCKS, localGuard: good('LOCAL-COMMITTED', 0) });
  git(s.work, 'add', '.');
  git(s.work, 'commit', '-q', '-m', 'local guard');
  fs.writeFileSync(s.guardPath, `throw new Error('x');\n`);
  assert.strictEqual(runLoader(s.work), 2, last.stderr);
  assert.match(last.stderr, /FALLBACK-BLOCK/);
  assert.doesNotMatch(last.stderr, /LOCAL-COMMITTED/);
});

test('[F4] the fallback runs in memory: no file is written', () => {
  const s = setup({ remoteGuard: REMOTE_ALLOWS, localGuard: `throw new Error('x');\n` });
  const listing = () => {
    const out = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === '.git') continue;
        const p = path.join(d, e.name);
        e.isDirectory() ? walk(p) : out.push(p + ':' + fs.statSync(p).size);
      }
    };
    walk(s.work);
    return out.sort();
  };
  const before = listing();
  assert.strictEqual(runLoader(s.work), 0, last.stderr);
  assert.deepStrictEqual(listing(), before);
});

test('[F4] a malformed or empty stdin exits 2, with a working guard and with the fallback', () => {
  let s = setup({ remoteGuard: REMOTE_ALLOWS, localGuard: good('LOCAL-ALLOW', 0) });
  for (const bad of ['not json', '', '{', '\u0000']) assert.strictEqual(runLoader(s.work, bad), 2, JSON.stringify(bad));
  s = setup({ remoteGuard: REMOTE_ALLOWS, localGuard: `throw new Error('x');\n` });
  for (const bad of ['not json', '', '{']) assert.strictEqual(runLoader(s.work, bad), 2, JSON.stringify(bad));
});

test('[F4] the loader itself failing never exits 1: a throwing main, an async throw, a rejection, a throwing export getter', () => {
  const cases = {
    'main throws synchronously': `exports.main = function () { throw new Error('sync'); };\n`,
    'main throws later (uncaughtException)': `exports.main = function () { setTimeout(() => { throw new Error('late'); }, 0); };\n`,
    'main rejects (unhandledRejection)': `exports.main = async function () { throw new Error('rejected'); };\n`,
    'main rejects later': `exports.main = function () { Promise.reject(new Error('r')); };\n`,
    'exports.main getter throws': `Object.defineProperty(exports, 'main', { get() { throw new Error('getter'); } });\n`,
  };
  for (const [what, src] of Object.entries(cases)) {
    const s = setup({ remoteGuard: undefined, localGuard: src });
    const code = runLoader(s.work);
    assert.strictEqual(code, 2, `${what}: exit ${code} ${last.stderr}`);
  }
});

test('[F4] a guard.js that is a directory, and an unreadable origin ref, end in exit 2', () => {
  let s = setup({ remoteGuard: undefined, localGuard: null });
  fs.mkdirSync(s.guardPath);
  assert.strictEqual(runLoader(s.work), 2, last.stderr);
  // origin exists but origin/main does not hold the file
  s = setup({ remoteGuard: REMOTE_ALLOWS, localGuard: `throw new Error('x');\n` });
  git(s.work, 'rm', '-q', '--cached', '.claude/hooks/guard.js');
  git(s.work, 'commit', '-q', '-m', 'drop guard');
  git(s.work, 'push', '-q', 'origin', 'main');
  git(s.work, 'fetch', '-q', 'origin');
  assert.strictEqual(runLoader(s.work), 2, last.stderr);
});

test('[F4] the loader fails closed outside a git repository', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-loader-nogit-'));
  fs.mkdirSync(path.join(dir, ...HOOKS), { recursive: true });
  fs.copyFileSync(LOADER_SRC, path.join(dir, ...HOOKS, 'guard-loader.js'));
  fs.writeFileSync(path.join(dir, ...HOOKS, 'guard.js'), `throw new Error('x');\n`);
  assert.strictEqual(runLoader(dir, undefined, 'all', { GIT_CEILING_DIRECTORIES: path.dirname(dir) }), 2, last.stderr);
});
