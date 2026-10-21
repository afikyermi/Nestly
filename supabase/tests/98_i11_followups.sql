-- pgTAP, run by pg_prove as app_server (CI `db` job, I11 follow-ups: the Support metrics of the analytics screen, and reporting a
-- Professional's review or article). Expected values come from the SRS (FR-ADMIN-003, FR-ADMIN-010, BR-058; FR-MOD-001, FR-MOD-003,
-- FR-SERV-011, FR-PRO-003: "subject to reporting and enforcement"), not the migration text.
-- People: a, b (Regular), q1 = pr_1 (a Professional with a profile), d = fr_d (Admin), m3 = sf_m3 (Moderator, keys granted below),
-- m4 = sf_m4 (Moderator with REPORTS_VIEW only), m0 = fr_m (Moderator, no key).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[I11F c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b')
    when 'd' then tests.fx_fr_id('fr_d') when 'm0' then tests.fx_fr_id('fr_m') when 'm3' then tests.fx_sf_id('sf_m3') when 'm4' then tests.fx_sf_id('sf_m4')
    when 'q1' then tests.fx_pr_id('pr_1') when 'q2' then tests.fx_pr_id('pr_2')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create function pg_temp.n(p_who text, p_rel text) returns text language sql as $f$
  select tests.n_as(pg_temp.id(p_who), p_rel)
$f$;
-- a count on the analytics screen (nestly.analytics_view = on), as the analytics route does
create function pg_temp.na(p_who text, p_rel text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.analytics_view', 'on', true);
  v := pg_temp.n(p_who, 'nestly.' || p_rel);
  perform set_config('nestly.analytics_view', '', true);
  return v;
end
$f$;
-- a moderation move with a stated reason (rule 18), as the admin route does
create function pg_temp.moderate(p_who text, p_table text, p_id uuid, p_state text, p_reason text default 'פוגעני') returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)),
    format($q$ with s as (select set_config('nestly.audit_reason', %L, true)) update nestly.%I t set moderation = %L from s where t.id = %L $q$,
           p_reason, p_table, p_state, p_id))
$f$;
create function pg_temp.report(p_who text, p_kind text, p_id uuid, p_reason text default 'harassment') returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.reports (target_kind, %s, reason) values (%L, %L, %L) $q$,
    case p_kind when 'review' then 'review_id' when 'article' then 'article_id' else p_kind || '_id' end, p_kind, p_id, p_reason))
$f$;

select tests.fx_sf_grant(pg_temp.id('m3'), array['REPORTS_VIEW', 'CONTENT_MODERATE', 'ANALYTICS_VIEW', 'SUPPORT_VIEW', 'SUPPORT_HANDLE']);
select tests.fx_sf_grant(pg_temp.id('m4'), array['REPORTS_VIEW']);

-- ---- structure ------------------------------------------------------------------------------------------------------------
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text, ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and pl.polname in ('support_requests_select_analytics', 'support_messages_select_analytics', 'professional_reviews_select_staff',
                                 'professional_articles_select_staff', 'professional_reviews_update_staff', 'professional_articles_update_staff')),
  'professional_articles.professional_articles_select_staff:r, professional_articles.professional_articles_update_staff:w, '
  || 'professional_reviews.professional_reviews_select_staff:r, professional_reviews.professional_reviews_update_staff:w, '
  || 'support_messages.support_messages_select_analytics:r, support_requests.support_requests_select_analytics:r',
  '[I11F c1] the new policies: analytics reads on the two Support tables, staff read and moderation of reported reviews and articles');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname in ('professional_reviews', 'professional_articles') and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')),
  'professional_articles.body, professional_articles.field, professional_articles.moderation, professional_articles.status, professional_articles.title, '
  || 'professional_reviews.moderation',
  '[I11F c1 conventions] UPDATE per column: a review''s moderation only; an article''s text, field, status and moderation');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.prosecdef
            and p.proname in ('reports_insert_check', 'reports_insert_snapshot', 'reports_target_gone', 'professional_content_moderation_guard')),
  0::bigint, '[I11F c1 rule 10] no new SECURITY DEFINER');

-- ---- Support metrics (FR-ADMIN-003, BR-058) ------------------------------------------------------------------------------
select is(pg_temp.dml('a', $q$ insert into nestly.support_requests (topic, body) values ('bug', 'הכפתור לא עובד') $q$), 'OK:1', '[I11F c2 fixture] a Support request');
select set_config('t.sreq', pg_temp.q('a', $q$ select id::text from nestly.support_requests where body = 'הכפתור לא עובד' $q$), true);
select set_config('nestly.staff_view', 'on', true);
select is(pg_temp.dml('m3', format($q$ insert into nestly.support_messages (support_request_id, body) values (%L, 'בודקים') $q$, current_setting('t.sreq'))),
  'OK:1', '[I11F c2 fixture] and a Support reply');
select set_config('nestly.staff_view', '', true);
select is(pg_temp.na('d', 'support_requests'), tests.fx_pr_count('nestly.support_requests')::text, '[I11F c2 FR-ADMIN-003] the Admin counts every Support request on the analytics screen');
select is(pg_temp.na('m3', 'support_requests'), tests.fx_pr_count('nestly.support_requests')::text, '[I11F c2 BR-058] ANALYTICS_VIEW counts every Support request');
select is(pg_temp.na('m3', 'support_messages'), tests.fx_pr_count('nestly.support_messages')::text, '[I11F c2 BR-058] and every Support message (the first reply''s time)');
select is(pg_temp.na('m4', 'support_requests'), pg_temp.n('m4', 'nestly.support_requests'), '[I11F c3 AC-026] without ANALYTICS_VIEW the screen opens no Support request');
select is(pg_temp.na('m4', 'support_messages'), '0', '[I11F c3 AC-026] nor a Support message');
select is(pg_temp.na('b', 'support_requests'), '0', '[I11F c3] a user on the analytics screen reads none but its own (it has none)');
select is(pg_temp.na('a', 'support_requests'), '1', '[I11F c3] the requester still reads only its own');
select is(pg_temp.n('m0', 'nestly.support_requests'), '0', '[I11F c3] outside the screens a Moderator without a key reads none');
select is(tests.fx_pr_count('nestly.support_requests') > 1 or pg_temp.n('m3', 'nestly.support_requests') = '0', true,
  '[I11F c3] outside the analytics screen (and the Support screens) ANALYTICS_VIEW opens nothing');

-- ---- reporting a review or an article (FR-MOD-001, FR-SERV-011, FR-PRO-003) ------------------------------------------------
select is(pg_temp.dml('a', format($q$ insert into nestly.conversations (context, user_a, user_b) values ('professional', %L, %L) $q$,
            least(pg_temp.id('a'), pg_temp.id('q1')), greatest(pg_temp.id('a'), pg_temp.id('q1')))), 'OK:1', '[I11F c4 fixture] a conversation');
select set_config('t.conv', pg_temp.q('a', format($q$ select id::text from nestly.conversations where user_a = %L and user_b = %L $q$,
            least(pg_temp.id('a'), pg_temp.id('q1')), greatest(pg_temp.id('a'), pg_temp.id('q1')))), true);
select is(pg_temp.dml('q1', format($q$ insert into nestly.messages (conversation_id, body) values (%L, 'שלום') $q$, current_setting('t.conv'))), 'OK:1',
  '[I11F c4 fixture] the Professional answers');
select is(pg_temp.dml('a', format($q$ insert into nestly.professional_reviews (professional_id, conversation_id, rating, body) values (%L, %L, 1, 'גסה ומעליבה') $q$,
            pg_temp.id('q1'), current_setting('t.conv'))), 'OK:1', '[I11F c4 fixture] a review');
select set_config('t.review', pg_temp.q('b', $q$ select id::text from nestly.professional_reviews where body = 'גסה ומעליבה' $q$), true);
select is(pg_temp.dml('q1', $q$ insert into nestly.professional_articles (title, body, field) values ('מאמר שנוי', 'טקסט שגוי', 'doula') $q$), 'OK:1', '[I11F c4 fixture] an article');
select set_config('t.article', pg_temp.q('b', $q$ select id::text from nestly.professional_articles where title = 'מאמר שנוי' $q$), true);

select is(pg_temp.report('q1', 'review', current_setting('t.review')::uuid), 'OK:1', '[I11F c4 FR-MOD-001] the reviewed Professional reports the review');
select is(pg_temp.report('b', 'review', current_setting('t.review')::uuid, 'other'), 'ERR:23514', '[I11F c4] "other" needs details, as any report');
select is(pg_temp.report('b', 'article', current_setting('t.article')::uuid), 'OK:1', '[I11F c4 FR-MOD-001] a reader reports the article');
select is(pg_temp.report('b', 'article', current_setting('t.article')::uuid), 'ERR:23505', '[I11F c4 BR-074] one report per person and article');
select is(pg_temp.report('q1', 'article', current_setting('t.article')::uuid), 'ERR:42501', '[I11F c4] the author does not report its own article');
select is(pg_temp.report('a', 'review', gen_random_uuid()), 'ERR:42501', '[I11F c4] an unknown review cannot be reported (no oracle: 42501)');
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, review_id, reason) values ('article', %L, 'spam') $q$, current_setting('t.review'))), 'ERR:23514',
  '[I11F c4] the kind names the column it reports');
select is(pg_temp.dml('b', format($q$ insert into nestly.reports (target_kind, review_id, article_id, reason) values ('review', %L, %L, 'spam') $q$,
            current_setting('t.review'), current_setting('t.article'))), 'ERR:23514', '[I11F c4] one target per report');
select is(tests.fx_pr_count(format($q$ nestly.reports where review_id = %L and target_text = 'גסה ומעליבה' $q$, current_setting('t.review'))), 1::bigint,
  '[I11F c5 FR-MOD-001] the review''s text is copied into the report');
select is(tests.fx_pr_count(format($q$ nestly.reports where article_id = %L and target_text = E'מאמר שנוי\n\nטקסט שגוי' $q$, current_setting('t.article'))), 1::bigint,
  '[I11F c5] the article''s title and text are copied');

-- ---- staff: the queue and the moderation (FR-MOD-003) -----------------------------------------------------------------------
select is(pg_temp.n('m4', format($q$ nestly.reports where review_id = %L or article_id = %L $q$, current_setting('t.review'), current_setting('t.article'))), '2',
  '[I11F c6 FR-MOD-003] REPORTS_VIEW reads the two reports');
select is(pg_temp.moderate('m4', 'professional_reviews', current_setting('t.review')::uuid, 'hidden'), 'OK:0',
  '[I11F c6 AC-022] REPORTS_VIEW alone does not moderate (no row)');
select is(pg_temp.moderate('a', 'professional_reviews', current_setting('t.review')::uuid, 'hidden'), 'OK:0', '[I11F c6] a user does not moderate');
select is(pg_temp.moderate('q1', 'professional_articles', current_setting('t.article')::uuid, 'hidden'), 'ERR:42501',
  '[I11F c6] the article''s owner cannot move its moderation (42501)');
select is(pg_temp.moderate('m3', 'professional_reviews', current_setting('t.review')::uuid, 'hidden', ' '), 'ERR:NS011',
  '[I11F c6 rule 18] a moderation move needs a reason (NS011)');
select is(pg_temp.moderate('m3', 'professional_reviews', current_setting('t.review')::uuid, 'removed'), 'OK:1', '[I11F c6 FR-MOD-001] CONTENT_MODERATE removes the review');
select is(pg_temp.moderate('m3', 'professional_articles', current_setting('t.article')::uuid, 'hidden'), 'OK:1', '[I11F c6 FR-PRO-003] and hides the article');
select is(tests.fx_sf_audit('content_removed') >= 1 and tests.fx_sf_audit('content_hidden') >= 1, true, '[I11F c6 BR-026 rule 18] each move is audited');
select is(tests.fx_pr_count($q$ nestly.audit_log where target_kind in ('review', 'article') and permission_key = 'CONTENT_MODERATE' and reason = 'פוגעני' $q$), 2::bigint,
  '[I11F c6 rule 18] with the reason and the target kind');
select is(pg_temp.dml('m3', format($q$ update nestly.professional_articles set body = 'שונה' where id = %L $q$, current_setting('t.article'))),
  'ERR:42501', '[I11F c6] staff never edit an article''s text');
select is(pg_temp.n('b', format($q$ nestly.professional_reviews where id = %L $q$, current_setting('t.review'))), '0', '[I11F c7] a removed review leaves every reader''s view');
select is(pg_temp.n('a', format($q$ nestly.professional_reviews where id = %L $q$, current_setting('t.review'))), '0', '[I11F c7] its writer''s too');
select is(pg_temp.n('b', format($q$ nestly.professional_articles where id = %L $q$, current_setting('t.article'))), '0', '[I11F c7] a hidden article leaves the readers'' view');
select is(pg_temp.q('q1', format($q$ select moderation from nestly.professional_articles where id = %L $q$, current_setting('t.article'))), 'hidden',
  '[I11F c7] its owner still reads it, and that it was taken down');
select is(pg_temp.n('m4', format($q$ nestly.professional_reviews where id = %L $q$, current_setting('t.review'))), '1', '[I11F c7 FR-MOD-003] REPORTS_VIEW still reads the reported review');
select is(pg_temp.moderate('m3', 'professional_articles', current_setting('t.article')::uuid, 'active', ''), 'OK:1', '[I11F c7] a restore needs no reason');
select is(pg_temp.n('b', format($q$ nestly.professional_articles where id = %L $q$, current_setting('t.article'))), '1', '[I11F c7] the restored article is back');
select is(pg_temp.dml('m3',
            format($q$ update nestly.reports set status = 'handled', resolution = 'action_taken' where review_id = %L $q$, current_setting('t.review'))), 'OK:1',
  '[I11F c8 FR-MOD-003] CONTENT_MODERATE closes the review''s report');

-- ---- a reported article deleted by its owner: its open report expires -------------------------------------------------------
select is(pg_temp.dml('q1', format($q$ delete from nestly.professional_articles where id = %L $q$, current_setting('t.article'))), 'OK:1',
  '[I11F c9] the owner deletes a reported article');
select is(tests.fx_pr_count($q$ nestly.reports where target_kind = 'article' and article_id is null and status = 'expired' and closed_at is not null $q$), 1::bigint,
  '[I11F c9] its open report expires, so the queue never shows a report on nothing');

-- ---- the Professional's notifications (OP-051 cancelled; Afik 21.10.2026, decisions-in-force.md §9.8) -------------------------
select is((select p.prosecdef::text || '/' || pg_get_userbyid(p.proowner) || '/' || p.proconfig::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'nestly' and p.proname = 'notify_professional'), 'true/app_owner/{"search_path=\"\""}',
  '[I11F c10 rule 17] notify_professional is a SECURITY DEFINER owned by app_owner with a pinned search_path');
select is((select has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('app_server', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'nestly' and p.proname = 'notify_professional'),
  false, '[I11F c10 rule 17] no runtime role executes it');
select is((select string_agg(c.relname || '.' || t.tgname, ', ' order by c.relname) from pg_trigger t join pg_class c on c.oid = t.tgrelid
            join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.proname = 'notify_professional'),
  'outreach_requests.notify_professional_outreach, professional_follows.notify_professional_follow, professional_reviews.notify_professional_review',
  '[I11F c10] it fires on an Offer Help answered, a review written and a new follower only');

-- a review (c4 fixture, by a): the reviewed Professional is told, the reviewer is not named
select is(tests.fx_nt_one(pg_temp.id('q1'), 'review_received'), format('actor=- target=professional:%s critical=f read=f', pg_temp.id('q1')),
  '[I11F c11 OP-051] a new review notifies the Professional, never naming the reviewer');
select is(tests.fx_nt_count(pg_temp.id('a')), 0::bigint, '[I11F c11] the reviewer gets nothing');

-- Offer Help: declined and accepted
select is(pg_temp.dml('b', $q$ insert into nestly.posts (audience, body, is_help_request) values ('everyone', 'מחפשת עזרה בהנקה', true) $q$), 'OK:1', '[I11F c12 fixture] a help post');
select set_config('t.help1', pg_temp.q('b', $q$ select id::text from nestly.posts where body = 'מחפשת עזרה בהנקה' $q$), true);
select is(pg_temp.dml('q1', format($q$ insert into nestly.outreach_requests (post_id, opening_message) values (%L, 'אשמח לעזור') $q$, current_setting('t.help1'))), 'OK:1',
  '[I11F c12 fixture] q1 offers help');
select is(pg_temp.dml('q2', format($q$ insert into nestly.outreach_requests (post_id, opening_message) values (%L, 'גם אני') $q$, current_setting('t.help1'))), 'OK:1',
  '[I11F c12 fixture] q2 offers help');
select is(pg_temp.dml('b', format($q$ update nestly.outreach_requests set status = 'declined' where post_id = %L and professional_id = %L $q$,
            current_setting('t.help1'), pg_temp.id('q1'))), 'OK:1', '[I11F c12 fixture] b declines q1');
select is(left(tests.fx_nt_one(pg_temp.id('q1'), 'offer_declined'), 24), 'actor=- target=outreach:',
  '[I11F c12 OP-051] a declined Offer Help notifies the Professional, without naming who declined');
select is(pg_temp.dml('b', format($q$ update nestly.outreach_requests set status = 'accepted' where post_id = %L and professional_id = %L $q$,
            current_setting('t.help1'), pg_temp.id('q2'))), 'OK:1', '[I11F c12 fixture] b accepts q2');
select is(left(tests.fx_nt_one(pg_temp.id('q2'), 'offer_accepted'), 24), 'actor=- target=outreach:', '[I11F c12 OP-051] an accepted Offer Help notifies the Professional');
select is(tests.fx_nt_count(pg_temp.id('b')), 0::bigint, '[I11F c12] the author answering gets nothing');
select is(pg_temp.n('q2', 'nestly.notifications'), '1', '[I11F c12] the Professional reads its own notification');

-- the recipient's switch (FR-NOTIF-002): q2 turns Offer Help notifications off
select is(pg_temp.dml('q2', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('offers', false) $q$), 'OK:1',
  '[I11F c13 fixture] q2 switches offers off');
select is(pg_temp.dml('b', $q$ insert into nestly.posts (audience, body, is_help_request) values ('everyone', 'עזרה בשינה בבקשה', true) $q$), 'OK:1', '[I11F c13 fixture] another help post');
select set_config('t.help2', pg_temp.q('b', $q$ select id::text from nestly.posts where body = 'עזרה בשינה בבקשה' $q$), true);
select is(pg_temp.dml('q2', format($q$ insert into nestly.outreach_requests (post_id, opening_message) values (%L, 'אשמח') $q$, current_setting('t.help2'))), 'OK:1',
  '[I11F c13 fixture] q2 offers again');
select is(pg_temp.dml('b', format($q$ update nestly.outreach_requests set status = 'declined' where post_id = %L $q$, current_setting('t.help2'))), 'OK:1',
  '[I11F c13 fixture] b declines');
select is(tests.fx_nt_types(pg_temp.id('q2')), 'offer_accepted', '[I11F c13 §6 condition 3] a switched-off category delivers nothing');

-- a user block: across it nothing happens and nothing is delivered (§6 condition 3)
select is(pg_temp.dml('b', format($q$ insert into nestly.conversations (context, user_a, user_b) values ('professional', %L, %L) $q$,
            least(pg_temp.id('b'), pg_temp.id('q2')), greatest(pg_temp.id('b'), pg_temp.id('q2')))), 'OK:1', '[I11F c14 fixture] b opens a conversation with q2');
select set_config('t.conv2', pg_temp.q('b', format($q$ select id::text from nestly.conversations where user_a = %L and user_b = %L $q$,
            least(pg_temp.id('b'), pg_temp.id('q2')), greatest(pg_temp.id('b'), pg_temp.id('q2')))), true);
select is(pg_temp.dml('q2', format($q$ insert into nestly.messages (conversation_id, body) values (%L, 'שלום') $q$, current_setting('t.conv2'))), 'OK:1',
  '[I11F c14 fixture] q2 answers');
select is(pg_temp.dml('q2', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('b'))), 'OK:1',
  '[I11F c14 fixture] q2 blocks b');
select is(pg_temp.dml('b', format($q$ insert into nestly.professional_reviews (professional_id, conversation_id, rating, body) values (%L, %L, 2, 'לא') $q$,
            pg_temp.id('q2'), current_setting('t.conv2'))), 'ERR:42501', '[I11F c14] a review across a block is refused');
select is(pg_temp.dml('b', format($q$ insert into nestly.professional_follows (professional_id) values (%L) $q$, pg_temp.id('q2'))), 'ERR:42501',
  '[I11F c14] so is a follow');
select is(tests.fx_nt_types(pg_temp.id('q2')), 'offer_accepted', '[I11F c14 §6 condition 3] and the blocked Professional is told nothing');

-- new followers: one weekly digest, timed at the week's end (Monday 00:00, Israel time); nobody named
select is(pg_temp.dml('a', format($q$ insert into nestly.professional_follows (professional_id) values (%L) $q$, pg_temp.id('q1'))), 'OK:1', '[I11F c15 fixture] a follows q1');
select is(pg_temp.dml('b', format($q$ insert into nestly.professional_follows (professional_id) values (%L) $q$, pg_temp.id('q1'))), 'OK:1', '[I11F c15 fixture] b follows q1');
select is(tests.fx_pr_count(format($q$ nestly.notifications where recipient_id = %L and type = 'followers_weekly' and actor_id is null
            and created_at = (date_trunc('week', now() at time zone 'Asia/Jerusalem') + interval '7 days') at time zone 'Asia/Jerusalem' $q$, pg_temp.id('q1'))), 1::bigint,
  '[I11F c15 OP-051] two new followers make one digest for the week, timed at its end, naming nobody');
select is(pg_temp.n('q1', $q$ nestly.notifications where type = 'followers_weekly' $q$), '0', '[I11F c15] it is not readable before the week ends');
select is(pg_temp.dml('q1', $q$ update nestly.notifications set read_at = now() where read_at is null $q$), 'OK:2', '[I11F c15] "mark all read" marks the two that are due');
select is(tests.fx_pr_count(format($q$ nestly.notifications where recipient_id = %L and type = 'followers_weekly' and read_at is null $q$, pg_temp.id('q1'))), 1::bigint,
  '[I11F c15] and leaves the digest unread');
select is(pg_temp.dml('q2', $q$ insert into nestly.notification_preferences (category, is_in_app_enabled) values ('followers', false) $q$), 'OK:1',
  '[I11F c15 fixture] q2 switches the follower digest off');
select is(pg_temp.dml('a', format($q$ insert into nestly.professional_follows (professional_id) values (%L) $q$, pg_temp.id('q2'))), 'OK:1', '[I11F c15 fixture] a follows q2');
select is(tests.fx_nt_types(pg_temp.id('q2')), 'offer_accepted', '[I11F c15 §6 condition 3] a switched-off digest is not written');
select is(tests.fx_nt_count(pg_temp.id('a')) + tests.fx_nt_count(pg_temp.id('b')), 0::bigint, '[I11F c15] followers get nothing');

-- ---- the Professional's qualification declaration (Afik 21.10.2026, §9.8) ---------------------------------------------------------
select is(pg_temp.dml('q1', $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus, has_declared_qualification) values ('t-98', 'p-98', true, true) $q$), 'OK:1',
  '[I11F c16] a Professional''s consent records the qualification declaration');
select is(tests.fx_pr_count(format($q$ nestly.legal_consents where user_id = %L and terms_version = 't-98' and has_declared_qualification $q$, pg_temp.id('q1'))), 1::bigint,
  '[I11F c16] as given');
select is(pg_temp.dml('a', $q$ insert into nestly.legal_consents (terms_version, privacy_version, has_declared_18_plus) values ('t-98', 'p-98', true) $q$), 'OK:1',
  '[I11F c16] a Regular''s consent defaults to no such declaration');
select is(tests.fx_pr_count(format($q$ nestly.legal_consents where user_id = %L and terms_version = 't-98' and not has_declared_qualification $q$, pg_temp.id('a'))), 1::bigint,
  '[I11F c16] recorded false');

select * from finish();
rollback;
