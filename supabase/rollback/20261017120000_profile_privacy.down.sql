-- =====================================================================================================================
-- Down script for supabase/migrations/20261017120000_profile_privacy.sql (I2 F2.3a; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the F2.3a server code first (GET and PUT /api/privacy read and write the three columns), then run this.
-- Safe:     only while every row holds the defaults (open, true, true). Dropping a parent's choice and re-applying the
--           migration would silently reopen a Restricted profile, so the script refuses then; after the first real choice the
--           way back is a forward fix (data-model rule 7). FORCE RLS would hide every row from app_owner, so it is lifted
--           inside this transaction first and the check is real, then put back.
-- Restores: the F2.1 comment of regular_profiles_update_own; revokes the three column UPDATEs; drops the three columns (and
--           with them the CHECK); deletes the migration's history row. Profiles, journeys and children are untouched.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the profile privacy down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.regular_profiles no force row level security;

do $$
begin
  if exists (select 1 from nestly.regular_profiles
             where profile_visibility <> 'open' or not is_empty_journey_sentence_shown or not is_child_birthday_shared) then
    raise exception 'a nestly.regular_profiles row holds a privacy setting other than the default: rolling back would drop a parent''s choice, and a re-apply would reset it to the defaults (reopen a Restricted profile, re-share a withheld birthday). Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

alter table nestly.regular_profiles force row level security;

comment on policy regular_profiles_update_own on nestly.regular_profiles is
  'An active account edits its own full_name and gender (FR-PROFILE-001, F2.1). Other columns: no grant.';

revoke update (profile_visibility, is_empty_journey_sentence_shown, is_child_birthday_shared)
  on table nestly.regular_profiles from authenticated;

alter table nestly.regular_profiles
  drop column profile_visibility,
  drop column is_empty_journey_sentence_shown,
  drop column is_child_birthday_shared;

delete from supabase_migrations.schema_migrations where version = '20261017120000';

commit;
