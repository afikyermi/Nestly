-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.4c1: the Friend branch of nestly.profile_view, B's Friends lists, the
-- relationship state).
-- Source of expected values: .work/friends/spec.md (c17, c18, c19 + "Gate 1 (F2.4c)" DR-2 A, DR-3 A) and schema.md F2.4c1 (the
-- result's trailing columns, "pgTAP"), with F2.3b's c7-c14 (.work/profile-privacy/spec.md) for the views a Friend is compared to; not
-- the migration text. Every read runs as app_server under SET LOCAL ROLE authenticated (tests.as_role), as the runtime does.
-- People: V = pv_v ('Vered Viewer', never a Friend of B unless a case says so), B = pv_b (the spec fixture: 'דנה כהן', 2 children,
-- pregnant) -- both from setup/53_; a = 'Alice Aaron' (woman), b = 'Bella Baruch' (gender NULL), s = suspended, x = banned (10_);
-- fc = 'Cora Third' (60_); pv_e, pv_g, pv_z, P = 10_'s p. Friendships are written by tests.fx_fr_add (as postgres, with the status
-- copies), so no case depends on F2.4a's API. The limit is set to 10000 opens: the counting itself is file 64. Rolled back at the end.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F2.4-c c17 c18 c19] session_user is app_server (this file must not run under another login)');

select lives_ok($q$ select tests.fx_pv_build(), tests.fx_fr_build(), tests.fx_set_limit(10000, 3600) $q$,
  '[F2.4-c fixture] V, B, planning-only, pregnant-only, no-journey, C built; the open limit raised so no case here is refused');

create function pg_temp.id(p_name text) returns uuid language sql as $f$
  select case when p_name in ('p', 's', 'x', 'a', 'b') then tests.fx_id_checked(p_name)
              when p_name = 'fc' then tests.fx_fr_id('fr_c')
              else tests.fx_pv_id(p_name) end
$f$;
create function pg_temp.nm(p_name text) returns text language sql as $f$
  select case p_name when 'a' then 'Alice Aaron' when 'b' then 'Bella Baruch' when 'fc' then 'Cora Third' when 'pv_v' then 'Vered Viewer'
                     when 's' then 'Sara Suspended' when 'x' then 'Xenia Banned' end
$f$;
-- the one row a viewer gets from profile_view(target), as jsonb (null when 0 rows)
create function pg_temp.rw(p_viewer text, p_target text) returns jsonb language sql as $f$
  select (tests.as_role('authenticated', tests.claims(pg_temp.id(p_viewer)),
    format($q$ select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r))::text, '[]') from nestly.profile_view(%L) r $q$,
           pg_temp.id(p_target)::text))::jsonb) -> 0
$f$;
-- the six F2.3b items + outcome, without the three items that depend on who looks
create function pg_temp.core(p_viewer text, p_target text) returns jsonb language sql as $f$
  select pg_temp.rw(p_viewer, p_target) - 'relationship' - 'friends' - 'mutual_friends'
$f$;
create function pg_temp.want(p_name text, p_gender text, p_count int, p_ages jsonb, p_pregnant boolean, p_sentence boolean)
returns jsonb language sql as $f$
  select jsonb_build_object('full_name', p_name, 'gender', p_gender, 'children_count', p_count, 'child_ages', p_ages,
    'is_pregnant', p_pregnant, 'shows_empty_journey_sentence', p_sentence, 'outcome', 'shown')
$f$;
create function pg_temp.age(p_birth date) returns jsonb language sql as $f$
  select jsonb_build_object('years', tests.fx_age(p_birth, now()) / 12, 'months', tests.fx_age(p_birth, now()) % 12)
$f$;
-- B's views: open (c8) and restricted (c7); g's (pregnant only, no children)
create function pg_temp.b_open() returns jsonb language sql as $f$
  select pg_temp.want('דנה כהן', 'woman', 2, jsonb_build_array(pg_temp.age(date '2023-05-04'), pg_temp.age(date '2025-01-10')), true, false)
$f$;
create function pg_temp.b_restricted() returns jsonb language sql as $f$ select pg_temp.want('דנה כהן', null, 2, null, true, false) $f$;
create function pg_temp.g_open() returns jsonb language sql as $f$ select pg_temp.want('Gila Pregnant', 'woman', 0, '[]'::jsonb, true, false) $f$;
create function pg_temp.g_restricted() returns jsonb language sql as $f$ select pg_temp.want('Gila Pregnant', null, 0, null, true, false) $f$;

create function pg_temp.as_owner(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.set_vis(p_who text, p_vis text) returns text language sql as $f$
  select pg_temp.as_owner(p_who, format($q$ update nestly.regular_profiles set profile_visibility = %L $q$, p_vis))
$f$;
create function pg_temp.clear() returns void language plpgsql as $f$
declare n text;
begin
  foreach n in array array['pv_v', 'pv_b', 'pv_e', 'pv_g', 'pv_z', 'pv_l', 'a', 'b', 'fc', 's', 'x', 'p'] loop
    perform tests.fx_fr_purge(pg_temp.id(n));
  end loop;
end
$f$;
create function pg_temp.fr(p_req text, p_addr text, p_status text default 'pending', p_cancelled boolean default false)
returns uuid language sql as $f$
  select tests.fx_fr_add(pg_temp.id(p_req), pg_temp.id(p_addr), p_status, p_cancelled)
$f$;
-- a list of a result as a sorted array, and the list expected for the given people
create function pg_temp.lst(p_viewer text, p_target text, p_key text) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(e order by e ->> 'userId'), '[]'::jsonb)
    from jsonb_array_elements(pg_temp.rw(p_viewer, p_target) -> p_key) e
$f$;
create function pg_temp.entries(p_names text[]) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(jsonb_build_object('userId', pg_temp.id(n)::text, 'fullName', pg_temp.nm(n)) order by pg_temp.id(n)::text), '[]'::jsonb)
    from unnest(p_names) n
$f$;

-- =====================================================================================================================
-- c17 -- a Friend gets B's Open view, whether B is open or restricted (DR-2 A)
-- =====================================================================================================================
select is(pg_temp.core('pv_v', 'pv_b'), pg_temp.b_open(), '[F2.4-c c17 control] V, not a Friend, reads B open: F2.3b''s Open view');
select is(pg_temp.set_vis('pv_b', 'restricted'), 'OK:1', '[F2.4-c fixture] B restricted');
select is(pg_temp.core('pv_v', 'pv_b'), pg_temp.b_restricted(), '[F2.4-c c17 control] V, not a Friend, reads B restricted: F2.3b''s Restricted view');

select lives_ok($q$ select pg_temp.fr('a', 'pv_b', 'accepted'), pg_temp.fr('pv_b', 'b', 'accepted') $q$,
  '[F2.4-c fixture] a requested B and B requested b, both accepted: a and b are B''s Friends');
select is(pg_temp.core('a', 'pv_b'), pg_temp.b_open(),
  '[F2.4-c c17 DR-2 FR-PRIV-001] B restricted: a (the requester) gets B''s Open view, item for item: gender, ages as years and months, count, pregnant');
select is(pg_temp.core('b', 'pv_b'), pg_temp.b_open(),
  '[F2.4-c c17 DR-2] B restricted: b (the addressee) gets the same Open view');
select is(pg_temp.core('pv_v', 'pv_b'), pg_temp.b_restricted(), '[F2.4-c c17] and V, not B''s Friend, still gets the Restricted view');
select is(pg_temp.set_vis('pv_b', 'open'), 'OK:1', '[F2.4-c fixture] B open');
select is(pg_temp.core('a', 'pv_b'), pg_temp.b_open(), '[F2.4-c c17 DR-2] B open: a gets B''s Open view');
select is(pg_temp.core('pv_v', 'pv_b'), pg_temp.b_open(), '[F2.4-c c17] B open: V gets the same Open view (a Friend sees no more than an open profile shows)');
select is(pg_temp.set_vis('pv_b', 'restricted'), 'OK:1', '[F2.4-c fixture] B restricted again');

select is((select string_agg(k, ',' order by k) from jsonb_object_keys(pg_temp.rw('a', 'pv_b')) k),
  'child_ages,children_count,friends,full_name,gender,is_pregnant,mutual_friends,outcome,relationship,shows_empty_journey_sentence',
  '[F2.4-c c17 c18 c19] a Friend''s row has exactly the ten items: the six of F2.3b, the two lists, the state, the outcome');
select is(
  pg_temp.rw('a', 'pv_b')::text ~ ('נועה|איתי|girl|boy|"sex"|2023-05-04|2025-01-10|2027-03-01|birth_date|due_date|week|"slot"|email|consent|tracker|"id"|'
                                    || tests.fx_pv_id('pv_b')::text),
  false,
  '[F2.4-c c17 P2] a Friend of B still gets no child name, sex, birth date, due date, pregnancy week, id, slot, email, consent or tracker item, and not B''s id');
select ok(
  (select bool_and(jsonb_typeof(e -> 'years') = 'number' and jsonb_typeof(e -> 'months') = 'number')
     from jsonb_array_elements(pg_temp.rw('a', 'pv_b') -> 'child_ages') e),
  '[F2.4-c c17] the Friend''s ages are years and months, numbers (the text is made from them by the caller)');

-- not a Friendship: pending, declined, cancelled, removed -- either party gets the non-Friend view of the other's current state
select is(pg_temp.set_vis('pv_g', 'restricted'), 'OK:1', '[F2.4-c fixture] g (pregnant only) restricted');
create function pg_temp.views(p_req text, p_addr text, p_status text, p_cancelled boolean) returns text language plpgsql as $f$
begin
  perform pg_temp.clear();
  perform pg_temp.fr(p_req, p_addr, p_status, p_cancelled);
  return (pg_temp.core('pv_g', 'pv_b'))::text || ' | ' || (pg_temp.core('pv_b', 'pv_g'))::text;
end
$f$;
select is(pg_temp.views(c.req, c.addr, c.st, c.canc),
  (pg_temp.b_restricted())::text || ' | ' || (pg_temp.g_restricted())::text,
  '[F2.4-c c17 FR-REL-001] both restricted, ' || c.req || ' -> ' || c.addr || ' ' || c.st || case when c.canc then ' cancelled' else '' end
  || ': not a Friendship, each gets the Restricted view of the other')
from (values
  ('pv_g', 'pv_b', 'pending', false), ('pv_b', 'pv_g', 'pending', false),
  ('pv_g', 'pv_b', 'pending', true),  ('pv_b', 'pv_g', 'pending', true),
  ('pv_g', 'pv_b', 'declined', false), ('pv_b', 'pv_g', 'declined', false),
  ('pv_g', 'pv_b', 'declined', true),  ('pv_b', 'pv_g', 'declined', true),
  ('pv_g', 'pv_b', 'removed', false),  ('pv_b', 'pv_g', 'removed', false)
) as c(req, addr, st, canc);
select is(pg_temp.views(c.req, c.addr, 'accepted', false),
  (pg_temp.b_open())::text || ' | ' || (pg_temp.g_open())::text,
  '[F2.4-c c17 DR-2] both restricted, ' || c.req || ' -> ' || c.addr || ' accepted: each gets the Open view of the other')
from (values ('pv_g', 'pv_b'), ('pv_b', 'pv_g')) as c(req, addr);

-- after Remove: the next read of either party is the non-Friend view; a new Friendship: the Friend view on the next read
select lives_ok($q$ select pg_temp.clear(), pg_temp.fr('pv_g', 'pv_b', 'accepted') $q$, '[F2.4-c fixture] g and B Friends');
select is(pg_temp.core('pv_g', 'pv_b'), pg_temp.b_open(), '[F2.4-c c17] before the removal: the Friend view');
select lives_ok($q$ select pg_temp.clear(), pg_temp.fr('pv_g', 'pv_b', 'removed') $q$, '[F2.4-c fixture] the Friendship is removed');
select is(pg_temp.core('pv_g', 'pv_b'), pg_temp.b_restricted(), '[F2.4-c c17 FR-REL-001] after Remove: g''s next read is the Restricted view of B''s current state');
select is(pg_temp.core('pv_b', 'pv_g'), pg_temp.g_restricted(), '[F2.4-c c17 FR-REL-001] after Remove: B''s next read of g is the Restricted view too');
select lives_ok($q$ select pg_temp.fr('pv_b', 'pv_g', 'accepted') $q$, '[F2.4-c fixture] a new Friendship (B requests, g accepts) beside the removed row');
select is(pg_temp.core('pv_g', 'pv_b'), pg_temp.b_open(), '[F2.4-c c17] a new Friendship: the Friend view on the next read');
select is(pg_temp.core('pv_b', 'pv_g'), pg_temp.g_open(), '[F2.4-c c17] and B reads g''s Open view');

-- a Friend of a Friend is not a Friend
select lives_ok($q$ select pg_temp.clear(), pg_temp.fr('pv_v', 'a', 'accepted'), pg_temp.fr('a', 'pv_b', 'accepted') $q$,
  '[F2.4-c fixture] V is a Friend of a, a is a Friend of B');
select is(pg_temp.core('pv_v', 'pv_b'), pg_temp.b_restricted(), '[F2.4-c c17] a Friend of B''s Friend gets the non-Friend view');
select is(pg_temp.core('pv_b', 'pv_v'), pg_temp.want('Vered Viewer', 'man', 0, '[]'::jsonb, false, true),
  '[F2.4-c c17] and B, not V''s Friend, reads V open: the non-Friend Open view (V is open by default)');

-- unavailable still means 0 rows, Friend or not
select lives_ok($q$ select pg_temp.clear(), pg_temp.fr('a', 'pv_b', 'accepted') $q$, '[F2.4-c fixture] a and B Friends');
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_b'), 'suspended') $q$, '[F2.4-c fixture] B suspended');
select is(pg_temp.rw('a', 'pv_b'), null, '[F2.4-c c17 DR-5 A9] a Friend of a suspended B gets 0 rows');
select lives_ok($q$ select tests.set_status(tests.fx_pv_id('pv_b'), 'active'), tests.set_status(tests.fx_id_checked('a'), 'suspended') $q$,
  '[F2.4-c fixture] B active, a suspended');
select is(pg_temp.rw('a', 'pv_b'), null, '[F2.4-c c17 A9 rule 15] a suspended Friend gets 0 rows');
select lives_ok($q$ select tests.set_status(tests.fx_id_checked('a'), 'active') $q$, '[F2.4-c fixture] a active again');

-- =====================================================================================================================
-- c18 -- B's Friends and the mutual Friends: exactly {userId, fullName}, active Friends only, never the viewer or B
-- =====================================================================================================================
-- B: Friends a, b, fc (accepted), s (accepted, suspended), pending E, declined g, removed z. V: Friend of a and fc. a: Friend of fc.
select lives_ok($q$ select pg_temp.clear(),
    pg_temp.fr('a', 'pv_b', 'accepted'), pg_temp.fr('pv_b', 'b', 'accepted'), pg_temp.fr('fc', 'pv_b', 'accepted'), pg_temp.fr('pv_b', 's', 'accepted'),
    pg_temp.fr('pv_e', 'pv_b', 'pending'), pg_temp.fr('pv_g', 'pv_b', 'declined'), pg_temp.fr('pv_z', 'pv_b', 'removed'),
    pg_temp.fr('pv_v', 'a', 'accepted'), pg_temp.fr('fc', 'pv_v', 'accepted'), pg_temp.fr('a', 'fc', 'accepted') $q$,
  '[F2.4-c c18 fixture] B''s Friends and the other pairs');
select is(pg_temp.lst('pv_v', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b', 'fc']),
  '[F2.4-c c18 §1.4] B restricted, V (not a Friend): B''s Friends are a, b, fc -- not the suspended s, the pending, declined or removed ones');
select is(pg_temp.lst('pv_v', 'pv_b', 'mutual_friends'), pg_temp.entries(array['a', 'fc']),
  '[F2.4-c c18] V''s mutual Friends with B: a and fc (the Friends of both)');
select is(pg_temp.lst('a', 'pv_b', 'friends'), pg_temp.entries(array['b', 'fc']),
  '[F2.4-c c18] a (B''s Friend) sees B''s other Friends: neither the viewer nor B in the list');
select is(pg_temp.lst('a', 'pv_b', 'mutual_friends'), pg_temp.entries(array['fc']), '[F2.4-c c18] a''s mutual Friends with B: fc');
select is(pg_temp.lst('p', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b', 'fc']), '[F2.4-c c18 OP-020] P sees B''s Friends the same');
select is(pg_temp.lst('p', 'pv_b', 'mutual_friends'), '[]'::jsonb, '[F2.4-c c18] P''s mutual list is empty');
select is(jsonb_typeof(pg_temp.rw('p', 'pv_b') -> 'mutual_friends'), 'array', '[F2.4-c c18] and it is a list ([]), not null');
select is(pg_temp.set_vis('pv_b', 'open'), 'OK:1', '[F2.4-c fixture] B open');
select is(pg_temp.lst('pv_v', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b', 'fc']), '[F2.4-c c18] B open: the same Friends for V');
select is(pg_temp.lst('pv_v', 'pv_b', 'mutual_friends'), pg_temp.entries(array['a', 'fc']), '[F2.4-c c18] B open: the same mutual Friends');
select is(pg_temp.lst('a', 'pv_b', 'friends'), pg_temp.entries(array['b', 'fc']), '[F2.4-c c18] B open, a a Friend: the same list');
select is(pg_temp.lst('p', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b', 'fc']), '[F2.4-c c18] B open, P: the same list');
select is(pg_temp.lst('p', 'pv_b', 'mutual_friends'), '[]'::jsonb, '[F2.4-c c18] B open, P: no mutual Friends');
select is(
  (select string_agg(distinct k, ',' order by k)
     from (select jsonb_object_keys(e) k
             from jsonb_array_elements(pg_temp.rw('pv_v', 'pv_b') -> 'friends' || (pg_temp.rw('pv_v', 'pv_b') -> 'mutual_friends')) e) s),
  'fullName,userId',
  '[F2.4-c c18 P2] every entry of both lists holds exactly userId and fullName: no status, no gender, no request time');

-- a non-active Friend of B is absent, and back when active again
select lives_ok($q$ select tests.set_status(tests.fx_fr_id('fr_c'), 'suspended') $q$, '[F2.4-c fixture] fc suspended');
select is(pg_temp.lst('pv_v', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b']), '[F2.4-c c18 DR-5] fc suspended: gone from B''s Friends');
select is(pg_temp.lst('pv_v', 'pv_b', 'mutual_friends'), pg_temp.entries(array['a']), '[F2.4-c c18 DR-5] and from the mutual Friends');
select lives_ok($q$ select tests.set_status(tests.fx_fr_id('fr_c'), 'banned') $q$, '[F2.4-c fixture] fc banned');
select is(pg_temp.lst('pv_v', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b']), '[F2.4-c c18 BR-063] fc banned: gone too');
select lives_ok($q$ select tests.set_status(tests.fx_fr_id('fr_c'), 'active') $q$, '[F2.4-c fixture] fc active again');
select is(pg_temp.lst('pv_v', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b', 'fc']), '[F2.4-c c18 DR-5] fc active again: back');
select lives_ok($q$ select tests.set_status(tests.fx_id_checked('a'), 'suspended') $q$, '[F2.4-c fixture] a suspended');
select is(pg_temp.lst('pv_v', 'pv_b', 'friends'), pg_temp.entries(array['b', 'fc']), '[F2.4-c c18 DR-5] a suspended: gone from B''s Friends');
select lives_ok($q$ select tests.set_status(tests.fx_id_checked('a'), 'active') $q$, '[F2.4-c fixture] a active again');

-- the viewer is a Friend of B too: neither the viewer nor B in either list
select lives_ok($q$ select pg_temp.fr('pv_v', 'pv_b', 'accepted') $q$, '[F2.4-c fixture] V and B Friends');
select is(pg_temp.lst('pv_v', 'pv_b', 'friends'), pg_temp.entries(array['a', 'b', 'fc']), '[F2.4-c c18] V a Friend of B: V is not in B''s Friends list, nor is B');
select is(pg_temp.lst('pv_v', 'pv_b', 'mutual_friends'), pg_temp.entries(array['a', 'fc']), '[F2.4-c c18] nor in the mutual list');
select is(pg_temp.rw('pv_v', 'pv_b')::text ~ (tests.fx_pv_id('pv_v')::text || '|' || tests.fx_pv_id('pv_b')::text), false,
  '[F2.4-c c18] neither the viewer''s nor B''s id appears anywhere in the row');

-- B with no Friends: two empty lists, in both states, for V and P
select is(pg_temp.rw('pv_v', 'pv_z') -> 'friends', '[]'::jsonb, '[F2.4-c c18] a B with no Friends: an empty Friends list (not null)');
select is(pg_temp.rw('pv_v', 'pv_z') -> 'mutual_friends', '[]'::jsonb, '[F2.4-c c18] and an empty mutual list');
select is(pg_temp.rw('p', 'pv_z') -> 'friends', '[]'::jsonb, '[F2.4-c c18] P: the same, empty');
select is(pg_temp.set_vis('pv_z', 'restricted'), 'OK:1', '[F2.4-c fixture] that B restricted');
select is(pg_temp.rw('pv_v', 'pv_z') -> 'friends', '[]'::jsonb, '[F2.4-c c18] restricted: still an empty list');
select is(pg_temp.rw('pv_v', 'pv_z') -> 'mutual_friends', '[]'::jsonb, '[F2.4-c c18] and an empty mutual list');

-- as V, no direct SELECT returns a Friendship V is not party to, nor a name V has no relationship with
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')),
    format($q$ select count(*)::text from nestly.friendships where %L not in (requester_id, addressee_id) $q$, tests.fx_pv_id('pv_v'))),
  '0', '[F2.4-c c18 A1] as V, no direct SELECT on friendships returns a row V is not party to (B''s Friendships included)');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('pv_v')), $q$ select count(*)::text from nestly.friendships $q$),
  '3', '[F2.4-c c18 control] and V reads its own three rows (a, fc, B)');
create function pg_temp.probe(p_who text, p_set boolean) returns text language sql as $f$
  select tests.dml_as_msg('authenticated', tests.claims(pg_temp.id(p_who)), format($d$
    do $x$
    declare f bigint; n bigint;
    begin
      if %L then perform pg_catalog.set_config('nestly.profile_view_target', %L, true); end if;
      select count(*) into f from nestly.friendships t where %L not in (t.requester_id, t.addressee_id);
      select count(*) into n from nestly.regular_names t where t.user_id = %L;
      if f > 0 or n > 0 then raise exception 'hits: friendships=%% names=%%', f, n; end if;
    end
    $x$ $d$, p_set, tests.fx_pv_id('pv_b')::text, pg_temp.id(p_who)::text,
    tests.fx_id_checked('b')::text))
$f$;
select is(pg_temp.probe('pv_v', false), 'OK:0',
  '[F2.4-c c18 A1] V reads no other Friendship and not the name of b (B''s Friend, none of V''s)');
select is(pg_temp.probe('pv_v', true), 'OK:0',
  '[F2.4-c c18 c23] V sets the transaction-local target to B itself: the scoped policies (TO app_owner) still open no Friendship or name');
select is(pg_temp.probe('p', true), 'OK:0', '[F2.4-c c18 c23] P, target set by itself: nothing either');

-- =====================================================================================================================
-- c19 -- the relationship state, from F2.4a's rows
-- =====================================================================================================================
-- "viewer/other" after one row requester -> addressee: the state the requester reads of the addressee / the addressee of the requester
create function pg_temp.states(p_req text, p_addr text, p_status text, p_cancelled boolean) returns text language plpgsql as $f$
begin
  perform pg_temp.clear();
  perform pg_temp.fr(p_req, p_addr, p_status, p_cancelled);
  return (pg_temp.rw(p_req, p_addr) ->> 'relationship') || '/' || (pg_temp.rw(p_addr, p_req) ->> 'relationship');
end
$f$;
select is(pg_temp.states(c.req, c.addr, c.st, c.canc), c.want,
  '[F2.4-c c19 FR-REL-001 AC-034] ' || c.req || ' -> ' || c.addr || ' ' || c.st || case when c.canc then ' cancelled' else '' end || ': ' || c.want)
from (values
  ('pv_v', 'pv_b', 'pending',  false, 'sent/received'),
  ('pv_b', 'pv_v', 'pending',  false, 'sent/received'),
  ('pv_v', 'pv_b', 'pending',  true,  'none/none'),
  ('pv_v', 'pv_b', 'declined', false, 'sent/none'),
  ('pv_b', 'pv_v', 'declined', false, 'sent/none'),
  ('pv_v', 'pv_b', 'declined', true,  'none/none'),
  ('pv_v', 'pv_b', 'accepted', false, 'friends/friends'),
  ('pv_b', 'pv_v', 'accepted', false, 'friends/friends'),
  ('pv_v', 'pv_b', 'removed',  false, 'none/none')
) as c(req, addr, st, canc, want);
select lives_ok($q$ select pg_temp.clear() $q$, '[F2.4-c fixture] no friendship rows');
select is(pg_temp.rw('pv_v', 'pv_b') ->> 'relationship', 'none', '[F2.4-c c19] no row between them: none');
select lives_ok($q$ select pg_temp.fr('pv_v', 'pv_b', 'removed'), pg_temp.fr('pv_v', 'pv_b', 'pending') $q$, '[F2.4-c fixture] a removed row and then a new pending one');
select is(pg_temp.rw('pv_v', 'pv_b') ->> 'relationship', 'sent', '[F2.4-c c19] sent (the live row decides)');
select is(pg_temp.rw('pv_b', 'pv_v') ->> 'relationship', 'received', '[F2.4-c c19] and received on the other side');
select is(pg_temp.states('pv_v', 'pv_b', 'declined', false), 'sent/none',
  '[F2.4-c c19 DR-3 A] after B declines V''s request V''s state stays sent and B''s is none: the decline is silent');
-- P: no state
select lives_ok($q$ select pg_temp.clear() $q$, '[F2.4-c fixture] no friendship rows');
select is(pg_temp.rw('p', 'pv_b') -> 'relationship', 'null'::jsonb, '[F2.4-c c19 OP-020] P as viewer gets no state (null)');
select is(pg_temp.rw('p', 'pv_b') ? 'relationship', true, '[F2.4-c c19] the item is present and null for P, not a state');
-- the state is the viewer's own, in every open/restricted combination
select is(pg_temp.set_vis('pv_b', 'restricted'), 'OK:1', '[F2.4-c fixture] B restricted');
select is(pg_temp.states('pv_v', 'pv_b', 'pending', false), 'sent/received', '[F2.4-c c19] B restricted: the same states');

select * from finish();

rollback;
