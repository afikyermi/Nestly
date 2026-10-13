-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part a).
-- Criterion 3 [F1.1-a c3]: on the clean database, built from bootstrap and migrations only, the structural RLS gate
-- reports nothing for the product schema. (Part a has no migration yet, so this holds trivially until part b adds the
-- schema; it then becomes the real gate. The fire-tests in 02_rls_gate_fires.sql show each check can say no.)
-- Written without a database to run against (no Docker or psql on the author's machine): CI is the first run.

begin;

select plan(5);

select is(session_user::text, 'app_server'::text, '[F1.1-a c2] session_user is app_server (repeated: this file must not run under another login)');

select is_empty(
  $$ select check_name, object from tests.rls_gate('nestly') $$,
  '[F1.1-a c3] tests.rls_gate(''nestly'') returns no rows on the clean database (RLS on, FORCE RLS on, a policy, owner app_owner, security_invoker views, approved definers with a search_path, no anon privilege)');

select is_empty(
  $$ select check_name, object from tests.rls_gate() $$,
  '[F1.1-a c3] tests.rls_gate() with its default schema returns no rows on the clean database');

select is_empty(
  $$ select check_name, object from tests.rls_gate('nestly') where check_name = 'relation_in_public' $$,
  '[F1.1-a c3] no table, view or sequence exists in public (platform r7)');

-- The gate must see the real schema. If nestly exists, it must be owned by app_owner (platform r1, r2).
select is(
  (select count(*) from pg_catalog.pg_namespace n
    where n.nspname = 'nestly' and n.nspowner is distinct from (select oid from pg_catalog.pg_roles where rolname = 'app_owner')),
  0::bigint,
  '[F1.1-a c3] the nestly schema, if it exists, is owned by app_owner');

select * from finish();

rollback;
