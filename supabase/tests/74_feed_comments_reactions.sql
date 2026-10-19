-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.0b feed-groundwork: comments, "המחבר", likes, deletion of comments and posts).
-- Source of expected values: .work/feed-groundwork/spec.md (c10, c11, c12, c13 and the Gate 2 / re-amend lines), table and function names
-- from schema-b.md, not the migration text. Structure is file 73, reports 75, held deletion 76, the feed plan 77.
-- People: A = 10_'s a (author), B = 10_'s b (a stranger), C = 60_'s fr_c (built below), S, X = suspended, banned, P = Professional.
-- Everything rolls back with the transaction. A refused write is any 'ERR:<sqlstate>' or 'OK:0' with the data unchanged.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.0-b c10] session_user is app_server (this file must not run under another login)');

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
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
create function pg_temp.refused(p_res text) returns boolean language sql as $f$ select p_res like 'ERR:%' or p_res = 'OK:0' $f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  foreach w in array array['a', 'b', 'c'] loop perform tests.set_status(pg_temp.id(w), 'active'); end loop;
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
create function pg_temp.cm_sql(p_post uuid, p_body text, p_parent uuid default null) returns text language sql as $f$
  select format($q$ insert into nestly.comments (post_id, parent_id, body) values (%L, %L, %L) $q$, p_post, p_parent, p_body)
$f$;
create function pg_temp.rx_sql(p_post uuid, p_comment uuid default null) returns text language sql as $f$
  select format($q$ insert into nestly.reactions (post_id, comment_id) values (%L, %L) $q$, p_post, p_comment)
$f$;
-- how many comments of the post the viewer reads / likes of the target
create function pg_temp.cms(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.comments where post_id = %L', p_post))
$f$;
create function pg_temp.cm1(p_who text, p_id uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.comments where id = %L', p_id))
$f$;
create function pg_temp.rxs(p_who text, p_target uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.reactions where post_id = %L or comment_id = %L', p_target, p_target))
$f$;
-- cells equal to a person's id in what a viewer reads about one post (c11, c12): comments and likes of the post, the viewer's own owner/report rows
create function pg_temp.leak(p_viewer text, p_needle uuid, p_post uuid) returns bigint language plpgsql as $f$
declare
  r record;
  total bigint := 0;
  n text;
  scope text;
begin
  for r in
    select c.relname as t, a.attname as col
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'nestly' and c.relname in ('comments', 'reactions', 'reaction_owners', 'reports')
       and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')
  loop
    scope := case r.t
      when 'comments' then format('post_id = %L', p_post)
      when 'reactions' then format('post_id = %L or comment_id in (select id from nestly.comments where post_id = %L)', p_post, p_post)
      else 'true' end;
    n := tests.as_role('authenticated', tests.claims(pg_temp.id(p_viewer)),
           format('select count(*)::text from nestly.%I where %I::text = %L and (%s)', r.t, r.col, p_needle::text, scope));
    if n like 'ERR:%' then return -1; end if;
    total := total + n::bigint;
  end loop;
  return total;
end
$f$;

select is(tests.fx_cm_count() + tests.fx_rx_count() + tests.fx_ro_count() + tests.fx_rp_count(), 0::bigint, '[F3.0-b fixture] no comment, like or report exists before the file starts');

-- =====================================================================================================================
-- c10 -- comments (FR-FEED-003)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.p1', pg_temp.post('a')::text, true);
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p1')::uuid, 'top by b')), 'OK:1', '[F3.0-b c10] a reader of the post comments on it');
select set_config('t.c1', tests.fx_cm_id(current_setting('t.p1')::uuid, 'top by b')::text, true);
select is(tests.fx_cm_state(current_setting('t.c1')::uuid),
  format('status=active author=%s mark=f parent=null post=%s', pg_temp.id('b'), current_setting('t.p1')),
  '[F3.0-b c10] the comment carries the commenter as author, is active, top-level, no mark');
select is(pg_temp.cms('a', current_setting('t.p1')::uuid) || pg_temp.cms('b', current_setting('t.p1')::uuid) || pg_temp.cms('c', current_setting('t.p1')::uuid),
  '111', '[F3.0-b c10] and every viewer who reads the post reads the comment');

select is(pg_temp.dml('b', format($q$ insert into nestly.comments (post_id, author_id, body) values (%L, %L, 'as a') $q$, current_setting('t.p1'), pg_temp.id('a'))),
  'ERR:42501', '[F3.0-b c10] a comment with another user''s id as author is refused (the column is not writable)');
select is(pg_temp.dml('b', format($q$ insert into nestly.comments (post_id, author_status, body) values (%L, 'active', 'x') $q$, current_setting('t.p1'))),
  'ERR:42501', '[F3.0-b c10] nor can a client send the status copy');
select is(pg_temp.dml('b', format($q$ insert into nestly.comments (post_id, status, body) values (%L, 'removed', 'x') $q$, current_setting('t.p1'))),
  'ERR:42501', '[F3.0-b c10] nor a status');

-- unreadable post: friends-only for a stranger, hidden, removed, deleted, author suspended, viewer suspended / banned, Professional, anon, unknown
select pg_temp.reset();
select set_config('t.n0', tests.fx_cm_count()::text, true);
select set_config('t.f1', pg_temp.post('a', 'friends')::text, true);
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.f1')::uuid, 'sneak'))), '[F3.0-b c10] insert on a friends-only post of a non-friend is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(gen_random_uuid(), 'nowhere'))), '[F3.0-b c10] insert on a post that does not exist is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(null, 'nowhere'))), '[F3.0-b c10] insert with no post is refused');
select is(pg_temp.dml('p', pg_temp.cm_sql(pg_temp.post('a'), 'pro'), false), 'OK:1', '[F3.10-a c7 FR-FEED-003] a Professional comments on a readable post (supersedes F3.0-b c10 Gate 2; the rest in file 85)');
select ok(pg_temp.refused(pg_temp.dml('s', pg_temp.cm_sql(pg_temp.post('a'), 'susp'))), '[F3.0-b c10 rule 15] a suspended viewer cannot comment');
select ok(pg_temp.refused(pg_temp.dml('x', pg_temp.cm_sql(pg_temp.post('a'), 'ban'))), '[F3.0-b c10 rule 15] a banned viewer cannot comment');
select ok(pg_temp.refused(tests.dml_as('anon', tests.claims(pg_temp.id('b')), pg_temp.cm_sql(pg_temp.post('a'), 'anon'))), '[F3.0-b c10 rule 3] anon cannot comment');
select ok(pg_temp.refused(tests.dml_as('none', '', pg_temp.cm_sql(pg_temp.post('a'), 'noclaims'))), '[F3.0-b c10] a session with no identity cannot comment');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(pg_temp.setst(pg_temp.post('a'), st.s), 'x'))), '[F3.0-b c10 BR-065] a post with status ' || st.s || ' takes no comment')
  from (values ('hidden'), ('removed'), ('deleted')) st(s);
select set_config('t.p2', pg_temp.post('a')::text, true);
select tests.set_status(pg_temp.id('a'), 'suspended');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p2')::uuid, 'x'))), '[F3.0-b c10 BR-073] a post of a suspended author takes no comment');
select tests.set_status(pg_temp.id('a'), 'active');
select is(tests.fx_cm_count(), current_setting('t.n0')::bigint, '[F3.0-b c10] and none of those refused attempts left a row');

-- empty and hostile bodies
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p2')::uuid, ''))), '[F3.0-b c10] an empty body is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p2')::uuid, E' \n\t '))), '[F3.0-b c10] a whitespace body is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p2')::uuid, null))), '[F3.0-b c10] a null body is refused');
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p2')::uuid, $b$x'); drop table nestly.comments; --$b$)), 'OK:1', '[F3.0-b c10] a body shaped like SQL is stored as text');
select ok(tests.fx_cm_id(current_setting('t.p2')::uuid, $b$x'); drop table nestly.comments; --$b$) is not null, '[F3.0-b c10] and the table is still there with the text in it');

-- one reply level, same post
select pg_temp.reset();
select set_config('t.p3', pg_temp.post('a')::text, true);
select set_config('t.p4', pg_temp.post('a')::text, true);
select set_config('t.top', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.p3')::uuid, 'top')::text, true);
select is(pg_temp.dml('c', pg_temp.cm_sql(current_setting('t.p3')::uuid, 'reply', current_setting('t.top')::uuid)), 'OK:1', '[F3.0-b c10] a reply to a top-level comment is accepted');
select set_config('t.rep', tests.fx_cm_id(current_setting('t.p3')::uuid, 'reply')::text, true);
select is(tests.fx_cm_state(current_setting('t.rep')::uuid),
  format('status=active author=%s mark=f parent=%s post=%s', pg_temp.id('c'), current_setting('t.top'), current_setting('t.p3')),
  '[F3.0-b c10] the reply stores its parent');
select ok(pg_temp.refused(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.p3')::uuid, 'deeper', current_setting('t.rep')::uuid))), '[F3.0-b c10] a reply to a reply is refused');
select ok(pg_temp.refused(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.p4')::uuid, 'cross', current_setting('t.top')::uuid))), '[F3.0-b c10] a reply whose parent is on another post is refused');
select ok(pg_temp.refused(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.p3')::uuid, 'orphan', gen_random_uuid()))), '[F3.0-b c10] a reply to a parent that does not exist is refused');
select is(tests.fx_cm_id(current_setting('t.p3')::uuid, 'deeper') is null and tests.fx_cm_id(current_setting('t.p4')::uuid, 'cross') is null, true, '[F3.0-b c10] no refused reply left a row');

-- readers: the post's audience, hides and the commenter's account status carry into the comment
select pg_temp.reset();
select set_config('t.fp', pg_temp.post('a', 'friends')::text, true);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.dml('c', pg_temp.cm_sql(current_setting('t.fp')::uuid, 'friend says')), 'OK:1', '[F3.0-b c10] an accepted friend comments on a friends-only post');
select is(pg_temp.cms('a', current_setting('t.fp')::uuid) || pg_temp.cms('c', current_setting('t.fp')::uuid) || pg_temp.cms('b', current_setting('t.fp')::uuid),
  '110', '[F3.0-b c10] the author and the friend read it; a stranger reads 0');
select tests.fx_fr_purge(pg_temp.id('c'));
select is(pg_temp.cms('c', current_setting('t.fp')::uuid), '1', '[F3.0-b c10 G2] a removed friend no longer reads the thread of a friends-only post, only their own comment in it');

select pg_temp.reset();
select set_config('t.p5', pg_temp.post('a')::text, true);
select set_config('t.cb', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.p5')::uuid, 'b says')::text, true);
select is(pg_temp.cm1('c', current_setting('t.cb')::uuid), '1', '[F3.0-b c10] control: an active commenter''s comment is read');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.cm1('c', current_setting('t.cb')::uuid) || pg_temp.cm1('a', current_setting('t.cb')::uuid), '00', '[F3.0-b c10] commenter suspended: 0 rows to other readers');
select is(pg_temp.cm1('b', current_setting('t.cb')::uuid), '0', '[F3.0-b c10 rule 15] and to the suspended commenter');
select tests.set_status(pg_temp.id('b'), 'banned');
select is(pg_temp.cm1('c', current_setting('t.cb')::uuid), '0', '[F3.0-b c10] commenter banned: 0 rows');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.cm1('c', current_setting('t.cb')::uuid), '1', '[F3.0-b c10] commenter active again: the comment is back');
select tests.set_status(pg_temp.id('c'), 'suspended');
select is(pg_temp.cms('c', current_setting('t.p5')::uuid), '0', '[F3.0-b c10 rule 15] a suspended viewer reads no comment');
select tests.set_status(pg_temp.id('c'), 'active');
select is(pg_temp.dml('b', format($q$ insert into nestly.post_hides (post_id) values (%L) $q$, current_setting('t.p5'))), 'OK:1', '[F3.0-b c10 c16] B hides the post');
select is(pg_temp.cms('b', current_setting('t.p5')::uuid) || pg_temp.cms('c', current_setting('t.p5')::uuid), '11', '[F3.0-b c10 c16 G2] a viewer who cannot read the post (hidden) reads none of its comments but their own; others still read it');
select pg_temp.dml('b', 'delete from nestly.post_hides');
select set_config('t.p5s', pg_temp.setst(current_setting('t.p5')::uuid, 'hidden')::text, true);
select is(pg_temp.cms('c', current_setting('t.p5')::uuid) || pg_temp.cms('a', current_setting('t.p5')::uuid), '00', '[F3.0-b c10 BR-065] a post that is no longer active gives none of its comments');

-- =====================================================================================================================
-- c11 -- "המחבר" (AC-076, FR-FEED-005 r.1)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.ap', pg_temp.post('a', 'everyone', true)::text, true);
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.ap')::uuid, 'by b on anon')), 'OK:1', '[F3.0-b c11] another user comments on an anonymous post');
select set_config('t.cbb', tests.fx_cm_id(current_setting('t.ap')::uuid, 'by b on anon')::text, true);
select is(tests.fx_cm_state(current_setting('t.cbb')::uuid), format('status=active author=%s mark=f parent=null post=%s', pg_temp.id('b'), current_setting('t.ap')),
  '[F3.0-b c11] other commenters keep their identity and carry no mark');
select is(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.ap')::uuid, 'by the author')), 'OK:1', '[F3.0-b c11] the real author comments on their own anonymous post');
select set_config('t.caa', tests.fx_cm_id(current_setting('t.ap')::uuid, 'by the author')::text, true);
select is(tests.fx_cm_state(current_setting('t.caa')::uuid), format('status=active author=null mark=t parent=null post=%s', current_setting('t.ap')),
  '[F3.0-b c11 AC-076] the database marks it "המחבר" and stores no author id on the comment');
select is(pg_temp.n('c', format('nestly.comments where id = %L and is_by_post_author and author_id is null', current_setting('t.caa'))), '1',
  '[F3.0-b c11] other readers get the mark and no author id');
select is(pg_temp.n('c', format('nestly.comments where id = %L and not is_by_post_author and author_id = %L', current_setting('t.cbb'), pg_temp.id('b'))), '1',
  '[F3.0-b c11] and still see the other commenter''s identity');
select is(pg_temp.cms('a', current_setting('t.ap')::uuid) || pg_temp.cms('b', current_setting('t.ap')::uuid) || pg_temp.cms('c', current_setting('t.ap')::uuid), '222',
  '[F3.0-b c11] the author and every other reader read both comments');
select is(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.ap')::uuid, 'author reply', current_setting('t.cbb')::uuid)), 'OK:1', '[F3.0-b c11] the author replies to a commenter and is marked too');
select is(tests.fx_cm_state(tests.fx_cm_id(current_setting('t.ap')::uuid, 'author reply')) ~ 'author=null mark=t', true, '[F3.0-b c11] reply: no author id, mark set');

select is(pg_temp.dml('b', format($q$ insert into nestly.comments (post_id, body, is_by_post_author) values (%L, 'fake', true) $q$, current_setting('t.ap'))), 'ERR:42501',
  '[F3.0-b c11] a client-sent mark by another user is refused');
select is(pg_temp.dml('a', format($q$ insert into nestly.comments (post_id, body, is_by_post_author) values (%L, 'self-mark', true) $q$, current_setting('t.ap'))), 'ERR:42501',
  '[F3.0-b c11] and a client-sent mark is refused for the author too (the database sets it)');
select is(pg_temp.dml('b', format($q$ insert into nestly.comments (post_id, body, author_id) values (%L, 'null author', null) $q$, current_setting('t.ap'))), 'ERR:42501',
  '[F3.0-b c11] another user cannot ask for a null author');
select is(tests.fx_cm_id(current_setting('t.ap')::uuid, 'fake') is null and tests.fx_cm_id(current_setting('t.ap')::uuid, 'null author') is null, true, '[F3.0-b c11] no refused attempt left a row');
select is(pg_temp.leak('b', pg_temp.id('a'), current_setting('t.ap')::uuid) + pg_temp.leak('c', pg_temp.id('a'), current_setting('t.ap')::uuid), 0::bigint,
  '[F3.0-b c11 AC-075 S-26] no readable cell of the post''s comments, likes or any viewer-readable row holds the real author''s id');
select is(pg_temp.dml('b', format($q$ update nestly.comments set body = 'changed' where id = %L $q$, current_setting('t.caa'))), 'ERR:42501', '[F3.0-b c11] a comment body cannot be edited (no comment editing in I3)');

-- =====================================================================================================================
-- c12 -- likes
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.lp', pg_temp.post('a')::text, true);
select set_config('t.lap', pg_temp.post('a', 'everyone', true)::text, true);
select is(pg_temp.dml('b', pg_temp.rx_sql(current_setting('t.lp')::uuid)), 'OK:1', '[F3.0-b c12] a reader likes a post');
select is(pg_temp.dml('b', pg_temp.rx_sql(current_setting('t.lp')::uuid)), 'ERR:23505', '[F3.0-b c12] a second like by the same user on the same post is refused (one per user and target)');
select is(tests.fx_rx_count() = tests.fx_ro_count() and tests.fx_rx_count() = 1, true, '[F3.0-b c12] and left one like, one owner row');
select is(pg_temp.dml('c', pg_temp.rx_sql(current_setting('t.lp')::uuid)), 'OK:1', '[F3.0-b c12] another user''s like on the same post is accepted');
select is(pg_temp.rxs('a', current_setting('t.lp')::uuid) || pg_temp.rxs('b', current_setting('t.lp')::uuid) || pg_temp.rxs('c', current_setting('t.lp')::uuid), '222',
  '[F3.0-b c12] a count for a readable target is obtainable by every reader of it');
select is(pg_temp.n('b', format('nestly.reaction_owners where target_id = %L', current_setting('t.lp'))) || pg_temp.n('a', format('nestly.reaction_owners where target_id = %L', current_setting('t.lp'))),
  '10', '[F3.0-b c12] who liked is readable by the liker only: B reads their own row, the post''s author reads none');
select is(pg_temp.fn('a', format('select count(*)::text from nestly.reaction_owners where user_id = %L', pg_temp.id('b'))), '0', '[F3.0-b c12] and nobody asks for another user''s likes by id');
select ok(pg_temp.refused(pg_temp.dml('b', format($q$ insert into nestly.reactions (post_id, comment_id) values (%L, %L) $q$, current_setting('t.lp'), tests.fx_cm_add(pg_temp.id('c'), current_setting('t.lp')::uuid, 'liked comment')))),
  '[F3.0-b c12] a like names exactly one target: both is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rx_sql(null, null))), '[F3.0-b c12] a like with no target is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rx_sql(gen_random_uuid()))), '[F3.0-b c12] a like on a post that does not exist is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rx_sql(null, gen_random_uuid()))), '[F3.0-b c12] and on a comment that does not exist');
select is(pg_temp.dml('b', format($q$ insert into nestly.reactions (post_id, liker_status) values (%L, 'active') $q$, current_setting('t.lap'))), 'ERR:42501', '[F3.0-b c12] a client cannot send the status copy');
select is(pg_temp.dml('b', format($q$ insert into nestly.reaction_owners (reaction_id, target_id, user_id) values (gen_random_uuid(), %L, %L) $q$, current_setting('t.lp'), pg_temp.id('c'))),
  'ERR:42501', '[F3.0-b c12] nor write an owner row of another user directly');

-- a comment is a target; an unreadable target is neither likeable nor countable
select set_config('t.lc', tests.fx_cm_id(current_setting('t.lp')::uuid, 'liked comment')::text, true);
select is(pg_temp.dml('b', pg_temp.rx_sql(null, current_setting('t.lc')::uuid)), 'OK:1', '[F3.0-b c12] a reader likes a readable comment');
select is(pg_temp.rxs('a', current_setting('t.lc')::uuid) || pg_temp.rxs('c', current_setting('t.lc')::uuid), '11', '[F3.0-b c12] and the comment''s count is readable');
select set_config('t.lf', pg_temp.post('a', 'friends')::text, true);
select set_config('t.lfc', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.lf')::uuid, 'inside')::text, true);
select tests.fx_rx_add(pg_temp.id('a'), current_setting('t.lf')::uuid);
select tests.fx_rx_add(pg_temp.id('a'), null, current_setting('t.lfc')::uuid);
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rx_sql(current_setting('t.lf')::uuid))), '[F3.0-b c12] a like on a friends-only post of a non-friend is refused');
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rx_sql(null, current_setting('t.lfc')::uuid))), '[F3.0-b c12] and on a comment under it');
select is(pg_temp.rxs('b', current_setting('t.lf')::uuid) || pg_temp.rxs('b', current_setting('t.lfc')::uuid), '00', '[F3.0-b c12] an unreadable target gives a count of 0');
select is(pg_temp.rxs('a', current_setting('t.lf')::uuid) || pg_temp.rxs('a', current_setting('t.lfc')::uuid), '11', '[F3.0-b c12] and the same likes count 1 for a viewer who can read it');
select set_config('t.lh', pg_temp.setst(pg_temp.post('a'), 'hidden')::text, true);
select ok(pg_temp.refused(pg_temp.dml('b', pg_temp.rx_sql(current_setting('t.lh')::uuid))), '[F3.0-b c12 BR-065] a post that is not active takes no like');
select is(pg_temp.dml('p', pg_temp.rx_sql(current_setting('t.lp')::uuid), false), 'OK:1', '[F3.10-a c7 FR-FEED-003] a Professional likes a readable post (supersedes F3.0-b c12 Gate 2; the rest in file 85)');
select ok(pg_temp.refused(pg_temp.dml('s', pg_temp.rx_sql(current_setting('t.lp')::uuid))) and pg_temp.refused(pg_temp.dml('x', pg_temp.rx_sql(current_setting('t.lp')::uuid))),
  '[F3.0-b c12 rule 15] a suspended or banned user cannot like');
select ok(pg_temp.refused(tests.dml_as('anon', tests.claims(pg_temp.id('b')), pg_temp.rx_sql(current_setting('t.lp')::uuid))), '[F3.0-b c12 rule 3] anon cannot like');
select is(pg_temp.rxs('a', current_setting('t.lp')::uuid), '2', '[F3.0-b c12] control: the refused attempts did not change the count');

-- delete only your own
select set_config('t.lb', tests.fx_rx_add(pg_temp.id('b'), current_setting('t.lap')::uuid)::text, true);
select is(pg_temp.dml('c', format($q$ delete from nestly.reactions where id = %L $q$, current_setting('t.lb'))), 'OK:0', '[F3.0-b c12] another user deletes none of B''s likes');
select is(pg_temp.rxs('c', current_setting('t.lap')::uuid), '1', '[F3.0-b c12] it is still there');
select is(pg_temp.dml('b', format($q$ update nestly.reactions set post_id = %L where id = %L $q$, current_setting('t.lp'), current_setting('t.lb'))), 'ERR:42501', '[F3.0-b c12] a like cannot be moved to another target (no update)');
select is(pg_temp.dml('b', format($q$ delete from nestly.reactions where id = %L $q$, current_setting('t.lb'))), 'OK:1', '[F3.0-b c12] B deletes their own like');
select is(pg_temp.rxs('c', current_setting('t.lap')::uuid) || tests.fx_rx_count()::text, '0' || tests.fx_ro_count()::text, '[F3.0-b c12] the count drops and the owner row goes with it (equal row counts)');
select is(pg_temp.dml('b', pg_temp.rx_sql(current_setting('t.lap')::uuid)), 'OK:1', '[F3.0-b c12] after deleting, B can like again');
select is(pg_temp.dml('a', pg_temp.rx_sql(current_setting('t.lap')::uuid)), 'OK:1', '[F3.0-b c12] the real author may like their own anonymous post');
select is(pg_temp.leak('b', pg_temp.id('a'), current_setting('t.lap')::uuid) + pg_temp.leak('c', pg_temp.id('a'), current_setting('t.lap')::uuid), 0::bigint,
  '[F3.0-b c12 AC-075] and a like by the real author puts their id in no cell another user reads');
select is(pg_temp.leak('c', pg_temp.id('b'), current_setting('t.lap')::uuid), 0::bigint, '[F3.0-b c12] likes expose no liker id to other readers');
select is(
  (select count(*) from pg_catalog.pg_constraint con join pg_catalog.pg_class t on t.oid = con.conrelid join pg_catalog.pg_namespace tn on tn.oid = t.relnamespace
     join pg_catalog.pg_class f on f.oid = con.confrelid join pg_catalog.pg_namespace fn on fn.oid = f.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
    where tn.nspname = 'nestly' and t.relname = 'reactions' and con.contype = 'f' and fn.nspname = 'nestly' and f.relname in ('users', 'regular_profiles')
      and has_column_privilege('authenticated', t.oid, a.attnum, 'SELECT')),
  0::bigint, '[F3.0-b c12] no readable column of the reactions table points at a user');

-- only active likers count: suspend / ban removes, reactivation restores
select pg_temp.reset();
select set_config('t.sp', pg_temp.post('a')::text, true);
select tests.fx_rx_add(pg_temp.id('b'), current_setting('t.sp')::uuid);
select tests.fx_rx_add(pg_temp.id('c'), current_setting('t.sp')::uuid);
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid), '2', '[F3.0-b c12 A&D 3] two active likers: count 2');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid) || pg_temp.rxs('c', current_setting('t.sp')::uuid), '11', '[F3.0-b c12 A&D 3] a suspended liker no longer counts');
select tests.set_status(pg_temp.id('b'), 'banned');
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid), '1', '[F3.0-b c12 A&D 3] nor a banned one');
select tests.set_status(pg_temp.id('b'), 'active');
select is(pg_temp.rxs('a', current_setting('t.sp')::uuid), '2', '[F3.0-b c12 A&D 3] reactivation restores the like');
select is(pg_temp.n('b', format('nestly.reaction_owners where target_id = %L', current_setting('t.sp'))), '1', '[F3.0-b c12] and the liker reads their own owner row again');

-- =====================================================================================================================
-- c13 -- deleting a comment and a post with what hangs on them (3א)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.dp', pg_temp.post('a')::text, true);
select set_config('t.dc', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.dp')::uuid, 'doomed')::text, true);
select set_config('t.dr', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.dp')::uuid, 'doomed reply', current_setting('t.dc')::uuid)::text, true);
select set_config('t.keep', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.dp')::uuid, 'kept')::text, true);
select tests.fx_rx_add(pg_temp.id('a'), null, current_setting('t.dc')::uuid);
select tests.fx_rx_add(pg_temp.id('a'), null, current_setting('t.dr')::uuid);
select tests.fx_rx_add(pg_temp.id('a'), null, current_setting('t.keep')::uuid);
select set_config('t.m0', tests.fx_cm_count()::text, true), set_config('t.x0', tests.fx_rx_count()::text, true);
select is(pg_temp.fn('a', format('select nestly.delete_comment(%L)::text', current_setting('t.dc'))), '0', '[F3.0-b c13] a user who is not the commenter deletes 0 comments');
select is(pg_temp.fn('c', format('select nestly.delete_comment(%L)::text', current_setting('t.dc'))), '0', '[F3.0-b c13] nor does another commenter');
select is(tests.fx_cm_state(current_setting('t.dc')::uuid) ~ '^status=active', true, '[F3.0-b c13] it is untouched');
select is(pg_temp.fn('b', format('select nestly.delete_comment(%L)::text', current_setting('t.dc'))), '1', '[F3.0-b c13 3א] the commenter deletes their comment (no open report)');
select is(tests.fx_cm_state(current_setting('t.dc')::uuid), null, '[F3.0-b c13] the row is gone');
select is(tests.fx_cm_state(current_setting('t.dr')::uuid), null, '[F3.0-b c13] and its reply');
select is(tests.fx_cm_count(), current_setting('t.m0')::bigint - 2, '[F3.0-b c13] and nothing else');
select is(tests.fx_rx_count(), current_setting('t.x0')::bigint - 2, '[F3.0-b c13] the likes on the comment and on the reply went with them');
select is(tests.fx_ro_count(), tests.fx_rx_count(), '[F3.0-b c13] and their owner rows (no orphan either way)');
select is(pg_temp.fn('b', format('select nestly.delete_comment(%L)::text', current_setting('t.dc'))), '0', '[F3.0-b c13] deleting again changes 0 rows');
select is(pg_temp.fn('c', format('select nestly.delete_comment(%L)::text', gen_random_uuid())), '0', '[F3.0-b c13] and a random id changes 0');
select ok(pg_temp.refused(tests.as_role('anon', tests.claims(pg_temp.id('b')), format('select nestly.delete_comment(%L)::text', current_setting('t.keep')))), '[F3.0-b c13 rule 3] anon cannot call it');
select is(tests.fx_cm_state(current_setting('t.keep')::uuid) ~ '^status=active', true, '[F3.0-b c13] and the other comment is untouched');
select tests.set_status(pg_temp.id('c'), 'suspended');
select is(pg_temp.fn('c', format('select nestly.delete_comment(%L)::text', current_setting('t.keep'))), '0', '[F3.0-b c13 rule 15] a suspended commenter deletes nothing');
select tests.set_status(pg_temp.id('c'), 'active');
select is(pg_temp.dml('c', format($q$ delete from nestly.comments where id = %L $q$, current_setting('t.keep'))), 'OK:1', '[F3.0-b c13] a plain delete of one''s own unreported comment works too');

-- the real author's comment on their anonymous post: only they delete it
select pg_temp.reset();
select set_config('t.ap2', pg_temp.post('a', 'everyone', true)::text, true);
select set_config('t.ac', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.ap2')::uuid, 'anon author says')::text, true);
select is(pg_temp.fn('b', format('select nestly.delete_comment(%L)::text', current_setting('t.ac'))), '0', '[F3.0-b c13 c11] another user cannot delete the author''s comment on an anonymous post');
select is(pg_temp.fn('a', format('select nestly.delete_comment(%L)::text', current_setting('t.ac'))), '1', '[F3.0-b c13 c11] the real author can');

-- a post: comments, replies, likes (and their owners) go; shares stay
select pg_temp.reset();
select set_config('t.gp', pg_temp.post('a')::text, true);
select set_config('t.gs', tests.fx_po_add(pg_temp.id('b'), 'everyone', false, 'active', 'b shares', null, current_setting('t.gp')::uuid)::text, true);
select set_config('t.g1', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.gp')::uuid, 'g1')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.gp')::uuid, 'g1 reply', current_setting('t.g1')::uuid);
select tests.fx_rx_add(pg_temp.id('b'), current_setting('t.gp')::uuid);
select tests.fx_rx_add(pg_temp.id('c'), null, current_setting('t.g1')::uuid);
select set_config('t.m1', tests.fx_cm_count()::text, true), set_config('t.x1', tests.fx_rx_count()::text, true), set_config('t.o1', tests.fx_ro_count()::text, true);
select is(pg_temp.fn('b', format('select nestly.delete_post(%L)::text', current_setting('t.gp'))), '0', '[F3.0-b c13] a non-author deletes 0 posts');
select is(pg_temp.fn('a', format('select nestly.delete_post(%L)::text', current_setting('t.gp'))), '1', '[F3.0-b c13 3א] the author deletes their post (no open report)');
select is(tests.fx_po_state(current_setting('t.gp')::uuid), null, '[F3.0-b c13] the row is gone');
select is(tests.fx_cm_count(), current_setting('t.m1')::bigint - 2, '[F3.0-b c13] its comment and the reply went with it');
select is(tests.fx_rx_count(), current_setting('t.x1')::bigint - 2, '[F3.0-b c13] and the likes on the post and on its comment');
select is(tests.fx_ro_count(), current_setting('t.o1')::bigint - 2, '[F3.0-b c13] with their owner rows');
select ok(tests.fx_po_state(current_setting('t.gs')::uuid) ~ 'share=t:null', '[F3.0-b c13 9] the share of the deleted post remains');
select is(pg_temp.fn('a', format('select nestly.delete_post(%L)::text', current_setting('t.gp'))), '0', '[F3.0-b c13] deleting twice changes 0 rows');
select ok(pg_temp.refused(tests.as_role('anon', tests.claims(pg_temp.id('a')), format('select nestly.delete_post(%L)::text', current_setting('t.gs')))), '[F3.0-b c13 rule 3] anon cannot call it');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.fn('b', format('select nestly.delete_post(%L)::text', current_setting('t.gs'))), '0', '[F3.0-b c13 rule 15] a suspended author deletes nothing');
select tests.set_status(pg_temp.id('b'), 'active');
select is(tests.fx_po_state(current_setting('t.gs')::uuid) ~ '^status=active', true, '[F3.0-b c13] and the post is untouched');

select * from finish();

rollback;
