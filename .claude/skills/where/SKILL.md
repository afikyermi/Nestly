---
name: where
description: Shows where the Nestly work stands — status, what waits for Afik's decision, the next task, open feature folders and uncommitted work. Use when Afik asks where things stand, at the start of a session, or after a break.
disable-model-invocation: true
---

# /where — where the work stands

**Version:** 1.1 · reads only, writes nothing.

## Input

None.

## Steps

1. Read the "איפה אנחנו עומדים" block at the top of `WORKPLAN-HE.md`. It is the source of truth for status —
   never reconstruct status from git history or memory.
2. List open feature folders: every `.work/<slug>/` (not `_initiatives`) without a `result.md`. For each: the
   latest artifact present (`intake.md`, `spec.md`, `schema.md`, `notes.md`, `findings.md`, `bug.md`) and the
   next-action owner implied by `.claude/workflow.md`.
3. Run `git status --short` and `git log --oneline -3`. Report uncommitted work; apply workflow →
   Records and commits for cadence. Local work alone does not require a WORKPLAN edit.

## Output — to Afik, in Hebrew, at most 15 lines

- **מצב** — one line
- **המשימה הבאה** — one line
- **ממתין להחלטה שלך** — numbered, in a format Afik can answer in one line
- **פיצ'רים פתוחים** — slug · last artifact · next owner
- **לא נשמר** — uncommitted files, or "אין"

## Stop conditions

- The WORKPLAN block is missing or conflicts with the current Initiative handoff → say so, never guess.
  A newer part commit alone does not make the per-Initiative WORKPLAN stale.

## Done when

Every line cites its source: a WORKPLAN line, a `.work/` path or a git command.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.

- P2 — 2026-10-18 — אישור אפיק 17.10: align with canonical authority, sequence and records; no gate removed.
