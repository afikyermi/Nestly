-- =====================================================================================================================
-- Bootstrap step 3 — the purge schedule: pg_cron runs nestly.purge_held_content() daily as app_jobs.
--
-- Source: .work/i3-rest-schema/schema.md "PR-B — purge schedule"; .work/report/spec.md (F3.7, Schema needs 1, c16);
--         .claude/knowledge/data-model.md F3.0b (the purge function and its TO app_jobs policies, rule 6).
--
-- What it does, in one transaction:
--   1. creates the pg_cron extension (schema pg_catalog) if absent;
--   2. grants app_jobs USAGE on schema cron;
--   3. gives postgres a temporary SET membership in app_jobs (postgres holds only ADMIN on it, step 1), so it can
--      `set local role app_jobs`;
--   4. as app_jobs, schedules 'nestly_purge_held_content' at 03:17 UTC daily: `select nestly.purge_held_content()`.
--      The job's username is app_jobs, so the purge runs under the TO app_jobs policies, never as owner or superuser;
--   5. resets the role and revokes the membership again, leaving step 1's check exact.
--
-- Run as:   postgres, in the Supabase SQL Editor, once per environment, after the migration that creates
--           nestly.purge_held_content() (20261018200000_feed_interactions). nestly-prod: Afik only.
--           See supabase/bootstrap/README.md.
-- Re-run:   safe. cron.schedule with an existing job name updates that job in place (same name, schedule, command).
-- Atomic:   one transaction.
-- Verify afterwards with supabase/bootstrap/03-cron-check.sql. Undo with 03-cron-down.sql.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception '03-cron.sql must run as postgres (current_user is %)', current_user;
  end if;
  if to_regprocedure('nestly.purge_held_content()') is null then
    raise exception 'nestly.purge_held_content() does not exist: apply the migrations (20261018200000_feed_interactions) first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_jobs') then
    raise exception 'role app_jobs does not exist: run bootstrap step 1 first';
  end if;
end
$$;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to app_jobs;

-- Temporary: revoked below, in this same transaction.
grant app_jobs to postgres with inherit false, set true;

set local role app_jobs;
select cron.schedule('nestly_purge_held_content', '17 3 * * *', 'select nestly.purge_held_content()');
reset role;

revoke app_jobs from postgres;

commit;
