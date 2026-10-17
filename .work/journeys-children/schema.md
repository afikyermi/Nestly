# schema — F2.2a journeys and children: view, add, edit (journeys-children)

DATA ARCHITECT, 17.10.2026. Contract: `spec.md` c1–c13 + Gate 1 (DR-4 A, DR-5 A). DR-1 reserved: no DELETE or end marker here. Elevated.

**Change**            `nestly.children` gets its first UPDATE path. No column, type, CHECK, index, FK or function changes.
                      before: authenticated has SELECT (table) + INSERT (slot, name, sex, birth_date); policies `_select_own`, `_insert_own`.
                      after:  + column-level `UPDATE (name, sex, birth_date)`; + policy `children_update_own`.
                      `nestly.journey_contexts`: **unchanged** — the has_child INSERT (c7) uses the existing grant and policy.
                      The ≤ 10 limit needs no change: `children_user_id_slot_key` UNIQUE (user_id, slot) + `children_slot_check`
                      1–10 already hold it under concurrency. Approved-definer list unchanged; no service role.
**Why**               FR-PROFILE-002, DR-5 A (c8). c3, c6, c7 (VAL-040, AC-090, DR-4 A) use INSERT paths that exist since F1.4.
**Authorization**     One enforcement point per table: its RLS policies, gated by `nestly.is_active_account()` (rule 15).
                      ```sql
                      grant update (name, sex, birth_date) on table nestly.children to authenticated;
                      create policy children_update_own on nestly.children
                        for update to authenticated
                        using      (user_id = (select auth.uid()) and (select nestly.is_active_account()))
                        with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));
                      ```
                      Shape of `regular_profiles_update_own`. user_id, slot, id, created_at: no UPDATE grant → 42501 (rules 12–14);
                      WITH CHECK the second fence. No DELETE on either table (DR-1). app_server, `SET LOCAL ROLE authenticated`.
**Server write path** **Read** (GET, and slot choice): `select … from children order by slot` / `from journey_contexts` with **no
                      WHERE** — RLS confines to own rows. **Add (c3, c6, c7)**, one identity transaction, READ COMMITTED (the
                      Drizzle default — do not raise it; the retry below depends on each statement seeing new commits):
                      1. read own slots; slot = the **lowest** of 1..10 not taken; none → throw → 409 `children_too_many` (rollback).
                      2. `tx.insert(journeyContextsInsert).values({stage:'has_child', dueDate:null}).onConflictDoNothing()` —
                         every add, not only the first: idempotent, race-free, keeps has_child ⇔ ≥ 1 child (DR-4 A); no read.
                      3. `tx.insert(childrenInsert).values({slot, …}).onConflictDoNothing().returning({id, slot})`. 0 rows = a
                         concurrent add took that slot (this statement waited for its commit on the unique index) → back to 1,
                         at most 10 rounds, then throw. 1 row → commit. Any throw rolls back step 2 too (c7).
                      Both `onConflictDoNothing()` **untargeted** (no column list): the write models hold no user_id, and an
                      untargeted clause keeps working if DR-1 B turns a unique key partial. c6: 9 + 2 → B waits, sees 10, 409;
                      5 + 2 → B waits, retries, slot 7. No advisory lock (the house try-lock would 503 one of the two in c6).
                      **Edit (c8)**: `tx.update(childrenUpdate).set({name, sex, birthDate}).where(eq(childrenUpdate.id, id))
                      .returning(…)` — the id picks the target, RLS decides whether it may. 0 rows → 404 `not_found` (B's id,
                      a suspended A); 1 → saved. Non-uuid id → 404 from Zod, no query (else 22P02 → 500). Q2: last write wins.
                      Unregistered: 404 `no_profile` before any write, as F2.1; the database refuses anyway (42501, FK).
**Drizzle**           `apps/server/src/db/schema.ts`, beside `regularProfilesUpdate`; `drift.test.ts` covers it:
                      ```ts
                      /** UPDATE target only. name, sex, birth_date are the columns granted UPDATE to authenticated (migration 20261017110000). id is for WHERE only: it has no UPDATE grant (42501). */
                      export const childrenUpdate = nestly.table('children', {
                        id: uuid('id').primaryKey(),
                        name: text('name').notNull(),
                        sex: text('sex', { enum: CHILD_SEXES }).notNull(),
                        birthDate: date('birth_date', { mode: 'string' }).notNull(),
                      });
                      ```
**Migration**         `supabase/migrations/20261017110000_children_update_own.sql`, one transaction, header as F2.1's:
                      1. the `grant update (name, sex, birth_date)` above; 2. `create policy children_update_own` above;
                      3. `comment on policy children_update_own on nestly.children is 'An active account edits its own
                         child''s name, sex and birth date (FR-PROFILE-002, F2.2a, DR-5 A). slot, user_id, created_at: no grant.';`
**Rollback**          `supabase/rollback/20261017110000_children_update_own.down.sql`, as app_owner, one transaction, the F2.1
                      current_user guard, then: `drop policy children_update_own on nestly.children;` `revoke update (name, sex,
                      birth_date) on table nestly.children from authenticated;` `delete from supabase_migrations.schema_migrations
                      where version = '20261017110000';`. Revert the PUT route with it (42501 → 500, fails closed, no leak); GET
                      and POST need no part of this migration. Touches no row; edited values stay. CI runs up → down → up.
**Backfill**          None.
**Indexes**           None added. Own reads: `children_user_id_slot_key` (user_id prefix, also the ORDER BY slot) and
                      `journey_contexts_user_id_stage_key`; UPDATE: `children_pkey`; `is_active_account()`: `users_pkey`. No new
                      filter or sort column; no existing query loses its index.
**Integrity**         No FK or key column becomes updatable; cascades from regular_profiles untouched; no orphan risk. Existing
                      CHECKs fire on UPDATE (name 1–60 after btrim, sex enum, birth_date ≥ 1900-01-01); "not in the future"
                      stays server-side (VAL-005, server clock). NOT NULL on all three. Temporal: `birth_date` stays `date`,
                      no zone (a calendar date); no updated_at (nothing reads it; additive later).
**Blast radius**      children readers/writers: `registration-repository.ts` (plain INSERT, unchanged), `schema.ts`,
                      `drift.test.ts`, `tests/db/*`, pgTAP 10/20/22/23, fixtures, `tools/preview-e2e-cleanup*` (privileged
                      delete, unaffected). New reader: GET `/api/journeys`. Side effect: `SELECT … FOR UPDATE` on own active
                      children becomes permitted (needs UPDATE on ≥ 1 column), RLS-confined — accepted. Knowledge:
                      `data-model.md` (Entities "Writes") and `data-model-tables.md` (children Authorization + Indexes cells)
                      update with the migration — DATA ARCHITECT.
**DR-1 constraint**   None of the above narrows A/B/C. A/C (hard delete): a DELETE grant + own policy; the lowest-free slot reuses
                      the freed one, so c17 holds with no slot UPDATE ever. The view then orders by (created_at, slot) so a
                      re-used slot still shows last (server only; equal to slot order in F2.2a). B (end marker): the two unique
                      keys become partial (WHERE not ended); the untargeted ON CONFLICT keeps working; `children_update_own`
                      gains `ended_at is null` in USING. All additive and reversible.
**Reversible?**       **Yes.** No DECISION REQUEST for Afik. Prod in the batched CI migration (reserved 2).

## pgTAP — required (TEST ENGINEER; as app_server via `tests.as_role` / `tests.dml_as`; new file `51_children_write.sql`)
1. Structure: `children_update_own` cmd `w`, TO authenticated only, USING and WITH CHECK reference `is_active_account`; column
   UPDATE on children exactly {name, sex, birth_date}; no table-level UPDATE; no DELETE on children or journey_contexts.
2. c9 reads: A's claims → children = A's 2 slots only, journey_contexts = A's 2 only; B's claims → B's rows only.
3. c9 UPDATE: A sets name/sex/birth_date on own slot 1 → `OK:1`, stored; with no WHERE → `OK:2` (own only), B unchanged;
   `where id = <B's child>` → `OK:0`, B unchanged; `set user_id`, `set slot`, `set created_at`, `set id` → 42501 each.
4. c9 INSERT: naming `user_id` (B or A) → 42501; DELETE own child, own journey, B's rows → 42501 each.
5. c6/c7 shapes as A: `insert … (stage) values ('has_child') on conflict do nothing` → `OK:0`, still one has_child; as b →
   `OK:1`. Child into a taken slot `on conflict do nothing` → `OK:0` (not 23505); slot 11 → 23514.
6. c10: A suspended, then banned (`tests.set_status`) → SELECT 0 rows on both tables; UPDATE `OK:0`, unchanged; INSERT child and
   has_child → 42501; active again → `OK:1`. Link check pending / stale token / unchecked oauth (F2.0 fixtures) → `OK:0`.
   Auth user with no users row (c) → SELECT 0 rows, INSERT 42501.
7. CHECKs on UPDATE: name `' '`, 61 chars → 23514; sex `'female'` → 23514; birth_date 1899-12-31 → 23514; NULLs → 23502.
8. anon and app_server without SET ROLE: UPDATE, INSERT → 42501. 9. RETURNING on own UPDATE returns the new values.
Concurrency (c6 9+2, 5+2) and c7 atomicity are **server db tests** (`tests/db/`, two real connections), not pgTAP.

Amend in the same PR (fail by design): `10_identity_structure.sql:273` allow `children_update_own` (w); `:347` add `children` to
the column-UPDATE exception list. `20_registration_structure.sql:190-198` policy set gains `children.children_update_own.w`
(twelve); `:280` and `:321` exclude children name/sex/birth_date UPDATE; the 13-column ACL count (`:270`) stays 13.
`22_registration_owner_only.sql:87-90, 94, 107` re-grade (own UPDATEs → file 51; `slot` row 89 stays 42501; `where false` →
`OK:0`; FOR UPDATE permitted; B's UPDATE → `OK:0`, A unchanged) and keep the `:116` unchanged-state check true.

## Gate 2 — ORCHESTRATOR

**Approved — ORCHESTRATOR, 17.10.2026.** Reversible, own-row, no new SECURITY DEFINER, no DELETE; DR-1 options stay open
(finding 7). The QUESTION takes its default: the identity transaction stays READ COMMITTED, proven by the c6 server db test.
BUILDER writes the two `.sql` files exactly as above (as in F2.1); DATA ARCHITECT checks them and updates the knowledge
files in the same PR. BUILDER ∥ TEST ENGINEER start now on F2.2a.
