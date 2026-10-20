-- =====================================================================================================================
-- Bootstrap step 3 — undo. Run as postgres. One transaction; safe to run again.
--
-- Unschedules the purge job the way 03-cron.sql scheduled it (as app_jobs) and revokes app_jobs' USAGE on schema cron.
-- The pg_cron extension stays. Run this BEFORE the down script of the migration that creates
-- nestly.purge_held_content() (20261018200000_feed_interactions): that down drops the function the job calls.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception '03-cron-down.sql must run as postgres (current_user is %)', current_user;
  end if;
end
$$;

grant app_jobs to postgres with inherit false, set true;

set local role app_jobs;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nestly_purge_held_content') then
    perform cron.unschedule('nestly_purge_held_content');
  end if;
end
$$;
reset role;

revoke app_jobs from postgres;
revoke usage on schema cron from app_jobs;

commit;
