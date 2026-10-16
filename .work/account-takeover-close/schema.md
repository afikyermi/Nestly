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
