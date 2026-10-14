-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part b).
-- Criteria 12 (own row only), 14 (no identity), 16 (claims do not change the result), 17 (identity without a User row)
-- and 19 (anon) -- the behaviour of the two SELECT policies, from the point of view of the caller.
--
-- How a test becomes `authenticated`: tests.as_role()/tests.n_as() (supabase/tests/setup/10_identity_fixtures.sql) run
-- one statement under SET LOCAL ROLE with request.jwt.claims set for the transaction, and hand the answer back as text,
-- because pgTAP's own functions cannot be called as authenticated or anon. 'ERR:42501' = permission denied.
-- The people (a, b active; s suspended; x banned; p professional; c an Auth user with no User row) are committed by the
-- fixture file; each test file rolls back whatever it changes.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.1-b c12] session_user is app_server (this file must not run under another login)');

-- The rows the tests are about really exist, so "0 rows" below is the policy talking, not an empty table.
select is(tests.fx_user(tests.fx_id('a')), 'regular/active',    '[F1.1-b fixture] a: regular, active');
select is(tests.fx_user(tests.fx_id('b')), 'regular/active',    '[F1.1-b fixture] b: regular, active');
select is(tests.fx_user(tests.fx_id('s')), 'regular/suspended', '[F1.1-b fixture] s: regular, suspended');
select is(tests.fx_user(tests.fx_id('x')), 'regular/banned',    '[F1.1-b fixture] x: regular, banned');
select is(tests.fx_user(tests.fx_id('p')), 'professional/active', '[F1.1-b fixture] p: professional, active');
select is(tests.fx_user(tests.fx_id('c')), null,                 '[F1.1-b fixture] c: an Auth user with no nestly.users row');
select isnt(tests.fx_profile(tests.fx_id('s')), null,            '[F1.1-b fixture] s has a profile row (so its 0 below is the status gate)');
select isnt(tests.fx_profile(tests.fx_id('x')), null,            '[F1.1-b fixture] x has a profile row');
select isnt(tests.fx_profile(tests.fx_id('b')), null,            '[F1.1-b fixture] b has a profile row');

-- =====================================================================================================================
-- Criterion 12 — an active account reads exactly its own row. [NFR-SEC-002 · layer 1 · §13.2 "המשתמש לחשבונו"]
-- =====================================================================================================================
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '1',
  '[F1.1-b c12 NFR-SEC-002] active account A: SELECT on User returns exactly one row (although at least five exist)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '1',
  '[F1.1-b c12 NFR-SEC-002] active account A: SELECT on RegularProfile returns exactly one row (although at least four exist)');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select coalesce(string_agg(id::text, ','), '') from nestly.users $q$),
  tests.fx_id('a')::text,
  '[F1.1-b c12 NFR-SEC-002] the one User row A reads is A''s own');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')), $q$ select coalesce(string_agg(user_id::text, ','), '') from nestly.regular_profiles $q$),
  tests.fx_id('a')::text,
  '[F1.1-b c12 NFR-SEC-002] the one RegularProfile row A reads is A''s own');

-- the same connection, the next account: B sees B, never A
select is(tests.n_as(tests.fx_id('b'), 'nestly.users'), '1', '[F1.1-b c12 NFR-SEC-002] account B reads exactly one User row');
select is(tests.n_as(tests.fx_id('b'), 'nestly.regular_profiles'), '1', '[F1.1-b c12 NFR-SEC-002] account B reads exactly one RegularProfile row');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('b')), $q$ select coalesce(string_agg(id::text, ','), '') from nestly.users $q$),
  tests.fx_id('b')::text,
  '[F1.1-b c12 NFR-SEC-002] the one User row B reads is B''s own, not A''s (identity does not stick to the connection)');

-- a guessed or enumerated identifier reaches nothing
select is(tests.n_as(tests.fx_id('a'), $r$nestly.users where id = 'b0000000-0000-4000-8000-0000000000b2'$r$), '0',
  '[F1.1-b c12 NFR-SEC-002] A asking for B''s User row by its exact id gets 0 rows');
select is(tests.n_as(tests.fx_id('a'), $r$nestly.regular_profiles where user_id = 'b0000000-0000-4000-8000-0000000000b2'$r$), '0',
  '[F1.1-b c12 NFR-SEC-002] A asking for B''s RegularProfile by its exact id gets 0 rows');
select is(tests.n_as(tests.fx_id('a'), $r$nestly.users where id <> 'a0000000-0000-4000-8000-0000000000a1'$r$), '0',
  '[F1.1-b c12 NFR-SEC-002] A enumerating "every other user" gets 0 rows');
select is(tests.n_as(tests.fx_id('a'), $r$nestly.regular_profiles where user_id <> 'a0000000-0000-4000-8000-0000000000a1'$r$), '0',
  '[F1.1-b c12 NFR-SEC-002] A enumerating "every other profile" gets 0 rows');
select is(tests.n_as(tests.fx_id('a'), $r$nestly.regular_profiles where full_name like '%'$r$), '1',
  '[F1.1-b c12 NFR-SEC-002] a LIKE that matches every name still returns only A''s profile');
select is(tests.n_as(tests.fx_id('a'), $r$nestly.users where id in (select user_id from nestly.regular_profiles)$r$), '1',
  '[F1.1-b c12 NFR-SEC-002] a subquery from one table into the other does not widen what A sees');
select is(tests.n_as(tests.fx_id('a'), $r$nestly.users u join nestly.regular_profiles p on p.user_id = u.id$r$), '1',
  '[F1.1-b c12 NFR-SEC-002] joining User and RegularProfile gives A exactly its own pair');
select is(tests.n_as(tests.fx_id('a'), $r$nestly.users a cross join nestly.users b$r$), '1',
  '[F1.1-b c12 NFR-SEC-002] a self cross join sees only A''s row on both sides');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select count(*)::text from (select id from nestly.users union all select user_id from nestly.regular_profiles) t $q$),
  '2',
  '[F1.1-b c12 NFR-SEC-002] a UNION over both tables returns A''s two rows and nothing else');

-- the account type does not gate the own-row read
select is(tests.n_as(tests.fx_id('p'), 'nestly.users'), '1',
  '[F1.1-b c12 NFR-SEC-002] an active professional account reads its own User row');
select is(tests.n_as(tests.fx_id('p'), 'nestly.regular_profiles'), '0',
  '[F1.1-b c12 BR-016] a professional account has no RegularProfile to read');

-- =====================================================================================================================
-- Criterion 14 — exit criterion, no identity. [7.1 · 13-data.md:9]
-- =====================================================================================================================
select is(tests.as_role('none', tests.claims(tests.fx_id('a')), 'select count(*)::text from nestly.users'), 'ERR:42501',
  '[F1.1-b c14 platform r2] as app_server with no role set, SELECT on User fails with permission denied (A''s claims are present and do not help)');
select is(tests.as_role('none', tests.claims(tests.fx_id('a')), 'select count(*)::text from nestly.regular_profiles'), 'ERR:42501',
  '[F1.1-b c14 platform r2] as app_server with no role set, SELECT on RegularProfile fails with permission denied');
select is(tests.as_role('none', '', 'select count(*)::text from nestly.users'), 'ERR:42501',
  '[F1.1-b c14 platform r2] as app_server with no role and no claims, SELECT on User fails with permission denied');
select is(tests.as_role('none', tests.claims(tests.fx_id('a')), 'select nestly.is_active_account()::text'), 'ERR:42501',
  '[F1.1-b c14 platform r2] as app_server with no role set, is_active_account() is not callable');

select is(tests.as_role('authenticated', '', 'select count(*)::text from nestly.users'), '0',
  '[F1.1-b c14 NFR-SEC-002] authenticated with empty claims: User returns 0 rows');
select is(tests.as_role('authenticated', '', 'select count(*)::text from nestly.regular_profiles'), '0',
  '[F1.1-b c14 NFR-SEC-002] authenticated with empty claims: RegularProfile returns 0 rows');
select is(tests.as_role('authenticated', '', 'select nestly.is_active_account()::text'), 'false',
  '[F1.1-b c14 platform r15] authenticated with empty claims: is_active_account() is false');

select is(r.got, '0', '[F1.1-b c14 NFR-SEC-002] authenticated with claims that name nobody (' || r.label || '): User returns 0 rows')
from (
  select t.label, tests.as_role('authenticated', t.cl, 'select count(*)::text from nestly.users') as got
  from (values
    ('{}',                           '{}'),
    ('role only',                    '{"role":"authenticated"}'),
    ('aud only',                     '{"aud":"authenticated"}'),
    ('sub is JSON null',             '{"sub":null,"role":"authenticated"}'),
    ('only non-identity claims',     '{"role":"authenticated","app_metadata":{"status":"active"},"user_metadata":{"account_type":"admin"}}')
  ) as t(label, cl)
) r;

select is(r.got, '0', '[F1.1-b c14 NFR-SEC-002] authenticated with claims that name nobody (' || r.label || '): RegularProfile returns 0 rows')
from (
  select t.label, tests.as_role('authenticated', t.cl, 'select count(*)::text from nestly.regular_profiles') as got
  from (values
    ('{}',                           '{}'),
    ('role only',                    '{"role":"authenticated"}'),
    ('sub is JSON null',             '{"sub":null,"role":"authenticated"}')
  ) as t(label, cl)
) r;

-- Hostile or broken claims: the statement may fail, but it must never return a row.
select ok(r.got = '0' or r.got like 'ERR:%',
  '[F1.1-b c14 NFR-SEC-002] hostile claims fail closed (no row, no leak): ' || r.label || ' (got ' || coalesce(r.got, 'NULL') || ')')
from (
  select t.label, tests.as_role('authenticated', t.cl, 'select count(*)::text from nestly.users') as got
  from (values
    ('empty sub',                    '{"sub":"","role":"authenticated"}'),
    ('sub is not a uuid',            '{"sub":"not-a-uuid","role":"authenticated"}'),
    ('sub is a number',              '{"sub":12345,"role":"authenticated"}'),
    ('sub is SQL',                   '{"sub":"a'' or ''1''=''1","role":"authenticated"}'),
    ('sub is an array',              '{"sub":["a0000000-0000-4000-8000-0000000000a1"],"role":"authenticated"}'),
    ('claims are not JSON',          '{not json'),
    ('claims are a bare string',     'a0000000-0000-4000-8000-0000000000a1'),
    ('claims are JSON null',         'null'),
    ('claims are a JSON array',      '["a0000000-0000-4000-8000-0000000000a1"]')
  ) as t(label, cl)
) r;

-- =====================================================================================================================
-- Criterion 16 — status and account type come from the table only. [§12 · platform r14]
-- =====================================================================================================================
-- claims that try to be a different role
select is(tests.n_as(tests.fx_id('a'), 'nestly.users', jsonb_build_object('role', r.claimed)), '1',
  '[F1.1-b c16 platform r14] a token whose role claim says ' || r.claimed || ' still gives A only its own User row')
from (values ('service_role'), ('postgres'), ('supabase_admin'), ('anon'), ('authenticator'), ('admin')) as r(claimed);

select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles', jsonb_build_object('role', r.claimed)), '1',
  '[F1.1-b c16 platform r14] a token whose role claim says ' || r.claimed || ' still gives A only its own RegularProfile row')
from (values ('service_role'), ('postgres'), ('supabase_admin'), ('anon')) as r(claimed);

-- claims that try to be a different status / account type, for an account that is not active
select is(tests.n_as(tests.fx_id('s'), q.rel, r.extra::jsonb), '0',
  '[F1.1-b c16 platform r14] suspended S, claims say ' || r.label || ': ' || q.rel || ' still returns 0 rows')
from (values
  ('app_metadata status active',  '{"app_metadata":{"status":"active"}}'),
  ('user_metadata status active', '{"user_metadata":{"status":"active"}}'),
  ('top-level status active',     '{"status":"active"}'),
  ('role service_role',           '{"role":"service_role"}'),
  ('app_metadata role admin and account_type admin', '{"app_metadata":{"role":"admin","account_type":"admin","status":"active"}}'),
  ('is_active true',              '{"app_metadata":{"is_active":true},"is_active":true}')
) as r(label, extra)
cross join (values ('nestly.users'), ('nestly.regular_profiles')) as q(rel);

select is(tests.n_as(tests.fx_id('x'), q.rel, '{"app_metadata":{"status":"active"},"user_metadata":{"status":"active"},"role":"service_role"}'::jsonb), '0',
  '[F1.1-b c16 platform r14] banned X, claims say active and service_role: ' || q.rel || ' still returns 0 rows')
from (values ('nestly.users'), ('nestly.regular_profiles')) as q(rel);

select is(tests.as_role('authenticated',
    tests.claims(tests.fx_id('s'), '{"app_metadata":{"status":"active"},"role":"service_role"}'::jsonb), 'select nestly.is_active_account()::text'),
  'false',
  '[F1.1-b c16 platform r14] suspended S, claims say active: is_active_account() is still false');

-- claims that try to be a different identity inside metadata
select is(tests.n_as(tests.fx_id('a'), 'nestly.users',
    jsonb_build_object('app_metadata', jsonb_build_object('sub', tests.fx_id('b')), 'user_metadata', jsonb_build_object('sub', tests.fx_id('b'), 'id', tests.fx_id('b')))),
  '1',
  '[F1.1-b c16 platform r14] a sub or id hidden in app_metadata / user_metadata does not change how many rows A reads');
select is(
  tests.as_role('authenticated',
    tests.claims(tests.fx_id('a'), jsonb_build_object('app_metadata', jsonb_build_object('sub', tests.fx_id('b')))),
    $q$ select coalesce(string_agg(id::text, ','), '') from nestly.users $q$),
  tests.fx_id('a')::text,
  '[F1.1-b c16 platform r14] with B''s id inside app_metadata, the row read is still A''s');

-- claims that try to downgrade an active account do not change anything either (the table decides, both ways)
select is(tests.n_as(tests.fx_id('a'), 'nestly.users', '{"app_metadata":{"status":"suspended"},"user_metadata":{"status":"banned"}}'::jsonb), '1',
  '[F1.1-b c16 platform r14] claims saying suspended / banned do not hide an active account''s own row: the table decides');

-- =====================================================================================================================
-- Criterion 17 — a valid identity with no User row reads nothing. [platform r15; not in the SRS]
-- =====================================================================================================================
select is(tests.n_as(tests.fx_id('c'), 'nestly.users'), '0',
  '[F1.1-b c17 platform r15] a valid Auth identity with no User row: SELECT on User returns 0 rows');
select is(tests.n_as(tests.fx_id('c'), 'nestly.regular_profiles'), '0',
  '[F1.1-b c17 platform r15] a valid Auth identity with no User row: SELECT on RegularProfile returns 0 rows');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('c')), 'select nestly.is_active_account()::text'), 'false',
  '[F1.1-b c17 platform r15] a valid Auth identity with no User row: is_active_account() is false (fail closed)');
select is(tests.n_as(tests.fx_id('c'), $r$nestly.users where id = 'c0000000-0000-4000-8000-0000000000c3'$r$), '0',
  '[F1.1-b c17 platform r15] asking by its own id changes nothing for an identity with no User row');
select is(tests.n_as(tests.fx_id('c'), 'nestly.users', '{"app_metadata":{"status":"active"},"role":"service_role"}'::jsonb), '0',
  '[F1.1-b c17 platform r14,r15] claims that say active / service_role do not create an account for an identity with no User row');

-- =====================================================================================================================
-- Criterion 19 — anon. [FR-AUTH-004 · BR-015 · platform r4, r7]
-- =====================================================================================================================
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.users'), 'ERR:42501',
  '[F1.1-b c19 BR-015] anon: SELECT on User fails');
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.regular_profiles'), 'ERR:42501',
  '[F1.1-b c19 BR-015] anon: SELECT on RegularProfile fails');
select is(tests.as_role('anon', '', 'select nestly.is_active_account()::text'), 'ERR:42501',
  '[F1.1-b c19 platform r4,r7] anon: a call to is_active_account() fails');
select is(tests.as_role('anon', tests.claims(tests.fx_id('a'), '{"role":"anon"}'::jsonb), 'select count(*)::text from nestly.users'), 'ERR:42501',
  '[F1.1-b c19 BR-015] anon carrying a real account''s claims: SELECT on User still fails');
select is(tests.as_role('anon', tests.claims(tests.fx_id('a'), '{"role":"anon"}'::jsonb), 'select count(*)::text from nestly.regular_profiles'), 'ERR:42501',
  '[F1.1-b c19 BR-015] anon carrying a real account''s claims: SELECT on RegularProfile still fails');
select is(tests.as_role('anon', tests.claims(tests.fx_id('a')), 'select nestly.is_active_account()::text'), 'ERR:42501',
  '[F1.1-b c19 platform r7] anon carrying a real account''s claims: is_active_account() still fails');

select * from finish();

rollback;
