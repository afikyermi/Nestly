# notes — register-account-create, part a (database)

**Approach**  Migration `20261014200000_registration_account.sql` as schema.md wrote it (three tables, partial unique index, RLS+FORCE, eight new policies, grants, comments). Level-2 down script. F1.1 down script got the guard. Drizzle `schema.ts` has the three tables, `accepted_at` omitted. `catalog-columns.sql` needed no change (it reads every table generically).

**Decisions**  Drizzle `date` columns use `mode: 'string'` (no JS Date, avoids timezone shifts on a calendar date). `legalConsents` has no `acceptedAt` column at all (schema.md). The down script lifts FORCE on the three tables before counting, like F1.1's.

**Deviations**  None in the migration. The pgTAP/fixture part is NOT done, see Uncertain.

**Deliberately not done**  Behavioural pgTAP (files 21-23), shared Zod, route, UI.

**Uncertain**
- BLOCKED by the guard: `.claude/hooks/guard.js` refuses BUILDER writing anything under `supabase/tests/**` ("BUILDER does not write tests"). So these blast-radius items are NOT done and need TEST ENGINEER (or a guard exception from ORCHESTRATOR):
  1. New `supabase/tests/setup/20_registration_fixtures.sql` - complete draft at `.work/register-account-create/20_registration_fixtures.sql.draft`, move unchanged.
  2. `supabase/tests/10_identity_structure.sql` lines 263-269: assertion "no INSERT, UPDATE, DELETE or ALL policy exists in nestly" now fails (five INSERT policies exist). Must become the exact policy list.
  3. `supabase/tests/12_identity_writes_refused.sql`: line 29-36 catalog assertion (has no INSERT) now fails; attempts that are no longer 42501: `c` insert into users (allowed, c is a free Auth user), `a` insert into users (now 23505), `a` second profile insert (now 23505).
  4. NOT in schema.md's blast radius: `apps/server/tests/drift.test.ts` fails ("exits 0 when the database has exactly the columns of schema.md"): its `APPROVED` catalog lists only users and regular_profiles, and the real Drizzle schema now names three more tables. Add the new tables' columns to `APPROVED` (types in interface.md).
- No local DB or Docker here: the migration, down script and fixtures have never run. CI `db` job is the first run. Not verified locally: up->down->up fingerprint, that the F1.1 down guard parses.
- Unit tests: 164 of 165 pass; the one failure is item 4.

**Preview path**  None (database only). Part b must not deploy to an environment before this migration is applied there.

**Neighbouring**  none

---

## Part b, first slice (shared schemas, repository, service) — BUILDER 14.10.2026

**Approach**  Q6 check first: hosted Auth forwards the end-user IP only with a secret key plus `Sb-Forwarded-For`; publishable keys are refused (impact-1.md). Route, Auth client and web wait for Afik. Built what does not depend on it: strict step-1 schema with raw bounds, credentials schema, consent constants, and the repository and service for the account rows.
**Decisions**  Bound failures carry the code of the rule they stand for (so the web maps them as before). Email: besides the spec's rules, I require a non-empty local part and a domain whose dot is neither first nor last. Consent body and credentials are separate schemas; composing the body waits on the Auth decision. The repository takes the consent versions as parameters (the service passes the shared constants) so the atomicity test can force the last insert to fail. `children_too_many` is now produced by the raw `.max(10)`; the dead transform check is removed.
**Deviations**  None from spec/schema.
**Deliberately not done**  Route, Auth client, config reading of SUPABASE_URL/PUBLISHABLE_KEY, 405/413 handling, web, Drizzle drift edits (none needed).
**Uncertain**  Whether `RAW_TOKEN_MAX_UNITS` 32 is too tight for a legit value: the longest legit token is `prefer_not_to_say` (17).
**FINDING for TEST ENGINEER**  `packages/shared/tests/registration-step1.test.ts` line 186-190 ("without has_child the output has no children, even with invalid ones in the input") sends 13 children with `planning`; spec criterion 2 now rejects `children` over 10 on the raw body at any stage. That one test is red by design; it should use <= 10 invalid children. I did not touch it.
**Preview path**  Not user-visible yet.
**Neighbouring**  none.

## Part b, route (Revision 2) — BUILDER 14.10.2026
**Approach**  `POST /api/register` in `apps/server/src/routes/register.ts`; composed strict body schema in `packages/shared/src/validation/registration-request.ts` (step 1 + consent, piped into F1.3's schema with `today` = server UTC date + 1 day). 401 comes from the existing onRequest hook.
**Decisions**  (1) Criteria 10 and 11 read together: a deterministic database refusal (SQLSTATE class 23, 42501) on a validated body -> 500 `internal` (retry cannot help); any other write failure -> 503 `profile_write_failed`. (2) The route has its own error handler and logs SQLSTATE/constraint only, because Drizzle and parser error messages can quote the SQL parameters or the body (criterion 13). The app-wide handler still logs `err` for other routes (unchanged). (3) 405 routes are protected like the rest: an unauthenticated GET gets 401, not 405. (4) 201 body is `{status:'created'}`; the spec's "with the account" has no field to return.
**Deviations**  none. **Not done**  web, Auth client, config for Supabase keys (the server reads none).
**Uncertain**  not run against a database or a real request here (no test files for me; CI db job/TEST ENGINEER). The `.pipe` composition and Fastify's route-level `bodyLimit` 413 are verified by types only.
**Neighbouring**  the app-wide error handler (`app.ts`) logs the whole error object, which for a body parse error can quote part of the body; harmless on current routes, a leak risk for any route with personal data.

## Fix: FUNCTION_INVOCATION_FAILED on the Preview (shared loaded as .ts) — BUILDER 14.10.2026
**Cause confirmed**  `@nestly/shared` exported `./src/index.ts`; part b's route and service import it at runtime, so Node in the Vercel Function loaded a TypeScript file from a workspace package (not compiled by the function's builder, and its `.js` specifiers point at `.ts` files). Before part b nothing on the function's path imported it.
**Choice: build shared to JS, not bundle**  Bundling needs esbuild as a direct dependency (a new dependency: a MATERIAL CHANGE) and a second build artefact for the function. Building needs only `tsc`, already in use.
**What changed**  `packages/shared/package.json` exports map `types` -> src, `source` -> src, `node` -> `./dist/index.js`, `default` -> src, plus `build` (`tsconfig.build.json`, ESM to `dist/`, gitignored). Root `postinstall` builds shared, so `npm install`/`npm ci` (Vercel, CI) always produces `dist/`. The web (browser condition) and tsc keep resolving source; Vite config of the web, the server's new `vitest.config.ts` and the root vitest `server` project add the `source` condition so tests and Storybook read shared source with no build step; `tsx` dev and `db:drift` scripts pass `--conditions=source`.
**Proof**  With `dist/index.js` sabotaged to throw, server and web tests still pass (they read source; only the drift test, which spawns plain `node --import tsx`, uses dist, as the function does). With dist built, `node` (no tsx) from a temp directory imported `apps/server/dist/app.js`; `GET /api/health` -> 200, `POST /api/register` without config -> 503 (routes and shared loaded). Typecheck, lint, check:budgets, server (245), web (488), shared (199) pass.
**Uncertain**  Not proven on Vercel itself: that the function's file trace includes `packages/shared/dist` via the `node_modules/@nestly/shared` symlink (vercel.json `includeFiles` lists only `apps/server/src/**`; I did not add `packages/shared/dist/**`). If the Preview still fails, add `packages/shared/dist/**` to `includeFiles`. A plain `node` run of shared uses `dist/` as of the last install: after editing shared, rebuild (`npm run build -w @nestly/shared`) before running node by hand; the drift test is the one test that does.

## CRITIC part b findings 1-2 — BUILDER
**1** Conditions now extend Vite's defaults (`['source', ...defaultClientConditions]`, `['source', ...defaultServerConditions]`) in web vite config, server vitest config and the root vitest server project. Checked with Vite's resolver, prebundling off: before, `react-router` resolved to `dist/production`; now `dist/development`.
**2** `routes/register.ts` classifies with `isTransient`: database fault outside class 23/42501, or a connection error (`isConnectionFailure` in `lib/pg-error.ts`) -> 503; everything else -> 500. `hasAccount` is inside the same try. The connection-code list is my reading of postgres-js/Node codes; TEST ENGINEER's hasAccount-transient test should exercise it.
