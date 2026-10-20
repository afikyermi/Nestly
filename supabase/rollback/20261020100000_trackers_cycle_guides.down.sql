-- =====================================================================================================================
-- Down script for supabase/migrations/20261020100000_trackers_cycle_guides.sql (I6). Outside supabase/migrations on purpose:
-- the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the tracker, cycle and home server and web code first, then run this.
-- Safe:     only while tracker_events and cycle_entries are empty and status_guides holds nothing but the nine seed drafts. Otherwise
--           it refuses: rolling back would destroy health data of minors and women, or a published guide (a DECISION REQUEST: Afik).
--           FORCE RLS would hide rows from app_owner, so it is lifted inside this transaction for the check and put back by the drop.
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

alter table nestly.tracker_events no force row level security;
alter table nestly.cycle_entries no force row level security;
alter table nestly.status_guides no force row level security;

do $$
begin
  if exists (select 1 from nestly.tracker_events) or exists (select 1 from nestly.cycle_entries) then
    raise exception 'tracker_events or cycle_entries holds a row: rolling back would delete health data. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
  if (select count(*) from nestly.status_guides) <> 9
     or exists (select 1 from nestly.status_guides where status <> 'draft' or source_checked_on is not null or published_at is not null) then
    raise exception 'status_guides holds more than the nine seed drafts: rolling back would delete a guide. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

drop table nestly.tracker_events;
drop table nestly.cycle_entries;
drop table nestly.status_guides;

delete from supabase_migrations.schema_migrations where version = '20261020100000';

commit;
