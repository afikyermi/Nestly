# findings — dev-speed (CRITIC on opus, 15.10.2026)

Saved verbatim by ORCHESTRATOR from CRITIC's hand-back: the harness refused the subagent's own Write of this file.

```
verdict: Not Ready

Scope reviewed: .work/dev-speed/review.diff against .work/dev-speed/spec.md, plus guard.js, critic-diff.mjs, eslint.config.mjs, the tsconfig files, critic.md, learning.md §6/§7/§9 and workflow.md read directly. notes.md not read.

What I checked in the guard (part 1), and it holds:
- The Bash character check `^[A-Za-z0-9._/:=@+ -]+$` blocks backslash `..`, quotes, tabs and shell syntax.
- `-p` is accepted exactly once, and only for tsc. These are refused: `-p=`, `--project`, `-p` with no value, `-p` followed by a file operand, absolute paths, `C:` paths and `..`.
- relBoth with realAbs resolves a symlinked tsconfig, and outsideRoot catches one outside the root.
- TOOL_CONFIG stops TEST ENGINEER from writing `tsconfig*.json` or `eslint.config.*`. So ESLint 10, which looks for a config in each file's directory, cannot pick up one it planted.
- vitest, playwright and node --test behave as before (AC4).
- CRITIC's rules, the Write limits, the env/secret/prod/force-push rules, the escalation and the block log are untouched in the diff.
- guard.js is 890 lines, within the 900 budget.
- The `gh --template` clause in conventions.md is accurate: guard.js couldBeEnv treats `.[]` as an env glob, and jqProgram exempts only the `jq` command, not `gh --jq`. Validated.
- The lecturer-demo hunks contain no secrets.

--- finding ---
severity: high
file:     .claude/agents/test-engineer.md:150-152,195-197 · .claude/workflow.md:60,114-117 (rule 2) · .claude/agents/critic.md:130 (unchanged)
claim:    This diff removes the hook that kept TEST ENGINEER out of app source. It names CRITIC's review of the tests as the only remaining control for rule 2 ("tests come from the spec, never from the code"). But CRITIC has no such check, and workflow.md still lets CRITIC review before the tests exist.
failure:  TEST ENGINEER reads apps/web/src/.../limits.ts (now allowed) and sees MAX = 50, while the spec says 100. It writes expect(limit).toBe(50). The test passes and the broken feature looks green.
          - critic.md 1.5 has no required check for an expected value copied from the code. Its only test check (hygiene, line 130) is about reading files at run time.
          - workflow.md:60 still says "Steps 8 and 9 may run in parallel (neither reads the other's output)". So the review.diff can be prepared before the tests exist.
          - With "at most two reviews per feature", no later review is guaranteed.
          Nothing in the pipeline does what test-engineer.md ("CRITIC checks") and workflow rule 2 ("CRITIC raises it as a finding") promise. This is one of the three rules learning.md §9 protects.
fix:      (1) Add the check to critic.md, as a versioned change by Afik. CRITIC is at 19 of 20 in learning.md §6, so it fits. Wording: every expected value in TEST ENGINEER's tests traces to a criterion in spec.md or bug.md, not to a constant or branch in the source.
          (2) Remove "Steps 8 and 9 may run in parallel" from workflow.md, or require that the review.diff CRITIC reads includes the finished tests.
--- end ---

--- finding ---
severity: medium
file:     CLAUDE.md:311-317 ("Report material failures to Afik")
claim:    The new list no longer reports the third reader block, or a `.env` block, to Afik. That contradicts the guard's unchanged escalation and critic.md ("repeated blocks reach Afik"). The spec puts escalation out of scope.
failure:  guard.js:10-11 still writes incidents.md on "the third reader block of one role in one task", which it calls a sign of an agent probing the fence. TEST ENGINEER's only remaining reader block is a notes.md attempt, which is exactly that sign. Under the new text, "a reader block — is only counted by /wrap-up" and "nobody adds a resolution line". So three notes.md attempts reach incidents.md, but ORCHESTRATOR never reports them. "A real secret" also no longer clearly covers a blocked `.env` read, which could be filed as "an env-glob ambiguity" and only counted.
fix:      Put "the third reader block by one role in one task" and a `.env` read back on the material-failures list. Keep the new "no resolution line" rule for false blocks.
--- end ---

--- finding ---
severity: medium
file:     tools/critic-diff.mjs:32,48
claim:    package-lock.json is left out of the review diff silently. CRITIC is not even told it changed.
failure:  A branch changes only the lock file: a `resolved` URL now points at another tarball or registry, an `integrity` hash changes, or a transitive version is bumped. package.json is unchanged, so review.diff shows nothing. CI installs from the lock, so the change reaches the build, and CRITIC's new-dependency and hygiene checks pass without seeing it.
          The other new exclusions (root logs, decisions/, archive/, .claude/logs/) are fine. .claude/knowledge, .github and docs stay in the diff (the test asserts the knowledge case). The notes filter still runs first, so no notes.md can get in through the new filter.
fix:      Keep the full lock-file diff out, but write a summary into review.diff instead: the changed `"resolved"`, `"integrity"` and `"version"` lines, or at least "package-lock.json changed (+N/−M), not shown".
--- end ---

--- finding ---
severity: medium
file:     .claude/workflow.md:71-72 · CLAUDE.md:112 (Light row)
claim:    "Records-only … straight to `main` between features" contradicts workflow.md:62: "Every path merges through a PR, and only after every GitHub Actions check … is green". Because docs/srs counts as records-only and the size limit no longer applies, a whole Initiative's SRS update can land with no review and no CI.
failure:  The once-per-Initiative SRS update (new IDs, §17, version row) qualifies as records-only Light. "Straight to main" reads as a direct push, which skips the CI gate. Light also means no CRITIC, so an SRS change that drifts from what was built, or a material change reserved for Afik, goes through unreviewed. It also conflicts with CLAUDE.md's rule that a log, decision or WORKPLAN update "never gets a commit of its own".
fix:      Say "its own PR to main, merged on green CI". Treat the per-Initiative SRS update as its own unit with a size limit (Standard, or checked against srs-review-points), or take docs/srs out of records-only.
--- end ---

--- finding ---
severity: medium
file:     .claude/workflow.md:57,85-86
claim:    "Reviews: at most two per feature … one for the rest at the end" conflicts with merging per part (step 13: "merge; then once per feature, never per part").
failure:  Take a feature split into P1 (Elevated), P2 and P3 (Standard screens). P1 is reviewed and merged. P2 gets green CI on its one push (the step-9 merge condition) and merges. The single review for the rest runs only after P3, so P2 sat on main without the CRITIC review the Standard path requires.
fix:      Say explicitly that a part does not merge before its review covers it: either parts that share a review merge together, or every part is reviewed before it merges.
--- end ---

--- finding ---
severity: low
file:     CLAUDE.md:339-340 (hard rule 5) · .claude/workflow.md:60
claim:    Hard rule 5 says "Within a feature: only TEST ENGINEER beside BUILDER". workflow.md still also allows TEST ENGINEER beside CRITIC (steps 8 and 9).
failure:  ORCHESTRATOR gets opposite answers from the two files. workflow.md's "this file wins" covers agent definitions, not CLAUDE.md's hard rules. Choosing the parallel reading leads to the high finding.
fix:      Make them agree. Once the high finding is fixed, the 8‖9 sentence goes.
--- end ---

--- finding ---
severity: low
file:     .claude/agents/test-engineer.md:119 (Version 1.6 → 1.7)
claim:    The role's founding rule, its read boundary and its shell authority all changed, but this was versioned as a patch. learning.md §7 requires a major bump for a role boundary or principle change.
failure:  The retro and the §8 five-feature check would treat 1.7 as a small, separately revertible rewording. That hides a change to the role's core principle.
fix:      Bump to 2.0 and note the principle change in the changelog.
--- end ---

--- finding ---
severity: low
file:     .claude/hooks/guard.js:561-562
claim:    `const te` is now unused, and `who` recomputes the same expression. It is leftover code, and eslint.config.mjs ignores `.claude/**`, so lint will never flag it.
failure:  No runtime fault. A later edit may assume `te` still controls a branch, and the line counts against the guard's budget.
fix:      Delete `te`, and write `const who = role === 'test-engineer' ? 'TEST ENGINEER' : 'CRITIC';`.
--- end ---

--- finding ---
severity: low
file:     .claude/hooks/guard.js:623,653 (spec AC3 permits it)
claim:    `npx tsc -p` without `--noEmit` is allowed against any existing tsconfig, including ones that emit files:
          - apps/server/tsconfig.build.json and packages/shared/tsconfig.build.json (noEmit false, outDir dist)
          - the tsconfigs under node_modules/ and .claude/worktrees/
failure:  TEST ENGINEER writes build output into apps/server/dist, or compiled files into a dependency under node_modules, outside its Write limit. The attacker does not choose the content, and vitest already runs arbitrary code. So this widens nothing material: a concern, not a defect.
fix:      Require or force `--noEmit`, and refuse a `-p` path under node_modules/ or .claude/. This changes the spec, so it goes to the decision owner.
--- end ---

Concern, not a finding (pre-existing, not introduced by this diff): AC2 holds for the root `.work/` only. A Grep on `.claude` or `.claude/worktrees` with no glob is allowed for both CRITIC and TEST ENGINEER. It reaches 14 tracked notes.md files under `.claude/worktrees/*/.work/*/`; I confirmed they exist with Glob. The cause is that reaches() and isInside() recognise only a `.work` at the root. Fix: in checkReadPath, treat any `.work` path segment, or `.claude/worktrees`, like the root `.work`.

Process checks: the required-check counts in the changelogs hold. BUILDER 12 (one item reworded), DATA ARCHITECT 10, SPEC 8 (the new limits are in the Output section), TEST ENGINEER 6 categories. learning.md §6 needs no change for this diff, and the proposed CRITIC check fits within the budget (19 → 20). wrap-up 1.3 and CLAUDE.md agree on how false blocks go to noise.md and incidents.md.
```

## Routing (ORCHESTRATOR, one fix round)

- **High** → ORCHESTRATOR: critic.md 1.6 gains the check (expected values trace to a criterion, never to the source; 19 → 20, within budget, inside Afik's approval of D); workflow: CRITIC reviews only a diff that holds the finished tests — the 8‖9 sentence goes; hard rule 5 and workflow agree (low 1 closes with it).
- **Medium 1** → ORCHESTRATOR: CLAUDE.md material-failures list gets back the third reader block and an env-file read; "no resolution line" stays.
- **Medium 2** → BUILDER (critic-diff: a lock-file summary — counts and the changed `resolved`/`integrity`/`version` lines) + TEST ENGINEER (test).
- **Medium 3** → ORCHESTRATOR: records-only changes go to main only through a PR on green CI; the per-Initiative SRS update is its own Standard unit (CRITIC on sonnet against the as-built and srs-review-points; no TEST ENGINEER, no Preview); CLAUDE.md "Commits and pushes" aligned.
- **Medium 4** → ORCHESTRATOR: a part merges only after a review covers it; parts that share a review merge together.
- **Low 2** → ORCHESTRATOR: test-engineer.md 2.0.
- **Low 3** → BUILDER: `te` removed.
- **Low 4** → decided by ORCHESTRATOR (spec Amendment 1): `--noEmit` is required, and `-p` under `node_modules/` or `.claude/` is refused. BUILDER + TEST ENGINEER.
- **Concern** → `debt.md` (guard frozen; retro after I1); the stale worktrees under `.claude/worktrees/` go on Afik's list.
- CRITIC re-checks only these, as a fresh invocation.
