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
