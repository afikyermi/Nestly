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
