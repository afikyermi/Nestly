---
name: synthesize
description: Combines the bug lists of CRITIC and ALGORITHM & DATA into one outcome by the fixed rule, and surfaces disagreements to Afik without resolving them. Use after the reviews of a part return, before the merge.
---

# synthesize — one outcome from two reviews

**Version:** 1.2 · writes nothing. The rule is in `.claude/workflow.md` → "Verdicts"; the limits on the ORCHESTRATOR
are in `CLAUDE.md` → "Shared security and review limits" and "Decision authority".

## Input

The feature slug. Read `.work/<slug>/findings.md` from CRITIC, and the findings of ALGORITHM & DATA when step 5b
ran.

## Steps

1. Take each reviewer's bug list exactly as written (`--- bug ---` blocks, or `no bugs`). A review without a bug
   list is rejected and re-run — not interpreted.
2. Apply the rule from `workflow.md`: an open critical, high or medium bug from either reviewer blocks the merge.
3. Account for every bug by its file and claim: open, fixed (re-checked by the reviewer who raised it, for a
   blocking one), or disputed.
4. For each low bug not fixed in the part, draft the `debt.md` line in that file's format. `/wrap-up` writes it.
5. For each disagreement — between the reviewers, or between a reviewer and BUILDER — write the block
   `Agreement / Disagreement / Reason / Evidence / Materiality` for Afik.

## Stop conditions

- Never lower a severity or settle a disagreement yourself. That is Afik's.

## Done when

One outcome is stated, every bug appears in the account, and every disagreement has its block.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
- 1.1 — 2026-10-16 — bug lists instead of verdicts; a debt line per unfixed low bug (Afik, audit decision 4; PR 37 CRITIC 3).

- P2 — 2026-10-18 — אישור אפיק 17.10: align with canonical authority, sequence and records; no gate removed.
