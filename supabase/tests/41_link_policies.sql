-- pgTAP, run by pg_prove as app_server (CI `db` job, F2.0 part a: account-takeover-close, S-01 / S-16, FR-AUTH-005, FR-AUTH-003).
-- Behaviour, seen from each role: c1 (the verdict is written once, only by an oauth session of the caller), c3-c7 (the guard and
-- the state transitions), c4 (fail closed while pending: the gated tables return nothing), c5 (a second clear updates 0 rows, one
-- takeover_cleared per user), c6 (stale tokens), c9/c11 (no users row), c10 (the change audit kinds), c12 (own subject only),
-- D1 (answers are deletable only while the caller's own row is pending).
-- Source of expected values: .work/account-takeover-close/spec.md and schema.md, not the migration text. Structure is in file 40.
-- Everything here rolls back with the transaction. Written without a database to run against: CI is the first run.
--
-- People (fixtures of supabase/tests/setup/): a, b regular active with a profile; s suspended; p professional; c and f1, f2 Auth users
-- with no users row. Sessions below are fixed uuids; the clear happened at 2026-10-16 10:00:00.5 UTC.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.0-a c12] session_user is app_server (this file must not run under another login)');

-- ---- helpers (temp schema, gone with the session) ----------------------------------------------------------------------------
-- claims of a session: sub, session_id, iat (epoch seconds, NULL = absent), amr oauth or password
create function pg_temp.cl(p_sub uuid, p_session text, p_iat bigint default null, p_oauth boolean default true) returns text language sql as $f$
  select tests.claims(p_sub, jsonb_strip_nulls(jsonb_build_object(
    'session_id', p_session,
    'iat', p_iat,
    'amr', case when p_oauth then '[{"method":"oauth","timestamp":1}]'::jsonb else '[{"method":"password","timestamp":1}]'::jsonb end)))
$f$;
create function pg_temp.ep(p_ts text) returns bigint language sql as $f$ select extract(epoch from p_ts::timestamptz)::bigint $f$;
create function pg_temp.sid(n int) returns text language sql as $f$ select format('%s-1111-4111-8111-111111111111', lpad(n::text, 8, '0')) $f$;
-- declares handle and IP hash for app_recovery, as the server does after SET LOCAL ROLE
create function pg_temp.decl(h text, i text) returns text language sql as $f$
  select set_config('nestly.recovery_handle', h, true) || '/' || set_config('nestly.recovery_ip', i, true)
$f$;
create function pg_temp.ev(kind text, uid text, h text, i text) returns text language sql as $f$
  select format('insert into nestly.recovery_events (kind, user_id, handle_hash, ip_hash) values (%L, %L, decode(%L, ''hex''), decode(%L, ''hex''))', kind, uid, h, i)
$f$;
create function pg_temp.guard(p_sub uuid, p_claims text) returns text language sql as $f$
  select tests.as_role('authenticated', p_claims, 'select nestly.session_guard()')
$f$;
create function pg_temp.active(p_sub uuid, p_claims text) returns text language sql as $f$
  select tests.as_role('authenticated', p_claims, 'select nestly.is_active_account()::text')
$f$;
create function pg_temp.ins(p_verdict text, p_checked text) returns text language sql as $f$
  select format('insert into nestly.identity_link_checks (verdict, checked_session_id) values (%L, %L)', p_verdict, p_checked)
$f$;

select is(tests.fx_user(tests.fx_id('a')), 'regular/active', '[F2.0 fixture] a is regular and active');
select is(tests.fx_user(tests.fx_id('c')), null, '[F2.0 fixture] c has no users row');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '1', '[F2.0 fixture] with no link row and a password session, a reads its own profile (control for the 0 reads below)');

-- =====================================================================================================================
-- Helpers on the claims (c1, c4, c6): a malformed or missing claim reads NULL / false
-- =====================================================================================================================
select is(tests.as_role('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'select nestly.jwt_session_id()::text'), pg_temp.sid(1),
  '[F2.0-a c6] jwt_session_id() reads the session_id claim');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a'), '{"session_id":"not-a-uuid"}'), 'select nestly.jwt_session_id()::text'), null,
  '[F2.0-a c6 hostile] a session_id that is not a uuid reads NULL, never an error');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.jwt_session_id()::text'), null,
  '[F2.0-a c6] a missing session_id reads NULL');
select is(tests.as_role('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1), 1792000000), 'select extract(epoch from nestly.jwt_issued_at())::bigint::text'), '1792000000',
  '[F2.0-a c6] jwt_issued_at() is to_timestamp(iat)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a'), '{"iat":"abc"}'), 'select nestly.jwt_issued_at()::text'), null,
  '[F2.0-a c6 hostile] an iat that is not a number reads NULL, never an error');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.jwt_issued_at()::text'), null,
  '[F2.0-a c6] a missing iat reads NULL');
select is(tests.as_role('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'select nestly.jwt_is_oauth()::text'), 'true',
  '[F2.0-a c1] jwt_is_oauth() is true when amr holds method oauth');
select is(tests.as_role('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1), null, false), 'select nestly.jwt_is_oauth()::text'), 'false',
  '[F2.0-a c1] jwt_is_oauth() is false for a password session');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a'), '{"amr":[{"method":"password"},{"method":"oauth"}]}'), 'select nestly.jwt_is_oauth()::text'), 'true',
  '[F2.0-a c1] oauth anywhere in amr counts');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.jwt_is_oauth()::text'), 'false',
  '[F2.0-a c1] a missing amr is not oauth');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a'), '{"amr":"oauth"}'), 'select nestly.jwt_is_oauth()::text'), 'false',
  '[F2.0-a c1 hostile] amr as a string (wrong shape) is not oauth, and not an error');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a'), '{"amr":[{"method":123}]}'), 'select nestly.jwt_is_oauth()::text'), 'false',
  '[F2.0-a c1 hostile] amr with a non-string method is not oauth, and not an error');

-- =====================================================================================================================
-- c1 — the verdict is written once, by an oauth session of the caller, for itself
-- =====================================================================================================================
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)), pg_temp.ins('affected', pg_temp.sid(1)), false), 'OK:1',
  '[F2.0-a c1 c9] an oauth session writes "affected" for itself, with its own session id (f1 has no users row)');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)), pg_temp.ins('unaffected', pg_temp.sid(1)), false), 'OK:1',
  '[F2.0-a c1] and "unaffected"');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1), null, false), pg_temp.ins('unaffected', pg_temp.sid(1)), false), 'ERR:42501',
  '[F2.0-a c1] a password session (the earlier registrant) cannot pre-write "unaffected"');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1), null, false), pg_temp.ins('affected', pg_temp.sid(1)), false), 'ERR:42501',
  '[F2.0-a c1] nor "affected": only an oauth session writes a verdict');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)), pg_temp.ins('unaffected', pg_temp.sid(2)), false), 'ERR:42501',
  '[F2.0-a c1] a checked_session_id other than the caller''s session is refused');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1'), '{"amr":[{"method":"oauth"}]}'), pg_temp.ins('unaffected', pg_temp.sid(1)), false), 'ERR:42501',
  '[F2.0-a c1] a token with no session_id claim cannot write a verdict');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)), pg_temp.ins('bogus', pg_temp.sid(1)), false), 'ERR:23514',
  '[F2.0-a c1] a verdict other than affected / unaffected is refused by the CHECK');
select alike(tests.dml_as_msg('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)), pg_temp.ins('unaffected', null), false), 'ERR:%',
  '[F2.0-a c1] a NULL checked_session_id is refused');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)),
    format('insert into nestly.identity_link_checks (user_id, verdict, checked_session_id) values (%L, ''unaffected'', %L)', tests.fx_id('f2'), pg_temp.sid(1)), false),
  'ERR:42501', '[F2.0-a c12] a body naming another user_id is refused: user_id is not insertable, the subject is the JWT''s');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)),
    format('insert into nestly.identity_link_checks (verdict, checked_session_id, cleared_at) values (''affected'', %L, now())', pg_temp.sid(1)), false),
  'ERR:42501', '[F2.0-a c1 c3] a verdict cannot be written already cleared');
select is(tests.dml_as('anon', '', pg_temp.ins('unaffected', pg_temp.sid(1)), false), 'ERR:42501', '[F2.0-a c12] anon cannot write a verdict');
select is(tests.dml_as('anon', tests.claims(tests.fx_id('f1'), '{"role":"anon"}'), pg_temp.ins('unaffected', pg_temp.sid(1)), false), 'ERR:42501',
  '[F2.0-a c12] anon carrying a sub cannot write a verdict');
select is(tests.dml_as('none', '', pg_temp.ins('unaffected', pg_temp.sid(1)), false), 'ERR:42501', '[F2.0-a c12] app_server without SET ROLE cannot reach the table');

select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)), pg_temp.ins('affected', pg_temp.sid(1)), true), 'OK:1',
  '[F2.0-a c1 c5] f1''s verdict is stored (kept for the checks below)');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f1'), pg_temp.sid(1)), pg_temp.ins('unaffected', pg_temp.sid(1)), false), 'ERR:23505',
  '[F2.0-a c1 c5] a second verdict for the same user is a unique violation: one row per Auth user, and the first one stands');
select is(tests.fx_link_state(tests.fx_id('f1')), 'affected/false/-/false', '[F2.0-a c1] the stored verdict is "affected", pending (nothing cleared)');

-- =====================================================================================================================
-- Reads: own row only
-- =====================================================================================================================
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'unaffected', 'aaaaaaaa-1111-4111-8111-111111111111') $q$, '[F2.0 fixture] a has an unaffected row');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('b'), 'affected', 'bbbbbbbb-1111-4111-8111-111111111111') $q$, '[F2.0 fixture] b has an affected row');
select is(tests.n_as(tests.fx_id('a'), 'nestly.identity_link_checks', '{"amr":[{"method":"password"}]}'), '1', '[F2.0-a c12] a reads exactly its own link row');
select is(tests.n_as(tests.fx_id('c'), 'nestly.identity_link_checks'), '0', '[F2.0-a c12] an identity with no row reads 0');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format('select count(*)::text from nestly.identity_link_checks where user_id = %L', tests.fx_id('b'))), '0',
  '[F2.0-a c12] a asking for b''s row by id gets 0 rows');
select is(tests.as_role('anon', '', 'select count(*)::text from nestly.identity_link_checks'), 'ERR:42501', '[F2.0-a c12] anon cannot read the table');
select is(tests.as_role('app_recovery', '', 'select count(*)::text from nestly.identity_link_checks'), 'ERR:42501', '[F2.0-a c12] app_recovery cannot read the table');

-- =====================================================================================================================
-- session_guard(): each value (c1, c3, c4, c6, c7)
-- cleared at 10:00:00.5; the clearing session is sid(1); every other session is a different uuid
-- =====================================================================================================================
select is(tests.as_role('authenticated', '', 'select nestly.session_guard()'), 'unauthenticated', '[F2.0-a c4] no claims at all: unauthenticated');
select is(tests.as_role('authenticated', tests.claims(null), 'select nestly.session_guard()'), 'unauthenticated', '[F2.0-a c4] claims with no sub: unauthenticated');
select is(tests.as_role('anon', tests.claims(tests.fx_id('a'), '{"role":"anon"}'), 'select nestly.session_guard()'), 'ERR:42501', '[F2.0-a c12] anon cannot call the guard');

-- no row
select is(pg_temp.guard(tests.fx_id('c'), pg_temp.cl(tests.fx_id('c'), pg_temp.sid(1))), 'unchecked', '[F2.0-a c1] no row and an oauth session: unchecked (detection runs first)');
select is(pg_temp.guard(tests.fx_id('c'), pg_temp.cl(tests.fx_id('c'), pg_temp.sid(1), null, false)), 'ok', '[F2.0-a c1] no row and a password session: ok (nothing runs for it)');
select is(pg_temp.guard(tests.fx_id('c'), tests.claims(tests.fx_id('c'))), 'ok', '[F2.0-a c1] no row and no amr claim at all: ok, never unchecked');
-- unaffected
select is(pg_temp.guard(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(7))), 'ok', '[F2.0-a c1 c5] an unaffected account: ok for an oauth session');
select is(pg_temp.guard(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(7), null, false)), 'ok', '[F2.0-a c1] and for a password session');
-- pending
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(1))), 'pending', '[F2.0-a c4] pending: an oauth session');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(9), null, false)), 'pending', '[F2.0-a c4] pending: every session of the account, a password one included');
select is(pg_temp.guard(tests.fx_id('b'), tests.claims(tests.fx_id('b'))), 'pending', '[F2.0-a c4] pending: a token with no session claims fails closed too');

-- cleared, password not yet set (must_set)
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('b'), 'affected', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:00:00.5+00', pg_temp.sid(1)::uuid) $q$,
  '[F2.0 fixture] b is cleared at 10:00:00.5 by session 1, password not set');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(1), pg_temp.ep('2026-10-16 09:00:00+00'))), 'must_set',
  '[F2.0-a c7] the clearing session is told to set a password (whatever its iat)');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2), pg_temp.ep('2026-10-16 09:59:59+00'))), 'stale',
  '[F2.0-a c6] another session, token issued before the clear: stale');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2), pg_temp.ep('2026-10-16 10:00:00+00'))), 'stale',
  '[F2.0-a c6] another session, token issued in the cleared second: stale (whole-second iat; fails safe)');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2), pg_temp.ep('2026-10-16 10:00:01+00'))), 'ok',
  '[F2.0-a c6 Q-S1] another session, token issued after the clear: ok (it is not told to set a password: c7 would refuse it)');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2))), 'stale', '[F2.0-a c6] another session, no iat claim: stale');
select is(pg_temp.guard(tests.fx_id('b'), tests.claims(tests.fx_id('b'), '{"iat":"abc","session_id":"x"}')), 'stale', '[F2.0-a c6 hostile] malformed iat and session_id: stale, not an error');
select is(pg_temp.guard(tests.fx_id('b'), tests.claims(tests.fx_id('b'))), 'stale', '[F2.0-a c6] a token with no session claims after a clear: stale');
-- done
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('b'), 'affected', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:00:00.5+00', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:05:00+00') $q$,
  '[F2.0 fixture] b has set its new password');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(1), pg_temp.ep('2026-10-16 09:00:00+00'))), 'ok', '[F2.0-a c5 c7] done: the clearing session is ok');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2), pg_temp.ep('2026-10-16 09:59:59+00'))), 'stale',
  '[F2.0-a c6] done: another session''s pre-clear token stays stale');
select is(pg_temp.guard(tests.fx_id('b'), pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2), pg_temp.ep('2026-10-16 11:00:00+00'))), 'ok', '[F2.0-a c5 c6] done: a fresh session is ok');

-- =====================================================================================================================
-- is_active_account() per state, and the database fence on a gated table (c4, c6, c7)
-- =====================================================================================================================
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', pg_temp.sid(1)::uuid) $q$, '[F2.0 fixture] a is pending');
select is(pg_temp.active(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1))), 'false', '[F2.0-a c4] pending: not an active account');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles', '{"session_id":"00000001-1111-4111-8111-111111111111","amr":[{"method":"oauth"}]}'), '0',
  '[F2.0-a c4 DR-O1] pending: the gated table returns nothing even if a route forgets the guard');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles', '{"session_id":"00000009-1111-4111-8111-111111111111","amr":[{"method":"password"}]}'), '0',
  '[F2.0-a c4 DR-O1] pending: and for a password session of the same account');

select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:00:00.5+00', pg_temp.sid(1)::uuid) $q$, '[F2.0 fixture] a is cleared, password not set');
select is(pg_temp.active(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1))), 'true', '[F2.0-a c7 c8] must_set: the clearing session is an active account (it must reach /api/me and the set call)');
select is(pg_temp.active(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(2), pg_temp.ep('2026-10-16 09:59:59+00'))), 'false', '[F2.0-a c6] a stale token is not an active account');
select is(tests.as_role('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(2), pg_temp.ep('2026-10-16 09:59:59+00')), 'select count(*)::text from nestly.regular_profiles'), '0',
  '[F2.0-a c6] a stale token reads nothing from a gated table');
select is(pg_temp.active(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(2), pg_temp.ep('2026-10-16 10:00:01+00'))), 'true', '[F2.0-a c6] a token issued after the clear is active');

select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:00:00.5+00', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:05:00+00') $q$, '[F2.0 fixture] a is done');
select is(pg_temp.active(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1))), 'true', '[F2.0-a c5 c8] done: active');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles', '{"session_id":"00000001-1111-4111-8111-111111111111","amr":[{"method":"oauth"}]}'), '1', '[F2.0-a c8] done: the gated table is readable again');

select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'unaffected', pg_temp.sid(1)::uuid) $q$, '[F2.0 fixture] a is unaffected');
select is(pg_temp.active(tests.fx_id('a'), pg_temp.cl(tests.fx_id('a'), pg_temp.sid(3))), 'true', '[F2.0-a c1] unaffected: active');
select is(pg_temp.active(tests.fx_id('c'), pg_temp.cl(tests.fx_id('c'), pg_temp.sid(3))), 'false', '[F2.0-a c9] an identity with no users row is never an active account');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('s'), 'unaffected', pg_temp.sid(1)::uuid) $q$, '[F2.0 fixture] s (suspended) is unaffected');
select is(pg_temp.active(tests.fx_id('s'), pg_temp.cl(tests.fx_id('s'), pg_temp.sid(3))), 'false', '[F2.0-a c1 BR-024] the guard does not make a suspended account active');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles', '{"amr":[{"method":"oauth"}]}'), '1',
  '[F2.0-a c1] with a row "unaffected", an oauth session with no session claims reads its profile (the guard is the verdict, not the claims)');

-- =====================================================================================================================
-- c3 clear transition — the trigger allows exactly two moves
-- =====================================================================================================================
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', pg_temp.sid(1)::uuid) $q$, '[F2.0 fixture] a is pending');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1), null, false), 'update nestly.identity_link_checks set cleared_at = now()', false), 'ERR:42501',
  '[F2.0-a c3 c1] a password session cannot clear');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), 'update nestly.identity_link_checks set cleared_at = now()', false), 'ERR:42501',
  '[F2.0-a c3] a token with no amr cannot clear');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('c'), pg_temp.sid(1)), 'update nestly.identity_link_checks set cleared_at = now()', false), 'OK:0',
  '[F2.0-a c12] an identity with no link row updating with no WHERE reaches 0 rows: it cannot touch a''s row');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set password_set_at = now()', false), 'ERR:42501',
  '[F2.0-a c7] a password cannot be marked set while the account is only pending');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set cleared_at = now(), password_set_at = now()', false), 'ERR:42501',
  '[F2.0-a c3 c7] clear and password-set in one statement is neither of the two allowed moves');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), $q$ update nestly.identity_link_checks set verdict = 'unaffected' $q$, false), 'ERR:42501',
  '[F2.0-a c1 c12] the verdict is not updatable');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), format('update nestly.identity_link_checks set checked_session_id = %L', pg_temp.sid(5)), false), 'ERR:42501',
  '[F2.0-a c1 c12] checked_session_id is not updatable');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), format('update nestly.identity_link_checks set clearing_session_id = %L', pg_temp.sid(5)), false), 'ERR:42501',
  '[F2.0-a c3 c12] clearing_session_id cannot be set by the caller; the trigger sets it');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), format('update nestly.identity_link_checks set user_id = %L', tests.fx_id('b')), false), 'ERR:42501',
  '[F2.0-a c12] a row cannot be handed to another user');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'delete from nestly.identity_link_checks', false), 'ERR:42501',
  '[F2.0-a c5] the table has no DELETE for authenticated');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set cleared_at = null', false), 'ERR:42501',
  '[F2.0-a c3 c5] a clear cannot be written as NULL (pending cannot be re-written, and cleared_at only moves by the trigger''s rule)');
select is(tests.fx_link_state(tests.fx_id('a')), 'affected/false/-/false', '[F2.0-a c3] none of the refused statements changed the row');

select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), $q$ update nestly.identity_link_checks set cleared_at = '2000-01-01 00:00:00+00' $q$, true), 'OK:1',
  '[F2.0-a c3] an oauth session clears the pending row (the value it sends is only a trigger)');
select is(tests.fx_link_cleared_is_now(tests.fx_id('a')), true, '[F2.0-a c3] cleared_at is the database''s now(), not the value the caller sent');
select is(tests.fx_link_state(tests.fx_id('a')), 'affected/true/' || pg_temp.sid(1) || '/false',
  '[F2.0-a c3 c6] clearing_session_id is the caller''s session; password_set_at is still NULL (the account is must_set)');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set cleared_at = now() where cleared_at is null', false), 'OK:0',
  '[F2.0-a c5] the guarded second clear (where cleared_at is null) updates 0 rows: only the winner writes the audit row');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(2)), 'update nestly.identity_link_checks set cleared_at = now()', false), 'ERR:42501',
  '[F2.0-a c5] an unguarded second clear (even from another oauth session) is refused: a cleared row never re-clears');
select is(tests.fx_link_state(tests.fx_id('a')), 'affected/true/' || pg_temp.sid(1) || '/false', '[F2.0-a c5] the clearing session is unchanged by the second attempts');

-- c7 password set: the clearing session only (or a caller with no users row, c11)
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(2), pg_temp.ep('2026-10-16 23:00:00+00')), 'update nestly.identity_link_checks set password_set_at = now()', false), 'ERR:42501',
  '[F2.0-a c7] another session of the account cannot mark the password set');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set password_set_at = now()', true), 'OK:1',
  '[F2.0-a c7] the clearing session marks the password set');
select is(tests.fx_link_state(tests.fx_id('a')), 'affected/true/' || pg_temp.sid(1) || '/true', '[F2.0-a c7] the account is done');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set password_set_at = now()', false), 'ERR:42501',
  '[F2.0-a c7] a second password set is refused (409 at the route): the state is no longer must_set');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set password_set_at = null', false), 'ERR:42501',
  '[F2.0-a c7] done cannot be undone');

-- an unaffected account can never be marked
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'unaffected', pg_temp.sid(1)::uuid) $q$, '[F2.0 fixture] a is unaffected');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set cleared_at = now()', false), 'ERR:42501',
  '[F2.0-a c1 c5] an unaffected row cannot be cleared (a later email identity is always after the google one)');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set password_set_at = now()', false), 'ERR:42501',
  '[F2.0-a c7] nor marked password-set');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'update nestly.identity_link_checks set cleared_at = now() where cleared_at is null', false), 'ERR:42501',
  '[F2.0-a c1 c5] even the guarded form raises on an unaffected row');

-- c11: a caller with no users row may mark its own must_set row (the completion step's password is the new password, c9)
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('f2'), 'affected', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:00:00.5+00', pg_temp.sid(1)::uuid) $q$,
  '[F2.0 fixture] f2 (no users row) is cleared, password not set');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('f2'), pg_temp.sid(3), pg_temp.ep('2026-10-16 10:00:01+00')), 'update nestly.identity_link_checks set password_set_at = now()', true), 'OK:1',
  '[F2.0-a c9 c11] an Auth user with no users row marks its first password set, from any session');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', pg_temp.sid(1)::uuid, timestamptz '2026-10-16 10:00:00.5+00', pg_temp.sid(1)::uuid) $q$,
  '[F2.0 fixture] a (WITH a users row) is cleared, password not set');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(3), pg_temp.ep('2026-10-16 10:00:01+00')), 'update nestly.identity_link_checks set password_set_at = now()', false), 'ERR:42501',
  '[F2.0-a c7 c11] but an account WITH a users row cannot be marked by a session other than the clearing one');

-- =====================================================================================================================
-- D1 / c2 — the answers delete: own row, only while the caller's own link row is pending, no status gate
-- =====================================================================================================================
select lives_ok($q$ select tests.fx_link_answers_put(tests.fx_id('a'), repeat('aa', 32)) $q$, '[F2.0 fixture] a has answers under handle aa');
select lives_ok($q$ select tests.fx_link_answers_put(tests.fx_id('b'), repeat('bb', 32)) $q$, '[F2.0 fixture] b has answers under handle bb');
select lives_ok($q$ select tests.fx_link_answers_put(tests.fx_id('s')) $q$, '[F2.0 fixture] s (suspended) has answers with no handle');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'unaffected', pg_temp.sid(1)::uuid) $q$, '[F2.0 fixture] a is unaffected');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('b'), 'affected', pg_temp.sid(2)::uuid) $q$, '[F2.0 fixture] b is pending');

select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), 'delete from nestly.recovery_answers', false), 'OK:0',
  '[F2.0-a c1 c2 D1] an unaffected account deletes nothing (its own row is not pending), even while another user is pending');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2)), format('delete from nestly.recovery_answers where user_id = %L', tests.fx_id('a')), false), 'OK:0',
  '[F2.0-a c2 c12] a pending user cannot delete another user''s answers by naming them');
select isnt(tests.fx_recovery_answers_json(tests.fx_id('a')), '-', '[F2.0-a c2] a''s answers are still there');
select is(tests.dml_as('anon', '', 'delete from nestly.recovery_answers', false), 'ERR:42501', '[F2.0-a c12] anon cannot delete answers');
select is(tests.dml_as('app_recovery', '', 'delete from nestly.recovery_answers', false), 'ERR:42501', '[F2.0-a c12] app_recovery cannot delete answers');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('c'), pg_temp.sid(1)), 'delete from nestly.recovery_answers', false), 'OK:0',
  '[F2.0-a c9] an identity with no row deletes nothing');

select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2)), 'delete from nestly.recovery_answers', true), 'OK:1',
  '[F2.0-a c1 c2 D1] while b''s own row is pending, b''s answers are deleted (no WHERE, no RETURNING)');
select is(tests.fx_recovery_answers_json(tests.fx_id('b')), '-', '[F2.0-a c2 D1] b has no answers row any more: recovery with the old answers has nothing to match (ERR-042 at the route)');
select isnt(tests.fx_recovery_answers_json(tests.fx_id('a')), '-', '[F2.0-a c2 c12] and a''s are untouched');
select lives_ok($q$ select tests.fx_link_answers_put(tests.fx_id('b'), repeat('bb', 32)) $q$, '[F2.0 fixture] b has answers again');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('b'), 'affected', pg_temp.sid(2)::uuid, timestamptz '2026-10-16 10:00:00.5+00', pg_temp.sid(2)::uuid) $q$, '[F2.0 fixture] b is now cleared');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('b'), pg_temp.sid(2)), 'delete from nestly.recovery_answers', false), 'OK:0',
  '[F2.0-a c5 c8 D1] after the clear the delete no longer applies: answers stored later (c8) are the owner''s and are not deletable here');

select lives_ok($q$ select tests.fx_link_put(tests.fx_id('s'), 'affected', pg_temp.sid(2)::uuid) $q$, '[F2.0 fixture] s (suspended) is pending');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('s'), pg_temp.sid(2)), 'delete from nestly.recovery_answers', false), 'OK:1',
  '[F2.0-a c2 Q-4] a suspended account''s answers are cleared too: the clear runs first, then ERR-037');

-- =====================================================================================================================
-- Audit (c2, c5, c7, c10, c11, c12): recovery_events from app_recovery
-- =====================================================================================================================
select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F2.0-a c2] declare handle aa, ip cc');
select is(tests.as_role('app_recovery', tests.claims(tests.fx_id('a')), 'select nestly.recovery_subject()::text'), tests.fx_id('a')::text,
  '[F2.0-a c12] recovery_subject() is the transaction''s sub');
select is(tests.as_role('app_recovery', '', 'select nestly.recovery_subject()::text'), null, '[F2.0-a c12] with no claims there is no subject');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select nestly.recovery_subject()::text'), 'ERR:42501', '[F2.0-a c12] authenticated cannot call recovery_subject()');

select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('a')), pg_temp.ev('takeover_cleared', tests.fx_id('a')::text, repeat('aa', 32), repeat('cc', 32)), true), 'OK:1',
  '[F2.0-a c2] the clear row is appended for the transaction''s own subject');
select is(tests.fx_link_event_kinds(tests.fx_id('a')), 'takeover_cleared', '[F2.0-a c2] and it is the only row for a');
select alike(tests.dml_as_msg('app_recovery', tests.claims(tests.fx_id('a')), pg_temp.ev('takeover_cleared', tests.fx_id('a')::text, repeat('aa', 32), repeat('cc', 32)), false),
  'ERR:23505:%', '[F2.0-a c5] a second takeover_cleared for the same user is a unique violation: exactly one clear audit row, even under a race');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('b')), pg_temp.ev('takeover_cleared', tests.fx_id('a')::text, repeat('aa', 32), repeat('cc', 32)), false), 'ERR:42501',
  '[F2.0-a c12] an event cannot be attributed to a user other than the transaction''s subject');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('a')), pg_temp.ev('password_set_forced', tests.fx_id('b')::text, repeat('aa', 32), repeat('cc', 32)), false), 'ERR:42501',
  '[F2.0-a c7 c12] password_set_forced cannot name another user');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('a')), pg_temp.ev('password_set_forced', tests.fx_id('a')::text, repeat('aa', 32), repeat('cc', 32)), false), 'OK:1',
  '[F2.0-a c7] password_set_forced is appended for the subject');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('a')), pg_temp.ev('takeover_cleared', tests.fx_id('a')::text, repeat('bb', 32), repeat('cc', 32)), false), 'ERR:42501',
  '[F2.0-a c12] the handle hash must be the declared one');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('a')), pg_temp.ev('takeover_cleared', tests.fx_id('a')::text, repeat('aa', 32), repeat('dd', 32)), false), 'ERR:42501',
  '[F2.0-a c12] the IP hash must be the declared one');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('a')), pg_temp.ev('reset_failed', tests.fx_id('f3')::text, repeat('ee', 32), repeat('cc', 32)), false), 'ERR:42501',
  '[F2.0-a c12] the subject policy does not widen to the other kinds: reset_failed for a handle with no answers still needs the handle-bound path');

-- c9 / c11: no users row, user_id NULL for exactly two kinds
select is(pg_temp.decl(repeat('ee', 32), repeat('cc', 32)), repeat('ee', 32) || '/' || repeat('cc', 32), '[F2.0-a c9 c11] declare a handle with no answers (an unregistered Auth user)');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('f1')), pg_temp.ev('takeover_cleared', null, repeat('ee', 32), repeat('cc', 32)), false), 'OK:1',
  '[F2.0-a c9] takeover_cleared with no user is accepted (the unregistered variant has no account row)');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('f1')), pg_temp.ev('first_password_set', null, repeat('ee', 32), repeat('cc', 32)), false), 'OK:1',
  '[F2.0-a c11] first_password_set with no user is accepted (the F1.8 completion has no account row yet)');
select is(tests.dml_as('app_recovery', tests.claims(tests.fx_id('f1')), pg_temp.ev('first_password_set', tests.fx_id('f1')::text, repeat('ee', 32), repeat('cc', 32)), false), 'OK:1',
  '[F2.0-a c11] first_password_set with the subject''s own id is accepted');
select alike(tests.dml_as_msg('app_recovery', tests.claims(tests.fx_id('f1')), pg_temp.ev('password_set_forced', null, repeat('ee', 32), repeat('cc', 32)), false), 'ERR:%',
  '[F2.0-a c7] password_set_forced always knows its account: with no user it is refused');
select alike(tests.dml_as_msg('app_recovery', tests.claims(tests.fx_id('f1')), pg_temp.ev('password_changed', null, repeat('ee', 32), repeat('cc', 32)), false), 'ERR:%',
  '[F2.0-a c10] password_changed with no user is refused (a change always has saved answers, hence an account)');

-- c10: the change kinds go through the existing handle-bound policy (answers exist under the declared handle)
select is(pg_temp.decl(repeat('aa', 32), repeat('cc', 32)), repeat('aa', 32) || '/' || repeat('cc', 32), '[F2.0-a c10] declare a''s handle');
select is(
  tests.dml_as('app_recovery', '',
    format($q$ insert into nestly.recovery_events (kind, user_id, handle_hash, ip_hash)
        select k, %L::uuid, decode(repeat('aa', 32), 'hex'), decode(repeat('cc', 32), 'hex')
          from unnest(array['password_changed', 'password_change_failed', 'password_change_limited', 'password_change_auth_failed']) as k $q$, tests.fx_id('a')), false),
  'OK:4', '[F2.0-a c10] the four change kinds are appended for the owner of the declared handle');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('password_changed', tests.fx_id('b')::text, repeat('aa', 32), repeat('cc', 32)), false), 'ERR:42501',
  '[F2.0-a c10 c12] a change event cannot be attributed to another account than the handle''s');
select is(tests.dml_as('app_recovery', '', pg_temp.ev('password_change_bogus', tests.fx_id('a')::text, repeat('aa', 32), repeat('cc', 32)), false), 'ERR:23514',
  '[F2.0-a c10] an unknown kind is refused');
select is(tests.dml_as('app_recovery', '', 'update nestly.recovery_events set kind = kind', false), 'ERR:42501', '[F2.0-a c2] the audit cannot be updated');
select is(tests.dml_as('app_recovery', '', 'delete from nestly.recovery_events', false), 'ERR:42501', '[F2.0-a c2] the audit cannot be deleted from');
select is(tests.dml_as('authenticated', pg_temp.cl(tests.fx_id('a'), pg_temp.sid(1)), pg_temp.ev('takeover_cleared', tests.fx_id('a')::text, repeat('aa', 32), repeat('cc', 32)), false), 'ERR:42501',
  '[F2.0-a c2 c12] the caller''s own session cannot write the audit; only the recovery role can');

select * from finish();

rollback;
