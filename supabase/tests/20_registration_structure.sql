-- pgTAP, run by pg_prove as app_server (CI `db` job, I1 F1.4 part a).
-- Structure of the registration tables: spec criterion 14 (owner-only rows: RLS, policies, grants), rule 1 (nothing
-- bypasses RLS), and the shape criterion 10 and 14 depend on. Behaviour is in files 21-23.
-- Source of expected values: .work/register-account-create/schema.md and interface.md (the approved lists), not the
-- migration text.
-- Catalog lookups join pg_class / pg_namespace by name: app_server has no USAGE on schema nestly, so a regclass cast
-- would fail with permission denied.
-- Written without a database to run against: CI is the first run. no_plan() on purpose.

begin;

select * from no_plan();

select is(session_user::text, 'app_server'::text,
  '[F1.4-a c14] session_user is app_server (this file must not run under another login)');

-- ---- the three tables exist, with exactly the approved columns --------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r' and c.relname in ('journey_contexts', 'children', 'legal_consents')),
  3::bigint,
  '[F1.4-a c14] journey_contexts, children and legal_consents exist in schema nestly');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'journey_contexts' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'created_at:timestamp with time zone:nn, due_date:date:null, id:uuid:nn, stage:text:nn, user_id:uuid:nn',
  '[F1.4-a c14] journey_contexts has exactly the approved columns (due_date is the only nullable one)');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'children' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'birth_date:date:nn, created_at:timestamp with time zone:nn, id:uuid:nn, name:text:nn, sex:text:nn, slot:smallint:nn, user_id:uuid:nn',
  '[F1.4-a c14] children has exactly name, sex, birth_date and the mechanics (slot, ids, created_at): nothing else about a minor');

select is(
  (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || case when a.attnotnull then 'nn' else 'null' end,
                     ', ' order by a.attname)
     from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname = 'legal_consents' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped),
  'accepted_at:timestamp with time zone:nn, has_declared_18_plus:boolean:nn, has_declared_qualification:boolean:nn, id:uuid:nn, privacy_version:text:nn, terms_version:text:nn, user_id:uuid:nn',
  '[F1.4-a c14 · I11 follow-ups] legal_consents has exactly the approved columns, all NOT NULL (has_declared_qualification: a Professional''s declaration, file 98)');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p', 'v', 'm', 'f') and a.attnum > 0 and not a.attisdropped
        and c.relname not in ('recovery_answers', 'recovery_throttles', 'recovery_events', 'identity_link_checks')
        and not (c.relname = 'moderator_invitations' and a.attname = 'code_hash')
        and a.attname ~* '(pass|pwd|hash|secret|token|salt|crypt|email|phone)' $$,
  '[F1.4-a c14 NFR-SEC-001 · F1.6, F2.0 scoped] no column of the five F1.1/F1.4 tables holds a password, hash, secret, token, email or phone (the recovery tables hold hashes by design: file 30; identity_link_checks: file 40)');

-- ---- defaults: the owner and the clock come from the database (rules 12, 13; criterion 10 / 14) ------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname)
     from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents') and a.attname = 'user_id'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'auth\.uid\(\)'),
  'children, journey_contexts, legal_consents',
  '[F1.4-a c14 platform r12] user_id defaults to auth.uid() on all three tables: the owner is set by the database');

select is(
  (select count(*) from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents') and a.attname = 'id'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'gen_random_uuid\(\)'),
  3::bigint,
  '[F1.4-a c14 NFR-SEC-006] id defaults to gen_random_uuid() on all three tables (not a counter)');

select is(
  (select count(*) from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly'
      and ((c.relname = 'journey_contexts' and a.attname = 'created_at')
        or (c.relname = 'children' and a.attname = 'created_at')
        or (c.relname = 'legal_consents' and a.attname = 'accepted_at'))
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~* 'now\(\)|current_timestamp|transaction_timestamp'),
  3::bigint,
  '[F1.4-a c10 c14 BR-068] created_at (two tables) and accepted_at default to the database clock');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname)
     from pg_catalog.pg_attrdef d
     join pg_catalog.pg_attribute a ON a.attrelid = d.adrelid and a.attnum = d.adnum
     join pg_catalog.pg_class c ON c.oid = d.adrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents')),
  'children.created_at, children.id, children.user_id, journey_contexts.created_at, journey_contexts.id, journey_contexts.user_id, legal_consents.accepted_at, legal_consents.has_declared_qualification, legal_consents.id, legal_consents.user_id',
  '[F1.4-a c14 · I11 follow-ups] only id, user_id and the clock column have defaults: stage, slot, name, sex, birth_date, versions and the declaration must be sent (the qualification declaration defaults to false; a Professional''s row must carry it, file 98)');

-- ---- constraints and indexes by name ---------------------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '.' || co.contype::text || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'journey_contexts' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('journey_contexts.p.journey_contexts_pkey'), ('journey_contexts.f.journey_contexts_user_id_fkey'),
            ('journey_contexts.c.journey_contexts_stage_check'), ('journey_contexts.c.journey_contexts_due_date_check'),
            ('journey_contexts.u.journey_contexts_user_id_stage_key') $$,
  '[F1.4-a c14] journey_contexts has exactly the approved constraints: pkey, owner FK, stage check, due-date check, one per stage');

select set_eq(
  $$ select c.relname || '.' || co.contype::text || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'children' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('children.p.children_pkey'), ('children.f.children_user_id_fkey'), ('children.c.children_slot_check'),
            ('children.c.children_name_check'), ('children.c.children_sex_check'), ('children.c.children_birth_date_check'),
            ('children.u.children_user_id_slot_key') $$,
  '[F1.4-a c14] children has exactly the approved constraints: pkey, owner FK, slot 1-10, name, sex, birth date, one child per slot');

select set_eq(
  $$ select c.relname || '.' || co.contype::text || '.' || co.conname
       from pg_catalog.pg_constraint co join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname = 'legal_consents' and co.contype in ('p', 'f', 'u', 'c') $$,
  $$ values ('legal_consents.p.legal_consents_pkey'), ('legal_consents.f.legal_consents_user_id_fkey'),
            ('legal_consents.c.legal_consents_terms_version_check'), ('legal_consents.c.legal_consents_privacy_version_check'),
            ('legal_consents.c.legal_consents_has_declared_18_plus_check'), ('legal_consents.u.legal_consents_user_id_versions_key') $$,
  '[F1.4-a c14] legal_consents has exactly the approved constraints: pkey, account FK, two version checks, declaration true, one row per version pair');

select set_eq(
  $$ select c.relname || '.' || i.relname || '.' || (ix.indpred is not null)::text || '.' || ix.indisunique::text
       from pg_catalog.pg_index ix join pg_catalog.pg_class c on c.oid = ix.indrelid join pg_catalog.pg_class i on i.oid = ix.indexrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents') $$,
  $$ values ('journey_contexts.journey_contexts_pkey.false.true'), ('journey_contexts.journey_contexts_user_id_stage_key.false.true'),
            ('journey_contexts.journey_contexts_user_id_planning_pregnant_key.true.true'),
            ('children.children_pkey.false.true'), ('children.children_user_id_slot_key.false.true'),
            ('legal_consents.legal_consents_pkey.false.true'), ('legal_consents.legal_consents_user_id_versions_key.false.true') $$,
  '[F1.4-a c14] the indexes are exactly the approved ones, all unique; the planning/pregnant one is partial');

select ok(
  (select pg_catalog.pg_get_indexdef(ix.indexrelid) ~* 'where' and pg_catalog.pg_get_indexdef(ix.indexrelid) ~ 'planning'
          and pg_catalog.pg_get_indexdef(ix.indexrelid) ~ 'pregnant' and pg_catalog.pg_get_indexdef(ix.indexrelid) !~ 'has_child'
     from pg_catalog.pg_index ix join pg_catalog.pg_class i on i.oid = ix.indexrelid
    where i.relname = 'journey_contexts_user_id_planning_pregnant_key'),
  '[F1.4-a c14 VAL-039] the partial unique index covers exactly the stages planning and pregnant');

-- ---- foreign keys: targets and actions -----------------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '->' || fc.relname || ':' || co.confdeltype::text
       from pg_catalog.pg_constraint co
       join pg_catalog.pg_class c  on c.oid = co.conrelid  join pg_catalog.pg_namespace n  on n.oid = c.relnamespace
       join pg_catalog.pg_class fc on fc.oid = co.confrelid
      where n.nspname = 'nestly' and co.contype = 'f' and c.relname in ('journey_contexts', 'children', 'legal_consents') $$,
  $$ values ('journey_contexts->regular_profiles:c'), ('children->regular_profiles:c'), ('legal_consents->users:c') $$,
  '[F1.4-a c14 · I9 BR-073] journeys and children cascade from regular_profiles; a consent goes with its users row (I9: CASCADE, file 110)');

select is(
  (select count(*) from pg_catalog.pg_constraint co
     join pg_catalog.pg_class c on c.oid = co.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and co.contype = 'f' and not co.convalidated),
  0::bigint,
  '[F1.4-a c14] every foreign key in nestly is validated');

-- ---- RLS on and forced, all five tables ---------------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r'
      and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
      and c.relrowsecurity and c.relforcerowsecurity),
  5::bigint,
  '[F1.4-a c14 platform r8] RLS is enabled AND forced on all five nestly tables');

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and not (c.relrowsecurity and c.relforcerowsecurity) $$,
  '[F1.4-a c14 platform r8] no table in nestly lacks RLS or FORCE');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p')),
  93::bigint,
  '[F1.4-a c14 · F1.6-a · F2.0-a · F2.4a c12 · F2.4-c c20 c21 c22 · F3.0a c17 · F3.0-b c1· I5 · I14 · I10 · I11 · I12 · I9] schema nestly holds exactly ninety-three tables, AC-192''s birthday_checks (file 115), I9''s account_deletion_events (file 110), I10 completion C''s group_highlights and group_member_enforcements (file 106), the I13 follow-up''s usage_events, professional_views, promotion_settings and promotion_monthly_summaries (file 104), I14 completion B''s enforcement_records, report_auto_hides, auto_hide_scopes, reported_comment_views, profile_staff_views, media_fingerprints and suspected_image_fingerprints (file 103), I13''s promotion_plans, promotion_payments, promotions and promotion_events (file 101), the I14 completion''s report_escalations, report_openings, group_staff_views and trend_scopes (file 100), I12''s marketplace_listings and sponsored_products (file 99), I11''s professional_profiles, professional_follows, outreach_requests, professional_reviews and professional_articles (file 97), I10''s groups, group_members, group_access, group_join_requests, group_invitations, group_bans, group_notification_preferences, group_staff_views, group_suggestions, group_highlight_configurations and private_group_content_views (file 96), I14''s moderator_invitations and system_announcements (file 95), I8''s chat_requests, conversations, messages, chat_blocks, chat_reads, support_requests, support_messages and reported_message_views (file 94), I5''s media_assets, media_reviews, profile_photos, stories, media_training_candidates, media_training_samples and media_training_events, I4''s user_blocks and the Intent Signal table search_intents, the four notification and search tables (notifications, notification_preferences, friend_content_notification_preferences, people_search_counts), I4''s staff_roles, moderator_permissions, audit_log, report_reasons and user_enforcements, I6''s cycle_entries, status_guides and tracker_events, F3.0b''s comments, reactions, reaction_owners and reports and F3.0a''s algorithm_configurations, post_authors, post_hides and posts on top of fourteen: the five F1.1/F1.4 ones, the three recovery tables, identity_link_checks, F2.4a''s friendships and regular_names and F2.4c1''s security_limits, profile_open_counts and security_events (no table nobody listed)');

select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind in ('r', 'p')),
  'account_deletion_events, algorithm_configurations, audit_log, auto_hide_scopes, birthday_checks, chat_blocks, chat_reads, chat_requests, children, comments, conversations, cycle_entries, enforcement_records, friend_content_notification_preferences, friendships, group_access, group_bans, group_highlight_configurations, group_highlights, group_invitations, group_join_requests, group_member_enforcements, group_members, group_notification_preferences, group_staff_views, group_suggestions, groups, identity_link_checks, journey_contexts, legal_consents, marketplace_listings, media_assets, media_fingerprints, media_reviews, media_training_candidates, media_training_events, media_training_samples, messages, moderator_invitations, moderator_permissions, notification_preferences, notifications, outreach_requests, people_search_counts, post_authors, post_hides, posts, private_group_content_views, professional_articles, professional_follows, professional_profiles, professional_reviews, professional_views, profile_open_counts, profile_photos, profile_staff_views, promotion_events, promotion_monthly_summaries, promotion_payments, promotion_plans, promotion_settings, promotions, reaction_owners, reactions, recovery_answers, recovery_events, recovery_throttles, regular_names, regular_profiles, report_auto_hides, report_escalations, report_openings, report_reasons, reported_comment_views, reported_message_views, reports, search_intents, security_events, security_limits, sponsored_products, staff_roles, status_guides, stories, support_messages, support_requests, suspected_image_fingerprints, system_announcements, tracker_events, trend_scopes, usage_events, user_blocks, user_enforcements, users',
  '[F1.6-a · F2.0-a · F2.4a c12 · F2.4-c c22 · F3.0a c17 · F3.0-b c1 · I4 · I5 · I8 · I14 · I10 · I11 · I12 · I14c · I13 · I10c · I9 · AC-192] the ninety-three tables are exactly these names');

-- ---- policies: the exact list ---------------------------------------------------------------------------------------------
select set_eq(
  $$ select c.relname || '.' || pol.polname || '.' || pol.polcmd::text
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents') $$,
  $$ values ('users.users_select_own.r'), ('users.users_insert_own.a'),
            ('regular_profiles.regular_profiles_select_own.r'), ('regular_profiles.regular_profiles_insert_own.a'),
            ('regular_profiles.regular_profiles_update_own.w'),
            ('journey_contexts.journey_contexts_select_own.r'), ('journey_contexts.journey_contexts_insert_own.a'),
            ('journey_contexts.journey_contexts_update_own.w'), ('journey_contexts.journey_contexts_delete_own.d'),
            ('children.children_select_own.r'), ('children.children_insert_own.a'),
            ('children.children_update_own.w'), ('children.children_delete_own.d'),
            ('legal_consents.legal_consents_select_own.r'), ('legal_consents.legal_consents_insert_own.a'),
            ('users.users_select_profile_view.r'), ('regular_profiles.regular_profiles_select_profile_view.r'),
            ('children.children_select_profile_view.r'), ('journey_contexts.journey_contexts_select_profile_view.r'),
            ('users.users_select_staff.r'), ('users.users_update_staff.w'), ('users.users_update_own_expired_suspension.w'), ('users.users_select_search.r'),
            ('users.users_update_own_deletion_request.w'), ('users.users_update_own_deletion_cancel.w'), ('users.users_select_jobs.r'), ('users.users_delete_jobs.d'),
            ('regular_profiles.regular_profiles_block_hide.r'),
            ('users.users_insert_moderator.a'), ('users.users_select_analytics.r'), ('children.children_select_child_data.r'), ('users.users_select_child_data.r'),
            ('children.children_select_birthday.r'), ('regular_profiles.regular_profiles_select_birthday.r') $$,
  '[F1.4-a c14 platform r14 · F1.6 scoped · F2.2a c9 · F2.2-b c18 · F2.3b c15] the policies on the five F1.1/F1.4 tables are exactly thirty-four (I9: users_update_own_deletion_request, users_update_own_deletion_cancel, and users_select_jobs and users_delete_jobs TO app_jobs, file 110; the SRS-audit fixes: children_select_birthday and regular_profiles_select_birthday TO app_owner, file 102; the I14 completion: children_select_child_data and users_select_child_data TO app_owner, file 100; I14: users_insert_moderator, a Moderator from a valid invitation, and users_select_analytics, file 95; blocking: the restrictive regular_profiles_block_hide, file 91; search: users_select_search TO app_owner, file 90; I4 adds users_select_staff, users_update_staff and users_update_own_expired_suspension): one SELECT and one INSERT per table plus regular_profiles_update_own (F2.1), children_update_own (F2.2a), journey_contexts_update_own (F2.2b1), the own-row deletes children_delete_own and journey_contexts_delete_own (F2.2b2, DR-1 A) and the four *_select_profile_view (F2.3b, TO app_owner: file 53), no other UPDATE, DELETE or ALL (the recovery policies: file 30; files 50, 51 and 54 assert the update and delete policies)');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and pol.polroles <> array[(select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')]
        and pol.polname not like '%\_select\_profile\_view' and pol.polname not in ('users_select_search', 'children_select_child_data', 'users_select_child_data', 'children_select_birthday', 'regular_profiles_select_birthday', 'users_select_jobs', 'users_delete_jobs') $$,
  '[F1.4-a c14 platform r4 · F1.6 scoped · F2.3b c15 · I14c] every policy on the five F1.1/F1.4 tables is TO authenticated only (not PUBLIC, not anon, not app_recovery), except the four *_select_profile_view, users_select_search, the two *_select_child_data and the two *_select_birthday TO app_owner (files 53, 90, 100 and 102)');

select is_empty(
  $$ select c.relname || '.' || pol.polname
       from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and not pol.polpermissive
        and c.relname || '.' || pol.polname not in ('posts.posts_block_hide', 'comments.comments_block_hide', 'regular_names.regular_names_block_hide',
          'regular_profiles.regular_profiles_block_hide', 'friendships.friendships_block_insert', 'friendships.friendships_block_update',
          'stories.stories_block_hide', 'profile_photos.profile_photos_block_hide', 'posts.posts_group_hide', 'posts.posts_group_insert',
          'comments.comments_group_hide', 'comments.comments_group_insert', 'reactions.reactions_group_insert', 'reports.reports_insert_community',
          'posts.posts_auto_hide', 'comments.comments_auto_hide', 'marketplace_listings.marketplace_listings_auto_hide',
          'professional_reviews.professional_reviews_auto_hide', 'professional_articles.professional_articles_auto_hide') $$,
  '[F1.4-a c14 · I4 blocking · I5 · I10 · I14c] every policy is permissive (no restrictive policy that hides an unreviewed branch) except the six reviewed block policies (file 91), I5''s two on Stories and profile photos (file 93), I10''s five group policies on posts, comments and reactions (file 96) and the I14 completion''s reports_insert_community (staff file no report, file 100) and completion B''s five *_auto_hide (ten identical reports, file 103)');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents')
      and pol.polname like '%\_select\_own' and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'auth\.uid\(\)'
      and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) ~ 'is_active_account'),
  3::bigint,
  '[F1.4-a c14 rule 15] each new SELECT policy tests auth.uid() and is_active_account()');

select is(
  (select count(*) from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relname in ('journey_contexts', 'children', 'legal_consents', 'regular_profiles')
      and pol.polname like '%\_insert\_own' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'auth\.uid\(\)'
      and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'is_active_account'),
  4::bigint,
  '[F1.4-a c14 rules 12, 15] the INSERT policies of the four dependent tables test auth.uid() and is_active_account()');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'auth\.uid\(\)'
      and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'regular' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'active'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'users' and pol.polname = 'users_insert_own'),
  '[F1.4-a c14 rule 14] users_insert_own pins the id to auth.uid() and the type and status to regular and active');

select ok(
  (select pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'accepted_at' and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'now\(\)'
     from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid
    where c.relname = 'legal_consents' and pol.polname = 'legal_consents_insert_own'),
  '[F1.4-a c14 BR-068] legal_consents_insert_own forces accepted_at to now() (the database clock)');

-- ---- grants ---------------------------------------------------------------------------------------------------------------
select is(
  (select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'nestly' and c.relkind = 'r' and c.relname <> 'identity_link_checks' and has_table_privilege('authenticated', c.oid, 'SELECT')),
  'account_deletion_events, algorithm_configurations, audit_log, chat_blocks, chat_reads, children, conversations, cycle_entries, enforcement_records, friend_content_notification_preferences, friendships, group_access, group_highlight_configurations, group_notification_preferences, group_staff_views, group_suggestions, journey_contexts, legal_consents, media_training_events, messages, moderator_invitations, moderator_permissions, notification_preferences, notifications, post_authors, post_hides, private_group_content_views, profile_staff_views, reaction_owners, regular_names, regular_profiles, report_escalations, report_openings, report_reasons, reported_comment_views, reported_message_views, reports, search_intents, staff_roles, status_guides, support_messages, support_requests, system_announcements, tracker_events, user_blocks, user_enforcements, users',
  '[F1.4-a c14 · F2.0 scoped · F2.4a c12 · F3.0a c1 · F3.0-b c1 c12 c14] authenticated holds table-level SELECT on the five tables and, I4''s user_blocks (file 91), I5''s media_training_events (the access record, file 93; the other media tables carry column-level SELECT only), I8''s eight chat, Support and reported-message tables (file 94), from F2.4a, friendships and regular_names, from F3.0a algorithm_configurations, post_authors and post_hides, from F3.0b reaction_owners and reports, and the notification tables notifications, notification_preferences and friend_content_notification_preferences, from I6 tracker_events, cycle_entries and status_guides, from I9 account_deletion_events (file 110); posts, comments and reactions carry column-level SELECT only (held_xact and liker_status never granted: files 70 and 73); identity_link_checks: file 40');

-- Amendment 1 (CRITIC a-1): INSERT is granted per COLUMN, never per table.
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'INSERT') $$,
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1] authenticated holds no table-level INSERT on any nestly table (only per-column INSERT)');

select is(
  (select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attnum)
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
      and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
      and has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT')),
  'children.slot, children.name, children.sex, children.birth_date, journey_contexts.stage, journey_contexts.due_date, '
  || 'legal_consents.terms_version, legal_consents.privacy_version, legal_consents.has_declared_18_plus, legal_consents.has_declared_qualification, '
  || 'regular_profiles.full_name, regular_profiles.gender, users.account_type, users.status',
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1 · I11 follow-ups] authenticated can INSERT exactly these 14 columns and no others');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped and a.attacl is not null
      and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')),
  20::bigint,
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1 · F1.6 scoped · F2.3-a c5 · I4 · I11 follow-ups] exactly 20 columns of the five F1.1/F1.4 tables carry a column-level ACL: the 14 INSERT columns, F2.3a''s three UPDATE-only settings and I4''s UPDATE of users.suspended_until (status already carried its INSERT entry), and I9''s app_jobs read of users.id and users.deletion_due_at (file 110)');

select is_empty(
  $$ select c.relname || '.' || a.attname || ':' || x.grantee::text || ':' || x.privilege_type
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid, lateral pg_catalog.aclexplode(a.attacl) x
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
        and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and not (x.privilege_type = 'INSERT' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated'))
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'regular_profiles' and a.attname in ('full_name', 'gender', 'profile_visibility',
                                                                      'is_empty_journey_sentence_shown', 'is_child_birthday_shared'))
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'children' and a.attname in ('name', 'sex', 'birth_date'))
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'journey_contexts' and a.attname = 'due_date')
        and not (x.privilege_type = 'UPDATE' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated')
                 and c.relname = 'users' and a.attname in ('status', 'suspended_until'))
        and not (x.privilege_type = 'SELECT' and x.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'app_jobs')
                 and c.relname = 'users' and a.attname in ('id', 'account_type', 'status', 'deletion_due_at')) $$,
  '[F1.4-a c14 · CRITIC a-1 · F1.6 scoped · F2.2a c9 · F2.2-b c18] on the five F1.1/F1.4 tables every column-level ACL entry is INSERT to authenticated, or the UPDATE of regular_profiles full_name/gender (F2.1) and the three privacy settings (F2.3a), children name/sex/birth_date (F2.2a) and journey_contexts due_date (F2.2b1): no column-level SELECT or REFERENCES, no other grantee');

select is_empty(
  $$ select v.t || '.' || v.col
       from (values ('users', 'id'), ('users', 'created_at'),
                    ('regular_profiles', 'user_id'), ('regular_profiles', 'account_type'), ('regular_profiles', 'created_at'),
                    ('journey_contexts', 'id'), ('journey_contexts', 'user_id'), ('journey_contexts', 'created_at'),
                    ('children', 'id'), ('children', 'user_id'), ('children', 'created_at'),
                    ('legal_consents', 'id'), ('legal_consents', 'user_id'), ('legal_consents', 'accepted_at')) as v(t, col)
       join pg_catalog.pg_class c on c.relname = v.t
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'nestly'
       join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = v.col
      where has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') $$,
  '[F1.4-a c14 rules 12, 13 · CRITIC a-1] none of the never-granted columns holds INSERT: identifiers, owners, clocks and regular_profiles.account_type always take their defaults');

select is(
  (select count(*) from (values ('users', 'id'), ('users', 'created_at'),
                    ('regular_profiles', 'user_id'), ('regular_profiles', 'account_type'), ('regular_profiles', 'created_at'),
                    ('journey_contexts', 'id'), ('journey_contexts', 'user_id'), ('journey_contexts', 'created_at'),
                    ('children', 'id'), ('children', 'user_id'), ('children', 'created_at'),
                    ('legal_consents', 'id'), ('legal_consents', 'user_id'), ('legal_consents', 'accepted_at')) as v(t, col)
     join pg_catalog.pg_class c on c.relname = v.t
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'nestly'
     join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = v.col),
  14::bigint,
  '[F1.4-a c14 · CRITIC a-1 control] all 14 never-granted columns exist (the previous test is not vacuous)');

select is_empty(
  $$ select c.relname || ':' || p.priv
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, p.priv)
        and not (c.relname in ('recovery_answers', 'children', 'journey_contexts', 'posts', 'post_hides', 'comments', 'reactions', 'tracker_events', 'cycle_entries', 'moderator_permissions', 'media_assets', 'profile_photos', 'group_members', 'group_bans', 'professional_follows', 'professional_articles', 'marketplace_listings', 'professional_reviews', 'report_auto_hides', 'suspected_image_fingerprints') and p.priv = 'DELETE') $$,
  '[F1.4-a c14 criterion 14 amended · F2.0 scoped · F2.2-b c18] authenticated holds no table-level UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any nestly table; the DELETEs are the F2.0 D1 clear of recovery_answers (file 40) and the F2.2b2 own-row removal of children and journeys (DR-1 A, file 54) and F3.0a''s own-post and own-hide delete (3א, 7א: files 70-71) and F3.0b''s own-comment and own-like delete (3א, c12: files 73-74) and I6''s own tracker_events and cycle_entries delete (file 86) and I5''s own image and profile photo delete (file 93) and I10''s leave, remove and unblock (group_members, group_bans: file 96) and I11''s unfollow and own-article delete (professional_follows, professional_articles: file 97) and I12''s own-listing delete (marketplace_listings: file 99)');

select is_empty(
  $$ select c.relname || '.' || a.attname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
        and c.relname in ('users', 'regular_profiles', 'journey_contexts', 'children', 'legal_consents')
        and not (c.relname = 'regular_profiles' and a.attname in ('full_name', 'gender', 'profile_visibility',
                                                                  'is_empty_journey_sentence_shown', 'is_child_birthday_shared'))
        and not (c.relname = 'children' and a.attname in ('name', 'sex', 'birth_date'))
        and not (c.relname = 'journey_contexts' and a.attname = 'due_date')
        and not (c.relname = 'users' and a.attname in ('status', 'suspended_until'))
        and (has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE')
             or has_column_privilege('authenticated', c.oid, a.attnum, 'REFERENCES')) $$,
  '[F1.4-a c14 criterion 14 amended · F1.6 scoped · F2.2a c9 · F2.2-b c18] no column of the five F1.1/F1.4 tables can be UPDATEd or REFERENCEd by authenticated beyond regular_profiles full_name/gender (file 50), the three privacy settings (file 52, which also bars their REFERENCES), children name/sex/birth_date (file 51) and journey_contexts due_date (file 54); recovery_answers has its own column-level UPDATE: file 30');

select is_empty(
  $$ select c.relname || ':' || r.rolname
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('service_role'), ('app_server'), ('app_jobs'), ('app_media_jobs')) as r(rolname)
      where n.nspname = 'nestly' and c.relkind in ('r', 'p')
        and (has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             or has_any_column_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
        and not (r.rolname = 'app_jobs' and c.relname in ('posts', 'comments', 'reports', 'search_intents', 'usage_events', 'professional_views', 'promotion_events', 'promotions', 'promotion_payments', 'promotion_monthly_summaries'))
        and not (r.rolname = 'app_jobs' and c.relname in ('users', 'account_deletion_events', 'conversations', 'security_events', 'recovery_events', 'enforcement_records', 'user_enforcements', 'audit_log',
                                                          'messages', 'marketplace_listings', 'professional_articles', 'professional_reviews'))
        and not (r.rolname = 'app_media_jobs' and c.relname in ('media_assets', 'media_reviews', 'profile_photos', 'stories', 'media_fingerprints', 'suspected_image_fingerprints', 'media_training_candidates', 'media_training_samples', 'media_training_events')) $$,
  '[F1.4-a c14 platform r1, r7 · F3.0-b c14 · I5] anon, service_role, app_server, app_jobs and app_media_jobs hold no privilege on any nestly table, new ones included, but app_jobs on posts, comments and reports (the approved purge exception: exact grants in file 73), on search_intents and on the I13 follow-up''s retention tables (usage_events, professional_views, the paid events, their promotions and payments, and the monthly summaries: file 104) and app_media_jobs on the seven media tables (the image check, training copy and purge: exact grants in file 93), and I9''s app_jobs on users, the deletion record, conversations and the kept records (file 110)');

select is(
  (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace, lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'nestly' and c.relkind in ('r', 'p') and a.grantee = 0),
  0::bigint,
  '[F1.4-a c14 platform r7] PUBLIC holds no privilege on any nestly table');

select is_empty(
  $$ select r.rolname
       from pg_catalog.pg_roles r
      where r.rolbypassrls and not r.rolsuper
        and (r.rolname in ('authenticated', 'anon', 'app_server', 'app_jobs', 'app_media_jobs')
             or pg_has_role('authenticated', r.oid, 'member') or pg_has_role('anon', r.oid, 'member')
             or pg_has_role('app_server', r.oid, 'member') or pg_has_role('app_jobs', r.oid, 'member')
             or pg_has_role('app_media_jobs', r.oid, 'member')) $$,
  '[F1.4-a c14 platform r1] no BYPASSRLS role is a runtime role or one a runtime role can become (Supabase''s built-in service_role has the attribute by design; it is unreachable: see the grants checks above)');

select is_empty(
  $$ select c.relname || ':service_role'
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('r', 'p')
        and (has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             or has_schema_privilege('service_role', n.oid, 'USAGE')) $$,
  '[F1.4-a c14 platform r1] service_role, which bypasses RLS by design, holds no schema or table privilege in nestly: it cannot reach the data');

-- ---- nothing else came with the migration --------------------------------------------------------------------------------
select is_empty(
  $$ select c.relname || '.' || t.tgname
       from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and not t.tgisinternal and t.tgname not in ('identity_link_checks_transition', 'friendships_transition', 'regular_profiles_name_insert', 'posts_insert_prepare', 'posts_insert_author', 'algorithm_configurations_guard', 'post_hides_insert_guard', 'posts_update_share_guard', 'notify_friendship_insert', 'notify_friendship_accept', 'notify_comment', 'notify_post', 'notifications_read_guard', 'posts_content_hold', 'comments_content_hold', 'comments_insert_prepare', 'reactions_insert_prepare', 'reactions_insert_owner', 'reports_insert_check', 'users_staff_mirror', 'audit_log_append_only', 'audit_log_no_truncate', 'moderator_permissions_audit', 'report_reasons_guard', 'report_reasons_audit', 'reports_insert_snapshot', 'reports_handle_guard', 'reports_audit', 'posts_moderation_audit', 'comments_moderation_audit', 'posts_reject_staff_edit', 'users_status_guard', 'user_enforcements_prepare', 'user_enforcements_apply', 'user_enforcements_audit', 'status_guides_prepare', 'status_guides_audit', 'user_blocks_end_relations', 'user_blocks_insert_limit', 'user_blocks_lift_guard', 'media_assets_update_guard', 'media_assets_decision_audit', 'media_reviews_guard', 'media_reviews_suspicion_audit_insert', 'media_reviews_suspicion_audit_update', 'media_reviews_suspicion_reject', 'profile_photos_prepare', 'profile_photos_replaced', 'stories_prepare', 'reports_training_candidate', 'posts_training_candidate', 'media_assets_training_candidate', 'media_training_samples_log', 'moderator_invitations_guard', 'moderator_invitations_audit_insert', 'moderator_invitations_audit_revoke', 'staff_roles_joined_audit', 'system_announcements_prepare', 'system_announcements_audit', 'chat_requests_transition', 'chat_requests_insert_limit', 'chat_blocks_lift_guard', 'chat_reads_stamp', 'support_requests_transition', 'support_requests_insert_limit', 'support_messages_author', 'support_requests_audit', 'support_messages_audit', 'chat_blocks_insert_limit', 'reported_message_views_audit', 'comments_insert_group', 'group_bans_remove', 'group_invitations_admit', 'group_invitations_decide', 'group_join_requests_admit', 'group_join_requests_decide', 'group_members_guard', 'group_members_insert_access', 'group_notification_preferences_touch', 'groups_insert_owner', 'groups_update_guard', 'notify_group_comment', 'notify_group_invitation', 'notify_group_join_approved', 'notify_group_join_request', 'notify_group_pinned', 'notify_group_post', 'notify_group_reaction', 'notify_group_suggestion', 'posts_group_share_guard', 'posts_reject_group_edit', 'private_group_content_views_audit', 'private_group_content_views_target', 'reports_private_group', 'professional_profiles_update_guard', 'outreach_requests_insert_limit', 'outreach_requests_transition', 'professional_articles_update_guard', 'marketplace_listings_update_guard', 'sponsored_products_update_guard', 'marketplace_listings_moderation_audit', 'sponsored_products_audit_insert', 'sponsored_products_audit_update', 'marketplace_listings_training_candidate', 'reports_target_gone', 'professional_reviews_moderation_guard', 'professional_articles_moderation_guard', 'professional_articles_reject_staff_edit', 'professional_reviews_update_guard', 'professional_reviews_moderation_audit', 'professional_articles_moderation_audit', 'notify_professional_outreach', 'notify_professional_review', 'notify_professional_follow', 'reports_thread_post', 'report_escalations_audit', 'group_staff_views_audit', 'promotion_payments_prepare', 'promotions_prepare', 'promotions_update_guard', 'promotion_events_guard', 'professional_follows_promotion_attribution', 'conversations_promotion_attribution',
        'posts_staff_delete', 'comments_staff_delete', 'marketplace_listings_staff_delete', 'professional_reviews_staff_delete', 'professional_articles_staff_delete',
        'reports_identical_hide', 'reports_auto_hide_lift', 'enforcement_records_audit', 'reported_comment_views_audit', 'profile_staff_views_audit',
        'media_reviews_hash_not_abuse', 'media_reviews_match_decision_audit', 'suspected_image_fingerprints_audit',
        'usage_events_guard', 'professional_views_guard', 'promotion_settings_prepare', 'promotion_settings_audit', 'promotions_staff_stop_audit',
        'group_invitations_route', 'group_member_enforcements_prepare', 'group_member_enforcements_apply', 'notify_group_invitation_decided', 'notify_group_enforcement',
        'users_deletion_record', 'reports_text_gone_with_account') $$,
  '[F1.4-a c14 · F2.0 scoped · F2.4a c12] no trigger on any nestly table but the F2.0 transition guard of identity_link_checks (file 40) and F2.4a''s friendships_transition and regular_profiles_name_insert (files 60-62) and F3.0a''s posts_insert_prepare, posts_insert_author, algorithm_configurations_guard and post_hides_insert_guard (files 70-72) and F3.0b''s content_hold on posts and comments, comments_insert_prepare, reactions_insert_prepare, reactions_insert_owner and reports_insert_check (files 73-76) and I4''s staff and moderation triggers (file 90) and I8''s chat and Support triggers (file 94) and I10''s group triggers (file 96) and I11''s four guards (file 97) and I12''s two guards, three audit triggers and the listing training trigger (file 99) and the I11 follow-ups'' report, moderation and notification triggers (file 98) and I13''s four promotion guards and two attribution triggers (file 101) and completion B''s staff deletion, identical-reports hide and its lift, and three audit triggers (file 103) and I10 completion C''s invitation route, enforcement and notification triggers (file 106) and I9''s users_deletion_record (file 110) and reports_text_gone_with_account (file 114): the limits are constraints, not code');

select set_eq(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'nestly' and p.prosecdef $$,
  $$ select a from tests.approved_security_definer() as a $$,
  '[F1.4-a c14 platform r10 · F2.3b c15] the SECURITY DEFINER functions in schema nestly are exactly the approved list (profile_view(text) F2.3b; the notification triggers and search_people, file 90)');

select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'nestly'),
  'account_deletion_record, algorithm_configurations_guard, analytics_reader, audit_log_append_only, audit_trigger, auto_hide_scoped, block_peer_ids, caller_account_type, caller_redeemed_invitation, caller_staff_role, chat_blocks_insert_limit, chat_blocks_lift_guard, chat_conversations, chat_pending_incoming, chat_pending_outgoing, chat_reads_stamp, chat_requests_insert_limit, chat_requests_transition, chat_support_threads, chat_unread_count, child_age_months, child_tracker_trends, child_tracker_trends, comments_insert_group, comments_insert_prepare, content_hold, content_staff_delete, delete_comment, delete_post, deliver_child_birthdays, execute_account_deletions, feed_group_suggestions, friendships_transition, group_bans_remove, group_highlight_threshold, group_invitations_admit, group_invitations_decide, group_invitations_route, group_join_requests_admit, group_join_requests_decide, group_member_enforcements_apply, group_members_guard, group_members_insert_access, group_notification_preferences_touch, group_role_rank, group_summaries, groups_insert_owner, groups_update_guard, has_permission, identical_reports_hide, identity_link_checks_transition, is_active_account, jwt_is_oauth, jwt_issued_at, jwt_session_id, marketplace_listings_update_guard, media_assets_update_guard, media_hash_not_abuse, media_reviews_guard, media_reviews_suspicion_reject, media_training_candidate, media_training_samples_log, moderator_invitations_guard, moderator_invite_hash, my_group_rank, notifications_bell_counts, notifications_latest, notifications_latest_before, notifications_read_guard, notifications_unread_count, notify_comment, notify_deliver, notify_friendship, notify_group, notify_post, notify_professional, notify_scope, outreach_requests_insert_limit, outreach_requests_transition, post_hides_insert_guard, posts_group_share_guard, posts_insert_author, posts_insert_prepare, posts_reject_group_edit, posts_update_share_guard, private_group_content_views_target, professional_articles_update_guard, professional_content_moderation_guard, professional_profiles_update_guard, professional_reviews_update_guard, professional_views_guard, profile_photos_prepare, profile_photos_replaced, profile_view, profile_view_target, promotion_attribution, promotion_events_guard, promotion_payments_prepare, promotion_settings_prepare, promotions_prepare, promotions_update_guard, purge_deleted_accounts, purge_expired_listings, purge_held_content, purge_promotion_data, purge_search_intents, purge_usage_events, reactions_insert_owner, reactions_insert_prepare, recovery_claimed_at, recovery_handle, recovery_ip, recovery_subject, regular_names_insert, regular_names_visible, reject_staff_edit, report_auto_hides_lift, report_reasons_guard, reports_handle_guard, reports_insert_check, reports_insert_snapshot, reports_private_group, reports_target_gone, reports_text_gone_with_account, reports_thread_post, reveal_post_author, search_people, search_scope, session_guard, sponsored_products_update_guard, status_guides_prepare, stories_prepare, support_messages_author, support_requests_insert_limit, support_requests_transition, system_announcements_prepare, usage_events_guard, user_blocks_end_relations, user_blocks_insert_limit, user_blocks_lift_guard, user_enforcements_apply, user_enforcements_prepare, users_staff_mirror, users_status_guard',
  '[F1.4-a c14 · F1.6-a c3 c21 · F2.0-a · F2.3b c15 · F2.4a c12] nestly holds exactly a hundred and forty-four functions (the plan-cached reads of Groups add group_summaries and feed_group_suggestions, file 117) (the plan-cached reads of Chat and Notifications add ten, file 116) (I12 part B adds purge_expired_listings, file 120) (I9 §22.5 adds reports_text_gone_with_account, file 114) (I9 adds account_deletion_record, execute_account_deletions and purge_deleted_accounts, file 110) (I11 completion C adds professional_reviews_update_guard, file 108) (I10 completion C adds group_highlight_threshold, group_invitations_route and group_member_enforcements_apply, file 106) (the I13 follow-up adds usage_events_guard, professional_views_guard, purge_usage_events, promotion_settings_prepare and purge_promotion_data, file 104) (completion B adds content_staff_delete, identical_reports_hide, report_auto_hides_lift, auto_hide_scoped and media_hash_not_abuse, and replaces child_tracker_trends by its calendar version, file 103) (the SRS-audit fixes add deliver_child_birthdays, file 102) (I13 adds promotion_payments_prepare, promotions_prepare, promotions_update_guard, promotion_events_guard and promotion_attribution, file 101) (the I14 completion adds child_tracker_trends and reports_thread_post, file 100) (the I11 follow-ups add reports_target_gone, professional_content_moderation_guard and notify_professional, file 98) (I12 adds marketplace_listings_update_guard and sponsored_products_update_guard, file 99) (I11 adds four trigger functions, file 97) (I10 adds eighteen: group_role_rank, my_group_rank, notify_group and fifteen trigger functions, file 96) (I14 adds analytics_reader, caller_redeemed_invitation, moderator_invitations_guard, moderator_invite_hash and system_announcements_prepare, file 95) (I8 adds eight trigger functions, file 94) (I5 adds media_assets_update_guard, media_reviews_guard, media_reviews_suspicion_reject, profile_photos_prepare, profile_photos_replaced, stories_prepare, media_training_candidate and media_training_samples_log, file 93) (I6 adds status_guides_prepare; blocking adds block_peer_ids, user_blocks_end_relations, user_blocks_insert_limit and user_blocks_lift_guard, file 91) (the notifications add notifications_read_guard, notify_comment, notify_deliver, notify_friendship, notify_post, notify_scope, search_people, search_scope and purge_search_intents) (I4 adds thirteen: has_permission, caller_staff_role, the staff and moderation triggers, reveal_post_author) (I3 rest PR-A adds posts_update_share_guard; professional-posting adds the RLS helper caller_account_type) (F3.0a c17: four trigger functions, no recording one; F3.0-b: delete_post, delete_comment, purge_held_content, content_hold and the four insert trigger functions, none records a view): is_active_account, the three recovery helpers, the five F2.0 helpers, the F2.0 transition trigger, F2.3b''s profile_view with its two helpers, and F2.4a''s friendships_transition and regular_names_insert (no other function came with a migration)');

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'nestly' and c.relkind in ('v', 'm', 'f', 'S') $$,
  '[F1.4-a c14 platform r9] schema nestly holds no view, materialized view, foreign table or sequence');

-- ---- fixtures are there, so "no row" results elsewhere are not vacuous ---------------------------------------------------
select is(tests.fx_counts(tests.fx_id('a')), '1/1/2/2/1', '[F1.4-a fixture] a: 1 user, 1 profile, 2 journeys, 2 children, 1 consent');
select is(tests.fx_counts(tests.fx_id('b')), '1/1/1/1/1', '[F1.4-a fixture] b: 1 user, 1 profile, 1 journey, 1 child, 1 consent');
select is(tests.fx_counts(tests.fx_id('c')), '0/0/0/0/0', '[F1.4-a fixture] c: nothing');

select * from finish();

rollback;
