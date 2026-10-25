-- pgTAP, run by pg_prove as app_server (CI `db` job; I10 completion C: FR-GRP-001..003, FR-ALG-010, BR-041, BR-059, BR-060, AC-036..038,
-- AC-050, AC-066, VAL-035, §13 GroupInvitation and GroupMemberEnforcement).
-- Source of expected values: Afik's decisions of 21.10.2026 (decisions-in-force.md §11.13: only Highlights reach the main feed, a Private
-- Group's content only its members; §11.15: any member invites a Friend, a Private Group's invitation waits for the Owner's or an Admin's
-- approval; §11.16: warning + mute 24 hours or 7 days, remove + block, unblock, no plain removal; §11.17: 5% of the members, at least 3, at
-- most 20) and the brief's ⭐ defaults (the threshold on the active members now, a Highlight stays; Moderators and higher enforce, the Owner
-- and Admins approve; a muted member cannot invite or recommend; the member and the Group's managers read the history), not the migration.
-- People: a, b, c = fr_c, e = gr_e, f = gr_f (Regular), p = Professional, d = fr_d (Admin). Friends: a-c, e-a (and a-f, added below).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F10.3-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_gr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'c' then tests.fx_fr_id('fr_c') when 'd' then tests.fx_fr_id('fr_d')
    when 'e' then tests.fx_gr_id('gr_e') when 'f' then tests.fx_gr_id('gr_f')
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
create function pg_temp.admit(p_owner text, p_who text, p_group text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_join_requests (group_id) values (%L) $q$, pg_temp.g(p_group)))
      || '/' || pg_temp.dml(p_owner, format($q$ update nestly.group_join_requests set status = 'approved' where group_id = %L and user_id = %L and status = 'pending' $q$,
                 pg_temp.g(p_group), pg_temp.id(p_who)))
$f$;
create function pg_temp.set_role(p_who text, p_group text, p_whom text, p_role text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.group_members set role = %L where group_id = %L and user_id = %L $q$, p_role, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.role_of(p_group text, p_whom text) returns text language sql as $f$
  select coalesce((select split_part(x, ':', 2) from unnest(string_to_array(tests.fx_gr_roles(pg_temp.g(p_group)), ',')) x
                    where split_part(x, ':', 1) = pg_temp.id(p_whom)::text), '-')
$f$;
create function pg_temp.invite(p_who text, p_group text, p_whom text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_invitations (group_id, invitee_id) values (%L, %L) $q$, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.inv(p_group text, p_whom text) returns text language sql as $f$
  select tests.fx_grr_invitation(pg_temp.g(p_group), pg_temp.id(p_whom))
$f$;
create function pg_temp.inv_set(p_who text, p_group text, p_whom text, p_status text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.group_invitations set status = %L where group_id = %L and invitee_id = %L $q$,
    p_status, pg_temp.g(p_group), pg_temp.id(p_whom)))
$f$;
create function pg_temp.enf(p_who text, p_group text, p_whom text, p_kind text, p_reason text default null, p_hours integer default null,
                            p_text text default null) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_member_enforcements (group_id, user_id, kind, reason_key, mute_hours, reason_text)
                                      values (%L, %L, %L, %L, %L, %L) $q$, pg_temp.g(p_group), pg_temp.id(p_whom), p_kind, p_reason, p_hours, p_text))
$f$;
create function pg_temp.gpost(p_who text, p_group text, p_body text default 'group post') returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.posts (audience, body, group_id) values ('everyone', %L, %L) $q$, p_body, pg_temp.g(p_group)))
$f$;
create function pg_temp.gpost_id(p_who text, p_group text, p_body text default 'group post') returns text language sql as $f$
  select pg_temp.n(p_who, format($q$ insert into nestly.posts (audience, body, group_id) values ('everyone', %L, %L) returning id::text $q$, p_body, pg_temp.g(p_group)))
$f$;
create function pg_temp.comment(p_who text, p_post uuid, p_body text default 'a comment') returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.comments (post_id, body) values (%L, %L) $q$, p_post, p_body))
$f$;
create function pg_temp.like_post(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.reactions (post_id) values (%L) $q$, p_post))
$f$;
create function pg_temp.count(p_who text, p_sql text) returns text language sql as $f$
  select pg_temp.n(p_who, 'select count(*)::text from ' || p_sql)
$f$;
create function pg_temp.types(p_who text) returns text language sql as $f$ select tests.fx_nt_types(pg_temp.id(p_who)) $f$;

select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select tests.fx_fr_add(pg_temp.id('e'), pg_temp.id('a'), 'accepted');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('f'), 'accepted');
select tests.fx_nt_purge();

-- ---- c1 structure --------------------------------------------------------------------------------------------------------------
select is((select count(*) from pg_class c where c.relnamespace = 'nestly'::regnamespace
            and c.relname in ('group_highlights', 'group_member_enforcements') and c.relrowsecurity and c.relforcerowsecurity), 2::bigint,
  '[F10.3-a c1 r8] the two new tables have RLS enabled and forced');
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text || ':' || (select string_agg(r.rolname, '+') from pg_roles r where r.oid = any (pl.polroles)),
                             ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid
            where c.relnamespace = 'nestly'::regnamespace and c.relname in ('group_highlights', 'group_member_enforcements')),
  'group_highlights.group_highlights_insert_notify:a:app_owner, group_highlights.group_highlights_select_member:r:authenticated, '
  || 'group_member_enforcements.group_member_enforcements_insert_manager:a:authenticated, group_member_enforcements.group_member_enforcements_select_party:r:authenticated',
  '[F10.3-a c1] their policies, exactly: no client write on a Highlight, no update or delete of an enforcement record');
select is((select string_agg(c.relname || ':' || p.privilege_type, ', ' order by c.relname, p.privilege_type)
             from pg_class c cross join lateral (select unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as privilege_type) p
            where c.relnamespace = 'nestly'::regnamespace and c.relname in ('group_highlights', 'group_member_enforcements')
              and (has_table_privilege('authenticated', c.oid, p.privilege_type)
                or (p.privilege_type in ('INSERT', 'UPDATE') and has_any_column_privilege('authenticated', c.oid, p.privilege_type)))),
  'group_member_enforcements:INSERT', '[F10.3-a c1] authenticated may only insert enforcement records (granted columns); nothing on Highlights');
select is((select string_agg(p.proname || ':' || p.prosecdef::text, ', ' order by p.proname) from pg_proc p
            where p.pronamespace = 'nestly'::regnamespace
              and p.proname in ('notify_group', 'group_highlight_threshold', 'group_invitations_route', 'group_member_enforcements_apply', 'group_invitations_decide')),
  'group_highlight_threshold:false, group_invitations_decide:false, group_invitations_route:false, group_member_enforcements_apply:false, notify_group:true',
  '[F10.3-a c1 r10] notify_group stays the one definer of the Groups; every new function is invoker');
select is((select count(*) from pg_proc p where p.pronamespace = 'nestly'::regnamespace and p.proname in ('group_invitations_route', 'group_member_enforcements_apply')
            and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('app_server', p.oid, 'EXECUTE'))), 0::bigint,
  '[F10.3-a c1] no runtime role executes the new trigger functions');

-- ---- c2 the Highlights threshold (§11.17, BR-059, BR-060) ------------------------------------------------------------------------
select is(pg_temp.n('a', $q$ select string_agg(version || ':' || is_active, ',' order by version) from nestly.group_highlight_configurations $q$), '1:false,2:true',
  '[F10.3-a c2 BR-059] the threshold is versioned: v2 is the active one, v1 stays as history');
select is(pg_temp.n('a', $q$ select concat_ws(',', nestly.group_highlight_threshold(0), nestly.group_highlight_threshold(10), nestly.group_highlight_threshold(60),
                                              nestly.group_highlight_threshold(61), nestly.group_highlight_threshold(100), nestly.group_highlight_threshold(399),
                                              nestly.group_highlight_threshold(400), nestly.group_highlight_threshold(401), nestly.group_highlight_threshold(1000),
                                              nestly.group_highlight_threshold(100000)) $q$),
  '3,3,3,4,5,20,20,20,20,20',
  '[F10.3-a c2 FR-ALG-010 BR-060 AC-066 AC-165] 5% of the members rounded up, at least 3, at most 20: 10 members -> 3; 61 -> 4; 100 -> 5; 400 -> 20; 1,000 and more never above 20');

-- ---- c3 invitations (§11.15, FR-GRP-002, AC-050) -----------------------------------------------------------------------------------
select set_config('t.circle', pg_temp.mk('b', 'Private circle', 'private'), true);
select is(pg_temp.admit('b', 'a', 'circle'), 'OK:1/OK:1', '[F10.3-a c3 fixture] a joins the Private Group through an approved request');
select tests.fx_nt_purge();
select is(pg_temp.invite('a', 'circle', 'c'), 'OK:1', '[F10.3-a c3 FR-GRP-002 AC-167] a plain member invites a Friend');
select is(pg_temp.inv('circle', 'c'), 'awaiting_approval needs_approval=t approved=f', '[F10.3-a c3] in a Private Group it waits for approval');
select is(pg_temp.count('c', 'nestly.group_invitations'), '0', '[F10.3-a c3 AC-167] the invitee does not see it yet');
select is(pg_temp.count('b', format('nestly.group_invitations where group_id = %L', pg_temp.g('circle'))), '1', '[F10.3-a c3] the Owner sees it');
select is(pg_temp.count('b', format('nestly.regular_names where user_id = %L', pg_temp.id('c'))), '1', '[F10.3-a c3] with the invitee''s name (to decide)');
select is(pg_temp.types('b') || '|' || pg_temp.types('c'), 'group_invitation_pending|', '[F10.3-a c3] the Owner is asked to approve; the invitee hears nothing');
select is(tests.fx_nt_one(pg_temp.id('b'), 'group_invitation_pending'), 'actor=' || pg_temp.id('a') || ' target=group:' || pg_temp.g('circle') || ' critical=f read=f',
  '[F10.3-a c3] the request names the inviter and the Group');
select is(pg_temp.inv_set('c', 'circle', 'c', 'accepted'), 'OK:0', '[F10.3-a c3] the invitee cannot accept an invitation that waits');
select is(pg_temp.inv_set('a', 'circle', 'c', 'pending'), 'ERR:42501', '[F10.3-a c3] the inviting member does not approve it');
select is(pg_temp.invite('a', 'circle', 'c'), 'ERR:23505', '[F10.3-a c3] one open invitation per Group and invitee');
select is(pg_temp.inv_set('b', 'circle', 'c', 'pending'), 'OK:1', '[F10.3-a c3 FR-GRP-002 AC-167] the Owner approves');
select is(pg_temp.inv('circle', 'c'), 'pending needs_approval=t approved=t', '[F10.3-a c3] now it is open');
select is(pg_temp.count('c', 'nestly.group_invitations'), '1', '[F10.3-a c3] and the invitee sees it');
select is(pg_temp.types('c') || '|' || pg_temp.types('a'), 'group_invited|group_invitation_approved', '[F10.3-a c3 AC-167] the invitee is invited and the inviter told');
select is(pg_temp.inv_set('c', 'circle', 'c', 'accepted'), 'OK:1', '[F10.3-a c3] the invitee accepts');
select is(pg_temp.role_of('circle', 'c'), 'member', '[F10.3-a c3] and is a member of the Private Group');
select tests.fx_nt_purge();
select is(pg_temp.invite('a', 'circle', 'e'), 'OK:1', '[F10.3-a c3] another invitation that waits');
select is(pg_temp.inv_set('b', 'circle', 'e', 'rejected'), 'OK:1', '[F10.3-a c3] the Owner rejects it');
select is(pg_temp.count('e', 'nestly.group_invitations'), '0', '[F10.3-a c3] the invitee never sees a rejected invitation');
select is(pg_temp.types('a') || '|' || pg_temp.types('e'), 'group_invitation_rejected|', '[F10.3-a c3 AC-167] the inviter is told; the invitee is not');
select is(pg_temp.inv_set('b', 'circle', 'e', 'pending'), 'OK:0', '[F10.3-a c3] a rejected invitation stays rejected');
select is(pg_temp.invite('a', 'circle', 'f'), 'OK:1', '[F10.3-a c3] one more that waits');
select is(pg_temp.inv_set('a', 'circle', 'f', 'cancelled'), 'OK:1', '[F10.3-a c3] the inviter cancels it before approval');
select is(pg_temp.count('f', 'nestly.group_invitations'), '0', '[F10.3-a c3] and the invitee never sees it');
select is(pg_temp.invite('a', 'circle', 'f'), 'OK:1', '[F10.3-a c3] invited again, waiting');
select is(pg_temp.admit('b', 'f', 'circle'), 'OK:1/OK:1', '[F10.3-a c3 fixture] meanwhile the invitee joins through a request');
select is(pg_temp.inv_set('b', 'circle', 'f', 'pending'), 'ERR:42501', '[F10.3-a c3] an invitation of someone who is already a member is not approved');
select is(pg_temp.inv_set('b', 'circle', 'f', 'rejected'), 'OK:1', '[F10.3-a c3] it can be rejected');
select pg_temp.dml('f', format($q$ delete from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g('circle'), pg_temp.id('f')));
select is(pg_temp.invite('a', 'circle', 'b'), 'ERR:42501', '[F10.3-a c3] only a Friend is invited (a and b are not Friends)');
select is(pg_temp.invite('b', 'circle', 'a'), 'ERR:42501', '[F10.3-a c3] a member is not invited');
select is(pg_temp.invite('p', 'circle', 'a'), 'ERR:42501', '[F10.3-a c3] a non-member invites no one');
select set_config('t.walks', pg_temp.mk('a', 'Evening walks', 'public'), true);
select is(pg_temp.join('c', 'walks'), 'OK:1', '[F10.3-a c3 fixture] c joins the Public Group');
select is(pg_temp.invite('c', 'walks', 'a'), 'ERR:42501', '[F10.3-a c3] (the Owner is a member)');
select tests.fx_fr_add(pg_temp.id('c'), pg_temp.id('e'), 'accepted');
select is(pg_temp.invite('c', 'walks', 'e'), 'OK:1', '[F10.3-a c3 FR-GRP-002] in a Public Group a member''s invitation is open at once');
select is(pg_temp.inv('walks', 'e'), 'pending needs_approval=f approved=f', '[F10.3-a c3] with no approval');
select is(pg_temp.count('e', format('nestly.group_invitations where group_id = %L', pg_temp.g('walks'))), '1', '[F10.3-a c3] the invitee sees it at once');
select is(pg_temp.invite('b', 'circle', 'e') , 'ERR:42501', '[F10.3-a c3] (b and e are not Friends)');
select tests.fx_fr_add(pg_temp.id('b'), pg_temp.id('e'), 'accepted');
select is(pg_temp.invite('b', 'circle', 'e'), 'OK:1', '[F10.3-a c3] the Owner''s invitation to a Private Group needs no approval');
select is(pg_temp.inv('circle', 'e'), 'pending needs_approval=f approved=f', '[F10.3-a c3] it is open at once');

-- ---- c4 warning + mute (§11.16, FR-GRP-003, AC-038, BR-041) ----------------------------------------------------------------------
select set_config('t.pub', pg_temp.mk('a', 'Morning walks', 'public'), true);
select pg_temp.join('c', 'pub');
select pg_temp.join('e', 'pub');
select pg_temp.join('f', 'pub');
select is(pg_temp.set_role('a', 'pub', 'c', 'moderator'), 'OK:1', '[F10.3-a c4 fixture] the Owner appoints c Group Moderator');
select set_config('t.pubpost', pg_temp.gpost_id('a', 'pub', 'welcome'), true);
select tests.fx_nt_purge();
select is(pg_temp.enf('e', 'pub', 'f', 'warn_mute', 'spam', 24), 'ERR:42501', '[F10.3-a c4 AC-038] a plain member warns no one');
select is(pg_temp.enf('c', 'pub', 'a', 'warn_mute', 'spam', 24), 'ERR:42501', '[F10.3-a c4 BR-041 ERR-019] a Group Moderator does not act against the Owner');
select is(pg_temp.enf('c', 'pub', 'c', 'warn_mute', 'spam', 24), 'ERR:42501', '[F10.3-a c4] nor against themselves');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', 'spam', 12), 'ERR:23514', '[F10.3-a c4] the mute lasts 24 hours or 7 days only');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', null, 24), 'ERR:23514', '[F10.3-a c4] a warning has a reason');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', 'other', 24), 'ERR:23514', '[F10.3-a c4] "other" comes with its text');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', 'other', 24, repeat('x', 501)), 'ERR:23514', '[F10.3-a c4] of up to 500 characters');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', 'spam', 168, 'more'), 'ERR:23514', '[F10.3-a c4] text comes only with "other"');
select is(pg_temp.enf('c', 'pub', 'f', 'warn_mute', 'spam', 24), 'OK:1', '[F10.3-a c4 FR-GRP-003 AC-168] a Group Moderator warns and mutes a member, together');
select is(pg_temp.types('f'), 'group_member_muted', '[F10.3-a c4] the member gets the notice');
select is(tests.fx_nt_one(pg_temp.id('f'), 'group_member_muted'), 'actor=- target=group:' || pg_temp.g('pub') || ' critical=t read=f',
  '[F10.3-a c4] a critical notice about the Group that does not name the manager');
select is(pg_temp.n('f', format($q$ select string_agg(kind || ':' || reason_key || ':' || (mute_until > now() + interval '23 hours')::text, ',')
                                     from nestly.group_member_enforcements where group_id = %L $q$, pg_temp.g('pub'))),
  'warn_mute:spam:true', '[F10.3-a c4 ⭐ AC-168 OP-070] the member reads their own notice and when the mute ends');
select is(pg_temp.count('e', 'nestly.group_member_enforcements'), '0', '[F10.3-a c4 ⭐] another member reads none of it');
select is(pg_temp.n('f', 'select count(actor_id)::text from nestly.group_member_enforcements'), 'ERR:42501', '[F10.3-a c4] no one reads which manager acted');
select is(pg_temp.count('c', format('nestly.group_member_enforcements where group_id = %L', pg_temp.g('pub'))), '1', '[F10.3-a c4 ⭐] the Group''s managers read the history');
select is(pg_temp.count('f', format('nestly.posts where group_id = %L', pg_temp.g('pub'))), '1', '[F10.3-a c4] a muted member still reads the Group');
select is(pg_temp.gpost('f', 'pub', 'muted post'), 'ERR:42501', '[F10.3-a c4 §11.16 AC-168] but cannot post');
select is(pg_temp.comment('f', pg_temp.g('pubpost')), 'ERR:42501', '[F10.3-a c4] cannot comment');
select is(pg_temp.like_post('f', pg_temp.g('pubpost')), 'ERR:42501', '[F10.3-a c4] cannot like');
select is(pg_temp.invite('f', 'pub', 'a'), 'ERR:42501', '[F10.3-a c4] (the Owner is a member)');
select tests.fx_fr_add(pg_temp.id('f'), pg_temp.id('b'), 'accepted');
select is(pg_temp.invite('f', 'pub', 'b'), 'ERR:42501', '[F10.3-a c4 ⭐] cannot invite a Friend');
select is(pg_temp.dml('f', format($q$ insert into nestly.group_suggestions (group_id, recipient_id) values (%L, %L) $q$, pg_temp.g('pub'), pg_temp.id('b'))),
  'ERR:42501', '[F10.3-a c4 ⭐] nor recommend the Group');
select is(pg_temp.gpost('e', 'pub', 'not muted'), 'OK:1', '[F10.3-a c4] another member still posts');
select is(pg_temp.gpost('f', 'walks', 'elsewhere'), 'ERR:42501', '[F10.3-a c4] (f is not a member of the other Group)');
select is(pg_temp.dml('c', format($q$ update nestly.group_member_enforcements set mute_hours = 168 where group_id = %L $q$, pg_temp.g('pub'))), 'ERR:42501',
  '[F10.3-a c4] a record is never edited');
select is(pg_temp.dml('c', format($q$ delete from nestly.group_member_enforcements where group_id = %L $q$, pg_temp.g('pub'))), 'ERR:42501',
  '[F10.3-a c4] nor deleted');
select tests.fx_grr_end_mute(pg_temp.g('pub'), pg_temp.id('f'));
select is(pg_temp.gpost('f', 'pub', 'back again'), 'OK:1', '[F10.3-a c4 §11.16 AC-168] the mute ends by itself: the member posts again');
select is(pg_temp.like_post('f', pg_temp.g('pubpost')), 'OK:1', '[F10.3-a c4] and likes');
select is(pg_temp.count('c', format('nestly.group_member_enforcements where group_id = %L', pg_temp.g('pub'))), '1', '[F10.3-a c4 ⭐ AC-168 OP-070] the ended mute stays as history');
select is(pg_temp.dml('f', format($q$ delete from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g('pub'), pg_temp.id('f'))), 'OK:1',
  '[F10.3-a c4] a member (muted or not) may always leave');
select pg_temp.join('f', 'pub');

-- ---- c5 remove + block, unblock; no plain removal (§11.16) ----------------------------------------------------------------------
select is(pg_temp.dml('c', format($q$ delete from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g('pub'), pg_temp.id('e'))), 'OK:0',
  '[F10.3-a c5 §11.16] a Group Moderator does not simply remove a member');
select is(pg_temp.role_of('pub', 'e'), 'member', '[F10.3-a c5] who stays a member');
select is(pg_temp.enf('c', 'pub', 'e', 'remove_block'), 'ERR:23514', '[F10.3-a c5] remove + block has a reason');
select is(pg_temp.enf('c', 'pub', 'a', 'remove_block', 'offensive'), 'ERR:42501', '[F10.3-a c5 BR-041] a Group Moderator does not remove the Owner');
select is(pg_temp.enf('c', 'pub', 'e', 'remove_block', 'offensive'), 'OK:1', '[F10.3-a c5 FR-GRP-003 AC-144 AC-168] a Group Moderator removes and blocks a member, together');
select is(pg_temp.role_of('pub', 'e') || '|' || tests.fx_grr_banned(pg_temp.g('pub'), pg_temp.id('e'))::text, '-|true', '[F10.3-a c5 AC-144] out of the Group and blocked, in one statement');
select is(pg_temp.join('e', 'pub'), 'ERR:42501', '[F10.3-a c5 AC-144] the blocked user cannot join');
select is(pg_temp.count('e', format('nestly.group_member_enforcements where group_id = %L', pg_temp.g('pub'))), '1', '[F10.3-a c5 ⭐ OP-070] reads their own record');
select is(pg_temp.count('c', format('nestly.regular_names where user_id = %L', pg_temp.id('e'))), '1', '[F10.3-a c5] the managers read the name in the history');
select is(pg_temp.enf('c', 'pub', 'e', 'unblock'), 'OK:1', '[F10.3-a c5 FR-GRP-003] a Group Moderator unblocks');
select is(tests.fx_grr_banned(pg_temp.g('pub'), pg_temp.id('e')), false, '[F10.3-a c5] the block is lifted');
select is(pg_temp.join('e', 'pub'), 'OK:1', '[F10.3-a c5] and the user may join again');
select is(pg_temp.enf('c', 'pub', 'e', 'unblock'), 'ERR:42501', '[F10.3-a c5] there is nothing to lift now');
select is(pg_temp.enf('a', 'pub', 'e', 'remove_block', 'rules'), 'OK:1', '[F10.3-a c5] the Owner removes and blocks');
select is(pg_temp.enf('c', 'pub', 'e', 'unblock'), 'ERR:42501', '[F10.3-a c5 AC-144 BR-041 ERR-019] a Group Moderator does not lift a block made by a higher Role');
select is(pg_temp.enf('a', 'pub', 'e', 'unblock'), 'OK:1', '[F10.3-a c5] the Owner lifts it');
select is(pg_temp.enf('e', 'pub', 'f', 'remove_block', 'spam'), 'ERR:42501', '[F10.3-a c5] a non-manager removes no one');
select is(pg_temp.enf('c', 'pub', 'b', 'remove_block', 'spam'), 'OK:1', '[F10.3-a c5 AC-144 AC-167] a non-member may be blocked too (cannot join, ask or be invited)');
select is(pg_temp.dml('b', format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g('pub'))), 'ERR:42501', '[F10.3-a c5] and cannot join');
select is(pg_temp.invite('f', 'pub', 'b'), 'ERR:NS028', '[F10.3-a c5] nor be invited, even by a member who cannot see the blocks');
select is(pg_temp.count('c', format('nestly.group_member_enforcements where group_id = %L', pg_temp.g('pub'))), '6', '[F10.3-a c5 ⭐] every action is in the history');

-- ---- c6 Highlights (§11.13, §11.17, FR-GRP-001, FR-ALG-010) --------------------------------------------------------------------------
select set_config('t.quiet', pg_temp.mk('b', 'Quiet parents', 'private'), true);
select pg_temp.admit('b', 'a', 'quiet');
select pg_temp.admit('b', 'e', 'quiet');
select pg_temp.admit('b', 'f', 'quiet');
select set_config('t.hp', pg_temp.gpost_id('a', 'quiet', 'a good question'), true);
select pg_temp.like_post('b', pg_temp.g('hp'));
select pg_temp.like_post('a', pg_temp.g('hp'));
select pg_temp.comment('e', pg_temp.g('hp'), 'one');
select is(tests.fx_grr_highlight(pg_temp.g('hp')), '', '[F10.3-a c6 BR-060] two likes and comments by others, the author''s own like aside: not yet a Highlight (four members: 3)');
select pg_temp.comment('f', pg_temp.g('hp'), 'two');
select is(tests.fx_grr_highlight(pg_temp.g('hp')), 'threshold=3 members=4 version=2', '[F10.3-a c6 FR-ALG-010 AC-066 AC-165] at the threshold it is a Highlight, recorded once');
select is(pg_temp.count('e', format('nestly.group_highlights where post_id = %L', pg_temp.g('hp'))), '1', '[F10.3-a c6 FR-GRP-001 AC-164] a member reads it (the main feed)');
select is(pg_temp.count('c', 'nestly.group_highlights'), '0', '[F10.3-a c6 §11.13 AC-164] a non-member reads no Highlight of a Private Group');
select is(pg_temp.count('c', format('nestly.posts where id = %L', pg_temp.g('hp'))), '0', '[F10.3-a c6 §11.13] nor its post');
select is(tests.fn_staff(tests.claims(pg_temp.id('d')), $q$ select count(*)::text from nestly.group_highlights $q$), '0', '[F10.3-a c6 §10.3] nor does staff, outside the audited review');
select is(pg_temp.dml('a', format($q$ delete from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g('quiet'), pg_temp.id('e'))), 'OK:0',
  '[F10.3-a c6 fixture] (a member removes no one)');
select pg_temp.dml('e', format($q$ delete from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g('quiet'), pg_temp.id('e')));
select pg_temp.dml('f', format($q$ delete from nestly.group_members where group_id = %L and user_id = %L $q$, pg_temp.g('quiet'), pg_temp.id('f')));
select is(tests.fx_grr_highlight(pg_temp.g('hp')), 'threshold=3 members=4 version=2', '[F10.3-a c6 ⭐ OP-048 OP-068 AC-165] a Highlight stays when members later leave');
select is(pg_temp.count('e', 'nestly.group_highlights'), '0', '[F10.3-a c6] and one who left no longer reads it');

select * from finish();
rollback;
