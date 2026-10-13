# notes — agent-slim stage 1 (guard)

**Approach**        `guard.next.js` = copy of `guard.js` with the readers part replaced (path checks on file tools,
TEST ENGINEER Bash allowlist, Write limits), `rule` classification, `blocks.jsonl` log and the two incidents.md
escalations. New: `notes-name.js`, `guard-loader.js` (F4), `tools/critic-diff.mjs`. `.gitignore` +`.claude/logs/`,
`package.json` test:tools +3 files. `guard.js`, R4 and BUILDER logic untouched except as listed below.

**Decisions**
- Path checks use `fs.realpathSync.native` on the longest existing prefix, and every rule must hold for BOTH the path
  as written and the resolved one (a notes.md symlink to a harmless file is still blocked).
- `NOTES_NAME` widened to `/^(notes\.md(\..*)?|notes~\d+\.md)$/i`: `guard-next.test.js` requires `notes.md.orig` to
  block, which the old `notes\.md\.*` did not. Also `isNotes` strips an NTFS `:stream` suffix.
- R4 classification: `checkAll`/`scanForSecrets` return `critical(reason)` = `{reason, rule:'r4-critical'}` at the
  five critical sites (.env, prod refs, force push, staged .env, secret found); everything else stays a string and is
  classified by role. Nothing else in R4 changed.
- Third-reader-block count includes sessions with no `session_id` as one session `""` (literal spec). Harmless: it fires
  once per role ever for `""`.
- Loader: `process.exit` is wrapped so that a process that ends without the guard calling exit ends with code 2
  (otherwise a `main` that returns without exiting would exit 0). A main that throws after a successful load exits 2; it
  does not run the fallback (the guard may already have read stdin).
- Loader fallback root is `__dirname/../..`, not an env var.
- `critic-diff.mjs` exits 1 (no file) also when nothing reviewable remains (notes-only branch) and when `core.quotepath`
  odd/quoted headers cannot be parsed. Both `diff` and `--name-only` use `--no-renames` so the file sets compare 1:1.
- Small hardening in the readers part only: `..`/`../..` (above the root) counts like the root for Grep/Glob reach;
  Glob pattern with an absolute prefix is resolved correctly (old code joined it wrongly); TEST ENGINEER cannot
  Write/Edit a `notes.md` (Edit echoes a snippet of the file, so it would be a read).

**Deviations**
- Line count is 797, not ~600-675 (spec estimate). The old reader code was ~145 lines and the new ~150 (allowlist +
  write rules + logging + header). Spec said measure, not shrink; flagged for ORCHESTRATOR.
- `spec` R3 text says TOOL_CONFIG covers `playwright*`/`vitest*`; I used `(vitest|playwright)\.*` plus `*.config.*`,
  so a test file named `vitest-helpers.test.ts` is not caught as a config.
- TEST ENGINEER cwd must equal the project root for Bash (round 4 "run at the project root").

**Deliberately not done**
- settings.json, frontmatters, workflow, CLAUDE.md, skills, the swap. `guard.js` unchanged.
- Dangling symlinks are not followed (reading them fails anyway).

**Uncertain**
- File-symlink tests are skipped on this Windows machine (no symlink privilege): 5 tests. I verified the same code with
  directory junctions (scratch script, not committed): junction to app src / to `.work/<slug>` is blocked for
  Read/Grep, Write through a junction blocked. CI on Linux will run the 5 for real.
- Windows path folding (`fold` lower-cases) makes `FINDINGS.MD` writable for CRITIC there; same file, harmless.
- `path.matchesGlob` (used by `grepExcludesNotes`, unchanged) is experimental in Node 22.

**Preview path**    Not user-facing. Verify: `node --test .claude/hooks/guard-next.test.js .claude/hooks/guard-loader.test.js
tools/critic-diff.test.mjs`; run `node tools/critic-diff.mjs agent-slim main` on this branch and read the `review.diff`.
Known not to work yet: nothing calls the loader or `guard.next.js` until the swap.

**Neighbouring**
- Live `guard.js` R3 false positive: a Bash `sed -i ... package.json` whose replacement text names `*.test.js`
  files is blocked as "BUILDER changes test files" (it matches any test-looking name in the segment, not the target).
  One line landed in `incidents.md` (uncommitted, left in the working tree for ORCHESTRATOR: noise, not an incident).
- Guard tests take ~45 s for guard-next and ~55 s for the loader (a node process per case); may matter for CI time.

## Stage 1 — fixes for CRITIC I-1, I-3, I-4

**Approach**  I-1: `outsideRoot()` + `namedPaths()` in guard.next.js; `checkCritic` and `checkTestEngineer` refuse any non-Bash call whose path (as written or realpath-resolved, a Glob's literal prefix included) is still absolute after `path.relative` against the root, or starts with `..`. One check at the top of each role function covers Read, Grep, Glob, Write and Edit. I-3: escalate when the reader count is >= 3 and the role+session claims an exclusive flag file `.claude/logs/escalated-<sha1(role,session)>.flag` (`wx`, atomic), so a race cannot fire it twice or skip it. I-4: critic-diff.mjs removes `.work/<slug>/review.diff` right after argument validation; `.gitignore` gets `.work/*/review.diff`.
**Decisions**  The flag file, not a log line, records "already escalated": creation is atomic, a log read-then-append is not. It sits in the already-ignored `.claude/logs/`. If incidents.md is missing the flag is still claimed (as before, no line is written then). `..` paths are also blocked for the two readers, not only absolute ones.
**Deviations**  none.
**Deliberately not done**  guard.js, R4, BUILDER untouched. The R3 UNC write gap stays in debt.md as CRITIC advised.
**Uncertain**  Blocking `..` and symlinks resolving outside the root is stricter than before. The real-hook UNC probe was not rerun; the tests build the UNC form from the temp root.
**Preview path**  none (tooling).
**Neighbouring**  The live guard.js appended a line to incidents.md (uncommitted) when my chained add+commit was blocked: a non-critical r4 block reaching incidents.md, which the new guard.next.js no longer does.

## stage 5 — line budgets

**Approach**  `tools/line-budgets.json` + `tools/check-budgets.mjs` (pure `countLines`, `globToRegExp`, `validateConfig`, `checkBudgets`, CLI guard like vercel-ignore.mjs). Wired as `check:budgets` in package.json (`ci`, after `lint`) and as a step in the `lint` CI job.
**Decisions**  Exclude globs use a small local glob-to-regex (`*`, `**`) instead of `path.matchesGlob`, which is experimental in Node 22. alwaysRead existence is checked on disk, code files come from `git ls-files -z`; a tracked-but-deleted file is skipped. Stale-exception check uses testMax for test-named files.
**Deviations**  none. `test:tools` not touched, as instructed (ORCHESTRATOR wires the test file).
**Deliberately not done**  no test file; no change to any budget or file.
**Uncertain**  Argument parsing takes flag/value pairs only. Violations go to stderr (summary to stdout); tests must read both streams.
**Preview path**  none (tooling). `npm run check:budgets` prints `budgets: ok`.
**Neighbouring**  none.
