-- =====================================================================================================================
-- Own profile edit — I2 F2.1 (profile-view-edit).
--
-- Source: .work/profile-view-edit/schema.md (Gate 2 approved, 17.10.2026); spec.md criteria 5, 7, 9-11, 13.
-- regular_profiles gets its first UPDATE path: an active account edits its own full_name and gender (FR-PROFILE-001,
-- AC-015, UC-10). Nothing else changes:
--   grant   UPDATE (full_name, gender) to authenticated, per column. user_id, account_type and created_at are never granted,
--           so an UPDATE of them is 42501 by privilege (data-model rules 12-14); the policy's WITH CHECK is the second fence.
--   policy  regular_profiles_update_own: own row only, behind nestly.is_active_account() (rule 15), the same shape as
--           recovery_answers_update_own. No DELETE grant or policy (stays refused).
-- The existing CHECKs (regular_profiles_full_name_check VAL-001, regular_profiles_gender_check VAL-006) fire on UPDATE as on
-- INSERT. No column, type, CHECK, index, FK, function or data changes; the approved SECURITY DEFINER list is unchanged.
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017100000_regular_profiles_update_own.down.sql.
-- =====================================================================================================================

grant update (full_name, gender) on table nestly.regular_profiles to authenticated;

create policy regular_profiles_update_own on nestly.regular_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()))
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));

comment on policy regular_profiles_update_own on nestly.regular_profiles is
  'An active account edits its own full_name and gender (FR-PROFILE-001, F2.1). Other columns: no grant.';
