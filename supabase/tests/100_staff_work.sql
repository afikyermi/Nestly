-- pgTAP, run by pg_prove as app_server (CI `db` job, I14 completion: Afik's staff decisions of 21.10.2026, decisions-in-force.md §9.1, §9.2,
-- §9.4, §9.7, §9.9, §9.10). Expected values come from those decisions and the SRS (FR-ADMIN-004, FR-ADMIN-010, FR-MOD-003, BR-040, BR-058,
-- BR-062, AC-077), not the migration text.
-- People: a, b = Regular (10_), p = Professional, c = fr_c, e = gr_e, f = gr_f (Regular), d = fr_d (Admin), m0 = fr_m (Moderator, no key),
-- m1 = sf_m1 (REPORTS_VIEW only), m2 = sf_m2 (REPORTS_VIEW + PRIVATE_GROUP_MODERATE + CONTENT_MODERATE), m3 = sf_m3 (every assignable key but
-- CHILD_DATA_VIEW), m4 = sf_m4 (CHILD_DATA_VIEW only), m5 = sf_m5 (REPORTS_VIEW + CONTENT_MODERATE, no PRIVATE_GROUP_MODERATE),
-- u1 = sw_p01 (one of the fixture's parents: ten girls of ten families, nine boys of nine, ten 'unknown' children of one family, a banned
-- parent's girl), n1 = sw_n1 (an Auth account with no Nestly row).
-- Everything rolls back with the transaction (so every staff view shares this one transaction id: the "before" checks come first).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F14.2-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_gr_build();
select tests.fx_sw_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'p' then tests.fx_id('p')
    when 'c' then tests.fx_fr_id('fr_c') when 'm0' then tests.fx_fr_id('fr_m') when 'd' then tests.fx_fr_id('fr_d')
    when 'e' then tests.fx_gr_id('gr_e') when 'f' then tests.fx_gr_id('gr_f')
    when 'm1' then tests.fx_sf_id('sf_m1') when 'm2' then tests.fx_sf_id('sf_m2') when 'm3' then tests.fx_sf_id('sf_m3')
    when 'm4' then tests.fx_sf_id('sf_m4') when 'm5' then tests.fx_sf_id('sf_m5')
    when 'u1' then tests.fx_sw_id('sw_p01') when 'n1' then tests.fx_sw_id('sw_n1')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.staff(p_who text, p_sql text) returns text language sql as $f$
  select tests.fn_staff(tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.staff_dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_staff(tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.g(p_key text) returns uuid language sql as $f$ select current_setting('t.' || p_key)::uuid $f$;
-- catalog lookups by name (app_server has no USAGE on schema nestly, so no regclass cast)
create function pg_temp.toid(p_t text) returns oid language sql as $f$
  select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = p_t
$f$;
create function pg_temp.colpriv(p_role text, p_t text, p_col text, p_priv text) returns boolean language sql as $f$
  select has_column_privilege(p_role, pg_temp.toid(p_t), (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = pg_temp.toid(p_t) and a.attname = p_col), p_priv)
$f$;
-- I14 completion B (OP-056): calendar periods. The fixture's events are two and three days old: the first calendar period (this or last month,
-- this or last week) that holds both days; NULL on the rare day none does (then the period-bound assertions below are skipped as passed).
create function pg_temp.per() returns text language sql as $f$
  select case
    when date_trunc('month', l.d - 3) = date_trunc('month', l.d) then 'this_month'
    when date_trunc('month', l.d - 2) = date_trunc('month', l.d - 3) then 'last_month'
    when l.d - 3 >= l.d - extract(dow from l.d)::int then 'this_week'
    when l.d - 2 < l.d - extract(dow from l.d)::int then 'last_week' end
  from (select (now() at time zone 'Asia/Jerusalem')::date as d) l
$f$;
create function pg_temp.trends(p_who text, p_metric text, p_field text, p_dim text, p_period text default '') returns text language sql as $f$
  select pg_temp.q(p_who, format($q$ select coalesce(string_agg(bucket || '=' || coalesce(children::text, '-') || ':' || coalesce(value::text, '-') || ':' || is_suppressed::text,
    ' ' order by bucket_order), 'none') from nestly.child_tracker_trends(%L, %L, %L, %L) $q$, p_metric, p_field, p_dim, case when p_period = '' then coalesce(pg_temp.per(), 'this_month') else p_period end))
$f$;

select tests.fx_sf_grant(pg_temp.id('m1'), array['REPORTS_VIEW']);
select tests.fx_sf_grant(pg_temp.id('m2'), array['REPORTS_VIEW', 'PRIVATE_GROUP_MODERATE', 'CONTENT_MODERATE']);
select tests.fx_sf_grant(pg_temp.id('m3'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW',
  'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS', 'PRIVATE_GROUP_MODERATE']);
select tests.fx_sf_grant(pg_temp.id('m5'), array['REPORTS_VIEW', 'CONTENT_MODERATE']);

-- ---- c1: structure --------------------------------------------------------------------------------------------------------------
select is((select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ' order by c.relname)
             from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname in ('report_escalations', 'report_openings')),
  'report_escalations:true:true, report_openings:true:true', '[F14.2-a c1 rule 8] the two new tables carry RLS and FORCE');
select is((select string_agg(p.polname || ':' || p.polcmd::text || ':' || p.polpermissive::text, ', ' order by p.polname)
             from pg_catalog.pg_policy p where p.polrelid in (pg_temp.toid('report_escalations'), pg_temp.toid('report_openings'))),
  'report_escalations_insert_moderator:a:true, report_escalations_select_staff:r:true, report_openings_insert_staff:a:true, report_openings_select_staff:r:true',
  '[F14.2-a c1] exactly a read and a write policy each: no UPDATE, no DELETE');
select is(has_table_privilege('authenticated', pg_temp.toid('report_escalations'), 'UPDATE') or has_table_privilege('authenticated', pg_temp.toid('report_escalations'), 'DELETE')
  or has_table_privilege('authenticated', pg_temp.toid('report_openings'), 'UPDATE') or has_table_privilege('authenticated', pg_temp.toid('report_openings'), 'DELETE'),
  false, '[F14.2-a c1] authenticated holds no UPDATE or DELETE on them');
select is(pg_temp.colpriv('authenticated', 'report_escalations', 'note', 'INSERT') and pg_temp.colpriv('authenticated', 'report_escalations', 'report_id', 'INSERT')
  and not pg_temp.colpriv('authenticated', 'report_escalations', 'escalated_by', 'INSERT') and not pg_temp.colpriv('authenticated', 'report_escalations', 'created_at', 'INSERT')
  and pg_temp.colpriv('authenticated', 'report_openings', 'report_id', 'INSERT') and not pg_temp.colpriv('authenticated', 'report_openings', 'opened_by', 'INSERT')
  and not pg_temp.colpriv('authenticated', 'report_openings', 'opened_at', 'INSERT'),
  true, '[F14.2-a c1 rules 12-13] INSERT per column: only what the client fills; who and when are the database''s');
select is(has_any_column_privilege('anon', pg_temp.toid('report_escalations'), 'SELECT,INSERT') or has_any_column_privilege('anon', pg_temp.toid('report_openings'), 'SELECT,INSERT'),
  false, '[F14.2-a c1 rule 7] anon holds nothing on them');
select is((select p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' || pg_catalog.pg_get_function_result(p.oid)
             from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'child_tracker_trends' and pg_catalog.pg_get_function_identity_arguments(p.oid) like '%p_period text'),
  'true:search_path="":TABLE(bucket text, bucket_order integer, children integer, value numeric, is_suppressed boolean)',
  '[F14.2-a c1 §9.2] child_tracker_trends is SECURITY DEFINER with a pinned search_path and returns cells only: bucket, order, children, value, suppressed (no row-level output)');
select is((select has_function_privilege('anon', p.oid, 'EXECUTE')::text || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
             from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'child_tracker_trends' and pg_catalog.pg_get_function_identity_arguments(p.oid) like '%p_period text'),
  'false:true', '[F14.2-a c1] executable by authenticated only (the function checks the key itself)');
select is((select string_agg(p.polname || ':' || pg_catalog.array_to_string(array(select r.rolname from pg_catalog.pg_roles r where r.oid = any (p.polroles) order by 1), ','), ', ' order by p.polname)
             from pg_catalog.pg_policy p where p.polname in ('tracker_events_select_child_data', 'children_select_child_data', 'users_select_child_data')),
  'children_select_child_data:app_owner, tracker_events_select_child_data:app_owner, users_select_child_data:app_owner',
  '[F14.2-a c1 §9.2] the tracker, children and account-status reads exist only for the owner role');
select is((select count(*) from pg_catalog.pg_policy p where p.polname like '%\_select\_child\_data'
             and pg_catalog.pg_get_expr(p.polqual, p.polrelid) ~ 'child_data_scope' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) ~ 'trend_scopes' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) ~ 'CHILD_DATA_VIEW'), 3::bigint,
  '[F14.2-a c1 §9.2] each opens only while the scope is named, and only for a caller holding CHILD_DATA_VIEW');

-- ---- c2: the invitation lasts 48 hours and its use is recorded (FR-ADMIN-004, §9.1) --------------------------------------------
select set_config('t.h1', repeat('9', 64), true);
select is(pg_temp.dml('d', format($q$ insert into nestly.moderator_invitations (code_hash, note) values (%L, 'נועה לוי') $q$, current_setting('t.h1'))), 'OK:1',
  '[F14.2-a c2 FR-ADMIN-004] the Admin issues an invitation');
select is(pg_temp.staff('d', format($q$ select (extract(epoch from expires_at - created_at) / 3600)::int::text from nestly.moderator_invitations where code_hash = %L $q$, current_setting('t.h1'))), '48',
  '[F14.2-a c2 §9.1] it is valid 48 hours from issue');
create function pg_temp.inv(p_who text, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.moderator_invite', current_setting('t.h1'), true);
  v := pg_temp.dml(p_who, p_sql);
  perform set_config('nestly.moderator_invite', '', true);
  return v;
end
$f$;
select is(pg_temp.inv('n1', format($q$ update nestly.moderator_invitations set accepted_by = %L where code_hash = %L $q$, pg_temp.id('n1'), current_setting('t.h1'))), 'OK:1',
  '[F14.2-a c2] control: the holder marks it');
select is(pg_temp.inv('n1', $$ insert into nestly.users (account_type, status) values ('moderator', 'active') $$), 'OK:1', '[F14.2-a c2] control: and becomes a Moderator');
select is(tests.fx_sw_audit_after('moderator_joined') ->> 'invitationId' is not null, true, '[F14.2-a c2 §9.1 BR-026] the joining entry names the invitation it used');

-- ---- c3: CHILD_DATA_VIEW, a key of its own (§9.2) --------------------------------------------------------------------------------
select is(pg_temp.dml('d', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'CHILD_DATA_VIEW') $q$, pg_temp.id('m4'))), 'OK:1',
  '[F14.2-a c3 §9.2] the Admin grants CHILD_DATA_VIEW to a Moderator');
select is(pg_temp.dml('m3', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'CHILD_DATA_VIEW') $q$, pg_temp.id('m3'))), 'ERR:42501',
  '[F14.2-a c3 BR-027] a Moderator never grants it (not even to itself)');
select is(pg_temp.q('m3', $$ select nestly.has_permission('CHILD_DATA_VIEW')::text $$), 'false',
  '[F14.2-a c3 §9.2] ANALYTICS_VIEW (and every other key) does not include it');
select is(pg_temp.q('m4', $$ select nestly.has_permission('CHILD_DATA_VIEW')::text || nestly.has_permission('ANALYTICS_VIEW')::text $$), 'truefalse',
  '[F14.2-a c3] it opens on its own, and opens nothing else');
select is(pg_temp.q('d', $$ select nestly.has_permission('CHILD_DATA_VIEW')::text $$), 'true', '[F14.2-a c3] the Admin always holds it');
select is(pg_temp.dml('d', format($q$ insert into nestly.moderator_permissions (user_id, permission_key) values (%L, 'SENSITIVE_DATA_FULL_ACCESS') $q$, pg_temp.id('m4'))), 'ERR:23514',
  '[F14.2-a c3 BR-025] the Admin-only keys still cannot be assigned');

-- ---- c4: children's tracker data, trends only (§9.2) -----------------------------------------------------------------------------
select is(pg_temp.trends('a', 'bottle', 'amount_ml', 'child_sex'), 'ERR:42501', '[F14.2-a c4 §9.2] a parent is refused');
select is(pg_temp.trends('m0', 'bottle', 'amount_ml', 'child_sex'), 'ERR:42501', '[F14.2-a c4] a Moderator with no key is refused');
select is(pg_temp.trends('m3', 'bottle', 'amount_ml', 'child_sex'), 'ERR:42501', '[F14.2-a c4 §9.2] ANALYTICS_VIEW and every other key are refused');
select is(tests.fx_sf_audit('child_data_queried'), 0::bigint, '[F14.2-a c4] a refused call leaves no entry (nothing was read)');
select is(case when pg_temp.per() is null then 'girl=10:125.0:false boy=-:-:true unknown=-:-:true' else pg_temp.trends('m4', 'bottle', 'amount_ml', 'child_sex') end, 'girl=10:125.0:false boy=-:-:true unknown=-:-:true',
  '[F14.2-a c4 §9.2 OP-052] CHILD_DATA_VIEW gets the average per cell: ten girls of ten families shown (the banned parent''s girl not counted); nine boys suppressed (k>=10), and ten children of one family too, with no number at all');
select is(tests.fx_sf_audit('child_data_queried'), 1::bigint, '[F14.2-a c4 §9.2] the query is in the Audit Log');
select is(tests.fx_sw_audit_row('child_data_queried'), 'CHILD_DATA_VIEW|child_data|-|-', '[F14.2-a c4] under CHILD_DATA_VIEW, naming no person');
select is(tests.fx_sw_audit_after('child_data_queried') - 'cells', ('{"field": "amount_ml", "metric": "bottle", "dimension": "child_sex"}'::jsonb || jsonb_build_object('period', coalesce(pg_temp.per(), 'this_month'))),
  '[F14.2-a c4] the entry records the question asked');
select is(case when pg_temp.per() is null then 'girl=10:1.0:false boy=-:-:true unknown=-:-:true' else pg_temp.trends('m4', 'bottle', 'events_per_day', 'child_sex') end, 'girl=10:1.0:false boy=-:-:true unknown=-:-:true',
  '[F14.2-a c4] events per child-day: two events on two days is one a day');
select is(case when pg_temp.per() is null then '0-2=-:-:true 3-5=-:-:true 6-11=30:122.4:false 12-23=-:-:true 24-59=-:-:true 60+=-:-:true' else pg_temp.trends('d', 'bottle', 'amount_ml', 'child_age') end, '0-2=-:-:true 3-5=-:-:true 6-11=30:122.4:false 12-23=-:-:true 24-59=-:-:true 60+=-:-:true',
  '[F14.2-a c4] the Admin may too; by age, the twenty-nine children of nine months share one cell (shown as 30, rounded to the nearest 10: completion B), each child counted once (the average of their own averages; every bucket listed, the empty ones suppressed)');
select is(case when pg_temp.per() is null then 'girl=-:-:true boy=-:-:true unknown=-:-:true' else pg_temp.trends('m4', 'medicine', 'events_per_day', 'child_sex') end, 'girl=-:-:true boy=-:-:true unknown=-:-:true',
  '[F14.2-a c4 §9.2] one child''s medicine is a cell of one: suppressed (and no medicine name exists in the answer''s shape)');
select is(tests.fx_sf_audit('child_data_queried'), 4::bigint, '[F14.2-a c4 §9.2] every query is recorded, the all-suppressed one too');
select is(pg_temp.trends('m4', 'bottle', 'amount_ml', 'week'), 'ERR:22023', '[F14.2-a c4 · I14c-B OP-056] a week split is no longer offered (its cells overlapped the periods)');
select is(pg_temp.q('m4', $$ select count(*)::text from nestly.child_tracker_trends('bottle', 'amount_ml', 'child_age', 'last_week') $$)::int, 6,
  '[F14.2-a c4] the weeks of the period, one row each, whatever the number of children (no row-level output)');
select is(pg_temp.trends('m4', 'sleepy', 'events_per_day', 'child_sex'), 'ERR:22023', '[F14.2-a c4 §9.2] a metric outside the list is refused');
select is(pg_temp.trends('m4', 'sleep', 'amount_ml', 'child_sex'), 'ERR:22023', '[F14.2-a c4] a field that does not belong to the metric is refused');
select is(pg_temp.trends('m4', 'medicine', 'name', 'child_sex'), 'ERR:22023', '[F14.2-a c4] a free-text field is never a field');
select is(pg_temp.trends('m4', 'bottle', 'amount_ml', 'child_id'), 'ERR:22023', '[F14.2-a c4] a dimension outside the list is refused (never per child)');
select is(pg_temp.trends('m4', 'bottle', 'amount_ml', 'child_sex', '30'), 'ERR:22023', '[F14.2-a c4 · I14c-B OP-056] a period outside the calendar list (this or last week or month) is refused');
select is(pg_temp.trends('m4', null, 'amount_ml', 'child_sex'), 'ERR:22023', '[F14.2-a c4] and a missing choice');
create function pg_temp.scoped(p_who text, p_rel text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.child_data_scope', 'on', true);
  v := pg_temp.q(p_who, 'select count(*)::text from ' || p_rel);
  perform set_config('nestly.child_data_scope', '', true);
  return v;
end
$f$;
select is(pg_temp.scoped('m4', 'nestly.tracker_events') || '/' || pg_temp.scoped('m4', 'nestly.children') || '/' || pg_temp.scoped('d', 'nestly.tracker_events'), '0/0/0',
  '[F14.2-a c4 §9.2] naming the scope opens nothing to a runtime role: only the function reads rows');
select is(has_any_column_privilege('authenticated', pg_temp.toid('trend_scopes'), 'SELECT,INSERT,UPDATE') or has_any_column_privilege('anon', pg_temp.toid('trend_scopes'), 'SELECT,INSERT,UPDATE'),
  false, '[F14.2-a c4 §9.2] no runtime role reads or writes the call scopes: a caller cannot make a nonce the policies would accept');
select is(tests.fx_sw_count('nestly.trend_scopes'), 0::bigint, '[F14.2-a c4 §9.2] each call deletes its scope again: none is left open in the transaction');
select is(pg_temp.per() is null or pg_temp.trends('m4', 'bottle', 'amount_ml', 'child_sex') = 'girl=10:125.0:false boy=-:-:true unknown=-:-:true', true,
  '[F14.2-a c4] control: a scope the caller set beforehand changes nothing for the function');
-- the bypass attempt: a CHILD_DATA_VIEW holder names a scope (a guess, and 'on') and reaches another definer that reads children
create function pg_temp.scoped_view(p_who text, p_scope text, p_target uuid) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.child_data_scope', p_scope, true);
  v := pg_temp.q(p_who, format($q$ select coalesce(string_agg(outcome || ':' || coalesce(children_count::text, '-'), ','), 'none') from nestly.profile_view(%L) $q$, p_target));
  perform set_config('nestly.child_data_scope', '', true);
  return v;
end
$f$;
select is(pg_temp.scoped_view('m4', 'on', tests.fx_sw_id('sw_p20')) = pg_temp.scoped_view('m4', '', tests.fx_sw_id('sw_p20')), true,
  '[F14.2-a c4 §9.2] another definer reads the same with or without a scope the caller named (the child-data reads stay closed to it)');
select is(pg_temp.scoped_view('m4', gen_random_uuid()::text, tests.fx_sw_id('sw_p20')) = pg_temp.scoped_view('m4', '', tests.fx_sw_id('sw_p20')), true,
  '[F14.2-a c4 §9.2] and a guessed nonce changes nothing either');
select is(pg_temp.q('u1', 'select count(*)::text from nestly.tracker_events'), '3', '[F14.2-a c4] control: the parent still reads their own events');

-- ---- c5: the report's context (§9.7) ---------------------------------------------------------------------------------------------
select set_config('t.pp', pg_temp.q('a', $$ insert into nestly.posts (audience, body) values ('everyone', 'context post') returning id::text $$), true);
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('c'), 'accepted');
select set_config('t.fp', pg_temp.q('a', $$ insert into nestly.posts (audience, body) values ('friends', 'friends only') returning id::text $$), true);
select set_config('t.fc1', pg_temp.q('c', format($q$ insert into nestly.comments (post_id, body) values (%L, 'friend comment') returning id::text $q$, pg_temp.g('fp'))), true);
select set_config('t.fc2', pg_temp.q('a', format($q$ insert into nestly.comments (post_id, body) values (%L, 'author reply') returning id::text $q$, pg_temp.g('fp'))), true);
select is(pg_temp.staff('m0', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('fp')))
       || '/' || pg_temp.staff('m0', format($q$ select count(*)::text from nestly.comments where post_id = %L $q$, pg_temp.g('fp'))), '1/2',
  '[F14.2-a c5 §9.7] independent review: every staff account, even with no key, reads an active Friends-only post and its comments');
select is(pg_temp.q('e', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('fp'))), '0',
  '[F14.2-a c5] and nothing changes for a community user who is no Friend');
select set_config('t.rc', tests.fx_rp_add(pg_temp.id('a'), 'comment', pg_temp.g('fc1'))::text, true);
select is(pg_temp.staff('m1', format($q$ select (thread_post_id = %L)::text from nestly.reports where id = %L $q$, pg_temp.g('fp'), pg_temp.g('rc'))), 'true',
  '[F14.2-a c5 §9.7] a comment report records the comment''s post (its thread, for a Private Group''s audited opening)');
-- ---- c6: Private Group content: the reveal and the context (§9.4, §9.7, BR-040) -------------------------------------------------
select set_config('t.priv', pg_temp.q('p', $$ insert into nestly.groups (name, description, privacy) values ('Night feeds', 'about us', 'private') returning id::text $$), true);
-- membership through the Owner's approval of a join request (the I10 path)
select is(pg_temp.dml('b', format($q$ insert into nestly.group_join_requests (group_id) values (%L) $q$, pg_temp.g('priv'))) ~ '^OK', true, '[F14.2-a c6] control: B asks to join');
select is(pg_temp.dml('p', format($q$ update nestly.group_join_requests set status = 'approved' where group_id = %L and user_id = %L and status = 'pending' $q$,
  pg_temp.g('priv'), pg_temp.id('b'))), 'OK:1', '[F14.2-a c6] control: the Owner approves');
select set_config('t.anon', pg_temp.q('b', format($q$ insert into nestly.posts (audience, body, group_id, is_anonymous) values ('everyone', 'anonymous here', %L, true) returning id::text $q$,
  pg_temp.g('priv'))), true);
select set_config('t.gc1', pg_temp.q('p', format($q$ insert into nestly.comments (post_id, body) values (%L, 'owner reply') returning id::text $q$, pg_temp.g('anon'))), true);
select set_config('t.gc2', pg_temp.q('b', format($q$ insert into nestly.comments (post_id, body) values (%L, 'member reply') returning id::text $q$, pg_temp.g('anon'))), true);
select set_config('t.rpg', tests.fx_rp_add(pg_temp.id('b'), 'comment', pg_temp.g('gc1'))::text, true);
select set_config('t.rpa', tests.fx_rp_add(pg_temp.id('p'), 'post', pg_temp.g('anon'))::text, true);
select is(pg_temp.staff('m5', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon'))), 'ERR:42501',
  '[F14.2-a c6 §9.4 BR-040] without PRIVATE_GROUP_MODERATE no one reveals the author of Private Group content');
select is(tests.fx_sf_audit('author_revealed'), 0::bigint, '[F14.2-a c6] (and nothing was recorded)');
select is(pg_temp.staff('m2', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('anon')))
       || '/' || pg_temp.staff('m2', format($q$ select count(*)::text from nestly.comments where post_id = %L $q$, pg_temp.g('anon'))), '0/0',
  '[F14.2-a c6 BR-040] before the audited opening, staff read nothing of the Group');
select is(pg_temp.staff('m2', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon'))), pg_temp.id('b')::text,
  '[F14.2-a c6 §9.4 AC-077] a Moderator with PRIVATE_GROUP_MODERATE (and REPORTS_VIEW, CONTENT_MODERATE) reveals it while the report is open');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'author_revealed' and target_id = %L and permission_key = 'PRIVATE_GROUP_MODERATE' and after_state ->> 'privateGroup' = 'true'$q$, pg_temp.g('anon'))) > 0, true, '[F14.2-a c6 BR-062] recorded under PRIVATE_GROUP_MODERATE, marked as Private Group content');
select is(pg_temp.staff('d', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon'))), pg_temp.id('b')::text,
  '[F14.2-a c6 §9.4] the Admin too');
select is(pg_temp.staff_dml('m2', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rpg'))), 'OK:1',
  '[F14.2-a c6 §9.7] the Moderator opens the reported comment through the audited view');
select is(pg_temp.staff('m2', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('anon')))
       || '/' || pg_temp.staff('m2', format($q$ select count(*)::text from nestly.comments where post_id = %L $q$, pg_temp.g('anon'))), '1/2',
  '[F14.2-a c6 §9.7] inside that transaction it reads the comment''s post and the whole thread');
select is(pg_temp.staff('m1', format($q$ select count(*)::text from nestly.comments where post_id = %L $q$, pg_temp.g('anon'))), '0',
  '[F14.2-a c6 BR-040] another staff member, without its own opening, reads none of it');

-- a post reported while its Group was Public, and the Group made Private since: the reveal follows the Group as it is now
select set_config('t.pub', pg_temp.q('p', $$ insert into nestly.groups (name, description, privacy) values ('Open mornings', 'about us', 'public') returning id::text $$), true);
select is(pg_temp.dml('e', format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g('pub'))), 'OK:1', '[F14.2-a c6] control: E joins the Public Group');
select set_config('t.anon2', pg_temp.q('e', format($q$ insert into nestly.posts (audience, body, group_id, is_anonymous) values ('everyone', 'anonymous, public then', %L, true) returning id::text $q$,
  pg_temp.g('pub'))), true);
select ok(tests.fx_rp_add(pg_temp.id('p'), 'post', pg_temp.g('anon2')) is not null, '[F14.2-a c6] control: the Owner reports it while the Group is Public');
select is(pg_temp.dml('p', format($q$ update nestly.groups set privacy = 'private' where id = %L $q$, pg_temp.g('pub'))), 'OK:1', '[F14.2-a c6] control: the Owner makes the Group Private');
select is(pg_temp.staff('m5', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon2'))), 'ERR:42501',
  '[F14.2-a c6 §9.4 BR-040] the content is Private Group content now: without PRIVATE_GROUP_MODERATE no reveal');
select is(pg_temp.staff('m2', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon2'))), pg_temp.id('e')::text,
  '[F14.2-a c6 §9.4] with it, the reveal works');
-- AC-077 regression guard: outside a Private Group, REPORTS_VIEW + CONTENT_MODERATE reveals, audited under CONTENT_MODERATE
select set_config('t.anon3', pg_temp.q('a', $$ insert into nestly.posts (audience, body, is_anonymous) values ('everyone', 'anonymous, no group', true) returning id::text $$), true);
select ok(tests.fx_rp_add(pg_temp.id('b'), 'post', pg_temp.g('anon3')) is not null, '[F14.2-a c6] control: B reports an anonymous post outside any Group');
select is(pg_temp.staff('m5', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon3'))), pg_temp.id('a')::text,
  '[F14.2-a c6 AC-077] a Moderator with REPORTS_VIEW and CONTENT_MODERATE reveals an anonymous author outside any Group');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'author_revealed' and target_id = %L and permission_key = 'CONTENT_MODERATE' and after_state ->> 'privateGroup' = 'false'$q$, pg_temp.g('anon3'))) > 0, true, '[F14.2-a c6 AC-077] recorded under CONTENT_MODERATE, not as Private Group content');
select set_config('t.pub3', pg_temp.q('p', $$ insert into nestly.groups (name, description, privacy) values ('Open evenings', 'about us', 'public') returning id::text $$), true);
select is(pg_temp.dml('e', format($q$ insert into nestly.group_members (group_id) values (%L) $q$, pg_temp.g('pub3'))), 'OK:1', '[F14.2-a c6] control: E joins a Public Group');
select set_config('t.anon4', pg_temp.q('e', format($q$ insert into nestly.posts (audience, body, group_id, is_anonymous) values ('everyone', 'anonymous, public group', %L, true) returning id::text $q$,
  pg_temp.g('pub3'))), true);
select ok(tests.fx_rp_add(pg_temp.id('p'), 'post', pg_temp.g('anon4')) is not null, '[F14.2-a c6] control: the Owner reports it');
select is(pg_temp.staff('m5', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon4'))), pg_temp.id('e')::text,
  '[F14.2-a c6 AC-077] and in a Public Group');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'author_revealed' and target_id = %L and permission_key = 'CONTENT_MODERATE' and after_state ->> 'privateGroup' = 'false'$q$, pg_temp.g('anon4'))) > 0, true, '[F14.2-a c6 AC-077] recorded under CONTENT_MODERATE');
select is(pg_temp.staff('d', format($q$ select user_id::text from nestly.reveal_post_author(%L) $q$, pg_temp.g('anon3'))), pg_temp.id('a')::text,
  '[F14.2-a c6] the Admin too');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'author_revealed' and target_id = %L and permission_key = 'CONTENT_MODERATE'$q$, pg_temp.g('anon3'))), 2::bigint, '[F14.2-a c6] audited as not Private Group content (both reveals of it)');

-- every staff decision on an image feeds the training set, Private Groups included (§9.7; never after a child-safety report)
select set_config('t.gp', pg_temp.q('b', format($q$ insert into nestly.posts (audience, body, group_id) values ('everyone', 'with a photo', %L) returning id::text $q$,
  pg_temp.g('priv'))), true);
select set_config('t.img', pg_temp.q('b', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/webp', 800, 600, 120000) returning id::text $$), true);
select is(pg_temp.dml('b', format($q$ update nestly.media_assets set post_id = %L, position = 0 where id = %L $q$, pg_temp.g('gp'), pg_temp.g('img')))
       || tests.media_dml(format($q$ update nestly.media_assets set status = 'passed' where id = %L $q$, pg_temp.g('img'))), 'OK:1OK:1',
  '[F14.2-a c6] control: a member''s Private Group post with an image the check passed');
select set_config('t.rimg', tests.fx_rp_add(pg_temp.id('p'), 'post', pg_temp.g('gp'), 'sexual_violent_hateful')::text, true);
select is(pg_temp.staff_dml('m2', format($q$ insert into nestly.private_group_content_views (report_id) values (%L) $q$, pg_temp.g('rimg')))
       || pg_temp.dml('m2', format($q$ with s as (select set_config('nestly.audit_reason', 'nudity', true)) update nestly.posts t set status = 'removed' from s where t.id = %L $q$,
            pg_temp.g('gp'))), 'OK:1OK:1', '[F14.2-a c6] the Moderator opens it and removes the post');
select is(pg_temp.dml('m2', format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where id = %L $q$, pg_temp.g('rimg'))), 'OK:1',
  '[F14.2-a c6] and closes the report with action taken');
select is(tests.media_as(format($q$ select count(*)::text from nestly.media_training_candidates where media_id = %L $q$, pg_temp.g('img'))), '1',
  '[F14.2-a c6 §9.7] the image of a Private Group post removed after a report becomes a training candidate');

-- ---- c7: staff take no part in the community (§9.7, BR-016, BR-034) --------------------------------------------------------------
select is(pg_temp.dml(x.who, format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'spam') $q$, pg_temp.g('pp'))), 'ERR:42501',
  '[F14.2-a c7 §9.7] ' || x.who || ' files no report')
  from (values ('d'), ('m3'), ('m2')) x(who);
select is(pg_temp.dml('e', format($q$ insert into nestly.reports (target_kind, post_id, reason) values ('post', %L, 'spam') $q$, pg_temp.g('pp'))), 'OK:1',
  '[F14.2-a c7] control: a parent still reports');
select is(pg_temp.dml(x.who, x.stmt), 'ERR:42501', '[F14.2-a c7 §9.7] ' || x.who || ' never ' || x.what)
  from (values ('d'), ('m3')) w(who)
  cross join lateral (values
    (w.who, 'posts', format($q$ insert into nestly.posts (audience, body) values ('everyone', 'staff post') $q$)),
    (w.who, 'comments', format($q$ insert into nestly.comments (post_id, body) values (%L, 'staff comment') $q$, pg_temp.g('pp'))),
    (w.who, 'likes', format($q$ insert into nestly.reactions (post_id) values (%L) $q$, pg_temp.g('pp'))),
    (w.who, 'sends a message request', format($q$ insert into nestly.chat_requests (target_id, target_account_type, opening_message) values (%L, 'regular', 'hi') $q$, pg_temp.id('a'))),
    (w.who, 'creates a group', $q$ insert into nestly.groups (name, description, privacy) values ('Staff group', 'x', 'public') $q$),
    (w.who, 'asks to join a group', format($q$ insert into nestly.group_join_requests (group_id) values (%L) $q$, pg_temp.g('priv'))),
    (w.who, 'writes to Support', $q$ insert into nestly.support_requests (topic, body) values ('other', 'hi') $q$),
    (w.who, 'follows a Professional', format($q$ insert into nestly.professional_follows (professional_id) values (%L) $q$, pg_temp.id('p'))),
    (w.who, 'blocks a user', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('a'))),
    (w.who, 'uploads an image', $q$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/jpeg', 10, 10, 100) $q$)
  ) x(who, what, stmt);
select is(pg_temp.dml(x.who, format($q$ insert into nestly.friendships (addressee_id) values (%L) $q$, pg_temp.id('a'))) ~ '^ERR:(42501|23503)$', true,
  '[F14.2-a c7 §9.7] ' || x.who || ' never sends a Friend Request (a staff account has no profile to befriend from)')
  from (values ('d'), ('m3')) x(who);

-- ---- c8: escalation to the Admin (§9.9) ------------------------------------------------------------------------------------------
create function pg_temp.esc(p_who text, p_report text, p_note text default 'נדרשת החלטה של המנהל') returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.report_escalations (report_id, note) values (%L, %L) $q$, pg_temp.g(p_report), p_note))
$f$;
select is(pg_temp.esc('a', 'rc'), 'ERR:42501', '[F14.2-a c8] a parent escalates nothing');
select is(pg_temp.esc('m0', 'rc'), 'ERR:42501', '[F14.2-a c8] a Moderator without REPORTS_VIEW is refused');
select is(pg_temp.esc('d', 'rc'), 'ERR:42501', '[F14.2-a c8 §9.9] the Admin, to whom it goes, does not escalate');
select is(pg_temp.esc('m1', 'rc', 'x'), 'ERR:23514', '[F14.2-a c8] a note of 2-500 characters');
select is(tests.fx_sf_audit('report_escalated'), 0::bigint, '[F14.2-a c8] (nothing recorded yet)');
select is(pg_temp.esc('m1', 'rc'), 'OK:1', '[F14.2-a c8 §9.9] a Moderator with REPORTS_VIEW escalates an open report to the Admin, with a note');
select is(tests.fx_sw_audit_row('report_escalated'), 'REPORTS_VIEW|report|' || pg_temp.g('rc')::text || '|נדרשת החלטה של המנהל',
  '[F14.2-a c8 BR-026] the escalation is in the Audit Log, its note as the reason');
select is(pg_temp.esc('m3', 'rc', 'עוד הערה'), 'OK:1', '[F14.2-a c8 §9.9] an open report may be escalated again, with its own note');
select is(pg_temp.staff('d', format($q$ select string_agg(note, ' | ' order by note) from nestly.report_escalations where report_id = %L $q$, pg_temp.g('rc'))), 'נדרשת החלטה של המנהל | עוד הערה',
  '[F14.2-a c8 §9.10] the Admin reads both');
select is(pg_temp.q('a', 'select count(*)::text from nestly.report_escalations'), '0', '[F14.2-a c8] a parent reads none');
select is(pg_temp.dml('m1', format($q$ insert into nestly.report_escalations (report_id, note, escalated_by) values (%L, 'abc', %L) $q$, pg_temp.g('rpa'), pg_temp.id('m3'))), 'ERR:42501',
  '[F14.2-a c8 rule 12] the escalating Moderator is the database''s');
select is(pg_temp.dml('m5', format($q$ update nestly.reports set status = 'handled', resolution = 'dismissed' where id = %L $q$, pg_temp.g('rc'))), 'OK:1', '[F14.2-a c8] control: the report is closed');
select is(pg_temp.esc('m5', 'rc'), 'ERR:42501', '[F14.2-a c8] a closed report is not escalated');
select is(pg_temp.esc('m1', 'rpa', 'ab' || repeat(' ', 600)), 'ERR:23514', '[F14.2-a c8] a note of at most 500 characters, blanks included');

-- ---- c9: who opened a report (§9.10) ---------------------------------------------------------------------------------------------
create function pg_temp.opened(p_who text, p_report text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.report_openings (report_id) values (%L) on conflict do nothing $q$, pg_temp.g(p_report)))
$f$;
select is(pg_temp.opened('m1', 'rpa'), 'OK:1', '[F14.2-a c9 §9.10] REPORTS_VIEW records that it opened a report');
select is(pg_temp.opened('m1', 'rpa'), 'OK:0', '[F14.2-a c9] once per staff member (a second opening changes nothing)');
select is(pg_temp.opened('d', 'rpa'), 'OK:1', '[F14.2-a c9] the Admin''s opening too');
select is(pg_temp.opened('a', 'rpa'), 'ERR:42501', '[F14.2-a c9] a parent records nothing');
select is(pg_temp.opened('m0', 'rpa'), 'ERR:42501', '[F14.2-a c9] nor a Moderator without REPORTS_VIEW');
select is(pg_temp.opened('m1', 'rc'), 'ERR:42501', '[F14.2-a c9] a closed report is not opened again');
select is(pg_temp.dml('m1', format($q$ insert into nestly.report_openings (report_id, opened_by) values (%L, %L) $q$, pg_temp.g('rpg'), pg_temp.id('m3'))), 'ERR:42501',
  '[F14.2-a c9 rule 12] who opened it is the database''s');
select is(pg_temp.q('d', format($q$ select count(*)::text from nestly.report_openings where report_id = %L $q$, pg_temp.g('rpa'))), '2',
  '[F14.2-a c9 §9.10] the Admin reads who opened it');
select is(pg_temp.q('a', 'select count(*)::text from nestly.report_openings'), '0', '[F14.2-a c9] a parent reads none');
select is(tests.fx_sf_audit('report_opened'), 0::bigint, '[F14.2-a c9] an opening is no action: nothing in the Audit Log');

-- ---- c10: a Private Group's page, opened for review (§9.7, BR-040) -----------------------------------------------------------------
create function pg_temp.gview(p_who text, p_group text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.group_staff_views (group_id) values (%L) $q$, pg_temp.g(p_group)))
$f$;
select set_config('t.pub2', pg_temp.q('p', $$ insert into nestly.groups (name, description, privacy) values ('Sunny side', 'about us', 'public') returning id::text $$), true);
select set_config('t.priv2', pg_temp.q('p', $$ insert into nestly.groups (name, description, privacy) values ('Quiet evenings', 'about us', 'private') returning id::text $$), true);
select set_config('t.pv2post', pg_temp.q('p', format($q$ insert into nestly.posts (audience, body, group_id) values ('everyone', 'owner only so far', %L) returning id::text $q$,
  pg_temp.g('priv2'))), true);
select is(pg_temp.staff('d', format($q$ select count(*)::text from nestly.posts where group_id = %L $q$, pg_temp.g('priv2'))), '0',
  '[F14.2-a c10 BR-040] before an opening, even the Admin reads nothing of a Private Group');
select is(pg_temp.gview('m1', 'priv2'), 'ERR:42501', '[F14.2-a c10] without PRIVATE_GROUP_MODERATE a Private Group is not opened');
select is(pg_temp.gview('a', 'priv2'), 'ERR:42501', '[F14.2-a c10] a community user opens nothing');
select is(pg_temp.gview('m2', 'pub2'), 'ERR:42501', '[F14.2-a c10] only a Private Group is opened this way (a Public one is open to all)');
select is(tests.fx_sf_audit('private_group_viewed'), 0::bigint, '[F14.2-a c10] (nothing recorded yet)');
select is(pg_temp.gview('m2', 'priv2'), 'OK:1', '[F14.2-a c10 §9.7] PRIVATE_GROUP_MODERATE opens a Private Group''s page for review');
select is(tests.fx_sw_audit_row('private_group_viewed') like 'PRIVATE_GROUP_MODERATE|group|' || pg_temp.g('priv2')::text || '|%', true, '[F14.2-a c10 NFR-PRIV-002] audited, naming the Group');
select is(pg_temp.staff('m2', format($q$ select count(*)::text from nestly.posts where group_id = %L $q$, pg_temp.g('priv2'))), '1',
  '[F14.2-a c10] inside that transaction it reads the Group''s posts');
select is(pg_temp.staff('m2', format($q$ select count(*)::text from nestly.group_members where group_id = %L $q$, pg_temp.g('priv2'))), '0',
  '[F14.2-a c10] and no Membership comes with it');
select is(pg_temp.dml('m2', format($q$ insert into nestly.comments (post_id, body) values (%L, 'staff comment') $q$, pg_temp.g('pv2post'))), 'ERR:42501',
  '[F14.2-a c10 §9.7] and it still writes nothing there');

select * from finish();
rollback;
