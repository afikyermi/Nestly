-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.4 part a).
-- Criterion 10 (atomicity, repeat write safe) and the database side of criteria 8 and 14 (rules 12-14): the whole account
-- is written in ONE transaction under the new user's identity; the owner is set by the database; a client-sent owner is
-- refused; account_type and status are pinned; the consent time is the database's clock.
-- Source: .work/register-account-create/spec.md (criteria 8, 10, 14) and schema.md ("Write order", pgTAP plan).
-- A multi-statement write runs as ONE `DO` block through tests.dml_as: a failure inside it rolls the whole block back,
-- which is exactly what the server's identity transaction must also do.
-- "Refused" = an error with the stated SQLSTATE; 'OK:0' would not count.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.4-a c10] session_user is app_server (this file must not run under another login)');

-- f1..f5 start with no nestly rows (fixtures), so every account below is created from nothing.
select is(tests.fx_counts(tests.fx_id('f1')), '0/0/0/0/0', '[F1.4-a c10 fixture] f1 starts with no account');
select is(tests.fx_counts(tests.fx_id('f2')), '0/0/0/0/0', '[F1.4-a c10 fixture] f2 starts with no account');

-- =====================================================================================================================
-- The full creation block as f1 (users -> profile -> journeys -> children -> consent), the order schema.md fixes.
-- =====================================================================================================================
-- [A] authenticated may run a DO block (USAGE on plpgsql is PUBLIC's default): this is the first test that proves it.
select is(
  regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name, gender) values ('Fiona First', 'woman');
      insert into nestly.journey_contexts (stage, due_date) values ('pregnant', date '2027-03-01'), ('has_child', null);
      insert into nestly.children (slot, name, sex, birth_date) values
        (1, 'Noam', 'boy', date '2023-04-05'), (2, 'Maya', 'girl', date '2021-06-07'), (3, 'Ori', 'unknown', date '2025-08-09');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
    end
    $$ $q$), '^OK:[0-9]+$', 'OK'),
  'OK',
  '[F1.4-a c8 c10] as f1, the full creation block succeeds: user, profile, 2 journeys, 3 children, 1 consent in one transaction');

select is(tests.fx_counts(tests.fx_id('f1')), '1/1/2/3/1',
  '[F1.4-a c8 c14] f1 owns exactly 1 user, 1 profile, 2 journeys, 3 children, 1 consent, all set by the database (no user_id was sent)');
select is(tests.fx_journeys(tests.fx_id('f1')), 'has_child:null ; pregnant:2027-03-01',
  '[F1.4-a c8] the pregnant journey carries the due date; the has_child journey has none');
select is(tests.fx_children(tests.fx_id('f1')), '1:Noam:boy:2023-04-05 ; 2:Maya:girl:2021-06-07 ; 3:Ori:unknown:2025-08-09',
  '[F1.4-a c8] the children are stored in slot order with name, sex and birth date');
select is(tests.fx_consent(tests.fx_id('f1')), 't-1/p-1/true/true',
  '[F1.4-a c8 BR-068] the consent holds the versions, the 18+ declaration, and accepted_at equal to the database''s now()');
select is(tests.fx_user(tests.fx_id('f1')), 'regular/active',
  '[F1.4-a c14 rule 14] the created account is regular and active');
select is(tests.fx_profile(tests.fx_id('f1')), 'Fiona First/woman', '[F1.4-a c8] the profile holds the parent''s name and gender');

-- the created user reads its own rows through RLS (insert ... returning / select policies work together)
select is(tests.n_as(tests.fx_id('f1'), 'nestly.children'), '3', '[F1.4-a c14] the new user reads its 3 children');
select is(tests.n_as(tests.fx_id('f1'), 'nestly.journey_contexts'), '2', '[F1.4-a c14] the new user reads its 2 journeys');
select is(tests.n_as(tests.fx_id('f1'), 'nestly.legal_consents'), '1', '[F1.4-a c14] the new user reads its consent');

-- =====================================================================================================================
-- Repeat write is safe (criterion 10 "repeat write safe"; schema.md "Limits and idempotency")
-- =====================================================================================================================
create temp table zz_before_repeat as select tests.fx_state() as s;

select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name, gender) values ('Fiona Again', 'woman');
      insert into nestly.journey_contexts (stage) values ('planning');
      insert into nestly.children (slot, name, sex, birth_date) values (4, 'Extra', 'boy', date '2024-01-01');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-2', 'p-2', true);
    end
    $$ $q$),
  'ERR:23505',
  '[F1.4-a c10] a second full creation block for the same user is refused with 23505 (users_pkey): one account per Auth user');

select is(tests.fx_state(), (select s from zz_before_repeat),
  '[F1.4-a c10] after the repeated block every nestly table is byte-for-byte what it was: nothing was added or changed');
select is(tests.fx_counts(tests.fx_id('f1')), '1/1/2/3/1', '[F1.4-a c10] f1 still has exactly one account''s rows after the repeat');
select is(tests.fx_consent(tests.fx_id('f1')), 't-1/p-1/true/true', '[F1.4-a c10] the consent of the first write is untouched by the repeat');

-- =====================================================================================================================
-- Atomicity (criterion 10): force ONE insert to fail -> no row in any nestly table for that user.
-- Each case is a complete creation block with exactly one bad statement, run for f2 (who has nothing).
-- =====================================================================================================================
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f2')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name) values ('Atom One');
      insert into nestly.journey_contexts (stage) values ('has_child');
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'Ok', 'boy', date '2023-01-01'), (11, 'Too Many', 'boy', date '2023-01-01');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
    end
    $$ $q$),
  'ERR:23514',
  '[F1.4-a c10] a child with slot 11 fails the block (23514) ...');
select is(tests.fx_counts(tests.fx_id('f2')), '0/0/0/0/0',
  '[F1.4-a c10] ... and leaves no row in any table for f2: not the user, the profile, the journey, the first child, nor the consent');

select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f2')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name) values ('Atom Two');
      insert into nestly.journey_contexts (stage) values ('has_child');
      insert into nestly.journey_contexts (stage) values ('has_child');
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'Ok', 'boy', date '2023-01-01');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
    end
    $$ $q$),
  'ERR:23505',
  '[F1.4-a c10] a second journey of the same stage fails the block (23505) ...');
select is(tests.fx_counts(tests.fx_id('f2')), '0/0/0/0/0', '[F1.4-a c10] ... and leaves no row for f2');

select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f2')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name) values ('Atom Three');
      insert into nestly.journey_contexts (stage) values ('has_child');
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'Ok', 'boy', date '2023-01-01');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', false);
    end
    $$ $q$),
  'ERR:23514',
  '[F1.4-a c10] a consent with has_declared_18_plus = false (the LAST insert) fails the block (23514) ...');
select is(tests.fx_counts(tests.fx_id('f2')), '0/0/0/0/0',
  '[F1.4-a c10] ... and leaves no row for f2: even though users, profile, journey and child were inserted before it');

select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f2')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name) values ('Atom Four');
      insert into nestly.journey_contexts (stage) values ('has_child');
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'Ok', 'boy', date '2023-01-01');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus, accepted_at)
        values ('t-1', 'p-1', true, now() - interval '1 day');
    end
    $$ $q$),
  'ERR:42501',
  '[F1.4-a c10 c14] a consent that sends its own accepted_at fails the block (42501) ...');
select is(tests.fx_counts(tests.fx_id('f2')), '0/0/0/0/0', '[F1.4-a c10] ... and leaves no row for f2');

select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f2')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name) values ('A');
      insert into nestly.journey_contexts (stage) values ('has_child');
    end
    $$ $q$),
  'ERR:23514',
  '[F1.4-a c10] an invalid profile (full name of 1 character) fails the block (23514) ...');
select is(tests.fx_counts(tests.fx_id('f2')), '0/0/0/0/0', '[F1.4-a c10] ... and leaves no user row behind (the first statement was rolled back)');

-- after all the failures f2 can still register cleanly (a retry starts from nothing, criterion 11)
select is(
  regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f2')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name) values ('Retry Ok');
      insert into nestly.journey_contexts (stage) values ('planning');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
    end
    $$ $q$), '^OK:[0-9]+$', 'OK'),
  'OK',
  '[F1.4-a c10] after the failed attempts f2''s retry succeeds');
select is(tests.fx_counts(tests.fx_id('f2')), '1/1/1/0/1', '[F1.4-a c10] f2 now has its one account: 1 user, 1 profile, 1 journey, 0 children, 1 consent');

-- =====================================================================================================================
-- Rule 14 — account_type and status are pinned; rule 12 — no one writes in another's name
-- =====================================================================================================================
select is(tests.fx_counts(tests.fx_id('f3')), '0/0/0/0/0', '[F1.4-a c14 fixture] f3 starts with no account');

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id(t.w)), t.s, false), t.expected,
  '[F1.4-a c14 rule ' || t.rule || '] ' || t.label)
from (values
  -- status gate and write order: nothing exists yet for f3, so is_active_account() is false
  ('f3', $q$ insert into nestly.regular_profiles (full_name) values ('Too Early') $q$, 'ERR:42501', '14/15',
     'a profile insert BEFORE the users insert is refused (42501): the write order is part of the design'),
  ('f3', $q$ insert into nestly.journey_contexts (stage) values ('planning') $q$, 'ERR:42501', '15',
     'a journey insert before the users insert is refused (42501)'),
  ('f3', $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Early', 'boy', date '2023-01-01') $q$, 'ERR:42501', '15',
     'a child insert before the users insert is refused (42501)'),
  ('f3', $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t', 'p', true) $q$, 'ERR:42501', '15',
     'a consent insert before the users insert is refused (42501)'),
  -- account_type and status pinned
  ('f3', $q$ insert into nestly.users (account_type, status) values ('admin', 'active') $q$, 'ERR:42501', '14',
     'users insert with account_type admin is refused (42501)'),
  ('f3', $q$ insert into nestly.users (account_type, status) values ('professional', 'active') $q$, 'ERR:42501', '14',
     'users insert with account_type professional is refused (42501): professional registration has its own Gate 2'),
  ('f3', $q$ insert into nestly.users (account_type, status) values ('moderator', 'active') $q$, 'ERR:42501', '14',
     'users insert with an unknown account_type is refused (42501)'),
  ('f3', $q$ insert into nestly.users (account_type, status) values ('regular', 'suspended') $q$, 'ERR:42501', '14',
     'users insert with status suspended is refused (42501)'),
  ('f3', $q$ insert into nestly.users (account_type, status) values ('regular', 'banned') $q$, 'ERR:42501', '14',
     'users insert with status banned is refused (42501)'),
  ('f3', $q$ insert into nestly.users (account_type, status) values ('admin', 'suspended') $q$, 'ERR:42501', '14',
     'users insert with both pinned columns wrong is refused (42501)'),
  -- client-sent owner id
  ('f3', format($q$ insert into nestly.users (id, account_type, status) values (%L, 'regular', 'active') $q$, tests.fx_id('b')), 'ERR:42501', '12',
     'users insert with ANOTHER user''s id (b) is refused (42501)'),
  ('f3', format($q$ insert into nestly.users (id, account_type, status) values (%L, 'regular', 'active') $q$, tests.fx_id('f4')), 'ERR:42501', '12',
     'users insert with a free id that is not the caller''s (f4) is refused (42501)'),
  ('f3', format($q$ insert into nestly.users (id, account_type, status) values (%L, 'regular', 'active') $q$, gen_random_uuid()), 'ERR:42501', '12',
     'users insert with a random id is refused (42501)'),
  ('f3', $q$ insert into nestly.users (id, account_type, status) values ('f0000000-0000-4000-8000-0000000000f5', 'regular', 'active') $q$, 'ERR:42501', '12',
     'users insert with the literal id of another free user (f5) is refused (42501)')
) as t(w, s, expected, rule, label);

-- an explicit NULL id: refused by the policy (42501) or by NOT NULL (23502), whichever the engine evaluates first; never stored
select ok(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f3')),
    $q$ insert into nestly.users (id, account_type, status) values (null, 'regular', 'active') $q$, false) in ('ERR:42501', 'ERR:23502'),
  '[F1.4-a c14 rule 12] users insert with an explicit NULL id is refused: it does not fall back to auth.uid()');

select is(tests.fx_counts(tests.fx_id('f3')), '0/0/0/0/0', '[F1.4-a c14] after all of those f3 still has nothing');
select is(tests.fx_counts(tests.fx_id('f4')), '0/0/0/0/0', '[F1.4-a c14 rule 12] and f4, whose id f3 tried to use, has nothing either');

-- owner-id refusals on the dependent tables, as f1 (who has an active account): the row names another user
create temp table zz_before_owner as select tests.fx_state() as s;

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), t.s, false), 'ERR:42501',
  '[F1.4-a c14 rule 12] ' || t.label)
from (values
  (format($q$ insert into nestly.regular_profiles (user_id, full_name) values (%L, 'Not Mine') $q$, tests.fx_id('f4')),
     'f1 inserts a profile for another user (f4): refused (42501)'),
  (format($q$ insert into nestly.journey_contexts (user_id, stage) values (%L, 'planning') $q$, tests.fx_id('b')),
     'f1 inserts a journey owned by b: refused (42501)'),
  (format($q$ insert into nestly.journey_contexts (user_id, stage) values (%L, 'planning') $q$, tests.fx_id('a')),
     'f1 inserts a journey owned by a: refused (42501)'),
  (format($q$ insert into nestly.children (user_id, slot, name, sex, birth_date) values (%L, 5, 'Stolen', 'boy', date '2020-01-01') $q$, tests.fx_id('b')),
     'f1 inserts a child owned by b: refused (42501)'),
  (format($q$ insert into nestly.children (user_id, slot, name, sex, birth_date) values (%L, 9, 'Stolen', 'boy', date '2020-01-01') $q$, tests.fx_id('a')),
     'f1 inserts a child owned by a (free slot): refused (42501)'),
  (format($q$ insert into nestly.legal_consents (user_id, terms_version, privacy_version, has_declared_18_plus) values (%L, 'x', 'y', true) $q$, tests.fx_id('b')),
     'f1 records a consent in b''s name: refused (42501)'),
  (format($q$ insert into nestly.legal_consents (user_id, terms_version, privacy_version, has_declared_18_plus) values (%L, 'x', 'y', true) $q$, tests.fx_id('f4')),
     'f1 records a consent for a user that has no account (f4): refused (42501)'),
  -- the consent time is the database's: any explicit value is refused
  ($q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus, accepted_at) values ('x', 'y', true, now() - interval '1 day') $q$,
     'f1 sends an accepted_at in the past: refused (42501)'),
  ($q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus, accepted_at) values ('x', 'y', true, now() + interval '1 day') $q$,
     'f1 sends an accepted_at in the future: refused (42501)'),
  ($q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus, accepted_at) values ('x', 'y', true, '1970-01-01') $q$,
     'f1 sends an accepted_at of 1970: refused (42501)')
) as t(s, label);

-- the explicit NULL accepted_at: either the policy (42501) or NOT NULL (23502) refuses it; it must not succeed
select ok(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus, accepted_at) values ('x', 'y', true, null) $q$, false)
    in ('ERR:42501', 'ERR:23502'),
  '[F1.4-a c14 BR-068] an explicit NULL accepted_at is refused (42501 or 23502), never stored');

select is(tests.fx_state(), (select s from zz_before_owner),
  '[F1.4-a c14 rules 12, 13] after every client-sent-owner and explicit-clock attempt nothing in nestly changed');

-- no identity at all: auth.uid() is NULL
select ok(
  tests.dml_as('authenticated', tests.claims(null), t.s, false) ~ '^ERR:(42501|23502)$',
  '[F1.4-a c14 rule 12] with no identity claims: ' || t.label || ' is refused')
from (values
  ($q$ insert into nestly.users (account_type, status) values ('regular', 'active') $q$, 'a users insert'),
  ($q$ insert into nestly.regular_profiles (full_name) values ('No One') $q$, 'a profile insert'),
  ($q$ insert into nestly.journey_contexts (stage) values ('planning') $q$, 'a journey insert'),
  ($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'No One', 'boy', date '2020-01-01') $q$, 'a child insert'),
  ($q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t', 'p', true) $q$, 'a consent insert')
) as t(s, label);

select is(tests.fx_state(), (select s from zz_before_owner),
  '[F1.4-a c14] nothing was written with no identity');

-- =====================================================================================================================
-- A profile cannot be created as another account type, and a regular account is created in one piece only
-- =====================================================================================================================
select ok(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f5')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (account_type, full_name) values ('professional', 'Pat Pro');
    end
    $$ $q$, false) like 'ERR:%',
  '[F1.4-a c14 rule 14] a regular_profiles row with account_type professional is refused');
select is(tests.fx_counts(tests.fx_id('f5')), '0/0/0/0/0', '[F1.4-a c14] and it left nothing behind for f5');

select * from finish();

rollback;
