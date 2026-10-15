# Conventions — as-built

**Proposed by:** BUILDER. **Validated by:** CRITIC or DATA ARCHITECT. A convention enters only after
a validator other than its proposer has confirmed it.
**Status:** three conventions (13.10.2026): two from UI wave 1, one from the agent-slim log review.

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
| Layout and naming | Folders per the §4.2 layers; tests outside `src` (`apps/*/tests`, `packages/shared/tests`, `e2e/`, `supabase/tests`); English names from the SRS logical names; no SRS IDs in file names. The full rule: `decisions.md` → "Repository layout and naming" | decided 2026-10-11 |
| Hosting | **Vercel:** the web app and the server (as Vercel Functions, region fra1), one project, one preview per branch · **Supabase**, Central EU Frankfurt. `decisions.md` → "Hosting" | decided 2026-10-11 |
| UI | **React**, with **Tailwind** for styling | decided |
| Web build | **Vite**, single-page app | decided 2026-10-10 · SRS §11 |
| Server | **Node.js + TypeScript on Fastify,** deployed as Vercel Functions through a thin adapter. Layers: route ≤200 lines → service ≤400 → repository ≤400 | decided 2026-10-11 |
| Shared | `packages/shared`: **Zod** validations (VAL-xxx), types, constants. No DOM, no Node APIs — it must run on web, server and mobile | decided 2026-10-11 |
| Database | **PostgreSQL via Supabase**, the only database, accessed with **Drizzle** through the server | decided |
| Authorization | **RLS**, enforced in the database. The server never filters rows for permission | decided |
| Auth | **Supabase Auth.** The web app signs in with supabase-js; the server verifies the JWT with **`jose`** (`createRemoteJWKSet` against Supabase's JWKS, asymmetric keys; not `@fastify/jwt`), ignores the token's role and forces `authenticated` | decided 2026-10-11 |
| Storage | **TBD** — SRS §12, NFR-MEDIA-001; media decision M1 before I5 | open |
| Realtime | Polling in the MVP. Later, **Supabase Realtime** private channels carry signals only, never content; the client fetches the content through the server | decided 2026-10-11 |
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
- These rules are enforced by lint in CI, including a size cap per file (WORKPLAN part 7, in `archive/WORKPLAN-2026-10.md`; the caps are in
  `decisions.md`). Until CI exists, CRITIC checks them.

### Monorepo boundaries — decided 2026-10-11
- `packages/shared` imports nothing from `apps/*`. It uses no DOM and no Node APIs.
- `apps/web` never imports from `apps/server`, and the server never imports from the web app. They meet only
  through `packages/shared` and the HTTP API.
- Enforced by lint in CI (WORKPLAN 7.1, in `archive/WORKPLAN-2026-10.md`).

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
  Their counters live in Postgres: function instances share no memory.
- The server runs as Vercel Functions: no state is kept in memory between requests beyond caches that may be
  lost (the JWKS keys, for example). Routes, services and repositories hold no Vercel-specific code; only the
  adapter does.
- Background jobs run as `app_jobs`, deployed apart from the request functions: SQL jobs in pg_cron, code jobs
  in a separate Vercel project that alone holds the `app_jobs` credentials. The request functions never hold
  them. A job is cut to fit the function time limit.

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

### Component props (web)
rule:     form controls (TextInput, PasswordInput, SelectInput, Checkbox) accept exactly the props their spec names — no
          `className`, no native-attribute passthrough. Display and layout components accept `className` for
          placement only (margin, alignment, flex/grid item behaviour, max width); any variation (size, tone) is a
          prop.
why:      passthrough made `placeholder`-as-label type-legal and let sizes drift through ad-hoc classes (UI wave 1
          parts c and e). The type system enforces the first half; review enforces "placement only".
example:  apps/web/src/components/ui/text-input.tsx · apps/web/src/components/ui/avatar.tsx (`size`)
added:    2026-10-12, proposed by CRITIC (part e), applied in parts c–e, validated by CRITIC

### Errors are announced
rule:     an error state is never colour alone: the control or its group carries `aria-invalid`, and the message is
          linked with `aria-describedby` (a group: `role="radiogroup"` on the fieldset). `error` and `aria-invalid`
          combine — neither overrides the other.
why:      a destructive border alone told a screen-reader user nothing (part d, WCAG 1.4.1 / 3.3.1).
example:  apps/web/src/components/shared/choice-card-group.tsx · apps/web/src/components/ui/checkbox.tsx
added:    2026-10-12, proposed by CRITIC (part d), validated by CRITIC

### Git and shell (every agent that commits or runs shell)
rule:     stage files by name, then commit in a **separate** command (`git add a b`, then `git commit …`) — never
          `git add -A` / `.` and never add and commit in one command. Text that names an env file (a log line, a
          search pattern, a `-m` commit message) is written with the Write/Edit tools or a quoted heredoc
          (`git commit -F - <<'EOF'`), not as a shell argument. `gh` output is shaped with `--template`, never
          `--jq`/`-q` (a jq filter such as `.[]` reads as an env-file glob and pages incidents.md — 7 false blocks).
why:      the guard scans the staged diff for secrets before each commit, so it refuses add+commit in one call, and
          its env-file rule reads command text, not targets. 16 add+commit blocks and 3 env-text false blocks in
          three days (`.work/agent-slim/stage2-insights.md`).
example:  .claude/hooks/guard.js (checkAll) · decisions.md 2026-10-11 "hooks (7.2)"
added:    2026-10-13, proposed by ORCHESTRATOR (agent-slim stage 2), validated by CRITIC; the `gh --template` clause
          2026-10-15 (dev-speed), validated by CRITIC in that PR's review

### Browser adapters (web)
rule:     Web logic (hooks, services, lib, `app/*.ts`) never touches `window`, `document` or web storage; its only route
          to them is `apps/web/src/platform/`: thin adapters behind an interface, holding no business rule or state,
          each file at most 60 code lines, declaring their own types and importing nothing from services, features,
          hooks, app, pages or components. Hooks, services and lib may import from `platform/` only types
          (`import type`); a concrete adapter is created in `app/App.tsx` or `main.tsx` and passed in (an injected
          `BrowserEvents`, a `keyValueStorage`). Enforced by lint (`eslint.config.mjs`, platform blocks).
why:      the lint ban on window/document/localStorage keeps hooks, services and lib portable to React Native (SRS
          §4.1), but the Auth session (F1.5) needs storage and tab-visibility events. A named, fenced place for the
          unavoidable browser access stops it from spreading, and injecting the adapters is what lets a test fire a
          visibility or storage event by hand.
example:  apps/web/src/platform/browser-events.ts · apps/web/src/app/App.tsx (wiring) ·
          apps/web/src/services/session/auth-session-source.ts (`import type { BrowserEvents }`)
added:    2026-10-15, proposed by BUILDER (F1.5 part b), validated by CRITIC with its wording change

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
