// Tests for guard.js: each case pipes a hook payload into the script, as Claude Code does,
// and asserts the exit code. Run: node --test .claude/hooks/guard.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');

// A throwaway project root, so blocked calls log to its incidents.md and not to the real one.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
fs.writeFileSync(path.join(ROOT, 'incidents.md'), '# Incidents\n');
const P = (...s) => path.join(ROOT, ...s);

// A clean throwaway git repo with one commit, for rules that read the staged diff.
function ROOT_REPO() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-clean-'));
  const g = (...x) => execFileSync('git', ['-C', repo, ...x], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  g('add', 'a.ts');
  g('commit', '-q', '-m', 'init');
  return repo;
}

function run(role, tool, input, root = ROOT) {
  const payload = typeof input === 'string' ? input : JSON.stringify({ tool_name: tool, tool_input: input, cwd: root });
  const r = spawnSync(process.execPath, [GUARD, role], {
    input: payload,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  last = r.stderr;
  return r.status;
}

let last = '';
// A block must come from a rule, not from the guard failing closed on its own error.
const blocks = (role, tool, input, root) => {
  assert.strictEqual(run(role, tool, input, root), 2, JSON.stringify(input));
  assert.doesNotMatch(last, /guard error/, last);
};
const allows = (role, tool, input, root) => assert.strictEqual(run(role, tool, input, root), 0, JSON.stringify(input));

test('fails closed', () => {
  blocks('nobody', 'Bash', { command: 'ls' });
  assert.strictEqual(run('all', 'Bash', 'not json'), 2);
  assert.strictEqual(run('all', 'Bash', JSON.stringify({ tool_name: 'Bash' })), 2);
});

test('all: git add -A and git add . are blocked', () => {
  for (const c of ['git add -A', 'git add .', 'git add --all', 'git add -- .', 'git -C x add -A', 'git add -Av', 'echo hi && git add .', 'bash -c "git add -A"']) {
    blocks('all', 'Bash', { command: c });
  }
  for (const c of ['git add apps/web/src/a.ts', 'git status', 'git add -u', 'ls -A']) allows('all', 'Bash', { command: c });
});

test('all: a commit message that mentions git add . is not a git add', () => {
  allows('all', 'Bash', { command: "git log --oneline -1 <<'EOF'\ngit add .\nEOF" });
  allows('all', 'Bash', { command: 'echo "git add -A is blocked"' });
});

test('all: force push is blocked, plain push is not', () => {
  for (const c of ['git push --force', 'git push -f', 'git push origin main --force', 'git push origin +main', 'git push --force-with-lease', 'git push -fu origin x']) {
    blocks('all', 'Bash', { command: c });
  }
  for (const c of ['git push', 'git push origin main', 'git push -u origin feature/x']) allows('all', 'Bash', { command: c });
});

test('critic: never reads notes.md', () => {
  blocks('critic', 'Read', { file_path: P('.work', 'feat', 'notes.md') });
  allows('critic', 'Read', { file_path: P('.work', 'feat', 'spec.md') });
  allows('critic', 'Read', { file_path: P('apps', 'web', 'src', 'main.tsx') });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'feat') });
  blocks('critic', 'Grep', { pattern: 'x' });
  blocks('critic', 'Grep', { pattern: 'x', glob: '*.md' });
  allows('critic', 'Grep', { pattern: 'x', glob: '*.ts' });
  allows('critic', 'Grep', { pattern: 'x', type: 'ts' });
  allows('critic', 'Grep', { pattern: 'x', path: P('apps') });
  blocks('critic', 'Bash', { command: 'cat .work/feat/notes.md' });
  blocks('critic', 'Bash', { command: 'cat .work/feat/*' });
  blocks('critic', 'Bash', { command: 'cd .work/feat && cat n*' });
  allows('critic', 'Bash', { command: 'npm run ci' });
});

test('test-engineer: never reads apps/*/src or notes.md, by any tool', () => {
  blocks('test-engineer', 'Read', { file_path: P('apps', 'web', 'src', 'main.tsx') });
  blocks('test-engineer', 'Read', { file_path: P('.work', 'feat', 'notes.md') });
  allows('test-engineer', 'Read', { file_path: P('packages', 'shared', 'src', 'index.ts') });
  allows('test-engineer', 'Read', { file_path: P('apps', 'web', 'tests', 'App.test.tsx') });
  allows('test-engineer', 'Read', { file_path: P('.work', 'feat', 'spec.md') });

  blocks('test-engineer', 'Grep', { pattern: 'x' });
  blocks('test-engineer', 'Grep', { pattern: 'x', path: P('apps', 'web') });
  blocks('test-engineer', 'Grep', { pattern: 'x', path: P('apps', 'server', 'src', 'routes') });
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('apps', 'web', 'tests') });
  allows('test-engineer', 'Grep', { pattern: 'x', path: P('packages', 'shared') });

  blocks('test-engineer', 'Glob', { pattern: '**/*.ts' });
  blocks('test-engineer', 'Glob', { pattern: 'apps/web/src/**/*.tsx' });
  allows('test-engineer', 'Glob', { pattern: 'packages/shared/**/*.ts' });
  allows('test-engineer', 'Glob', { pattern: '**/*.test.tsx', path: P('apps', 'web', 'tests') });

  for (const c of [
    'cat apps/web/src/main.tsx',
    'type apps\\server\\src\\app.ts',
    'cd apps/web && cat src/main.tsx',
    'head -50 C:/x/nestly/apps/server/src/app.ts',
    'git diff',
    'git show HEAD',
    'git log -p',
    'git blame apps/web/tests/x.ts',
    'grep -rn foo .',
    'rg foo',
    'cat .work/feat/notes.md',
  ]) {
    blocks('test-engineer', 'Bash', { command: c });
  }
  for (const c of ['npx vitest run apps/web/tests/App.test.tsx', 'npm test', 'git log --oneline -5', 'cat packages/shared/src/index.ts']) {
    allows('test-engineer', 'Bash', { command: c });
  }
});

test('builder: never writes tests', () => {
  for (const f of [
    P('apps', 'web', 'tests', 'App.test.tsx'),
    P('apps', 'server', 'tests', 'x.ts'),
    P('packages', 'shared', 'tests', 'a.test.ts'),
    P('e2e', 'login.spec.ts'),
    P('supabase', 'tests', 'rls.sql'),
    P('apps', 'web', 'src', 'feed.test.tsx'),
  ]) {
    blocks('builder', 'Write', { file_path: f, content: '' });
    blocks('builder', 'Edit', { file_path: f, old_string: 'a', new_string: 'b' });
  }
  allows('builder', 'Write', { file_path: P('apps', 'web', 'src', 'main.tsx'), content: '' });
  allows('builder', 'Edit', { file_path: P('supabase', 'migrations', '0001.sql'), old_string: 'a', new_string: 'b' });

  for (const c of [
    'echo x > apps/web/tests/a.test.ts',
    'echo x >> e2e/a.spec.ts',
    'rm apps/server/tests/health.test.ts',
    'sed -i s/a/b/ apps/web/tests/App.test.tsx',
    'git checkout -- apps/web/tests',
    'node -e "require(\'fs\').writeFileSync(\'apps/web/tests/x.ts\',\'\')"',
    'npx vitest run -u',
  ]) {
    blocks('builder', 'Bash', { command: c });
  }
  for (const c of ['npm test', 'npx vitest run apps/web/tests/App.test.tsx', 'npm run ci 2>&1 > out.log', 'cat apps/web/tests/App.test.tsx']) {
    allows('builder', 'Bash', { command: c });
  }
});

test('all: commit is blocked when the staged diff holds a secret', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-repo-'));
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');

  fs.writeFileSync(path.join(repo, 'ok.ts'), 'export const a = 1;\n');
  g('add', 'ok.ts');
  allows('all', 'Bash', { command: 'git commit -m ok' }, repo);
  g('commit', '-q', '-m', 'ok');

  const fakeKey = 'sb_' + 'secret_' + 'abcdefghijklmnopqrstuvwxyz';
  fs.writeFileSync(path.join(repo, 'leak.ts'), `export const k = "${fakeKey}";\n`);
  g('add', 'leak.ts');
  blocks('all', 'Bash', { command: 'git commit -m leak' }, repo);
  g('reset', '-q');

  fs.writeFileSync(path.join(repo, 'db.ts'), 'const u = "postgres://user:' + 'hunter2xyz@db.example.com/x";\n');
  g('add', 'db.ts');
  blocks('all', 'Bash', { command: 'git commit -m db' }, repo);
  g('reset', '-q');
  fs.rmSync(path.join(repo, 'db.ts'));

  fs.writeFileSync(path.join(repo, 'doc.md'), 'postgres://user:<password>@host/db\n');
  g('add', 'doc.md');
  allows('all', 'Bash', { command: 'git commit -m doc' }, repo);
  g('reset', '-q');

  fs.writeFileSync(path.join(repo, '.env.local'), 'X=1\n');
  g('add', '-f', '.env.local');
  blocks('all', 'Bash', { command: 'git commit -m env' }, repo);
  g('reset', '-q');

  blocks('all', 'Bash', { command: 'git add leak.ts && git commit -m x' }, repo);
  fs.rmSync(repo, { recursive: true, force: true });
});

// ---- regressions from CRITIC's review of 7.2 ----

test('fails closed on a malformed cwd or command, and on a command too long to check', () => {
  assert.strictEqual(run('all', 'Bash', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git add -A' }, cwd: 5 })), 2);
  assert.strictEqual(run('all', 'Bash', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 5 }, cwd: ROOT })), 2);
  assert.strictEqual(run('critic', 'Bash', { command: 'echo ' + 'x'.repeat(60000) }), 2);
});

test('all: wrappers and variants of git add and force push', () => {
  for (const c of [
    '(git add -A)',
    '(cd x && git push --force)',
    'echo $(git add -A)',
    'eval "git add -A"',
    'powershell -Command "git add -A"',
    'cmd /c git add .',
    'git stage .',
    'git add :',
    "git add ':(glob)**'",
    'git add apps/..',
    'git push --mirror',
    'git push --delete origin main',
    'git push origin :main',
    'git push origin +HEAD:main',
    'git push --force=origin',
    'cat <<<EOF\ngit add -A',
    'echo "<<X"\ngit add -A',
  ]) {
    blocks('all', 'Bash', { command: c });
  }
  allows('all', 'Bash', { command: "git commit -q -F - <<'EOF'\ngit add -A and git push --force in the message\nEOF" }, ROOT_REPO());
});

test('critic: no notes.md through git, shell search or a clever Grep', () => {
  for (const c of [
    'git diff main...HEAD',
    'git log -p -3',
    'git show HEAD',
    'grep -r secret .',
    'grep -rn x .work',
    'rg secret',
    'cat .work/f/{notes,spec}.md',
    'cat .work/f/n"o"tes.md',
    'type .work\\f\\NOTES~1.MD',
    'find . -name "*.md" -exec cat {} +',
  ]) {
    blocks('critic', 'Bash', { command: c });
  }
  for (const c of [
    "git diff main...HEAD -- . ':(exclude).work/*/notes.md'",
    "git log -p -3 -- . ':!.work'",
    'git log --oneline -5',
    'git status',
    'find .work -type f',
    'cat .work/f/spec.md',
  ]) {
    allows('critic', 'Bash', { command: c });
  }
  blocks('critic', 'Grep', { pattern: 'x', glob: '!*.ts' });
  blocks('critic', 'Grep', { pattern: 'x', glob: '*.ts *.md' });
  blocks('critic', 'Grep', { pattern: 'x', glob: '*.ts,*.md' });
  blocks('critic', 'Grep', { pattern: 'x', glob: '*.{ts,md}' });
  blocks('critic', 'Grep', { pattern: 'x', glob: '**/*' });
  blocks('critic', 'Grep', { pattern: 'x', path: P('.work', 'f', 'notes.md'), glob: '*.ts' });
  allows('critic', 'Grep', { pattern: 'x', path: '.work', glob: '*.ts', output_mode: 'content' });
  blocks('critic', 'Read', { file_path: P('.work', 'f', 'Notes.md') });
  blocks('critic', 'Read', { file_path: 'notes.md' });
  allows('critic', 'Grep', { pattern: 'x', glob: '*.{ts,tsx}' });
  allows('critic', 'Grep', { pattern: 'x', glob: '*.ts !*.d.ts' });
});

test('test-engineer: per-app test runs are allowed, implementation stays out of reach', () => {
  for (const c of ['npm test -w apps/web', 'npm run test --workspace=apps/web', 'npx vitest run --root apps/web', 'npx vitest run apps/web']) {
    allows('test-engineer', 'Bash', { command: c });
  }
  for (const c of ['cd apps && cat web/src/a.ts', 'cd apps/web', 'cat apps/server/api/index.ts', 'Get-Content apps\\web\\src\\main.tsx', 'git diff -- apps/web/tests']) {
    blocks('test-engineer', 'Bash', { command: c });
  }
  blocks('test-engineer', 'Read', { file_path: P('apps', 'server', 'api', 'index.ts') });
  blocks('test-engineer', 'Read', { file_path: 'apps\\web\\src\\main.tsx' });
  blocks('test-engineer', 'Read', { file_path: './apps/web/src/main.tsx' });
  blocks('test-engineer', 'Glob', { pattern: '{apps,packages}/**/*.ts' });
  blocks('test-engineer', 'Glob', { pattern: '**/src/**' });
  blocks('test-engineer', 'Grep', { pattern: 'x', path: P('apps', 'web', 'tests', '..', 'src') });
});

test('builder: shell writes into tests, snapshot updates, and legitimate test runs', () => {
  for (const c of [
    'npm test -- -u',
    'npm run test -- --update',
    'npx jest -u',
    'npx playwright test --update-snapshots',
    'cd apps/web/tests && echo x > a.ts',
    'cd apps/web/tests; touch a.ts',
    'echo x 1> apps/web/tests/a.ts',
    'echo x &> apps/web/tests/a.ts',
    'echo x >| apps/web/tests/a.ts',
    'cat > apps/web/tests/a.test.ts <<EOF\nx\nEOF',
    'cp a.ts apps/web/tests/a.ts',
    'curl -o apps/web/tests/a.ts https://example.com',
    'Set-Content apps/web/tests/a.ts x',
  ]) {
    blocks('builder', 'Bash', { command: c });
  }
  for (const c of [
    'node --test tools/eslint-rules/no-cross-feature-import.test.mjs',
    'node --test .claude/hooks/guard.test.js',
    'python -m pytest e2e',
    'git reset apps/web/tests',
    'npm test && git push -u origin feature/x',
  ]) {
    allows('builder', 'Bash', { command: c });
  }
  blocks('builder', 'MultiEdit', { file_path: P('apps', 'web', 'tests', 'a.test.tsx'), edits: [] });
  blocks('builder', 'NotebookEdit', { notebook_path: P('e2e', 'x.ipynb'), new_source: '' });
});

test('all: the secret scan covers pathspec commits, diff headers and more key shapes', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-repo-'));
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  g('config', 'core.autocrlf', 'false');

  // No commits yet: -am falls back to the index rather than failing.
  fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  g('add', 'a.ts');
  allows('all', 'Bash', { command: 'git commit -am first' }, repo);
  g('commit', '-q', '-m', 'first');

  const key = 'sb_' + 'secret_' + 'abcdefghijklmnopqrstuvwxyz';
  fs.writeFileSync(path.join(repo, 'a.ts'), `export const a = "${key}";\n`);
  for (const c of ['git commit -m x a.ts', 'git commit --only -m x a.ts', 'git commit -i -m x a.ts', 'git commit -am x', `git -C ${repo.split(path.sep).join('/')} commit -am x`]) {
    blocks('all', 'Bash', { command: c }, repo);
  }
  fs.writeFileSync(path.join(repo, 'a.ts'), `++${key}\n`);
  g('add', 'a.ts');
  blocks('all', 'Bash', { command: 'git commit -m plusplus' }, repo);
  g('reset', '-q');

  for (const leak of ['AIza' + 'A'.repeat(35), 'sk-' + 'proj-' + 'a'.repeat(40), 'xox' + 'b-' + '1234567890-abc', '-----BEGIN PGP ' + 'PRIVATE KEY BLOCK-----']) {
    fs.writeFileSync(path.join(repo, 'a.ts'), leak + '\n');
    g('add', 'a.ts');
    blocks('all', 'Bash', { command: 'git commit -m leak' }, repo);
    g('reset', '-q');
  }
  fs.writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');

  fs.writeFileSync(path.join(repo, '.env.local.example'), 'X=\n');
  g('add', '.env.local.example');
  allows('all', 'Bash', { command: 'git commit -m example' }, repo);
  g('reset', '-q');
  fs.writeFileSync(path.join(repo, 'doc.md'), 'postgres://postgres:your-super-secret-and-long-postgres-password@db:5432/postgres\n');
  g('add', 'doc.md');
  allows('all', 'Bash', { command: 'git commit -m doc' }, repo);
  g('reset', '-q');
  fs.writeFileSync(path.join(repo, '.envrc'), 'export X=1\n');
  g('add', '-f', '.envrc');
  blocks('all', 'Bash', { command: 'git commit -m envrc' }, repo);
  fs.rmSync(repo, { recursive: true, force: true });
});

// ---- regressions from CRITIC's second pass ----

test('critic: the exclusion must cover notes.md, and every patch-showing git form counts', () => {
  for (const c of [
    "git diff -- ':(exclude).work/x/spec.md'",
    "git diff -- ':!.work/x/spec.md'",
    "git diff -- ':(exclude)notes.md.bak'",
    "git diff -- ':(exclude,glob)*notes.md'",
    'git log --cc',
    'git log --patch-with-stat',
    'git log -3p',
    'git diff-tree -p HEAD',
    'git diff-index -p HEAD',
    'git reflog show -p',
    'git range-diff a...b',
  ]) {
    blocks('critic', 'Bash', { command: c });
  }
  for (const c of [
    "git diff main...HEAD -- . ':(exclude).work'",
    "git diff main...HEAD -- . ':(exclude)*notes.md'",
    "git diff main...HEAD -- . ':(exclude,glob)**/notes.md'",
    "git log -p -- . ':^.work/*'",
    'git log --oneline --stat -5',
  ]) {
    allows('critic', 'Bash', { command: c });
  }
});

test('builder: a redirect glued to its target is still a redirect', () => {
  blocks('builder', 'Bash', { command: 'echo x>apps/web/tests/a.ts' });
  blocks('builder', 'Bash', { command: 'echo x>>e2e/a.spec.ts' });
  allows('builder', 'Bash', { command: 'npm run ci 2>&1' });
  allows('builder', 'Bash', { command: 'node -e "const f = (a) => a"' });
});

test('test-engineer: other spellings of apps/*/src are still implementation', () => {
  for (const c of [
    'cat apps/web/./src/a.ts',
    'cat apps/web//src/a.ts',
    'cat apps/web/tests/../src/a.ts',
    'cd apps/server/tests && cat ../src/a.ts',
    'cat apps/web/s*/a.ts',
    'cat apps/*/s*',
    'cat apps/web/{src,tests}/a.ts',
  ]) {
    blocks('test-engineer', 'Bash', { command: c });
  }
  allows('test-engineer', 'Bash', { command: 'cd apps/web/tests && cat App.test.tsx' });
});

test('all: a commit after cd is scanned in the repo it runs in', () => {
  const repo = ROOT_REPO();
  const key = 'sb_' + 'secret_' + 'abcdefghijklmnopqrstuvwxyz';
  fs.writeFileSync(path.join(repo, 'b.ts'), `export const k = "${key}";\n`);
  execFileSync('git', ['-C', repo, 'add', 'b.ts']);
  // The session runs elsewhere (ROOT is not a repo); the cd target holds the staged secret.
  const at = repo.split(path.sep).join('/');
  blocks('all', 'Bash', { command: `cd ${at} && git commit -m x` });
  // Control: with the secret unstaged the same command passes, so the block above came from
  // scanning the cd target, not from failing closed in a directory that is not a repo.
  execFileSync('git', ['-C', repo, 'reset', '-q']);
  allows('all', 'Bash', { command: `cd ${at} && git commit -m x` });
  fs.rmSync(repo, { recursive: true, force: true });
});

test('the settings hook applies the calling agent\'s rules by agent_type', () => {
  const as = (agent, tool, input) =>
    run('all', tool, JSON.stringify({ tool_name: tool, tool_input: input, cwd: ROOT, agent_type: agent }));
  assert.strictEqual(as('critic', 'Read', { file_path: P('.work', 'f', 'notes.md') }), 2);
  assert.strictEqual(as('test-engineer', 'Read', { file_path: P('apps', 'web', 'src', 'main.tsx') }), 2);
  assert.strictEqual(as('builder', 'Write', { file_path: P('apps', 'web', 'tests', 'a.test.ts'), content: '' }), 2);
  // Another agent, or the main loop, is not held to a role's rules.
  assert.strictEqual(as('scout', 'Read', { file_path: P('apps', 'web', 'src', 'main.tsx') }), 0);
  assert.strictEqual(run('all', 'Read', { file_path: P('.work', 'f', 'notes.md') }), 0);
  assert.strictEqual(as('builder', 'Write', { file_path: P('apps', 'web', 'src', 'a.ts'), content: '' }), 0);
});

test('a block inside a role agent is logged once, by the settings hook', () => {
  const payload = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: P('.work', 'f', 'notes.md') }, cwd: ROOT, agent_type: 'critic' });
  const lines = () => fs.readFileSync(P('incidents.md'), 'utf8').split('\n').filter((l) => l.includes('hook blocked')).length;
  const before = lines();
  assert.strictEqual(run('critic', 'Read', payload), 2); // frontmatter layer: blocks, does not log
  assert.strictEqual(run('all', 'Read', payload), 2); // settings layer: blocks and logs
  assert.strictEqual(lines() - before, 1);
  // Without agent_type the frontmatter layer is the only one that knows the role, so it logs.
  assert.strictEqual(run('critic', 'Read', { file_path: P('.work', 'f', 'notes.md') }), 2);
  assert.strictEqual(lines() - before, 2);
});

test('all: no shell access to .env files or to the production project', () => {
  for (const c of [
    'cat .env.preview',
    'type .env',
    'cat C:/Users/Afik/nestly/.env.preview',
    'node -e "require(\'fs\').readFileSync(\'.env.preview\')"',
    'grep URL .env.local',
    'cp .env.preview /tmp/x',
    'echo x > .env.preview',
    'curl https://cihugbwafnaujsqabgyp.supabase.co/rest/v1/',
    'node tools/db-preview.mjs -e "select 1" # cihugbwafnaujsqabgyp',
    'curl https://wnzwrkgnpvgincottwfm.supabase.co/rest/v1/',
    'echo ncsxugphtawrwotimymp',
  ]) {
    blocks('all', 'Bash', { command: c });
  }
  // A heredoc body is data (a commit message) unless an interpreter reads it as a script.
  allows('all', 'Bash', { command: "git log -1 -F - <<'EOF'\nfill in .env.preview\nEOF" });
  blocks('all', 'Bash', { command: "bash <<'EOF'\ncat .env.preview\nEOF" });
  blocks('all', 'Bash', { command: "node - <<'EOF'\nrequire('fs').readFileSync('.env.preview')\nEOF" });
  for (const c of ['cat .env.example', 'node tools/db-preview.mjs -e "select 1"', 'node tools/db-preview.mjs supabase/tests/t2.sql', 'ls -a', 'echo $NODE_ENV', 'cat src/env.ts']) {
    allows('all', 'Bash', { command: c });
  }
});

test('a block is logged to incidents.md without the command', () => {
  const before = fs.readFileSync(P('incidents.md'), 'utf8');
  blocks('all', 'Bash', { command: 'git add -A # TOPSECRET' });
  const added = fs.readFileSync(P('incidents.md'), 'utf8').slice(before.length);
  assert.match(added, /hook blocked Bash \(all\)/);
  assert.doesNotMatch(added, /TOPSECRET/);
});

test('test-engineer: a shell variable such as $? is not read as a glob that reaches app source', () => {
  for (const c of ['npm run ci; echo x=$?', 'npm test; echo "exit=$?"', 'npx vitest run apps/web/tests; echo $?']) {
    allows('test-engineer', 'Bash', { command: c });
  }
  // A real glob from the root still reaches app source.
  blocks('test-engineer', 'Bash', { command: 'cat **/*.tsx' });
  blocks('test-engineer', 'Bash', { command: 'cat apps/web/s*' });
  // An expansion inside a glob path does not hide it (CRITIC, situation room slice 1): an unset one expands to nothing.
  for (const c of [
    'cat ap*/web/src/a.ts$X',
    'cat */web/src/a.ts$X',
    'cat */*/src/*$X',
    'cat a?ps/w?b/s?c/a.ts${E}',
    'head -n 50 ap[p]s/web/src/main.tsx$Q',
    'cat $(echo apps/web/src/a.ts)',
    'P=apps/web/src/a.ts; cat ${P}',
    'cat apps/web/src/$X',
    // An expansion with an operator: its default or replacement word is what the shell reads (CRITIC re-check).
    'cat ${X:-apps}/web/src/a.ts',
    'cat "${X:-apps}/web/src/a.ts"',
    'cat ${X-apps}/web/src/a.ts',
    'cat ${X:=ap}ps/web/src/a.ts',
    'cat ${X:-a}pps/web/src/a.ts',
    'cat ${X:-*}/web/src/a.ts',
    'cat ${X:-a*}/web/src/a.ts',
    'cat ${HOME/*/ap}ps/web/src/a.ts',
    'cat ${X}ap*/web/src/a.ts',
  ]) {
    blocks('test-engineer', 'Bash', { command: c });
  }
});

// ---- the situation room's Block line (spec .work/situation-room, criteria 18-21) ----

function liveLines(root) {
  const dir = path.join(root, '.live');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean));
}

function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-live-'));
  fs.writeFileSync(path.join(root, 'incidents.md'), '# Incidents\n');
  return root;
}

test('[18] a blocked call writes exactly one Block line, with no command', () => {
  const root = freshRoot();
  const payload = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'git add -A # LIVE-SECRET' },
    cwd: root,
    session_id: 's1',
    tool_use_id: 'tu1',
  });
  assert.strictEqual(run('all', 'Bash', payload, root), 2);
  const blocks = liveLines(root).map((l) => JSON.parse(l)).filter((e) => e.ev === 'Block');
  assert.strictEqual(blocks.length, 1);
  const b = blocks[0];
  assert.strictEqual(b.role, 'all');
  assert.strictEqual(b.tool, 'Bash');
  assert.strictEqual(b.id, 'tu1');
  assert.strictEqual(b.sid, 's1');
  assert.strictEqual(b.who, 'ORCHESTRATOR');
  assert.match(b.reason, /git add -A/);
  assert.strictEqual(b.command, undefined);
  assert.doesNotMatch(liveLines(root).join('\n'), /LIVE-SECRET/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('[19] the logged reason drops a staged file name, an unknown role name and an error message', () => {
  const { scrubReason } = require('./guard.js');
  assert.strictEqual(scrubReason('A .env file is staged (apps/web/.env.local). It must never be committed.'),
    'A .env file is staged. It must never be committed.');
  assert.strictEqual(scrubReason('unknown role "secret-x"'), 'unknown role');
  assert.strictEqual(scrubReason('guard error (ENOENT: C:\\secret\\path)'), 'guard error');
  assert.strictEqual(scrubReason('`git add -A` and `git add .` are blocked.'), '`git add -A` and `git add .` are blocked.');
});

test('[19] a real block whose reason names a staged file logs the reason without the name', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-live-repo-'));
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'incidents.md'), '# Incidents\n');
  fs.writeFileSync(path.join(repo, '.env.local'), 'X=1\n');
  g('add', '-f', '.env.local');
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: repo });
  assert.strictEqual(run('all', 'Bash', payload, repo), 2);
  assert.match(last, /\.env\.local/); // the agent still sees the full reason
  const blocks = liveLines(repo).map((l) => JSON.parse(l)).filter((e) => e.ev === 'Block');
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].reason, 'A .env file is staged. It must never be committed.');
  assert.doesNotMatch(liveLines(repo).join('\n'), /\.env\.local/);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[20] the guard still blocks when the room cannot be written, or its logger is missing', () => {
  // .live is a file, so the log directory cannot be created.
  const root = freshRoot();
  fs.writeFileSync(path.join(root, '.live'), 'not a directory');
  assert.strictEqual(run('all', 'Bash', { command: 'git add -A' }, root), 2);
  assert.match(last, /`git add -A` and `git add \.` are blocked/);
  assert.strictEqual(run('all', 'Bash', { command: 'git status' }, root), 0);
  fs.rmSync(root, { recursive: true, force: true });

  // A copy of the guard with no situation-log.js next to it.
  const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-lone-'));
  fs.copyFileSync(GUARD, path.join(lone, 'guard.js'));
  const r = spawnSync(process.execPath, [path.join(lone, 'guard.js'), 'all'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git add -A' }, cwd: ROOT }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /`git add -A` and `git add \.` are blocked/);
  const ok = spawnSync(process.execPath, [path.join(lone, 'guard.js'), 'all'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: ROOT }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    encoding: 'utf8',
  });
  assert.strictEqual(ok.status, 0);
  fs.rmSync(lone, { recursive: true, force: true });

  // A logger next to the guard that throws on load.
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-broken-'));
  fs.copyFileSync(GUARD, path.join(broken, 'guard.js'));
  fs.writeFileSync(path.join(broken, 'situation-log.js'), "throw new Error('broken logger');\n");
  for (const [command, status] of [['git add -A', 2], ['git status', 0]]) {
    const r2 = spawnSync(process.execPath, [path.join(broken, 'guard.js'), 'all'], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: ROOT }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
      encoding: 'utf8',
    });
    assert.strictEqual(r2.status, status, command);
    if (status === 2) assert.match(r2.stderr, /`git add -A` and `git add \.` are blocked/);
  }
  fs.rmSync(broken, { recursive: true, force: true });
});

test('[21] a block inside a role agent shows once in the room', () => {
  const root = freshRoot();
  const payload = JSON.stringify({
    tool_name: 'Read',
    tool_input: { file_path: path.join(root, '.work', 'f', 'notes.md') },
    cwd: root,
    agent_type: 'critic',
  });
  assert.strictEqual(run('critic', 'Read', payload, root), 2); // frontmatter layer: blocks, stays quiet
  assert.strictEqual(run('all', 'Read', payload, root), 2); // settings layer: blocks and logs
  const blocks = liveLines(root).map((l) => JSON.parse(l)).filter((e) => e.ev === 'Block');
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].who, 'critic');
  fs.rmSync(root, { recursive: true, force: true });
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
