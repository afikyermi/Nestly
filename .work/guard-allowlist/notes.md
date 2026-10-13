# notes — guard-allowlist (bug-fix, step 3)

**Approach**  CRITIC and TEST ENGINEER Bash rule in `.claude/hooks/guard.js` is now an allowlist behind the old specific messages.
The old denylist checks stay first (they give the precise reason); behind them, a call must pass: no expansion (A), a shape the
parser can follow, wildcards only from a safe directory (B.4), literal paths resolved through `..` and symlinks (B.5/B.6),
git only content-free or in the fixed form (C), TEST ENGINEER paths and globs judged by segment matching (D). Read/Grep/Glob
are judged both as written and through symlinks (E). `shellSegments` now also carries, per segment, `pat` (tokens with quoted
glob chars escaped), `before`/`after` separators and a `nested` flag; `gitCall` also returns `globals`; `commandText` has a
mode that keeps unquoted-delimiter heredoc bodies (the shell expands `$(...)` in them). The `all`, `builder` rules are untouched.

**Decisions**
- Global options before the git subcommand and any `GIT_` in the command block every git call of both roles, also content-free
  ones (`-c core.fsmonitor=...`, `GIT_SSH_COMMAND` run commands). Stricter than Addendum 3, which names content reads only.
- Content-free `diff`/`show` (with `--stat` etc.) must still have plain revisions: `git show --stat HEAD:path` prints a blob.
  `-U<n>` / `--unified` count as patch options (they imply a patch). `add`/`commit` with `-p/-i/-e` are not content-free.
- Beyond the spec, closed because they were one step away: `~` and `<(` / `>(` expansions, `$'...'`, a `#` comment (it can hide
  a quote from the parser), `bash -c`/`eval`/`powershell -Command`/`cmd /c` and heredoc scripts (cwd and wildcards inside them
  cannot be tracked), `ln`/`mklink`/`popd`, `cp`/`mv`/`tar`... naming a path inside `.work` (copy then read elsewhere),
  a `cd` that is not `cd <one path> && ...` or `;` (subshell, pipe, `||` make the tracked cwd wrong), a wildcard that can match
  `..` (`.*`), a wildcard after a cd into a missing directory. Each is an accepted cost for an honest command.
- `*` does not match a leading dot (bash default), so `cat */f/n*` is blocked by the root rule, not by matching `.work`.
- A commit message (`git commit -m`) is text: skipped as a path argument and removed from the `apps/` substring scan, but only
  when the quoted message occurs exactly once in the command.

**Deviations**  None from bug.md. Two of my own choices are stricter than it (GIT_/global options on content-free calls; the
extra blocks above).

**Deliberately not done**  No refactor of `all`/`builder`. Existing helpers kept (`literalPrefix`, `reachesAppImpl`, `excludesNotes`).

**Uncertain / residual gaps**
- Interpreter inline code (`node -e`, `python -c`) and script files (`bash x.sh`, `npm run`, `make`) are not judged beyond the
  `apps/` substring scan for TEST ENGINEER. For CRITIC they can build any path.
- Files CRITIC writes itself into `.work/<slug>/` (Write tool) are not covered; a file named notes.md that CRITIC creates is blocked like any.
- A wildcard whose directory contains a symlink *below* the literal prefix (`docs/*/n*` with docs/x -> .work/f) is not seen;
  `ln` is blocked, but a link made outside the shell is not.
- `git commit -m`: the message is removed from the TEST ENGINEER substring scan by exact text; a message with escapes stays and
  blocks (safe side).
- Windows: the symlink walk and `fold` are tested only through the forced-platform preload on Linux, not on a real Windows host.
- Lint: `npm run lint` could not run here (typescript-eslint not installed in this sandbox). `npm run test:tools` shows 20
  failures, all in other files (design-gates, eslint-rules, ui-types: missing dependencies); the three guard test files pass (83/83).

**Preview path**  Not user-facing. Verify: `node --test .claude/hooks/guard-allowlist.test.js .claude/hooks/guard.test.js .claude/hooks/guard-case.test.js`.

**Neighbouring**  `dropHeredocs` and `commandText` find heredocs by different rules (quote masking), so odd input can make them disagree;
the new shape check treats a disagreement as a block. Not fixed here.

---

# Round 2 — the command name is the allowlist key (bug.md Addendum 2, G.16–G.19)

**Approach**  `checkReader` ends with `allowlistReason`: after every specific message, each segment's command word must be on
`ALLOWED_COMMANDS`, in the form `FORMS[cmd]` accepts. Unknown command: blocked, message names the list. `git` is judged by
`gitReason` (earlier in the flow); the allowlist only requires that a git segment has a subcommand. `all` and `builder` untouched.

**Decisions**
- Command word = a bare name. `/usr/bin/cat`, `./cat` are not on the list (a program called `cat` that the role wrote must not pass).
  On win32 only: lower-cased, `.exe` stripped.
- `FOO=1 cmd`: `cmd` is judged, the assignment must name one of CI, NODE_ENV, FORCE_COLOR, NO_COLOR, TZ, LANG, LC_ALL, TERM. Any
  other (PATH, NODE_OPTIONS, GIT_SSH_COMMAND, LD_PRELOAD…) changes what runs. This list is mine, not the spec's: say if it should differ.
  A cd alias behind an assignment is blocked (`withCwd` would not follow it).
- Long options of grep, sort, wc, diff are an exact allowlist, not a denylist: GNU getopt accepts abbreviations (`--rec`, `--out=`).
- ORCHESTRATOR answers applied: `[` is `test`; bare `git fetch origin` / `git push origin main` allowed; `sed` only `-n` plus ranges and `p`
  (`;`-joined parts and `-e` allowed, `s///` blocked).
- Content-free git: judged first (G.18). Each subcommand has a fixed option list (`GIT_FREE_OPTS`, `COMMIT_OPT`); global options only
  `-C <dir>`, `--no-pager`, `--no-optional-locks`; any positional with `::` blocked; `git remote` bare or `-v`; `reflog expire|delete` blocked;
  `push -u` allowed (it is `--set-upstream`), `fetch -u` is not on fetch's list. The GIT_ / global-option ban now applies to content reads only,
  on the command text without commit-message values, as the word `\bGIT_`.
- `2>&1`, `>&2`, `<&3`, `&>f` are now one token in `shellSegments` (the `&` used to split the segment and left a command named `1`).
  This changes the parse for `all` and `builder` too, in the right direction; their tests pass.
- `xargs` removed from `recursiveSearch`: it is not a search, and now gets the list message (G.16 asks for a message naming the list).
- G.17: `APP_IMPL`, `reachesAppImpl`, the cd check and the `apps/` text scan are case-insensitive on every platform (`isAppsDir` new).

**Deviations**
- `\bGIT_` is case-insensitive on win32 only (Windows environment variable names are), case-sensitive elsewhere as G.18 says.
- `npm test/run … -- <args>`: everything after `--` is passed through unjudged (it is the script's own arguments). `npm install`/`ci` take no package name.

**Contradiction in the tests (FINDING for TEST ENGINEER, not fixed by me)**  `guard-allowlist.test.js` A.1 (lines ~113–116, 133)
requires `awk '{print $1}' docs/a.txt` to be allowed for both roles, `all`+agent_type too. G.16 requires `awk` blocked (`awk 1 …`,
`awk '{print}' …`, the `BEGIN` read) and lists it as not on the list. Both cannot hold without special-casing one awk program. I
followed G.16 (it is the later addendum, F.14: the newer line wins). Result: A.1 fails 6 times (2 tests × 3 platforms), nothing else.
The A.1 case needs another command that keeps a `$1` inside single quotes, e.g. `echo '{print $1}'` or `jq '.[0]' …`.

**Residual gaps (G.19 and what follows from it)**
- G.19, accepted: a script the role writes itself and runs with `node <file>` or `npm run`. Also the config and plugin files
  `vitest`, `eslint`, `prettier`, `playwright` and `tsc` load, and a hook or alias in `.git/config` that `git commit`/`fetch` runs, or a remote
  in `.git/config` whose url is `ext::…`. For debt.md (ORCHESTRATOR writes it); CRITIC stays behind it.
- `jq -f <file>`, `jq --rawfile` take a file the role names: paths are checked by name, contents are not.
- `npm`/`npx` option values (`--prefix <dir>`, `-w <ws>`) are not path-checked beyond the general path rule.
- Quoted arguments starting with `<` or `>` are treated as redirections when stripped (hides a literal argument from the option check; it cannot start with `-`).
- Windows behaviour is tested only through the forced-platform preload on Linux.

**Verification**  `node --test` on guard-allowlist, guard, guard-case, guard-platforms: 101 pass, 6 fail (only the A.1 awk contradiction above).
`npm run lint`: does not run here (typescript-eslint not installed).
