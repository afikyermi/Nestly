-- =====================================================================================================================
-- Bootstrap step 3 — undo. Run as postgres. One transaction; safe to run again (a second run changes nothing).
--
-- Unschedules the purge job (by job id: the name form raises when the job is absent), revokes the SET membership that
-- 03-cron.sql granted postgres (the ADMIN row by supabase_admin stays) and app_jobs' USAGE on schema cron (a no-op).
-- The pg_cron extension stays. After this, 01-roles-check.sql returns to its "before step 3" expectation.
-- Run this BEFORE the down script of the migration that creates nestly.purge_held_content()
-- (20261018200000_feed_interactions): that down drops the function the job calls.
-- =====================================================================================================================

begin;

do $$
declare
  v_id bigint;
begin
  if current_user <> 'postgres' then
    raise exception '03-cron-down.sql must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('cron.job') is not null then
    for v_id in select jobid from cron.job where jobname = 'nestly_purge_held_content' and username = 'postgres' loop
      perform cron.unschedule(v_id);
    end loop;
  end if;
end
$$;

revoke app_jobs from postgres;
revoke usage on schema cron from app_jobs;

commit;
