-- =====================================================================================================================
-- Down script for supabase/migrations/20261021300000_recovery_lock_ladder.sql (I4, NFR-SEC-010).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Effect:   the ladder count goes (with its column grant); a lock already set in locked_until stays until it ends. The history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the recovery lock ladder down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.recovery_throttles drop constraint recovery_throttles_ladder_check;
alter table nestly.recovery_throttles drop column ladder_failures;

delete from supabase_migrations.schema_migrations where version = '20261021300000';

commit;
