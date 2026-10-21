-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.3b: the cross-user read nestly.profile_view, a non-Friend's view).
-- Source of expected values: .work/profile-privacy/spec.md (criteria 7-15 + Gate 1 DR-4/DR-5 A, "Gate 1 (F2.3b re-spec)"
-- DR-6 A) and schema.md F2.3b ("Output", "pgTAP", "Approved (F2.3b)"), not the migration text. Criterion numbers are the spec's.
-- People: setup/53_profile_view_fixtures.sql (V = pv_v, B = pv_b with the spec's fixture, pv_e planning only, pv_z no journey,
-- pv_g pregnant only, pv_l link-check pending, pv_n a users row without a profile) and 10_'s p (Professional), s (suspended),
-- x (banned), c (no users row). Every read runs as app_server under SET LOCAL ROLE authenticated (tests.as_role), as the
-- runtime does (c15). The result is compared as jsonb text: one array element per row, '[]' = 0 rows. Rolled back at the end.
-- Today is the transaction's now() in Asia/Jerusalem; profile_view takes no instant (schema.md "Age rule"), so the fixed-date
-- table of c14 runs on child_age_months (through tests.fx_age) and profile_view is checked with births relative to today.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.3-b c15] session_user is app_server (this file must not run under another login)');

select lives_ok($q$ select tests.fx_pv_build() $q$, '[F2.3-b fixture] V, B (spec fixture), planning-only, no-journey, pregnant-only, pending, no-profile');
-- F2.4c1: every call to profile_view counts as an open (100 per hour by default); this file's reads are F2.3b's, not the limit's (file 64)
select lives_ok($q$ select tests.fx_set_limit(10000, 3600) $q$, '[F2.3-b fixture · F2.4-c] the profile-open limit raised to 10000 for this transaction: no read here is refused');

create function pg_temp.id(p_name text) returns uuid language sql as $f$
  select case when p_name in ('p', 's', 'x', 'c') then tests.fx_id_checked(p_name) else tests.fx_pv_id(p_name) end
$f$;
-- what a viewer gets from profile_view(target), as jsonb array text, or 'ERR:<sqlstate>'
create function pg_temp.pv(p_viewer text, p_target text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_viewer)),
    format($q$ select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))::text, '[]') from nestly.profile_view(%L) r $q$, p_target))
$f$;
create function pg_temp.pvn(p_viewer text, p_target text) returns text language sql as $f$
  select pg_temp.pv(p_viewer, pg_temp.id(p_target)::text)
$f$;
-- the one row the spec expects, as the same jsonb array text
-- F2.4c1 widened the row by four items: V is never a Friend of B here and B has no Friend, so the state is 'none' (null for a
-- Professional viewer), both lists are empty and the outcome is 'shown' (files 63 and 64 assert them)
create function pg_temp.want(p_name text, p_gender text, p_count int, p_ages jsonb, p_pregnant boolean, p_sentence boolean, p_rel text default 'none')
returns text language sql as $f$
  select jsonb_build_array(jsonb_build_object('full_name', p_name, 'gender', p_gender, 'children_count', p_count,
    'child_ages', p_ages, 'is_pregnant', p_pregnant, 'shows_empty_journey_sentence', p_sentence,
    'relationship', p_rel, 'friends', '[]'::jsonb, 'mutual_friends', '[]'::jsonb, 'outcome', 'shown'))::text
$f$;
-- the same row without the viewer's own state
create function pg_temp.nostate(p_viewer text, p_target text) returns jsonb language sql as $f$
  select (pg_temp.pvn(p_viewer, p_target)::jsonb -> 0) - 'relationship'
$f$;
create function pg_temp.age(p_birth date) returns jsonb language sql as $f$
  select jsonb_build_object('years', tests.fx_age(p_birth, now()) / 12, 'months', tests.fx_age(p_birth, now()) % 12)
$f$;
create function pg_temp.ym(p_birth date, p_at timestamptz) returns text language sql as $f$
  select (tests.fx_age(p_birth, p_at) / 12) || ',' || (tests.fx_age(p_birth, p_at) % 12)
$f$;
create function pg_temp.noon(p_day date) returns timestamptz language sql as $f$
  select (p_day + time '12:00') at time zone 'Asia/Jerusalem'
$f$;
create function pg_temp.as_owner(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.set_vis(p_who text, p_vis text) returns text language sql as $f$
  select pg_temp.as_owner(p_who, format($q$ update nestly.regular_profiles set profile_visibility = %L $q$, p_vis))
$f$;
create function pg_temp.set_sentence(p_who text, p_on boolean) returns text language sql as $f$
  select pg_temp.as_owner(p_who, format($q$ update nestly.regular_profiles set is_empty_journey_sentence_shown = %L $q$, p_on))
$f$;
create function pg_temp.today() returns date language sql as $f$ select (now() at time zone 'Asia/Jerusalem')::date $f$;
-- the three F2.3b functions by signature, looked up once (a per-row catalog scan in a join is quadratic)
create temp table zz_fn as
  select p.oid::regprocedure::text as sig, p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'nestly';
create function pg_temp.proc(p_sig text) returns oid language sql stable as $f$
  select f.oid from zz_fn f where f.sig = p_sig
$f$;

-- B's open ages, per child in display order, as child_age_months gives them for today (their values: section c14)
create function pg_temp.b_ages() returns jsonb language sql as $f$
  select jsonb_build_array(pg_temp.age(date '2023-05-04'), pg_temp.age(date '2025-01-10'))
$f$;

-- =====================================================================================================================
-- c7 — B restricted: exactly name, count 2, "בהריון"
-- =====================================================================================================================
select is(pg_temp.set_vis('pv_b', 'restricted'), 'OK:1', '[F2.3-b fixture] B sets restricted on its own row');
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', null, 2, null, true, false),
  '[F2.3-b c7 BR-044 AC-054] V reads B restricted: exactly full name, 2 children, pregnant; no gender, no ages, no sentence');

select is(
  (select pg_catalog.pg_get_function_result(pg_temp.proc('nestly.profile_view(text)'))),
  'TABLE(full_name text, gender text, children_count smallint, child_ages jsonb, is_pregnant boolean, shows_empty_journey_sentence boolean, relationship text, friends jsonb, mutual_friends jsonb, outcome text)',
  '[F2.3-b c7 c8 c10 P1 P2 · F2.4-c c17 c18 c19] the read has exactly ten outputs (F2.3b''s six, then the state, the two Friends lists, the outcome): no age text, child name, sex, birth date, child id or slot, due date, week, journey id, planning status, email, created_at, birthday consent, status or tracker data');

select is(
  (select pg_catalog.pg_get_function_arguments(pg_temp.proc('nestly.profile_view(text)'))),
  'p_target text',
  '[F2.3-b c15 schema "Age rule"] profile_view takes one argument, the target: no instant, no viewer id, no listing');

-- nothing of B's restricted data leaks in the values either
select is(
  pg_temp.pvn('pv_v', 'pv_b') ~ ('נועה|איתי|girl|boy|2023-05-04|2025-01-10|2027-03-01|woman|has_child|"pregnant"|planning|'
                                 || tests.fx_pv_id('pv_b')::text),
  false,
  '[F2.3-b c7 P1 P2] restricted: no child name, sex, birth date, due date, gender, stage or B''s id anywhere in the result');

-- =====================================================================================================================
-- c8 — B open: plus gender and the ages as numbers, in slot order
-- =====================================================================================================================
select is(pg_temp.set_vis('pv_b', 'open'), 'OK:1', '[F2.3-b fixture] B sets open');
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', 'woman', 2, pg_temp.b_ages(), true, false),
  '[F2.3-b c8 FR-PRIV-001 AC-054 DR-4] V reads B open: full name, gender, 2 children, one age per child (נועה first), pregnant');
select is(
  (select string_agg(k, ',' order by k) from jsonb_array_elements(pg_temp.pvn('pv_v', 'pv_b')::jsonb -> 0 -> 'child_ages') e,
     jsonb_object_keys(e) k),
  'months,months,years,years',
  '[F2.3-b c8 c14] each age item has exactly the keys years and months: no name, sex, birth date, id or slot');
select is(
  (select count(*) from jsonb_array_elements(pg_temp.pvn('pv_v', 'pv_b')::jsonb -> 0 -> 'child_ages') e
    where jsonb_typeof(e -> 'years') = 'number' and jsonb_typeof(e -> 'months') = 'number'
      and (e ->> 'years')::numeric = trunc((e ->> 'years')::numeric) and (e ->> 'months')::numeric = trunc((e ->> 'months')::numeric)
      and (e ->> 'years')::numeric >= 0 and (e ->> 'months')::numeric between 0 and 11),
  2::bigint,
  '[F2.3-b c8 c14] both ages are whole numbers, years >= 0 and months 0-11: numbers, no age text');
select is(
  pg_temp.pvn('pv_v', 'pv_b') ~ ('נועה|איתי|girl|boy|2023-05-04|2025-01-10|2027-03-01|has_child|planning|' || tests.fx_pv_id('pv_b')::text),
  false,
  '[F2.3-b c8 c7 P2] open: still no child name, sex, birth date, due date, stage or B''s id in the result');
-- the fixture's ages on the spec's day, 2026-10-17 in Asia/Jerusalem
select is(pg_temp.ym(date '2023-05-04', pg_temp.noon(date '2026-10-17')), '3,5', '[F2.3-b c8 DR-3] נועה, born 2023-05-04, is (3 years, 5 months) on 2026-10-17');
select is(pg_temp.ym(date '2025-01-10', pg_temp.noon(date '2026-10-17')), '1,9', '[F2.3-b c8 DR-3] איתי, born 2025-01-10, is (1 year, 9 months) on 2026-10-17');

-- gender NULL → no gender item; prefer_not_to_say shown as such (Gate 1 DR-4 A)
select is(pg_temp.as_owner('pv_b', $q$ update nestly.regular_profiles set gender = null $q$), 'OK:1', '[F2.3-b fixture] B clears its gender');
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', null, 2, pg_temp.b_ages(), true, false),
  '[F2.3-b c8 DR-4] B open with gender NULL: no gender item, the rest unchanged');
select is(pg_temp.as_owner('pv_b', $q$ update nestly.regular_profiles set gender = 'prefer_not_to_say' $q$), 'OK:1', '[F2.3-b fixture] B: prefer_not_to_say');
select is(pg_temp.pvn('pv_v', 'pv_b') ::jsonb -> 0 ->> 'gender', 'prefer_not_to_say', '[F2.3-b c8 DR-4] prefer_not_to_say is shown as such');
select is(pg_temp.as_owner('pv_b', $q$ update nestly.regular_profiles set gender = 'woman' $q$), 'OK:1', '[F2.3-b fixture] B: woman again');

-- display order (created_at, slot): a reused seat 1 with a later created_at comes last (schema.md "Output")
select lives_ok($q$ select tests.fx_pv_delete_child(tests.fx_pv_id('pv_b'), 1),
                           tests.fx_pv_child(tests.fx_pv_id('pv_b'), 1, 'שירה', 'girl', date '2026-04-17', timestamptz '2026-09-01 10:00+00') $q$,
  '[F2.3-b fixture] B removes נועה and adds a child in the freed slot 1, later');
select is(pg_temp.pvn('pv_v', 'pv_b') ::jsonb -> 0 -> 'child_ages',
  jsonb_build_array(pg_temp.age(date '2025-01-10'), pg_temp.age(date '2026-04-17')),
  '[F2.3-b c8 F2.2b order] the slot-1 child added later is listed after איתי');
select lives_ok($q$ select tests.fx_pv_delete_child(tests.fx_pv_id('pv_b'), 1),
                           tests.fx_pv_child(tests.fx_pv_id('pv_b'), 1, 'נועה', 'girl', date '2023-05-04', timestamptz '2026-01-01 10:00+00') $q$,
  '[F2.3-b fixture] B''s fixture children restored');

-- =====================================================================================================================
-- c9 — no other path: every table and view in nestly, read directly as V, returns none of B's rows
-- =====================================================================================================================
-- One DO block as V scans every relation for B's id, names, dates; a hit raises 'hits: <relation>=<n> ...'. A relation V may
-- not read at all counts as none. Run as B the same scan must find B's rows: the scan can fail.
create function pg_temp.scan(p_set_guc boolean) returns text language sql as $f$
  select format($d$
    do $x$
    declare r record; n bigint; hits text := '';
    begin
      if %L then perform pg_catalog.set_config('nestly.profile_view_target', %L, true); end if;
      for r in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
                where s.nspname = 'nestly' and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
        begin
          execute pg_catalog.format('select count(*) from nestly.%%I t where pg_catalog.to_jsonb(t)::text ~ %%L', r.relname, %L) into n;
        exception when insufficient_privilege then n := 0;
        end;
        if n > 0 then hits := hits || r.relname || '=' || n || ' '; end if;
      end loop;
      if hits <> '' then raise exception 'hits: %%', hits; end if;
    end
    $x$ $d$, p_set_guc, tests.fx_pv_id('pv_b')::text,
    tests.fx_pv_id('pv_b')::text || '|נועה|איתי|דנה כהן|2023-05-04|2025-01-10|2027-03-01')
$f$;

select is(tests.dml_as_msg('authenticated', tests.claims(pg_temp.id('pv_v')), pg_temp.scan(false)), 'OK:0',
  '[F2.3-b c9 A1 A8 P2] B open: V''s direct SELECTs on every table and view in nestly return none of B''s rows, names or dates');
select is(pg_temp.set_vis('pv_b', 'restricted'), 'OK:1', '[F2.3-b fixture] B restricted');
select is(tests.dml_as_msg('authenticated', tests.claims(pg_temp.id('pv_v')), pg_temp.scan(false)), 'OK:0',
  '[F2.3-b c9] B restricted: the same, and so no gender of B either');
select is(tests.dml_as_msg('authenticated', tests.claims(pg_temp.id('pv_v')), pg_temp.scan(true)), 'OK:0',
  '[F2.3-b c9 c15] V sets the transaction-local target to B itself: the scoped policies (TO app_owner) still open nothing');
select is(pg_temp.set_vis('pv_b', 'open'), 'OK:1', '[F2.3-b fixture] B open');
select is(tests.dml_as_msg('authenticated', tests.claims(pg_temp.id('pv_v')), pg_temp.scan(true)), 'OK:0',
  '[F2.3-b c9 c15] B open and the target set by V: still none of B''s rows');
select is(tests.dml_as_msg('authenticated', tests.claims(pg_temp.id('p')), pg_temp.scan(true)), 'OK:0',
  '[F2.3-b c9 c11] the Professional viewer, target set by itself: none of B''s rows either');
select is(
  (select string_agg(t, ',' order by t)
     from regexp_split_to_table(regexp_replace(tests.dml_as_msg('authenticated', tests.claims(pg_temp.id('pv_b')), pg_temp.scan(false)),
                                               '^ERR:P0001:hits: ', ''), ' ') as t where t <> ''),
  'children=2,journey_contexts=2,regular_names=1,regular_profiles=1,users=1',
  '[F2.3-b c9 control · F2.4a c12] the same scan run as B finds exactly B''s rows in the four tables and B''s own regular_names row (F2.4a): the scan can fail');

-- the helpers are not a path either (schema.md "Authorization": no runtime EXECUTE)
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')), $q$ select nestly.profile_view_target()::text $q$),
  'ERR:42501', '[F2.3-b c9 c15] V cannot execute profile_view_target()');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')),
    $q$ select nestly.child_age_months(date '2023-05-04', now())::text $q$),
  'ERR:42501', '[F2.3-b c9 c15] V cannot execute child_age_months(): no birth date can be probed through it');

-- =====================================================================================================================
-- c10 — no children and no pregnancy: the sentence item and its toggle
-- =====================================================================================================================
select is(pg_temp.pvn('pv_v', 'pv_e'), pg_temp.want('Empty Planner', 'woman', 0, '[]'::jsonb, false, true),
  '[F2.3-b c10 §1.4 OP-021] planning only, open, sentence on: name, the sentence, count 0, no age, not pregnant');
select is(pg_temp.pvn('pv_v', 'pv_z'), pg_temp.want('Empty Planner', 'woman', 0, '[]'::jsonb, false, true),
  '[F2.3-b c10] zero journeys, open, sentence on: the same');
select is(pg_temp.pvn('pv_v', 'pv_e'), pg_temp.pvn('pv_v', 'pv_z'),
  '[F2.3-b c10 VAL-027] planning never appears: a planning-only account reads exactly like one with no journey');
select is(pg_temp.set_vis('pv_e', 'restricted'), 'OK:1', '[F2.3-b fixture] planning-only account restricted');
select is(pg_temp.set_vis('pv_z', 'restricted'), 'OK:1', '[F2.3-b fixture] no-journey account restricted');
select is(pg_temp.pvn('pv_v', 'pv_e'), pg_temp.want('Empty Planner', null, 0, null, false, true),
  '[F2.3-b c10] planning only, restricted, sentence on: name and the sentence in this state too');
select is(pg_temp.pvn('pv_v', 'pv_z'), pg_temp.want('Empty Planner', null, 0, null, false, true),
  '[F2.3-b c10] zero journeys, restricted, sentence on: the same');
select is(pg_temp.set_sentence('pv_e', false), 'OK:1', '[F2.3-b fixture] planning-only account turns the sentence off');
select is(pg_temp.set_sentence('pv_z', false), 'OK:1', '[F2.3-b fixture] no-journey account turns the sentence off');
select is(pg_temp.pvn('pv_v', 'pv_e'), pg_temp.want('Empty Planner', null, 0, null, false, false),
  '[F2.3-b c10] sentence off, restricted: no Journey Summary item at all');
select is(pg_temp.pvn('pv_v', 'pv_z'), pg_temp.want('Empty Planner', null, 0, null, false, false),
  '[F2.3-b c10] sentence off, zero journeys, restricted: no Journey Summary item');
select is(pg_temp.set_vis('pv_e', 'open'), 'OK:1', '[F2.3-b fixture] planning-only account open again');
select is(pg_temp.pvn('pv_v', 'pv_e'), pg_temp.want('Empty Planner', 'woman', 0, '[]'::jsonb, false, false),
  '[F2.3-b c10] sentence off, open: no Journey Summary item');

select is(pg_temp.pvn('pv_v', 'pv_g'), pg_temp.want('Gila Pregnant', 'woman', 0, '[]'::jsonb, true, false),
  '[F2.3-b c10] pregnant only, sentence on: "בהריון", count 0, no sentence');
select is(pg_temp.set_vis('pv_g', 'restricted'), 'OK:1', '[F2.3-b fixture] pregnant-only account restricted');
select is(pg_temp.pvn('pv_v', 'pv_g'), pg_temp.want('Gila Pregnant', null, 0, null, true, false),
  '[F2.3-b c10] pregnant only, restricted: "בהריון", no count, no sentence');

select is(pg_temp.set_sentence('pv_b', false), 'OK:1', '[F2.3-b fixture] B (children present) turns the sentence off');
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', 'woman', 2, pg_temp.b_ages(), true, false),
  '[F2.3-b c10] children present: the toggle changes nothing (open)');
select is(pg_temp.set_vis('pv_b', 'restricted'), 'OK:1', '[F2.3-b fixture] B restricted');
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', null, 2, null, true, false),
  '[F2.3-b c10] children present: the toggle changes nothing (restricted)');
select is(pg_temp.set_sentence('pv_b', true), 'OK:1', '[F2.3-b fixture] B sentence back on');

-- =====================================================================================================================
-- c11 — a Professional viewer gets V's result, item for item, in both states
-- =====================================================================================================================
select is(tests.fx_user(pg_temp.id('p')), 'professional/active', '[F2.3-b c11 fixture] P is an active Professional account');
select isnt(pg_temp.pvn('p', 'pv_b'), '[]', '[F2.3-b c11 OP-020] P gets B''s row (restricted): the comparison below is not of two empty results');
select is(pg_temp.nostate('p', 'pv_b'), pg_temp.nostate('pv_v', 'pv_b'), '[F2.3-b c11 OP-020] B restricted: P = V item for item (the relationship state is V''s own, P has none: file 63)');
select is(pg_temp.set_vis('pv_b', 'open'), 'OK:1', '[F2.3-b fixture] B open');
select is(pg_temp.nostate('p', 'pv_b'), pg_temp.nostate('pv_v', 'pv_b'), '[F2.3-b c11 OP-020] B open: P = V item for item');
select is(pg_temp.pvn('p', 'pv_b'), pg_temp.want('דנה כהן', 'woman', 2, pg_temp.b_ages(), true, false, null),
  '[F2.3-b c11] and that is c8''s result');
select is(pg_temp.nostate('p', 'pv_e'), pg_temp.nostate('pv_v', 'pv_e'), '[F2.3-b c11 c10] P = V on the no-children account too');

-- =====================================================================================================================
-- c12 — a change applies on the next read
-- =====================================================================================================================
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', 'woman', 2, pg_temp.b_ages(), true, false), '[F2.3-b c12] before: B open, c8');
select is(pg_temp.set_vis('pv_b', 'restricted'), 'OK:1', '[F2.3-b c12] B switches open → restricted (its own UPDATE)');
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', null, 2, null, true, false), '[F2.3-b c12 FR-PRIV-001] V''s next read is c7');
select is(pg_temp.set_vis('pv_b', 'open'), 'OK:1', '[F2.3-b c12] B switches back to open');
select is(pg_temp.pvn('pv_v', 'pv_b'), pg_temp.want('דנה כהן', 'woman', 2, pg_temp.b_ages(), true, false), '[F2.3-b c12] V''s next read is c8 again');
select is(pg_temp.as_owner('pv_b', format($q$ insert into nestly.children (slot, name, sex, birth_date) values (3, 'יעל', 'girl', %L) $q$,
    pg_temp.today() - 40)),
  'OK:1', '[F2.3-b c12] B adds a third child through its own INSERT');
select is((pg_temp.pvn('pv_v', 'pv_b')::jsonb -> 0 ->> 'children_count'), '3', '[F2.3-b c12] V''s next read counts 3');
select is((pg_temp.pvn('pv_v', 'pv_b')::jsonb -> 0 -> 'child_ages') -> 2, '{"years": 0, "months": 1}'::jsonb,
  '[F2.3-b c12 c14] and lists one more age, last: born 40 days ago = (0, 1)');
select is(jsonb_array_length(pg_temp.pvn('pv_v', 'pv_b')::jsonb -> 0 -> 'child_ages'), 3, '[F2.3-b c12] three ages for three children');
select is(pg_temp.as_owner('pv_b', $q$ delete from nestly.children where slot = 3 $q$), 'OK:1', '[F2.3-b fixture] the third child removed');

-- =====================================================================================================================
-- c13 — unavailable target, or unavailable viewer: 0 rows, identical, no error
-- =====================================================================================================================
select is(pg_temp.pvn('pv_v', 'pv_b') <> '[]', true, '[F2.3-b c13 control] V reads B while both are active');
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_b'), 'suspended') $q$, '[F2.3-b fixture] B suspended');
select is(pg_temp.pvn('pv_v', 'pv_b'), '[]', '[F2.3-b c13 DR-5 A9] B suspended: V gets 0 rows');
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_b'), 'banned') $q$, '[F2.3-b fixture] B banned');
select is(pg_temp.pvn('pv_v', 'pv_b'), '[]', '[F2.3-b c13 DR-5 BR-063] B banned: V gets 0 rows');
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_b'), 'active') $q$, '[F2.3-b fixture] B active again');
select is(pg_temp.pvn('pv_v', 'p'), '[]', '[F2.3-b c13] a Professional account as the target: 0 rows');
select is(pg_temp.pv('pv_v', gen_random_uuid()::text), '[]', '[F2.3-b c13] a random uuid: 0 rows');
select is(pg_temp.pv('pv_v', 'abc'), '[]', '[F2.3-b c13] a non-uuid: 0 rows, no error');
select is(pg_temp.pv('pv_v', null), '[]', '[F2.3-b c13] NULL: 0 rows, no error');
select is(pg_temp.pvn('pv_v', 'c'), '[]', '[F2.3-b c13] an Auth user with no users row: 0 rows');
select is(pg_temp.pvn('pv_v', 'pv_n'), '[]', '[F2.3-b c13] a Regular users row with no profile: 0 rows');
select is(pg_temp.pvn('pv_v', 's'), '[]', '[F2.3-b c13] 10_''s suspended account s as the target: 0 rows');
select is(pg_temp.pvn('pv_v', 'x'), '[]', '[F2.3-b c13] 10_''s banned account x as the target: 0 rows');

-- hostile input shaped as a target: no error, no row, nothing interpolated
select is(pg_temp.pv('pv_v', h.v), '[]', '[F2.3-b c13 hostile] target ' || h.label || ': 0 rows, no error')
from (values
  (tests.fx_pv_id('pv_b')::text || ''' or ''1''=''1', 'B''s uuid + a quote injection'),
  ('''; select 1; --', 'a statement break'),
  (tests.fx_pv_id('pv_b')::text || E'\nx', 'B''s uuid + a newline + text'),
  (tests.fx_pv_id('pv_b')::text || ' ', 'B''s uuid + a trailing space'),
  ('', 'empty'),
  (repeat('a', 100000), '100 000 characters'),
  ('%', 'a LIKE wildcard'),
  ('.*', 'a regex wildcard'),
  ('00000000-0000-0000-0000-000000000000', 'the nil uuid')
) as h(v, label);

-- an unavailable viewer: 0 rows for every target
select is(pg_temp.pvn(w.who, t.target), '[]', '[F2.3-b c13 A9 rule 15] viewer ' || w.label || ' reading ' || t.target || ': 0 rows')
from (values ('s', 'suspended (10_ s)'), ('x', 'banned (10_ x)'), ('pv_l', 'link-check pending (F2.0)'), ('c', 'with no users row')) as w(who, label)
cross join (values ('pv_b'), ('pv_e'), ('pv_g'), ('pv_v')) as t(target);
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_v'), 'suspended') $q$, '[F2.3-b fixture] V suspended');
select is(pg_temp.pvn('pv_v', t.target), '[]', '[F2.3-b c13 A9] V suspended reading ' || t.target || ': 0 rows')
from (values ('pv_b'), ('pv_e'), ('pv_g')) as t(target);
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_v'), 'banned') $q$, '[F2.3-b fixture] V banned');
select is(pg_temp.pvn('pv_v', t.target), '[]', '[F2.3-b c13 A9] V banned reading ' || t.target || ': 0 rows')
from (values ('pv_b'), ('pv_e'), ('pv_g')) as t(target);
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_v'), 'active') $q$, '[F2.3-b fixture] V active again');
select is(tests.as_role('authenticated', '{}',
    format($q$ select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))::text, '[]') from nestly.profile_view(%L) r $q$, tests.fx_pv_id('pv_b'))),
  '[]', '[F2.3-b c13 rule 15] authenticated without a sub (no identity): 0 rows');

-- Gate 2 QUESTION defaults: a link-check-pending target is visible; one's own id gives the non-Friend view
select is(pg_temp.pvn('pv_v', 'pv_l'), pg_temp.want('Lior Pending', 'man', 0, '[]'::jsonb, false, true),
  '[F2.3-b c13 Gate 2 default] a link-check-pending target is visible as any other active Regular account');
select is(pg_temp.pvn('pv_v', 'pv_v'), pg_temp.want('Vered Viewer', 'man', 0, '[]'::jsonb, false, true),
  '[F2.3-b c7 Gate 2 default] V''s own id gives V the non-Friend view of itself (open by default)');

-- =====================================================================================================================
-- c14 — ages: child_age_months on the spec's table (dates at 12:00 in Asia/Jerusalem, the instants as given)
-- =====================================================================================================================
select is(pg_temp.ym(r.birth, pg_temp.noon(r.on_day)), r.want,
  '[F2.3-b c14 DR-3] born ' || r.birth || ', on ' || r.on_day || ' → (' || r.want || ')')
from (values
  (date '2026-10-17', date '2026-10-17', '0,0'), (date '2026-09-18', date '2026-10-17', '0,0'),
  (date '2026-09-17', date '2026-10-17', '0,1'), (date '2026-08-17', date '2026-10-17', '0,2'),
  (date '2025-10-18', date '2026-10-17', '0,11'), (date '2025-10-17', date '2026-10-17', '1,0'),
  (date '2025-09-17', date '2026-10-17', '1,1'), (date '2024-10-18', date '2026-10-17', '1,11'),
  (date '2024-10-17', date '2026-10-17', '2,0'),
  (date '2024-02-29', date '2025-02-28', '0,11'), (date '2024-02-29', date '2025-03-01', '1,0'),
  (date '2024-02-29', date '2027-02-28', '2,11'), (date '2024-02-29', date '2028-02-29', '4,0'),
  (date '2026-01-31', date '2026-02-28', '0,0'), (date '2026-01-31', date '2026-03-01', '0,1'),
  (date '2026-01-31', date '2026-03-30', '0,1'), (date '2026-01-31', date '2026-03-31', '0,2'),
  (date '2026-01-31', date '2026-04-30', '0,2'), (date '2026-01-31', date '2026-05-01', '0,3'),
  (date '2024-01-31', date '2024-02-29', '0,0')
) as r(birth, on_day, want);

select is(pg_temp.ym(r.birth, r.at), r.want, '[F2.3-b c14 Asia/Jerusalem] born ' || r.birth || ', at ' || r.label || ' → (' || r.want || ')')
from (values
  (date '2025-10-18', timestamptz '2026-10-17 20:59:00+00', '0,11', '2026-10-17T20:59Z (23:59 IDT)'),
  (date '2025-10-18', timestamptz '2026-10-17 20:59:59.999+00', '0,11', '2026-10-17T20:59:59.999Z (the last instant of 17.10 IDT)'),
  (date '2025-10-18', timestamptz '2026-10-17 21:00:00+00', '1,0', '2026-10-17T21:00Z (00:00 IDT 18.10)'),
  (date '2026-01-01', timestamptz '2026-12-31 21:59:00+00', '0,11', '2026-12-31T21:59Z (23:59 IST)'),
  (date '2026-01-01', timestamptz '2026-12-31 22:00:00+00', '1,0', '2026-12-31T22:00Z (00:00 IST 1.1)')
) as r(birth, at, want, label);

-- DR-6 A: a birth_date after today reads (0,0), never negative; the oldest allowed birth date
select is(tests.fx_age(r.birth, pg_temp.noon(date '2026-10-17')), 0,
  '[F2.3-b c14 DR-6] born ' || r.birth || ' (after 2026-10-17): 0 months, never negative')
from (values (date '2026-10-18'), (date '2026-11-17'), (date '2027-05-01'), (date '2100-01-01')) as r(birth);
select is(pg_temp.ym(date '1900-01-01', pg_temp.noon(date '2026-10-17')), '126,9',
  '[F2.3-b c14 VAL-005] born 1900-01-01 on 2026-10-17 → (126, 9): 1521 completed months');

-- through profile_view, with births relative to today in Asia/Jerusalem (holds on any CI day, 29.02 too)
select lives_ok(format($q$ select tests.fx_pv_child(tests.fx_pv_id('pv_z'), 1, 'One', 'boy', %L, timestamptz '2026-01-01 10:00+00'),
                                  tests.fx_pv_child(tests.fx_pv_id('pv_z'), 2, 'Two', 'girl', %L, timestamptz '2026-01-02 10:00+00'),
                                  tests.fx_pv_child(tests.fx_pv_id('pv_z'), 3, 'Three', 'unknown', %L, timestamptz '2026-01-03 10:00+00'),
                                  tests.fx_pv_child(tests.fx_pv_id('pv_z'), 4, 'Four', 'boy', %L, timestamptz '2026-01-04 10:00+00') $q$,
    (pg_temp.today() - interval '1 year')::date, (pg_temp.today() - interval '1 year')::date + 1, pg_temp.today() + 1, pg_temp.today()),
  '[F2.3-b fixture] the no-journey account gets four children: born a year ago, a year ago + 1 day, tomorrow, today');
select is(pg_temp.set_vis('pv_z', 'open'), 'OK:1', '[F2.3-b fixture] that account open');
select is(pg_temp.pvn('pv_v', 'pv_z') ::jsonb -> 0 -> 'child_ages',
  '[{"years": 1, "months": 0}, {"years": 0, "months": 11}, {"years": 0, "months": 0}, {"years": 0, "months": 0}]'::jsonb,
  '[F2.3-b c14 DR-6] profile_view on today: a year ago → (1,0), a year ago + 1 day → (0,11), tomorrow → (0,0), today → (0,0)');
select is(pg_temp.pvn('pv_v', 'pv_z') ::jsonb -> 0 ->> 'shows_empty_journey_sentence', 'false',
  '[F2.3-b c10] once the account has children the sentence is gone, its toggle off or on');

-- =====================================================================================================================
-- c15 — runtime, the one definer and its fence
-- =====================================================================================================================
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')), $q$ select session_user || '/' || current_user $q$),
  'app_server/authenticated', '[F2.3-b c15 rules 1, 10] the reads above ran as app_server under SET LOCAL ROLE authenticated');
select is(tests.as_role('none', null,
    format($q$ select count(*)::text from nestly.profile_view(%L) $q$, tests.fx_pv_id('pv_b'))),
  'ERR:42501', '[F2.3-b c15] app_server itself cannot call profile_view (only authenticated may)');
select is(tests.as_role('anon', null,
    format($q$ select count(*)::text from nestly.profile_view(%L) $q$, tests.fx_pv_id('pv_b'))),
  'ERR:42501', '[F2.3-b c15 platform r4] anon cannot call profile_view');

select is((select array_agg(a order by a) from tests.approved_security_definer() as a)::text, '{nestly.audit_trigger(),"nestly.child_tracker_trends(text,text,text,integer)","nestly.child_tracker_trends(text,text,text,text)",nestly.deliver_child_birthdays(),nestly.identical_reports_hide(),nestly.notify_comment(),nestly.notify_friendship(),nestly.notify_group(),nestly.notify_post(),nestly.notify_professional(),nestly.profile_view(text),nestly.reveal_post_author(uuid),"nestly.search_people(text,integer,integer)"}',
  '[F2.3-b c15 A8 rule 10 DR-G1] the approved SECURITY DEFINER list is profile_view(text), I4''s audit_trigger and reveal_post_author, the three notification triggers and search_people, I10''s notify_group (file 96), notify_professional (file 98) the I14 completion''s child_tracker_trends (file 100), completion B''s identical_reports_hide (file 103) and the SRS-audit fixes'' deliver_child_birthdays (file 102)');
select set_eq(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and p.prosecdef $$,
  $$ values ('nestly.profile_view(text)'), ('nestly.audit_trigger()'), ('nestly.reveal_post_author(uuid)'), ('nestly.notify_comment()'), ('nestly.notify_friendship()'), ('nestly.notify_post()'), ('nestly.search_people(text,integer,integer)'), ('nestly.notify_group()'), ('nestly.notify_professional()'), ('nestly.child_tracker_trends(text,text,text,integer)'), ('nestly.child_tracker_trends(text,text,text,text)'), ('nestly.identical_reports_hide()'), ('nestly.deliver_child_birthdays()') $$,
  '[F2.3-b c15] the SECURITY DEFINER functions in nestly are exactly the thirteen approved ones (I10''s notify_group, file 96; notify_professional, file 98; child_tracker_trends, file 100; identical_reports_hide, file 103; deliver_child_birthdays, file 102)');
select is((select p.proowner::regrole::text from pg_catalog.pg_proc p where p.oid = pg_temp.proc('nestly.profile_view(text)')),
  'app_owner', '[F2.3-b c15] profile_view is owned by app_owner');
select is((select p.proconfig from pg_catalog.pg_proc p where p.oid = pg_temp.proc('nestly.profile_view(text)')),
  array['search_path=""'], '[F2.3-b c15 rule 10] profile_view has search_path "" and no other setting');
select is(
  (select string_agg(r.rolname, ',' order by r.rolname)
     from (values ('PUBLIC'), ('anon'), ('authenticated'), ('app_server'), ('app_jobs'), ('app_recovery'), ('service_role'),
                  ('authenticator')) as r(rolname)
     cross join (select pg_temp.proc('nestly.profile_view(text)') as oid) z
    where case when r.rolname = 'PUBLIC'
               then exists (select 1 from pg_catalog.pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                             where p.oid = z.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE')
               else has_function_privilege(r.rolname, z.oid, 'EXECUTE') end),
  'authenticated',
  '[F2.3-b c15 rules 1, 4] EXECUTE on profile_view: authenticated only (not PUBLIC, anon, app_server, app_jobs, app_recovery, service_role, authenticator)');
select is(
  (select string_agg(f.sig || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ';'), '-'), ', ' order by f.sig)
     from (values ('nestly.child_age_months(date,timestamp with time zone)'), ('nestly.profile_view_target()')) as f(sig)
     join zz_fn z on z.sig = f.sig join pg_catalog.pg_proc p on p.oid = z.oid),
  'nestly.child_age_months(date,timestamp with time zone):false:search_path="", nestly.profile_view_target():false:search_path=""',
  '[F2.3-b c15 schema "Authorization"] both helpers exist, are SECURITY INVOKER and have search_path ""');
select is(
  (select string_agg(f.sig || ':' || r.rolname, ', ' order by f.sig, r.rolname)
     from (values ('nestly.child_age_months(date,timestamp with time zone)'), ('nestly.profile_view_target()')) as f(sig)
     cross join (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs'), ('app_recovery'), ('service_role'), ('authenticator')) as r(rolname)
     join zz_fn z on z.sig = f.sig
    where has_function_privilege(r.rolname, z.oid, 'EXECUTE')
       or exists (select 1 from pg_catalog.pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = z.oid and a.grantee = 0)),
  null,
  '[F2.3-b c15 c9] neither helper is executable by PUBLIC, anon, authenticated, app_server, app_jobs, app_recovery, service_role or authenticator');
select matches((select p.prosrc from pg_catalog.pg_proc p where p.oid = pg_temp.proc('nestly.profile_view(text)')),
  'child_age_months\(c\.birth_date, pg_catalog\.now\(\)\)',
  '[F2.3-b c14 c15 schema "Age rule"] the ages are taken at now(), never at an instant the caller chooses');

select is(
  (select string_agg(c.relname || '.' || pol.polname || ':' || pol.polcmd::text || ':' || pol.polpermissive::text || ':'
                     || (select string_agg(r.rolname, '+' order by r.rolname) from pg_catalog.pg_roles r where r.oid = any (pol.polroles)),
                     ', ' order by c.relname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and pol.polname like '%\_profile\_view' and c.relname in ('children', 'journey_contexts', 'regular_profiles', 'users')),
  'children.children_select_profile_view:r:true:app_owner, journey_contexts.journey_contexts_select_profile_view:r:true:app_owner, '
  || 'regular_profiles.regular_profiles_select_profile_view:r:true:app_owner, users.users_select_profile_view:r:true:app_owner',
  '[F2.3-b c15 c9] the four F2.3b scoped policies: SELECT only, permissive, TO app_owner only (the seven of F2.4c1: file 64)');
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and pol.polname like '%\_profile\_view' and c.relname in ('children', 'journey_contexts', 'regular_profiles', 'users')
      and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'profile_view_target\(\)' and pol.polwithcheck is null),
  4::bigint,
  '[F2.3-b c15] each of them matches only the transaction-local target (profile_view_target()), and none has a WITH CHECK');
select is(
  (select string_agg(distinct m.rolname::text, ',' order by m.rolname::text) from pg_catalog.pg_auth_members am
     join pg_catalog.pg_roles r on r.oid = am.roleid join pg_catalog.pg_roles m on m.oid = am.member where r.rolname = 'app_owner'),
  'postgres', '[F2.3-b c15 rule 1] app_owner''s only member is postgres');
select is(
  (select string_agg(r.rolname, ',') from (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs'), ('app_recovery'),
       ('service_role'), ('authenticator')) as r(rolname) where pg_has_role(r.rolname, 'app_owner', 'MEMBER')),
  null, '[F2.3-b c15 c9] no runtime role is in app_owner: a target set by V matches no policy V can use');

-- the transaction-local target is cleared after a call, and calls do not cross
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')),
    format($q$ select coalesce(pg_catalog.current_setting('nestly.profile_view_target', true), '')
                 from (select count(*) from nestly.profile_view(%L)) as call $q$, tests.fx_pv_id('pv_b'))),
  '', '[F2.3-b c15] after a call that returned B, the target in the same transaction is empty or unset (NULL or ''''), never B');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')),
    format($q$ select coalesce(pg_catalog.current_setting('nestly.profile_view_target', true), '')
                 from (select count(*) from nestly.profile_view(%L)) as call $q$, tests.fx_pv_id('pv_n'))),
  '', '[F2.3-b c15] after a call that found no profile, the target is empty or unset (NULL or '''') too');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')),
    $q$ select coalesce(pg_catalog.current_setting('nestly.profile_view_target', true), '')
         from (select count(*) from nestly.profile_view('abc')) as call $q$),
  '', '[F2.3-b c15] after a call that returned at its first check (a non-uuid), the target is empty or unset (NULL or '''')');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')),
    format($q$ select a.full_name || '|' || b.full_name || '|' || a.children_count || '|' || b.children_count
                 from nestly.profile_view(%L) a, nestly.profile_view(%L) b $q$, tests.fx_pv_id('pv_b'), tests.fx_pv_id('pv_g'))),
  'דנה כהן|Gila Pregnant|2|0', '[F2.3-b c12 c15] two calls in one statement each read their own target, nothing crosses');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')),
    format($q$ select (select pg_catalog.count(*) from nestly.profile_view(%L))::text || '|' || (select count(*) from nestly.children)
                      || '|' || (select count(*) from nestly.regular_profiles) $q$, tests.fx_pv_id('pv_b'))),
  '1|0|1', '[F2.3-b c9 c15] in the statement that calls profile_view, V''s own reads still see only V (0 children, its own profile)');

-- last on purpose: on a PostgreSQL without the MAINTAIN privilege (local 16) the gate itself errors
select is_empty($$ select * from tests.rls_gate('nestly') where check_name like 'definer%' $$,
  '[F2.3-b c15 rule 10] the RLS gate finds no unapproved definer and no definer without a fixed search_path');

select * from finish();

rollback;
