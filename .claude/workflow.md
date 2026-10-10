# Workflow — canonical pipeline

**Version:** 1.0
**Status:** the single source of truth for sequence, triggers and who enters when.
Agent definitions describe professions. **This file describes order.** If they disagree, this file wins.

---

## Levels of work

| Level | Unit | Who approves | State lives in |
|---|---|---|---|
| **Initiative** | a cluster of related features with dependencies between them | Afik | `.work/_initiatives/<name>.md` |
| **Feature** | one shippable change that fits one context window | Afik, via `spec.md` | `.work/<slug>/` |
| **Step** | one agent invocation | — | the artifact it writes |

An Initiative is approved once. Features inside it then flow without further initiative-level approval.

---

## Artifacts per feature

```
.work/<slug>/
  spec.md       SPEC              the contract. SRS IDs it implements. acceptance criteria. frozen at Gate 1
  schema.md     DATA ARCHITECT    only when schema changes. this is Gate 2
  notes.md      BUILDER           decisions and why. CRITIC must not read this
  findings.md   CRITIC            fixed schema
  result.md     ORCHESTRATOR      execution × quality, planned vs actual, SRS IDs implemented or changed
```

`spec.md` is a historical record of what was approved. The code is the as-built.
The maintained as-built descriptions are `.claude/knowledge/data-model.md` and `conventions.md`.

---

## Standard path

| # | Actor | Action | Output |
|---|---|---|---|
| 1 | Afik | intent, one or two sentences | — |
| 2 | ORCHESTRATOR | classify, pick path, select team | — |
| 3 | **SPEC** | write the contract | `spec.md` |
| 4 | **Afik** | ✋ **Gate 1** — approve or edit one page | approved `spec.md` |
| 5 | **DATA ARCHITECT** | *only if schema changes* — Gate 2 | `schema.md` |
| 6 | **BUILDER** | branch, implement. calls SCOUT as needed | diff + `notes.md` |
| 7 | **CI** | 🤖 tests · lint · RLS policy present on every touched table. red → back to 6 | green build |
| 8 | **TEST ENGINEER** | tests derived from `spec.md` only | test files |
| 9 | **CRITIC** | review the diff cold | `findings.md` + verdict |
| 10 | **BUILDER** | address findings | updated diff |
| 11 | **CRITIC** | re-check **only what it raised** | verdict |
| 12 | **Afik** | ✋ **Preview** — click it | go / no-go |
| 13 | ORCHESTRATOR | merge, write result, update logs | `result.md` |
| 14 | ORCHESTRATOR | **update the SRS** if behaviour changed — the right section file, its own format, new IDs continue the sequence · rebuild the index (`node tools/build-srs-index.js`) · add a change-history row at the batch's version | updated `docs/srs/` |

Steps 8 and 9 may run in parallel — they are independent and neither reads the other's output.

## Light path

1 → 6 → 7 → 12 → 13 → 14 (14 only if user-visible behaviour changed). No SPEC, no CRITIC, no TEST ENGINEER.

Entry condition — **all** must hold: no schema change · no authz · no new endpoint ·
no new dependency · under ~30 lines · no risk flag.

If any condition fails mid-work, stop and re-enter the Standard path. Do not finish "since it's nearly done."

## Elevated path

Standard, plus: DATA ARCHITECT always · CRITIC on opus · Afik reviews the diff before merge,
not only the preview.

Entry condition: any risk flag in `CLAUDE.md`.

---

## The three rules that make the reviews real

These are not style preferences. Remove any one of them and the corresponding gate becomes theatre.

1. **CRITIC must not read `notes.md`.**
   If it reads BUILDER's reasoning it is persuaded by it. Cold eyes or nobody.

2. **TEST ENGINEER must not read the diff.** It reads `spec.md` only.
   A test derived from the implementation asserts that the code does what the code does — zero information.
   A test derived from acceptance criteria asserts that the code does what was promised.

3. **An acceptance criterion a test cannot assert is not an acceptance criterion.**
   TEST ENGINEER that cannot derive a test returns the criterion to SPEC. It does not guess.

---

## Upward channels

| Channel | Who | When | Blocking? |
|---|---|---|---|
| **SPEC CHALLENGE** | BUILDER | before writing code, once | no |
| **MATERIAL CHANGE** | any | mid-execution, the approved solution no longer holds | **yes — branch pauses** |
| **BLOCKER** | any | work stopped, no reasonable default | **yes** |
| **QUESTION** | any | unknown, but a default exists and is stated | no |
| **DECISION REQUEST** | any | needs Afik's authority | yes |

### SPEC CHALLENGE

```
criterion:    which acceptance criterion is the problem
problem:      why — cost, risk, or not implementable as written
alternative:  what instead, and what changes for the user
```

One per feature, before code. Afik decides in one line. This is what keeps the team professional
rather than merely compliant.

---

## Verdicts

CRITIC returns exactly one. This is the release-readiness statement.

| Verdict | Meaning | Consequence |
|---|---|---|
| `Validated` | ready | proceed to preview |
| `Validated with Concern` | ready, and a choice here will hurt later | proceed + entry in `debt.md` |
| `Not Ready` | not ready | back to BUILDER. ORCHESTRATOR may not reinterpret this |

A review returned as prose without a verdict is rejected and re-run.

---

## Result

`result.md`, two independent axes:

- **Execution:** `Succeeded` · `Partially Succeeded` · `Failed` · `Blocked`
- **Quality:** `Good` · `Needs Improvement` · `Not Good`

A feature can ship and be bad. Recording both is what makes `escapes.md` meaningful.

Also record **planned vs actual**: the size estimate from `spec.md` against `git diff --stat`.
Over time this calibrates SPEC's splitting rule.

And the **SRS trace**: which requirement IDs were implemented, which changed, and which SRS files were
updated in step 14. A feature is not done until the SRS describes what was actually built.

---

## Temporary hold

Any agent may raise a temporary hold: *"do not merge yet, I am still looking."*
Not a veto — a coordination primitive. It states what is being checked and is released by the
agent that raised it.

---

## Model assignment

| Agent | Runs as | Model | Why |
|---|---|---|---|
| ORCHESTRATOR | **the main loop** | — | orchestration needs the full task context |
| SPEC | subagent | opus when a risk flag is set, else sonnet | specification errors are the largest failure class |
| DATA ARCHITECT | subagent | **opus always** | rare decisions, expensive to reverse |
| BUILDER | subagent | sonnet; opus when a risk flag is set | own context window per feature |
| SCOUT | subagent | **haiku** | search, not judgment |
| CRITIC | subagent | opus when a risk flag is set, else sonnet | — |
| TEST ENGINEER | subagent | sonnet | — |

Subagents inherit the lead's model unless pinned. **Pin them**, or a search runs on opus.

**Why BUILDER is a subagent and not the main loop.** The orchestrator's context accumulates across
features — logs, decisions, sequencing. A builder's context should start fresh per feature and hold
only the spec plus the code it touches. Mixing the two is the context-rot failure. The handoff costs
nothing here because the output is a diff, not a summary: CRITIC reads the real artifact.

---

## Cost discipline

Target: **8–12 model calls per Standard feature.** If a feature exceeds ~20, stop and ask why —
usually the spec was too large and should have been split.

- No agent reads the whole repository.
- Use SCOUT instead of reading files "to be safe." Every unnecessary file read burns context
  that the actual work needs.
- Pass pointers, not prose.
