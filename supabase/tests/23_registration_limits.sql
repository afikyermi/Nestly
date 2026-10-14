-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.4 part a).
-- Criterion 14 (limits: "an 11th child and a second journey of the same stage for one user are refused by the database")
-- plus the schema.md limits table: VAL-039 (stages, planning never with pregnant, due date only on pregnant),
-- VAL-040 (<= 10 children), VAL-005 (birth date floor), VAL-006 (sex), child-name parity (DR-2 of F1.3), consent versions.
-- Every case runs as `authenticated` f1 with keep = false: the statement is tried and rolled back, so every case starts from
-- the same state (f1 = a regular active account with a profile and nothing else). Multi-statement cases are one DO block.
-- "Refused" = the stated SQLSTATE: 23514 check, 23505 unique, 23502 not null.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.4-a c14] session_user is app_server (this file must not run under another login)');

select lives_ok(format($q$ select tests.fx_insert_user(%L, 'regular', 'active') $q$, tests.fx_id('f1')), '[F1.4-a c14] f1: a regular active account (fixture)');
select lives_ok(format($q$ select tests.fx_insert_profile(%L, 'Limits Parent', null) $q$, tests.fx_id('f1')), '[F1.4-a c14] f1: its profile (fixture)');
select is(tests.fx_counts(tests.fx_id('f1')), '1/1/0/0/0', '[F1.4-a c14] f1 starts with an account and nothing else');

create temp table zz_state as select tests.fx_state() as s0;

-- =====================================================================================================================
-- Children: at most 10 (slot 1-10), unique per slot  [VAL-040]
-- =====================================================================================================================
select is(
  regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date)
        select n, 'Child ' || n, 'boy', date '2020-01-01' from generate_series(1, 10) as n $q$, false), '^OK:[0-9]+$', 'OK'),
  'OK', '[F1.4-a c14 VAL-040] ten children, slots 1-10, are accepted');

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date)
        select n, 'Child ' || n, 'boy', date '2020-01-01' from generate_series(1, 11) as n $q$, false),
  'ERR:23514', '[F1.4-a c14 VAL-040] an 11th child (slot 11) in the same statement is refused (23514): none of the eleven is stored');

select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$
    begin
      insert into nestly.children (slot, name, sex, birth_date)
        select n, 'Child ' || n, 'boy', date '2020-01-01' from generate_series(1, 10) as n;
      insert into nestly.children (slot, name, sex, birth_date) values (11, 'Eleventh', 'boy', date '2020-01-01');
    end
    $$ $q$, false),
  'ERR:23514', '[F1.4-a c14 VAL-040] an 11th child inserted after ten exist is refused (23514)');

select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$
    begin
      insert into nestly.children (slot, name, sex, birth_date)
        select n, 'Child ' || n, 'boy', date '2020-01-01' from generate_series(1, 10) as n;
      insert into nestly.children (slot, name, sex, birth_date) values (5, 'Eleventh in a taken slot', 'boy', date '2020-01-01');
    end
    $$ $q$, false),
  'ERR:23505', '[F1.4-a c14 VAL-040] an 11th child squeezed into a taken slot is refused (23505): ten is the maximum however it is tried');

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date) values (0, 'Zero', 'boy', date '2020-01-01') $q$, false),
  'ERR:23514', '[F1.4-a c14 VAL-040] slot 0 is refused (23514)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date) values (-1, 'Negative', 'boy', date '2020-01-01') $q$, false),
  'ERR:23514', '[F1.4-a c14 VAL-040] a negative slot is refused (23514)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date) values (32767, 'Huge', 'boy', date '2020-01-01') $q$, false),
  'ERR:23514', '[F1.4-a c14 VAL-040] the largest smallint slot is refused (23514)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (name, sex, birth_date) values ('No Slot', 'boy', date '2020-01-01') $q$, false),
  'ERR:23502', '[F1.4-a c14] a child without a slot is refused (23502): the database does not number children by itself');
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$
    begin
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'First', 'boy', date '2020-01-01');
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'Twin', 'girl', date '2020-01-01');
    end
    $$ $q$, false),
  'ERR:23505', '[F1.4-a c14] a duplicate slot is refused (23505)');
select is(
  regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$
    begin
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'Same', 'boy', date '2020-01-01');
      insert into nestly.children (slot, name, sex, birth_date) values (2, 'Same', 'boy', date '2020-01-01');
    end
    $$ $q$, false), '^OK:[0-9]+$', 'OK'),
  'OK', '[F1.4-a c14] twins (same name, sex and birth date) are accepted in two slots');

-- sex [VAL-006]
select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Sexy', %L, date '2020-01-01') $q$, t.v), false),
    '^OK:[0-9]+$', 'OK'), t.expected, '[F1.4-a c14 VAL-006] child sex ' || t.shown)
from (values ('boy', 'OK', 'boy accepted'), ('girl', 'OK', 'girl accepted'), ('unknown', 'OK', 'unknown accepted'),
             ('', 'ERR:23514', 'empty string refused (23514)'), ('male', 'ERR:23514', 'male refused (23514)'),
             ('Boy', 'ERR:23514', 'Boy (case) refused (23514)'), ('boy ', 'ERR:23514', 'boy with a trailing space refused (23514)'),
             ('other', 'ERR:23514', 'other refused (23514)')) as t(v, expected, shown);
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Null Sex', null, date '2020-01-01') $q$, false),
  'ERR:23502', '[F1.4-a c14 VAL-006] a child without a sex is refused (23502): sex is required');

-- birth date [VAL-005]: floor only; "not in the future" is the server's (clock-dependent)
select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'Dated', 'boy', date %L) $q$, t.v), false),
    '^OK:[0-9]+$', 'OK'), t.expected, '[F1.4-a c14 VAL-005] child birth date ' || t.v || ' ' || t.shown)
from (values ('1899-12-31', 'ERR:23514', 'is refused (23514)'), ('1900-01-01', 'OK', 'is accepted (the floor)'),
             ('0001-01-01', 'ERR:23514', 'is refused (23514)'), ('2024-02-29', 'OK', 'is accepted (a leap day)'),
             ('2024-06-30', 'OK', 'is accepted')) as t(v, expected, shown);
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, 'No Date', 'boy', null) $q$, false),
  'ERR:23502', '[F1.4-a c14 VAL-005] a child without a birth date is refused (23502)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.children (slot, name, sex, birth_date) values (1, null, 'boy', date '2020-01-01') $q$, false),
  'ERR:23502', '[F1.4-a c14] a child without a name is refused (23502)');

-- child name parity: 1-60 code points after trimming U+0020 only (DR-2 of F1.3; same counting as VAL-001).
-- The same rows belong in the shared Zod test for CHILD_NAME_MIN/MAX_LENGTH; the database and the schema must agree.
select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.children (slot, name, sex, birth_date) values (1, %L, 'boy', date '2020-01-01') $q$, t.name), false),
    '^OK:[0-9]+$', 'OK'), t.expected, '[F1.4-a c14 F1.3 DR-2 parity] child name ' || t.label)
from (values
  ('',                                   'ERR:23514', 'empty is refused'),
  (' ',                                  'ERR:23514', 'one space is refused (trims to empty)'),
  (repeat(' ', 80),                      'ERR:23514', '80 spaces are refused'),
  ('a',                                  'OK',        'one character is accepted'),
  ('  a  ',                              'OK',        'a with surrounding spaces is accepted (trims to 1)'),
  ('אבי',                                'OK',        'Hebrew is accepted'),
  (repeat('a', 60),                      'OK',        '60 characters are accepted'),
  (repeat('a', 61),                      'ERR:23514', '61 characters are refused'),
  (repeat('א', 60),                      'OK',        '60 Hebrew letters are accepted'),
  (repeat('א', 61),                      'ERR:23514', '61 Hebrew letters are refused'),
  (repeat(chr(128512), 60),              'OK',        '60 emoji (4-byte code points) are accepted: code points, not bytes'),
  (repeat(chr(128512), 61),              'ERR:23514', '61 emoji are refused'),
  (repeat(' ', 30) || repeat('a', 60) || repeat(' ', 30), 'OK', '60 characters padded with spaces to 120 are accepted (trim first)'),
  (repeat(' ', 30) || repeat('a', 61) || repeat(' ', 30), 'ERR:23514', '61 characters padded with spaces are refused'),
  (E'\t',                                'OK',        'a tab alone counts as one character (only U+0020 is trimmed)'),
  (chr(160),                             'OK',        'a no-break space alone counts as one character (only U+0020 is trimmed)'),
  (E'a\nb',                              'OK',        'an embedded newline is a character, not an error'),
  ('Robert''); drop table nestly.children;--', 'OK',  'a quote and a semicolon are data, not syntax')
) as t(name, expected, label);

-- =====================================================================================================================
-- Journeys: one per stage; planning never with pregnant; due date only on pregnant  [VAL-039]
-- =====================================================================================================================
select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.journey_contexts (stage) values (%L) $q$, t.stage), false),
    '^OK:[0-9]+$', 'OK'), t.expected, '[F1.4-a c14 VAL-039] stage ' || t.label)
from (values ('planning', 'OK', 'planning is accepted'), ('pregnant', 'OK', 'pregnant is accepted'), ('has_child', 'OK', 'has_child is accepted'),
             ('cycle', 'ERR:23514', 'cycle is refused (23514)'), ('', 'ERR:23514', 'empty is refused (23514)'),
             ('Pregnant', 'ERR:23514', 'Pregnant (case) is refused (23514)'), ('pregnant ', 'ERR:23514', 'pregnant with a space is refused (23514)'),
             ('has_children', 'ERR:23514', 'has_children is refused (23514)')) as t(stage, expected, label);
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.journey_contexts (stage) values (null) $q$, false),
  'ERR:23502', '[F1.4-a c14 VAL-039] a journey without a stage is refused (23502)');

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), t.sql, false), t.expected,
  '[F1.4-a c14 VAL-039] ' || t.label)
from (values
  ($q$ do $$ begin
         insert into nestly.journey_contexts (stage) values ('pregnant');
         insert into nestly.journey_contexts (stage) values ('pregnant');
       end $$ $q$, 'ERR:23505', 'a second journey of the same stage (pregnant) is refused (23505)'),
  ($q$ do $$ begin
         insert into nestly.journey_contexts (stage) values ('has_child');
         insert into nestly.journey_contexts (stage) values ('has_child');
       end $$ $q$, 'ERR:23505', 'a second journey of the same stage (has_child) is refused (23505)'),
  ($q$ do $$ begin
         insert into nestly.journey_contexts (stage) values ('planning');
         insert into nestly.journey_contexts (stage) values ('planning');
       end $$ $q$, 'ERR:23505', 'a second journey of the same stage (planning) is refused (23505)'),
  ($q$ insert into nestly.journey_contexts (stage) values ('pregnant'), ('pregnant') $q$, 'ERR:23505',
       'two pregnant journeys in one statement are refused (23505)'),
  ($q$ do $$ begin
         insert into nestly.journey_contexts (stage) values ('planning');
         insert into nestly.journey_contexts (stage) values ('pregnant');
       end $$ $q$, 'ERR:23505', 'planning and then pregnant for one user are refused (23505): VAL-039'),
  ($q$ do $$ begin
         insert into nestly.journey_contexts (stage) values ('pregnant');
         insert into nestly.journey_contexts (stage) values ('planning');
       end $$ $q$, 'ERR:23505', 'pregnant and then planning for one user are refused (23505): the order does not matter'),
  ($q$ insert into nestly.journey_contexts (stage) values ('planning'), ('pregnant') $q$, 'ERR:23505',
       'planning and pregnant in one statement are refused (23505)'),
  ($q$ insert into nestly.journey_contexts (stage, due_date) values ('pregnant', date '2027-03-01'), ('planning', null) $q$, 'ERR:23505',
       'planning with a pregnant journey that has a due date is refused (23505)')
) as t(sql, expected, label);

select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), t.sql, false), '^OK:[0-9]+$', 'OK'), 'OK',
  '[F1.4-a c14 VAL-039] ' || t.label)
from (values
  ($q$ insert into nestly.journey_contexts (stage) values ('planning'), ('has_child') $q$, 'planning together with has_child is accepted'),
  ($q$ insert into nestly.journey_contexts (stage, due_date) values ('pregnant', date '2027-03-01'), ('has_child', null) $q$, 'pregnant (with a due date) together with has_child is accepted'),
  ($q$ insert into nestly.journey_contexts (stage, due_date) values ('pregnant', null) $q$, 'pregnant with no due date (null) is accepted: the date is optional')
) as t(sql, label);

-- due date only on pregnant
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.journey_contexts (stage, due_date) values (%L, date '2027-03-01') $q$, t.stage), false),
  'ERR:23514', '[F1.4-a c14 VAL-039] a due date on a ' || t.stage || ' journey is refused (23514)')
from (values ('planning'), ('has_child')) as t(stage);
select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.journey_contexts (stage, due_date) values ('pregnant', date %L) $q$, t.v), false), '^OK:[0-9]+$', 'OK'),
  'OK', '[F1.4-a c14 VAL-039] a pregnant journey stores the due date ' || t.v || ' (the 30/300-day window is the server''s, not the database''s: a CHECK would invalidate valid rows as time passes)')
from (values ('2027-03-01'), ('2020-01-01'), ('2099-12-31')) as t(v);

-- =====================================================================================================================
-- Consent versions and the declaration  [BR-068 · AC-084]
-- =====================================================================================================================
select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values (%L, %L, true) $q$, t.terms, t.privacy), false),
    '^OK:[0-9]+$', 'OK'), t.expected, '[F1.4-a c14 AC-084] consent versions ' || t.label)
from (values
  ('1',               '1',               'OK',        '1 character each are accepted'),
  (repeat('v', 64),   repeat('v', 64),   'OK',        '64 characters each are accepted'),
  (repeat('v', 65),   'p',               'ERR:23514', '65-character terms version is refused (23514)'),
  ('t',               repeat('v', 65),   'ERR:23514', '65-character privacy version is refused (23514)'),
  ('',                'p',               'ERR:23514', 'empty terms version is refused (23514)'),
  ('t',               '',                'ERR:23514', 'empty privacy version is refused (23514)'),
  ('',                '',                'ERR:23514', 'both empty are refused (23514)'),
  (repeat('v', 10000), 'p',              'ERR:23514', 'a 10,000-character version is refused (23514)')
) as t(terms, privacy, expected, label);

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values (null, 'p', true) $q$, false),
  'ERR:23502', '[F1.4-a c14 AC-084] a null terms version is refused (23502)');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t', null, true) $q$, false),
  'ERR:23502', '[F1.4-a c14 AC-084] a null privacy version is refused (23502)');

select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    format($q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t', 'p', %s) $q$, t.v), false),
  t.expected, '[F1.4-a c14 BR-068] the 18+ declaration ' || t.label)
from (values ('false', 'ERR:23514', 'false is refused (23514): a row without the declaration cannot exist'),
             ('null',  'ERR:23502', 'null is refused (23502)')) as t(v, expected, label);
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.legal_consents (terms_version, privacy_version) values ('t', 'p') $q$, false),
  'ERR:23502', '[F1.4-a c14 BR-068] a consent that omits the declaration is refused (23502): there is no default of true');
select is(regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')),
    $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t', 'p', true) $q$, false),
    '^OK:[0-9]+$', 'OK'), 'OK', '[F1.4-a c14 BR-068] a consent with the declaration true and no explicit time is accepted');

-- a duplicate version pair for one account; a new pair is a new row (re-consent, I9)
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$ begin
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
    end $$ $q$, false),
  'ERR:23505', '[F1.4-a c14] the same version pair twice for one account is refused (23505)');
select is(
  regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$ begin
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-2', 'p-1', true);
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-2', true);
    end $$ $q$, false), '^OK:[0-9]+$', 'OK'),
  'OK', '[F1.4-a c14] a new terms or privacy version is a new row for the same account (re-consent needs no contract change)');

-- the limits are per user: another user may hold the same stage, slot and versions
select lives_ok(format($q$ select tests.fx_insert_user(%L, 'regular', 'active') $q$, tests.fx_id('f2')), '[F1.4-a c14] f2: a regular active account (fixture)');
select lives_ok(format($q$ select tests.fx_insert_profile(%L, 'Second Parent', null) $q$, tests.fx_id('f2')), '[F1.4-a c14] f2: its profile (fixture)');
select is(
  regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f2')), $q$
    do $$ begin
      insert into nestly.journey_contexts (stage, due_date) values ('pregnant', date '2027-03-01');
      insert into nestly.children (slot, name, sex, birth_date) values (1, 'Noa', 'girl', date '2024-05-10');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('fixture-terms-1', 'fixture-privacy-1', true);
    end $$ $q$, false), '^OK:[0-9]+$', 'OK'),
  'OK', '[F1.4-a c14] f2 may use the same stage, slot and version pair that a already holds: the limits are per user, not global');

-- after all of this: only the fixtures' two lives_ok rows exist beyond the starting state (all attempts were rolled back)
select is(tests.fx_counts(tests.fx_id('f1')), '1/1/0/0/0', '[F1.4-a c14] f1 still has no journey, child or consent: every attempt above was rolled back');
select is(tests.fx_counts(tests.fx_id('f2')), '1/1/0/0/0', '[F1.4-a c14] f2 too: its attempt was rolled back');
-- f2's account was added after zz_state was taken, so compare everything except it through the f1-side count above;
-- the committed fixture rows (a, b) must be unchanged:
select is(tests.fx_counts(tests.fx_id('a')), '1/1/2/2/1', '[F1.4-a c14] a''s fixture rows are untouched');
select is(tests.fx_counts(tests.fx_id('b')), '1/1/1/1/1', '[F1.4-a c14] b''s fixture rows are untouched');
select isnt((select s0 from zz_state), tests.fx_state(), '[F1.4-a c14] the state differs from the start only by f2''s fixture account (the control: the observer does see a change)');
select is(tests.fx_consent(tests.fx_id('a')), 'fixture-terms-1/fixture-privacy-1/true/false', '[F1.4-a c14] a''s fixture consent is untouched');

select * from finish();

rollback;
