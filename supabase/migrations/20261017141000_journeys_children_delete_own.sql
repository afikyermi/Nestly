-- =====================================================================================================================
-- Own child removal and journey end — I2 F2.2b2 (journeys-children).
--
-- Source: .work/journeys-children/schema.md, F2.2b "b2 up" (Gate 2 "Approved (F2.2b)", 17.10.2026); spec.md criteria 16-26
-- (Afik DR-1 A: hard delete after a confirmation step; DR-2r: no reason asked or stored). children and journey_contexts get their
-- first DELETE path: an active account removes its own child, ends its own pregnancy, and the server ends planning (planning ->
-- pregnant, DR-3 A) and has_child (the last child's removal, DR-4 A) in the same transaction. Nothing else changes:
--   grant   table DELETE on both to authenticated (DELETE names no column).
--   policy  children_delete_own, journey_contexts_delete_own: own row, behind nestly.is_active_account() (rule 15). No stage in the
--           journey policy: which route deletes which stage is targeting (`where ... stage =`), not permission.
--   comment slot is a seat now (a freed seat is reused; the order is created_at, then slot); the table comment says an ended stage
--           is deleted, not marked.
-- No column, type, CHECK, index, FK, function or data changes; no deleted_at, ended_at or reason. The approved SECURITY DEFINER
-- list is unchanged. Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017141000_journeys_children_delete_own.down.sql.
-- =====================================================================================================================

grant delete on table nestly.children, nestly.journey_contexts to authenticated;

create policy children_delete_own on nestly.children
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy journey_contexts_delete_own on nestly.journey_contexts
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));

comment on policy children_delete_own on nestly.children is
  'An active account removes its own child: hard delete (DR-1 A).';

comment on policy journey_contexts_delete_own on nestly.journey_contexts is
  'An active account ends its own journey: hard delete, no reason kept (DR-1 A, DR-2r).';

comment on column nestly.children.slot is
  'One of the parent''s ten seats, 1 to 10 (VAL-040); with children_user_id_slot_key it holds the limit. A freed seat is reused by the next add. Not the display order (created_at, then slot); not data about the child.';

comment on table nestly.journey_contexts is
  'SRS JourneyContext (§13, VAL-039): one row per stage the parent is in, ticked at registration or added later by the owner (F2.2b); an ended stage is deleted, not marked (DR-1 A). Deleted with the profile.';
