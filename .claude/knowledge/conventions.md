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
| Languages | **TypeScript** everywhere in product code — web, server, shared. React · TypeScript · CSS · HTML on the web; Node.js + TypeScript on the server | 🔒 rule 0 · decided 2026-10-11 (replaces JavaScript-only, 12.9) |
| TypeScript settings | `strict: true` · no `any` · no `@ts-ignore`, `@ts-nocheck` or `@ts-expect-error` · `as` restricted. Enforced by typecheck and typescript-eslint in CI, and by CRITIC | decided 2026-10-11 |
| Repository | **Monorepo, npm workspaces:** `apps/web` · `apps/server` · `packages/shared` · `apps/mobile` later only | decided 2026-10-11 |
| UI | **React**, with **Tailwind** for styling | decided |
| Web build | **Vite**, single-page app | decided 2026-10-10 · SRS §11 |
| Server | **Node.js + TypeScript on Fastify.** Layers: route ≤200 lines → service ≤400 → repository ≤400 | decided 2026-10-11 |
| Shared | `packages/shared`: **Zod** validations (VAL-xxx), types, constants. No DOM, no Node APIs — it must run on web, server and mobile | decided 2026-10-11 |
| Database | **PostgreSQL via Supabase**, the only database, accessed with **Drizzle** through the server | decided |
| Authorization | **RLS**, enforced in the database. The server never filters rows for permission | decided |
| Auth | **Supabase Auth.** The web app signs in with supabase-js; the server verifies the JWT through JWKS (asymmetric keys), ignores the token's role and forces `authenticated` | decided 2026-10-11 |
| Storage · Realtime | **TBD** — SRS §12, NFR-MEDIA-001 | open |
| Tests | Vitest + React Testing Library (unit, integration) · Playwright on Chrome and Edge (E2E) · axe-core in Playwright (accessibility) · pgTAP (database and RLS) · npm audit (dependencies). Per SRS NFR-QA-001 / OP-018 | decided (D4) |
| Files | **in the repo.** Tests never ship, but they are always versioned | decided |
| Accessibility | WCAG 2.2 AA for the Web version (SRS NFR-A11Y-001) | decided (D6) |
| Phases | Web in React first. React Native only after the Web version is complete and approved | SRS §4, §11, OP-002 |

Reasoning for each: `decisions.md`.

---

## The consequence that shapes everything below

> **The typecheck is a gate, and it can be defeated.**

Strict TypeScript catches a misspelled field, a property that does not exist or a call to a function that
was never written — before the code runs. It is only as honest as the types:

| What defeats it | Defence |
|---|---|
| a cast — `as`, `any`, a ts-comment — that tells the compiler something untrue | banned or restricted in CI; CRITIC checks every one that remains |
| input from outside — a request, the database, a third party — that does not match its type | **Zod at every boundary**: request bodies, params and query strings on the server; forms on the web |
| raw SQL, or a query the typed schema does not describe | Drizzle's typed schema; raw SQL only where Drizzle cannot express it, reviewed |
| behaviour — the right type, the wrong result | tests |

Naming conventions still matter: predictable names make a wrong one visible in review.

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
- A Feature never imports another Feature. What two Features both need moves to a Shared/Domain component
  or a shared service.
- These rules are enforced by lint in CI, including a size cap per file (WORKPLAN part 7; the caps are in
  `decisions.md`). Until CI exists, CRITIC checks them.

### Monorepo boundaries — decided 2026-10-11
- `packages/shared` imports nothing from `apps/*`. It uses no DOM and no Node APIs.
- `apps/web` never imports from `apps/server`, and the server never imports from the web app. They meet only
  through `packages/shared` and the HTTP API.
- Enforced by lint in CI (WORKPLAN 7.1).

### Web now, React Native later — SRS §4, §11, OP-002, NFR-USAB-002
- Business rules, validation and data access live in `packages/shared` and on the server, so they carry
  over to React Native unchanged. The web UI is what gets re-implemented in the app phase.
- Logic inside `apps/web` — hooks, services, state — never touches the DOM, `window` or `react-dom` (SRS
  §4.1), so the same rule holds for whatever the app phase reuses.
- Web and Native are never developed in parallel. The React Native version is chosen and locked at the
  start of the app phase, and the app talks to the same server.

### Server — decided 2026-10-11
- Layers: route → service → repository. A route parses and validates (Zod schema from `packages/shared`),
  calls a service, and shapes the response. A service holds the business logic. A repository holds the
  Drizzle queries. Caps: route 200 lines, service 400, repository 400.
- Every database call runs inside the identity transaction described in `data-model.md`. No query runs
  outside one.
- Rate limits (NFR-SEC-006) are enforced on the server. Their thresholds are configuration, not constants.
- Background jobs run as a separate process with their own database credentials (`app_jobs`). The request
  server never holds those credentials.

### Accessibility — SRS NFR-A11Y-001 (WCAG 2.2 AA)
- Build accessibility into the shared UI components once — labels, keyboard operation, visible focus,
  contrast, target size of at least 24×24 CSS px — so every screen that composes them inherits it.
- axe-core runs inside the Playwright E2E tests. It does not catch everything: keyboard flow, focus order
  and meaningful labels still need a manual check in review.

### User-facing errors — SRS §10 (ERR-xxx), decided 2026-10-10
- A raw error — from the database, the network or a library — is never shown to a user. What the user sees
  comes from the SRS error catalog (§10), or a generic message where no ERR entry applies. The technical
  detail goes to the log.
- The server never returns a raw error message in a response. It returns a status and an error code the web
  app maps to its ERR text.
- Why: a raw database message names tables, constraints and policies. With authorization in RLS, that is a
  map of the authorization model handed to whoever triggers the error. ERR-001 already requires messages
  that expose nothing sensitive.

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
