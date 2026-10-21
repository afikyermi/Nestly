-- pgTAP, run by pg_prove as app_server (CI `db` job, I11: Professionals and services; FR-REG-001, FR-PROREG-001/002, FR-SERV-001..008,
-- FR-SERV-011, FR-FOLLOW-001, FR-PRO-001, FR-PRO-003; BR-006..010, BR-030, BR-071, BR-072; VAL-010, VAL-011, VAL-018, VAL-049;
-- AC-010..014, AC-035, AC-093, AC-094, AC-130; decisions-in-force.md §3 items 8-10).
-- Source of expected values: the SRS and Afik's decisions (who follows whom, who offers help on what and how often, who reads an anonymous
-- author, who opens a conversation, who reviews, who edits an article), not the migration text.
-- People: a, b (Regular), s (suspended Regular), p (the identity fixtures' Professional, no profile), q1 = pr_1, q2 = pr_2 (Professionals
-- with a profile), d = fr_d (Admin), n = f1 (an Auth user with no account yet).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F11.1-a c0] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 's' then tests.fx_id('s') when 'p' then tests.fx_id('p')
    when 'n' then tests.fx_id('f1') when 'd' then tests.fx_fr_id('fr_d')
    when 'q1' then tests.fx_pr_id('pr_1') when 'q2' then tests.fx_pr_id('pr_2')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.n(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
create temporary table ids (k text primary key, v uuid not null);
create function pg_temp.remember(p_key text, p_who text, p_sql text) returns uuid language plpgsql as $f$
declare v uuid;
begin
  select i.v into v from pg_temp.ids i where i.k = p_key;
  if v is null then
    v := nullif(pg_temp.n(p_who, p_sql), '')::uuid;
    if v is not null then insert into pg_temp.ids values (p_key, v); end if;
  end if;
  return v;
end
$f$;
create function pg_temp.post(p_by text, p_body text, p_help boolean default true, p_anon boolean default false, p_aud text default 'everyone') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.posts (is_anonymous, audience, body, is_help_request) values (%L, %L, %L, %L) $q$,
    p_anon, p_aud, p_body, p_help))
$f$;
-- a post id, read as its author (named: posts.author_id; anonymous: through post_authors)
create function pg_temp.pid(p_by text, p_body text) returns uuid language sql as $f$
  select pg_temp.remember('post:' || p_body, p_by, format($q$ select id::text from nestly.posts where body = %L $q$, p_body))
$f$;
create function pg_temp.offer(p_by text, p_post uuid, p_text text default 'אשמח לעזור') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.outreach_requests (post_id, opening_message) values (%L, %L) $q$, p_post, p_text))
$f$;
create function pg_temp.oid_of(p_pro text, p_post uuid) returns uuid language sql as $f$
  select pg_temp.remember('offer:' || p_pro || p_post::text, p_pro,
    format($q$ select id::text from nestly.outreach_requests where post_id = %L $q$, p_post))
$f$;
create function pg_temp.follow(p_by text, p_whom text) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.professional_follows (professional_id) values (%L) $q$, pg_temp.id(p_whom)))
$f$;
create function pg_temp.unfollow(p_by text, p_whom text) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ delete from nestly.professional_follows where professional_id = %L $q$, pg_temp.id(p_whom)))
$f$;
create function pg_temp.open_conv(p_by text, p_with text, p_context text, p_outreach uuid default null) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.conversations (context, user_a, user_b, outreach_request_id) values (%L, %L, %L, %L) $q$,
    p_context, least(pg_temp.id(p_by), pg_temp.id(p_with)), greatest(pg_temp.id(p_by), pg_temp.id(p_with)), p_outreach))
$f$;
create function pg_temp.conv(p_x text, p_y text) returns uuid language sql as $f$
  select pg_temp.remember('conv:' || least(p_x, p_y) || greatest(p_x, p_y), p_x,
    format($q$ select id::text from nestly.conversations where user_a = %L and user_b = %L $q$,
      least(pg_temp.id(p_x), pg_temp.id(p_y)), greatest(pg_temp.id(p_x), pg_temp.id(p_y))))
$f$;
create function pg_temp.say(p_by text, p_conv uuid, p_text text default 'שלום') returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.messages (conversation_id, body) values (%L, %L) $q$, p_conv, p_text))
$f$;
create function pg_temp.review(p_by text, p_pro text, p_conv uuid, p_rating int default 5) returns text language sql as $f$
  select pg_temp.dml(p_by, format($q$ insert into nestly.professional_reviews (professional_id, conversation_id, rating, body) values (%L, %L, %s, 'מקצועית מאוד') $q$,
    pg_temp.id(p_pro), p_conv, p_rating))
$f$;

-- ---- structure ------------------------------------------------------------------------------------------------------------
create function pg_temp.new_tables() returns text[] language sql as $f$
  select array['professional_profiles', 'professional_follows', 'outreach_requests', 'professional_reviews', 'professional_articles']
$f$;
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname = any (pg_temp.new_tables()) and c.relrowsecurity and c.relforcerowsecurity), 5::bigint,
  '[F11.1-a c1] the five new tables have RLS enabled and forced');
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text, ', ' order by c.relname, pl.polname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname = any (pg_temp.new_tables())),
  'outreach_requests.outreach_requests_insert_professional:a, outreach_requests.outreach_requests_select_professional:r, '
  || 'outreach_requests.outreach_requests_select_target:r, outreach_requests.outreach_requests_update_target:w, '
  || 'professional_articles.professional_articles_delete_own:d, professional_articles.professional_articles_insert_own:a, '
  || 'professional_articles.professional_articles_select_viewer:r, professional_articles.professional_articles_update_own:w, '
  || 'professional_follows.professional_follows_delete_follower:d, professional_follows.professional_follows_insert_follower:a, '
  || 'professional_follows.professional_follows_select_party:r, '
  || 'professional_profiles.professional_profiles_insert_own:a, professional_profiles.professional_profiles_select_viewer:r, '
  || 'professional_profiles.professional_profiles_update_own:w, '
  || 'professional_reviews.professional_reviews_insert_reviewer:a, professional_reviews.professional_reviews_select_viewer:r',
  '[F11.1-a c1] exactly these policies: no update or delete of a review, no delete of a profile or an Offer Help, the Professional never answers its own request');
select is((select count(*) from pg_policy pl join pg_class c on c.oid = pl.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
            and c.relname = any (pg_temp.new_tables())
            and (pl.polroles <> array[(select oid from pg_roles where rolname = 'authenticated')]::oid[] or not pl.polpermissive
                 or (coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') || coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), '')) !~ 'is_active_account\(\)')),
  0::bigint, '[F11.1-a c1 platform r15] every policy of the new tables is permissive, TO authenticated and gated by is_active_account()');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'outreach_requests.opening_message, outreach_requests.post_id, professional_articles.body, professional_articles.field, professional_articles.status, '
  || 'professional_articles.title, professional_follows.professional_id, professional_profiles.about, professional_profiles.area, professional_profiles.business_name, '
  || 'professional_profiles.field, professional_profiles.field_other, professional_profiles.full_name, professional_profiles.gender, '
  || 'professional_profiles.price_from, professional_profiles.years_experience, professional_reviews.body, professional_reviews.conversation_id, '
  || 'professional_reviews.professional_id, professional_reviews.rating',
  '[F11.1-a c1 conventions] INSERT per column: never an owner column, a status or its copy, or a clock');
select is((select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly'
              and c.relname = any (pg_temp.new_tables()) and a.attnum > 0 and not a.attisdropped
              and not has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')),
  'outreach_requests.professional_status, professional_articles.author_status, professional_follows.follower_id, professional_follows.follower_status, '
  || 'professional_profiles.user_status, professional_reviews.conversation_id, professional_reviews.reviewer_id, professional_reviews.reviewer_status',
  '[F11.1-a c1 FR-PRO-001 VAL-032] never readable: the status copies, the follower and the reviewer (counts and averages carry no identity)');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nestly' and p.prosecdef
            and p.proname in ('professional_profiles_update_guard', 'outreach_requests_insert_limit', 'outreach_requests_transition', 'professional_articles_update_guard')),
  0::bigint, '[F11.1-a c1 rule 10] no new SECURITY DEFINER');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nestly' and c.relname = any (pg_temp.new_tables())
            and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE'))),
  0::bigint, '[F11.1-a c1 rule 7] anon holds nothing on the new tables');

-- ---- registration (FR-PROREG-001/002) ------------------------------------------------------------------------------------
select is(pg_temp.dml('n', $q$ insert into nestly.users (account_type, status) values ('professional', 'active') $q$), 'OK:1',
  '[F11.1-a c2 FR-PROREG-002] an identity creates its own Professional account');
select is(pg_temp.dml('n', $q$ insert into nestly.regular_profiles (full_name) values ('Not Regular') $q$), 'ERR:23503',
  '[F11.1-a c2 BR-016] a Professional account holds no Regular profile (the composite FK)');
select is(pg_temp.dml('n', $q$ insert into nestly.professional_profiles (full_name, field, years_experience, area) values ('Nora New', 'lactation', 2, 'center') $q$), 'OK:1',
  '[F11.1-a c2 FR-PROREG-001] and its own Professional profile, with no verification field');
select is(pg_temp.dml('n', $q$ insert into nestly.professional_profiles (full_name, field, years_experience) values ('Nora Twice', 'sleep', 2) $q$), 'ERR:23505',
  '[F11.1-a c2] one profile per Professional');
select is(pg_temp.dml('a', $q$ insert into nestly.professional_profiles (full_name, field, years_experience) values ('Alice Pro', 'sleep', 2) $q$), 'ERR:42501',
  '[F11.1-a c2 BR-016] a Regular account cannot hold a Professional profile');
select is(pg_temp.dml('n', $q$ update nestly.professional_profiles set field = 'other', field_other = 'x' $q$, false), 'ERR:23514',
  '[F11.1-a c2] "other" needs a field text of 2-40 characters');
select is(pg_temp.dml('n', $q$ update nestly.professional_profiles set area = 'mars' $q$, false), 'ERR:23514', '[F11.1-a c2 §12] the area is from the list');
select is(pg_temp.dml('n', $q$ update nestly.professional_profiles set years_experience = 61 $q$, false), 'ERR:23514', '[F11.1-a c2] years of experience 0-60');

-- ---- reading and editing a profile (FR-SERV-001/003) --------------------------------------------------------------------
select is(pg_temp.n('a', format($q$ select count(*)::text from nestly.professional_profiles where user_id in (%L, %L) $q$, pg_temp.id('q1'), pg_temp.id('q2'))), '2',
  '[F11.1-a c3 FR-SERV-001] a Regular reads the active Professionals'' profiles');
select is(pg_temp.n('q2', format($q$ select full_name from nestly.professional_profiles where user_id = %L $q$, pg_temp.id('q1'))), 'Dana Doula',
  '[F11.1-a c3] a Professional reads another''s profile');
select is(pg_temp.n('s', 'select count(*)::text from nestly.professional_profiles'), '0', '[F11.1-a c3 rule 15] a suspended account reads none');
select tests.set_status(pg_temp.id('q2'), 'suspended');
select is(pg_temp.n('a', format($q$ select count(*)::text from nestly.professional_profiles where user_id = %L $q$, pg_temp.id('q2'))), '0',
  '[F11.1-a c3 BR-073] a suspended Professional''s profile is hidden');
select tests.set_status(pg_temp.id('q2'), 'active');
select is(pg_temp.dml('a', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'professional') $q$, pg_temp.id('q2'))), 'OK:1',
  '[F11.1-a c3] control: a blocks pr_2');
select is(pg_temp.n('a', format($q$ select count(*)::text from nestly.professional_profiles where user_id = %L $q$, pg_temp.id('q2'))), '0',
  '[F11.1-a c3 FR-REL-002] a user block hides the profile (the blocker)');
select is(pg_temp.n('q2', format($q$ select count(*)::text from nestly.professional_profiles where user_id = %L $q$, pg_temp.id('q1'))), '1', '[F11.1-a c3] control');
select is(pg_temp.dml('a', format($q$ update nestly.user_blocks set lifted_at = now() where blocked_id = %L and lifted_at is null $q$, pg_temp.id('q2'))), 'OK:1',
  '[F11.1-a c3] control: a unblocks pr_2');
select is(pg_temp.dml('a', $q$ update nestly.professional_profiles set about = 'hacked' $q$), 'OK:0', '[F11.1-a c3] nobody edits another''s profile');
select is(pg_temp.dml('q1', $q$ update nestly.professional_profiles set about = 'לידות בבית ובבית חולים', price_from = 1200 $q$), 'OK:1',
  '[F11.1-a c3] the owner edits its own profile');
select is(pg_temp.dml('q1', $q$ update nestly.professional_profiles set created_at = now() $q$), 'ERR:42501', '[F11.1-a c3] never the clock');
select is(pg_temp.dml('q1', 'delete from nestly.professional_profiles'), 'ERR:42501', '[F11.1-a c3] a profile is not deleted by its owner (the account lifecycle, I9)');

-- ---- Follow (FR-FOLLOW-001, BR-030, VAL-018, AC-035) --------------------------------------------------------------------
select is(pg_temp.follow('a', 'q1'), 'OK:1', '[F11.1-a c4 FR-FOLLOW-001] a Regular follows a Professional, with no approval');
select is(pg_temp.follow('a', 'q1'), 'ERR:23505', '[F11.1-a c4] once');
select is(pg_temp.follow('q2', 'q1'), 'OK:1', '[F11.1-a c4 BR-030] a Professional follows a Professional');
select is(pg_temp.follow('q1', 'b'), 'ERR:42501', '[F11.1-a c4 AC-035] a Professional cannot follow a Regular');
select is(pg_temp.follow('a', 'b'), 'ERR:42501', '[F11.1-a c4 AC-035 VAL-018] nobody follows a Regular profile');
select is(pg_temp.follow('q1', 'q1') like 'ERR:%', true, '[F11.1-a c4 VAL-018] never oneself');
select is(pg_temp.follow('d', 'q1'), 'ERR:42501', '[F11.1-a c4 BR-034] an Admin does not follow');
select is(pg_temp.follow('s', 'q1'), 'ERR:42501', '[F11.1-a c4 rule 15] a suspended account does not follow');
select is(pg_temp.n('q1', 'select follower_id::text from nestly.professional_follows limit 1'), 'ERR:42501',
  '[F11.1-a c4 FR-PRO-001] the Professional never reads who follows it');
select is(pg_temp.n('q1', format($q$ select count(*)::text from nestly.professional_follows where professional_id = %L $q$, pg_temp.id('q1'))), '2',
  '[F11.1-a c4 FR-PRO-001] the Professional counts its followers');
select is(pg_temp.n('b', 'select count(*)::text from nestly.professional_follows'), '0', '[F11.1-a c4] another account reads no Follow');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.n('q1', format($q$ select count(*)::text from nestly.professional_follows where professional_id = %L $q$, pg_temp.id('q1'))), '1',
  '[F11.1-a c4] a suspended follower is not counted');
select tests.set_status(pg_temp.id('a'), 'active');
select is(pg_temp.dml('b', format($q$ delete from nestly.professional_follows where professional_id = %L $q$, pg_temp.id('q1'))), 'OK:0',
  '[F11.1-a c4] nobody removes another''s Follow');

-- ---- posts: followers only and help requests (VAL-049, AC-130, OP-038) ------------------------------------------------------
select is(pg_temp.post('q1', 'רק לעוקבים', false, false, 'followers'), 'OK:1', '[F11.1-a c5 AC-130] a Professional posts to its followers only');
select is(pg_temp.n('a', $q$ select count(*)::text from nestly.posts where body = 'רק לעוקבים' $q$), '1', '[F11.1-a c5 AC-130] a follower reads it');
select is(pg_temp.n('q2', $q$ select count(*)::text from nestly.posts where body = 'רק לעוקבים' $q$), '1', '[F11.1-a c5 AC-130] a following Professional reads it');
select is(pg_temp.n('b', $q$ select count(*)::text from nestly.posts where body = 'רק לעוקבים' $q$), '0', '[F11.1-a c5 AC-130] a non-follower does not');
select is(pg_temp.n('q1', $q$ select count(*)::text from nestly.posts where body = 'רק לעוקבים' $q$), '1', '[F11.1-a c5] its author does');
select is(pg_temp.unfollow('q2', 'q1'), 'OK:1', '[F11.1-a c4 FR-FOLLOW-001] Unfollow');
select is(pg_temp.n('q2', $q$ select count(*)::text from nestly.posts where body = 'רק לעוקבים' $q$), '0', '[F11.1-a c5 AC-130] after Unfollow it is gone');
select is(pg_temp.post('a', 'עוקבים של רגיל', false, false, 'followers'), 'ERR:42501', '[F11.1-a c5 VAL-049] a Regular never posts to followers');
select is(pg_temp.post('q1', 'מקצועי מבקש עזרה', true), 'ERR:42501', '[F11.1-a c5 OP-038] a Professional''s post never asks for help');
select is(pg_temp.post('q1', 'לחברים', false, false, 'friends'), 'ERR:42501', '[F11.1-a c5 VAL-049] a Professional never posts to Friends');
select is(pg_temp.dml('q1', $q$ update nestly.posts set audience = 'everyone' where body = 'רק לעוקבים' $q$), 'OK:1', '[F11.1-a c5 VAL-049] the Professional edits the audience');
select is(pg_temp.dml('q1', $q$ update nestly.posts set audience = 'friends' where body = 'רק לעוקבים' $q$), 'ERR:42501', '[F11.1-a c5 VAL-049] never to Friends on an edit');
select is(pg_temp.post('a', 'עזרה בשינה', true), 'OK:1', '[F11.1-a c5 OP-038 ⭐ (a)] a Regular marks its post as asking for help');
select is(pg_temp.post('a', 'עזרה אנונימית', true, true), 'OK:1', '[F11.1-a c5] an anonymous post may ask for help');
select is(pg_temp.post('b', 'סתם פוסט', false), 'OK:1', '[F11.1-a c5] control: a post that does not ask for help');
select is(pg_temp.dml('b', $q$ update nestly.posts set is_help_request = true where body = 'סתם פוסט' $q$, false), 'OK:1', '[F11.1-a c5 OP-038] the author marks its post as asking for help on an edit');
select is(pg_temp.dml('a', $q$ update nestly.posts set is_help_request = true where body = 'סתם פוסט' $q$), 'OK:0', '[F11.1-a c5] nobody else does');
select is((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'nestly' and c.relname = 'posts' and t.tgname in ('posts_reject_staff_edit', 'posts_reject_group_edit')
            and exists (select 1 from unnest(t.tgattr::int2[]) k join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k where a.attname = 'is_help_request')),
  2::bigint, '[F11.1-a c5 I4 I10] staff and Group managers never change the help marking (the edit guards cover it)');
select is(pg_temp.post('a', 'אנונימי לעוקבים', false, true, 'followers'), 'ERR:42501', '[F11.1-a c5] an anonymous post is everyone only');

-- ---- Offer Help (FR-SERV-005/006/008, BR-007..010, VAL-010, AC-011, AC-012, AC-014) ------------------------------------
select is(pg_temp.offer('q1', pg_temp.pid('b', 'סתם פוסט')), 'ERR:42501', '[F11.1-a c6 AC-014 (c) BR-009] no Offer Help on a post that does not ask for help');
select is(pg_temp.offer('q1', pg_temp.pid('a', 'עזרה בשינה')), 'OK:1', '[F11.1-a c6 FR-SERV-005] a Professional offers help on a help-request post');
select is(pg_temp.offer('q1', pg_temp.pid('a', 'עזרה בשינה')), 'ERR:23505', '[F11.1-a c6 AC-011 AC-014 (a) BR-008] a second request on the same post is refused');
select is(pg_temp.offer('q2', pg_temp.pid('a', 'עזרה בשינה')), 'OK:1', '[F11.1-a c6 AC-014 (a)] another Professional''s request on the same post is accepted');
select is(pg_temp.offer('b', pg_temp.pid('a', 'עזרה בשינה')), 'ERR:42501', '[F11.1-a c6 BR-007] a Regular sends no Offer Help');
select is(pg_temp.offer('p', pg_temp.pid('a', 'עזרה בשינה')), 'ERR:23503', '[F11.1-a c6] a Professional with no profile cannot (the FK)');
select is(pg_temp.offer('q1', pg_temp.pid('a', 'עזרה בשינה'), '   ') like 'ERR:%', true, '[F11.1-a c6] the opening message is not blank');
select is(pg_temp.n('a', format($q$ select count(*)::text from nestly.outreach_requests where post_id = %L $q$, pg_temp.pid('a', 'עזרה בשינה'))), '2',
  '[F11.1-a c6 FR-SERV-006] the post''s author reads both requests');
select is(pg_temp.n('b', 'select count(*)::text from nestly.outreach_requests'), '0', '[F11.1-a c6] another Regular reads none');
select is(pg_temp.n('q1', 'select count(*)::text from nestly.outreach_requests'), '1', '[F11.1-a c6] each Professional reads its own only');
select is(pg_temp.dml('q1', format($q$ update nestly.outreach_requests set status = 'accepted' where id = %L $q$, pg_temp.oid_of('q1', pg_temp.pid('a', 'עזרה בשינה')))), 'OK:0',
  '[F11.1-a c6 BR-010] the Professional never accepts its own request');
-- AC-012: before Accept there is no conversation
select is(pg_temp.open_conv('a', 'q1', 'outreach', pg_temp.oid_of('q1', pg_temp.pid('a', 'עזרה בשינה'))), 'ERR:42501',
  '[F11.1-a c6 AC-012] before Accept no conversation can be opened');
select is(pg_temp.dml('a', format($q$ update nestly.outreach_requests set status = 'declined' where id = %L $q$, pg_temp.oid_of('q2', pg_temp.pid('a', 'עזרה בשינה')))), 'OK:1',
  '[F11.1-a c6 VAL-011] the author declines one');
select is(pg_temp.open_conv('a', 'q2', 'outreach', pg_temp.oid_of('q2', pg_temp.pid('a', 'עזרה בשינה'))), 'ERR:42501',
  '[F11.1-a c6 VAL-011] a declined request opens no conversation');
select is(pg_temp.dml('a', format($q$ update nestly.outreach_requests set status = 'accepted' where id = %L $q$, pg_temp.oid_of('q2', pg_temp.pid('a', 'עזרה בשינה')))), 'OK:0',
  '[F11.1-a c6] a declined request stays declined');
select is(pg_temp.dml('a', format($q$ update nestly.outreach_requests set status = 'accepted' where id = %L $q$, pg_temp.oid_of('q1', pg_temp.pid('a', 'עזרה בשינה')))), 'OK:1',
  '[F11.1-a c6 FR-SERV-006] the author accepts the other');
select is(pg_temp.open_conv('q1', 'a', 'outreach', pg_temp.oid_of('q1', pg_temp.pid('a', 'עזרה בשינה'))), 'ERR:42501',
  '[F11.1-a c6] the Professional does not open it');
select is(pg_temp.open_conv('a', 'q1', 'outreach', pg_temp.oid_of('q1', pg_temp.pid('a', 'עזרה בשינה'))), 'OK:1',
  '[F11.1-a c6 FR-SERV-006 AC-013] the author opens the conversation of an accepted request');
select is(pg_temp.say('q1', pg_temp.conv('a', 'q1'), 'איך אפשר לעזור?'), 'OK:1', '[F11.1-a c6 FR-SERV-007 AC-013] the Professional writes');
select is(pg_temp.say('a', pg_temp.conv('a', 'q1'), 'תודה!'), 'OK:1', '[F11.1-a c6 AC-013] and the author answers');
select is(pg_temp.n('q1', format($q$ select count(*)::text from nestly.messages where conversation_id = %L $q$, pg_temp.conv('a', 'q1'))), '2', '[F11.1-a c6] both read both');
-- the anonymous author stays unknown until it accepts
select is(pg_temp.offer('q1', pg_temp.pid('a', 'עזרה אנונימית')), 'OK:1', '[F11.1-a c6 FR-SERV-005] Offer Help on an anonymous post');
select is(pg_temp.n('q1', $q$ select count(*)::text from nestly.post_authors $q$), '0', '[F11.1-a c6 FR-SERV-005] the Professional never reads the anonymous author');
select is(pg_temp.n('q1', $q$ select coalesce(author_id::text, 'null') from nestly.posts where body = 'עזרה אנונימית' $q$), 'null', '[F11.1-a c6] the post carries no author');
select is(pg_temp.n('a', format($q$ select count(*)::text from nestly.outreach_requests where post_id = %L $q$, pg_temp.pid('a', 'עזרה אנונימית'))), '1',
  '[F11.1-a c6] the anonymous author reads the request on its post');
-- user block: no Offer Help across it
select is(pg_temp.post('b', 'עזרה של בלה', true), 'OK:1', '[F11.1-a c6] control: b asks for help');
select is(pg_temp.dml('b', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'professional') $q$, pg_temp.id('q2'))), 'OK:1',
  '[F11.1-a c6] control: b blocks pr_2');
select is(pg_temp.offer('q2', pg_temp.pid('b', 'עזרה של בלה')), 'ERR:42501', '[F11.1-a c6 FR-REL-002] no Offer Help across a user block');
-- the daily limit: q2 already sent one (declined, still counted); nine more pass, the eleventh is refused
select is((select string_agg(pg_temp.post('a', 'עזרה ' || g, true), ',') from generate_series(1, 10) g), 'OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1',
  '[F11.1-a c6] control: ten more help-request posts');
select is((select string_agg(pg_temp.offer('q2', pg_temp.pid('a', 'עזרה ' || g)), ',') from generate_series(1, 9) g), 'OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1,OK:1',
  '[F11.1-a c6 AC-014 (b)] the tenth request of the day is accepted (a declined one counts)');
select is(pg_temp.offer('q2', pg_temp.pid('a', 'עזרה 10')), 'ERR:NS029', '[F11.1-a c6 AC-014 (b) FR-SERV-008] the eleventh in 24 hours is refused');
select is(pg_temp.offer('q1', pg_temp.pid('a', 'עזרה 10')), 'OK:1', '[F11.1-a c6 AC-014 (b)] another Professional is not limited by it');
select is(tests.fx_pr_count(format('nestly.outreach_requests where professional_id = %L', pg_temp.id('q2'))), 10::bigint, '[F11.1-a c6] exactly ten rows');

-- ---- a Regular opens a chat with a Professional (FR-SERV-004, BR-006, AC-010) ------------------------------------------
select is(pg_temp.open_conv('q1', 'b', 'professional'), 'ERR:42501', '[F11.1-a c7 BR-007] a Professional does not open a conversation with a Regular');
select is(pg_temp.open_conv('b', 'q1', 'professional'), 'OK:1', '[F11.1-a c7 AC-010] a Regular opens a conversation with a Professional, no approval');
select is(pg_temp.say('b', pg_temp.conv('b', 'q1')), 'OK:1', '[F11.1-a c7 BR-006] and writes');
select is(pg_temp.say('q1', pg_temp.conv('b', 'q1')), 'OK:1', '[F11.1-a c7 FR-SERV-007] the Professional answers');
select is(pg_temp.open_conv('q2', 'q1', 'professional'), 'ERR:42501', '[F11.1-a c7] nor with another Professional');
select is(pg_temp.open_conv('a', 'b', 'professional'), 'ERR:42501', '[F11.1-a c7] context professional needs a Professional');
select is(pg_temp.open_conv('b', 'q2', 'professional'), 'ERR:42501', '[F11.1-a c7 FR-REL-002] never across a user block');

-- ---- reviews (FR-SERV-011, BR-072, AC-093) ---------------------------------------------------------------------------------
select is(pg_temp.open_conv('a', 'q2', 'professional'), 'OK:1', '[F11.1-a c8] control: a opens a conversation with pr_2');
select is(pg_temp.review('a', 'q2', pg_temp.conv('a', 'q2')), 'ERR:42501', '[F11.1-a c8 AC-093 OP-045] no review before the Professional has answered');
select is(pg_temp.review('a', 'q1', pg_temp.conv('a', 'q1'), 4), 'OK:1', '[F11.1-a c8 AC-093] a review on an accepted Offer Help the Professional answered');
select is(pg_temp.review('a', 'q1', pg_temp.conv('a', 'q1'), 5), 'ERR:23505', '[F11.1-a c8 AC-093] a second review of the same conversation is refused');
select is(pg_temp.review('b', 'q1', pg_temp.conv('a', 'q1')), 'ERR:42501', '[F11.1-a c8] never on someone else''s conversation');
select is(pg_temp.review('b', 'q1', pg_temp.conv('b', 'q1'), 2), 'OK:1', '[F11.1-a c8 FR-SERV-004] a review after a Regular-opened conversation the Professional answered');
select is(pg_temp.review('b', 'q1', pg_temp.conv('b', 'q1'), 6) like 'ERR:%', true, '[F11.1-a c8 FR-SERV-011] the rating is 1-5');
select is(pg_temp.review('q1', 'q1', pg_temp.conv('b', 'q1')), 'ERR:42501', '[F11.1-a c8] a Professional does not review');
select is(pg_temp.n('p', format($q$ select avg(rating)::numeric(3,1)::text || '/' || count(*) from nestly.professional_reviews where professional_id = %L $q$, pg_temp.id('q1'))), '3.0/2',
  '[F11.1-a c8 BR-072 AC-093] the rating is the average of the reviews');
select is(pg_temp.n('q1', 'select reviewer_id::text from nestly.professional_reviews limit 1'), 'ERR:42501', '[F11.1-a c8] the reviewer is never readable');
select is(pg_temp.n('q1', 'select conversation_id::text from nestly.professional_reviews limit 1'), 'ERR:42501', '[F11.1-a c8] nor the conversation that would name it');
select is(pg_temp.n('q2', format($q$ select count(*)::text from nestly.professional_reviews where professional_id = %L $q$, pg_temp.id('q1'))), '2',
  '[F11.1-a c8] a block does not hide a review (blocking would reveal its writer)');
select is(pg_temp.dml('a', 'update nestly.professional_reviews set rating = 1'), 'ERR:42501', '[F11.1-a c8] a review is not edited');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.n('p', format($q$ select count(*)::text from nestly.professional_reviews where professional_id = %L $q$, pg_temp.id('q1'))), '1',
  '[F11.1-a c8] a suspended reviewer''s review is hidden');
select tests.set_status(pg_temp.id('b'), 'active');

-- ---- articles (FR-PRO-003, BR-071, AC-094) -------------------------------------------------------------------------------
select is(pg_temp.dml('q1', $q$ insert into nestly.professional_articles (title, body, field) values ('הכנה ללידה', 'שלושה דברים שכדאי לדעת', 'doula') $q$), 'OK:1',
  '[F11.1-a c9 FR-PRO-003] a Professional writes an article');
select is(pg_temp.dml('a', $q$ insert into nestly.professional_articles (title, body, field) values ('מאמר', 'גוף', 'doula') $q$), 'ERR:42501', '[F11.1-a c9] a Regular does not');
select is(pg_temp.n('b', $q$ select count(*)::text from nestly.professional_articles where title = 'הכנה ללידה' $q$), '1', '[F11.1-a c9 AC-094] every account reads it');
select is(pg_temp.dml('a', $q$ update nestly.professional_articles set title = 'נפרץ' $q$), 'OK:0', '[F11.1-a c9 AC-094] only the owner edits it');
select is(pg_temp.dml('a', 'delete from nestly.professional_articles'), 'OK:0', '[F11.1-a c9 AC-094] only the owner deletes it');
select is(pg_temp.dml('q1', $q$ update nestly.professional_articles set status = 'hidden' $q$), 'OK:1', '[F11.1-a c9 FR-PRO-003] the owner hides it');
select is(pg_temp.n('b', 'select count(*)::text from nestly.professional_articles'), '0', '[F11.1-a c9] a hidden article is not read by others');
select is(pg_temp.n('q1', 'select count(*)::text from nestly.professional_articles'), '1', '[F11.1-a c9] its owner still reads it');
select is(pg_temp.dml('q1', format($q$ update nestly.professional_articles set author_id = %L $q$, pg_temp.id('q2'))), 'ERR:42501', '[F11.1-a c9] never the author');
select is(pg_temp.dml('q1', 'delete from nestly.professional_articles'), 'OK:1', '[F11.1-a c9 AC-094] the owner deletes it');

select * from finish();
rollback;
