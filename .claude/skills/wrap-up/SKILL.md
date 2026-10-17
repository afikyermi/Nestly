---
name: wrap-up
description: Prepares records before the candidate push and closes work after the applicable current-head gates. Uses workflow.md for cadence, records, merge authority and P1 closure checks.
disable-model-invocation: true
argument-hint: <slug>
---

# /wrap-up — steps 13 and 14

**Version:** 1.4 · the steps are in `.claude/workflow.md` (13, 14, "Result", "Traceability"); the logs and WORKPLAN cadence are in workflow → Records and commits. Result/log writing runs **once per feature**; the closing checks below run **every part**.
Apply workflow → "Closing a part": every wait has a reason, owner and next-check time; inspect/recover a silent small-change
agent at ~10 minutes, without dense polling. Before the next part, check main's current unresolved failures (including
Edge, cleanup and migrate); a later successful equivalent execution resolves history, unrelated green/skip does not.

## Input

`$ARGUMENTS` — the feature slug.

## Preconditions

Record preparation can run before CI/E: prepare records and baselines before the candidate push.
Closure/merge requires workflow → Gates, the selected path and Closing a part on the current head.
Light alone is not an E exemption. Use `node tools/part-status.mjs <PR>` and inspect its evidence/limits;
recheck after any pushed commit. Missing/cancelled required evidence blocks.

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
4. **WORKPLAN:** apply workflow → Records and commits.
   Between parts the handoff is the PR and `.work/<slug>/`; retain existing archival history.
5. **Commit and candidate push:** apply workflow → Records and commits and Traceability. Stage explicit
   paths; records belong with work, small local commits are allowed. Prepare before pushing; merge only
   after current-head gates, by the authorized owner (Gates/Closing a part).
6. **After merge:** inspect main health before the next part; use the workflow's conditional fresh-branch rule after squash.
   Codex improvement PRs wait for Afik to merge. **Report** in Hebrew: what closed, what was logged, what comes next,
   and any cloud branch limitation. An unresolved main failure has an owner/recovery step, not an automatic next part.

## Stop conditions

- A precondition fails → stop and say which.
- Uncommitted changes unrelated to the feature → ask before committing anything.

## Done when

Required records exist at workflow cadence, preserved in the work commit; closure evidence names its
commit and next owner. Do not update WORKPLAN or SRS merely to satisfy a date check.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
- 1.1 — 2026-10-13 — step 2 counts the hook blocks into `result.md` (Afik, guard approach d). Step 4 archives the
  closed WORKPLAN part; step 5: logs in the same commit, one push, Implements in the PR body (Afik, agent-slim stage 3).
- 1.2 — 2026-10-13 — step 2 rotates the block log at the end of each task, so reader-block escalation counts per task
  (Afik, F5). Description: the Preview is passed by ORCHESTRATOR, not by Afik (Afik, stage 4 contradiction 3).
- 1.3 — 2026-10-15 — once per feature; result ≤ 10 lines with the test ratio; no incidents resolution lines; SRS once
  per Initiative. Decided by Afik (development-speed review).

- P2 — 2026-10-18 — אישור אפיק 17.10: align with canonical authority, sequence and records; no gate removed.
