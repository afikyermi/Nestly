-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0a feed-groundwork: what each actor may do to which post).
-- Source of expected values: .work/feed-groundwork/spec.md (c2-c9, c13 post, c16 hides, c19 cleanup order and Gate 2 / re-amend / Afik 18.10
-- lines), not the migration text. Column and table names: schema.md. Structure is file 70, configuration file 72.
-- People: A = 10_'s a (author), B = 10_'s b (a stranger), C = 60_'s fr_c (built below), S, X = suspended, banned, P = Professional.
-- Everything rolls back with the transaction. A refused write is any 'ERR:<sqlstate>' or 'OK:0' with the data unchanged.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-a c1] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 's' then tests.fx_id('s') when 'x' then tests.fx_id('x') when 'c' then tests.fx_fr_id('fr_c')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
-- how many rows of nestly.posts with this id the viewer sees: '1' or '0'
create function pg_temp.sees(p_who text, p_post uuid) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), format('nestly.posts where id = %L', p_post))
$f$;
create function pg_temp.refused(p_res text) returns boolean language sql as $f$ select p_res like 'ERR:%' $f$;
create function pg_temp.setst(p_post uuid, p_status text) returns uuid language plpgsql as $f$
begin
  perform tests.fx_po_status(p_post, p_status);
  return p_post;
end
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  foreach w in array array['a', 'b', 'c'] loop perform tests.set_status(pg_temp.id(w), 'active'); end loop;
end
$f$;
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon)
$f$;
create function pg_temp.share_sql(p_orig uuid, p_text text default 'my words') returns text language sql as $f$
  select format($q$ insert into nestly.posts (audience, shared_post_id, body) values ('everyone', %L, %L) $q$, p_orig, p_text)
$f$;
-- Every value another user can read in any new table, compared with one id: how many cells equal it (c5).
create function pg_temp.leak(p_viewer text, p_needle uuid) returns bigint language plpgsql as $f$
declare
  r record;
  total bigint := 0;
  n text;
begin
  for r in
    select c.relname as t, a.attname as col
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'nestly' and c.relname in ('posts', 'post_authors', 'post_hides', 'algorithm_configurations')
       and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')
  loop
    n := tests.as_role('authenticated', tests.claims(pg_temp.id(p_viewer)),
           format('select count(*)::text from nestly.%I where %I::text = %L', r.t, r.col, p_needle::text));
    if n like 'ERR:%' then return -1; end if;
    total := total + n::bigint;
  end loop;
  return total;
end
$f$;

select is(tests.fx_po_count() + tests.fx_pa_count() + tests.fx_ph_count(), 0::bigint, '[F3.0-a fixture] no feed row exists before the file starts');

-- =====================================================================================================================
-- c2 -- eligibility (FR-FEED-001, BR-065, BR-073, rule 15)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.p1', pg_temp.post('a')::text, true);
select is(pg_temp.sees('b', current_setting('t.p1')::uuid), '1', '[F3.0-a c2] all active: an everyone post is returned to an active viewer');
select is(pg_temp.sees('a', current_setting('t.p1')::uuid), '1', '[F3.0-a c2] and to its active author');

select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.sees('b', current_setting('t.p1')::uuid), '0', '[F3.0-a c2 BR-073] author suspended: 0 rows');
select is(pg_temp.sees('a', current_setting('t.p1')::uuid), '0', '[F3.0-a c2 rule 15] author suspended sees none of their own either');
select tests.set_status(pg_temp.id('a'), 'banned');
select is(pg_temp.sees('b', current_setting('t.p1')::uuid), '0', '[F3.0-a c2 BR-073] author banned: 0 rows');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.sees('b', current_setting('t.p1')::uuid), '1', '[F3.0-a c2] author active again: the post is back');

select is(pg_temp.sees(t.w, current_setting('t.p1')::uuid), '0', '[F3.0-a c2 rule 15] viewer ' || t.label || ': 0 rows')
  from (values ('s', 'suspended'), ('x', 'banned')) t(w, label);
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.sees('b', current_setting('t.p1')::uuid), '0', '[F3.0-a c2 rule 15] a viewer suspended after being active: 0 rows');
select tests.set_status(pg_temp.id('b'), 'active');

select is(pg_temp.sees('b', pg_temp.setst(current_setting('t.p1')::uuid, st.s)), '0', '[F3.0-a c2 BR-065] post status ' || st.s || ': 0 rows')
  from (values ('hidden'), ('removed')) st(s);
select is(pg_temp.sees('a', current_setting('t.p1')::uuid), '0', '[F3.0-a c2] and not even to its author');
select is(pg_temp.sees('b', pg_temp.setst(current_setting('t.p1')::uuid, 'deleted')), '0', '[F3.0-a c2 BR-065] post status deleted: 0 rows (the author in the transaction that held it: file 76)');

-- =====================================================================================================================
-- c3 -- audience (OP-033)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.f1', pg_temp.post('a', 'friends')::text, true);
select set_config('t.e1', pg_temp.post('a', 'everyone')::text, true);
select is(pg_temp.sees('a', current_setting('t.f1')::uuid), '1', '[F3.0-a c3] a friends-only post is returned to its author');
select is(pg_temp.sees('b', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] and not to a stranger');
select is(pg_temp.sees('b', current_setting('t.e1')::uuid), '1', '[F3.0-a c3] an everyone post is returned to any eligible viewer');

select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '1', '[F3.0-a c3] an accepted friend (author requested) reads a friends-only post');
select is(pg_temp.sees('b', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a stranger still does not, with a friendship of A in place');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('a'), 'accepted');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '1', '[F3.0-a c3] an accepted friend (friend requested) reads it too');

select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'pending');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a pending request is not a friend');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'declined');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a declined request is not a friend');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'removed');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a removed friend does not read it');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.set_status(pg_temp.id('c'), 'suspended');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a suspended friend reads nothing');
select tests.set_status(pg_temp.id('c'), 'banned');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a banned friend reads nothing');
select tests.set_status(pg_temp.id('c'), 'active');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '1', '[F3.0-a c3] friend active again: back');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.sees('c', current_setting('t.f1')::uuid), '0', '[F3.0-a c3 BR-073] an active friend of a suspended author reads nothing');
select tests.set_status(pg_temp.id('a'), 'active');

-- a friend of a friend is a stranger
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('b'), 'accepted');
select is(pg_temp.sees('b', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a friend of the author''s friend is not a friend');
select is(pg_temp.sees('b', current_setting('t.e1')::uuid), '1', '[F3.0-a c3] but reads the everyone post');
select is(pg_temp.sees('p', current_setting('t.f1')::uuid), '0', '[F3.0-a c3] a Professional reads no friends-only post');

-- =====================================================================================================================
-- c4 -- anonymous (6א, FR-FEED-005, BR-062, VAL-036)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.n0', tests.fx_po_count()::text, true);
select is(pg_temp.dml('a', $q$ insert into nestly.posts (audience, is_anonymous, body) values ('friends', true, 'x') $q$, false) like 'ERR:%', true,
  '[F3.0-a c4 VAL-036] insert of an anonymous + friends-only post is refused');
select is(tests.fx_po_count(), current_setting('t.n0')::bigint, '[F3.0-a c4] and left no row');
select is(pg_temp.dml('a', $q$ insert into nestly.posts (audience, is_anonymous, body) values ('everyone', true, 'x') $q$, false), 'OK:1',
  '[F3.0-a c4] control: an anonymous everyone post inserts');

select set_config('t.an', pg_temp.post('a', 'everyone', true)::text, true);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.sees('c', current_setting('t.an')::uuid), '1', '[F3.0-a c4] a friend of the author reaches the anonymous post (everyone path)');
select is(pg_temp.sees('b', current_setting('t.an')::uuid), '1', '[F3.0-a c4] a stranger reaches it the same way');
select is(pg_temp.sees('a', current_setting('t.an')::uuid), '1', '[F3.0-a c4] the author reads it too');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.sees('c', current_setting('t.an')::uuid) || pg_temp.sees('b', current_setting('t.an')::uuid), '00',
  '[F3.0-a c4 BR-073] an anonymous post of a suspended author is gone for friend and stranger alike');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.sees('c', current_setting('t.an')::uuid) || pg_temp.sees('b', current_setting('t.an')::uuid), '11', '[F3.0-a c4] and back on reactivation');

select is(pg_temp.dml('a', format($q$ update nestly.posts set audience = 'friends' where id = %L $q$, current_setting('t.an')), false) like 'ERR:%' , true,
  '[F3.0-a c4 c6] an update turning an anonymous post friends-only is refused');
select is(pg_temp.dml('a', format($q$ update nestly.posts set is_anonymous = true where id = %L $q$, current_setting('t.f1')), false) like 'ERR:%', true,
  '[F3.0-a c4] an update making a friends-only post anonymous is refused');
select is(tests.fx_po_state(current_setting('t.f1')::uuid) ~ 'aud=friends anon=f', true, '[F3.0-a c4] the friends-only post is unchanged');
select is(tests.fx_po_state(current_setting('t.an')::uuid) ~ 'aud=everyone anon=t author=null', true, '[F3.0-a c4 c5] the anonymous post is unchanged and holds no author id');

select is(pg_temp.dml('p', $q$ insert into nestly.posts (audience, is_anonymous, body) values ('everyone', true, 'x') $q$) like 'ERR:%', true,
  '[F3.0-a c4 FR-FEED-005] a Professional''s anonymous insert is refused');
select is(pg_temp.dml('p', $q$ insert into nestly.posts (audience, body) values ('everyone', 'x') $q$, false), 'OK:1',
  '[F3.10-a c1 FR-FEED-002] a Professional''s ordinary named everyone insert is accepted (supersedes F3.0-a c4 Gate 2; the rest in file 85)');

-- =====================================================================================================================
-- c5 -- author separation (rule 20, AC-075, S-26)
-- =====================================================================================================================
select pg_temp.reset();
select is(tests.fx_pa_author(current_setting('t.an')::uuid), pg_temp.id('a'), '[F3.0-a c5] control: the separation row holds the real author');
select is(tests.n_as(pg_temp.id('a'), format('nestly.post_authors where post_id = %L', current_setting('t.an'))), '1',
  '[F3.0-a c5] the author store returns the author their own row');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')), format('select author_id::text from nestly.post_authors where post_id = %L', current_setting('t.an'))),
  pg_temp.id('a')::text, '[F3.0-a c5 rule 20] and it is them');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(tests.n_as(pg_temp.id(w), 'nestly.post_authors'), '0', '[F3.0-a c5 S-26] ' || w || ' sees 0 rows of the author store')
  from unnest(array['b', 'c', 'p']) w;
select is(tests.n_as(pg_temp.id('b'), format('nestly.post_authors where post_id = %L', current_setting('t.an'))), '0',
  '[F3.0-a c5] a guessed post id finds nothing for a stranger');
-- D = C, who has only an anonymous post (A's named posts legitimately show A's id)
select tests.fx_po_add(pg_temp.id('c'), 'everyone', true);
select is(pg_temp.leak('b', pg_temp.id('c')), 0::bigint, '[F3.0-a c5 AC-075] no readable cell of any new table, for a stranger, equals the anonymous author''s id');
select is(pg_temp.leak('a', pg_temp.id('c')), 0::bigint, '[F3.0-a c5 AC-075] nor for another user who is a friend');
select is(pg_temp.leak('c', pg_temp.id('c')) > 0, true, '[F3.0-a c5] control: the scan is not blind, the author''s own cells do equal their id');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('b')), 'select 1 from nestly.post_authors'), 'ERR:42501', '[F3.0-a c5] anon cannot read the author store');
select is(tests.dml_as('authenticated', tests.claims(null), 'select 1 from nestly.post_authors'), 'OK:0', '[F3.0-a c5] authenticated without identity reads 0 rows');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.post_authors (post_id) values (%L) $q$, current_setting('t.an')))),
  '[F3.0-a c5] a stranger cannot attach themself as the author of an anonymous post');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.post_authors (post_id) values (%L) $q$, current_setting('t.e1')))),
  '[F3.0-a c5] nor attach a separation row to a named post');
select is(tests.fx_pa_author(current_setting('t.an')::uuid), pg_temp.id('a'), '[F3.0-a c5] the real author is unchanged after the attempts');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.post_authors set author_id = %L $q$, pg_temp.id('b')))),
  '[F3.0-a c5] not even the author can rewrite a separation row (no UPDATE grant)');

-- =====================================================================================================================
-- c6 -- post writes
-- =====================================================================================================================
select pg_temp.reset();
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.posts (author_id, audience, body) values (%L, 'everyone', 'x') $q$, pg_temp.id('a')))),
  '[F3.0-a c6] an insert naming another user as the author is refused');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ insert into nestly.posts (author_id, audience, body) values (%L, 'everyone', 'x') $q$, pg_temp.id('a')))),
  '[F3.0-a c6 rule 12] even naming oneself is refused: the database sets the author');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body, status) values ('everyone', 'x', 'hidden') $q$)),
  '[F3.0-a c6] naming the status on insert is refused');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body, author_status) values ('everyone', 'x', 'active') $q$)),
  '[F3.0-a c6] naming the author-status copy is refused');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (id, audience, body) values (gen_random_uuid(), 'everyone', 'x') $q$)),
  '[F3.0-a c6] naming the id is refused');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body, created_at) values ('everyone', 'x', now() - interval '1 year') $q$)),
  '[F3.0-a c6] naming the clock is refused');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body) values ('nobody', 'x') $q$)),
  '[F3.0-a c6] an audience outside everyone / friends is refused');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (body) values ('x') $q$)), '[F3.0-a c6 OP-033] an audience must be chosen');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (audience) values ('everyone') $q$)),
  '[F3.0-a c6 schema.md] a post with neither text nor a share is refused');
select ok(pg_temp.refused(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body) values ('everyone', '   ') $q$)),
  '[F3.0-a c6 schema.md] a blank text is refused');
select is(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body) values ('everyone', 'x') $q$, false), 'OK:1', '[F3.0-a c6] control: a plain insert works');

select set_config('t.w', pg_temp.post('a', 'friends')::text, true);
select set_config('t.w_before', tests.fx_po_state(current_setting('t.w')::uuid), true);
select is(pg_temp.dml('b', format($q$ update nestly.posts set body = 'hacked' where id = %L $q$, current_setting('t.e1'))), 'OK:0', '[F3.0-a c6] a non-author''s update changes 0 rows');
select is(pg_temp.dml('b', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.e1'))), 'OK:0', '[F3.0-a c6] a non-author''s delete changes 0 rows');
select is(pg_temp.dml('b', format($q$ update nestly.posts set body = 'hacked' where id = %L $q$, current_setting('t.an'))), 'OK:0', '[F3.0-a c6 c5] nor an anonymous post''s');
select is(pg_temp.dml('b', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.an'))), 'OK:0', '[F3.0-a c6 c5] nor deletes it');
select ok(tests.fx_po_state(current_setting('t.e1')::uuid) !~ 'hacked', '[F3.0-a c6] and the text is unchanged');
select is(tests.fx_po_state(current_setting('t.w')::uuid), current_setting('t.w_before'), '[F3.0-a c6] the author''s post is unchanged by strangers');

select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.posts set status = %L where id = %L $q$, st.s, current_setting('t.e1')))),
  '[F3.0-a c6 BR-073] the author cannot set status ' || st.s)
  from (values ('hidden'), ('removed')) st(s);
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.posts set author_id = %L where id = %L $q$, pg_temp.id('b'), current_setting('t.e1')))),
  '[F3.0-a c6] nor change the author');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.posts set is_anonymous = true where id = %L $q$, current_setting('t.e1')))),
  '[F3.0-a c6 Gate 2] nor make a named post anonymous (immutable after insert)');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.posts set shared_post_id = %L where id = %L $q$, current_setting('t.e1'), current_setting('t.f1')))),
  '[F3.0-a c6] nor turn a post into a share');
select is(pg_temp.dml('a', format($q$ update nestly.posts set audience = 'everyone' where id = %L $q$, current_setting('t.w')), false), 'OK:1', '[F3.0-a c6] control: the author edits the audience of a named post');
select is(pg_temp.dml('a', format($q$ update nestly.posts set audience = 'friends' where id = %L $q$, current_setting('t.e1')), false), 'OK:1', '[F3.0-a c6] control: everyone to friends-only on a named post');
select is(pg_temp.dml('a', format($q$ update nestly.posts set body = 'edited' where id = %L $q$, current_setting('t.an')), false), 'OK:1',
  '[F3.0-a c6] control: the real author edits their anonymous post''s text');
select ok(pg_temp.refused(pg_temp.dml('a', format($q$ update nestly.posts set audience = 'friends' where id = %L $q$, current_setting('t.an')))),
  '[F3.0-a c6 c4] but cannot edit its audience into anonymous + friends-only');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.an')), false), 'OK:1', '[F3.0-a c6] control: the real author deletes their anonymous post');

select tests.fx_po_status(current_setting('t.w')::uuid, 'hidden');
select is(pg_temp.dml('a', format($q$ update nestly.posts set body = 'x' where id = %L $q$, current_setting('t.w'))), 'OK:0', '[F3.0-a c6] a hidden post cannot be edited back to life by its author');
select tests.fx_po_status(current_setting('t.w')::uuid, 'active');

select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body) values ('everyone', 'x') $q$), 'ERR:42501', '[F3.0-a c6 rule 15] a suspended author cannot post');
select is(pg_temp.dml('a', format($q$ update nestly.posts set body = 'x' where id = %L $q$, current_setting('t.e1'))), 'OK:0', '[F3.0-a c6 rule 15] nor edit');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.e1'))), 'OK:0', '[F3.0-a c6 rule 15] nor delete');
select tests.set_status(pg_temp.id('a'), 'banned');
select is(pg_temp.dml('a', $q$ insert into nestly.posts (audience, body) values ('everyone', 'x') $q$), 'ERR:42501', '[F3.0-a c6 rule 15] a banned author cannot post');
select tests.set_status(pg_temp.id('a'), 'active');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('a')), $q$ insert into nestly.posts (audience, body) values ('everyone', 'x') $q$), 'ERR:42501', '[F3.0-a c6 rule 3] anon cannot post');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('a')), 'select 1 from nestly.posts'), 'ERR:42501', '[F3.0-a c6 rule 3] anon cannot read posts');
select ok(pg_temp.refused(tests.dml_as('authenticated', tests.claims(null), $q$ insert into nestly.posts (audience, body) values ('everyone', 'x') $q$)),
  '[F3.0-a c6] authenticated with no identity cannot post');
select ok(pg_temp.refused(tests.dml_as('app_server', tests.claims(pg_temp.id('a')), $q$ insert into nestly.posts (audience, body) values ('everyone', 'x') $q$)),
  '[F3.0-a c1 rule 2] app_server as itself cannot write posts');
-- very long text is not a crash: since F3.1-a c6 (carried by F3.0b) it is refused cleanly by the 2,000-character cap
select is(pg_temp.dml('a', format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, repeat('x', 100000)), false), 'ERR:23514',  '[F3.0-a c6][F3.1-a c6] a very long text is refused with 23514, not a crash: the 2,000-character cap');
select is(pg_temp.dml('a', format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) $q$, $b$'; drop table nestly.posts; -- <script>$b$), false), 'OK:1',
  '[F3.0-a c6] hostile text is stored as text');

-- =====================================================================================================================
-- c7 -- tag (5א)
-- =====================================================================================================================
select pg_temp.reset();
-- B already has a planning/pregnant journey (10_/50_ fixtures); nothing in F3.0a may read it
select is(pg_temp.dml('b', $q$ insert into nestly.posts (audience, body) values ('everyone', 'no tag') $q$), 'OK:1', '[F3.0-a c7] a post inserts with no tag');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('b')), $q$ select coalesce(stage_tag, 'null') from nestly.posts where body = 'no tag' $q$), 'null',
  '[F3.0-a c7 5א] the tag is null, though the author has a pregnancy profile (nothing reads journey_contexts)');
select is(pg_temp.dml('b', format($q$ insert into nestly.posts (audience, body, stage_tag) values ('everyone', 'x', %L) $q$, t.v), false), 'OK:1',
  '[F3.0-a c7] the tag ' || t.v || ' is accepted')
  from (values ('planning'), ('pregnant'), ('has_child')) t(v);
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.posts (audience, body, stage_tag) values ('everyone', 'x', %L) $q$, t.v))),
  '[F3.0-a c7] the tag "' || left(t.v, 20) || '" is refused')
  from (values ('Pregnant'), (''), ('baby'), ('topic'), ('my name is Dana from Haifa'), (repeat('p', 5000)), (' planning')) t(v);
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ update nestly.posts set stage_tag = 'sports' where body = 'no tag' $q$))), '[F3.0-a c7] an update to an unknown tag is refused');
select is(pg_temp.dml('b', $q$ update nestly.posts set stage_tag = 'has_child' where body = 'no tag' $q$, false), 'OK:1', '[F3.0-a c7] control: an update to a listed tag works');
select is(pg_temp.dml('b', $q$ update nestly.posts set stage_tag = null where body = 'no tag' $q$, false), 'OK:1', '[F3.0-a c7] and the tag can be cleared');

-- =====================================================================================================================
-- c8 -- share (2א, BR-064/066, VAL-038), re-amended: no restricted-author clause
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a', 'everyone')::text, true);
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid), false), 'OK:1', '[F3.0-a c8] a valid share of an active everyone post inserts');
select is(pg_temp.dml('b', format($q$ insert into nestly.posts (audience, shared_post_id) values ('everyone', %L) $q$, current_setting('t.o')), false), 'OK:1',
  '[F3.0-a c8] the sharer''s text is optional');
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid)), 'OK:1', '[F3.0-a c8] (kept) a share by B');
select set_config('t.s1', tests.as_role('authenticated', tests.claims(pg_temp.id('b')), $q$ select id::text from nestly.posts where shared_post_id is not null limit 1 $q$), true);
select is(tests.fx_po_state(current_setting('t.s1')::uuid), 'status=active aud=everyone anon=f author=' || pg_temp.id('b') || ' tag=null share=t:' || current_setting('t.o') || ' body=my words',
  '[F3.0-a c8] the share stores the original id and the sharer text, authored by the sharer, with no original content');
select ok(tests.fx_po_state(current_setting('t.s1')::uuid) !~ 'post body', '[F3.0-a c8] nothing of the original''s text is copied');

select set_config('t.fo', pg_temp.post('a', 'friends')::text, true);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select ok(pg_temp.refused(pg_temp.dml('c', pg_temp.share_sql(current_setting('t.fo')::uuid))), '[F3.0-a c8 BR-064] a friends-only original cannot be shared, even by a friend who reads it');
select ok(pg_temp.refused(pg_temp.dml('a', pg_temp.share_sql(current_setting('t.fo')::uuid))), '[F3.0-a c8 BR-064] nor by its own author');
select set_config('t.an2', pg_temp.post('a', 'everyone', true)::text, true);
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.an2')::uuid))), '[F3.0-a c8 BR-064] an anonymous original cannot be shared');
select ok(pg_temp.refused(pg_temp.dml('a', pg_temp.share_sql(current_setting('t.an2')::uuid))), '[F3.0-a c8 BR-064] not even by its real author');
select ok(pg_temp.refused(pg_temp.dml('c', pg_temp.share_sql(current_setting('t.s1')::uuid))), '[F3.0-a c8 BR-066] a share cannot itself be shared');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.posts (audience, shared_post_id, body, is_anonymous) values ('everyone', %L, 'x', true) $q$, current_setting('t.o')))),
  '[F3.0-a c8 BR-066] a share cannot be anonymous');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.share_sql(pg_temp.setst(current_setting('t.o')::uuid, st.s)))), '[F3.0-a c8 VAL-038] an original with status ' || st.s || ' cannot be shared')
  from (values ('hidden'), ('removed'), ('deleted')) st(s);
select tests.fx_po_status(current_setting('t.o')::uuid, 'active');
select tests.set_status(pg_temp.id('a'), 'suspended');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid))), '[F3.0-a c8 BR-073] an original of a suspended author is unreadable to the sharer: refused');
select tests.set_status(pg_temp.id('a'), 'active');
select set_config('t.o2', pg_temp.post('a')::text, true);
select tests.fx_ph_add(pg_temp.id('c'), current_setting('t.o2')::uuid);
select ok(pg_temp.refused(pg_temp.dml('c', pg_temp.share_sql(current_setting('t.o2')::uuid))), '[F3.0-a c8 7א] an original the sharer hid is unreadable to them: refused');
select is(pg_temp.dml('c', 'delete from nestly.post_hides'), 'OK:1', '[F3.0-a c8 fixture] C un-hides (leaves no hide behind)');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.share_sql(gen_random_uuid()))), '[F3.0-a c8] a random id is not an original');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.posts (audience, shared_post_id, body) values ('everyone', null, null) $q$))), '[F3.0-a c8] a share without an original is not a post');
select ok(pg_temp.refused(pg_temp.dml('p', pg_temp.share_sql(current_setting('t.o')::uuid))), '[F3.0-a c8] a Professional cannot share (Regular-only in I3)');
select tests.set_status(pg_temp.id('b'), 'suspended');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid))), '[F3.0-a c8 rule 15] a suspended sharer cannot share');
select tests.set_status(pg_temp.id('b'), 'active');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ update nestly.posts set shared_post_id = %L where id = %L $q$, current_setting('t.fo'), current_setting('t.s1')))),
  '[F3.0-a c8] a share''s original cannot be re-pointed to a friends-only post');
select tests.fx_restrict(pg_temp.id('a'));
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid), false), 'OK:1', '[F3.0-a c8 Afik 18.10] an original by a restricted author can be shared');
select is(pg_temp.sees('b', current_setting('t.o')::uuid) || pg_temp.sees('c', current_setting('t.o')::uuid), '11', '[F3.0-a c2 Afik 18.10] and a restricted author''s everyone post is eligible like an open author''s');
select tests.fx_restrict(pg_temp.id('b'));
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid), false), 'OK:1', '[F3.0-a c8 Afik 18.10] a restricted sharer shares as well (the clause is gone)');

-- =====================================================================================================================
-- c9 -- share view (BR-065, ERR-033)
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.sees('c', current_setting('t.s1')::uuid) || pg_temp.sees('c', current_setting('t.o')::uuid), '11', '[F3.0-a c9] control: a viewer reads the share and its original');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.sees('c', current_setting('t.s1')::uuid), '1', '[F3.0-a c9 ERR-033] original''s author suspended: the share row is still returned');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('c')), format('select body from nestly.posts where id = %L', current_setting('t.s1'))), 'my words',
  '[F3.0-a c9] with its text');
select is(pg_temp.sees('c', current_setting('t.o')::uuid), '0', '[F3.0-a c9] and 0 rows for the original');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.sees('c', current_setting('t.o')::uuid), '1', '[F3.0-a c9] original eligible again: returned');
select tests.fx_po_status(current_setting('t.o')::uuid, 'hidden');
select is(pg_temp.sees('c', current_setting('t.s1')::uuid) || pg_temp.sees('c', current_setting('t.o')::uuid), '10', '[F3.0-a c9] original hidden: share 1, original 0');
select tests.fx_po_status(current_setting('t.o')::uuid, 'active');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.o'))), 'OK:1', '[F3.0-a c9 c13] the author deletes the original');
select is(pg_temp.sees('c', current_setting('t.s1')::uuid) || pg_temp.sees('c', current_setting('t.o')::uuid), '10', '[F3.0-a c9] original deleted: the share remains, the original is 0');
select is(tests.fx_po_state(current_setting('t.s1')::uuid) ~ 'share=t:null body=my words', true, '[F3.0-a c9] and the row still says it was a share, with its own text');

-- =====================================================================================================================
-- c13 (post) -- deletion removes the row and what hangs on it; shares stay
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.d', pg_temp.post('a', 'everyone')::text, true);
select set_config('t.da', pg_temp.post('a', 'everyone', true)::text, true);
select tests.fx_ph_add(pg_temp.id('b'), current_setting('t.d')::uuid);
select tests.fx_ph_add(pg_temp.id('c'), current_setting('t.d')::uuid);
select tests.fx_ph_add(pg_temp.id('b'), current_setting('t.da')::uuid);
select set_config('t.dshare', tests.fx_po_add(pg_temp.id('b'), 'everyone', false, 'active', 'sharer text', null, current_setting('t.d')::uuid)::text, true);
select is(tests.fx_ph_count(), 3::bigint, '[F3.0-a c13 fixture] three hide rows before the delete');
select is(pg_temp.dml('b', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.d'))), 'OK:0', '[F3.0-a c13] a non-author deletes nothing');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.d'))), 'OK:1', '[F3.0-a c13 3א] the author''s delete removes the row');
select is(tests.fx_po_state(current_setting('t.d')::uuid), null, '[F3.0-a c13] nothing of it remains');
select is(tests.fx_ph_count(), 1::bigint, '[F3.0-a c13] and the hides on it went with it (only the hide on the other post is left)');
select ok(tests.fx_po_state(current_setting('t.dshare')::uuid) ~ 'share=t:null', '[F3.0-a c13 9] the share of the deleted post remains');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.d'))), 'OK:0', '[F3.0-a c13] deleting again changes 0 rows (already done)');
select is(tests.fx_pa_author(current_setting('t.da')::uuid), pg_temp.id('a'), '[F3.0-a c13] control: the anonymous post still has its separation row');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.da'))), 'OK:1', '[F3.0-a c13] the real author deletes their anonymous post');
select is(tests.fx_pa_author(current_setting('t.da')::uuid), null, '[F3.0-a c13 rule 20] and its separation row is gone');
select is(tests.fx_ph_count(), 0::bigint, '[F3.0-a c13] and its hides');

-- =====================================================================================================================
-- c16 -- hides (7א, 8א)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.h', pg_temp.post('a', 'everyone')::text, true);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.dml('b', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.h'))), 'OK:1', '[F3.0-a c16] B hides a post');
select is(pg_temp.sees('b', current_setting('t.h')::uuid), '0', '[F3.0-a c16] it is returned to B 0 times');
select is(pg_temp.sees('c', current_setting('t.h')::uuid) || pg_temp.sees('a', current_setting('t.h')::uuid), '11', '[F3.0-a c16] and still to other eligible viewers, and the author');
select is(tests.n_as(pg_temp.id('b'), 'nestly.post_hides'), '1', '[F3.0-a c16] B reads their hide');
select is(tests.n_as(pg_temp.id('c'), 'nestly.post_hides') || tests.n_as(pg_temp.id('a'), 'nestly.post_hides'), '00', '[F3.0-a c16 AC-075] nobody else reads it, not even the post''s author');
select is(pg_temp.dml('c', 'delete from nestly.post_hides'), 'OK:0', '[F3.0-a c16] another user deletes 0 of B''s hides');
select ok(pg_temp.refused(pg_temp.dml('c', format($q$ insert into nestly.post_hides (user_id, post_id) values (%L, %L) $q$, pg_temp.id('b'), current_setting('t.h')))),
  '[F3.0-a c16] and cannot write a hide in B''s name');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.h')))), '[F3.0-a c16] a second hide of the same post is refused');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ update nestly.post_hides set user_id = %L $q$, pg_temp.id('c')))), '[F3.0-a c16] a hide cannot be updated (no grant)');
select is(pg_temp.dml('b', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, gen_random_uuid())), 'ERR:NS004', '[F3.9 S1 · F3.0-a c16] a hide of a random id is refused with NS004 (no FK oracle)');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(tests.n_as(pg_temp.id('b'), 'nestly.post_hides'), '0', '[F3.0-a c16 rule 15] a suspended user reads no hide');
select is(pg_temp.dml('b', 'delete from nestly.post_hides'), 'OK:0', '[F3.0-a c16 rule 15] nor delete one');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.dml('b', format($q$ delete from nestly.post_hides where post_id = %L $q$, current_setting('t.h'))), 'OK:1', '[F3.0-a c16] B deletes their own hide');
select is(pg_temp.sees('b', current_setting('t.h')::uuid), '1', '[F3.0-a c16] the post returns to B');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('b')), 'select 1 from nestly.post_hides'), 'ERR:42501', '[F3.0-a c16 rule 3] anon reads no hides');
-- double submit: both orders end with exactly one row
select pg_temp.dml('b', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.h')));
select is(pg_temp.dml('b', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.h'))), 'ERR:23505', '[F3.0-a c16] a double submit is a unique violation, one row');
select is(tests.fx_ph_count(), 1::bigint, '[F3.0-a c16] one hide row');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.h'))), 'OK:1', '[F3.0-a c16 c13] deleting the hidden post takes the hide with it');
select is(tests.fx_ph_count(), 0::bigint, '[F3.0-a c16 c13] no orphan hide');
-- own post: a hide of one's own post is refused (findings 1, ORCHESTRATOR); named: author = caller; anonymous: caller holds its post_authors row
select pg_temp.reset();
select set_config('t.o1', pg_temp.post('a', 'everyone')::text, true);
select set_config('t.o2', pg_temp.post('a', 'everyone', true)::text, true);
select is(pg_temp.dml('a', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.o1'))), 'ERR:NS003', '[F3.9 S3 · F3.0-a c16] the author cannot hide their own named post (NS003)');
select is(pg_temp.dml('a', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.o2'))), 'ERR:NS003', '[F3.9 S3 · F3.0-a c16] the author cannot hide their own anonymous post (NS003)');
select is(tests.fx_ph_count(), 0::bigint, '[F3.0-a c16] and no hide row exists after either refusal');
select is(pg_temp.sees('a', current_setting('t.o1')::uuid) || pg_temp.sees('a', current_setting('t.o2')::uuid), '11', '[F3.0-a c16] the author still sees both posts');
select is(pg_temp.dml('a', format($q$ update nestly.posts set body = 'edited' where id = %L $q$, current_setting('t.o1'))), 'OK:1', '[F3.0-a c16] the author can still update own post afterwards');
select is(pg_temp.dml('a', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.o1'))), 'OK:1', '[F3.0-a c16] and delete it');
select is(pg_temp.dml('b', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.o2'))), 'OK:1', '[F3.0-a c16] another user''s hide of the anonymous post still works');
select is(pg_temp.sees('b', current_setting('t.o2')::uuid), '0', '[F3.0-a c16] and hides it from them');


-- =====================================================================================================================
-- c19 -- the Preview cleanup order leaves nothing of a user who owns every F3.0a row kind
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.u_post', tests.fx_po_add(pg_temp.id('c'), 'everyone')::text, true);
select set_config('t.u_anon', tests.fx_po_add(pg_temp.id('c'), 'everyone', true)::text, true);
select set_config('t.b_post', pg_temp.post('b')::text, true);
select set_config('t.u_share', tests.fx_po_add(pg_temp.id('c'), 'everyone', false, 'active', 'c shares', null, current_setting('t.b_post')::uuid)::text, true);
select set_config('t.b_share', tests.fx_po_add(pg_temp.id('b'), 'everyone', false, 'active', 'b shares c', null, current_setting('t.u_post')::uuid)::text, true);
select tests.fx_ph_add(pg_temp.id('c'), current_setting('t.b_post')::uuid);
select tests.fx_ph_add(pg_temp.id('b'), current_setting('t.u_post')::uuid);
select tests.fx_ph_add(pg_temp.id('b'), current_setting('t.u_anon')::uuid);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select set_config('t.n_po', tests.fx_po_count()::text, true), set_config('t.n_pa', tests.fx_pa_count()::text, true), set_config('t.n_ph', tests.fx_ph_count()::text, true);
select lives_ok(format('select tests.fx_cleanup_user(%L)', pg_temp.id('c')), '[F3.0-a c19 B1] a user owning a post, a share, an anonymous post and a hide is deleted without error');
-- C owned four posts here: the anonymous one of c5, u_post, u_anon, u_share
select is(tests.fx_po_count(), current_setting('t.n_po')::bigint - 4, '[F3.0-a c19] exactly the four posts of the user went');
select is(tests.fx_po_state(current_setting('t.u_post')::uuid), null, '[F3.0-a c19] the user''s post is gone');
select is(tests.fx_po_state(current_setting('t.u_anon')::uuid), null, '[F3.0-a c19] the user''s anonymous post is gone');
select is(tests.fx_po_state(current_setting('t.u_share')::uuid), null, '[F3.0-a c19] the user''s share is gone');
select is(tests.fx_pa_count(), current_setting('t.n_pa')::bigint - 2, '[F3.0-a c19] and the two separation rows');
select is(tests.fx_ph_count(), current_setting('t.n_ph')::bigint - 3, '[F3.0-a c19] every hide on or by the user is gone (one by, two on)');
select ok(tests.fx_po_state(current_setting('t.b_share')::uuid) ~ 'share=t:null', '[F3.0-a c19] another user''s share of the deleted post stays, pointing nowhere');

select * from finish();

rollback;
