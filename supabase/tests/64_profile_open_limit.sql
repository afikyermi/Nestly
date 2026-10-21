-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.4c1: the profile-open limit inside nestly.profile_view, its Configuration,
-- its Security events, and the fence around the three new tables).
-- Source of expected values: .work/friends/spec.md (c20-c23 + "Gate 1 (F2.4c)" DR-W A, DR-C A; Afik DR-T 100 per 3600 s) and
-- schema.md F2.4c1 ("Semantics" in words, "pgTAP"), not the migration text. The HTTP side (429 bodies, the commit of the event,
-- 120 concurrent opens, a send at the limit) is apps/server/tests/db/profile-view.db.test.ts.
-- Every open runs as app_server under SET LOCAL ROLE authenticated (tests.as_role). The Configuration, the counts and the events are
-- reached only through the postgres-owned definers of setup/61_open_limit_fixtures.sql. People: V = pv_v, B = pv_b (setup/53_),
-- G = pv_g, E = pv_e, Z = pv_z, L = pv_l (link check pending: not active), P = 10_'s p, a, b, s (suspended), fc (60_). All rolled back.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.4-c c20 c22] session_user is app_server (this file must not run under another login)');

-- ---- c22: the seeded Configuration, read before any test changes it ---------------------------------------------------------------
select is(tests.fx_limit(), '100/3600',
  '[F2.4-c c22 DR-T] the Configuration is seeded at 100 opens per 3600 seconds');
select is(tests.fx_limit_rows(), 1::bigint, '[F2.4-c c22] and it holds exactly that one row');

select lives_ok($q$ select tests.fx_pv_build(), tests.fx_fr_build() $q$, '[F2.4-c fixture] V, B, G, E, Z, L, C built');

create function pg_temp.id(p_name text) returns uuid language sql as $f$
  select case when p_name in ('p', 's', 'x', 'a', 'b') then tests.fx_id_checked(p_name)
              when p_name = 'fc' then tests.fx_fr_id('fr_c')
              else tests.fx_pv_id(p_name) end
$f$;
-- the outcome of one open: 'shown', 'limited', 'none' (0 rows) or 'ERR:<sqlstate>'
create function pg_temp.op(p_viewer text, p_target text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_viewer)),
    format($q$ select coalesce((select r.outcome from nestly.profile_view(%L) r), 'none') $q$, p_target))
$f$;
create function pg_temp.opn(p_viewer text, p_target text) returns text language sql as $f$
  select pg_temp.op(p_viewer, pg_temp.id(p_target)::text)
$f$;
create function pg_temp.rows_of(p_viewer text, p_target text) returns jsonb language sql as $f$
  select (tests.as_role('authenticated', tests.claims(pg_temp.id(p_viewer)),
    format($q$ select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))::text, '[]') from nestly.profile_view(%L) r $q$, pg_temp.id(p_target)::text)))::jsonb
$f$;
-- n opens in a row, as one string: 'shown,shown,limited'
create function pg_temp.opens(p_viewer text, p_target text, p_n int) returns text language plpgsql as $f$
declare acc text[] := '{}'; i int;
begin
  for i in 1..p_n loop acc := acc || pg_temp.opn(p_viewer, p_target); end loop;
  return array_to_string(acc, ',');
end
$f$;
create function pg_temp.cnt(p_who text) returns int language sql as $f$ select tests.fx_open_count(pg_temp.id(p_who)) $f$;
create function pg_temp.evs(p_who text) returns int language sql as $f$ select tests.fx_events(pg_temp.id(p_who)) $f$;

select lives_ok($q$ select tests.fx_set_limit(3, 3600) $q$, '[F2.4-c c22 fixture] the Configuration set to 3 opens per 3600 s: no restart, no code change');

-- =====================================================================================================================
-- c20 -- the 101st (here the 4th) open in the window is refused; refused opens are not counted; the window rolls
-- =====================================================================================================================
select is(pg_temp.opens('pv_v', 'pv_b', 3), 'shown,shown,shown', '[F2.4-c c20 NFR-SEC-006] V''s first three opens are shown');
select is(pg_temp.cnt('pv_v'), 3, '[F2.4-c c20] and counted');
select is(pg_temp.opn('pv_v', 'pv_b'), 'limited', '[F2.4-c c20 AC-078 ERR-032] the 4th open is refused');
select is(pg_temp.rows_of('pv_v', 'pv_b'),
  jsonb_build_array(jsonb_build_object('full_name', null, 'gender', null, 'children_count', null, 'child_ages', null, 'is_pregnant', null,
    'shows_empty_journey_sentence', null, 'relationship', null, 'friends', null, 'mutual_friends', null, 'outcome', 'limited')),
  '[F2.4-c c20 P1 P2] a refused open returns one row with no profile, no lists and no state: only the outcome');
select is(pg_temp.opens('pv_v', 'pv_b', 4), 'limited,limited,limited,limited', '[F2.4-c c20] and every further open in the window is refused');
select is(pg_temp.cnt('pv_v'), 3, '[F2.4-c c20 DR-W] refused opens are not counted: still 3');
select is(pg_temp.op('pv_v', gen_random_uuid()::text), 'limited', '[F2.4-c c20] at the limit an open of an unavailable target is refused too');

-- opens of unavailable targets count
select is(pg_temp.op('pv_g', gen_random_uuid()::text), 'none', '[F2.4-c c20 DR-W] G opens a random uuid: 0 rows');
select is(pg_temp.opn('pv_g', 's'), 'none', '[F2.4-c c20 DR-W] G opens a suspended account: 0 rows');
select is(pg_temp.opn('pv_g', 'p'), 'none', '[F2.4-c c20 DR-W] G opens a Professional account: 0 rows');
select is(pg_temp.cnt('pv_g'), 3, '[F2.4-c c20 DR-W] all three unavailable opens were counted');
select is(pg_temp.opn('pv_g', 'pv_b'), 'limited', '[F2.4-c c20] so G''s 4th open, of an available B, is refused');

-- accounts are counted apart
select is(pg_temp.opn('a', 'pv_b'), 'shown', '[F2.4-c c20] a is unaffected while V and G are at the limit');
select is(pg_temp.cnt('a'), 1, '[F2.4-c c20] a''s own count is 1');
select is(pg_temp.opn('pv_e', 'pv_b'), 'shown', '[F2.4-c c20] so is E');

-- P is counted too
select is(pg_temp.opens('p', 'pv_b', 4), 'shown,shown,shown,limited', '[F2.4-c c20 OP-020] a Professional viewer is counted and refused at the limit like a Regular');
select is(pg_temp.cnt('p'), 3, '[F2.4-c c20] P''s count is 3');

-- an account that cannot open anything is not counted
select is(pg_temp.opens('s', 'pv_b', 4), 'none,none,none,none', '[F2.4-c c20 A9] a suspended viewer gets 0 rows, whatever the count');
select is(pg_temp.cnt('s'), 0, '[F2.4-c c20 A9] and is not counted');
select is(pg_temp.opens('pv_l', 'pv_b', 4), 'none,none,none,none', '[F2.4-c c20 A9] a viewer whose link check is pending gets 0 rows');
select is(pg_temp.cnt('pv_l'), 0, '[F2.4-c c20 A9] and is not counted');

-- the window rolls: an open older than the window no longer counts, a younger one still does
select lives_ok($q$ select tests.fx_age_opens(tests.fx_pv_id('pv_v'), interval '3599 seconds') $q$, '[F2.4-c fixture] V''s opens are 3599 s old');
select is(pg_temp.opn('pv_v', 'pv_b'), 'limited', '[F2.4-c c20 DR-W] 3599 s ago is inside the 3600 s window: still refused');
select lives_ok($q$ select tests.fx_age_opens(tests.fx_pv_id('pv_v'), interval '2 seconds') $q$, '[F2.4-c fixture] V''s opens are 3601 s old');
select is(pg_temp.opn('pv_v', 'pv_b'), 'shown', '[F2.4-c c20 DR-W] 3601 s ago is outside the window: the open is shown');
select is(pg_temp.cnt('pv_v'), 1, '[F2.4-c c20] and the old three no longer count: 1');
select lives_ok($q$ select tests.fx_seed_opens(tests.fx_pv_id('pv_z'), array[3601, 10, 5]) $q$, '[F2.4-c fixture] Z has opens 3601 s, 10 s and 5 s old');
select is(pg_temp.cnt('pv_z'), 2, '[F2.4-c c20 DR-W] Z has two opens inside the window');
select is(pg_temp.opens('pv_z', 'pv_b', 2), 'shown,limited', '[F2.4-c c20 DR-W] a rolling window: only the expired instant is dropped, so Z has room for one more');

-- =====================================================================================================================
-- c21 -- one Security event at the first refusal of a stretch, none for the rest
-- =====================================================================================================================
select is(pg_temp.evs('pv_v'), 1, '[F2.4-c c21 NFR-SEC-006 (5)] V''s first refusal recorded exactly one Security event, its further refusals none');
select is(pg_temp.evs('pv_g'), 1, '[F2.4-c c21] G''s first refusal: one event');
select is(pg_temp.evs('pv_z'), 1, '[F2.4-c c21] Z''s: one');
select is(pg_temp.evs('a'), 0, '[F2.4-c c21] a, never refused: none');
select is(pg_temp.evs('s'), 0, '[F2.4-c c21 A9] a suspended viewer, never counted: none');
select is(tests.fx_event_kinds(pg_temp.id('pv_v')), 'profile_open_limit', '[F2.4-c c21] the kind is the profile-open limit');
select is(tests.fx_event_recent(pg_temp.id('pv_v')), 1, '[F2.4-c c21] and it carries the time of the refusal');
select is(tests.fx_event_columns(), 'id, kind, occurred_at, user_id',
  '[F2.4-c c21 P1 P2] a Security event holds only id, kind, user and time: no target name, profile or child data');
-- a counted open ends the stretch: the next refusal records again
select is(pg_temp.opens('pv_v', 'pv_b', 3), 'shown,shown,limited', '[F2.4-c c21 DR-W] V: two more counted opens (3 in all), then a refusal');
select is(pg_temp.evs('pv_v'), 2, '[F2.4-c c21 DR-W] a refusal after a counted open is a new stretch: a second event');
select is(pg_temp.opens('pv_v', 'pv_b', 3), 'limited,limited,limited', '[F2.4-c c21] and its further refusals record none');
select is(pg_temp.evs('pv_v'), 2, '[F2.4-c c21] still two');

-- no runtime role reads, writes or resets the three tables, whoever asks and whatever target is set
create temp table zz_t as select * from (values ('security_limits', 'max_count'), ('profile_open_counts', 'user_id'), ('security_events', 'user_id')) as t(name, col);
create temp table zz_v as select * from (values
  ('select', 'select count(*) from nestly.%1$I'),
  ('insert', 'insert into nestly.%1$I default values'),
  ('update', 'update nestly.%1$I set %2$I = %2$I'),
  ('delete', 'delete from nestly.%1$I'),
  ('truncate', 'truncate nestly.%1$I')) as v(verb, tpl);
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('pv_v')), format(v.tpl, t.name, t.col)), 'ERR:42501',
  '[F2.4-c c21 c22 c23 rule 12] authenticated V: ' || v.verb || ' on ' || t.name || ' is denied')
from zz_t t cross join zz_v v;
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('pv_v')), 'update nestly.security_limits set max_count = 100000'), 'ERR:42501',
  '[F2.4-c c22 BR-025] authenticated V cannot raise the limit (update on security_limits)');
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('pv_v')), format($q$ update nestly.profile_open_counts set opened_at = '{}' where user_id = %L $q$, pg_temp.id('pv_v'))),
  'ERR:42501', '[F2.4-c c21 c22] authenticated V cannot reset its own open count');
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('pv_v')), format($q$ delete from nestly.security_events where user_id = %L $q$, pg_temp.id('pv_v'))),
  'ERR:42501', '[F2.4-c c21] nor delete its own Security event');
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('pv_v')),
    format($q$ select count(*) from nestly.security_events where user_id = %L $q$, pg_temp.id('pv_v'))),
  'ERR:42501', '[F2.4-c c21] nor read its own Security event');
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('p')), 'select count(*) from nestly.security_events'), 'ERR:42501',
  '[F2.4-c c21] P (Professional) reads no Security event either');
select is(tests.dml_as('anon', null, format(v.tpl, t.name, t.col)), 'ERR:42501', '[F2.4-c c21 c22 rule 3] anon: ' || v.verb || ' on ' || t.name || ' is denied')
from zz_t t cross join zz_v v;
select is(tests.dml_as('none', null, format(v.tpl, t.name, t.col)), 'ERR:42501', '[F2.4-c c21 c22 rule 1] app_server itself: ' || v.verb || ' on ' || t.name || ' is denied')
from zz_t t cross join zz_v v;
-- with the transaction-local target set by the caller, the scoped policies (TO app_owner) open nothing to authenticated
select ok(
  tests.dml_as_msg('authenticated', tests.claims(pg_temp.id('pv_v')),
    format($d$ do $x$ begin perform pg_catalog.set_config('nestly.profile_view_target', %L, true); execute %L; end $x$ $d$,
           pg_temp.id('pv_b')::text, format(v.tpl, t.name, t.col))) like 'ERR:42501:%',
  '[F2.4-c c21 c22 c23] V sets the target itself: ' || v.verb || ' on ' || t.name || ' is still denied')
from zz_t t cross join zz_v v;
select is(pg_temp.cnt('pv_v'), 3, '[F2.4-c c21 c22] after all those attempts V''s count is untouched: 3');
select is(pg_temp.evs('pv_v'), 2, '[F2.4-c c21] and so are its events');

-- =====================================================================================================================
-- c22 -- Configuration: read at each open; absent or invalid fails closed, with no count and no event
-- =====================================================================================================================
select lives_ok($q$ select tests.fx_set_limit(3, 3600) $q$, '[F2.4-c fixture] 3 per 3600 s');
select is(pg_temp.opens('b', 'pv_b', 4), 'shown,shown,shown,limited', '[F2.4-c c22] N = 3: the 4th open of b is refused');
select lives_ok($q$ select tests.fx_set_limit(5, 3600) $q$, '[F2.4-c fixture] N raised to 5 -- no restart, no migration');
select is(pg_temp.opens('b', 'pv_b', 3), 'shown,shown,limited', '[F2.4-c c22] the next open is read against the new N: two more are shown (5 in all), then refused');
select lives_ok($q$ select tests.fx_set_limit(2, 3600) $q$, '[F2.4-c fixture] N lowered to 2');
select is(pg_temp.opn('b', 'pv_b'), 'limited', '[F2.4-c c22] N = 2: b, with 5 opens in the window, is refused at once');
select lives_ok($q$ select tests.fx_set_limit(3, 60), tests.fx_age_opens(tests.fx_id_checked('b'), interval '61 seconds') $q$,
  '[F2.4-c fixture] W lowered to 60 s, b''s opens 61 s old');
select is(pg_temp.opn('b', 'pv_b'), 'shown', '[F2.4-c c22] W is read at each open too: opens older than 60 s no longer count');
select lives_ok($q$ select tests.fx_set_limit(3, 3600) $q$, '[F2.4-c fixture] back to 3 per 3600 s');

select throws_ok($q$ select tests.fx_set_limit(0, 3600) $q$, '23514', null, '[F2.4-c c22 BR-025] N = 0 cannot be stored');
select throws_ok($q$ select tests.fx_set_limit(-1, 3600) $q$, '23514', null, '[F2.4-c c22] N negative cannot be stored');
select throws_ok($q$ select tests.fx_set_limit(3, 0) $q$, '23514', null, '[F2.4-c c22] W = 0 cannot be stored');
select throws_ok($q$ select tests.fx_set_limit(3, -60) $q$, '23514', null, '[F2.4-c c22] W negative cannot be stored');

-- absent: every open fails closed (V at the limit with an event; fc fresh)
select lives_ok($q$ select tests.fx_drop_limit() $q$, '[F2.4-c fixture] the Configuration row is deleted');
select is(tests.fx_limit(), 'none', '[F2.4-c c22 fixture] and it is absent');
select is(pg_temp.opn('fc', 'pv_b'), 'ERR:NS001', '[F2.4-c c22 P6] absent: a fresh account''s open fails with the dedicated error, no profile');
select is(pg_temp.cnt('fc'), 0, '[F2.4-c c22] and nothing is counted');
select is(pg_temp.evs('fc'), 0, '[F2.4-c c22] and no Security event is recorded');
select is(pg_temp.opn('pv_v', 'pv_b'), 'ERR:NS001', '[F2.4-c c22] absent: V, over the limit, fails the same way (not a normal refusal)');
select is(pg_temp.op('pv_v', gen_random_uuid()::text), 'ERR:NS001', '[F2.4-c c22] and an open of an unavailable target');
select is(pg_temp.cnt('pv_v'), 3, '[F2.4-c c22] V''s count is unchanged');
select is(pg_temp.evs('pv_v'), 2, '[F2.4-c c22] V''s events are unchanged: a failed-closed open records no Security event');
select lives_ok($q$ select tests.fx_set_limit(3, 3600) $q$, '[F2.4-c fixture] the Configuration is back');
select is(pg_temp.opn('fc', 'pv_b'), 'shown', '[F2.4-c c22] and the same account''s open is shown again: nothing was left behind');

-- invalid (the CHECKs dropped inside this transaction, as a hand-edited row would be)
select lives_ok($q$ select tests.fx_break_limit(0, 3600) $q$, '[F2.4-c fixture] stored invalid: N = 0');
select is(pg_temp.opn('b', 'pv_b'), 'ERR:NS001', '[F2.4-c c22 P6] N = 0: the open fails closed');
select is(pg_temp.opn('pv_v', 'pv_b'), 'ERR:NS001', '[F2.4-c c22] V too');
select is(pg_temp.cnt('pv_v') || '/' || pg_temp.evs('pv_v'), '3/2', '[F2.4-c c22] no count and no event changed');
select lives_ok($q$ select tests.fx_break_limit(-1, 3600) $q$, '[F2.4-c fixture] N = -1');
select is(pg_temp.opn('pv_e', 'pv_b'), 'ERR:NS001', '[F2.4-c c22] N negative: fails closed');
select lives_ok($q$ select tests.fx_break_limit(3, 0) $q$, '[F2.4-c fixture] W = 0');
select is(pg_temp.opn('pv_e', 'pv_b'), 'ERR:NS001', '[F2.4-c c22] W = 0: fails closed');
select lives_ok($q$ select tests.fx_break_limit(3, -5) $q$, '[F2.4-c fixture] W = -5');
select is(pg_temp.opn('pv_e', 'pv_b'), 'ERR:NS001', '[F2.4-c c22] W negative: fails closed');
select is(pg_temp.cnt('pv_e') || '/' || pg_temp.evs('pv_e'), '1/0', '[F2.4-c c22] E''s earlier count is the only one: the failed opens left nothing');
select lives_ok($q$ select tests.fx_set_limit(3, 3600) $q$, '[F2.4-c fixture] valid again');
select is(pg_temp.opn('pv_e', 'pv_b'), 'shown', '[F2.4-c c22] and the open is shown');

-- =====================================================================================================================
-- c23 -- the fence: one definer, three closed tables, seven scoped policies
-- =====================================================================================================================
select is((select array_agg(a order by a) from tests.approved_security_definer() as a)::text, '{nestly.audit_trigger(),"nestly.child_tracker_trends(text,text,text,integer)",nestly.notify_comment(),nestly.notify_friendship(),nestly.notify_group(),nestly.notify_post(),nestly.notify_professional(),nestly.profile_view(text),nestly.reveal_post_author(uuid),"nestly.search_people(text,integer,integer)"}',
  '[F2.4-c c23 A8 rule 10 DR-G1 DR-L] the approved SECURITY DEFINER list is profile_view(text), I4''s two, the three notification triggers and search_people, I10''s notify_group (file 96), notify_professional (file 98) and the I14 completion''s child_tracker_trends (file 100)');
select set_eq(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and p.prosecdef $$,
  $$ values ('nestly.profile_view(text)'), ('nestly.audit_trigger()'), ('nestly.reveal_post_author(uuid)'), ('nestly.notify_comment()'), ('nestly.notify_friendship()'), ('nestly.notify_post()'), ('nestly.search_people(text,integer,integer)'), ('nestly.notify_group()'), ('nestly.notify_professional()'), ('nestly.child_tracker_trends(text,text,text,integer)') $$,
  '[F2.3-b c15] the SECURITY DEFINER functions in nestly are exactly the ten approved ones (I10''s notify_group, file 96; notify_professional, file 98; child_tracker_trends, file 100)');
select is(
  (select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' || pg_catalog.pg_get_userbyid(c.relowner),
                     ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('security_limits', 'profile_open_counts', 'security_events')),
  'profile_open_counts:true:true:app_owner, security_events:true:true:app_owner, security_limits:true:true:app_owner',
  '[F2.4-c c23 platform r8] the three tables have RLS enabled and forced, owned by app_owner');
select is(
  (select string_agg(r.rolname || '.' || c.relname, ', ' order by r.rolname, c.relname)
     from (values ('authenticated'), ('anon'), ('app_server'), ('app_jobs'), ('app_recovery'), ('service_role'), ('authenticator')) as r(rolname)
     cross join pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('security_limits', 'profile_open_counts', 'security_events')
      and (has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_any_column_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))),
  null,
  '[F2.4-c c23 c21 c22] no runtime role holds any privilege, table or column, on the three tables (authenticated, anon, app_server, app_jobs, app_recovery, service_role, authenticator)');
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace,
          aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'nestly' and c.relname in ('security_limits', 'profile_open_counts', 'security_events') and a.grantee = 0),
  0::bigint,
  '[F2.4-c c23] and PUBLIC holds none either');
select is(
  (select string_agg(c.relname || '.' || pol.polcmd::text || ':' || (select string_agg(r.rolname, '+' order by r.rolname) from pg_catalog.pg_roles r where r.oid = any (pol.polroles))
                     || ':' || pol.polpermissive::text, ', ' order by c.relname, pol.polcmd::text)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and pol.polname like '%\_profile\_view'
      and c.relname in ('friendships', 'regular_names', 'security_limits', 'profile_open_counts', 'security_events')),
  'friendships.r:app_owner:true, profile_open_counts.a:app_owner:true, profile_open_counts.r:app_owner:true, profile_open_counts.w:app_owner:true, '
  || 'regular_names.r:app_owner:true, security_events.a:app_owner:true, security_limits.r:app_owner:true',
  '[F2.4-c c23] the seven new policies: SELECT on friendships, regular_names and the Configuration; SELECT, INSERT and UPDATE on the counts; INSERT on the events (no event SELECT, UPDATE or DELETE); all TO app_owner, permissive');
select is(
  (select string_agg(pol.polname, ', ' order by pol.polname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('security_limits', 'profile_open_counts', 'security_events')),
  'profile_open_counts_insert_profile_view, profile_open_counts_select_profile_view, profile_open_counts_update_profile_view, security_events_insert_profile_view, '
  || 'security_events_insert_search, security_limits_select_profile_view, security_limits_select_search_people',
  '[F2.4-c c23] the three closed tables carry exactly seven policies (five of profile_view, two of search_people - file 90), none for authenticated, anon or PUBLIC');
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('security_limits', 'profile_open_counts', 'security_events')
      and pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'app_owner')]::oid[]),
  0::bigint,
  '[F2.4-c c23] and all seven are TO app_owner only');
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and pol.polname like '%\_profile\_view'
      and c.relname in ('friendships', 'regular_names', 'security_limits', 'profile_open_counts', 'security_events')
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          ~ 'profile_view_target\(\)'),
  7::bigint,
  '[F2.4-c c23 c15] each of the seven applies only while profile_view has declared a target (profile_view_target())');
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('profile_open_counts', 'security_events') and pol.polname like '%\_profile\_view'
      and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          ~ 'user_id = \( SELECT auth\.uid\(\)'),
  4::bigint,
  '[F2.4-c c21 c23] the count and event policies touch only the caller''s own row (user_id = auth.uid())');
select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'profile_open_limit'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'security_events' and pol.polcmd = 'a' and pol.polname like '%\_profile\_view'),
  '[F2.4-c c21 c23] the event policy allows only the profile-open-limit kind');
select ok(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'profile_open'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'security_limits' and pol.polcmd = 'r' and pol.polname like '%\_profile\_view'),
  '[F2.4-c c22 c23] the Configuration policy shows only the profile-open row');

-- the transaction-local target is empty after a shown, a refused and an unavailable open
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')),
    format($q$ select coalesce(pg_catalog.current_setting('nestly.profile_view_target', true), '') from (select count(*) from nestly.profile_view(%L)) as call $q$,
           pg_temp.id('pv_b')::text)),
  '', '[F2.4-c c23 c15] after a shown open the target in the same transaction is empty');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_g')),
    format($q$ select coalesce(pg_catalog.current_setting('nestly.profile_view_target', true), '') from (select count(*) from nestly.profile_view(%L)) as call $q$,
           pg_temp.id('pv_b')::text)),
  '', '[F2.4-c c23 c15] after a refused open (G is at the limit) it is empty too');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')),
    format($q$ select coalesce(pg_catalog.current_setting('nestly.profile_view_target', true), '') from (select count(*) from nestly.profile_view(%L)) as call $q$,
           gen_random_uuid()::text)),
  '', '[F2.4-c c23 c15] and after an open of an unavailable target');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')),
    $q$ select coalesce(pg_catalog.current_setting('nestly.profile_view_target', true), '') from (select count(*) from nestly.profile_view('abc')) as call $q$),
  '', '[F2.4-c c23 c15] and after a call that is not a uuid');

-- execute stays with authenticated alone, as F2.3b approved
select is(
  (select string_agg(r.rolname, ',' order by r.rolname)
     from (values ('PUBLIC'), ('anon'), ('authenticated'), ('app_server'), ('app_jobs'), ('app_recovery'), ('service_role'), ('authenticator')) as r(rolname)
     cross join (select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'nestly' and p.proname = 'profile_view') z
    where case when r.rolname = 'PUBLIC'
               then exists (select 1 from pg_catalog.pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                             where p.oid = z.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE')
               else has_function_privilege(r.rolname, z.oid, 'EXECUTE') end),
  'authenticated',
  '[F2.4-c c23 rules 1, 4] the recreated profile_view is executable by authenticated only');
select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly' and p.proname = 'profile_view' and p.prosecdef and p.proconfig = array['search_path=""']
      and pg_catalog.pg_get_userbyid(p.proowner) = 'app_owner'),
  1::bigint,
  '[F2.4-c c23 rule 10] profile_view is one SECURITY DEFINER owned by app_owner with search_path "" -- the only profile_view there is');

select * from finish();

rollback;
