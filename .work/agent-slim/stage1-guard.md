# Stage 1 — guard: approach a–d (for CRITIC on opus, then Afik)

2026-10-13 · Afik's decision and corrections: `decisions.md`, 2026-10-13 "Agent-system slimming".
Replaces PR 6 (allowlist guard, 1337 lines, two `Not Ready` rounds: `.work/guard-allowlist/findings.md` on its branch).
Current guard: `.claude/hooks/guard.js` on main, 735 lines.

**The rules being protected — unchanged in meaning:**

- R1. CRITIC never reads `.work/<slug>/notes.md` (any case, any platform).
- R2. TEST ENGINEER never reads app implementation: `apps/<app>/src/**`, `apps/<app>/api/**`.
- R3. BUILDER never writes test files.
- R4. Everyone: no `.env` in a shell command, no prod/retired Supabase refs, no `git add -A`, no force/mirror push or
  remote delete, `git add` and `git commit` separate, secret scan of the staged diff before a commit.

Only the **mechanism** for R1 and R2 changes. R3 and R4 keep their code as is.

---

## a. Remove the shell from the readers

The old R1/R2 code tries to understand every shell spelling (≈300 lines; every PR found new spellings). Instead the
readers lose the shell, or keep only fixed commands, and the guard checks **paths** on the file tools.

### CRITIC

- **Tools:** `Read, Grep, Glob, Write, Skill`. **No Bash.** Frontmatter hook matcher `Read|Grep|Glob|Write`.
- **The diff:** ORCHESTRATOR runs `node tools/critic-diff.mjs <slug> [base]` before invoking CRITIC. The script:
  1. `git diff --name-only <base>...HEAD`, drops every path whose basename is `notes.md` in any case (and any
     `.work/**` path except `.work/<slug>/spec.md`, `schema.md`, `bug.md`, `findings.md`);
  2. `git diff <base>...HEAD -- <the kept files, literal pathspecs>` into `.work/<slug>/review.diff`;
  3. fails closed (exit 1, no file) if the output still contains a `diff --git` header naming `notes.md` in any case.
- **Path checks (guard, role critic):**
  - `Read`: blocked if the path, resolved through `..` and existing symlinks (`fs.realpathSync` on the longest
    existing prefix), has basename `notes.md` in any case. `review.diff` and everything else is allowed.
  - `Grep`: blocked if its path is a `notes.md`, or if its scope reaches `.work` (the root, an ancestor, or inside)
    and its `glob`/`type` can match `notes.md` (existing `grepExcludesNotes`, unchanged).
  - `Glob`: allowed. It returns file names, not content.
  - `Write`: allowed only to `.work/<slug>/findings.md` (any slug). Anything else blocked.
- CRITIC keeps every reading power it needs: Read of any source file, Grep, Glob, and the prepared diff. It loses
  running commands; CI already runs typecheck · tests · lint · RLS checks, and CRITIC reads CI's result.

### TEST ENGINEER

- **Tools:** `Read, Grep, Glob, Write, Bash`. Hook matcher `Read|Grep|Glob|Write|Edit|Bash`.
- **Read/Grep/Glob:** blocked if the path (resolved as above) is in `apps/<app>/src|api` or is a `notes.md`;
  Grep/Glob blocked if the scope reaches app implementation (existing `reachesAppImpl`), unchanged.
- **Write/Edit:** allowed only in test areas (`apps/*/tests`, `packages/*/tests`, `e2e`, `supabase/tests`, a
  `*.test.*`/`*.spec.*` file) and `.work/<slug>/`. **Not** `package.json`, configs, or `tools/` — otherwise a new
  npm script would be a shell.
- **Bash — allowlist of exact commands.** The command is split into segments (existing `shellSegments`). Every
  segment must match one of:

  | form | example |
  |---|---|
  | `npm test` / `npm run <script>` where script ∈ {`test`, `test:*`, `ci`, `typecheck`, `lint`} [`-w <ws>`/`--prefix <dir>`] | `npm run ci` |
  | `npx vitest run [paths in test areas] [flags]` · `npx playwright test [paths in test areas] [flags]` | `npx vitest run apps/web/tests/a.test.ts` |
  | `node --test <paths in test areas or tools/*.test.mjs>` | |
  | `git status` · `git log --oneline [-n N]` · `git add <paths in test areas or .work/<slug>/>` · `git commit -m/-F …` | |
  | output filters at the end of a pipe: `tail [-n N]`, `head [-n N]` · `echo "…$?…"` | `npm run ci 2>&1 \| tail -40; echo "exit=$?"` |

  Plus: no `$…`/backtick expansion except `$?` (outside single quotes); the only redirection is `2>&1`; no `cd` except
  to the project root. Anything else is blocked with the list of allowed forms.

### What is deleted

`recursiveSearch`, `withoutExclusions`, `GIT_READS_CONTENT`, `showsPatch`, `gitReadsContent`, `COVERS_NOTES*`,
`excludesNotes`, and the Bash half of `checkReader` (≈130 lines on main). Estimate after a: ≈560–600 lines
(shell parsing and the R3/R4 code stay). Per Afik: measure after the simplification; split into modules only if it is
still over 400.

### The known gap (Afik: no mechanism)

TEST ENGINEER writes the tests it runs. A test can `fs.readFileSync('apps/web/src/…')` or read `notes.md` and print
it — no path check sees that. The same gap exists today. **CRITIC checks in every review** that TEST ENGINEER's tests
read no source file and no `notes.md` (a line in critic.md's checklist). Recorded in `debt.md` as a known gap.

---

## b. Develop on `guard.next.js`, swap on merge, a loader that falls back

- `settings.json` and both frontmatters call `node .claude/hooks/guard-loader.js <role>` (≈40 lines, changes rarely).
- The loader `require`s `./guard.js` and calls its `main()`. If loading fails (missing file, syntax error, throws at
  load, no `main` export), it loads the guard from `git show origin/main:.claude/hooks/guard.js` (the last merged
  version, which passed CI) and runs that. If that fails too, it blocks (exit 2) with "guard could not load".
- A guard change is developed in `guard.next.js` with its tests pointed at it; the active `guard.js` does not change
  while the work is in progress. The PR's last commit moves `guard.next.js` over `guard.js`; CI runs the tests on
  `guard.js`; then merge. A broken work-in-progress cannot lock the session.
- The fallback covers a guard that does not load. A guard that loads and blocks wrongly is not detected — that is what
  its tests and CRITIC are for.

## c. Two `Not Ready` on one task → stop

New line in `.claude/workflow.md` → Verdicts: after the second `Not Ready` (from either reviewer) on the same task,
ORCHESTRATOR does not send it back to BUILDER a third time. It writes a short impact note and files a `BLOCKER` to
Afik about the approach. (PR 6 would have stopped here.)

## d. Correct blocks to a separate local log

- `report()` appends `{time, role, tool, reason}` as one JSON line to `.claude/logs/blocks.jsonl`, which is in
  `.gitignore`. Never the command (it may hold a secret) — as today.
- `/wrap-up` reads the log since the task began and writes one count line per role+reason into `result.md`.
- `incidents.md` keeps real failures only. The ≈70 block lines move to `archive/incidents-blocks-2026-10.md` (not
  deleted).
- `CLAUDE.md` → "Report material failures": "a hook blocked an action" becomes "a hook blocked legitimate work (a
  false block → `noise.md`)"; correct blocks are counted by `/wrap-up`. `critic.md`:36 changes to match.
  (Afik's decision, 2026-10-13.)

## Carried over from PR 6 before it closes

`.work/guard-allowlist/` (bug.md, findings.md, notes.md), its `decisions.md`, `escapes.md` and `incidents.md`
lines. `debt.md` lines 40, 43, 44, 45 (shell spellings around R1/R2) are marked paid by a when it merges; line 34
(TEST ENGINEER false positives) too.

## Pipeline for the implementation (after Afik approves)

Elevated (a guardrail). TEST ENGINEER writes the failing tests for a–d against `guard.next.js` from this file →
BUILDER implements → CI → CRITIC on opus on `review.diff` → swap commit → CI → merge. TEST ENGINEER runs under the
current guard while doing so.

---

## The ask to CRITIC

Does a, as written, open a path for CRITIC to read any `notes.md` or for TEST ENGINEER to read `apps/*/src|api` that
the current guard closes — other than the known gap above? Check especially: the `critic-diff.mjs` filter; Read through
symlinks and case; Grep scope; TEST ENGINEER's Write limits and the Bash allowlist (npm scripts, `npx`, `node --test`,
`git`); the loader's fallback (can it be made to load something else?). Also: does b, c or d change a rule's meaning
beyond what Afik decided?

---

# Round 2 — changes after CRITIC round 1 (`stage1-findings.md`, Not Ready)

Everything above stands except where a line below changes it. Numbers are CRITIC's findings.

**F1 (high) — `tail`/`head` take no file.** They are allowed only after a `|`, with `-n N` / `-N` only; any other
argument blocks. **And** the existing argument scan (every non-flag argument of every allowlisted segment resolved
where it runs, a glob judged by `literalPrefix` + `reachesAppImpl`, plus the `notes.md` name check) still runs over
every allowlisted segment. The allowlist is in addition to the scan, not instead of it.

**F2 (high) — runners keep the glob-reach judgement; flags are a fixed list.**
- Every path or glob argument to `node --test`, `npx vitest run`, `npx playwright test` is judged by the existing
  reach logic (as F1). A glob whose literal prefix is not inside a test area blocks (`'**/s*/a.ts'` → prefix '' → blocks).
- `npx` must be followed directly by `vitest` or `playwright` — no npx options (`-p`, `--package`, `-c`, `--call`, `-y`).
- Flags allowed, nothing else: vitest `run`, `-t`/`--testNamePattern <s>`, `--reporter=<default|verbose|dot>`,
  `--bail[=N]`, `--no-color` · playwright `test`, `--project=<name>`, `-g`/`--grep <s>`, `--reporter=<list|line|dot>`,
  `--workers=N` · node `--test`, `--test-name-pattern=<s>`, `--test-reporter=<spec|dot|tap>`. No `--config`, `--root`,
  `--dir`, `--outputFile`, reporter-to-file.

**F3 (medium) — npm targets and the Write rule are coupled, stated and tested.**
- `--prefix <dir>` / `-w <ws>` only to the project root or a workspace listed in the root `package.json`
  (`apps/*`, `packages/*` as they exist on disk). Anything else blocks.
- TEST ENGINEER Write/Edit: test files in test areas, and `.work/<slug>/*.md`. Blocked everywhere, test areas
  included: `package.json`, `.npmrc`, `*.config.*`, `tsconfig*.json`, `playwright*`/`vitest*` configs. This rule is a
  precondition of the npm and runner allowlist; the doc and the guard header say so, and tests cover both.

**F4 (high) — the loader cannot fail open.**
- Its first statements install `uncaughtException` and `unhandledRejection` handlers that exit 2. Every path that is not
  the guard's own `exit(0)` ends in `exit(2)`.
- The fallback runs `git show origin/main:.claude/hooks/guard.js` (fixed string, no interpolation) with a 10 s timeout,
  and executes it in memory (`new Module(...)._compile`), never via a temp file.
- Stated plainly: the fallback is "the last **fetched** main", which can be older than main's tip.
- Tests: guard.js throws at load + fallback fails → exit 2; guard.js has a syntax error + fallback works → the fallback's
  verdict; loader itself made to throw → exit 2.

**F5 (medium) — (d) visibility: a decision for Afik.** See "Question for Afik" below. Until he answers, the
implementation keeps the current behaviour for the reader rules (see default).

**F6 (medium) — CRITIC keeps a hook backstop.** `checkReader('critic', 'Bash')` blocks every Bash call ("CRITIC has no
shell; read `.work/<slug>/review.diff`"). The frontmatter matcher stays `Read|Grep|Glob|Bash|Write`. So R1 does not
rest on the tools list alone.

**F7 (low) — one notes definition.** `guard.js` exports `NOTES_NAME`; `critic-diff.mjs` imports it. The script exits 1
if any `diff --git` header contains `notes` + `.md` in any case (substring), or if the file set in the diff differs from
the kept `--name-only` set.

**Concerns accepted:**
- The `debt.md` line for the known gap is written broadly: every allowed runner (`tsc`, `eslint`, `vitest`,
  `node --test`) can print source lines on error, and a test can read any file at run time. R2 is a fence against casual
  reading; CRITIC checks every TEST ENGINEER test for file reads (critic.md checklist line).
- (c) reads: "after the second `Not Ready` on one task, ORCHESTRATOR files a `BLOCKER` to Afik about the approach and
  sends nothing back to BUILDER until he answers." It never means "ships after two".

## Question for Afik (F5)

Under (d) as first written, a **correct** block becomes a silent count. CRITIC's point: a correct block of a reader
rule (R1/R2) or of prod/secret/.env/force-push (R4) is also the only sign of an agent probing the fence.

Proposed default (used unless Afik says otherwise):
- Every block goes to the local `.claude/logs/blocks.jsonl` and `/wrap-up` counts it — as decided.
- **Escalation to Afik (an `incidents.md` line) only when:** any R4 prod/secret block; or the same role hits an R1/R2
  block **3+ times in one task** (CLAUDE.md already treats three repeats as material). Everything else stays a count.
- After a, CRITIC has no shell, so most of today's 70 lines (CRITIC notes.md spellings) cannot occur any more.

# Round 3 — CRITIC round-2 lows folded in (verdict on round 2: Validated with Concern)

- **R2-1:** npm forms take no arguments after `--` (`npm test -- …`, `npm run <script> -- …` block). Recorded in
  `debt.md` with the known gap.
- **R2-2:** the notes-file name lives in one small module, `.claude/hooks/notes-name.js` (`NOTES_NAME`, no side
  effects), imported by `guard.js` and `critic-diff.mjs`. The script tests each diff path's **basename** against it, not
  a substring, so `docs/release-notes.md` passes.
- **R2-3:** a Grep whose path is one existing file that is not a notes name is allowed for both readers, in `.work`
  too. So legitimate reads do not feed the F5 threshold.
- TEST ENGINEER writing another slug's `.md` (integrity, not a read path): recorded in `debt.md`, no mechanism now.

# Round 4 — Afik's approval and conditions (2026-10-13). This is the spec for the implementation.

Approved: rounds 1–3 and the F5 default. **Scope: a only** (plus b, c, d). R4 and BUILDER code are not touched.
Conditions, which override the TEST ENGINEER Bash text of rounds 1–3:

- **TEST ENGINEER reads only with Read/Grep/Glob.** No `tail`, `head`, `cat`, `git` or `npm` in Bash. ORCHESTRATOR
  commits TEST ENGINEER's tests.
- **TEST ENGINEER Bash = one test run with explicit file paths, no globs.** The whole command must be:
  - one of `npx vitest run …`, `npx playwright test …`, `node --test …`, run at the project root;
  - every token matching `^[A-Za-z0-9._/:=@+-]+$` — so no quotes, spaces inside a token, `$`, backtick, `;`, `|`, `&`,
    `<`, `>`, `(`, `)`, `*`, `?`, `[`, `]`, `{`, `}`, `~`, `!`, `\`, newline; anything else blocks;
  - every non-flag token: a relative path (no `..` segment) to an **existing file** whose name matches the test-file
    pattern (`*.test.*` / `*.spec.*`) and that does not resolve (realpath) into `apps/*/src|api` or to a notes name;
  - flags only in `--name=value` form, from: vitest `--reporter=default|verbose|dot`, `--bail=N`, `--no-color`,
    `--testNamePattern=<token>` · playwright `--project=<token>`, `--grep=<token>`, `--reporter=list|line|dot`,
    `--workers=N` · node `--test-name-pattern=<token>`, `--test-reporter=spec|dot|tap`.
  The npm forms, `--prefix`/`-w`, `tail`/`head` and git forms of rounds 1–3 are dropped (so R2-1 is moot).
- TEST ENGINEER Write/Edit limits (F3) stay as in round 2.
- Not significantly shorter than 735 lines is accepted (estimate ≈675): the goal was a simpler readers part and no
  lock-out, not a line count.

## Round 4 — implementation details fixed by ORCHESTRATOR (internal how, no rule change)

- **Files:** `.claude/hooks/guard.next.js` (the new guard, same CLI `node guard.next.js <role>`, same stdin JSON, same
  exports plus `main`) · `.claude/hooks/guard-loader.js <role>` (loads `./guard.js`) · `.claude/hooks/notes-name.js`
  (exports `NOTES_NAME`) · `tools/critic-diff.mjs <slug> [base]` (writes `.work/<slug>/review.diff`; base defaults to
  `main`).
- **Block log (d, F5):** every block appends one JSON line `{"time","role","tool","rule","reason","session"}` to
  `<root>/.claude/logs/blocks.jsonl` (directory created if missing; `session` = the hook input's `session_id`, or "").
  `rule` is one of `reader` (R1/R2 and the CRITIC/TEST ENGINEER tool limits), `r4-critical` (.env, prod/retired refs,
  force/mirror push or remote delete, secret found), `r4` (other R4), `builder`. An `incidents.md` line is appended only
  for `r4-critical`, and for the **third** `reader` block with the same role and session (once per role+session). A
  failed log write never changes the block.
- **CRITIC's Write:** only `.work/<slug>/findings.md`, and `.work/<slug>/*-findings.md`.
