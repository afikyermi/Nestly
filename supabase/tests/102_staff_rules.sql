-- pgTAP, run by pg_prove as app_server (CI `db` job, I14 completion B: Afik's decisions of 21.10.2026 (b), decisions-in-force.md §10.2-10.4,
-- §10.7 and §10 item 9). Expected values come from those decisions and the SRS (FR-MOD-001/002/003, BR-074, BR-076, BR-080, BR-081, BR-082,
-- FR-ADMIN-008, FR-ADMIN-015, FR-PRIV-001, NFR-MEDIA-001; AC-131, AC-132, AC-153, AC-155, AC-159..AC-163, VAL-050), not the migration text.
-- People: a, b = Regular (10_), p = Professional, c = fr_c, e = gr_e (Regular), d = fr_d (Admin), m0 = fr_m (Moderator, no key),
-- m1 = sf_m1 (REPORTS_VIEW), m2 = sf_m2 (REPORTS_VIEW + PRIVATE_GROUP_MODERATE + CONTENT_MODERATE), m3 = sf_m3 (every assignable key but
-- CHILD_DATA_VIEW), m4 = sf_m4 (CHILD_DATA_VIEW), m5 = sf_m5 (REPORTS_VIEW + CONTENT_MODERATE); r01 .. r20 = the staff-work fixture's parents
-- (sw_p01 .. sw_p20), the people who report. The job role app_media_jobs through tests.media_dml / media_as (93_ fixtures).
-- Everything rolls back with the transaction (so every staff opening shares this one transaction id: the "before" checks come first).

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[I14c-B c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();
select tests.fx_gr_build();
select tests.fx_sw_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case
    when p = 'a' then tests.fx_id('a') when p = 'b' then tests.fx_id('b') when p = 'p' then tests.fx_id('p')
    when p = 'c' then tests.fx_fr_id('fr_c') when p = 'm0' then tests.fx_fr_id('fr_m') when p = 'd' then tests.fx_fr_id('fr_d')
    when p = 'e' then tests.fx_gr_id('gr_e')
    when p = 'm1' then tests.fx_sf_id('sf_m1') when p = 'm2' then tests.fx_sf_id('sf_m2') when p = 'm3' then tests.fx_sf_id('sf_m3')
    when p = 'm4' then tests.fx_sf_id('sf_m4') when p = 'm5' then tests.fx_sf_id('sf_m5')
    when p ~ '^r[0-2][0-9]$' then tests.fx_sw_id('sw_p' || substr(p, 2, 2))
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
create function pg_temp.toid(p_t text) returns oid language sql as $f$
  select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = p_t
$f$;
-- a report of one kind by one person, as that person (the reporter's own insert, every trigger on it as in the product)
create function pg_temp.report(p_who text, p_kind text, p_target uuid, p_reason text default 'harassment') returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.reports (target_kind, %s, reason) values (%L, %L, %L) $q$,
    case p_kind when 'post' then 'post_id' when 'comment' then 'comment_id' when 'listing' then 'listing_id' end, p_kind, p_target, p_reason))
$f$;
-- people r(p_from) .. r(p_to) report the same item for the same reason
create function pg_temp.reports(p_from int, p_to int, p_kind text, p_target uuid, p_reason text default 'harassment') returns text language sql as $f$
  select string_agg(pg_temp.report('r' || lpad(i::text, 2, '0'), p_kind, p_target, p_reason), ',' order by i) from generate_series(p_from, p_to) as i
$f$;
create function pg_temp.close(p_who text, p_col text, p_target uuid, p_resolution text) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.reports set status = 'handled', resolution = %L where %I = %L and status = 'open' $q$, p_resolution, p_col, p_target))
$f$;
create function pg_temp.trends(p_who text, p_metric text, p_field text, p_dim text, p_period text) returns text language sql as $f$
  select pg_temp.q(p_who, format($q$ select coalesce(string_agg(bucket || '=' || coalesce(children::text, '-') || ':' || coalesce(value::text, '-') || ':' || is_suppressed::text,
    ' ' order by bucket_order), 'none') from nestly.child_tracker_trends(%L, %L, %L, %L) $q$, p_metric, p_field, p_dim, p_period))
$f$;
create function pg_temp.job(p_sql text) returns text language sql as $f$ select tests.media_dml(p_sql) $f$;

select tests.fx_sf_grant(pg_temp.id('m1'), array['REPORTS_VIEW']);
select tests.fx_sf_grant(pg_temp.id('m2'), array['REPORTS_VIEW', 'PRIVATE_GROUP_MODERATE', 'CONTENT_MODERATE']);
select tests.fx_sf_grant(pg_temp.id('m3'), array['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW',
  'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS', 'PRIVATE_GROUP_MODERATE']);
select tests.fx_sf_grant(pg_temp.id('m4'), array['CHILD_DATA_VIEW']);
select tests.fx_sf_grant(pg_temp.id('m5'), array['REPORTS_VIEW', 'CONTENT_MODERATE']);

-- ---- c1: structure ----------------------------------------------------------------------------------------------------------------
select is((select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, ', ' order by c.relname)
             from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'nestly' and c.relname in ('enforcement_records', 'report_auto_hides', 'auto_hide_scopes', 'reported_comment_views', 'profile_staff_views',
                                                         'media_fingerprints', 'suspected_image_fingerprints')),
  'auto_hide_scopes:true:true, enforcement_records:true:true, media_fingerprints:true:true, profile_staff_views:true:true, report_auto_hides:true:true, reported_comment_views:true:true, suspected_image_fingerprints:true:true',
  '[I14c-B c1 rule 8] the seven new tables carry RLS and FORCE');
select is(has_any_column_privilege('authenticated', pg_temp.toid('auto_hide_scopes'), 'SELECT,INSERT,UPDATE'), false,
  '[I14c-B c1 rule 17] no runtime role reads or writes the definer''s call scopes: a caller cannot make one the policies would accept');
select is(has_column_privilege('authenticated', pg_temp.toid('report_auto_hides'), 'author_id', 'SELECT') or has_column_privilege('authenticated', pg_temp.toid('report_auto_hides'), 'reason', 'SELECT'),
  false, '[I14c-B c1 rule 20] no client reads a hide''s author (an anonymous post''s real author) or its reason, staff included');
select is((select string_agg(p.polname || ':' || p.polcmd::text, ', ' order by p.polname) from pg_catalog.pg_policy p where p.polrelid = pg_temp.toid('enforcement_records')),
  'enforcement_records_insert_staff:a, enforcement_records_select_staff:r', '[I14c-B c1 AC-159] the enforcement history: one read, one write, no UPDATE or DELETE');
select is(has_table_privilege('authenticated', pg_temp.toid('enforcement_records'), 'UPDATE') or has_table_privilege('authenticated', pg_temp.toid('enforcement_records'), 'DELETE'),
  false, '[I14c-B c1 AC-159] nobody edits or deletes a record');
select is(has_any_column_privilege('authenticated', pg_temp.toid('media_fingerprints'), 'INSERT,UPDATE')
       or has_any_column_privilege('authenticated', pg_temp.toid('suspected_image_fingerprints'), 'INSERT,UPDATE')
       or has_any_column_privilege('anon', pg_temp.toid('suspected_image_fingerprints'), 'SELECT,INSERT,UPDATE'),
  false, '[I14c-B c1 AC-162 NFR-MEDIA-001] no client writes a hash or the block list (staff only clear a false positive, c8)');
select is((select p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' || p.proowner::regrole::text
             from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'identical_reports_hide'),
  'true:search_path="":app_owner', '[I14c-B c1 rule 17] identical_reports_hide is a SECURITY DEFINER owned by app_owner with a pinned search_path');
select is((select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
             cross join (values ('anon'), ('authenticated'), ('app_server'), ('app_jobs'), ('app_media_jobs')) as r(rolname)
            where n.nspname = 'nestly' and p.proname in ('identical_reports_hide', 'content_staff_delete', 'report_auto_hides_lift', 'auto_hide_scoped')
              and has_function_privilege(r.rolname, p.oid, 'EXECUTE')),
  0::bigint, '[I14c-B c1 rule 10] no runtime role executes the new trigger functions');
select is((select string_agg(p.polname, ', ' order by p.polname) from pg_catalog.pg_policy p
            where p.polname like '%\_auto\_hide' and p.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'app_owner')]::oid[]),
  'comments_select_auto_hide, marketplace_listings_select_auto_hide, post_authors_select_auto_hide, posts_select_auto_hide, professional_articles_select_auto_hide, professional_reviews_select_auto_hide, reports_select_auto_hide',
  '[I14c-B c1 rule 17] the definer reads only through its seven scoped TO app_owner policies');

-- ---- c2: a justified report deletes the content; the enforcement history (FR-MOD-003, BR-080, OP-053, AC-131, AC-159) -------------
select set_config('t.p1', pg_temp.q('a', format($q$ insert into nestly.posts (audience, body) values ('everyone', %L) returning id::text $q$,
  'A post whose text runs past one hundred characters so that the enforcement record keeps only its first hundred of them, no more.')), true);
select is(pg_temp.report('b', 'post', pg_temp.g('p1'), 'spam'), 'OK:1', '[I14c-B c2] control: B reports the post');
select is(pg_temp.dml('m5', format($q$ delete from nestly.posts where id = %L $q$, pg_temp.g('p1'))), 'OK:0',
  '[I14c-B c2 FR-MOD-003] staff cannot delete reported content before closing its report as justified');
select is(pg_temp.close('m1', 'post_id', pg_temp.g('p1'), 'action_taken'), 'OK:0', '[I14c-B c2 AC-022] REPORTS_VIEW alone closes nothing');
select is(pg_temp.dml('m5', $$ select set_config('nestly.audit_reason', 'harassing the community', true) $$) || '/' || pg_temp.close('m5', 'post_id', pg_temp.g('p1'), 'action_taken'),
  'OK:1/OK:1', '[I14c-B c2] CONTENT_MODERATE closes it as justified');
select is(pg_temp.dml('a', format($q$ delete from nestly.enforcement_records where target_id = %L $q$, pg_temp.g('p1'))), 'ERR:42501',
  '[I14c-B c2] (a community user holds no DELETE on the history)');
select is(pg_temp.dml('m5', format($q$ delete from nestly.posts where id = %L $q$, pg_temp.g('p1'))), 'OK:1',
  '[I14c-B c2 FR-MOD-003 OP-053 AC-131] in the same transaction, the justified decision deletes the post');
select is(tests.fx_sw_count(format('nestly.posts where id = %L', pg_temp.g('p1'))), 0::bigint, '[I14c-B c2 AC-131] it is gone for everyone, its author too');
select is(pg_temp.staff('m3', format($q$ select user_id::text || '|' || target_kind || '|' || rule || '|' || char_length(excerpt) || '|' || (decided_by = %L)::text
                                         from nestly.enforcement_records where target_id = %L $q$, pg_temp.id('m5'), pg_temp.g('p1'))),
  pg_temp.id('a')::text || '|post|spam|100|true', '[I14c-B c2 AC-159 FR-MOD-002] the record: the author, the type, the rule, at most 100 characters, the decider');
select is(pg_temp.q('a', 'select count(*)::text from nestly.enforcement_records') || '/' || pg_temp.q('m5', 'select count(*)::text from nestly.enforcement_records')
       || '/' || pg_temp.q('m0', 'select count(*)::text from nestly.enforcement_records'), '0/0/0',
  '[I14c-B c2 AC-159] the author, a Moderator without USER_VIEW and one with no key read no record');
select is(pg_temp.q('d', format($q$ select count(*)::text from nestly.enforcement_records where target_id = %L $q$, pg_temp.g('p1'))), '1', '[I14c-B c2 AC-159] the Admin reads it');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'content_deleted' and target_id = %L and permission_key = 'CONTENT_MODERATE' and target_kind = 'post'$q$,
  pg_temp.g('p1'))), 1::bigint, '[I14c-B c2 NFR-AUDIT-001] the deletion is in the Audit Log');
select is(pg_temp.dml('m5', $$ insert into nestly.enforcement_records (user_id, target_kind, target_id, rule, excerpt) values (null, 'post', gen_random_uuid(), 'spam', 'x') $$),
  'ERR:42501', '[I14c-B c2 AC-159] a record cannot be written by hand, without a justified report');
select set_config('t.p5', pg_temp.q('a', $$ insert into nestly.posts (audience, body) values ('everyone', 'fifth post') returning id::text $$), true);
select is(pg_temp.report('b', 'post', pg_temp.g('p5'), 'harassment') || '/' || pg_temp.report('c', 'post', pg_temp.g('p5'), 'spam')
       || '/' || pg_temp.dml('m5', format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where post_id = %L and reporter_id = %L $q$, pg_temp.g('p5'), pg_temp.id('b'))),
  'OK:1/OK:1/OK:1', '[I14c-B c2] control: two reports on a post, one closed as justified');
select is(pg_temp.dml('m5', format($q$ insert into nestly.enforcement_records (user_id, target_kind, target_id, rule, excerpt, report_id)
                                      select %L, 'post', %L, 'harassment', 'fifth post', r.id from nestly.reports r where r.post_id = %L and r.reporter_id = %L $q$,
                                    pg_temp.id('b'), pg_temp.g('p5'), pg_temp.g('p5'), pg_temp.id('b'))), 'ERR:42501',
  '[I14c-B c2 AC-159] even with a justified report, a record naming another account than the author is refused');
select is(pg_temp.dml('m5', format($q$ insert into nestly.enforcement_records (user_id, target_kind, target_id, rule, excerpt, report_id)
                                      select %L, 'post', %L, 'harassment', 'fifth post', r.id from nestly.reports r where r.post_id = %L and r.reporter_id = %L $q$,
                                    pg_temp.id('a'), gen_random_uuid(), pg_temp.g('p5'), pg_temp.id('b'))), 'ERR:42501',
  '[I14c-B c2 AC-159] and so is one naming another item than the report''s');
select is(pg_temp.dml('m5', format($q$ delete from nestly.posts where id = %L $q$, pg_temp.g('p5'))), 'OK:1',
  '[I14c-B c2] the post is deleted though another report on it was still open');
select is(pg_temp.staff('m1', format($q$ select string_agg(status, ',' order by status) from nestly.reports where reporter_id in (%L, %L) and post_id is null and reason in ('harassment', 'spam') and target_kind = 'post' and created_at = now() $q$,
  pg_temp.id('b'), pg_temp.id('c'))) ~ 'expired', true, '[I14c-B c2 FR-MOD-003] that other report expired with the post');

-- a post with an open report on one of its comments: the comment's report expires with the post
select set_config('t.p2', pg_temp.q('a', $$ insert into nestly.posts (audience, body) values ('everyone', 'second post') returning id::text $$), true);
select set_config('t.c2', pg_temp.q('c', format($q$ insert into nestly.comments (post_id, body) values (%L, 'a comment under it') returning id::text $q$, pg_temp.g('p2'))), true);
select is(pg_temp.report('b', 'comment', pg_temp.g('c2')) || '/' || pg_temp.report('e', 'post', pg_temp.g('p2')), 'OK:1/OK:1', '[I14c-B c2] control: its comment and the post are reported');
select is(pg_temp.close('m5', 'post_id', pg_temp.g('p2'), 'action_taken') || '/' || pg_temp.dml('m5', format($q$ delete from nestly.posts where id = %L $q$, pg_temp.g('p2'))),
  'OK:1/OK:1', '[I14c-B c2] the post is deleted though a report on its comment was still open');
select is(pg_temp.staff('m1', format($q$ select status || ':' || (comment_id is null)::text from nestly.reports where reporter_id = %L and target_kind = 'comment' and thread_post_id is null $q$,
  pg_temp.id('b'))), 'expired:true', '[I14c-B c2 FR-MOD-003] the comment''s report expired with its content (nothing left to open)');
select set_config('t.p4', pg_temp.q('a', $$ insert into nestly.posts (audience, body) values ('everyone', 'fourth post') returning id::text $$), true);
select is(pg_temp.report('e', 'post', pg_temp.g('p4')) || '/' || pg_temp.dml('m5', format($q$ update nestly.reports set status = 'expired' where post_id = %L and status = 'open' $q$, pg_temp.g('p4'))),
  'OK:1/ERR:42501', '[I14c-B c2] (staff never expire a report by hand)');
-- dismissed: nothing is deleted
select set_config('t.p3', pg_temp.q('a', $$ insert into nestly.posts (audience, body) values ('everyone', 'third post') returning id::text $$), true);
select is(pg_temp.report('b', 'post', pg_temp.g('p3')) || '/' || pg_temp.close('m5', 'post_id', pg_temp.g('p3'), 'dismissed'), 'OK:1/OK:1', '[I14c-B c2] control: reported and dismissed');
select is(pg_temp.dml('m5', format($q$ delete from nestly.posts where id = %L $q$, pg_temp.g('p3'))), 'OK:0', '[I14c-B c2 FR-MOD-003] a dismissed report deletes nothing');
select is(pg_temp.q('e', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('p3'))), '1', '[I14c-B c2] and the post is there for everyone');
-- a listing: MARKETPLACE_MODERATE, and the record keeps its title
select set_config('t.l1', pg_temp.q('a', $$ insert into nestly.marketplace_listings (title, category, item_condition, price, city) values ('Blue stroller', 'strollers', 'good', 300, 'center') returning id::text $$), true);
select is(pg_temp.report('b', 'listing', pg_temp.g('l1'), 'spam'), 'OK:1', '[I14c-B c2] control: B reports the listing');
select is(pg_temp.close('m5', 'listing_id', pg_temp.g('l1'), 'action_taken'), 'OK:0', '[I14c-B c2 §3.2] CONTENT_MODERATE does not handle a listing');
select is(pg_temp.close('m3', 'listing_id', pg_temp.g('l1'), 'action_taken') || '/' || pg_temp.dml('m3', format($q$ delete from nestly.marketplace_listings where id = %L $q$, pg_temp.g('l1'))),
  'OK:1/OK:1', '[I14c-B c2 OP-053] MARKETPLACE_MODERATE closes it as justified and deletes the listing');
select is(pg_temp.staff('m3', format($q$ select target_kind || '|' || excerpt || '|' || (user_id = %L)::text from nestly.enforcement_records where target_id = %L $q$, pg_temp.id('a'), pg_temp.g('l1'))),
  'listing|Blue stroller|true', '[I14c-B c2 AC-159] a listing''s record keeps its title and its owner');

-- ---- c3: ten or more identical reports hide the item until a decision (BR-074, AC-160) ------------------------------------------
select set_config('t.q1', pg_temp.q('a', $$ insert into nestly.posts (audience, body) values ('everyone', 'a post many people report') returning id::text $$), true);
select set_config('t.k1', pg_temp.q('c', format($q$ insert into nestly.comments (post_id, body) values (%L, 'a comment many people report') returning id::text $q$, pg_temp.g('q1'))), true);
select is(pg_temp.reports(1, 9, 'comment', pg_temp.g('k1')), 'OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1', '[I14c-B c3] control: nine people report the comment, same reason');
select is(pg_temp.report('r10', 'comment', pg_temp.g('k1'), 'spam'), 'OK:1', '[I14c-B c3] control: a tenth, for another reason');
select is(pg_temp.q('e', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1'))), '1',
  '[I14c-B c3 AC-160] nine identical reports (and one different) hide nothing');
select is(pg_temp.report('r01', 'comment', pg_temp.g('k1')), 'ERR:23505', '[I14c-B c3 ERR-046] a repeat by the same person is no new report');
select is(pg_temp.q('e', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1'))), '1', '[I14c-B c3 AC-160] and counts nobody new');
select is(pg_temp.report('r11', 'comment', pg_temp.g('k1')), 'OK:1', '[I14c-B c3 AC-132] the tenth person with the same reason gets the same answer as everyone');
select is(pg_temp.q('e', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1'))), '0',
  '[I14c-B c3 BR-074 AC-160] ten different people with the same reason: the comment is hidden from everyone else');
select is(pg_temp.q('c', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1')))
       || '/' || pg_temp.q('r05', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1')))
       || '/' || pg_temp.q('r10', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1'))), '1/1/1',
  '[I14c-B c3 AC-132] its author and the people who reported it see no change (no learning)');
select is(pg_temp.q('c', 'select count(*)::text from nestly.report_auto_hides') || '/' || pg_temp.q('r05', 'select count(*)::text from nestly.report_auto_hides'),
  '0/0', '[I14c-B c3 AC-132] and cannot read the hide either');
select is(pg_temp.staff('m0', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1'))), '1', '[I14c-B c3 BR-081] staff see the hidden item');
select is(pg_temp.staff('m1', format($q$ select (hidden_until <= now() + interval '90 days')::text from nestly.report_auto_hides where comment_id = %L $q$, pg_temp.g('k1'))),
  'true', '[I14c-B c3 BR-080] the hide lasts at most 90 days');
select is(pg_temp.dml('r05', format($q$ delete from nestly.report_auto_hides where comment_id = %L $q$, pg_temp.g('k1'))), 'OK:0', '[I14c-B c3] a community user lifts no hide');
select is(pg_temp.close('m5', 'comment_id', pg_temp.g('k1'), 'dismissed'), 'OK:11', '[I14c-B c3] control: staff dismiss the eleven reports');
select is(pg_temp.q('e', format($q$ select count(*)::text from nestly.comments where id = %L $q$, pg_temp.g('k1'))), '1', '[I14c-B c3 FR-MOD-003] a dismissed report restores the item');
-- a post (an anonymous one: its real author still sees it)
select set_config('t.q2', pg_temp.q('a', $$ insert into nestly.posts (audience, body, is_anonymous) values ('everyone', 'an anonymous post many report', true) returning id::text $$), true);
select is(pg_temp.reports(1, 10, 'post', pg_temp.g('q2'), 'sexual_violent_hateful'), 'OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1', '[I14c-B c3] control: ten people report the post');
select is(pg_temp.q('e', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('q2')))
       || '/' || pg_temp.q('a', format($q$ select count(*)::text from nestly.posts where id = %L $q$, pg_temp.g('q2'))), '0/1',
  '[I14c-B c3 AC-160 rule 20] hidden from everyone else; the anonymous author still sees it');
select is(pg_temp.staff('m1', format($q$ select author_id::text from nestly.report_auto_hides where post_id = %L $q$, pg_temp.g('q2')))
       || '/' || pg_temp.q('e', format($q$ select author_id::text from nestly.report_auto_hides where post_id = %L $q$, pg_temp.g('q2'))), 'ERR:42501/ERR:42501',
  '[I14c-B c3 rule 20 AC-077] the real author it keeps is no one''s to read: not staff (only the audited reveal names it), not a reader');
select is(pg_temp.staff('m1', format($q$ select count(*)::text from nestly.report_auto_hides where post_id = %L and hidden_until > now() $q$, pg_temp.g('q2'))), '1',
  '[I14c-B c3] staff see that the post is hidden, and until when');
select is(pg_temp.q('e', format($q$ select (select count(*) from nestly.reports where post_id = %L)::text || '/' || (select count(*) from nestly.posts where id = %L)::text
                                   from (select set_config('nestly.auto_hide_target', %L, true)) s $q$, pg_temp.g('q2'), pg_temp.g('q2'), pg_temp.g('q2'))), '0/0',
  '[I14c-B c3 rule 17] a caller naming the definer''s scope opens nothing (the scoped reads are the owner''s only)');
select is(pg_temp.close('m5', 'post_id', pg_temp.g('q2'), 'action_taken') || '/' || pg_temp.dml('m5', format($q$ delete from nestly.posts where id = %L $q$, pg_temp.g('q2'))),
  'OK:10/OK:1', '[I14c-B c3] a justified decision deletes the hidden post');
select is(pg_temp.staff('m3', format($q$ select (user_id is null)::text || '|' || rule from nestly.enforcement_records where target_id = %L $q$, pg_temp.g('q2'))),
  'true|sexual_violent_hateful', '[I14c-B c3 rule 20] an anonymous post''s record names no author');

-- ---- c4: every opening of a reported comment is audited (Afik 21.10.2026, AC-161) -----------------------------------------------
select set_config('t.k2', pg_temp.q('c', format($q$ insert into nestly.comments (post_id, body) values (%L, 'one reported comment') returning id::text $q$, pg_temp.g('p3'))), true);
select set_config('t.rk2', tests.fx_rp_add(pg_temp.id('b'), 'comment', pg_temp.g('k2'))::text, true);
select set_config('t.rp3', (select tests.fx_rp_id(pg_temp.id('b'), pg_temp.g('p3')))::text, true);
select is(pg_temp.dml('m1', format($q$ insert into nestly.reported_comment_views (report_id) values (%L) $q$, pg_temp.g('rk2'))), 'OK:1',
  '[I14c-B c4 AC-161] REPORTS_VIEW records its opening of a reported comment');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'reported_comment_viewed' and target_id = %L and permission_key = 'REPORTS_VIEW'$q$, pg_temp.g('rk2'))), 1::bigint,
  '[I14c-B c4 AC-161] the opening is in the Audit Log');
select is(pg_temp.dml('m1', format($q$ insert into nestly.reported_comment_views (report_id) values (%L) $q$, pg_temp.g('rk2'))), 'OK:1', '[I14c-B c4 AC-161] every opening, again');
select is(pg_temp.close('m5', 'comment_id', pg_temp.g('k2'), 'dismissed') || '/' || pg_temp.dml('m1', format($q$ insert into nestly.reported_comment_views (report_id) values (%L) $q$, pg_temp.g('rk2'))),
  'OK:1/OK:1', '[I14c-B c4 AC-161] and after the report is closed');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'reported_comment_viewed' and target_id = %L$q$, pg_temp.g('rk2'))), 3::bigint, '[I14c-B c4] three openings, three entries');
select is(pg_temp.dml('m1', format($q$ insert into nestly.reported_comment_views (report_id) values (%L) $q$, pg_temp.g('rp3'))), 'ERR:42501',
  '[I14c-B c4] only a comment report (a post''s opening is recorded elsewhere)');
select is(pg_temp.dml('m0', format($q$ insert into nestly.reported_comment_views (report_id) values (%L) $q$, pg_temp.g('rk2'))) || '/'
       || pg_temp.dml('b', format($q$ insert into nestly.reported_comment_views (report_id) values (%L) $q$, pg_temp.g('rk2'))), 'ERR:42501/ERR:42501',
  '[I14c-B c4 AC-022] without REPORTS_VIEW, and for a community user, refused');

-- ---- c5: staff open a restricted profile in full, never tracker data (BR-081, FR-PRIV-001, AC-155) ---------------------------------
select is(pg_temp.dml('r12', $$ update nestly.regular_profiles set profile_visibility = 'restricted' where user_id = auth.uid() $$), 'OK:1', '[I14c-B c5] control: a parent restricts the profile');
select is(pg_temp.q('m0', format($q$ select coalesce(gender, '-') || '|' || coalesce(child_ages::text, '-') from nestly.profile_view(%L) $q$, tests.fx_sw_id('sw_p12'))), '-|-',
  '[I14c-B c5] before its audited opening, a staff member sees the restricted view');
select is(pg_temp.dml('m0', format($q$ insert into nestly.profile_staff_views (target_id) values (%L) $q$, tests.fx_sw_id('sw_p12'))), 'OK:1',
  '[I14c-B c5 BR-081] any staff account records its opening of a profile');
select is(pg_temp.q('m0', format($q$ select coalesce(gender, '-') || '|' || coalesce(child_ages::text, '-') from nestly.profile_view(%L) $q$, tests.fx_sw_id('sw_p12'))),
  'woman|[{"years": 0, "months": 9}]', '[I14c-B c5 BR-081 AC-155] then it sees the profile in full, as a Friend does');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'staff_profile_viewed' and target_id = %L and target_kind = 'user'$q$, tests.fx_sw_id('sw_p12'))), 1::bigint,
  '[I14c-B c5] the opening is in the Audit Log');
select is((select string_agg(a, ',' order by a) from unnest((select p.proargnames from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'nestly' and p.proname = 'profile_view')) as a where a ~ '(tracker|event|birth|child_name|due)'), null,
  '[I14c-B c5 BR-081] the profile view returns no tracker data, birth date, child name or due date to anyone');
select is(pg_temp.q('e', format($q$ select coalesce(gender, '-') from nestly.profile_view(%L) $q$, tests.fx_sw_id('sw_p12'))), '-',
  '[I14c-B c5 AC-054] a community user still sees the restricted view');
select is(pg_temp.dml('e', format($q$ insert into nestly.profile_staff_views (target_id) values (%L) $q$, tests.fx_sw_id('sw_p12'))), 'ERR:42501',
  '[I14c-B c5] a community user cannot record a staff opening');

-- ---- c6: an announcement's audience (FR-ADMIN-008, OP-042, VAL-050, AC-163) ------------------------------------------------------
create function pg_temp.ann(p_title text, p_audience text, p_stage text default null) returns text language sql as $f$
  select pg_temp.q('m3', format($q$ insert into nestly.system_announcements (title, body, audience, audience_stage) values (%L, 'body', %L, %L) returning id::text $q$,
    p_title, p_audience, p_stage))
$f$;
select set_config('t.an1', pg_temp.ann('For professionals', 'professionals'), true);
select set_config('t.an2', pg_temp.ann('For the pregnant', 'stage', 'pregnant'), true);
select set_config('t.an3', pg_temp.ann('For parents', 'parents'), true);
select set_config('t.an4', pg_temp.ann('For everyone', 'everyone'), true);
select is(pg_temp.dml('m3', $$ update nestly.system_announcements set status = 'published' where status = 'draft' $$), 'OK:4', '[I14c-B c6] control: SYSTEM_ANNOUNCEMENTS publishes the four');
create function pg_temp.seen(p_who text) returns text language sql as $f$
  select pg_temp.q(p_who, format($q$ select coalesce(string_agg(title, ',' order by title), 'none') from nestly.system_announcements where id in (%L, %L, %L, %L) $q$,
    pg_temp.g('an1'), pg_temp.g('an2'), pg_temp.g('an3'), pg_temp.g('an4')))
$f$;
select is(pg_temp.seen('p'), 'For everyone,For professionals', '[I14c-B c6 AC-163] a Professional reads everyone''s and the Professionals'' announcements');
select is(pg_temp.dml('r13', $$ insert into nestly.journey_contexts (stage, due_date) values ('pregnant', current_date + 100) $$), 'OK:1', '[I14c-B c6] control: a parent is pregnant');
select is(pg_temp.seen('r13'), 'For everyone,For parents,For the pregnant', '[I14c-B c6 AC-163 AC-089] a pregnant parent reads the parents'' and the stage''s');
select is(pg_temp.seen('r14'), 'For everyone,For parents', '[I14c-B c6 AC-163] a parent of another stage does not read the stage''s');
select is(pg_temp.seen('m0'), 'For everyone', '[I14c-B c6] a staff account (without SYSTEM_ANNOUNCEMENTS) reads everyone''s only');
select is(pg_temp.seen('m3'), 'For everyone,For parents,For professionals,For the pregnant', '[I14c-B c6 AC-049] SYSTEM_ANNOUNCEMENTS reads every one');
select is(pg_temp.dml('m3', $$ insert into nestly.system_announcements (title, body, audience) values ('Stage missing', 'body', 'stage') $$), 'ERR:23514',
  '[I14c-B c6 VAL-050] a stage audience names a stage');
select is(pg_temp.dml('m3', $$ insert into nestly.system_announcements (title, body, audience, audience_stage) values ('Bad stage', 'body', 'stage', 'toddler') $$), 'ERR:23514',
  '[I14c-B c6 VAL-050] from the existing stages only');
select is(pg_temp.dml('m3', $$ insert into nestly.system_announcements (title, body, audience) values ('Bad audience', 'body', 'friends') $$), 'ERR:23514',
  '[I14c-B c6 VAL-050] and an audience from the closed list');
select is(pg_temp.dml('m3', format($q$ update nestly.system_announcements set audience = 'everyone' where id = %L $q$, pg_temp.g('an1'))), 'OK:1',
  '[I14c-B c6] a published announcement''s audience may change');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'announcement_edited' and target_id = %L and before_state ->> 'audience' = 'professionals' and after_state ->> 'audience' = 'everyone'$q$,
  pg_temp.g('an1'))), 1::bigint, '[I14c-B c6 AC-049] with Before and After in the Audit Log');

-- ---- c7: children's trends by calendar period, rounded (FR-ADMIN-015, OP-056, AC-153) ---------------------------------------------
-- the fixture's events are two and three days old: in this month from the 4th of a month, in the previous one before the 3rd
select set_config('t.per', case when extract(day from now() at time zone 'Asia/Jerusalem') >= 4 then 'this_month'
                                when extract(day from now() at time zone 'Asia/Jerusalem') <= 2 then 'last_month' else 'none' end, true);
select is(case when current_setting('t.per') = 'none' then 'girl=10:125.0:false boy=-:-:true unknown=-:-:true'
               else pg_temp.trends('m4', 'bottle', 'amount_ml', 'child_sex', current_setting('t.per')) end,
  'girl=10:125.0:false boy=-:-:true unknown=-:-:true',
  '[I14c-B c7 AC-153 OP-056] a calendar month: ten girls of ten families shown, the average to one decimal; nine boys and one family''s ten hidden');
select is(case when current_setting('t.per') = 'none' then '6-11=30' else (select substring(pg_temp.trends('d', 'bottle', 'amount_ml', 'child_age', current_setting('t.per')) from '6-11=[0-9]+')) end,
  '6-11=30', '[I14c-B c7 OP-056] the twenty-nine children of nine months are shown as 30 (rounded to the nearest 10)');
select is(pg_temp.trends('m4', 'bottle', 'amount_ml', 'week', 'this_month'), 'ERR:22023', '[I14c-B c7 OP-056] the week and month splits are gone');
select is(pg_temp.trends('m4', 'bottle', 'amount_ml', 'child_sex', 'last_90_days'), 'ERR:22023', '[I14c-B c7 OP-056] a rolling period is refused');
select is(pg_temp.trends('m3', 'bottle', 'amount_ml', 'child_sex', 'this_week'), 'ERR:42501', '[I14c-B c7 AC-153] without CHILD_DATA_VIEW, refused');
select is(pg_temp.trends('m4', 'medicine', 'events_per_day', 'child_sex', 'last_week'), 'girl=-:-:true boy=-:-:true unknown=-:-:true',
  '[I14c-B c7 BR-058] a small cell is hidden in every period');
select is(tests.fx_sw_count($q$nestly.audit_log where action = 'child_data_queried' and after_state ? 'period'$q$) >= 2, true,
  '[I14c-B c7 BR-058 AC-153] every query is in the Audit Log with its period, an all-hidden one too');

-- ---- c8: the upload block list (NFR-MEDIA-001, BR-076, AC-162) -------------------------------------------------------------------
-- a suspected image: uploaded, queued by the job, marked as suspected and rejected by staff
select set_config('t.s1', pg_temp.q('a', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/webp', 800, 600, 120000) returning id::text $$), true);
select is(pg_temp.job(format($q$ insert into nestly.media_reviews (media_id, queue_reason, scores) values (%L, 'blocked', '{}') $q$, pg_temp.g('s1')))
       || '/' || pg_temp.job(format($q$ insert into nestly.media_fingerprints (media_id, fingerprint) values (%L, 1234567890123) $q$, pg_temp.g('s1')))
       || '/' || pg_temp.job(format($q$ update nestly.media_assets set status = 'queued' where id = %L $q$, pg_temp.g('s1'))), 'OK:1/OK:1/OK:1',
  '[I14c-B c8] control: the job hashes the pending upload and queues it');
select is(pg_temp.job(format($q$ insert into nestly.suspected_image_fingerprints (fingerprint, source_media_id) values (1234567890123, %L) $q$, pg_temp.g('s1'))), 'ERR:42501',
  '[I14c-B c8 AC-162] an image not marked as suspected never enters the block list');
select is(pg_temp.dml('m2', format($q$ update nestly.media_reviews set is_suspected = true where media_id = %L $q$, pg_temp.g('s1')))
       || '/' || pg_temp.dml('m2', format($q$ update nestly.media_assets set status = 'rejected' where id = %L $q$, pg_temp.g('s1'))), 'OK:1/OK:1',
  '[I14c-B c8] control: staff mark it as suspected child abuse and reject it (M6)');
select is(pg_temp.job(format($q$ insert into nestly.suspected_image_fingerprints (fingerprint, source_media_id) values (999, %L) $q$, pg_temp.g('s1'))), 'ERR:42501',
  '[I14c-B c8] the list takes only the hash recorded for that image');
select is(pg_temp.job(format($q$ insert into nestly.suspected_image_fingerprints (fingerprint, source_media_id) values (1234567890123, %L) $q$, pg_temp.g('s1'))), 'OK:1',
  '[I14c-B c8 AC-162 NFR-MEDIA-001] its hash joins the block list');
-- a re-upload whose hash differs in two bits: rejected and held as a suspicion by the job, with no staff member
select set_config('t.s2', pg_temp.q('b', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/webp', 640, 480, 90000) returning id::text $$), true);
select is(pg_temp.job(format($q$ insert into nestly.media_fingerprints (media_id, fingerprint) values (%L, %s) $q$, pg_temp.g('s2'), 1234567890123 # 5)), 'OK:1',
  '[I14c-B c8] control: the job hashes the new upload');
select is(pg_temp.job(format($q$ insert into nestly.media_reviews (media_id, queue_reason, is_suspected) values (%L, 'hash_match', true) $q$, pg_temp.g('s2')))
       || '/' || pg_temp.job(format($q$ update nestly.media_assets set status = 'rejected', is_held = true where id = %L $q$, pg_temp.g('s2'))), 'OK:1/OK:1',
  '[I14c-B c8 AC-162 BR-076] within 6 bits of a listed hash: the upload is rejected and held as a suspicion (90 days)');
select is(pg_temp.q('b', format($q$ select status from nestly.media_assets where id = %L $q$, pg_temp.g('s2'))), 'rejected',
  '[I14c-B c8 ERR-041] the uploader sees a rejection like any other');
select is(tests.fx_sw_count(format($q$nestly.media_reviews where media_id = %L and is_suspected and suspected_by is null and purge_after > now() + interval '89 days'$q$, pg_temp.g('s2'))),
  1::bigint, '[I14c-B c8 M6] a suspicion by no staff member, kept 90 days');
select is(tests.fx_sw_count(format('nestly.user_enforcements where user_id = %L', pg_temp.id('b'))), 0::bigint, '[I14c-B c8 FR-MOD-002] and no action on the account');
-- far from every listed hash: the job cannot hold it
select set_config('t.s3', pg_temp.q('b', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/webp', 640, 480, 90000) returning id::text $$), true);
select is(pg_temp.job(format($q$ insert into nestly.media_fingerprints (media_id, fingerprint) values (%L, %s) $q$, pg_temp.g('s3'), 1234567890123 # 255)), 'OK:1',
  '[I14c-B c8] control: another upload, eight bits away');
select is(pg_temp.job(format($q$ insert into nestly.media_reviews (media_id, queue_reason, is_suspected) values (%L, 'hash_match', true) $q$, pg_temp.g('s3'))), 'ERR:42501',
  '[I14c-B c8 AC-162] no match, no suspicion');
select is(pg_temp.job(format($q$ update nestly.media_assets set status = 'rejected', is_held = true where id = %L $q$, pg_temp.g('s3'))), 'ERR:42501',
  '[I14c-B c8] and the job holds nothing on its own');
select is(pg_temp.job(format($q$ insert into nestly.media_fingerprints (media_id, fingerprint) values (%L, 1) $q$, pg_temp.g('s3'))), 'ERR:23505', '[I14c-B c8] a hash is recorded once');
select is(pg_temp.q('m2', 'select count(*)::text from nestly.suspected_image_fingerprints') || '/' || pg_temp.q('m2', 'select count(*)::text from nestly.media_fingerprints'), '0/0',
  '[I14c-B c8 NFR-MEDIA-001] staff read no hash outside the decision of a false positive');
-- the staff queue item (Afik 21.10.2026): a match is decided by CONTENT_MODERATE, confirmed or not abuse
select is(pg_temp.staff('m2', format($q$ select queue_reason || ':' || is_suspected::text || ':' || coalesce(match_decision, '-') from nestly.media_reviews where media_id = %L $q$, pg_temp.g('s2'))),
  'hash_match:true:-', '[I14c-B c8 AC-162] the match is an item in the staff queue, undecided');
select is(pg_temp.dml('m0', format($q$ update nestly.media_reviews set match_decision = 'confirmed' where media_id = %L $q$, pg_temp.g('s2'))), 'OK:0',
  '[I14c-B c8] without CONTENT_MODERATE nobody decides it');
select is(pg_temp.dml('m2', format($q$ update nestly.media_reviews set match_decision = 'confirmed' where media_id = %L $q$, pg_temp.g('s2'))), 'OK:1',
  '[I14c-B c8 AC-162] staff confirm the match: a suspicion in their name');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'media_hash_confirmed' and target_id = %L$q$, pg_temp.g('s2'))), 1::bigint, '[I14c-B c8] the decision is in the Audit Log');
select is(pg_temp.dml('m2', format($q$ update nestly.media_reviews set match_decision = 'not_abuse' where media_id = %L $q$, pg_temp.g('s2'))), 'OK:0',
  '[I14c-B c8] a match is decided once');
select is(pg_temp.job(format($q$ insert into nestly.suspected_image_fingerprints (fingerprint, source_media_id) values (%s, %L) $q$, 1234567890123 # 5, pg_temp.g('s2'))), 'OK:1',
  '[I14c-B c8 NFR-MEDIA-001] a confirmed match''s hash joins the list');
-- a third upload matches both listed hashes; staff decide it was not abuse: both leave the list, each removal audited
select set_config('t.s4', pg_temp.q('b', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/webp', 640, 480, 90000) returning id::text $$), true);
select is(pg_temp.job(format($q$ insert into nestly.media_fingerprints (media_id, fingerprint) values (%L, %s) $q$, pg_temp.g('s4'), 1234567890123 # 1))
       || '/' || pg_temp.job(format($q$ insert into nestly.media_reviews (media_id, queue_reason, is_suspected) values (%L, 'hash_match', true) $q$, pg_temp.g('s4')))
       || '/' || pg_temp.job(format($q$ update nestly.media_assets set status = 'rejected', is_held = true where id = %L $q$, pg_temp.g('s4'))), 'OK:1/OK:1/OK:1',
  '[I14c-B c8] control: a third upload matches, rejected and held');
select is(pg_temp.dml('m2', format($q$ update nestly.media_reviews set match_decision = 'not_abuse' where media_id = %L $q$, pg_temp.g('s4'))), 'OK:1',
  '[I14c-B c8 AC-162 Afik 21.10] staff decide the match was not abuse (a false positive)');
select is(tests.fx_sw_count('nestly.suspected_image_fingerprints'), 0::bigint, '[I14c-B c8 AC-162 Afik 21.10] the hashes it matched leave the list');
select is(tests.fx_sw_count($q$nestly.audit_log where action = 'media_hash_removed' and permission_key = 'CONTENT_MODERATE'$q$), 2::bigint,
  '[I14c-B c8 NFR-AUDIT-001 Afik 21.10] each removal is in the Audit Log');
select is(tests.fx_sw_count(format($q$nestly.audit_log where action = 'media_hash_not_abuse' and target_id = %L$q$, pg_temp.g('s4'))), 1::bigint, '[I14c-B c8] and the decision');
select set_config('t.s5', pg_temp.q('b', $$ insert into nestly.media_assets (kind, mime, width, height, byte_size) values ('post', 'image/webp', 640, 480, 90000) returning id::text $$), true);
select is(pg_temp.job(format($q$ insert into nestly.media_fingerprints (media_id, fingerprint) values (%L, 1234567890123) $q$, pg_temp.g('s5')))
       || '/' || pg_temp.job(format($q$ insert into nestly.media_reviews (media_id, queue_reason, is_suspected) values (%L, 'hash_match', true) $q$, pg_temp.g('s5'))), 'OK:1/ERR:42501',
  '[I14c-B c8 Afik 21.10] the same image uploaded again is no longer blocked');
select is(pg_temp.dml('m2', format($q$ delete from nestly.suspected_image_fingerprints where source_media_id = %L $q$, pg_temp.g('s1'))), 'OK:0',
  '[I14c-B c8] staff delete a listed hash only through that decision');

select * from finish();

rollback;
