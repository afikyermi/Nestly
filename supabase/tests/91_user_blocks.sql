-- pgTAP, run by pg_prove as app_server (CI `db` job, I4: blocking a user, FR-REL-002).
-- Source of expected values: the SRS (FR-REL-002: mutual, hides posts, comments and profile both ways, ends the Friendship), not the migration text.
-- People: a, b (Regular), c = fr_c (Regular, not part of any block), s = suspended, p = Professional, fr_m = Moderator.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F4.1-a c1 I4-blk fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p') when 's' then tests.fx_id('s')
    when 'c' then tests.fx_fr_id('fr_c') when 'm' then tests.fx_fr_id('fr_m')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.block(p_by text, p_whom text) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.user_blocks (blocked_id) values (%L) $q$, pg_temp.id(p_whom)))
$f$;
create function pg_temp.sees_post(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select count(*)::text from nestly.posts where id = %L $q$, p_post))
$f$;
create function pg_temp.sees_comment(p_who text, p_c uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select count(*)::text from nestly.comments where id = %L $q$, p_c))
$f$;
create function pg_temp.sees_name(p_who text, p_of text) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id(p_of)))
$f$;

-- ---- structure ---------------------------------------------------------------------------------------------------------
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = 'user_blocks'), '[I4-blk c1] user_blocks has RLS enabled and forced');
select is((select string_agg(pl.polname || ':' || pl.polcmd::text || ':' || (case when pl.polpermissive then 'p' else 'r' end), ', ' order by pl.polname)
           from pg_policy pl join pg_class c on c.oid = pl.polrelid where c.relname = 'user_blocks' and c.relnamespace = (select oid from pg_namespace where nspname = 'nestly')),
  'user_blocks_delete_blocker:d:p, user_blocks_insert_blocker:a:p, user_blocks_select_party:r:p, user_blocks_select_scoped:r:p',
  '[I4-blk c1] the four policies of user_blocks');
select is((select p.prosecdef from pg_proc p where p.proname = 'is_blocked_pair' and p.pronamespace = (select oid from pg_namespace where nspname = 'nestly')), false, '[I4-blk c2] is_blocked_pair is SECURITY INVOKER');
select is((select string_agg(c.relname || '.' || pl.polname, ', ' order by pl.polname) from pg_policy pl join pg_class c on c.oid = pl.polrelid where not pl.polpermissive and pl.polname like '%block%'),
  'comments.comments_block_hide, friendships.friendships_block_insert, friendships.friendships_block_update, posts.posts_block_hide, profile_photos.profile_photos_block_hide, regular_names.regular_names_block_hide, regular_names.regular_names_block_hide_owner, regular_profiles.regular_profiles_block_hide_owner, stories.stories_block_hide',
  '[I4-blk c2] the RESTRICTIVE hiding policies: blocking''s seven and I5''s two on Stories and profile photos (file 93)');
select is((select pl.polpermissive::text || ':' || pl.polcmd::text from pg_policy pl where pl.polname = 'regular_names_select_blocker'), 'true:r', '[I4-blk c2] the blocker''s read of its blocked list is a permissive SELECT');

-- ---- who may block ------------------------------------------------------------------------------------------------------
select is(pg_temp.block('a', 'b'), 'OK:1', '[I4-blk c3 FR-REL-002] an active account blocks another');
select is(pg_temp.block('a', 'b'), 'ERR:23505', '[I4-blk c3] a second block of the same account reaches the primary key (23505)');
select is(pg_temp.block('a', 'a'), 'ERR:23514', '[I4-blk c3] a block of oneself is refused (check constraint)');
select is(pg_temp.dml('b', format($q$ insert into nestly.user_blocks (blocker_id, blocked_id) values (%L, %L) $q$, pg_temp.id('a'), pg_temp.id('c'))),
  'ERR:42501', '[I4-blk c3] a block written in another account''s name is refused');
select is(pg_temp.block('s', 'c'), 'ERR:42501', '[I4-blk c3] a suspended account cannot block');
select is(pg_temp.dml('a', format($q$ update nestly.user_blocks set blocked_id = %L $q$, pg_temp.id('c'))), 'ERR:42501', '[I4-blk c3] a block cannot be updated');
select is(pg_temp.n('a', 'select count(*)::text from nestly.user_blocks'), '1', '[I4-blk c4] the blocker reads the row');
select is(pg_temp.n('b', 'select count(*)::text from nestly.user_blocks'), '1', '[I4-blk c4] the blocked account reads the row too (the database needs it to hide both ways)');
select is(pg_temp.n('c', 'select count(*)::text from nestly.user_blocks'), '0', '[I4-blk c4] a third account reads nothing');
select is(pg_temp.dml('b', 'delete from nestly.user_blocks'), 'OK:0', '[I4-blk c5] the blocked account cannot lift the block (0 rows)');
select is(pg_temp.dml('c', 'delete from nestly.user_blocks'), 'OK:0', '[I4-blk c5] a third account cannot lift it (0 rows)');

-- ---- hiding, both ways ---------------------------------------------------------------------------------------------------
select set_config('t.pa', tests.fx_po_add(pg_temp.id('a'))::text, true);
select set_config('t.pb', tests.fx_po_add(pg_temp.id('b'))::text, true);
select set_config('t.pbanon', tests.fx_po_add(pg_temp.id('b'), 'everyone', true)::text, true);
select set_config('t.cb', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.pa')::uuid)::text, true);
select set_config('t.ca', tests.fx_cm_add(pg_temp.id('a'), current_setting('t.pb')::uuid)::text, true);
select set_config('t.pc', tests.fx_po_add(pg_temp.id('c'))::text, true);
select set_config('t.cbc', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.pc')::uuid)::text, true);

select is(pg_temp.sees_post('a', current_setting('t.pb')::uuid), '0', '[I4-blk c6 FR-REL-002] the blocker does not see the blocked account''s post');
select is(pg_temp.sees_post('b', current_setting('t.pa')::uuid), '0', '[I4-blk c6 FR-REL-002] the blocked account does not see the blocker''s post');
select is(pg_temp.sees_post('a', current_setting('t.pa')::uuid), '1', '[I4-blk c6] each side still sees their own post');
select is(pg_temp.sees_post('c', current_setting('t.pa')::uuid) || pg_temp.sees_post('c', current_setting('t.pb')::uuid), '11', '[I4-blk c6] a third account sees both posts');
select is(pg_temp.sees_post('a', current_setting('t.pbanon')::uuid), '1', '[I4-blk c6] an anonymous post cannot be hidden (nobody can tell whose it is)');
select is(pg_temp.sees_comment('a', current_setting('t.cbc')::uuid), '0', '[I4-blk c7 FR-REL-002] the blocker does not see the blocked account''s comment on a third account''s post');
select is(pg_temp.sees_comment('b', current_setting('t.ca')::uuid), '0', '[I4-blk c7 FR-REL-002] the blocked account does not see the blocker''s comment either');
select is(pg_temp.sees_comment('c', current_setting('t.cbc')::uuid), '1', '[I4-blk c7] a third account sees that comment');
select is(pg_temp.sees_name('a', 'b'), '1', '[I4-blk c8] the blocker reads the blocked account''s name (its blocked list, to unblock)');
select is(pg_temp.sees_name('b', 'a'), '0', '[I4-blk c8] the blocked account does not read the blocker''s name');
select is(pg_temp.sees_name('a', 'a'), '1', '[I4-blk c8] a name of one''s own stays readable');
select is(pg_temp.sees_name('c', 'b'), '1', '[I4-blk c8] a third account reads a name by the usual rule (b posted a named post c can read)');

-- ---- the Friendship ends --------------------------------------------------------------------------------------------------
select pg_temp.dml('a', 'delete from nestly.user_blocks');
select is(pg_temp.n('a', 'select count(*)::text from nestly.user_blocks'), '0', '[I4-blk c9 FR-REL-002] unblocking removes the row');
select is(pg_temp.sees_post('a', current_setting('t.pb')::uuid) || pg_temp.sees_post('b', current_setting('t.pa')::uuid), '11', '[I4-blk c9] after an unblock both posts are visible again');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.block('b', 'a'), 'OK:1', '[I4-blk c10 FR-REL-002] b blocks a');
select is(tests.fx_fr_rows(pg_temp.id('a'), pg_temp.id('b')), 'a>b:removed', '[I4-blk c10 FR-REL-002] the block ends the Friendship');
select is(pg_temp.dml('a', format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('b'))), 'ERR:42501', '[I4-blk c11] no Friend Request across a block (either side)');
select is(pg_temp.dml('b', format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('a'))), 'ERR:42501', '[I4-blk c11] not from the blocker either');
select pg_temp.dml('b', 'delete from nestly.user_blocks');

select tests.fx_fr_purge(pg_temp.id('a'));
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('a'), 'pending');
select is(pg_temp.block('a', 'c'), 'OK:1', '[I4-blk c12] a blocks the sender of a pending request');
select is(tests.fx_fr_rows(pg_temp.id('c'), pg_temp.id('a')), 'a>b:declined', '[I4-blk c12] the request received is declined');
select pg_temp.dml('a', 'delete from nestly.user_blocks');
select tests.fx_fr_purge(pg_temp.id('a'));
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'pending');
select is(pg_temp.block('a', 'c'), 'OK:1', '[I4-blk c13] a blocks the addressee of their own pending request');
select is(tests.fx_fr_clock(tests.fx_fr_find(pg_temp.id('a'), pg_temp.id('c'))), 'resp=f canc=t rem=f', '[I4-blk c13] the request is cancelled');
select pg_temp.dml('a', 'delete from nestly.user_blocks');

-- ---- notifications, People Search and the profile exclude the pair, both ways -----------------------------------------------
select tests.fx_nt_purge();
select pg_temp.block('a', 'b');
select set_config('t.paanon', tests.fx_po_add(pg_temp.id('a'), 'everyone', true)::text, true);
select tests.fx_cm_add(pg_temp.id('b'), current_setting('t.paanon')::uuid);
select is(tests.fx_nt_count(pg_temp.id('a')), 0::bigint, '[I4-blk c15 FR-REL-002] a comment by the blocked account notifies nobody across the block');
select tests.fx_cm_add(pg_temp.id('a'), current_setting('t.pbanon')::uuid);
select is(tests.fx_nt_count(pg_temp.id('b')), 0::bigint, '[I4-blk c15] nor does a comment by the blocker on the blocked account''s post');
select tests.fx_cm_add(pg_temp.id('c'), current_setting('t.paanon')::uuid);
select is(tests.fx_nt_count(pg_temp.id('a')), 1::bigint, '[I4-blk c15] a third account''s comment still notifies');

create function pg_temp.found(p_who text, p_of text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ select count(*)::text from nestly.search_people(%L) r where r.user_id = %L $q$, tests.fx_rn_name(pg_temp.id(p_of)), pg_temp.id(p_of)))
$f$;
select is(pg_temp.found('b', 'a') || pg_temp.found('a', 'b'), '00', '[I4-blk c16 FR-REL-002] People Search does not find the other party of a block, both ways');
select is(pg_temp.found('c', 'a'), '1', '[I4-blk c16] a third account finds them');

create function pg_temp.pv(p_who text, p_of text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ select coalesce((select r.outcome from nestly.profile_view(%L) r), 'none') $q$, pg_temp.id(p_of)::text))
$f$;
select is(pg_temp.pv('b', 'a') || '/' || pg_temp.pv('a', 'b'), 'none/none', '[I4-blk c17 FR-REL-002] the profile of the other party of a block does not open, both ways');
select is(pg_temp.pv('c', 'a'), 'shown', '[I4-blk c17] a third account opens it');
select pg_temp.dml('a', 'delete from nestly.user_blocks');
select is(pg_temp.pv('b', 'a'), 'shown', '[I4-blk c17] after the unblock it opens again');

-- ---- moderation is never shielded by a block ------------------------------------------------------------------------------
select is(pg_temp.block('m', 'b'), 'ERR:42501', '[I4-blk c14] a staff account does not block (only Regular or Professional accounts do)');
select tests.fx_sf_grant(pg_temp.id('m'), array['REPORTS_VIEW']);
select is(pg_temp.dml('c', format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'spam') $q$, current_setting('t.pb'))), 'OK:1',
  '[I4-blk c14 fixture] c reports b''s post');
select is(pg_temp.dml('c', format($q$ insert into nestly.reports (target_kind, comment_id, reason) values ('comment', %L, 'spam') $q$, current_setting('t.cbc'))), 'OK:1',
  '[I4-blk c14 fixture] and b''s comment');
select is(pg_temp.block('b', 'm'), 'OK:1', '[I4-blk c14 fixture] b blocks the moderator''s account');
select is(pg_temp.sees_post('m', current_setting('t.pb')::uuid), '1', '[I4-blk c14] a moderator with REPORTS_VIEW still reads the reported post of b: a block cannot shield content from moderation');
select is(pg_temp.sees_comment('m', current_setting('t.cbc')::uuid), '1', '[I4-blk c14] and the reported comment');

select * from finish();
rollback;
