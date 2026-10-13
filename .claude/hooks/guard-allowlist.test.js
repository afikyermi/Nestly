// Regression tests for .work/guard-allowlist/bug.md: the guard's protected-file rules are an
// allowlist (allow only a known form, block the rest), not a list of forbidden spellings.
// Test names carry the bug.md line IDs (A.1 ... F.15). Every case runs under forced win32, linux and
// darwin through the force-platform.js preload (F.15). Run: node --test .claude/hooks/guard-allowlist.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');
const PRELOAD = path.join(__dirname, 'force-platform.js');

// A throwaway project root, so blocked calls log to its incidents.md and not to the real one.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-allowlist-'));
const at = (...s) => path.join(ROOT, ...s);
const put = (rel, body = 'x\n') => {
  fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
  fs.writeFileSync(at(rel), body);
};
fs.writeFileSync(at('incidents.md'), '# Incidents\n');
put('.work/f/notes.md');
put('.work/f/spec.md');
put('apps/web/src/a.ts');
put('apps/web/tests/a.test.ts');
put('apps/server/src/a.ts');
put('apps/server/tests/a.test.ts');
put('docs/a.md');
put('docs/a.txt');
put('a.md');
put('packages/x/src/i.ts');
// Symlinks, as `ln -s <target> <name>` run at the root would create them.
fs.symlinkSync('.work/f', at('link'));
fs.symlinkSync('.work', at('lnkwork'));
fs.symlinkSync('.work/f/notes.md', at('lnotes'));
fs.symlinkSync('.work/f/spec.md', at('lspec'));
fs.symlinkSync('apps/web/src', at('lsrc'));
fs.symlinkSync('apps/web/src/a.ts', at('lsrcfile'));
fs.symlinkSync('apps/web/tests', at('ltests'));

function run(platform, role, tool, input, { cwd = ROOT, agent_type } = {}) {
  const payload = { tool_name: tool, tool_input: input, cwd };
  if (agent_type) payload.agent_type = agent_type;
  const r = spawnSync(process.execPath, ['--require', PRELOAD, GUARD, role], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, FORCE_PLATFORM: platform },
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

// Collects every miss in a test, so one failing case does not hide the others.
function checker(platform) {
  const misses = [];
  const bash = (role, command, opts) => run(platform, role, 'Bash', { command }, opts);
  const c = {
    misses,
    blocks(role, tool, input, opts) {
      const r = run(platform, role, tool, input, opts);
      const what = `${role} ${tool} ${JSON.stringify(input)}${opts && opts.cwd ? ' @' + path.relative(ROOT, opts.cwd) : ''}`;
      if (r.status !== 2) misses.push(`should be blocked: ${what}`);
      else if (/guard error/.test(r.stderr)) misses.push(`blocked by "guard error", not a rule: ${what}`);
      else if (!r.stderr.trim()) misses.push(`blocked with an empty reason: ${what}`);
    },
    allows(role, tool, input, opts) {
      const r = run(platform, role, tool, input, opts);
      if (r.status !== 0) {
        misses.push(`should be allowed: ${role} ${tool} ${JSON.stringify(input)} -> ${r.status} ${r.stderr.trim().slice(0, 160)}`);
      }
    },
    bashBlocks: (role, cmd, opts) => c.blocks(role, 'Bash', { command: cmd }, opts),
    bashAllows: (role, cmd, opts) => c.allows(role, 'Bash', { command: cmd }, opts),
    reasonMatches(role, cmd, re) {
      const r = bash(role, cmd);
      if (r.status === 2 && !re.test(r.stderr)) misses.push(`reason for ${role} ${JSON.stringify(cmd)} does not match ${re}: ${r.stderr.trim().slice(0, 200)}`);
    },
    done() {
      assert.strictEqual(misses.length, 0, '\n' + misses.join('\n'));
    },
  };
  return c;
}

const ROLES = ['critic', 'test-engineer'];
const EXCL = "':(exclude).work/*/notes.md'";

for (const platform of ['win32', 'linux', 'darwin']) {
  const t = (name, fn) =>
    test(`${name} [${platform}]`, () => {
      const c = checker(platform);
      fn(c);
      c.done();
    });

  // ---- A. Shell expansion ----

  t('A.1 an expansion or substitution outside single quotes is blocked, inside single quotes it stays allowed', (c) => {
    for (const role of ROLES) {
      for (const cmd of ['echo $HOME', 'echo ${HOME}', 'echo $(date)', 'echo `date`', 'echo "$HOME"', 'echo "x $(date) y"', 'echo "${X:-a}"']) {
        c.bashBlocks(role, cmd);
      }
      c.bashAllows(role, "echo '{print $1}'");
      c.bashAllows(role, "echo 'costs $5 and ${x} and $(y) and `z`'");
      // A heredoc body that is data is not judged by the expansion rule.
      c.bashAllows(role, "cat <<'EOF' > out.txt\nmessage with $HOME and $(date) and `x`\nEOF");
    }
    c.bashAllows('critic', "git log --format='%H %s'");
    c.bashAllows('test-engineer', "git commit -m 'fix $HOME handling'");
  });

  t('A.1 the settings hook (role all + agent_type) applies the same expansion rule', (c) => {
    for (const agent_type of ROLES) {
      c.blocks('all', 'Bash', { command: 'echo $HOME' }, { agent_type });
      c.blocks('all', 'Bash', { command: 'echo `date`' }, { agent_type });
      c.allows('all', 'Bash', { command: "echo '{print $1}'" }, { agent_type });
    }
  });

  t('A.2 special parameters that cannot name a path are exempt', (c) => {
    for (const role of ROLES) {
      c.bashAllows(role, 'npm run ci; echo "exit=$?"');
      c.bashAllows(role, 'echo x=$?');
      c.bashAllows(role, 'echo $? $# $$ $! $0 $1 $5 $9 $- $@ $*');
      c.bashAllows(role, 'echo "$?" "$#" "$$" "$!" "$0" "$9" "$-" "$@" "$*"');
    }
  });

  t('A.3 required blocks: expansions that build a protected path', (c) => {
    for (const cmd of [
      'X=a; cat ${X}pps/web/src/a.ts',
      'cat "$X"pps/web/src/a.ts',
      'cat $(printf apps)/web/src/a.ts',
    ]) c.bashBlocks('test-engineer', cmd);
    for (const cmd of [
      'cat $(echo .work)/f/notes.md',
      'cat `echo .wo`rk/f/x',
      'N=notes; cat .work/f/$N.md',
      'git $x diff main',
    ]) c.bashBlocks('critic', cmd);
  });

  // ---- B. Wildcards and paths (CRITIC) ----

  t('B.4 a wildcard is allowed only from a directory outside .work and below the project root', (c) => {
    for (const cmd of [
      'cat .w*/*/n*',
      'cat .wor[k]/f/n*',
      'cat */f/notes*',
      'cat apps/../.w*/f/x',
      'cat .work/f/{a,b}.md',
      'ls *.md',
      'ls ?.md',
      'ls [a].md',
      'ls {a,b}.md',
      'cat lnkwork/f/n*',
    ]) c.bashBlocks('critic', cmd);
    // Resolved against where the command runs: a directory above the root is as bad as the root.
    c.bashBlocks('critic', 'cd .. && ls *');
    c.bashBlocks('critic', 'cat ../*.md');
    c.blocks('critic', 'Bash', { command: 'ls *.md' }, { cwd: ROOT });
    for (const cmd of ['ls docs/*.md', 'cat apps/web/src/*.ts', 'ls packages/*/src']) c.bashAllows('critic', cmd);
    // ...and a wildcard whose directory is below the root is fine when the command runs there.
    c.bashAllows('critic', 'cd docs && ls *.md');
    c.allows('critic', 'Bash', { command: 'ls *.md' }, { cwd: at('docs') });
    c.blocks('critic', 'Bash', { command: 'ls *' }, { cwd: at('.work') });
    c.blocks('critic', 'Bash', { command: 'ls *' }, { cwd: at('.work', 'f') });
  });

  t('B.5 a literal path that resolves to notes.md (any case, through .. or a symlink) is blocked', (c) => {
    for (const cmd of [
      'cat link/NOTES.md',
      'cat link/notes.md',
      'head link/n*',
      'cat lnotes',
      'cat .work/f/../f/notes.md',
      'cat apps/../.work/f/NOTES.md',
      'cat docs/../.WORK/f/Notes.md',
      'cat notes.md',
    ]) c.bashBlocks('critic', cmd);
    for (const cmd of ['cat .work/f/spec.md', 'cat docs/a.md', 'cat lspec']) c.bashAllows('critic', cmd);
  });

  t('B.6 cd into .work, in any case, or into a symlink that resolves there, is blocked', (c) => {
    for (const cmd of [
      'cd .work',
      'cd .WORK',
      'cd .Work/f && ls',
      'cd .work/f && cat spec.md',
      'cd lnkwork && ls',
      'cd link && ls',
      'cd docs/../.work',
      'pushd .work',
      'chdir .work',
      'Set-Location .work',
      'sl .work',
    ]) c.bashBlocks('critic', cmd);
    c.bashAllows('critic', 'cd docs && ls');
    c.bashAllows('critic', 'cd apps/web && ls');
  });

  // ---- C. git reads that show file content (CRITIC) ----

  t('C.7 the fixed form: only diff/log/show, at the root, plain pathspecs, exactly one exclusion from the set', (c) => {
    // The allowed form.
    for (const cmd of [
      `git diff main...HEAD -- . ${EXCL}`,
      "git diff main...HEAD -- . ':!.work/*/notes.md'",
      "git diff main...HEAD -- . ':^.work/*/notes.md'",
      "git diff main...HEAD -- . ':(exclude).work'",
      `git log -p main..HEAD -- . ${EXCL}`,
      `git show HEAD --stat -- . ${EXCL}`,
      `git diff 1a2b3c4d..HEAD -- . ${EXCL}`,
      `git diff HEAD~2 -- . ${EXCL}`,
      `git diff HEAD^ -- . ${EXCL}`,
      `git diff main -U5 -- . ${EXCL}`,
      `git diff --unified=5 --no-color -w main -- . ${EXCL}`,
      `git diff --stat --name-status main -- . ${EXCL}`,
      `git log -n 3 --oneline --patch -- . ${EXCL}`,
      `git log -p --format=%H -- . ${EXCL}`,
      `git diff main -- apps docs ${EXCL}`,
    ]) c.bashAllows('critic', cmd);

    // Wrong subcommand, wrong place, global options, GIT_ variables.
    for (const sub of ['blame apps/web/src/a.ts', 'grep foo', 'cat-file -p HEAD', 'archive HEAD', 'format-patch main', 'difftool main', 'range-diff a...b', 'diff-tree -p HEAD', 'diff-index -p HEAD', 'diff-files -p', 'whatchanged -p', 'stash show -p', 'reflog show -p', 'frobnicate']) {
      c.bashBlocks('critic', `git ${sub}`);
      c.bashBlocks('critic', `git ${sub} -- . ${EXCL}`);
    }
    c.blocks('critic', 'Bash', { command: `git diff main -- . ${EXCL}` }, { cwd: at('apps') });
    c.blocks('critic', 'Bash', { command: `git diff main -- . ${EXCL}` }, { cwd: at('docs') });
    c.bashBlocks('critic', `cd docs && git diff main -- . ${EXCL}`);
    for (const g of ['-C docs', '-c core.pager=x', '--git-dir=.git', '--work-tree=.', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--literal-pathspecs', '--no-pager']) {
      c.bashBlocks('critic', `git ${g} diff main -- . ${EXCL}`);
    }
    for (const v of ['GIT_DIR=.git', 'GIT_WORK_TREE=.', 'GIT_LITERAL_PATHSPECS=1', 'GIT_EXTERNAL_DIFF=x']) {
      c.bashBlocks('critic', `${v} git diff main -- . ${EXCL}`);
      c.bashBlocks('critic', `export ${v}; git diff main -- . ${EXCL}`);
      c.bashBlocks('critic', `git diff main -- . ${EXCL}; echo ${v}`);
    }

    // Revisions.
    for (const rev of ['HEAD:apps/web/src/a.ts', 'main:.work/f/notes.md', 'HEAD^{tree}', '1a2b3c4d', 'abcdef0123456789', '@{1}', 'HEAD@{1}', '-']) {
      c.bashBlocks('critic', `git diff ${rev} -- . ${EXCL}`);
      c.bashBlocks('critic', `git show ${rev} -- . ${EXCL}`);
    }
    c.bashBlocks('critic', `git diff --no-index docs/a.md docs/a.txt -- . ${EXCL}`);

    // Options outside the display list.
    for (const o of ['--output=out.txt', '--output out.txt', '--ext-diff', '--textconv', '--no-index', '--follow', '-L1,2:apps/web/src/a.ts', '-L 1,2:x', '--cc', '--no-pager', '--exec-path']) {
      c.bashBlocks('critic', `git log -p ${o} main -- . ${EXCL}`);
      c.bashBlocks('critic', `git diff ${o} main -- . ${EXCL}`);
    }

    // The separator, the pathspecs and the exclusion.
    for (const cmd of [
      'git diff main...HEAD',
      'git diff main...HEAD -- .',
      'git log -p -n 3',
      'git show HEAD',
      'git diff main -- :/',
      `git diff main -- :/ ${EXCL}`,
      `git diff main -- ':(top)' ${EXCL}`,
      `git diff main -- ':(glob)**' ${EXCL}`,
      `git diff main -- . ${EXCL} ${EXCL}`,
      `git diff main -- . ${EXCL} ':(exclude).work'`,
      "git diff main -- . ':(exclude).work/x/spec.md'",
      "git diff main -- . ':(exclude)notes.md.bak'",
      "git diff main -- . ':(exclude).WORK/*/notes.md'",
      "git diff main -- . ':(exclude).work/*/NOTES.md'",
      "git diff main -- . ':(exclude)*notes.md'",
      "git diff main -- . ':(exclude,glob)**/notes.md'",
      "git diff main -- . ':!.work'",
      "git diff main -- . ':^.work/*'",
      `git diff main ${EXCL}`,
      `git diff main . ${EXCL}`,
    ]) c.bashBlocks('critic', cmd);
  });

  t('C.7 a blocked git call names what was wrong (the missing exclusion)', (c) => {
    c.reasonMatches('critic', 'git diff main...HEAD', /exclude/);
    c.reasonMatches('critic', 'git diff main...HEAD', /notes\.md/);
  });

  t('C.8 required blocks from debt.md', (c) => {
    for (const cmd of [
      "cd apps && git diff main~1 -- :/ ':(exclude).work'",
      "git -C apps diff main -- . ':(exclude).work'",
      "git diff main -- . ':(exclude,literal).work/*/notes.md'",
      "git diff main -- . ':(exclude,attr:x).work'",
      "git --literal-pathspecs diff main -- . ':(exclude).work/*/notes.md'",
      "GIT_LITERAL_PATHSPECS=1 git diff main -- . ':(exclude).work/*/notes.md'",
      "git --glob-pathspecs diff main -- . ':(exclude)*notes.md'",
      'git show HEAD:.work/f/x.md',
      'git show 1a2b3c4d',
      'git cat-file -p HEAD:.work/f/x.md',
      'git grep foo',
      'git blame apps/web/src/a.ts',
    ]) c.bashBlocks('critic', cmd);
  });

  t('C.9 required allows: the canonical forms and git calls that show no content', (c) => {
    for (const cmd of [
      `git diff main...HEAD -- . ${EXCL}`,
      `git log -p main..HEAD -- . ${EXCL}`,
      "git show HEAD --stat -- . ':(exclude).work'",
      'git diff --name-only main',
      'git status',
      'git log --oneline -5',
      'git branch -a',
      'git ls-files',
    ]) c.bashAllows('critic', cmd);
  });

  // ---- D. TEST ENGINEER: false blocks to remove, true blocks that stay ----

  t('D.10 required allows for test-engineer', (c) => {
    c.bashAllows('test-engineer', 'npm run ci 2>&1 | tail -40; echo "exit=$?"');
    c.bashAllows('test-engineer', `cd ${ROOT} && npm run ci | tail; echo $?`);
    c.bashAllows('test-engineer', `cd ${ROOT.split(path.sep).join('/')} && npm run ci | tail; echo $?`);
    c.bashAllows('test-engineer', 'npm test --prefix apps/web');
    c.bashAllows('test-engineer', 'ls apps/*/tests');
    c.bashAllows('test-engineer', 'ls apps/web/tests/*.test.ts');
    c.bashAllows('test-engineer', 'git commit -m "tests for apps/web/src/a.ts"');
    c.bashAllows('test-engineer', 'git add apps/web/tests/a.test.ts && git status');
  });

  t('D.11 required blocks stay for test-engineer: implementation, globs into it, every git content read, every A.3 case', (c) => {
    for (const cmd of [
      'cat apps/web/src/a.ts',
      'cd apps/web && cat src/a.ts',
      'cd apps/web && cat s*/a.ts',
      'ls apps/*/s*',
      'ls apps/web/*',
      `node -e "require('fs').readFileSync('apps/web/src/a.ts')"`,
      'cat apps/server/api/index.ts',
      'cat apps/web/tests/../src/a.ts',
      'cat lsrc/a.ts',
      'cat lsrcfile',
      // every git content read
      'git diff main',
      'git diff main...HEAD',
      `git diff main...HEAD -- . ${EXCL}`,
      `git log -p main..HEAD -- . ${EXCL}`,
      'git show HEAD',
      'git show HEAD:apps/web/src/a.ts',
      'git log -p',
      'git blame apps/web/tests/a.test.ts',
      'git grep foo',
      'git cat-file -p HEAD:apps/web/src/a.ts',
      'git archive HEAD',
      "git diff main -- apps/web/tests ':(exclude).work'",
      // every A.3 case
      'X=a; cat ${X}pps/web/src/a.ts',
      'cat "$X"pps/web/src/a.ts',
      'cat $(printf apps)/web/src/a.ts',
    ]) c.bashBlocks('test-engineer', cmd);
    // content-free git stays allowed
    c.bashAllows('test-engineer', 'git status');
    c.bashAllows('test-engineer', 'git log --oneline -5');
  });

  // ---- E. Read, Grep, Glob ----

  t('E.12 Read of a symlink whose target is notes.md (critic) or app implementation (test-engineer) is blocked', (c) => {
    c.blocks('critic', 'Read', { file_path: at('lnotes') });
    c.blocks('critic', 'Read', { file_path: at('link', 'notes.md') });
    c.blocks('critic', 'Read', { file_path: at('link', 'NOTES.md') });
    c.allows('critic', 'Read', { file_path: at('lspec') });
    c.allows('critic', 'Read', { file_path: at('link', 'spec.md') });
    c.blocks('test-engineer', 'Read', { file_path: at('lsrcfile') });
    c.blocks('test-engineer', 'Read', { file_path: at('lsrc', 'a.ts') });
    c.allows('test-engineer', 'Read', { file_path: at('ltests', 'a.test.ts') });
    c.allows('test-engineer', 'Read', { file_path: at('lspec') });
    // The notes rule holds for test-engineer through a symlink too.
    c.blocks('test-engineer', 'Read', { file_path: at('lnotes') });
  });

  t('E.13 Grep with a path that is a symlink into .work (critic) or app implementation (test-engineer) is judged as the target', (c) => {
    c.blocks('critic', 'Grep', { pattern: 'x', path: at('lnkwork') });
    c.blocks('critic', 'Grep', { pattern: 'x', path: at('link') });
    c.blocks('critic', 'Grep', { pattern: 'x', path: at('lnotes') });
    c.blocks('test-engineer', 'Grep', { pattern: 'x', path: at('lsrc') });
    c.blocks('test-engineer', 'Grep', { pattern: 'x', path: at('lsrcfile') });
    c.allows('test-engineer', 'Grep', { pattern: 'x', path: at('ltests') });
    // Same results as before for direct paths.
    c.blocks('critic', 'Grep', { pattern: 'x', path: at('.work') });
    c.allows('critic', 'Grep', { pattern: 'x', path: at('apps') });
    c.blocks('test-engineer', 'Grep', { pattern: 'x', path: at('apps', 'web') });
    c.allows('test-engineer', 'Grep', { pattern: 'x', path: at('apps', 'web', 'tests') });
    c.blocks('test-engineer', 'Glob', { pattern: '**/*.ts' });
    c.allows('test-engineer', 'Glob', { pattern: 'packages/shared/**/*.ts' });
  });

  // ---- G. Addendum 2: the command name is the allowlist key ----

  t('G.16 findings 1-3: inline code, nested shells and recursive grep reach the protected file and are blocked', (c) => {
    const crit = [
      `node -e "console.log(require('fs').readFileSync('.wo'+'rk/f/no'+'tes.md','utf8'))"`,
      `python3 -c "print(open('.wo'+'rk/f/no'+'tes.md').read())"`,
      `awk 'BEGIN{while((getline l < (".wo" "rk/f/no" "tes.md"))>0) print l}'`,
      `grep -d recurse '' .work/f`,
      `grep --directories=recurse '' .work`,
      `grep -drecurse '' .work`,
      `bash -lc 'cat .wo""rk/f/no""tes.md'`,
      `sh -ec 'cat .wo""rk/f/no""tes.md'`,
      `bash --norc -c 'cat .wo""rk/f/no""tes.md'`,
      `zsh -c 'cat .wo""rk/f/no""tes.md'`,
    ];
    const te = [
      `node -e "console.log(require('fs').readFileSync('apps/web/sr'+'c/a.ts','utf8'))"`,
      `python3 -c "print(open('apps/web/sr'+'c/a.ts').read())"`,
      `awk 'BEGIN{while((getline l < ("apps/web/sr" "c/a.ts"))>0) print l}'`,
      `grep -d recurse '' apps/web`,
      `grep --directories=recurse '' apps/web`,
      `bash -lc 'cat apps/web/s""rc/a.ts'`,
      `sh -ec 'cat apps/web/s""rc/a.ts'`,
      `bash --norc -c 'cat apps/web/s""rc/a.ts'`,
      `zsh -c 'cat apps/web/s""rc/a.ts'`,
    ];
    for (const cmd of crit) c.bashBlocks('critic', cmd);
    for (const cmd of te) c.bashBlocks('test-engineer', cmd);
    // The same through the settings hook (role all + agent_type).
    for (const cmd of crit) c.blocks('all', 'Bash', { command: cmd }, { agent_type: 'critic' });
    for (const cmd of te) c.blocks('all', 'Bash', { command: cmd }, { agent_type: 'test-engineer' });
    // After a separator or in a pipeline, the segment is judged too.
    for (const role of ROLES) {
      c.bashBlocks(role, `ls docs && node -e "1"`);
      c.bashBlocks(role, `echo x | bash -c 'cat y'`);
      c.bashBlocks(role, `echo x; awk 'BEGIN{}'`);
    }
  });

  t('G.16 finding 3: git fetch/push options and remotes that run a command are blocked', (c) => {
    for (const role of ROLES) {
      for (const cmd of [
        `git fetch --upload-pack='cat .wo""rk/f/no""tes.md >&2; false' .`,
        `git fetch --upload-pack=x origin`,
        `git fetch --upload-pack x origin`,
        `git push --receive-pack=x origin main`,
        `git push --receive-pack x origin main`,
        `git push --exec=x origin main`,
        `git fetch -u x origin`,
        `git fetch ext::sh`,
        `git fetch ext::'sh -c "cat x"'`,
        `git push fd::3 main`,
        `git ls-remote --upload-pack=x origin`,
        `git pull --upload-pack=x origin`,
        `git clone --upload-pack=x origin d`,
      ]) c.bashBlocks(role, cmd);
    }
    // Without the dangerous option the same fetch and push stay allowed.
    for (const role of ROLES) {
      c.bashAllows(role, 'git fetch origin');
      c.bashAllows(role, 'git push origin main');
    }
  });

  t('G.16 a command outside the list is blocked, and the message names the list', (c) => {
    for (const role of ROLES) {
      for (const cmd of [
        `sed -n '1e cat x' f`,
        `sed -n '1w out' f`,
        `sed -n '1r f' f`,
        `sed -n '1R f' f`,
        `sed -n '1W out' f`,
        `sed -i 's/a/b/' f`,
        `sed -n -i '1p' f`,
        `sed 's/a/b/e' f`,
        `sed 's/a/b/' f`,
        `sed -n 's/a/b/p' f`,
        'find . -exec cat {} \\;',
        'find docs -execdir cat {} \\;',
        'find docs -ok cat {} \\;',
        'find docs -okdir cat {} \\;',
        'find docs -delete',
        'find docs -fprint out',
        'find docs -fprintf out x',
        'find docs -fls out',
        'npx cowsay hi',
        'npx some-package',
        'npm exec cat x',
        'env cat x',
        'xargs cat',
        'echo x | xargs cat',
        'timeout 5 cat x',
        `awk '{print}' docs/a.txt`,
        `python3 -c "print(1)"`,
        'python script.py',
        `perl -e 'print 1'`,
        `ruby -e 'puts 1'`,
        'deno eval "1"',
        'bun -e "1"',
        'node -p "1"',
        'node --eval "1"',
        'node --print "1"',
        'node -r ./x.js y.js',
        'node --require ./x.js y.js',
        'node --import ./x.mjs y.js',
        'node - < docs/a.txt',
        'node',
        'bash -lc "ls"',
        'sh -ec "ls"',
        'zsh -c "ls"',
        'bash script.sh',
        'eval ls',
        'source x',
        '. x',
        'grep -r foo docs',
        'grep -R foo docs',
        'grep --recursive foo docs',
        'grep -rn foo docs',
        'grep -f pats docs/a.md',
        'git fetch --upload-pack=x origin',
        'git push --receive-pack=x origin main',
        'git fetch ext::sh',
      ]) c.bashBlocks(role, cmd);
    }
    // The block names the list (the reason is not just "blocked").
    for (const cmd of ['awk 1 docs/a.txt', 'env cat x', 'xargs cat', 'timeout 5 cat x', 'source x']) {
      for (const role of ROLES) c.reasonMatches(role, cmd, /allow|list/i);
    }
  });

  t('G.16 the allowed command list: each listed form is allowed', (c) => {
    for (const role of ROLES) {
      for (const cmd of [
        'cat docs/a.md',
        'head -5 docs/a.md',
        'tail -n 3 docs/a.md',
        'wc -l docs/a.md',
        'ls docs',
        'ls -la docs',
        'diff docs/a.md docs/a.txt',
        'sort docs/a.txt',
        'sort docs/a.txt | uniq',
        'cut -d, -f1 docs/a.txt',
        'tr a b < docs/a.txt',
        'echo hello',
        "printf '%s\\n' hello",
        'pwd',
        'true',
        'false',
        'test -f docs/a.md',
        '[ -f docs/a.md ]',
        'jq . docs/a.txt',
        'mktemp',
        'mkdir -p docs/newdir',
        'cd docs',
        'cd docs && ls',
        `sed -n '1,20p' docs/a.md`,
        `sed -n '5p' docs/a.md`,
        `sed -n -e '1,3p' docs/a.md`,
        `grep foo docs/a.md`,
        `grep -n -i foo docs/a.md docs/a.txt`,
        `grep -c foo docs/a.md`,
        `find docs -name '*.md'`,
        `find docs -type f -name '*.txt'`,
        'npm test',
        'npm t',
        'npm ci',
        'npm install',
        'npm run ci',
        'npm run build',
        'npm run ci --prefix apps/web',
        'npm test --prefix apps/web',
        'npm ls',
        'npx vitest run',
        'npx vitest run --root apps/web',
        'npx playwright test',
        'npx tsc --noEmit',
        'npx eslint docs',
        'node --test .claude/hooks/x.test.js',
        'node --test a.test.js b.test.js',
        'node tools/some-script.mjs --flag value',
        'node ./script.js arg',
        'git status',
        'git log --oneline -5',
        'git branch -a',
        'git ls-files',
        'git add docs/a.md',
        'git commit -m "msg"',
        'npm run ci 2>&1 | tail -40',
      ]) c.bashAllows(role, cmd);
    }
    // The same forms through the settings hook.
    for (const agent_type of ROLES) {
      c.allows('all', 'Bash', { command: `sed -n '1,20p' docs/a.md` }, { agent_type });
      c.allows('all', 'Bash', { command: 'npx vitest run' }, { agent_type });
      c.blocks('all', 'Bash', { command: 'env cat x' }, { agent_type });
      c.blocks('all', 'Bash', { command: `awk 1 docs/a.txt` }, { agent_type });
    }
  });

  t('G.17 test-engineer: the app-implementation check ignores case on every platform', (c) => {
    for (const cmd of [
      'cat APPS/web/src/a.ts',
      'cat apps/web/SRC/a.ts',
      'cat Apps/Web/Src/a.ts',
      'cat apps/WEB/src/a.ts',
      'cat apps/server/API/index.ts',
      'cd APPS/web && cat src/a.ts',
      'cd apps/web && cat SRC/a.ts',
      'cat APPS/web/s*/a.ts',
      'cat apps/web/Sr*',
    ]) c.bashBlocks('test-engineer', cmd);
    c.blocks('test-engineer', 'Read', { file_path: at('APPS', 'web', 'src', 'a.ts') });
    c.blocks('test-engineer', 'Read', { file_path: at('apps', 'web', 'SRC', 'a.ts') });
    c.blocks('test-engineer', 'Grep', { pattern: 'x', path: at('APPS', 'web') });
    c.blocks('test-engineer', 'Grep', { pattern: 'x', path: at('apps', 'web', 'SRC') });
    c.blocks('test-engineer', 'Glob', { pattern: 'APPS/web/SRC/**/*.ts' });
    // The allowed side is untouched.
    c.bashAllows('test-engineer', 'cat packages/x/src/i.ts');
    c.bashAllows('test-engineer', 'cat apps/web/tests/a.test.ts');
    c.allows('test-engineer', 'Read', { file_path: at('apps', 'web', 'tests', 'a.test.ts') });
  });

  t('G.18 a content-free git call is judged before the global-option / GIT_ ban', (c) => {
    const tmp = path.join(os.tmpdir(), 'x.txt').split(path.sep).join('/');
    for (const role of ROLES) {
      for (const cmd of [
        'git --no-pager log --oneline -5',
        `git -C ${ROOT.split(path.sep).join('/')} status`,
        "git commit -m 'tests: digit_input boundary'",
        'git add apps/web/tests/digit_input.test.ts',
        "git commit -m 'review: legit_flag naming'",
        "git commit -m 'document GIT_DIR handling'",
        'git status 2>&1',
        'git log --oneline -5 2>&1',
        'git diff --stat main...HEAD 2>&1',
        `git diff --name-only main...HEAD > ${tmp}`,
        'git diff --name-only main...HEAD 2>/dev/null',
        'git diff --stat=200 main...HEAD',
        'git diff --stat=200,50 main...HEAD',
        'git show HEAD --stat=120',
        'git diff --stat main...HEAD 2>&1 | tail -5',
      ]) c.bashAllows(role, cmd);
    }
    // The ban still applies to a content read, and is case-sensitive as a word.
    c.bashAllows('critic', `git log -p --format=legit_flag -- . ${EXCL}`);
    c.bashBlocks('critic', `GIT_DIR=.git git diff main -- . ${EXCL}`);
    c.bashBlocks('critic', `git -C docs diff main -- . ${EXCL}`);
    c.bashBlocks('critic', `git --no-pager diff main -- . ${EXCL}`);
    c.bashBlocks('critic', `echo GIT_X=1; git diff main -- . ${EXCL}`);
    // A redirection does not turn a content read into a content-free call.
    c.bashBlocks('critic', `git diff main...HEAD 2>&1`);
    c.bashBlocks('critic', `git diff main...HEAD > ${tmp}`);
    c.bashBlocks('critic', `git diff --stat -p main...HEAD 2>&1`);
    c.bashBlocks('test-engineer', `git diff main...HEAD 2>&1`);
    c.bashBlocks('test-engineer', `git log -p > ${tmp}`);
  });

  // ---- G. Addendum 3 (round 3) ----

  t('G.21 npx prettier is off the reader roles list (changed: the earlier allow of `npx prettier --check docs` is removed)', (c) => {
    for (const role of ROLES) {
      for (const cmd of ['npx prettier --check docs', 'npx prettier --list-different .', 'npx prettier docs/a.md']) c.bashBlocks(role, cmd);
      c.reasonMatches(role, 'npx prettier --check docs', /allow|list|prettier/i);
    }
  });

  t('G.21 finding 8: a directory or wildcard argument to a kept tool is a search rooted there', (c) => {
    for (const cmd of [
      "npx prettier '*/*/*otes.md'",
      'npx prettier .',
      'npx vitest run .',
      'npx eslint .',
      "npx eslint '*/*/*otes.md'",
      'npx eslint .work',
      "npx vitest run '.w*'",
      'npx tsc --noEmit -p .',
    ]) c.bashBlocks('critic', cmd);
    for (const cmd of [
      'npx prettier apps/web',
      "npx prettier '**/s*/*.ts'",
      "node --test '**/s*/a.ts'",
      'node --test apps/web',
      'node --test apps/web/src',
      'npx vitest run .',
      'npx vitest run apps',
      'npx eslint apps/web/src',
      "npx eslint 'apps/*/src'",
      "npx playwright test 'apps/web/s*'",
    ]) c.bashBlocks('test-engineer', cmd);
    for (const role of ROLES) {
      c.bashAllows(role, 'npx vitest run apps/web/tests');
      c.bashAllows(role, 'node --test .claude/hooks/x.test.js');
      c.bashAllows(role, 'npx vitest run');
    }
    c.bashAllows('critic', 'npx tsc --noEmit -p apps/web');
    // The same through the settings hook.
    c.blocks('all', 'Bash', { command: "npx prettier '*/*/*otes.md'" }, { agent_type: 'critic' });
    c.blocks('all', 'Bash', { command: "node --test '**/s*/a.ts'" }, { agent_type: 'test-engineer' });
    c.allows('all', 'Bash', { command: 'npx vitest run apps/web/tests' }, { agent_type: 'test-engineer' });
  });

  t('G.22 finding 9: arguments after -- in npm run / npm test are judged as paths', (c) => {
    for (const cmd of [
      "npm run tokens:check -- '*otes.md'",
      "npm run tokens:check -- ':(icase).WORK'",
      'npm run tokens:check -- .work',
      "npm test -- '*otes.md'",
      "npm test -- ':(icase).WORK'",
      'npm test -- .work/f',
      'npm test -- .',
    ]) c.bashBlocks('critic', cmd);
    for (const cmd of [
      'npm run tokens:check -- apps/web',
      "npm run tokens:check -- 'apps/*/s*'",
      "npm run tokens:check -- ':(top)apps/web/src'",
      'npm test -- apps/web/src/a.ts',
      'npm test -- apps/web',
      'npm test -- .',
    ]) c.bashBlocks('test-engineer', cmd);
    c.bashAllows('test-engineer', 'npm test -- apps/web/tests/a.test.ts');
    c.bashAllows('critic', 'npm test -- apps/web/tests/a.test.ts');
    c.blocks('all', 'Bash', { command: 'npm run tokens:check -- .work' }, { agent_type: 'critic' });
    c.blocks('all', 'Bash', { command: 'npm run tokens:check -- apps/web' }, { agent_type: 'test-engineer' });
  });

  t('G.23 a reader role never writes under .git/', (c) => {
    for (const role of ROLES) {
      for (const cmd of [
        'printf x >> .git/config',
        "printf '[core]' >> .git/config",
        'echo x > .git/hooks/pre-commit',
        'echo x >.git/config',
        'echo x >> .GIT/config',
        'echo x > docs/../.git/config',
        'cp f .git/hooks/pre-commit',
        'cp docs/a.md .git/config',
        'mv docs/a.md .git/hooks/x',
        'mkdir .git/hooks/d',
        'echo x 2> .git/config',
        'cd .git && echo x > config',
      ]) c.bashBlocks(role, cmd);
      c.blocks('all', 'Bash', { command: 'printf x >> .git/config' }, { agent_type: role });
      c.bashAllows(role, 'git status');
      c.bashAllows(role, 'echo x > docs/out.txt');
    }
  });

  // ---- F. Everything else ----

  t('F.14 a sample of cases the existing test files assert (the full files run in guard-platforms.test.js)', (c) => {
    c.blocks('critic', 'Read', { file_path: at('.work', 'f', 'notes.md') });
    c.blocks('critic', 'Read', { file_path: at('.WORK', 'f', 'NOTES.MD') });
    c.allows('critic', 'Read', { file_path: at('.work', 'f', 'spec.md') });
    for (const cmd of ['cat .work/f/notes.md', 'cat .work/feat/*', 'cd .work/feat && cat n*', 'cat .WORK/f/*', 'cat .work/f/{notes,spec}.md', 'grep -r secret .', 'rg secret', 'git diff main...HEAD', 'git log -p -3', 'git show HEAD', "git diff -- ':(exclude).work/x/spec.md'", "git diff main -- . ':(exclude).WORK/*/notes.md'", "git log -p -3 -- . ':(exclude)*NOTES.MD'", 'git diff-tree -p HEAD', 'git range-diff a...b']) {
      c.bashBlocks('critic', cmd);
    }
    for (const cmd of ['npm run ci', 'git status', 'git log --oneline -5', 'find .work -type f', 'cat .work/f/spec.md', `git diff main...HEAD -- . ${EXCL}`, "git diff main...HEAD -- . ':(exclude).work'"]) {
      c.bashAllows('critic', cmd);
    }
    for (const cmd of ['cat apps/web/src/a.ts', 'cat .work/f/notes.md', 'git diff', 'git log -p', 'cat apps/web/s*/a.ts', 'cat apps/*/s*', 'cat **/*.tsx', 'cat apps/web/{src,tests}/a.ts', 'cd apps && cat web/src/a.ts']) {
      c.bashBlocks('test-engineer', cmd);
    }
    for (const cmd of ['npm test', 'npm test -w apps/web', 'npx vitest run apps/web/tests/App.test.tsx', 'cat packages/x/src/i.ts', 'cd apps/web/tests && cat a.test.ts']) {
      c.bashAllows('test-engineer', cmd);
    }
  });
}

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
