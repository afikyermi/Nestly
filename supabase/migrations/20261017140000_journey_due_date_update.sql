-- =====================================================================================================================
-- Own pregnancy due-date edit — I2 F2.2b1 (journeys-children).
--
-- Source: .work/journeys-children/schema.md, F2.2b "b1 up" (Gate 2 "Approved (F2.2b)", 17.10.2026); spec.md criteria 14-15 (DR-5 A).
-- journey_contexts gets its first UPDATE path: an active account edits the due date of its own pregnancy (FR-PROFILE-002, VAL-044).
-- Nothing else changes:
--   grant   UPDATE (due_date) to authenticated, per column. id, user_id, stage and created_at are never granted, so an UPDATE of
--           them is 42501 by privilege (data-model rules 12-14; a stage changes only by add or end, DR-5 A).
--   policy  journey_contexts_update_own: own row, pregnant rows only, behind nestly.is_active_account() (rule 15). A planning or
--           has_child row is outside USING, so its UPDATE matches 0 rows (404 at the API), never 23514 from the due-date CHECK.
-- Adding a pregnancy (c15) uses the INSERT grant and policy of F1.4; journey_contexts_user_id_stage_key and
-- journey_contexts_user_id_planning_pregnant_key hold one pregnant row, never with planning, under concurrency. No DELETE grant or
-- policy (F2.2b2). The -30..+300 window stays server-side (VAL-044, the server's date). No column, type, CHECK, index, FK, function
-- or data changes; the approved SECURITY DEFINER list is unchanged.
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017140000_journey_due_date_update.down.sql.
-- =====================================================================================================================

grant update (due_date) on table nestly.journey_contexts to authenticated;

create policy journey_contexts_update_own on nestly.journey_contexts
  for update to authenticated
  using      (user_id = (select auth.uid()) and stage = 'pregnant' and (select nestly.is_active_account()))
  with check (user_id = (select auth.uid()) and stage = 'pregnant' and (select nestly.is_active_account()));

comment on policy journey_contexts_update_own on nestly.journey_contexts is
  'An active account edits the due date of its own pregnancy only (FR-PROFILE-002, VAL-044, F2.2b, DR-5 A). stage, user_id, created_at: no grant.';

comment on table nestly.journey_contexts is
  'SRS JourneyContext (§13, VAL-039): one row per stage the parent is in, ticked at registration or added later by the owner (F2.2b). Part of the parent''s account: deleted with the profile.';
