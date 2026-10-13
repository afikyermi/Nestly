-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.1 part b).
-- What the tables themselves refuse (criterion 10: the approved column lists carry constraints; VAL-001 full name 2-60
-- characters after trimming, VAL-006 gender list, BR-016 account type, FK integrity). The writers are the fixture
-- helpers (supabase/tests/setup/10_identity_fixtures.sql), which run as postgres; tests.dml_as(..., keep := false)
-- rolls each probe back, so a probe that succeeds ('OK:1') leaves nothing behind and every probe can reuse the same
-- accounts. [VAL-001 (09-validations.md:7) · VAL-006 · BR-016 · schema.md column table]
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.1-b c10] session_user is app_server (this file must not run under another login)');

-- Two accounts to attach profiles to; both persist inside this transaction only.
select lives_ok(format($q$ select tests.fx_insert_user(%L, 'regular', 'active') $q$, tests.fx_id('f1')), '[F1.1-b c10] f1: a regular account (fixture)');
select lives_ok(format($q$ select tests.fx_insert_user(%L, 'professional', 'active') $q$, tests.fx_id('f2')), '[F1.1-b c10] f2: a professional account (fixture)');

-- ---- VAL-001: full name, 2 to 60 characters after trimming the spaces at both ends ----------------------------------------
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, %L, null) $q$, tests.fx_id('f1'), r.name), false),
  r.expected,
  '[F1.1-b c10 VAL-001] full_name ' || r.label || ' -> ' || r.expected)
from (values
  ('is empty',                          '',                      'ERR:23514'),
  ('is one space',                      ' ',                     'ERR:23514'),
  ('is only spaces',                    '      ',                'ERR:23514'),
  ('is one character',                  'a',                     'ERR:23514'),
  ('is one character with spaces round it', '   a   ',           'ERR:23514'),
  ('is one Hebrew character',           chr(1488),               'ERR:23514'),
  ('is two characters',                 'ab',                    'OK:1'),
  ('is two characters with spaces round them', '   ab   ',       'OK:1'),
  ('is two Hebrew characters',          chr(1488) || chr(1489),  'OK:1'),
  ('is a normal name',                  'Alice Aaron',           'OK:1'),
  ('is 59 characters',                  repeat('x', 59),         'OK:1'),
  ('is exactly 60 characters',          repeat('x', 60),         'OK:1'),
  ('is 60 characters plus spaces round them', '  ' || repeat('x', 60) || '  ', 'OK:1'),
  ('is exactly 60 Hebrew characters (120 bytes)', repeat(chr(1488), 60), 'OK:1'),
  ('is 61 characters',                  repeat('x', 61),         'ERR:23514'),
  ('is 61 Hebrew characters',           repeat(chr(1488), 61),   'ERR:23514'),
  ('is 61 characters plus spaces',      ' ' || repeat('x', 61) || ' ', 'ERR:23514'),
  ('is 5000 characters',                repeat('x', 5000),       'ERR:23514'),
  ('has a quote and a semicolon (hostile text is data)', 'Rob''); drop table nestly.users;--', 'OK:1')
) as r(label, name, expected);

select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, null, null) $q$, tests.fx_id('f1')), false),
  'ERR:23502',
  '[F1.1-b c10 VAL-001] a NULL full_name is refused (not_null_violation)');

-- ---- VAL-006: gender is optional; woman / man / other / prefer_not_to_say -----------------------------------------------
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, 'Alice Aaron', %L) $q$, tests.fx_id('f1'), r.gender), false),
  r.expected,
  '[F1.1-b c10 VAL-006] gender ' || r.label || ' -> ' || r.expected)
from (values
  ('woman',                'woman',             'OK:1'),
  ('man',                  'man',               'OK:1'),
  ('other',                'other',             'OK:1'),
  ('prefer_not_to_say',    'prefer_not_to_say', 'OK:1'),
  ('is empty text',        '',                  'ERR:23514'),
  ('is Woman (case)',      'Woman',             'ERR:23514'),
  ('is female',            'female',            'ERR:23514'),
  ('is "prefer not to say" with spaces', 'prefer not to say', 'ERR:23514'),
  ('is a space',           ' ',                 'ERR:23514'),
  ('is unknown',           'unknown',           'ERR:23514')
) as r(label, gender, expected);

select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, 'Alice Aaron', null) $q$, tests.fx_id('f1')), false),
  'OK:1',
  '[F1.1-b c10 VAL-006] gender NULL (not answered) is allowed: the field is optional');

-- ---- BR-016: a profile belongs to a Regular account only -----------------------------------------------------------------
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, 'Pat Professional', null) $q$, tests.fx_id('f2')), false),
  'ERR:23503',
  '[F1.1-b c10 BR-016] a RegularProfile for a professional account is refused (foreign_key_violation on (user_id, account_type))');
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, 'Pat Professional', null, 'professional') $q$, tests.fx_id('f2')), false),
  'ERR:23514',
  '[F1.1-b c10 BR-016] a RegularProfile whose account_type is professional is refused (check_violation)');
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, 'Ann Admin', null, 'admin') $q$, tests.fx_id('f1')), false),
  'ERR:23514',
  '[F1.1-b c10 BR-016] a RegularProfile whose account_type is admin is refused');
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, 'No Account', null) $q$, tests.fx_id('f3')), false),
  'ERR:23503',
  '[F1.1-b c10] a RegularProfile for an Auth user that has no User row is refused (foreign_key_violation)');
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_profile(%L, 'Alice Twice', null) $q$, tests.fx_id('a')), false),
  'ERR:23505',
  '[F1.1-b c10] a second RegularProfile for the same account is refused (unique_violation)');

-- ---- account type and status on User --------------------------------------------------------------------------------------
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_user(%L, %L, 'active') $q$, tests.fx_id('f3'), r.account_type), false),
  r.expected,
  '[F1.1-b c10 BR-016] account_type ' || r.label || ' -> ' || r.expected)
from (values
  ('regular',             'regular',      'OK:1'),
  ('professional',        'professional', 'OK:1'),
  ('admin',               'admin',        'OK:1'),
  ('moderator',           'moderator',    'OK:1'),
  ('is Regular (case)',   'Regular',      'ERR:23514'),
  ('is parent',           'parent',       'ERR:23514'),
  ('is superuser',        'superuser',    'ERR:23514'),
  ('is empty text',       '',             'ERR:23514'),
  ('is service_role',     'service_role', 'ERR:23514')
) as r(label, account_type, expected);

select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_user(%L, 'regular', %L) $q$, tests.fx_id('f3'), r.status), false),
  r.expected,
  '[F1.1-b c10 FR-MOD-002] status ' || r.label || ' -> ' || r.expected)
from (values
  ('active',              'active',    'OK:1'),
  ('suspended',           'suspended', 'OK:1'),
  ('banned',              'banned',    'OK:1'),
  ('is Active (case)',    'Active',    'ERR:23514'),
  ('is pending',          'pending',   'ERR:23514'),
  ('is deleted',          'deleted',   'ERR:23514'),
  ('is closed',           'closed',    'ERR:23514'),
  ('is empty text',       '',          'ERR:23514')
) as r(label, status, expected);

select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_user(%L, null, 'active') $q$, tests.fx_id('f3')), false),
  'ERR:23502', '[F1.1-b c10 BR-016] a NULL account_type is refused: nothing defaults to regular');
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_user(%L, 'regular', null) $q$, tests.fx_id('f3')), false),
  'ERR:23502', '[F1.1-b c10 FR-MOD-002] a NULL status is refused: nothing defaults to active');
select is(
  tests.dml_as('none', '', format($q$ select tests.fx_insert_user(%L, 'regular', 'active') $q$, tests.fx_id('a')), false),
  'ERR:23505', '[F1.1-b c10] a second User row for the same id is refused (unique_violation)');

select * from finish();

rollback;
