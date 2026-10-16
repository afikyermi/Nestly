# notes — F2.0 account-takeover-close, part (a)

**Approach**  Migration `20261016100000_identity_link_checks.sql` as schema.md (table, 5 helpers, trigger, guard inside
`is_active_account()`, D1 delete policy, 7 kinds, subject policy, partial unique index) + down script. Server: the token's
`session_id`/`iat`/`amr` go into the claims (DR-S1); `inIdentityTransaction` reads `session_guard()` in the claims statement
and throws `SessionRefused` (stale → 401, pending/unchecked → 503, mapped in every protected route and the global handler).
Oauth tokens pass a gate in the auth hook first (`services/identity-link-service.ts`): detection with the caller's token, then
the clear (tx 1 verdict + answers delete; tx 2 NOWAIT lock, cancel, sign-out others, mark cleared, audit). Routes
`POST /api/password/{forced,change,first}` (c7, c10, c11). `/api/me` gains `mustSetPassword`. Web: client password set removed
(c13), PG-005 Google completion calls `/api/password/first` (c16, moved into this part at Gate 2).

**Decisions**
- Gate only for oauth tokens; password sessions meet the guard lazily inside their first transaction. Keeps the F1.x contract
  "a bad body opens no transaction" and costs no extra round trip for them. Oauth requests pay one guard transaction.
- `AuthAccountPort` is a new port beside `authAdmin` (F1.6 fakes stay valid). Auth calls live in auth-admin.ts only (fence).
- `GET /user` and `logout?scope=others` send the secret key as the gateway `apikey` (as F1.6's token/logout calls do); they are
  authorised by the caller's bearer token, not admin operations. The server holds no publishable key.
- c10 follows the reset: the attempt commits before Auth; outcome row in a second tx; its failure is one log line.
- c11 also marks a cleared unregistered user's row done (c9); a failure after the Auth set is 503 (retry: same_password = set).
- c7 refuses an account that is not active (409) and an unregistered user (they use c11).
- Extracted `ownHandleFor` from the question change so c10 counts the same subject; no behaviour change there.

**Deviations**
- `recovery_events_insert_recovery` is tightened (`kind not in` the three subject kinds): otherwise a declared handle could
  attribute a `takeover_cleared` to the handle's account under another subject (`41_link_policies.sql:402` expects 42501). DA/CRITIC to validate.

**Deliberately not done**  SRS update for Q3/Q4 (ORCHESTRATOR, `/srs-update`). Part (b) screens. No test files written (guard).

**Uncertain**
- FINDING (DA): the trigger stamps `cleared_at := now()` = tx-2 *start*. An attacker refresh between tx-2 start and the Auth
  sign-out gets `iat` > `cleared_at` and is not stale. `statement_timestamp()` closes it, but `41_link_policies.sql:317` asserts `= now()`. Kept as designed.
- A bad body to c7/c10 from a stale password session is 400 before the 401 (no DB work before validation).
- Pepper missing blocks every first Google request (even unaffected) with 503 — fail closed, as c3.
- A second Google session racing the clear ends stale (401); its refresh token was revoked anyway.

**Local checks**  typecheck · lint · check:budgets · check:stories: green. Docker could not pull the image (Docker Hub 429,
ECR/GHCR blocked), so the DB ran on a local Postgres 16 with a Supabase stand-in (roles, `auth` schema, pinned auth functions):
migration up → down → up OK, drift OK, pgTAP all green except 01/02 (PG16 has no MAINTAIN; CI runs PG17) and **41 #148, `41_link_policies.sql:421` (FINDING
for TEST ENGINEER:** `first_password_set` with `user_id` = an Auth user with no users row is 23503 by the FK, the test wants OK:1).
Server unit 494/494 and db 181/181 green *with* the older-test updates below; a scratch smoke script (outside the repo) ran
c1–c12 end to end against that DB (incl. concurrency: one `takeover_cleared`).

**Older tests broken by the approved design — TEST ENGINEER's (guard: BUILDER does not write tests)**
- Edited before I hit the guard, left UNCOMMITTED in the working tree (patch: scratchpad `older-tests.patch`): `drift.test.ts`
  (F2.0 columns), `db/identity.db.test.ts` (claims keys + iat/session_id, DR-S1), `db/me.db.test.ts` and
  `db/recovery-store.db.test.ts` (`mustSetPassword:false`), `packages/shared/tests/recovery.test.ts` (7 kinds),
  `supabase/tests/10_identity_structure.sql`, `20_registration_structure.sql` (scoped to the F2.0 objects). TE: review, commit or redo.
- Not edited, red: `apps/web/tests/google/google-completion.test.tsx` (9 tests) stubs Auth `PUT /user`; c16 moves the call to
  `POST /api/password/first` on the global fetch.

**Preview path**  Not visible without part (b). On preview after migrate: a Google sign-in on an account created with
email+password first → `/api/me` 200 `mustSetPassword:true`, old password fails; the forced screen comes with part (b).

**Neighbouring**  `db/recovery-store.db.test.ts` "[F1.6 c5] B cannot change A's answers with A's email…" is flaky on the base
commit too (1 of 3 runs): it fails when the two tokens' `iat` fall in different seconds (the newer claim releases A's handle).
