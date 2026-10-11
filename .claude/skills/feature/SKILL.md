---
name: feature
description: Starts a feature — classifies Afik's intent by the risk flags, picks the path, assembles the team and opens .work/<slug>/ with intake.md. Use when Afik states something to build, as `/feature <intent>`.
disable-model-invocation: true
argument-hint: <intent in one or two sentences>
---

# /feature — classify, route, open the folder

**Version:** 1.0 · the ORCHESTRATOR's intake. Rules live in `CLAUDE.md` and `.claude/workflow.md`; this skill
applies them and never restates them.

## Input

`$ARGUMENTS` — Afik's intent.

## Steps

1. **Problem.** Restate the intent as what does not work for a user today, in one line.
2. **Requirements.** Find the SRS IDs the intent touches with the `srs-lookup` method. Note every open item
   (TBD, נדרש אישור, OP) the feature would depend on.
3. **Risk flags.** Go through every flag in `CLAUDE.md` → "Risk flags". Mark each true or false, with one line
   of reason. No scoring.
4. **Path.** Choose per `CLAUDE.md` → "Path selection". In doubt, go up a level.
5. **Team.** Apply `CLAUDE.md` → "Mandatory reviews": list each trigger that fires and who it brings in.
6. **Size.** If the intent clearly will not fit one context window, propose the split (hard rule 6).
7. **Open the folder.** Create `.work/<slug>/` (kebab-case) and write `intake.md`:

   ```markdown
   # intake — <feature>
   **Intent**        Afik's words
   **Problem**       step 1
   **Requirements**  SRS IDs, with files
   **Open items**    each open item the feature depends on → DECISION REQUEST
   **Risk flags**    each flag: true/false — reason
   **Path**          Light | Standard | Elevated — why
   **Team**          who, and which trigger brought them in
   **Next owner**    SPEC, or Afik if a DECISION REQUEST is open
   ```

8. **Hand off.** If nothing is open, invoke SPEC with a pointer to `intake.md` — not a summary of it.

## Stop conditions

- The intent is not in the SRS → it is a requirements gap: `DECISION REQUEST` to Afik. Stop before SPEC.
- The feature depends on an open item → `DECISION REQUEST`. Never route around it with a default.
- The intent is ambiguous in a way that changes what gets built → `DECISION REQUEST`.

## Done when

`intake.md` exists with every field filled, every flag answered with a reason, and exactly one next owner.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
