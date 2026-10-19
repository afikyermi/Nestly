-- pgTAP, run by pg_prove as app_server (CI `db` job, professional-posting PR-A3: a Professional writes named everyone posts, comments and likes).
-- Source of expected values: .work/professional-posting/spec.md (c1, c7 incl. A&D R5), schema.md (Gate 2: pgTAP list, SQLSTATE contract) and
-- algorithm-review.md, not the migration text.
-- People: A, B (Regular strangers), C = 60_'s fr_c (Regular, built below), S, X = suspended, banned Regulars, P = Professional,
-- M = Moderator, D = Admin (60_'s fr_m, fr_d).
-- Everything rolls back with the transaction. A refused write is 'ERR:<sqlstate>' (or 'OK:0' for a row the caller cannot touch) with the data unchanged.
-- Not here (CI, not pgTAP): the down/up catalog fingerprint and the down script's refusal while a Professional row exists (schema.md pgTAP 11).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[FR-FEED-002 professional-posting fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 's' then tests.fx_id('s') when 'x' then tests.fx_id('x') when 'c' then tests.fx_fr_id('fr_c')
    when 'm' then tests.fx_fr_id('fr_m') when 'd' then tests.fx_fr_id('fr_d')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.fn(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
create function pg_temp.refused(p_res text) returns boolean language sql as $f$ select p_res like 'ERR:%' or p_res = 'OK:0' $f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  foreach w in array array['a', 'b', 'c', 'p'] loop perform tests.set_status(pg_temp.id(w), 'active'); end loop;
end
$f$;
create function pg_temp.setst(p_post uuid, p_status text) returns uuid language plpgsql as $f$
begin
  perform tests.fx_po_status(p_post, p_status);
  return p_post;
end
$f$;
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon)
$f$;
create function pg_temp.ins_sql(p_aud text, p_anon boolean, p_tag text, p_body text default 'pro post') returns text language sql as $f$
  select format($q$ insert into nestly.posts (audience, is_anonymous, stage_tag, body) values (%L, %L, %L, %L) $q$, p_aud, p_anon, p_tag, p_body)
$f$;
create function pg_temp.share_sql(p_orig uuid) returns text language sql as $f$
  select format($q$ insert into nestly.posts (audience, shared_post_id, body) values ('everyone', %L, 'my words') $q$, p_orig)
$f$;
create function pg_temp.cm_sql(p_post uuid, p_body text, p_parent uuid default null) returns text language sql as $f$
  select format($q$ insert into nestly.comments (post_id, parent_id, body) values (%L, %L, %L) $q$, p_post, p_parent, p_body)
$f$;
create function pg_temp.rx_sql(p_post uuid, p_comment uuid default null) returns text language sql as $f$
  select format($q$ insert into nestly.reactions (post_id, comment_id) values (%L, %L) $q$, p_post, p_comment)
$f$;
create function pg_temp.sees(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.posts where id = %L', p_post))
$f$;
create function pg_temp.cm1(p_who text, p_id uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.comments where id = %L', p_id))
$f$;
create function pg_temp.rxs(p_who text, p_target uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.reactions where post_id = %L or comment_id = %L', p_target, p_target))
$f$;

select is(tests.fx_po_count() + tests.fx_pa_count() + tests.fx_cm_count() + tests.fx_rx_count() + tests.fx_ro_count(), 0::bigint,
  '[FR-FEED-002 professional-posting fixture] no feed row exists before the file starts');
select is(pg_temp.n('p', 'nestly.users where account_type = ''professional'''), '1', '[FR-FEED-002 professional-posting fixture] P is a Professional (control: the file is not vacuous)');

-- =====================================================================================================================
-- c1 -- a Professional posts: named, everyone, no stage tag
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, null)), 'OK:1', '[FR-FEED-002 professional-posting c1] P inserts a named everyone post with no tag');
select is(tests.fx_po_state(pg_temp.fn('p', $q$ select id::text from nestly.posts where body = 'pro post' $q$)::uuid),
  format('status=active aud=everyone anon=f author=%s tag=null share=f body=pro post', pg_temp.id('p')),
  '[FR-FEED-002 professional-posting c1] the row is active, named, everyone, carries P as author, no tag');
select is(tests.fx_pa_count(), 0::bigint, '[FR-FEED-002 professional-posting c1] a named post writes no separation row');

-- refusals: 42501 and no row
select pg_temp.reset();
select set_config('t.n0', (tests.fx_po_count() + tests.fx_pa_count())::text, true);
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', true, null), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1 AC-076] an anonymous post by P is refused with 42501');
select is(pg_temp.dml('p', pg_temp.ins_sql('friends', false, null), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1 Gate 2] a friends audience by P is refused with 42501');
select is(pg_temp.dml('p', pg_temp.ins_sql('friends', true, null), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1] anonymous + friends by P is 42501 (RLS before the CHECK), not 23514');
select is(pg_temp.dml('p', pg_temp.ins_sql('followers', false, null), false) like 'ERR:%', true, '[FR-FEED-002 professional-posting c1 DR-2 Gate 2] a followers audience is refused (the value does not exist yet)');
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, t.v), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1] stage tag ' || t.v || ' by P is refused with 42501')
  from (values ('planning'), ('pregnant'), ('has_child')) t(v);
select is(pg_temp.dml('p', pg_temp.share_sql(pg_temp.post('a')), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1] a share by P is refused with 42501');
select is((tests.fx_po_count() + tests.fx_pa_count())::text, (current_setting('t.n0')::bigint + 1)::text,
  '[FR-FEED-002 professional-posting c1] none of those attempts left a post or a separation row (only the control post of A)');
select is(pg_temp.dml('p', format($q$ insert into nestly.posts (author_id, audience, body) values (%L, 'everyone', 'x') $q$, pg_temp.id('p')), false), 'ERR:42501',
  '[FR-FEED-002 professional-posting c1] P naming themself as author is refused: the database sets the author');
select is(pg_temp.dml('p', format($q$ insert into nestly.posts (author_id, audience, body) values (%L, 'everyone', 'x') $q$, pg_temp.id('a')), false), 'ERR:42501',
  '[FR-FEED-002 professional-posting c1] P naming a Regular as author is refused');
select is(pg_temp.dml('p', $q$ insert into nestly.posts (audience, body, author_status) values ('everyone', 'x', 'active') $q$, false), 'ERR:42501',
  '[FR-FEED-002 professional-posting c1] P sending the author-status copy is refused');
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, null, $b$x'); drop table nestly.posts; --$b$)), 'OK:1',
  '[FR-FEED-002 professional-posting c1] a body shaped like SQL is stored as text for P');
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, null, '   '), false) like 'ERR:%', true, '[FR-FEED-002 professional-posting c1] a blank body by P is refused as for a Regular');
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, null, repeat('x', 100000)), false) like 'ERR:%', true, '[FR-FEED-002 professional-posting c1] a body past the cap by P is refused as for a Regular');

-- stopped accounts and the other account types
select pg_temp.reset();
select set_config('t.n0', tests.fx_po_count()::text, true);
select tests.set_status(pg_temp.id('p'), 'suspended');
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, null), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1 rule 15] a suspended P cannot post');
select tests.set_status(pg_temp.id('p'), 'banned');
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, null), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1 rule 15] a banned P cannot post');
select tests.set_status(pg_temp.id('p'), 'active');
select is(pg_temp.dml('p', pg_temp.ins_sql('everyone', false, null), false), 'OK:1', '[FR-FEED-002 professional-posting c1] control: reactivated P posts again');
select is(pg_temp.dml(w, pg_temp.ins_sql('everyone', false, null), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1] ' || w || ' (Moderator / Admin) cannot post')
  from unnest(array['m', 'd']) w;
select is(tests.dml_as('anon', tests.claims(pg_temp.id('p')), pg_temp.ins_sql('everyone', false, null), false) like 'ERR:%', true,
  '[FR-FEED-002 professional-posting c1 rule 3] anon cannot post, even with P''s claims');
select is(tests.dml_as('authenticated', tests.claims(null), pg_temp.ins_sql('everyone', false, null), false) like 'ERR:%', true,
  '[FR-FEED-002 professional-posting c1] a session with no identity cannot post');
select is(tests.fx_po_count(), current_setting('t.n0')::bigint, '[FR-FEED-002 professional-posting c1] no refused attempt left a row');

-- =====================================================================================================================
-- c1 -- editing and deleting (3א)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.e1', pg_temp.post('p')::text, true);
select is(pg_temp.dml('p', format($q$ update nestly.posts set body = 'edited' where id = %L $q$, current_setting('t.e1')), false), 'OK:1', '[FR-FEED-002 professional-posting c1 3א] P edits the body of their post');
select is(pg_temp.dml('p', format($q$ update nestly.posts set audience = 'friends' where id = %L $q$, current_setting('t.e1')), false), 'ERR:42501',
  '[FR-FEED-002 professional-posting c1] P changing the audience to friends is refused with 42501');
select is(pg_temp.dml('p', format($q$ update nestly.posts set stage_tag = 'pregnant' where id = %L $q$, current_setting('t.e1')), false), 'ERR:42501',
  '[FR-FEED-002 professional-posting c1] P adding a stage tag is refused with 42501');
select is(pg_temp.dml('p', format($q$ update nestly.posts set is_anonymous = true where id = %L $q$, current_setting('t.e1')), false) like 'ERR:%', true,
  '[FR-FEED-002 professional-posting c1] P making the post anonymous is refused');
select is(tests.fx_po_state(current_setting('t.e1')::uuid), format('status=active aud=everyone anon=f author=%s tag=null share=f body=post body', pg_temp.id('p')),
  '[FR-FEED-002 professional-posting c1] the post is unchanged after the refused edits');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ update nestly.posts set body = 'hijack' where id = %L $q$, current_setting('t.e1')), false)),
  '[FR-FEED-002 professional-posting c1] another user''s update of P''s post changes 0 rows');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ delete from nestly.posts where id = %L $q$, current_setting('t.e1')), false)),
  '[FR-FEED-002 professional-posting c1] another user''s delete of P''s post changes 0 rows');
select is(pg_temp.fn('b', format('select nestly.delete_post(%L)::text', current_setting('t.e1'))), '0', '[FR-FEED-002 professional-posting c1 3א] another user''s delete_post of P''s post deletes 0');
select is(tests.fx_po_state(current_setting('t.e1')::uuid) ~ 'body=post body$', true, '[FR-FEED-002 professional-posting c1] and the post is untouched');
select is(pg_temp.fn('p', format('select nestly.delete_post(%L)::text', current_setting('t.e1'))), '1', '[FR-FEED-002 professional-posting c1 3א] P deletes their post');
select is(tests.fx_po_state(current_setting('t.e1')::uuid), null, '[FR-FEED-002 professional-posting c1 3א] the row is gone');
select is(pg_temp.fn('p', format('select nestly.delete_post(%L)::text', current_setting('t.e1'))), '0', '[FR-FEED-002 professional-posting c1] deleting twice changes 0 rows');
select set_config('t.e2', pg_temp.post('p')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.e2')::uuid, 'spam');
select is(pg_temp.fn('p', format('select nestly.delete_post(%L)::text', current_setting('t.e2'))), '1', '[FR-FEED-002 professional-posting c1 3א] P deletes a post with an open report');
select is(tests.fx_hold_state('post', current_setting('t.e2')::uuid) like 'status=deleted hours=%', true, '[FR-FEED-002 professional-posting c1] it is held: kept with status deleted');
select tests.fx_hold_settle('post', current_setting('t.e2')::uuid);
select is(pg_temp.sees('b', current_setting('t.e2')::uuid) || pg_temp.sees('p', current_setting('t.e2')::uuid), '00', '[FR-FEED-002 professional-posting c1] and nobody reads it');

-- =====================================================================================================================
-- c1 -- account status carries into P's posts (N3)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.s1', pg_temp.post('p')::text, true);
select is(pg_temp.sees('b', current_setting('t.s1')::uuid) || pg_temp.sees('p', current_setting('t.s1')::uuid), '11', '[FR-FEED-002 professional-posting c1 N3] control: P''s post is read by a stranger and by P');
select tests.set_status(pg_temp.id('p'), 'suspended');
select is(pg_temp.sees('b', current_setting('t.s1')::uuid) || pg_temp.sees('p', current_setting('t.s1')::uuid), '00', '[FR-FEED-002 professional-posting c1 N3 BR-073] a suspended P''s post is read by nobody, not even P');
select tests.set_status(pg_temp.id('p'), 'banned');
select is(pg_temp.sees('b', current_setting('t.s1')::uuid), '0', '[FR-FEED-002 professional-posting c1 N3 BR-073] a banned P''s post is gone');
select tests.set_status(pg_temp.id('p'), 'active');
select is(pg_temp.sees('b', current_setting('t.s1')::uuid) || pg_temp.sees('p', current_setting('t.s1')::uuid), '11', '[FR-FEED-002 professional-posting c1 N3] reactivated: the post is back');

-- =====================================================================================================================
-- c1 / c7 -- reads: a Professional reads as a Regular non-friend; no regular_names row for P
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.r_ev', pg_temp.post('a')::text, true);
select set_config('t.r_fr', pg_temp.post('a', 'friends')::text, true);
select set_config('t.r_hid', pg_temp.setst(pg_temp.post('a'), 'hidden')::text, true);
select set_config('t.r_own', pg_temp.post('p')::text, true);
select is(pg_temp.sees('p', current_setting('t.r_ev')::uuid), '1', '[FR-FEED-002 professional-posting c1 N4] P reads an everyone post of a Regular');
select is(pg_temp.sees('p', current_setting('t.r_own')::uuid), '1', '[FR-FEED-002 professional-posting c1 N4] and their own post');
select is(pg_temp.sees('p', current_setting('t.r_fr')::uuid), '0', '[FR-FEED-002 professional-posting c1 N4] but not a friends-only post');
select is(pg_temp.sees('p', current_setting('t.r_hid')::uuid), '0', '[FR-FEED-002 professional-posting c1 N4 BR-065] nor a hidden one');
select is(pg_temp.sees('b', current_setting('t.r_own')::uuid), '1', '[FR-FEED-002 professional-posting c1 DR-3] a Regular stranger reads P''s post');
select is(pg_temp.n('b', format('nestly.regular_names where user_id = %L', pg_temp.id('p'))), '0', '[FR-FEED-002 professional-posting c1 DR-3] B gets no regular_names row for P (the card says "מהקהילה")');
select is(pg_temp.n('p', format('nestly.regular_names where user_id = %L', pg_temp.id('p'))), '0', '[FR-FEED-002 professional-posting c1 DR-3] nor does P have one of their own');
select is(pg_temp.n('p', 'nestly.post_authors'), '0', '[FR-FEED-002 professional-posting c1] P reads 0 rows of the author store');
select set_config('t.r_cb', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.r_ev')::uuid, 'b on a')::text, true);
select tests.fx_rx_add(pg_temp.id('c'), current_setting('t.r_ev')::uuid);
select is(pg_temp.n('p', format('nestly.comments where post_id = %L', current_setting('t.r_ev'))), pg_temp.n('c', format('nestly.comments where post_id = %L', current_setting('t.r_ev'))),
  '[FR-FEED-002 professional-posting c7] P reads the comments of a readable post exactly as a Regular non-friend does');
select is(pg_temp.rxs('p', current_setting('t.r_ev')::uuid), pg_temp.rxs('b', current_setting('t.r_ev')::uuid), '[FR-FEED-002 professional-posting c7] and the like count');
select is(pg_temp.rxs('p', current_setting('t.r_ev')::uuid), '1', '[FR-FEED-002 professional-posting c7] (control: the count is 1, not an empty match)');
select is(pg_temp.n('p', 'nestly.reaction_owners'), '0', '[FR-FEED-002 professional-posting c7] P reads no one else''s owner rows');

-- =====================================================================================================================
-- c7 -- comments, replies, likes by a Professional (R5)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.ap', pg_temp.post('a')::text, true);
select set_config('t.pp', pg_temp.post('p')::text, true);
select is(pg_temp.dml('p', pg_temp.cm_sql(current_setting('t.ap')::uuid, 'pro on a')), 'OK:1', '[FR-FEED-003 professional-posting c7] P comments on a Regular''s readable post');
select set_config('t.c_pa', tests.fx_cm_id(current_setting('t.ap')::uuid, 'pro on a')::text, true);
select is(tests.fx_cm_state(current_setting('t.c_pa')::uuid), format('status=active author=%s mark=f parent=null post=%s', pg_temp.id('p'), current_setting('t.ap')),
  '[FR-FEED-003 professional-posting c7 R5] the comment carries P as author and is_by_post_author false (counts in n)');
select is(pg_temp.cm1('a', current_setting('t.c_pa')::uuid) || pg_temp.cm1('b', current_setting('t.c_pa')::uuid), '11', '[FR-FEED-003 professional-posting c7] and other readers read it');
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.ap')::uuid, 'b top')), 'OK:1', '[FR-FEED-003 professional-posting c7] control: a Regular top-level comment');
select set_config('t.c_b', tests.fx_cm_id(current_setting('t.ap')::uuid, 'b top')::text, true);
select is(pg_temp.dml('p', pg_temp.cm_sql(current_setting('t.ap')::uuid, 'pro reply', current_setting('t.c_b')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] P replies to a Regular''s comment');
select is(tests.fx_cm_state(tests.fx_cm_id(current_setting('t.ap')::uuid, 'pro reply')) ~ format('author=%s mark=f parent=%s', pg_temp.id('p'), current_setting('t.c_b')), true,
  '[FR-FEED-003 professional-posting c7] the reply stores P and its parent, no mark');
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.ap')::uuid, 'b replies to pro', current_setting('t.c_pa')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] a Regular replies to P''s comment');

-- on P's own post: the author mark
select is(pg_temp.dml('p', pg_temp.cm_sql(current_setting('t.pp')::uuid, 'pro on own')), 'OK:1', '[FR-FEED-003 professional-posting c7 R5] P comments on their own post');
select set_config('t.c_own', tests.fx_cm_id(current_setting('t.pp')::uuid, 'pro on own')::text, true);
select is(tests.fx_cm_state(current_setting('t.c_own')::uuid), format('status=active author=%s mark=t parent=null post=%s', pg_temp.id('p'), current_setting('t.pp')),
  '[FR-FEED-003 professional-posting c7 R5] it carries is_by_post_author = true (stays out of n)');
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.pp')::uuid, 'b on pro')), 'OK:1', '[FR-FEED-003 professional-posting c7] a Regular comments on P''s post');
select set_config('t.c_bpp', tests.fx_cm_id(current_setting('t.pp')::uuid, 'b on pro')::text, true);
select is(tests.fx_cm_state(current_setting('t.c_bpp')::uuid) ~ 'mark=f', true, '[FR-FEED-003 professional-posting c7] a Regular''s comment on P''s post is not marked');
select is(pg_temp.dml('p', pg_temp.cm_sql(current_setting('t.pp')::uuid, 'pro answers b', current_setting('t.c_bpp')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] P replies on their own post');
select is(tests.fx_cm_state(tests.fx_cm_id(current_setting('t.pp')::uuid, 'pro answers b')) ~ 'mark=t', true, '[FR-FEED-003 professional-posting c7 R5] the reply is marked too');
select is(pg_temp.dml('p', format($q$ insert into nestly.comments (post_id, body, is_by_post_author) values (%L, 'fake', true) $q$, current_setting('t.ap'))), 'ERR:42501',
  '[FR-FEED-003 professional-posting c7] a client-sent mark by P is refused');
select is(pg_temp.dml('p', format($q$ insert into nestly.comments (post_id, body, author_id) values (%L, 'as b', %L) $q$, current_setting('t.ap'), pg_temp.id('b'))), 'ERR:42501',
  '[FR-FEED-003 professional-posting c7] P cannot comment as another user');
select is(pg_temp.dml('p', pg_temp.cm_sql(current_setting('t.ap')::uuid, $b$x'); drop table nestly.comments; --$b$)), 'OK:1', '[FR-FEED-003 professional-posting c7] a SQL-shaped body by P is stored as text');

-- likes
select is(pg_temp.dml('p', pg_temp.rx_sql(current_setting('t.ap')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] P likes a Regular''s post');
select is(pg_temp.dml('p', pg_temp.rx_sql(current_setting('t.ap')::uuid)), 'ERR:23505', '[FR-FEED-003 professional-posting c7] a second like by P on the same post is refused (one per user and target)');
select is(pg_temp.n('a', format('nestly.reactions where post_id = %L and not is_by_author', current_setting('t.ap'))), '1', '[FR-FEED-003 professional-posting c7 R5] P''s like on another''s post has is_by_author false (counts in n)');
select is(pg_temp.dml('p', pg_temp.rx_sql(null, current_setting('t.c_b')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] P likes a Regular''s comment');
select is(pg_temp.n('a', format('nestly.reactions where comment_id = %L and not is_by_author', current_setting('t.c_b'))), '1', '[FR-FEED-003 professional-posting c7 R5] and that like counts (is_by_author false)');
select is(pg_temp.dml('p', pg_temp.rx_sql(current_setting('t.pp')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] P likes their own post');
select is(pg_temp.n('b', format('nestly.reactions where post_id = %L and is_by_author', current_setting('t.pp'))), '1', '[FR-FEED-003 professional-posting c7 R5] it carries is_by_author = true (stays out of n)');
select is(pg_temp.dml('p', pg_temp.rx_sql(null, current_setting('t.c_own')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] P likes their own comment');
select is(pg_temp.n('b', format('nestly.reactions where comment_id = %L and is_by_author', current_setting('t.c_own'))), '1', '[FR-FEED-003 professional-posting c7 R5] is_by_author = true on the comment too');
select is(pg_temp.dml('b', pg_temp.rx_sql(current_setting('t.pp')::uuid)), 'OK:1', '[FR-FEED-003 professional-posting c7] a Regular likes P''s post');
select is(pg_temp.n('b', format('nestly.reactions where post_id = %L and not is_by_author', current_setting('t.pp'))), '1', '[FR-FEED-003 professional-posting c7 R5] a Regular''s like on P''s post counts (is_by_author false)');
select is(pg_temp.n('p', format('nestly.reaction_owners where target_id = %L', current_setting('t.ap'))), '1', '[FR-FEED-003 professional-posting c7] P reads their own owner row');
select is(pg_temp.n('b', format('nestly.reaction_owners where user_id = %L', pg_temp.id('p'))), '0', '[FR-FEED-003 professional-posting c7] and nobody asks for P''s likes by id');
select is(pg_temp.dml('b', format($q$ delete from nestly.reactions where post_id = %L and is_by_author $q$, current_setting('t.pp')), false), 'OK:0', '[FR-FEED-003 professional-posting c7] another user deletes none of P''s likes');
select is(pg_temp.dml('p', format($q$ delete from nestly.reactions where post_id = %L and not is_by_author $q$, current_setting('t.ap')), false), 'OK:1', '[FR-FEED-003 professional-posting c7] P deletes their own like');

-- a suspended Professional leaves the counts and the thread
select pg_temp.reset();
select set_config('t.sp', pg_temp.post('a')::text, true);
select set_config('t.sc', tests.fx_cm_add(pg_temp.id('p'), current_setting('t.sp')::uuid, 'pro says')::text, true);
select tests.fx_rx_add(pg_temp.id('p'), current_setting('t.sp')::uuid);
select tests.fx_rx_add(pg_temp.id('b'), current_setting('t.sp')::uuid);
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid) || pg_temp.cm1('a', current_setting('t.sc')::uuid), '21', '[FR-FEED-003 professional-posting c7 R5] two active likers (P, B) count 2 and P''s comment is read');
select tests.set_status(pg_temp.id('p'), 'suspended');
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid), '1', '[FR-FEED-003 professional-posting c7 R5] a suspended P''s like leaves the count');
select is(pg_temp.cm1('a', current_setting('t.sc')::uuid) || pg_temp.cm1('b', current_setting('t.sc')::uuid), '00', '[FR-FEED-003 professional-posting c7 R5] and a suspended P''s comment leaves the thread');
select tests.set_status(pg_temp.id('p'), 'banned');
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid) || pg_temp.cm1('a', current_setting('t.sc')::uuid), '10', '[FR-FEED-003 professional-posting c7 R5] a banned P''s like and comment are gone too');
select tests.set_status(pg_temp.id('p'), 'active');
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid) || pg_temp.cm1('a', current_setting('t.sp')::uuid), '20', '[FR-FEED-003 professional-posting c7 R5] reactivation restores the like');
select is(pg_temp.cm1('a', current_setting('t.sc')::uuid), '1', '[FR-FEED-003 professional-posting c7 R5] and the comment');

-- refusals as F3.3
select pg_temp.reset();
select set_config('t.n0', (tests.fx_cm_count() + tests.fx_rx_count())::text, true);
select set_config('t.uf', pg_temp.post('a', 'friends')::text, true);
select set_config('t.uh', pg_temp.setst(pg_temp.post('a'), 'hidden')::text, true);
select set_config('t.ufc', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.uf')::uuid, 'inside')::text, true);
select set_config('t.n1', (tests.fx_cm_count() + tests.fx_rx_count())::text, true);
select ok(pg_temp.refused(pg_temp.dml('p', pg_temp.cm_sql(current_setting('t.uf')::uuid, 'sneak'))), '[FR-FEED-003 professional-posting c7] P cannot comment on a friends-only post');
select ok(pg_temp.refused(pg_temp.dml('p', pg_temp.cm_sql(current_setting('t.uh')::uuid, 'sneak'))), '[FR-FEED-003 professional-posting c7 BR-065] nor on a hidden post');
select ok(pg_temp.refused(pg_temp.dml('p', pg_temp.cm_sql(gen_random_uuid(), 'nowhere'))), '[FR-FEED-003 professional-posting c7] nor on a post that does not exist');
select ok(pg_temp.refused(pg_temp.dml('p', pg_temp.rx_sql(current_setting('t.uf')::uuid))), '[FR-FEED-003 professional-posting c7] P cannot like a friends-only post');
select ok(pg_temp.refused(pg_temp.dml('p', pg_temp.rx_sql(null, current_setting('t.ufc')::uuid))), '[FR-FEED-003 professional-posting c7] nor a comment under it');
select ok(pg_temp.refused(pg_temp.dml('p', pg_temp.rx_sql(current_setting('t.uh')::uuid))), '[FR-FEED-003 professional-posting c7 BR-065] nor a hidden post');
select tests.set_status(pg_temp.id('p'), 'suspended');
select is(pg_temp.dml('p', pg_temp.cm_sql(pg_temp.post('a'), 'susp'), false), 'ERR:42501', '[FR-FEED-003 professional-posting c7 rule 15] a suspended P cannot comment');
select is(pg_temp.dml('p', pg_temp.rx_sql(pg_temp.post('a')), false), 'ERR:42501', '[FR-FEED-003 professional-posting c7 rule 15] nor like');
select tests.set_status(pg_temp.id('p'), 'banned');
select is(pg_temp.dml('p', pg_temp.cm_sql(pg_temp.post('a'), 'ban'), false), 'ERR:42501', '[FR-FEED-003 professional-posting c7 rule 15] a banned P cannot comment');
select tests.set_status(pg_temp.id('p'), 'active');
select is(pg_temp.dml(w, pg_temp.cm_sql(pg_temp.post('a'), 'staff'), false), 'ERR:42501', '[FR-FEED-003 professional-posting c7] ' || w || ' (Moderator / Admin) cannot comment')
  from unnest(array['m', 'd']) w;
select is(pg_temp.dml(w, pg_temp.rx_sql(pg_temp.post('a')), false), 'ERR:42501', '[FR-FEED-003 professional-posting c7] ' || w || ' (Moderator / Admin) cannot like')
  from unnest(array['m', 'd']) w;
select is(tests.dml_as('anon', tests.claims(pg_temp.id('p')), pg_temp.cm_sql(pg_temp.post('a'), 'anon'), false) like 'ERR:%', true, '[FR-FEED-003 professional-posting c7 rule 3] anon cannot comment with P''s claims');
select is(tests.dml_as('authenticated', tests.claims(null), pg_temp.rx_sql(pg_temp.post('a')), false) like 'ERR:%', true, '[FR-FEED-003 professional-posting c7] a session with no identity cannot like');
select is((tests.fx_cm_count() + tests.fx_rx_count())::text, current_setting('t.n1'), '[FR-FEED-003 professional-posting c7] none of the refused attempts left a comment or a like');

-- shares and hides stay refused for P
select pg_temp.reset();
select set_config('t.hp', pg_temp.post('a')::text, true);
select is(pg_temp.dml('p', pg_temp.share_sql(current_setting('t.hp')::uuid), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1] a share by P of a readable post is refused with 42501');
select is(pg_temp.dml('p', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.hp')), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1] a hide by P is refused with 42501');
select is(tests.fx_ph_count(), 0::bigint, '[FR-FEED-002 professional-posting c1] and left no hide');

-- =====================================================================================================================
-- Regular behaviour unchanged
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('b', pg_temp.ins_sql('friends', false, 'pregnant'), false), 'OK:1', '[FR-FEED-002 professional-posting c1] control: a Regular still posts friends-only with a stage tag');
select is(pg_temp.dml('b', pg_temp.ins_sql('everyone', true, null), false), 'OK:1', '[FR-FEED-002 professional-posting c1] control: a Regular still posts anonymously');
select is(pg_temp.dml('b', pg_temp.ins_sql('friends', true, null), false), 'ERR:23514', '[FR-FEED-002 professional-posting c1] a Regular anonymous + friends post is still 23514 posts_audience_check');
select is(pg_temp.dml('b', pg_temp.share_sql(pg_temp.post('a')), false), 'OK:1', '[FR-FEED-002 professional-posting c1] control: a Regular still shares');
select is(pg_temp.dml(w, pg_temp.ins_sql('everyone', false, null), false), 'ERR:42501', '[FR-FEED-002 professional-posting c1] control: ' || w || ' (suspended / banned Regular) still cannot post')
  from unnest(array['s', 'x']) w;

-- =====================================================================================================================
-- Structure (schema.md: the helper and the three dropped FKs)
-- =====================================================================================================================
select is_empty(
  $$ select con.conname from pg_catalog.pg_constraint con join pg_catalog.pg_namespace ns on ns.oid = con.connamespace
      where ns.nspname = 'nestly' and con.conname in ('posts_author_id_fkey', 'comments_author_id_fkey', 'reaction_owners_user_id_fkey') $$,
  '[FR-FEED-002 professional-posting c1 N1-N4] the three FKs to regular_profiles (posts, comments, reaction_owners) are gone');
select is(
  (select count(*) from pg_catalog.pg_constraint con
     where con.conname in ('posts_author_status_fkey', 'comments_author_status_fkey', 'reaction_owners_liker_status_fkey', 'post_authors_author_id_fkey')),
  4::bigint, '[FR-FEED-002 professional-posting c1 N3] the status FKs to users and the separation FK to regular_profiles remain');
select is(
  (select f.relname::text from pg_catalog.pg_constraint con join pg_catalog.pg_class f on f.oid = con.confrelid where con.conname = 'post_authors_author_id_fkey'),
  'regular_profiles', '[FR-FEED-002 professional-posting c1] a separation row is Regular-only: post_authors.author_id still references regular_profiles');
select is(
  (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'caller_account_type'),
  1::bigint, '[FR-FEED-002 professional-posting c1] nestly.caller_account_type exists once');
select is(
  (select pg_catalog.pg_get_function_arguments(p.oid) || '/' || pg_catalog.pg_get_function_result(p.oid)
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'caller_account_type'),
  '/text', '[FR-FEED-002 professional-posting c1] caller_account_type() takes no argument (caller only) and returns text');
select is(
  (select p.prosecdef::text || '/' || p.provolatile::text || '/' || coalesce(p.proconfig::text, 'none')
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'caller_account_type'),
  'false/s/{"search_path=\"\""}', '[FR-FEED-002 professional-posting c1] it is SECURITY INVOKER, STABLE, search_path empty');
select is(has_function_privilege('authenticated', (select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'caller_account_type'), 'execute'), true, '[FR-FEED-002 professional-posting c1] authenticated may execute it');
select is(has_function_privilege('anon', (select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'caller_account_type'), 'execute'), false, '[FR-FEED-002 professional-posting c1 rule 3] anon may not');
select is(has_function_privilege('public', (select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'caller_account_type'), 'execute'), false, '[FR-FEED-002 professional-posting c1] PUBLIC may not');
select is(pg_temp.fn('p', 'select nestly.caller_account_type()'), 'professional', '[FR-FEED-002 professional-posting c1] it returns professional for P');
select is(pg_temp.fn('b', 'select nestly.caller_account_type()'), 'regular', '[FR-FEED-002 professional-posting c1] regular for B');
select is(pg_temp.fn('m', 'select nestly.caller_account_type()'), 'moderator', '[FR-FEED-002 professional-posting c1] moderator for M');
select is(pg_temp.fn('d', 'select nestly.caller_account_type()'), 'admin', '[FR-FEED-002 professional-posting c1] admin for D');
select tests.set_status(pg_temp.id('p'), 'suspended');
select is(coalesce(pg_temp.fn('p', 'select nestly.caller_account_type()'), 'null'), 'null', '[FR-FEED-002 professional-posting c1 rule 15] a stopped account gets NULL');
select tests.set_status(pg_temp.id('p'), 'active');
select is(coalesce(tests.as_role('authenticated', tests.claims(null), 'select nestly.caller_account_type()'), 'null'), 'null', '[FR-FEED-002 professional-posting c1] a session with no identity gets NULL');
select is(coalesce(tests.as_role('authenticated', tests.claims(gen_random_uuid()), 'select nestly.caller_account_type()'), 'null'), 'null', '[FR-FEED-002 professional-posting c1] an unknown user gets NULL');
select is(tests.as_role('anon', tests.claims(pg_temp.id('p')), 'select nestly.caller_account_type()'), 'ERR:42501', '[FR-FEED-002 professional-posting c1 rule 3] anon calling it is 42501');
select set_eq(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and p.prosecdef $$,
  $$ select a from tests.approved_security_definer() as a $$,
  '[FR-FEED-002 professional-posting c1 platform r10] the SECURITY DEFINER functions are still exactly the approved list');

select * from finish();

rollback;
