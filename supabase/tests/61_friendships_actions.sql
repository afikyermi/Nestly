-- pgTAP, run by pg_prove as app_server (CI `db` job, I2 F2.4a friendships: what each actor may do to which row).
-- Source of expected values: .work/friends/spec.md (criteria c1-c10) and schema.md F2.4a "pgTAP" (SQLSTATEs of the database
-- contract), not the migration text. Structure/RLS/grant checks (c12) are 60_friendships_structure.sql, names 62_.
-- The HTTP shape of the same rules (201/404/409/403) is apps/server/tests/db/friends.db.test.ts; the races (c4, c9) are there.
-- People: A, B = 10_'s a, b (active Regulars, never Friends); C = 60_'s fr_c (built below, rolled back); P = 10_'s p
-- (Professional); M, D = 60_'s fr_m, fr_d (Moderator, Admin); S, X = 10_'s s, x (suspended, banned).
-- Everything rolls back with the transaction. A refused write is 'ERR:42501' (privilege, policy or the transition rule) or
-- 'OK:0' (RLS hides the row); both leave the row exactly as it was.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F2.4-a c12] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 's' then tests.fx_id('s') when 'x' then tests.fx_id('x')
    when 'c' then tests.fx_fr_id('fr_c') when 'm' then tests.fx_fr_id('fr_m') when 'd' then tests.fx_fr_id('fr_d')
  end
$f$;
-- one statement as `authenticated`, as that person
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.rows(p_x text, p_y text) returns text language sql as $f$
  select tests.fx_fr_rows(pg_temp.id(p_x), pg_temp.id(p_y))
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  perform tests.set_status(pg_temp.id('a'), 'active'); perform tests.set_status(pg_temp.id('b'), 'active');
  perform tests.set_status(pg_temp.id('c'), 'active');
end
$f$;
create function pg_temp.ins(p_who text, p_target text, p_keep boolean default true) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id(p_target)), p_keep)
$f$;
create function pg_temp.seen(p_who text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), 'nestly.friendships')
$f$;
-- a refused write: the row was not changed (RLS hid it, or the privilege / transition rule raised 42501)
create function pg_temp.refused(p_res text) returns boolean language sql as $f$ select p_res in ('OK:0', 'ERR:42501') $f$;

select is(tests.fx_fr_count(), 0::bigint, '[F2.4-a fixture] there is no friendship row before the file starts');

-- =====================================================================================================================
-- c1 -- A sends B a request
-- =====================================================================================================================
select is(pg_temp.ins('a', 'b'), 'OK:1', '[F2.4-a c1 FR-REL-001] A inserts (addressee_id) = B: 1 row');
select is(pg_temp.rows('a', 'b'), 'a>b:pending', '[F2.4-a c1] one pending row, requester A (set by the database), addressee B');
select is(pg_temp.seen('a'), '1', '[F2.4-a c1 VAL-017] A sees the row (its sent list)');
select is(pg_temp.seen('b'), '1', '[F2.4-a c1] B sees the row (its incoming list)');
select is(pg_temp.seen('c'), '0', '[F2.4-a c1 AC-034] C sees no row');
select is(pg_temp.seen('p'), '0', '[F2.4-a c1 AC-034] P sees no row');
select is(pg_temp.dml('c', 'select 1 from nestly.friendships where addressee_id = ' || quote_literal(pg_temp.id('b')) || '::uuid'), 'OK:0',
  '[F2.4-a c1] and C cannot find it by naming B either');
select is(tests.fx_fr_clock(tests.fx_fr_find(pg_temp.id('a'), pg_temp.id('b'))), 'resp=f canc=f rem=f', '[F2.4-a c1] a new request has no response, cancel or removal time');

select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (requester_id, addressee_id) values (%L, %L) $q$, pg_temp.id('c'), pg_temp.id('b'))), 'ERR:42501',
  '[F2.4-a c1 c2 rule 12] naming a requester other than A (C) is denied');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (requester_id, addressee_id) values (%L, %L) $q$, pg_temp.id('a'), pg_temp.id('c'))), 'ERR:42501',
  '[F2.4-a c1 rule 12] even naming A as the requester is denied: the database sets it');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id, status) values (%L, 'accepted') $q$, pg_temp.id('c'))), 'ERR:42501',
  '[F2.4-a c1 rule 12] naming the status is denied');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id, requested_at) values (%L, now() - interval '1 year') $q$, pg_temp.id('c'))), 'ERR:42501',
  '[F2.4-a c1 rule 12] naming a clock is denied');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id, requester_status) values (%L, 'active') $q$, pg_temp.id('c'))), 'ERR:42501',
  '[F2.4-a c1 rule 12] naming the counterparty-status copy is denied');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id, id) values (%L, gen_random_uuid()) $q$, pg_temp.id('c'))), 'ERR:42501',
  '[F2.4-a c1 rule 12] naming the id is denied');
select is(pg_temp.rows('a', 'c') || '|' || pg_temp.rows('b', 'c'), '|', '[F2.4-a c1 c2] none of the refused inserts left a row');

-- =====================================================================================================================
-- c2 -- refused targets
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id(t.w))), 'ERR:23503',
  '[F2.4-a c2 AC-034 BR-029 DR-5] A inserts naming ' || t.label || ': refused, no row')
  from (values ('p', 'P (Professional)'), ('m', 'M (Moderator)'), ('d', 'D (Admin)'), ('s', 'S (suspended)'), ('x', 'X (banned)')) t(w, label);
select is(pg_temp.dml('a', $q$ insert into nestly.friendships (addressee_id) values ('99999999-9999-4999-8999-999999999999') $q$), 'ERR:23503',
  '[F2.4-a c2 ERR-016] A inserts naming a random uuid: refused');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('a'))), 'ERR:23514',
  '[F2.4-a c2] A inserts naming A: refused (a person is not their own Friend)');
select is(tests.fx_fr_count(), 0::bigint, '[F2.4-a c2] no refused insert left a row');

-- B becomes suspended / banned after it was a valid target
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.ins('a', 'b'), 'ERR:23503', '[F2.4-a c2 DR-5] B suspended: A cannot send to B');
select tests.set_status(pg_temp.id('b'), 'banned');
select is(pg_temp.ins('a', 'b'), 'ERR:23503', '[F2.4-a c2 DR-5] B banned: A cannot send to B');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.ins('a', 'b', false), 'OK:1', '[F2.4-a c2] B active again: the same insert works');

-- =====================================================================================================================
-- c3 -- duplicates: at most one live row per unordered pair
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select is(pg_temp.ins('a', 'b'), 'ERR:23505', '[F2.4-a c3 VAL-017] A->B pending, A sends again: unique violation');
select is(pg_temp.ins('b', 'a'), 'ERR:23505', '[F2.4-a c3 VAL-017] A->B pending, B sends to A: unique violation (the pair is unordered)');
select is(pg_temp.rows('a', 'b'), 'a>b:pending', '[F2.4-a c3] still exactly the one row');

select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.ins('a', 'b'), 'ERR:23505', '[F2.4-a c3 FR-REL-001] A and B Friends, A sends: unique violation');
select is(pg_temp.ins('b', 'a'), 'ERR:23505', '[F2.4-a c3 FR-REL-001] A and B Friends, B sends: unique violation');
select is(pg_temp.rows('a', 'b'), 'a>b:accepted', '[F2.4-a c3] still exactly the Friendship');

select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'declined');
select is(pg_temp.ins('a', 'b'), 'ERR:23505', '[F2.4-a c3 c6 DR-3] after B declined A->B, the same A->B cannot be inserted again');
select is(pg_temp.ins('b', 'a', false), 'OK:1', '[F2.4-a c3 c6 DR-3] after B declined A->B, B->A can be inserted (checked, rolled back)');

-- a cancelled or removed row does not block a new request, either way round
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending', true);
select is(pg_temp.ins('a', 'b', false), 'OK:1', '[F2.4-a c3 c7] a cancelled A->B does not block A->B');
select is(pg_temp.ins('b', 'a', false), 'OK:1', '[F2.4-a c3 c7] a cancelled A->B does not block B->A');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'removed');
select is(pg_temp.ins('a', 'b', false), 'OK:1', '[F2.4-a c3 c8] a removed Friendship does not block A->B');
select is(pg_temp.ins('b', 'a', false), 'OK:1', '[F2.4-a c3 c8] a removed Friendship does not block B->A');

-- =====================================================================================================================
-- c5 -- accept
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.friendships set status = 'accepted' where addressee_id = %L $q$, pg_temp.id('b')))),
  '[F2.4-a c5 AC-034] A (the requester) accepts its own request: refused');
select ok(pg_temp.refused(pg_temp.dml('c', format($q$ update nestly.friendships set status = 'accepted' where addressee_id = %L $q$, pg_temp.id('b')))),
  '[F2.4-a c5 AC-034] C accepts the request: refused');
select is(pg_temp.rows('a', 'b'), 'a>b:pending', '[F2.4-a c5] after both, still pending');
select is(pg_temp.dml('c', format($q$ update nestly.friendships set status = 'accepted' where addressee_id = %L $q$, pg_temp.id('b'))), 'OK:0',
  '[F2.4-a c5] C changes 0 rows (it cannot see the row)');
select is(pg_temp.dml('b', format($q$ update nestly.friendships set status = 'accepted' where requester_id = %L $q$, pg_temp.id('a'))), 'OK:1',
  '[F2.4-a c5 FR-REL-001] B (the addressee) accepts: 1 row');
select is(pg_temp.rows('a', 'b'), 'a>b:accepted', '[F2.4-a c5] the row is accepted, requester still A');
select is(tests.fx_fr_clock(tests.fx_fr_find(pg_temp.id('a'), pg_temp.id('b'))), 'resp=t canc=f rem=f', '[F2.4-a c5] the response time is set');
select is(pg_temp.seen('a') || pg_temp.seen('b') || pg_temp.seen('c'), '110', '[F2.4-a c5] both Friends see the Friendship, C does not');

-- =====================================================================================================================
-- c6 -- decline
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.friendships set status = 'declined' where addressee_id = %L $q$, pg_temp.id('b')))),
  '[F2.4-a c6] A declines its own request: refused');
select ok(pg_temp.refused(pg_temp.dml('c', format($q$ update nestly.friendships set status = 'declined' where addressee_id = %L $q$, pg_temp.id('b')))),
  '[F2.4-a c6] C declines the request: refused');
select is(pg_temp.rows('a', 'b'), 'a>b:pending', '[F2.4-a c6] after both, still pending');
select is(pg_temp.dml('b', format($q$ update nestly.friendships set status = 'declined' where requester_id = %L $q$, pg_temp.id('a'))), 'OK:1',
  '[F2.4-a c6 FR-REL-001] B declines: 1 row');
select is(pg_temp.rows('a', 'b'), 'a>b:declined', '[F2.4-a c6] the row is declined; no Friendship (no accepted row)');
select is(tests.fx_fr_clock(tests.fx_fr_find(pg_temp.id('a'), pg_temp.id('b'))), 'resp=t canc=f rem=f', '[F2.4-a c6] the response time is set');

-- =====================================================================================================================
-- c7 -- cancel (DR-4)
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ update nestly.friendships set cancelled_at = now() where requester_id = %L $q$, pg_temp.id('a')))),
  '[F2.4-a c7 DR-4] B (the addressee) cancels A''s request: refused');
select ok(pg_temp.refused(pg_temp.dml('c', format($q$ update nestly.friendships set cancelled_at = now() where addressee_id = %L $q$, pg_temp.id('b')))),
  '[F2.4-a c7 DR-4] C cancels the request: refused');
select is(pg_temp.rows('a', 'b'), 'a>b:pending', '[F2.4-a c7] after both, the request is live');
select is(pg_temp.dml('a', format($q$ update nestly.friendships set cancelled_at = now() where addressee_id = %L $q$, pg_temp.id('b'))), 'OK:1',
  '[F2.4-a c7 DR-4] A cancels its pending request: 1 row');
select is(pg_temp.rows('a', 'b'), 'a>b:pending+c', '[F2.4-a c7] it is marked cancelled, not accepted or declined');
select is(tests.fx_fr_clock(tests.fx_fr_find(pg_temp.id('a'), pg_temp.id('b'))), 'resp=f canc=t rem=f', '[F2.4-a c7] the cancel time is set');
select is(pg_temp.ins('a', 'b'), 'OK:1', '[F2.4-a c7 DR-4] A->B may be sent again after a cancel');
select is(pg_temp.rows('a', 'b'), 'a>b:pending ; a>b:pending+c', '[F2.4-a c7] one live request beside the cancelled one');

-- =====================================================================================================================
-- c8 -- remove
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select ok(pg_temp.refused(pg_temp.dml('c', format($q$ update nestly.friendships set status = 'removed' where requester_id = %L $q$, pg_temp.id('a')))),
  '[F2.4-a c8 FR-REL-001] C removes A and B''s Friendship: refused');
select is(pg_temp.dml('c', format($q$ update nestly.friendships set status = 'removed' where requester_id = %L $q$, pg_temp.id('a'))), 'OK:0',
  '[F2.4-a c8] C changes 0 rows');
select is(pg_temp.rows('a', 'b'), 'a>b:accepted', '[F2.4-a c8] still Friends');
select is(pg_temp.dml('a', format($q$ update nestly.friendships set status = 'removed' where addressee_id = %L $q$, pg_temp.id('b')), false), 'OK:1',
  '[F2.4-a c8 FR-REL-001] A (the requester) removes: 1 row (checked, rolled back)');
select is(pg_temp.dml('b', format($q$ update nestly.friendships set status = 'removed' where requester_id = %L $q$, pg_temp.id('a'))), 'OK:1',
  '[F2.4-a c8 FR-REL-001] B (the addressee) removes: 1 row');
select is(pg_temp.rows('a', 'b'), 'a>b:removed', '[F2.4-a c8] the row is removed');
select is(tests.fx_fr_clock(tests.fx_fr_find(pg_temp.id('a'), pg_temp.id('b'))), 'resp=t canc=f rem=t', '[F2.4-a c8] the removal time is set');
select is(pg_temp.ins('a', 'b', false), 'OK:1', '[F2.4-a c8] A may send a new request after the removal');
select is(pg_temp.ins('b', 'a', false), 'OK:1', '[F2.4-a c8] B may send a new request after the removal');

-- =====================================================================================================================
-- c9 -- the columns that never change, DELETE, and every move outside the allowed ones
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select is(pg_temp.dml('a', format($q$ update nestly.friendships set %s $q$, t.set_clause)), 'ERR:42501',
  '[F2.4-a c9 rule 11] as the requester, UPDATE of ' || t.label || ' is refused')
  from (values ('requester_id = addressee_id', 'requester_id'), ('addressee_id = requester_id', 'addressee_id'),
               ('created_at = now() - interval ''1 day''', 'created_at'), ('requested_at = now() - interval ''1 day''', 'the request time'),
               ('id = gen_random_uuid()', 'id')) t(set_clause, label);
select is(pg_temp.dml('b', format($q$ update nestly.friendships set %s $q$, t.set_clause)), 'ERR:42501',
  '[F2.4-a c9 rule 11] as the addressee, UPDATE of ' || t.label || ' is refused')
  from (values ('requester_id = addressee_id', 'requester_id'), ('addressee_id = requester_id', 'addressee_id'),
               ('created_at = now() - interval ''1 day''', 'created_at'), ('requested_at = now() - interval ''1 day''', 'the request time')) t(set_clause, label);
select is(pg_temp.rows('a', 'b'), 'a>b:pending', '[F2.4-a c9] nothing changed');
select is(pg_temp.dml('a', 'delete from nestly.friendships'), 'ERR:42501', '[F2.4-a c9 I9] the requester cannot DELETE');
select is(pg_temp.dml('b', 'delete from nestly.friendships'), 'ERR:42501', '[F2.4-a c9 I9] the addressee cannot DELETE');
select is(tests.fx_fr_count(), 1::bigint, '[F2.4-a c9] the row is still there');

-- Every move that is not pending->accepted|declined (addressee), pending->cancelled (requester), accepted->removed (either), run
-- by each person who could try it: refused, and the row is exactly as it was. start = status[+c]; who = requester a, addressee b, other c.
create function pg_temp.try(p_status text, p_cancelled boolean, p_who text, p_set text) returns text language plpgsql as $f$
declare
  v_before text;
  v_res text;
  v_after text;
begin
  perform pg_temp.reset();
  perform tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), p_status, p_cancelled);
  v_before := pg_temp.rows('a', 'b');
  v_res := pg_temp.dml(p_who, format($q$ update nestly.friendships set %s $q$, p_set));
  v_after := pg_temp.rows('a', 'b');
  if pg_temp.refused(v_res) and v_after = v_before then return 'refused'; end if;
  return v_res || ' ' || v_before || ' -> ' || v_after;
end
$f$;
select is(pg_temp.try(t.st, t.cx, t.who, t.set_clause), 'refused',
  '[F2.4-a c9 rule 11] ' || t.st || case when t.cx then '+cancelled' else '' end || ' row, ' || t.who || ': ' || t.set_clause || ' is refused')
  from (values
    ('pending',  false, 'status = ''removed''', 'a'), ('pending',  false, 'status = ''removed''', 'b'),
    ('pending',  false, 'status = ''accepted''', 'a'), ('pending',  false, 'status = ''declined''', 'a'),
    ('pending',  false, 'cancelled_at = now()', 'b'), ('pending',  false, 'status = ''accepted'', cancelled_at = now()', 'b'),
    ('pending',  true,  'status = ''accepted''', 'b'), ('pending',  true,  'status = ''declined''', 'b'),
    ('declined', false, 'status = ''accepted''', 'b'), ('declined', false, 'status = ''accepted''', 'a'),
    ('declined', false, 'status = ''removed''', 'a'),  ('declined', false, 'status = ''removed''', 'b'),
    ('declined', true,  'status = ''accepted''', 'b'), ('declined', true,  'status = ''removed''', 'a'),
    ('accepted', false, 'status = ''pending''', 'a'),  ('accepted', false, 'status = ''pending''', 'b'),
    ('accepted', false, 'status = ''declined''', 'a'), ('accepted', false, 'status = ''declined''', 'b'),
    ('accepted', false, 'cancelled_at = now()', 'a'),  ('accepted', false, 'cancelled_at = now()', 'b'),
    ('accepted', false, 'status = ''removed'', cancelled_at = now()', 'a'),
    ('removed',  false, 'status = ''accepted''', 'a'),  ('removed',  false, 'status = ''accepted''', 'b'),
    ('removed',  false, 'status = ''pending''', 'a'),   ('removed',  false, 'status = ''pending''', 'b'),
    ('removed',  false, 'status = ''declined''', 'b'),  ('removed',  false, 'cancelled_at = now()', 'a')
  ) t(st, cx, set_clause, who);
-- the same, as an outsider
select is(pg_temp.try(t.st, t.cx, 'c', t.set_clause), 'refused',
  '[F2.4-a c9 c5 c6 c7 c8] C, who is no party, on a ' || t.st || case when t.cx then '+cancelled' else '' end || ' row: ' || t.set_clause || ' is refused')
  from (values ('pending', false, 'status = ''accepted'''), ('pending', false, 'status = ''declined'''), ('pending', false, 'cancelled_at = now()'),
               ('accepted', false, 'status = ''removed'''), ('declined', false, 'status = ''accepted''')) t(st, cx, set_clause);
-- and the legal ones really are allowed, so the matrix above is not refusing everything
select is(pg_temp.try('pending', false, 'b', 'status = ''accepted'''), 'OK:1 a>b:pending -> a>b:accepted', '[F2.4-a c9 c5] control: the addressee''s accept of a pending request works');
select is(pg_temp.try('pending', false, 'a', 'cancelled_at = now()'), 'OK:1 a>b:pending -> a>b:pending+c', '[F2.4-a c9 c7] control: the requester''s cancel of a pending request works');

-- =====================================================================================================================
-- c10 -- stopped accounts
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'pending');          -- A's sent request to C
select tests.fx_fr_add(pg_temp.id('b'), pg_temp.id('a'), 'pending');          -- B's request to A
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('b'), 'accepted');         -- C and B are Friends
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.seen('a'), '0', '[F2.4-a c10 A9 rule 15] A suspended: SELECT sees 0 rows');
select is(pg_temp.ins('a', 'p'), 'ERR:42501', '[F2.4-a c10 A9] A suspended: INSERT is refused by policy (even toward a valid target)');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('b'))), 'ERR:42501', '[F2.4-a c10 A9] A suspended: INSERT toward B is refused');
select is(pg_temp.dml('a', format($q$ update nestly.friendships set status = 'accepted' where requester_id = %L $q$, pg_temp.id('b'))), 'OK:0',
  '[F2.4-a c10 A9] A suspended: accepting B''s request changes 0 rows');
select is(pg_temp.dml('a', format($q$ update nestly.friendships set cancelled_at = now() where addressee_id = %L $q$, pg_temp.id('c'))), 'OK:0',
  '[F2.4-a c10 A9] A suspended: cancelling its own request changes 0 rows');
select is(pg_temp.rows('a', 'c') || '|' || pg_temp.rows('a', 'b'), 'a>b:pending|b>a:pending', '[F2.4-a c10] and nothing changed (row count and states)');
select is(pg_temp.seen('c'), '1', '[F2.4-a c10 DR-5] C sees its Friendship with B but not the request from suspended A (hidden counterparty)');
select is(pg_temp.seen('b'), '1', '[F2.4-a c10 DR-5] B sees only its Friendship with C: the request to the suspended A is hidden');
select tests.set_status(pg_temp.id('a'), 'banned');
select is(pg_temp.seen('a'), '0', '[F2.4-a c10 A9] A banned: SELECT sees 0 rows');
select is(pg_temp.ins('a', 'b'), 'ERR:42501', '[F2.4-a c10 A9] A banned: INSERT is refused');
select is(pg_temp.dml('a', format($q$ update nestly.friendships set status = 'accepted' where requester_id = %L $q$, pg_temp.id('b'))), 'OK:0',
  '[F2.4-a c10 A9] A banned: accepting changes 0 rows');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.seen('a') || pg_temp.seen('b') || pg_temp.seen('c'), '222', '[F2.4-a c10 DR-5] A active again: its rows are back, kept (each of A, B, C sees 2 rows)');

-- the other party is not active
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.seen('a'), '1', '[F2.4-a c10 DR-5] B suspended: A no longer sees the pending request to B (only its Friendship with C)');
select is(pg_temp.dml('b', format($q$ update nestly.friendships set status = 'accepted' where requester_id = %L $q$, pg_temp.id('a'))), 'OK:0',
  '[F2.4-a c10 A9] B suspended cannot accept');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.dml('b', format($q$ update nestly.friendships set status = 'accepted' where requester_id = %L $q$, pg_temp.id('a'))), 'OK:1',
  '[F2.4-a c10 DR-5] B active again: the kept request is there and can be accepted');
select tests.set_status(pg_temp.id('c'), 'banned');
select is(pg_temp.seen('a'), '1', '[F2.4-a c10 DR-5] C banned: A no longer sees its Friendship with C (only the one with B)');
select is(pg_temp.rows('a', 'c'), 'a>c:accepted', '[F2.4-a c10 DR-5] the row with C is kept');
select tests.set_status(pg_temp.id('c'), 'active');
select is(pg_temp.seen('a'), '2', '[F2.4-a c10 DR-5] C reactivated: A sees the Friendship with C again');

-- Professional, Moderator, Admin as actors; anon
select pg_temp.reset();
select like(pg_temp.dml(t.w, format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('a'))), 'ERR:%',
  '[F2.4-a c10 A7 BR-034] ' || t.label || ' as actor: INSERT is refused')
  from (values ('p', 'P'), ('m', 'M'), ('d', 'D')) t(w, label);
select is(tests.fx_fr_count(), 0::bigint, '[F2.4-a c10] and no row exists');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select is(pg_temp.dml(t.w, $q$ update nestly.friendships set status = 'accepted' $q$), 'OK:0',
  '[F2.4-a c10 A7] ' || t.label || ' as actor: UPDATE changes 0 rows')
  from (values ('p', 'P'), ('m', 'M'), ('d', 'D')) t(w, label);
select is(pg_temp.seen('p') || pg_temp.seen('m') || pg_temp.seen('d'), '000', '[F2.4-a c10 A7] P, M, D see no friendship row');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('a')), 'select 1 from nestly.friendships'), 'ERR:42501', '[F2.4-a c10 rule 3] anon cannot read friendships');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('a')), format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('b'))), 'ERR:42501',
  '[F2.4-a c10 rule 3] anon cannot insert');
select is(tests.dml_as('authenticated', tests.claims(null), 'select 1 from nestly.friendships'), 'OK:0', '[F2.4-a c10 A9] authenticated with no identity sees no row');
select like(tests.dml_as('authenticated', tests.claims(null), format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('b'))), 'ERR:%',
  '[F2.4-a c10 A9] authenticated with no identity cannot insert');

-- =====================================================================================================================
-- Nothing leaked
-- =====================================================================================================================
select pg_temp.reset();
select is(tests.fx_fr_count(), 0::bigint, '[F2.4-a fixture] the file ends with no friendship row of its own');

select * from finish();

rollback;
