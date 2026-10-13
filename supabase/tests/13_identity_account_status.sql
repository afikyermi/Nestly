-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part b).
-- Criterion 15 (exit criterion: a suspended or banned account reads nothing, from the next statement, with the same
-- claims; reads again once active), 16 (status comes from the table) and 18 (is_active_account() answers only for the
-- caller). [02-system-overview.md:59 · FR-MOD-002 · BR-024 · platform r15, r14, r16 · layer 13]
--
-- The status is flipped with tests.set_status() (supabase/tests/setup/10_identity_fixtures.sql), which runs as postgres.
-- Every flip is rolled back with the transaction. "The same claims" is literal: the claims text for A is built once
-- below and passed unchanged before and after each flip; no new token is minted.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.1-b c15] session_user is app_server (this file must not run under another login)');

create temp table zz_claims as
  select tests.claims(tests.fx_id('a')) as a_claims, tests.claims(tests.fx_id('b')) as b_claims;

-- =====================================================================================================================
-- Criterion 15 — suspended, then banned, then active again, for the same account and the same claims.
-- =====================================================================================================================
select is(tests.fx_user(tests.fx_id('a')), 'regular/active', '[F1.1-b c15] A starts active');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.users'), '1',
  '[F1.1-b c15 FR-MOD-002] active A reads 1 User row');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.regular_profiles'), '1',
  '[F1.1-b c15 FR-MOD-002] active A reads 1 RegularProfile row');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select nestly.is_active_account()::text'), 'true',
  '[F1.1-b c15 platform r15] is_active_account() is true for active A');

select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F1.1-b c15] A is suspended (fixture)');
select is(tests.fx_user(tests.fx_id('a')), 'regular/suspended', '[F1.1-b c15] the User row still exists and now says suspended (so 0 below is the policy)');
select isnt(tests.fx_profile(tests.fx_id('a')), null, '[F1.1-b c15] the RegularProfile row still exists');

select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.users'), '0',
  '[F1.1-b c15 BR-024] suspended A, same claims, next statement: SELECT on User returns 0 rows, A''s own row included');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.regular_profiles'), '0',
  '[F1.1-b c15 BR-024] suspended A, same claims, next statement: SELECT on RegularProfile returns 0 rows');
select is(tests.as_role('authenticated', (select a_claims from zz_claims),
    $q$ select count(*)::text from nestly.users where id = 'a0000000-0000-4000-8000-0000000000a1' $q$), '0',
  '[F1.1-b c15 BR-024] suspended A asking for its own row by id still gets 0 rows');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select nestly.is_active_account()::text'), 'false',
  '[F1.1-b c15 platform r15] is_active_account() is false for suspended A');

-- another account is not affected by A's suspension
select is(tests.as_role('authenticated', (select b_claims from zz_claims), 'select count(*)::text from nestly.users'), '1',
  '[F1.1-b c15] B, active, still reads its own User row while A is suspended');
select is(tests.as_role('authenticated', (select b_claims from zz_claims), 'select count(*)::text from nestly.regular_profiles'), '1',
  '[F1.1-b c15] B, active, still reads its own RegularProfile row while A is suspended');
select is(tests.as_role('authenticated', (select b_claims from zz_claims), 'select nestly.is_active_account()::text'), 'true',
  '[F1.1-b c18] B''s answer from is_active_account() does not depend on A''s status');

-- suspended -> banned
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F1.1-b c15] A is banned (fixture)');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.users'), '0',
  '[F1.1-b c15 BR-024] banned A, same claims, next statement: SELECT on User returns 0 rows');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.regular_profiles'), '0',
  '[F1.1-b c15 BR-024] banned A, same claims, next statement: SELECT on RegularProfile returns 0 rows');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select nestly.is_active_account()::text'), 'false',
  '[F1.1-b c15 platform r15] is_active_account() is false for banned A');

-- banned -> active again
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.1-b c15] A is active again (fixture)');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.users'), '1',
  '[F1.1-b c15 BR-024] once active again, the same claims read A''s own User row again');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.regular_profiles'), '1',
  '[F1.1-b c15 BR-024] once active again, the same claims read A''s own RegularProfile row again');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select nestly.is_active_account()::text'), 'true',
  '[F1.1-b c15 platform r15] is_active_account() is true again once A is active');
select is(
  tests.as_role('authenticated', (select a_claims from zz_claims), $q$ select coalesce(string_agg(id::text, ','), '') from nestly.users $q$),
  tests.fx_id('a')::text,
  '[F1.1-b c15] and the row read after reactivation is A''s own');

-- active -> banned directly, and suspended -> active directly
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F1.1-b c15] A is banned straight from active (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '0', '[F1.1-b c15 BR-024] active -> banned: 0 User rows from the next statement');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F1.1-b c15] A is suspended from banned (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '0', '[F1.1-b c15 BR-024] banned -> suspended: still 0 User rows');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.1-b c15] A is active straight from suspended (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '1', '[F1.1-b c15 BR-024] suspended -> active: 1 User row again');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '1', '[F1.1-b c15 BR-024] suspended -> active: 1 RegularProfile row again');

-- accounts that are suspended or banned from the start
select is(tests.fx_user(tests.fx_id('s')), 'regular/suspended', '[F1.1-b c15] S is suspended in the fixture');
select is(tests.n_as(tests.fx_id('s'), 'nestly.users'), '0',
  '[F1.1-b c15 BR-024] suspended S: SELECT on User returns 0 rows, its own row included');
select is(tests.n_as(tests.fx_id('s'), 'nestly.regular_profiles'), '0',
  '[F1.1-b c15 BR-024] suspended S: SELECT on RegularProfile returns 0 rows, its own profile included');
select is(tests.fx_user(tests.fx_id('x')), 'regular/banned', '[F1.1-b c15] X is banned in the fixture');
select is(tests.n_as(tests.fx_id('x'), 'nestly.users'), '0',
  '[F1.1-b c15 BR-024] banned X: SELECT on User returns 0 rows, its own row included');
select is(tests.n_as(tests.fx_id('x'), 'nestly.regular_profiles'), '0',
  '[F1.1-b c15 BR-024] banned X: SELECT on RegularProfile returns 0 rows, its own profile included');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('s')),
    $q$ select ((select count(*) from nestly.users) + (select count(*) from nestly.regular_profiles))::text $q$),
  '0',
  '[F1.1-b c15 BR-024] suspended S reading both tables in one statement gets nothing from either');

-- the account becomes active the moment S is reactivated, and only S
select lives_ok($q$ select tests.set_status(tests.fx_id('s'), 'active') $q$, '[F1.1-b c15] S is reactivated (fixture)');
select is(tests.n_as(tests.fx_id('s'), 'nestly.users'), '1', '[F1.1-b c15 BR-024] reactivated S reads its own User row');
select is(tests.n_as(tests.fx_id('s'), 'nestly.regular_profiles'), '1', '[F1.1-b c15 BR-024] reactivated S reads its own RegularProfile row');
select is(tests.n_as(tests.fx_id('x'), 'nestly.users'), '0', '[F1.1-b c15 BR-024] X, still banned, still reads nothing');

-- =====================================================================================================================
-- Criterion 16 — a status the table does not allow cannot exist; claims cannot supply one. [platform r14]
-- =====================================================================================================================
select is(tests.dml_as('none', '', $q$ select tests.set_status(tests.fx_id('a'), 'deleted') $q$, false), 'ERR:23514',
  '[F1.1-b c16 FR-MOD-002] a status outside active / suspended / banned is refused by the table (check_violation)');
select is(tests.dml_as('none', '', $q$ select tests.set_status(tests.fx_id('a'), 'ACTIVE') $q$, false), 'ERR:23514',
  '[F1.1-b c16 FR-MOD-002] the status is case-sensitive: ACTIVE is not active');
select is(tests.dml_as('none', '', $q$ select tests.set_status(tests.fx_id('a'), '') $q$, false), 'ERR:23514',
  '[F1.1-b c16 FR-MOD-002] an empty status is refused');
select is(tests.dml_as('none', '', $q$ select tests.set_status(tests.fx_id('a'), null) $q$, false), 'ERR:23502',
  '[F1.1-b c16 FR-MOD-002] a NULL status is refused (not_null_violation): an account always has a status');

-- =====================================================================================================================
-- Criterion 18 — is_active_account() answers only for the caller. [layer 13 · platform r10, r16 · spec addendum 1]
-- =====================================================================================================================
-- Reset to a known state, then walk two accounts through every combination and check that each is told only about itself.
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.1-b c18] A active (fixture)');
select lives_ok($q$ select tests.set_status(tests.fx_id('b'), 'active') $q$, '[F1.1-b c18] B active (fixture)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.is_active_account()::text'), 'true',  '[F1.1-b c18] A active, B active: A is told true');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')), 'select nestly.is_active_account()::text'), 'true',  '[F1.1-b c18] A active, B active: B is told true');

select lives_ok($q$ select tests.set_status(tests.fx_id('b'), 'suspended') $q$, '[F1.1-b c18] B suspended (fixture)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.is_active_account()::text'), 'true',  '[F1.1-b c18] B suspended: A (active) is still told true, nothing of B leaks into A''s answer');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')), 'select nestly.is_active_account()::text'), 'false', '[F1.1-b c18] B suspended: B is told false');

select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F1.1-b c18] A banned (fixture)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.is_active_account()::text'), 'false', '[F1.1-b c18] A banned, B suspended: A is told false');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')), 'select nestly.is_active_account()::text'), 'false', '[F1.1-b c18] A banned, B suspended: B is told false');

select lives_ok($q$ select tests.set_status(tests.fx_id('b'), 'active') $q$, '[F1.1-b c18] B active again (fixture)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.is_active_account()::text'), 'false', '[F1.1-b c18] B active, A banned: A is still told false (B''s status does not rescue A)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')), 'select nestly.is_active_account()::text'), 'true',  '[F1.1-b c18] B active, A banned: B is told true');

-- the fixed accounts
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('p')), 'select nestly.is_active_account()::text'), 'true',
  '[F1.1-b c18] an active professional account is told true');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('x')), 'select nestly.is_active_account()::text'), 'false',
  '[F1.1-b c18] banned X is told false');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('c')), 'select nestly.is_active_account()::text'), 'false',
  '[F1.1-b c18 platform r15] an identity with no User row is told false');

-- it cannot be asked about anyone else: no overload that takes an identifier, and passing one is an error
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select nestly.is_active_account('b0000000-0000-4000-8000-0000000000b2'::uuid)::text $q$),
  'ERR:42883',
  '[F1.1-b c18 layer 13] is_active_account(<another account''s id>) does not exist: the function cannot be pointed at someone else');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select nestly.is_active_account('b0000000-0000-4000-8000-0000000000b2')::text $q$),
  'ERR:42883',
  '[F1.1-b c18 layer 13] is_active_account(<text>) does not exist either');

-- and nothing else a signed-in user can run in schema nestly names another account
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select count(*)::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'nestly' and has_function_privilege('authenticated', p.oid, 'EXECUTE') and p.pronargs > 0 $q$),
  '0',
  '[F1.1-b c18 layer 13] seen from authenticated: no function in schema nestly that it can execute takes an argument');

select * from finish();

rollback;
