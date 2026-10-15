# Knowledge proposal — F1.5 part a (proposer: DATA ARCHITECT via schema.md, drafted by ORCHESTRATOR; validator: CRITIC)

## 1. `.claude/knowledge/data-model-tables.md`, `users` column of the "Authorization" row — replace the first sentence
Before: `users_select_own` — authenticated reads its own row, only while status = 'active' (checked inline; never through a function that reads users).
After:  `users_select_own` — authenticated reads its own row (`id = auth.uid()`) **in every status** (F1.5 DR-1 A, migration 20261015100000). Seeing the own row does **not** mean the account is active: code or a policy that needs "is the caller active" uses `(select nestly.is_active_account())`, never `exists (select 1 from nestly.users …)`. A suspended or banned account still reads zero rows of every other table (rule 15).
(The rest of the cell — `users_insert_own`, grants, no UPDATE/DELETE — unchanged.)

## 2. `.claude/knowledge/data-model.md:143`, "Status gate placement" — replace the cell
Before: on `users` the active check is an inline column predicate; on every other table it is `(select nestly.is_active_account())`. A table's policy never calls a function that reads the same table (no recursion)
After:  on `users` there is **no** status gate on SELECT — an account reads its own row in every status (F1.5 DR-1 A); on every other table the gate is `(select nestly.is_active_account())`. Seeing the own `users` row never means "active". A table's policy never calls a function that reads the same table (no recursion)

## 3. `.claude/knowledge/conventions.md`, Conventions — new entry (proposer: BUILDER, F1.5 part b; validator: CRITIC)
### Browser adapters (web)
rule:     the web's only contact with `window`, `document` and web storage is `apps/web/src/platform/`: small adapters (each file at most 60 code lines) that declare their own types and import nothing from services, features, hooks, app, pages or components. Hooks, services and lib may import from `platform/` only types (`import type`); a concrete adapter is created in `app/App.tsx` or `main.tsx` and passed in (an injected `BrowserEvents`, a `keyValueStorage`). Enforced by lint (`eslint.config.mjs`, platform blocks).
why:      the lint ban on window/document/localStorage keeps hooks, services and lib portable to React Native (SRS §4.1), but the Auth session (F1.5) needs storage and tab-visibility events. A named, fenced place for the unavoidable browser access stops it from spreading, and injecting the adapters is what lets a test fire a visibility or storage event by hand.
example:  apps/web/src/platform/browser-events.ts · apps/web/src/app/App.tsx (wiring) · apps/web/src/services/session/auth-session-source.ts (`import type { BrowserEvents }`)
added:    2026-10-15, proposed by BUILDER (F1.5 part b), to be validated by CRITIC
