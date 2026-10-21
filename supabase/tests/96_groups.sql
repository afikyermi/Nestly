-- pgTAP, run by pg_prove as app_server (CI `db` job, I10: Groups; FR-GRP-001..004, FR-ALG-010, BR-031..033, BR-040, BR-041, BR-048, BR-060,
-- VAL-019..021, VAL-028, VAL-035, ERR-017..019, ERR-022, ERR-024, ERR-026, NFR-PRIV-002, AC-036..038, AC-050, AC-056, AC-066).
-- Source of expected values: the SRS (who reads a Public / Private Group's content, who joins and how, the Group Role hierarchy, staff access to
-- Private content, recommendations and Highlights), not the migration text.
-- People: a, b, c = fr_c, e = gr_e, f = gr_f (Regular), s = suspended, p = Professional, m = fr_m (Moderator, no key), d = fr_d (Admin),
-- v = sf_m1 (REPORTS_VIEW only), w = sf_m2 (REPORTS_VIEW + PRIVATE_GROUP_MODERATE). a and c are Friends; a and e are Friends.
-- Everything rolls back with the transaction (so every staff view shares this one transaction id).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[I10 c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_gr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p') when 's' then tests.fx_id('s')
    when 'c' then tests.fx_fr_id('fr_c') when 'm' then tests.fx_fr_id('fr_m') when 'd' then tests.fx_fr_id('fr_d')
    when 'e' then tests.fx_gr_id('gr_e') when 'f' then tests.fx_gr_id('gr_f')
    when 'v' then tests.fx_sf_id('sf_m1') when 'w' then tests.fx_sf_id('sf_m2')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.mk(p_who text, p_name text, p_privacy text) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ insert into nestly.groups (name, description, privacy) values (%L, 'about us', %L) returning id::text $q$, p_name, p_privacy))
$f$;
create function pg_temp.g(p_key text) returns uuid language sql as $f$ select current_setting('t.' || p_key)::uuid $f$;
create function pg_temp.join(p_who text, p_group text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g(p_group)))
$f$;
create function pg_temp.ask(p_who text, p_group text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_join_requests (group_id) values (%L) $q$, pg_temp.g(p_group)))
$f$;
create function pg_temp.decide(p_who text, p_group text, p_requester text, p_status text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.group_join_requests set status = %L where group_id = %L and user_id = %L and status = 'pending' $q$,
    p_status, pg_temp.g(p_group), pg_temp.id(p_requester)))
$f$;
create function pg_temp.set_role(p_who text, p_group text, p_whom text, p_role text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.group_members set role = %L where group_id = %L and user_id = %L $q$, p_role, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.remove(p_who text, p_group text, p_whom text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ delete from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.role_of(p_group text, p_whom text) returns text language sql as $f$
  select coalesce((select split_part(x, ':', 2) from unnest(string_to_array(tests.fx_gr_roles(pg_temp.g(p_group)), ',')) x
                    where split_part(x, ':', 1) = pg_temp.id(p_whom)::text), '-')
$f$;
create function pg_temp.gpost(p_who text, p_group text, p_body text default 'group post', p_anon boolean default false) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ insert into nestly.posts (audience, body, group_id, is_anonymous) values ('everyone', %L, %L, %L) returning id::text $q$,
    p_body, pg_temp.g(p_group), p_anon))
$f$;
create function pg_temp.sees_post(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select count(*)::text from nestly.posts where id = %L $q$, p_post))
$f$;
create function pg_temp.sees_comment(p_who text, p_c uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ select count(*)::text from nestly.comments where id = %L $q$, p_c))
$f$;
create function pg_temp.comment(p_who text, p_post uuid, p_body text default 'a comment') returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ insert into nestly.comments (post_id, body) values (%L, %L) returning id::text $q$, p_post, p_body))
$f$;
create function pg_temp.like_post(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.reactions (post_id) values (%L) $q$, p_post))
$f$;
create function pg_temp.types(p_who text) returns text language sql as $f$ select tests.fx_nt_types(pg_temp.id(p_who)) $f$;
create function pg_temp.staff(p_who text, p_sql text) returns text language sql as $f$
  select tests.fn_staff(tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.staff_dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_staff(tests.claims(pg_temp.id(p_who)), p_sql)
$f$;

select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.fx_fr_add(pg_temp.id('e'), pg_temp.id('a'), 'accepted');
select tests.fx_sf_grant(pg_temp.id('v'), array['REPORTS_VIEW']);
select tests.fx_sf_grant(pg_temp.id('w'), array['REPORTS_VIEW', 'PRIVATE_GROUP_MODERATE']);
select tests.fx_nt_purge();

-- ---- structure ---------------------------------------------------------------------------------------------------------------
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname in ('groups', 'group_members', 'group_access', 'group_join_requests', 'group_invitations', 'group_bans',
              'group_notification_preferences', 'group_recommendations', 'group_highlight_configurations', 'private_group_content_views')
              and c.relrowsecurity and c.relforcerowsecurity), 10::bigint, '[I10 c1 r8] the ten group tables have RLS enabled and forced');
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text, ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid
            where c.relnamespace = 'nestly'::regnamespace and c.relname in ('groups', 'group_members', 'group_access', 'group_join_requests',
              'group_invitations', 'group_bans', 'group_notification_preferences', 'group_recommendations', 'group_highlight_configurations',
              'private_group_content_views')),
  'group_access.group_access_insert_member:a, group_access.group_access_select_own:r, group_bans.group_bans_delete_manager:d, '
  || 'group_bans.group_bans_insert_manager:a, group_bans.group_bans_select_party:r, group_highlight_configurations.group_highlight_configurations_select_all:r, '
  || 'group_invitations.group_invitations_insert_manager:a, group_invitations.group_invitations_select_party:r, group_invitations.group_invitations_update_invitee:w, '
  || 'group_invitations.group_invitations_update_manager:w, group_join_requests.group_join_requests_insert_self:a, group_join_requests.group_join_requests_select_party:r, '
  || 'group_join_requests.group_join_requests_update_manager:w, group_join_requests.group_join_requests_update_requester:w, '
  || 'group_members.group_members_delete_manager:d, group_members.group_members_delete_self:d, group_members.group_members_insert_approved:a, '
  || 'group_members.group_members_insert_owner:a, group_members.group_members_insert_self:a, group_members.group_members_select_notify:r, '
  || 'group_members.group_members_select_viewer:r, group_members.group_members_update_manager:w, group_members.group_members_update_owner_step_down:w, '
  || 'group_notification_preferences.group_notification_preferences_insert_own:a, group_notification_preferences.group_notification_preferences_select_notify:r, '
  || 'group_notification_preferences.group_notification_preferences_select_own:r, group_notification_preferences.group_notification_preferences_update_own:w, '
  || 'group_recommendations.group_recommendations_insert_sender:a, group_recommendations.group_recommendations_select_party:r, '
  || 'groups.groups_insert_creator:a, groups.groups_select_active:r, groups.groups_update_manager:w, '
  || 'private_group_content_views.private_group_content_views_insert_staff:a, private_group_content_views.private_group_content_views_select_own:r',
  '[I10 c1] the policies of the group tables, exactly (no client delete of a request, invitation or recommendation; no write on the configuration)');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid
            where c.relnamespace = 'nestly'::regnamespace and c.relname like 'group%' and pl.polname !~ '_notify$'
              and pl.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]), 0::bigint,
  '[I10 c1 r4] every group policy but the two *_select_notify (TO app_owner, notify_group) is TO authenticated');
select is((select string_agg(p.proname || ':' || p.prosecdef::text, ', ' order by p.proname) from pg_proc p
            where p.pronamespace = 'nestly'::regnamespace and p.proname in ('notify_group', 'my_group_rank', 'group_role_rank', 'group_members_guard')),
  'group_members_guard:false, group_role_rank:false, my_group_rank:false, notify_group:true', '[I10 c1 r10] notify_group is the one new SECURITY DEFINER; the helpers are invoker');
select ok((select not has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('app_server', p.oid, 'EXECUTE')
             from pg_proc p where p.proname = 'notify_group' and p.pronamespace = 'nestly'::regnamespace),
  '[I10 c1 r17] no runtime role executes notify_group()');

-- ---- creating a Group (FR-GRP-004, BR-048, AC-056, VAL-028, ERR-022) -------------------------------------------------------
select set_config('t.pub', pg_temp.mk('a', 'Morning walks', 'public'), true);
select ok(pg_temp.g('pub') is not null, '[I10 c2 AC-056] a Regular user creates a Public Group with no Admin approval');
select is(pg_temp.role_of('pub', 'a'), 'owner', '[I10 c2 FR-GRP-004 VAL-028] the creator is its member and its Group Owner');
select is(tests.fx_gr_access(pg_temp.g('pub')), pg_temp.id('a')::text || ':owner', '[I10 c2] the Owner''s own group_access copy follows');
select set_config('t.priv', pg_temp.mk('p', 'Quiet parents', 'private'), true);
select is(pg_temp.role_of('priv', 'p'), 'owner', '[I10 c2 BR-048] a Professional creates a Private Group and is its Owner');
select is(pg_temp.mk('d', 'Staff group', 'public'), 'ERR:42501', '[I10 c2 ERR-022] the Admin does not create a Group');
select is(pg_temp.mk('m', 'Staff group', 'public'), 'ERR:42501', '[I10 c2 ERR-022] nor does a Moderator');
select is(pg_temp.mk('s', 'Suspended group', 'public'), 'ERR:42501', '[I10 c2 r15] a suspended account creates nothing');
select is(pg_temp.mk('a', 'ab', 'public'), 'ERR:23514', '[I10 c2] a name under three characters is refused');
select is(pg_temp.mk('a', 'Secret club', 'hidden'), 'ERR:23514', '[I10 c2 VAL-028] the type must be Public or Private');
select is(pg_temp.dml('b', format($q$ insert into nestly.groups (name, privacy, created_by) values ('Not mine', 'public', %L) $q$, pg_temp.id('a'))),
  'ERR:42501', '[I10 c2 r12] a Group is never created in another account''s name');
select is(pg_temp.dml('b', format($q$ insert into nestly.group_members (group_id, role) values (%L, 'owner') $q$, pg_temp.g('pub'))),
  'ERR:42501', '[I10 c2] nobody makes themselves Owner of an existing Group');

-- ---- discovery (FR-GRP-001, BR-031, BR-032) ------------------------------------------------------------------------------------
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.groups where id in (%L, %L) $q$, pg_temp.g('pub'), pg_temp.g('priv'))), '2',
  '[I10 c3 BR-031 BR-032] every active account reads the details of a Public and a Private Group (discovery)');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.group_members where group_id = %L $q$, pg_temp.g('pub'))), '1',
  '[I10 c3] a non-member reads a Public Group''s member rows (no name comes with them)');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.group_members where group_id = %L $q$, pg_temp.g('priv'))), '0',
  '[I10 c3 BR-032] a non-member reads no member row of a Private Group');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('a'))), '0',
  '[I10 c3] a non-member does not read the name of a Group''s member');

-- ---- joining (FR-GRP-002, VAL-020, ERR-018) -----------------------------------------------------------------------------------
select is(pg_temp.join('b', 'pub'), 'OK:1', '[I10 c4 BR-031] Join of a Public Group makes the user a member at once');
select is(pg_temp.role_of('pub', 'b'), 'member', '[I10 c4] as a member');
select is(pg_temp.n('b', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('a'))), '1',
  '[I10 c4] a member reads a fellow member''s name');
select is(pg_temp.dml('b', format($q$ insert into nestly.group_members (group_id, role) values (%L, 'admin') $q$, pg_temp.g('pub'))), 'ERR:42501',
  '[I10 c4] nobody joins with a Role');
select is(pg_temp.join('d', 'pub'), 'ERR:42501', '[I10 c4 ERR-022] staff do not join a Group');
select is(pg_temp.join('b', 'priv'), 'ERR:42501', '[I10 c4 BR-032] Join of a Private Group needs an approved request');
select is(pg_temp.ask('c', 'pub'), 'ERR:42501', '[I10 c4] a Join Request is only for a Private Group');
select is(pg_temp.ask('b', 'priv'), 'OK:1', '[I10 c4 FR-GRP-002] a non-member asks to join a Private Group');
select is(pg_temp.ask('b', 'priv'), 'ERR:23505', '[I10 c4 ERR-018 VAL-020] a second pending request is refused (no new row)');
select is(pg_temp.ask('p', 'priv'), 'ERR:42501', '[I10 c4 VAL-020] a member does not ask');
select is(pg_temp.ask('d', 'priv'), 'ERR:42501', '[I10 c4 ERR-022] staff do not ask');
select is(pg_temp.n('c', format($q$ select count(*)::text from nestly.group_join_requests where group_id = %L $q$, pg_temp.g('priv'))), '0',
  '[I10 c4] a third account reads no request');
select is(pg_temp.n('p', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('b'))), '1',
  '[I10 c4] the Owner reads the pending requester''s name');
select is(pg_temp.decide('b', 'priv', 'b', 'approved'), 'ERR:42501', '[I10 c4] the requester cannot approve their own request (only cancel it)');
select is(pg_temp.decide('p', 'priv', 'b', 'approved'), 'OK:1', '[I10 c4 BR-032] the Owner approves');
select is(pg_temp.role_of('priv', 'b'), 'member', '[I10 c4] the approval makes the requester a member in the same statement');
select is(tests.fx_gr_request(pg_temp.g('priv'), pg_temp.id('b')), 'approved', '[I10 c4] and the request is approved');
select is(pg_temp.decide('p', 'priv', 'b', 'rejected'), 'OK:0', '[I10 c4] an answered request is not answered again');
select is(pg_temp.dml('c', format($q$ insert into nestly.group_access (group_id, user_id, role) values (%L, %L, 'member') $q$, pg_temp.g('priv'), pg_temp.id('b'))),
  'ERR:42501', '[I10 c4 NFR-PRIV-002] nobody writes another account''s access copy: no insert can test who belongs to a Private Group (a member)');
select is(pg_temp.dml('c', format($q$ insert into nestly.group_access (group_id, user_id, role) values (%L, %L, 'member') $q$, pg_temp.g('priv'), pg_temp.id('e'))),
  'ERR:42501', '[I10 c4 NFR-PRIV-002] (a non-member: the same answer)');
select is(pg_temp.dml('c', format($q$ insert into nestly.group_access (group_id, user_id, role) values (%L, %L, 'member') $q$, pg_temp.g('priv'), pg_temp.id('c'))),
  'ERR:23503', '[I10 c4] nor writes a copy of a Membership it does not hold');
select is(pg_temp.ask('c', 'priv'), 'OK:1', '[I10 c4 fixture] c asks');
select is(pg_temp.decide('b', 'priv', 'c', 'approved'), 'OK:0', '[I10 c4 FR-GRP-003] a plain member cannot approve (0 rows)');
select is(pg_temp.decide('p', 'priv', 'c', 'rejected'), 'OK:1', '[I10 c4] the Owner rejects');
select is(pg_temp.role_of('priv', 'c'), '-', '[I10 c4] a rejected requester is no member');
select is(pg_temp.ask('c', 'priv'), 'OK:1', '[I10 c4] after a rejection the user may ask again');
select is(pg_temp.dml('c', format($q$ update nestly.group_join_requests set status = 'cancelled' where group_id = %L and status = 'pending' $q$, pg_temp.g('priv'))),
  'OK:1', '[I10 c4] the requester cancels a pending request');
select is(pg_temp.dml('c', format($q$ insert into nestly.group_members (group_id, user_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('e'))),
  'ERR:42501', '[I10 c4] nobody adds another account directly');

-- ---- content (AC-036, AC-037, ERR-017) -----------------------------------------------------------------------------------------
select set_config('t.pubpost', pg_temp.gpost('a', 'pub', 'hello public group'), true);
select set_config('t.privpost', pg_temp.gpost('p', 'priv', 'hello private group'), true);
select ok(pg_temp.g('pubpost') is not null and pg_temp.g('privpost') is not null, '[I10 c5 AC-036] a member posts in the Group');
select is(pg_temp.gpost('c', 'pub'), 'ERR:42501', '[I10 c5 AC-036 BR-031] a non-member does not post in a Public Group');
select is(pg_temp.gpost('c', 'priv'), 'ERR:42501', '[I10 c5] nor in a Private Group');
select is(pg_temp.sees_post('c', pg_temp.g('pubpost')), '1', '[I10 c5 AC-036 BR-031] a Public Group''s post is readable by every signed-in user');
select is(pg_temp.sees_post('c', pg_temp.g('privpost')), '0', '[I10 c5 AC-037 ERR-017 NFR-PRIV-002] a Private Group''s post is not returned to a non-member');
select is(pg_temp.sees_post('b', pg_temp.g('privpost')), '1', '[I10 c5 AC-037] a member reads it');
select is(pg_temp.comment('c', pg_temp.g('pubpost')), 'ERR:42501', '[I10 c5 AC-036] a non-member does not comment on a Public Group''s post');
select is(pg_temp.like_post('c', pg_temp.g('pubpost')), 'ERR:42501', '[I10 c5 AC-036] nor like it');
select set_config('t.pubc', pg_temp.comment('b', pg_temp.g('pubpost')), true);
select ok(pg_temp.g('pubc') is not null, '[I10 c5] a member comments');
select is(pg_temp.n('c', format($q$ insert into nestly.comments (post_id, parent_id, body) values (%L, %L, 'a reply') returning id::text $q$,
  pg_temp.g('pubpost'), pg_temp.g('pubc'))), 'ERR:42501', '[I10 c5 AC-036] a non-member does not reply');
select is(pg_temp.dml('c', format($q$ insert into nestly.reactions (comment_id) values (%L) $q$, pg_temp.g('pubc'))), 'ERR:42501',
  '[I10 c5 AC-036] nor like a comment');
select is(pg_temp.n('b', format($q$ select (group_id = %L)::text from nestly.comments where id = %L $q$, pg_temp.g('pub'), pg_temp.g('pubc'))), 'true',
  '[I10 c5] a comment carries its post''s Group');
select set_config('t.privc', pg_temp.comment('b', pg_temp.g('privpost'), 'private comment'), true);
select is(pg_temp.sees_comment('c', pg_temp.g('privc')), '0', '[I10 c5 AC-037] a Private Group''s comment is not returned to a non-member');
select is(pg_temp.n('a', format($q$ insert into nestly.posts (audience, body, group_id) values ('friends', 'x', %L) returning id::text $q$, pg_temp.g('pub'))),
  'ERR:23514', '[I10 c5] a group post is never Friends-only');
select is(pg_temp.n('c', format($q$ insert into nestly.posts (audience, body, shared_post_id) values ('everyone', 'look', %L) returning id::text $q$, pg_temp.g('pubpost'))) ~ '^[0-9a-f-]{36}$',
  true, '[I10 c5] a Public Group''s post may be shared');
select is(pg_temp.n('b', format($q$ insert into nestly.posts (audience, body, shared_post_id) values ('everyone', 'look', %L) returning id::text $q$, pg_temp.g('privpost'))),
  'ERR:NS002', '[I10 c5 NFR-PRIV-002] a Private Group''s post is never shared, not even by a member');
select is(pg_temp.n('b', format($q$ insert into nestly.posts (audience, body, group_id, shared_post_id) values ('everyone', 'x', %L, %L) returning id::text $q$,
  pg_temp.g('pub'), pg_temp.g('pubpost'))), 'ERR:23514', '[I10 c5] a share is never posted into a Group');
select set_config('t.anonpost', pg_temp.gpost('b', 'priv', 'anonymous in a group', true), true);
select is(pg_temp.sees_post('p', pg_temp.g('anonpost')), '1', '[I10 c5 OP-019] a Regular member posts anonymously in a Group');
select is(pg_temp.n('p', format($q$ select coalesce(author_id::text, 'hidden') from nestly.posts where id = %L $q$, pg_temp.g('anonpost'))), 'hidden',
  '[I10 c5 OP-019] the anonymous author stays hidden from the Group''s Owner');

-- ---- staff and Private content (BR-040, AC-037, NFR-PRIV-002, ERR-024) ----------------------------------------------------------
select set_config('t.rp', tests.fx_rp_add(pg_temp.id('b'), 'post', pg_temp.g('privpost'))::text, true);
select is(pg_temp.staff('d', format($q$ select is_private_group::text || ':' || coalesce(target_text, 'none') from nestly.reports where id = %L $q$, pg_temp.g('rp'))),
  'true:none', '[I10 c6 NFR-PRIV-002] a report on Private Group content is marked and keeps no copy of the text');
select is(pg_temp.staff('d', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('privpost'))), '0',
  '[I10 c6 BR-040] even the Admin does not read the reported Private post without opening it through the audited view');
select is(pg_temp.staff_dml('v', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rp'))), 'ERR:42501',
  '[I10 c6 ERR-024] a Moderator with REPORTS_VIEW but no PRIVATE_GROUP_MODERATE is refused');
select is(pg_temp.staff('v', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('privpost'))), '0',
  '[I10 c6 ERR-024] and reads nothing');
select is(pg_temp.staff_dml('m', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rp'))), 'ERR:42501',
  '[I10 c6] a Moderator with no key is refused');
select is(tests.fx_sf_audit('private_group_content_viewed'), 0::bigint, '[I10 c6] (no view recorded yet)');
select is(pg_temp.staff_dml('w', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rp'))), 'OK:1',
  '[I10 c6 AC-037 BR-040] a Moderator with PRIVATE_GROUP_MODERATE opens the reported item through the Moderation tool');
select is(tests.fx_sf_audit('private_group_content_viewed'), 1::bigint, '[I10 c6 NFR-PRIV-002] the access is in the Audit Log, in the same transaction');
select is(pg_temp.staff('w', format($q$ select body from nestly.posts where id = %L $q$, pg_temp.g('privpost'))), 'hello private group',
  '[I10 c6] inside that transaction the Moderator reads the reported post');
select is(pg_temp.staff('w', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('anonpost'))), '0',
  '[I10 c6 NFR-PRIV-002] and nothing else of the Group (no free browsing)');
select is(pg_temp.staff('w', format($q$ select count(*)::text from nestly.group_members where group_id = %L $q$, pg_temp.g('priv'))), '0',
  '[I10 c6] no Membership comes with it');
select is(pg_temp.staff_dml('d', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rp'))), 'OK:1',
  '[I10 c6 BR-040] the Admin opens it the same way');
select is(tests.fx_sf_audit('private_group_content_viewed'), 2::bigint, '[I10 c6] audited too');
select is(pg_temp.dml('b', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rp'))), 'ERR:42501',
  '[I10 c6] a community user writes no view');
select set_config('t.rpub', tests.fx_rp_add(pg_temp.id('c'), 'post', pg_temp.g('pubpost'))::text, true);
select is(pg_temp.staff('d', format($q$ select is_private_group::text || ':' || coalesce(target_text, 'none') from nestly.reports where id = %L $q$, pg_temp.g('rpub'))),
  'false:hello public group', '[I10 c6] a report on Public Group content keeps its copy as before');
select is(pg_temp.staff_dml('w', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rpub'))), 'ERR:42501',
  '[I10 c6] the view is only for Private Group content');

-- ---- Group Roles (FR-GRP-003, BR-041, AC-038, VAL-021, ERR-019, ERR-026) --------------------------------------------------------
select pg_temp.join('c', 'pub');
select pg_temp.join('e', 'pub');
select pg_temp.join('f', 'pub');
select is(pg_temp.set_role('b', 'pub', 'c', 'moderator'), 'OK:0', '[I10 c7 AC-038] a member changes no Role');
select is(pg_temp.set_role('a', 'pub', 'b', 'admin'), 'OK:1', '[I10 c7 VAL-021] only the Owner appoints an Admin');
select is(pg_temp.set_role('b', 'pub', 'c', 'moderator'), 'OK:1', '[I10 c7 FR-GRP-003] an Admin appoints a Group Moderator');
select is(pg_temp.set_role('b', 'pub', 'e', 'admin'), 'ERR:42501', '[I10 c7 VAL-021] an Admin does not appoint an Admin');
select is(pg_temp.set_role('b', 'pub', 'a', 'member'), 'OK:0', '[I10 c7 AC-038 ERR-019] an Admin does not act against the Owner');
select is(pg_temp.set_role('a', 'pub', 'e', 'admin'), 'OK:1', '[I10 c7 fixture] the Owner appoints a second Admin');
select is(pg_temp.set_role('b', 'pub', 'e', 'member'), 'OK:0', '[I10 c7 AC-038 ERR-019] an Admin does not act against another Admin');
select is(pg_temp.remove('b', 'pub', 'e'), 'OK:0', '[I10 c7 ERR-019] nor remove them');
select is(pg_temp.set_role('c', 'pub', 'f', 'moderator'), 'OK:0', '[I10 c7] a Group Moderator manages no Role');
select is(pg_temp.remove('c', 'pub', 'b'), 'OK:0', '[I10 c7 AC-038] a Group Moderator does not remove an Admin');
select is(pg_temp.remove('c', 'pub', 'f'), 'OK:1', '[I10 c7 AC-038] a Group Moderator removes a member');
select is(pg_temp.role_of('pub', 'f'), '-', '[I10 c7] who is no longer a member');
select is(tests.fx_gr_access(pg_temp.g('pub')) like '%' || pg_temp.id('f')::text || '%', false, '[I10 c7] and whose access copy went with it');
select is(pg_temp.join('f', 'pub'), 'OK:1', '[I10 c7] a removed member may join a Public Group again (removal is not a block)');
select is(pg_temp.remove('b', 'pub', 'c'), 'OK:1', '[I10 c7] an Admin removes a Group Moderator');
select pg_temp.join('c', 'pub');
select is(pg_temp.remove('a', 'pub', 'a'), 'ERR:NS026', '[I10 c7 ERR-026 BR-041] the Owner does not leave before transferring ownership');
select is(pg_temp.set_role('a', 'pub', 'a', 'admin'), 'ERR:NS026', '[I10 c7 ERR-026] nor steps down without another Owner');
select is(pg_temp.remove('b', 'pub', 'a'), 'OK:0', '[I10 c7] nobody removes the Owner');
select is(pg_temp.remove('e', 'pub', 'e'), 'OK:1', '[I10 c7 FR-GRP-002] a member (here an Admin) leaves on their own');
select is(pg_temp.set_role('a', 'pub', 'b', 'owner'), 'OK:1', '[I10 c7 FR-GRP-003] the Owner makes an Admin the Owner (a transfer, step 1)');
select is(pg_temp.set_role('a', 'pub', 'a', 'admin'), 'OK:1', '[I10 c7] and steps down to Admin (step 2)');
select is(pg_temp.role_of('pub', 'a') || ',' || pg_temp.role_of('pub', 'b'), 'admin,owner', '[I10 c7] a is now an Admin, b the Owner');
select is(pg_temp.remove('a', 'pub', 'a'), 'OK:1', '[I10 c7 ERR-026] the former Owner may now leave');
select pg_temp.join('a', 'pub');

-- ---- group content removal by a Group Moderator -------------------------------------------------------------------------------
select set_config('t.fpost', pg_temp.gpost('f', 'pub', 'by a member'), true);
select set_config('t.bpost', pg_temp.gpost('b', 'pub', 'by the owner'), true);
select pg_temp.set_role('b', 'pub', 'c', 'moderator');
select is(pg_temp.n('c', format($q$ select nestly.delete_post(%L)::text $q$, pg_temp.g('bpost'))), '0', '[I10 c8 ERR-019] a Group Moderator does not remove the Owner''s post');
select is(pg_temp.n('c', format($q$ select nestly.delete_post(%L)::text $q$, pg_temp.g('fpost'))), '1', '[I10 c8 FR-GRP-003] a Group Moderator removes a member''s post');
select is(pg_temp.sees_post('a', pg_temp.g('fpost')), '0', '[I10 c8] it is gone');
select set_config('t.fc', pg_temp.comment('f', pg_temp.g('bpost'), 'by a member'), true);
select is(pg_temp.dml('c', format($q$ update nestly.posts set body = 'edited' where id = %L $q$, pg_temp.g('bpost'))), 'OK:0',
  '[I10 c8] a Group manager does not edit a post');
select is(pg_temp.n('c', format($q$ select nestly.delete_comment(%L)::text $q$, pg_temp.g('fc'))), '1', '[I10 c8] a Group Moderator removes a member''s comment');
select is(pg_temp.n('f', format($q$ select nestly.delete_post(%L)::text $q$, pg_temp.g('bpost'))), '0', '[I10 c8] a member removes nobody''s post');

-- ---- block from the Group (GroupMemberEnforcement) ----------------------------------------------------------------------------
select is(pg_temp.dml('c', format($q$ insert into nestly.group_bans (group_id, user_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('b'))), 'ERR:42501',
  '[I10 c9 ERR-019] a Group Moderator does not block the Owner');
select is(pg_temp.dml('c', format($q$ insert into nestly.group_bans (group_id, user_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('f'))), 'OK:1',
  '[I10 c9] a Group Moderator blocks a member');
select is(pg_temp.role_of('pub', 'f'), '-', '[I10 c9] the block removes the member in the same statement');
select is(pg_temp.join('f', 'pub'), 'ERR:42501', '[I10 c9] a blocked user cannot join again');
select is(pg_temp.n('c', format($q$ select count(*)::text from nestly.regular_names where user_id = %L $q$, pg_temp.id('f'))), '1',
  '[I10 c9] the Group''s Moderators read the blocked user''s name (to unblock)');
select is(pg_temp.dml('f', format($q$ insert into nestly.group_bans (group_id, user_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('c'))), 'ERR:42501',
  '[I10 c9] a non-member blocks nobody');
select is(pg_temp.dml('c', format($q$ delete from nestly.group_bans where group_id = %L and user_id = %L $q$, pg_temp.g('pub'), pg_temp.id('f'))), 'OK:1',
  '[I10 c9] a Group Moderator unblocks');
select is(pg_temp.join('f', 'pub'), 'OK:1', '[I10 c9] and the user may join again');
select is(pg_temp.dml('b', format($q$ insert into nestly.group_bans (group_id, user_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('e'))), 'OK:1',
  '[I10 c9] the Owner blocks a non-member');
select is(pg_temp.dml('c', format($q$ delete from nestly.group_bans where group_id = %L and user_id = %L $q$, pg_temp.g('pub'), pg_temp.id('e'))), 'OK:0',
  '[I10 c9 ERR-019] a Group Moderator does not lift a block made by a higher Role');
select is(pg_temp.dml('b', format($q$ delete from nestly.group_bans where group_id = %L and user_id = %L $q$, pg_temp.g('pub'), pg_temp.id('e'))), 'OK:1',
  '[I10 c9] the Owner lifts it');

-- ---- invitations (FR-GRP-002) -------------------------------------------------------------------------------------------------
select set_config('t.priv2', pg_temp.mk('a', 'Private circle', 'private'), true);
select is(pg_temp.dml('a', format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g('priv2'), pg_temp.id('b'))),
  'ERR:42501', '[I10 c10] only a Friend is invited');
select is(pg_temp.dml('a', format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g('priv2'), pg_temp.id('c'))),
  'OK:1', '[I10 c10 FR-GRP-002] the Owner invites a Friend');
select is(pg_temp.dml('a', format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g('priv2'), pg_temp.id('c'))),
  'ERR:23505', '[I10 c10] one pending invitation per Group and invitee');
select is(pg_temp.join('c', 'priv2'), 'ERR:42501', '[I10 c10] a pending invitation is not yet a Membership');
select is(pg_temp.dml('c', format($q$ update nestly.group_invitations set status = 'accepted' where group_id = %L $q$, pg_temp.g('priv2'))), 'OK:1',
  '[I10 c10 FR-GRP-002] the invitee accepts');
select is(pg_temp.role_of('priv2', 'c'), 'member', '[I10 c10] and becomes a member of the Private Group in the same statement');
select is(pg_temp.dml('a', format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g('priv2'), pg_temp.id('c'))),
  'ERR:42501', '[I10 c10] a member is not invited');
select is(pg_temp.dml('c', format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g('priv2'), pg_temp.id('a'))),
  'ERR:42501', '[I10 c10 FR-GRP-003] a plain member does not invite');
select is(pg_temp.dml('a', format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g('priv2'), pg_temp.id('e'))),
  'OK:1', '[I10 c10] another invitation');
select is(pg_temp.dml('e', format($q$ update nestly.group_invitations set status = 'declined' where group_id = %L $q$, pg_temp.g('priv2'))), 'OK:1',
  '[I10 c10] the invitee declines');
select is(pg_temp.role_of('priv2', 'e'), '-', '[I10 c10] and stays outside');
select is(pg_temp.dml('e', format($q$ update nestly.group_invitations set status = 'accepted' where group_id = %L $q$, pg_temp.g('priv2'))), 'OK:0',
  '[I10 c10] a declined invitation is not accepted later');

-- ---- recommendation to a Friend (FR-GRP-002, AC-050) --------------------------------------------------------------------------
select tests.fx_nt_purge();
select is(pg_temp.dml('a', format($q$ insert into nestly.group_recommendations (group_id, recipient_id) values (%L, %L) $q$, pg_temp.g('priv'), pg_temp.id('e'))),
  'OK:1', '[I10 c11 AC-050] a Regular user recommends a Group to an active Friend');
select is(pg_temp.types('e'), 'group_recommended', '[I10 c11 AC-050] the Friend gets a notification');
select is(tests.fx_nt_one(pg_temp.id('e'), 'group_recommended'), 'actor=' || pg_temp.id('a') || ' target=group:' || pg_temp.g('priv') || ' critical=f read=f',
  '[I10 c11 AC-050] whose target is the Group (the deep link)');
select is(pg_temp.role_of('priv', 'e'), '-', '[I10 c11 AC-050] and no Membership changes');
select is(pg_temp.dml('a', format($q$ insert into nestly.group_recommendations (group_id, recipient_id) values (%L, %L) $q$, pg_temp.g('priv'), pg_temp.id('b'))),
  'ERR:42501', '[I10 c11 AC-050] only to a Friend');
select is(pg_temp.dml('p', format($q$ insert into nestly.group_recommendations (group_id, recipient_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('a'))),
  'ERR:42501', '[I10 c11 FR-GRP-002] a Professional does not recommend (Regular users only)');

-- ---- notifications and Highlights (FR-ALG-010, BR-060, VAL-035, AC-066) --------------------------------------------------------
select tests.fx_nt_purge();
select set_config('t.g3', pg_temp.mk('b', 'Notify group', 'private'), true);
select is(pg_temp.ask('a', 'g3'), 'OK:1', '[I10 c12 fixture] a asks to join');
select is(pg_temp.types('b'), 'group_join_requested', '[I10 c12 FR-GRP-002] the Owner hears of the Join Request');
select is(pg_temp.decide('b', 'g3', 'a', 'approved'), 'OK:1', '[I10 c12 fixture] and approves it');
select is(pg_temp.types('a'), 'group_join_approved', '[I10 c12 FR-ALG-010] the requester hears of the decision (a direct event)');
select tests.fx_nt_purge();
select is(pg_temp.dml('a', format($q$ insert into nestly.group_notification_preferences (group_id, mode) values (%L, 'all') $q$, pg_temp.g('g3'))), 'OK:1',
  '[I10 c12 VAL-035] a member chooses "all" for the Group');
select is(pg_temp.dml('c', format($q$ insert into nestly.group_notification_preferences (group_id, mode) values (%L, 'all') $q$, pg_temp.g('g3'))), 'ERR:23503',
  '[I10 c12] a non-member sets no mode');
select is(pg_temp.dml('a', format($q$ update nestly.group_notification_preferences set mode = 'loud' where group_id = %L $q$, pg_temp.g('g3'))), 'ERR:23514',
  '[I10 c12 VAL-035] the mode is all, highlights or off');
select pg_temp.dml('a', format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g('pub')));
select set_config('t.n1', pg_temp.gpost('b', 'g3', 'new post'), true);
select is(pg_temp.types('a'), 'group_post', '[I10 c12 FR-ALG-010] on "all" a member hears of every new post');
select is(pg_temp.types('b'), '', '[I10 c12] never the author');
select pg_temp.dml('b', format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g('g3'), pg_temp.id('e')));
select is(pg_temp.types('e'), '', '[I10 c12 fixture] (e and b are not Friends: no invitation)');
-- e joins g3 through a request, default mode (highlights)
select pg_temp.ask('e', 'g3');
select pg_temp.decide('b', 'g3', 'e', 'approved');
select tests.fx_nt_purge();
select pg_temp.dml('a', format($q$ insert into nestly.group_notification_preferences (group_id, mode) values (%L, 'all') $q$, pg_temp.g('g3')));
select set_config('t.n2', pg_temp.gpost('a', 'g3', 'another post'), true);
select is(pg_temp.types('e'), '', '[I10 c12 FR-ALG-010 AC-066] on the default "highlights" a new post is not a notification');
select is(pg_temp.dml('b', format($q$ update nestly.groups set pinned_post_id = %L where id = %L $q$, pg_temp.g('n2'), pg_temp.g('g3'))), 'OK:1',
  '[I10 c12] the Owner pins a post');
select is(pg_temp.types('e') || '|' || pg_temp.types('a'), 'group_pinned|group_pinned', '[I10 c12 FR-ALG-010 AC-066] a pinned post (an announcement) reaches "highlights" and "all"');
select is(tests.fx_gr_state(pg_temp.g('g3')), 'privacy=private status=active pinned=t', '[I10 c12] the Group holds the pin');
select is(pg_temp.dml('b', format($q$ update nestly.groups set pinned_post_id = %L where id = %L $q$, pg_temp.g('pubpost'), pg_temp.g('g3'))), 'ERR:42501',
  '[I10 c12] only a post of the Group is pinned');
select tests.fx_nt_purge();
select pg_temp.dml('e', format($q$ insert into nestly.group_notification_preferences (group_id, mode) values (%L, 'off') $q$, pg_temp.g('g3')));
select set_config('t.n3', pg_temp.gpost('a', 'g3', 'popular soon'), true);
select pg_temp.join('f', 'g3');
select is(pg_temp.ask('f', 'g3'), 'OK:1', '[I10 c12 fixture] f asks');
select pg_temp.decide('b', 'g3', 'f', 'approved');
select tests.fx_nt_purge();
select pg_temp.like_post('b', pg_temp.g('n3'));
select pg_temp.like_post('e', pg_temp.g('n3'));
select pg_temp.comment('b', pg_temp.g('n3'), 'one');
select pg_temp.comment('e', pg_temp.g('n3'), 'two');
select is(pg_temp.types('f'), '', '[I10 c12 BR-060] below the threshold (5) no highlight');
select pg_temp.like_post('f', pg_temp.g('n3'));
select is(pg_temp.types('f'), '', '[I10 c12] the fifth engagement is the actor''s own: the actor is not told');
select is(pg_temp.types('b'), 'group_highlight', '[I10 c12 FR-ALG-010 AC-066 BR-060] at the threshold a member on "highlights" hears of the highlight (deterministic, no ML)');
select is(pg_temp.types('e'), '', '[I10 c12 VAL-035] a member on "off" does not');
select is(position('group_highlight' in pg_temp.types('a')), 0, '[I10 c12] nor the post''s author');
select pg_temp.comment('f', pg_temp.g('n3'), 'three');
select is(pg_temp.types('b'), 'group_highlight', '[I10 c12] a highlight is told once');
select tests.fx_nt_pref(pg_temp.id('a'), 'groups', false);
select set_config('t.n4', pg_temp.gpost('b', 'g3', 'muted category'), true);
select is(position('group_post' in pg_temp.types('a')), 0, '[I10 c12 BR-061] the groups category switched off silences the Group''s notifications');

-- ---- the Group itself: edit, privacy, delete (FR-GRP-003) ---------------------------------------------------------------------
select pg_temp.set_role('b', 'g3', 'a', 'admin');
select is(pg_temp.dml('a', format($q$ update nestly.groups set rules = 'Be kind' where id = %L $q$, pg_temp.g('g3'))), 'OK:1', '[I10 c13 FR-GRP-003] an Admin edits the Rules');
select is(pg_temp.dml('a', format($q$ update nestly.groups set privacy = 'public' where id = %L $q$, pg_temp.g('g3'))), 'ERR:NS027',
  '[I10 c13 VAL-021 ERR-019] only the Owner changes Public/Private');
select is(pg_temp.dml('a', format($q$ update nestly.groups set status = 'deleted' where id = %L $q$, pg_temp.g('g3'))), 'ERR:NS027',
  '[I10 c13 VAL-021] only the Owner deletes the Group');
select is(pg_temp.dml('e', format($q$ update nestly.groups set rules = 'mine' where id = %L $q$, pg_temp.g('g3'))), 'OK:0', '[I10 c13] a member edits nothing');
select is(pg_temp.dml('b', format($q$ update nestly.groups set privacy = 'public' where id = %L $q$, pg_temp.g('g3'))), 'OK:1', '[I10 c13 FR-GRP-003] the Owner changes Public/Private');
select is(pg_temp.dml('b', format($q$ update nestly.groups set status = 'deleted' where id = %L $q$, pg_temp.g('g3'))), 'OK:1', '[I10 c13 FR-GRP-003] the Owner deletes the Group');
select is(tests.fx_gr_state(pg_temp.g('g3')), 'privacy=public status=deleted pinned=f', '[I10 c13] deleted (and unpinned)');
select is(pg_temp.n('e', format($q$ select status from nestly.groups where id = %L $q$, pg_temp.g('g3'))), 'deleted',
  '[I10 c13] inside the deleting transaction only, the deleted row stays readable (the UPDATE needs it); every later transaction reads nothing');
select is(pg_temp.sees_post('e', pg_temp.g('n3')), '0', '[I10 c13] and so is its content');
select is(pg_temp.dml('b', format($q$ update nestly.groups set status = 'active' where id = %L $q$, pg_temp.g('g3'))), 'OK:0', '[I10 c13] a deletion is final');

select is(pg_temp.ask('f', 'priv2'), 'OK:1', '[I10 c13 fixture] a pending request on another Group');
select is(pg_temp.dml('a', format($q$ update nestly.groups set status = 'deleted' where id = %L $q$, pg_temp.g('priv2'))), 'OK:1', '[I10 c13 fixture] its Owner deletes it');
select is(pg_temp.decide('a', 'priv2', 'f', 'approved'), 'OK:0', '[I10 c13] nobody is admitted to a deleted Group');
select is(pg_temp.role_of('priv2', 'f'), '-', '[I10 c13] (no Membership)');

-- ---- suspended accounts (r15) ---------------------------------------------------------------------------------------------------
select tests.set_status(pg_temp.id('c'), 'suspended');
select is(pg_temp.n('c', format($q$ select count(*)::text from nestly.groups where id = %L $q$, pg_temp.g('pub'))), '0', '[I10 c14 r15] a suspended account reads no Group');
select is(pg_temp.n('a', format($q$ select count(*)::text from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g('pub'), pg_temp.id('c'))), '0',
  '[I10 c14] a suspended member is not shown to others');
select tests.set_status(pg_temp.id('c'), 'active');

select * from finish();
rollback;
