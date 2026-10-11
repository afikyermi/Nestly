# Workflow — canonical pipeline

**Version:** 1.6
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
  intake.md     ORCHESTRATOR      classification: SRS IDs, open items, risk flags, path, team (written by /feature)
  spec.md       SPEC              the contract. SRS IDs it implements. acceptance criteria. frozen at Gate 1
  bug.md        ORCHESTRATOR      bug-fix path only, in place of spec.md: expected (SRS ID), actual, reproduction
  schema.md     DATA ARCHITECT    only when schema changes. this is Gate 2
  algorithm.md  ALGORITHM & DATA  only when signals, ranking, analytics events or paid placement are involved
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
| 1 | Afik or ORCHESTRATOR | intent, one or two sentences — from Afik, or the next item in WORKPLAN | — |
| 2 | ORCHESTRATOR | classify, pick path, select team — `/feature` | `intake.md` |
| 3 | **SPEC** | write the contract | `spec.md` |
| 4 | **ORCHESTRATOR** | ✋ **Gate 1** — approve `spec.md` against the SRS, or return it to SPEC. A reserved point (CLAUDE.md → "Decision authority") goes to WORKPLAN for Afik | approved `spec.md` |
| 5 | **DATA ARCHITECT** | *only if schema changes* — Gate 2. Policies follow the authorization layers in `.claude/knowledge/data-model.md` | `schema.md` |
| 5b | **ALGORITHM & DATA** | *only if the feature uses behavioural signals, ranks or recommends, records analytics events, or places paid content* — purpose map, pipeline, configuration, events, evaluation. Feeds DATA ARCHITECT when tables are needed | `algorithm.md` |
| 6 | **BUILDER** | branch, implement. calls SCOUT as needed | diff + `notes.md` |
| 7 | **CI** | 🤖 typecheck · tests · lint · RLS checks (the list in WORKPLAN 7.1). red → back to 6 | green build |
| 8 | **TEST ENGINEER** | tests derived from `spec.md` only | test files |
| 9 | **CRITIC** | review the diff cold, including every invariant in `.claude/knowledge/srs-review-points.md` that the diff touches and the platform rules in `.claude/knowledge/data-model.md`. ALGORITHM & DATA reviews in parallel when step 5b ran | `findings.md` + verdict |
| 10 | **BUILDER** | address findings | updated diff |
| 11 | **CRITIC** | re-check **only what it raised** | verdict |
| 12 | **ORCHESTRATOR** | ✋ **Preview** — open the deployed preview, check the acceptance criteria, record its URL in WORKPLAN | go / no-go |
| 13 | ORCHESTRATOR | merge, write result, update logs | `result.md` |
| 14 | ORCHESTRATOR | **update the SRS** if behaviour changed — the right section file, its own format, new IDs continue the sequence · rebuild the index (`node tools/build-srs-index.js`) · update §17 (Traceability Matrix) when pages, FRs or entities changed · add a change-history row at the batch's version | updated `docs/srs/` |

Steps 8 and 9 may run in parallel — they are independent and neither reads the other's output.

## Light path

1 → 6 → 7 → 12 → 13 → 14 (14 only if user-visible behaviour changed). No SPEC, no CRITIC, no TEST ENGINEER.

Entry condition — **all** must hold: no schema change · no authz · no endpoint reachable without
authentication and no new external surface · no new dependency · under ~30 lines · no risk flag.

If any condition fails mid-work, stop and re-enter the Standard path. Do not finish "since it's nearly done."

## Elevated path

Standard, plus: DATA ARCHITECT always · CRITIC on opus. ORCHESTRATOR passes Gate 1, Gate 2 and the
Preview. An irreversible or destructive change still needs Afik's explicit approval, and a migration to
production waits for his approval on the GitHub `production` environment (CLAUDE.md → "Decision authority").

Entry condition: any risk flag in `CLAUDE.md`.

## Bug-fix path

A defect in merged code: behaviour differs from what the SRS, or an approved `spec.md`, says.

| # | Actor | Action | Output |
|---|---|---|---|
| 1 | ORCHESTRATOR | write `bug.md` — expected behaviour with its SRS ID, actual behaviour, reproduction steps. classify by the risk flags. add the `escapes.md` entry, with the gate that should have caught it | `bug.md` |
| 2 | **TEST ENGINEER** | a regression test derived from `bug.md` only — never the code. it must fail on the current code; a test that passes does not reproduce the bug | failing test |
| 3 | **BUILDER** | the smallest change that fixes the root cause. no refactoring beyond it | diff + `notes.md` |
| 4 | **CI** | the new test passes and nothing else turned red | green build |
| 5 | **CRITIC** | review the diff cold. skipped only when the fix meets every Light-path condition. any risk flag → Elevated: CRITIC on opus, and DATA ARCHITECT when the fix touches data | verdict |
| 6 | **ORCHESTRATOR** | ✋ **Preview** — only if the fix is user-visible | go / no-go |
| 7 | ORCHESTRATOR | merge, `result.md`, step 14 if behaviour the SRS describes changed | `result.md` |

- **No SRS behaviour, no bug.** If the expected behaviour is not in the SRS or an approved spec, this is a
  requirements gap: a `DECISION REQUEST` to its decision owner (CLAUDE.md → "Decision authority"), then the
  Standard path. Never fix toward a behaviour
  nobody approved.
- **No bug fix skips the failing test**, even when its size would fit the Light path.
- A root cause that needs a schema change goes through DATA ARCHITECT, as on any other path.

---

## The three rules that make the reviews real

These are not style preferences. Remove any one of them and the corresponding gate becomes theatre.

1. **CRITIC must not read `notes.md`.**
   If it reads BUILDER's reasoning it is persuaded by it. Cold eyes or nobody.

2. **TEST ENGINEER must not read the diff.** It reads `spec.md` only — or `bug.md` on the bug-fix path.
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
| **DECISION REQUEST** | any | needs a decision owner: ORCHESTRATOR, or Afik for a reserved point | yes |

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

**Two reviewers, one outcome.** When ALGORITHM & DATA reviews in parallel (step 5b ran), it returns its own
verdict on the same scale. A `Not Ready` from **either** CRITIC or ALGORITHM & DATA blocks. Any
`Validated with Concern` goes to `debt.md`. Only two `Validated` (or `Validated with Concern`) verdicts proceed.

## Traceability

Every test name carries the FR/AC IDs it asserts. Every commit carries a line `Implements: FR-…, AC-…`.
In code, an ID appears only beside a direct implementation of a BR or VAL rule — IDs scattered through
code go stale. A commit that implements no requirement says so (`Implements: none — <reason>`).

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

And the **evidence**: what was verified, how, and at which commit — tests, CI, the preview, data read
back after a write. Evidence carried over from an earlier run names its original commit. It is never
presented as a fresh run.

---

## Domains — cross-cutting concerns without their own agent

A domain is a concern every relevant agent applies. It owns no task and no asset; it names who checks
what, and when. A domain becomes an agent only through the Agent Necessity Test.

### Accessibility — WCAG 2.2 AA (SRS NFR-A11Y-001, decision D6)

| | |
|---|---|
| **Trigger** | any new or changed UI |
| **BUILDER** | builds to the accessibility constraints in `.claude/knowledge/conventions.md`, with the `accessibility` and `rtl-hebrew` craft skills. Shared UI components carry accessibility once, so every screen inherits it |
| **TEST ENGINEER** | axe-core checks inside the Playwright E2E tests of every screen the feature touches |
| **CRITIC** | what automation misses: keyboard operation, focus order and visibility, meaningful labels, target size — loading the `accessibility` skill when the diff changes UI |
| **Severity** | a WCAG 2.2 AA failure on a core flow is `high` |

### Design consistency — one visual system (decision "Design consistency without a design agent")

| | |
|---|---|
| **Trigger** | any new or changed UI |
| **BUILDER** | builds with the `design-system` craft skill, next to `accessibility`, `rtl-hebrew` and `ux-copy-he`: semantic tokens only, reuse of existing components, the designed states. Every changed component gets a Storybook story with its states |
| **CI** | from 9.7, lint rejects physical direction classes, arbitrary Tailwind values, hex outside the tokens source and `@radix-ui` imports outside `components/ui`; a Vitest test holds every token pair in `docs/design/tokens.md` to its WCAG contrast threshold |
| **TEST ENGINEER** | Playwright screenshots of the changed stories — non-blocking at first, until they prove stable |
| **CRITIC** | what lint cannot see: the `design-system` forbidden list 4–10 (duplicated components, two primary actions, pastel-only signals, loud counters, borders as identity, spinner or disabled submit, `dark:`) — one required check |
| **Preview** | ORCHESTRATOR checks the screens against `docs/design/` and the approved mockups. A change to the visual direction itself (palette, font, layout) is a recorded decision, not a Preview fix |
| **Severity** | a broken token or contrast pair on a core flow is `high`; a duplicated component or a second primary action is `medium` |
| **Revisit** | three design-consistency escapes in `escapes.md` open an Agent Necessity Test for a design agent |

*Threat Modeling, the second domain in plan item 6.1, has not been added yet.*

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
| ALGORITHM & DATA | subagent | **opus always** | purpose limits on personal data and minors' data; rare, high-stakes decisions |
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

---

## Changelog
- 1.1 — 2026-10-10 — added the bug-fix path and the `bug.md` artifact · CRITIC's step 9 includes the Supabase
  platform rules in `data-model.md` · `result.md` records evidence. Decided by Afik after the
  engineering-guidelines review (`docs/engineering-guidelines-review-HE.md`). Design-time change, provisional
  until 5 features.
- 1.2 — 2026-10-11 — CI gate includes typecheck · Light path: "no new endpoint" becomes "no endpoint reachable
  without authentication and no new external surface" · a Not Ready from CRITIC or ALGORITHM & DATA blocks ·
  traceability: FR/AC IDs in test names and an `Implements:` line in commits · step 14 updates SRS §17.
  Decided by Afik (TypeScript and own-server decisions, 11.10.2026). Provisional until 5 features.
- 1.3 — 2026-10-11 — `intake.md` artifact, written by `/feature` at step 2 · the Accessibility domain names the
  craft skills. Process skills in `.claude/skills/` carry out these steps; this file still defines them.
  Decided by Afik (skills decision). Provisional until 5 features.
- 1.4 — 2026-10-11 — Elevated: Afik no longer reviews the diff; the protection is CRITIC on opus, DATA ARCHITECT, CI and
  hooks. Gate 2 reaches him as a plain-language /gate page; irreversible changes still need his approval.
  Decided by Afik. Design-time change.
- 1.5 — 2026-10-11 — Working rules: ORCHESTRATOR passes Gate 1, Gate 2 and the Preview and decides unreserved
  `DECISION REQUEST`s, recording each in `decisions.md`. Reserved for Afik: secrets, production, irreversible or
  material SRS changes, legal / minors / money points, disagreement with a specialist. Decided by Afik.
- 1.6 — 2026-10-11 — "Design consistency" domain, modelled on Accessibility (WORKPLAN 9.6). Decided by Afik
  ("Design consistency without a design agent"); the Preview row follows the working rules. Provisional until 5
  features.
