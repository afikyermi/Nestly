---
name: bugfix
description: Starts the bug-fix path — finds the expected behaviour in the SRS, writes bug.md, logs the escape and hands off to TEST ENGINEER for a failing test. Use when merged code behaves wrongly, as `/bugfix <description>`.
disable-model-invocation: true
argument-hint: <what happens, and where>
---

# /bugfix — open the bug-fix path

**Version:** 1.0 · the path itself is defined in `.claude/workflow.md` → "Bug-fix path". This skill performs its
first step.

## Input

`$ARGUMENTS` — what happens, where, and how Afik saw it.

## Steps

1. **Expected behaviour.** Find the SRS item, or the approved `spec.md`, that describes what should happen —
   with the `srs-lookup` method. Quote its ID and file.
2. **Classify.** Mark the risk flags (`CLAUDE.md` → "Risk flags"). Any true flag means the fix is Elevated.
3. **Write `.work/<slug>/bug.md`:**

   ```markdown
   # bug — <short name>
   **Expected**      the behaviour, with its SRS ID and file
   **Actual**        what happens instead
   **Reproduction**  steps, data, account type
   **Risk flags**    each flag: true/false — reason
   **Path**          bug-fix · Elevated if any flag is true
   ```

4. **Log the escape** in `escapes.md`, in its header format, naming the gate that should have caught it.
5. **Hand off** to TEST ENGINEER with a pointer to `bug.md`: the regression test comes first, and it must fail.

## Stop conditions

- No SRS item or approved spec describes the expected behaviour → this is a requirements gap, not a bug:
  `DECISION REQUEST` to Afik. Do not write `bug.md` as if it were specified.
- The report cannot be reproduced → `QUESTION` to Afik, with the default: the bug stays open and is not fixed
  blind.

## Done when

`bug.md` cites an SRS ID, the `escapes.md` entry exists, and the next owner is TEST ENGINEER.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
