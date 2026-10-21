-- pgTAP, run by pg_prove as app_server (CI `db` job, I13 follow-up: usage events, professional views, promotion settings, the staff stop,
-- anonymised payments, monthly summaries; §13.3, OP-039, FR-PRO-002, FR-ADMIN-010, AC-071, BR-057, BR-058, VAL-032, FR-ALG-007, BR-059,
-- BR-053, AC-068, FR-SERV-010, FR-MKT-004, BR-047, NFR-SEC-007, AC-098, §13.4).
-- Source of expected values: Afik's decisions (decisions-in-force.md §10 item 8: minimal usage events — a daily login, a profile view, a post
-- view, no content; §11.1: Admin or an authorised Moderator stops a running promotion, Audit, no refund; §11.2: a promoted post after 4 to 7
-- organic posts by the last 48 hours' volume, thresholds in the Admin's settings; §11.4: promotion detail 12 months, a monthly summary per
-- promotion forever; §11.6: payment records kept without identity — amount, date, promotion type, the Professional's field) and the ⭐
-- defaults of the I13 brief (usage events 90 days, staff not recorded; the frequency cap 3 a day; thresholds 20 / 200 posts in 48 hours;
-- the moderation key of the target stops it), not the migration text.
-- People: a, b (Regular), s (suspended Regular), q1 = pr_1, q2 = pr_2 (Professionals with a profile), d = fr_d (Admin), m1 = sf_m1
-- (Moderator, no key), m3 = sf_m3 (Moderator, ANALYTICS_VIEW granted below), m4 = sf_m4 (CONTENT_MODERATE), m5 = sf_m5 (MARKETPLACE_MODERATE).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F13.2-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_sf_grant(tests.fx_sf_id('sf_m3'), array['ANALYTICS_VIEW']);
select tests.fx_sf_grant(tests.fx_sf_id('sf_m4'), array['CONTENT_MODERATE']);
select tests.fx_sf_grant(tests.fx_sf_id('sf_m5'), array['MARKETPLACE_MODERATE']);

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 's' then tests.fx_id('s')
    when 'q1' then tests.fx_pr_id('pr_1') when 'q2' then tests.fx_pr_id('pr_2')
    when 'd' then tests.fx_fr_id('fr_d') when 'm1' then tests.fx_sf_id('sf_m1') when 'm3' then tests.fx_sf_id('sf_m3')
    when 'm4' then tests.fx_sf_id('sf_m4') when 'm5' then tests.fx_sf_id('sf_m5')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
-- a query on the analytics screen (nestly.analytics_view = on), as the analytics route does
create function pg_temp.qa(p_who text, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.analytics_view', 'on', true);
  v := pg_temp.q(p_who, p_sql);
  perform set_config('nestly.analytics_view', '', true);
  return v;
end
$f$;
create function pg_temp.use(p_who text, p_kind text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.usage_events (kind) values (%L) $q$, p_kind))
$f$;
create function pg_temp.view(p_who text, p_pro text, p_kind text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.professional_views (professional_id, kind) values (%L, %L) $q$, pg_temp.id(p_pro), p_kind))
$f$;
-- the account's counter of a kind today, as postgres
create function pg_temp.times(p_who text, p_kind text) returns text language sql as $f$
  select tests.fx_promo_text(format($q$ select coalesce(sum(times), 0)::text from nestly.usage_events
    where user_id = %L and kind = %L and occurred_on = (now() at time zone 'Asia/Jerusalem')::date $q$, pg_temp.id(p_who), p_kind))
$f$;
create function pg_temp.pv(p_pro text) returns bigint language sql as $f$
  select tests.fx_promo_count(format('nestly.professional_views where professional_id = %L', pg_temp.id(p_pro)))
$f$;

-- p_who's views of p_pro: the sum of times of p_who's rows, as postgres
create function pg_temp.vtimes(p_who text, p_pro text, p_kind text) returns text language sql as $f$
  select tests.fx_promo_text(format($q$ select coalesce(sum(times), 0)::text from nestly.professional_views
    where viewer_id = %L and professional_id = %L and kind = %L $q$, pg_temp.id(p_who), pg_temp.id(p_pro), p_kind))
$f$;
create function pg_temp.used(p_who text) returns bigint language sql as $f$
  select tests.fx_promo_count(format('nestly.usage_events where user_id = %L', pg_temp.id(p_who)))
$f$;

-- ---- structure ------------------------------------------------------------------------------------------------------------
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('usage_events', 'professional_views') and c.relrowsecurity and c.relforcerowsecurity),
  2::bigint, '[F13.2-a c1] the two new tables have RLS enabled and forced');
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text || ':' || array_to_string(array(select rolname::text from pg_roles where oid = any (pl.polroles) order by 1), '+'), ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('usage_events', 'professional_views')),
  'professional_views.professional_views_delete_jobs:d:app_jobs, professional_views.professional_views_insert_viewer:a:authenticated, '
  || 'professional_views.professional_views_select_analytics:r:authenticated, professional_views.professional_views_select_jobs:r:app_jobs, '
  || 'professional_views.professional_views_select_own:r:authenticated, professional_views.professional_views_select_viewer:r:authenticated, '
  || 'professional_views.professional_views_update_viewer:w:authenticated, '
  || 'usage_events.usage_events_delete_jobs:d:app_jobs, usage_events.usage_events_insert_own:a:authenticated, '
  || 'usage_events.usage_events_select_analytics:r:authenticated, usage_events.usage_events_select_jobs:r:app_jobs, '
  || 'usage_events.usage_events_select_own:r:authenticated, usage_events.usage_events_update_own:w:authenticated',
  '[F13.2-a c1] exactly these policies: no client deletes a row, only the retention job deletes (rule 6)');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('usage_events', 'professional_views')
            and pl.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
            and (not pl.polpermissive
                 or (coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') || coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), '')) !~ 'is_active_account\(\)')),
  0::bigint, '[F13.2-a c1 platform r15] every client policy of the new tables is permissive and gated by is_active_account()');
select is((select string_agg(pl.polname, ', ' order by pl.polname) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'nestly' and c.relname = 'usage_events' and pl.polroles = array[(select oid from pg_roles where rolname = 'app_jobs')]::oid[]
               and pg_get_expr(pl.polqual, pl.polrelid) ~ 'Asia/Jerusalem' and pg_get_expr(pl.polqual, pl.polrelid) ~ '- 90\)*$'),
  'usage_events_delete_jobs, usage_events_select_jobs',
  '[F13.2-a c1 rule 6 §13.4] the job reaches only usage events older than 90 Israel days');
select is((select string_agg(pl.polname, ', ' order by pl.polname) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'nestly' and c.relname in ('professional_views', 'promotion_events') and pl.polname ~ '_delete_jobs$|^professional_views_select_jobs$'
               and pl.polroles = array[(select oid from pg_roles where rolname = 'app_jobs')]::oid[]
               and pg_get_expr(pl.polqual, pl.polrelid) ~ 'Asia/Jerusalem' and pg_get_expr(pl.polqual, pl.polrelid) ~ '''1 year''::interval'),
  'professional_views_delete_jobs, professional_views_select_jobs, promotion_events_delete_jobs',
  '[F13.2-a c1 rule 6 §11.4] the job deletes professional views and paid events of the months more than 12 months back only');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('usage_events', 'professional_views') and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'professional_views.kind, professional_views.professional_id, usage_events.kind',
  '[F13.2-a c1 conventions] INSERT per column: the kind (and for a view, the Professional); never an account, a day or a count');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('usage_events', 'professional_views') and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'professional_views.times, usage_events.times', '[F13.2-a c1 conventions] UPDATE per column: the count only');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('usage_events', 'professional_views') and a.attnum > 0 and not a.attisdropped
              and not has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  'professional_views.id, professional_views.viewer_id, usage_events.user_id',
  '[F13.2-a c1 BR-057 BR-058] never readable: whose counter it is, who viewed, a row id that follows one viewer');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('usage_events', 'professional_views') and a.attnum > 0 and not a.attisdropped),
  'professional_views.id, professional_views.kind, professional_views.occurred_on, professional_views.professional_id, professional_views.times, professional_views.viewer_id, '
  || 'usage_events.kind, usage_events.occurred_on, usage_events.times, usage_events.user_id',
  '[F13.2-a c1 OP-039] a usage event holds the account, the kind, the day and a count (no target, no content, no IP, no time); a view holds the Professional, the viewer, the kind, the day and a count (no post, no time)');
select is((select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname in ('usage_events', 'professional_views') and a.attnum > 0 and not a.attisdropped
              and a.attname ~ '(child|birth|pregnan|tracker|journey|cycle|message|support|group|ip|text|body|query|post_id|target|_at$)'),
  0::bigint, '[F13.2-a c1 BR-053 AC-068] no column names a child, a tracker, a chat, Support, a Group, an IP, a text, a target or a time');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.prosecdef
            and p.proname in ('usage_events_guard', 'professional_views_guard', 'purge_usage_events', 'promotion_events_guard', 'promotion_settings_prepare',
                              'promotions_update_guard', 'promotion_payments_prepare', 'purge_promotion_data')),
  0::bigint, '[F13.2-a c1 rule 10] no new SECURITY DEFINER');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('usage_events', 'professional_views')
            and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE'))),
  0::bigint, '[F13.2-a c1 rule 7] anon holds nothing on the new tables');
select is((select string_agg(r.rolname, ',' order by r.rolname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             cross join (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs')) as r(rolname)
            where n.nspname = 'nestly' and p.proname = 'purge_usage_events' and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  'app_jobs', '[F13.2-a c1 rule 6] only app_jobs runs the purge');
select is((select string_agg(r.rolname, ',' order by r.rolname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             cross join (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs')) as r(rolname)
            where n.nspname = 'nestly' and p.proname = 'purge_promotion_data' and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  'app_jobs', '[F13.2-a c1 rule 6 §11.4] only app_jobs runs the promotion purge');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname in ('promotions', 'promotion_events', 'promotion_payments') and pl.polname ~ 'analytics'),
  0::bigint, '[F13.2-a c1 §3.2] no analytics read of promotions or payments: the Promotions domain stays with BILLING_FINANCE_MANAGE (Admin Only)');

-- ---- usage events (OP-039) -------------------------------------------------------------------------------------------------
select is(pg_temp.use('a', 'daily_login'), 'OK:1', '[F13.2-a c2 OP-039] a Regular''s daily login is recorded');
select is(pg_temp.use('a', 'daily_login'), 'OK:0', '[F13.2-a c2] a second login the same day adds nothing');
select is(pg_temp.times('a', 'daily_login'), '1', '[F13.2-a c2] a daily login counts once a day');
select is(pg_temp.use('a', 'post_view'), 'OK:1', '[F13.2-a c2 OP-039] a post view');
select is(pg_temp.use('a', 'post_view'), 'OK:0', '[F13.2-a c2] a repeat adds to the day''s row');
select is(pg_temp.times('a', 'post_view'), '2', '[F13.2-a c2] and is counted');
select is(pg_temp.used('a'), 2::bigint, '[F13.2-a c2] one row per kind and day');
select is(pg_temp.use('q1', 'profile_view'), 'OK:1', '[F13.2-a c2 OP-039] a Professional is recorded too');
select is(pg_temp.use('d', 'daily_login'), 'OK:0', '[F13.2-a c2] the Admin''s event is dropped silently (recording never fails a page)');
select is(pg_temp.use('m3', 'daily_login'), 'OK:0', '[F13.2-a c2] a Moderator''s too');
select is(pg_temp.use('s', 'daily_login'), 'OK:0', '[F13.2-a c2 r15] and a suspended account''s');
select is(pg_temp.used('d') + pg_temp.used('m3') + pg_temp.used('s'), 0::bigint, '[F13.2-a c2] staff and inactive accounts are never recorded');
select is(pg_temp.use('a', 'search'), 'ERR:23514', '[F13.2-a c2 OP-039] nothing but the three kinds');
select is(pg_temp.dml('a', format($q$ insert into nestly.usage_events (user_id, kind) values (%L, 'post_view') $q$, pg_temp.id('b'))), 'ERR:42501',
  '[F13.2-a c2] never another''s event');
select is(pg_temp.dml('a', $q$ insert into nestly.usage_events (kind, occurred_on) values ('profile_view', '2026-01-01') $q$), 'ERR:42501',
  '[F13.2-a c2] the day is the database''s');
select is(pg_temp.dml('a', $q$ update nestly.usage_events set times = 50 where kind = 'post_view' $q$), 'ERR:42501',
  '[F13.2-a c2] a count only goes up by one');
select is(pg_temp.dml('a', $q$ delete from nestly.usage_events $q$), 'ERR:42501', '[F13.2-a c2] the client never deletes an event');
select is(pg_temp.q('a', 'select count(*)::text from nestly.usage_events'), '2', '[F13.2-a c3] the account reads its own counters');
select is(pg_temp.q('a', 'select count(user_id)::text from nestly.usage_events'), 'ERR:42501', '[F13.2-a c3 BR-058] but never whose they are');
select is(pg_temp.q('b', 'select count(*)::text from nestly.usage_events'), '0', '[F13.2-a c3] another account reads none');
select is(pg_temp.qa('b', 'select count(*)::text from nestly.usage_events'), '0', '[F13.2-a c3] not even on the analytics screen');
select is(pg_temp.qa('m3', 'select sum(times)::text from nestly.usage_events where kind = ''post_view'''), pg_temp.times('a', 'post_view'),
  '[F13.2-a c3 FR-ADMIN-010 BR-058] ANALYTICS_VIEW counts every account''s events on the analytics screen');
select is(pg_temp.qa('m3', 'select count(user_id)::text from nestly.usage_events'), 'ERR:42501', '[F13.2-a c3 BR-058] never whose');
select is(pg_temp.qa('d', 'select count(*)::text from nestly.usage_events where kind = ''daily_login'''),
  tests.fx_promo_count('nestly.usage_events where kind = ''daily_login''')::text, '[F13.2-a c3 FR-ADMIN-010] the Admin too');
select is(pg_temp.q('m3', 'select count(*)::text from nestly.usage_events'), '0', '[F13.2-a c3] outside the analytics screen, nothing');
select is(pg_temp.qa('m1', 'select count(*)::text from nestly.usage_events'), '0', '[F13.2-a c3 AC-026] without ANALYTICS_VIEW, nothing');
select is((select string_agg(pg_temp.use('b', 'profile_view'), '') from generate_series(1, 3)), 'OK:1OK:0OK:0', '[F13.2-a c2] three profile views of b');
select is(pg_temp.times('b', 'profile_view'), '3', '[F13.2-a c2] counted');
-- the daily limit of a viewing kind: 1000, then nothing more is counted and nothing fails
select set_config('t.n', (1000 - pg_temp.times('a', 'post_view')::int)::text, true);
select is((select count(*) from generate_series(1, current_setting('t.n')::int) g where pg_temp.use('a', 'post_view') like 'OK:%'), current_setting('t.n')::bigint,
  'a views posts up to its daily limit');
select is(pg_temp.times('a', 'post_view'), '1000', '[F13.2-a c2] a viewing kind stops at 1000 a day');
select is(pg_temp.use('a', 'post_view'), 'OK:0', '[F13.2-a c2] beyond it nothing more is counted and nothing fails');

-- ---- the Professional's own view counts (FR-PRO-002) ----------------------------------------------------------------------
select is(pg_temp.view('b', 'q1', 'profile_view'), 'OK:1', '[F13.2-a c4 FR-PRO-002] a Regular''s view of a Professional''s profile is counted for it');
select is(pg_temp.view('b', 'q1', 'profile_view'), 'OK:0', '[F13.2-a c4] a repeat the same day adds to the viewer''s row');
select is(pg_temp.vtimes('b', 'q1', 'profile_view'), '2', '[F13.2-a c4] and is counted');
select is(pg_temp.view('a', 'q1', 'post_view'), 'OK:1', '[F13.2-a c4 FR-PRO-002 Organic Reach] a view of one of its posts');
select is(pg_temp.view('q2', 'q1', 'profile_view'), 'OK:1', '[F13.2-a c4] another Professional''s view counts');
select is(pg_temp.view('q1', 'q1', 'profile_view'), 'OK:0', '[F13.2-a c4] its own view is dropped silently');
select is(pg_temp.view('a', 'b', 'profile_view'), 'ERR:23503', '[F13.2-a c4] a Regular profile has no view count');
select is(pg_temp.view('d', 'q1', 'profile_view'), 'OK:0', '[F13.2-a c4] a staff view is dropped silently');
select is(pg_temp.view('s', 'q1', 'profile_view'), 'OK:0', '[F13.2-a c4 r15] and a suspended account''s');
select is(pg_temp.view('a', 'q1', 'daily_login'), 'ERR:23514', '[F13.2-a c4] a view is a profile or a post view only');
select is(pg_temp.dml('a', format($q$ insert into nestly.professional_views (professional_id, kind, occurred_on) values (%L, 'post_view', '2026-01-01') $q$,
            pg_temp.id('q1'))), 'ERR:42501', '[F13.2-a c4] the day is the database''s');
select is(pg_temp.dml('a', format($q$ insert into nestly.professional_views (professional_id, viewer_id, kind) values (%L, %L, 'post_view') $q$,
            pg_temp.id('q1'), pg_temp.id('b'))), 'ERR:42501', '[F13.2-a c4] never in another viewer''s name');
select is(pg_temp.dml('b', $q$ update nestly.professional_views set times = 40 $q$), 'ERR:42501', '[F13.2-a c4] a count only goes up by one');
select is(pg_temp.pv('q1'), 3::bigint, '[F13.2-a c4] three viewer-days for q1 (b, a, q2)');
select is(pg_temp.q('q1', 'select string_agg(kind || '':'' || n || '':'' || t, '','' order by kind) from (select kind, count(*) as n, sum(times) as t from nestly.professional_views group by kind) k'),
  'post_view:1:1,profile_view:2:3', '[F13.2-a c5 FR-PRO-002 VAL-032] the Professional counts its own profile and post views (reach and views) by kind');
select is(pg_temp.q('q1', 'select count(*)::text from nestly.professional_views where occurred_on = (now() at time zone ''Asia/Jerusalem'')::date'), '3',
  '[F13.2-a c5] by day');
select is(pg_temp.q('q1', 'select count(viewer_id)::text from nestly.professional_views'), 'ERR:42501', '[F13.2-a c5 BR-057 AC-072] and never learns who');
select is(pg_temp.q('q1', 'select count(id)::text from nestly.professional_views'), 'ERR:42501', '[F13.2-a c5 BR-057] nor a row id');
select is(pg_temp.q('q2', format('select count(*)::text from nestly.professional_views where professional_id = %L', pg_temp.id('q1'))), '1',
  '[F13.2-a c5 VAL-032] another Professional reads only its own view of q1');
select is(pg_temp.q('a', 'select count(*)::text from nestly.professional_views'), '1', '[F13.2-a c5] a viewer reads its own row only');
select is(pg_temp.qa('m3', format('select count(*)::text from nestly.professional_views where professional_id = %L', pg_temp.id('q1'))), '3',
  '[F13.2-a c5 FR-ADMIN-010] ANALYTICS_VIEW counts them on the analytics screen');
select is(pg_temp.qa('m3', 'select count(viewer_id)::text from nestly.professional_views'), 'ERR:42501', '[F13.2-a c5 BR-058] never who');
select is(pg_temp.dml('q1', $q$ delete from nestly.professional_views $q$), 'ERR:42501', '[F13.2-a c5] nobody deletes a view');
select is(pg_temp.dml('q1', $q$ update nestly.professional_views set kind = 'post_view' $q$), 'ERR:42501', '[F13.2-a c5] nobody changes a view');

-- a user block: no view is counted across it, and nothing tells the viewer
select is(pg_temp.dml('q2', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('b'))),
  'OK:1', 'q2 blocks b');
select is(pg_temp.view('b', 'q2', 'profile_view'), 'OK:0', '[F13.2-a c4] a view across a user block is dropped silently (the block is not revealed)');
select is(pg_temp.pv('q2'), 0::bigint, '[F13.2-a c4] and not counted');

-- one viewer adds at most 100 a day to a Professional's count
select set_config('t.n', (100 - pg_temp.vtimes('b', 'q1', 'profile_view')::int)::text, true);
select is((select count(*) from generate_series(1, current_setting('t.n')::int) g where pg_temp.view('b', 'q1', 'profile_view') like 'OK:%'), current_setting('t.n')::bigint,
  'b opens q1''s profile up to the daily limit');
select is(pg_temp.vtimes('b', 'q1', 'profile_view'), '100', '[F13.2-a c4] one viewer counts at most 100 a day for one Professional');
select is(pg_temp.view('b', 'q1', 'profile_view'), 'OK:0', '[F13.2-a c4] beyond it nothing more is counted and nothing fails');

-- ---- the frequency cap in the paid events (FR-ALG-007) ------------------------------------------------------------------------
select set_config('t.pay', pg_temp.q('q1', $q$ insert into nestly.promotion_payments (plan_key) values ('profile_7') returning id::text $q$), true);
select set_config('t.promo', pg_temp.q('q1', format($q$ insert into nestly.promotions (target_kind, plan_key, payment_id) values ('profile', 'profile_7', %L) returning id::text $q$,
  current_setting('t.pay'))), true);
select ok(current_setting('t.promo') ~ '^[0-9a-f-]{36}$', 'q1 promotes its profile');
select is((select string_agg(pg_temp.dml('a', format($q$ insert into nestly.promotion_events (promotion_id, kind) values (%L, 'impression') $q$, current_setting('t.promo'))), '')
             from generate_series(1, 5)), 'OK:1OK:0OK:0OK:0OK:0', 'a sees the promotion five times');
select is(tests.fx_promo_text(format($q$ select times::text from nestly.promotion_events where promotion_id = %L and viewer_id = %L and kind = 'impression' $q$,
            current_setting('t.promo'), pg_temp.id('a'))), '3', '[F13.2-a c7 FR-ALG-007] an impression counts up to the configured cap (3 a day per viewer and promotion)');

-- ---- retention: 90 days (⭐ default) ---------------------------------------------------------------------------------------
select tests.fx_usage_age(pg_temp.id('a'), 91);
select tests.fx_pv_age(pg_temp.id('q1'), 91);
select is(tests.fx_usage_purge(), 2, '[F13.2-a c6 §13.4] the usage purge deletes usage events older than 90 days (a''s two rows)');
select is(pg_temp.used('a'), 0::bigint, '[F13.2-a c6] a''s are gone');
select is(pg_temp.pv('q1'), 3::bigint, '[F13.2-a c6 §11.4] professional views stay: they are kept 12 months, with the paid events');
select is(pg_temp.used('b'), 1::bigint, '[F13.2-a c6] a younger row stays');
select tests.fx_usage_age(pg_temp.id('b'), 90);
select is(tests.fx_usage_purge(), 0, '[F13.2-a c6] a row of exactly 90 days ago stays');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')), 'select nestly.purge_usage_events()::text'), 'ERR:42501',
  '[F13.2-a c6] a signed-in account cannot run the purge');
select is(pg_temp.use('a', 'daily_login'), 'OK:1', '[F13.2-a c6] a fresh day is recorded again');

-- account deletion (BR-073): the rows go with the account
select is(tests.fx_promo_text($q$ select count(*)::text from pg_constraint where conname in ('usage_events_user_id_fkey', 'professional_views_professional_id_fkey',
            'professional_views_viewer_id_fkey') and confdeltype = 'c' $q$), '3', '[F13.2-a c6 BR-073] the rows go with the account (cascade)');


-- ---- promotion settings (§11.2, FR-ALG-007, BR-059) ---------------------------------------------------------------------------
select is(pg_temp.q('a', $q$ select string_agg(version || ':' || daily_cap || ':' || directory_units_per_page || ':' || feed_gap_min || ':' || feed_gap_max
            || ':' || feed_low_posts || ':' || feed_high_posts, ',') from nestly.promotion_settings $q$),
  '1:3:1:4:7:20:200', '[F13.2-a c7 §11.2 FR-ALG-007] v1: cap 3 a day, one unit per Directory page, a promoted post after 4 (few posts) to 7 (many) organic posts, thresholds 20 and 200 posts in 48 hours');
select is(pg_temp.q('a', 'select count(created_by)::text from nestly.promotion_settings'), 'ERR:42501', '[F13.2-a c7] who changed the settings is the Audit Log''s, not readable here');
select is(pg_temp.dml('a', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (5, 1, 4, 7, 20, 200, 'x') $q$), 'ERR:42501', '[F13.2-a c7 §3.2] a Regular adds no version');
select is(pg_temp.dml('m4', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (5, 1, 4, 7, 20, 200, 'x') $q$), 'ERR:42501', '[F13.2-a c7 §3.2 AC-026] nor a Moderator (BILLING_FINANCE_MANAGE is Admin Only)');
select is(pg_temp.dml('d', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (5, 2, 7, 4, 20, 200, 'x') $q$), 'ERR:23514', '[F13.2-a c7 §11.2] the most organic posts between two promoted ones is at least the fewest');
select is(pg_temp.dml('d', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (5, 2, 4, 7, 200, 200, 'x') $q$), 'ERR:23514', '[F13.2-a c7 §11.2] the "many posts" threshold is above the "few posts" one');
select is(pg_temp.dml('d', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (5, 2, 4, 7, 20, 200, '  ') $q$), 'ERR:23514', '[F13.2-a c7 FR-ADMIN-005] a version needs a reason');
select is(pg_temp.dml('d', $q$ insert into nestly.promotion_settings (version, daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (9, 5, 2, 4, 7, 20, 200, 'x') $q$), 'ERR:42501', '[F13.2-a c7 BR-059] the version number is the database''s');
select is(pg_temp.dml('d', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (5, 2, 5, 8, 30, 300, 'more reach for the demo') $q$), 'OK:1', '[F13.2-a c7 §11.2] the Admin adds a version');
select is(pg_temp.q('a', $q$ select string_agg(version || ':' || daily_cap || ':' || feed_gap_min || ':' || feed_gap_max || ':' || feed_low_posts || ':' || feed_high_posts, ',' order by version)
            from nestly.promotion_settings $q$), '1:3:4:7:20:200,2:5:5:8:30:300', '[F13.2-a c7 BR-059] it is version 2; version 1 stays (append-only)');
select is(tests.fx_sw_count($q$nestly.audit_log where action = 'promotion_settings_changed' and permission_key = 'BILLING_FINANCE_MANAGE'
            and reason = 'more reach for the demo' and before_state ->> 'daily_cap' = '3' and after_state ->> 'daily_cap' = '5' and after_state ->> 'version' = '2'$q$),
  1::bigint, '[F13.2-a c7 FR-ADMIN-005 §3.3] the change is audited with the reason and the values before and after');
select is(pg_temp.dml('d', $q$ update nestly.promotion_settings set daily_cap = 9 $q$), 'ERR:42501', '[F13.2-a c7 BR-059] a version is never changed');
select is(pg_temp.dml('d', $q$ delete from nestly.promotion_settings $q$), 'ERR:42501', '[F13.2-a c7 BR-059] nor deleted');
select is((select string_agg(pg_temp.dml('a', format($q$ insert into nestly.promotion_events (promotion_id, kind) values (%L, 'impression') $q$, current_setting('t.promo'))), '')
             from generate_series(1, 3)), 'OK:0OK:0OK:0', 'a sees the promotion three more times');
select is(tests.fx_promo_text(format($q$ select times::text from nestly.promotion_events where promotion_id = %L and viewer_id = %L and kind = 'impression' $q$,
            current_setting('t.promo'), pg_temp.id('a'))), '5', '[F13.2-a c7 FR-ALG-007 BR-059] the newest version''s cap is in force (5 a day)');

-- ---- payments kept without identity (§11.6, NFR-SEC-007) ----------------------------------------------------------------------
select is(tests.fx_promo_text($q$ select c.confdeltype::text || '/' || (select a.attnotnull::text from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'payer_id')
            from pg_constraint c where c.conname = 'promotion_payments_payer_id_fkey' $q$), 'n/false',
  '[F13.2-a c8 §11.6] when the account is deleted its payments stay, the payer becomes NULL');
select is(tests.fx_promo_text(format($q$ select (pp.professional_field = pr.field)::text from nestly.promotion_payments pp join nestly.professional_profiles pr on pr.user_id = pp.payer_id
            where pp.id = %L $q$, current_setting('t.pay'))), 'true', '[F13.2-a c8 §11.6] a Professional''s payment keeps its field (the profession), copied by the database');
select is(pg_temp.dml('q1', $q$ insert into nestly.promotion_payments (plan_key, professional_field) values ('profile_7', 'anything') $q$), 'ERR:42501',
  '[F13.2-a c8] the field is the database''s, never the client''s');
select is(tests.fx_promo_text($q$ select string_agg(a.attname, ',' order by a.attname) from pg_attribute a where a.attrelid = 'nestly.promotion_payments'::regclass
            and a.attnum > 0 and not a.attisdropped $q$),
  'amount_ils,created_at,currency,id,is_simulated,payer_id,plan_key,professional_field,provider,provider_ref,status,target_kind',
  '[F13.2-a c8 §11.6 NFR-SEC-007] a payment holds the amount, the date, the plan and kind, the field and the payer (NULL once gone): no card, name, email or address');

-- ---- a listing promotion of a (Regular) ---------------------------------------------------------------------------------------
select set_config('t.lst', pg_temp.q('a', $q$ insert into nestly.marketplace_listings (title, category, item_condition, price, city)
  values ('עגלה', 'strollers', 'good', 300, 'haifa') returning id::text $q$), true);
select set_config('t.lpay', pg_temp.q('a', $q$ insert into nestly.promotion_payments (plan_key) values ('listing_3') returning id::text $q$), true);
select set_config('t.lpromo', pg_temp.q('a', format($q$ insert into nestly.promotions (target_kind, listing_id, plan_key, payment_id) values ('listing', %L, 'listing_3', %L) returning id::text $q$,
  current_setting('t.lst'), current_setting('t.lpay'))), true);
select ok(current_setting('t.lpromo') ~ '^[0-9a-f-]{36}$', 'a promotes its listing');
select is(tests.fx_promo_text(format($q$ select coalesce(professional_field, 'none') from nestly.promotion_payments where id = %L $q$, current_setting('t.lpay'))), 'none',
  '[F13.2-a c8 §11.6] a listing payment has no field');
select is(pg_temp.dml('b', format($q$ insert into nestly.promotion_events (promotion_id, kind) values (%L, 'impression') $q$, current_setting('t.lpromo'))), 'OK:1',
  'b sees the listing promotion');

-- ---- the staff stop (§11.1) -------------------------------------------------------------------------------------------------
create function pg_temp.stop(p_who text, p_promo text, p_reason text default null) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.audit_reason', coalesce(p_reason, ''), true);
  v := pg_temp.dml(p_who, format($q$ update nestly.promotions set status = 'stopped' where id = %L $q$, p_promo));
  perform set_config('nestly.audit_reason', '', true);
  return v;
end
$f$;
select is(pg_temp.q('m4', format('select count(*)::text from nestly.promotions where id = %L', current_setting('t.promo'))), '1',
  '[F13.2-a c9 §11.1] CONTENT_MODERATE sees a Professional''s promotion (the staff list)');
select is(pg_temp.q('m4', format('select count(*)::text from nestly.promotions where id = %L and status = ''active''', current_setting('t.lpromo'))), '1',
  '[F13.2-a c9] a running listing promotion is visible to any active account (it is shown on the Marketplace)');
select is(pg_temp.q('m4', 'select count(*)::text from nestly.promotion_payments'), '0', '[F13.2-a c9 §3.2] but no payment (BILLING_FINANCE_MANAGE is Admin Only)');
select is(pg_temp.stop('m1', current_setting('t.promo'), 'spam'), 'OK:0', '[F13.2-a c9 §11.1 AC-026] a Moderator without the key stops nothing');
select is(pg_temp.stop('m5', current_setting('t.promo'), 'spam'), 'OK:0', '[F13.2-a c9 §11.1] nor one with only MARKETPLACE_MODERATE, on a Professional''s promotion');
select is(pg_temp.stop('m4', current_setting('t.lpromo'), 'spam'), 'OK:0', '[F13.2-a c9 §11.1] nor CONTENT_MODERATE on a listing promotion');
select is(pg_temp.stop('m4', current_setting('t.promo')), 'ERR:23514', '[F13.2-a c9 §11.1 FR-ADMIN-005] a staff stop needs a reason');
select is(pg_temp.stop('m4', current_setting('t.promo'), 'misleading health claims'), 'OK:1', '[F13.2-a c9 §11.1] CONTENT_MODERATE stops a Professional''s running promotion');
select is(pg_temp.q('q1', format('select status || ''/'' || stopped_by from nestly.promotions where id = %L', current_setting('t.promo'))), 'stopped/staff',
  '[F13.2-a c9 §11.1] the promoter sees it was stopped by staff ("הקידום הופסק")');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'promotion_stopped' and permission_key = 'CONTENT_MODERATE' and target_kind = 'promotion'
            and target_id = %L and reason = 'misleading health claims' and before_state ->> 'status' = 'active' and after_state ->> 'status' = 'stopped'$q$, current_setting('t.promo'))),
  1::bigint, '[F13.2-a c9 §11.1 §3.3] the stop is audited with the key, the reason and before/after');
select is(tests.fx_promo_text(format($q$ select status || '/' || amount_ils from nestly.promotion_payments where id = %L $q$, current_setting('t.pay'))), 'succeeded/49',
  '[F13.2-a c9 §11.1] no refund: the payment is unchanged');
select is(pg_temp.stop('m4', current_setting('t.promo'), 'again'), 'ERR:23514', '[F13.2-a c9] a stopped promotion is not stopped again');
select is(pg_temp.dml('a', format($q$ insert into nestly.promotion_events (promotion_id, kind) values (%L, 'impression') $q$, current_setting('t.promo'))), 'ERR:42501',
  '[F13.2-a c9] a stopped promotion is no longer shown or counted');
select is(pg_temp.stop('m5', current_setting('t.lpromo'), 'not a baby product'), 'OK:1', '[F13.2-a c9 §11.1] MARKETPLACE_MODERATE stops a listing promotion');
select is(pg_temp.q('a', format('select stopped_by from nestly.promotions where id = %L', current_setting('t.lpromo'))), 'staff', '[F13.2-a c9] its owner sees it');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'promotion_stopped' and permission_key = 'MARKETPLACE_MODERATE' and target_id = %L$q$, current_setting('t.lpromo'))),
  1::bigint, '[F13.2-a c9 §3.3] audited under MARKETPLACE_MODERATE');
select is(pg_temp.dml('m4', format($q$ update nestly.promotions set ends_at = now() where id = %L $q$, current_setting('t.promo'))), 'ERR:42501',
  '[F13.2-a c9] staff change nothing but the status');
-- the owner's own stop: no staff entry
select set_config('t.pay2', pg_temp.q('q2', $q$ insert into nestly.promotion_payments (plan_key) values ('profile_7') returning id::text $q$), true);
select set_config('t.promo2', pg_temp.q('q2', format($q$ insert into nestly.promotions (target_kind, plan_key, payment_id) values ('profile', 'profile_7', %L) returning id::text $q$,
  current_setting('t.pay2'))), true);
select is(pg_temp.dml('q2', format($q$ update nestly.promotions set status = 'stopped' where id = %L $q$, current_setting('t.promo2'))), 'OK:1', '[F13.2-a c9] the owner stops its own');
select is(pg_temp.q('q2', format('select stopped_by from nestly.promotions where id = %L', current_setting('t.promo2'))), 'owner', '[F13.2-a c9] stopped by the owner');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'promotion_stopped' and target_id = %L$q$, current_setting('t.promo2'))), 0::bigint,
  '[F13.2-a c9] an owner''s stop is not a staff action (no Audit entry)');
select is(pg_temp.dml('q1', format($q$ update nestly.promotions set status = 'stopped' where id = %L $q$, current_setting('t.promo2'))), 'OK:0',
  '[F13.2-a c9] another Professional stops nothing');

-- ---- monthly summaries and the 12-month purge (§11.4) ------------------------------------------------------------------------
select is(pg_temp.dml('d', format($q$ insert into nestly.promotion_monthly_summaries (promotion_id, target_kind, month) values (%L, 'profile', '2026-01-01') $q$,
            current_setting('t.promo'))), 'ERR:42501', '[F13.2-a c10 §11.4] no client writes a summary (the Admin either)');
select tests.fx_promo_age(current_setting('t.promo')::uuid, 420);
select tests.fx_promo_age(current_setting('t.lpromo')::uuid, 40);
select tests.fx_pv_age(pg_temp.id('q1'), 420);
select is(tests.fx_promo_purge(), 4, '[F13.2-a c10 §11.4] the purge deletes the paid events and professional views of the months more than 12 months back (a''s impression row, q1''s three views)');
select is(tests.fx_promo_count(format('nestly.promotion_events where promotion_id = %L', current_setting('t.promo'))), 0::bigint, '[F13.2-a c10 §11.4] the old detail is gone');
select is(tests.fx_promo_count(format('nestly.promotion_events where promotion_id = %L', current_setting('t.lpromo'))), 1::bigint,
  '[F13.2-a c10 §11.4] a younger month''s detail stays');
select is(tests.fx_promo_text(format($q$ select string_agg(target_kind || ':' || (professional_field is not null) || ':' || impressions || ':' || clicks, ',')
            from nestly.promotion_monthly_summaries where promotion_id = %L $q$, current_setting('t.promo'))), 'profile:true:5:0',
  '[F13.2-a c10 §11.4] the old month is summed first: kind, field, impressions and clicks');
select is(tests.fx_promo_text(format($q$ select string_agg(target_kind || ':' || impressions, ',') from nestly.promotion_monthly_summaries where promotion_id = %L $q$,
            current_setting('t.lpromo'))), 'listing:1', '[F13.2-a c10 §11.4] every completed month is summed, also within the 12 months');
select is(tests.fx_promo_purge(), 0, '[F13.2-a c10] a rerun deletes nothing');
select is(tests.fx_promo_text($q$ select count(*)::text || '/' || sum(impressions)::text from nestly.promotion_monthly_summaries $q$), '2/6',
  '[F13.2-a c10] and changes no summary');
select is(pg_temp.q('q1', 'select string_agg(impressions::text, '','') from nestly.promotion_monthly_summaries'), '5', '[F13.2-a c10] the promoter reads its own months');
select is(pg_temp.q('b', 'select count(*)::text from nestly.promotion_monthly_summaries'), '0', '[F13.2-a c10] nobody else does');
select is(pg_temp.q('m4', 'select count(*)::text from nestly.promotion_monthly_summaries'), '0', '[F13.2-a c10 §3.2] nor a Moderator');
select is(pg_temp.q('d', 'select count(*)::text from nestly.promotion_monthly_summaries'), '2', '[F13.2-a c10 §3.2] BILLING_FINANCE_MANAGE reads every summary');
select tests.fx_promo_drop(current_setting('t.promo')::uuid);
select is(tests.fx_promo_text($q$ select count(*)::text from nestly.promotion_monthly_summaries where promotion_id is null and target_kind = 'profile' and impressions = 5 $q$), '1',
  '[F13.2-a c10 §11.4] the summary outlives its promotion, without it (kept forever)');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('d')), 'select nestly.purge_promotion_data()::text'), 'ERR:42501',
  '[F13.2-a c10 rule 6] a signed-in account cannot run the purge');

select * from finish();
rollback;
