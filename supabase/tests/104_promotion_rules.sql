-- pgTAP, run by pg_prove as app_server (CI `db` job, I13 follow-up: usage events, professional views, the promotions configuration;
-- §13.3, OP-039, FR-PRO-002, FR-ADMIN-010, AC-071, BR-057, BR-058, VAL-032, FR-ALG-007, BR-059, BR-053, AC-068).
-- Source of expected values: Afik's decision (decisions-in-force.md §10 item 8: minimal usage events — a daily login, a profile view, a post
-- view, no content) and the ⭐ defaults of the I13 brief (no target, no IP, staff not recorded, 90 days; the Professional counts views of its
-- own profile and posts without learning who; the frequency cap 3 a day, one unit per page, after the third organic post), not the
-- migration text.
-- People: a, b (Regular), s (suspended Regular), q1 = pr_1, q2 = pr_2 (Professionals with a profile), d = fr_d (Admin), m1 = sf_m1
-- (Moderator, no key), m3 = sf_m3 (Moderator, ANALYTICS_VIEW granted below).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F13.2-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_sf_grant(tests.fx_sf_id('sf_m3'), array['ANALYTICS_VIEW']);

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 's' then tests.fx_id('s')
    when 'q1' then tests.fx_pr_id('pr_1') when 'q2' then tests.fx_pr_id('pr_2')
    when 'd' then tests.fx_fr_id('fr_d') when 'm1' then tests.fx_sf_id('sf_m1') when 'm3' then tests.fx_sf_id('sf_m3')
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
             where n.nspname = 'nestly' and c.relname in ('usage_events', 'professional_views') and pl.polroles = array[(select oid from pg_roles where rolname = 'app_jobs')]::oid[]
               and pg_get_expr(pl.polqual, pl.polrelid) ~ 'Asia/Jerusalem' and pg_get_expr(pl.polqual, pl.polrelid) ~ '- 90\)*$'),
  'professional_views_delete_jobs, professional_views_select_jobs, usage_events_delete_jobs, usage_events_select_jobs',
  '[F13.2-a c1 rule 6 §13.4] the job reaches only rows older than 90 Israel days');
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
            and p.proname in ('usage_events_guard', 'professional_views_guard', 'purge_usage_events', 'promotion_events_guard')),
  0::bigint, '[F13.2-a c1 rule 10] no new SECURITY DEFINER');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname in ('usage_events', 'professional_views')
            and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE'))),
  0::bigint, '[F13.2-a c1 rule 7] anon holds nothing on the new tables');
select is((select string_agg(r.rolname, ',' order by r.rolname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             cross join (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs')) as r(rolname)
            where n.nspname = 'nestly' and p.proname = 'purge_usage_events' and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  'app_jobs', '[F13.2-a c1 rule 6] only app_jobs runs the purge');
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
select is(tests.fx_usage_purge(), 5, '[F13.2-a c6 §13.4] the retention job deletes usage events and views older than 90 days (a''s two rows, q1''s three views)');
select is(pg_temp.used('a'), 0::bigint, '[F13.2-a c6] a''s are gone');
select is(pg_temp.pv('q1'), 0::bigint, '[F13.2-a c6] q1''s are gone');
select is(pg_temp.used('b'), 1::bigint, '[F13.2-a c6] a younger row stays');
select tests.fx_usage_age(pg_temp.id('b'), 90);
select is(tests.fx_usage_purge(), 0, '[F13.2-a c6] a row of exactly 90 days ago stays');
select is(tests.as_role('authenticated', tests.claims(pg_temp.id('a')), 'select nestly.purge_usage_events()::text'), 'ERR:42501',
  '[F13.2-a c6] a signed-in account cannot run the purge');
select is(pg_temp.use('a', 'daily_login'), 'OK:1', '[F13.2-a c6] a fresh day is recorded again');

-- account deletion (BR-073): the rows go with the account
select is(tests.fx_promo_text($q$ select count(*)::text from pg_constraint where conname in ('usage_events_user_id_fkey', 'professional_views_professional_id_fkey',
            'professional_views_viewer_id_fkey') and confdeltype = 'c' $q$), '3', '[F13.2-a c6 BR-073] the rows go with the account (cascade)');


-- ---- the promotions surface of the configuration (P-ALG-07, FR-ALG-007, BR-059) ---------------------------------------------
select is(pg_temp.q('a', $q$ select string_agg(version || ':' || is_active || ':' || promo_daily_cap || ':' || promo_units_per_page || ':' || promo_feed_position, ',')
            from nestly.algorithm_configurations where surface = 'promotions' $q$),
  '1:true:3:1:3', '[F13.2-a c7 FR-ALG-007] v1: 3 impressions per viewer per promotion per day, one promoted unit per page, after the third organic post');
select is(pg_temp.q('a', $q$ select count(*)::text from nestly.algorithm_configurations where surface = 'regular_feed' and promo_daily_cap is not null $q$), '0',
  '[F13.2-a c7] the feed''s rows carry no promotion setting');
select is(pg_temp.q('a', $q$ select (count(*) = 1)::text from nestly.algorithm_configurations where surface = 'regular_feed' and is_active $q$), 'true',
  '[F13.2-a c7] the feed keeps its one active version');
select is(pg_temp.dml('d', $q$ update nestly.algorithm_configurations set promo_daily_cap = 50 where surface = 'promotions' $q$), 'ERR:42501',
  '[F13.2-a c7 BR-059] the cap is never changed in place, by the Admin either (append-only)');
select is(pg_temp.dml('d', $q$ delete from nestly.algorithm_configurations where surface = 'promotions' $q$), 'ERR:42501', '[F13.2-a c7 BR-059] nor deleted');
select is(pg_temp.dml('d', $q$ insert into nestly.algorithm_configurations (surface, version, is_active, w_fresh, half_life_hours, w_friend, w_quality, quality_cap,
            w_stage, scored_window_days, diversity_window, max_same_creator_in_window, max_anonymous_in_window, page_size, promo_daily_cap,
            promo_units_per_page, promo_feed_position, created_by, reason) values ('promotions', 2, false, 1, 24, 0.5, 0.2, 20, 0, 14, 5, 2, 2, 20, 10, 1, 3, 'x', 'x') $q$),
  'ERR:42501', '[F13.2-a c7 BR-059] a client adds no version (a change is a migration)');
select is(tests.fx_promo_text($q$ select string_agg(conname, ',' order by conname) from pg_constraint
            where conrelid = 'nestly.algorithm_configurations'::regclass and conname in ('algorithm_configurations_promotions_check', 'algorithm_configurations_promo_daily_cap_check')
              and convalidated $q$),
  'algorithm_configurations_promo_daily_cap_check,algorithm_configurations_promotions_check',
  '[F13.2-a c7] the cap is bounded (1 to 100, the paid-event limit) and set exactly on a promotions row');


select * from finish();
rollback;
