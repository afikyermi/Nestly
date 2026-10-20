-- pgTAP, run by pg_prove as app_server (CI `db` job, I14: the Moderators team — invitations that create a Moderator, System Announcements,
-- the analytics reads). Expected values come from the SRS (FR-ADMIN-004/008/010, BR-022/023/026/027/058, AC-026/049/071, UC-15/29), not the
-- migration text.
-- People: D = 60_'s fr_d (Admin), M0 = fr_m (Moderator, no key), M3 = 90_'s sf_m3 (Moderator, keys granted below), A = a Regular,
-- P = a Professional, N1..N3 = 94_'s mt_n1..mt_n3 (Auth accounts with no Nestly row). Codes are stood in for by their hashes H1..H5.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F14.1-a c0 I14 fixture] session_user is app_server (this file must not run under another login)');

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'p' then tests.fx_id('p')
    when 'd' then tests.fx_fr_id('fr_d') when 'm0' then tests.fx_fr_id('fr_m') when 'm3' then tests.fx_sf_id('sf_m3')
    when 'm4' then tests.fx_sf_id('sf_m4')
    when 'n1' then tests.fx_mt_id('mt_n1') when 'n2' then tests.fx_mt_id('mt_n2') when 'n3' then tests.fx_mt_id('mt_n3')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
-- a statement run while the code's hash is named, as the redeem route does
create function pg_temp.inv(p_who text, p_hash text, p_sql text, p_keep boolean default true) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.moderator_invite', coalesce(p_hash, ''), true);
  v := pg_temp.dml(p_who, p_sql, p_keep);
  perform set_config('nestly.moderator_invite', '', true);
  return v;
end
$f$;
create function pg_temp.ninv(p_who text, p_hash text, p_rel text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.moderator_invite', coalesce(p_hash, ''), true);
  v := pg_temp.n(p_who, p_rel);
  perform set_config('nestly.moderator_invite', '', true);
  return v;
end
$f$;
-- a count on the analytics screen (nestly.analytics_view = on), as the analytics route does
create function pg_temp.na(p_who text, p_rel text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.analytics_view', 'on', true);
  v := pg_temp.n(p_who, 'nestly.' || p_rel);
  perform set_config('nestly.analytics_view', '', true);
  return v;
end
$f$;

select set_config('t.h1', repeat('a', 64), true);
select set_config('t.h2', repeat('b', 64), true);
select set_config('t.h3', repeat('c', 64), true);
select set_config('t.h4', repeat('d', 64), true);
select set_config('t.h5', repeat('e', 64), true);
create function pg_temp.h(p text) returns text language sql as $f$ select current_setting('t.' || p) $f$;
create function pg_temp.issue(p_who text, p_hash text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.moderator_invitations (code_hash, note) values (%L, 'דנה כהן') $q$, p_hash))
$f$;

select tests.fx_sf_grant(pg_temp.id('m3'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW',
  'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS', 'PRIVATE_GROUP_MODERATE']);
select tests.fx_sf_grant(pg_temp.id('m4'), array['REPORTS_VIEW']);

-- ---- issuing an invitation (FR-ADMIN-004, BR-022: the Admin alone) -----------------------------------------------------------------
select is(pg_temp.issue('d', pg_temp.h('h1')), 'OK:1', '[F14.1-a c1 FR-ADMIN-004] the Admin issues an invitation');
select is(pg_temp.issue('m3', pg_temp.h('h2')), 'ERR:42501', '[F14.1-a c1 BR-022 BR-027] a Moderator holding every key cannot invite (42501)');
select is(pg_temp.issue('m0', pg_temp.h('h2')), 'ERR:42501', '[F14.1-a c1 BR-022] a Moderator with no key cannot invite (42501)');
select is(pg_temp.issue('a', pg_temp.h('h2')), 'ERR:42501', '[F14.1-a c1] a user cannot invite (42501)');
select is(pg_temp.dml('d', format($q$ insert into nestly.moderator_invitations (code_hash, note, expires_at) values (%L, 'x y', now() + interval '1 year') $q$, pg_temp.h('h2'))),
  'ERR:42501', '[F14.1-a c1] the expiry is the database''s: it cannot be sent (42501)');
select is(pg_temp.dml('d', $$ insert into nestly.moderator_invitations (code_hash, note) values ('not-a-hash', 'x y') $$), 'ERR:23514', '[F14.1-a c1] only a SHA-256 hash is kept (23514)');
select is(pg_temp.issue('d', pg_temp.h('h2')), 'OK:1', '[F14.1-a c1] a second invitation');
select is(pg_temp.issue('d', pg_temp.h('h3')), 'OK:1', '[F14.1-a c1] a third invitation');
select is(pg_temp.issue('d', pg_temp.h('h4')), 'OK:1', '[F14.1-a c1] a fourth invitation');
select is(tests.fx_sf_audit('moderator_invited'), 4::bigint, '[F14.1-a c1 BR-026] each issue is in the Audit Log');
select is(pg_temp.n('d', 'nestly.moderator_invitations'), '4', '[F14.1-a c2 PG-027] the Admin reads every invitation');
select is(pg_temp.n('m3', 'nestly.moderator_invitations'), '0', '[F14.1-a c2 BR-027] a Moderator holding every key reads none');
select is(pg_temp.n('n1', 'nestly.moderator_invitations'), '0', '[F14.1-a c2] a stranger without a code reads none');
select is(pg_temp.ninv('n1', pg_temp.h('h1'), 'nestly.moderator_invitations'), '1', '[F14.1-a c2] the holder of a code reads that one invitation');
select is(pg_temp.ninv('n1', repeat('f', 64), 'nestly.moderator_invitations'), '0', '[F14.1-a c2] a wrong code reads nothing');

-- ---- revoking (the Admin, an open invitation, once) ------------------------------------------------------------------------------
select is(pg_temp.dml('m3', format($q$ update nestly.moderator_invitations set revoked_at = now() where code_hash = %L $q$, pg_temp.h('h3'))), 'OK:0',
  '[F14.1-a c3 BR-022] a Moderator cannot revoke an invitation (0 rows)');
select is(pg_temp.inv('n2', pg_temp.h('h3'), format($q$ update nestly.moderator_invitations set revoked_at = now() where code_hash = %L $q$, pg_temp.h('h3'))), 'ERR:42501',
  '[F14.1-a c3] the holder of a code cannot revoke it (42501)');
select is(pg_temp.dml('d', format($q$ update nestly.moderator_invitations set revoked_at = now() - interval '1 day' where code_hash = %L $q$, pg_temp.h('h3'))), 'OK:1',
  '[F14.1-a c3 FR-ADMIN-004] the Admin revokes an open invitation');
select is(tests.fx_mt_invitation(pg_temp.h('h3')), 'accepted:false revoked:true', '[F14.1-a c3] it is revoked');
select is(pg_temp.n('d', format($q$nestly.moderator_invitations where code_hash = %L and revoked_at = now()$q$, pg_temp.h('h3'))), '1',
  '[F14.1-a c3] stamped with the database clock, not the time sent');
select is(pg_temp.dml('d', format($q$ update nestly.moderator_invitations set revoked_at = now() where code_hash = %L $q$, pg_temp.h('h3'))), 'OK:0',
  '[F14.1-a c3] a revoked invitation is not revoked again (0 rows)');
select is(tests.fx_sf_audit('moderator_invitation_revoked'), 1::bigint, '[F14.1-a c3 BR-026] the revocation is in the Audit Log');
select is(pg_temp.dml('d', format($q$ update nestly.moderator_invitations set accepted_by = %L where code_hash = %L $q$, pg_temp.id('d'), pg_temp.h('h2'))), 'ERR:42501',
  '[F14.1-a c3] the Admin cannot mark an invitation accepted (42501)');

-- ---- redeeming: the account becomes a Moderator with no key (FR-ADMIN-004, BR-023) --------------------------------------------------
-- The redeem route's order, in one transaction: mark the invitation (accepted_by), then create the users row.
create function pg_temp.mark(p_who text, p_hash text) returns text language sql as $f$
  select pg_temp.inv(p_who, p_hash, format($q$ update nestly.moderator_invitations set accepted_by = %L where code_hash = %L $q$, pg_temp.id(p_who), p_hash))
$f$;
create function pg_temp.join_as(p_who text, p_hash text, p_type text default 'moderator') returns text language sql as $f$
  select pg_temp.inv(p_who, p_hash, format($q$ insert into nestly.users (account_type, status) values (%L, 'active') $q$, p_type))
$f$;
-- a marked invitation whose account never comes: the deferred foreign key, checked now instead of at commit, as the redeem route's
-- transaction would (its role is still authenticated when it commits)
create function pg_temp.fk_now(p_who text) returns text language plpgsql as $f$
declare v text := 'OK';
begin
  perform set_config('request.jwt.claims', tests.claims(pg_temp.id(p_who)), true);
  set local role authenticated;
  begin
    set constraints nestly.moderator_invitations_accepted_by_fkey immediate;
  exception when others then
    v := 'ERR:' || sqlstate;
  end;
  set constraints nestly.moderator_invitations_accepted_by_fkey deferred;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end
$f$;

select is(pg_temp.dml('n1', $$ insert into nestly.users (account_type, status) values ('moderator', 'active') $$), 'ERR:42501',
  '[F14.1-a c4 BR-022] no Moderator account without a code (42501)');
select is(pg_temp.join_as('n1', pg_temp.h('h1')), 'ERR:42501', '[F14.1-a c4] nor with a code it has not marked (42501)');
select is(pg_temp.mark('n1', repeat('f', 64)), 'OK:0', '[F14.1-a c4] a wrong code marks nothing (0 rows)');
select is(pg_temp.mark('n1', pg_temp.h('h3')), 'OK:0', '[F14.1-a c4] a revoked invitation cannot be marked (0 rows)');
select is(pg_temp.mark('m0', pg_temp.h('h1')), 'OK:0', '[F14.1-a c4 BR-027] an existing Moderator cannot take an invitation (0 rows)');
select is(pg_temp.mark('a', pg_temp.h('h1')), 'ERR:42501', '[F14.1-a c4 BR-016] nor can an existing account (42501)');
select is(pg_temp.mark('n1', pg_temp.h('h1')), 'OK:1', '[F14.1-a c4 FR-ADMIN-004] the holder of a valid code marks it');
select is(pg_temp.mark('n2', pg_temp.h('h1')), 'OK:0', '[F14.1-a c4] a second account cannot take the same code (0 rows)');
select is(pg_temp.join_as('n2', pg_temp.h('h1')), 'ERR:42501', '[F14.1-a c4] nor become a Moderator with it (42501)');
select is(pg_temp.ninv('n2', pg_temp.h('h1'), 'nestly.moderator_invitations'), '0', '[F14.1-a c4] and no longer reads it');
select is(pg_temp.fk_now('n1'), 'ERR:23503', '[F14.1-a c4] a marked invitation without its Moderator account cannot commit (23503): one code, one Moderator');
select is(pg_temp.join_as('n1', pg_temp.h('h1'), 'admin'), 'ERR:42501', '[F14.1-a c4 BR-021] an invitation never creates an Admin (42501)');
select is(pg_temp.join_as('n1', pg_temp.h('h1')), 'OK:1', '[F14.1-a c4 FR-ADMIN-004] the marked invitation creates the account as a Moderator');
select is(pg_temp.fk_now('n1'), 'OK', '[F14.1-a c4] and the transaction can commit');
select is(pg_temp.n('n1', $$nestly.staff_roles where account_type = 'moderator'$$), '1', '[F14.1-a c4] its staff role exists');
select is(tests.fx_mt_invitation(pg_temp.h('h1')), 'accepted:true revoked:false', '[F14.1-a c4] the invitation is used');
select is(pg_temp.ninv('n1', pg_temp.h('h1'), 'nestly.moderator_invitations'), '1', '[F14.1-a c4] its Moderator still reads it');
select is(tests.fx_sf_audit('moderator_joined'), 1::bigint, '[F14.1-a c4 BR-026] the new Moderator is in the Audit Log');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('n1')), $$ select count(*)::text from unnest(array['REPORTS_VIEW', 'USER_VIEW', 'ANALYTICS_VIEW',
  'SYSTEM_ANNOUNCEMENTS', 'COMMUNITY_CONFIG', 'MODERATOR_MANAGE']) k where nestly.has_permission(k) $$), '0', '[F14.1-a c4 BR-023 AC-026] a new Moderator holds no key (deny by default)');
select is(pg_temp.mark('n1', pg_temp.h('h2')), 'OK:0', '[F14.1-a c4] a Moderator cannot take a second invitation (0 rows)');
select tests.fx_mt_expire(pg_temp.h('h4'));
select is(pg_temp.mark('n3', pg_temp.h('h4')), 'OK:0', '[F14.1-a c4] an expired invitation cannot be marked (0 rows)');
select is(pg_temp.dml('d', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'REPORTS_VIEW') $q$, pg_temp.id('n1'))), 'OK:1',
  '[F14.1-a c5 FR-ADMIN-004 AC-026] the Admin assigns the new Moderator a key');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('n1')), $$ select nestly.has_permission('REPORTS_VIEW')::text $$), 'true',
  '[F14.1-a c5 AC-026] and the access opens');
select is(pg_temp.dml('m3', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'USER_VIEW') $q$, pg_temp.id('n1'))), 'ERR:42501',
  '[F14.1-a c5 BR-027] a Moderator cannot assign keys to another Moderator (42501)');
select is(pg_temp.dml('n1', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'USER_VIEW') $q$, pg_temp.id('n1'))), 'ERR:42501',
  '[F14.1-a c5 BR-027] nor to itself (42501)');

-- ---- System Announcements (FR-ADMIN-008, AC-049) ----------------------------------------------------------------------------------
select is(pg_temp.dml('m0', $$ insert into nestly.system_announcements (title, body) values ('תחזוקה', 'האתר ייסגר לשעה') $$), 'ERR:42501',
  '[F14.1-a c6 AC-049] a Moderator without SYSTEM_ANNOUNCEMENTS cannot create an announcement (42501)');
select is(pg_temp.dml('m4', $$ insert into nestly.system_announcements (title, body) values ('תחזוקה', 'האתר ייסגר לשעה') $$), 'ERR:42501',
  '[F14.1-a c6 AC-049] nor one holding other keys (42501)');
select is(pg_temp.dml('a', $$ insert into nestly.system_announcements (title, body) values ('תחזוקה', 'האתר ייסגר לשעה') $$), 'ERR:42501',
  '[F14.1-a c6 AC-049] nor a user (42501)');
select is(pg_temp.dml('m3', $$ insert into nestly.system_announcements (title, body) values ('תחזוקה', 'האתר ייסגר לשעה') $$), 'OK:1',
  '[F14.1-a c6 FR-ADMIN-008] a Moderator with SYSTEM_ANNOUNCEMENTS creates a draft');
select is(pg_temp.dml('d', $$ insert into nestly.system_announcements (title, body) values ('ברוכים הבאים', 'שלום לכולם') $$), 'OK:1',
  '[F14.1-a c6 FR-ADMIN-008] the Admin creates one');
select is(pg_temp.dml('d', $$ insert into nestly.system_announcements (title, body, status) values ('x y', 'z', 'published') $$), 'ERR:42501',
  '[F14.1-a c6] an announcement is born a draft (42501)');
select is(pg_temp.dml('d', $$ insert into nestly.system_announcements (title, body) values ('x', 'z') $$), 'ERR:23514', '[F14.1-a c6] a title of 2-80 characters (23514)');
select is(pg_temp.n('a', 'nestly.system_announcements'), '0', '[F14.1-a c7] a user reads no draft');
select is(pg_temp.n('m0', 'nestly.system_announcements'), '0', '[F14.1-a c7] a Moderator without the key reads no draft');
select is(pg_temp.n('m3', 'nestly.system_announcements'), '2', '[F14.1-a c7 AC-049] the key holder reads every one');
select is(pg_temp.dml('m3', $$ update nestly.system_announcements set body = 'האתר ייסגר לשעתיים' where title = 'תחזוקה' $$), 'OK:1', '[F14.1-a c7 FR-ADMIN-008] and edits');
select is(pg_temp.dml('m3', $$ update nestly.system_announcements set body = 'האתר ייסגר לשעתיים' where title = 'תחזוקה' $$), 'OK:0', '[F14.1-a c7 BR-026] an edit that changes nothing writes nothing (0 rows, no audit entry)');
select is(pg_temp.dml('m4', $$ update nestly.system_announcements set status = 'published' $$), 'OK:0', '[F14.1-a c7 AC-049] another Moderator publishes nothing (0 rows)');
select is(pg_temp.dml('a', $$ update nestly.system_announcements set status = 'published' $$), 'OK:0', '[F14.1-a c7 AC-049] a user publishes nothing (0 rows)');
select is(pg_temp.dml('m3', $$ update nestly.system_announcements set status = 'published' where title = 'תחזוקה' $$), 'OK:1', '[F14.1-a c7 FR-ADMIN-008] the key holder publishes');
select is(pg_temp.n('a', $$nestly.system_announcements where status = 'published' and published_at is not null$$), '1', '[F14.1-a c7] every user now reads it, stamped by the database');
select is(pg_temp.n('p', 'nestly.system_announcements'), '1', '[F14.1-a c7] a Professional too');
select is(pg_temp.dml('m3', $$ update nestly.system_announcements set status = 'draft' where title = 'תחזוקה' $$), 'ERR:23514', '[F14.1-a c7] a published announcement does not go back to a draft (23514)');
select is(pg_temp.dml('d', $$ update nestly.system_announcements set status = 'removed' where title = 'תחזוקה' $$), 'OK:1', '[F14.1-a c8 FR-ADMIN-008] the Admin removes it');
select is(pg_temp.n('a', 'nestly.system_announcements'), '0', '[F14.1-a c8] no user reads a removed announcement');
select is(pg_temp.dml('d', $$ update nestly.system_announcements set status = 'published' where title = 'תחזוקה' $$), 'OK:0', '[F14.1-a c8] removal is final (0 rows)');
select is(pg_temp.dml('d', $$ delete from nestly.system_announcements $$), 'ERR:42501', '[F14.1-a c8] nobody deletes an announcement (42501)');
select is(tests.fx_sf_audit('announcement_created'), 2::bigint, '[F14.1-a c9 AC-049 BR-026] creations are audited');
select is(tests.fx_sf_audit('announcement_edited'), 1::bigint, '[F14.1-a c9 AC-049] the edit is audited');
select is(tests.fx_sf_audit('announcement_published'), 1::bigint, '[F14.1-a c9 AC-049] the publication is audited');
select is(tests.fx_sf_audit('announcement_removed'), 1::bigint, '[F14.1-a c9 AC-049] the removal is audited');

-- ---- the analytics reads (FR-ADMIN-010, BR-058, AC-071) ------------------------------------------------------------------------------
select set_config('t.post', tests.fx_po_add(pg_temp.id('a'))::text, true);
select ok(tests.fx_mt_count('posts') > 0, '[F14.1-a c10 fixture] there are posts to count');
select is(pg_temp.na('d', 'users'), tests.fx_mt_count('users')::text, '[F14.1-a c10 FR-ADMIN-010] the Admin counts every account on the analytics screen');
select is(pg_temp.na('m3', 'users'), tests.fx_mt_count('users')::text, '[F14.1-a c10 BR-058] ANALYTICS_VIEW counts every account');
select is(pg_temp.na('m3', 'posts'), tests.fx_mt_count('posts')::text, '[F14.1-a c10 BR-058] and every post');
select is(pg_temp.na('m3', 'comments'), tests.fx_mt_count('comments')::text, '[F14.1-a c10 BR-058] every comment');
select is(pg_temp.na('m3', 'reactions'), tests.fx_mt_count('reactions')::text, '[F14.1-a c10 BR-058] every like');
select is(pg_temp.na('m3', 'reports'), tests.fx_mt_count('reports')::text, '[F14.1-a c10 BR-058] every report');
select is(pg_temp.na('m3', 'user_enforcements'), tests.fx_mt_count('user_enforcements')::text, '[F14.1-a c10 BR-058] every enforcement step');
select is(pg_temp.na('m3', 'friendships'), tests.fx_mt_count('friendships')::text, '[F14.1-a c10 BR-058] every Friendship');
select is(pg_temp.na('m4', 'users'), pg_temp.n('m4', 'nestly.users'), '[F14.1-a c11 AC-026] without ANALYTICS_VIEW the screen opens nothing more');
select is(pg_temp.na('m4', 'posts'), pg_temp.n('m4', 'nestly.posts'), '[F14.1-a c11 AC-026] (posts)');
select is(pg_temp.na('a', 'users'), '1', '[F14.1-a c11] a user still reads only its own account');
select is(pg_temp.n('m3', 'nestly.users'), '1', '[F14.1-a c11] outside the analytics screen ANALYTICS_VIEW reads only its own account');
select is(pg_temp.n('m3', 'nestly.friendships'), pg_temp.n('m0', 'nestly.friendships'), '[F14.1-a c11] and no Friendship beyond what any Moderator reads');
select ok(tests.fx_mt_count('children') > 0, '[F14.1-a c12 fixture] there are child rows');
select is(pg_temp.na('m3', 'children'), '0', '[F14.1-a c12 open item 6 (a)] no child row is opened by the analytics screen');
select is(pg_temp.na('d', 'children'), '0', '[F14.1-a c12 open item 6 (a)] not even to the Admin');

select * from finish();
rollback;
