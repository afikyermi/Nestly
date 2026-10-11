---
name: gate
description: Prepares a one-page decision page for a human gate — Gate 1 (spec), Gate 2 (schema) or Preview — with what is being approved, risks, disagreements and a recommendation. Use before asking Afik to approve, as `/gate <1|2|preview> <slug>`.
disable-model-invocation: true
argument-hint: <1|2|preview> <slug>
---

# /gate — one page for one decision

**Version:** 1.0 · the gates are defined in `CLAUDE.md` → "Human gates". Afik's attention is the scarcest
resource here: one page, and an answer he can give in one line.

## Input

`$ARGUMENTS` — the gate (`1`, `2` or `preview`) and the feature slug.

## Steps

1. **Read the gate's artifacts** in `.work/<slug>/`:
   - Gate 1: `spec.md`, `intake.md`.
   - Gate 2: `schema.md` (and `algorithm.md` if it exists).
   - Preview: the `synthesize` outcome, `findings.md`, `notes.md` (its Preview path; Afik may read notes — only
     CRITIC may not), and the evidence so far.
2. **Write the page, in Hebrew:**
   - **מה מאושר** — Gate 1: scope, out of scope, the acceptance criteria with their SRS IDs. Gate 2: the change,
     the rollback, whether it is reversible. Preview: what was built, and the clicks to verify it.
   - **סיכונים** — the risk flags that apply, and anything irreversible, stated plainly.
   - **פתוח** — every open `DECISION REQUEST` and any SPEC CHALLENGE, each with its options.
   - **מחלוקות** — each in the `Agreement / Disagreement / Reason / Evidence / Materiality` format.
   - **המלצה** — one recommendation, with its reason.
   - **תשובה בשורה אחת** — the exact format Afik can reply with.
3. Present the page. Do not proceed past the gate until Afik answers.

## Stop conditions

- A required artifact is missing → say which one. Never build a gate page from memory.
- A `Not Ready` verdict stands → Preview cannot be requested. Say so.

## Done when

The page fits one screen, every item cites its artifact, and the one-line answer format is given.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
