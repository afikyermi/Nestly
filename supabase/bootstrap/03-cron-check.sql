-- =====================================================================================================================
-- Bootstrap step 3 — verification. READ ONLY: one SELECT, changes nothing. Run as postgres after 03-cron.sql.
--
-- EXPECTED RESULT (one row, ok = true):
--
--   ok | extension | jobs | schedule  | command                              | username | active | database | usage | membership_gone
--   t  | t         | 1    | 17 3 * * * | select nestly.purge_held_content()   | app_jobs | t      | <current> | t    | t
--
--   extension        pg_cron is installed
--   jobs             exactly one job named nestly_purge_held_content
--   usage            app_jobs has USAGE on schema cron
--   membership_gone  postgres holds no SET or INHERIT membership in app_jobs (step 1's check stays exact)
-- =====================================================================================================================

with j as (
  select * from cron.job where jobname = 'nestly_purge_held_content'
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
    has_schema_privilege('app_jobs', 'cron', 'USAGE')                                             as usage,
    not exists (
      select 1 from pg_auth_members m
      where m.roleid = 'app_jobs'::regrole and m.member = 'postgres'::regrole
        and (m.set_option or m.inherit_option))                                                   as membership_gone,
    (select not rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname = 'app_jobs') as role_ok
)
select
  (r.extension and r.jobs = 1 and r.schedule = '17 3 * * *' and r.command = 'select nestly.purge_held_content()'
   and r.username = 'app_jobs' and r.active and r.database = current_database()
   and r.usage and r.membership_gone and r.role_ok)                                               as ok,
  r.extension, r.jobs, r.schedule, r.command, r.username, r.active, r.database, r.usage, r.membership_gone
from r;
