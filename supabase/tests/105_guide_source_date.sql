-- pgTAP, run by pg_prove as app_server (CI `db` job; I14 completion B follow-up, FR-ADMIN-012). Expected values come from the SRS
-- (FR-ADMIN-012: "תאריך בדיקת המקורות אינו תנאי לפרסום", Afik 21.10.2026 decision 11.8; BR-070: the Admin alone publishes; AC-095), not the
-- migration text. People: D = 60_'s fr_d (Admin), M3 = 90_'s sf_m3 (Moderator with every assignable key), A = a Regular.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F14.4-a c0] [FR-ADMIN-012] session_user is app_server (this file must not run under another login)');

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p when 'a' then tests.fx_id('a') when 'd' then tests.fx_fr_id('fr_d') when 'm3' then tests.fx_sf_id('sf_m3') end
$f$;
create function pg_temp.dml(p_who text, p_sql text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, true)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;

select tests.fx_sf_grant(pg_temp.id('m3'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW',
  'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS', 'PRIVATE_GROUP_MODERATE']);

select is((select count(*)::int from pg_catalog.pg_constraint where conname = 'status_guides_published_check'), 0,
  '[F14.4-a c1] [FR-ADMIN-012] the CHECK that required a source date to publish is gone');
select is((select count(*)::int from pg_catalog.pg_constraint where conname = 'status_guides_published_at_check'), 1,
  '[F14.4-a c1] [FR-ADMIN-012] a published guide still needs its publication time');

select is(pg_temp.dml('d', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'מדריך בלי תאריך', 'גוף', 'מקור') $$), 'OK:1',
  '[F14.4-a c2] [FR-ADMIN-012] control: the Admin writes a draft with no source date');
select is(pg_temp.n('a', $$nestly.status_guides where title = 'מדריך בלי תאריך'$$), '0', '[AC-095 c2] a user reads no draft');
select is(pg_temp.dml('m3', $$ update nestly.status_guides set status = 'published' where title = 'מדריך בלי תאריך' $$), 'OK:0',
  '[BR-070 §3.2 c3] a Moderator with every key still publishes nothing (0 rows)');
select is(pg_temp.dml('d', $$ update nestly.status_guides set status = 'published' where title = 'מדריך בלי תאריך' $$), 'OK:1',
  '[F14.4-a c3] [FR-ADMIN-012] the Admin publishes it with no source check date (Afik 21.10.2026)');
select is(pg_temp.n('d', $$nestly.status_guides where title = 'מדריך בלי תאריך' and status = 'published' and published_at is not null and source_checked_on is null$$), '1',
  '[F14.4-a c3] [FR-ADMIN-012] published, the database stamped the time, and the source date stays empty');
select is(pg_temp.n('a', $$nestly.status_guides where title = 'מדריך בלי תאריך'$$), '1', '[AC-095 c3] a user now reads it');

select * from finish();
rollback;
