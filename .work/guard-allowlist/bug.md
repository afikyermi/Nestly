# Bug — the guard's protected-file rules are denylists of spellings

**Path:** bug fix, Elevated (a guardrail: every guard change goes through CRITIC on opus). **Product risk flags:** none.
**Source:** Afik's decision of 12.10.2026 (`decisions.md`, "The guard's protected-file rule: an allowlist as the base");
`debt.md` lines "guard-notes-case (PR 2)" ×3, line "guard (TEST ENGINEER rule)" and line "7.2 hooks … TEST ENGINEER false
positives"; `noise.md` 12.10 (×2, TEST ENGINEER blocked on CI commands).
**SRS trace:** none — an agent-team guardrail (`.claude/workflow.md`, "The three rules that make the reviews real", rules 1–2).

## The approved rule (unchanged)

- CRITIC never reads `.work/<slug>/notes.md` (any case, any platform — as in `.work/guard-notes-case/bug.md`).
- TEST ENGINEER never reads app implementation: `apps/<app>/src/**` and `apps/<app>/api/**`.

## Expected behaviour — allowlist as the base

The guard (`node .claude/hooks/guard.js critic|test-engineer`, and the settings hook `all` with `agent_type` set to the
role) **allows a call only when it matches an allowed form**; everything else that could reach the protected file is
blocked. The existing specific messages stay: when a call is blocked, the reason names what was wrong where the guard
can tell (a `notes.md` name, a `.work/` wildcard, a cd into `.work`, a missing exclusion…). Any blocked call has a
non-empty reason that does not say `guard error`.

### A. Shell expansion (CRITIC and TEST ENGINEER)

1. A Bash command containing a parameter expansion or command substitution **outside single quotes** is blocked:
   `$NAME`, `${…}`, `$(…)`, a backtick. Inside single quotes it is literal text and stays allowed
   (`awk '{print $1}' docs/a.txt`, `git log --format='%H %s'`). Heredoc bodies that are data (e.g. a commit message,
   `cat <<'EOF' > file`) are not commands and are not judged by this rule.
2. Exempt: the special parameters that cannot name a path — `$?`, `$#`, `$$`, `$!`, `$0`–`$9`, `$-`, `$@`, `$*` —
   wherever they appear (e.g. `npm run ci; echo "exit=$?"`, `echo x=$?`).
3. Required blocks: `X=a; cat ${X}pps/web/src/a.ts`, `cat "$X"pps/web/src/a.ts`, `cat $(printf apps)/web/src/a.ts`
   (TEST ENGINEER); `cat $(echo .work)/f/notes.md`, ``cat `echo .wo`rk/f/x``, `N=notes; cat .work/f/$N.md`,
   `git $x diff main` (CRITIC).

### B. Wildcards and paths (CRITIC)

4. A wildcard token (`*`, `?`, `[`, `{`) in a command is allowed only if the directory it starts in — its literal prefix,
   resolved against where the command runs, through `..` and through existing symlinks — lies **outside `.work`** and is
   **not the project root nor any directory above it**. Required blocks: `cat .w*/*/n*`, `cat .wor[k]/f/n*`,
   `cat */f/notes*`, `cat apps/../.w*/f/x`, `cat .work/f/{a,b}.md`, `ls *.md` (at the root). Required allows:
   `ls docs/*.md`, `cat apps/web/src/*.ts`, `ls packages/*/src`.
5. A literal path argument that resolves (through `..` and existing symlinks) to a file named `notes.md` in any case,
   or into `.work/<slug>/notes.md`, is blocked. Required block: after `ln -s .work/f link` exists on disk,
   `cat link/NOTES.md` and `head link/n*`.
6. `cd` (and its aliases) into `.work` in any case, or into a symlink that resolves there, is blocked.

### C. git reads that show file content (CRITIC)

7. A git call that shows file content (`diff`, `show`, `log`/`reflog`/`stash show` with a patch, `blame`, `grep`,
   `cat-file`, `archive`, `format-patch`, `difftool`, `range-diff`, `diff-tree/-index/-files`, `whatchanged`, and any
   subcommand not known to be content-free) is allowed **only** in this fixed form, and blocked otherwise:
   - **subcommand** `diff`, `log` or `show`;
   - **runs at the project root** (after any `cd` in the same command), with **no** global option before the subcommand
     (`-C`, `-c`, `--git-dir`, `--work-tree`, `--literal-pathspecs`, `--glob-pathspecs`, `--noglob-pathspecs`,
     `--icase-pathspecs`, …) and **no** `GIT_…` environment variable named anywhere in the command;
   - **revisions** are ref names, `HEAD`, `~n`/`^n` suffixes, and ranges `a..b` / `a...b` (a hex commit id is allowed
     only inside a range). Not allowed: `rev:path`, `^{…}`, a bare hex id, `--no-index`, `-`, `@{…}`;
   - **options** only from a fixed list of display options (e.g. `--stat`, `--name-only`, `--name-status`, `-p`,
     `--patch`, `-U<n>`, `--unified=<n>`, `--oneline`, `-n <n>`, `--no-color`, `--format=…`, `-w`). Anything else —
     `--output`, `--ext-diff`, `--textconv`, `--no-index`, `--follow`, `-L…` — is blocked;
   - a `--` separator, followed by **plain** pathspecs (no `:` magic, no `:/`) and exactly one exclusion from this set,
     in exact case: `':(exclude).work/*/notes.md'`, `':!.work/*/notes.md'`, `':^.work/*/notes.md'`,
     `':(exclude).work'`. The canonical form the message tells CRITIC to use:
     `git diff main...HEAD -- . ':(exclude).work/*/notes.md'`.
8. Required blocks (`debt.md`): `cd apps && git diff main~1 -- :/ ':(exclude).work'`, `git -C apps diff main -- . ':(exclude).work'`,
   `git diff main -- . ':(exclude,literal).work/*/notes.md'`, `git diff main -- . ':(exclude,attr:x).work'`,
   `git --literal-pathspecs diff main -- . ':(exclude).work/*/notes.md'`,
   `GIT_LITERAL_PATHSPECS=1 git diff main -- . ':(exclude).work/*/notes.md'`,
   `git --glob-pathspecs diff main -- . ':(exclude)*notes.md'`, `git show HEAD:.work/f/x.md`,
   `git show 1a2b3c4d`, `git cat-file -p HEAD:.work/f/x.md`, `git grep foo`, `git blame apps/web/src/a.ts`.
9. Required allows: `git diff main...HEAD -- . ':(exclude).work/*/notes.md'`,
   `git log -p main..HEAD -- . ':(exclude).work/*/notes.md'`, `git show HEAD --stat -- . ':(exclude).work'`,
   `git diff --name-only main` (no content), and the git calls that show no content: `git status`, `git log --oneline -5`,
   `git branch -a`, `git ls-files`.

### D. TEST ENGINEER — false blocks to remove (noise.md, debt.md)

10. Required allows: `npm run ci 2>&1 | tail -40; echo "exit=$?"`, `cd /<root> && npm run ci | tail; echo $?` (root given
    as an absolute path), `npm test --prefix apps/web`, `ls apps/*/tests`, `ls apps/web/tests/*.test.ts`,
    `git commit -m "tests for apps/web/src/a.ts"` (a commit message is not a read),
    `git add apps/web/tests/a.test.ts && git status`.
11. Required blocks stay: `cat apps/web/src/a.ts`, `cd apps/web && cat src/a.ts`, `cd apps/web && cat s*/a.ts`,
    `ls apps/*/s*`, `ls apps/web/*`, `node -e "require('fs').readFileSync('apps/web/src/a.ts')"`, every git content
    read (TEST ENGINEER never reads through git), and every A.3 case.

### E. Read, Grep, Glob

12. Read of a symlink whose target is `notes.md` (CRITIC) or app implementation (TEST ENGINEER) is blocked.
13. Grep with a `path` that is a symlink resolving into `.work` (CRITIC) or app implementation (TEST ENGINEER) is judged
    as that target. Every Read/Grep/Glob case the guard blocks or allows today keeps its result.

### F. Everything else

14. Every case `.claude/hooks/guard.test.js` and `guard-case.test.js` assert today keeps its result, **except** where it
    contradicts a line above — then this file wins, and the changed case is named in the test summary.
15. All cases run under forced `win32`, `linux` and `darwin` (as `guard-case.test.js` does).

## Actual behaviour

The rules for both roles are lists of forbidden spellings; each review found a new spelling through them (case and
platform, the directory git runs from, pathspec magic, globs without `.work/`, shell variables). Section D's honest
commands are blocked.

## How to reproduce

As in `.work/guard-notes-case/bug.md`: `node .claude/hooks/guard.js <role>` with the hook JSON on stdin, env
`CLAUDE_PROJECT_DIR=<throwaway root with incidents.md>`; exit 2 = blocked, 0 = allowed; a block saying `guard error` is
not a valid block. Platforms via `node --require .claude/hooks/force-platform.js` with `FORCE_PLATFORM`.

## Accepted cost (Afik, 12.10)

Some honest commands become blocked until their form is added (e.g. CRITIC's `ls *.md` at the root, `$HOME`). Each is
logged in `incidents.md` and `noise.md`.

## Escape

`escapes.md`, 13.10.2026: should have been caught by CRITIC at 7.2.

## Addendum 13.10 — ORCHESTRATOR answers TEST ENGINEER's four questions

1. **Content-free git calls need no `--` and no exclusion.** Content-free means: `status`, `branch`, `ls-files`, `ls-tree`,
   `rev-parse`, `remote`, `fetch`, `add`, `commit`, `push`, `switch`, `merge-base`, `log`/`reflog` without a patch option,
   and `diff`/`show` with one of `--stat`, `--shortstat`, `--numstat`, `--name-only`, `--name-status`, `--quiet` and no
   patch option. The fixed form of C.7 applies to every other git call. `-<n>` is shorthand for `-n <n>` and is allowed:
   `git log --oneline --stat -5` and `git log -p -3 -- . ':!.work/*/notes.md'` stay allowed.
2. Any git subcommand outside that list and outside C.7's fixed form is blocked for CRITIC. Every git content read is
   blocked for TEST ENGINEER (D.11). The content-free list applies to both roles.
3. "Named anywhere" is meant literally: `export GIT_X=1; …` and `echo GIT_X=1` in the same command both block a
   content-reading git call.
4. The B.4 cwd cases follow from the rule: `ls *.md` run from `docs` is allowed, and `ls *` run from `.work` or `.work/f`
   is blocked.

## Addendum 2, 13.10 — after CRITIC round 1 (`findings.md`): the command name is the allowlist key

G.16 For CRITIC and TEST ENGINEER, every shell segment's command must be on an allowed list; any other command is
     blocked with a message naming the list. Allowed, each only in the form given:
     - readers: `cat`, `head`, `tail`, `wc`, `ls`, `diff`, `sort`, `uniq`, `cut`, `tr`, `echo`, `printf`, `pwd`, `true`,
       `false`, `test`, `[`, `jq`, `mktemp`, `mkdir`, `cd` (and its aliases), `sed` only with `-n` and a script made of
       line ranges and `p` (no `e`, `w`, `r`, `R`, `W` commands, no `-i`), `grep` non-recursive (no `-r`, `-R`, `-d`,
       `--directories`, `--recursive`, `-f`), `find` without `-exec`, `-execdir`, `-ok`, `-okdir`, `-delete`, `-fprint*`,
       `-fls`;
     - runners: `npm` (`test`, `t`, `ci`, `install`, `run <script>`, `ls`, `--prefix <dir>` with those), `npx` only with
       `vitest`, `playwright`, `tsc`, `eslint`, `prettier`; `node` only with `--test` and file arguments, or with a
       script file path and its arguments — never `-e`, `-p`, `--eval`, `--print`, `-r`/`--require`/`--import` of an
       inline value, or `-` (stdin);
     - `git` under its own rules (C, Addendum 1), and the content-free subcommands with a fixed option list each:
       `--upload-pack`, `--receive-pack`, `--exec`, `-u <cmd>`, `ext::` and `fd::` remotes are blocked.
     A nested shell in any spelling (`bash -lc`, `sh -ec`, `bash --norc -c`, `zsh -c`), `eval`, `xargs`, `env`,
     `timeout`, `awk`, `python*`, `perl`, `ruby`, `deno`, `bun`, `source`, `.` are not on the list.
G.17 The TEST ENGINEER app-implementation check ignores case on every platform (as CRITIC's notes.md check does).
G.18 A content-free git call is judged before the global-option / `GIT_` ban, which applies only to content reads and
     matches `GIT_` case-sensitively as a word, outside a commit message value. Redirections (`2>&1`, `> file`) and
     `--stat=<n>[,<m>]` do not make a content-free call a content read.
G.19 Known residual, accepted: a script file the role writes itself and then runs with `node <file>` or `npm run`.
     Recorded in `debt.md`; CRITIC review stays behind it.
G.20 (13.10, ORCHESTRATOR) A.1's example `awk '{print $1}' docs/a.txt` contradicts G.16, and G.16 wins. A.1 still
     requires single-quoted `$` to stay literal and allowed, but its examples must use a listed command, e.g.
     `echo '{print $1}'` or `git log --format='%H %s'`.

## Addendum 3, 13.10 — after CRITIC round 2 (`findings.md`, findings 8–9). ORCHESTRATOR decision (`decisions.md`)

G.21 `npx prettier` is removed from the reader roles' list (formatting is not a reader's job; CI checks it). For the
     tools that stay (`npx vitest|playwright|tsc|eslint`, `node --test`), a directory or wildcard argument — quoted or
     not — is a search rooted there and follows the recursive-search reach rules: never `.work` or an ancestor of it for
     CRITIC, never `apps/<app>/src|api` or an ancestor of it for TEST ENGINEER. Required blocks: every line of finding 8
     (with `npx prettier …` blocked as off the list), `node --test '**/s*/a.ts'` (TEST ENGINEER), `npx vitest run .`
     and `npx eslint .` (CRITIC). Required allows: `npx vitest run apps/web/tests`, `node --test .claude/hooks/x.test.js`,
     `npx tsc --noEmit -p apps/web` (CRITIC), `npx vitest run` with no path argument.
G.22 Arguments after `--` in `npm run <script>` / `npm test` are judged as paths by the same rules (literal path,
     wildcard reach, `:` magic blocked). Required blocks: every line of finding 9. Required allow:
     `npm test -- apps/web/tests/a.test.ts` (TEST ENGINEER).
G.23 A reader role never writes under `.git/`: a redirection target, or a write-verb argument, resolving inside `.git`
     is blocked (`printf x >> .git/config`, `cp f .git/hooks/pre-commit`).
G.24 (13.10, ORCHESTRATOR) An option's value (`--root apps/web`, `-p apps/web`, `--project x`) is not a search argument
     for G.21; `npx vitest run --root apps/web` stays allowed. A config file the option loads is the G.19 residual.
