# Findings — stage1-guard approach a–d (CRITIC on opus, 2026-10-13)

Review: CRITIC (cold), design review of `.work/agent-slim/stage1-guard.md` (approach, not a diff). Elevated — a
guardrail change. Compared against the current guard `.claude/hooks/guard.js` on main (735 lines), `settings.json`,
the two agent frontmatters, `package.json` scripts, `debt.md` 29–46, and the two prior `Not Ready` rounds of PR 6
(`origin/claude/guard-allowlist-implementation-xcv55m:.work/guard-allowlist/findings.md`). notes.md not read.
Method: read the approach literally, traced each allowed form against the current guard's helpers to separate a
*regression* (the current guard closes it, approach a as written opens it) from a *pre-existing* gap. The PR 6
findings describe a different allowlist design, but findings 8/9 and G.19 of that round describe classes the
proposed TE allowlist reproduces.

```
verdict: Not Ready
```

## Summary of the ask

1. CRITIC side is strictly narrower — removing Bash from CRITIC closes, not opens, R1 paths (it even retires debt
   41/43/44/45, which were all CRITIC shell git-read bypasses). The remaining CRITIC risk is concentrated in the new
   trusted script `critic-diff.mjs` and in losing the hook backstop (F6, F7). The TE side keeps Bash behind an
   allowlist, and the allowlist as written reopens R2 in two concrete ways the current guard closes (F1, F2).
2. The (b) loader can fail open on a loader-level crash and its fallback source handling is under-specified (F4).
3. (d) changes a rule's meaning in a security-relevant way the doc under-states (F5). (b) and (c) do not.
4. Shells inside the TE allowlist: `npm run ci|test|...` scripts, `npx` resolution, `node --test`, and `tail/head`
   file args — F1, F2, F3.

--- finding F1 ---
severity: high
file:     .work/agent-slim/stage1-guard.md:59 (TE Bash allowlist, output filters)
claim:    `tail`/`head` are allowed as end-of-pipe filters, but they also take a file argument. If the allowlist
          permits a `tail`/`head` segment without forbidding a path argument, `tail <file>` reads that file — and the
          current guard blocks exactly this for TEST ENGINEER.
failure:  TEST ENGINEER: `tail apps/web/src/a.ts` or `head -n 200 apps/web/api/route.ts` → prints app implementation.
          Current guard (checkReader TE Bash, guard.js:541-553) resolves every non-flag arg of every segment against
          isAppImpl and blocks it today; the proposed allowlist, read literally ("tail [-n N]"), would let the segment
          through on its command name. This is a regression of R2, not a pre-existing gap.
fix:      In the allowlist, accept `tail`/`head` only with no path operand (flags `-n N` only); any remaining non-flag
          argument blocks. Equivalently, keep the existing isAppImpl/notes arg-scan running over every allowlisted
          segment so a file operand is still judged.
--- end ---

--- finding F2 ---
severity: high
file:     .work/agent-slim/stage1-guard.md:56-57 (npx vitest/playwright, node --test "paths in test areas")
claim:    The allowlist pins paths "in test areas" but says "[flags]" are free and does not state that a glob or
          directory argument is judged by its reach. A quoted glob is expanded by the tool/runtime, not the shell, so
          the guard sees it literally; node/vitest/playwright then print offending source lines on error.
failure:  TEST ENGINEER, as PR 6 finding 8 demonstrated and reproduced on 3 platforms:
          `node --test '**/s*/a.ts'` → node prints the failing source frame of app code;
          `npx vitest run '**/src/*.ts'` / a directory arg → vitest collects and errors on app files, printing frames.
          The current guard blocks these today: literalPrefix of `**/...` is '' → `glob && reachesAppImpl('')` →
          blocked (guard.js:549-551). An allowlist that only checks "is this string lexically under a test area"
          drops that reach logic → regression of R2.
fix:      Keep the current glob-reach judgement (literalPrefix + reachesAppImpl, and the darwin/win case folding) for
          every path/glob argument to `node --test`, `npx vitest run`, `npx playwright test`. Constrain `[flags]`:
          reject `--config`/`-c`/`--project`-to-arbitrary-file/`--reporter`-to-file and `npx` package-selection flags
          (`-p/--package`, `-c/--call`) that appear before the tool name. Add a block case per form.
--- end ---

--- finding F3 ---
severity: medium
file:     .work/agent-slim/stage1-guard.md:55 (npm forms with `--prefix <dir>` / `-w <ws>`)
claim:    `npm --prefix <dir> run <script>` runs the *target directory's* package.json scripts. The safety of the npm
          forms rests entirely on the coupled rule "Write/Edit may not create package.json/config anywhere." If that
          rule has any gap, `--prefix` to a dir whose package.json TE wrote turns a safe script name into a shell.
failure:  If TE could write any `package.json` (e.g. under `.work/<slug>/`, which Write otherwise allows), then
          `npm --prefix .work/<slug> run test` runs that file's `test` script = `tail apps/web/src/a.ts`. The doc does
          forbid writing package.json — so this is contained *only* by that one Write exclusion. The two rules must be
          enforced together, and `--prefix`/`-w` should still be constrained to the repo root or an existing workspace.
fix:      State explicitly that the no-package.json / no-config Write rule is a load-bearing precondition of the npm
          allowlist, and constrain `--prefix`/`-w` targets to the project root or a known workspace list. Add a test
          that writing package.json anywhere is blocked, and that `--prefix` to a non-workspace dir is blocked.
--- end ---

--- finding F4 ---
severity: high
file:     .work/agent-slim/stage1-guard.md:80-84 (b, guard-loader.js)
claim:    The harness blocks a PreToolUse call only on exit 2; any other exit code lets the call through (guard.js
          header, lines 8-12). The loader's own code — the `require`, the `git show` fallback, the "run that" step —
          can throw and exit 1, which fails OPEN. The doc guarantees the *final* fallback exits 2 but not that a crash
          anywhere in the loader does.
failure:  guard.next→guard.js swap commit lands with a syntax error (the exact case the fallback exists for); the
          loader catches the require failure, runs `git show origin/main:...`, but `git show` throws (detached repo, no
          origin, timeout) and the catch path itself throws before the exit-2 — Node exits 1 — the tool call runs with
          NO guard. R1/R2/R4 all off for that call.
fix:      The loader's first statements must be `process.on('uncaughtException'|'unhandledRejection', () => exit(2))`
          and the whole body wrapped so every path that is not an explicit guard `exit(0)` ends in `exit(2)`. Give the
          `git show` a timeout. Specify that the fallback source is executed in-memory (`module._compile` on a fresh
          Module), never written to a temp file a concurrent call could swap, and pin the ref to the exact
          `origin/main:.claude/hooks/guard.js` with no interpolation. Add a test: loader with a throwing guard.js and
          a failing fallback must exit 2.
--- end ---

--- finding F5 ---
severity: medium
file:     .work/agent-slim/stage1-guard.md:98-106 (d) and critic.md:36 / CLAUDE.md "Report material failures"
claim:    Today every block is an incidents.md line and CLAUDE.md reports "a hook blocked an action" to Afik. Approach
          (d) reframes it so only a *false* block reaches Afik (→ noise.md) and a *correct* block is a silent count in
          a `.gitignore`d local file. A correct block of an attempted R1/R2 breach (a reader probing the fence) is a
          correct block → it becomes a silent counter, not a reported incident or a tracked-in-VCS record.
failure:  A reader agent repeatedly attempts `tail apps/web/src/...`, `git show ...notes.md`, etc. Each is correctly
          blocked. Under (d) none surfaces to Afik and none is in version control — only a per-reason count in
          result.md. The one signal that an agent is attacking the guardrail is downgraded exactly where it matters.
          The doc attributes (d) to Afik, but the loss of breach-attempt visibility is not stated; it reads as a
          noise-reduction change.
fix:      Keep correct blocks of the reader rules (R1/R2) and of R4 prod/secret rules reportable to Afik (or at least
          in a VCS-tracked log), and send only ordinary over-blocks of everyday commands to the silent count. Make the
          distinction explicit in the doc so Afik is deciding the visibility trade, not just the log location. Ensure
          `report()` still never fails the block when the log write fails, and creates `.claude/logs/` if absent.
--- end ---

--- finding F6 ---
severity: medium
file:     .work/agent-slim/stage1-guard.md:66 ("deletes ... the Bash half of checkReader")
claim:    R1 for CRITIC would then rest solely on the tools frontmatter omitting Bash. The settings "all" hook still
          runs checkReader('critic', ...) for any tool it matches (Bash included), but with the Bash half deleted it
          returns null for a CRITIC Bash call — so if Bash is ever re-added to CRITIC's tools by mistake, a
          `git show …notes.md` passes checkAll and runs. Defense-in-depth (hard rule 1) is lost at the hook layer.
failure:  A later edit adds Bash back to critic.md tools (plausible; frontmatter is hand-edited). CRITIC then runs
          `git show <base>:.work/x/notes.md` → checkReader('critic','Bash') = null, checkAll allows it → notes.md read.
fix:      Keep a one-line checkReader('critic','Bash') that blocks ALL Bash for role critic ("CRITIC has no shell; use
          the prepared review.diff"). By design CRITIC never calls Bash, so a blanket block costs nothing and restores
          the backstop. Mirror the frontmatter matcher to include Bash so the frontmatter hook also covers it.
--- end ---

--- finding F7 ---
severity: low
file:     .work/agent-slim/stage1-guard.md:27-31 (critic-diff.mjs) and guard.js:91 (isNotes)
claim:    critic-diff.mjs becomes the single trusted producer of what CRITIC reads. Its drop rule ("basename notes.md
          in any case") must match the guard's isNotes, which also covers `notes.md.*` and `notes~\d+\.md`. If the
          script's notes definition is narrower than the guard's, an editor-backup variant could slip into review.diff;
          if wider, nothing breaks. Also the step-3 backstop checks only the `diff --git` header text.
failure:  A `.work/x/notes.md~` or `notes.md.orig` holding the same reasoning is kept by name-only, lands in the diff;
          step 3 catches it only if "naming notes.md in any case" is a substring test (it would, since the path
          contains "notes.md"). Narrow window, hence low.
fix:      Reuse the guard's exact NOTES_NAME regex in critic-diff.mjs. Run step 3 as a substring test for "notes.md"
          (any case) on every `diff --git` header AND exit 1 if --name-only and the final diff file set disagree.
--- end ---

## Concerns (ship-aware, not blocking by themselves)

- The known gap as written ("a test that reads files at run time") understates the surface. Every allowed runner —
  `tsc`, `eslint .` (npm run lint/ci), `vitest`, `node --test` — prints offending *source* lines on error, so R2 is a
  fence against casual reading via npm scripts, not only via a hand-written test. Record that broader framing in
  `debt.md` next to the test-runtime gap, else the gap looks smaller than it is. (Not a regression: the current guard
  allows `npm run lint`/`ci` too.)
- (b): `origin/main` is only as fresh as the last fetch; the fallback may run a guard older than main's tip. Acceptable,
  but state it — the fallback is "last fetched main," not "last merged."
- (c): no rule-meaning change; it adds an escalation consistent with CLAUDE.md "repeated the same failure three times."
  Confirm it reads as "stop and BLOCKER to Afik," never "ships after two Not Ready."

## What a, b, c, d get right (so it is not re-litigated)

- Removing Bash from CRITIC closes debt 41/43/44/45 (all CRITIC shell git-read spelling bypasses) outright, and the
  realpathSync-on-longest-prefix Read resolution closes the current symlink bypass of isAppImpl/isNotes for Read.
- The allowlist shape (deny-by-default per segment) is the right direction and is what PR 6 round 1 finding 2 asked
  for; it is strictly stricter than today on unrecognised commands.
- (b) swap-on-merge and (c) two-strikes are sound and change no rule's meaning.

Round 1 return: Not Ready — 3 high (F1, F2, F4), 3 medium (F3, F5, F6), 1 low (F7). Next owner was ORCHESTRATOR.

---

# Round 2 re-check (CRITIC on opus, 2026-10-13)

Scope: only F1–F7 and the round-1 concerns, against "Round 2" in `stage1-guard.md` (lines 130–194). I also checked
whether the round-2 text opens anything new. notes.md not read.

```
verdict: Validated with Concern
```

## Status of each finding

| # | sev | status | basis |
|---|---|---|---|
| F1 | high | **closed** | `tail`/`head` only after `|`, `-n N`/`-N` only, any other arg blocks; and the existing arg scan (isAppImpl, glob reach, notes name) runs over every allowlisted segment, in addition to the allowlist. Two layers; `tail apps/web/src/a.ts` blocks on both. |
| F2 | high | **closed** (one residual, R2-1 below) | Path/glob args to the three runners go through literalPrefix + reachesAppImpl; `'**/s*/a.ts'` blocks. `npx` must be followed directly by `vitest`/`playwright`; npx options blocked. Fixed flag list per runner, no `--config/--root/--dir/--outputFile`, reporters restricted to built-ins. |
| F3 | medium | **closed** | `--prefix`/`-w` only to the root or an existing `apps/*`/`packages/*` workspace. Write blocks `package.json`, `.npmrc`, `*.config.*`, `tsconfig*.json`, vitest/playwright configs everywhere; `.work/<slug>/` narrowed to `*.md`. Coupling stated and tested. TE cannot create a workspace (no package.json) and cannot drop a runnable script in `.work`. |
| F4 | high | **closed** | Handlers for `uncaughtException` and `unhandledRejection` → exit 2 as the first statements; every non-`exit(0)` path ends in exit 2; fixed ref string, 10 s timeout, in-memory `_compile`, no temp file; the three tests named. I traced the paths: guard.js throws at load → fallback; fallback fails → exit 2; guard.js loads but `main()` throws → guard's own handler/loader handler → exit 2; no `main` export → fallback. No exit-1 path remains. Stale-fetch is stated. |
| F5 | medium | **moved to Afik**; the default answers my concern | See "F5 default" below. |
| F6 | medium | **closed** | `checkReader('critic','Bash')` blocks every Bash call, and the frontmatter matcher includes Bash. R1 no longer rests on the tools list alone. |
| F7 | low | **closed** (with a new over-block, R2-2 below) | One NOTES_NAME, imported by the script; header substring check plus file-set equality. |
| concern: known gap framing | — | **closed** | debt line written broadly (every runner prints source lines; a test reads any file). |
| concern: (c) wording | — | **closed** | "sends nothing back to BUILDER until he answers"; never "ships after two". |
| concern: stale fallback | — | **closed** | stated in F4. |

## F5 default — does it answer the concern?

Yes, enough. My concern was that a reader probing the fence would become invisible. Under the default, every R4
prod/secret block escalates, and R1/R2 escalate at 3+ per role per task. `/wrap-up` writes the counts into
`result.md`, which is committed, so the record is in version control again. The 3-per-task threshold lets a careful
agent try two spellings per task unseen. That is acceptable because every R1/R2 block is still counted, and with
CRITIC shell-less there are few legitimate R1 blocks to hide among. It is Afik's decision. One input for him: today the
threshold would also count false positives. In this session, my own Grep with `path` = `.work/agent-slim/stage1-guard.md`
(one named file, not a notes file) was blocked by the R1 Grep rule, because a path inside `.work` "reaches .work" and
has no glob. So a CRITIC doing legitimate work could hit 3 R1 blocks and trip the escalation. See R2-3.

## New in round 2

--- finding R2-1 ---
severity: low
file:     .work/agent-slim/stage1-guard.md:55 (npm forms) with :141-148 (F2 flag lists)
claim:    The F2 fixed flag lists bind direct `npx vitest` / `npx playwright` / `node --test` calls, but nothing says
          what happens to arguments after `npm test --` / `npm run <script> --`. npm appends them to the script's
          command, so `--config`, `--root`, `--dir`, a reporter path or eslint `--format <file>` reach the runner
          through the npm form. The F2 list can be routed around. (I did not raise this in round 1 either. It was
          PR 6 finding 9's class.)
failure:  TEST ENGINEER: `npm run lint -- --format apps/web/tests/fmt.test.js` makes eslint load and run a file TE
          wrote in a test area. `npm test -- --config apps/web/tests/x.test.ts`-style passthrough does the same for
          the runner config. Path arguments after `--` that name app source are still blocked by the F1 arg scan,
          because it does not stop at `--`. So the result is "run code TE wrote", which the known gap already
          concedes (a test reads any file at run time). That is why this is low, not high.
fix:      Refuse arguments after `--` on every npm form (simplest), or run them through the same per-runner flag
          list. Add a block case. Without this, the F2 flag list is decorative for anyone who goes through npm.
--- end ---

--- finding R2-2 ---
severity: low
file:     .work/agent-slim/stage1-guard.md:173-175 (F7, substring check)
claim:    The substring test "`notes` + `.md` in any case" on every `diff --git` header over-blocks. Any changed file
          whose path contains both, such as `docs/release-notes.md` or `notes-and-md.ts`, makes the script exit 1.
          CRITIC then gets no diff for that change. It fails closed, so this is noise, not exposure. Also, importing
          `NOTES_NAME` from `guard.js` runs guard.js's top-level `uncaughtException` handler inside critic-diff.mjs,
          so any script error prints "Blocked by .claude/hooks/guard.js: guard error". That message is misleading.
failure:  A PR that edits `docs/release-notes.md`: critic-diff.mjs exits 1, ORCHESTRATOR cannot prepare the review,
          and the error message points at the guard.
fix:      Apply `NOTES_NAME` to the basename of each header path (a/ and b/), which is what the guard itself does.
          Keep the file-set equality check. Move `NOTES_NAME` into a tiny side-effect-free module (e.g.
          `.claude/hooks/notes-name.js`) that both guard.js and the script import.
--- end ---

--- finding R2-3 ---
severity: low
file:     .claude/hooks/guard.js:493-500 (Grep rule, unchanged by the approach) — relevant to the F5 default
claim:    A CRITIC Grep whose `path` is one named regular file inside `.work` that does not match NOTES_NAME is
          blocked, because a file path inside `.work` counts as "reaching .work" and no glob/type is given. This
          predates the approach. It matters now because the F5 default counts R1 blocks toward an escalation
          threshold.
failure:  Observed in this session: Grep pattern "Round 2", path `.work/agent-slim/stage1-guard.md` → blocked
          "CRITIC does not read notes.md". Three such legitimate calls in one task would escalate to Afik as a probe.
fix:      In the Grep rule, allow a path that resolves (realpath, as for Read) to an existing regular file whose
          basename does not match NOTES_NAME. Apply the reach test only to directories. Add an allow case and a block
          case (the same with `notes.md`, and with a symlink to it).
--- end ---

Nothing else new. Specifically:
- F2 lists: `-t/--testNamePattern <s>`, `-g/--grep <s>` take a value the F1 arg scan will treat as a path. A pattern
  containing `*` or `apps/web/src` over-blocks. That is noise, not a bypass. `--project=<name>` selects projects defined
  in the repo's playwright config, which TE cannot write.
- F3 Write limits: `.work/<slug>/*.md` lets TE write any slug's .md, including another role's findings.md. That is an
  integrity question, not a read path. It is not new (round 1 allowed all of `.work/<slug>/`; the current guard has no
  TE Write rule at all), so it is outside this re-check. ORCHESTRATOR may want it in debt.md.
- F4 loader: no fail-open path remains, and the ref cannot be steered without a write to `.git/`, which neither reader
  role can make (no redirection, no `.git` Write).

Concern for debt.md, which is why the verdict is "with Concern": R2-1. While args after `--` pass on npm forms, the F2
flag list does not hold for runs that go through npm. The cost: the next guard bypass report against R2 will come in
through `npm … --`, and it will look like a new class when it is not.

---

Done — re-checked F1–F7 and the round-1 concerns against Round 2. All closed except F5, which moves to Afik; its default answers the concern. Three new lows.
Artifact — `C:\Users\Afik\nestly\.work\agent-slim\stage1-findings.md` ("Round 2 re-check")
Findings — verdict Validated with Concern. R2-1 low (npm `--` passthrough routes around the F2 flag list; the cost goes to debt.md). R2-2 low (the notes substring over-blocks paths like `release-notes.md`; importing from guard.js installs its handler). R2-3 low (pre-existing false positive: a Grep on one named non-notes file in `.work` is blocked, and it would feed the F5 threshold).
Open — F5 is a DECISION REQUEST reserved for Afik. The proposed default is acceptable to CRITIC. Input for him: R2-3 would make the 3-per-task threshold count false positives.
Next owner — ORCHESTRATOR (take F5 to Afik, put R2-1 in debt.md, fold R2-1..3 into the approach or the implementation tests; a re-check of R2-1..3 comes back to me).

---

# Implementation review (CRITIC on opus, 2026-10-13)

Scope: branch `chore/agent-slim-1-guard` as `.work/agent-slim/review.diff` (from `node tools/critic-diff.mjs agent-slim
main`), against Round 4 and its implementation details, and rounds 1–3 where Round 4 does not override them.
`guard.next.js` compared with the live `.claude/hooks/guard.js` by Read, function by function. Also read:
`.claude/settings.json` and the critic/test-engineer frontmatters (wiring). No Bash used. notes.md not read.
One probe, to check reachability for I-1: Glob (names only, allowed for CRITIC) of `CLAUDE.md` at
`\\localhost\c$\Users\Afik\nestly`. It returned `\\localhost\c$\Users\Afik\nestly\CLAUDE.md`. No content was read
through that path.
Line numbers below are file lines (`guard.next.js` line 1 = diff line 929).

```
verdict: Not Ready
```

One high (I-1). It is pre-existing: `guard.js` has the same gap, at lines 478 and 485. But in this stage the path
check is the whole fence for CRITIC, and this diff rewrote that check for exactly this class of problem (aliases of a
path: symlinks, `..`, paths at or above the root).

## 1. Earlier findings and Round 4 conditions

| item | status | basis |
|---|---|---|
| F1 | **moot** | Round 4 removed `tail`/`head`. The TE charset `^[A-Za-z0-9._/:=@+ -]+$` (guard.next.js:550) cannot express a pipe. A test covers it. |
| F2 | **closed**, with a low residual (I-5) | No glob characters can appear. Flags are only the fixed `--name=value` list (528–541). `npx` must be followed directly by `vitest run` / `playwright test`. Arguments are checked as relative paths to existing test files, with no `..`, and realpath must stay out of src/api/notes (564–571). |
| F3 | **closed** | `TOOL_CONFIG` blocks the config basenames everywhere, test areas included (520). Writes go only to test paths and `.work/<slug>/*.md` (522–525). Write and Edit are tested. `--prefix`/`-w` are moot. |
| F4 | **closed** | See section 3. |
| F5 | **implemented** as Round 4 specifies, with a low race (I-3) | See section 6. |
| F6 | **closed in the guard** | `checkCritic`: every Bash call is blocked (509). The frontmatter matcher change is not in the diff (I-2). |
| F7 / R2-2 | **closed** | `notes-name.js` has no side effects. The script tests basenames and checks that the file set matches. `release-notes.md` passes, and a test covers it. |
| R2-1 | **moot** | The npm forms were dropped. |
| R2-3 | **closed** | `isFile(realAbs(target))` returns null only after the notes test on both forms (493–494). Tests cover it for both roles. |
| R4: TE Bash = one run | **met** | The whole command is checked. Only space separates tokens. The head must match exactly. The cwd must realpath to the root. |
| R4: CRITIC Write `*-findings.md` | **met** | `FINDINGS_FILE` (506), checked on both forms. |
| R4: block log fields, rule classes, incidents | **met** (I-3) | Section 6. |
| (b) wiring, (c), (d) docs, debt.md, critic.md lines | **not in the diff** | I-2. |

## 2. Read paths through the new code

- **Read.** Notes are matched by basename on both the written form and the realpath form. The realpath form also
  closes these Windows aliases: trailing dots and spaces, an 8.3 short name, `\\?\C:\…` and subst drives. In each
  case `GetFinalPathNameByHandle` returns the real long `C:` path. An NTFS stream suffix is cut off before the
  basename test. **Gap:** a UNC alias of the root (I-1).
- **Grep/Glob scope.** `isTop` now includes `..` chains, so a search from the parent directory is blocked, for
  CRITIC on `.work` and for TEST ENGINEER on app source. The old guard missed this. An absolute or Git-Bash Glob prefix
  now resolves through `path.resolve`. Both changes are correct. Neither has a test (I-7).
- **TE Bash.** `$`, quotes, backslashes, globs and redirections cannot be written. `C:` and `/` absolute paths and
  `..` are blocked. A path through a symlink is judged by its realpath, so `src./in.test.ts` resolves into src and
  blocks.
- **TE Write/Edit.** Both forms must pass. A file under app impl or with a notes name is refused. **Pre-existing,
  not in scope:** through a UNC path, TEST ENGINEER can write a `*.test.*` file into `apps/*/src`, and BUILDER can
  write a helper with no test name into a test area (R3, which Afik left untouched). Both are writes, not reads.
  Record them in debt.md.
- **Symlinks** are covered for Read, Grep, Write and Bash, with tests.

--- finding I-1 ---
severity: high
file:     .claude/hooks/guard.next.js:454-456 (relBoth) and 468-501 (checkReadPath); same gap in guard.js:478,485
claim:    A UNC alias of the project root (`\\localhost\c$\Users\Afik\nestly\…`, also `\\127.0.0.1\c$`, `\\<host>\c$`)
          makes both path forms absolute strings that no reader rule matches. `path.relative` across roots returns the
          target unchanged, and realpath over SMB returns the UNC path, not `C:`. So `isAppImpl`, `reachesAppImpl`,
          `reaches('.work')` and `isTop` are all false.
failure:  The share is reachable from the agent process; the probe above confirmed it.
          TEST ENGINEER: Read `\\localhost\c$\Users\Afik\nestly\apps\web\src\main.tsx` → allowed → R2 broken in one call.
          CRITIC: Grep pattern `.` with path `\\localhost\c$\Users\Afik\nestly\.work` and no glob → allowed → ripgrep
          prints the lines of every `.work/*/notes.md` → R1 broken in one call. (A CRITIC Read of a notes file through
          UNC is still blocked by its basename. Grep is the open path.)
          The same works with forward slashes (`//localhost/c$/…`).
fix:      For the reader roles (Read, Grep, Glob, Write/Edit of CRITIC and TEST ENGINEER), block any path whose written
          or realpath form is still absolute after `path.relative` against the root. That covers a different root:
          UNC, a device path, another drive. No legitimate reader call needs one. Add tests: on win32, build
          `\\localhost\<drive>$\<rest>` from the temp root (skip elsewhere). One block case each for TE Read of src,
          CRITIC Grep on `.work`, TE Grep on `apps`. Leave the R3 counterpart to debt.md, since Afik left it untouched.
--- end ---

## 3. guard-loader.js: no fail-open path found

The handlers are installed before anything else. `process.exit` is wrapped, and an `exit` listener sets
`exitCode = 2` if the process ends without an explicit exit. `fail()` exits 2 in a `finally`. Both sources sit in
try/catch; `main()` sits in its own try/catch. The fallback ref is a fixed string, with a 10 s timeout, compiled in
memory. The fallback's `require('./notes-name.js')` resolves against the local hooks dir, so a broken `notes-name.js`
breaks both sources. That ends in exit 2, which is closed, not open. The tests cover every case named in F4, plus
async throws, rejections and a throwing getter.

**Concern:** `origin/main:.claude/hooks/guard.js` today is the old guard, which has no `main` export. Until this
branch merges, the fallback cannot succeed, so a broken guard.js under the loader exits 2 and locks the session (the
failure (b) exists to prevent). The wiring to the loader must therefore land in the same merge as the swap, not before.

## 4. critic-diff.mjs

I found no way for a notes file to reach `review.diff`. Notes are dropped by basename. All of `.work/` is dropped
except this slug's four files. The header check uses the same regex. The file-set equality check catches any extra
file. Quoted (C-escaped) headers fail closed. `--no-renames` turns a rename into a delete plus an add, so the notes
side is still dropped by name. Widening `NOTES_NAME` to `notes\.md(\..*)?` only adds over-blocks: the guard refuses
reads and TE writes of `notes.md.<anything>`. Two side effects, both fail-closed noise:
- The header check splits on whitespace, so a changed file named, for example, `docs/my notes.md`, or one under a
  directory named `notes.md.d/`, makes the script exit 1.
- A very long kept-file list could exceed the Windows command-line limit. git fails and the script exits 1.

--- finding I-4 ---
severity: low
file:     tools/critic-diff.mjs:15-16, 57-59
claim:    When the script fails it writes nothing, but it does not remove a `review.diff` left by an earlier run. Spec
          round 1 says "exit 1, no file".
failure:  After new commits, a run exits 1 (bad header, git error). `.work/<slug>/review.diff` from the previous run
          is still there. If the exit code is missed, CRITIC reviews the old diff as the current change.
fix:      Delete `.work/<slug>/review.diff` before running git, or in `die()`. Add a test.
--- end ---

## 5. R4 and BUILDER

Compared line by line with guard.js:221–418 and 604–656. `checkAll`, `scanForSecrets`, `commitTakesWorkingTree`,
`checkBuilder`, `shellSegments`, `gitCall` and `dropHeredocs` are identical. The only change is the `critical()`
wrapper on five verdicts: an .env name, a blocked ref, a force push, a staged .env and a secret pattern. Every message
text is the same. `check()` turns a string verdict into `{reason, rule}`. **Unchanged except for the logging
classification, as Afik required.**

## 6. Block log and escalation

Each entry has `{time, role, tool, rule, reason, session}`. The directory is created if missing, the command is never
logged, and a frontmatter hook skips logging when the settings hook already logged the block (`loggedElsewhere`). An
r4-critical block escalates even when the log write fails, and a failed log write never changes the verdict (tested
with `.claude/logs` as a file). The third reader block per role and session escalates. The classification matches
Round 4.

--- finding I-3 ---
severity: low
file:     .claude/hooks/guard.next.js:721-744 (report)
claim:    Escalation fires only when the count read back is exactly 3. Each hook process appends its entry and then
          counts. When two reader blocks arrive concurrently (parallel tool calls run hooks in parallel), both
          processes can count 4 or more. Then no process ever sees 3, and that role+session never escalates.
failure:  An agent sends its 3rd and 4th probing calls in one parallel batch. A appends #3, B appends #4, both read 4,
          so incidents.md gets no line. Later blocks count 5, 6 and so on, and still never escalate. The blocks are
          still counted in the local log and by /wrap-up, which is why this is low.
fix:      Escalate when `reader >= 3` and no escalation entry for that role+session exists yet. For example, append
          `{"rule":"escalated",role,session}` to the same log and check for it. Or count only the entries up to and
          including this process's own entry, identified by a nonce. Add a test that runs two blocks concurrently.
--- end ---

## 7. TEST ENGINEER's tests: file reads at run time (standing check)

**Pass.** `guard-next.test.js` builds its own temp root with fake notes ("SECRET NOTES") and reads only the temp log
and the temp `incidents.md`. `critic-diff.test.mjs` works in a temp repo and imports `notes-name.js`.
`guard-loader.test.js` copies `guard-loader.js` into a temp repo to execute it, without printing it. That is the unit
under test, not `apps/*/src|api` and not a notes file. No test reads app source or a real notes file.

## Other findings

--- finding I-2 ---
severity: medium
file:     review.diff as a whole: .claude/settings.json, .claude/agents/critic.md, .claude/agents/test-engineer.md,
          .claude/workflow.md, CLAUDE.md, debt.md, incidents.md
claim:    These spec items are not in the diff:
          - (b) the wiring of `settings.json` and both frontmatters to `guard-loader.js`;
          - (a) CRITIC's tools without Bash, and its matcher `Read|Grep|Glob|Bash|Write`;
          - (a) TEST ENGINEER's matcher `…|Write|Edit|Bash`;
          - (c) the workflow.md line;
          - (d) the CLAUDE.md "Report material failures" change, critic.md:36, the archive move of the block lines;
          - the critic.md checklist line for TEST ENGINEER's tests, and the debt.md lines (known gap, R3/UNC, other
            slugs' .md).
          The swap commit must also retire or rewrite `guard.test.js` and `guard-case.test.js`. They assert the old
          CRITIC Bash behaviour, which the new guard blocks.
failure:  If the swap lands without these:
          - (b) is not delivered, and the loader is dead code;
          - TEST ENGINEER's Write limit, the precondition of its Bash allowlist, runs only through the settings hook's
            `agent_type` branch, and not at all when `agent_type` is absent;
          - incidents.md keeps receiving every block, because the active guard is still the old one. This diff itself
            adds 4 block lines to incidents.md.
fix:      Put the wiring and documentation changes on this branch before the swap. The swap commit (guard.next.js →
          guard.js, test repointing, old guard tests) comes back to CRITIC for a re-check of I-1, I-2 and I-3 only.
--- end ---

--- finding I-5 ---
severity: low
file:     .claude/hooks/guard.next.js:548-573 (checkTestEngineerBash)
claim:    The "explicit existing test file" check holds for the token, but vitest treats a positional argument as a
          substring filter on collected files, and playwright treats one as a regex. The set of files that actually
          run is bounded by the runner config, not by the token.
failure:  TEST ENGINEER writes `web/src/x.test.ts` at the repo root (allowed: a test name, not under `apps/`), then
          runs `npx vitest run web/src/x.test.ts`. That filter also matches any `apps/web/src/x.test.ts` the config
          collects, which then runs and prints its frames. No colocated test exists in `apps/*/src` today (checked
          with Glob), and a TEST ENGINEER test can import src anyway, so this is inside the recorded known gap.
fix:      No mechanism needed. Add one line to the known-gap debt entry: runner positional arguments are filters, not
          paths.
--- end ---

--- finding I-6 ---
severity: low
file:     WORKPLAN-HE.md:15, 30-32 (diff)
claim:    WORKPLAN still says stage 1 is waiting for Afik's approval of the approach and of F5. Commit 739f079 and the
          decisions.md entry in this same diff record that he approved both.
failure:  Afik opens the single status file and finds two decision requests he has already answered. The real next
          step (implementation review, then the swap) is not listed.
fix:      Update WORKPLAN in the next commit on this branch.
--- end ---

## Notes (no finding)

- **I-7, test gaps:** the builder's widened handling has no tests: Grep from `..` for CRITIC and TEST ENGINEER, and
  an absolute or `/c/…` Glob prefix for TEST ENGINEER. The tests for I-1 and I-3 belong next to them.
- **Pre-existing, unchanged by design:** `grepExcludesNotes` compares globs case-sensitively. `glob: "NOTES.md"`
  counts as excluding notes, and ripgrep would match a file whose real name on disk is upper-case `NOTES.md`. Today
  the files are lower case. Candidate for debt.md.
- **Size, 797 lines:** nothing is dead. The R4 and BUILDER code is about 400 lines, untouched. The reader part,
  logging and loader glue are about 190 lines. The duplicates are older: the cd list inline in `checkBuilder` next to
  `CD`, and the edit-tool array next to `EDIT_TOOLS`. There is one stray double blank line at 681–682. None of this
  affects the verdict.
- **Rule (c):** this is the first `Not Ready` on the implementation. ORCHESTRATOR decides whether the round-1
  `Not Ready` on the approach counts toward the two-strike stop.

---

Done — reviewed the stage-1 implementation diff against Round 4 and rounds 1–3. Compared guard.next.js with the live guard.js, and checked the loader, critic-diff, the log and escalation, R4/BUILDER parity, and the tests' run-time reads.
Artifact — `C:\Users\Afik\nestly\.work\agent-slim\stage1-findings.md` ("Implementation review")
Findings — verdict Not Ready. I-1 high (a UNC alias of the root gets past every reader path rule: TE Read of src and CRITIC Grep of .work both work; the share is reachable, pre-existing in guard.js). I-2 medium (wiring, c/d docs, debt lines and the old guard tests are not in the diff). I-3 low (escalation fires only on exactly 3, which concurrent blocks can skip). I-4 low (a stale review.diff survives a failed run). I-5 low (runner positional arguments are filters). I-6 low (WORKPLAN is stale). F1–F7, R2-1..3 and the Round 4 conditions: met or moot. Loader: no fail-open path. critic-diff: no notes path. R4/BUILDER: unchanged except classification. The tests read no source or notes.
Open — none for Afik from CRITIC. Rule (c) applicability is ORCHESTRATOR's call.
Next owner — ORCHESTRATOR (route I-1, I-3 and I-4 to BUILDER, with TEST ENGINEER writing the I-1/I-3/I-4/I-7 tests first; I-2 and I-6 are ORCHESTRATOR's own edits; the re-check of I-1..I-6 comes back to me).

---

# Re-check of I-1..I-6 (CRITIC on opus, 2026-10-13)

Scope: only I-1..I-6, plus the question of whether the swap opens anything new. Source: the regenerated
`.work/agent-slim/review.diff` (25 files; `guard.next.js` is now swapped into `guard.js`). No Bash used, notes.md not
read. Line numbers are `review.diff` lines.

```
verdict: Validated with Concern
```

## Status

| # | sev | status | basis |
|---|---|---|---|
| I-1 | high | **closed** | `outsideRoot()` (diff 1395–1397) blocks a path when either form is `..`, starts with `../`, or is still absolute after `path.relative`. That covers a UNC share, a `\\?\` device path, another drive, and anything above the root. It runs for every non-Bash tool of CRITIC (1533) and TEST ENGINEER (1622). For Grep and Glob it judges the search target, including an absolute Glob prefix (`namedPaths`, 1404–1414). My two failure paths are covered by tests: CRITIC Grep on `unc('.work')`, both slash styles, no glob, and TE Read of `unc('apps','web','src',…)` (1096–1149). There is also a test for outside paths on any platform (1151–1169) and for normal paths inside the root (1171–1176). The UNC write into src and the parent-directory and absolute-prefix cases (I-7) are covered by the same rule and tests. |
| I-2 | medium | **closed** | Wiring: `settings.json` (1969), builder (10), critic (35) and test-engineer (91) all call `guard-loader.js`. CRITIC: tools without Bash (23), matcher `Read\|Grep\|Glob\|Bash\|Write` (31). TEST ENGINEER: matcher `Read\|Grep\|Glob\|Write\|Edit\|Bash` (87). Docs: workflow.md "Two strikes" (2019–2021), the CLAUDE.md report line (2063–2066), the wrap-up count (1991–1994), the critic.md hygiene line (65–67), the debt.md lines (2236–2238), and the block lines moved to the archive without deleting them. **Old tests:** in `guard.test.js` and `guard-case.test.js`, every changed assertion is a CRITIC or TEST ENGINEER case. Each one either turns an `allows` into a `blocks` or moves the logging check from incidents.md to the block log. No `all` (R4) or `builder` case was removed or weakened, and the `git add -A # TOPSECRET` case still asserts the block and that the command is not logged. |
| I-3 | low | **closed** | Escalation now fires when `reader >= 3`. It is claimed once per role and session through an exclusive-create flag file (`wx`, 1679–1687, 1707). Of two concurrent hooks, exactly one wins the claim. A failed claim or log directory means no escalation, but the block still stands. Tests seed counts of 3 and 5, check that the escalation fires once and is tracked per session, and check that another role's lines do not count (1187–1216). |
| I-4 | low | **closed** | An earlier `review.diff` is removed before git runs. If it cannot be removed, the script exits 1 (2452–2458). `.work/*/review.diff` is gitignored (2051–2052). Residual, negligible: a bad slug or base exits before the cleanup. That is an immediate usage error, not a stale run. |
| I-5 | low | **closed** | The debt.md known-gap line now says that vitest and playwright treat file arguments as filters (2236). |
| I-6 | low | **closed** | WORKPLAN line 15 records the approval, the Not Ready, the fixes, the swap and the next step. The stale "waiting for your decision" items are gone (2079). |

## Does the swap open anything new?

No read path. What I checked:
- `outsideRoot` adds blocks only. A CRITIC or TEST ENGINEER read outside the project, such as a file in a temp
  scratchpad, is now refused. That is noise to watch, not exposure.
- The R4 and BUILDER code in `guard.js` is unchanged apart from the five `critical()` wrappers.
- TEST ENGINEER's matcher now also covers Write and Edit, so its Write limit no longer depends on `agent_type`.
- CRITIC's tools list and its guard both refuse Bash.

**Concerns.** These do not block the merge. ORCHESTRATOR records them in debt.md.

1. **The UNC tests skip on CI.** The I-1 cases for UNC, device paths and other drives run on Windows only. CI runs on
   Linux, so they skip there, and only the any-platform outside-root test runs. The fix for the one high in this
   stage has no merge gate. A later edit to `outsideRoot` or `relBoth` that breaks the Windows case would pass CI.
   - Cost: a silent regression of R1/R2 on the only platform where agents run.
   - Before merge: ORCHESTRATOR runs `node --test .claude/hooks/guard-readers.test.js` on Windows and records the
     result.
   - Later: a Windows CI job, or a `win32` path test that does not touch the file system.
2. **The fallback is inert until merge.** As stated in section 3, `origin/main:guard.js` has no `main` export until
   this PR merges. The loader is now wired on the branch, so in a session on this branch a broken `guard.js` blocks
   everything rather than falling back. After the merge and a fetch, this goes away. Also not new: if
   `guard-loader.js` itself were missing, `node` would exit 1 and fail open, as a missing `guard.js` did before.
3. **An escalation has already fired, at incidents.md 11:18.** It reads "third reader block by test-engineer in one
   session" (diff 2402). Under CLAUDE.md as amended in this diff, it goes to Afik. ORCHESTRATOR also checks whether
   the three blocks were TEST ENGINEER learning the new limits (→ noise.md) or a probe.

---

Done — re-checked I-1..I-6 against the regenerated review.diff (PR 8, with the swap), and checked the swap for new openings.
Artifact — `C:\Users\Afik\nestly\.work\agent-slim\stage1-findings.md` ("Re-check of I-1..I-6")
Findings — verdict Validated with Concern. I-1..I-6 all closed. No R4/BUILDER test was weakened. The swap opens no new read path. Concerns for debt.md: (1) the I-1 UNC tests skip on Linux CI, so run guard-readers.test.js on Windows before merge; (2) the loader fallback is inert until merge; (3) the 11:18 escalation needs reporting and triage.
Open — none for Afik from CRITIC. The 11:18 incidents line goes to Afik under the amended CLAUDE.md.
Next owner — ORCHESTRATOR (run guard-readers.test.js on Windows and record it, write the concerns to debt.md, report the 11:18 escalation, then merge on green GitHub CI).
