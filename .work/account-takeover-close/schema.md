# schema — F2.0 account-takeover-close, part (a)

**Author** DATA ARCHITECT, 16.10.2026; `spec.md` (Gate 1), AR-1/AR-2 (`decisions/2026-10.md:1848`). **Verdict** Ready for Gate 2. No SECURITY DEFINER, no new role, no admin operation beyond AR-1. Spec "done" (c3, c5,
c6) = `cleared` here; "cleared-must-set" = `must_set`.

**Change**  New table, trigger, 5 helpers; `is_active_account()` gains the guard; answers' first DELETE; events kinds + policy.
- `nestly.identity_link_checks` (new), one row per Auth user, written on its first request from a Google session. Columns:
  `user_id` uuid PK, not null, default `auth.uid()`, **no FK** (c9: the user may have no `users` row; the anchor rule
  forbids a second FK to `auth.users`) · `verdict` text not null, CHECK in (`unaffected`,`affected`) · `checked_at`
  timestamptz not null default now() · `checked_session_id` uuid not null · `cleared_at` timestamptz null (affected and
  null = `pending`) · `clearing_session_id` uuid null · `password_set_at` timestamptz null. CHECKs: unaffected → the last
  three null; `(cleared_at is null) = (clearing_session_id is null)`; `password_set_at is null or cleared_at is not null`.
  State: unaffected · pending · must_set (cleared, password_set_at null) · done (password set).
- Helpers (`language sql`, STABLE, `search_path ''`, no argument, EXECUTE to `authenticated` only):
  `jwt_session_id()` uuid, `jwt_issued_at()` timestamptz (`to_timestamp(iat)`), `jwt_is_oauth()` boolean (`amr` has
  `method = 'oauth'`) — all from `auth.jwt()`, a malformed or missing claim reads NULL/false;
  `session_guard()` text → `unauthenticated` (no `auth.uid()`) · `unchecked` (no row, oauth) · `ok` (no row and not oauth,
  or unaffected) · `pending` (any session) · `stale` (cleared, session ≠ clearing_session_id, and iat NULL or
  `≤ cleared_at`) · `must_set` (cleared, password_set_at null, the clearing session) · else `ok`.
  `recovery_subject()` uuid: `request.jwt.claims ->> 'sub'` via `current_setting`; EXECUTE to `app_recovery` only.
- `is_active_account()` → `exists(active own users row) and (select nestly.session_guard()) in ('ok','must_set')`.
- Trigger `identity_link_checks_transition` BEFORE UPDATE (plpgsql, SECURITY INVOKER) allows exactly two moves and raises
  42501 on anything else: **clear** — OLD affected and pending, `jwt_is_oauth()`; sets `cleared_at := now()`,
  `clearing_session_id := jwt_session_id()`. **password set** — OLD must_set, and the caller is the clearing session OR has
  no own `users` row (c11); sets `password_set_at := now()`. verdict, checked_* never change. No DELETE on this table.
- `recovery_events`: kinds + `takeover_cleared`, `password_set_forced`, `first_password_set`, `password_changed`,
  `password_change_failed`, `password_change_limited`, `password_change_auth_failed`. `user_id` NULL also allowed for
  `takeover_cleared` (c9) and `first_password_set` (c11 has no account row). Partial unique index (below).
- `/api/me` (c7): `state: 'active'` gains **`mustSetPassword: boolean`**, true iff guard = `must_set`; never on unregistered.

**Why**  c1 verdict, once (a later email identity is always after the google one, so `unaffected` is permanent) · c3–c7,
c11 state · c5 single clear · c2/c10/c12 audit · D1.
**Authorization**  One enforcement point per rule:
- *c4 pending / c6 stale* → `session_guard()`. Server: `inIdentityTransaction` reads it in the statement that sets the
  claims (`select nestly.session_guard() from (select set_config('request.jwt.claims',$1,true) offset 0) s` — no extra
  round trip; a wrong order reads `unauthenticated` and fails closed) and answers `pending` 503, `stale` 401, `unchecked`
  → detection first, for every protected route. DB fence: the same function inside `is_active_account()`, so every gated
  table returns nothing while pending/stale/unchecked even if a route forgets.
- **Claims passed to the database** become `{sub, role:'authenticated', session_id, iat, amr}` (today sub/role only).
  They identify the session and are compared with a DB-held record; type, status and permissions still come from tables.
- `identity_link_checks` (authenticated): SELECT own; INSERT own with CHECK `checked_session_id = jwt_session_id()` and
  `jwt_is_oauth()` (a password session — the earlier registrant — cannot pre-write `unaffected`); UPDATE own, moves by the
  trigger. Grants: SELECT; INSERT (verdict, checked_session_id); UPDATE (cleared_at, password_set_at). Nothing to others.
- `recovery_answers` D1: policy `recovery_answers_delete_clear` FOR DELETE TO authenticated USING own row AND own
  link-check row is pending; GRANT DELETE. The statement has no WHERE and no RETURNING. Not status-gated (Q-4).
- Audit: new policy `recovery_events_insert_subject` TO app_recovery for `takeover_cleared`, `password_set_forced`,
  `first_password_set`: declared handle (token email) and IP as today, `user_id = recovery_subject()` or NULL. Within
  exception (b)'s reach (appends recovery_events only). c10 kinds use the existing handle-bound policy (answers exist).
- c10 limits: the question change's own-handle path, same `recovery_throttles` rows, no change. Server only: the c7/c11
  account-row refusal and the identity read below.

**Detection read**  `GET <issuer>/user` with the **caller's own access token** returns its `identities` (provider,
created_at): no admin key, no role, no DEFINER (one over `auth.identities` must be `postgres`-owned — beyond AR-1, Afik's).
Called only when the guard says `unchecked`: once per Auth user. Needs no Afik decision.

**Concurrency**  Tx1 (c3): insert `affected` + delete answers, one transaction. Tx2: `select … for update nowait` on the
own row (55P03 → 503), cancel password, `logout?scope=others`, `update … set cleared_at = now() where cleared_at is null`;
only if one row updated, insert `takeover_cleared`; commit. A concurrent runner gets 503 at once; its retry finds `cleared`
(no-op) or resumes. Second fence: unique `recovery_events_takeover_cleared_key (user_id) where kind = 'takeover_cleared'`.
c7 takes the same lock. Holds one pooled connection over two Auth calls, once per account (Auth timeouts < statement_timeout).

**Migration**  `supabase/migrations/20261016100000_identity_link_checks.sql`, one transaction: table, RLS + FORCE,
helpers, trigger, policies, grants; replace `is_active_account()`; answers delete policy and grant; events CHECKs re-added,
index, subject policy; comments. Same PR: token-verifier exposes session_id/amr; identity-transaction passes them and reads
the guard; Drizzle mirror + `identityLinkChecksInsert` (verdict, checked_session_id).

**Rollback**  `supabase/rollback/20261016100000_identity_link_checks.down.sql`: refuses while `identity_link_checks` or a
new-kind event holds a row; else restores the F1.1 `is_active_account()`, drops the delete policy/grant, subject policy,
index, restores both CHECKs, drops trigger, helpers, table. Must ship with the server rollback (it calls the guard).
After the first prod row: a forward fix. The user-side effects (password cancelled, answers deleted) are approved (Q3, D1).

**Backfill**  None; DR-O3 holds by construction (no row → checked on the next Google request). CHECK re-add scans the
small `recovery_events`. **Indexes**  PK serves the guard (initplan, once per statement); the partial unique index costs a
write only on clear rows. No new filter or sort; no existing query loses its index.

**Integrity**  No FK (decided): the I9 deletion flow (OP-028) must delete the row; no cascade added; events keep RESTRICT.
Time: timestamptz, DB clock, UTC, µs; iat is whole seconds (same-second token reads stale: fails safe). **Blast radius**
`is_active_account()` → every policy on regular_profiles, journey_contexts, children, legal_consents, recovery_answers;
every protected route; `/api/me`; recovery services. pgTAP 13, 21, 31 must still pass.

**Tests** (pgTAP, TEST ENGINEER)  `40_link_structure.sql`: columns, nulls, defaults, CHECKs, RLS+FORCE, exact grants,
helper grants, trigger, kinds, partial index, `tests.approved_security_definer()` empty. `41_link_policies.sql`: insert
refused without oauth or with another session_id; each guard value (iat in the cleared second, missing claims);
`is_active_account()` per state; clear stamps now()/session, a second clear updates 0 rows; password set only by the
clearing session or with no users row; any other UPDATE raises; answers delete only while pending and own; subject policy
binds sub; second `takeover_cleared` → 23505. Concurrency (two connections, NOWAIT): server integration test.

**Reversible?**  Yes (schema, while empty — as F1.6). No Afik decision needed beyond AR-1.
**Open — DECISION REQUEST, ORCHESTRATOR** · **DR-S1** pass session_id/iat/amr in `request.jwt.claims` (they identify
the session; never type, status or permission — rule 14). Recommend yes, CRITIC validates; if read as changing rule 14 it is
Afik's (fallback: guard in the server only, no DB fence). · **DR-S2** `recovery_events_insert_subject` widens exception (b)
(ORCHESTRATOR's, DR-G1) inside its reach. **QUESTION Q-S1** `must_set` only for the clearing session: another post-clear
device sees `ok`, not a screen c7 would refuse it. Default: as designed.
**Knowledge proposal — for CRITIC validation, not applied.** Approved exceptions (a), new head: "F1.6 recovery and F2.0
S-01/S-16 (FR-AUTH-003/005, OP-029) — Afik 2026-10-13, widened 2026-10-16 (AR-1). (a) Auth: set the password in five flows
only — recovery reset (as below), the S-01 clear (random, never kept), the forced new password, the change after two
answers, the F1.8 first password (no account row) — key SUPABASE_SECRET_KEY read only in apps/server/src/recovery/
auth-admin.ts; no other admin operation; other sessions end with the caller's own token (logout?scope=others), the reset
keeps scope=global; every set audited in recovery_events." Reset details and fence stay. (b) adds "appends the three
subject-bound kinds, user_id = the transaction's sub". Rule 18 and "Write grants" (first DELETE) follow the as-built.

## Gate 2 — ORCHESTRATOR, 16.10.2026

Approved. **DR-S1** yes — `session_id`, `iat`, `amr` enter `request.jwt.claims` as session identifiers only; account
type, status and permissions still come from tables; CRITIC validates. **DR-S2** yes — append-only on `recovery_events`,
within what `app_recovery` may already do. **Q-S1** default — `mustSetPassword` reported to the clearing session only.
The data-model.md exception (a) text is applied in part (a)'s diff and validated by CRITIC (proposer ≠ validator).
**Scope move (internal HOW):** spec c16 (F1.8 completion calls c11) moves into part (a), because c13 removes the client
password call in the same part; part (b) keeps c14, c15, c17.

## Gate 2 amendments — DATA ARCHITECT, 16.10.2026 (BUILDER handoff 4a4ab45..a4df223)
- **A1 (Finding 4, c6 hole) — changed.** The trigger stamps `cleared_at := pg_catalog.clock_timestamp()` (the time of the
  UPDATE, which runs after `signOutOthers` returned), not `now()` (transaction start). The order stays as built; no reorder.
  Test `41_link_policies.sql:317`: assert `cleared_at > transaction start` and `<= clock_timestamp()` after the UPDATE,
  not `= now()`. `password_set_at` keeps `now()` (no ordering against a token). Residual: Auth's `iat` clock vs the DB
  clock; skew is assumed sub-second (one Supabase project); no margin added.
- **A2 (Finding 5) — validated.** `recovery_events_insert_recovery` excludes the three subject-bound kinds; they are
  writable only through `recovery_events_insert_subject`. Without it a declared handle could log `takeover_cleared` for
  that handle's account. Keep it, with the test at `41_link_policies.sql` `reset_failed` line as the converse.
- **A3 (audit FK) — confirmed: NULL.** `first_password_set` (c11) and `takeover_cleared` for a c9 user carry `user_id`
  NULL: `recovery_events_user_id_fkey` references `nestly.users`, which has no row for them. Test `:421` must insert NULL
  and expect OK, and expect 23503 for a non-NULL id with no users row.
- **A4 (CRITIC bug 1, high) — one per-user advisory lock.** Mechanism: `select pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtextextended('nestly.password_state:' || $1, 0))`, `$1` = the user id; the key is built in one server
  module, nowhere else. Transaction-scoped (pooler-safe), built-in, needs no grant (PUBLIC EXECUTE; under every runtime
  role incl. `app_recovery`), no migration change. A row lock on `identity_link_checks` was rejected: no row may exist yet,
  and the guest reset (`app_recovery`) cannot read the table. A "set in flight" marker was rejected: it needs cleanup after
  a crash; the transaction lock releases itself. **NOWAIT** (try-lock): false → 503 `unavailable`, retried by the client;
  no waiting while holding a pooled connection. Takers, lock first, then any row lock: the clear Tx1 and Tx2; c7, c10,
  c11 and the F1.6 reset, each held from a re-read through its Auth password set, then commit; the answers store and
  change (short, no Auth call). Re-read under the lock: c7/c10/c11 the guard (`pending`/`stale` → refuse as today) and the
  link-check state; c10 and the reset also that the verified answers row still exists for that user (Tx1 deletes it; a
  deleted row → ERR-042 semantics, nothing set). The reset's sign-in and global logout may run after commit. **F1.6's rule
  yields here, only for the Auth password set call**: one connection held for one Auth call per set, rare per user; the
  cost is accepted. Tests: a delayed fake set admitted before the clear lands before `cancelPassword`, never after (server
  integration); pgTAP: the try-lock call succeeds as `authenticated` and `app_recovery`, a second holder gets false.
- **A5 (CRITIC bug 2, low) — confirmed.** Tx2 runs `deleteOwnAnswers` again under its locks, before `markCleared` (still
  pending, so the delete policy allows it). With A4 the store cannot overlap Tx1 either; the re-delete stays as the fence.
- **A6 (escape, PR 38; bug-fix path) — the admin set is the revocation.** Fact (BUILDER's read, Preview run pending): GoTrue's
  `PUT /admin/users/<id> {password}` deletes every session of the user, the caller's included. So:
  - **Server.** S-01 clear, c7 and c10 stop calling `logout?scope=others`; the admin set ends all sessions (refresh
    tokens). Tx2 = lock, re-delete answers, `cancelPassword`, `markCleared`, audit, commit. c10 loses its "set but revoke
    failed" branch. F1.6 reset unchanged (its later global logout is redundant, harmless). The server returns no tokens.
  - **Clearing session.** Its access token still passes (exempt from stale), so the triggering request is answered and c7
    can run until it expires; its refresh fails. **c7 accepted from any non-stale session** (the clearing one, or iat >
    cleared_at): after the clear the password is cancelled, the answers are gone and every pre-clear token is stale, so a
    post-clear session can only be the Google/email owner's. `must_set` reported to the same set (replaces Q-S1).
  - **Migration (new, forward — PR 38 is merged, its file stays):** `supabase/migrations/20261017100000_link_check_owner_sessions.sql`
    with `create or replace`: `session_guard()` → after the `stale` branch, `when c.password_set_at is null then 'must_set'`
    (drop the clearing-session test); the trigger's password-set move → allowed when `jwt_session_id() =
    old.clearing_session_id` or `jwt_issued_at() > old.cleared_at` or no own users row (inline, no self-read). Comments
    updated. Rollback `supabase/rollback/20261017100000_link_check_owner_sessions.down.sql` restores the 20261016 bodies;
    no data touched, fully reversible. Stuck `pending` rows resume on the next Google request after deploy (idempotent;
    that session is revoked by the set, the user signs in with Google once more and gets `must_set`). No backfill.
  - **Spec criteria (ORCHESTRATOR records the change in spec.md):** c2 "the caller's session keeps working" → "the
    triggering request is answered; every session's refresh ends, the caller's included". c3 steps: revoke is the
    cancel-password step itself. c6 unchanged (the rule already exempts the clearing session and passes iat > cleared_at).
    c7 "only from the clearing session" → "from any non-stale session"; after success all sessions end and the client
    signs in with the new password. c10 "revokes every other session, keeps the caller's" → "ends every session; the client
    signs in with the new password"; drop the revoke-retry bullet. c11 unchanged (no account row; its session ends too —
    the web completes registration after re-sign-in with that password; BUILDER confirm the F1.8 order).
  - **Tests.** Server: the Auth fake's admin set revokes all sessions incl. the caller's; regression: the clear completes
    (no stuck pending) and a resumed pending completes; c7 from a post-clear session succeeds, from a stale one 401; c10
    caller refresh fails after success. pgTAP: guard `must_set` for iat > cleared_at on a non-clearing session; trigger
    accepts that session, refuses a stale one; the "only clearing session" assertions flip. E: c7/c10/c14 flows sign in
    again with the new password.
  - **Authority.** No new admin operation — fewer Auth calls than AR-1 allows. But AR-1's sentence "signing out other
    sessions uses the caller's own token, not the admin key" is no longer true as built: the sign-out is the approved
    set-password call's own effect. Not a widening, so no Afik decision needed; it goes on "ממתין לך" as an FYI with the
    exception (a) text correction. Ending the caller's own session is stricter than the spec, not a looser security model:
    ORCHESTRATOR decides.
- **A7 (CRITIC fix-round bug 1, high; DR-E2) — password sessions are not the owner's until the new password.** New forward
  migration `supabase/migrations/20261017093000_link_check_password_amr.sql` (20261017090000 is applied on nestly-preview
  and stays), rollback `supabase/rollback/20261017093000_link_check_password_amr.down.sql` (restores the 20261017090000
  bodies; no data). `create or replace` of two bodies only:
  - `session_guard()`: after the existing `stale` branch, while `password_set_at` is null, a session other than the clearing
    one reads `stale` when its `amr` includes `password` **or is missing/not an array** (fail closed); else `must_set`.
  - Trigger password-set move: allowed only for the clearing session, or a session with `iat > cleared_at` and a readable
    `amr` without `password`. A6's "no own users row" exemption is dropped: c11 is held to the same rule (it was CRITIC's
    c11 gap; a post-clear oauth session of a c9 user still passes).
  - **Server:** no change to the guard handling — `stale` already maps to 401 in the identity transaction, and c7/c11/c10
    re-read it under the lock (`refuseUnlessProceeding` refuses `stale`). **One change:** `token-verifier.ts`
    `authMethodsOf` truncates `amr` at 8 entries and drops unrecognised ones, so a `password` entry could vanish and fail
    open. Make it all-or-nothing: if the array exceeds the cap or any entry is dropped, `authMethods` is undefined (then
    no `amr` claim → `stale` here, and not oauth for detection).
  - **Tests flip:** `password.db.test.ts:510-521` (post-clear password session → 401, not set) and pgTAP 41's two `OK:1`
    cases for a password-amr session (guard → `stale`; trigger → 42501). **New (CRITIC):** a session with `amr=password`,
    `iat > cleared_at`, before `password_set_at` → 401 on `/api/me`, c7 and c11, password unchanged; pgTAP: same session
    reads `stale`, missing `amr` reads `stale`, a post-clear `oauth` session reads `must_set` and may set; c11 user with
    no users row and a password session → 42501. Verifier unit test: 9 entries or an unrecognised entry → no `authMethods`.
  - **Authority:** stricter than A6, within DR-E2; no Afik item.
