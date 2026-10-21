-- pgTAP, run by pg_prove as app_server (CI `db` job, I3 F3.2 feed-view: the 6b names policy on nestly.regular_names).
-- Source of expected values: .work/feed-view/spec.md (6b line: a reader sees the full name of the author of every named post the reader
-- can read; never through an anonymous post; shares: the sharer always, the original's author only when the original is readable)
-- and schema.md "pgTAP for TEST ENGINEER" (11 items), not the migration text. Every read runs as app_server under SET LOCAL ROLE
-- authenticated (tests.as_role). Everything rolls back.
-- People: A = 'Alice Aaron' (author, 10_), V = 10_'s b 'Bella Baruch' (the reader), C = 'Cora Third' (60_: the Friend / sharer / commenter).
-- File 62 ("a stranger reads no name") writes no post, so its fixtures are unchanged by this policy.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F3.2-a c12 6b] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'v' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'c' then tests.fx_fr_id('fr_c') end
$f$;
create function pg_temp.fn(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
-- how many name rows of p_target the reader sees: '0' or '1' (or 'ERR:<sqlstate>')
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
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false, p_shared uuid default null) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon, 'active', 'post body', null, p_shared)
$f$;

-- =====================================================================================================================
-- 1 structure
-- =====================================================================================================================
select is((select count(*) from pg_catalog.pg_policies where schemaname = 'nestly' and tablename = 'regular_names'), 18::bigint,
  '[F3.2-a c12 6b] regular_names has exactly eighteen policies (I12''s listing owner''s name read, file 99; I10''s three group name reads, file 96; I8''s three chat reads and its Support read, file 94; the earlier five, I4''s staff and reveal reads, regular_names_select_search for People Search, file 90, and the restrictive block policy and the blocker''s read, file 91)');
select is((select permissive || '/' || cmd || '/' || roles::text from pg_catalog.pg_policies
            where schemaname = 'nestly' and tablename = 'regular_names' and policyname = 'regular_names_select_post_reader'),
  'PERMISSIVE/SELECT/{authenticated}', '[F3.2-a c12 6b] the post-reader policy exists: permissive, SELECT, TO authenticated only');
select ok((select qual ~ 'is_active_account' from pg_catalog.pg_policies
            where schemaname = 'nestly' and tablename = 'regular_names' and policyname = 'regular_names_select_post_reader'),
  '[F3.2-a c12 6b rule 15] the post-reader policy is gated by is_active_account()');
select is((select count(*) from tests.approved_security_definer() as a where a ~ 'regular_names'), 0::bigint,
  '[F3.2-a c12 6b platform r10] the approved definer list gains nothing for regular_names');

-- =====================================================================================================================
-- 2 recursion guard
-- =====================================================================================================================
select is((select count(*) from pg_catalog.pg_policies
            where tablename <> 'regular_names' and (coalesce(qual, '') ~* 'regular_names' or coalesce(with_check, '') ~* 'regular_names')),
  0::bigint, '[F3.2-a c12 6b] no policy on any other table reads regular_names (no recursion through posts, friendships, hides, reports, post_authors)');
select is((select count(*) from pg_catalog.pg_policies
            where tablename = 'posts' and (coalesce(qual, '') ~* '(comments|reactions)' or coalesce(with_check, '') ~* '(comments|reactions)')),
  0::bigint, '[F3.2-a c12 6b] no policy on posts reads comments or reactions');
select pg_temp.reset();
select pg_temp.post('a');
select ok(pg_temp.nm('v', 'a') in ('0', '1'), '[F3.2-a c12 6b] a name read as a reader returns a count and raises no error (no 42P17 infinite recursion)');

-- =====================================================================================================================
-- 3 a stranger reads the name of an author of a readable named post
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b] stranger V reads no name of A before A posts');
select pg_temp.post('a');
select is(pg_temp.nm('v', 'a'), '1', '[F3.2-a c12 6b] stranger V reads A''s name once A has an active everyone named post');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('v')), format($q$ select full_name from nestly.regular_names where user_id = %L $q$, pg_temp.id('a'))),
  'Alice Aaron', '[F3.2-a c12 6b] and it is the full name');
select is(pg_temp.nm('v', 'c'), '0', '[F3.2-a c12 6b] V still reads no name of C, who has no post');

-- =====================================================================================================================
-- 4 friends-only post: names follow the post
-- =====================================================================================================================
select pg_temp.reset();
select pg_temp.post('a', 'friends');
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b] A''s only post is friends-only: stranger V reads no name');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.nm('c', 'a'), '1', '[F3.2-a c12 6b] the Friend reads A''s name');
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b] and V, still a stranger, does not');

-- =====================================================================================================================
-- 5 anonymous posts never open a name
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.ap', pg_temp.post('a', 'everyone', true)::text, true);
select is(tests.n_as(pg_temp.id('v'), format('nestly.posts where id = %L', current_setting('t.ap'))), '1', '[F3.2-a c12 6b] control: V reads the anonymous post itself');
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b BR-062] A''s only post is anonymous: V reads no name of A');
select is(tests.n_as(pg_temp.id('v'), 'nestly.post_authors'), '0', '[F3.2-a c12 6b rule 20] and no post_authors row (the real author stays hidden)');
select tests.fx_cm_add(pg_temp.id('a'), current_setting('t.ap')::uuid, 'a comment by the anonymous author');
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b BR-062] A also comments on the anonymous post: V still reads no name of A');
select is(tests.n_as(pg_temp.id('v'), 'nestly.post_authors'), '0', '[F3.2-a c12 6b rule 20] still no post_authors row');
select is(pg_temp.nm('a', 'a'), '1', '[F3.2-a c12 6b] A reads A''s own name, as before');

-- =====================================================================================================================
-- 6 mixed: one anonymous, one named
-- =====================================================================================================================
select pg_temp.reset();
select pg_temp.post('a', 'everyone', true);
select set_config('t.np', pg_temp.post('a')::text, true);
select is(pg_temp.nm('v', 'a'), '1', '[F3.2-a c12 6b] A has one anonymous and one named post: V reads the name (through the named one)');
select is(pg_temp.fn('a', format('select nestly.delete_post(%L)::text', current_setting('t.np'))), '1', '[F3.2-a c12 6b] control: A deletes the named post');
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b] the named post gone, only the anonymous one left: V reads no name');

-- =====================================================================================================================
-- 7 shares
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.orig', pg_temp.post('a')::text, true);
select set_config('t.share', pg_temp.post('c', 'everyone', false, current_setting('t.orig')::uuid)::text, true);
select is(pg_temp.nm('v', 'c') || pg_temp.nm('v', 'a'), '11', '[F3.2-a c12 6b] C shares A''s readable original: V reads the sharer''s name and the original author''s name');
select is(pg_temp.dml('a', format($q$ update nestly.posts set audience = 'friends' where id = %L $q$, current_setting('t.orig'))), 'OK:1', '[F3.2-a c12 6b] A edits the original to friends-only');
select is(pg_temp.nm('v', 'c') || pg_temp.nm('v', 'a'), '10', '[F3.2-a c12 6b] V (not A''s Friend) reads the sharer''s name, no longer the original author''s');
select is(tests.n_as(pg_temp.id('v'), format('nestly.posts where id = %L', current_setting('t.share'))), '1', '[F3.2-a c12 6b] the share stays readable');
select is(pg_temp.dml('a', format($q$ update nestly.posts set audience = 'everyone' where id = %L $q$, current_setting('t.orig'))), 'OK:1', '[F3.2-a c12 6b] A makes it public again');
select is(pg_temp.nm('v', 'a'), '1', '[F3.2-a c12 6b] control: public again, V reads A''s name');
select is(pg_temp.fn('a', format('select nestly.delete_post(%L)::text', current_setting('t.orig'))), '1', '[F3.2-a c12 6b] A deletes the original');
select is(pg_temp.nm('v', 'c') || pg_temp.nm('v', 'a'), '10', '[F3.2-a c12 6b] original deleted: only the sharer''s name');
select is(tests.n_as(pg_temp.id('v'), format('nestly.posts where id = %L', current_setting('t.share'))), '1', '[F3.2-a c12 6b] and the share is still listed');

-- =====================================================================================================================
-- 8 eligibility carried by the post
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.hp', pg_temp.post('a')::text, true);
select is(pg_temp.nm('v', 'a'), '1', '[F3.2-a c12 6b] control: V reads A''s name');
select tests.fx_ph_add(pg_temp.id('v'), current_setting('t.hp')::uuid);
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b Afik 18.10] V hid A''s only post: V reads no name of A');
select is(pg_temp.nm('c', 'a'), '1', '[F3.2-a c12 6b] the hide is V''s alone: C still reads A''s name');

select pg_temp.reset();
select tests.fx_rp_add(pg_temp.id('v'), 'post', pg_temp.post('a'));
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b Afik 18.10] V reported A''s only post (hidden from its reporter): V reads no name of A');

select pg_temp.reset();
select pg_temp.post('a');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b DR-5] A suspended: V reads no name of A');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.nm('v', 'a'), '1', '[F3.2-a c12 6b DR-5] A active again: the name is back');

select pg_temp.reset();
select set_config('t.held', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('c'), 'post', current_setting('t.held')::uuid);
select is(pg_temp.fn('a', format('select nestly.delete_post(%L)::text', current_setting('t.held'))), '1', '[F3.2-a c12 6b BR-065] control: A''s post under an open report is held on delete');
select ok(tests.fx_po_state(current_setting('t.held')::uuid) like 'status=deleted%', '[F3.2-a c12 6b BR-065] control: the post is actually held (kept, marked deleted)');
select is(pg_temp.nm('v', 'a'), '0', '[F3.2-a c12 6b BR-065] A''s only post is held: V reads no name of A');

-- =====================================================================================================================
-- 9 viewer state
-- =====================================================================================================================
select pg_temp.reset();
select pg_temp.post('a');
select pg_temp.post('c');
select tests.set_status(pg_temp.id('v'), 'suspended');
select is(tests.n_as(pg_temp.id('v'), 'nestly.regular_names'), '0', '[F3.2-a c12 6b rule 15] V suspended reads no name of any user, not even its own');
select tests.set_status(pg_temp.id('v'), 'active');
select is(pg_temp.nm('v', 'a') || pg_temp.nm('v', 'c') || pg_temp.nm('v', 'v'), '111', '[F3.2-a c12 6b] V active again: the two authors and V''s own name');
select pg_temp.reset();
select is(pg_temp.nm('a', 'a'), '1', '[F3.2-a c12 6b] A with no post reads its own name');
select is(tests.n_as(pg_temp.id('a'), 'nestly.regular_names'), '1', '[F3.2-a c12 6b] and only its own (nobody else posted)');

-- =====================================================================================================================
-- 10 commenters: superseded by Afik Q7 B (19.10) — a commenter's name follows the readable comment (file 81)
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.cp', pg_temp.post('a')::text, true);
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.cp')::uuid, 'a comment by C');
select is(tests.n_as(pg_temp.id('v'), format('nestly.comments where post_id = %L', current_setting('t.cp'))), '1', '[F3.2-a c12 6b] control: V reads C''s comment');
select is(pg_temp.nm('v', 'c'), '1', '[F3.2-a c12 6b Q7 B F3.4 N1] C has no post but V reads C''s comment: V reads C''s name through it (was 0 under default A)');
select is(pg_temp.nm('v', 'a'), '1', '[F3.2-a c12 6b] V reads the post author''s name');

-- =====================================================================================================================
-- 11 profile_view regression (file 63): the target's friends list does not grow from public posts
-- =====================================================================================================================
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select set_config('t.pv0', coalesce(tests.as_role('authenticated', tests.claims(pg_temp.id('v')),
  format($q$ select (to_jsonb(r) -> 'friends')::text from nestly.profile_view(%L) r $q$, pg_temp.id('a')::text)), 'null'), true);
select pg_temp.post('a');
select pg_temp.post('c');
select is(coalesce(tests.as_role('authenticated', tests.claims(pg_temp.id('v')),
  format($q$ select (to_jsonb(r) -> 'friends')::text from nestly.profile_view(%L) r $q$, pg_temp.id('a')::text)), 'null'), current_setting('t.pv0'),
  '[F3.2-a c12 6b 63] a stranger''s profile_view of A returns the same friends list after A and C have public posts');

select * from finish();

rollback;
