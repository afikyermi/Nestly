-- pgTAP, run by pg_prove as app_server (CI `db` job, I11 completion C: Offer Help on any post the Professional may see, 100 a day; one
-- review per parent per Professional, edited and deleted by its writer; the reviewed Professional's review report reasons).
-- Source of expected values: the SRS and Afik's decisions (decisions-in-force.md §13.1-13.3, §11.21, §11.10; FR-SERV-005, FR-SERV-008,
-- FR-SERV-011, BR-008, BR-009, BR-072, BR-074, VAL-010, VAL-048, AC-014, AC-093, AC-150), not the migration text.
-- People: a, b (Regular), q1 = pr_1, q2 = pr_2 (Professionals with a profile), d = fr_d (Admin), m3 = sf_m3 (Moderator, keys granted below).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F11.3-c c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'd' then tests.fx_fr_id('fr_d') when 'm3' then tests.fx_sf_id('sf_m3')
    when 'q1' then tests.fx_pr_id('pr_1') when 'q2' then tests.fx_pr_id('pr_2')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
-- a post, its id read back as its author (insert ... returning)
create function pg_temp.post(p_by text, p_body text, p_anon boolean default false, p_aud text default 'everyone', p_group uuid default null) returns uuid language sql as $f$
  select nullif(pg_temp.q(p_by, format($q$ insert into nestly.posts (is_anonymous, audience, body, group_id) values (%L, %L, %L, %L) returning id::text $q$,
    p_anon, p_aud, p_body, p_group)), '')::uuid
$f$;
create function pg_temp.offer(p_by text, p_post uuid, p_text text default 'אשמח לעזור') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.outreach_requests (post_id, opening_message) values (%L, %L) $q$, p_post, p_text))
$f$;
create function pg_temp.conv(p_regular text, p_pro text) returns uuid language sql as $f$
  select nullif(pg_temp.q(p_regular, format($q$ insert into nestly.conversations (context, user_a, user_b) values ('professional', %L, %L) returning id::text $q$,
    least(pg_temp.id(p_regular), pg_temp.id(p_pro)), greatest(pg_temp.id(p_regular), pg_temp.id(p_pro)))), '')::uuid
$f$;
create function pg_temp.say(p_by text, p_conv uuid, p_text text default 'שלום') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.messages (conversation_id, body) values (%L, %L) $q$, p_conv, p_text))
$f$;
create function pg_temp.review(p_by text, p_pro text, p_conv uuid, p_rating int, p_body text) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.professional_reviews (professional_id, conversation_id, rating, body) values (%L, %L, %s, %L) $q$,
    pg_temp.id(p_pro), p_conv, p_rating, p_body))
$f$;
create function pg_temp.report(p_who text, p_kind text, p_id uuid, p_reason text, p_details text default null) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.reports (target_kind, %s, reason, details) values (%L, %L, %L, %L) $q$,
    p_kind || '_id', p_kind, p_id, p_reason, p_details))
$f$;
create function pg_temp.moderate(p_who text, p_id uuid, p_state text) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ with s as (select set_config('nestly.audit_reason', 'פוגעני', true)) update nestly.professional_reviews t set moderation = %L from s where t.id = %L $q$,
           p_state, p_id))
$f$;

select tests.fx_sf_grant(pg_temp.id('m3'), array['REPORTS_VIEW', 'CONTENT_MODERATE']);

-- ---- structure ------------------------------------------------------------------------------------------------------------
select is((select string_agg(pl.polname || ':' || pl.polcmd::text, ', ' order by pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'nestly' and c.relname = 'professional_reviews' and pl.polname in ('professional_reviews_update_reviewer', 'professional_reviews_delete_reviewer')),
  'professional_reviews_delete_reviewer:d, professional_reviews_update_reviewer:w',
  '[F11.3-c c1 FR-SERV-011 §11.21] the writer''s edit and delete of a review are policies');
select is((select pg_get_constraintdef(oid) from pg_constraint where conname = 'professional_reviews_reviewer_professional_key'),
  'UNIQUE (reviewer_id, professional_id)', '[F11.3-c c1 AC-093 OP-049 §11.21] one review per parent per Professional');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.prosecdef
            and p.proname in ('professional_reviews_update_guard', 'outreach_requests_insert_limit', 'reports_insert_check')),
  0::bigint, '[F11.3-c c1 rule 10] no new SECURITY DEFINER');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'nestly' and c.relname = 'outreach_requests'
            and coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), '') || coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') ~ 'is_help_request'),
  0::bigint, '[F11.3-c c1 OP-038 §13.1] no Offer Help policy reads the help-request marking any more');

-- ---- Offer Help on any post the Professional may see (FR-SERV-005, BR-009, VAL-010, AC-014, §13.1-13.2) ------------------------
select set_config('t.plain', pg_temp.post('a', 'סתם פוסט 108')::text, true);
select is(pg_temp.offer('q1', current_setting('t.plain')::uuid), 'OK:1', '[F11.3-c c2 AC-014 FR-SERV-005 §13.1] a Professional offers help on an ordinary post it can read');
select is(pg_temp.offer('q1', current_setting('t.plain')::uuid, 'שוב'), 'ERR:23505', '[F11.3-c c2 AC-014 (a) BR-008] a second offer on the same post is refused');
select is(pg_temp.offer('q2', current_setting('t.plain')::uuid), 'OK:1', '[F11.3-c c2 AC-014 (a)] another Professional offers on it too');
select is(pg_temp.offer('b', current_setting('t.plain')::uuid), 'ERR:42501', '[F11.3-c c2 BR-007] a Regular offers no help');
select set_config('t.anon', pg_temp.post('a', 'אנונימי 108', true)::text, true);
select is(pg_temp.offer('q1', current_setting('t.anon')::uuid), 'OK:1', '[F11.3-c c2 FR-SERV-005 AC-147] an anonymous post may get an offer');
select is(pg_temp.q('q1', 'select count(*)::text from nestly.post_authors'), '0', '[F11.3-c c2 FR-SERV-005] and its author stays unknown to the Professional');
select set_config('t.friends', pg_temp.post('a', 'רק לחברים 108', false, 'friends')::text, true);
select is(pg_temp.offer('q1', current_setting('t.friends')::uuid), 'ERR:42501', '[F11.3-c c2 VAL-010 §13.2] no offer on a Friends-only post the Professional cannot read');
select set_config('t.group', pg_temp.q('a', $q$ insert into nestly.groups (name, description, privacy) values ('קבוצה סגורה 108', 'about us', 'private') returning id::text $q$), true);
select set_config('t.gpost', pg_temp.post('a', 'בקבוצה סגורה 108', false, 'everyone', current_setting('t.group')::uuid)::text, true);
select is(current_setting('t.gpost') <> '', true, '[F11.3-c c2 fixture] a post in a Private Group');
select is(pg_temp.q('q1', format($q$ select count(*)::text from nestly.posts where id = %L $q$, current_setting('t.gpost'))), '0', '[F11.3-c c2] control: a non-member does not read it');
select is(pg_temp.offer('q1', current_setting('t.gpost')::uuid), 'ERR:42501', '[F11.3-c c2 VAL-010 §13.2] no offer on a post in a Private Group the Professional is not in');
select set_config('t.propost', pg_temp.post('q2', 'פוסט מקצועי 108')::text, true);
select is(pg_temp.q('q1', format($q$ select count(*)::text from nestly.posts where id = %L $q$, current_setting('t.propost'))), '1', '[F11.3-c c2] control: q1 reads q2''s post');
select is(pg_temp.offer('q1', current_setting('t.propost')::uuid), 'ERR:42501', '[F11.3-c c2 ⭐ (d) 2] no offer on a Professional''s post');
select is(pg_temp.dml('b', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'professional') $q$, pg_temp.id('q1'))), 'OK:1',
  '[F11.3-c c2] control: b blocks pr_1');
select set_config('t.bpost', pg_temp.post('b', 'של בלה 108')::text, true);
select is(pg_temp.offer('q1', current_setting('t.bpost')::uuid), 'ERR:42501', '[F11.3-c c2 FR-REL-002] no offer across a user block');

-- the daily limit: 100 in 24 hours (FR-SERV-008, AC-014 (b), §13.3). q2 already sent one; 99 more pass, the 101st is refused
create temporary table limit_posts as select g, pg_temp.post('a', 'מגבלה 108 ' || g) as id from generate_series(1, 100) g;
select is((select count(*) from pg_temp.limit_posts where id is not null), 100::bigint, '[F11.3-c c3 fixture] a hundred more posts');
select is((select count(*) from (select pg_temp.offer('q2', id) as r from pg_temp.limit_posts where g <= 99) x where r = 'OK:1'), 99::bigint,
  '[F11.3-c c3 AC-014 (b) FR-SERV-008 §13.3] the hundredth offer of the day is accepted');
select is(pg_temp.offer('q2', (select id from pg_temp.limit_posts where g = 100)), 'ERR:NS029', '[F11.3-c c3 AC-014 (b) FR-SERV-008 §13.3] the 101st in 24 hours is refused');
select is(pg_temp.offer('q1', (select id from pg_temp.limit_posts where g = 100)), 'OK:1', '[F11.3-c c3 AC-014 (b)] another Professional is not limited by it');
select is(tests.fx_pr_count(format('nestly.outreach_requests where professional_id = %L', pg_temp.id('q2'))), 100::bigint, '[F11.3-c c3] exactly a hundred rows');

-- ---- reviews: one per parent per Professional, edited and deleted by its writer (FR-SERV-011, BR-072, AC-093, §11.21) -----------
select set_config('t.conv_a', pg_temp.conv('a', 'q1')::text, true);
select is(pg_temp.say('q1', current_setting('t.conv_a')::uuid, 'איך אפשר לעזור?'), 'OK:1', '[F11.3-c c4 fixture] the Professional answers a');
select is(pg_temp.review('a', 'q1', current_setting('t.conv_a')::uuid, 4, 'מקצועית 108'), 'OK:1', '[F11.3-c c4 AC-093] a reviews pr_1');
select is(pg_temp.review('a', 'q1', current_setting('t.conv_a')::uuid, 5, 'שוב 108'), 'ERR:23505', '[F11.3-c c4 AC-093 §11.21] a second review of the same Professional is refused');
select set_config('t.rev_a', pg_temp.q('a', $q$ select id::text from nestly.professional_reviews where body = 'מקצועית 108' $q$), true);
select is(pg_temp.q('a', $q$ select coalesce(edited_at::text, 'never') from nestly.professional_reviews where body = 'מקצועית 108' $q$), 'never',
  '[F11.3-c c4 §11.21] a new review was never edited');
select is(pg_temp.dml('a', format($q$ update nestly.professional_reviews set rating = 2, body = 'ערוכה 108' where id = %L $q$, current_setting('t.rev_a'))), 'OK:1',
  '[F11.3-c c4 FR-SERV-011 §11.21] the writer edits rating and text');
select is(pg_temp.q('b', format($q$ select rating::text || ':' || body || ':' || (edited_at is not null)::text from nestly.professional_reviews where id = %L $q$, current_setting('t.rev_a'))),
  '2:ערוכה 108:true', '[F11.3-c c4 BR-072 §11.21] everyone reads the edited review, marked edited');
select is(pg_temp.dml('a', format($q$ update nestly.professional_reviews set professional_id = %L where id = %L $q$, pg_temp.id('q2'), current_setting('t.rev_a'))), 'ERR:42501',
  '[F11.3-c c4] never the Professional it reviews');
select is(pg_temp.dml('a', format($q$ update nestly.professional_reviews set body = ' ' where id = %L $q$, current_setting('t.rev_a'))) like 'ERR:%', true,
  '[F11.3-c c4 FR-SERV-011] the text stays 1-1,000 and not blank');
select is(pg_temp.dml('b', format($q$ update nestly.professional_reviews set rating = 1 where id = %L $q$, current_setting('t.rev_a'))), 'OK:0',
  '[F11.3-c c4 §11.21] another parent does not edit it');
select is(pg_temp.dml('q1', format($q$ update nestly.professional_reviews set rating = 5 where id = %L $q$, current_setting('t.rev_a'))), 'OK:0',
  '[F11.3-c c4 §11.21] nor the reviewed Professional');
select is(pg_temp.dml('b', format($q$ delete from nestly.professional_reviews where id = %L $q$, current_setting('t.rev_a'))), 'OK:0',
  '[F11.3-c c4 ⭐ WORKPLAN 10] nobody else deletes it');

-- ---- review report reasons (FR-MOD-001, BR-074, VAL-048, AC-150, §11.10) -----------------------------------------------------
select is(pg_temp.q('a', $q$ select string_agg(key || ':' || priority || ':' || is_core::text, ', ' order by sort_order) from nestly.report_reasons where scope = 'reviewed_professional' $q$),
  'review_offensive:2:true, review_false:4:true, review_personal_info:2:true, review_other:4:true',
  '[F11.3-c c5 §11.10 BR-074 ⭐ (a) 8] the four review reasons, fixed, offensive and personal information at priority 2');
select is(pg_temp.q('a', $q$ select string_agg(label, ' · ' order by sort_order) from nestly.report_reasons where scope = 'reviewed_professional' $q$),
  'פוגענית · שקרית / בלי אינטראקציה · מידע אישי · אחר', '[F11.3-c c5 §11.10] their labels, read by every active account');
select is(pg_temp.dml('d', $q$ update nestly.report_reasons set is_active = false where key = 'review_false' $q$), 'ERR:23514', '[F11.3-c c5 §11.10] a review reason cannot be switched off');
select is(pg_temp.dml('q1', format($q$ insert into nestly.reports (target_kind, review_id, reason) values ('review', %L, 'harassment') $q$, current_setting('t.rev_a')), false), 'OK:1',
  '[F11.3-c c5 AC-150 §11.10 transition] until the follow-up migration the reviewed Professional may still use a community reason (main''s code sends one; rolled back)');
select is(pg_temp.report('q1', 'review', current_setting('t.rev_a')::uuid, 'review_offensive'), 'OK:1',
  '[F11.3-c c5 AC-150 FR-MOD-001 §11.10] the reviewed Professional reports the review with a review reason');
select is(pg_temp.report('b', 'review', current_setting('t.rev_a')::uuid, 'review_false'), 'ERR:23514', '[F11.3-c c5 §11.10] another reporter does not use a review reason');
select is(pg_temp.report('q2', 'review', current_setting('t.rev_a')::uuid, 'review_other', 'לא נכון'), 'ERR:23514', '[F11.3-c c5 §11.10] nor another Professional');
select is(pg_temp.report('a', 'post', current_setting('t.propost')::uuid, 'review_offensive'), 'ERR:23514', '[F11.3-c c5 §11.10] nor on another target');
select is(pg_temp.report('a', 'post', current_setting('t.propost')::uuid, 'spam'), 'OK:1', '[F11.3-c c5] control: a community reason on a post');
select is(pg_temp.report('b', 'review', current_setting('t.rev_a')::uuid, 'harassment'), 'OK:1', '[F11.3-c c5 FR-MOD-001] a reader reports the review with a community reason');
select set_config('t.conv_b', pg_temp.conv('b', 'q2')::text, true);
select is(pg_temp.say('q2', current_setting('t.conv_b')::uuid), 'OK:1', '[F11.3-c c5 fixture] pr_2 answers b');
select is(pg_temp.review('b', 'q2', current_setting('t.conv_b')::uuid, 1, 'גרועה 108'), 'OK:1', '[F11.3-c c5 fixture] b reviews pr_2');
select set_config('t.rev_b', pg_temp.q('b', $q$ select id::text from nestly.professional_reviews where body = 'גרועה 108' $q$), true);
select is(pg_temp.report('q2', 'review', current_setting('t.rev_b')::uuid, 'review_other'), 'ERR:23514', '[F11.3-c c5 VAL-048] the review list''s "אחר" needs a text');
select is(pg_temp.report('q2', 'review', current_setting('t.rev_b')::uuid, 'review_other', 'לא היינו בקשר'), 'OK:1', '[F11.3-c c5 VAL-048 §11.10] with a text it is accepted');

-- ---- staff never edit a review; a moderated review is not edited; the writer deletes its own (§11.21, §11.11) -------------------
select is(pg_temp.dml('m3', format($q$ update nestly.professional_reviews set body = 'נערך בידי הצוות' where id = %L $q$, current_setting('t.rev_a'))), 'ERR:42501',
  '[F11.3-c c6 §9-§10] staff with CONTENT_MODERATE do not edit a review''s text');
select is(pg_temp.moderate('m3', current_setting('t.rev_a')::uuid, 'hidden'), 'OK:1', '[F11.3-c c6 fixture] staff hide the reported review');
select is(pg_temp.dml('a', format($q$ update nestly.professional_reviews set rating = 5 where id = %L $q$, current_setting('t.rev_a'))), 'OK:0',
  '[F11.3-c c6 §11.21] a moderated review is not edited by its writer');
select is(pg_temp.dml('a', format($q$ delete from nestly.professional_reviews where id = %L $q$, current_setting('t.rev_a'))), 'OK:0',
  '[F11.3-c c6 ⭐ WORKPLAN 10] nor deleted by its writer while staff hold it (a staff decision is not evaded)');
select is(pg_temp.moderate('m3', current_setting('t.rev_a')::uuid, 'active'), 'OK:1', '[F11.3-c c6 fixture] staff restore it');
select is(pg_temp.dml('a', format($q$ delete from nestly.professional_reviews where id = %L $q$, current_setting('t.rev_a'))), 'OK:1',
  '[F11.3-c c6 ⭐ WORKPLAN 10] the writer deletes its own review');
select is(tests.fx_pr_count($q$ nestly.reports where target_kind = 'review' and review_id is null and status = 'expired' and reason in ('review_offensive', 'harassment') $q$), 2::bigint,
  '[F11.3-c c6 §11.11] its open reports close with it');
select is(pg_temp.review('a', 'q1', current_setting('t.conv_a')::uuid, 5, 'חדשה 108'), 'OK:1', '[F11.3-c c6] after deleting it, the writer may review again');

select * from finish();
rollback;
