-- E1 contract test, fallback A2 (.work/i3-rest-schema/pr-b-2010/schema.md "E1 for A2"): a postgres-owned pg_cron job whose command
-- begins `set role app_jobs;` really runs its statements as app_jobs. Failure in production is silent (held content never purged,
-- or purged as a BYPASSRLS role), so this looks at the recorded runs.
-- Run as postgres, after bootstrap step 3 and AFTER pgTAP 86 (the probes mention nestly and would break 86's "only nestly job"):
--   psql -X -q -v ON_ERROR_STOP=1 -f supabase/ci/cron-e1.sql
-- Three probes, each '5 seconds', polled <= 60 s in cron.job_run_details, always unscheduled, then the verdict names the failing probe:
--   nestly_e1_role    expect succeeded: after `set role app_jobs` session_user is postgres and current_user is app_jobs
--   nestly_e1_denied  expect failed, 'permission denied': app_jobs cannot read nestly.users (so the switch really happened)
--   nestly_e1_purge   expect succeeded: the production command itself works in the cron context

-- 1. schedule (committed, so the pg_cron worker sees them)
begin;
select cron.schedule('nestly_e1_role', '5 seconds',
  $c$set role app_jobs; do $d$ begin if current_user <> 'app_jobs' or session_user <> 'postgres' then raise exception 'E1 role %/%', session_user, current_user; end if; end $d$$c$);
select cron.schedule('nestly_e1_denied', '5 seconds', $c$set role app_jobs; select count(*) from nestly.users$c$);
select cron.schedule('nestly_e1_purge', '5 seconds', $c$set role app_jobs; select nestly.purge_held_content()$c$);
commit;

-- 2. poll each probe to a terminal status (a separate transaction: each statement sees what the worker has committed)
create temp table e1_result (probe text, status text, msg text);
do $$
declare
  p text;
  v_id bigint;
  v_status text;
  v_msg text;
  v_deadline timestamptz := clock_timestamp() + interval '60 seconds';
begin
  foreach p in array array['nestly_e1_role', 'nestly_e1_denied', 'nestly_e1_purge'] loop
    select jobid into v_id from cron.job where jobname = p;
    v_status := null;
    v_msg := null;
    loop
      select d.status, d.return_message into v_status, v_msg from cron.job_run_details d where d.jobid = v_id order by d.runid desc limit 1;
      exit when v_status in ('succeeded', 'failed') or clock_timestamp() > v_deadline;
      perform pg_sleep(1);
    end loop;
    insert into e1_result values (p, v_status, v_msg);
  end loop;
end
$$;

-- 3. always unschedule (jobid form: no error if a probe is already gone)
begin;
select cron.unschedule(jobid) from cron.job where jobname in ('nestly_e1_role', 'nestly_e1_denied', 'nestly_e1_purge') and username = 'postgres';
commit;

-- 4. verdict
do $$
declare
  r record;
begin
  for r in select * from e1_result order by probe loop
    raise notice 'E1 % -> % %', r.probe, coalesce(r.status, 'no run within 60 s'), coalesce(r.msg, '');
  end loop;
  if exists (select 1 from cron.job where jobname like 'nestly\_e1\_%') then
    raise exception 'E1: a probe job is still scheduled';
  end if;
  for r in select * from e1_result where probe in ('nestly_e1_role', 'nestly_e1_purge') and status is distinct from 'succeeded' loop
    raise exception 'E1 FAILED: probe % did not succeed (%): %', r.probe, coalesce(r.status, 'no run'), r.msg;
  end loop;
  if exists (select 1 from e1_result where probe = 'nestly_e1_denied' and (status is distinct from 'failed' or msg !~* 'permission denied')) then
    raise exception 'E1 FAILED: probe nestly_e1_denied must fail with permission denied (the statement must run as app_jobs, not postgres): %',
      (select coalesce(status, 'no run') || ' ' || coalesce(msg, '') from e1_result where probe = 'nestly_e1_denied');
  end if;
  raise notice 'E1 passed: the cron job runs as app_jobs after set role';
end
$$;
