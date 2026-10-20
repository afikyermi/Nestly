-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.4 N1 / PR-A2: nestly.regular_names_select_comment_reader, Afik 19.10 Q7 B).
-- Source of expected values: .work/anonymous-post/spec.md c9 and .work/i3-rest-schema/schema.md N1, not the migration text.
-- A reader sees the full name of a user who wrote a comment or reply the reader can read; a NULL author_id ("המחבר") grants nothing.
-- Every read runs as app_server under SET LOCAL ROLE authenticated (tests.as_role). Everything rolls back.
-- People: A = 'Alice Aaron' (post author), V = 'Bella Baruch' (stranger reader), C = 'Cora Third' (commenter, 60_ fixture).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.4-a c9 N1] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'v' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'c' then tests.fx_fr_id('fr_c') end
$f$;
create function pg_temp.nm(p_reader text, p_target text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_reader), format('nestly.regular_names where user_id = %L', pg_temp.id(p_target)))
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  perform tests.fx_feed_clear();
  foreach w in array array['a', 'v', 'c', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  foreach w in array array['a', 'v', 'c'] loop perform tests.set_status(pg_temp.id(w), 'active'); end loop;
end
$f$;
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon, 'active', 'post body', null, null)
$f$;

-- =====================================================================================================================
-- 1 structure and recursion guard
-- =====================================================================================================================
select is((select count(*) from pg_catalog.pg_policies where schemaname = 'nestly' and tablename = 'regular_names'), 10::bigint,
  '[F3.4-a c9 N1] regular_names has exactly ten policies (I4 adds the staff and reveal reads; People Search the eighth, file 90; the restrictive block policy and the blocker''s read, file 91)');
select is((select permissive || '/' || cmd || '/' || roles::text from pg_catalog.pg_policies
            where schemaname = 'nestly' and tablename = 'regular_names' and policyname = 'regular_names_select_comment_reader'),
  'PERMISSIVE/SELECT/{authenticated}', '[F3.4-a c9 N1] the comment-reader policy exists: permissive, SELECT, TO authenticated only');
select ok((select qual ~ 'is_active_account' from pg_catalog.pg_policies
            where schemaname = 'nestly' and tablename = 'regular_names' and policyname = 'regular_names_select_comment_reader'),
  '[F3.4-a c9 N1 rule 15] the policy is gated by is_active_account()');
select is((select count(*) from pg_catalog.pg_policies
            where tablename <> 'regular_names' and (coalesce(qual, '') ~* 'regular_names' or coalesce(with_check, '') ~* 'regular_names')),
  0::bigint, '[F3.4-a c9 N1] no policy on any other table mentions regular_names (no recursion through comments, posts, friendships, hides, reports, post_authors)');
select is((select count(*) from tests.approved_security_definer() as a where a ~ 'regular_names'), 0::bigint,
  '[F3.4-a c9 N1] the approved definer list gains nothing for regular_names');
select pg_temp.reset();
select set_config('t.p1', pg_temp.post('a')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p1')::uuid, 'by C');
select ok(pg_temp.nm('v', 'c') in ('0', '1'), '[F3.4-a c9 N1] a name read as a reader returns a count and raises no error (no 42P17 infinite recursion)');

-- =====================================================================================================================
-- 2 the promise: S reads C's name through a readable comment or reply on an everyone post
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.p1', pg_temp.post('a')::text, true);
select is(pg_temp.nm('v', 'c'), '0', '[F3.4-a c9] stranger V reads no name of C before C comments');
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p1')::uuid, 'by C');
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] V reads C''s name once V can read C''s comment');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('v')), format($q$ select full_name from nestly.regular_names where user_id = %L $q$, pg_temp.id('c'))),
  'Cora Third', '[F3.4-a c9] and it is the full name');
select is(pg_temp.nm('v', 'a'), '1', '[F3.4-a c9] control: the named post''s author is readable as before');

select pg_temp.reset();
select set_config('t.p2', pg_temp.post('a')::text, true);
select set_config('t.t2', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.p2')::uuid, 'top by A')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p2')::uuid, 'reply by C', current_setting('t.t2')::uuid);
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] a reply counts the same: V reads the name of a user whose only contribution is a reply');

-- =====================================================================================================================
-- 3 the name follows the comment: zero rows when the comment is not readable
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.p3', pg_temp.post('a')::text, true);
select set_config('t.c3', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p3')::uuid, 'by C')::text, true);
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] control: V reads C''s name');
select tests.fx_fv_cs(current_setting('t.c3')::uuid, 'deleted');
select is(pg_temp.nm('v', 'c'), '0', '[F3.4-a c9] C''s only comment is deleted: V reads no name of C');
select tests.fx_fv_cs(current_setting('t.c3')::uuid, 'active');
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] active again: the name is back');
select tests.fx_rp_add(pg_temp.id('a'), 'comment', current_setting('t.c3')::uuid);
select tests.fx_fv_cs(current_setting('t.c3')::uuid, 'deleted');
select is(pg_temp.nm('v', 'c'), '0', '[F3.4-a c9] C''s only comment is held (deleted under an open report): V reads no name of C');

select pg_temp.reset();
select set_config('t.p3', pg_temp.post('a')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p3')::uuid, 'by C');
select tests.set_status(pg_temp.id('c'), 'suspended');
select is(pg_temp.nm('v', 'c'), '0', '[F3.4-a c9] C suspended: V reads no name of C');
select tests.set_status(pg_temp.id('c'), 'active');
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] C active again: the name is back');

select pg_temp.reset();
select set_config('t.p4', pg_temp.post('a', 'friends')::text, true);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p4')::uuid, 'by C on a friends post');
select is(pg_temp.nm('v', 'c'), '0', '[F3.4-a c9] the post is friends-only and V is a stranger: V reads no name of C');
select is(pg_temp.nm('a', 'c'), '1', '[F3.4-a c9] control: A, C''s friend, reads it');

select pg_temp.reset();
select set_config('t.p5', pg_temp.post('a')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p5')::uuid, 'by C');
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] control: V reads C''s name');
select tests.fx_ph_add(pg_temp.id('v'), current_setting('t.p5')::uuid);
select is(pg_temp.nm('v', 'c'), '0', '[F3.4-a c9] V hid the post: V reads no name of C through it');
select is(pg_temp.nm('a', 'c'), '1', '[F3.4-a c9] the hide is V''s alone: A still reads C''s name');

select pg_temp.reset();
select set_config('t.p6', pg_temp.post('a')::text, true);
select set_config('t.c6', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p6')::uuid, 'first')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p6')::uuid, 'second');
select tests.fx_fv_cs(current_setting('t.c6')::uuid, 'deleted');
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] C still has another readable comment: the name stays');

-- =====================================================================================================================
-- 4 a "המחבר" comment (author_id NULL) grants nothing
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.ap', pg_temp.post('a', 'everyone', true)::text, true);
select set_config('t.ac', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.ap')::uuid, 'the author speaks')::text, true);
select ok(tests.fx_cm_state(current_setting('t.ac')::uuid) ~ 'author=null', '[F3.4-a c9] control: the author''s comment on the anonymous post has author_id NULL');
select is(tests.n_as(pg_temp.id('v'), format('nestly.comments where post_id = %L', current_setting('t.ap'))), '1', '[F3.4-a c9] control: V reads that comment');
select is(pg_temp.nm('v', 'a'), '0', '[F3.4-a c9 BR-062] A''s only contribution is the anonymous post and its "המחבר" comment: V reads 0 rows for A');
select is(tests.n_as(pg_temp.id('v'), 'nestly.post_authors'), '0', '[F3.4-a c9 rule 20] and 0 post_authors rows');
select tests.fx_cm_add(pg_temp.id('a'), current_setting('t.ap')::uuid, 'the author replies', current_setting('t.ac')::uuid);
select is(pg_temp.nm('v', 'a'), '0', '[F3.4-a c9 BR-062] a "המחבר" reply changes nothing');
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.ap')::uuid, 'a reader speaks');
select is(pg_temp.nm('v', 'c'), '1', '[F3.4-a c9] but a named commenter on the anonymous post is named');
select is(pg_temp.nm('v', 'a'), '0', '[F3.4-a c9 BR-062] and A is still not');

-- =====================================================================================================================
-- 5 viewer state
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.p7', pg_temp.post('a')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p7')::uuid, 'by C');
select tests.set_status(pg_temp.id('v'), 'suspended');
select is(tests.n_as(pg_temp.id('v'), 'nestly.regular_names'), '0', '[F3.4-a c9 rule 15] V suspended reads no name at all');
select tests.set_status(pg_temp.id('v'), 'active');
select is(tests.n_as(gen_random_uuid(), 'nestly.regular_names'), '0', '[F3.4-a c9] an identity that is no account reads no name');

select * from finish();

rollback;
