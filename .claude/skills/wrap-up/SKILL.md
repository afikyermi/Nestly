---
name: wrap-up
description: Closes a unit of work — result.md, the logs, the SRS update of step 14, WORKPLAN, and the commit with an Implements line. Use after the Preview passes (or after a Light-path change), as `/wrap-up <slug>`.
disable-model-invocation: true
argument-hint: <slug>
---

# /wrap-up — steps 13 and 14

**Version:** 1.3 · the steps are in `.claude/workflow.md` (13, 14, "Result", "Traceability"); the logs and the
WORKPLAN rule in `CLAUDE.md`. Result/log writing runs **once per feature**; the closing checks below run **every part**.
Apply workflow → "Closing a part": every wait has a reason, owner and next-check time; inspect/recover a silent small-change
agent at ~10 minutes, without dense polling. Before the next part, check main's current unresolved failures (including
Edge, cleanup and migrate); a later successful equivalent execution resolves history, unrelated green/skip does not.

## Input

`$ARGUMENTS` — the feature slug.

## Preconditions

E (automated Preview E2E) is green (or the change took the Light path) · no critical, high or medium bug is
open · CI is green on the current head. An expected skip needs its actual workflow condition; missing/cancelled required
checks and missing E (where applicable) block. Use `node tools/part-status.mjs <PR>` and inspect its evidence/limits.
Prepare the records and baselines before the final candidate push; recheck gates after any new commit is pushed.

## Steps

1. **`result.md`** in `.work/<slug>/`, at most 10 lines: execution and quality · planned vs actual (`git diff --stat`
   against the size estimate in `spec.md`, and the test-to-product ratio) · the SRS trace · the evidence, with commits.
2. **Logs:** the `debt.md` lines from `synthesize`, plus every neighbouring bug listed in `notes.md` · `escapes.md`
   or `noise.md` where a finding proved real after merge, or proved not real · **blocks:** from the local
   `.claude/logs/blocks.jsonl`, counted per role and `rule`, as one "Hook blocks" line in `result.md` (none → "Hook
   blocks: none"); a block that stopped legitimate work is one `noise.md` line — never an `incidents.md` resolution line.
   **Then rotate the log:** move `blocks.jsonl` in `.claude/logs/` into `.claude/logs/archive/<YYYY-MM-DD>-<slug>/`
   (a move, never a delete), so the count starts again with the next task.
3. **SRS — step 14:** the SRS trace is in `result.md`; the SRS files are updated once per Initiative, at its close
   (`.claude/skills/srs-update/SKILL.md`, steps 1–6), or at once for a decision that changes scope or the security model.
4. **WORKPLAN:** update once per Initiative, only the waiting-on-Afik list between Initiatives (CLAUDE.md).
   Between parts the handoff is the PR and `.work/<slug>/`; retain existing archival history.
5. **Merge and commit:** stage explicit paths only. The logs, decisions and WORKPLAN go in this same commit — never a
   commit of their own. The message ends with `Implements: FR-…, AC-…` (or `Implements: none — <reason>`) and the
   attribution line. Push once, for CI; the PR body carries the same `Implements:` line, since merges are squash and
   the PR body becomes the squash message (`decisions/2026-10.md`, "Commits and pushes").
6. **After merge:** inspect main health before the next part; use the workflow's conditional fresh-branch rule after squash.
   Codex improvement PRs wait for Afik to merge. **Report** in Hebrew: what closed, what was logged, what comes next,
   and any cloud branch limitation. An unresolved main failure has an owner/recovery step, not an automatic next part.

## Stop conditions

- A precondition fails → stop and say which.
- Uncommitted changes unrelated to the feature → ask before committing anything.

## Done when

`result.md` exists · WORKPLAN carries today's date · the SRS history has a row if behaviour changed ·
`git status` is clean.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
- 1.1 — 2026-10-13 — step 2 counts the hook blocks into `result.md` (Afik, guard approach d). Step 4 archives the
  closed WORKPLAN part; step 5: logs in the same commit, one push, Implements in the PR body (Afik, agent-slim stage 3).
- 1.2 — 2026-10-13 — step 2 rotates the block log at the end of each task, so reader-block escalation counts per task
  (Afik, F5). Description: the Preview is passed by ORCHESTRATOR, not by Afik (Afik, stage 4 contradiction 3).
- 1.3 — 2026-10-15 — once per feature; result ≤ 10 lines with the test ratio; no incidents resolution lines; SRS once
  per Initiative. Decided by Afik (development-speed review).
