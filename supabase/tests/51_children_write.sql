-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.2a journeys and children: view, add, edit).
-- Source of expected values: .work/journeys-children/spec.md (criteria 6, 7, 9, 10, 11) and schema.md "pgTAP -- required"
-- (checks 1-9), not the migration text. Criterion numbers below are the spec's.
-- People (fixtures of supabase/tests/setup/): a regular active, journeys pregnant (2027-03-01) + has_child, children slot 1
-- Noa/girl/2024-05-10 and slot 2 Eli/boy/2022-01-15; b regular active, journey planning, child slot 1 Tali/unknown/2025-02-02;
-- s suspended; x banned; c an Auth user with no users row. Everything rolls back with the transaction.
-- The concurrency of c6 (9 + 2, 5 + 2) and the atomicity of c7 are server db tests (apps/server/tests/db/children.db.test.ts).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.2-a c11] session_user is app_server (this file must not run under another login)');

select is(tests.fx_children(tests.fx_id('a')), '1:Noa:girl:2024-05-10 ; 2:Eli:boy:2022-01-15', '[F2.2-a fixture] a''s children before');
select is(tests.fx_children(tests.fx_id('b')), '1:Tali:unknown:2025-02-02', '[F2.2-a fixture] b''s child before');
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-a fixture] a''s journeys before');
select is(tests.fx_journeys(tests.fx_id('b')), 'planning:null', '[F2.2-a fixture] b''s journey before');

create temp table zz_state as select
  tests.fx_children(tests.fx_id('b')) as b_children, tests.fx_journeys(tests.fx_id('b')) as b_journeys,
  tests.fx_journeys(tests.fx_id('a')) as a_journeys,
  tests.fx_child_id(tests.fx_id('a'), 1) as a1, tests.fx_child_id(tests.fx_id('a'), 2) as a2,
  tests.fx_child_id(tests.fx_id('b'), 1) as b1;

create function pg_temp.upd(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(tests.fx_id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.rel(p_name text) returns oid language sql as $f$
  select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'nestly' and c.relname = p_name
$f$;

-- =====================================================================================================================
-- 1. Structure (c9, c10, c11)
-- =====================================================================================================================
select is(
  (select count(*) from pg_catalog.pg_policy pol
    where pol.polrelid = pg_temp.rel('children') and pol.polname = 'children_update_own' and pol.polcmd = 'w'
      and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]),
  1::bigint,
  '[F2.2-a c9 schema-1] policy children_update_own exists: UPDATE only, TO authenticated only');
select ok(
  (select pg_get_expr(pol.polqual, pol.polrelid) like '%is_active_account%' and pg_get_expr(pol.polqual, pol.polrelid) like '%auth.uid()%'
     from pg_catalog.pg_policy pol where pol.polrelid = pg_temp.rel('children') and pol.polname = 'children_update_own'),
  '[F2.2-a c9 c10 A9 rule 15] the USING clause of children_update_own is own-row (auth.uid()) and runs through is_active_account()');
select ok(
  (select pg_get_expr(pol.polwithcheck, pol.polrelid) like '%is_active_account%' and pg_get_expr(pol.polwithcheck, pol.polrelid) like '%auth.uid()%'
     from pg_catalog.pg_policy pol where pol.polrelid = pg_temp.rel('children') and pol.polname = 'children_update_own'),
  '[F2.2-a c9 c10 A9 rule 15] and so does its WITH CHECK clause');

select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'nestly' and c.relname = 'children')
        and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  $$ values ('name'), ('sex'), ('birth_date') $$,
  '[F2.2-a c8 c9 DR-5 rules 12, 14] authenticated can UPDATE exactly name, sex and birth_date of children');
select is(has_table_privilege('authenticated', pg_temp.rel('children'), 'UPDATE'), false,
  '[F2.2-a c9 rule 12] no table-level UPDATE on children (per column only)');
-- F2.2b1 (schema.md F2.2b "Amend"): journey_contexts gained UPDATE (due_date) behind journey_contexts_update_own; file 54 asserts it.
select is(has_table_privilege('authenticated', pg_temp.rel('journey_contexts'), 'UPDATE'), false,
  '[F2.2-a scope · F2.2-b c18 re-graded] no table-level UPDATE on journey_contexts (its one UPDATE column, due_date, is file 54''s)');
-- F2.2b2 (spec.md "Gate 1 (F2.2b)", change control: c9's "DELETE on either table is denied" is replaced by c18, own-row DELETE only,
-- Afik's DR-1 A): the DELETE grant and the two own-row policies are asserted in file 54. Kept here: no ALL policy, no TRUNCATE.
select is(has_table_privilege('authenticated', pg_temp.rel('children'), 'TRUNCATE'), false, '[F2.2-a c9 · F2.2-b c18 re-graded] no TRUNCATE on children');
select is(has_table_privilege('authenticated', pg_temp.rel('journey_contexts'), 'TRUNCATE'), false, '[F2.2-a c9 · F2.2-b c18 re-graded] no TRUNCATE on journey_contexts');
select is(
  (select count(*) from pg_catalog.pg_policy pol
    where pol.polrelid in (pg_temp.rel('children'), pg_temp.rel('journey_contexts')) and pol.polcmd = '*'),
  0::bigint,
  '[F2.2-a c9 · F2.2-b c18 re-graded] no ALL policy on children or journey_contexts (the DELETE policies: file 54)');

-- =====================================================================================================================
-- 2. Reads: own rows only (c9)
-- =====================================================================================================================
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select string_agg(slot || ':' || name, ',' order by slot) from nestly.children $q$),
  '1:Noa,2:Eli', '[F2.2-a c9 A1] A reads exactly its own 2 children (no WHERE: RLS confines)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select string_agg(stage, ',' order by stage) from nestly.journey_contexts $q$),
  'has_child,pregnant', '[F2.2-a c9 A1] A reads exactly its own 2 journeys');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')),
    $q$ select string_agg(slot || ':' || name, ',' order by slot) from nestly.children $q$),
  '1:Tali', '[F2.2-a c9 A1] B reads only its own child');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')),
    $q$ select string_agg(stage, ',' order by stage) from nestly.journey_contexts $q$),
  'planning', '[F2.2-a c9 A1] B reads only its own journey');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('b')),
    format($q$ select count(*)::text from nestly.children where id = %L $q$, (select a1 from zz_state))),
  '0', '[F2.2-a c9 A1 enumeration] B naming A''s child id directly reads nothing');

-- =====================================================================================================================
-- 3. UPDATE: own rows only; only the three columns (c8, c9)
-- =====================================================================================================================
select is(pg_temp.upd('a', format($q$ update nestly.children set name = 'נועה', sex = 'girl', birth_date = date '2023-05-04' where id = %L $q$,
    (select a1 from zz_state))), 'OK:1',
  '[F2.2-a c8 schema-3] A updates name, sex and birth date of its own slot-1 child by id: 1 row');
select is(tests.fx_children(tests.fx_id('a')), '1:נועה:girl:2023-05-04 ; 2:Eli:boy:2022-01-15',
  '[F2.2-a c8] stored as sent; slot 2 untouched; the slot (order) is unchanged');

select is(pg_temp.upd('a', $q$ update nestly.children set sex = 'unknown' $q$), 'OK:2',
  '[F2.2-a c9 A1] UPDATE with no WHERE touches exactly A''s own 2 children');
select is(tests.fx_children(tests.fx_id('b')), (select b_children from zz_state), '[F2.2-a c9 A1] B''s child is unchanged after A''s no-WHERE update');

select is(pg_temp.upd('a', format($q$ update nestly.children set name = 'Hijacked' where id = %L $q$, (select b1 from zz_state))), 'OK:0',
  '[F2.2-a c9 A1] UPDATE of B''s child by its id: 0 rows');
select is(pg_temp.upd('a', format($q$ update nestly.children set name = 'Hijacked' where user_id = %L $q$, tests.fx_id('b'))), 'OK:0',
  '[F2.2-a c9 A1] UPDATE of B''s children by B''s user id: 0 rows');
select is(tests.fx_children(tests.fx_id('b')), (select b_children from zz_state), '[F2.2-a c9 A1] B''s child is unchanged');
select is(pg_temp.upd('b', format($q$ update nestly.children set name = 'Hijacked' where id = %L $q$, (select a2 from zz_state))), 'OK:0',
  '[F2.2-a c9 A1] and the other way round: B on A''s child, 0 rows');
select is(tests.fx_children(tests.fx_id('a')), '1:נועה:unknown:2023-05-04 ; 2:Eli:unknown:2022-01-15',
  '[F2.2-a c9] A''s children are what A set, untouched by B');

select is(pg_temp.upd('a', t.s), 'ERR:42501', '[F2.2-a c9 rules 12, 14 schema-3] refused by privilege (42501): ' || t.label)
from (values
  (format($q$ update nestly.children set user_id = %L $q$, tests.fx_id('b')), 'UPDATE of user_id (move a child to B)'),
  ($q$ update nestly.children set user_id = auth.uid() $q$, 'UPDATE of user_id to its own value'),
  ($q$ update nestly.children set slot = 9 where slot = 2 $q$, 'UPDATE of slot'),
  ($q$ update nestly.children set slot = slot $q$, 'UPDATE of slot to itself'),
  ($q$ update nestly.children set created_at = now() $q$, 'UPDATE of created_at'),
  ($q$ update nestly.children set id = gen_random_uuid() where slot = 1 $q$, 'UPDATE of id'),
  ($q$ update nestly.children set name = 'Okay', slot = 3 where slot = 1 $q$, 'a granted column together with slot: the whole statement'),
  ($q$ update nestly.journey_contexts set stage = 'planning' $q$, 'UPDATE of a journey stage (DR-5: a stage changes only by add or end)')
) as t(s, label);
select is(tests.fx_children(tests.fx_id('a')), '1:נועה:unknown:2023-05-04 ; 2:Eli:unknown:2022-01-15', '[F2.2-a c9] nothing changed by the refused UPDATEs');
select is(tests.fx_journeys(tests.fx_id('a')), (select a_journeys from zz_state), '[F2.2-a c9] A''s journeys unchanged');

-- =====================================================================================================================
-- 4. INSERT naming an owner (c9); DELETE re-graded by F2.2b2 (c18: own rows only, file 54; another account's rows: 0 rows)
-- =====================================================================================================================
select is(pg_temp.upd(t.who, t.s), 'ERR:42501', '[F2.2-a c9 A1 rule 12 schema-4] refused (42501): ' || t.who || ' ' || t.label)
from (values
  ('a', format($q$ insert into nestly.children (user_id, slot, name, sex, birth_date) values (%L, 5, 'Planted', 'boy', date '2020-01-01') $q$, tests.fx_id('b')), 'INSERT a child naming user_id B'),
  ('a', format($q$ insert into nestly.children (user_id, slot, name, sex, birth_date) values (%L, 5, 'Own', 'boy', date '2020-01-01') $q$, tests.fx_id('a')), 'INSERT a child naming its own user_id'),
  ('a', format($q$ insert into nestly.journey_contexts (user_id, stage) values (%L, 'has_child') $q$, tests.fx_id('b')), 'INSERT a has_child journey naming user_id B')
) as t(who, s, label);
select is(pg_temp.upd(t.who, t.s), 'OK:0', '[F2.2-a c9 · F2.2-b c18 re-graded] ' || t.who || ' ' || t.label || ': 0 rows')
from (values
  ('a', format($q$ delete from nestly.children where id = %L $q$, (select b1 from zz_state)), 'DELETE B''s child'),
  ('a', format($q$ delete from nestly.journey_contexts where user_id = %L $q$, tests.fx_id('b')), 'DELETE B''s journey')
) as t(who, s, label);
select is(tests.fx_counts(tests.fx_id('a')), '1/1/2/2/1', '[F2.2-a c9] A still has its 2 journeys and 2 children');
select is(tests.fx_children(tests.fx_id('b')) || ' / ' || tests.fx_journeys(tests.fx_id('b')),
  (select b_children || ' / ' || b_journeys from zz_state), '[F2.2-a c9 A1] B''s child and journey are unchanged');

-- =====================================================================================================================
-- 5. The add path's shapes (c6, c7)
-- =====================================================================================================================
select is(pg_temp.upd('a', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$), 'OK:0',
  '[F2.2-a c7 DR-4 schema-5] A, who has a has_child journey: has_child INSERT ... ON CONFLICT DO NOTHING inserts 0 rows (no error)');
select is(tests.fx_journeys(tests.fx_id('a')), (select a_journeys from zz_state), '[F2.2-a c7] A still has exactly one has_child journey');
select is(pg_temp.upd('b', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$, false), 'OK:1',
  '[F2.2-a c7 DR-4 schema-5] B, without one: the same statement inserts 1 row');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Taken', 'boy', date '2020-01-01') on conflict do nothing $q$), 'OK:0',
  '[F2.2-a c6 schema-5] a child into a taken slot ON CONFLICT DO NOTHING: 0 rows, not 23505');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (3, 'Third', 'boy', date '2020-01-01') on conflict do nothing returning id $q$, false), 'OK:1',
  '[F2.2-a c3 c6] a child into a free slot: 1 row');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (11, 'Eleventh', 'boy', date '2020-01-01') on conflict do nothing $q$, false), 'ERR:23514',
  '[F2.2-a c6 VAL-040 schema-5] slot 11: 23514 (the CHECK holds the limit of 10)');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (0, 'Zeroth', 'boy', date '2020-01-01') on conflict do nothing $q$, false), 'ERR:23514',
  '[F2.2-a c6 boundary] slot 0: 23514');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (10, 'Tenth', 'boy', date '2020-01-01') $q$, false), 'OK:1',
  '[F2.2-a c6 boundary] slot 10 is accepted');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (-1, 'Negative', 'boy', date '2020-01-01') $q$, false), 'ERR:23514',
  '[F2.2-a c6 boundary] a negative slot: 23514');

-- =====================================================================================================================
-- 6. Not an active account: nothing (c10)
-- =====================================================================================================================
create temp table zz_before_s as select tests.fx_children(tests.fx_id('a')) as ch, tests.fx_journeys(tests.fx_id('a')) as jo;
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F2.2-a fixture] a suspended');
select is(tests.n_as(tests.fx_id('a'), 'nestly.children'), '0', '[F2.2-a c10 A9] suspended A reads 0 children');
select is(tests.n_as(tests.fx_id('a'), 'nestly.journey_contexts'), '0', '[F2.2-a c10 A9] suspended A reads 0 journeys');
select is(pg_temp.upd('a', $q$ update nestly.children set name = 'While Suspended' $q$), 'OK:0', '[F2.2-a c10 A9] suspended A: UPDATE of own children affects 0 rows');
select is(pg_temp.upd('a', format($q$ update nestly.children set name = 'While Suspended' where id = %L $q$, (select a1 from zz_state))), 'OK:0',
  '[F2.2-a c10 A9] suspended A: UPDATE by id affects 0 rows');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (3, 'While Suspended', 'boy', date '2020-01-01') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-a c10 A9] suspended A: INSERT of a child is refused (42501)');
select is(pg_temp.upd('a', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-a c10 A9] suspended A: the has_child INSERT is refused (42501)');
select is(tests.fx_children(tests.fx_id('a')) || ' / ' || tests.fx_journeys(tests.fx_id('a')), (select ch || ' / ' || jo from zz_before_s),
  '[F2.2-a c10] nothing changed while suspended');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F2.2-a fixture] a banned');
select is(tests.n_as(tests.fx_id('a'), 'nestly.children'), '0', '[F2.2-a c10 A9] banned A reads 0 children');
select is(tests.n_as(tests.fx_id('a'), 'nestly.journey_contexts'), '0', '[F2.2-a c10 A9] banned A reads 0 journeys');
select is(pg_temp.upd('a', $q$ update nestly.children set name = 'While Banned' $q$), 'OK:0', '[F2.2-a c10 A9] banned A: UPDATE affects 0 rows');
select is(pg_temp.upd('a', $q$ insert into nestly.children (slot, name, sex, birth_date) values (3, 'While Banned', 'boy', date '2020-01-01') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-a c10 A9] banned A: INSERT of a child is refused (42501)');
select is(pg_temp.upd('a', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-a c10 A9] banned A: the has_child INSERT is refused (42501)');
select is(tests.fx_children(tests.fx_id('a')) || ' / ' || tests.fx_journeys(tests.fx_id('a')), (select ch || ' / ' || jo from zz_before_s),
  '[F2.2-a c10] nothing changed while banned');
select is(pg_temp.upd(t.who, $q$ update nestly.children set name = 'Stopped' $q$), 'OK:0', '[F2.2-a c10] the fixture account ' || t.who || ': UPDATE affects 0 rows')
from (values ('s'), ('x')) as t(who);
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F2.2-a fixture] a active again');
select is(pg_temp.upd('a', format($q$ update nestly.children set name = 'Back Again' where id = %L $q$, (select a1 from zz_state))), 'OK:1',
  '[F2.2-a c10] active again: the same UPDATE affects 1 row');

-- link verdict gate (F2.0): pending, stale, unchecked oauth -> nothing
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', '00000001-1111-4111-8111-111111111111'::uuid) $q$,
  '[F2.2-a fixture] a link check pending');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('a'), '{"session_id":"00000001-1111-4111-8111-111111111111","amr":[{"method":"oauth"}]}'),
    $q$ update nestly.children set name = 'While Pending' $q$),
  'OK:0', '[F2.2-a c10 rule 15] pending link check: UPDATE of children affects 0 rows');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a'), '{"session_id":"00000001-1111-4111-8111-111111111111","amr":[{"method":"oauth"}]}'),
    $q$ select count(*)::text from nestly.children $q$),
  '0', '[F2.2-a c10 rule 15] pending link check: 0 children read');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'affected', '00000001-1111-4111-8111-111111111111'::uuid,
    timestamptz '2026-10-16 10:00:00.5+00', '00000001-1111-4111-8111-111111111111'::uuid) $q$,
  '[F2.2-a fixture] a link check cleared, password not yet set');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('a'), '{"session_id":"00000002-1111-4111-8111-111111111111","iat":1792144799,"amr":[{"method":"oauth"}]}'),
    $q$ update nestly.children set name = 'Stale Token' $q$),
  'OK:0', '[F2.2-a c10 rule 15] a stale token (issued before the clear): UPDATE affects 0 rows');
select lives_ok($q$ select tests.fx_link_put(tests.fx_id('a'), 'unaffected', '00000001-1111-4111-8111-111111111111'::uuid) $q$, '[F2.2-a fixture] a unaffected');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('b'), '{"amr":[{"method":"oauth"}]}'),
    $q$ update nestly.children set name = 'Unchecked Oauth' $q$),
  'OK:0', '[F2.2-a c10 rule 15] an oauth token whose link was never checked: UPDATE affects 0 rows');
select is(tests.fx_children(tests.fx_id('a')), '1:Back Again:unknown:2023-05-04 ; 2:Eli:unknown:2022-01-15', '[F2.2-a c10] unchanged by the gated tokens');

-- c: an Auth user with no users row
select is(tests.n_as(tests.fx_id('c'), 'nestly.children'), '0', '[F2.2-a c10 F2.1 DR-T1] c (no account row) reads 0 children');
select is(tests.n_as(tests.fx_id('c'), 'nestly.journey_contexts'), '0', '[F2.2-a c10] c reads 0 journeys');
select is(pg_temp.upd('c', $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Cora Child', 'girl', date '2020-01-01') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-a c10] c: INSERT of a child is refused (42501), nothing created');
select is(pg_temp.upd('c', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-a c10] c: the has_child INSERT is refused (42501)');
select is(pg_temp.upd('c', $q$ update nestly.children set name = 'Cora' $q$), 'OK:0', '[F2.2-a c10] c: UPDATE affects 0 rows');
select is(tests.fx_counts(tests.fx_id('c')), '0/0/0/0/0', '[F2.2-a c10] no row exists for c');

-- =====================================================================================================================
-- 7. CHECKs fire on UPDATE (c4, c5)
-- =====================================================================================================================
select is(pg_temp.upd('a', t.s, false), t.code, '[F2.2-a c4 c5 VAL-043 VAL-006 VAL-005 schema-7] ' || t.label || ': ' || t.code)
from (values
  ($q$ update nestly.children set name = ' ' where slot = 1 $q$, 'name of one space', 'ERR:23514'),
  ($q$ update nestly.children set name = '' where slot = 1 $q$, 'empty name', 'ERR:23514'),
  (format($q$ update nestly.children set name = %L where slot = 1 $q$, repeat('x', 61)), 'name of 61 characters', 'ERR:23514'),
  (format($q$ update nestly.children set name = %L where slot = 1 $q$, repeat('נ', 61)), 'Hebrew name of 61 characters', 'ERR:23514'),
  ($q$ update nestly.children set sex = 'female' where slot = 1 $q$, 'sex outside boy/girl/unknown', 'ERR:23514'),
  ($q$ update nestly.children set sex = 'Girl' where slot = 1 $q$, 'sex in another case', 'ERR:23514'),
  ($q$ update nestly.children set birth_date = date '1899-12-31' where slot = 1 $q$, 'birth date 1899-12-31', 'ERR:23514'),
  ($q$ update nestly.children set name = null where slot = 1 $q$, 'name NULL', 'ERR:23502'),
  ($q$ update nestly.children set sex = null where slot = 1 $q$, 'sex NULL', 'ERR:23502'),
  ($q$ update nestly.children set birth_date = null where slot = 1 $q$, 'birth date NULL', 'ERR:23502'),
  ($q$ update nestly.children set sex = 'girl''); drop table nestly.users;--' where slot = 1 $q$, 'a hostile sex string is data and fails the CHECK', 'ERR:23514'),
  (format($q$ update nestly.children set name = %L where slot = 1 $q$, 'x'), 'a 1-character name', 'OK:1'),
  (format($q$ update nestly.children set name = %L where slot = 1 $q$, repeat('נ', 60)), 'a 60-character name', 'OK:1'),
  ($q$ update nestly.children set birth_date = date '1900-01-01' where slot = 1 $q$, 'birth date 1900-01-01', 'OK:1')
) as t(s, label, code);
select is(pg_temp.upd('a', format($q$ update nestly.children set name = %L where slot = 2 $q$, 'Rob''); drop table nestly.children;--')), 'OK:1',
  '[F2.2-a c5 S2 hostile] a name shaped like SQL is stored as data');
select is(tests.fx_children(tests.fx_id('a')), '1:Back Again:unknown:2023-05-04 ; 2:Rob''); drop table nestly.children;--:unknown:2022-01-15',
  '[F2.2-a c5 S2 hostile] stored as written; slot 1 untouched by the rolled-back checks');

-- =====================================================================================================================
-- 8. anon and app_server itself (c11)
-- =====================================================================================================================
select is(tests.dml_as(t.role, tests.claims(tests.fx_id('a')), t.s), 'ERR:42501', '[F2.2-a c11 A8 rule 3 schema-8] ' || t.label || ': refused')
from (values
  ('anon', $q$ update nestly.children set name = 'Anon' $q$, 'anon UPDATE of children'),
  ('anon', $q$ insert into nestly.children (slot, name, sex, birth_date) values (4, 'Anon', 'boy', date '2020-01-01') on conflict do nothing $q$, 'anon INSERT of a child'),
  ('anon', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$, 'anon INSERT of a journey'),
  ('none', $q$ update nestly.children set name = 'Srv' $q$, 'app_server without SET ROLE: UPDATE of children'),
  ('none', $q$ insert into nestly.children (slot, name, sex, birth_date) values (4, 'Srv', 'boy', date '2020-01-01') on conflict do nothing $q$, 'app_server without SET ROLE: INSERT of a child'),
  ('none', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$, 'app_server without SET ROLE: INSERT of a journey'),
  ('none', $q$ select count(*) from nestly.children $q$, 'app_server without SET ROLE: SELECT of children')
) as t(role, s, label);
select is(tests.dml_as('authenticated', '', $q$ update nestly.children set name = 'No Claims' $q$), 'OK:0',
  '[F2.2-a c10] authenticated with no claims (no identity): 0 rows');

-- =====================================================================================================================
-- 9. RETURNING on own UPDATE gives the new values (the repository shape)
-- =====================================================================================================================
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format($q$ update nestly.children set name = 'איתי', sex = 'boy', birth_date = date '2025-01-10' where id = %L
               returning name || '/' || sex || '/' || birth_date::text $q$, (select a2 from zz_state))),
  'איתי/boy/2025-01-10',
  '[F2.2-a c8 schema-9] UPDATE ... RETURNING as active A returns the new values');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format($q$ update nestly.children set name = 'Not Mine' where id = %L returning name $q$, (select b1 from zz_state))),
  null::text,
  '[F2.2-a c9 schema-9] UPDATE ... RETURNING on B''s child returns no row (the route''s 404)');

-- =====================================================================================================================
-- Nothing leaked to others
-- =====================================================================================================================
select is(tests.fx_children(tests.fx_id('b')), (select b_children from zz_state), '[F2.2-a c9 A1] after the whole file, B''s child is what it was');
select is(tests.fx_journeys(tests.fx_id('b')), (select b_journeys from zz_state), '[F2.2-a c9 A1] and B''s journey too');
select is(tests.fx_counts(tests.fx_id('s')) || ' ' || tests.fx_counts(tests.fx_id('x')), '1/1/0/0/0 1/1/0/0/0', '[F2.2-a c10] s and x got no journey or child');

select * from finish();

rollback;
