---
name: synthesize
description: Combines the review verdicts of CRITIC and ALGORITHM & DATA into one outcome by the fixed rule, and surfaces disagreements to Afik without resolving them. Use after the reviews of a feature return, before requesting the Preview.
---

# synthesize — one outcome from two reviews

**Version:** 1.0 · writes nothing. The rule is in `.claude/workflow.md` → "Verdicts" → "Two reviewers, one
outcome"; the limits on the ORCHESTRATOR are in `CLAUDE.md` → "You must never".

## Input

The feature slug. Read `.work/<slug>/findings.md` from CRITIC, and the findings of ALGORITHM & DATA when step 5b
ran.

## Steps

1. Take each reviewer's verdict exactly as written. A review without a verdict is rejected and re-run — not
   interpreted.
2. Apply the rule from `workflow.md`. A `Not Ready` from either reviewer is the outcome.
3. Account for every finding by its file and claim: open, addressed (validated by the reviewer who raised it),
   or disputed.
4. For each `Validated with Concern`, draft the `debt.md` line in that file's format. `/wrap-up` writes it.
5. For each disagreement — between the reviewers, or between a reviewer and BUILDER — write the block
   `Agreement / Disagreement / Reason / Evidence / Materiality` for Afik.

## Stop conditions

- Never lower a severity, reinterpret a verdict or settle a disagreement yourself. That is Afik's.

## Done when

One outcome is stated, every finding appears in the account, and every disagreement has its block.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
