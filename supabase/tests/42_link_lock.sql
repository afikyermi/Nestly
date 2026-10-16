-- pgTAP, run by pg_prove as app_server (CI `db` job, F2.0 part a fix round): schema.md Gate 2 amendment A4, the per-user lock.
-- The mechanism named there: pg_try_advisory_xact_lock(hashtextextended('nestly.password_state:' || user id, 0)), built-in,
-- PUBLIC EXECUTE, so it must work under every runtime role including app_recovery, with no migration change.
-- The "a second holder gets false" half needs a second connection: it is asserted in apps/server/tests/db/password-lock.db.test.ts.
-- Here: it succeeds under each runtime role, is re-entrant in one transaction, and is per user.
-- Written without a database to run against in this shell: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F2.0-a c3 A4] session_user is app_server (this file must not run under another login)');

create function pg_temp.trylock(p_user text) returns text language sql as $f$
  select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nestly.password_state:' || p_user, 0))::text
$f$;

select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nestly.password_state:' || 'a0000000-0000-4000-8000-0000000000a1', 0))::text $q$),
  'true', '[F2.0-a c3 A4] as authenticated the per-user try-lock succeeds (the clear, c7, c10, the answers store run as this role)');
select is(tests.as_role('app_recovery', '', $q$ select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nestly.password_state:' || 'b0000000-0000-4000-8000-0000000000b2', 0))::text $q$),
  'true', '[F2.0-a c3 A4] as app_recovery the per-user try-lock succeeds (the F1.6 reset runs as this role)');
select is(tests.as_role('none', '', $q$ select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('nestly.password_state:' || 'c0000000-0000-4000-8000-0000000000c3', 0))::text $q$),
  'true', '[F2.0-a c3 A4] as app_server itself it succeeds too');

select is(pg_temp.trylock('d0000000-0000-4000-8000-0000000000d4'), 'true', '[F2.0-a c3 A4] a user''s lock is taken');
select is(pg_temp.trylock('d0000000-0000-4000-8000-0000000000d4'), 'true', '[F2.0-a c3 A4] the same transaction may take it again (a clear then a re-read in one transaction does not deadlock itself)');
select is(pg_temp.trylock('e0000000-0000-4000-8000-0000000000e5'), 'true', '[F2.0-a c3 A4] another user''s lock is independent');

select is(tests.as_role('anon', '', $q$ select pg_catalog.pg_try_advisory_xact_lock(1)::text $q$), 'true',
  '[F2.0-a c3 A4] the primitive needs no grant (PUBLIC EXECUTE): no migration change is needed for it');

select * from finish();

rollback;
