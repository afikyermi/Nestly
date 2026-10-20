-- =====================================================================================================================
-- Down script for supabase/migrations/20261020100000_trackers_cycle_guides.sql (I6). Outside supabase/migrations on purpose:
-- the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the tracker, cycle and home server and web code first, then run this.
-- Destroys: every tracker event, cycle entry and status guide (drafts and published). Health data cannot be restored from this
--           script; it exists to roll back an unused migration.
-- Restores: nothing else was changed by the migration. Deletes only its own history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the trackers down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop table nestly.tracker_events;
drop table nestly.cycle_entries;
drop table nestly.status_guides;

delete from supabase_migrations.schema_migrations where version = '20261020100000';

commit;
