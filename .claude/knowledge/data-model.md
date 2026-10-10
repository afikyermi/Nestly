# Data model — as-built

**Maintained by:** DATA ARCHITECT. Updated on every schema change, in the same unit of work.
**Status:** empty. No schema exists yet.

This file is one of the two maintained as-built descriptions. The other is `conventions.md`.
Everything else about the system is read from the code.

---

## Authorization enforcement layer — DECIDED

> **PostgreSQL Row Level Security. Enforced in the database, never in application code.**

### What this obliges

| Rule | Consequence |
|---|---|
| **Every table carries RLS policies** | a table with RLS disabled is a defect, not a shortcut |
| **Application code never filters for permission** | if code has to remove rows the user should not see, the policy is wrong. Fix the policy |
| **The policy is the authorization model** | it must be readable top to bottom and say plainly who may read, write and delete each table |
| **A new table without a policy does not ship** | this is a `Not Ready`, not a concern |

### Why, in one line

A rule attached to the data cannot be bypassed by forgetting. Enforcement in code has to be repeated
at every read path — feed, search, notifications, profile, related content, any future API — and one
omission is a privacy leak.

### What DATA ARCHITECT owns as a result

The security boundary, not only the shape of the data. A schema change and a policy change are one
unit of work, reviewed together. Neither ships without the other.

SQL and RLS policies are database configuration, not application code, and are therefore outside the
iron rule on languages.

---

## Schema conventions — to be decided with the first table

Not decided yet, and deliberately not guessed. DATA ARCHITECT proposes, Afik approves, recorded here:

identifier type and generation · timestamp type and timezone · soft-delete vs hard-delete
representation · table and column naming · how enums are represented · how the RLS helper functions
are organized.

**The naming convention matters more than usual here**: with no typecheck, a wrong column name is a
runtime failure rather than a compiler error.

---

## Entities

*none yet*

When entities exist, each gets:

```
### <entity>
purpose:        what it represents, in one line
key fields:     field — type — meaning. meaning is the part that matters
owner:          which actor owns a row, and how that is established
authorization:  who may read / write / delete, and where that rule is enforced
relations:      to what, with what cascade behaviour
indexes:        index — the query it serves
retention:      soft or hard delete, and what is retained after
```

---

## Conventions in force

*none yet*

Recorded here once decided: identifier type and generation · timestamp type and timezone ·
soft-delete representation · naming convention for tables and columns · enum representation.

---

## Known debt

*none yet*

Anything knowingly imperfect in the model, with the reason it was accepted.
