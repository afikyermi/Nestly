# notes — guard-env-paths (R4 judges paths, not text) + F5 wording

**Approach**
`namesEnvFile` in `.claude/hooks/guard.js` no longer runs a regex over the command text. It runs on the existing
`shellSegments` output (nested `bash -c`, `sh -c`, `eval`, `powershell -Command`, `cmd /c` included), twice: once as
parsed (`\` is bash's escape), once with `\` turned into `/` first (`\` as a Windows path separator, so
`type apps\server\.env.local` is still seen as a path). Either parse that finds an env file blocks. Every token in every
segment is checked as a path unless `patternTokens` marks it as a search pattern. The check:
- split the token where a path can start inside it: `= < > : , @ |`, plus an attached short-option value (`-f.env`).
  This covers redirection targets (`<.env`, `2>`, `>|`), option and assignment values (`--env-file=.env`, `F=.env`),
  `HEAD:.env`, `@.env`.
- expand bash braces first (`.{env,x}`). A token with more than 8 `{` is blocked without expanding it, so a long brace
  chain cannot make the hook slow.
- take the last path component. Without glob characters it counts if it is `.env` or `.env.<anything>`, lower-cased,
  and does not end in `.example`. With glob characters it counts if its literal start begins with `.` and fits `.env.`
  (`.env*`, `.en?`, `.e*`, `.*`, `.*rc`). The reason for the leading dot: bash never matches a leading dot with a
  wildcard, so `*` and `*.ts` stay allowed.
- interpreter segments (`node|deno|bun|tsx|ts-node|python*|py|perl|ruby|php|awk|gawk|sed`, found anywhere in the
  segment so that `npx tsx -e` is caught too) also have every token after the interpreter scanned as text with the old
  regex. Heredoc bodies fed to an interpreter are scanned as text, as before: `commandText(command, true)` returns
  those bodies alone.

`patternTokens` exempts only these:
- grep/egrep/fgrep/rg and `git grep`: the first positional, or the `-e`/`--regexp` values. With `-e`/`-f` present,
  no positional is exempt. After an unknown long option without `=`, no positional is exempt either, because it is
  ambiguous whether that option took the next word, so we fail closed.
- `git <other> --grep`: its value.
- Select-String/sls: the value of `-Pattern` only.
- findstr: the first non-`/` argument, unless `/c:` or `/g:` is given.

Exemption is by token index, so `grep .env .env` blocks (the second is a file).

F5: the header comment, the claimEscalation comment and the escalation message say "in one task". The counting code
is unchanged. `/wrap-up` 1.2 rotates both `blocks.jsonl` and the `escalated-*.flag` files, so the wording is accurate.
`guard-env.test.js` added to `test:tools`.

**Decisions**
- Case-insensitive on every platform, not only on Windows (`fold`). CI runs on ubuntu and the test `less .ENV`
  expects a block. Blocking `.ENV` on Linux is the fail-closed direction.
- No new module. `guard-loader.js` falls back to compiling `guard.js` alone from origin/main, so a required helper
  file would break that fallback. To stay within the 900 budget, the code is compact: 899 lines.
- Short options that take a value come from per-tool lists (grep `ABCDdefm`, rg `ABCdEefgjMmrTt`). A value-taking
  option missing from a list fails toward over-blocking. Example: if `-A 3` were treated as boolean, the real pattern
  would be checked as a file. Long options that take a separate value are listed in `SEARCH_LONG`. An unknown one makes
  the parse ambiguous: nothing positional is exempt.
- `awk`, `gawk` and `sed` are treated as interpreters (their program is inline code). Today they were blocked by the
  text regex; without this, `sed 'r .env'` or awk `getline < ".env"` would have become holes. Cost: `sed -n '/.env/p' x`
  is still blocked, because sed is not in bug.md's list of search commands.

**Deviations**
- None from bug.md. The brief said "76 tests, 20 failing". The file at a43aa99 has 69 tests, and 21 failed before the
  fix (15 over-blocks, 5 glob holes, F5). All 69 pass now; no test was changed.

**Deliberately not done**
- conventions.md "Git and shell" not edited (it needs a validator). Proposed edit below.
- Recursive search over a directory that holds an env file (`grep -r SECRET .`) and scripts that read one
  (`node x.mjs`): out of scope in bug.md, still not caught.

**Proposed edit — `.claude/knowledge/conventions.md`, "Git and shell"** (for ORCHESTRATOR to route to a validator)
Replace the sentence "Text that names an env file (a log line, a search pattern, a `-m` commit message) is written with
the Write/Edit tools or a quoted heredoc (`git commit -F - <<'EOF'`), not as a shell argument." with:
"A bare word that names an env file is judged as a path, even inside `echo` or `-m` (`echo .env`, `git commit -m .env`
block). A search pattern (grep/rg/git grep/`git log --grep`/Select-String `-Pattern`/findstr) and quoted text with other
words around it (`-m "docs: mention .env.preview"`) do not block. Inline interpreter code (`node -e`, `python -c`, awk,
sed) that names an env file always blocks: write such a script to a file first."
In the `why:` line, replace "its env-file rule reads command text, not targets" with "its env-file rule judges path
arguments and fails closed on a bare env-file word". Example: `.claude/hooks/guard.js` (namesEnvFile, patternTokens).

**Uncertain**
- Globs in PowerShell and cmd: `*` there does match dotfiles, so `powershell -Command "Get-Content *"` or
  `cmd /c type *` can reach `.env` and is not blocked. The rule follows bash glob semantics, which is what bug.md lists.
  CRITIC should decide whether a bare `*` inside a powershell/cmd segment needs closing. `shellSegments` does not
  record which shell a nested segment came from, so closing it is not a one-line change.
- Remaining over-blocks, all fail-closed: a word that starts with `.env.` after `=`, `:` or `/` inside text
  (`-m "x=.env.local here"`, `"see apps/.env.preview now"`); a search command behind a prefix (`env X=1 grep .env f`,
  `xargs grep .env`); an unknown long grep option before the pattern (`grep --color .env f`); `findstr /c:.env f`.
- The second parse (`\` to `/`) can over-block a few escaped forms (`echo foo\ .env`). It never under-blocks, because
  the two parses are unioned.

**Preview path**
No preview: this is a hook. Verify with `node --test .claude/hooks/guard-env.test.js .claude/hooks/guard.test.js
.claude/hooks/guard-case.test.js .claude/hooks/guard-readers.test.js .claude/hooks/guard-loader.test.js`
(184 tests: 179 pass, 5 skipped for symlinks on Windows as before) and `npm run check:budgets`. Live check: in a
session, `grep -n ".env" noise.md` runs, `cat .env*` is blocked.

**Neighbouring**
- `checkBuilder` repeats `commandName` and the `CD` list inline (guard.js, the `name` line and the cd check in
  checkBuilder). Harmless duplication, not touched. (Fix round 1: now removed, to fit the budget; see below.)
- During the build, my own `node -e` edit script quoted `.env` text inside inline code. The guard blocked it correctly:
  inline interpreter code keeps the text check by design. The block wrote one `incidents.md` line,
  "2026-10-13 14:08 | hook blocked Bash (all)". It is uncommitted in the working tree, for ORCHESTRATOR to resolve.
  Not a false block: the new rule intends this.

---

## Fix round 1 — CRITIC findings 1–4 (`findings.md`), the single round Afik allows

**Approach**
Each fix takes the simplest form that fails closed, as the brief asked, not precise parsing.
- **F1, command substitution.** A token that contains `$(` or a backtick is checked as text (`mentionsEnv`) wherever it
  stands, search patterns included, because it runs. `psql "$(grep … .env.preview …)"`, `URL="$(cat .env.local)"`,
  `"\`cat .env\`"` and `"$(< .env)"` are blocked. `echo "the .env file"` is still allowed.
- **F2, scripts handed to a shell.** bash/sh/zsh/dash, powershell/pwsh, cmd and eval joined `INTERPRETER`. After any
  of them, every token is checked as text (minus search patterns), except the script that `scriptOf` locates and
  parses as shell. `scriptOf` replaces the inline nested-shell block in `shellSegments`. It recognises these forms:
  `-c` anywhere in the leading options (`-lc`, `-ec`, `-e -c`, `--login -c`), where the script is the next word;
  powershell `-Command`; `cmd /c` or `/k` after other `/x` switches; a leading `eval`. If none of these is found, the
  whole segment is checked as text. So `bash -lc "grep -n .env noise.md"` is parsed and allowed, while
  `powershell "gc .env"` and `cmd /s /c "type .env"` are blocked by the text check.
  Pipes: if a command contains a `|` (not `||` or `>|`) and any segment has an interpreter, every segment is checked as
  text. `echo hi | node` and `bash -lc "ls"` are still allowed.
- **F3/F4, braces.** The tokenizer keeps a quoted `{` as ``, so quoted text is never brace-expanded (bash does not
  expand it either). A script handed to a nested shell gets its `{` back first. `braces` is now iterative and linear,
  with no `,` before the first comma. Beyond 256 words, or a group with more than 256 alternatives (`split(',', 257)`),
  it returns null and the token blocks. The "more than 8 `{`" rule is gone.

**Decisions**
- `shellSegments` now nests only the first located script per segment, not every shell token in it. This removes an
  m^depth blow-up in the old loop: `cmd /c cmd /c …` re-parsed every suffix at every level. It also loses nothing,
  because every token outside the nested script is still checked as text (e.g. `bash -c "x" bash -c "cat .env"`
  blocks). Measured on 50,000-character pathological commands (shell chains, brace chains, `$(` runs, long pipes,
  long option runs): at most 0.9 s per call.
- The pipe rule is per command, not per pipeline, and it does not require a bare interpreter. Segment separators are
  not recorded, and grouping by `;` breaks on `$(…; …)` and on `2>&1` (the tokenizer splits on `&`). Cost: a command
  that has a pipe and an interpreter and also mentions an env name in plain text blocks, e.g.
  `node x.js | tee log; echo "see .env"`.
- **Line budget:** two de-duplications inside guard.js, with no comment carrying a rule cut. `checkReadPath` now takes
  its Grep/Glob target from `namedPaths`, which had the same six lines. `checkBuilder` now iterates `withCwd` and
  `commandName`/`CD` instead of its own copy (the earlier Neighbouring item). Both are covered by `guard-readers` /
  `guard.test.js`. Result: 899 lines.

**Deviations**
- None from findings.md's expected behaviour. F2's fix line asked for each form to be recognised. For powershell
  without `-Command`, I rely on the text fallback instead of locating the first non-switch argument; the result is
  the same block.

**Uncertain**
- Brace forms inside a script that `scriptOf` cannot locate are not expanded by the text check, e.g.
  `bash -o pipefail -c "cat .{env,x}"`. The old text rule had the same hole.
- Over-blocks introduced, all fail-closed (r4-critical, one incidents line each):
  - an unquoted brace word that expands past 256;
  - `'$(cat .env)'` in single quotes (literal in bash);
  - a token named exactly `sh`/`cmd`/`eval`/`bash` as an argument, followed by text that names an env file;
  - the pipe-wide rule above.
- `bash -C x` (noclobber) is read as `-c`, as the old code did with `-C`. The next word is parsed as shell instead of
  being read as text. The nested parse still judges every path in it.

**Preview path**
No preview. `node --test` on the five guard test files: 202 tests, 197 pass, 0 fail, 5 symlink skips on Windows as
before. All 18 `[critic-r1]` tests pass. `npm run check:budgets` is ok.
