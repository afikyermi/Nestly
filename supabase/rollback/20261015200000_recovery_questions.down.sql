-- =====================================================================================================================
-- Down script for supabase/migrations/20261015200000_recovery_questions.sql (I1 F1.6; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the F1.6 server code first, then run this script. Afterwards postgres runs
--             revoke app_recovery from app_server; drop role app_recovery;
--           and the bootstrap edit is reverted (on nestly-prod: Afik). Down-script order for the identity schema:
--           this one, then F1.4 (20261014200000), then F1.1 (20261014100000), which fails while these tables exist.
-- Safe:     only while recovery_answers and recovery_events are empty: dropping either destroys personal data and the
--           audit, which is irreversible and Afik's decision. The script refuses otherwise. FORCE RLS would hide every
--           row from app_owner, so it lifts FORCE on those two tables inside this transaction first and the count is real.
--           recovery_throttles is operational state and goes with them.
-- Takes:    the three tables (and their policies and index), the three helpers, USAGE on nestly for app_recovery; deletes
--           the migration's history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the recovery questions down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.recovery_answers no force row level security;
alter table nestly.recovery_events  no force row level security;

do $$
begin
  if exists (select 1 from nestly.recovery_answers) or exists (select 1 from nestly.recovery_events) then
    raise exception 'nestly.recovery_answers or nestly.recovery_events holds rows: rolling back would destroy recovery answers and the recovery audit. Stop: this is Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

drop policy recovery_events_insert_recovery     on nestly.recovery_events;
drop policy recovery_throttles_update_recovery  on nestly.recovery_throttles;
drop policy recovery_throttles_insert_recovery  on nestly.recovery_throttles;
drop policy recovery_throttles_select_recovery  on nestly.recovery_throttles;
drop policy recovery_answers_release_recovery   on nestly.recovery_answers;
drop policy recovery_answers_select_recovery    on nestly.recovery_answers;
drop policy recovery_answers_update_own         on nestly.recovery_answers;
drop policy recovery_answers_insert_own         on nestly.recovery_answers;
drop policy recovery_answers_select_own         on nestly.recovery_answers;

drop index nestly.recovery_events_user_id_idx;

drop table nestly.recovery_events;
drop table nestly.recovery_throttles;
drop table nestly.recovery_answers;

drop function nestly.recovery_claimed_at();
drop function nestly.recovery_ip();
drop function nestly.recovery_handle();

revoke usage on schema nestly from app_recovery;

delete from supabase_migrations.schema_migrations where version = '20261015200000';

commit;
