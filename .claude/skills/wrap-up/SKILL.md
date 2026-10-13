---
name: wrap-up
description: Closes a unit of work — result.md, the logs, the SRS update of step 14, WORKPLAN, and the commit with an Implements line. Use after Afik approves the Preview (or after a Light-path change), as `/wrap-up <slug>`.
disable-model-invocation: true
argument-hint: <slug>
---

# /wrap-up — steps 13 and 14

**Version:** 1.1 · the steps are in `.claude/workflow.md` (13, 14, "Result", "Traceability"); the logs and the
WORKPLAN rule in `CLAUDE.md`.

## Input

`$ARGUMENTS` — the feature slug.

## Preconditions

The Preview passed — ORCHESTRATOR checked it, URL recorded in WORKPLAN (or the change took the Light path) · no
`Not Ready` stands · CI is green.

## Steps

1. **`result.md`** in `.work/<slug>/`: execution and quality · planned vs actual (`git diff --stat` against the
   size estimate in `spec.md`) · the SRS trace · the evidence, with commits.
2. **Logs:** the `debt.md` lines from `synthesize`, plus every neighbouring bug listed in `notes.md` · `escapes.md`
   or `noise.md` where a finding proved real after merge, or proved not real · **blocks:** from the local
   `.claude/logs/blocks.jsonl`, the lines since the task began, counted per role and `rule`+reason, as one
   "Hook blocks" line in `result.md` (none → "Hook blocks: none"). A block that stopped legitimate work goes to
   `noise.md`. The guard itself writes `incidents.md` for critical blocks; nothing else from the log does.
3. **SRS — step 14:** if behaviour the SRS describes changed, follow `.claude/skills/srs-update/SKILL.md`, steps 1–6.
   Read and follow that file; it is a procedure, not something to invoke.
4. **WORKPLAN:** the task's status in its part table, and the "איפה אנחנו עומדים" block. WORKPLAN keeps only open
   work and the last finished part: when a part closes, the part it replaces as "last finished" moves verbatim to
   `archive/WORKPLAN-<YYYY-MM>.md`, and anything still open inside it goes to "פתוח מחלקים שנסגרו".
5. **Merge and commit:** stage explicit paths only. The logs, decisions and WORKPLAN go in this same commit — never a
   commit of their own. The message ends with `Implements: FR-…, AC-…` (or `Implements: none — <reason>`) and the
   attribution line. Push once, for CI; the PR body carries the same `Implements:` line, since merges are squash and
   the PR body becomes the squash message (`decisions/2026-10.md`, "Commits and pushes").
6. **Report** to Afik in Hebrew: what closed, what was logged, what comes next.

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
