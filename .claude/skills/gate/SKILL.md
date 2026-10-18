---
name: gate
description: Prepares a concise Hebrew decision page only for a point reserved for Afik. Gate owners and automated E are defined in workflow.md; this skill does not create a manual Preview gate.
disable-model-invocation: true
argument-hint: <1|2|preview> <slug>
---

# /gate — one page for one decision

**Version:** 1.3 · gates are defined in workflow → "Gates". ORCHESTRATOR passes the
gates; this page is used only for a point reserved for Afik ("Decision authority"). Afik's attention is the scarcest
resource here: one page, and an answer he can give in one line. Afik does not read code or SQL: every page is in
plain language.

## Input

`$ARGUMENTS` — gate (`1`, `2` or legacy `preview`) and slug. `preview` means a reserved decision
about deployed behaviour; it never requests a manual E approval. For unreserved points, route to the
owner in CLAUDE.md without this human decision page.

## Steps

1. **Read the gate's artifacts** in `.work/<slug>/`:
   - Gate 1: `spec.md`, `intake.md`.
   - Gate 2: `schema.md` (and `algorithm.md` if it exists).
   - Deployed-behaviour decision: `synthesize`, `findings.md` and automated E evidence for the current head.
2. **Write the page, in Hebrew:**
   - **מה מאושר** — Gate 1: scope, out of scope, the acceptance criteria with their SRS IDs. Gate 2, in plain
     language with no SQL and no table names: what data is stored, who can see it, what can and cannot be undone,
     and any external provider — the technical detail stays in `schema.md` for CRITIC and DATA ARCHITECT.
     Deployed behaviour: the reserved point, observed outcome and automated evidence.
   - **סיכונים** — the risk flags that apply, and anything irreversible, stated plainly.
   - **פתוח** — every open `DECISION REQUEST` and any SPEC CHALLENGE, each with its options.
   - **מחלוקות** — each in the `Agreement / Disagreement / Reason / Evidence / Materiality` format.
   - **המלצה** — one recommendation, with its reason.
   - **תשובה בשורה אחת** — the exact format Afik can reply with.
3. Present the reserved decision. Dependent work waits for Afik; continue independent work per workflow.

## Stop conditions

- A required artifact is missing → say which one. Never build a gate page from memory.
- An open critical, high or medium bug stands → the part cannot merge. Say so.

## Done when

The page fits one screen, every item cites its artifact, and the one-line answer format is given.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
- 1.2 — 2026-10-11 — used only for points reserved for Afik; ORCHESTRATOR passes the gates (Working rules).
- 1.1 — 2026-10-11 — Gate 2 in plain language: Afik approves gates, not diffs (decision "Elevated path: Afik
  approves gates, not diffs").

- P2 — 2026-10-18 — אישור אפיק 17.10: align with canonical authority, sequence and records; no gate removed.
