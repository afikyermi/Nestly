-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.1 own profile view and edit).
-- Source of expected values: .work/profile-view-edit/spec.md (criteria 5, 7, 8, 9, 10, 11, 13) and schema.md "pgTAP --
-- required" (the 11 checks), not the migration text. Criterion numbers below are the spec's.
-- People (fixtures of supabase/tests/setup/): a regular active 'Alice Aaron'/woman; b regular active 'Bella Baruch'/no gender;
-- s suspended; x banned; c an Auth user with no users row. Everything rolls back with the transaction.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.1 c13] session_user is app_server (this file must not run under another login)');

select is(tests.fx_profile(tests.fx_id('a')), 'Alice Aaron/woman', '[F2.1 fixture] a before');
select is(tests.fx_profile(tests.fx_id('b')), 'Bella Baruch/-',    '[F2.1 fixture] b before');

create temp table zz_state as select tests.fx_state() as s0, tests.fx_profile(tests.fx_id('b')) as b0;

create function pg_temp.upd(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(tests.fx_id(p_who)), p_sql, p_keep)
$f$;

-- =====================================================================================================================
-- 1. Structure (c10, c13)
-- =====================================================================================================================
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'regular_profiles' and pol.polname = 'regular_profiles_update_own'
      and pol.polcmd = 'w'
      and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]),
  1::bigint,
  '[F2.1 c10 c11] policy regular_profiles_update_own exists: UPDATE only, TO authenticated only');

select ok(
  (select pg_get_expr(pol.polqual, pol.polrelid) like '%is_active_account%'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'regular_profiles' and pol.polname = 'regular_profiles_update_own'),
  '[F2.1 c11 A9 rule 15] the USING clause of the update policy runs through is_active_account()');
select ok(
  (select pg_get_expr(pol.polwithcheck, pol.polrelid) like '%is_active_account%'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'regular_profiles' and pol.polname = 'regular_profiles_update_own'),
  '[F2.1 c11 A9 rule 15] and so does the WITH CHECK clause');

select set_eq(
  $$ select a.attname::text
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'nestly' and c.relname = 'regular_profiles' and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') $$,
  $$ values ('full_name'), ('gender') $$,
  '[F2.1 c9 c10 rules 12, 14] authenticated can UPDATE exactly full_name and gender of regular_profiles');
select is(has_table_privilege('authenticated', 'nestly.regular_profiles', 'UPDATE'), false,
  '[F2.1 c10 rule 12] no table-level UPDATE on regular_profiles (per column only)');
select is(has_table_privilege('authenticated', 'nestly.regular_profiles', 'DELETE'), false,
  '[F2.1 c10] no DELETE on regular_profiles');
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'regular_profiles' and pol.polcmd in ('d', '*')),
  0::bigint,
  '[F2.1 c10] no DELETE or ALL policy on regular_profiles');
-- c13 (no SECURITY DEFINER function, approved list empty) is asserted once, in files 10, 20 and 40: not repeated here.

-- =====================================================================================================================
-- 2. A active: the values land as sent (c5, c7)
-- =====================================================================================================================
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'דנה כהן', gender = 'woman' $q$), 'OK:1',
  '[F2.1 c5 AC-015] A updates own name and gender: 1 row');
select is(tests.fx_profile(tests.fx_id('a')), 'דנה כהן/woman', '[F2.1 c5] stored as sent');

select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set full_name = %L $q$, 'אב')), 'OK:1',
  '[F2.1 c5 VAL-001] a 2-character name is accepted');
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set full_name = %L $q$, repeat('x', 60))), 'OK:1',
  '[F2.1 c5 VAL-001] a 60-character name is accepted');
select is(tests.fx_profile(tests.fx_id('a')), repeat('x', 60) || '/woman', '[F2.1 c5] the 60-character name is stored whole');

select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set gender = %L $q$, g.v)), 'OK:1',
  '[F2.1 c7 VAL-006] gender ' || g.v || ' is accepted')
from (values ('woman'), ('man'), ('other'), ('prefer_not_to_say')) as g(v);
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set gender = 'man' $q$), 'OK:1', '[F2.1 c7] set man');
select is(tests.fx_profile(tests.fx_id('a')), repeat('x', 60) || '/man', '[F2.1 c7 VAL-006] man is stored exactly');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set gender = null $q$), 'OK:1', '[F2.1 c7 VAL-006] gender back to NULL: 1 row');
select is(tests.fx_profile(tests.fx_id('a')), repeat('x', 60) || '/-', '[F2.1 c7 Q3] NULL is stored (not answered)');

-- RETURNING (the repository shape) works under RLS and gives the new values (schema check 11)
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.regular_profiles set full_name = 'רון לוי', gender = 'man' returning full_name || '/' || coalesce(gender, '-') $q$),
  'רון לוי/man',
  '[F2.1 c5 schema-11] UPDATE ... RETURNING full_name, gender as active A returns the new values');

-- =====================================================================================================================
-- 3. Own row only (c10)
-- =====================================================================================================================
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'Everyone' $q$), 'OK:1',
  '[F2.1 c10 A1] UPDATE with no WHERE touches exactly one row: A''s own');
select is(tests.fx_profile(tests.fx_id('b')), (select b0 from zz_state), '[F2.1 c10 A1] B''s row is unchanged after the no-WHERE update');

select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'Not Bella', gender = 'man' where user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$), 'OK:0',
  '[F2.1 c10 A1] UPDATE of B''s row by A: 0 rows');
select is(tests.fx_profile(tests.fx_id('b')), (select b0 from zz_state), '[F2.1 c10 A1] B''s row is unchanged');
select is(pg_temp.upd('b', $q$ update nestly.regular_profiles set full_name = 'Hijack' where user_id = 'a0000000-0000-4000-8000-0000000000a1' $q$), 'OK:0',
  '[F2.1 c10 A1] and the other way round: B on A''s row, 0 rows');
select is(tests.fx_profile(tests.fx_id('a')), 'Everyone/man', '[F2.1 c10] A''s row is what A set, untouched by B');

select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$), 'ERR:42501',
  '[F2.1 c9 c10 rule 12] UPDATE of user_id: refused by privilege');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set account_type = 'regular' $q$), 'ERR:42501',
  '[F2.1 c9 c10 rule 12] UPDATE of account_type: refused by privilege');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set created_at = now() $q$), 'ERR:42501',
  '[F2.1 c9 c10 rule 12] UPDATE of created_at: refused by privilege');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'Okay Name', user_id = user_id $q$), 'ERR:42501',
  '[F2.1 c9 c10] a granted column together with a forbidden one: the whole statement is refused');
select is(pg_temp.upd('a', $q$ delete from nestly.regular_profiles where user_id = auth.uid() $q$), 'ERR:42501',
  '[F2.1 c10] DELETE of own row: refused (no grant)');
select is(pg_temp.upd('a', $q$ update nestly.users set status = 'active' where id = auth.uid() $q$), 'ERR:42501',
  '[F2.1 spec "users read only"] users stays read only for the owner');

-- =====================================================================================================================
-- 4. Not an active account: nothing (c11)
-- =====================================================================================================================
create temp table zz_before_s as select tests.fx_profile(tests.fx_id('a')) as p;
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F2.1 fixture] a suspended');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'While Suspended' where user_id = auth.uid() $q$), 'OK:0',
  '[F2.1 c11 A9 BR-024] suspended A: UPDATE of own row affects 0 rows');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')), 'select count(*)::text from nestly.regular_profiles'), '0',
  '[F2.1 c11 A9] suspended A reads nothing of own profile');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'While Suspended' returning full_name $q$), 'OK:0',
  '[F2.1 c11] suspended A: UPDATE ... RETURNING returns no row');
select is(tests.fx_profile(tests.fx_id('a')), (select p from zz_before_s), '[F2.1 c11] the row is unchanged while suspended');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F2.1 fixture] a banned');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'While Banned' $q$), 'OK:0',
  '[F2.1 c11 A9] banned A: UPDATE affects 0 rows');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '0', '[F2.1 c11 A9] banned A reads nothing of own profile');
select is(tests.fx_profile(tests.fx_id('a')), (select p from zz_before_s), '[F2.1 c11] the row is unchanged while banned');
select is(pg_temp.upd('s', $q$ update nestly.regular_profiles set full_name = 'Sara Changed' $q$), 'OK:0',
  '[F2.1 c11] the fixture suspended account s: 0 rows');
select is(pg_temp.upd('x', $q$ update nestly.regular_profiles set full_name = 'Xenia Changed' $q$), 'OK:0',
  '[F2.1 c11] the fixture banned account x: 0 rows');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F2.1 fixture] a active again');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'Back Again' $q$), 'OK:1',
  '[F2.1 c11] active again: the same UPDATE affects 1 row');

-- link verdict gate (F2.0): pending, stale, unchecked oauth -> nothing
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', '00000001-1111-4111-8111-111111111111'::uuid) $q$,
  '[F2.1 fixture] a link check pending');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('a'), '{"session_id":"00000001-1111-4111-8111-111111111111","amr":[{"method":"oauth"}]}'),
    $q$ update nestly.regular_profiles set full_name = 'While Pending' $q$),
  'OK:0',
  '[F2.1 c11 rule 15] pending link check: UPDATE affects 0 rows');
select is(tests.fx_profile(tests.fx_id('a')), 'Back Again/man', '[F2.1 c11] unchanged while pending');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', '00000001-1111-4111-8111-111111111111'::uuid,
    timestamptz '2026-10-16 10:00:00.5+00', '00000001-1111-4111-8111-111111111111'::uuid) $q$,
  '[F2.1 fixture] a link check cleared, password not yet set');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('a'), '{"session_id":"00000002-1111-4111-8111-111111111111","iat":1792144799,"amr":[{"method":"oauth"}]}'),
    $q$ update nestly.regular_profiles set full_name = 'Stale Token' $q$),
  'OK:0',
  '[F2.1 c11 rule 15] a stale token (issued before the clear): UPDATE affects 0 rows');
select is(tests.fx_profile(tests.fx_id('a')), 'Back Again/man', '[F2.1 c11] unchanged for the stale token');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'unaffected', '00000001-1111-4111-8111-111111111111'::uuid) $q$, '[F2.1 fixture] a unaffected');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('b'), '{"amr":[{"method":"oauth"}]}'),
    $q$ update nestly.regular_profiles set full_name = 'Unchecked Oauth' $q$),
  'OK:0',
  '[F2.1 c11 rule 15] an oauth token whose link was never checked (no link row): UPDATE affects 0 rows');

-- =====================================================================================================================
-- 5. CHECKs fire on UPDATE (c5, c6, c8) -- 15_identity_full_name_parity.sql holds the full VAL-001 table
-- =====================================================================================================================
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = ' ' $q$, false), 'ERR:23514', '[F2.1 c6 c8 VAL-001] full_name of one space: 23514');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = 'x' $q$, false), 'ERR:23514', '[F2.1 c6 c8 VAL-001] 1 character: 23514');
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set full_name = %L $q$, repeat('x', 61)), false), 'ERR:23514',
  '[F2.1 c6 c8 VAL-001] 61 characters: 23514');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set gender = 'female' $q$, false), 'ERR:23514',
  '[F2.1 c8 VAL-006] gender outside the four: 23514');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set full_name = null $q$, false), 'ERR:23502',
  '[F2.1 c8] full_name NULL: 23502 (not null)');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set gender = 'woman); drop table nestly.users;--' $q$, false), 'ERR:23514',
  '[F2.1 c8 S2 hostile] a hostile gender string is data and fails the CHECK');

-- =====================================================================================================================
-- 6. anon and app_server itself (c10, c13)
-- =====================================================================================================================
select is(tests.dml_as('anon', tests.claims(tests.fx_id('a')), $q$ update nestly.regular_profiles set full_name = 'Anon' $q$), 'ERR:42501',
  '[F2.1 c12 c13] anon UPDATE: refused');
select is(tests.dml_as('none', tests.claims(tests.fx_id('a')), $q$ update nestly.regular_profiles set full_name = 'Srv' $q$), 'ERR:42501',
  '[F2.1 c13 A8 rule 3] app_server without SET ROLE: refused');
select is(tests.dml_as('authenticated', '', $q$ update nestly.regular_profiles set full_name = 'No Claims' $q$), 'OK:0',
  '[F2.1 c12] authenticated with no claims (no identity): 0 rows');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('c')), $q$ update nestly.regular_profiles set full_name = 'Cora' $q$), 'OK:0',
  '[F2.1 c12 Q4] an Auth user with no account row: 0 rows, nothing created');
select is(tests.n_as(tests.fx_id('c'), 'nestly.regular_profiles'), '0', '[F2.1 c12] and no row exists for that identity');

-- =====================================================================================================================
-- 7. Nothing leaked to others
-- =====================================================================================================================
select is(tests.fx_profile(tests.fx_id('b')), (select b0 from zz_state), '[F2.1 c10 A1] after the whole file, B''s profile is what it was');
select is(tests.fx_profile(tests.fx_id('s')), 'Sara Suspended/other', '[F2.1 c11] suspended S''s profile is untouched');
select is(tests.fx_profile(tests.fx_id('x')), 'Xenia Banned/prefer_not_to_say', '[F2.1 c11] banned X''s profile is untouched');

select * from finish();

rollback;
