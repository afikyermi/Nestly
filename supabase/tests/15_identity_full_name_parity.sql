-- pgTAP, run by pg_prove as app_server (CI `db` job).
-- F1.3 pass a, criterion 1 [VAL-001 · AC-002]: parity with packages/shared/tests/registration-step1.test.ts.
-- The same full-name table as the shared Zod test runs against regular_profiles_full_name_check; every result must
-- match (accepted = OK:1, refused = ERR:23514). Keep the two tables identical. Note: the DB trims U+0020 only
-- (btrim), so a tab counts as a character, and length counts code points.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.3-a c1] session_user is app_server (this file must not run under another login)');

select lives_ok(format($q$ select tests.fx_insert_user(%L, 'regular', 'active') $q$, tests.fx_id('f1')),
  '[F1.3-a c1] f1: a regular account (fixture)');

create temp table zz_names as select * from (values
  ('one Hebrew letter',                          chr(1488),                                'ERR:23514'),
  ('padded two letters',                         '  ' || chr(1488) || chr(1489) || '  ',   'OK:1'),
  ('60 code points',                             repeat('x', 60),                          'OK:1'),
  ('61 code points',                             repeat('x', 61),                          'ERR:23514'),
  ('leading space + 1 letter = 1 after trim',    ' ' || chr(1488),                         'ERR:23514'),
  ('tab + letter = 2 (tab is not trimmed)',      E'\t' || chr(1488),                       'OK:1'),
  ('single emoji (1 code point)',                chr(128512),                              'ERR:23514'),
  ('31 emoji',                                   repeat(chr(128512), 31),                  'OK:1'),
  ('60 emoji',                                   repeat(chr(128512), 60),                  'OK:1'),
  ('61 emoji',                                   repeat(chr(128512), 61),                  'ERR:23514'),
  ('letter + niqqud = 2 code points',            chr(1488) || chr(1456),                   'OK:1'),
  ('niqqud alone = 1',                           chr(1456),                                'ERR:23514'),
  ('60 code points with niqqud',                 repeat(chr(1488) || chr(1456), 30),       'OK:1'),
  ('61 code points with niqqud',                 repeat(chr(1488) || chr(1456), 30) || chr(1488), 'ERR:23514'),
  ('empty',                                      '',                                       'ERR:23514'),
  ('spaces only',                                '      ',                                 'ERR:23514'),
  ('single tab',                                 E'\t',                                    'ERR:23514'),
  ('61 chars between spaces',                    ' ' || repeat('x', 61) || ' ',            'ERR:23514'),
  ('hostile text is data',                       'Rob''); drop table users;--',            'OK:1')
) as r(label, name, expected);

select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, %L, null) $q$, tests.fx_id('f1'), r.name), false),
  r.expected,
  '[F1.3-a c1 VAL-001 AC-002] full_name ' || r.label || ' -> ' || r.expected)
from zz_names r;

-- F2.1 (FR-PROFILE-001): the same table on the UPDATE path, by the owner (a), each attempt rolled back. Same results.
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('a')), format($q$ update nestly.regular_profiles set full_name = %L $q$, r.name), false),
  r.expected,
  '[F2.1 c5 c6 c8 VAL-001] UPDATE full_name ' || r.label || ' -> ' || r.expected)
from zz_names r;

select * from finish();

rollback;
