# Workflow — canonical pipeline

**Version:** 1.16
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
| 6 | **BUILDER** | branch, implement; calls SCOUT as needed. Hands off green: typecheck · lint · `check:budgets` · `check:stories` · the unit and database tests that run on this machine, on what it touched | diff + `notes.md` |
| 7 | **Local checks** | 🤖 run by the agent that wrote the files (BUILDER its code, TEST ENGINEER its tests, including typecheck and lint on them). red → that agent fixes before handing off. ORCHESTRATOR runs none of them, and no push or CI wait happens between steps. **Before every push (Afik, 16.10.2026, audit decision 3):** the database tests (pgTAP and db integration) run on this machine when the part touches `supabase/`, `apps/server/` or `packages/shared/`; line budgets run in the git pre-commit hook (`.githooks/`); an older test the part breaks is updated in the same part; a part that touches a shared screen or component runs the whole browser suite | green handoff |
| 8 | **TEST ENGINEER** | tests derived from `spec.md`, to the depth of each criterion's type and at one layer per behaviour ("Test rules" below). It reads source files for names, routes, exports and seams — never for what to assert. It starts from the spec while BUILDER builds (test files only), and after BUILDER's handoff runs its tests, typecheck and lint on them until they pass or fail for a reason it reports — a test failing against its criterion is a finding, never weakened to pass | test files |
| 9 | **CRITIC** | review the diff cold, including every invariant in `.claude/knowledge/srs-review-points.md` that the diff touches and the platform rules in `.claude/knowledge/data-model.md`; it writes `findings.md` itself; when the harness refuses the subagent's write, ORCHESTRATOR saves its hand-back verbatim. ALGORITHM & DATA reviews in parallel when step 5b ran. **One review round per part** (see "Verdicts"). **Then one push** for the finished part — code, tests, review, fixes — and GitHub CI (typecheck · tests · lint · RLS checks) on its last commit is the merge condition. ORCHESTRATOR binds the PR to the app's PR monitor and acts on its notification — no polling loops. Red → fix, check locally, push once | `findings.md` (bug list), then green CI |
| 10 | **BUILDER** | address findings | updated diff |
| 11 | **CRITIC** | re-check **only when it raised a real bug** (critical, high or medium with a failure scenario) — a fresh invocation pointed at `findings.md` and the fix commits; low items are fixed or go to `debt.md` without a re-check | bug list |
| 12 | **E** | 🤖 automated Preview E2E (`preview-e2e`) on the PR's Preview — no manual Preview | green run |
| 13 | ORCHESTRATOR | **merge without waiting for Afik** (pre-approved, Afik 16.10.2026, audit decision 1) when GitHub CI and E are green and no critical/high/medium bug from CRITIC is open — day or night; then start the next part in a new session. Afik reviews after the merge. Once per feature: `result.md` (≤ 10 lines). WORKPLAN: once per Initiative | `result.md` |
| 14 | ORCHESTRATOR | the **SRS trace** goes in `result.md` (IDs implemented or changed). The SRS files themselves are updated **once per Initiative**, at its close, with the as-built delta of all its features (`/srs-update`: section files, IDs, §17, version row, index) — and at once only when a decision changes scope or the security model | SRS trace; `docs/srs/` per Initiative |

Step 9 follows step 8: CRITIC reviews a diff that holds the finished tests. Steps 6 and 8 may run in parallel (source vs tests).

**No merge to `main` without green CI on GitHub.** Every path merges through a PR, and only after every
GitHub Actions check on its latest commit is green (`gh pr checks`). A local run — `npm test`, `npm run ci` — is
evidence for the builder, never the gate: the runner is Linux on the `.nvmrc` Node version, and this machine is
not. A commit pushed after the checks passed needs them to pass again. `result.md` records the run URL.

## Light path

1 → 6 → 7 → 12 → 13 → 14 (14 only if user-visible behaviour changed). No SPEC, no CRITIC, no TEST ENGINEER.

Entry condition: `CLAUDE.md` → "Path selection", Light — **all** must hold. A **records-only change** (WORKPLAN, decisions,
logs, `.work`) is Light at any size: with the open PR, or its own PR merged on green CI. The per-Initiative SRS update is
its own **Standard** unit: CRITIC (sonnet) checks the delta against the as-built code and `srs-review-points.md`; no TEST
ENGINEER, no Preview.

If any condition fails mid-work, stop and re-enter the Standard path. Do not finish "since it's nearly done."

## Elevated path

Standard, plus: DATA ARCHITECT always · CRITIC on opus. The protection is the reviewers, CI and the hooks.
Who passes the gates, and what still needs Afik: `CLAUDE.md` → "Human gates" and "Decision authority".

Entry condition: any risk flag in `CLAUDE.md`.

**Path per part (Afik, 15.10.2026).** A split spec marks each part's risk flags; the part, not the feature, takes the path.
A part with no flag — a screen — runs Standard: CRITIC on sonnet, no DATA ARCHITECT, and still the full 🎨 depth
(screenshots, axe, keyboard, desktop and phone). **Reviews: one round per part** (Afik, 16.10.2026, audit decision 4).
**A part merges only after its review:** parts that share a review merge together.

## Bug-fix path

A defect in merged code: behaviour differs from what the SRS, or an approved `spec.md`, says.

| # | Actor | Action | Output |
|---|---|---|---|
| 1 | ORCHESTRATOR | write `bug.md` — expected behaviour with its SRS ID, actual behaviour, reproduction steps. classify by the risk flags. add the `escapes.md` entry, with the gate that should have caught it | `bug.md` |
| 2 | **TEST ENGINEER** | a regression test derived from `bug.md` only — never the code. it must fail on the current code; a test that passes does not reproduce the bug | failing test |
| 3 | **BUILDER** | the smallest change that fixes the root cause. no refactoring beyond it | diff + `notes.md` |
| 4 | **CI** | the new test passes and nothing else turned red, on GitHub Actions — see "No merge to `main` without green CI on GitHub" | green build |
| 5 | **CRITIC** | review the diff cold. skipped only when the fix meets every Light-path condition. any risk flag → Elevated: CRITIC on opus, and DATA ARCHITECT when the fix touches data | bug list |
| 6 | **E** | automated Preview E2E — only if the fix is user-visible | green run |
| 7 | ORCHESTRATOR | merge on the Standard path's pre-approved condition (step 13), `result.md`, step 14 if behaviour the SRS describes changed | `result.md` |

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

2. **TEST ENGINEER derives tests from `spec.md`** — or `bug.md` on the bug-fix path — never from the diff. It may read
   source files for what exists (roles, labels, routes, exports, seams), never for what to assert: a test whose expected
   value is copied from the code asserts that the code does what the code does — zero information — and CRITIC raises it
   as a finding against the test. A test derived from acceptance criteria asserts that the code does what was promised.

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

**A bug list, not a verdict** (Afik, 16.10.2026, audit decision 4). CRITIC returns the bugs it found — each with
severity, file, a concrete failure scenario and a fix — or "no bugs" explicitly. No `Validated with Concern`.

| Open bug | Consequence |
|---|---|
| critical · high · medium | blocks the merge: BUILDER fixes, CRITIC re-checks only these. ORCHESTRATOR may not reinterpret a severity |
| low | fixed in the same part or one `debt.md` line; never blocks, no re-check |

A review returned as prose without a bug list is rejected and re-run. ALGORITHM & DATA, when step 5b ran, returns its
own list on the same scale; a blocking bug from **either** reviewer blocks.

**Two strikes.** If the re-check still finds a blocking bug, ORCHESTRATOR does not send it back to BUILDER a third
time. It writes a short impact note and files a `BLOCKER` to Afik about the approach, and waits.

**Round limit (Afik, 2026-10-13, every task).** After a blocking bug: one fix round, one re-check, never a third. A
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

`result.md`, at most 10 lines, no narrative (Afik, 13.10.2026; 10 lines from 15.10.2026) — two independent axes:

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

Any agent may raise one — *"do not merge yet, I am still looking"* — stating what it checks; the agent that raised it releases it.

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
5. Afik's items (secrets, approvals, browser steps) are asked **once**, on the WORKPLAN list "ממתין לך", never one by one.

**Batched approvals (Afik, 16.10.2026, audit decision 2).** Before an Initiative opens, ORCHESTRATOR puts every decision
reserved for Afik in that Initiative into **one questionnaire** (AskUserQuestion, plus `.work/_initiatives/<I>-questions.md`),
then works without stopping. Production migrations are batched: merges apply to nestly-preview at once; ORCHESTRATOR
dispatches `migrate` from `main` **once a day or once per Initiative** (`gh workflow run migrate.yml --ref main`), and Afik
approves that one run on `db-production`. Merging never waits for it.

**Two sessions in parallel from I3 (Afik, 16.10.2026, audit decision 9)** — only once decisions 1 and 2 are working.
Pairs follow the dependency graph in `.work/_initiatives/roadmap.md` (Amendment 4): I3 ∥ I6 (F6.1–6.5), I4 ∥ I7,
I5 ∥ I8 ∥ I10 ∥ I14. Each session has its own branch; merges that carry a migration go one at a time, rebased on `main`
first, so the migration chain stays in timestamp order.

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
- **A test per criterion, nothing beyond** (Afik, 16.10.2026, audit decision 5) — every acceptance criterion gets its
  test; no hardening past the criteria, also not on a low review item. The test-to-product ratio is information
  (`result.md` may note it), not a target or a ceiling.
- **Tools and hooks** — no new tests unless a tool actually broke.

---

## Cost discipline

**Target: 5–7 features a day** (Afik, 16.10.2026, audit decision 12). Parts of one spec run in sequence without
stopping, except on a reserved item, a real `BLOCKER` or Two strikes.

- No agent reads the whole repository.
- Use SCOUT instead of reading files "to be safe." Every unnecessary file read burns context
  that the actual work needs.
- Pass pointers, not prose.
- **A new session per part; `/compact` at 200K of context** (Afik, 16.10.2026, audit decision 6). The handoff is the
  PR and `.work/<slug>/`. Long sessions ran at a median 320K and up to 964K.

---

## Changelog
- 1.1–1.15 (10.10–15.10.2026): each entry is in `git log -- .claude/workflow.md` and in `decisions/2026-10.md`.
- 1.16 — 2026-10-16 — audit decisions (Afik, `decisions.md` 2026-10-16 "Audit decisions" 1–6, 8, 9, 12): merge pre-approved on green CI + E with no blocking bug, also at night · questionnaire per Initiative, production migrate batched daily or per Initiative · DB tests local before push, budgets in pre-commit, broken old tests fixed in the part, full browser suite when a shared screen changes · one review round per part, re-check only on a real bug, a bug list instead of verdicts · a test per criterion, ratio is information · a new session per part, compact at 200K · two sessions in parallel from I3 · target 5–7 features a day.
