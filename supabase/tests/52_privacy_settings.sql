-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.3a profile privacy: the owner's three settings).
-- Source of expected values: .work/profile-privacy/spec.md (criteria 5, 6 + Gate 1) and schema.md "pgTAP" (the c5 and c6
-- checks) and its Gate 2 split, not the migration text. Criterion numbers below are the spec's.
-- The three settings: visibility open | restricted (default open), the Journey Summary sentence shown (default true), the
-- child-birthday consent (default true) -- Afik, I2 questionnaire 1, 2, 5. Read through tests.fx_privacy (setup/50_), which RLS
-- does not filter: 'visibility/sentence/birthday'.
-- People (fixtures of supabase/tests/setup/): a regular active, children + pregnant + has_child; b regular active, planning + one
-- child; s suspended; x banned; p professional; c an Auth user with no users row; f1..f5 free Auth users. Rolled back at the end.
-- The backfill of rows that existed BEFORE the migration, and the guarded rollback, need app_owner: they are in
-- apps/server/tests/db/privacy-backfill.db.test.ts (c6). Here every row was written after the migration.
-- The cross-user read (profile_view, c7-c15) is F2.3b, reserved (DR-G1): nothing of it is asserted here.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.3-a c5] session_user is app_server (this file must not run under another login)');

create temp table zz_state as select tests.fx_privacy(tests.fx_id('b')) as b0, tests.fx_profile(tests.fx_id('b')) as b_profile;

create function pg_temp.upd(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(tests.fx_id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.rel(p_name text) returns oid language sql as $f$
  select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'nestly' and c.relname = p_name
$f$;

-- =====================================================================================================================
-- 1. Defaults: every account reads open / shown / on (c6)
-- =====================================================================================================================
select is(tests.fx_privacy(tests.fx_id(w.who)), 'open/true/true',
  '[F2.3-a c6 Q1 Q2 Q5] fixture account ' || w.who || ' (' || w.label || ') reads open, sentence shown, birthday on')
from (values ('a', 'with children, pregnant'), ('b', 'planning, one child'), ('s', 'suspended'), ('x', 'banned')) as w(who, label);

-- the c6 account kinds the fixtures lack: pregnant only (f2), planning only (f3), no journey at all (f4)
select lives_ok($q$ select tests.fx_insert_user(tests.fx_id('f2'), 'regular', 'active'),
                           tests.fx_insert_profile(tests.fx_id('f2'), 'דנה כהן', 'woman'),
                           tests.fx_insert_journey(tests.fx_id('f2'), 'pregnant', date '2027-03-01') $q$,
  '[F2.3-a fixture] f2: a Regular account, pregnant only');
select lives_ok($q$ select tests.fx_insert_user(tests.fx_id('f3'), 'regular', 'active'),
                           tests.fx_insert_profile(tests.fx_id('f3'), 'Planning Only', null),
                           tests.fx_insert_journey(tests.fx_id('f3'), 'planning') $q$,
  '[F2.3-a fixture] f3: a Regular account, planning only');
select lives_ok($q$ select tests.fx_insert_user(tests.fx_id('f4'), 'regular', 'active'),
                           tests.fx_insert_profile(tests.fx_id('f4'), 'No Journey', 'man') $q$,
  '[F2.3-a fixture] f4: a Regular account with no journey and no child');
select is(tests.fx_privacy(tests.fx_id(w.who)), 'open/true/true',
  '[F2.3-a c6] account ' || w.who || ' (' || w.label || '), written without the settings, reads the three defaults')
from (values ('f2', 'pregnant only'), ('f3', 'planning only'), ('f4', 'none')) as w(who, label);

select is(tests.fx_privacy_lacking(), 0::bigint,
  '[F2.3-a c6 OP-021] the count of Regular accounts (any status) lacking any of the three settings is 0');

-- =====================================================================================================================
-- 2. A registration after the migration gets the defaults without sending them (c6)
-- =====================================================================================================================
select is(
  regexp_replace(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name, gender) values ('Fiona First', 'woman');
      insert into nestly.journey_contexts (stage) values ('planning');
      insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-1', 'p-1', true);
    end
    $$ $q$), '^OK:[0-9]+$', 'OK'),
  'OK',
  '[F2.3-a c6 fixture] f1 registers through the owner INSERT path, naming none of the three settings');
select is(tests.fx_privacy(tests.fx_id('f1')), 'open/true/true',
  '[F2.3-a c6] the account registered after the migration reads open, sentence shown, birthday on');
select is(tests.fx_privacy_lacking(), 0::bigint, '[F2.3-a c6] and still no Regular account lacks a setting');

-- registration cannot send them: no INSERT on the three columns (schema.md "Authorization")
select is(
  tests.dml_as('authenticated', tests.claims(tests.fx_id('f5')), format($q$
    do $$
    begin
      insert into nestly.users (account_type, status) values ('regular', 'active');
      insert into nestly.regular_profiles (full_name, gender, %I) values ('Fiona Fifth', 'woman', %s);
    end
    $$ $q$, v.col, v.val)),
  'ERR:42501',
  '[F2.3-a c6 rule 12] a registration naming ' || v.col || ' is refused by privilege (42501): the whole block, nothing created')
from (values ('profile_visibility', $v$'restricted'$v$), ('is_empty_journey_sentence_shown', 'false'),
             ('is_child_birthday_shared', 'false')) as v(col, val);
select is(tests.fx_counts(tests.fx_id('f5')), '0/0/0/0/0', '[F2.3-a c6] f5 owns nothing after the refused registrations');

-- =====================================================================================================================
-- 3. Structure: per-column UPDATE, nothing else (c5)
-- =====================================================================================================================
select set_eq(
  $$ select a.attname::text from pg_catalog.pg_attribute a
      where a.attrelid = (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'nestly' and c.relname = 'regular_profiles')
        and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE') $$,
  $$ values ('full_name'), ('gender'), ('profile_visibility'), ('is_empty_journey_sentence_shown'), ('is_child_birthday_shared') $$,
  '[F2.3-a c5 rules 12, 14] authenticated can UPDATE exactly F2.1''s full_name, gender and the three settings of regular_profiles');
select is(has_table_privilege('authenticated', pg_temp.rel('regular_profiles'), 'UPDATE'), false,
  '[F2.3-a c5 rule 12] still no table-level UPDATE on regular_profiles');
select is_empty(
  $$ select a.attname from pg_catalog.pg_attribute a
      where a.attrelid = (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'nestly' and c.relname = 'regular_profiles')
        and a.attname in ('profile_visibility', 'is_empty_journey_sentence_shown', 'is_child_birthday_shared')
        and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')
             or has_column_privilege('anon', a.attrelid, a.attnum, 'INSERT')
             or has_column_privilege('anon', a.attrelid, a.attnum, 'UPDATE')
             or has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
             or has_column_privilege('authenticated', a.attrelid, a.attnum, 'REFERENCES')) $$,
  '[F2.3-a c5 c6] none of the three settings can be INSERTed (registration cannot send them) or REFERENCEd by authenticated, nor touched by anon');
select is(has_table_privilege('authenticated', pg_temp.rel('regular_profiles'), 'DELETE'), false,
  '[F2.3-a c5] no DELETE on regular_profiles');
select is(
  (select count(*) from pg_catalog.pg_policy pol where pol.polrelid = pg_temp.rel('regular_profiles') and pol.polcmd in ('d', '*')),
  0::bigint,
  '[F2.3-a c5] no DELETE or ALL policy on regular_profiles');
select is(
  (select count(*) from pg_catalog.pg_policy pol where pol.polrelid = pg_temp.rel('regular_profiles') and pol.polcmd = 'w'),
  1::bigint,
  '[F2.3-a c5 schema "Authorization"] the settings ride the one existing UPDATE policy: no new UPDATE policy on regular_profiles');

-- =====================================================================================================================
-- 4. A stores all 8 combinations exactly as sent (c5; the database half of c2)
-- =====================================================================================================================
-- one function call per combination, so the UPDATE runs before its read-back (two TAP lines, in order)
create function pg_temp.combo(p_vis text, p_sen boolean, p_bir boolean) returns setof text language plpgsql as $f$
declare
  v_want text := p_vis || '/' || p_sen || '/' || p_bir;
begin
  return next is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set profile_visibility = %L,
                                            is_empty_journey_sentence_shown = %L, is_child_birthday_shared = %L $q$, p_vis, p_sen, p_bir)),
    'OK:1', '[F2.3-a c5 c2] A sets ' || v_want || ' on its own row: 1 row');
  return next is(tests.fx_privacy(tests.fx_id('a')), v_want, '[F2.3-a c5 c2] stored exactly: ' || v_want);
end
$f$;
select pg_temp.combo('restricted', false, false);
select pg_temp.combo('restricted', false, true);
select pg_temp.combo('restricted', true,  false);
select pg_temp.combo('restricted', true,  true);
select pg_temp.combo('open',       false, false);
select pg_temp.combo('open',       false, true);
select pg_temp.combo('open',       true,  false);
select pg_temp.combo('open',       true,  true);

-- each setting alone moves alone
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set is_child_birthday_shared = false $q$), 'OK:1', '[F2.3-a c5] birthday alone off');
select is(tests.fx_privacy(tests.fx_id('a')), 'open/true/false', '[F2.3-a c5] only the birthday consent changed');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'OK:1', '[F2.3-a c5] visibility alone');
select is(tests.fx_privacy(tests.fx_id('a')), 'restricted/true/false', '[F2.3-a c5] only the visibility changed');

-- RETURNING (the repository's update-and-answer shape) works under RLS
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ update nestly.regular_profiles set profile_visibility = 'open', is_empty_journey_sentence_shown = false, is_child_birthday_shared = true
        returning profile_visibility || '/' || is_empty_journey_sentence_shown || '/' || is_child_birthday_shared $q$),
  'open/false/true', '[F2.3-a c5 c2] UPDATE ... RETURNING the three as active A gives the new values');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select profile_visibility || '/' || is_empty_journey_sentence_shown || '/' || is_child_birthday_shared from nestly.regular_profiles $q$),
  'open/false/true', '[F2.3-a c5] A reads its own three settings (no WHERE: RLS confines to the one row)');

-- =====================================================================================================================
-- 5. Own row only (c5)
-- =====================================================================================================================
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set profile_visibility = 'restricted', is_empty_journey_sentence_shown = false,
                                 is_child_birthday_shared = false $q$), 'OK:1',
  '[F2.3-a c5 A1] UPDATE of the three with no WHERE touches exactly one row: A''s own');
select is(tests.fx_privacy(tests.fx_id('b')), (select b0 from zz_state), '[F2.3-a c5 A1] B''s settings are unchanged after A''s no-WHERE update');

select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set profile_visibility = 'restricted', is_empty_journey_sentence_shown = false,
                                     is_child_birthday_shared = false where user_id = %L $q$, tests.fx_id('b'))), 'OK:0',
  '[F2.3-a c5 A1] UPDATE of B''s settings by A, naming B: 0 rows');
select is(tests.fx_privacy(tests.fx_id('b')), (select b0 from zz_state), '[F2.3-a c5 A1] B''s settings are unchanged');
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set is_child_birthday_shared = false where user_id in (%L, %L) $q$,
                                     tests.fx_id('a'), tests.fx_id('b'))), 'OK:1',
  '[F2.3-a c5 A1] A naming both A and B: only A''s own row (1)');
select is(tests.fx_privacy(tests.fx_id('b')), (select b0 from zz_state), '[F2.3-a c5 A1] B still unchanged');
select is(pg_temp.upd('b', format($q$ update nestly.regular_profiles set profile_visibility = 'open' where user_id = %L $q$, tests.fx_id('a'))), 'OK:0',
  '[F2.3-a c5 A1] and the other way round: B on A''s settings, 0 rows');
select is(tests.fx_privacy(tests.fx_id('a')), 'restricted/false/false', '[F2.3-a c5] A''s settings are what A set, untouched by B');
select is(pg_temp.upd('b', $q$ update nestly.regular_profiles set is_child_birthday_shared = true $q$), 'OK:1',
  '[F2.3-a c5] B writes B''s own: 1 row');
select is(tests.fx_privacy(tests.fx_id('a')), 'restricted/false/false', '[F2.3-a c5 A1] and A''s row did not move');

-- a granted setting together with a forbidden column: the whole statement is refused
select is(pg_temp.upd('a', t.s), 'ERR:42501', '[F2.3-a c5 rules 12, 14] refused by privilege (42501): ' || t.label)
from (values
  ($q$ update nestly.regular_profiles set profile_visibility = 'open', user_id = user_id $q$, 'the visibility with user_id'),
  (format($q$ update nestly.regular_profiles set is_child_birthday_shared = true, user_id = %L $q$, tests.fx_id('b')), 'the consent with user_id = B'),
  ($q$ update nestly.regular_profiles set is_empty_journey_sentence_shown = true, account_type = 'regular' $q$, 'the sentence with account_type'),
  ($q$ update nestly.regular_profiles set profile_visibility = 'open', created_at = now() $q$, 'the visibility with created_at')
) as t(s, label);
select is(tests.fx_privacy(tests.fx_id('a')), 'restricted/false/false', '[F2.3-a c5] A''s settings unchanged by the refused statements');

-- =====================================================================================================================
-- 6. B's birthday consent cannot be read by A, by any query (c5)
-- =====================================================================================================================
select lives_ok($q$ select tests.fx_privacy_put(tests.fx_id('b'), 'restricted', true, false) $q$,
  '[F2.3-a fixture] B: restricted, sentence shown, birthday OFF (a value A could try to learn)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format($q$ select count(*)::text from nestly.regular_profiles where user_id = %L $q$, tests.fx_id('b'))),
  '0', '[F2.3-a c5 A1] A selecting B''s profile row by B''s id reads nothing');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select string_agg(user_id::text || ':' || is_child_birthday_shared, ',') from nestly.regular_profiles $q$),
  tests.fx_id('a')::text || ':false', '[F2.3-a c5 A1] every consent A can read is A''s own (one row)');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format($q$ select coalesce((select is_child_birthday_shared::text from nestly.regular_profiles where user_id = %L), 'none') $q$, tests.fx_id('b'))),
  'none', '[F2.3-a c5] a scalar subquery for B''s consent yields no value');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format($q$ select count(*)::text from nestly.users u join nestly.regular_profiles p on p.user_id = u.id where u.id = %L $q$, tests.fx_id('b'))),
  '0', '[F2.3-a c5] a join through users reaches no row of B');

-- the write path is no oracle: a conditional UPDATE on B's value says 0 whatever the value is
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set is_child_birthday_shared = is_child_birthday_shared
                                     where user_id = %L and is_child_birthday_shared $q$, tests.fx_id('b'))), 'OK:0',
  '[F2.3-a c5 oracle] A: UPDATE where B''s consent is true -> 0');
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set is_child_birthday_shared = is_child_birthday_shared
                                     where user_id = %L and not is_child_birthday_shared $q$, tests.fx_id('b'))), 'OK:0',
  '[F2.3-a c5 oracle] A: UPDATE where B''s consent is false (its real value) -> also 0');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    format($q$ update nestly.regular_profiles set profile_visibility = profile_visibility where user_id = %L
               returning is_child_birthday_shared::text $q$, tests.fx_id('b'))),
  null, '[F2.3-a c5 oracle] UPDATE ... RETURNING aimed at B returns no value');

-- no view, materialized view or foreign table in nestly carries a column of the three (nothing reads around the policy)
select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('v', 'm', 'f') and a.attnum > 0 and not a.attisdropped
        and a.attname in ('profile_visibility', 'is_empty_journey_sentence_shown', 'is_child_birthday_shared') $$,
  '[F2.3-a c5] no view in nestly exposes the settings: the only way to them is the own-row policy');
select is(tests.as_role('anon', tests.claims(tests.fx_id('a')),
    $q$ select count(*)::text from nestly.regular_profiles $q$),
  'ERR:42501', '[F2.3-a c5] anon cannot read regular_profiles at all');
select is(tests.fx_privacy(tests.fx_id('b')), 'restricted/true/false', '[F2.3-a c5] B''s values are what the fixture set');
select lives_ok($q$ select tests.fx_privacy_put(tests.fx_id('b'), 'open', true, true) $q$, '[F2.3-a fixture] B back to the defaults');

-- =====================================================================================================================
-- 7. INSERT and DELETE are refused (c5)
-- =====================================================================================================================
select is(pg_temp.upd('a', t.s), 'ERR:42501', '[F2.3-a c5 rule 12] refused (42501): ' || t.label)
from (values
  (format($q$ insert into nestly.regular_profiles (user_id, full_name, profile_visibility) values (%L, 'Bella Again', 'restricted') $q$, tests.fx_id('b')),
   'INSERT of a profile row naming user_id B'),
  (format($q$ insert into nestly.regular_profiles (user_id, full_name) values (%L, 'Bella Again') $q$, tests.fx_id('b')),
   'INSERT naming user_id B, no setting'),
  ($q$ insert into nestly.regular_profiles (full_name, is_child_birthday_shared) values ('Alice Again', false) $q$,
   'INSERT of a profile row naming the birthday consent'),
  ($q$ delete from nestly.regular_profiles where user_id = auth.uid() $q$, 'DELETE of A''s own row'),
  (format($q$ delete from nestly.regular_profiles where user_id = %L $q$, tests.fx_id('b')), 'DELETE of B''s row')
) as t(s, label);
select is(tests.fx_profile(tests.fx_id('b')), (select b_profile from zz_state), '[F2.3-a c5] B''s profile row is untouched');

-- =====================================================================================================================
-- 8. The database refuses a value outside the domain (c5 schema; the server's 400 is c3)
-- =====================================================================================================================
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set profile_visibility = %L $q$, v.val), false), 'ERR:23514',
  '[F2.3-a c5 VAL-027] visibility ' || v.label || ': 23514')
from (values ('public', '''public'''), ('Open', '''Open'' (case)'), ('open ', '''open '' (a trailing space)'), ('', 'empty'),
             ('friends', '''friends'''), ('hidden', '''hidden'' (no hide-from-search, VAL-027)'),
             ($v$open'); update nestly.users set status = 'active';--$v$, 'a hostile string')) as v(val, label);
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set %I = null $q$, v.col), false), 'ERR:23502',
  '[F2.3-a c5] ' || v.col || ' NULL: 23502 (not null)')
from (values ('profile_visibility'), ('is_empty_journey_sentence_shown'), ('is_child_birthday_shared')) as v(col);
select is(pg_temp.upd('a', format($q$ update nestly.regular_profiles set %I = 'maybe' $q$, v.col), false), 'ERR:22P02',
  '[F2.3-a c5] ' || v.col || ' = ''maybe'': not a boolean (22P02)')
from (values ('is_empty_journey_sentence_shown'), ('is_child_birthday_shared')) as v(col);
select is(tests.fx_privacy(tests.fx_id('a')), 'restricted/false/false', '[F2.3-a c5] A''s settings unchanged by the refused values');

-- =====================================================================================================================
-- 9. Not an active account: nothing (c5)
-- =====================================================================================================================
create temp table zz_before_s as select tests.fx_privacy(tests.fx_id('a')) as v;
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'suspended') $q$, '[F2.3-a fixture] a suspended');
select is(tests.as_role('authenticated', tests.claims(tests.fx_id('a')),
    $q$ select count(*)::text from nestly.regular_profiles $q$), '0', '[F2.3-a c5 A9] suspended A reads none of its settings');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set profile_visibility = 'open', is_empty_journey_sentence_shown = true,
                                 is_child_birthday_shared = true $q$), 'OK:0',
  '[F2.3-a c5 A9 rule 15] suspended A: UPDATE of the three affects 0 rows');
select is(tests.fx_privacy(tests.fx_id('a')), (select v from zz_before_s), '[F2.3-a c5] unchanged while suspended');
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'banned') $q$, '[F2.3-a fixture] a banned');
select is(tests.n_as(tests.fx_id('a'), 'nestly.regular_profiles'), '0', '[F2.3-a c5 A9] banned A reads none of its settings');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set profile_visibility = 'open' $q$), 'OK:0',
  '[F2.3-a c5 A9] banned A: UPDATE affects 0 rows');
select is(tests.fx_privacy(tests.fx_id('a')), (select v from zz_before_s), '[F2.3-a c5] unchanged while banned');
select is(pg_temp.upd(w.who, $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'OK:0',
  '[F2.3-a c5 A9] the fixture ' || w.label || ' account: 0 rows')
from (values ('s', 'suspended'), ('x', 'banned')) as w(who, label);
select is(tests.fx_privacy(tests.fx_id(w.who)), 'open/true/true', '[F2.3-a c5] ' || w.label || ' account''s settings untouched')
from (values ('s', 'suspended'), ('x', 'banned')) as w(who, label);
select lives_ok($q$ select tests.set_status(tests.fx_id('a'), 'active') $q$, '[F2.3-a fixture] a active again');
select is(pg_temp.upd('a', $q$ update nestly.regular_profiles set profile_visibility = 'open' $q$), 'OK:1',
  '[F2.3-a c5] active again: the same UPDATE affects 1 row');

-- =====================================================================================================================
-- 10. Nobody else: anon, app_server itself, no claims, no account row, a Professional (c5)
-- =====================================================================================================================
select is(tests.dml_as('anon', tests.claims(tests.fx_id('a')), $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'ERR:42501',
  '[F2.3-a c5] anon UPDATE of a setting: refused');
select is(tests.dml_as('none', tests.claims(tests.fx_id('a')), $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'ERR:42501',
  '[F2.3-a c5 A8 rule 3] app_server without SET ROLE: refused');
select is(tests.dml_as('authenticated', '', $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'OK:0',
  '[F2.3-a c5] authenticated with no claims: 0 rows');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('c')), $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'OK:0',
  '[F2.3-a c5] an Auth user with no account row: 0 rows');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('p')), $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'OK:0',
  '[F2.3-a c5 scope "Regular only"] a Professional account has no Regular settings to change: 0 rows');
select is(tests.fx_privacy(tests.fx_id('p')), '-', '[F2.3-a c5] and no settings row exists for it');

-- =====================================================================================================================
-- 11. Nothing leaked to others
-- =====================================================================================================================
select is(tests.fx_privacy(tests.fx_id('b')), 'open/true/true', '[F2.3-a c5 A1] after the whole file, B''s settings are the defaults it started with');
select is(tests.fx_profile(tests.fx_id('b')), (select b_profile from zz_state), '[F2.3-a c5 A1] and B''s name and gender too');
select is(tests.fx_privacy_lacking(), 0::bigint, '[F2.3-a c6] at the end, still no Regular account lacks a setting');

select * from finish();

rollback;
