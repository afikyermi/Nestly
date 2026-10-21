-- pgTAP, run by pg_prove as app_server (CI `db` job): notifications, notification preferences and People Search.
-- Source of expected values: the SRS (FR-NOTIF-001/002/003, FR-SEARCH-001, FR-ALG-008, BR-035, BR-038, BR-044, BR-061, BR-063, VAL-037,
-- AC-040, AC-041, AC-042, AC-065, AC-074, AC-078, NFR-SEC-006; Afik 18.10.2026: 60 searches per hour), not the migration text.
-- People: A = 10_'s a (Alice Aaron), B = b (Bella Baruch), C = 60_'s fr_c (Cora Third, built below), P = Professional, S, X = suspended,
-- banned, D = 60_'s fr_d (Admin). Everything rolls back with the transaction. A refused write is 'ERR:<sqlstate>' or 'OK:0'.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F7.1-a c1 notif] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 's' then tests.fx_id('s') when 'x' then tests.fx_id('x') when 'c' then tests.fx_fr_id('fr_c')
    when 'd' then tests.fx_fr_id('fr_d')
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
create function pg_temp.post(p_author text, p_aud text default 'everyone', p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), p_aud, p_anon)
$f$;
create function pg_temp.nt(p_who text) returns bigint language sql as $f$ select tests.fx_nt_count(pg_temp.id(p_who)) $f$;
create function pg_temp.types(p_who text) returns text language sql as $f$ select tests.fx_nt_types(pg_temp.id(p_who)) $f$;
create function pg_temp.one(p_who text, p_type text) returns text language sql as $f$ select tests.fx_nt_one(pg_temp.id(p_who), p_type) $f$;
create function pg_temp.cm_sql(p_post uuid, p_body text, p_parent uuid default null) returns text language sql as $f$
  select format($q$ insert into nestly.comments (post_id, parent_id, body) values (%L, %L, %L) $q$, p_post, p_parent, p_body)
$f$;
create function pg_temp.fr_sql(p_addressee uuid) returns text language sql as $f$
  select format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, p_addressee)
$f$;
create function pg_temp.fr_set(p_req uuid, p_addr uuid, p_status text) returns text language sql as $f$
  select format($q$ update nestly.friendships set status = %L where requester_id = %L and addressee_id = %L $q$, p_status, p_req, p_addr)
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  perform tests.fx_nt_purge();
end
$f$;
-- one People Search: 'name/outcome|name/outcome' in the function's order, 'ERR:<sqlstate>' on a refusal, '' for no row
create function pg_temp.sp(p_who text, p_q text, p_limit int default 20, p_offset int default 0) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ select coalesce(string_agg(coalesce(r.full_name, '-') || '/' || r.outcome, '|' order by r.o), '')
                 from nestly.search_people(%L, %s, %s) with ordinality as r(user_id, full_name, outcome, o) $q$, p_q, p_limit, p_offset))
$f$;

-- =====================================================================================================================
-- Structure: the fence around the new tables and functions (platform rules 7-10, 15-17; AC-074)
-- =====================================================================================================================
select is(
  (select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('notifications', 'notification_preferences', 'friend_content_notification_preferences', 'people_search_counts')),
  'friend_content_notification_preferences:true:true, notification_preferences:true:true, notifications:true:true, people_search_counts:true:true',
  '[notif platform r8] the four new tables have RLS enabled and forced');

select set_eq(
  $$ select c.relname || '.' || pol.polname || '.' || pol.polcmd::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('notifications', 'notification_preferences', 'friend_content_notification_preferences', 'people_search_counts') $$,
  $$ values ('notifications.notifications_select_recipient.r'), ('notifications.notifications_update_recipient.w'),
            ('notifications.notifications_insert_notify.a'), ('notifications.notifications_select_notify.r'),
            ('notification_preferences.notification_preferences_select_own.r'), ('notification_preferences.notification_preferences_insert_own.a'),
            ('notification_preferences.notification_preferences_update_own.w'), ('notification_preferences.notification_preferences_select_notify.r'),
            ('friend_content_notification_preferences.friend_content_preferences_select_own.r'),
            ('friend_content_notification_preferences.friend_content_preferences_insert_own.a'),
            ('friend_content_notification_preferences.friend_content_preferences_update_own.w'),
            ('friend_content_notification_preferences.friend_content_preferences_select_notify.r'),
            ('people_search_counts.people_search_counts_select_search.r'), ('people_search_counts.people_search_counts_insert_search.a'),
            ('people_search_counts.people_search_counts_update_search.w') $$,
  '[notif platform r14] the policies on the four tables are exactly the approved ones: no client INSERT or DELETE on notifications, none on the counts');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('notifications', 'notification_preferences', 'friend_content_notification_preferences', 'people_search_counts')
        and pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')]::oid[]
        and pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'app_owner')]::oid[] $$,
  '[notif platform r4] every policy is TO authenticated or TO app_owner only (none for PUBLIC, anon, app_server)');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('notifications', 'notification_preferences', 'friend_content_notification_preferences')
        and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')]::oid[]
        and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
            !~ '(is_active_account|caller_account_type)\(\)' $$,
  '[notif platform r15] every policy for authenticated is gated by the caller''s own active account (is_active_account / caller_account_type)');

select is_empty(
  $$ select pol.polname from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
      where c.relname in ('notifications', 'notification_preferences', 'friend_content_notification_preferences', 'people_search_counts')
        and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'app_owner')]::oid[]
        and (coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
            !~ '(notify_scope|search_scope)\(\)' $$,
  '[notif platform r17] every TO app_owner policy opens only while a definer has declared its scope');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_attribute a
    where a.attrelid = (select oid from pg_catalog.pg_class where relname = 'notifications' and relnamespace = 'nestly'::regnamespace) and a.attnum > 0 and not a.attisdropped),
  'actor_id, created_at, id, is_critical, read_at, recipient_id, subject_id, target_id, target_kind, type',
  '[notif FR-NOTIF-001 AC-042] a notification stores who, what and where - no text, no content, no search or consumption data');

select is(
  (select string_agg(c.relname || ':' || has_table_privilege('authenticated', c.oid, 'SELECT')::text || '/' || has_table_privilege('authenticated', c.oid, 'INSERT')::text
                     || '/' || has_table_privilege('authenticated', c.oid, 'UPDATE')::text || '/' || has_table_privilege('authenticated', c.oid, 'DELETE')::text, ', ' order by c.relname)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('notifications', 'notification_preferences', 'friend_content_notification_preferences', 'people_search_counts')),
  'friend_content_notification_preferences:true/false/false/false, notification_preferences:true/false/false/false, notifications:true/false/false/false, people_search_counts:false/false/false/false',
  '[notif platform r7] authenticated holds SELECT on the three notification tables and no table-level write; the counts: nothing');

select is(
  (select string_agg(a.attname, ', ' order by a.attname)
     from pg_catalog.pg_attribute a
    where a.attrelid = (select oid from pg_catalog.pg_class where relname = 'notifications' and relnamespace = 'nestly'::regnamespace) and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
  'read_at',
  '[notif] the recipient may update read_at and nothing else on a notification');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
    where c.relname in ('notification_preferences', 'friend_content_notification_preferences') and c.relnamespace = 'nestly'::regnamespace
      and a.attnum > 0 and not a.attisdropped
      and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT') or has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE'))),
  'friend_content_notification_preferences.friend_id, friend_content_notification_preferences.is_enabled, notification_preferences.category, notification_preferences.is_in_app_enabled, notification_preferences.is_push_enabled',
  '[notif platform r12] the owner column is never granted: user_id always takes auth.uid()');

select is(
  (select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '/' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                     || '/' || has_function_privilege('app_server', p.oid, 'EXECUTE')::text, ', ' order by p.proname)
     from pg_catalog.pg_proc p
    where p.pronamespace = 'nestly'::regnamespace
      and p.proname in ('notify_friendship', 'notify_comment', 'notify_post', 'notify_deliver', 'notify_scope', 'search_scope', 'search_people')),
  'notify_comment:false/false/false, notify_deliver:false/false/false, notify_friendship:false/false/false, notify_post:false/false/false, notify_scope:false/false/false, search_people:true/false/false, search_scope:false/false/false',
  '[notif platform r17 AC-078] only search_people is executable (by authenticated); the notification triggers and helpers by no runtime role');

select is(
  (select string_agg(p.proname || ':' || r.rolname || ':' || p.prosecdef::text || ':' || coalesce((select 'path' from unnest(p.proconfig) cfg where cfg like 'search_path=%'), 'none'), ', ' order by p.proname)
     from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.pronamespace = 'nestly'::regnamespace and p.proname in ('notify_friendship', 'notify_comment', 'notify_post', 'notify_deliver', 'search_people')),
  'notify_comment:app_owner:true:path, notify_deliver:app_owner:false:path, notify_friendship:app_owner:true:path, notify_post:app_owner:true:path, search_people:app_owner:true:path',
  '[notif platform r10] the four definers are owned by app_owner with a fixed search_path; the delivery helper is SECURITY INVOKER');

select is(tests.fx_ns_limit(), '60/3600', '[search VAL-037 NFR-SEC-006 Afik 18.10] the People Search limit is seeded at 60 searches per 3600 seconds');
select is(pg_temp.fn('a', 'select count(*)::text from nestly.security_limits'), 'ERR:42501', '[search NFR-SEC-006] a signed-in account cannot read the Configuration');
select is(pg_temp.fn('a', 'select count(*)::text from nestly.people_search_counts'), 'ERR:42501', '[search] nor the search counts');

-- =====================================================================================================================
-- FR-NOTIF-003: friend requests
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('b', pg_temp.fr_sql(pg_temp.id('a'))), 'OK:1', '[notif] B sends A a Friend Request');
select is(pg_temp.types('a'), 'friend_request', '[notif FR-NOTIF-003] A is notified of the Friend Request');
select is(pg_temp.one('a', 'friend_request'), format('actor=%s target=user:%s critical=f read=f', pg_temp.id('b'), pg_temp.id('b')),
  '[notif FR-NOTIF-001] the notification names the sender and links to the sender, unread, not critical');
select is(pg_temp.nt('b'), 0::bigint, '[notif] the sender is not notified');
select is(pg_temp.dml('a', pg_temp.fr_set(pg_temp.id('b'), pg_temp.id('a'), 'declined')), 'OK:1', '[notif] A declines');
select is(pg_temp.nt('b'), 0::bigint, '[notif FR-REL-001] a decline is silent to the requester');
select is(pg_temp.dml('c', pg_temp.fr_sql(pg_temp.id('a'))), 'OK:1', '[notif] C sends A a Friend Request');
select is(pg_temp.dml('a', pg_temp.fr_set(pg_temp.id('c'), pg_temp.id('a'), 'accepted')), 'OK:1', '[notif] A accepts it');
select is(pg_temp.types('c'), 'friend_accepted', '[notif FR-NOTIF-003] C is notified that the request was accepted');
select is(pg_temp.one('c', 'friend_accepted'), format('actor=%s target=user:%s critical=f read=f', pg_temp.id('a'), pg_temp.id('a')),
  '[notif] the accepted notification names the accepting person');
select is(pg_temp.dml('a', pg_temp.fr_set(pg_temp.id('c'), pg_temp.id('a'), 'removed')), 'OK:1', '[notif] A removes the Friend');
select is(pg_temp.types('c'), 'friend_accepted', '[notif] removing a Friend creates no notification');

-- =====================================================================================================================
-- FR-NOTIF-003: comments and replies
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.p1', pg_temp.post('a')::text, true);
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p1')::uuid, 'top by b')), 'OK:1', '[notif] B comments on A''s post');
select is(pg_temp.one('a', 'post_comment'), format('actor=%s target=post:%s critical=f read=f', pg_temp.id('b'), current_setting('t.p1')),
  '[notif FR-NOTIF-003] the post''s author is notified, with a link to the post');
select is(pg_temp.nt('b'), 0::bigint, '[notif] the commenter is not notified');
select is(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.p1')::uuid, 'own comment')), 'OK:1', '[notif] A comments on their own post');
select is(pg_temp.nt('a'), 1::bigint, '[notif] nobody is notified of their own comment');
select set_config('t.c1', (select tests.fx_cm_id(current_setting('t.p1')::uuid, 'top by b'))::text, true);
select is(pg_temp.dml('c', pg_temp.cm_sql(current_setting('t.p1')::uuid, 'reply by c', current_setting('t.c1')::uuid)), 'OK:1', '[notif] C replies to B''s comment');
select is(pg_temp.types('b'), 'comment_reply', '[notif FR-NOTIF-003] the comment''s author is notified of the Reply');
select is(pg_temp.types('a'), 'post_comment,post_comment', '[notif] and the post''s author of the new comment on their post');
select is(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.p1')::uuid, 'reply by a', current_setting('t.c1')::uuid)), 'OK:1', '[notif] A replies to B''s comment');
select is(pg_temp.types('b'), 'comment_reply,comment_reply', '[notif] B is notified of A''s Reply');
select is(pg_temp.nt('a'), 2::bigint, '[notif] A, who is the post''s author and the replier, is not notified of their own reply');

-- an anonymous post: the real author is notified, and is named nowhere
select pg_temp.reset();
select set_config('t.an', pg_temp.post('a', 'everyone', true)::text, true);
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.an')::uuid, 'asks b')), 'OK:1', '[notif] B comments on an anonymous post');
select is(pg_temp.one('a', 'post_comment'), format('actor=%s target=post:%s critical=f read=f', pg_temp.id('b'), current_setting('t.an')),
  '[notif FR-FEED-005] the real author of an anonymous post is notified of the comment');
select set_config('t.c2', (select tests.fx_cm_id(current_setting('t.an')::uuid, 'asks b'))::text, true);
select is(pg_temp.dml('a', pg_temp.cm_sql(current_setting('t.an')::uuid, 'המחבר answers', current_setting('t.c2')::uuid)), 'OK:1', '[notif] the author answers under "המחבר"');
select is(pg_temp.one('b', 'comment_reply'), format('actor=- target=post:%s critical=f read=f', current_setting('t.an')),
  '[notif FR-FEED-005 AC-076] the Reply to B has no actor: it does not identify the anonymous author');
select is((select tests.fx_nt_actor_count(pg_temp.id('a'))), 0::bigint,
  '[notif] (control) no notification of the anonymous thread names A as its actor');

-- =====================================================================================================================
-- FR-NOTIF-003: shares and new posts of a Friend
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.o', pg_temp.post('a')::text, true);
select is(pg_temp.dml('b', format($q$ insert into nestly.posts (audience, shared_post_id) values ('everyone', %L) $q$, current_setting('t.o'))), 'OK:1', '[notif] B shares A''s post');
select is(pg_temp.types('a'), 'post_shared', '[notif FR-NOTIF-003 FR-FEED-006] the original''s author is notified of the share');
select is(pg_temp.nt('b'), 0::bigint, '[notif] the sharer is not notified');

select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select pg_temp.post('a');
select is(pg_temp.nt('c'), 0::bigint, '[notif FR-NOTIF-003] a Friend''s new post notifies nobody by default');
select tests.fx_nt_follow(pg_temp.id('c'), pg_temp.id('a'), true);
select set_config('t.f1', pg_temp.post('a')::text, true);
select is(pg_temp.one('c', 'friend_post'), format('actor=%s target=post:%s critical=f read=f', pg_temp.id('a'), current_setting('t.f1')),
  '[notif FR-NOTIF-003] after C chose to follow A, A''s new post notifies C');
select pg_temp.post('a', 'friends');
select is(pg_temp.nt('c'), 2::bigint, '[notif] a Friends-only post notifies the Friend too');
select pg_temp.post('a', 'everyone', true);
select is(pg_temp.nt('c'), 2::bigint, '[notif FR-FEED-005] an anonymous post notifies no one: no "new post of a Friend"');
select is(pg_temp.nt('b'), 0::bigint, '[notif] B, who did not choose to follow A, is not notified');
select tests.fx_nt_follow(pg_temp.id('c'), pg_temp.id('a'), false);
select pg_temp.post('a');
select is(pg_temp.nt('c'), 2::bigint, '[notif] after C switches it off, no more notifications from A');
select tests.fx_nt_follow(pg_temp.id('c'), pg_temp.id('a'), true);
select tests.fx_fr_purge(pg_temp.id('c'));
select pg_temp.post('a');
select is(pg_temp.nt('c'), 2::bigint, '[notif] a preference without a live Friendship notifies no one');

-- the friend-content preference itself
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select is(pg_temp.dml('c', format($q$ insert into nestly.friend_content_notification_preferences (friend_id) values (%L) $q$, pg_temp.id('a'))), 'OK:1',
  '[notif FR-NOTIF-003] C chooses to follow the new posts of a Friend');
select is(pg_temp.dml('c', format($q$ insert into nestly.friend_content_notification_preferences (friend_id) values (%L) $q$, pg_temp.id('b'))), 'ERR:42501',
  '[notif] ... not of someone who is not a Friend');
select is(pg_temp.dml('c', format($q$ insert into nestly.friend_content_notification_preferences (user_id, friend_id) values (%L, %L) $q$, pg_temp.id('b'), pg_temp.id('a'))), 'ERR:42501',
  '[notif platform r12] nor on behalf of another account (user_id is not grantable)');
select is(pg_temp.n('c', 'nestly.friend_content_notification_preferences'), '1', '[notif] C reads their own preference');
select is(pg_temp.n('b', 'nestly.friend_content_notification_preferences'), '0', '[notif] B reads none of it');
select is(pg_temp.dml('c', format($q$ update nestly.friend_content_notification_preferences set is_enabled = false where friend_id = %L $q$, pg_temp.id('a'))), 'OK:1',
  '[notif] C switches it off');
select is(pg_temp.dml('a', format($q$ update nestly.friend_content_notification_preferences set is_enabled = false where friend_id = %L $q$, pg_temp.id('a'))), 'OK:0',
  '[notif] A cannot change C''s preference');

-- =====================================================================================================================
-- FR-NOTIF-002: preferences (AC-041, BR-038, BR-061)
-- =====================================================================================================================
select pg_temp.reset();
select is(pg_temp.dml('a', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('comments', false) $q$), 'OK:1',
  '[notif AC-041] A switches the comments category off');
select set_config('t.p2', pg_temp.post('a')::text, true);
select pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p2')::uuid, 'muted comment'));
select is(pg_temp.nt('a'), 0::bigint, '[notif FR-NOTIF-002] a category switched off creates no notification');
select is(pg_temp.dml('b', pg_temp.fr_sql(pg_temp.id('a'))), 'OK:1', '[notif] B sends a Friend Request');
select is(pg_temp.types('a'), 'friend_request', '[notif] other categories are not affected');
select is(pg_temp.dml('a', $q$ update nestly.notification_preferences set is_in_app_enabled = true where category = 'comments' $q$), 'OK:1', '[notif] A switches comments back on');
select pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p2')::uuid, 'unmuted comment'));
select is(pg_temp.types('a'), 'friend_request,post_comment', '[notif] and notifications are created again');
select is(pg_temp.dml('a', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('security', false) $q$), 'ERR:23514',
  '[notif BR-038 AC-041] the security category cannot be switched off');
select is(pg_temp.dml('a', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('security', true) $q$), 'OK:1',
  '[notif] it can be stored as on');
select is(pg_temp.dml('a', $q$ update nestly.notification_preferences set is_push_enabled = true where category = 'comments' $q$), 'OK:1',
  '[notif BR-061] the Push flag is stored for the Mobile stage');
select is(pg_temp.dml('a', $q$ insert into nestly.notification_preferences (category) values ('Bad Category!') $q$), 'ERR:23514', '[notif] a category has a fixed format');
select is(pg_temp.n('b', 'nestly.notification_preferences'), '0', '[notif] B reads none of A''s preferences');
select is(pg_temp.dml('b', $q$ update nestly.notification_preferences set is_in_app_enabled = false $q$), 'OK:0', '[notif] B cannot change A''s preferences');
select is(pg_temp.dml('p', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('comments', false) $q$), 'OK:1',
  '[notif FR-NOTIF-002] a Professional keeps preferences too');
select is(pg_temp.dml('d', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('comments', false) $q$), 'ERR:42501',
  '[notif FR-NOTIF-002] an Admin does not use the social preferences');
select is(pg_temp.dml('s', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('comments', false) $q$), 'ERR:42501',
  '[notif platform r15] a suspended account cannot write preferences');

-- =====================================================================================================================
-- FR-NOTIF-001: reading, marking read, and who can write (AC-040)
-- =====================================================================================================================
select pg_temp.reset();
select pg_temp.dml('b', pg_temp.fr_sql(pg_temp.id('a')));
select set_config('t.p3', pg_temp.post('a')::text, true);
select pg_temp.dml('c', pg_temp.cm_sql(current_setting('t.p3')::uuid, 'c comment'));
select is(pg_temp.n('a', 'nestly.notifications'), '2', '[notif AC-040] A reads their two notifications');
select is(pg_temp.n('b', 'nestly.notifications'), '0', '[notif FR-NOTIF-001] B reads none of them');
select is(pg_temp.n('d', 'nestly.notifications'), '0', '[notif] an Admin reads none of them either');
select is(pg_temp.n('a', 'nestly.notifications where read_at is null'), '2', '[notif AC-040] both are unread');
select is(pg_temp.dml('b', $q$ update nestly.notifications set read_at = now() $q$), 'OK:0', '[notif] B cannot mark A''s notifications read');
select is(pg_temp.dml('a', $q$ update nestly.notifications set read_at = '2000-01-01' where type = 'friend_request' $q$), 'OK:1', '[notif AC-040] A marks one read');
select is(pg_temp.n('a', 'nestly.notifications where read_at is null'), '1', '[notif AC-040] one unread remains');
select is(pg_temp.n('a', 'nestly.notifications where read_at > now() - interval ''1 minute'''), '1', '[notif] the read instant is the database''s, not the client''s');
select pg_temp.dml('a', $q$ update nestly.notifications set read_at = null where type = 'friend_request' $q$);
select is(pg_temp.n('a', 'nestly.notifications where read_at is not null'), '1', '[notif] a read cannot be undone');
select is(pg_temp.dml('a', $q$ update nestly.notifications set read_at = now() $q$), 'OK:2', '[notif AC-040] Mark all as read');
select is(pg_temp.n('a', 'nestly.notifications where read_at is null'), '0', '[notif AC-040] nothing is unread');
select is(pg_temp.dml('a', $q$ update nestly.notifications set type = 'x' $q$), 'ERR:42501', '[notif] nothing but read_at can be changed');
select is(pg_temp.dml('a', format($q$ insert into nestly.notifications (recipient_id, type, target_kind, target_id, subject_id) values (%L, 'recommendation', 'post', gen_random_uuid(), gen_random_uuid()) $q$, pg_temp.id('a'))),
  'ERR:42501', '[notif AC-042 BR-035] a client cannot create a notification, so no recommendation notification exists');
select is(pg_temp.dml('b', format($q$ insert into nestly.notifications (recipient_id, type, target_kind, target_id, subject_id) values (%L, 'friend_request', 'user', gen_random_uuid(), gen_random_uuid()) $q$, pg_temp.id('a'))),
  'ERR:42501', '[notif FR-NOTIF-003] nor can one account write another''s notifications');
select is(pg_temp.dml('a', $q$ delete from nestly.notifications $q$), 'ERR:42501', '[notif] a notification is not deleted by a client');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.n('a', 'nestly.notifications'), '0', '[notif platform r15] a suspended account reads nothing');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.n('a', 'nestly.notifications'), '2', '[notif] and reads them again once active');
select is(tests.as_role('none', null, 'select count(*)::text from nestly.notifications'), 'ERR:42501', '[notif] (control) app_server itself reads no notification');
select is(tests.as_role('anon', null, 'select count(*)::text from nestly.notifications'), 'ERR:42501', '[notif platform r7] anon reads nothing');

-- the deleted account: its notifications go with it
select is(pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.p3')::uuid, 'again')), 'OK:1', '[notif] B comments again');
select is(pg_temp.n('a', 'nestly.notifications'), '3', '[notif] a second comment is a second notification (one per event)');

-- =====================================================================================================================
-- FR-SEARCH-001 / AC-065 / AC-078 / VAL-037: People Search
-- =====================================================================================================================
select pg_temp.reset();
select set_config('t.r1', tests.fx_new_auth_user()::text, true);
select set_config('t.r2', tests.fx_new_auth_user()::text, true);
select set_config('t.r3', tests.fx_new_auth_user()::text, true);
select set_config('t.r4', tests.fx_new_auth_user()::text, true);
select tests.fx_insert_user(current_setting('t.r1')::uuid, 'regular', 'active');
select tests.fx_insert_user(current_setting('t.r2')::uuid, 'regular', 'active');
select tests.fx_insert_user(current_setting('t.r3')::uuid, 'regular', 'active');
select tests.fx_insert_user(current_setting('t.r4')::uuid, 'regular', 'active');
select tests.fx_insert_profile(current_setting('t.r1')::uuid, 'Aaron', null);
select tests.fx_insert_profile(current_setting('t.r2')::uuid, 'Aaron Zed', null);
select tests.fx_insert_profile(current_setting('t.r3')::uuid, 'Ron Aaron', null);
select tests.fx_insert_profile(current_setting('t.r4')::uuid, 'Baaron Q', null);

select is(pg_temp.sp('c', 'aaron'), 'Aaron/found|Aaron Zed/found|Alice Aaron/found|Ron Aaron/found|Baaron Q/found',
  '[search FR-ALG-008 AC-065] ranked: exact name, name prefix, a word prefix (by name), then anywhere');
select is(pg_temp.sp('c', '  ALICE   aaron '), 'Alice Aaron/found', '[search] the query is trimmed, folded and not case-sensitive');
select is(pg_temp.sp('c', 'aaron', 2), 'Aaron/found|Aaron Zed/found', '[search NFR-SEC-006 (3)] the number of results per request is capped');
select is(pg_temp.sp('c', 'aaron', 2, 2), 'Alice Aaron/found|Ron Aaron/found', '[search NFR-SEC-006 (3)] and a request can page');
select is(pg_temp.sp('c', 'alice'), 'Alice Aaron/found', '[search FR-SEARCH-001 BR-044] a Regular account is found by name');
select is(pg_temp.sp('a', 'alice'), '', '[search] a search never returns the caller');
select is(pg_temp.sp('c', 'sara'), '', '[search BR-044] a suspended account is not listed');
select is(pg_temp.sp('c', 'xenia'), '', '[search BR-044] nor a banned one');
select is(pg_temp.sp('c', '%'), '', '[search] a wildcard is a character, not a pattern (no list)');
select is(pg_temp.sp('c', '__'), '', '[search] ... underscores too');
select is(pg_temp.sp('c', 'a'), '', '[search VAL-037] a one-character query returns nothing');
select is(pg_temp.sp('c', ''), '', '[search VAL-037 AC-078] an empty query returns no users');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('c')), $q$ select count(*)::text from nestly.search_people(null) $q$), '0', '[search AC-078] nor a NULL query');
select is(pg_temp.sp('c', repeat('a', 101)), '', '[search] nor a query over 100 characters');
select is(tests.fx_ns_count(pg_temp.id('c')), 8, '[search NFR-SEC-006] every valid query was counted (eight); the one-character, empty, NULL and over-long ones were not');
select is(pg_temp.sp('p', 'alice'), 'Alice Aaron/found', '[search FR-SEARCH-001] a Professional searches People too');
select is(pg_temp.sp('d', 'alice'), '', '[search FR-SEARCH-001] an Admin has no consumer search');
select is(pg_temp.sp('s', 'alice'), '', '[search platform r15] a suspended caller gets nothing');
select is(tests.as_role('anon', null, $q$ select count(*)::text from nestly.search_people('alice') $q$), 'ERR:42501', '[search AC-078] a Guest cannot call it');
select is(tests.as_role('none', null, $q$ select count(*)::text from nestly.search_people('alice') $q$), 'ERR:42501', '[search] nor app_server itself');
select is(tests.fx_ns_count(pg_temp.id('d')) + tests.fx_ns_count(pg_temp.id('s')), 0, '[search] and those calls are not counted');
select is(
  (select pg_catalog.pg_get_function_result(p.oid) from pg_catalog.pg_proc p where p.proname = 'search_people' and p.pronamespace = 'nestly'::regnamespace),
  'TABLE(user_id uuid, full_name text, outcome text)',
  '[search BR-063 BR-044] only the id and the full name leave the function');

select is(pg_temp.sp('c', 'moderator'), '', '[search condition 2 AC-078] a Moderator account is never returned');
select is(pg_temp.sp('c', 'admin'), '', '[search condition 2 AC-078] nor an Admin');

-- the limit (AC-078): stored data, a rolling window, a Security event once per stretch
select tests.fx_ns_set_limit(3, 3600);
select is(tests.fx_ns_limit(), '3/3600', '[search NFR-SEC-006] the Configuration is changed with no restart and no code change');
select is(pg_temp.sp('b', 'cora') || ',' || pg_temp.sp('b', 'cora') || ',' || pg_temp.sp('b', 'cora'), 'Cora Third/found,Cora Third/found,Cora Third/found',
  '[search AC-078] the first three searches in the window are answered');
select is(pg_temp.sp('b', 'cora'), '-/limited', '[search AC-078 VAL-037] the fourth is refused');
select is(tests.fx_ns_count(pg_temp.id('b')), 3, '[search] and not counted');
select is(tests.fx_ns_events(pg_temp.id('b')), 1, '[search NFR-SEC-006 (5)] the first refusal records one Security event');
select is(pg_temp.sp('b', 'cora'), '-/limited', '[search] the fifth is refused too');
select is(tests.fx_ns_events(pg_temp.id('b')), 1, '[search] with no second event in the same stretch');
select is(pg_temp.sp('p', 'cora'), 'Cora Third/found', '[search] another account is unaffected');
select is(pg_temp.sp('b', 'x'), '', '[search] a query too short is not a search, so not a refusal either');
select tests.fx_ns_age(pg_temp.id('b'), interval '3601 seconds');
select is(pg_temp.sp('b', 'cora'), 'Cora Third/found', '[search] the window rolls: after an hour the account searches again');
select is(tests.fx_ns_count(pg_temp.id('b')), 1, '[search] only the new search is inside the window');
select pg_temp.sp('b', 'cora');
select pg_temp.sp('b', 'cora');
select is(pg_temp.sp('b', 'cora'), '-/limited', '[search] a second stretch of refusals ...');
select is(tests.fx_ns_events(pg_temp.id('b')), 2, '[search] ... records its own event');

-- fail closed (c22 pattern): an invalid or absent limit raises NS001, nothing counted or recorded
select tests.fx_ns_break_limit(0, 3600);
select is(pg_temp.sp('a', 'bella'), 'ERR:NS001', '[search NFR-SEC-006] a zero limit fails closed');
select is(tests.fx_ns_count(pg_temp.id('a')), 1, '[search] and counts nothing (the earlier search stays the only one)');
select tests.fx_ns_drop_limit();
select is(tests.fx_ns_limit(), 'none', '[search] (control) the limit is gone');
select is(pg_temp.sp('a', 'bella'), 'ERR:NS001', '[search NFR-SEC-006] an absent limit fails closed');

-- ---- the conditions of the approval (Afik 20.10.2026) --------------------------------------------------------------------

-- Condition 1 (AC-076): an anonymous post never creates "new post of a Friend" - not one notification of any kind.
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.fx_nt_follow(pg_temp.id('c'), pg_temp.id('a'), true);
select set_config('t.total', tests.fx_nt_total()::text, true);
select pg_temp.post('a', 'everyone', true);
select is(tests.fx_nt_total()::text, current_setting('t.total'), '[condition 1 AC-076] an anonymous post by a followed Friend changes the number of notifications by none');
select pg_temp.post('a');
select is(tests.fx_nt_total()::text, (current_setting('t.total')::bigint + 1)::text, '[condition 1] (control) a named post of the same Friend creates exactly one');

-- Condition 2 (AC-078): staff never appear in People Search. The only table a name is read from needs a Regular profile, and a Regular
-- profile cannot belong to an Admin or Moderator (composite FK to users with account_type).
select throws_ok($$ select tests.fx_insert_profile(tests.fx_fr_id('fr_m'), 'Moda Rator', null) $$, '23503',
  null, '[condition 2] a Moderator cannot be given a Regular profile (regular_profiles -> users with account_type regular)');
select throws_ok($$ select tests.fx_insert_profile(tests.fx_fr_id('fr_d'), 'Adam Min', null) $$, '23503',
  null, '[condition 2] nor an Admin');
select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'users' and pol.polname = 'users_select_search'
      and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'account_type = ''regular''::text' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'status = ''active''::text'),
  1::bigint, '[condition 2] search_people reads users only as an active Regular account');
select is(pg_temp.sp('c', ''), '', '[condition 2 AC-078] no query string returns nothing');
select is(pg_temp.sp('c', ' '), '', '[condition 2] a blank query returns nothing');
select is(pg_temp.sp('c', 'a'), '', '[condition 2] one character returns nothing');

-- Condition 3 (BR-038, FR-NOTIF-002): every category respects the recipient's preference; each has its own negative.
select pg_temp.reset();
select tests.fx_nt_pref(pg_temp.id('a'), 'friends', false);
select pg_temp.dml('b', pg_temp.fr_sql(pg_temp.id('a')));
select is(pg_temp.nt('a'), 0::bigint, '[condition 3] friends off: a Friend Request received creates nothing');
select pg_temp.reset();
select pg_temp.dml('c', pg_temp.fr_sql(pg_temp.id('a')));
select tests.fx_nt_pref(pg_temp.id('c'), 'friends', false);
select pg_temp.dml('a', pg_temp.fr_set(pg_temp.id('c'), pg_temp.id('a'), 'accepted'));
select is(pg_temp.nt('c'), 0::bigint, '[condition 3] friends off: a Friend Request accepted creates nothing for the requester');
select pg_temp.reset();
select tests.fx_nt_pref(pg_temp.id('a'), 'shares', false);
select set_config('t.so', pg_temp.post('a')::text, true);
select pg_temp.dml('b', format($q$ insert into nestly.posts (audience, shared_post_id) values ('everyone', %L) $q$, current_setting('t.so')));
select is(pg_temp.nt('a'), 0::bigint, '[condition 3] shares off: a share of my post creates nothing');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.fx_nt_follow(pg_temp.id('c'), pg_temp.id('a'), true);
select tests.fx_nt_pref(pg_temp.id('c'), 'friend_posts', false);
select pg_temp.post('a');
select is(pg_temp.nt('c'), 0::bigint, '[condition 3] friend_posts off: a followed Friend''s post creates nothing');
select tests.fx_nt_pref(pg_temp.id('c'), 'friend_posts', true);
select pg_temp.post('a');
select is(pg_temp.types('c'), 'friend_post', '[condition 3] (control) switched back on, it does');
select pg_temp.reset();
select tests.fx_nt_pref(pg_temp.id('a'), 'comments', false);
select set_config('t.cp', pg_temp.post('a')::text, true);
select pg_temp.dml('b', pg_temp.cm_sql(current_setting('t.cp')::uuid, 'x'));
select set_config('t.cc', (select tests.fx_cm_id(current_setting('t.cp')::uuid, 'x'))::text, true);
select pg_temp.dml('c', pg_temp.cm_sql(current_setting('t.cp')::uuid, 'a reply to b', current_setting('t.cc')::uuid));
select is(pg_temp.nt('a'), 0::bigint, '[condition 3] comments off: neither a comment nor a reply creates anything for the post''s author');
select is(pg_temp.nt('b'), 1::bigint, '[condition 3] (control) the reply notifies B, whose comments category is on');

-- Every policy TO app_owner in the product schema, with no name filter: a new one (or one that disappears) shows here, so the exceptions to the
-- "client roles only" fence are exactly this list (the reveal, definer and profile_view policies of other features included).
select set_eq(
  $$ select c.relname || '.' || pol.polname from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
      where c.relnamespace = 'nestly'::regnamespace
        and pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'app_owner')]::oid[] $$,
  $$ values ('audit_log.audit_log_insert_definer'), ('children.children_select_profile_view'), ('children.children_select_child_data'), ('tracker_events.tracker_events_select_child_data'), ('users.users_select_child_data'), ('trend_scopes.trend_scopes_insert_definer'), ('trend_scopes.trend_scopes_select_definer'), ('trend_scopes.trend_scopes_delete_definer'), ('posts.posts_select_reveal'), ('groups.groups_select_reveal'), ('comments.comments_select_notify'), ('friend_content_notification_preferences.friend_content_preferences_select_notify'), ('friendships.friendships_select_notify'), ('friendships.friendships_select_profile_view'), ('group_members.group_members_select_notify'), ('group_notification_preferences.group_notification_preferences_select_notify'), ('identity_link_checks.identity_link_checks_select_definer'), ('journey_contexts.journey_contexts_select_profile_view'), ('moderator_permissions.moderator_permissions_select_definer'), ('notification_preferences.notification_preferences_select_notify'), ('notifications.notifications_insert_notify'), ('notifications.notifications_select_notify'), ('people_search_counts.people_search_counts_insert_search'), ('people_search_counts.people_search_counts_select_search'), ('people_search_counts.people_search_counts_update_search'), ('post_authors.post_authors_select_notify'), ('post_authors.post_authors_select_reveal'), ('posts.posts_select_notify'), ('profile_open_counts.profile_open_counts_insert_profile_view'), ('profile_open_counts.profile_open_counts_select_profile_view'), ('profile_open_counts.profile_open_counts_update_profile_view'), ('regular_names.regular_names_select_profile_view'), ('regular_names.regular_names_select_reveal'), ('regular_names.regular_names_select_search'), ('regular_profiles.regular_profiles_select_profile_view'), ('reports.reports_select_reveal'), ('security_events.security_events_insert_profile_view'), ('security_events.security_events_insert_search'), ('security_limits.security_limits_select_profile_view'), ('security_limits.security_limits_select_search_people'), ('staff_roles.staff_roles_select_definer'), ('users.users_select_profile_view'), ('users.users_select_search'), ('reports.reports_select_auto_hide'), ('posts.posts_select_auto_hide'), ('post_authors.post_authors_select_auto_hide'), ('comments.comments_select_auto_hide'), ('marketplace_listings.marketplace_listings_select_auto_hide'), ('professional_reviews.professional_reviews_select_auto_hide'), ('professional_articles.professional_articles_select_auto_hide'), ('report_auto_hides.report_auto_hides_insert_definer'), ('report_auto_hides.report_auto_hides_select_definer'), ('report_auto_hides.report_auto_hides_delete_definer'), ('auto_hide_scopes.auto_hide_scopes_insert_definer'), ('auto_hide_scopes.auto_hide_scopes_select_definer'), ('auto_hide_scopes.auto_hide_scopes_delete_definer') $$,
  '[rule 17 H2] the policies TO app_owner in nestly are exactly these 56 (completion B''s thirteen of identical_reports_hide, file 102; I10''s two *_select_notify of notify_group, file 96; the I14 completion''s three *_select_child_data, its three trend_scopes policies and the reveal''s posts and groups reads of child_tracker_trends, file 100): no other exception to the client-role fence exists');

-- The eight policies that open older tables to the definers (rule 17): exactly these, TO app_owner only, permissive, each tied to its scope.
select is(
  (select string_agg(c.relname || '.' || pol.polname || '.' || pol.polcmd::text || '.' ||
                     (select string_agg(r.rolname, '+') from pg_catalog.pg_roles r where r.oid = any (pol.polroles)) || '.' || pol.polpermissive::text
                     || '.' || ((coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~ '(notify_scope|search_scope)\(\)')::text, ', ' order by c.relname, pol.polname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and pol.polname in ('posts_select_notify', 'post_authors_select_notify', 'comments_select_notify', 'friendships_select_notify',
          'users_select_search', 'regular_names_select_search', 'security_limits_select_search_people', 'security_events_insert_search')),
  'comments.comments_select_notify.r.app_owner.true.true, friendships.friendships_select_notify.r.app_owner.true.true, post_authors.post_authors_select_notify.r.app_owner.true.true, '
  || 'posts.posts_select_notify.r.app_owner.true.true, regular_names.regular_names_select_search.r.app_owner.true.true, security_events.security_events_insert_search.a.app_owner.true.true, '
  || 'security_limits.security_limits_select_search_people.r.app_owner.true.true, users.users_select_search.r.app_owner.true.true',
  '[rule 17 H2] the eight definer-scoped policies on older tables are exactly these: command, TO app_owner only, permissive, each opened by notify_scope() or search_scope()');
select is(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'notify_scope\(\) AS notify_scope\) = ''post''::text' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'status = ''accepted''::text'
     from pg_catalog.pg_policy pol where pol.polname = 'friendships_select_notify'),
  true, '[rule 17 H2] the friendships policy opens only inside notify_post (scope = post) and only for accepted rows');
select is(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'user_id = \( SELECT auth\.uid\(\)' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'people_search_limit'
     from pg_catalog.pg_policy pol where pol.polname = 'security_events_insert_search'),
  true, '[rule 17 H2] the Security event is written for the caller''s own account and only of the people_search_limit kind');
select is(
  (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'people_search' from pg_catalog.pg_policy pol where pol.polname = 'security_limits_select_search_people'),
  true, '[rule 17 H2] only the people_search limit row is readable');


-- ---- Intent Signal: search_intents (Afik 20.10.2026) -----------------------------------------------------------------------
select pg_temp.reset();
select is(pg_temp.dml('a', $q$ insert into nestly.search_intents (topic) values ('sleep') $q$), 'OK:1', '[intent FR-ALG-008] the searcher stores the topic of a search');
select is(pg_temp.dml('a', $q$ insert into nestly.search_intents (topic) values ('Typed Text With Spaces') $q$), 'ERR:23514', '[intent] only a topic of a fixed shape: never the typed text');
select is(pg_temp.dml('a', format($q$ insert into nestly.search_intents (user_id, topic) values (%L, 'sleep') $q$, pg_temp.id('b'))), 'ERR:42501', '[intent platform r12] nor on behalf of another account');
select is(pg_temp.dml('d', $q$ insert into nestly.search_intents (topic) values ('sleep') $q$), 'ERR:42501', '[intent] an Admin stores none');
select is(pg_temp.n('a', 'nestly.search_intents'), '1', '[intent] the owner reads their own');
select is(pg_temp.n('b', 'nestly.search_intents'), '0', '[intent BR-058] nobody else reads them');
select is(pg_temp.n('d', 'nestly.search_intents'), '0', '[intent BR-058] not even an Admin, through the product');
select is(pg_temp.dml('a', $q$ update nestly.search_intents set topic = 'x' $q$), 'ERR:42501', '[intent] a row is never updated');
select is(pg_temp.dml('a', $q$ delete from nestly.search_intents $q$), 'ERR:42501', '[intent] and never deleted by the client');
select is(
  (select string_agg(a.attname, ', ' order by a.attname) from pg_catalog.pg_attribute a
    where a.attrelid = (select oid from pg_catalog.pg_class where relname = 'search_intents' and relnamespace = 'nestly'::regnamespace)
      and a.attnum > 0 and not a.attisdropped),
  'created_at, id, topic, user_id', '[intent] a row holds the topic, the user and the date - no text');
select tests.fx_si_age(pg_temp.id('a'), interval '31 days');
select is(tests.fx_si_purge(), 1, '[intent] the retention job deletes a topic row after 30 days');
select is(tests.fx_si_count(pg_temp.id('a')), 0::bigint, '[intent] and it is gone');
select is(pg_temp.dml('a', $q$ insert into nestly.search_intents (topic) values ('sleep') $q$), 'OK:1', '[intent] a fresh row');
select is(tests.fx_si_purge(), 0, '[intent] a row younger than 30 days stays');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')), 'select nestly.purge_search_intents()::text'), 'ERR:42501', '[intent] a signed-in account cannot run the purge');
select is(pg_temp.dml('p', $q$ insert into nestly.search_intents (topic) values ('sleep') $q$), 'OK:1', '[intent] a Professional stores a topic too');
select is(pg_temp.dml('s', $q$ insert into nestly.search_intents (topic) values ('sleep') $q$), 'ERR:42501', '[intent platform r15] a suspended account stores none');
select is(
  (select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ') from pg_catalog.pg_class c
    where c.relnamespace = 'nestly'::regnamespace and c.relname = 'search_intents'),
  'search_intents:true:true', '[intent platform r8] search_intents has RLS enabled and forced');
select set_eq(
  $$ select pol.polname || '.' || pol.polcmd::text || '.' || (select string_agg(r.rolname, '+' order by r.rolname) from pg_catalog.pg_roles r where r.oid = any (pol.polroles)) || '.' || pol.polpermissive::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid where c.relname = 'search_intents' and c.relnamespace = 'nestly'::regnamespace $$,
  $$ values ('search_intents_select_own.r.authenticated.true'), ('search_intents_insert_own.a.authenticated.true'),
            ('search_intents_select_jobs.r.app_jobs.true'), ('search_intents_delete_jobs.d.app_jobs.true') $$,
  '[intent platform r4 r6] the policies are exactly the owner read, the owner insert and the two 30-day policies of the job role');
select is(
  (select string_agg(p, ',' order by p) from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
    where has_table_privilege('app_jobs', (select oid from pg_catalog.pg_class where relname = 'search_intents' and relnamespace = 'nestly'::regnamespace), p)),
  'DELETE,SELECT', '[intent platform r6] the job role may select and delete, never insert or update');
select is(
  (select string_agg(r.rolname, ',' order by r.rolname) from (values ('anon'), ('app_server'), ('service_role')) r(rolname)
    where has_table_privilege(r.rolname, (select oid from pg_catalog.pg_class where relname = 'search_intents' and relnamespace = 'nestly'::regnamespace), 'SELECT,INSERT,UPDATE,DELETE')),
  null, '[intent platform r7] anon, app_server and service_role hold nothing on it');
select tests.fx_si_add(pg_temp.id('a'), 'sleep', interval '5 days');
select tests.fx_si_add(pg_temp.id('b'), 'nutrition', interval '40 days');
select is(tests.jobs_as($q$ select count(*)::text from nestly.search_intents $q$), '1', '[intent platform r6] the job role reads only rows older than 30 days (one of the rows here)');
select is(tests.jobs_dml($q$ delete from nestly.search_intents where topic = 'sleep' $q$), 'OK:0', '[intent platform r6] and cannot delete a younger row');
select is(tests.jobs_dml($q$ insert into nestly.search_intents (user_id, topic) values (gen_random_uuid(), 'x') $q$), 'ERR:42501', '[intent platform r6] nor insert');
select is(tests.jobs_dml($q$ update nestly.search_intents set topic = 'y' $q$), 'ERR:42501', '[intent platform r6] nor update');
select is(tests.jobs_dml($q$ delete from nestly.search_intents where topic = 'nutrition' $q$), 'OK:1', '[intent platform r6] it deletes a row older than 30 days');

select * from finish();

rollback;
