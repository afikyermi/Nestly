# Workflow — canonical pipeline

**Version:** 1.14
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
| 6 | **BUILDER** | branch, implement. calls SCOUT as needed. Writes `interface.md`: for each screen and module a test touches — roles and accessible names, routes and history state, exported functions and props with their types, test seams (injected clock, launchers, mocks), and how a test drives the flow. Behaviour and interface only: no reasoning, no code | diff + `notes.md` + `interface.md` |
| 7 | **Local checks** | 🤖 typecheck · lint · `check:budgets` · `check:stories` · the unit tests and the database tests that run on this machine. red → back to 6. No push, no CI wait between steps | green local run |
| 8 | **TEST ENGINEER** | tests derived from `spec.md`, to the depth of each criterion's type and at one layer per behaviour ("Test rules" below), with `interface.md` for names and seams; runs its own tests until they pass or fail for a reason it reports — a test failing against its criterion is a finding, never weakened to pass. Before this step ORCHESTRATOR checks `interface.md` holds facts only (names, routes, exports, seams; no outcomes, no reasoning); ORCHESTRATOR runs the full local checks before the push | test files |
| 9 | **CRITIC** | review the diff cold, including every invariant in `.claude/knowledge/srs-review-points.md` that the diff touches and the platform rules in `.claude/knowledge/data-model.md`. ALGORITHM & DATA reviews in parallel when step 5b ran. Fixes (10–11) are checked locally too. **Then one push** for the finished part — code, tests, review, fixes — and GitHub CI (typecheck · tests · lint · RLS checks) on its last commit is the merge condition. Red → fix, check locally, push once | `findings.md` + verdict, then green CI |
| 10 | **BUILDER** | address findings | updated diff |
| 11 | **CRITIC** | re-check **only what it raised** | verdict |
| 12 | **ORCHESTRATOR** | ✋ **Preview** — open the deployed preview, check the acceptance criteria, record its URL in WORKPLAN | go / no-go |
| 13 | ORCHESTRATOR | merge, write result, update logs | `result.md` |
| 14 | ORCHESTRATOR | **update the SRS** if behaviour changed — the right section file, its own format, new IDs continue the sequence · rebuild the index (`node tools/build-srs-index.js`) · update §17 (Traceability Matrix) when pages, FRs or entities changed · add a change-history row at the batch's version | updated `docs/srs/` |

Steps 8 and 9 may run in parallel — they are independent and neither reads the other's output.

**No merge to `main` without green CI on GitHub.** Every path merges through a PR, and only after every
GitHub Actions check on its latest commit is green (`gh pr checks`). A local run — `npm test`, `npm run ci` — is
evidence for the builder, never the gate: the runner is Linux on the `.nvmrc` Node version, and this machine is
not. A commit pushed after the checks passed needs them to pass again. `result.md` records the run URL.

## Light path

1 → 6 → 7 → 12 → 13 → 14 (14 only if user-visible behaviour changed). No SPEC, no CRITIC, no TEST ENGINEER.

Entry condition: `CLAUDE.md` → "Path selection", Light — **all** must hold.

If any condition fails mid-work, stop and re-enter the Standard path. Do not finish "since it's nearly done."

## Elevated path

Standard, plus: DATA ARCHITECT always · CRITIC on opus. The protection is the reviewers, CI and the hooks.
Who passes the gates, and what still needs Afik: `CLAUDE.md` → "Human gates" and "Decision authority".

Entry condition: any risk flag in `CLAUDE.md`.

## Bug-fix path

A defect in merged code: behaviour differs from what the SRS, or an approved `spec.md`, says.

| # | Actor | Action | Output |
|---|---|---|---|
| 1 | ORCHESTRATOR | write `bug.md` — expected behaviour with its SRS ID, actual behaviour, reproduction steps. classify by the risk flags. add the `escapes.md` entry, with the gate that should have caught it | `bug.md` |
| 2 | **TEST ENGINEER** | a regression test derived from `bug.md` only — never the code. it must fail on the current code; a test that passes does not reproduce the bug | failing test |
| 3 | **BUILDER** | the smallest change that fixes the root cause. no refactoring beyond it | diff + `notes.md` |
| 4 | **CI** | the new test passes and nothing else turned red, on GitHub Actions — see "No merge to `main` without green CI on GitHub" | green build |
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

2. **TEST ENGINEER must not read the diff.** It reads `spec.md` — or `bug.md` on the bug-fix path — and
   `interface.md`, which names what exists (roles, labels, routes, exports, seams) but never why or how it works.
   A test derived from the implementation asserts that the code does what the code does — zero information.
   A test derived from acceptance criteria asserts that the code does what was promised.

3. **An acceptance criterion a test cannot assert is not an acceptance criterion.**
   TEST ENGINEER that cannot derive a test returns the criterion to SPEC. It does not guess.

---

## Upward channels

The channels — who raises each, when, and whether it blocks — are in `CLAUDE.md` → "Message types", which every
agent loads.

### SPEC CHALLENGE

```
criterion:    which acceptance criterion is the problem
problem:      why — cost, risk, or not implementable as written
alternative:  what instead, and what changes for the user
```

One per feature, before code. Its decision owner decides in one line — ORCHESTRATOR, or Afik when the
challenge touches a reserved point (CLAUDE.md → "Decision authority"). This is what keeps the team professional
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

**Two strikes.** After the second `Not Ready` (from either reviewer) on the same task, ORCHESTRATOR does not send
it back to BUILDER a third time. It writes a short impact note and files a `BLOCKER` to Afik about the approach,
and waits. Two `Not Ready` never become a pass (decisions.md, 2026-10-13).

**Round limit (Afik, 2026-10-13, every task).** After a `Not Ready`: one fix round, one re-check, never a third. A
process or guard task that still fails is not merged — its branch stays, a `debt.md` line, back to `main`, next WORKPLAN
task without waiting. A product feature stops under Two strikes: `BLOCKER` with an impact note in WORKPLAN, work
continues on whatever does not depend on it, else the session ends in the return format. Each task ends with one
WORKPLAN line: merged / stopped (why) / next.

## Traceability

Every test name carries the FR/AC IDs it asserts. Every commit carries a line `Implements: FR-…, AC-…`.
In code, an ID appears only beside a direct implementation of a BR or VAL rule — IDs scattered through
code go stale. A commit that implements no requirement says so (`Implements: none — <reason>`).
Merges to `main` are squash: the PR body becomes the squash message, so it carries the `Implements:` line covering the
whole PR.

---

## Result

`result.md`, at most 15 lines, no narrative (Afik, 13.10.2026) — two independent axes:

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

## Waiting on Afik — keep working

When the main track stops for a decision of Afik's (a reserved `DECISION REQUEST`, a `MATERIAL CHANGE` whose owner is
Afik, a secret or a production step), ORCHESTRATOR does not idle. It continues on work that does not depend on the
decision: other parts of the same feature, the next feature's intake and spec, small `debt.md` items.

1. **One side track at most** open at any moment. If the side track also stops for a decision, everything waits for Afik.
2. **For each stopped track:** one line in WORKPLAN under "ממתין להכרעה שלך", and one line under "להמשך" with the exact
   resume point — branch, file, step.
3. **When the decision arrives:** resume the main track first, then the side track.
4. **Every update to Afik** carries one line: what was done while waiting.

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

## Test rules — this project

Decided by Afik (14.10.2026) — quality is not lowered; duplication is removed and tests aim at real problems. From F1.5.

- **Depth by type** — SPEC marks each criterion 🔴 / 🎨 / 🟡; TEST ENGINEER covers it to that depth (its definition).
- **One layer per behaviour** — permissions → pgTAP · logic → unit (Vitest) · screen behaviour → e2e (Playwright) ·
  a component Vitest test only for logic with no e2e expression.
- **Devices** — every 🎨 criterion at desktop (1024) and phone (375).
- **Browsers** — pull requests run e2e on Chrome only (desktop + phone). Edge (job `browser-edge`) runs on every merge
  to `main` and by hand (`workflow_dispatch`): after the merge, so it does not block the production deploy. A release
  gate before the deploy is an open question for Afik (WORKPLAN).
- **Visual regression** — Playwright screenshots are blocking for every screen the feature touches, desktop and phone.
  Noise is stabilised (fonts, animation, clock, data), never switched off. A screen without a baseline gets one in the
  same PR. The list `e2e/visual-screens.ts` is opt-in — only a listed screen is compared — so SPEC names every screen a
  🎨 criterion touches, TEST ENGINEER lists each one, and CRITIC checks the list against the 🎨 criteria.
- **Soft ceiling** — test lines ≤ 2× product lines per feature; above it, one line in `result.md` says why.
- **Tools and hooks** — no new tests unless a tool actually broke.

---

## Cost discipline

Target: **8–12 model calls per Standard feature, or per part of a split spec.** If one exceeds ~20, stop and ask
why — usually the spec was too large and should have been split. Parts of one spec run in sequence without stopping,
except on a reserved item, a real `BLOCKER` or Two strikes.

- No agent reads the whole repository.
- Use SCOUT instead of reading files "to be safe." Every unnecessary file read burns context
  that the actual work needs.
- Pass pointers, not prose.

---

## Changelog
- 1.1 — 2026-10-10 — added the bug-fix path and the `bug.md` artifact · CRITIC's step 9 includes the Supabase platform rules in `data-model.md` · `result.md` records evidence. Decided by Afik after the engineering-guidelines review (`docs/engineering-guidelines-review-HE.md`). Design-time change, provisional until 5 features.
- 1.2 — 2026-10-11 — CI gate includes typecheck · Light path: "no new endpoint" becomes "no endpoint reachable without authentication and no new external surface" · a Not Ready from CRITIC or ALGORITHM & DATA blocks · traceability: FR/AC IDs in test names and an `Implements:` line in commits · step 14 updates SRS §17. Decided by Afik (TypeScript and own-server decisions, 11.10.2026). Provisional until 5 features.
- 1.3 — 2026-10-11 — `intake.md` artifact, written by `/feature` at step 2 · the Accessibility domain names the craft skills. Process skills in `.claude/skills/` carry out these steps; this file still defines them. Decided by Afik (skills decision). Provisional until 5 features.
- 1.4 — 2026-10-11 — Elevated: Afik no longer reviews the diff; the protection is CRITIC on opus, DATA ARCHITECT, CI and hooks. Gate 2 reaches him as a plain-language /gate page; irreversible changes still need his approval. Decided by Afik. Design-time change.
- 1.5 — 2026-10-11 — Working rules: ORCHESTRATOR passes Gate 1, Gate 2 and the Preview and decides unreserved `DECISION REQUEST`s, recording each in `decisions.md`. Reserved for Afik: secrets, production, irreversible or material SRS changes, legal / minors / money points, disagreement with a specialist. Decided by Afik.
- 1.6 — 2026-10-11 — "Design consistency" domain, modelled on Accessibility (WORKPLAN 9.6). Decided by Afik ("Design consistency without a design agent"); the Preview row follows the working rules. Provisional until 5 features.
- 1.7 — 2026-10-12 — No merge to `main` without green CI on GitHub Actions; a local run is not the gate. Decided by Afik after `ci.yml` was red on GitHub for runs 1–22 while merges were reported green locally.
- 1.8 — 2026-10-13 — "Two strikes" under Verdicts: a second `Not Ready` on one task stops it for Afik. Decided by Afik (agent-system slimming, guard approach c).
- 1.9 — 2026-10-13 — Traceability: squash merges, the PR body carries the `Implements:` line. Decided by Afik ("Commits and pushes", agent-slim stage 3).
- 1.11 — 2026-10-14 — CI once per part: steps 7–9 run on local checks; one push when the part is finished; green GitHub CI on the last commit stays the merge condition. Decided by Afik ("CI once per part").
- 1.10 — 2026-10-13 — SPEC CHALLENGE goes to its decision owner, not always to Afik. Decided by Afik (agent-slim stage 4, contradiction 2). Same day: `result.md` at most 15 lines; the cost target also per part; parts run in sequence (Afik, "From building the system to building the product"). The last change before I1 merges.
- 1.12 — 2026-10-14 — BUILDER writes `interface.md` (step 6); TEST ENGINEER reads it with the spec, edits and runs its own tests (step 8). Decided by Afik ("מאשר 4–6", speed-up), an exception to the I1 freeze.
- 1.13 — 2026-10-14 — "Waiting on Afik — keep working": while a track waits on Afik, ORCHESTRATOR continues on independent work; one side track at most; WORKPLAN lines for each stopped track; main track resumes first; every update says what was done while waiting. Decided by Afik (14.10, an exception to the I1 freeze).
- 1.14 — 2026-10-15 — "Test rules — this project": depth by criterion type, one layer per behaviour, desktop and phone, Chrome-only e2e on PRs and Edge after each merge to main and by hand, blocking visual regression, soft 2× ceiling, no new tool tests; step 8 points to it. Decided by Afik (14.10, an exception to the I1 freeze); applies from F1.5.
