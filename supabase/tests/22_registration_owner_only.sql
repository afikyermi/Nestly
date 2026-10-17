-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.4 part a).
-- Criterion 14 as amended at Gate 2 (decisions/2026-10.md): owner-only rows [layer 9 · rules 12, 13, 15].
--   As user A: reads A's profile, journeys, children and consent. A's UPDATE and DELETE of them are refused and change
--   nothing (editing is I2). As user B: zero of A's rows visible; UPDATE and DELETE are refused too. As anon: no access.
--   A suspended or banned account reads zero rows and inserts none. A's update or delete of A's consent changes nothing.
-- "Refused" = an error 42501 (privilege: no UPDATE/DELETE grant exists); 'OK:0' would not count as refused here.
-- "Changes nothing" is observed against the real tables through tests.fx_state(), not through what RLS shows.
-- Fixtures: a = 2 journeys, 2 children, 1 consent; b = 1 journey, 1 child, 1 consent; s suspended and x banned have
-- profiles but no journeys/children/consents; p professional; c an Auth user without an account.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.4-a c14] session_user is app_server (this file must not run under another login)');

create temp table zz_state as select tests.fx_state() as s0;

select is(tests.fx_counts(tests.fx_id('a')), '1/1/2/2/1', '[F1.4-a c14 fixture] a has 2 journeys, 2 children, 1 consent');
select is(tests.fx_counts(tests.fx_id('b')), '1/1/1/1/1', '[F1.4-a c14 fixture] b has 1 journey, 1 child, 1 consent');

-- =====================================================================================================================
-- Reads: A sees its own, B sees none of A's (and the reverse)
-- =====================================================================================================================
select is(tests.n_as(tests.fx_id('a'), t.rel), t.n, '[F1.4-a c14] A reads exactly its own rows of ' || t.rel || ': ' || t.n)
from (values ('nestly.users', '1'), ('nestly.regular_profiles', '1'), ('nestly.journey_contexts', '2'),
             ('nestly.children', '2'), ('nestly.legal_consents', '1')) as t(rel, n);

select is(tests.n_as(tests.fx_id('b'), t.rel), t.n, '[F1.4-a c14] B reads exactly its own rows of ' || t.rel || ': ' || t.n)
from (values ('nestly.users', '1'), ('nestly.regular_profiles', '1'), ('nestly.journey_contexts', '1'),
             ('nestly.children', '1'), ('nestly.legal_consents', '1')) as t(rel, n);

-- B asking for A's rows by A's identifier (a guessed / enumerated id): zero, on every table
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('b')),
    format('select count(*)::text from %s where %I = %L', t.rel, t.col, tests.fx_id('a'))),
  '0',
  '[F1.4-a c14 rules 12, 13] B filtering ' || t.rel || ' by A''s id sees 0 rows')
from (values ('nestly.users', 'id'), ('nestly.regular_profiles', 'user_id'), ('nestly.journey_contexts', 'user_id'),
             ('nestly.children', 'user_id'), ('nestly.legal_consents', 'user_id')) as t(rel, col);

select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format('select count(*)::text from %s where %I = %L', t.rel, t.col, tests.fx_id('b'))),
  '0',
  '[F1.4-a c14 rules 12, 13] A filtering ' || t.rel || ' by B''s id sees 0 rows')
from (values ('nestly.journey_contexts', 'user_id'), ('nestly.children', 'user_id'), ('nestly.legal_consents', 'user_id')) as t(rel, col);

-- the values A reads are A's: due date and names
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select string_agg(name, ',' order by slot) from nestly.children $q$),
  'Noa,Eli', '[F1.4-a c14] A reads its own children by name, in slot order');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select due_date::text from nestly.journey_contexts where stage = 'pregnant' $q$),
  '2027-03-01', '[F1.4-a c14] A reads its own pregnant journey''s due date');
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('b')),
    $q$ select string_agg(name, ',') from nestly.children $q$),
  'Tali', '[F1.4-a c14] B reads only its own child, not A''s');

-- a join across tables does not widen the view
select is(
  tests.as_role('authenticated', tests.claims(tests.fx_id('b')),
    $q$ select count(*)::text from nestly.children ch join nestly.regular_profiles p on p.user_id = ch.user_id $q$),
  '1', '[F1.4-a c14] B joining children to profiles still gets only its own pair');

-- =====================================================================================================================
-- UPDATE / DELETE / TRUNCATE / row locks on the three tables: refused for A (the owner) and for B, and nothing changes
-- =====================================================================================================================
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id(t.who)), t.s), 'ERR:42501',
  '[F1.4-a c14 criterion 14 amended] refused (42501): ' || t.who || ' ' || t.label)
from (values
  -- journey_contexts
  ('a', $q$ update nestly.journey_contexts set due_date = date '2027-09-09' where stage = 'pregnant' $q$, 'UPDATE own journey due date'),
  ('a', $q$ update nestly.journey_contexts set stage = 'planning' where stage = 'has_child' $q$, 'UPDATE own journey stage'),
  ('a', $q$ update nestly.journey_contexts set user_id = auth.uid() $q$, 'UPDATE every journey''s user_id (own rows)'),
  ('a', $q$ update nestly.journey_contexts set due_date = null where false $q$, 'UPDATE that matches no journey (privilege does not depend on rows)'),
  ('a', $q$ delete from nestly.journey_contexts where stage = 'has_child' $q$, 'DELETE own journey'),
  ('a', $q$ delete from nestly.journey_contexts $q$, 'DELETE every journey'),
  ('a', $q$ truncate nestly.journey_contexts $q$, 'TRUNCATE journeys'),
  ('a', $q$ select id from nestly.journey_contexts for update $q$, 'SELECT ... FOR UPDATE on journeys'),
  -- children
  ('a', $q$ update nestly.children set slot = 3 where slot = 2 $q$, 'UPDATE own child slot (moving past the unique)'),
  ('a', $q$ delete from nestly.children where slot = 2 $q$, 'DELETE own child'),
  ('a', $q$ delete from nestly.children $q$, 'DELETE every child'),
  ('a', $q$ truncate nestly.children $q$, 'TRUNCATE children'),
  -- legal_consents: the record is append-only
  ('a', $q$ update nestly.legal_consents set terms_version = 'rewritten' $q$, 'UPDATE own consent version'),
  ('a', $q$ update nestly.legal_consents set accepted_at = now() $q$, 'UPDATE own consent time'),
  ('a', $q$ update nestly.legal_consents set has_declared_18_plus = true $q$, 'UPDATE own consent declaration (to its current value)'),
  ('a', $q$ update nestly.legal_consents set terms_version = 'x' where false $q$, 'UPDATE that matches no consent'),
  ('a', $q$ delete from nestly.legal_consents $q$, 'DELETE own consent'),
  ('a', $q$ delete from nestly.legal_consents where user_id = auth.uid() $q$, 'DELETE own consent by owner filter'),
  ('a', $q$ truncate nestly.legal_consents $q$, 'TRUNCATE consents'),
  ('a', $q$ select id from nestly.legal_consents for update $q$, 'SELECT ... FOR UPDATE on consents'),
  -- B acting on A's rows
  ('b', $q$ update nestly.journey_contexts set due_date = null $q$, 'UPDATE the journeys (A''s included)'),
  ('b', $q$ delete from nestly.journey_contexts $q$, 'DELETE the journeys (A''s included)'),
  ('b', $q$ delete from nestly.children $q$, 'DELETE the children (A''s included)'),
  ('b', $q$ update nestly.legal_consents set terms_version = 'Hijacked' $q$, 'UPDATE the consents (A''s included)'),
  ('b', $q$ delete from nestly.legal_consents $q$, 'DELETE the consents (A''s included)'),
  ('b', format($q$ delete from nestly.children where user_id = %L $q$, tests.fx_id('a')), 'DELETE A''s children by A''s id'),
  ('b', format($q$ update nestly.legal_consents set has_declared_18_plus = true where user_id = %L $q$, tests.fx_id('a')), 'UPDATE A''s consent by A''s id')
) as t(who, s, label);

-- F2.2a (schema.md "Amend", 17.10.2026): children gained a column-level UPDATE (name, sex, birth_date) behind children_update_own.
-- A's own UPDATEs of those columns are asserted in file 51 (they change rows; this file keeps the state unchanged). Re-graded here:
-- the slot UPDATE above stays 42501; an UPDATE that matches no row is now 0 rows, FOR UPDATE is permitted on own rows, and B's
-- UPDATE aimed at A's children affects 0 rows.
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id(t.who)), t.s), t.expected,
  '[F1.4-a c14 · F2.2a c9 re-graded] ' || t.who || ' ' || t.label || ': ' || t.expected)
from (values
  ('a', $q$ update nestly.children set sex = 'girl' where false $q$, 'UPDATE that matches no child', 'OK:0'),
  ('a', $q$ select id from nestly.children for update $q$, 'SELECT ... FOR UPDATE on own children (needs UPDATE on a column; RLS-confined)', 'OK:2'),
  ('b', format($q$ update nestly.children set name = 'Hijacked' where user_id = %L $q$, tests.fx_id('a')), 'UPDATE of A''s children by A''s id', 'OK:0'),
  ('b', $q$ update nestly.children set name = 'Hijacked' where slot = 2 $q$, 'UPDATE of a slot only A has', 'OK:0')
) as t(who, s, label, expected);
select is(tests.fx_children(tests.fx_id('a')), '1:Noa:girl:2024-05-10 ; 2:Eli:boy:2022-01-15',
  '[F2.2a c9 A1] A''s children are what the fixture wrote after B''s attempts');

select is(tests.fx_state(), (select s0 from zz_state),
  '[F1.4-a c14] after every UPDATE / DELETE / TRUNCATE above, all five tables are byte-for-byte what they were (observed as the owner, not through RLS)');
select is(tests.fx_counts(tests.fx_id('a')), '1/1/2/2/1', '[F1.4-a c14] A still has all of its rows');
select is(tests.fx_counts(tests.fx_id('b')), '1/1/1/1/1', '[F1.4-a c14] B still has all of its rows');
select is(tests.fx_consent(tests.fx_id('a')), 'fixture-terms-1/fixture-privacy-1/true/false',
  '[F1.4-a c14 BR-068] A''s consent record is the one the fixture wrote: version, declaration, and a time that is not this transaction''s (never rewritten)');

-- =====================================================================================================================
-- anon: no access of any kind, on every table
-- =====================================================================================================================
select is(tests.dml_as('anon', tests.claims(tests.fx_id('a')), t.s), 'ERR:42501',
  '[F1.4-a c14 platform r7] anon is refused (42501): ' || t.label)
from (values
  ($q$ select count(*) from nestly.journey_contexts $q$, 'SELECT journeys'),
  ($q$ select count(*) from nestly.children $q$, 'SELECT children'),
  ($q$ select count(*) from nestly.legal_consents $q$, 'SELECT consents'),
  ($q$ insert into nestly.journey_contexts (user_id, stage) values ('a0000000-0000-4000-8000-0000000000a1', 'planning') $q$, 'INSERT a journey'),
  ($q$ insert into nestly.children (user_id, slot, name, sex, birth_date) values ('a0000000-0000-4000-8000-0000000000a1', 7, 'Anon', 'boy', date '2020-01-01') $q$, 'INSERT a child'),
  ($q$ insert into nestly.legal_consents (user_id, terms_version, privacy_version, has_declared_18_plus) values ('a0000000-0000-4000-8000-0000000000a1', 'x', 'y', true) $q$, 'INSERT a consent'),
  ($q$ update nestly.children set name = 'Anon' $q$, 'UPDATE children'),
  ($q$ delete from nestly.children $q$, 'DELETE children'),
  ($q$ update nestly.journey_contexts set due_date = null $q$, 'UPDATE journeys'),
  ($q$ delete from nestly.journey_contexts $q$, 'DELETE journeys'),
  ($q$ update nestly.legal_consents set terms_version = 'x' $q$, 'UPDATE consents'),
  ($q$ delete from nestly.legal_consents $q$, 'DELETE consents')
) as t(s, label);

-- the same with no claims at all (an anonymous request)
select is(tests.dml_as('anon', '', t.s), 'ERR:42501', '[F1.4-a c14 platform r7] anon with no claims is refused (42501): ' || t.label)
from (values
  ($q$ select count(*) from nestly.journey_contexts $q$, 'SELECT journeys'),
  ($q$ select count(*) from nestly.children $q$, 'SELECT children'),
  ($q$ select count(*) from nestly.legal_consents $q$, 'SELECT consents'),
  ($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Anon', 'boy', date '2020-01-01') $q$, 'INSERT a child')
) as t(s, label);

-- app_server itself (no SET ROLE) has no path to the data either
select is(tests.dml_as('none', '', t.s), 'ERR:42501', '[F1.4-a c14 platform r2] app_server without SET ROLE is refused (42501): ' || t.label)
from (values
  ($q$ select count(*) from nestly.journey_contexts $q$, 'SELECT journeys'),
  ($q$ select count(*) from nestly.children $q$, 'SELECT children'),
  ($q$ select count(*) from nestly.legal_consents $q$, 'SELECT consents'),
  ($q$ insert into nestly.legal_consents (user_id, terms_version, privacy_version, has_declared_18_plus) values ('a0000000-0000-4000-8000-0000000000a1', 'x', 'y', true) $q$, 'INSERT a consent')
) as t(s, label);

-- =====================================================================================================================
-- Account status (rule 15): suspended s, banned x read zero and insert none
-- =====================================================================================================================
select is(tests.n_as(tests.fx_id(t.who), t.rel), '0', '[F1.4-a c14 rule 15] ' || t.who || ' reads 0 rows of ' || t.rel)
from (values ('s'), ('x')) as w(who)
cross join (values ('nestly.journey_contexts'), ('nestly.children'), ('nestly.legal_consents'), ('nestly.regular_profiles')) as r(rel)
cross join lateral (select w.who, r.rel) as t(who, rel);

-- F1.5-a c1: nestly.users is the one exception: a stopped account reads its own row, nothing of anyone else's
select is(tests.n_as(tests.fx_id(w.who), 'nestly.users'), '1', '[F1.5-a c1 rule 15] ' || w.who || ' reads only its own users row')
from (values ('s'), ('x')) as w(who);

-- granted columns only: the status gate is the POLICY fence (Amendment 1), asserted by message
select is(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id(w.who)), t.s),
  'ERR:42501:new row violates row-level security policy for table ' || t.tbl,
  '[F1.4-a c14 rule 15 CRITIC a-1] ' || w.who || ' (not active) is refused by the policy: ' || t.label)
from (values ('s'), ('x')) as w(who)
cross join (values
  ($q$ insert into nestly.journey_contexts (stage) values ('planning') $q$, 'journey_contexts', 'INSERT a journey'),
  ($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Late', 'boy', date '2020-01-01') $q$, 'children', 'INSERT a child'),
  ($q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t', 'p', true) $q$, 'legal_consents', 'INSERT a consent')
) as t(s, tbl, label);

-- naming an ungranted owner column is the PRIVILEGE fence, for any caller, active or not (checked before any row or policy)
select is(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id(t.who)), t.s),
  'ERR:42501:permission denied for table ' || t.tbl,
  '[F1.4-a c14 rules 12, 13 CRITIC a-1] ' || t.who || ': ' || t.label)
from (values
  ('b', format($q$ insert into nestly.children (user_id, slot, name, sex, birth_date) values (%L, 7, 'Planted', 'boy', date '2020-01-01') $q$, tests.fx_id('a')), 'children',
     'B inserts a child naming user_id = A: refused by privilege'),
  ('b', format($q$ insert into nestly.journey_contexts (user_id, stage) values (%L, 'has_child') $q$, tests.fx_id('a')), 'journey_contexts',
     'B inserts a journey naming user_id = A: refused by privilege'),
  ('b', format($q$ insert into nestly.legal_consents (user_id, terms_version, privacy_version, has_declared_18_plus) values (%L, 'x', 'y', true) $q$, tests.fx_id('a')), 'legal_consents',
     'B records a consent naming user_id = A: refused by privilege'),
  ('s', $q$ insert into nestly.children (user_id, slot, name, sex, birth_date) values (auth.uid(), 1, 'Own', 'boy', date '2020-01-01') $q$, 'children',
     'suspended S naming its OWN user_id: refused by privilege, before the status gate is reached'),
  ('a', $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus, accepted_at) values ('v', 'v', true, now()) $q$, 'legal_consents',
     'A naming accepted_at, even = now(): refused by privilege')
) as t(who, s, tbl, label);

-- c: an Auth identity with no account at all: reads nothing, writes nothing (fails closed)
select is(tests.n_as(tests.fx_id('c'), t.rel), '0', '[F1.4-a c14 rule 15] c (no account) reads 0 rows of ' || t.rel)
from (values ('nestly.journey_contexts'), ('nestly.children'), ('nestly.legal_consents')) as t(rel);
select is(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('c')),
  $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Ghost', 'boy', date '2020-01-01') $q$),
  'ERR:42501:new row violates row-level security policy for table children',
  '[F1.4-a c14 rule 15] c (no users row) cannot insert a child: refused by the policy');

-- the status is checked on the NEXT statement, mid-test (A is flipped and flipped back; the suite rolls back anyway)
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F1.4-a c14 rule 15] A is suspended (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.journey_contexts'), '0', '[F1.4-a c14 rule 15] A, suspended mid-test, reads 0 journeys at once');
select is(tests.n_as(tests.fx_id('a'), 'nestly.children'), '0', '[F1.4-a c14 rule 15] A, suspended mid-test, reads 0 children at once');
select is(tests.n_as(tests.fx_id('a'), 'nestly.legal_consents'), '0', '[F1.4-a c14 rule 15] A, suspended mid-test, reads 0 consents at once');
select is(tests.dml_as_msg('authenticated', tests.claims(tests.fx_id('a')),
  $q$ insert into nestly.children (slot, name, sex, birth_date) values (3, 'Third', 'boy', date '2020-01-01') $q$),
  'ERR:42501:new row violates row-level security policy for table children',
  '[F1.4-a c14 rule 15] A, suspended mid-test, cannot insert a child: refused by the policy');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F1.4-a c14 rule 15] A is banned (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.children'), '0', '[F1.4-a c14 rule 15] A, banned mid-test, reads 0 children');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F1.4-a c14 rule 15] A is active again (fixture)');
select is(tests.n_as(tests.fx_id('a'), 'nestly.children'), '2', '[F1.4-a c14 rule 15] A, active again, reads its 2 children again (the rows were never hidden by deletion)');
select is(tests.fx_counts(tests.fx_id('a')), '1/1/2/2/1', '[F1.4-a c14 rule 15] and the rows were all there throughout');

-- =====================================================================================================================
-- p (professional): has a users row but no regular profile -> children and journeys hit the FK
-- =====================================================================================================================
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')),
  $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Pro Child', 'boy', date '2020-01-01') $q$), 'ERR:23503',
  '[F1.4-a c14 BR-016] a professional account cannot hold a child: foreign key to regular_profiles (23503)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')),
  $q$ insert into nestly.journey_contexts (stage) values ('planning') $q$), 'ERR:23503',
  '[F1.4-a c14] a professional account cannot hold a journey: foreign key to regular_profiles (23503)');
select is(tests.fx_counts(tests.fx_id('p')), '1/0/0/0/0', '[F1.4-a c14] and p still has only its users row');

select is(tests.fx_state(), (select s0 from zz_state),
  '[F1.4-a c14] at the end of the file nothing in nestly differs from the start: the observers saw the real tables, unchanged');

select * from finish();

rollback;
