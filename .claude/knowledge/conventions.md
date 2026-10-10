# Conventions — as-built

**Proposed by:** BUILDER. **Validated by:** CRITIC or DATA ARCHITECT. A convention enters only after
a validator other than its proposer has confirmed it.
**Status:** empty. No code exists yet.

---

## Promotion rule

A convention enters this file when it has been **used and validated**, not when it has been proposed.

**Never promote:** hypotheses · rejected alternatives · unapproved recommendations · temporary
workarounds · unvalidated claims.

A convention here is binding on BUILDER. That is the point — and it is also why the bar for entry
is a second pair of eyes.

---

## Stack — fixed

| Layer | Choice | Status |
|---|---|---|
| Language | **JavaScript** | 🔒 **IRON RULE** — no TypeScript |
| UI | **React** | 🔒 IRON RULE |
| Styling | **Tailwind** | decided |
| Markup | JSX (React's form of HTML) | 🔒 IRON RULE |
| Database | **PostgreSQL**, single source of truth | decided |
| Platform | **Supabase** — Postgres, auth, storage, realtime | decided |
| Authorization | **RLS**, enforced in the database | decided |
| Server-side code | Supabase Edge Functions, JavaScript — only where a secret is required | decided |
| Tests | Vitest + React Testing Library (unit, integration) · Playwright on Chrome and Edge (E2E) · axe-core in Playwright (accessibility) · pgTAP (database and RLS) · npm audit (dependencies). Per SRS NFR-QA-001 / OP-018 | decided (D4) |
| Files | **in the repo.** Tests never ship, but they are always versioned | decided |
| Accessibility | WCAG 2.2 AA for the Web version (SRS NFR-A11Y-001) | decided (D6) |
| Phases | Web in React first. React Native only after the Web version is complete and approved | SRS §4, §11, OP-002 |

Reasoning for each: `decisions.md`.

---

## The consequence that shapes everything below

> **There is no compile-time typecheck.**

A misspelled field, a property that does not exist, a call to a function that was never written —
none of these are caught before the code runs. The defences that remain:

| Defence | Carries |
|---|---|
| the database schema | the only place the *system* says "this does not exist" |
| tests | behaviour, and the existence of what they exercise |
| CRITIC | must actively verify that referenced symbols, imports and fields exist |
| conventions below | consistency, so that a wrong name is visible as wrong |

**This is why naming conventions matter more here than in a typed project.** In a typed codebase a
wrong name is a compiler error. Here it is a runtime crash, possibly on a rare path, possibly in
front of a user. A convention that makes names predictable is a real safety mechanism, not tidiness.

---

## Binding constraints from the SRS

These are approved requirements, not conventions waiting to be validated. They bind BUILDER from the
first line of code, and CRITIC checks them in every review. When the SRS changes, this section follows.

### Component architecture — SRS §4.1, §4.2
- A UI element that repeats, or is reasonably expected to repeat, becomes an independent reusable component.
- A component owns display and basic behaviour only. Business actions come in from outside as props and
  events: a Button does not know whether it saves, navigates or opens a form.
- No two components with the same structure just because they trigger different actions — one component,
  different parameters.
- Flow, state and business logic live in the Feature/Container. The Page composes Features and Components
  and owns navigation for its screen.
- API calls, auth, payments and data access live in a Service/Repository layer, never inside a UI component.
- Shared state lives in the common parent, Feature or service layer, and is never duplicated across components.
- No over-decomposition: a simple, one-off piece can stay inside its Page or Feature.

### Web now, React Native later — SRS §4, §11, OP-002, NFR-USAB-002
- Business logic, validation and data access stay out of web-specific UI, so that they carry over to
  React Native unchanged. The UI layer is what gets re-implemented in the app phase.
- Web and Native are never developed in parallel. The React Native version is chosen and locked at the
  start of the app phase.

### Accessibility — SRS NFR-A11Y-001 (WCAG 2.2 AA)
- Build accessibility into the shared UI components once — labels, keyboard operation, visible focus,
  contrast, target size of at least 24×24 CSS px — so every screen that composes them inherits it.
- axe-core runs inside the Playwright E2E tests. It does not catch everything: keyboard flow, focus order
  and meaningful labels still need a manual check in review.

---

## Conventions

*none yet*

Each entry:

```
### <area>
rule:     what to do
why:      the reason — without this, the rule gets cargo-culted or discarded
example:  path/to/file.ts:NN
added:    YYYY-MM-DD, validated by <agent>
```

Areas expected to accumulate entries: file and directory layout · naming · error handling and error
shape · validation at trust boundaries · data access patterns · component structure · loading and
empty states · test layout and naming · logging.

---

## Retired

A convention that stopped being true moves here with the date and the reason, rather than being
deleted. A convention that silently disappears leaves code that nobody can explain.
