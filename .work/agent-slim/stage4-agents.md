# Stage 4 — agents and skills against CLAUDE.md

2026-10-13. Read: all seven agent definitions, the 15 skills' steps.

## Result

- **Duplicates removed:** BUILDER's "Read decisions.md" principle (stage 3; CLAUDE.md carries it). The agent
  definitions otherwise state their profession and point to CLAUDE.md, workflow.md and knowledge — the overlaps left
  (the TBD rule in SPEC, BUILDER, DATA ARCHITECT and CRITIC; "you raised it, you validate it" in CRITIC) were placed
  there deliberately by decisions of 2026-10-11 ("Agent-model fixes") and are the agent's own angle on the rule.
  Removing them would change what an agent is told, so they stay.
- **Skills:** already pointers ("the rules are in CLAUDE.md → …"); none restates a rule. No skill deleted.
- **Descriptions sharpened:** CRITIC — has no shell, ORCHESTRATOR runs `tools/critic-diff.mjs` first; TEST ENGINEER —
  its shell runs tests only, ORCHESTRATOR commits its tests (both from stage 1).

## For Afik — older text that contradicts the working rules of 2026-10-11

Changing these changes a rule's meaning, so they are not edited. Default: unchanged; the working rules (CLAUDE.md →
"Decision authority") prevail where they conflict, as CLAUDE.md is loaded last-word by every agent.

1. `data-architect.md` → Decision rights, "Requires Afik": denormalization · a change to what an existing field means ·
   a new top-level entity. Under the working rules only irreversible changes and material SRS changes are reserved;
   the rest would be ORCHESTRATOR's.
2. `workflow.md` → SPEC CHALLENGE: "Afik decides in one line". Under the working rules an unreserved challenge is
   ORCHESTRATOR's.
3. `/wrap-up` description: "Use after Afik approves the Preview", while its preconditions say ORCHESTRATOR checked it.
