-- E1 contract test (I3 PR-B, .work/i3-rest-schema/schema.md "E1"): a pg_cron job whose username is the NOLOGIN, passwordless
-- app_jobs actually RUNS. Failure is silent in production (held content never purged), so this looks for a `succeeded` run.
-- Run as postgres, after bootstrap step 3, outside pgTAP:  psql -X -q -v ON_ERROR_STOP=1 -f supabase/ci/cron-e1.sql
-- Schedules a throwaway job 'nestly_e1_probe' (5 seconds, select 1) as app_jobs, polls cron.job_run_details for at most 60 s,
-- always unschedules it, then fails if no run succeeded. Leaves the SET membership as it found it (revoked).

-- 1. schedule as app_jobs (committed, so the pg_cron worker sees it)
begin;
grant app_jobs to postgres with inherit false, set true;
set local role app_jobs;
select cron.schedule('nestly_e1_probe', '5 seconds', 'select 1');
reset role;
revoke app_jobs from postgres;
commit;

-- 2. poll (a separate transaction: each statement sees what the worker has committed)
create temp table e1_result (ok boolean, detail text);
do $$
declare
  v_id bigint;
  v_status text;
  v_msg text;
  v_deadline timestamptz := clock_timestamp() + interval '60 seconds';
begin
  select jobid into v_id from cron.job where jobname = 'nestly_e1_probe';
  if v_id is null then
    insert into e1_result values (false, 'the probe job was not created');
    return;
  end if;
  loop
    select status, return_message into v_status, v_msg from cron.job_run_details where jobid = v_id order by runid desc limit 1;
    exit when v_status in ('succeeded', 'failed') or clock_timestamp() > v_deadline;
    perform pg_sleep(1);
  end loop;
  insert into e1_result values (v_status = 'succeeded', coalesce('last status ' || v_status || ': ' || v_msg, 'no run recorded within 60 s'));
end
$$;

-- 3. always unschedule, as app_jobs
begin;
grant app_jobs to postgres with inherit false, set true;
set local role app_jobs;
select cron.unschedule('nestly_e1_probe');
reset role;
revoke app_jobs from postgres;
commit;

-- 4. verdict
do $$
declare r e1_result;
begin
  select * into r from e1_result;
  if r.ok is distinct from true then
    raise exception 'E1 FAILED: a pg_cron job as app_jobs did not succeed (%): fallback A2 applies', r.detail;
  end if;
  if exists (select 1 from cron.job where jobname = 'nestly_e1_probe') then
    raise exception 'E1: the probe job is still scheduled';
  end if;
  raise notice 'E1 passed: a pg_cron job as app_jobs ran and succeeded';
end
$$;
