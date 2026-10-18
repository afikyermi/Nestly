// Guard retro (Afik 18.10.2026, items 5 and 6א–ג): every change proves the false block is gone AND the real protection
// stays. Each case pipes a hook payload into the guard, as Claude Code does, against a throwaway root (its own logs and
// incidents.md), never the project's. Run: node --test .claude/hooks/guard-retro.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-retro-'));
fs.writeFileSync(path.join(ROOT, 'incidents.md'), '# Incidents\n');

function run(role, tool, input) {
  const r = spawnSync(process.execPath, [GUARD, role], {
    input: JSON.stringify({ tool_name: tool, tool_input: input, cwd: ROOT }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  return { blocked: r.status === 2, allowed: r.status === 0, stderr: r.stderr };
}
const bash = (command) => run('all', 'Bash', { command });
const incidents = () => fs.readFileSync(path.join(ROOT, 'incidents.md'), 'utf8').split('\n').filter(Boolean).length;

// ---- 6א: a jq program is text, not a file name ----
test('[6א] jq filters, `.[]` and gh --jq/-q are not read as env-file globs (the recorded false blocks)', () => {
  for (const c of [`jq '.[] | .name' data.json`, `jq '.environment' package.json`, `gh api repos/a/b/pulls --jq '.[].number'`, `gh api repos/a/b -q '.[0].sha'`, `gh pr list --json number --jq '.[] | .number'`, `gh api repos/supabase/postgres/contents/Dockerfile --jq '.[]'`]) {
    assert.ok(bash(c).allowed, c);
  }
});
test('[6א] the real protection stays: env files as paths, jq file options, and command substitution are blocked', () => {
  for (const c of ['cat .env', 'cat .env.preview', 'cat .en*', 'cat .{env,x}', `jq --rawfile x .env '.'`, `jq --slurpfile x .env.local '.'`, `jq -f .env data.json`,
    `gh api repos/a/b --jq "$(cat .env)"`, `jq "$(cat .env)" data.json`, `node -e "require('fs').readFileSync('.env')"`, 'cp .env /tmp/x', `jq 'include ".env"; .' f`, `gh api x --jq '".env"'`]) {
    assert.ok(bash(c).blocked, c);
  }
});

// ---- 6ב: only r4-critical reaches incidents.md ----
test('[6ב] a reader block writes no incidents.md line; an r4-critical block writes one', () => {
  const before = incidents();
  for (let i = 0; i < 4; i++) assert.ok(run('critic', 'Read', { file_path: path.join(ROOT, '.work', 'x', 'notes.md') }).blocked);
  assert.equal(incidents(), before, 'four reader blocks in a row: no escalation');
  assert.ok(bash('cat .env').blocked);
  assert.equal(incidents(), before + 1, 'r4-critical: one line');
});

// ---- 5: remote deletes only through the checked tool ----
test('[5] a raw remote delete and every force push stay blocked, and the message names the tool', () => {
  for (const c of ['git push origin --delete feat/x', 'git push origin -d feat/x', 'git push origin :feat/x', 'git push --force origin main', 'git push -f', 'git push origin +main', 'git push --mirror']) {
    const r = bash(c);
    assert.ok(r.blocked, c);
  }
  assert.match(bash('git push origin --delete ready/p4-proof').stderr, /tools\/branch-delete\.mjs/);
});
test('[5] the guard lets the checked tool run (the tool itself refuses main and unmerged branches: tools/branch-delete.test.mjs)', () => {
  assert.ok(bash('node tools/branch-delete.mjs ready/p4-proof').allowed);
});

// ---- 6ג: known placeholders in tests and docs; real secrets everywhere ----
function repoWith(files) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-retro-repo-'));
  const g = (...x) => execFileSync('git', ['-C', repo, ...x], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  g('config', 'core.autocrlf', 'false');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), text);
  }
  g('add', '-A');
  return repo;
}
const { scanForSecrets } = require('./guard.js');
const pg = (user, pw, host) => ['postgres', '://', user, ':', pw, '@', host].join('');

test('[6ג] a placeholder database URL in a test file or a document is not a secret', () => {
  for (const files of [
    { 'apps/server/tests/db/a.test.ts': `const url = '${pg('app_server', 'secret', 'localhost:54322')}/postgres';\n` },
    { 'docs/setup.md': `Use ${pg('app_owner', '…', 'db.example.com')}/postgres\n` },
    { 'e2e/fixtures.ts': `export const U = '${pg('u', 'changeme', '127.0.0.1:5432')}/x';\n` },
    { '.work/x/schema.md': `${pg('app_owner', 'password1', 'localhost')}/postgres\n` },
  ]) {
    assert.equal(scanForSecrets(repoWith(files), false), null, Object.keys(files)[0]);
  }
});
test('[6ג] the real protection stays: product code, Supabase hosts, a real URL after a placeholder, and other secrets', () => {
  const real = pg('postgres.abcdefghijkl', 'Zq9-r3al-pw', 'aws-0-eu-central-1.pooler.supabase.com:5432');
  for (const files of [
    { 'apps/server/src/db.ts': `const url = '${pg('app_server', 'secret', 'localhost')}/postgres';\n` },
    { 'apps/server/tests/db/a.test.ts': `const url = '${real}/postgres';\n` },
    { 'docs/setup.md': `${pg('u', 'secret', 'db.abcdefghijkl.supabase.co')}/postgres\n` },
    { 'apps/server/tests/db/a.test.ts': `const a = '${pg('u', 'secret', 'localhost')}/x', b = '${real}/p';\n` },
    { 'docs/keys.md': ['sb_', 'secret_', 'abcdefghijklmnopqrstuvwxyz012345'].join('') + '\n' },
    { 'apps/web/tests/a.test.ts': ['const k = "sk-', 'ant-', 'abcdefghijklmnopqrstuvwxyz"'].join('') + ';\n' },
  ]) {
    assert.ok(scanForSecrets(repoWith(files), false), Object.keys(files)[0]);
  }
});
