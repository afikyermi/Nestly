-- pgTAP, run by pg_prove as app_server (CI `db` job, I6: the Admin's management of status guides, FR-ADMIN-012).
-- Expected values come from the SRS (FR-ADMIN-012 "Actor: Admin", BR-070, BR-026, AC-095, §3.1-§3.2), not the migration text.
-- People: D = 60_'s fr_d (Admin), M0 = fr_m (Moderator, no key), M3 = 90_'s sf_m3 (Moderator holding all fourteen assignable keys),
-- A = a Regular, P = a Professional. No Permission Key covers guides, so a Moderator with every key is still refused.
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F6.1-a c1 I6 fixture] session_user is app_server (this file must not run under another login)');

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'p' then tests.fx_id('p')
    when 'd' then tests.fx_fr_id('fr_d') when 'm0' then tests.fx_fr_id('fr_m') when 'm3' then tests.fx_sf_id('sf_m3')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;

select tests.fx_sf_grant(pg_temp.id('m3'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW',
  'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS', 'PRIVATE_GROUP_MODERATE']);
select is(tests.fx_sg_count('draft'), 9::bigint, '[F6.1-a c1] nine seed drafts exist');

-- ---- who reads drafts -----------------------------------------------------------------------------------------------------------
select is(pg_temp.n('d', 'nestly.status_guides'), '9', '[F6.1-a c2 FR-ADMIN-012] the Admin reads every guide, drafts included');
select is(pg_temp.n('a', 'nestly.status_guides'), '0', '[F6.1-a c2 AC-095] a user reads no draft');
select is(pg_temp.n('p', 'nestly.status_guides'), '0', '[F6.1-a c2 AC-095] a Professional reads no draft');
select is(pg_temp.n('m0', 'nestly.status_guides'), '0', '[F6.1-a c2 §3.2] a Moderator with no key reads no draft');
select is(pg_temp.n('m3', 'nestly.status_guides'), '0', '[F6.1-a c2 §3.2] a Moderator with all fourteen keys reads no draft');

-- ---- who writes -----------------------------------------------------------------------------------------------------------------
select is(pg_temp.dml('d', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'מדריך חדש', 'גוף המדריך', 'משרד הבריאות') $$), 'OK:1',
  '[F6.1-a c3 FR-ADMIN-012] the Admin creates a guide');
select is(pg_temp.n('d', $$nestly.status_guides where title = 'מדריך חדש' and status = 'draft' and published_at is null$$), '1', '[F6.1-a c3 BR-070] a new guide is a draft with no publication time');
select is(pg_temp.dml('d', $$ insert into nestly.status_guides (stage_kind, title, body, source, status) values ('planning', 'x', 'y', 'z', 'published') $$), 'ERR:42501',
  '[F6.1-a c3 BR-070] a guide cannot be created already published (42501)');
select is(pg_temp.dml('d', $$ insert into nestly.status_guides (stage_kind, title, body, source, published_at) values ('planning', 'x', 'y', 'z', now()) $$), 'ERR:42501',
  '[F6.1-a c3] published_at cannot be sent (42501)');
select is(pg_temp.dml('d', $$ insert into nestly.status_guides (stage_kind, range_from, range_to, title, body, source) values ('pregnancy', 30, 50, 'x', 'y', 'z') $$), 'ERR:23514',
  '[F6.1-a c3] a pregnancy range past week 42 is refused (23514)');
select is(pg_temp.dml('m0', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'x', 'y', 'z') $$), 'ERR:42501', '[F6.1-a c3 §3.2] a Moderator with no key cannot create a guide (42501)');
select is(pg_temp.dml('m3', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'x', 'y', 'z') $$), 'ERR:42501', '[F6.1-a c3 §3.2] a Moderator with all keys cannot create a guide (42501)');
select is(pg_temp.dml('a', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'x', 'y', 'z') $$), 'ERR:42501', '[F6.1-a c3] a user cannot create a guide (42501)');
select is(pg_temp.dml('p', $$ insert into nestly.status_guides (stage_kind, title, body, source) values ('planning', 'x', 'y', 'z') $$), 'ERR:42501', '[F6.1-a c3] a Professional cannot create a guide (42501)');
select is(pg_temp.dml('d', $$ update nestly.status_guides set title = 'מדריך ערוך' where title = 'מדריך חדש' $$), 'OK:1', '[F6.1-a c4 FR-ADMIN-012] the Admin edits a guide');
select is(pg_temp.dml('m3', $$ update nestly.status_guides set title = 'x' $$), 'OK:0', '[F6.1-a c4 §3.2] a Moderator with all keys edits no guide (0 rows)');
select is(pg_temp.dml('m0', $$ update nestly.status_guides set status = 'published' $$), 'OK:0', '[F6.1-a c4 §3.2] a Moderator publishes nothing (0 rows)');
select is(pg_temp.dml('a', $$ update nestly.status_guides set status = 'published' $$), 'OK:0', '[F6.1-a c4 AC-095] a user publishes nothing (0 rows)');
select is(pg_temp.dml('d', $$ update nestly.status_guides set published_at = now() $$), 'ERR:42501', '[F6.1-a c4] published_at cannot be set by the Admin either (42501)');
select is(pg_temp.dml('d', $$ delete from nestly.status_guides $$), 'ERR:42501', '[F6.1-a c4] nobody deletes a guide: it is hidden (42501)');

-- ---- publishing and hiding (BR-070, AC-095) -------------------------------------------------------------------------------------
select is(pg_temp.dml('d', $$ update nestly.status_guides set status = 'published' where title = 'מדריך ערוך' $$), 'ERR:23514',
  '[F6.1-a c5 BR-070] publishing needs a source check date (23514)');
select is(pg_temp.dml('d', $$ update nestly.status_guides set status = 'published', source_checked_on = date '2026-10-21' where title = 'מדריך ערוך' $$), 'OK:1',
  '[F6.1-a c5 BR-070] the Admin publishes with a source check date');
select is(pg_temp.n('d', $$nestly.status_guides where status = 'published' and published_at is not null$$), '1', '[F6.1-a c5] the database stamped the publication time');
select is(pg_temp.n('a', 'nestly.status_guides'), '1', '[F6.1-a c5 AC-095] a user now reads that one guide');
select is(pg_temp.n('m3', 'nestly.status_guides'), '1', '[F6.1-a c5 AC-095] and so does a Moderator, as a user (published only)');
select is(pg_temp.dml('d', $$ update nestly.status_guides set status = 'hidden' where status = 'published' $$), 'OK:1', '[F6.1-a c5] the Admin hides it');
select is(pg_temp.n('a', 'nestly.status_guides'), '0', '[F6.1-a c5 AC-095] no user reads a hidden guide');
select is(pg_temp.n('d', $$nestly.status_guides where status = 'hidden'$$), '1', '[F6.1-a c5] the Admin still reads it');
select is(pg_temp.dml('d', $$ update nestly.status_guides set status = 'draft' where status = 'hidden' $$), 'OK:1', '[F6.1-a c5] and puts it back to a draft');
select is(pg_temp.n('d', $$nestly.status_guides where status = 'draft' and published_at is null$$), '10', '[F6.1-a c5] a draft has no publication time');

-- ---- the Audit Log (BR-026, FR-ADMIN-012 "Audit לכל פרסום, הסתרה ועריכה") ------------------------------------------------------
select is(tests.fx_sf_audit('guide_created'), 1::bigint, '[F6.1-a c6 BR-026] the creation is in the Audit Log');
select is(tests.fx_sf_audit('guide_edited'), 1::bigint, '[F6.1-a c6 BR-026] the edit is in the Audit Log');
select is(tests.fx_sf_audit('guide_published'), 1::bigint, '[F6.1-a c6 BR-026] the publication is in the Audit Log');
select is(tests.fx_sf_audit('guide_hidden'), 1::bigint, '[F6.1-a c6 BR-026] the hiding is in the Audit Log');
select is(tests.fx_sf_audit('guide_unpublished'), 1::bigint, '[F6.1-a c6 BR-026] the return to a draft is in the Audit Log');
select is((select actor_id::text from tests.fx_audit_rows() where action = 'guide_published'), pg_temp.id('d')::text, '[F6.1-a c6 BR-026] with the Admin as actor');
select is((select actor_role || ':' || target_kind || ':' || coalesce(permission_key, '-') from tests.fx_audit_rows() where action = 'guide_published'), 'admin:guide:-',
  '[F6.1-a c6 BR-026] role admin, target a guide, no assignable key');
select is((select (before_state->>'status') || '>' || (after_state->>'status') from tests.fx_audit_rows() where action = 'guide_published'), 'draft>published', '[F6.1-a c6] Before and After carry the status');
select is((select count(*) from tests.fx_audit_rows() where action like 'guide\_%' and (before_state::text like '%גוף המדריך%' or after_state::text like '%גוף המדריך%')), 0::bigint,
  '[F6.1-a c6] the log carries the guide''s length, never its text');
select is((select (after_state->>'bodyChanged') from tests.fx_audit_rows() where action = 'guide_edited'), 'false', '[F6.1-a c6] an edit says whether the text changed');

-- ---- a stopped Admin writes nothing ---------------------------------------------------------------------------------------------
select tests.set_status(pg_temp.id('d'), 'suspended');
select is(pg_temp.n('d', 'nestly.status_guides'), '0', '[F6.1-a c7 rule 15] a suspended Admin reads no draft');
select is(pg_temp.dml('d', $$ update nestly.status_guides set title = 'x' $$), 'OK:0', '[F6.1-a c7 rule 15] and edits nothing');
select tests.set_status(pg_temp.id('d'), 'active');

select * from finish();
rollback;
