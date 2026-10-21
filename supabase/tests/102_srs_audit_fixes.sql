-- pgTAP, run by pg_prove as app_server (CI `db` job): the SRS-audit fixes (migration 20261023100000).
-- Expected values come from the SRS and Afik's decisions, not the migration text: FR-SEARCH-001 ("a Professional is marked as such"; no list
-- without a query; Admin, Moderator and inactive accounts never appear), decisions-in-force.md §6 (the I7 conditions: no query returns
-- nothing; never an Admin, a Moderator, an inactive account or across a user block; every notification honours the recipient's preferences
-- and blocks), FR-NOTIF-003, BR-037, AC-046, NFR-PRIV-003 (a Friend's child's birthday notifies only when the parent allows it), FR-PRIV-001
-- (a Friend never sees a child's name or birth date), FR-ADMIN-010, BR-058 (counts on the analytics screen only).
-- People: a, b, c (Regular), s (suspended Regular), p (the identity fixtures' Professional, no profile), q1 = pr_1 'Dana Doula',
-- q2 = pr_2 'Shira Sleep' (Professionals with a profile), d = fr_d (Admin), m0 = fr_m (Moderator, no key).
-- Everything rolls back with the transaction.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text, '[F7.2-a c0 audit-fix] session_user is app_server (this file must not run under another login)');

select tests.fx_fr_build();

create function pg_temp.id(p text) returns uuid language sql as $f$
  select case p
    when 'a' then tests.fx_id('a') when 'b' then tests.fx_id('b') when 'c' then tests.fx_fr_id('fr_c') when 's' then tests.fx_id('s')
    when 'p' then tests.fx_id('p') when 'q1' then tests.fx_pr_id('pr_1') when 'q2' then tests.fx_pr_id('pr_2')
    when 'd' then tests.fx_fr_id('fr_d') when 'm0' then tests.fx_fr_id('fr_m')
  end
$f$;
create function pg_temp.dml(p_who text, p_sql text, p_keep boolean default true) returns text language sql as $f$
  select tests.dml_as('authenticated', tests.claims(pg_temp.id(p_who)), p_sql, p_keep)
$f$;
create function pg_temp.q(p_who text, p_sql text) returns text language sql as $f$
  select tests.as_role('authenticated', tests.claims(pg_temp.id(p_who)), p_sql)
$f$;
-- one People Search: 'name/outcome/kind|...' in the function's order, '' for no row
create function pg_temp.sp(p_who text, p_q text) returns text language sql as $f$
  select pg_temp.q(p_who, format($q$ select coalesce(string_agg(coalesce(r.full_name, '-') || '/' || r.outcome || '/' || coalesce(r.account_type, '-'), '|' order by r.o), '')
                 from nestly.search_people(%L) with ordinality as r(user_id, full_name, outcome, account_type, o) $q$, p_q))
$f$;
-- the birthday delivery as p_who: the number written, or 'ERR:<sqlstate>'
create function pg_temp.deliver(p_who text) returns text language sql as $f$
  select pg_temp.q(p_who, 'select nestly.deliver_child_birthdays()::text')
$f$;
-- Israel's date today, minus p_days and p_years: a birth date whose birthday is p_days ago
create function pg_temp.born(p_years int, p_days int) returns date language sql as $f$
  select (((now() at time zone 'Asia/Jerusalem')::date - p_days) - make_interval(years => p_years))::date
$f$;
create function pg_temp.child(p_who text, p_slot int, p_birth date) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ insert into nestly.children (slot, name, sex, birth_date) values (%s, 'Noa', 'girl', %L) $q$, p_slot, p_birth))
$f$;
create function pg_temp.share(p_who text, p_on boolean) returns text language sql as $f$
  select pg_temp.dml(p_who, format($q$ update nestly.regular_profiles set is_child_birthday_shared = %L $q$, p_on))
$f$;
create function pg_temp.reset() returns void language plpgsql as $f$
declare w text;
begin
  foreach w in array array['a', 'b', 'c'] loop perform tests.fx_fr_purge(pg_temp.id(w)); end loop;
  perform tests.fx_nt_purge();
end
$f$;
-- a count on the analytics screen (nestly.analytics_view = on), as the analytics route does
create function pg_temp.na(p_who text, p_rel text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('nestly.analytics_view', 'on', true);
  v := tests.n_as(pg_temp.id(p_who), 'nestly.' || p_rel);
  perform set_config('nestly.analytics_view', '', true);
  return v;
end
$f$;

-- =====================================================================================================================
-- 1. People Search returns Professionals, marked (FR-SEARCH-001; the I7 conditions stay)
-- =====================================================================================================================
select is(
  (select pg_catalog.pg_get_function_result(p.oid) from pg_catalog.pg_proc p where p.proname = 'search_people' and p.pronamespace = 'nestly'::regnamespace),
  'TABLE(user_id uuid, full_name text, outcome text, account_type text)',
  '[audit-fix FR-SEARCH-001 BR-063] the id, the full name and whether the person is a Professional leave the function - nothing more');
select is(pg_temp.sp('a', 'dana'), 'Dana Doula/found/professional', '[audit-fix FR-SEARCH-001] a Regular user finds an active Professional, marked as one');
select is(pg_temp.sp('c', 'alice'), 'Alice Aaron/found/regular', '[audit-fix FR-SEARCH-001] a Regular account is still found, marked regular');
select is(pg_temp.sp('q1', 'shira'), 'Shira Sleep/found/professional', '[audit-fix FR-SEARCH-001] a Professional finds another Professional');
select is(pg_temp.sp('q1', 'dana'), '', '[audit-fix] never the caller');
select is(pg_temp.sp('a', ''), '', '[audit-fix condition 2 AC-078] no query string returns nothing');
select is(pg_temp.sp('a', 'd'), '', '[audit-fix condition 2 VAL-037] one character returns nothing');
select is(pg_temp.q('a', $q$ select count(*)::text from nestly.search_people(null) $q$), '0', '[audit-fix condition 2] nor a NULL query');
select is(pg_temp.sp('a', 'moderator') || pg_temp.sp('a', 'admin'), '', '[audit-fix condition 2 AC-078] never a Moderator or an Admin');
select is(pg_temp.dml('d', $q$ insert into nestly.professional_profiles (full_name, field, years_experience) values ('Adam Min', 'doula', 1) $q$),
  'ERR:42501', '[audit-fix condition 2] an Admin cannot give itself a Professional profile (the only other table names come from)');
select is(pg_temp.sp('d', 'dana'), '', '[audit-fix FR-SEARCH-001] an Admin has no consumer search');
select tests.set_status(pg_temp.id('q2'), 'suspended');
select is(pg_temp.sp('a', 'shira'), '', '[audit-fix condition 2 BR-044] a suspended Professional is not listed');
select tests.set_status(pg_temp.id('q2'), 'banned');
select is(pg_temp.sp('a', 'shira'), '', '[audit-fix condition 2 BR-044] nor a banned one');
select tests.set_status(pg_temp.id('q2'), 'active');
select is(pg_temp.sp('a', 'shira'), 'Shira Sleep/found/professional', '[audit-fix] (control) active again, listed again');
select is(pg_temp.dml('a', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'professional') $q$, pg_temp.id('q1'))),
  'OK:1', '[audit-fix] (setup) A blocks the Professional q1');
select is(pg_temp.sp('a', 'dana'), '', '[audit-fix condition 2 FR-REL-002] the blocker does not find the Professional it blocked');
select is(pg_temp.sp('q1', 'alice'), '', '[audit-fix condition 2 FR-REL-002] nor does the blocked Professional find the blocker');
select is(pg_temp.sp('b', 'dana'), 'Dana Doula/found/professional', '[audit-fix] (control) a third account still finds it');

-- =====================================================================================================================
-- 2. Child birthday notifications (FR-NOTIF-003, BR-037, AC-046, NFR-PRIV-003)
-- =====================================================================================================================
select is(
  (select p.prosecdef::text || '/' || pg_catalog.pg_get_userbyid(p.proowner) || '/' || (exists (select 1 from unnest(p.proconfig) as cfg where cfg like 'search_path=%'))::text
     from pg_catalog.pg_proc p where p.proname = 'deliver_child_birthdays' and p.pronamespace = 'nestly'::regnamespace),
  'true/app_owner/true', '[audit-fix rule 10 rule 17] deliver_child_birthdays is a SECURITY DEFINER owned by app_owner with a fixed search_path');
select is(
  (select string_agg(r.rolname || ':' || has_function_privilege(r.rolname, p.oid, 'EXECUTE')::text, ', ' order by r.rolname)
     from (values ('anon'), ('app_jobs'), ('app_server'), ('authenticated')) as r(rolname)
     cross join pg_catalog.pg_proc p where p.proname = 'deliver_child_birthdays' and p.pronamespace = 'nestly'::regnamespace),
  'anon:false, app_jobs:false, app_server:false, authenticated:true', '[audit-fix rule 4] only authenticated may call it');
select is(
  (select string_agg(c.relname || '.' || pol.polname || '.' || pol.polcmd::text || '.'
                     || (select string_agg(r.rolname, '+') from pg_catalog.pg_roles r where r.oid = any (pol.polroles)) || '.'
                     || (pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'trend_scopes' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'nestly.birthday_scope'
                         and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) !~ 'notify_scope')::text, ', ' order by c.relname)
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relnamespace = 'nestly'::regnamespace and pol.polname in ('children_select_birthday', 'regular_profiles_select_birthday')),
  'children.children_select_birthday.r.app_owner.true, regular_profiles.regular_profiles_select_birthday.r.app_owner.true',
  '[audit-fix rule 17] the two reads it needs are TO app_owner only, read-only, and open only in the call''s own scope');
select is(
  (select string_agg(pol.polname || '.' || pol.polcmd::text || '.' || (select string_agg(r.rolname, '+') from pg_catalog.pg_roles r where r.oid = any (pol.polroles)), ', ')
     from pg_catalog.pg_policy pol where pol.polrelid = 'nestly.trend_scopes'::regclass and pol.polname = 'trend_scopes_insert_birthday'),
  'trend_scopes_insert_birthday.a.app_owner', '[audit-fix rule 17] the scope row is written by the owner role only (inside the definer)');
select is(
  (select (q ~ 'nestly.friendships' and q ~ 'status = ''accepted''::text' and q ~ 'requester_status = ''active''::text'
           and q ~ 'addressee_status = ''active''::text' and strpos(q, 'requester_id = ( SELECT auth.uid()') > 0 and strpos(q, 'addressee_id = ( SELECT auth.uid()') > 0
           and q ~ 'is_child_birthday_shared')::text
     from (select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) as q from pg_catalog.pg_policy pol
            join pg_catalog.pg_class c on c.oid = pol.polrelid
            where pol.polname = 'children_select_birthday' and c.relname = 'children' and c.relnamespace = 'nestly'::regnamespace) p),
  'true', '[audit-fix FR-PRIV-001 BR-037] children_select_birthday itself requires an accepted Friendship with the caller, either direction, both accounts active, and the parent''s switch on (no reliance on another policy)');

select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select pg_temp.dml('b', 'delete from nestly.children');
select is(pg_temp.child('b', 1, pg_temp.born(3, 0)), 'OK:1', '[audit-fix] (setup) B''s child turns 3 today (Israel''s date)');
select is(pg_temp.child('b', 2, pg_temp.born(1, 6)), 'OK:1', '[audit-fix] (setup) B''s child turned 1 six days ago');
select is(pg_temp.child('b', 3, pg_temp.born(2, 8)), 'OK:1', '[audit-fix] (setup) B''s child turned 2 eight days ago');
select is(pg_temp.child('b', 4, pg_temp.born(0, 0)), 'OK:1', '[audit-fix] (setup) and one was born today');
select is(pg_temp.q('a', format('select count(*)::text from nestly.children where user_id = %L', pg_temp.id('b'))), '0',
  '[audit-fix FR-PRIV-001] (control) A cannot read a Friend''s children outside the delivery');

select is(pg_temp.deliver('a'), '2', '[audit-fix AC-046 FR-NOTIF-003] a Friend gets one notification per birthday of the last seven days: today''s and six days ago (not eight, not a birth today)');
select is(tests.fx_nt_types(pg_temp.id('a')), 'child_birthday,child_birthday', '[audit-fix] of the type child_birthday');
select is(tests.fx_nt_one(pg_temp.id('a'), 'child_birthday'), format('actor=%s target=user:%s critical=f read=f', pg_temp.id('b'), pg_temp.id('b')),
  '[audit-fix FR-NOTIF-001] its actor and its target are the parent; unread; not critical');
select is(tests.fx_pr_count(format($q$ nestly.notifications n where n.recipient_id = %L and n.type = 'child_birthday' and n.created_at = now() $q$, pg_temp.id('a'))),
  2::bigint, '[audit-fix FR-PRIV-001 Afik 21.10 night] both are timed at the delivery, not at the birthday (the time tells no day of birth)');
select is(tests.fx_pr_count('nestly.trend_scopes'), 0::bigint, '[audit-fix rule 17] the call deletes its scope again: none is left open in the transaction');
select is(tests.fx_pr_count('nestly.notifications n join nestly.children c on c.id in (n.subject_id, n.target_id, n.actor_id)'), 0::bigint,
  '[audit-fix FR-PRIV-001] no notification carries a child''s id');
select is(pg_temp.q('a', $q$ select count(*)::text from nestly.notifications where type = 'child_birthday' $q$), '2',
  '[audit-fix FR-NOTIF-001] the recipient reads them');

-- Afik 21.10.2026 (night): the child's first name only to a Friend who already sees it on the parent's profile; never age, never birth date.
-- The profile shows a child's name to no one but the parent (FR-PRIV-001, BR-044: a Friend sees the Journey Summary only, in both modes),
-- so no Friend qualifies and the notification carries nothing about the child.
select is(
  (select string_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
     from pg_catalog.pg_attribute a where a.attrelid = 'nestly.notifications'::regclass and a.attnum > 0 and not a.attisdropped),
  'id:uuid,recipient_id:uuid,type:text,actor_id:uuid,target_kind:text,target_id:uuid,subject_id:uuid,is_critical:boolean,created_at:timestamp with time zone,read_at:timestamp with time zone',
  '[audit-fix FR-PRIV-001 Afik 21.10 night] a notification has no column that could carry a child''s name, sex, age or birth date (type and target_kind are short codes)');
select is(pg_temp.q('a', format($q$ select (coalesce(string_agg(row_to_json(n)::text, ' '), '') ~ 'Noa|girl|%s|%s')::text
                                     from nestly.notifications n where n.type = 'child_birthday' $q$, pg_temp.born(3, 0), pg_temp.born(1, 6))),
  'false', '[audit-fix FR-PRIV-001 Afik 21.10 night] what the Friend reads names no child, no sex and no birth date');
select is(
  (select pg_catalog.pg_get_function_result(p.oid) ~* 'name|sex|birth'
     from pg_catalog.pg_proc p where p.proname = 'profile_view' and p.pronamespace = 'nestly'::regnamespace),
  false, '[audit-fix FR-PRIV-001 BR-044] the profile returns no child''s name, sex or birth date to anyone (only full_name, the parent''s)');
select is(pg_temp.q('a', format($q$ select string_agg(v.outcome || '/' || v.relationship || '/' || (row_to_json(v)::text ~ 'Noa')::text, ',')
                                     from nestly.profile_view(%L) v $q$, pg_temp.id('b'))),
  'shown/friends/false', '[audit-fix FR-PRIV-001 Afik 21.10 night] a Friend opening the parent''s Open profile does not see the child''s name - so the birthday names no child');
select is(pg_temp.dml('b', $q$ update nestly.regular_profiles set profile_visibility = 'restricted' $q$), 'OK:1', '[audit-fix] (setup) B''s profile Restricted');
select is(pg_temp.q('a', format($q$ select string_agg(v.outcome || '/' || (row_to_json(v)::text ~ 'Noa')::text, ',') from nestly.profile_view(%L) v $q$, pg_temp.id('b'))),
  'shown/false', '[audit-fix FR-PRIV-001] nor in Restricted (a Friend sees the Open view, children only as the Journey Summary)');
select is(pg_temp.dml('b', $q$ update nestly.regular_profiles set profile_visibility = 'open' $q$), 'OK:1', '[audit-fix] (setup) back to Open');
select is(pg_temp.deliver('a'), '0', '[audit-fix] a birthday notifies once: a second opening adds nothing');
select is(pg_temp.deliver('b'), '0', '[audit-fix] a parent is not notified of its own children');
select is(pg_temp.deliver('c'), '0', '[audit-fix FR-NOTIF-003] someone who is not a Friend is not notified');

-- BR-037: only with the parent's permission
select tests.fx_nt_purge();
select is(pg_temp.share('b', false), 'OK:1', '[audit-fix] (setup) B turns "a child''s birthday in notifications to Friends" off');
select is(pg_temp.deliver('a'), '0', '[audit-fix BR-037 AC-046 NFR-PRIV-003] with the parent''s permission off, nothing is created');
select is(pg_temp.share('b', true), 'OK:1', '[audit-fix] (setup) and back on');

-- condition 3: the recipient's preference
select tests.fx_nt_pref(pg_temp.id('a'), 'birthdays', false);
select is(pg_temp.deliver('a'), '0', '[audit-fix condition 3 FR-NOTIF-002] the recipient''s "birthdays" category off: nothing');
select tests.fx_nt_pref(pg_temp.id('a'), 'birthdays', true);
select is(pg_temp.deliver('a'), '2', '[audit-fix condition 3] (control) switched back on, they come');

-- a Friendship that is not accepted, an inactive parent
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'pending');
select is(pg_temp.deliver('a') || pg_temp.deliver('b'), '00', '[audit-fix FR-NOTIF-003] a pending Friend Request is not a Friendship: nothing');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select tests.set_status(pg_temp.id('b'), 'suspended');
select is(pg_temp.deliver('a'), '0', '[audit-fix platform r15] a suspended parent''s children notify nobody');
select tests.set_status(pg_temp.id('b'), 'active');
select tests.set_status(pg_temp.id('a'), 'suspended');
select is(pg_temp.deliver('a'), '0', '[audit-fix platform r15] a suspended caller gets nothing');
select tests.set_status(pg_temp.id('a'), 'active');

-- condition 3: never across a user block (either direction). A block ends the Friendship; the fixture re-creates it after the block,
-- so the block alone is what stops the delivery.
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.dml('b', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('a'))),
  'OK:1', '[audit-fix] (setup) the parent B blocks A');
select pg_temp.reset();
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.deliver('a'), '0', '[audit-fix condition 3 FR-REL-002] no birthday notification across a block (the parent blocked the Friend)');
select is(pg_temp.dml('b', format($q$ update nestly.user_blocks set lifted_at = now() where blocked_id = %L and lifted_at is null $q$, pg_temp.id('a'))), 'OK:1', '[audit-fix] (setup) B lifts the block');
select is(pg_temp.deliver('a'), '2', '[audit-fix condition 3] (control) without the block, they come');
select pg_temp.reset();
select is(pg_temp.dml('a', format($q$ insert into nestly.user_blocks (blocked_id, blocked_account_type) values (%L, 'regular') $q$, pg_temp.id('b'))),
  'OK:1', '[audit-fix] (setup) the Friend A blocks the parent B');
select tests.fx_fr_add(pg_temp.id('a'), pg_temp.id('b'), 'accepted');
select is(pg_temp.deliver('a'), '0', '[audit-fix condition 3 FR-REL-002] nor when the recipient is the one who blocked');
select is(pg_temp.dml('a', format($q$ update nestly.user_blocks set lifted_at = now() where blocked_id = %L and lifted_at is null $q$, pg_temp.id('b'))), 'OK:1', '[audit-fix] (setup) A lifts the block');

-- only Regular callers
select is(pg_temp.deliver('q1') || pg_temp.deliver('d') || pg_temp.deliver('m0'), '000',
  '[audit-fix FR-NOTIF-003] a Professional, an Admin and a Moderator get none (no Friends, no birthdays)');
select is(tests.as_role('anon', null, 'select nestly.deliver_child_birthdays()::text'), 'ERR:42501', '[audit-fix] a Guest cannot call it');

-- =====================================================================================================================
-- 3. Analytics: Professionals and Marketplace (FR-ADMIN-010, BR-058)
-- =====================================================================================================================
select is((select string_agg(c.relname || '.' || pl.polname || ':' || pl.polcmd::text, ', ' order by c.relname)
             from pg_policy pl join pg_class c on c.oid = pl.polrelid
            where c.relnamespace = 'nestly'::regnamespace and pl.polname like '%\_select\_analytics'
              and c.relname in ('professional_follows', 'conversations', 'marketplace_listings')),
  'conversations.conversations_select_analytics:r, marketplace_listings.marketplace_listings_select_analytics:r, professional_follows.professional_follows_select_analytics:r',
  '[audit-fix FR-ADMIN-010] the three new analytics reads, read-only');
select is(pg_temp.dml('b', format($q$ insert into nestly.professional_follows (professional_id) values (%L) $q$, pg_temp.id('q2'))), 'OK:1',
  '[audit-fix] (setup) B follows q2');
select is(pg_temp.dml('b', format($q$ insert into nestly.conversations (context, user_a, user_b) values ('professional', %L, %L) $q$,
    least(pg_temp.id('b'), pg_temp.id('q2')), greatest(pg_temp.id('b'), pg_temp.id('q2')))), 'OK:1', '[audit-fix] (setup) B opens a chat with q2');
select is(pg_temp.dml('b', $q$ insert into nestly.marketplace_listings (title, category, item_condition, city) values ('עגלה', 'strollers', 'good', 'haifa') $q$),
  'OK:1', '[audit-fix] (setup) B lists an item');
select is(pg_temp.dml('b', $q$ update nestly.marketplace_listings set status = 'sold' $q$), 'OK:1', '[audit-fix] (setup) and sells it');

select is(pg_temp.na('d', 'professional_follows'), tests.fx_pr_count('nestly.professional_follows')::text,
  '[audit-fix FR-ADMIN-010 BR-058] the Admin counts every follow on the analytics screen');
select is(pg_temp.na('d', 'conversations'), tests.fx_pr_count('nestly.conversations')::text, '[audit-fix FR-ADMIN-010] every conversation opened');
select is(pg_temp.na('d', 'marketplace_listings'), tests.fx_pr_count('nestly.marketplace_listings')::text, '[audit-fix FR-ADMIN-010] every listing, a sold one included');
select ok(tests.fx_pr_count('nestly.professional_follows') > 0 and tests.fx_pr_count('nestly.conversations') > 0, '[audit-fix] (control) the counts are not vacuous');
select is(tests.n_as(pg_temp.id('d'), 'nestly.conversations') || '/' || tests.n_as(pg_temp.id('d'), 'nestly.professional_follows'), '0/0',
  '[audit-fix BR-058] outside the analytics screen the Admin reads none of them');
select is(pg_temp.na('m0', 'conversations') || '/' || pg_temp.na('m0', 'professional_follows'), '0/0',
  '[audit-fix NFR-SEC-002] a Moderator without ANALYTICS_VIEW reads none, on the analytics screen too');
select is(pg_temp.na('a', 'conversations') || '/' || pg_temp.na('a', 'marketplace_listings'), '0/0',
  '[audit-fix] nor does a user who names the analytics screen (A has no conversation, and sees no sold listing of another)');
select is(pg_temp.q('d', $q$ select count(follower_id)::text from nestly.professional_follows $q$), 'ERR:42501',
  '[audit-fix VAL-032] a follower''s identity is still never readable');

select * from finish();

rollback;
