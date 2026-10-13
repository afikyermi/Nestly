// Regression tests for .work/guard-env-paths/bug.md: the guard's env-file rule (R4) judges path arguments and
// redirection targets (plus inline interpreter code), not text that merely mentions the name.
// Written from bug.md only. Each case pipes a hook payload into the script, as Claude Code does.
// Run: node --test .claude/hooks/guard-env.test.js
//
// Test names carry the bug.md section they assert (bug.md has no requirement IDs):
//   [still-blocked]  "Still blocked" bullets   [not-blocked]  "No longer blocked" bullets
//   [pattern-vs-path] the search-command paragraph   [F5] the "in one task" wording
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');

// A throwaway project root, so blocked calls log to its own .claude/logs and incidents.md and not to the real ones.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-env-test-'));
fs.writeFileSync(path.join(ROOT, 'incidents.md'), '# Incidents\n');

// A clean throwaway git repo, so a `git commit` is scanned in a repo with nothing staged.
const REPO = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-env-repo-'));
{
  const g = (...x) => execFileSync('git', ['-C', REPO, ...x], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  g('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(REPO, 'a.ts'), 'export const a = 1;\n');
  g('add', 'a.ts');
  g('commit', '-q', '-m', 'init');
  // Untracked and unstaged, so the secret scan never sees it; the guard logs escalations here.
  fs.writeFileSync(path.join(REPO, 'incidents.md'), '# Incidents\n');
}

function run(role, command, { root = ROOT, session } = {}) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: root, ...(session !== undefined ? { session_id: session } : {}) });
  const r = spawnSync(process.execPath, [GUARD, role], {
    input: payload,
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

const incidentLines = (root) =>
  fs
    .readFileSync(path.join(root, 'incidents.md'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));

// One test per command, so the report lists pass/fail per case.
function stillBlocked(group, commands) {
  for (const c of commands) {
    test(`[still-blocked] ${group}: ${c}`, () => {
      const before = incidentLines(ROOT).length;
      const r = run('all', c);
      assert.strictEqual(r.status, 2, 'expected a block: ' + r.stderr);
      assert.doesNotMatch(r.stderr, /guard error/, 'the block must come from the env rule, not from the guard failing: ' + r.stderr);
      assert.match(r.stderr, /\.env files/i, 'the reason names .env files: ' + r.stderr);
      assert.strictEqual(incidentLines(ROOT).length - before, 1, 'an env-file block is r4-critical: one incidents.md line');
    });
  }
}

function notBlocked(group, commands, root = ROOT) {
  for (const c of commands) {
    test(`[not-blocked] ${group}: ${c}`, () => {
      const before = incidentLines(root).length;
      const r = run('all', c, { root });
      assert.strictEqual(r.status, 0, 'expected exit 0, got a block: ' + r.stderr);
      assert.strictEqual(incidentLines(root).length, before, 'no incidents.md line for text that is not a path');
    });
  }
}

// ---------------------------------------------------------------- Still blocked

stillBlocked('redirection target', [
  'cat < .env',
  'cat <.env',
  'echo x >.env.local',
  'echo x >> .env',
  'cmd 2> .env',
  'cmd &> .env',
  'cmd >| .env',
]);

stillBlocked('path argument', [
  'cat ".env.preview"',
  "cat './.env'",
  'cat apps/server/.env',
  'type apps\\server\\.env.local',
  'source .env',
  '. .env',
  'less .ENV',
]);

stillBlocked('option or assignment value', [
  'node --env-file=.env x.js',
  'node --env-file .env x.js',
  'F=.env; cat $F',
]);

stillBlocked('glob that can expand to an env file', [
  'cat .env*',
  'cat .en?',
  'cat .e*',
  'cat .*',
  'cat apps/server/.env*',
]);

stillBlocked('search whose file argument is an env file', [
  'grep URL .env.local',
  'rg x .env',
]);

stillBlocked('inline interpreter code', [
  `node -e "const s = require('fs').readFileSync('.env.preview', 'utf8'); console.log(s.length)"`,
  `node -p "require('fs').readFileSync('.env.preview','utf8')"`,
  `python -c "print(open('.env.preview').read())"`,
  `perl -e 'open(F, ".env.preview"); print <F>;'`,
  `ruby -e "puts File.read('.env.preview')"`,
  "node - <<'EOF'\nconsole.log(require('fs').readFileSync('.env.preview', 'utf8'))\nEOF",
  "python3 - <<'EOF'\nprint(open('.env.local').read())\nEOF",
  "bash <<'EOF'\ncat .env.preview\nEOF",
]);

// Nested shells are named in "Expected": every shell segment is judged, however it is wrapped.
stillBlocked('nested shell', [
  'bash -c "cat .env"',
  "sh -c 'cat .env.local'",
  'eval "cat .env"',
  'powershell -Command "Get-Content .env"',
  'cmd /c type .env',
  'echo ok && cat .env',
  '(cat apps/server/.env)',
]);

// A mention that is allowed elsewhere in the command must not shelter a real path argument.
stillBlocked('a path next to harmless text', [
  'git log -1 --grep=.env && cat .env',
  'grep -n ".env" noise.md; cat .env.local',
  'grep .env .env',
  'grep -e .env .env.local',
  'cat .env.example .env',
  'echo "the .env file" > .env.local',
]);

// ---------------------------------------------------------------- No longer blocked

notBlocked('search pattern', [
  'grep -n ".env" noise.md',
  'grep -rn "\\.env" .claude/knowledge/conventions.md',
  'rg -e .env docs/',
  'git grep ".env.preview" -- docs',
  'git log --grep=.env',
]);

// The commit runs in a clean repo (nothing staged), so the secret scan has nothing to block on.
notBlocked('commit message', ['git commit -m "docs: mention .env.preview"'], REPO);

notBlocked('text that is not a path', [
  'echo "the .env file holds secrets"',
  `printf '%s\\n' "fill in .env.preview"`,
]);

notBlocked('.example names', [
  'cat .env.example',
  'cp .env.example /tmp/x',
  'cat .env.local.example',
  'echo x > .env.example',
]);

notBlocked('names that only contain the letters', [
  'cat src/env.ts',
  'echo $NODE_ENV',
  'cat .environment-notes.md',
]);

// "A bare .env token that is the pattern of a search command ... is a pattern, not a path."
notBlocked('pattern of every named search command', [
  'grep .env noise.md',
  'egrep "\\.env(\\.local)?" noise.md',
  'fgrep .env noise.md',
  'rg .env.preview docs/',
  'Select-String -Pattern .env noise.md',
  'findstr ".env" noise.md',
]);

// The same text inside a nested shell is still only text.
notBlocked('nested shell, text only', [
  'bash -c "grep -n .env noise.md"',
  `sh -c 'echo "the .env file"'`,
]);

// ---------------------------------------------------------------- F5: wording

test('[F5] the escalation line for the third reader block of one role says "in one task", not "in one session"', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-env-f5-'));
  fs.writeFileSync(path.join(root, 'incidents.md'), '# Incidents\n');
  try {
    // CRITIC has no shell: any Bash call is a reader block.
    for (let i = 0; i < 3; i++) {
      const r = run('critic', 'ls', { root, session: 'sess-F5' });
      assert.strictEqual(r.status, 2, 'reader block ' + (i + 1) + ': ' + r.stderr);
      assert.doesNotMatch(r.stderr, /guard error/, r.stderr);
    }
    const lines = incidentLines(root);
    assert.strictEqual(lines.length, 1, 'the third block escalates once: ' + JSON.stringify(lines));
    assert.match(lines[0], /in one task/, lines[0]);
    assert.doesNotMatch(lines[0], /in one session/, lines[0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.after(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.rmSync(REPO, { recursive: true, force: true });
});
