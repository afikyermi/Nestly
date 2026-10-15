# notes — F1.6 password-recovery, part a

**Approach**
Built the whole server side in one unit (database, store, change, redeem, `/api/me` field, admin module, pepper module). The prompt listed redeem, admin module and CI check as part a, and schema.md puts the migration, store and change in part a too, so nothing server-side is left for later; only the web (part c) and the CI-check test file remain. Branch: `feat/f1-6-password-recovery`; nothing committed or pushed.

- Bootstrap step 1: `app_recovery` created, granted to `app_server` WITH INHERIT FALSE, SET TRUE; drift guards and `01-roles-check.sql` expected rows updated (4 rows).
- Migration `supabase/migrations/20261015200000_recovery_questions.sql` and down script, as schema.md. No SECURITY DEFINER.
- `packages/shared`: `constants/recovery.ts` (ids, bounds, scrypt params, limits, event kinds), `validation/recovery.ts` (normaliser, email normaliser, three Zod bodies; the email and password rules are reused from the registration schema).
- Server: route (`recovery-questions.ts`, `recovery-reset.ts`, shared `recovery-common.ts`) -> service (`recovery-attempt.ts` the shared guarded attempt, `recovery-reset-service.ts`, `recovery-questions-service.ts`) -> repository (`recovery-repository.ts`). `recovery/pepper.ts`, `recovery/auth-admin.ts`, `recovery/hashing.ts`, `recovery/client-ip.ts`, `recovery/dependencies.ts`; `db/recovery-transaction.ts`.
- Redeem: transaction 1 under `app_recovery` (locks handle row then IP row, reads the declared answers row, two scrypts, counters, audit) commits before Auth; the three Auth calls run outside any transaction; transaction 2 writes the outcome row.
- `GET /api/me`: `recoveryQuestions` in the same identity transaction, active only.
- Typecheck (server, shared, web), lint (server, shared), `check:budgets`, shared tests pass. Server unit tests: 287 pass, 2 fail by design (below).

**Decisions**
- Event `user_id` comes from the answers row read in the same transaction (needed even for `reset_limited`/`reset_failed` on a known handle, because the insert policy forces `user_id` to the handle's account; NULL only when the handle has none). So the answers row is read before the lock decision, for every attempt, known or not.
- Lookups of the answers row and the throttle rows carry no `where` on the handle/IP hash; RLS returns the declared one. Inserts name the hashes (the policy checks them). A second row would throw.
- Request shapes (the spec fixes none): `{answers:[{question,answer}x2]}` for POST; `{current:[...], answers:[...]}` for PUT; `{email, answers:[...], password}` for reset. Strict objects.
- Error codes the spec leaves open: reset 400 -> `invalid_request` (as register); questions 400 -> `invalid_questions` (spec); 409 on POST -> `already_set`; PUT with no saved answers -> 409 `not_set`; a database policy refusal on POST/PUT (account not active) -> 403 `forbidden`; token without an `email` claim on POST -> 500. Say if any should change.
- Body limit 16 KiB on the three routes, a technical bound for NFR-SEC-001 (the registration route has 100 KiB).
- `request.ip` comes from Fastify `trustProxy` as a function `(address, hop) => hop < 1`: trust the socket hop only, so `request.ip` is the LAST X-Forwarded-For entry (the one Vercel's edge sets), never the leftmost. I did not use a numeric `trustProxy` (Fastify's type rejects it). The same setting changes `request.ip` for all routes; nothing else reads it.
- The logger's `req` serializer now writes `{method, url}` where `url` is the route pattern. Fastify's default writes the client address (`remoteAddress`), which would put the IP in every log line.
- A request IP that is not an address counts under one shared key `unknown` (fail closed, not skipped); Auth then gets no forwarded header.
- Auth: the address sent to Auth is the full `request.ip`, not the /64 prefix (Auth counts real addresses); only the hash uses the /64.
- `TokenVerifier` returns `{identity, email}`; `Identity` is unchanged. `request.verifiedEmail` is the new decorator, read by the store route only.
- scrypt `maxmem` = `256 * N * r` (twice the memory the algorithm needs), so Node's 32 MiB default never blocks N=2^15, r=8 or the database's upper bounds.
- The throttle failure counter is one SQL statement per subject (DB clock, limits as parameters), written as raw SQL with typed casts and parsed rows (Drizzle cannot express it readably). Everything else is Drizzle.
- `isAdminConfigured` also requires `SUPABASE_JWT_ISSUER` to be https (or http on a loopback host, for an Auth stub), since the issuer is the base URL.

**Deviations**
- `supabase/rollback/20261014100000_identity_schema.down.sql` (F1.1): schema.md says it "will also fail" while the recovery tables exist. It does not: it ends with `drop schema nestly cascade`, which would drop them with no row check. I added a refusal like the existing one for `legal_consents` (`to_regclass('nestly.recovery_answers') is not null` -> raise) and the order line in the header. Nothing else in that file changed. DATA ARCHITECT should confirm.
- Added `RAW_ANSWER_MAX_UNITS = 600` (a raw bound, like the name bounds) and `RECOVERY_ANSWER_COUNT`. Neither is in the spec as a number; both only bound work.

**Deliberately not done**
- No web (part c), no SRS edit, no `.claude/knowledge/` edit (the knowledge proposal stays exactly as in schema.md, for CRITIC to validate; `tests.approved_security_definer()` untouched and still empty).
- No existing test edited, no new test written.
- No purge job for throttle rows and no audit retention (debt, per schema.md).
- No change to `supabase/bootstrap/README.md`.
- No Vercel/GitHub setting; Afik enters `SUPABASE_SECRET_KEY` and `RECOVERY_PEPPER`.

**Existing tests that need changing (TEST ENGINEER)**
Failing now in `npm test -w @nestly/server`:
1. `apps/server/tests/credentials.static.test.ts`: `SUPABASE_SECRET` is flagged in `apps/server/src/recovery/auth-admin.ts`. Becomes: exactly that one file may name it and the file must name it; `RECOVERY_PEPPER` in `pepper.ts` only, asserted present; `sb_secret_` still forbidden everywhere; under `apps/server/src` the literals `/admin/`, `grant_type=password`, `/logout`, `Sb-Forwarded-For` only in `auth-admin.ts`; neither secret name under `.github/`.
2. `apps/server/tests/drift.test.ts`: the hard-coded `APPROVED_ALL` catalog lacks the three new tables and the five write models, so `db:drift` exits 1 ("exits 0 when the database has exactly the columns..."). schema.md says the drift test "picks up schema.ts automatically"; it does not, because the expected list is written out in the test.

Will fail or be wrong in the CI `db` job (cannot run here, no Postgres):
3. `supabase/tests/10_identity_structure.sql`: the four global assertions named in schema.md (INSERT policies exactly five; no UPDATE/DELETE/ALL policy; every policy TO authenticated only; authenticated holds no UPDATE on any table in nestly).
4. `supabase/tests/20_registration_structure.sql`: "policies are exactly ten" and "every policy TO authenticated only".
5. `apps/server/tests/db/me.db.test.ts`: the `ACTIVE` constant (`{"state":"active"}`, used at lines 80, 134, 178, 191, 201-208, 221) and "every body is exactly {state}": the active body is now `{"state":"active","recoveryQuestions":"missing"}` for the fixtures (none has answers); the other two states are unchanged.
6. `supabase/bootstrap/01-roles-check.sql` is already updated by me (it is a script, not a test); `supabase/tests/00_session_is_app_server.sql` loses nothing.
Wording only, still green: `apps/server/tests/identity.test.ts` titles "the public list holds only GET /api/health" and "[Q-d] only GET /api/health is public": `POST /api/recovery/reset` is now public too.

**Uncertain**
- All SQL is unrun (no Postgres/docker here). Highest risk, in order: (a) the `recordFailure` statement (CTE + `UPDATE ... FROM`, parameter casts); (b) `select ... for update` and `insert ... on conflict do nothing` under column-level grants and the three policies as `app_recovery`; (c) `SET LOCAL ROLE authenticated` after `app_recovery` inside one transaction (should work: `SET ROLE` checks the session user, `app_server`); (d) the events insert policy's subquery on `recovery_answers`; (e) pgTAP/fingerprint round trip of the down script. CI's `db` job is the first real run.
- Auth: whether hosted Auth honours `apikey` = secret key alone for `PUT /admin/users/{id}` and for `/logout` with a user Bearer, and the 72-byte password question (Q-G1), are preview checks, not unit-testable.
- `request.ip` on Vercel: assumes the platform sets `X-Forwarded-For` as schema.md says. Verify on the preview that the audit's `ip_hash` differs between two real clients and that Auth's log shows the client address.
- Transaction 1 holds row locks during two scrypts (~0.1 s locally; 54 ms for one measured here). Accepted by schema.md.
- If `app_recovery` was not re-run on nestly-preview before the migration, the migration stops with the precondition message.

**Preview path**
Not runnable yet: no web screen, and Afik has not entered `SUPABASE_SECRET_KEY` and `RECOVERY_PEPPER`; bootstrap step 1 must be re-run on nestly-preview before the migration.
Once those are in: with a signed-in token, `POST /api/recovery-questions` with two answers -> 201; again -> 409; `GET /api/me` -> `recoveryQuestions: "set"`; `POST /api/recovery/reset` with email, the two answers and a new password -> 200, then sign in with the new password through F1.5, and the old refresh token is refused. Wrong answers six times from one address -> 429 with `retry-after`. Also check on preview: a 73-byte password (Q-G1), Auth's log shows the client address, CAPTCHA off.

**Neighbouring**
- `tests/drift.test.ts` hard-codes the approved column list (see item 2): every future table needs a manual edit there, contrary to the "picks up automatically" assumption.
- F1.1's down script had no guard for later tables created in `nestly` (fixed for recovery only; a generic guard would be better).
- `api/index.ts` builds the app with no logger (`buildApp()`), so no request or error line is ever written in production; the fixed log lines in this feature are visible in tests only until production logging is decided.
