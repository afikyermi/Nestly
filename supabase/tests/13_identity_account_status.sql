-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part b).
-- Criterion 15 (exit criterion: a suspended or banned account reads nothing but its own `users` row (F1.5 DR-1 A), from the next statement, with the same
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
select is(tests.fx_user(tests.fx_id('a')), 'regular/suspended', '[F1.1-b c15] the User row still exists and now says suspended (so what is read below is the policy)');
select isnt(tests.fx_profile(tests.fx_id('a')), null, '[F1.1-b c15] the RegularProfile row still exists');

select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.users'), '1',
  '[F1.5-a c1 BR-024] suspended A, same claims, next statement: SELECT on User returns only its own row');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select coalesce(string_agg(id::text || ''/'' || status, '',''), '''') from nestly.users'),
  tests.fx_id('a')::text || '/suspended',
  '[F1.5-a c1 BR-024] suspended A reads its own id with its true status, suspended');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.regular_profiles'), '0',
  '[F1.1-b c15 BR-024] suspended A, same claims, next statement: SELECT on RegularProfile returns 0 rows');
select is(tests.as_role('authenticated', (select a_claims from zz_claims),
    $q$ select count(*)::text from nestly.users where id = 'a0000000-0000-4000-8000-0000000000a1' $q$), '1',
  '[F1.5-a c1 BR-024] suspended A asking for its own row by id gets that row');
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
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select count(*)::text from nestly.users'), '1',
  '[F1.5-a c1 BR-024] banned A, same claims, next statement: SELECT on User returns only its own row');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select coalesce(string_agg(id::text || ''/'' || status, '',''), '''') from nestly.users'),
  tests.fx_id('a')::text || '/banned',
  '[F1.5-a c1 BR-024] banned A reads its own id with its true status, banned');
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
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '1', '[F1.5-a c1 BR-024] active -> banned: only its own User row from the next statement');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F1.1-b c15] A is suspended from banned (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '1', '[F1.5-a c1 BR-024] banned -> suspended: still only its own User row');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.1-b c15] A is active straight from suspended (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '1', '[F1.1-b c15 BR-024] suspended -> active: 1 User row again');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '1', '[F1.1-b c15 BR-024] suspended -> active: 1 RegularProfile row again');

-- accounts that are suspended or banned from the start
select is(tests.fx_user(tests.fx_id('s')), 'regular/suspended', '[F1.1-b c15] S is suspended in the fixture');
select is(tests.n_as(tests.fx_id('s'), 'nestly.users'), '1',
  '[F1.5-a c1 BR-024] suspended S: SELECT on User returns only its own row');
select is(tests.n_as(tests.fx_id('s'), 'nestly.regular_profiles'), '0',
  '[F1.1-b c15 BR-024] suspended S: SELECT on RegularProfile returns 0 rows, its own profile included');
select is(tests.fx_user(tests.fx_id('x')), 'regular/banned', '[F1.1-b c15] X is banned in the fixture');
select is(tests.n_as(tests.fx_id('x'), 'nestly.users'), '1',
  '[F1.5-a c1 BR-024] banned X: SELECT on User returns only its own row');
select is(tests.n_as(tests.fx_id('x'), 'nestly.regular_profiles'), '0',
  '[F1.1-b c15 BR-024] banned X: SELECT on RegularProfile returns 0 rows, its own profile included');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('s')),
    $q$ select ((select count(*) from nestly.users) + (select count(*) from nestly.regular_profiles))::text $q$),
  '1',
  '[F1.5-a c1 BR-024] suspended S reading both tables in one statement gets only its own users row, nothing from regular_profiles');

-- the account becomes active the moment S is reactivated, and only S
select lives_ok($q$ select tests.set_status(tests.fx_id('s'), 'active') $q$, '[F1.1-b c15] S is reactivated (fixture)');
select is(tests.n_as(tests.fx_id('s'), 'nestly.users'), '1', '[F1.1-b c15 BR-024] reactivated S reads its own User row');
select is(tests.n_as(tests.fx_id('s'), 'nestly.regular_profiles'), '1', '[F1.1-b c15 BR-024] reactivated S reads its own RegularProfile row');
select is(tests.n_as(tests.fx_id('x'), 'nestly.users'), '1', '[F1.5-a c1 BR-024] X, still banned, reads its own User row and nothing else');
select is(tests.n_as(tests.fx_id('x'), 'nestly.regular_profiles'), '0', '[F1.5-a c1 BR-024] X, still banned, reads no RegularProfile row');

-- =====================================================================================================================
-- F1.5-a criterion 1 — a stopped account reads its own users row and nothing else. [DR-1 A · BR-024 · platform r13, r15]
-- A has rows in the three registration tables (20_registration_fixtures.sql), so a zero below is not vacuous.
-- =====================================================================================================================
select ok(tests.fx_counts(tests.fx_id('a')) ~ '^1/1/[1-9][0-9]*/[1-9][0-9]*/[1-9][0-9]*$',
  '[F1.5-a c1] fixture: A has a users row, a profile, journeys, children and a consent (zero below is not vacuous)');

select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select coalesce(string_agg(id::text || ''/'' || status, '',''), '''') from nestly.users'),
  tests.fx_id('a')::text || '/active', '[F1.5-a c1] active A reads its own users row with status active');

select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F1.5-a c1] A is suspended (fixture)');
select is(tests.n_as(tests.fx_id('b'), $r$nestly.users where id = 'a0000000-0000-4000-8000-0000000000a1'$r$), '0',
  '[F1.5-a c1 NFR-SEC-002] B reads 0 rows of suspended A');
select is(tests.n_as(tests.fx_id('a'), 'nestly.journey_contexts'), '0', '[F1.5-a c1 platform r15] suspended A reads 0 journey_contexts rows');
select is(tests.n_as(tests.fx_id('a'), 'nestly.children'), '0', '[F1.5-a c1 platform r15] suspended A reads 0 children rows');
select is(tests.n_as(tests.fx_id('a'), 'nestly.legal_consents'), '0', '[F1.5-a c1 platform r15] suspended A reads 0 legal_consents rows');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '0', '[F1.5-a c1 platform r15] suspended A reads 0 regular_profiles rows');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select nestly.is_active_account()::text'), 'false',
  '[F1.5-a c1 platform r15] is_active_account() stays false for suspended A although it reads its own users row');

select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F1.5-a c1] A is banned (fixture)');
select is(tests.n_as(tests.fx_id('b'), $r$nestly.users where id = 'a0000000-0000-4000-8000-0000000000a1'$r$), '0',
  '[F1.5-a c1 NFR-SEC-002] B reads 0 rows of banned A');
select is(tests.n_as(tests.fx_id('a'), 'nestly.journey_contexts'), '0', '[F1.5-a c1 platform r15] banned A reads 0 journey_contexts rows');
select is(tests.n_as(tests.fx_id('a'), 'nestly.children'), '0', '[F1.5-a c1 platform r15] banned A reads 0 children rows');
select is(tests.n_as(tests.fx_id('a'), 'nestly.legal_consents'), '0', '[F1.5-a c1 platform r15] banned A reads 0 legal_consents rows');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '0', '[F1.5-a c1 platform r15] banned A reads 0 regular_profiles rows');
select is(tests.as_role('authenticated', (select a_claims from zz_claims), 'select nestly.is_active_account()::text'), 'false',
  '[F1.5-a c1 platform r15] is_active_account() stays false for banned A');
-- a stopped account sees only itself, even asking for everyone
select is(tests.n_as(tests.fx_id('a'), $r$nestly.users where id <> 'a0000000-0000-4000-8000-0000000000a1'$r$), '0',
  '[F1.5-a c1 NFR-SEC-002] banned A reads 0 rows of any other account');

select is(tests.as_role('anon', '', 'select count(*)::text from nestly.users'), 'ERR:42501', '[F1.5-a c1] anon, no claims: users is refused (42501)');
select is(tests.as_role('anon', tests.claims(tests.fx_id('a'), '{"role":"anon"}'::jsonb), 'select count(*)::text from nestly.users'), 'ERR:42501',
  '[F1.5-a c1] anon carrying a stopped account''s sub: users is refused (42501)');
select is(tests.n_as(tests.fx_id('c'), 'nestly.users'), '0', '[F1.5-a c1] an identity with no users row reads 0 rows');

-- structure: the policy expression is exactly the own-id test, no status
select is(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'users' and pol.polname = 'users_select_own'),
  '(id = ( SELECT auth.uid() AS uid))',
  '[F1.5-a c1] users_select_own is exactly the own-id test');
select ok(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) !~* 'status'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'users' and pol.polname = 'users_select_own'),
  '[F1.5-a c1] users_select_own does not mention status');

select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.5-a c1] A is active again (fixture)');

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
         where n.nspname = 'nestly' and has_function_privilege('authenticated', p.oid, 'EXECUTE') and p.pronargs > 0
           and p.oid::regprocedure::text not in ('nestly.profile_view(text)', 'nestly.delete_post(uuid)', 'nestly.delete_comment(uuid)', 'nestly.has_permission(text)', 'nestly.reveal_post_author(uuid)', 'nestly.search_people(text,integer,integer)', 'nestly.group_role_rank(text)', 'nestly.my_group_rank(uuid)', 'nestly.child_tracker_trends(text,text,text,integer)', 'nestly.child_tracker_trends(text,text,text,text)', 'nestly.group_highlight_threshold(integer)', 'nestly.read_feed_display(uuid[])', 'nestly.read_feed_ranking_content(timestamp with time zone,double precision,double precision,double precision,double precision,double precision,double precision,double precision,uuid,boolean,timestamp with time zone,uuid,integer,double precision,timestamp with time zone,uuid,integer)', 'nestly.read_feed_ranking_regular(timestamp with time zone,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,text[],boolean,timestamp with time zone,uuid,integer,double precision,timestamp with time zone,uuid,integer)', 'nestly.read_feed_ranking_regular_intent(timestamp with time zone,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,text[],double precision,text[],double precision[],boolean,timestamp with time zone,uuid,integer,double precision,timestamp with time zone,uuid,integer)', 'nestly.read_liked_target_ids(uuid[])', 'nestly.read_matching_posts(uuid[],text[])', 'nestly.read_muted_group_ids(uuid[])', 'nestly.read_post_counts(uuid[])', 'nestly.read_post_images(uuid[])', 'nestly.read_professional_authors(uuid[])', 'nestly.read_today_impressions(uuid[])') $q$),
  '0',
  '[F1.1-b c18 layer 13 · F2.3b c15] seen from authenticated: no function in schema nestly that it can execute takes an argument, except the approved profile_view(text), which returns no account status (file 53, c13), and F3.0b''s delete_post / delete_comment (a content id; they return a row count) and search_people (id and full name only), and I10''s group_role_rank / my_group_rank (a Role''s rank; the caller''s own rank in a Group: file 96), and the I14 completion''s child_tracker_trends (cells of at least ten children, never an account: file 100), and I10 completion C''s group_highlight_threshold (a count to a threshold: file 106), and the plan-cache pass''s invoker read functions of the feed page (the server''s own statements under the caller''s RLS: file 118)');

-- =====================================================================================================================
-- Debt D1 (CRITIC b-1) — the function checks the caller's OWN row and its STATUS by itself, not through the users policy.
-- A permissive select policy is added inside this transaction (rolled back with it), so the policy hides nothing. Then
-- a body such as `select exists (select 1 from nestly.users)` would answer true for everyone and fail below.
-- =====================================================================================================================
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[D1] A active (fixture)');
select lives_ok($q$ select tests.set_status(tests.fx_id('b'), 'active') $q$, '[D1] B active (fixture)');
select lives_ok($q$ select tests.set_status(tests.fx_id('s'), 'suspended') $q$, '[D1] S suspended (fixture)');
select lives_ok($q$ select tests.set_status(tests.fx_id('x'), 'banned') $q$, '[D1] X banned (fixture)');
select lives_ok($q$ select tests.fx_open_users_select() $q$, '[D1] a permissive select policy on nestly.users is added for this transaction');

select ok(tests.n_as(tests.fx_id('s'), 'nestly.users') ~ '^[1-9][0-9]*$',
  '[D1] with the permissive policy, suspended S can now read User rows (so the policy no longer hides anything)');
select ok(tests.n_as(tests.fx_id('c'), 'nestly.users') ~ '^[1-9][0-9]*$',
  '[D1] with the permissive policy, the caller with no row can read User rows (other active rows exist)');

select is(tests.as_role('authenticated', tests.claims(tests.fx_id('s')), 'select nestly.is_active_account()::text'), 'false',
  '[D1] suspended S is told false although the policy lets it read rows');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('x')), 'select nestly.is_active_account()::text'), 'false',
  '[D1] banned X is told false although the policy lets it read rows');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('c')), 'select nestly.is_active_account()::text'), 'false',
  '[D1] a caller with no User row is told false while other active rows are readable');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.is_active_account()::text'), 'true',
  '[D1] active A is told true');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')), 'select nestly.is_active_account()::text'), 'true',
  '[D1] active B is told true');

select * from finish();

rollback;
