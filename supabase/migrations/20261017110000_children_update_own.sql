-- =====================================================================================================================
-- Own child edit — I2 F2.2a (journeys-children).
--
-- Source: .work/journeys-children/schema.md (Gate 2 approved, 17.10.2026); spec.md criteria 8-11 (DR-5 A).
-- children gets its first UPDATE path: an active account edits its own child's name, sex and birth date (FR-PROFILE-002).
-- Nothing else changes:
--   grant   UPDATE (name, sex, birth_date) to authenticated, per column. id, user_id, slot and created_at are never granted,
--           so an UPDATE of them is 42501 by privilege (data-model rules 12-14); the policy's WITH CHECK is the second fence.
--   policy  children_update_own: own row only, behind nestly.is_active_account() (rule 15), the same shape as
--           regular_profiles_update_own. No DELETE grant or policy on children or journey_contexts (DR-1 reserved).
-- journey_contexts is unchanged: the has_child INSERT of the first child (c7) uses the grant and policy of F1.4. The limit of
-- ten children needs nothing new: children_user_id_slot_key and children_slot_check (1-10) hold it under concurrency.
-- The existing CHECKs (name 1-60 after btrim, sex enum, birth_date >= 1900-01-01) fire on UPDATE as on INSERT. No column, type,
-- CHECK, index, FK, function or data changes; the approved SECURITY DEFINER list is unchanged.
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017110000_children_update_own.down.sql.
-- =====================================================================================================================

grant update (name, sex, birth_date) on table nestly.children to authenticated;

create policy children_update_own on nestly.children
  for update to authenticated
  using      (user_id = (select auth.uid()) and (select nestly.is_active_account()))
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

comment on policy children_update_own on nestly.children is
  'An active account edits its own child''s name, sex and birth date (FR-PROFILE-002, F2.2a, DR-5 A). slot, user_id, created_at: no grant.';
