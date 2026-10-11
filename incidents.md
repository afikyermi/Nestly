# Incidents

Material operational failures. Afik is told about every entry here.

Not only security — anything where a component, environment or capability stopped working.

```
YYYY-MM-DD HH:MM | <what failed> | impact | state: open | contained | resolved | action
```

---

## What counts as material

| Event | Why |
|---|---|
| **migration failed mid-run** | the schema is in an undefined state. the most serious entry this file can hold |
| CI red on `main` | the main branch is broken; everything built on it is suspect |
| CI red over 24h | the pipeline is muted in practice, even if nobody said so |
| deploy or preview failed | Gate 2 is gone |
| a hook blocked an action | an agent attempted to cross a guardrail. **always reported** |
| external dependency down | storage, auth, database |
| an agent looped, or repeated the same failure three times | a failure of the agent system, not of the product |
| secret detected in a commit or in output | contain first, then report |

## Rules

- Immediate containment is allowed within existing permissions. Containment is not a baseline change.
- A permanent fix goes back through normal change control. An emergency action never silently becomes
  the new design.
- Every entry is logged even when it was resolved in a minute. The pattern matters more than the
  individual event.

---

2026-10-11 18:26 | 6 hook blocks, all deliberate: the live probes that activated the 7.2 guard (main loop git add -A; CRITIC git diff without the notes.md exclusion; TEST ENGINEER Read of apps/web/src, logged twice before the single-log fix; BUILDER Write and redirect into tests/) | none, no call ran | state: resolved | WORKPLAN 7.2/7.3: verification, not an incident
