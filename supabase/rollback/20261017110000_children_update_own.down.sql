-- =====================================================================================================================
-- Down script for supabase/migrations/20261017110000_children_update_own.sql (I2 F2.2a; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Order:    revert the F2.2a PUT route with it: without the grant, PUT /api/children/:id fails closed (42501 -> 500, nothing
--           leaks). GET /api/journeys and POST /api/children need no part of this migration.
-- Safe:     touches no row; values already edited stay (data, not schema). Drops the policy, revokes the column grant and
--           deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the children update down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop policy children_update_own on nestly.children;

revoke update (name, sex, birth_date) on table nestly.children from authenticated;

delete from supabase_migrations.schema_migrations where version = '20261017110000';

commit;
