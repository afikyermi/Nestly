// Regression tests for .work/guard-env-paths/bug.md: the guard's env-file rule (R4) judges path arguments and
// redirection targets (plus inline interpreter code), not text that merely mentions the name.
// Written from bug.md only. Each case pipes a hook payload into the script, as Claude Code does.
// Run: node --test .claude/hooks/guard-env.test.js
//
// Test names carry the bug.md section they assert (bug.md has no requirement IDs):
//   [still-blocked]  "Still blocked" bullets   [not-blocked]  "No longer blocked" bullets
//   [pattern-vs-path] the search-command paragraph   [F5] the "in one task" wording
//   [critic-r1]      the four findings of CRITIC round 1 (.work/guard-env-paths/findings.md)
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

function run(role, command, { root = ROOT, session, timeout } = {}) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: root, ...(session !== undefined ? { session_id: session } : {}) });
  const r = spawnSync(process.execPath, [GUARD, role], {
    input: payload,
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
    ...(timeout !== undefined ? { timeout } : {}),
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

// ---------------------------------------------------------------- [critic-r1]
// From .work/guard-env-paths/findings.md; the expected behaviour is its `failure:` and `fix:` lines.

// Finding 1: command substitution inside double quotes is still a command that runs.
stillBlocked('[critic-r1] command substitution inside double quotes', [
  'psql "$(grep DATABASE_URL .env.preview | cut -d= -f2-)"',
  'export URL="$(cat .env.local)"',
  'echo "`cat .env`"',
  'echo "$(< .env)"',
]);

// Finding 2: a script handed to a shell or interpreter in a form other than the five exact ones.
stillBlocked('[critic-r1] shell -c behind other options', [
  'bash -lc "cat .env"',
  "sh -ec 'source .env.preview && echo ok'",
  'bash -e -c "cat .env"',
  'bash --login -c "cat .env"',
  'zsh -ic "cat .env"',
]);

stillBlocked('[critic-r1] powershell script without -Command', [
  'powershell "Get-Content .env"',
  'powershell -NoProfile "gc .env"',
]);

stillBlocked('[critic-r1] cmd with other switches before /c', [
  'cmd /s /c "type .env"',
  'cmd /d /c "type .env"',
]);

stillBlocked('[critic-r1] script piped into a bare interpreter', [
  `echo "require('fs').readFileSync('.env.preview','utf8')" | node`,
]);

// Findings 1 and 4 (the `fix:` lines): the tighter rules must not block plain text, nor brace-heavy code that
// names no env file.
notBlocked('[critic-r1] text in double quotes that is not a command', ['echo "the .env file"']);

notBlocked('[critic-r1] inline code with ten or more "{" that names no env file', [
  `node -e 'const a={x:1,y:{z:2}}; const b={p:{q:{r:{s:4}}}}; console.log(\`\${a.x}\${b.p.q.r.s}\`, {m:1}, {n:2}, {o:3})'`,
  'node -e "const a={x:{y:{z:{w:{v:{u:1}}}}}}; const b={c:1}; const d={e:2}; const f={g:3}; const h={i:4}; console.log(a,b,d,f,h)"',
]);

// Finding 3: brace expansion in quoted text must not stall or exhaust the hook; the command after it is still judged.
test('[critic-r1] a quoted word of 8 brace groups x 20 alternatives, then "; cat .env", is blocked within 10 s', { timeout: 10000 }, () => {
  const group = '{' + Array.from({ length: 20 }, (_, i) => String.fromCharCode(97 + i)).join(',') + '}';
  const command = `echo '${group.repeat(8)}'; cat .env`;
  const before = incidentLines(ROOT).length;
  const r = run('all', command, { timeout: 9000 });
  assert.strictEqual(r.status, 2, 'expected a block (null means the guard was killed by the timeout or crashed): ' + r.stderr);
  assert.doesNotMatch(r.stderr, /guard error/, 'the block must come from the env rule, not from the guard failing: ' + r.stderr);
  assert.match(r.stderr, /\.env files/i, 'the reason names .env files: ' + r.stderr);
  assert.strictEqual(incidentLines(ROOT).length - before, 1, 'an env-file block is r4-critical: one incidents.md line');
});

// ---------------------------------------------------------------- [jq-program]
// decisions/2026-10.md, "Speed-up", change (6): a jq program is text, not a path. Every other word is still checked;
// inside a command substitution the exemption does not apply.

notBlocked('[jq-program] a jq program is text', [
  "gh api repos/x --jq '.[]'",
  "gh run list -q '.[].x'",
  'gh api x --jq=.[].a',
  "jq '.[] | .x' file.json",
  "jq -r --arg a b '.[]' f.json",
  "jq -- '.[]' f",
  'gh api x --jq .e*',
]);

stillBlocked('[jq-program] every other word is still checked', [
  'jq . .env',
  'jq -f .env x',
  'jq --from-file .env x',
  'jq -f.env x',
  'cat .env | jq .',
  'gh api --input .env',
  "gh api x --jq '.[]' --input .env",
  "echo $(jq '.[]' f)",
  "echo `jq '.[]' f`",
  "jq '.x' .e*",
  "jq .x .[e]nv",
  "jq --arg a .env '.[]' f",
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
