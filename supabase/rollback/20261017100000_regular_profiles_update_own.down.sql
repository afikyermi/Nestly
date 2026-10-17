-- =====================================================================================================================
-- Down script for supabase/migrations/20261017100000_regular_profiles_update_own.sql (I2 F2.1; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Order:    revert the F2.1 route with it: without the grant, PUT /api/profile fails closed (42501 -> 500, nothing leaks).
-- Safe:     touches no row; values already edited stay (data, not schema). Drops the policy, revokes the column grant and
--           deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the regular_profiles update down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop policy regular_profiles_update_own on nestly.regular_profiles;

revoke update (full_name, gender) on table nestly.regular_profiles from authenticated;

delete from supabase_migrations.schema_migrations where version = '20261017100000';

commit;
