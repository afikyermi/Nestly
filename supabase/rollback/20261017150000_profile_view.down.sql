-- =====================================================================================================================
-- Down script for supabase/migrations/20261017150000_profile_view.sql (I2 F2.3b; schema.md F2.3b "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Order:    nothing in the server or web calls profile_view yet (DR-1 A), so no code reverts with it.
-- Safe:     touches no row and no table definition; F2.3a's settings stay. Drops profile_view(text), the four
--           *_select_profile_view policies, profile_view_target() and child_age_months(date, timestamptz), deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the profile view down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop function nestly.profile_view(text);

drop policy users_select_profile_view on nestly.users;

drop policy regular_profiles_select_profile_view on nestly.regular_profiles;

drop policy children_select_profile_view on nestly.children;

drop policy journey_contexts_select_profile_view on nestly.journey_contexts;

drop function nestly.profile_view_target();

drop function nestly.child_age_months(date, timestamptz);

delete from supabase_migrations.schema_migrations where version = '20261017150000';

commit;
