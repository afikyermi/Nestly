-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part a).
-- Criterion 2 [F1.1-a c2]: the suite runs as app_server before any behaviour test, never as postgres or app_owner.
-- File name order matters: this file sorts first. Later files assert it again, so they cannot be run under another
-- login by mistake.
-- Written without a database to run against (no Docker or psql on the author's machine): CI is the first run.

begin;

select plan(7);

select is(session_user::text, 'app_server'::text,
  '[F1.1-a c2] session_user is app_server (so the behaviour tests run as the role the server uses, NFR-SEC-002)');

select is(current_user::text, 'app_server'::text,
  '[F1.1-a c2] current_user is app_server before any role switch');

select isnt(session_user::text, 'postgres'::text,
  '[F1.1-a c2] the suite is not running as postgres');

select isnt(session_user::text, 'app_owner'::text,
  '[F1.1-a c2] the suite is not running as app_owner');

select is(current_setting('is_superuser'), 'off',
  '[F1.1-a c2] app_server is not a superuser');

select is((select rolbypassrls from pg_catalog.pg_roles where rolname = 'app_server'), false,
  '[F1.1-a c2] app_server cannot bypass RLS (platform r1, §13)');

select is(
  (select count(*) from pg_catalog.pg_auth_members m
     join pg_catalog.pg_roles r on r.oid = m.roleid
    where m.member = (select oid from pg_catalog.pg_roles where rolname = 'app_server')
      and r.rolname in ('app_owner', 'postgres', 'service_role', 'supabase_admin')),
  0::bigint,
  '[F1.1-a c2] app_server is not a member of a role that owns or bypasses (app_owner, postgres, service_role, supabase_admin)');

select * from finish();

rollback;
