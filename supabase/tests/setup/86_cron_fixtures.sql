-- =====================================================================================================================
-- CI only -- fixtures for 86_purge_schedule.sql (I3 PR-B, F3.7 c16; .work/i3-rest-schema/schema.md "85 purge schedule").
-- Run as postgres by the `db` job in name order, AFTER bootstrap step 3 (03-cron.sql). Never a migration.
-- Definer owned by postgres (cron.job is unreadable by app_server), fixed search_path, executable by app_server only.
--
--   tests.fx_cron_jobs()   every row of cron.job, unfiltered: jobname, schedule, command, username, active, database
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the cron fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regnamespace('cron') is null then
    raise exception 'schema cron is missing: run bootstrap step 3 (03-cron.sql) before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_cron_jobs()
returns table (jobname text, schedule text, command text, username text, active boolean, database text)
language sql stable security definer set search_path = ''
as $$
  select j.jobname::text, j.schedule::text, j.command::text, j.username::text, j.active, j.database::text
  from cron.job j
$$;

revoke all on function tests.fx_cron_jobs() from public;
grant execute on function tests.fx_cron_jobs() to app_server;

commit;
