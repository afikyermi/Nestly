-- pgTAP, run by pg_prove as app_server (CI `db` job; I13 follow-up, FR-ALG-007 / BR-059 / §3.2). Expected values come from the SRS
-- (FR-ALG-007: the settings of promoted units are the Admin's; BR-059: every version with a reason, audited; §3.2: BILLING_FINANCE_MANAGE is
-- Admin Only; FR-ADMIN-005: the Audit Log), not the migration text. People: D = 60_'s fr_d (Admin), M4 = 90_'s sf_m4 (a Moderator, given
-- CONTENT_MODERATE and AUDIT_LOG_VIEW here), M5 = sf_m5 (a Moderator with no audit key), A = a Regular. Everything rolls back.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F13.3-a c0] session_user is app_server (this file must not run under another login)');

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'd' then tests.fx_fr_id('fr_d') when 'm4' then tests.fx_sf_id('sf_m4') when 'm5' then tests.fx_sf_id('sf_m5') end
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;

select tests.fx_sf_grant(pg_temp.id('m4'), array['CONTENT_MODERATE', 'AUDIT_LOG_VIEW']);

-- c1: the numbers stay readable by every active account (the promoted units and the frequency cap read the newest version as the viewer)
select is(pg_temp.q('a', $q$ select string_agg(version || ':' || daily_cap || ':' || feed_gap_min || ':' || feed_gap_max, ',') from nestly.promotion_settings $q$),
  '1:3:4:7', '[F13.3-a c1] [FR-ALG-007] a Regular reads the numbers of the settings in force');

-- c2: the free-text reason and the time are nobody's through the table
select is(pg_temp.q('a', 'select count(reason)::text from nestly.promotion_settings'), 'ERR:42501', '[F13.3-a c2] [BR-059] a Regular reads no reason');
select is(pg_temp.q('a', 'select count(created_at)::text from nestly.promotion_settings'), 'ERR:42501', '[F13.3-a c2] [BR-059] nor when a version was added');
select is(pg_temp.q('m5', 'select count(reason)::text from nestly.promotion_settings'), 'ERR:42501', '[F13.3-a c2] [§3.2] nor a Moderator');
select is(pg_temp.q('d', 'select count(reason)::text from nestly.promotion_settings'), 'ERR:42501', '[F13.3-a c2] [FR-ADMIN-005] the Admin too reads it in the Audit Log, not here');

-- c3: the Admin still adds a version with a reason (RETURNING the version only), and the reason is in its Audit Log entry
select is(pg_temp.dml('d', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (4, 1, 5, 7, 25, 250, 'סיבה לבדיקה') returning version $q$), 'OK:1', '[F13.3-a c3] [BR-059] the Admin adds a version and gets its number');
select is(pg_temp.dml('m4', $q$ insert into nestly.promotion_settings (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
            values (4, 1, 5, 7, 25, 250, 'x') $q$), 'ERR:42501', '[F13.3-a c3] [§3.2] a Moderator adds none (BILLING_FINANCE_MANAGE is Admin Only)');
select is(pg_temp.q('d', $q$ select count(*)::text from nestly.audit_log where action = 'promotion_settings_changed' and reason = 'סיבה לבדיקה' and occurred_at is not null $q$),
  '1', '[F13.3-a c3] [FR-ADMIN-005] the Admin reads the reason and the time in the Audit Log');
select is(pg_temp.q('m4', $q$ select count(*)::text from nestly.audit_log where action = 'promotion_settings_changed' and reason = 'סיבה לבדיקה' $q$),
  '1', '[F13.3-a c3] [FR-ADMIN-005] as does a Moderator who holds AUDIT_LOG_VIEW (the Audit Log''s own rule)');
select is(pg_temp.q('a', $q$ select count(*)::text from nestly.audit_log where action = 'promotion_settings_changed' $q$), '0', '[F13.3-a c3] a Regular reads no entry');
select is(pg_temp.q('m5', $q$ select count(*)::text from nestly.audit_log where action = 'promotion_settings_changed' $q$), '0', '[F13.3-a c3] nor a Moderator without AUDIT_LOG_VIEW');

select * from finish();
rollback;
