-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part b).
-- Criterion 13: as authenticated, every INSERT, UPDATE and DELETE on User and RegularProfile is refused and changes
-- nothing -- A's own row included, and including A changing its own account type or status. [NFR-SEC-002 · layer 2 ·
-- platform r14]. F1.1 has no write path at all (F1.4 creates, I2 edits).
--
-- "Refused" is asserted as an error with SQLSTATE 42501 (insufficient_privilege; an RLS WITH CHECK failure is the same
-- code). A statement that returned 'OK:0' (silently filtered to nothing by RLS) would NOT count as refused here: the
-- approved design refuses by privilege (schema.md "Authorization": no write grant to anyone but the owner). If SPEC
-- wants "0 rows changed" to count as refused too, that is a spec question, not a reason to loosen this file.
-- "Changes nothing" is asserted against the real tables through the fixture observers (tests.fx_state()), not through
-- what RLS shows a signed-in user. Statements that succeed would persist inside this transaction (keep = true) and so
-- show up in that comparison.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.1-b c13] session_user is app_server (this file must not run under another login)');

create temp table zz_state as select tests.fx_state() as s0;

select is(tests.fx_user(tests.fx_id('a')), 'regular/active',    '[F1.1-b fixture] a: regular, active before the attempts');
select is(tests.fx_user(tests.fx_id('s')), 'regular/suspended', '[F1.1-b fixture] s: suspended before the attempts');
select is(tests.fx_user(tests.fx_id('x')), 'regular/banned',    '[F1.1-b fixture] x: banned before the attempts');

-- ---- privileges, from the catalog ------------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles')
      and (has_table_privilege('authenticated', c.oid, 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege('authenticated', c.oid, 'UPDATE,REFERENCES'))),
  0::bigint,
  '[F1.1-b c13 · F1.4-a c14 NFR-SEC-002] authenticated holds no UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on either table, at table or column level (INSERT was granted by F1.4 and is bounded by the policies)');

-- ---- the attempts ----------------------------------------------------------------------------------------------------
-- (role, whose claims, statement, what it tries)
select is(tests.dml_as(t.r, tests.claims(tests.fx_id(t.w)), t.s), 'ERR:42501',
  '[F1.1-b c13 NFR-SEC-002] refused (42501): ' || t.label)
from (values
  -- User: insert
  -- F1.4 part a: "c inserts its own regular/active User row" is now ALLOWED (file 21 asserts it), and "a inserts a second
  -- User row" now fails 23505 on the primary key, not 42501 (asserted below the list). Both moved out of this list.
  ('authenticated', 'f1', $q$ insert into nestly.users (id, account_type, status) values ('f0000000-0000-4000-8000-0000000000f1', 'admin', 'active') $q$,
     'INSERT a User row with account_type admin for oneself'),
  ('authenticated', 'a', $q$ insert into nestly.users (id, account_type, status) values ('b0000000-0000-4000-8000-0000000000b2', 'regular', 'active') $q$,
     'INSERT a User row with another account''s id'),
  ('authenticated', 'a', $q$ insert into nestly.users (id, account_type, status) values ('a0000000-0000-4000-8000-0000000000a1', 'admin', 'active')
                            on conflict (id) do update set account_type = 'admin' $q$,
     'INSERT ... ON CONFLICT DO UPDATE turning A into an admin'),
  ('authenticated', 's', $q$ insert into nestly.users (id, account_type, status) values ('50000000-0000-4000-8000-000000000051', 'regular', 'active')
                            on conflict (id) do update set status = 'active' $q$,
     'INSERT ... ON CONFLICT DO UPDATE by a suspended account reactivating itself'),
  -- User: update
  ('authenticated', 'a', $q$ update nestly.users set account_type = 'admin' where id = auth.uid() $q$,
     'UPDATE own account_type to admin'),
  ('authenticated', 'a', $q$ update nestly.users set account_type = 'moderator' where id = auth.uid() $q$,
     'UPDATE own account_type to moderator'),
  ('authenticated', 'a', $q$ update nestly.users set status = 'active' where id = auth.uid() $q$,
     'UPDATE own status to the value it already has'),
  ('authenticated', 'a', $q$ update nestly.users set status = 'banned' where id = auth.uid() $q$,
     'UPDATE own status to banned'),
  ('authenticated', 's', $q$ update nestly.users set status = 'active' where id = auth.uid() $q$,
     'UPDATE by a suspended account setting itself active'),
  ('authenticated', 'x', $q$ update nestly.users set status = 'active' where id = auth.uid() $q$,
     'UPDATE by a banned account setting itself active'),
  ('authenticated', 'a', $q$ update nestly.users set status = 'suspended' where id = 'b0000000-0000-4000-8000-0000000000b2' $q$,
     'UPDATE another account''s status'),
  ('authenticated', 'a', $q$ update nestly.users set created_at = now() where id = auth.uid() $q$,
     'UPDATE own created_at'),
  ('authenticated', 'a', $q$ update nestly.users set id = 'f0000000-0000-4000-8000-0000000000f2' where id = auth.uid() $q$,
     'UPDATE own id (take over another identifier)'),
  ('authenticated', 'a', $q$ update nestly.users set status = 'active' $q$,
     'UPDATE every User row'),
  ('authenticated', 'a', $q$ update nestly.users set status = 'active' where false $q$,
     'UPDATE that matches no row (the privilege check does not depend on the rows)'),
  -- User: delete, truncate, lock
  ('authenticated', 'a', $q$ delete from nestly.users where id = auth.uid() $q$, 'DELETE own User row'),
  ('authenticated', 'a', $q$ delete from nestly.users where id = 'b0000000-0000-4000-8000-0000000000b2' $q$, 'DELETE another account''s User row'),
  ('authenticated', 'a', $q$ delete from nestly.users $q$, 'DELETE every User row'),
  ('authenticated', 'a', $q$ truncate nestly.users $q$, 'TRUNCATE User'),
  ('authenticated', 'a', $q$ select id from nestly.users for update $q$, 'SELECT ... FOR UPDATE on User (a row lock needs UPDATE)'),
  ('authenticated', 'a', $q$ select id from nestly.users for share $q$, 'SELECT ... FOR SHARE on User'),
  -- RegularProfile
  ('authenticated', 'c', $q$ insert into nestly.regular_profiles (full_name) values ('Cora Nobody') $q$,
     'INSERT a RegularProfile for an identity that has no User row'),
  ('authenticated', 'a', $q$ insert into nestly.regular_profiles (user_id, full_name) values ('b0000000-0000-4000-8000-0000000000b2', 'Not Bella') $q$,
     'INSERT a RegularProfile in another account''s name'),
  ('authenticated', 'a', $q$ insert into nestly.regular_profiles (user_id, full_name, gender) values ('a0000000-0000-4000-8000-0000000000a1', 'Alice Changed', 'man')
                            on conflict (user_id) do update set full_name = excluded.full_name $q$,
     'INSERT ... ON CONFLICT DO UPDATE rewriting A''s profile'),
  ('authenticated', 'a', $q$ update nestly.regular_profiles set full_name = 'Alice Changed' where user_id = auth.uid() $q$,
     'UPDATE own full_name'),
  ('authenticated', 'a', $q$ update nestly.regular_profiles set gender = null where user_id = auth.uid() $q$,
     'UPDATE own gender'),
  ('authenticated', 'a', $q$ update nestly.regular_profiles set account_type = 'regular' where user_id = auth.uid() $q$,
     'UPDATE own profile account_type'),
  ('authenticated', 'a', $q$ update nestly.regular_profiles set full_name = 'Not Bella' where user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$,
     'UPDATE another account''s profile'),
  ('authenticated', 's', $q$ update nestly.regular_profiles set full_name = 'Sara Changed' where user_id = auth.uid() $q$,
     'UPDATE by a suspended account on its own profile'),
  ('authenticated', 'a', $q$ update nestly.regular_profiles set full_name = 'Everyone' $q$, 'UPDATE every RegularProfile row'),
  ('authenticated', 'a', $q$ delete from nestly.regular_profiles where user_id = auth.uid() $q$, 'DELETE own RegularProfile'),
  ('authenticated', 'a', $q$ delete from nestly.regular_profiles where user_id = 'b0000000-0000-4000-8000-0000000000b2' $q$, 'DELETE another account''s RegularProfile'),
  ('authenticated', 'a', $q$ delete from nestly.regular_profiles $q$, 'DELETE every RegularProfile row'),
  ('authenticated', 'a', $q$ truncate nestly.regular_profiles $q$, 'TRUNCATE RegularProfile'),
  ('authenticated', 'a', $q$ select user_id from nestly.regular_profiles for update $q$, 'SELECT ... FOR UPDATE on RegularProfile'),
  -- anon
  ('anon', 'a', $q$ insert into nestly.users (id, account_type, status) values ('f0000000-0000-4000-8000-0000000000f3', 'regular', 'active') $q$, 'anon INSERT into User'),
  ('anon', 'a', $q$ update nestly.users set status = 'active' $q$, 'anon UPDATE of User'),
  ('anon', 'a', $q$ delete from nestly.users $q$, 'anon DELETE from User'),
  ('anon', 'a', $q$ insert into nestly.regular_profiles (user_id, full_name) values ('f0000000-0000-4000-8000-0000000000f3', 'Anon Anon') $q$, 'anon INSERT into RegularProfile'),
  ('anon', 'a', $q$ update nestly.regular_profiles set full_name = 'Anon Anon' $q$, 'anon UPDATE of RegularProfile'),
  ('anon', 'a', $q$ delete from nestly.regular_profiles $q$, 'anon DELETE from RegularProfile'),
  -- app_server itself, no role set
  ('none', 'a', $q$ insert into nestly.users (id, account_type, status) values ('f0000000-0000-4000-8000-0000000000f3', 'regular', 'active') $q$, 'app_server (no SET ROLE) INSERT into User'),
  ('none', 'a', $q$ update nestly.users set status = 'active' $q$, 'app_server (no SET ROLE) UPDATE of User'),
  ('none', 'a', $q$ delete from nestly.users $q$, 'app_server (no SET ROLE) DELETE from User'),
  ('none', 'a', $q$ insert into nestly.regular_profiles (user_id, full_name) values ('f0000000-0000-4000-8000-0000000000f3', 'Srv Srv') $q$, 'app_server (no SET ROLE) INSERT into RegularProfile'),
  ('none', 'a', $q$ update nestly.regular_profiles set full_name = 'Srv Srv' $q$, 'app_server (no SET ROLE) UPDATE of RegularProfile'),
  ('none', 'a', $q$ delete from nestly.regular_profiles $q$, 'app_server (no SET ROLE) DELETE from RegularProfile')
) as t(r, w, s, label);

-- ---- the two attempts whose outcome F1.4 changed: still refused, now by the primary key (a second row for A) ---------------
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), $q$ insert into nestly.users (account_type, status) values ('regular', 'active') $q$),
  'ERR:23505',
  '[F1.1-b c13 · F1.4-a c10] a second User row for A (who has one) is refused with 23505 (users_pkey), not accepted');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), $q$ insert into nestly.regular_profiles (full_name) values ('Alice Again') $q$),
  'ERR:23505',
  '[F1.1-b c13 · F1.4-a c10] a second RegularProfile for A is refused with 23505 (primary key), not accepted');

-- ---- and nothing changed ----------------------------------------------------------------------------------------------
select is(tests.fx_state(), (select s0 from zz_state),
  '[F1.1-b c13 NFR-SEC-002] after every attempt above, User and RegularProfile are byte-for-byte what they were (observed as the owner, not through RLS)');
select is(tests.fx_user(tests.fx_id('a')), 'regular/active',
  '[F1.1-b c13 NFR-SEC-002] A is still a regular, active account: its own account type and status did not change');
select is(tests.fx_user(tests.fx_id('s')), 'regular/suspended',
  '[F1.1-b c13 NFR-SEC-002] suspended S is still suspended: it could not reactivate itself');
select is(tests.fx_user(tests.fx_id('x')), 'regular/banned',
  '[F1.1-b c13 NFR-SEC-002] banned X is still banned');
select is(tests.fx_user(tests.fx_id('b')), 'regular/active',
  '[F1.1-b c13 NFR-SEC-002] B''s account was not touched by A''s attempts');
select is(tests.fx_profile(tests.fx_id('a')), 'Alice Aaron/woman',
  '[F1.1-b c13 NFR-SEC-002] A''s own profile is unchanged');
select is(tests.n_as(tests.fx_id('a'), 'nestly.users'), '1',
  '[F1.1-b c13 NFR-SEC-002] A still reads exactly its own User row afterwards');
select is(tests.n_as(tests.fx_id('s'), 'nestly.users'), '0',
  '[F1.1-b c13 NFR-SEC-002] suspended S still reads 0 rows afterwards');

select * from finish();

rollback;
