-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 rest PR-A: sharing a post, F3.5).
-- Source of expected values: .work/i3-rest-schema/schema.md (SQLSTATE contract) and .work/share-in-feed/spec.md (c3, c5, c6, c8), not the migration text.
-- Codes: 42501 the caller is not an active Regular account; NS002 every refusal of an original (own post included); NS005 an edit of a share's
-- audience, body or stage tag; 23514 the body cap.
-- People: A, B (strangers), C = friend of A (built below), S, X = suspended, banned, P = Professional.
-- Everything rolls back with the transaction. 'ERR:<sqlstate>' or 'OK:<rows>' is the result of a statement run as a user.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.5 fixture] session_user is app_server (this file must not run under another login)');

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
create function pg_temp.fn(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon)
$f$;
create function pg_temp.share_sql(p_orig uuid, p_text text default 'my words') returns text language sql as $f$
  select format($q$ insert into nestly.posts (audience, shared_post_id, body) values ('everyone', %L, %L) $q$, p_orig, p_text)
$f$;
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

select is(tests.fx_po_count() + tests.fx_pa_count() + tests.fx_ph_count(), 0::bigint, '[F3.5 fixture] no feed row exists before the file starts');

-- =====================================================================================================================
-- c5 -- every refusal of an original is NS002, and nothing is written
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);

select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid), false), 'OK:1', '[F3.5 c5] control: a stranger shares an everyone post of an active author');
select is(pg_temp.dml('a', pg_temp.share_sql(current_setting('t.o')::uuid)), 'ERR:NS002', '[F3.5 c5 FR-FEED-006] the author cannot share their own post (NS002)');
select is(pg_temp.dml('a', pg_temp.share_sql(pg_temp.post('a', 'friends'))), 'ERR:NS002', '[F3.5 c5 FR-FEED-006] nor their own friends-only post (NS002)');
select is(pg_temp.dml('a', pg_temp.share_sql(pg_temp.post('a', 'everyone', true))), 'ERR:NS002', '[F3.5 c5 FR-FEED-006] nor their own anonymous post (NS002)');

-- a share cannot be shared, own or another's
select set_config('t.s1', tests.fx_po_add(pg_temp.id('a'), 'everyone', false, 'active', 'a share by A', null, pg_temp.post('c'))::text, true);
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.s1')::uuid)), 'ERR:NS002', '[F3.5 c5 BR-066] another''s share cannot be shared (NS002)');
select is(pg_temp.dml('a', pg_temp.share_sql(current_setting('t.s1')::uuid)), 'ERR:NS002', '[F3.5 c5 BR-066] one''s own share cannot be shared (NS002)');

-- friends-only: a non-Friend and a Friend alike
select set_config('t.fo', pg_temp.post('a', 'friends')::text, true);
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.fo')::uuid)), 'ERR:NS002', '[F3.5 c5 BR-064] a friends-only post is not shareable by a non-Friend (NS002)');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.dml('c', pg_temp.share_sql(current_setting('t.fo')::uuid)), 'ERR:NS002', '[F3.5 c5 BR-064] nor by a Friend who can read it (NS002)');

-- anonymous
select is(pg_temp.dml('b', pg_temp.share_sql(pg_temp.post('a', 'everyone', true))), 'ERR:NS002', '[F3.5 c5 BR-066] an anonymous post is not shareable (NS002)');

-- status of the original
select is(pg_temp.dml('b', pg_temp.share_sql(pg_temp.setst(pg_temp.post('a'), st.s))), 'ERR:NS002', '[F3.5 c5] an original with status ' || st.s || ' is refused (NS002)')
  from (values ('deleted'), ('hidden'), ('removed')) st(s);

-- author status
select set_config('t.o2', pg_temp.post('a')::text, true);
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o2')::uuid)), 'ERR:NS002', '[F3.5 c5] the author is suspended (NS002)');
select tests.set_status(pg_temp.id('a'), 'banned');
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o2')::uuid)), 'ERR:NS002', '[F3.5 c5] the author is banned (NS002)');
select tests.set_status(pg_temp.id('a'), 'active');

-- unknown id: the same code, not a foreign-key error
select is(pg_temp.dml('b', pg_temp.share_sql(gen_random_uuid())), 'ERR:NS002', '[F3.5 c5] an unknown id is NS002, not 23503');

-- hidden or reported by the caller
select set_config('t.o3', pg_temp.post('a')::text, true);
select tests.fx_ph_add(pg_temp.id('b'), current_setting('t.o3')::uuid);
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o3')::uuid)), 'ERR:NS002', '[F3.5 c5 FR-ALG-009] an original the caller hid is refused (NS002)');
select set_config('t.o4', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.o4')::uuid, 'spam');
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o4')::uuid)), 'ERR:NS002', '[F3.5 c5] an original the caller reported is refused (NS002)');


-- an author with a Restricted profile is still shareable
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select tests.fx_restrict(pg_temp.id('a'));
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid), false), 'OK:1', '[F3.5 c5 Afik 18.10] an original by a Restricted author is shareable (OK)');

-- =====================================================================================================================
-- c6 -- the caller must be an active Regular account: 42501, never NS002 or 23503
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select set_config('t.fo', pg_temp.post('a', 'friends')::text, true);
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid)), 'ERR:42501', '[F3.5 c6] a suspended caller, shareable original: 42501');
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.fo')::uuid)), 'ERR:42501', '[F3.5 c6] a suspended caller, unshareable original: 42501 (not NS002)');
select is(pg_temp.dml('b', pg_temp.share_sql(gen_random_uuid())), 'ERR:42501', '[F3.5 c6] a suspended caller, unknown original: 42501 (not NS002, not 23503)');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.dml('p', pg_temp.share_sql(current_setting('t.o')::uuid)), 'ERR:42501', '[F3.5 c6] a Professional, shareable original: 42501');
select is(pg_temp.dml('p', pg_temp.share_sql(current_setting('t.fo')::uuid)), 'ERR:42501', '[F3.5 c6] a Professional, unshareable original: 42501 (not NS002)');
select is(pg_temp.dml('p', pg_temp.share_sql(gen_random_uuid())), 'ERR:42501', '[F3.5 c6] a Professional, unknown original: 42501 (not 23503)');

-- =====================================================================================================================
-- text cap
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid, repeat('x', 2000)), false), 'OK:1', '[F3.5 c3] a share text of 2,000 characters is accepted');
select is(pg_temp.dml('b', pg_temp.share_sql(current_setting('t.o')::uuid, repeat('x', 2001))), 'ERR:23514', '[F3.5 c3] 2,001 characters: 23514 (posts_body_length_check)');

-- =====================================================================================================================
-- c8 -- a share cannot be edited (NS005); status changes still work
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select set_config('t.sh', tests.fx_po_add(pg_temp.id('b'), 'everyone', false, 'active', 'my words', null, current_setting('t.o')::uuid)::text, true);
select set_config('t.st', tests.fx_po_state(current_setting('t.sh')::uuid), true);

select is(pg_temp.dml('b', format($q$ update nestly.posts set body = 'changed' where id = %L $q$, current_setting('t.sh'))), 'ERR:NS005', '[F3.5 c8] editing a share''s body: NS005');
select is(pg_temp.dml('b', format($q$ update nestly.posts set audience = 'friends' where id = %L $q$, current_setting('t.sh'))), 'ERR:NS005', '[F3.5 c8] editing a share''s audience: NS005');
select is(pg_temp.dml('b', format($q$ update nestly.posts set stage_tag = 'planning' where id = %L $q$, current_setting('t.sh'))), 'ERR:NS005', '[F3.5 c8] giving a share a stage tag: NS005');
select is(pg_temp.dml('b', format($q$ update nestly.posts set body = 'changed', audience = 'friends', stage_tag = 'pregnant' where id = %L $q$, current_setting('t.sh'))), 'ERR:NS005', '[F3.5 c8] all three at once: NS005');
select is(tests.fx_po_state(current_setting('t.sh')::uuid), current_setting('t.st'), '[F3.5 c8] the share is unchanged after every refused edit');
select is(pg_temp.dml('b', format($q$ update nestly.posts set body = body, audience = audience, stage_tag = stage_tag where id = %L $q$, current_setting('t.sh'))), 'OK:1', '[F3.5 c8] a no-op update passes');
select is(tests.fx_po_state(current_setting('t.sh')::uuid), current_setting('t.st'), '[F3.5 c8] and changes nothing');

-- an ordinary post is still editable (the guard is for shares only)
select set_config('t.np', pg_temp.post('a')::text, true);
select is(pg_temp.dml('a', format($q$ update nestly.posts set body = 'edited', audience = 'friends', stage_tag = 'planning' where id = %L $q$, current_setting('t.np'))), 'OK:1', '[F3.5 c8] a named post''s body, audience and tag still update');
select is(tests.fx_po_state(current_setting('t.np')::uuid), 'status=active aud=friends anon=f author=' || pg_temp.id('a') || ' tag=planning share=f body=edited', '[F3.5 c8] and the edit took effect');

-- delete of a share (a status change, not an edit)
select is(pg_temp.fn('b', format('select nestly.delete_post(%L)::text', current_setting('t.sh'))), '1', '[F3.5 c8] the author deletes their share (1)');
select set_config('t.sh2', tests.fx_po_add(pg_temp.id('b'), 'everyone', false, 'active', 'second share', null, current_setting('t.o')::uuid)::text, true);
select tests.fx_rp_add(pg_temp.id('c'), 'post', current_setting('t.sh2')::uuid, 'spam');
select is(pg_temp.fn('b', format('select nestly.delete_post(%L)::text', current_setting('t.sh2'))), '1', '[F3.5 c8] deleting a share with an open report also returns 1 (held)');
select ok(tests.fx_po_state(current_setting('t.sh2')::uuid) like 'status=deleted%', '[F3.5 c8] and the reported share is held, status deleted');

select * from finish();
rollback;
