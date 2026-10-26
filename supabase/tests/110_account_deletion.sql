-- pgTAP, run by pg_prove as app_server (CI `db` job, I9 part 1: account deletion).
-- Source of expected values: SRS FR-SET-002, BR-073, BR-077, BR-080, AC-108, ERR-026, §13.4 and decisions-in-force.md §16.4; the ⭐ defaults
-- of the I9 brief (status deletion_scheduled, due = request + 30 days, the open-report wait, the "deleted user" comment row, chats kept for
-- the other side, the 90-day / 12-month retention). The jobs run as app_jobs through 71_'s tests.jobs_as.
-- People: D (the account deleted, built here), B = 10_'s b (another Regular), A = 10_'s a, P (a Professional, built here),
-- adm = 60_'s fr_d (the Admin), mod = 90_'s sf_m1 (a Moderator, given every assignable key here). Everything rolls back.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F9.1-a c1 · I9] session_user is app_server');

select tests.fx_fr_build();
select set_config('t.d', tests.fx_dl_person('regular')::text, true);
select set_config('t.p', tests.fx_dl_person('professional')::text, true);

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'd' then current_setting('t.d')::uuid when 'p' then current_setting('t.p')::uuid
                when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b')
                when 'adm' then tests.fx_fr_id('fr_d') when 'mod' then tests.fx_sf_id('sf_m1') end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.fn(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
create function pg_temp.staff_n(p_who text, p_rel text) returns text language sql as $f$
  select tests.fn_staff(tests.claims(pg_temp.id(p_who)), 'select count(*)::text from ' || p_rel)
$f$;
create function pg_temp.refused(p_res text) returns text language sql as $f$ select case when p_res like 'ERR:%' or p_res = 'OK:0' then 'refused' else p_res end $f$;
create function pg_temp.pg(p_sql text) returns text language sql as $f$ select tests.fx_dl_text(p_sql) $f$;
create function pg_temp.x(p_sql text) returns text language sql as $f$ select tests.fx_dl_exec(p_sql) $f$;
create function pg_temp.request(p_who text) returns text language sql as $f$
  select pg_temp.dml(p_who, $q$ update nestly.users set status = 'deletion_scheduled' where id = auth.uid() $q$)
$f$;
create function pg_temp.cancel(p_who text) returns text language sql as $f$
  select pg_temp.dml(p_who, $q$ update nestly.users set status = 'active' where id = auth.uid() $q$)
$f$;
create function pg_temp.run() returns text language sql as $f$
  select tests.jobs_as('select (r.executed || ''/'' || r.waiting || ''/'' || r.failed) from nestly.execute_account_deletions() r')
$f$;
create function pg_temp.purge() returns text language sql as $f$ select tests.jobs_as('select nestly.purge_deleted_accounts()::text') $f$;
create function pg_temp.events(p_who text) returns text language sql as $f$
  select pg_temp.pg(format($q$ select coalesce(string_agg(kind, ',' order by kind), '-') from nestly.account_deletion_events where account_id = %L $q$, pg_temp.id(p_who)))
$f$;

select tests.fx_sf_grant(pg_temp.id('mod'), array(select k.key from unnest(array[
  'REPORTS_VIEW', 'CONTENT_MODERATE', 'USER_VIEW', 'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'AUDIT_LOG_VIEW', 'SUPPORT_VIEW', 'SUPPORT_HANDLE'
]) as k(key)));

-- =====================================================================================================================
-- structure
-- =====================================================================================================================
select is(pg_temp.pg($q$ select relrowsecurity::text || relforcerowsecurity::text from pg_class where oid = 'nestly.account_deletion_events'::regclass $q$),
  'truetrue', '[F9.1-a c1 · I9 §16.4 rule 8] account_deletion_events: RLS enabled and forced');
select is(pg_temp.pg($q$ select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
                         where table_schema = 'nestly' and table_name = 'account_deletion_events' $q$),
  'id,account_id,account_type,kind,due_at,created_at,auth_removed_at', '[I9 §16.4] the deletion record holds kind, account id and type, time and due date only (no email, name, reason or content); since §22.6 the time the job removed the Auth user (file 114)');
select is(pg_temp.pg($q$ select string_agg(polname || ':' || polcmd::text || ':' || (select string_agg(rolname, '+') from pg_roles where oid = any (polroles)), ', ' order by polname)
                         from pg_policy where polrelid = 'nestly.account_deletion_events'::regclass $q$),
  'account_deletion_events_delete_jobs:d:app_jobs, account_deletion_events_insert_enforcement:a:authenticated, account_deletion_events_insert_jobs:a:app_jobs, account_deletion_events_insert_own:a:authenticated, '
  || 'account_deletion_events_select_admin:r:authenticated, account_deletion_events_select_jobs:r:app_jobs, account_deletion_events_select_own_execute:r:authenticated, account_deletion_events_update_jobs:w:app_jobs',
  '[I9 §16.4 rule 6] exactly these policies: the Admin reads, an identity its own execute row, the trigger and the job write, the job purges; the only UPDATE is the job''s Auth stamp and the staff cancel comes from the trigger (§22.4, §22.6: file 114)');
select is(pg_temp.pg($q$ select string_agg(p.proname || ':' || r.rolname, ',' order by p.proname, r.rolname)
                         from pg_proc p cross join (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs'), ('app_media_jobs')) as r(rolname)
                        where p.pronamespace = 'nestly'::regnamespace and p.proname in ('execute_account_deletions', 'purge_deleted_accounts', 'account_deletion_record')
                          and has_function_privilege(r.rolname, p.oid, 'EXECUTE') $q$),
  'execute_account_deletions:app_jobs,purge_deleted_accounts:app_jobs', '[I9 rule 6] only app_jobs runs the execution and the purge; the record trigger is nobody''s to call');
select is(pg_temp.pg($q$ select string_agg(p.proname || ':' || p.prosecdef::text, ',' order by p.proname) from pg_proc p
                        where p.pronamespace = 'nestly'::regnamespace and p.proname in ('execute_account_deletions', 'purge_deleted_accounts', 'account_deletion_record', 'users_status_guard') $q$),
  'account_deletion_record:false,execute_account_deletions:false,purge_deleted_accounts:false,users_status_guard:false', '[I9 rule 10] no new SECURITY DEFINER');
select is(pg_temp.pg($q$ select string_agg(x, ', ' order by x) from (
                          select c.relname || '=' || p.p as x from pg_class c, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(p)
                           where c.relnamespace = 'nestly'::regnamespace and c.relname in ('users', 'account_deletion_events', 'conversations', 'security_events', 'recovery_events',
                                   'enforcement_records', 'user_enforcements', 'audit_log', 'messages', 'legal_consents')
                             and has_table_privilege('app_jobs', c.oid, p.p)
                          union all
                          select c.relname || '.' || a.attname || '=' || p.p from pg_class c join pg_attribute a on a.attrelid = c.oid, unnest(array['SELECT', 'INSERT', 'UPDATE']) p(p)
                           where c.relnamespace = 'nestly'::regnamespace and c.relname in ('users', 'account_deletion_events', 'conversations', 'security_events', 'recovery_events',
                                   'enforcement_records', 'user_enforcements', 'audit_log', 'messages', 'legal_consents')
                             and a.attnum > 0 and not a.attisdropped and not has_table_privilege('app_jobs', c.oid, p.p)
                             and has_column_privilege('app_jobs', c.oid, a.attnum, p.p)) s $q$),
  'account_deletion_events.account_id=INSERT, account_deletion_events.account_type=INSERT, account_deletion_events.auth_removed_at=UPDATE, account_deletion_events.due_at=INSERT, account_deletion_events.kind=INSERT, '
  || 'account_deletion_events=DELETE, account_deletion_events=SELECT, audit_log.id=SELECT, audit_log.target_id=SELECT, audit_log.target_kind=SELECT, audit_log=DELETE, '
  || 'conversations.a_status=SELECT, conversations.b_status=SELECT, conversations.id=SELECT, conversations.user_a=SELECT, conversations.user_a=UPDATE, conversations.user_b=SELECT, conversations.user_b=UPDATE, conversations=DELETE, '
  || 'enforcement_records.id=SELECT, enforcement_records.user_id=SELECT, enforcement_records=DELETE, messages.conversation_id=SELECT, messages.id=SELECT, recovery_events.id=SELECT, recovery_events.user_id=SELECT, recovery_events=DELETE, '
  || 'security_events.id=SELECT, security_events.user_id=SELECT, security_events=DELETE, user_enforcements.id=SELECT, user_enforcements.user_id=SELECT, user_enforcements=DELETE, '
  || 'users.account_type=SELECT, users.deletion_due_at=SELECT, users.id=SELECT, users.status=SELECT, users=DELETE',
  '[I9 rule 6 BR-073] app_jobs holds exactly what the execution and the 90-day purge need: read and delete of a scheduled users row, the deletion record (execute rows only by policy), the deleted side of a conversation (or the whole one-sided conversation), message ids only (an open report on one holds the deletion), and id + account id of the kept records; nothing on consents');
select is(pg_temp.pg($q$ select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
                         from pg_class c join pg_attribute a on a.attrelid = c.oid
                        where c.relnamespace = 'nestly'::regnamespace and c.relname in ('marketplace_listings', 'professional_articles', 'professional_reviews')
                          and a.attnum > 0 and not a.attisdropped and has_column_privilege('app_jobs', c.oid, a.attnum, 'SELECT,INSERT,UPDATE') $q$),
  'marketplace_listings.expires_at, marketplace_listings.id, marketplace_listings.owner_id, marketplace_listings.owner_status, marketplace_listings.status, professional_articles.author_id, professional_articles.author_status, professional_articles.id, '
  || 'professional_reviews.id, professional_reviews.professional_id, professional_reviews.reviewer_id, professional_reviews.reviewer_status',
  '[I9 rule 6 BR-080] on listings, articles and reviews app_jobs reads only who owns or wrote them (is one under an open report?): no text, no write');
select is(pg_temp.pg($q$ select string_agg(conname, ',' order by conname) from pg_constraint
                        where contype = 'f' and confrelid = 'nestly.users'::regclass and confdeltype = 'r' $q$),
  'audit_log_actor_id_fkey,enforcement_records_decided_by_fkey,group_staff_views_viewer_id_fkey,moderator_invitations_invited_by_fkey,moderator_permissions_granted_by_fkey,private_group_content_views_viewer_id_fkey,profile_staff_views_viewer_id_fkey,report_escalations_escalated_by_fkey,report_openings_opened_by_fkey,reported_comment_views_viewer_id_fkey,reported_message_views_viewer_id_fkey,reports_handled_by_fkey,system_announcements_created_by_fkey,user_enforcements_actor_id_fkey',
  '[I9 BR-073] only staff-only references still RESTRICT a users row: none can point at a Regular or Professional account');
select is(pg_temp.pg($q$ select pg_get_constraintdef(oid) from pg_constraint where conname = 'users_id_fkey' $q$),
  'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT', '[I9 §13] the anchor stays RESTRICT: the Auth user goes only after the Nestly data');

-- =====================================================================================================================
-- D's account and content
-- =====================================================================================================================
select tests.fx_insert_child(pg_temp.id('d'), 1, 'Noa', 'girl', date '2025-01-01');
select tests.fx_insert_journey(pg_temp.id('d'), 'has_child');
select is(pg_temp.x(format($q$ insert into nestly.legal_consents (user_id, terms_version, privacy_version, has_declared_18_plus) values (%L, 't1', 'p1', true) $q$, pg_temp.id('d'))), 'OK:1', 'fixture: D''s consent');
select is(pg_temp.x(format($q$ insert into nestly.security_events (kind, user_id) values ('profile_open_limit', %L) $q$, pg_temp.id('d'))), 'OK:1', 'fixture: a security event of D');
select is(pg_temp.x(format($q$ insert into nestly.recovery_events (kind, user_id, handle_hash, ip_hash) values ('answers_saved', %L, decode(repeat('ab', 32), 'hex'), decode(repeat('cd', 32), 'hex')) $q$, pg_temp.id('d'))), 'OK:1', 'fixture: a recovery event of D');
select is(pg_temp.x(format($q$ insert into nestly.user_enforcements (user_id, actor_id, kind, reason) values (%L, %L, 'warning', 'rude') $q$, pg_temp.id('d'), pg_temp.id('adm'))), 'OK:1', 'fixture: a warning on D');
select is(pg_temp.x(format($q$ insert into nestly.audit_log (actor_id, actor_role, action, target_kind, target_id) values (%L, 'admin', 'user_warned', 'user', %L) $q$, pg_temp.id('adm'), pg_temp.id('d'))), 'OK:1', 'fixture: an Audit entry about D');

select set_config('t.pd', tests.fx_po_add(pg_temp.id('d'))::text, true);
select set_config('t.pa', tests.fx_po_add(pg_temp.id('d'), 'everyone', true)::text, true);
select set_config('t.pb', tests.fx_po_add(pg_temp.id('b'))::text, true);
select set_config('t.share', tests.fx_po_add(pg_temp.id('b'), 'everyone', false, 'active', null, null, current_setting('t.pd')::uuid)::text, true);
select set_config('t.c_kept', tests.fx_cm_add(pg_temp.id('d'), current_setting('t.pb')::uuid, 'D on B, replied')::text, true);
select set_config('t.c_reply', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.pb')::uuid, 'B replies to D', current_setting('t.c_kept')::uuid)::text, true);
select set_config('t.c_gone', tests.fx_cm_add(pg_temp.id('d'), current_setting('t.pb')::uuid, 'D on B, alone')::text, true);
select set_config('t.c_b_on_d', tests.fx_cm_add(pg_temp.id('b'), current_setting('t.pd')::uuid, 'B on D')::text, true);
select set_config('t.c_self', tests.fx_cm_add(pg_temp.id('d'), current_setting('t.pb')::uuid, 'D on B, only D replied')::text, true);
select set_config('t.c_self_reply', tests.fx_cm_add(pg_temp.id('d'), current_setting('t.pb')::uuid, 'D replies to itself', current_setting('t.c_self')::uuid)::text, true);
select tests.fx_rx_add(pg_temp.id('d'), current_setting('t.pb')::uuid);
select tests.fx_rx_add(pg_temp.id('b'), current_setting('t.pd')::uuid);
select tests.fx_fr_add(pg_temp.id('d'), pg_temp.id('b'), 'accepted');
select set_config('t.conv', pg_temp.pg(format($q$ insert into nestly.conversations (context, user_a, user_b) values ('friends', least(%L::uuid, %L::uuid), greatest(%L::uuid, %L::uuid)) returning id::text $q$,
  pg_temp.id('d'), pg_temp.id('b'), pg_temp.id('d'), pg_temp.id('b'))), true);
select is(pg_temp.x(format($q$ insert into nestly.messages (conversation_id, sender_id, body) values (%L, %L, 'hi from D'), (%L, %L, 'hi from B') $q$,
  current_setting('t.conv'), pg_temp.id('d'), current_setting('t.conv'), pg_temp.id('b'))), 'OK:2', 'fixture: two messages, one from each side');
select set_config('t.rp_by_d', tests.fx_rp_add(pg_temp.id('d'), 'post', current_setting('t.pb')::uuid)::text, true);
select set_config('t.rp_on_d', tests.fx_rp_add(pg_temp.id('b'), 'user', pg_temp.id('d'))::text, true);
select set_config('t.conv_dp', pg_temp.pg(format($q$ insert into nestly.conversations (context, user_a, user_b) values ('friends', least(%L::uuid, %L::uuid), greatest(%L::uuid, %L::uuid)) returning id::text $q$,
  pg_temp.id('d'), pg_temp.id('p'), pg_temp.id('d'), pg_temp.id('p'))), true);
select is(pg_temp.x(format($q$ insert into nestly.messages (conversation_id, sender_id, body) values (%L, %L, 'hi P') $q$, current_setting('t.conv_dp'), pg_temp.id('d'))), 'OK:1',
  'fixture: a conversation of D with P (P is deleted later)');
select is(pg_temp.x(format($q$ insert into nestly.support_requests (user_id, topic, body) values (%L, 'account', 'help') $q$, pg_temp.id('d'))), 'OK:1', 'fixture: a Support request of D');
select is(pg_temp.x(format($q$ insert into nestly.notifications (recipient_id, type, target_kind, target_id, subject_id) values (%L, 'post_shared', 'post', %L, %L) $q$,
  pg_temp.id('d'), current_setting('t.pd'), current_setting('t.pd'))), 'OK:1', 'fixture: a notification to D');
select is(pg_temp.x(format($q$ insert into nestly.marketplace_listings (owner_id, title, category, item_condition, city) values (%L, 'Stroller', 'strollers', 'good', 'haifa') $q$, pg_temp.id('d'))), 'OK:1', 'fixture: a listing of D');
select is(pg_temp.x(format($q$ insert into nestly.media_assets (owner_id, kind, status, mime, width, height, byte_size) values (%L, 'profile', 'passed', 'image/jpeg', 10, 10, 100) $q$, pg_temp.id('d'))), 'OK:1', 'fixture: an image of D');
select is(pg_temp.x(format($q$ insert into nestly.media_assets (owner_id, kind, status, mime, width, height, byte_size, is_held, decided_at) values (%L, 'post', 'rejected', 'image/jpeg', 10, 10, 100, true, now()) $q$, pg_temp.id('d'))), 'OK:1', 'fixture: a held (suspected) image of D');

select is(pg_temp.n('b', format('nestly.posts where id = %L', current_setting('t.pd'))), '1', 'control: B reads D''s post');
select is(pg_temp.n('b', format('nestly.comments where id = %L', current_setting('t.c_kept'))), '1', 'control: B reads D''s comment');
select is(pg_temp.n('b', format('nestly.conversations where id = %L', current_setting('t.conv'))), '1', 'control: B reads the conversation with D');

-- =====================================================================================================================
-- the request (FR-SET-002)
-- =====================================================================================================================
select is(pg_temp.fn('d', 'select count(*)::text from nestly.account_deletion_events'), '0', '[I9 §16.4] D reads no deletion row');
select is(pg_temp.dml('d', $q$ insert into nestly.account_deletion_events (account_type, kind, due_at) values ('regular', 'request', now() + interval '30 days') $q$), 'ERR:42501',
  '[I9 §16.4 AC-175] nobody writes the deletion record directly');
select is(pg_temp.dml('d', $q$ update nestly.users set deletion_due_at = now() + interval '1 day' where id = auth.uid() $q$), 'ERR:42501', '[I9 FR-SET-002] the client cannot choose the date');
select is(pg_temp.refused(pg_temp.dml('adm', format($q$ update nestly.users set status = 'deletion_scheduled' where id = %L $q$, pg_temp.id('d')))), 'refused', '[I9 FR-SET-002] nobody schedules another account''s deletion, the Admin included');
select is(pg_temp.refused(pg_temp.request('adm')), 'refused', '[I9 ⭐] a staff account has no self-deletion (Admin)');
select is(pg_temp.refused(pg_temp.request('mod')), 'refused', '[I9 ⭐] a staff account has no self-deletion (Moderator)');

select is(pg_temp.request('d'), 'OK:1', '[I9 FR-SET-002 AC-108] D schedules its deletion');
select is(tests.fx_user(pg_temp.id('d')), 'regular/deletion_scheduled', '[I9 §13 User] the status says scheduled');
select ok(pg_temp.pg(format($q$ select (deletion_due_at = now() + interval '30 days')::text from nestly.users where id = %L $q$, pg_temp.id('d')))::boolean,
  '[I9 BR-073] the due date is the request + 30 days');
select is(pg_temp.events('d'), 'request', '[I9 §16.4] one request row');
select is(pg_temp.pg(format($q$ select (due_at = now() + interval '30 days')::text || ':' || account_type from nestly.account_deletion_events where account_id = %L $q$, pg_temp.id('d'))),
  'true:regular', '[I9 §16.4] with the account type and the due date');
select is(pg_temp.refused(pg_temp.request('d')), 'refused', '[I9] a second request while scheduled changes nothing');

-- hidden from everyone during the 30 days
select is(pg_temp.n('b', format('nestly.posts where id = %L', current_setting('t.pd'))), '0', '[I9 FR-SET-002 AC-108] B no longer reads D''s post');
select is(pg_temp.n('a', format('nestly.posts where id in (%L, %L)', current_setting('t.pd'), current_setting('t.pa'))), '0', '[I9 AC-108] nor A, the anonymous post included');
select is(pg_temp.n('b', format('nestly.comments where id = %L', current_setting('t.c_kept'))), '0', '[I9 AC-108] nor D''s comment');
select is(pg_temp.n('b', format('nestly.conversations where id = %L', current_setting('t.conv'))), '0', '[I9 ⭐] the conversation is unavailable to B, as with a suspended account');
select is(pg_temp.n('b', format('nestly.marketplace_listings where owner_id = %L', pg_temp.id('d'))), '0', '[I9 AC-108] nor D''s listing');
select is(pg_temp.n('d', 'nestly.posts'), '0', '[I9 FR-AUTH-002] D itself can read nothing but its own users row');
select is(pg_temp.n('d', 'nestly.users'), '1', '[I9 PG-050] D reads its own row (the date for PG-050)');
select is(pg_temp.n('adm', 'nestly.account_deletion_events'), '1', '[I9 §16.4 AC-176] the Admin reads the request');
select is(pg_temp.n('mod', 'nestly.account_deletion_events'), '0', '[I9 §16.4 AC-176] a Moderator with every assignable key reads none');
select is(pg_temp.n('b', 'nestly.account_deletion_events'), '0', '[I9 §16.4 AC-176] a Regular account reads none');
select is(pg_temp.n('p', 'nestly.account_deletion_events'), '0', '[I9 §16.4 AC-176] a Professional reads none');
select is(pg_temp.refused(pg_temp.dml('adm', format($q$ update nestly.users set status = 'active' where id = %L $q$, pg_temp.id('d')))), 'refused', '[I9 ⭐] staff cannot cancel it');
select is(pg_temp.refused(pg_temp.dml('adm', 'delete from nestly.account_deletion_events')), 'refused', '[I9 §16.4] nobody deletes a deletion row but the job');
select is(pg_temp.x(format('delete from auth.users where id = %L', pg_temp.id('d'))), 'ERR:23503', '[I9 §13] the Auth user cannot go first (anchor RESTRICT)');

-- the cancel (PG-050)
select is(pg_temp.cancel('d'), 'OK:1', '[I9 FR-SET-002 PG-050 AC-108] D cancels during the 30 days');
select is(tests.fx_user(pg_temp.id('d')), 'regular/active', '[I9 AC-108] the account is active again');
select is(pg_temp.pg(format($q$ select coalesce(deletion_due_at::text, 'null') from nestly.users where id = %L $q$, pg_temp.id('d'))), 'null', '[I9] with no due date');
select is(pg_temp.events('d'), 'cancel,request', '[I9 §16.4] a cancel row');
select is(pg_temp.n('b', format('nestly.posts where id = %L', current_setting('t.pd'))), '1', '[I9 AC-108] the content is back for B');
select is(pg_temp.cancel('d'), 'ERR:42501', '[I9] an active account has nothing to cancel');

-- a Group Owner is stopped (ERR-026)
select is(pg_temp.dml('d', $q$ insert into nestly.groups (name, privacy) values ('D group', 'public') $q$), 'OK:1', 'fixture: D owns a Group');
select is(pg_temp.request('d'), 'ERR:NS030', '[I9 ERR-026 AC-177] a Group Owner cannot schedule the deletion before transferring the ownership');
select is(pg_temp.x(format($q$ update nestly.groups set status = 'deleted', deleted_at = now(), deleted_xact = pg_current_xact_id() where created_by = %L $q$, pg_temp.id('d'))), 'OK:1', 'fixture: the Group is deleted');

-- a second request restarts the 30 days
select is(pg_temp.request('d'), 'OK:1', '[I9 ⭐] a second request after a cancel');
select ok(pg_temp.pg(format($q$ select (deletion_due_at = now() + interval '30 days')::text from nestly.users where id = %L $q$, pg_temp.id('d')))::boolean, '[I9 ⭐] restarts the 30 days');

-- =====================================================================================================================
-- the execution (BR-073)
-- =====================================================================================================================
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')), 'select nestly.execute_account_deletions()::text'), 'ERR:42501', '[I9 rule 6] a client cannot run the execution');
select is(pg_temp.run(), '0/0/0', '[I9 BR-073] before the due date nothing runs');
select is(pg_temp.cancel('d') || pg_temp.request('d'), 'OK:1OK:1', 'fixture: again');
select tests.fx_dl_due(pg_temp.id('d'), interval '31 days');
select is(pg_temp.refused(pg_temp.cancel('d')), 'refused', '[I9 BR-073] after the due date the cancel is closed');

-- an open report on D's post holds the deletion (BR-080)
select set_config('t.rp_on_pd', tests.fx_rp_add(pg_temp.id('a'), 'post', current_setting('t.pd')::uuid)::text, true);
select is(pg_temp.run(), '0/1/0', '[I9 BR-080 ⭐] an open report on D''s post: the account waits');
select is(tests.fx_user(pg_temp.id('d')), 'regular/deletion_scheduled', '[I9 BR-080] and is still there');
select is(pg_temp.staff_n('adm', format('nestly.posts where id = %L', current_setting('t.rp_on_pd'))), '0', 'control: an id that is not a post');
select is(pg_temp.staff_n('mod', format('nestly.posts where id = %L', current_setting('t.pd'))), '1', '[I9 BR-080] the Moderator still reads the reported post to handle it');
select tests.fx_rp_set(current_setting('t.rp_on_pd')::uuid, 'handled');

select is(pg_temp.run(), '1/0/0', '[I9 BR-073 AC-108] once handled, the next run executes the deletion');
select is(tests.fx_user(pg_temp.id('d')), null, '[I9 BR-073] the users row is gone');
select is(pg_temp.events('d'), 'cancel,cancel,execute,request,request,request', '[I9 §16.4 AC-178] the record keeps every request, cancel and the execution');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.regular_profiles where user_id = %L $q$, pg_temp.id('d'))), '0', '[I9 BR-073] the profile is gone');
select is(pg_temp.pg(format($q$ select (select count(*) from nestly.children where user_id = %L) + (select count(*) from nestly.journey_contexts where user_id = %L) $q$, pg_temp.id('d'), pg_temp.id('d'))), '0', '[I9 BR-073] children and journeys are gone');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.posts where id in (%L, %L) $q$, current_setting('t.pd'), current_setting('t.pa'))), '0', '[I9 BR-073] its posts are gone, the anonymous one included');
select is(pg_temp.pg(format($q$ select coalesce(shared_post_id::text, 'null') from nestly.posts where id = %L $q$, current_setting('t.share'))), 'null', '[I9 BR-073] B''s share stays, its source unavailable');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.comments where id = %L $q$, current_setting('t.c_gone'))), '0', '[I9 BR-073] D''s comment without replies is gone');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.comments where id in (%L, %L) $q$, current_setting('t.c_self'), current_setting('t.c_self_reply'))), '0',
  '[I9 BR-073] a comment whose only replies are D''s own goes too (no empty "deleted user" row with nothing under it)');
select is(pg_temp.pg(format($q$ select coalesce(user_a::text, 'null') || ',' || coalesce(user_b::text, 'null') from nestly.conversations where id = %L $q$, current_setting('t.conv_dp'))),
  (select case when pg_temp.id('d') < pg_temp.id('p') then 'null,' || pg_temp.id('p')::text else pg_temp.id('p')::text || ',null' end),
  '[I9 BR-073] the conversation with P stays for P, D''s side detached');
select is(pg_temp.pg(format($q$ select coalesce(author_id::text, 'null') || ':' || body || ':' || is_author_deleted::text from nestly.comments where id = %L $q$, current_setting('t.c_kept'))),
  'null::true', '[I9 BR-073 AC-179] D''s replied comment stays as a "deleted user" row: no author, no text');
select is(pg_temp.n('b', format('nestly.comments where id in (%L, %L)', current_setting('t.c_kept'), current_setting('t.c_reply'))), '2', '[I9 BR-073] B reads the row and its reply');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.reaction_owners where user_id = %L $q$, pg_temp.id('d'))), '0', '[I9 BR-073] D''s likes are gone');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.friendships where %L in (requester_id, addressee_id) $q$, pg_temp.id('d'))), '0', '[I9 BR-073] its friendships are gone');
select is(pg_temp.n('b', format('nestly.conversations where id = %L', current_setting('t.conv'))), '1', '[I9 BR-073 AC-180] the conversation stays for B');
select is(pg_temp.fn('b', format($q$ select string_agg(coalesce(sender_id::text, 'deleted') || ':' || body, ',' order by body) from nestly.messages where conversation_id = %L $q$, current_setting('t.conv'))),
  'b0000000-0000-4000-8000-0000000000b2:hi from B,deleted:hi from D', '[I9 BR-073 AC-180] whole: D''s message under "deleted user"');
select is(pg_temp.dml('b', format($q$ insert into nestly.messages (conversation_id, body) values (%L, 'anyone?') $q$, current_setting('t.conv'))), 'ERR:42501', '[I9 BR-073] nobody can send into it');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.legal_consents where user_id = %L $q$, pg_temp.id('d'))), '0', '[I9 ⭐] the consent is gone');
select is(pg_temp.pg(format($q$ select (select count(*) from nestly.support_requests where user_id = %L) + (select count(*) from nestly.notifications where recipient_id = %L)
                                + (select count(*) from nestly.marketplace_listings where owner_id = %L) $q$, pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'))), '0',
  '[I9 BR-073 OP-034] Support requests, notifications and listings are gone');
select is(pg_temp.pg(format($q$ select string_agg(kind || ':' || is_held::text || ':' || coalesce(owner_id::text, 'null'), ',' order by kind) from nestly.media_assets where owner_id is null and byte_size = 100 and width = 10 $q$)),
  'post:true:null,profile:false:null', '[I9 BR-077] its images have no owner (the media job removes the files); the suspected one stays held');
select is(pg_temp.pg(format($q$ select (select count(*) from nestly.security_events where user_id = %L) || ',' || (select count(*) from nestly.recovery_events where user_id = %L)
                                || ',' || (select count(*) from nestly.reports where reporter_id = %L) || ',' || (select count(*) from nestly.user_enforcements where user_id = %L)
                                || ',' || (select count(*) from nestly.audit_log where target_id = %L) $q$, pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'))),
  '1,1,1,1,1', '[I9 BR-073 AC-181] the security, recovery, report, enforcement and Audit records stay (90 days)');
select is(pg_temp.pg(format($q$ select status || ':' || coalesce(reported_user_id::text, 'null') from nestly.reports where id = %L $q$, current_setting('t.rp_on_d'))), 'expired:null',
  '[I9 ⭐] the open report on the account itself expired');
select is(pg_temp.dml('d', $q$ insert into nestly.users (account_type, status) values ('regular', 'active') $q$), 'ERR:42501',
  '[I9 FR-AUTH-002] the deleted identity cannot register again while the Auth user exists');
select is(pg_temp.run(), '0/0/0', '[I9] a second run finds nothing');

-- the 90-day purge (BR-073, §16.4)
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')), 'select nestly.purge_deleted_accounts()::text'), 'ERR:42501', '[I9 rule 6] a client cannot run the purge');
select is(pg_temp.purge(), '0', '[I9 BR-073] before 90 days the purge keeps everything');
select is(pg_temp.dml('adm', format($q$ delete from nestly.audit_log where target_id = %L $q$, pg_temp.id('d'))), 'ERR:42501', '[I9 NFR-AUDIT-001] Audit stays append-only for the Admin');
select tests.fx_rp_set(current_setting('t.rp_by_d')::uuid, 'handled');
select tests.fx_dl_age(pg_temp.id('d'), interval '91 days');
select is(pg_temp.x(format($q$ delete from nestly.audit_log where target_id = %L $q$, pg_temp.id('d'))), 'ERR:42501', '[I9 NFR-AUDIT-001] and for the owner role, past 90 days too');
select is(tests.jobs_dml(format($q$ update nestly.account_deletion_events set auth_removed_at = now() where account_id = %L and kind = 'execute' $q$, pg_temp.id('d'))), 'OK:1',
  'fixture: the job removed D''s Auth user (§22.6; until then the purge keeps the execute row: file 114)');
select is(pg_temp.purge(), '11', '[I9 BR-073 AC-182] 90 days after the execution the kept records and the deletion rows go (5 records, a handled report D made among them, 6 deletion rows)');
select is(pg_temp.pg(format($q$ select (select count(*) from nestly.security_events where user_id = %L) + (select count(*) from nestly.recovery_events where user_id = %L)
                                + (select count(*) from nestly.reports where reporter_id = %L) + (select count(*) from nestly.user_enforcements where user_id = %L)
                                + (select count(*) from nestly.audit_log where target_id = %L) + (select count(*) from nestly.account_deletion_events where account_id = %L) $q$,
                    pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'), pg_temp.id('d'))), '0', '[I9 BR-073 AC-182] nothing of D is left');

-- a request and cancel of a live account: 12 months
select is(pg_temp.request('b') || pg_temp.cancel('b'), 'OK:1OK:1', 'fixture: B requests and cancels');
select tests.fx_dl_age(pg_temp.id('b'), interval '11 months');
select is(pg_temp.purge(), '0', '[I9 §16.4] a cancel of a live account stays 12 months');
select tests.fx_dl_age(pg_temp.id('b'), interval '2 months');
select is(pg_temp.purge(), '2', '[I9 §16.4] and then goes');

-- a Professional (BR-073: profile, posts, reviews of them go)
select set_config('t.pp', tests.fx_po_add(pg_temp.id('p'))::text, true);
select set_config('t.pay', pg_temp.pg(format($q$ insert into nestly.promotion_payments (payer_id, plan_key, target_kind, amount_ils) select %L, key, target_kind, 10 from nestly.promotion_plans where is_active order by key, target_kind limit 1 returning id::text $q$, pg_temp.id('p'))), true);
select is(pg_temp.x(format($q$ insert into nestly.professional_articles (author_id, title, body, field) values (%L, 'Sleep tips', 'Short nights pass.', 'sleep') $q$, pg_temp.id('p'))), 'OK:1', 'fixture: an article of P');
select is(pg_temp.request('p'), 'OK:1', '[I9 FR-SET-002] a Professional schedules its deletion');
select is(pg_temp.n('b', format('nestly.professional_profiles where user_id = %L', pg_temp.id('p'))), '0', '[I9 AC-108] its profile is hidden');
select is(pg_temp.x(format($q$ insert into nestly.user_enforcements (user_id, actor_id, kind, reason) values (%L, %L, 'warning', 'rude') $q$, pg_temp.id('p'), pg_temp.id('adm'))), 'OK:1',
  '[I9] staff can still warn a scheduled account (the warning outlives a cancel)');
select tests.fx_dl_due(pg_temp.id('p'), interval '31 days');
select set_config('t.rp_listing', pg_temp.pg(format($q$ insert into nestly.reports (reporter_id, target_kind, article_id, reason)
                                                         select %L, 'article', a.id, 'spam' from nestly.professional_articles a where a.author_id = %L returning id::text $q$, pg_temp.id('b'), pg_temp.id('p'))), true);
select is(pg_temp.run(), '0/1/0', '[I9 BR-080] an open report on P''s article holds the deletion (not only posts and comments; listings, reviews and one-sided conversations alike)');
select tests.fx_rp_set(current_setting('t.rp_listing')::uuid, 'handled');
select is(pg_temp.run(), '1/0/0', '[I9 BR-073] and it is executed at the due date');
select is(pg_temp.pg(format($q$ select count(*)::text from nestly.conversations where id = %L $q$, current_setting('t.conv_dp'))), '0',
  '[I9 BR-073] the conversation whose other side (D) was deleted before goes with P (no conversation with nobody in it)');
select is(pg_temp.pg(format($q$ select (select count(*) from nestly.professional_profiles where user_id = %L) + (select count(*) from nestly.posts where id = %L) $q$, pg_temp.id('p'), current_setting('t.pp'))), '0',
  '[I9 BR-073] its profile and posts are gone');
select is(pg_temp.pg(format($q$ select coalesce(payer_id::text, 'null') from nestly.promotion_payments where id = %L $q$, current_setting('t.pay'))), 'null', '[I9 §13.4] its payment stays, without identity');

select * from finish();
rollback;
