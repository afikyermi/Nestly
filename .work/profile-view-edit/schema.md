# schema — F2.1 own profile view and edit (profile-view-edit)

DATA ARCHITECT, 17.10.2026. Contract: `spec.md` + Gate 1 (DR-1 A: full_name and gender editable). Elevated.

**Change**            `nestly.regular_profiles` gets its first UPDATE path. No column, type, CHECK, index or FK changes.
                      before: authenticated has SELECT (table) + INSERT (full_name, gender); policies `_select_own`, `_insert_own`.
                      after:  + column-level `UPDATE (full_name, gender)` to authenticated; + policy `regular_profiles_update_own`.
                      `nestly.users` unchanged (read only). No new function; the approved-definer list is unchanged.
**Why**               FR-PROFILE-001 / AC-015 / UC-10: the owner edits the fields DR-1 A approves. Criteria 5, 7, 9–11, 13.
**Authorization**     One enforcement point: the RLS policy, gated by the existing `nestly.is_active_account()` (rule 15; since
                      20261016100000 it is false for suspended, banned, pending, stale and unchecked tokens).
                      ```sql
                      create policy regular_profiles_update_own on nestly.regular_profiles
                        for update to authenticated
                        using      (user_id = (select auth.uid()) and (select nestly.is_active_account()))
                        with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));
                      grant update (full_name, gender) on table nestly.regular_profiles to authenticated;
                      ```
                      Same shape as `recovery_answers_update_own`. user_id, account_type, created_at are never granted UPDATE
                      → 42501 by privilege (rules 12–14); WITH CHECK is the second fence. No DELETE grant or policy (stays
                      refused). anon and app_server (no SET ROLE) get nothing. Server runs as app_server under
                      `SET LOCAL ROLE authenticated` with the caller's claims (rule 3). `must_set` passes the gate exactly as
                      on every other gated table — no special case here.
**VAL reuse**         Existing CHECKs already enforce the values; they fire on UPDATE as on INSERT — do not add more:
                      `regular_profiles_full_name_check` = `char_length(btrim(full_name)) between 2 and 60` (VAL-001);
                      `regular_profiles_gender_check` = `gender in ('woman','man','other','prefer_not_to_say')`, NULL allowed
                      (VAL-006). Shared Zod (`fullNameSchema`, `PARENT_GENDERS`) is the first check; the server stores the
                      trimmed value. Note (as F1.3): btrim trims U+0020 only — the DB is the backstop, Zod the rule.
**updated_at**        Does not exist and is not added. Nothing reads it: no history, audit, conflict check (Q5: last write wins)
                      or sort in scope. Adding it later is a cheap additive migration when a requirement needs it.
**Server write model** `apps/server/src/db/schema.ts`, beside `regularProfilesInsert`:
                      ```ts
                      /** UPDATE target only. Names exactly the columns granted UPDATE to authenticated (migration 20261017100000). Nullable like the column (drift check). */
                      export const regularProfilesUpdate = nestly.table('regular_profiles', {
                        fullName: text('full_name').notNull(),
                        gender: text('gender', { enum: PARENT_GENDERS }),
                      });
                      ```
                      Repository: `tx.update(regularProfilesUpdate).set({ fullName, gender }).returning({ fullName:
                      regularProfilesUpdate.fullName, gender: regularProfilesUpdate.gender })` with **no WHERE** — RLS confines
                      it to the caller's row (precedent: `replaceOwnAnswers`; rule "application code never filters for
                      permission"). 0 rows = no profile or not active; 1 = saved; >1 = the policy is wrong (throw). RETURNING
                      passes `_select_own` (same gate). Read path uses the existing `regularProfiles` table object; no id from
                      the request anywhere. `drift.test.ts` must cover the new object.
**Migration**         `supabase/migrations/20261017100000_regular_profiles_update_own.sql`, in one transaction:
                      1. `grant update (full_name, gender) on table nestly.regular_profiles to authenticated;`
                      2. `create policy regular_profiles_update_own …` (above).
                      3. `comment on policy` — "An active account edits its own full_name and gender (FR-PROFILE-001, F2.1).
                         Other columns: no grant." (The table comment needs no change.)
**Rollback**          `supabase/rollback/20261017100000_regular_profiles_update_own.down.sql`, as app_owner, one transaction
                      (house pattern: current_user guard): `drop policy regular_profiles_update_own on nestly.regular_profiles;`
                      `revoke update (full_name, gender) on table nestly.regular_profiles from authenticated;` delete the
                      `20261017100000` row from `supabase_migrations.schema_migrations`. Revert the F2.1 route with it (PUT
                      would otherwise 500 on 42501 — fails closed, no leak). Touches no row; edited values stay (data, not
                      schema). CI runs up → down → up. On preview/prod level 1 is a forward migration through CI.
**Backfill**          None.
**Indexes**           None added. The UPDATE and its RLS check go by `regular_profiles_pkey` (user_id) and `users_pkey` (id,
                      inside is_active_account()). No new filter or sort column; no existing query loses its index.
**Integrity**         No FK column is updatable, so `regular_profiles_user_fkey` (user_id, account_type) and the cascades from
                      journey_contexts / children are untouched. No orphan risk. NOT NULL on full_name holds; gender NULL =
                      "not answered" (Q3: clearing is allowed). Temporal: none new.
**Blast radius**      Readers/writers of regular_profiles: `registration-repository.ts` (INSERT path — unchanged; the
                      `INSERT … ON CONFLICT DO UPDATE` stays refused because user_id has no INSERT grant), `schema.ts`,
                      `drift.test.ts`, `tests/db/identity.db.test.ts`, `tools/preview-e2e-cleanup*` (privileged delete,
                      unaffected). Side effect: with an UPDATE grant on a column, `SELECT … FOR UPDATE/SHARE` on own row is now
                      permitted (PG needs UPDATE on ≥1 column) and RLS-confined to the own active row — accepted, harmless.
                      Knowledge: `data-model.md` (Entities "Writes" line) and `data-model-tables.md` (regular_profiles
                      Authorization cell) update in the same unit of work — DATA ARCHITECT, with the migration.
**Reversible?**       **Yes.** No DECISION REQUEST for Afik. Prod runs in the batched CI migration (CLAUDE.md, reserved 2).

## pgTAP — required (TEST ENGINEER; run as app_server, `tests.as_role` / `tests.dml_as`)

New file `supabase/tests/50_profile_update.sql`:
1. Structure: policy `regular_profiles_update_own` exists, cmd `w`, to authenticated, USING and WITH CHECK both reference
   `is_active_account`; column UPDATE to authenticated is exactly {full_name, gender}; no table-level UPDATE; no DELETE.
2. A active: UPDATE full_name (2 and 60 chars), gender each of the four and NULL → `OK:1`, values stored as sent.
3. A's claims, UPDATE with no WHERE → affects exactly 1 row; B's row unchanged (fx_profile before = after).
4. A's claims, `where user_id = <B>` → `OK:0`, B unchanged (criterion 10).
5. A's claims, UPDATE of `user_id`, `account_type`, `created_at` → 42501 each (criterion 10).
6. DELETE of own row → 42501 (no grant) (criterion 10).
7. A suspended, then banned (`tests.set_status`), same claims → UPDATE `OK:0`, SELECT 0 rows, row unchanged; active again → `OK:1`
   (criterion 11).
8. A's link check pending, and a stale token (`tests.fx_link_put`, F2.0 fixtures) → UPDATE `OK:0`, row unchanged. An
   unchecked oauth token (no link row) → `OK:0`.
9. CHECKs on UPDATE: full_name `' '`, 1 char, 61 chars → 23514; gender `'female'` → 23514; full_name NULL → 23502.
10. anon UPDATE → 42501; app_server without SET ROLE → 42501.
11. RETURNING full_name, gender as active A returns the new values (the repository shape works under RLS).

Existing assertions that now fail by design and must be amended in the same PR (scope regular_profiles in, nothing else):
- `10_identity_structure.sql:345-349` — add `regular_profiles` to the column-level UPDATE exception list.
- `12_identity_writes_refused.sql:33-36` (no column UPDATE on users/regular_profiles) and rows 96-99, 104, 106, 111 (own
  full_name/gender, suspended own, UPDATE-all, FOR UPDATE) — move to file 50 with their new expected outcome
  (`OK:1`/`OK:0`). Rows 100 (account_type → 42501) and 102 (B's row → now `OK:0`, not 42501) re-graded; 107-110 DELETE/
  TRUNCATE and 117/124 (anon, app_server) stay refused.
- `20_registration_structure.sql:196` — policy list gains `regular_profiles.regular_profiles_update_own.w` (eleven);
  `:280` — allow UPDATE to authenticated on regular_profiles.full_name/gender; `:321` — exclude those two columns.
  The 13-column ACL count (`:270`) stays 13 (both columns already carry an INSERT ACL).
- `15_identity_full_name_parity.sql` — add an UPDATE run of the same table (same results), so VAL-001 parity holds on both writes.


## Gate 2 — ORCHESTRATOR, 17.10.2026

Approved as written: per-column UPDATE (full_name, gender), own-row policy behind `is_active_account()`, no new columns or
CHECKs, `regularProfilesUpdate` write model, migration 20261017100000, rollback, pgTAP 50; the older pgTAP files named above
change in the same PR. Knowledge files updated with the migration.
