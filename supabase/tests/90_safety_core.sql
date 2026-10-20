-- pgTAP, run by pg_prove as app_server (CI `db` job, the safety and admin core: staff roles, Moderator permissions, Audit Log, report handling,
-- content moderation, the author's delete over moderated content, the audited reveal of an anonymous author, account enforcement,
-- report reasons). Expected values come from the SRS (FR-MOD-002/003, FR-ADMIN-005/007, BR-021/024/025/026/062/074/080, AC-022/025/027/028/029/
-- 031/077/106/107/110), not from the migration text.
-- Keys (granted below, rolled back): M1 REPORTS_VIEW+CONTENT_MODERATE+AUDIT_LOG_VIEW · M2 REPORTS_VIEW · M3 all fourteen · M4 USER_VIEW+USER_WARN+
-- USER_SUSPEND+REPORTS_VIEW · M5 USER_VIEW+USER_BAN · M0 none.
-- People: A (author), B (reporter), C = 60_'s fr_c (a third Regular, built below), P = Professional, S = suspended Regular, X = banned Regular,
-- M0 = 60_'s fr_m (Moderator, no key), M1, M2 = 90_'s sf_m1, sf_m2 (Moderators), D = 60_'s fr_d (Admin).
-- Everything rolls back with the transaction. A refused write is 'ERR:<sqlstate>' or 'OK:0' with the data unchanged.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F4.0-a c1 I4 fixture] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 's' then tests.fx_id('s') when 'x' then tests.fx_id('x') when 'c' then tests.fx_fr_id('fr_c')
    when 'm0' then tests.fx_fr_id('fr_m') when 'm1' then tests.fx_sf_id('sf_m1') when 'm2' then tests.fx_sf_id('sf_m2')
    when 'm3' then tests.fx_sf_id('sf_m3') when 'm4' then tests.fx_sf_id('sf_m4') when 'm5' then tests.fx_sf_id('sf_m5')
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
-- reads of accounts by staff name their purpose (nestly.staff_view), as the admin routes do
create function pg_temp.nview(p_who text, p_rel text) returns text language sql as $f$
  select tests.fn_staff(tests.claims(pg_temp.id(p_who)), 'select count(*)::text from ' || p_rel)
$f$;
create function pg_temp.sees(p_who text, p_post uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.posts where id = %L', p_post))
$f$;
create function pg_temp.cm1(p_who text, p_id uuid) returns text language sql as $f$
  select pg_temp.n(p_who, format('nestly.comments where id = %L', p_id))
$f$;
create function pg_temp.perm(p_who text, p_key text) returns text language sql as $f$
  select pg_temp.fn(p_who, format('select nestly.has_permission(%L)::text', p_key))
$f$;
-- a statement run with a stated reason (the transaction-local setting of rule 18); the CTE makes the setting run first
create function pg_temp.with_reason(p_reason text, p_stmt text) returns text language sql as $f$
  select format($q$ select set_config('nestly.audit_reason', %L, true); %s $q$, p_reason, p_stmt)
$f$;
create function pg_temp.moderate(p_who text, p_table text, p_id uuid, p_status text, p_reason text default 'because') returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ with s as (select set_config('nestly.audit_reason', %L, true)) update nestly.%I t set status = %L from s where t.id = %L $q$,
           p_reason, p_table, p_status, p_id))
$f$;
create function pg_temp.enforce(p_who text, p_target text, p_kind text, p_hours integer default null, p_reason text default 'because', p_child boolean default false, p_report uuid default null) returns text language sql as $f$
  select tests.dml_staff(tests.claims(pg_temp.id(p_who)),
    format($q$ insert into nestly.user_enforcements (user_id, kind, reason, duration_hours, is_child_safety, report_id) values (%L, %L, %L, %L, %L, %L) $q$,
           pg_temp.id(p_target), p_kind, p_reason, p_hours, p_child, p_report))
$f$;
create function pg_temp.status_of(p_who text) returns text language sql as $f$
  select split_part(tests.fx_user(pg_temp.id(p_who)), '/', 2)
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c', 's', 'x', 'p'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  foreach w in array array['a', 'b', 'c', 'p'] loop perform tests.set_status(pg_temp.id(w), 'active'); end loop;
end
$f$;
create function pg_temp.post(p_author text, p_anon boolean default false) returns uuid language sql as $f$
  select tests.fx_po_add(pg_temp.id(p_author), 'everyone', p_anon)
$f$;


select tests.fx_sf_grant(pg_temp.id('m1'), array['REPORTS_VIEW', 'CONTENT_MODERATE', 'AUDIT_LOG_VIEW']);
select tests.fx_sf_grant(pg_temp.id('m2'), array['REPORTS_VIEW']);
select tests.fx_sf_grant(pg_temp.id('m3'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW', 'USER_WARN',
  'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS', 'PRIVATE_GROUP_MODERATE']);
select tests.fx_sf_grant(pg_temp.id('m4'), array['USER_VIEW', 'USER_WARN', 'USER_SUSPEND', 'REPORTS_VIEW']);
select tests.fx_sf_grant(pg_temp.id('m5'), array['USER_VIEW', 'USER_BAN']);

-- 1  staff roles and has_permission (BR-021, BR-025, AC-025, AC-031)
select is(pg_temp.n('d', 'nestly.staff_roles'), '1', '[BR-021 I4] the Admin reads its own staff row, and only it');
select is(pg_temp.n('m1', 'nestly.staff_roles'), '1', '[I4] a Moderator reads its own staff row only');
select is(pg_temp.n('a', 'nestly.staff_roles'), '0', '[I4] a Regular account reads no staff row');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('d')), 'select 1 from nestly.staff_roles'), 'ERR:42501', '[I4 rule 3] anon reads no staff row');
select is(pg_temp.dml('d', format($q$ insert into nestly.staff_roles (user_id, account_type) values (%L, 'admin') $q$, pg_temp.id('a')), false), 'ERR:42501', '[BR-021 I4] nobody inserts a staff row');
select is(pg_temp.dml('d', 'update nestly.staff_roles set account_type = ''admin''', false), 'ERR:42501', '[I4] nobody updates a staff row');
select is(pg_temp.dml('d', 'delete from nestly.staff_roles', false), 'ERR:42501', '[I4] nobody deletes a staff row');
select is(pg_temp.nview('d', 'nestly.users where account_type in (''admin'', ''moderator'')'), tests.fx_sf_staff_count()::text, '[FR-ADMIN-004 I4] the Admin reads every staff account (on the admin screens)');
select is(pg_temp.n('d', 'nestly.users'), '1', '[I4 P6] in an ordinary request even the Admin sees its own users row only: services read "the caller''s row" with no WHERE');
select is(pg_temp.nview('m0', 'nestly.users where account_type in (''admin'', ''moderator'')'), '1', '[I4] a Moderator without USER_VIEW reads only its own users row');
select is(pg_temp.nview('m5', 'nestly.users') > '1', true, '[SRS 3.1 I4] a Moderator with USER_VIEW reads accounts');
select is(pg_temp.nview('a', 'nestly.users'), '1', '[I4] a Regular account naming the purpose still reads its own row only');
select is(pg_temp.perm('a', 'REPORTS_VIEW'), 'false', '[AC-031 I4] a Regular account holds no permission');
select is(pg_temp.perm('m0', 'REPORTS_VIEW'), 'false', '[AC-031 I4] a Moderator with no key holds none (deny by default)');
select is(pg_temp.perm('d', 'REPORTS_VIEW'), 'true', '[AC-025 I4] the Admin holds every key without a mapping');
select is(pg_temp.perm('d', 'MODERATOR_MANAGE'), 'true', '[AC-025 I4] including Admin-only keys');
select is(pg_temp.perm('d', 'NO_SUCH_KEY'), 'false', '[I4] an unknown key is false even for the Admin');
select is(pg_temp.perm('d', 'RECOVERY_LOCK_RELEASE'), 'false', '[FR-ADMIN-013 cancelled] the recovery-lock key is gone: not even the Admin holds it');
select is(pg_temp.perm('m1', 'REPORTS_VIEW'), 'true', '[AC-022 I4] a granted key is held');
select is(pg_temp.perm('m1', 'USER_VIEW'), 'false', '[AC-031 I4] a key not granted is not held');
select is(pg_temp.perm('m2', 'CONTENT_MODERATE'), 'false', '[I4] another Moderator''s keys are not mine');
select is((select string_agg(pg_temp.perm('m3', k), ',') from unnest(array['MODERATOR_MANAGE', 'SECURITY_SETTINGS_MANAGE', 'BILLING_FINANCE_MANAGE',
  'SYSTEM_CRITICAL_SETTINGS', 'USER_DATA_EXPORT_DELETE', 'SENSITIVE_DATA_FULL_ACCESS', 'LEGAL_POLICY_MANAGE', 'ALGORITHM_AI_CONFIG',
  'SPONSORED_PRODUCT_MANAGE']) k), 'false,false,false,false,false,false,false,false,false',
  '[AC-031 BR-025 I4] a Moderator holding all fourteen keys holds none of the Admin-only ones');
select is(tests.dml_as('none', '', format($q$ select tests.fx_sf_grant(%L, array['MODERATOR_MANAGE']) $q$, pg_temp.id('m2'))), 'ERR:23514',
  '[AC-031 BR-025 I4] an Admin-only key cannot be stored as a Moderator permission');
select is(pg_temp.dml('m3', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'USER_BAN') $q$, pg_temp.id('m2')), false), 'ERR:42501',
  '[AC-031 FR-ADMIN-004 I4] a Moderator cannot assign a key');
select is(pg_temp.dml('m3', 'delete from nestly.moderator_permissions', false), 'OK:0', '[AC-031 I4] a Moderator cannot revoke a key');
select tests.set_status(pg_temp.id('m1'), 'suspended');
select is(pg_temp.perm('m1', 'REPORTS_VIEW'), 'false', '[rule 15 I4] a suspended Moderator holds no key');
select tests.set_status(pg_temp.id('m1'), 'active');
select is(pg_temp.dml('d', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'ANALYTICS_VIEW') $q$, pg_temp.id('m2'))), 'OK:1',
  '[FR-ADMIN-004 I4] the Admin assigns a key');
select is(tests.fx_sf_audit('permission_granted'), 1::bigint, '[AC-029 BR-026 I4] the assignment is in the Audit Log');
select is((select after_state->>'permission' from tests.fx_audit_rows() where action = 'permission_granted'), 'ANALYTICS_VIEW', '[BR-026 I4] the entry carries the key (After)');
select is(pg_temp.dml('d', format($q$ delete from nestly.moderator_permissions where user_id = %L and permission_key = 'ANALYTICS_VIEW' $q$, pg_temp.id('m2'))), 'OK:1',
  '[FR-ADMIN-004 I4] the Admin revokes it');
select is((select before_state->>'permission' from tests.fx_audit_rows() where action = 'permission_revoked'), 'ANALYTICS_VIEW', '[BR-026 I4] the revoke entry carries the key (Before)');

-- a stale session cannot assign or revoke a key either, and nothing goes unaudited (BR-026, AC-029)
select tests.fx_link_put(pg_temp.id('d'), 'affected', '22222222-2222-4222-8222-222222222222'::uuid, timestamptz '2026-10-16 10:00:00+00', '22222222-2222-4222-8222-222222222222'::uuid);
select is(pg_temp.dml('d', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'SUPPORT_VIEW') $q$, pg_temp.id('m2')), false), 'ERR:42501',
  '[BR-026 AC-029 I4] an Admin whose session is stale cannot assign a key');
select is(pg_temp.dml('d', 'delete from nestly.moderator_permissions', false), 'OK:0', '[BR-026 AC-029 I4] nor revoke one');
select tests.fx_link_put(pg_temp.id('d'), 'unaffected', '22222222-2222-4222-8222-222222222222'::uuid);

-- 2  the Audit Log (FR-ADMIN-005, AC-029)
select is(pg_temp.n('d', 'nestly.audit_log') > '0', true, '[FR-ADMIN-005 I4] the Admin reads the log');
select is(pg_temp.n('m2', 'nestly.audit_log'), '0', '[FR-ADMIN-005 I4] a Moderator without AUDIT_LOG_VIEW reads nothing');
select is(pg_temp.n('m1', 'nestly.audit_log') > '0', true, '[FR-ADMIN-005 I4] a Moderator with AUDIT_LOG_VIEW reads the log');
select is(pg_temp.n('a', 'nestly.audit_log'), '0', '[FR-ADMIN-005 I4] a Regular account reads nothing');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('d')), 'select 1 from nestly.audit_log'), 'ERR:42501', '[FR-ADMIN-005 I4] anon reads nothing');
select is(pg_temp.dml('d', 'update nestly.audit_log set reason = ''edited''', false), 'ERR:42501', '[FR-ADMIN-005 I4] nobody updates an entry');
select is(pg_temp.dml('d', 'delete from nestly.audit_log', false), 'ERR:42501', '[FR-ADMIN-005 I4] nobody deletes an entry');
select is(tests.dml_as('none', '', 'update nestly.audit_log set reason = ''edited''', false), 'ERR:42501', '[FR-ADMIN-005 I4] not even the unprivileged session');
select is(pg_temp.dml('d', $q$ insert into nestly.audit_log (actor_role, action, target_kind) values ('admin', 'content_removed', 'post') $q$, false), 'ERR:42501', '[FR-ADMIN-005 rule 18 I4] not even the Admin can write the log: no role holds INSERT, only the definer functions append');
select is(pg_temp.dml('m0', $q$ insert into nestly.audit_log (actor_role, action, target_kind) values ('moderator', 'content_removed', 'post') $q$, false), 'ERR:42501', '[FR-ADMIN-005 rule 18 I4] a Moderator with no key cannot forge an entry');
select is(pg_temp.dml('m1', $q$ insert into nestly.audit_log (actor_role, action, target_kind) values ('moderator', 'user_ban', 'user') $q$, false), 'ERR:42501', '[FR-ADMIN-005 rule 18 I4] nor can one with AUDIT_LOG_VIEW');
select is(tests.dml_as('none', '', 'truncate nestly.audit_log', false), 'ERR:42501', '[FR-ADMIN-005 I4] nobody truncates the log');
select is(pg_temp.dml('d', $q$ insert into nestly.audit_log (actor_role, action, target_kind) values ('moderator', 'content_removed', 'post') $q$, false), 'ERR:42501', '[FR-ADMIN-005 I4] another role than the caller''s is refused');
select is(pg_temp.dml('a', $q$ insert into nestly.audit_log (actor_role, action, target_kind) values ('admin', 'content_removed', 'post') $q$, false), 'ERR:42501', '[FR-ADMIN-005 I4] a Regular account cannot write the log');
select is(pg_temp.dml('d', format($q$ insert into nestly.audit_log (actor_id, actor_role, action, target_kind) values (%L, 'admin', 'x_yz', 'post') $q$, pg_temp.id('m1')), false), 'ERR:42501', '[FR-ADMIN-005 I4] the actor cannot be chosen');


-- 3  reports: who reads and who handles (FR-MOD-003, AC-022)
select pg_temp.reset();
select set_config('t.p1', pg_temp.post('a')::text, true);
select set_config('t.pa', pg_temp.post('a', true)::text, true);
select set_config('t.r1', tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.p1')::uuid, 'harassment')::text, true);
select set_config('t.ra', tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.pa')::uuid, 'spam')::text, true);
select is(pg_temp.n('m1', format('nestly.reports where id = %L', current_setting('t.r1'))), '1', '[FR-MOD-003 AC-022 I4] a Moderator with REPORTS_VIEW reads a report');
select is(pg_temp.n('d', format('nestly.reports where id = %L', current_setting('t.r1'))), '1', '[AC-022 AC-025 I4] the Admin reads it');
select is(pg_temp.n('m5', format('nestly.reports where id = %L', current_setting('t.r1'))), '0', '[AC-022 I4] a Moderator without REPORTS_VIEW reads none');
select is(pg_temp.n('m0', 'nestly.reports'), '0', '[AC-022 I4] a Moderator with no key reads none');
select is(pg_temp.n('c', format('nestly.reports where id = %L', current_setting('t.r1'))), '0', '[FR-MOD-001 I4] a third Regular account reads none');
select is(pg_temp.n('a', format('nestly.reports where id = %L', current_setting('t.r1'))), '0', '[FR-MOD-001 I4] the author reads no report on their post');
select is(pg_temp.fn('d', format($q$ select target_text from nestly.reports where id = %L $q$, current_setting('t.r1'))), 'post body', '[FR-MOD-001 I4] the report keeps a copy of the reported text');
select is(pg_temp.dml('a', format($q$ update nestly.posts set body = 'edited later' where id = %L $q$, current_setting('t.p1'))), 'OK:1', '[FR-MOD-001 I4] the author may edit a post with an open report');
select is(pg_temp.fn('d', format($q$ select target_text from nestly.reports where id = %L $q$, current_setting('t.r1'))), 'post body', '[FR-MOD-001 I4] the copy is the text as reported');
select is(pg_temp.dml('b', format($q$ update nestly.reports set status = 'handled', resolution = 'dismissed' where id = %L $q$, current_setting('t.r1'))), 'OK:0', '[AC-022 I4] the reporter cannot close their report');
select is(pg_temp.dml('m2', format($q$ update nestly.reports set status = 'handled', resolution = 'dismissed' where id = %L $q$, current_setting('t.r1'))), 'OK:0',
  '[AC-022 I4] REPORTS_VIEW alone cannot close a report: a moderation key is needed too');
select is(pg_temp.dml('m1', format($q$ update nestly.reports set status = 'handled' where id = %L $q$, current_setting('t.r1')), false), 'ERR:42501', '[FR-MOD-003 I4] closing without a resolution is refused');
select is(pg_temp.dml('m1', format($q$ update nestly.reports set status = 'handled', resolution = 'dismissed', handled_by = %L where id = %L $q$, pg_temp.id('m2'), current_setting('t.r1'))), 'OK:1',
  '[FR-MOD-003 I4] a Moderator with REPORTS_VIEW and a moderation key closes it');
select is(tests.fx_sf_audit('report_handled'), 1::bigint, '[AC-029 I4] closing a report is audited');
select is((select actor_id::text from tests.fx_audit_rows() where action = 'report_handled'), pg_temp.id('m1')::text, '[AC-029 I4] with the closing Moderator as actor, whatever handled_by was sent');
select is(pg_temp.dml('m1', format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where id = %L $q$, current_setting('t.r1'))), 'OK:0', '[FR-MOD-003 I4] a closed report is not closed again');

-- 4  content moderation (CONTENT_MODERATE, AC-029, BR-080)
select is(pg_temp.moderate('m1', 'posts', current_setting('t.p1')::uuid, 'hidden', ''), 'ERR:NS011', '[FR-MOD-003 I4] a moderation move without a reason is refused');
select is(pg_temp.moderate('m2', 'posts', current_setting('t.p1')::uuid, 'hidden'), 'OK:0', '[FR-MOD-003 I4] without CONTENT_MODERATE nothing moves');
select is(pg_temp.moderate('a', 'posts', current_setting('t.p1')::uuid, 'hidden'), 'ERR:42501', '[I4] an author cannot hide their own post');
select set_config('t.pu', pg_temp.post('a')::text, true);
select is(pg_temp.moderate('m1', 'posts', current_setting('t.pu')::uuid, 'hidden'), 'OK:0', '[FR-MOD-003 I4] a post nobody reported is out of reach');
select is(pg_temp.moderate('m1', 'posts', current_setting('t.p1')::uuid, 'deleted'), 'ERR:42501', '[BR-080 I4] a moderator cannot delete');
select is(pg_temp.dml('m1', format($q$ update nestly.posts set body = 'x' where id = %L $q$, current_setting('t.p1')), false), 'ERR:42501', '[I4] staff do not edit content');
select is(pg_temp.moderate('m1', 'posts', current_setting('t.p1')::uuid, 'hidden', 'against the rules'), 'OK:1', '[FR-MOD-003 I4] a Moderator hides a reported post');
select is(pg_temp.sees('c', current_setting('t.p1')::uuid) || pg_temp.sees('a', current_setting('t.p1')::uuid) || pg_temp.sees('m1', current_setting('t.p1')::uuid), '001',
  '[FR-MOD-003 I4] it is gone for everyone, its author included, and still there for the Moderator');
select is(tests.fx_sf_audit('content_hidden'), 1::bigint, '[AC-029 I4] audited');
select is((select reason from tests.fx_audit_rows() where action = 'content_hidden'), 'against the rules', '[AC-029 I4] with the reason');
select is(pg_temp.moderate('m1', 'posts', current_setting('t.p1')::uuid, 'active'), 'OK:1', '[FR-MOD-003 I4] and restores it');
select is(pg_temp.sees('c', current_setting('t.p1')::uuid), '1', '[FR-MOD-003 I4] visible again');
select is(tests.fx_sf_audit('content_restored'), 1::bigint, '[AC-029 I4] the restore is audited');
select is(pg_temp.moderate('m1', 'posts', current_setting('t.p1')::uuid, 'removed', 'removed for good'), 'OK:1', '[FR-MOD-003 I4] removes it');
select is(tests.fx_sf_audit('content_removed') >= 1, true, '[AC-029 I4] audited');
-- the debt: the author deletes content a moderator removed (BR-080); the report is already closed, so it is deleted at once
select is(pg_temp.fn('a', format($q$ select nestly.delete_post(%L)::text $q$, current_setting('t.p1'))), '1', '[BR-080 I4] the author deletes a post a moderator removed');
select is(tests.fx_po_state(current_setting('t.p1')::uuid), null, '[BR-080 I4] and it is gone for good');
select set_config('t.p2', pg_temp.post('a')::text, true);
select set_config('t.r2', tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.p2')::uuid, 'spam')::text, true);
select is(pg_temp.moderate('m1', 'posts', current_setting('t.p2')::uuid, 'hidden'), 'OK:1', '[I4] hidden with its report still open');
select is(pg_temp.fn('b', format($q$ select nestly.delete_post(%L)::text $q$, current_setting('t.p2'))), '0', '[BR-080 I4] another account deleting it touches nothing');
select is(pg_temp.fn('a', format($q$ select nestly.delete_post(%L)::text $q$, current_setting('t.p2'))), '1', '[BR-080 I4] the author''s delete is accepted');
select ok(coalesce(tests.fx_po_state(current_setting('t.p2')::uuid) like 'status=deleted%', false), '[BR-080 I4] and held, since a report is open (not lost, not visible)');
select is(pg_temp.sees('c', current_setting('t.p2')::uuid) || pg_temp.sees('b', current_setting('t.p2')::uuid), '00', '[BR-080 I4] invisible to others');
-- comments
select set_config('t.p3', pg_temp.post('a')::text, true);
select set_config('t.c1', tests.fx_cm_add(pg_temp.id('c'), current_setting('t.p3')::uuid, 'a comment')::text, true);
select set_config('t.rc', tests.fx_rp_add(pg_temp.id('b'), 'comment', current_setting('t.c1')::uuid, 'harassment')::text, true);
select is(pg_temp.moderate('m1', 'comments', current_setting('t.c1')::uuid, 'hidden', 'rude'), 'OK:1', '[FR-MOD-003 I4] a Moderator hides a reported comment');
select is(pg_temp.cm1('a', current_setting('t.c1')::uuid) || pg_temp.cm1('c', current_setting('t.c1')::uuid) || pg_temp.cm1('m1', current_setting('t.c1')::uuid), '001', '[FR-MOD-003 I4] gone for others and its author, there for the Moderator');
select is(pg_temp.moderate('m2', 'comments', current_setting('t.c1')::uuid, 'removed'), 'OK:0', '[FR-MOD-003 I4] REPORTS_VIEW alone moves nothing');
select is(pg_temp.fn('c', format($q$ select nestly.delete_comment(%L)::text $q$, current_setting('t.c1'))), '1', '[BR-080 I4] the commenter deletes a comment a moderator hid (held: its report is open)');
select ok(coalesce(tests.fx_cm_state(current_setting('t.c1')::uuid) like 'status=deleted%', false), '[BR-080 I4] held');
select is(tests.fx_sf_audit('content_hidden') >= 3, true, '[AC-029 I4] comment moves are audited');

-- 5  the audited reveal of an anonymous author (BR-062, AC-077)
select is(pg_temp.fn('m1', format($q$ select full_name from nestly.reveal_post_author(%L) $q$, current_setting('t.pa'))), 'Alice Aaron', '[AC-077 I4] a Moderator with REPORTS_VIEW and CONTENT_MODERATE reveals the author of a reported anonymous post');
select is(tests.fx_sf_audit('author_revealed'), 1::bigint, '[AC-077 I4] and the reveal is audited');
select is(pg_temp.fn('d', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, current_setting('t.pa'))), pg_temp.id('a')::text, '[BR-062 I4] the Admin reveals too');
select is(tests.fx_sf_audit('author_revealed'), 2::bigint, '[AC-077 I4] each reveal makes an entry');
select is(pg_temp.fn('m2', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, current_setting('t.pa'))), 'ERR:42501', '[AC-077 I4] without CONTENT_MODERATE: refused');
select is(pg_temp.fn('m4', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, current_setting('t.pa'))), 'ERR:42501', '[AC-077 I4] without both keys: refused');
select is(pg_temp.fn('a', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, current_setting('t.pa'))), 'ERR:42501', '[AC-077 I4] a Regular account: refused');
select set_config('t.pn', pg_temp.post('a', true)::text, true);
select is(pg_temp.fn('m1', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, current_setting('t.pn'))), 'ERR:42501', '[AC-077 I4] outside the handling of a report on that post: refused');
select is(pg_temp.fn('m1', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, current_setting('t.p2'))), 'ERR:NS012', '[AC-077 I4] a named post has no anonymous author');
select is(tests.fx_sf_audit('author_revealed'), 2::bigint, '[AC-077 I4] a refused reveal leaves no entry');
select is(pg_temp.n('m1', 'nestly.post_authors'), '0', '[rule 20 I4] reading post_authors directly still shows a Moderator nothing');
select is(pg_temp.n('d', 'nestly.post_authors'), '0', '[rule 20 I4] nor the Admin');

-- 5b  the settings that open a row to its caller cannot be set by hand (rules 18, 19), and the review's negatives
select is(pg_temp.fn('m1', format($q$ with s as (select set_config('nestly.reveal_post', %L, true)) select count(*)::text from s, nestly.post_authors $q$, current_setting('t.pa'))), '0',
  '[AC-077 rule 19 I4] a Moderator naming the post in nestly.reveal_post by hand still reads no separation row');
select is(pg_temp.fn('d', format($q$ with s as (select set_config('nestly.reveal_user', %L, true)) select count(*)::text from s, nestly.regular_names where user_id = %L $q$, pg_temp.id('s'), pg_temp.id('s'))), '0',
  '[AC-077 rule 19 I4] nor a name, by nestly.reveal_user');
select set_config('t.pm', pg_temp.post('a')::text, true);
select is(pg_temp.fn('b', format($q$ with s as (select set_config('nestly.own_delete', %L, true)) select count(*)::text from s, nestly.posts where id = %L $q$, current_setting('t.pm'), current_setting('t.pm'))), '1',
  '[BR-080 I4] control: an active post is readable as always');
select tests.fx_po_status(current_setting('t.pm')::uuid, 'hidden');
select is(pg_temp.fn('b', format($q$ with s as (select set_config('nestly.own_delete', %L, true)) select count(*)::text from s, nestly.posts where id = %L $q$, current_setting('t.pm'), current_setting('t.pm'))), '0',
  '[BR-080 I4] another account naming a hidden post in nestly.own_delete by hand reads nothing');
select is(pg_temp.dml('b', format($q$ with s as (select set_config('nestly.own_delete', %L, true)) update nestly.posts t set status = 'deleted' from s where t.id = %L $q$, current_setting('t.pm'), current_setting('t.pm'))), 'OK:0',
  '[BR-080 I4] nor delete or hold it');
-- a closed report allows no reveal (the review, M2)
select is(pg_temp.dml('m1', format($q$ update nestly.reports set status = 'handled', resolution = 'dismissed' where post_id = %L $q$, current_setting('t.pa'))), 'OK:1', '[FR-MOD-003 I4] the report on the anonymous post is closed');
select is(pg_temp.fn('m1', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, current_setting('t.pa'))), 'ERR:42501', '[AC-077 I4] a closed report allows no reveal: only an open one');
-- closing a post report takes CONTENT_MODERATE, not a user key (the review, M1)
select set_config('t.pw', pg_temp.post('a')::text, true);
select tests.fx_rp_add(pg_temp.id('b'), 'post', current_setting('t.pw')::uuid, 'spam');
select is(pg_temp.dml('m4', format($q$ update nestly.reports set status = 'handled', resolution = 'dismissed' where post_id = %L $q$, current_setting('t.pw'))), 'OK:0',
  '[AC-022 I4] USER_WARN closes no report on a post: the key follows the kind of the target');
-- a stale session holds nothing (the review, H3)
select tests.fx_link_put(pg_temp.id('m1'), 'affected', '11111111-1111-4111-8111-111111111111'::uuid, timestamptz '2026-10-16 10:00:00+00', '11111111-1111-4111-8111-111111111111'::uuid);
select is(pg_temp.perm('m1', 'REPORTS_VIEW'), 'false', '[NFR-SEC-001 I4] a Moderator whose session is stale holds no key');
select is(pg_temp.n('m1', 'nestly.audit_log'), '0', '[NFR-SEC-001 I4] and reads no log');
select is(pg_temp.moderate('m1', 'posts', current_setting('t.pw')::uuid, 'hidden'), 'OK:0', '[NFR-SEC-001 I4] and moves no content');

-- 6  enforcement (FR-MOD-002, BR-074, AC-027, AC-028, AC-107, AC-110)
select pg_temp.reset();
select is(pg_temp.enforce('m4', 'a', 'warning'), 'OK:1', '[FR-MOD-002 I4] a Moderator with USER_WARN warns an account');
select is(pg_temp.status_of('a'), 'active', '[FR-MOD-002 I4] a warning is not a status');
select is(tests.fx_sf_enf(pg_temp.id('a')), 'warning:warning:f', '[BR-074 I4] first violation: the ladder suggested a warning, followed');
select is(tests.fx_sf_audit('user_warn'), 1::bigint, '[AC-029 I4] audited');
select is(pg_temp.enforce('m4', 'a', 'warning'), 'OK:1', '[BR-074 I4] a second warning');
select is(tests.fx_sf_enf(pg_temp.id('a')), 'warning:warning:f,warning:suspension:t', '[BR-074 AC-107 I4] it was not the suggested step: the skip is recorded');
select is((select bool_or((after_state->>'stepSkipped')::boolean) from tests.fx_audit_rows() where action = 'user_warn'), true, '[AC-107 I4] and goes to the Audit Log');
select is(pg_temp.enforce('m4', 'a', 'warning', null, '  '), 'ERR:23514', '[AC-107 I4] never without a reason');
select is(pg_temp.enforce('m5', 'a', 'warning'), 'ERR:42501', '[AC-027 I4] USER_BAN does not warn');
select is(pg_temp.enforce('m1', 'a', 'warning'), 'ERR:42501', '[FR-MOD-002 I4] a Moderator without any user key cannot');
select is(pg_temp.enforce('a', 'b', 'warning'), 'ERR:42501', '[FR-MOD-002 I4] a Regular account cannot');
select is(tests.dml_as('authenticated', tests.claims(pg_temp.id('m4')), format($q$ insert into nestly.user_enforcements (actor_id, user_id, kind, reason) values (%L, %L, 'warning', 'x') $q$, pg_temp.id('m3'), pg_temp.id('b')), false), 'ERR:42501',
  '[AC-107 I4] the actor cannot be chosen: an action is never made in another''s name');
select is(tests.dml_as('none', '', format($q$ insert into nestly.user_enforcements (user_id, kind, reason) values (%L, 'warning', 'x') $q$, pg_temp.id('b')), false), 'ERR:42501', '[AC-107 I4] nor without an Actor');
-- suspension (AC-028)
select tests.fx_sf_enf_add(pg_temp.id('b'), 'warning', null, interval '1 day');
select is(pg_temp.enforce('m4', 'b', 'suspension', null), 'ERR:23514', '[AC-028 I4] a suspension needs a duration');
select is(pg_temp.enforce('m4', 'b', 'suspension', 24), 'OK:1', '[AC-028 I4] a Moderator with USER_SUSPEND suspends for 24 hours');
select is(pg_temp.status_of('b'), 'suspended', '[AC-028 I4] the account is suspended');
select is(pg_temp.fn('b', 'select count(*)::text from nestly.posts'), '0', '[FR-MOD-002 rule 15 I4] and reads nothing from now on');
select is(tests.fx_sf_enf(pg_temp.id('b')), 'warning:warning:f,suspension:suspension:f', '[BR-074 I4] the second step of the ladder, followed (24 hours)');
select is((select (after_state->>'suspendedUntil') is not null from tests.fx_audit_rows() where action = 'user_suspend' limit 1), true, '[AC-029 I4] the end time is in the Audit entry');
select is(pg_temp.enforce('m5', 'b', 'suspension', 24), 'ERR:42501', '[AC-028 I4] USER_BAN alone cannot suspend');
select is(tests.dml_staff(tests.claims(pg_temp.id('m4')), format($q$ update nestly.users set status = 'active', suspended_until = null where id = %L $q$, pg_temp.id('b')), false), 'ERR:42501', '[AC-107 I4] a status cannot be changed without its enforcement record');
select is(pg_temp.dml('b', 'update nestly.users set status = ''active'', suspended_until = null'), 'OK:0', '[FR-MOD-002 I4] the suspended account cannot lift it before the end time');
select is(pg_temp.enforce('m4', 'b', 'reinstate'), 'OK:1', '[FR-MOD-002 I4] a Moderator with USER_SUSPEND ends it early');
select is(pg_temp.status_of('b'), 'active', '[FR-MOD-002 I4] active again');
select is(pg_temp.enforce('m4', 'b', 'reinstate'), 'ERR:NS013', '[FR-MOD-002 I4] reinstating an active account does not apply');
select is(pg_temp.enforce('m4', 'b', 'suspension', 72), 'OK:1', '[BR-074 I4] the 72-hour option');
select is(tests.fx_sf_enf(pg_temp.id('b')), 'warning:warning:f,reinstate:suspension:f,suspension:suspension:f,suspension:suspension:t', '[BR-074 AC-107 I4] the 72-hour option is not the suggested step: recorded as a skip');
select is(tests.dml_staff(tests.claims(pg_temp.id('m4')), format($q$ update nestly.users set suspended_until = now() + interval '400 days' where id = %L $q$, pg_temp.id('b')), false), 'ERR:42501',
  '[AC-107 I4] a suspension cannot be stretched by a direct update: a status or end-time change needs its enforcement record');
select tests.fx_sf_expire(pg_temp.id('b'));
select is(pg_temp.dml('b', 'update nestly.users set status = ''active'', suspended_until = null'), 'OK:1', '[FR-MOD-002 I4] once the end time has passed the account returns itself to active');
select is(pg_temp.status_of('b'), 'active', '[FR-MOD-002 I4] and is active');
select is(pg_temp.dml('b', 'update nestly.users set status = ''banned'''), 'OK:0', '[I4] an account cannot ban itself');
select is(pg_temp.dml('x', 'update nestly.users set status = ''active'', suspended_until = null'), 'OK:0', '[I4] a banned account cannot unban itself');
select is(pg_temp.dml('s', 'update nestly.users set status = ''active'', suspended_until = null'), 'OK:0', '[I4] a suspended account with no end time cannot lift it');
select is(tests.dml_staff(tests.claims(pg_temp.id('m3')), format($q$ update nestly.users set status = 'banned' where id = %L $q$, pg_temp.id('m5')), false) in ('OK:0', 'ERR:42501'), true, '[AC-027 I4] a Moderator cannot ban a Moderator by a direct update');
select is(tests.dml_staff(tests.claims(pg_temp.id('m3')), format($q$ update nestly.users set status = 'banned' where id = %L $q$, pg_temp.id('d')), false) in ('OK:0', 'ERR:42501'), true, '[AC-027 I4] nor an Admin');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$ insert into nestly.users (account_type, status) values ('moderator', 'active') $q$, false), 'ERR:42501', '[BR-021 I4] an account cannot register itself as a Moderator');
select is(tests.dml_as('authenticated', tests.claims(tests.fx_id('f1')), $q$ insert into nestly.users (account_type, status) values ('admin', 'active') $q$, false), 'ERR:42501', '[BR-021 I4] nor as an Admin');
-- ban and unban (AC-027, AC-110)
select is(pg_temp.enforce('m4', 'c', 'ban'), 'ERR:42501', '[AC-027 I4] without USER_BAN: refused');
select is(pg_temp.enforce('m3', 'm5', 'ban'), 'ERR:42501', '[AC-027 I4] a Moderator cannot ban another Moderator');
select is(pg_temp.enforce('m3', 'd', 'ban'), 'ERR:42501', '[AC-027 I4] nor an Admin');
select is(pg_temp.enforce('m3', 'm3', 'ban'), 'ERR:42501', '[AC-027 I4] nor themself');
select set_config('t.rcs', tests.fx_rp_add(pg_temp.id('b'), 'user', pg_temp.id('c'), 'child_safety')::text, true);
select is(pg_temp.enforce('m3', 'c', 'ban', null, 'child endangerment', true), 'ERR:23514', '[AC-110 I4] the child-safety mark needs a report with that reason');
select is(pg_temp.enforce('m3', 'c', 'ban', null, 'child endangerment', true, current_setting('t.rcs')::uuid), 'OK:1', '[AC-110 I4] a Moderator with USER_BAN (and REPORTS_VIEW to cite the report) blocks at once for content endangering a child');
select is(pg_temp.status_of('c'), 'banned', '[AC-110 I4] banned');
select is(tests.fx_sf_enf(pg_temp.id('c')), 'ban:warning:t', '[AC-110 I4] whatever the ladder said (recorded as a skip)');
select is((select reason || '/' || (after_state->>'childSafety') from tests.fx_audit_rows() where action = 'user_ban' limit 1), 'child endangerment/true', '[AC-110 I4] the Audit entry has the reason and the child-safety mark');
select is(pg_temp.enforce('m5', 'a', 'warning'), 'ERR:42501', '[AC-027 I4] control: USER_BAN does not warn');
select is(pg_temp.enforce('m4', 'a', 'suspension', 24, 'x', true, current_setting('t.rcs')::uuid), 'ERR:23514', '[AC-110 I4] the child-safety mark belongs to a ban only');
select is(pg_temp.enforce('m4', 'c', 'unban'), 'ERR:42501', '[AC-027 I4] without USER_BAN no Unban');
select is(pg_temp.enforce('m5', 'c', 'unban'), 'OK:1', '[AC-027 I4] a Moderator with USER_BAN unbans');
select is(pg_temp.status_of('c'), 'active', '[AC-027 I4] active again');
select is(pg_temp.enforce('m5', 'c', 'unban'), 'ERR:NS013', '[AC-027 I4] unbanning an account that is not banned does not apply');
select is(pg_temp.enforce('d', 'm5', 'ban', null, 'abuse of power'), 'OK:1', '[FR-MOD-002 AC-025 I4] the Admin can act on a Moderator');
select is(pg_temp.status_of('m5'), 'banned', '[FR-MOD-002 I4] banned');
select is(pg_temp.perm('m5', 'USER_BAN'), 'false', '[rule 15 I4] and holds no key any more');
select is(pg_temp.enforce('d', 'd', 'ban'), 'ERR:42501', '[FR-MOD-002 I4] the Admin cannot ban themself');
-- the ladder only counts the last 12 months
select tests.fx_sf_enf_add(pg_temp.id('p'), 'ban', null, interval '13 months');
select is(pg_temp.enforce('m4', 'p', 'warning'), 'OK:1', '[BR-074 I4] a Professional can be warned');
select is(tests.fx_sf_enf(pg_temp.id('p')), 'ban:warning:t,warning:warning:f', '[BR-074 I4] after a clean year the ladder starts again');
select tests.fx_sf_enf_add(pg_temp.id('s'), 'suspension', 720, interval '1 day');
select tests.fx_sf_enf_add(pg_temp.id('s'), 'warning', null, interval '2 day');
select tests.fx_sf_enf_add(pg_temp.id('s'), 'suspension', 168, interval '3 day');
select tests.fx_sf_enf_add(pg_temp.id('s'), 'suspension', 24, interval '4 day');
select is(pg_temp.enforce('m3', 's', 'warning'), 'OK:1', '[BR-074 I4] a warning is still possible');
select is(tests.fx_sf_enf(pg_temp.id('s')) like '%,warning:ban:t', true, '[BR-074 I4] after four violations the suggestion is a ban');

-- 7  report reasons (FR-ADMIN-007)
select pg_temp.reset();
select is(pg_temp.n('a', 'nestly.report_reasons'), '8', '[FR-MOD-001 I4] every active account reads the eight reasons');
select is(tests.dml_as('anon', tests.claims(pg_temp.id('a')), 'select 1 from nestly.report_reasons'), 'ERR:42501', '[I4] anon reads none');
select is(pg_temp.dml('a', 'update nestly.report_reasons set label = ''חדש'''), 'OK:0', '[FR-ADMIN-007 I4] a Regular account edits nothing');
select is(pg_temp.dml('m1', 'update nestly.report_reasons set label = ''חדש'''), 'OK:0', '[FR-ADMIN-007 I4] a Moderator without COMMUNITY_CONFIG edits nothing');
select is(pg_temp.dml('m3', 'update nestly.report_reasons set label = ''הטרדה, בריונות'' where key = ''harassment'''), 'OK:1', '[FR-ADMIN-007 I4] COMMUNITY_CONFIG edits a label');
select is((select before_state->>'label' || '>' || (after_state->>'label') from tests.fx_audit_rows() where action = 'report_reason_changed' limit 1), 'הטרדה או בריונות>הטרדה, בריונות', '[FR-ADMIN-007 BR-026 I4] Before/After in the Audit Log');
select is(pg_temp.dml('d', 'update nestly.report_reasons set is_active = false where key = ''child_safety'''), 'ERR:23514', '[BR-074 I4] child safety cannot be switched off');
select is(pg_temp.dml('d', 'update nestly.report_reasons set priority = 2 where key = ''child_safety'''), 'ERR:23514', '[AC-106 BR-074 I4] nor lose the top priority');
select is(pg_temp.dml('d', 'update nestly.report_reasons set is_active = false where key = ''other'''), 'ERR:23514', '[VAL-048 I4] nor "other"');
select is(pg_temp.dml('d', 'update nestly.report_reasons set key = ''zzz'' where key = ''spam'''), 'ERR:42501', '[I4] the key is fixed (column not granted)');
select is(pg_temp.dml('m3', 'update nestly.report_reasons set priority = 1 where key = ''spam'''), 'ERR:23514', '[AC-106 BR-074 I4] no other reason takes priority 1');
select is(pg_temp.dml('m3', 'insert into nestly.report_reasons (key, label, priority, sort_order) values (''zz_top'', ''עדיפות עליונה'', 1, 91)', false), 'ERR:23514', '[AC-106 I4] nor a new one');
select is(pg_temp.dml('m3', 'update nestly.report_reasons set priority = 2 where key = ''spam'''), 'OK:1', '[FR-ADMIN-007 I4] a priority can be changed');
select is(pg_temp.dml('m3', 'insert into nestly.report_reasons (key, label, priority, sort_order) values (''custom_1'', ''סיבה חדשה'', 3, 90)'), 'OK:1', '[FR-ADMIN-007 I4] a reason can be added');
select is(pg_temp.n('a', 'nestly.report_reasons'), '9', '[FR-ADMIN-007 I4] it is listed for everyone');
select is(pg_temp.dml('m3', 'update nestly.report_reasons set is_active = false where key = ''custom_1'''), 'OK:1', '[FR-ADMIN-007 I4] and switched off');
select set_config('t.p9', pg_temp.post('a')::text, true);
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'custom_1') $q$, current_setting('t.p9')), false), 'ERR:42501', '[FR-ADMIN-007 I4] a switched-off reason cannot be used for a new report');
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'spam') $q$, current_setting('t.p9'))), 'OK:1', '[FR-MOD-001 I4] control: an active reason works');
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'nope') $q$, current_setting('t.p9')), false), 'ERR:42501', '[VAL-048 I4] an unknown reason is refused');

select * from finish();

rollback;
