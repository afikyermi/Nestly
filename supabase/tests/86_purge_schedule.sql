-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 PR-B: the daily purge schedule, F3.7 c16).
-- Source of expected values: .work/i3-rest-schema/pr-b-2010/schema.md "pGTAP 86" (fallback A2), not the SQL text.
-- (Numbered 86 because 85_professional_posting.sql already exists; the schema.md name for this check is "85".)
-- Must run BEFORE supabase/ci/cron-e1.sql: its probe jobs mention nestly and would break the "only nestly job" assertions.
-- Accepted gap: a job calling a non-nestly function that reaches nestly indirectly cannot be detected from cron.job.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.7 fixture] session_user is app_server (this file must not run under another login)');

-- 1. the one job, exactly
select is((select count(*) from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 1::bigint, '[F3.7-b c16] exactly one job is named nestly_purge_held_content');
select is((select schedule from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), '17 3 * * *', '[F3.7-b c16] it runs daily at 03:17 UTC');
select is((select command from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 'set role app_jobs; select nestly.purge_held_content()', '[F3.7-b c16] its command switches to app_jobs, then runs the purge');
select is((select username from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 'postgres', '[F3.7-b c16] the job is postgres-owned (A2: app_jobs cannot log in)');
select is((select active from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), true, '[F3.7-b c16] it is active');
select is((select database from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 'postgres', '[F3.7-b c16] it targets the postgres database');

-- 2. no other job touches nestly, under any owner
select is((select count(*) from tests.fx_cron_jobs() where command ~* 'nestly'), 1::bigint, '[F3.7-b c16] exactly one cron job mentions nestly at all');
select is((select count(*) from tests.fx_cron_jobs()
           where command ~* 'nestly'
             and not (jobname = 'nestly_purge_held_content' and username = 'postgres' and command = 'set role app_jobs; select nestly.purge_held_content()')), 0::bigint,
  '[F3.7-b c16] any job that mentions nestly in any way other than the one allowed command fails');

-- 3. named, for a readable failure
select is((select count(*) from tests.fx_cron_jobs() where username = 'app_jobs'), 0::bigint, '[F3.7-b c16] no job has username app_jobs');
select is((select count(*) from tests.fx_cron_jobs() where username in ('app_owner', 'supabase_admin') and command ~* 'nestly'), 0::bigint, '[F3.7-b c16] no app_owner or supabase_admin job touches nestly');

-- 4. memberships
select is((select string_agg(format('s=%s i=%s a=%s by %s', am.set_option, am.inherit_option, am.admin_option, g.rolname), ' | ' order by g.rolname)
           from pg_catalog.pg_auth_members am
           join pg_catalog.pg_roles r on r.oid = am.roleid and r.rolname = 'app_jobs'
           join pg_catalog.pg_roles m on m.oid = am.member and m.rolname = 'postgres'
           join pg_catalog.pg_roles g on g.oid = am.grantor),
  's=t i=f a=f by postgres | s=f i=f a=t by supabase_admin',
  '[F3.7-b c16] postgres holds app_jobs: SET only, granted by postgres (persistent), plus the ADMIN row by supabase_admin');
select is((select count(*) from pg_catalog.pg_auth_members am join pg_catalog.pg_roles m on m.oid = am.member and m.rolname = 'app_jobs'), 0::bigint, '[F3.7-b c16] app_jobs is a member of nothing');
select is(pg_catalog.pg_has_role('app_server', 'app_jobs', 'MEMBER'), false, '[F3.7-b c16] app_server is not a member of app_jobs (directly or through a chain)');
select is(pg_catalog.pg_has_role('app_server', 'postgres', 'MEMBER'), false, '[F3.7-b c16] app_server is not a member of postgres (directly or through a chain)');

-- 5. app_jobs has no cron rights and no bypass
select is(pg_catalog.has_schema_privilege('app_jobs', 'cron', 'USAGE'), false, '[F3.7-b c16] app_jobs has no USAGE on schema cron');
select is((select rolcanlogin or rolsuper or rolbypassrls from pg_catalog.pg_roles where rolname = 'app_jobs'), false, '[F3.7-b c16] app_jobs is NOLOGIN, not superuser, NOBYPASSRLS');

select * from finish();
rollback;
