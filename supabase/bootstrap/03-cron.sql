-- =====================================================================================================================
-- Bootstrap step 3 — the purge schedule: pg_cron runs nestly.purge_held_content() daily, every statement as app_jobs.
--
-- Source: .work/i3-rest-schema/schema.md "PR-B"; .work/i3-rest-schema/pr-b-2010/schema.md (DATA ARCHITECT 20.10, fallback A2);
--         .work/report/spec.md (F3.7, Schema needs 1, c16); .claude/knowledge/data-model.md F3.0b and rule 6.
--
-- Why A2: pg_cron connects with libpq as the job's username, and app_jobs is NOLOGIN with no password (E1 failed). So the
--   job belongs to postgres and its command starts with `set role app_jobs;`: the purge itself runs as app_jobs
--   (NOBYPASSRLS, not owner), under the existing TO app_jobs policies. app_jobs gets no cron rights and no credential.
-- Why `set role`, not `set local role`: SET LOCAL outside a transaction block only warns and does nothing, and then the
--   purge would run as postgres (BYPASSRLS) silently. A session-level SET ROLE either takes effect or raises. pg_cron
--   opens a fresh connection or worker per run, so nothing leaks into a later session.
-- Why the membership stays: `set role app_jobs` needs postgres to hold app_jobs WITH SET TRUE. It is persistent
--   (INHERIT FALSE, no ADMIN of its own; the ADMIN row by supabase_admin from step 1 is unchanged).
--   01-roles-check.sql expects this row once step 3 has run.
--
-- Run as:   postgres, in the Supabase SQL Editor, once per environment, after the migration that creates
--           nestly.purge_held_content() (20261018200000_feed_interactions). nestly-prod: Afik only. The job is postgres's;
--           it switches to app_jobs before the purge. See supabase/bootstrap/README.md.
-- Re-run:   safe. cron.schedule with the same name and username updates the job in place; the grant and revoke are no-ops.
-- Atomic:   one transaction.
-- Verify afterwards with 03-cron-check.sql. Undo with 03-cron-down.sql (run it before F3.0b's down).
-- =====================================================================================================================

begin;

do $$
declare
  v_other text;
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
  if to_regclass('cron.job') is not null then
    select string_agg(username, ', ') into v_other
    from cron.job where jobname = 'nestly_purge_held_content' and username <> 'postgres';
    if v_other is not null then
      raise exception 'job nestly_purge_held_content exists with username % (the pre-revision shape): run the pre-revision 03-cron-down.sql (commit ce22488) first', v_other;
    end if;
  end if;
end
$$;

create extension if not exists pg_cron with schema pg_catalog;

grant app_jobs to postgres with inherit false, set true;

revoke usage on schema cron from app_jobs;

select cron.schedule('nestly_purge_held_content', '17 3 * * *', 'set role app_jobs; select nestly.purge_held_content()');

commit;
