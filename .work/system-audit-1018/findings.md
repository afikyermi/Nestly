# PR 67 — CRITIC findings, round 1

Saved by ORCHESTRATOR from CRITIC's hand-back (the harness bars subagent report files — audit A4). CRITIC read the diff,
audit.md and WORKPLAN's top; not notes.md; did not run tests or check-budgets. 0 critical, 0 high, 0 medium, 2 low, 2 nit.

- **F1 · low · tools/part-status.mjs:185, :57** — `collect` reads `pulls/<n>` once; GitHub computes `mergeable` lazily, so the
  first GET after the base moves returns `mergeable: null`, `mergeable_state: unknown`, which the change turns into a LIMIT line
  only (limitations don't change the exit code; a baseline limitation is always present). Scenario: the PR 65 situation — the
  first `part-status 65` after PR 66 merged would show LIMIT + "CI run missing" (exit 1, not unnoticed) but hide the cause until
  a second run; with green checks and a later conflict, exit 0 "no blocker seen". Fix: one retry after ~2 s when null on an open
  PR; if still null keep the LIMIT and say so in `next`; "limitation, not green" in the comment overstates — reword or make it
  affect the exit code.
- **F2 · low · audit.md:16 (A7), legend :4** — "Fixed" is defined as merged with CRITIC and green CI, yet A7 says Fixed while
  PR 67 is open. Fix: "Fixed in PR 67, pending merge", or update after the merge.
- **F3 · nit · workflow.md (Status line)** — "Requires authenticated `gh` on PATH" became "Needs `gh` signed in"; the PATH part
  was real (gh is not on the Bash PATH here). Restore "on PATH" if the budget allows. "time" dropped from the snapshot list is
  harmless (`observedAt` still output).
- **F4 · nit · workflow.md (Every wait)** — "exactly one" → "one", "primary" → "first": slightly weaker, still consistent with
  CLAUDE.md. The merge-state rule is accurate. No fix required.

Judged: `dirty` is the right signal (`mergeable: false` almost always accompanies it); `behind` must not be flagged (no
up-to-date rule); `blocked`/`unstable` correctly not conflicts; `draft` gets nothing from this change (out of scope). Merged PRs
not blocked (tested); closed-unmerged already get "closed without a merge" and the new blocker is suppressed — untested, minor.
The limitation test traces to its criterion; no existing test broken. audit.md: A7 consistent apart from F2; B7's note on
`merge=union` correct (GitHub's mergeability ignores merge drivers); B3's "5 deployments … #63–#66 none" cites the deployments
API without output (not verifiable from the diff). No ⭐ item oversteps ORCHESTRATOR's authority; plan items only recorded; the
memory-note correction is ORCHESTRATOR's own file; WORKPLAN's list carries the ⭐ items accurately.
Next owner: ORCHESTRATOR (F2, F3 directly; F1 small tooling change), then merge on green `gh pr checks`; CRITIC re-checks F1
only if raised to medium.

## ORCHESTRATOR (18.10.2026)
F1: one re-read after ~2 s when an open PR's mergeability is null; still null → the limitation and a "take a new snapshot"
next action; the code comment reworded. Tests for the retry and the closed-unmerged case. F2: A7 reads "Fixed in PR 67". F3:
"on PATH" restored within the byte budget. B3's figures: the deployments API output is in the session (5 deployments after
05:36 UTC: 4 Production, 1 Preview), quoted in audit.md.
