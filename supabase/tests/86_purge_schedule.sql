-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 PR-B: the daily purge schedule, F3.7 c16).
-- Source of expected values: .work/i3-rest-schema/schema.md "85 purge schedule" and the bootstrap-step-3 paragraph, not the SQL text.
-- (Numbered 86 because 85_professional_posting.sql already exists; the schema.md name for this check is "85".)

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.7 fixture] session_user is app_server (this file must not run under another login)');

select is((select count(*) from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 1::bigint, '[F3.7 c16] exactly one job is named nestly_purge_held_content');
select is((select schedule from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), '17 3 * * *', '[F3.7 c16] it runs daily at 03:17 UTC');
select is((select command from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 'select nestly.purge_held_content()', '[F3.7 c16] it runs the purge function and nothing else');
select is((select username from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 'app_jobs', '[F3.7 c16] it runs as app_jobs');
select is((select active from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), true, '[F3.7 c16] it is active');
select is((select database from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content'), 'postgres', '[F3.7 c16] it targets the postgres database');

select is((select count(*) from tests.fx_cron_jobs() where command ilike '%nestly.%'), 1::bigint, '[F3.7 c16] exactly one cron job mentions nestly. at all (no duplicate under another name)');
select is((select count(*) from tests.fx_cron_jobs() where username in ('postgres', 'app_owner', 'supabase_admin') and command ilike '%nestly.%'), 0::bigint, '[F3.7 c16] no job owned by postgres, app_owner or supabase_admin touches the nestly schema');
select is((select count(*) from tests.fx_cron_jobs() where jobname = 'nestly_purge_held_content' and username in ('postgres', 'app_owner', 'supabase_admin')), 0::bigint, '[F3.7 c16] the purge job is not owned by a bypass role');

select * from finish();
