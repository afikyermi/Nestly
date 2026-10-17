-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.2b journeys and children: pregnancy, remove, end, birth).
-- Source of expected values: .work/journeys-children/spec.md (criteria 14, 15, 18, 24) and schema.md, F2.2b section, "pgTAP — new
-- 54_journeys_write.sql" (b1 checks 1-4), not the migration text. Criterion numbers below are the spec's.
-- F2.2b1 (c14-c15: add a pregnancy, edit its due date) writes sections b1-1 .. b1-4. F2.2b2 (DELETE grants and policies, checks 5-9)
-- appends its sections after the "b2" marker below; nothing in b1's sections assumes there is no DELETE.
-- People (fixtures of supabase/tests/setup/): a regular active, journeys pregnant (2027-03-01) + has_child, children slot 1
-- Noa/girl/2024-05-10 and slot 2 Eli/boy/2022-01-15; b regular active, journey planning, child slot 1 Tali/unknown/2025-02-02;
-- s suspended; x banned; c an Auth user with no users row; f1 an Auth user given an active Regular account here, with no journey.
-- Everything rolls back with the transaction. The c15 race (two concurrent POSTs) is a server db test (tests/db/journeys.db.test.ts).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.2-b c11] session_user is app_server (this file must not run under another login)');

select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-b fixture] a''s journeys before');
select is(tests.fx_journeys(tests.fx_id('b')), 'planning:null', '[F2.2-b fixture] b''s journey before');

-- A journey's id by owner and stage, read as that owner through RLS (the suite has no unfiltered reader of journey ids by stage).
create function pg_temp.jid(p_who text, p_stage text) returns uuid language sql as $f$
  select tests.as_role('authenticated', tests.claims(tests.fx_id(p_who)),
    format($q$ select id::text from nestly.journey_contexts where stage = %L $q$, p_stage))::uuid
$f$;
create function pg_temp.upd(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(tests.fx_id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.rel(p_name text) returns oid language sql as $f$
  select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'nestly' and c.relname = p_name
$f$;

create temp table zz_jw as select
  pg_temp.jid('a', 'pregnant') as a_preg, pg_temp.jid('a', 'has_child') as a_hc, pg_temp.jid('b', 'planning') as b_plan,
  tests.fx_journeys(tests.fx_id('b')) as b_journeys, tests.fx_children(tests.fx_id('a')) as a_children;
select ok((select a_preg is not null and a_hc is not null and b_plan is not null from zz_jw),
  '[F2.2-b fixture] the three journey ids were read (the tests below are not vacuous)');

-- =====================================================================================================================
-- b1-1. Structure (c14, c18, c24)
-- =====================================================================================================================
select is(
  (select count(*) from pg_catalog.pg_policy pol
    where pol.polrelid = pg_temp.rel('journey_contexts') and pol.polname = 'journey_contexts_update_own' and pol.polcmd = 'w'
      and pol.polroles = array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]),
  1::bigint,
  '[F2.2-b c14 c18 schema b1-1] policy journey_contexts_update_own exists: UPDATE only, TO authenticated only');
select ok(
  (select e like '%is_active_account%' and e like '%auth.uid()%' and e like '%stage%' and e like '%pregnant%'
     from (select pg_get_expr(pol.polqual, pol.polrelid) as e from pg_catalog.pg_policy pol
            where pol.polrelid = pg_temp.rel('journey_contexts') and pol.polname = 'journey_contexts_update_own') q),
  '[F2.2-b c14 c24 A9 rule 15 schema b1-1] its USING clause is own-row (auth.uid()), pregnant rows only (stage), through is_active_account()');
select ok(
  (select e like '%is_active_account%' and e like '%auth.uid()%' and e like '%stage%' and e like '%pregnant%'
     from (select pg_get_expr(pol.polwithcheck, pol.polrelid) as e from pg_catalog.pg_policy pol
            where pol.polrelid = pg_temp.rel('journey_contexts') and pol.polname = 'journey_contexts_update_own') q),
  '[F2.2-b c14 c24 A9 rule 15 schema b1-1] and so is its WITH CHECK clause');
select is(
  (select count(*) from pg_catalog.pg_policy pol
    where pol.polrelid = pg_temp.rel('journey_contexts') and pol.polcmd in ('w', '*')),
  1::bigint,
  '[F2.2-b c18 schema b1-1] it is the only UPDATE (or ALL) policy on journey_contexts');

select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'nestly' and c.relname = 'journey_contexts')
        and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  $$ values ('due_date') $$,
  '[F2.2-b c14 c18 DR-5 rules 12, 14 schema b1-1] authenticated can UPDATE exactly due_date of journey_contexts');
select is(has_table_privilege('authenticated', pg_temp.rel('journey_contexts'), 'UPDATE'), false,
  '[F2.2-b c18 rule 12 schema b1-1] no table-level UPDATE on journey_contexts (per column only)');
select is(has_any_column_privilege('anon', pg_temp.rel('journey_contexts'), 'UPDATE'), false,
  '[F2.2-b c24 rule 3] anon holds no UPDATE on any journey_contexts column');

-- =====================================================================================================================
-- b1-2. UPDATE of the due date: own pregnant row only (c14, c18)
-- =====================================================================================================================
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = date '2027-04-11' where id = %L $q$, (select a_preg from zz_jw))), 'OK:1',
  '[F2.2-b c14 schema b1-2] A sets the due date of its own pregnancy by id: 1 row');
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-04-11', '[F2.2-b c14] stored as sent; has_child untouched');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = null where id = %L $q$, (select a_preg from zz_jw))), 'OK:1',
  '[F2.2-b c14 VAL-044 schema b1-2] A clears it (set null): 1 row');
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:null', '[F2.2-b c14] a cleared due date is stored as null');
select is(pg_temp.upd('a', $q$ update nestly.journey_contexts set due_date = date '2027-03-01' $q$), 'OK:1',
  '[F2.2-b c14 A1 schema b1-2] UPDATE with no WHERE touches exactly one row: A''s own pregnancy (has_child is not admitted)');
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-b c14] back to the fixture value, has_child still null');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format($q$ update nestly.journey_contexts set due_date = date '2027-01-02' where id = %L returning due_date::text $q$, (select a_preg from zz_jw))),
  '2027-01-02', '[F2.2-b c14 schema b1-2] UPDATE ... RETURNING as active A returns the new due date (the repository shape)');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = date '2027-03-01' where id = %L $q$, (select a_preg from zz_jw))), 'OK:1',
  '[F2.2-b fixture] A''s due date put back');

-- not a pregnancy: the policy admits no row, so the route sees 0 rows (404), never a CHECK error (23514 -> 500)
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = date '2027-01-01' where id = %L $q$, (select a_hc from zz_jw))), 'OK:0',
  '[F2.2-b c14 schema b1-2] UPDATE of the due date of A''s own has_child row by id: 0 rows (not 23514)');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = null where id = %L $q$, (select a_hc from zz_jw))), 'OK:0',
  '[F2.2-b c14] even a no-op (null) on A''s own has_child row: 0 rows');
select is(pg_temp.upd('b', format($q$ update nestly.journey_contexts set due_date = date '2027-01-01' where id = %L $q$, (select b_plan from zz_jw))), 'OK:0',
  '[F2.2-b c14 schema b1-2] B on its own planning row by id: 0 rows (not 23514)');
select is(pg_temp.upd('b', $q$ update nestly.journey_contexts set due_date = null $q$), 'OK:0',
  '[F2.2-b c14] B, who has no pregnancy, with no WHERE: 0 rows');

-- another account's rows
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = null where id = %L $q$, (select b_plan from zz_jw))), 'OK:0',
  '[F2.2-b c18 A1 schema b1-2] A on B''s journey by its id: 0 rows');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = null where user_id = %L $q$, tests.fx_id('b'))), 'OK:0',
  '[F2.2-b c18 A1] A on B''s journeys by B''s user id: 0 rows');
select is(pg_temp.upd('b', format($q$ update nestly.journey_contexts set due_date = date '2027-01-01' where id = %L $q$, (select a_preg from zz_jw))), 'OK:0',
  '[F2.2-b c18 A1] and the other way round: B on A''s pregnancy by its id, 0 rows');
select is(pg_temp.upd('b', format($q$ update nestly.journey_contexts set due_date = date '2027-01-01' where user_id = %L $q$, tests.fx_id('a'))), 'OK:0',
  '[F2.2-b c18 A1] B on A''s journeys by A''s user id: 0 rows');
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-b c18] A''s journeys untouched by B');
select is(tests.fx_journeys(tests.fx_id('b')), (select b_journeys from zz_jw), '[F2.2-b c18] B''s journey untouched by A');

-- the columns that are never granted (stage: DR-5, a stage changes only by add or end)
select is(pg_temp.upd('a', t.s), 'ERR:42501', '[F2.2-b c18 DR-5 rules 12, 14 schema b1-2] refused by privilege (42501): ' || t.label)
from (values
  ($q$ update nestly.journey_contexts set stage = 'planning' where stage = 'pregnant' $q$, 'UPDATE of stage (pregnant -> planning)'),
  ($q$ update nestly.journey_contexts set stage = stage $q$, 'UPDATE of stage to itself'),
  ($q$ update nestly.journey_contexts set stage = 'pregnant', due_date = null where stage = 'has_child' $q$, 'UPDATE of stage with the granted column'),
  (format($q$ update nestly.journey_contexts set user_id = %L $q$, tests.fx_id('b')), 'UPDATE of user_id (move a journey to B)'),
  ($q$ update nestly.journey_contexts set user_id = auth.uid() $q$, 'UPDATE of user_id to its own value'),
  ($q$ update nestly.journey_contexts set created_at = now() $q$, 'UPDATE of created_at'),
  ($q$ update nestly.journey_contexts set id = gen_random_uuid() where stage = 'pregnant' $q$, 'UPDATE of id'),
  ($q$ update nestly.journey_contexts set due_date = null, created_at = now() where stage = 'pregnant' $q$, 'a granted column with created_at: the whole statement')
) as t(s, label);
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-b c18] nothing changed by the refused UPDATEs');

-- the database still holds its CHECK and its date type on the granted column
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = %L where stage = 'pregnant' $q$, '2027-02-31'), false), 'ERR:22008',
  '[F2.2-b c14 S2] a date that does not exist is refused by the column type (22008)');
select is(pg_temp.upd('a', $q$ update nestly.journey_contexts set due_date = 'x''); drop table nestly.users;--' where stage = 'pregnant' $q$, false), 'ERR:22007',
  '[F2.2-b c14 S2 hostile] a hostile string is data and fails the date type (22007)');
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-b c14] and nothing changed');

-- =====================================================================================================================
-- b1-3. INSERT of a pregnancy: the F1.4 grant and policy, the two unique keys (c15, c18)
-- =====================================================================================================================
select lives_ok($q$ select tests.fx_insert_user(tests.fx_id('f1'), 'regular', 'active') $q$, '[F2.2-b fixture] f1 gets an active Regular account');
select lives_ok($q$ select tests.fx_insert_profile(tests.fx_id('f1'), 'Fay Free', null) $q$, '[F2.2-b fixture] f1 gets a profile, and no journey');
select is(tests.fx_journeys(tests.fx_id('f1')), '-', '[F2.2-b fixture] f1 has no journey');

select is(pg_temp.upd('b', $q$ insert into nestly.journey_contexts (stage) values ('pregnant') on conflict do nothing $q$), 'OK:0',
  '[F2.2-b c15 c23 VAL-039 schema b1-3] B (planning) inserts a pregnancy ON CONFLICT DO NOTHING: 0 rows (no error)');
select is(tests.fx_journeys(tests.fx_id('b')), (select b_journeys from zz_jw), '[F2.2-b c15 c23] B still has only its planning journey');
select is(pg_temp.upd('a', $q$ insert into nestly.journey_contexts (stage, due_date) values ('pregnant', date '2027-01-01') on conflict do nothing $q$), 'OK:0',
  '[F2.2-b c15 VAL-039 schema b1-3] A (has a pregnancy) inserts a second one ON CONFLICT DO NOTHING: 0 rows');
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-b c15] A still has exactly one pregnancy, its due date unchanged');
select is(pg_temp.upd('a', $q$ insert into nestly.journey_contexts (stage) values ('pregnant') $q$, false), 'ERR:23505',
  '[F2.2-b c15 VAL-039] without ON CONFLICT, a second pregnancy is a unique violation (the database holds the rule itself)');
select is(pg_temp.upd('f1', $q$ insert into nestly.journey_contexts (stage, due_date) values ('pregnant', date '2027-04-11') on conflict do nothing $q$), 'OK:1',
  '[F2.2-b c15 schema b1-3] f1, with no journey, inserts a pregnancy with a due date: 1 row');
select is(tests.fx_journeys(tests.fx_id('f1')), 'pregnant:2027-04-11', '[F2.2-b c15] stored as f1''s pregnancy');
select is(pg_temp.upd('f1', $q$ insert into nestly.journey_contexts (stage) values ('pregnant') on conflict do nothing $q$), 'OK:0',
  '[F2.2-b c15] f1 again: 0 rows, still one');
select is(pg_temp.upd('f1', $q$ insert into nestly.journey_contexts (stage) values ('planning') on conflict do nothing $q$), 'OK:0',
  '[F2.2-b c15 VAL-039] f1, now pregnant, cannot add planning beside it either: 0 rows');
select is(tests.fx_journeys(tests.fx_id('f1')), 'pregnant:2027-04-11', '[F2.2-b c15] f1 unchanged');

select is(pg_temp.upd(t.who, t.s), 'ERR:42501', '[F2.2-b c18 A1 rule 12 schema b1-3] refused (42501): ' || t.who || ' ' || t.label)
from (values
  ('f1', format($q$ insert into nestly.journey_contexts (user_id, stage) values (%L, 'pregnant') on conflict do nothing $q$, tests.fx_id('b')), 'INSERT a pregnancy naming user_id B'),
  ('f1', format($q$ insert into nestly.journey_contexts (user_id, stage) values (%L, 'pregnant') on conflict do nothing $q$, tests.fx_id('f1')), 'INSERT a pregnancy naming its own user_id'),
  ('f1', $q$ insert into nestly.journey_contexts (id, stage) values (gen_random_uuid(), 'has_child') on conflict do nothing $q$, 'INSERT naming the id'),
  ('f1', $q$ insert into nestly.journey_contexts (stage, created_at) values ('has_child', now()) on conflict do nothing $q$, 'INSERT naming created_at')
) as t(who, s, label);
select is(tests.fx_journeys(tests.fx_id('b')), (select b_journeys from zz_jw), '[F2.2-b c18 A1] B''s journeys unchanged by the refused INSERTs');

-- =====================================================================================================================
-- b1-4. Not an active account; anon; app_server itself (c24, c11)
-- =====================================================================================================================
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F2.2-b fixture] a suspended');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = null where id = %L $q$, (select a_preg from zz_jw))), 'OK:0',
  '[F2.2-b c24 A9 schema b1-4] suspended A: UPDATE of its own due date by id affects 0 rows');
select is(pg_temp.upd('a', $q$ update nestly.journey_contexts set due_date = null $q$), 'OK:0',
  '[F2.2-b c24 A9] suspended A: UPDATE with no WHERE affects 0 rows');
select is(pg_temp.upd('a', $q$ insert into nestly.journey_contexts (stage) values ('planning') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-b c24 A9 schema b1-4] suspended A: an INSERT of a journey is refused (42501)');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F2.2-b fixture] a banned');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = null where id = %L $q$, (select a_preg from zz_jw))), 'OK:0',
  '[F2.2-b c24 A9 schema b1-4] banned A: UPDATE of its own due date affects 0 rows');
select lives_ok($q$ select tests.set_status(tests.fx_id('f1'), 'banned') $q$, '[F2.2-b fixture] f1 banned');
select is(pg_temp.upd('f1', $q$ update nestly.journey_contexts set due_date = null $q$), 'OK:0',
  '[F2.2-b c24 A9] banned f1: UPDATE of its pregnancy affects 0 rows');
select is(pg_temp.upd('f1', $q$ insert into nestly.journey_contexts (stage) values ('has_child') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-b c24 A9 schema b1-4] banned f1: an INSERT of a journey is refused (42501)');
select is(tests.fx_journeys(tests.fx_id('a')) || ' / ' || tests.fx_journeys(tests.fx_id('f1')), 'has_child:null ; pregnant:2027-03-01 / pregnant:2027-04-11',
  '[F2.2-b c24] nothing changed while suspended or banned');
select is(pg_temp.upd(t.who, $q$ update nestly.journey_contexts set due_date = null $q$), 'OK:0', '[F2.2-b c24] the fixture account ' || t.who || ': UPDATE affects 0 rows')
from (values ('s'), ('x')) as t(who);
select is(pg_temp.upd('c', $q$ insert into nestly.journey_contexts (stage) values ('pregnant') on conflict do nothing $q$), 'ERR:42501',
  '[F2.2-b c24 F2.1 DR-T1] c (no account row): an INSERT of a pregnancy is refused (42501)');
select is(tests.fx_counts(tests.fx_id('c')), '0/0/0/0/0', '[F2.2-b c24] no row exists for c');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F2.2-b fixture] a active again');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = date '2027-03-02' where id = %L $q$, (select a_preg from zz_jw))), 'OK:1',
  '[F2.2-b c24 schema b1-4] active again: the same UPDATE affects 1 row');
select is(pg_temp.upd('a', format($q$ update nestly.journey_contexts set due_date = date '2027-03-01' where id = %L $q$, (select a_preg from zz_jw))), 'OK:1',
  '[F2.2-b fixture] A''s due date put back');

select is(tests.dml_as(t.role, tests.claims(tests.fx_id('a')), t.s), 'ERR:42501', '[F2.2-b c11 c24 A8 rule 3 schema b1-4] ' || t.label || ': refused')
from (values
  ('anon', $q$ update nestly.journey_contexts set due_date = null $q$, 'anon UPDATE of a due date'),
  ('anon', $q$ insert into nestly.journey_contexts (stage) values ('pregnant') on conflict do nothing $q$, 'anon INSERT of a pregnancy'),
  ('none', $q$ update nestly.journey_contexts set due_date = null $q$, 'app_server without SET ROLE: UPDATE of a due date'),
  ('none', $q$ insert into nestly.journey_contexts (stage) values ('pregnant') on conflict do nothing $q$, 'app_server without SET ROLE: INSERT of a pregnancy')
) as t(role, s, label);
select is(tests.dml_as('authenticated', '', $q$ update nestly.journey_contexts set due_date = null $q$), 'OK:0',
  '[F2.2-b c24] authenticated with no claims (no identity): 0 rows');

-- =====================================================================================================================
-- b2 (F2.2b2, schema.md checks 5-9) appends its sections here.
-- =====================================================================================================================

-- =====================================================================================================================
-- Nothing leaked to others
-- =====================================================================================================================
select is(tests.fx_journeys(tests.fx_id('a')), 'has_child:null ; pregnant:2027-03-01', '[F2.2-b c18 A1] after the whole file, A''s journeys are the fixture''s');
select is(tests.fx_children(tests.fx_id('a')), (select a_children from zz_jw), '[F2.2-b c18] and A''s children were never touched');
select is(tests.fx_journeys(tests.fx_id('b')), (select b_journeys from zz_jw), '[F2.2-b c18 A1] B''s journey is what it was');
select is(tests.fx_counts(tests.fx_id('s')) || ' ' || tests.fx_counts(tests.fx_id('x')), '1/1/0/0/0 1/1/0/0/0', '[F2.2-b c24] s and x got no journey');

select * from finish();

rollback;
