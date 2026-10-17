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

---

# schema — F2.2b journeys and children: pregnancy, remove, end, birth (journeys-children)

DATA ARCHITECT, 17.10.2026. Contract: `spec.md` c14–c26 + "Gate 1 (F2.2b)": b1 = c14–c15, b2 = c16–c26. Afik: DR-1 A (hard delete),
DR-2r (no reason stored); Gate 1: DR-2/3/4/6 A. Elevated. One migration per part. The F2.2a part above is as built (PR 41).
**Change**            **b1** `20261017140000_journey_due_date_update.sql`: `UPDATE (due_date)` on journey_contexts + `journey_contexts_update_own`
                      (pregnant rows only). Adding a pregnancy reuses the F1.4 INSERT grant/policy; `…_user_id_stage_key` + `…_planning_pregnant_key`
                      hold c15 under concurrency. **b2** `20261017141000_journeys_children_delete_own.sql`: table `DELETE` on both + `children_delete_own`,
                      `journey_contexts_delete_own`. Comments redefined. No column/type/CHECK/index/FK/function; no `deleted_at`, `ended_at` or reason.
**Authorization**     RLS policies only, behind `(select nestly.is_active_account())`. `stage = 'pregnant'` in the UPDATE policy: PUT on a planning or
                      has_child id → 0 rows → 404 (c14), never 23514 → 500. DELETE policies carry no stage (c19/c23 delete has_child and planning);
                      which route deletes which stage is targeting (`where … stage =`), not permission. Definer list unchanged; no service role.
**b1 up**             ```sql
                      grant update (due_date) on table nestly.journey_contexts to authenticated;
                      create policy journey_contexts_update_own on nestly.journey_contexts for update to authenticated
                        using      (user_id = (select auth.uid()) and stage = 'pregnant' and (select nestly.is_active_account()))
                        with check (user_id = (select auth.uid()) and stage = 'pregnant' and (select nestly.is_active_account()));
                      comment on policy journey_contexts_update_own on nestly.journey_contexts is 'An active account edits the due date of
                        its own pregnancy only (FR-PROFILE-002, VAL-044, F2.2b, DR-5 A). stage, user_id, created_at: no grant.';
                      comment on table nestly.journey_contexts is 'SRS JourneyContext (§13, VAL-039): one row per stage the parent is in,
                        ticked at registration or added later by the owner (F2.2b). Part of the parent''s account: deleted with the profile.';
                      ```
**b2 up**             ```sql
                      grant delete on table nestly.children, nestly.journey_contexts to authenticated;
                      create policy children_delete_own on nestly.children for delete to authenticated
                        using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
                      create policy journey_contexts_delete_own on nestly.journey_contexts for delete to authenticated
                        using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
                      comment on policy children_delete_own on nestly.children is 'An active account removes its own child: hard delete (DR-1 A).';
                      comment on policy journey_contexts_delete_own on nestly.journey_contexts is 'An active account ends its own journey: hard delete, no reason kept (DR-1 A, DR-2r).';
                      comment on column nestly.children.slot is 'One of the parent''s ten seats, 1 to 10 (VAL-040); with children_user_id_slot_key
                        it holds the limit. A freed seat is reused by the next add. Not the display order (created_at, then slot); not data about the child.';
                      comment on table nestly.journey_contexts is 'SRS JourneyContext (§13, VAL-039): one row per stage the parent is in, ticked at
                        registration or added later by the owner (F2.2b); an ended stage is deleted, not marked (DR-1 A). Deleted with the profile.';
                      ```
**Rollback**          `supabase/rollback/<version>.down.sql` each, as app_owner, one transaction, the F2.1 `current_user` guard. **b1:** `drop policy
                      journey_contexts_update_own …; revoke update (due_date) … from authenticated;` table comment → the 20261014200000 text;
                      delete history row `20261017140000`. **b2:** drop both policies; `revoke delete on table nestly.children,
                      nestly.journey_contexts from authenticated;` slot comment → the 20261014200000 text, table comment → b1's; delete history
                      row `20261017141000`. Revert each part's routes with it (42501 → 500, closed). Touch no row; user-deleted rows stay gone (DR-1 A).
**Server write path** id `z.guid()` (else 404, no query) → body → gate (F2.2a) → work, one identity transaction, READ COMMITTED. **Lock (b2; every
                      route that inserts or deletes a child or journey, F2.2a's add included):** right after the gate `tx.select({ userId:
                      regularProfiles.userId }).from(regularProfiles).for('no key update')`, exactly 1 row else `JourneysFault`. **R** remove
                      child: `delete children where id returning id` (0 → 404) → `select 1 from children limit 1` → none → `delete
                      journey_contexts where stage = 'has_child'` (c19, c21). **E** end pregnancy (a body → 400): `delete … where id = $1 and
                      stage = 'pregnant' returning id` (0 → 404: B's, unknown, planning, has_child; c20). **B** birth: E's delete first (0 →
                      404, no child), then the F2.2a add rounds; full → `ChildrenFull` → rollback → 409, pregnancy kept (c22). **P** add pregnancy
                      (b1; b2 adds the confirmation): confirmed → `delete … where stage = 'planning'`; then insert pregnant `onConflictDoNothing()`
                      untargeted `.returning(…)`; 0 rows → throw → rollback → 409 `stage_conflict` (c15, c23). **U** due date (b1):
                      `tx.update(journeyContextsUpdate).set({ dueDate }).where(eq(journeyContextsUpdate.id, id)).returning(…)`, 0 → 404, no lock.
                      No `where` names a user; RLS confines.
**has_child ⇔ ≥ 1**   The race: two removals of the last two children each see the other's uncommitted row as still there, both keep has_child;
                      add vs. remove-last: the remover cannot see the new child and deletes has_child. **Chosen: a row lock on the caller's
                      `regular_profiles` row, `FOR NO KEY UPDATE`.** It always exists (parent of both tables), is RLS-confined (select and
                      update_own policies: only one's own row), needs no grant (the F2.1/F2.3a UPDATE grants permit it), and does not block the
                      `FOR KEY SHARE` of FK checks. The second writer waits, then each of its statements sees the first one's commit. One lock
                      order (profile first) → no deadlock. Cost: that user's concurrent profile UPDATE waits ms. **Rejected:** the has_child row
                      (absent on the first add and at zero journeys, deleted by the last removal); a constraint trigger (a deferred check at READ
                      COMMITTED still misses the other's uncommitted delete unless it locks; splits DR-4 across server and database); the house
                      advisory lock (try-only: one legitimate write 503s; a blocking one is a second, unconfined idiom); SERIALIZABLE (40001 +
                      retry). DR-4 stays a server rule: the database does not refuse a has_child delete with children left. Accepted, in writing.
**Child order**       Order of addition: the server sorts `orderBy(asc(children.createdAt), asc(children.slot))`; slot breaks registration's tie
                      (one `now()`, slots in entry order); a reused seat shows last (c17). Concurrent adds show in transaction-start order — accepted.
                      Slot's new meaning (position → seat) follows Gate 1 (F2.2b, ORCHESTRATOR); the column comment records it.
**Drizzle**           `schema.ts` beside `childrenUpdate`, covered by `drift.test.ts`; deletes use the read models (DELETE names no column). **Backfill:** none.
                      `/** UPDATE target only. due_date is granted UPDATE (migration 20261017140000), on a pregnant row only (policy). id is for WHERE only (42501). */`
                      `export const journeyContextsUpdate = nestly.table('journey_contexts', { id: uuid('id').primaryKey(), dueDate: date('due_date', { mode: 'string' }) });`
**Indexes**           None added. By id: pkeys; `stage = …` + RLS `user_id`: `…_user_id_stage_key`; "any child left": `children_user_id_slot_key`
                      prefix; lock: `regular_profiles_pkey`. The (created_at, slot) sort is ≤ 10 rows in memory — an index would be pure write cost.
**Integrity**         No FK points at either table: a delete cascades and orphans nothing. Cascades from regular_profiles unchanged. stage stays
                      ungranted for UPDATE (DR-5). `due_date` stays `date`, no zone; the −30..+300 window stays server-only (VAL-044).
**Blast radius**      As F2.2a + `journeys-repository.ts`/`-service.ts` (add gains the lock), `routes/journeys.ts`. `regular_names`/`friendships`
                      (F2.4a, unbuilt) reference only regular_profiles: untouched, FK checks not blocked. F2.3's view (children count, is_pregnant)
                      reflects a delete at once — intended. Lock needs regular_profiles' UPDATE grant, else 42501 → 500 (closed). Preview cleanup:
                      unaffected. Knowledge files (Authorization cells, slot, add-path → lock): DATA ARCHITECT, in each part's PR.
**Retention §13.4**   Hard delete: gone from the live database at commit (dead tuple vacuumed later); no column, row or log line records it (c11,
                      c20). Platform backups, if any, keep it for their window — a Privacy Policy item (§13.4 Tracker/Child Data, TBD, legal).
**Reversible?**       **Yes**, both. User deletions are irreversible by Afik's DR-1 A, already decided. Prod: the batched CI migration.

## pgTAP — new `54_journeys_write.sql` (53 is F2.3b's); as app_server via `tests.as_role` / `tests.dml_as`; every name tagged `[F2.2-b cN]`
b1 1. `journey_contexts_update_own` cmd `w`, TO authenticated only, both expressions reference `is_active_account` and `stage`; column
UPDATE exactly {due_date}; no table UPDATE. 2. A: own pregnant due_date set / set null → `OK:1`, stored; no WHERE → `OK:1`; own has_child
id → `OK:0`; B's id → `OK:0`, B unchanged; `set stage|user_id|created_at|id` → 42501. 3. insert pregnant `on conflict do nothing`: B
(planning) → `OK:0`, A (has one) → `OK:0`, a user with none → `OK:1`; naming `user_id` → 42501. 4. suspended/banned A: UPDATE `OK:0`,
INSERT 42501; active again → `OK:1`. anon, bare app_server → 42501. b2 5. both delete policies cmd `d`, TO authenticated only, USING
references `is_active_account`; table DELETE on exactly these two + recovery_answers. 6. A: own child, own journey by id → `OK:1`, gone;
B's by id or `user_id` → `OK:0`, B unchanged. 7. suspended/banned A: DELETE `OK:0`; anon, bare app_server → 42501. 8. A at 10 deletes slot
1, inserts slot 1 → `OK:1`. 9. `regular_profiles for no key update`: A → `OK:1`, suspended A → `OK:0`.
**Server db tests** (`tests/db/journeys.db.test.ts`, two connections, a barrier holds the first open, ≥ 20 rounds): c15 two POSTs → one
pregnant; c19 remove the last two concurrently, add while removing the last → has_child ⇔ ≥ 1 child; c17 order; F2.2a c6 green with the lock.
**Forced-failure seam (c19, c22, c23), no product code:** via `OWNER_DATABASE_URL` (app_owner, as `privacy-backfill.db.test.ts`) the
test creates `tests.fail_step()` (plpgsql, SECURITY INVOKER, `search_path = ''`, `raise exception 'forced step failure'`) and per step
one `before insert|delete … for each row when (<row>.user_id = '<victim>' and <row>.stage = …)` trigger, dropped in `finally`; the
victim-scoped WHEN spares parallel tests. Steps: R = delete child · delete has_child; B = delete pregnant · insert has_child · insert
child; P = delete planning · insert pregnant. Each failing in turn → 5xx, owner-observed rows as before. Required in CI. BEFORE row
triggers fire on ON CONFLICT inserts too; EXECUTE is not checked at fire time (if the CI image disagrees, grant it for the test only).
**Amend (fail by design):** `10_identity_structure.sql:274` allow the three policies; `:349` DELETE exception + the two tables (b2); `:350`
column-UPDATE exception + journey_contexts (b1). `20_registration_structure.sql:190-198` 12 → 13 (b1) → 15 (b2) policies; `:273` stays 16
(due_date already has its INSERT ACL); `:282-287`, `:331` + due_date (b1); `:317-320` + DELETE on the two (b2). `51_children_write.sql:63-64,
124` (b1), `:65-71, 138-141` (b2). `22_registration_owner_only.sql` b1: `:78` → file 54, `:81` → `OK:0`, `:85` → `OK:1`, `:101` → `OK:0`;
b2: `:82-83, 88-89` → file 54, `:102-103, 106` → `OK:0`; `:126` unchanged-state stays true; anon `:145-147` stay 42501.

**Approved (F2.2b) — ORCHESTRATOR, 17.10.2026.** b1 and b2 as shaped. The `FOR NO KEY UPDATE` lock on the caller's own
`regular_profiles` row, first in every route that inserts or deletes a child or journey (F2.2a's add path included, in b2 —
an internal change, noted in b2's notes.md), is the has_child mechanism. `slot` now means one of ten seats; order is
`created_at, slot` — confirmed. The has_child rule stays in the server (DR-4 is not in the SRS). The 100-line cap is per part.
pgTAP 54. The test seam via `OWNER_DATABASE_URL` is accepted (test-only, dropped after). FYI to Afik at I2 close: hard-deleted
rows can survive in platform backups for their retention period (Privacy Policy, §13.4). b1 is built after F2.3a merges.
