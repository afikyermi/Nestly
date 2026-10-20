-- =====================================================================================================================
-- Bootstrap step 3 — verification. READ ONLY: one SELECT, changes nothing. Run as postgres after 03-cron.sql.
--
-- EXPECTED RESULT (one row, ok = true):
--   extension t · jobs 1 · schedule '17 3 * * *' · command 'set role app_jobs; select nestly.purge_held_content()'
--   username postgres · active t · database <current> · nestly_jobs 1 · app_jobs_jobs 0 · no_cron_usage t · set_membership t
--
--   nestly_jobs     jobs whose command mentions nestly (case-insensitive): exactly the one job above
--   app_jobs_jobs   jobs owned by app_jobs: none
--   no_cron_usage   app_jobs has no USAGE on schema cron
--   set_membership  postgres holds app_jobs exactly once: SET true, INHERIT false, ADMIN false, grantor postgres
--   (app_jobs itself: NOLOGIN, not superuser, not BYPASSRLS — folded into ok.)
-- =====================================================================================================================

with j as (
  select * from cron.job where jobname = 'nestly_purge_held_content'
),
mem as (
  select m.* from pg_auth_members m
  where m.roleid = 'app_jobs'::regrole and m.member = 'postgres'::regrole and m.set_option
),
r as (
  select
    exists (select 1 from pg_extension where extname = 'pg_cron')                                 as extension,
    (select count(*) from j)                                                                      as jobs,
    (select schedule from j)                                                                      as schedule,
    (select command from j)                                                                       as command,
    (select username from j)                                                                      as username,
    (select active from j)                                                                        as active,
    (select database from j)                                                                      as database,
    (select count(*) from cron.job where command ~* 'nestly')                                     as nestly_jobs,
    (select count(*) from cron.job where username = 'app_jobs')                                   as app_jobs_jobs,
    not has_schema_privilege('app_jobs', 'cron', 'USAGE')                                         as no_cron_usage,
    (select count(*) = 1 from mem
     where not inherit_option and not admin_option and pg_get_userbyid(grantor) = 'postgres')
    and (select count(*) = 1 from pg_auth_members
         where roleid = 'app_jobs'::regrole and member = 'postgres'::regrole and set_option)      as set_membership,
    (select not rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname = 'app_jobs') as role_ok
)
select
  (r.extension and r.jobs = 1 and r.schedule = '17 3 * * *'
   and r.command = 'set role app_jobs; select nestly.purge_held_content()'
   and r.username = 'postgres' and r.active and r.database = current_database()
   and r.nestly_jobs = 1 and r.app_jobs_jobs = 0
   and r.no_cron_usage and r.set_membership and r.role_ok)                                        as ok,
  r.extension, r.jobs, r.schedule, r.command, r.username, r.active, r.database,
  r.nestly_jobs, r.app_jobs_jobs, r.no_cron_usage, r.set_membership
from r;
