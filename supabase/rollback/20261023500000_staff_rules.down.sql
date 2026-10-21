-- =====================================================================================================================
-- Down script for supabase/migrations/20261023500000_staff_rules.sql (I14 completion B: the enforcement history and the staff deletion of
-- reported content, the hide after ten identical reports, the audited openings of a reported comment and of a profile, the announcement's
-- audience, the trends by calendar period, the upload block list).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Order:    revert the code that uses these objects first, then run this.
-- Safe:     only while none of the six new tables holds a row, no announcement has an audience other than everyone
--           (refuses otherwise). Audit entries already written stay (append-only).
-- Restores: audit_trigger() from 20261022800000_staff_work.sql (the integer child_tracker_trends was never dropped), profile_view() from
--           20261017170000_profile_open_limit.sql, reports_handle_guard() from 20261020300000_safety_admin_core.sql, reports_update_staff and
--           media_assets_update_guard() from 20261022600000_marketplace.sql, media_reviews_guard(), media_assets_update_jobs and
--           media_reviews_insert_jobs from 20261021500000_media_stories.sql, system_announcements_select_published and system_announcements_prepare() from
--           20261022200000_moderators_team.sql; drops what the migration added.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the staff rules down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies: lifted inside this transaction only, for the check; the tables are dropped below.
  alter table nestly.enforcement_records no force row level security;
  alter table nestly.report_auto_hides no force row level security;
  alter table nestly.reported_comment_views no force row level security;
  alter table nestly.profile_staff_views no force row level security;
  alter table nestly.suspected_image_fingerprints no force row level security;
  alter table nestly.media_fingerprints no force row level security;
  alter table nestly.media_reviews no force row level security;
  alter table nestly.system_announcements no force row level security;
  if exists (select 1 from nestly.enforcement_records) or exists (select 1 from nestly.report_auto_hides)
     or exists (select 1 from nestly.reported_comment_views) or exists (select 1 from nestly.profile_staff_views)
     or exists (select 1 from nestly.suspected_image_fingerprints)
     or exists (select 1 from nestly.system_announcements where audience <> 'everyone')
     or exists (select 1 from nestly.media_fingerprints) or exists (select 1 from nestly.media_reviews where queue_reason = 'hash_match') then
    raise exception 'an enforcement record, a hide, a staff opening, a block hash, an addressed announcement or an image hash exists: the down script refuses';
  end if;
  alter table nestly.system_announcements force row level security;
  alter table nestly.media_reviews force row level security;
end
$$;

-- 8. the block list
drop policy media_assets_update_jobs on nestly.media_assets;
create policy media_assets_update_jobs on nestly.media_assets
  for update to app_media_jobs
  using (status = 'pending')
  with check (status in ('pending', 'passed', 'queued'));
drop policy media_reviews_insert_jobs on nestly.media_reviews;
create policy media_reviews_insert_jobs on nestly.media_reviews
  for insert to app_media_jobs
  with check (queue_reason is not null and not is_child and not is_suspected
    and exists (select 1 from nestly.media_assets m where m.id = media_reviews.media_id and m.status = 'pending'));
drop trigger media_reviews_hash_not_abuse on nestly.media_reviews;
drop trigger media_reviews_match_decision_audit on nestly.media_reviews;
drop function nestly.media_hash_not_abuse();
drop policy media_reviews_update_hash_staff on nestly.media_reviews;
revoke select (suspected_by) on table nestly.media_reviews from app_media_jobs;
revoke update (is_held) on table nestly.media_assets from app_media_jobs;
revoke insert (is_suspected) on table nestly.media_reviews from app_media_jobs;
drop table nestly.suspected_image_fingerprints;
drop table nestly.media_fingerprints;
alter table nestly.media_reviews drop column match_decided_at, drop column match_decided_by, drop column match_decision;
alter table nestly.media_reviews drop constraint media_reviews_queue_reason_check;
alter table nestly.media_reviews add constraint media_reviews_queue_reason_check
  check (queue_reason is null or queue_reason in ('blocked', 'unsure', 'error'));

-- 7. the trends
drop function nestly.child_tracker_trends(text, text, text, text);

-- 6. the audience
drop policy system_announcements_select_published on nestly.system_announcements;
create policy system_announcements_select_published on nestly.system_announcements
  for select to authenticated
  using ((select nestly.is_active_account()) and status = 'published');
alter table nestly.system_announcements drop constraint system_announcements_audience_stage_check;
alter table nestly.system_announcements drop constraint system_announcements_audience_check;
alter table nestly.system_announcements drop column audience_stage;
alter table nestly.system_announcements drop column audience;

-- 9, 5, 4. the openings and their audit triggers (the trigger function is restored below)
drop table nestly.profile_staff_views;
drop table nestly.reported_comment_views;

-- 3. the hide
drop policy posts_auto_hide on nestly.posts;
drop policy comments_auto_hide on nestly.comments;
drop policy marketplace_listings_auto_hide on nestly.marketplace_listings;
drop policy professional_reviews_auto_hide on nestly.professional_reviews;
drop policy professional_articles_auto_hide on nestly.professional_articles;
drop trigger reports_auto_hide_lift on nestly.reports;
drop trigger reports_identical_hide on nestly.reports;
drop function nestly.report_auto_hides_lift();
drop function nestly.identical_reports_hide();
drop policy reports_select_auto_hide on nestly.reports;
drop policy posts_select_auto_hide on nestly.posts;
drop policy post_authors_select_auto_hide on nestly.post_authors;
drop policy comments_select_auto_hide on nestly.comments;
drop policy marketplace_listings_select_auto_hide on nestly.marketplace_listings;
drop policy professional_reviews_select_auto_hide on nestly.professional_reviews;
drop policy professional_articles_select_auto_hide on nestly.professional_articles;
drop table nestly.report_auto_hides;
drop function nestly.auto_hide_scoped();
drop table nestly.auto_hide_scopes;

-- 2. the staff deletion
drop trigger posts_staff_delete on nestly.posts;
drop trigger comments_staff_delete on nestly.comments;
drop trigger marketplace_listings_staff_delete on nestly.marketplace_listings;
drop trigger professional_reviews_staff_delete on nestly.professional_reviews;
drop trigger professional_articles_staff_delete on nestly.professional_articles;
drop function nestly.content_staff_delete();
drop policy posts_delete_staff on nestly.posts;
drop policy comments_delete_staff on nestly.comments;
drop policy marketplace_listings_delete_staff on nestly.marketplace_listings;
drop policy professional_reviews_delete_staff on nestly.professional_reviews;
drop policy professional_articles_delete_staff on nestly.professional_articles;
revoke delete on table nestly.professional_reviews from authenticated;
drop policy reports_update_staff on nestly.reports;
create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and (case when target_kind in ('user', 'message')
           then ((select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
                 or (select nestly.has_permission('USER_BAN')))
           when target_kind = 'listing' then (select nestly.has_permission('MARKETPLACE_MODERATE'))
           else (select nestly.has_permission('CONTENT_MODERATE')) end))
  with check (status = 'handled');

-- 1. the enforcement history
drop table nestly.enforcement_records;

-- The functions, verbatim from the migrations named in the header.
create or replace function nestly.system_announcements_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := null;
    new.removed_at := null;
    return new;
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status in ('published', 'removed')) or (old.status = 'published' and new.status = 'removed')) then
      raise exception 'system_announcements: % cannot become %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'published' then new.published_at := pg_catalog.now(); end if;
    if new.status = 'removed' then new.removed_at := pg_catalog.now(); end if;
  elsif new.title is not distinct from old.title and new.body is not distinct from old.body then
    return null; -- nothing changes: no row is written and nothing is audited
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

create or replace function nestly.reports_handle_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if old.status <> 'open' or new.status <> 'handled' or new.resolution is null then
    raise exception 'reports: a report is only closed as handled, with a resolution' using errcode = '42501';
  end if;
  new.handled_by := (select auth.uid());
  new.closed_at := pg_catalog.now();
  return new;
end
$$;

create or replace function nestly.media_assets_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mine boolean;
  v_suspected boolean;
begin
  if new.is_held is distinct from old.is_held and current_user <> 'authenticated' then
    raise exception 'media: only a staff decision holds an image' using errcode = '42501';
  end if;
  if current_user = 'app_media_jobs' then
    if new.post_id is distinct from old.post_id or new.listing_id is distinct from old.listing_id
       or new.sponsored_product_id is distinct from old.sponsored_product_id
       or new.position is distinct from old.position or new.decided_at is distinct from old.decided_at then
      raise exception 'media: the job cannot decide' using errcode = '42501';
    end if;
    if old.status = 'rejected' then
      -- a rejected image's file is gone: the job records only that (Afik 20.10.2026)
      if new.status <> 'rejected' or not new.is_file_removed or new.check_attempts <> old.check_attempts then
        raise exception 'media: the job only records a removed file' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.status <> 'pending' or new.status not in ('pending', 'passed', 'queued') or new.is_file_removed or new.check_attempts < old.check_attempts then
      raise exception 'media: the check moves only a pending image, to passed or queued' using errcode = '42501';
    end if;
    if new.status = 'queued' and not exists (select 1 from nestly.media_reviews r where r.media_id = new.id and r.queue_reason is not null) then
      raise exception 'media: a queued image has its reason first' using errcode = '23514';
    end if;
    if new.status is distinct from old.status then new.checked_at := pg_catalog.now(); end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status then
    -- a staff decision (BR-076 as of 20.10.2026): a queued image approved or rejected; a passed or approved one rejected after a report (not
    -- a dismissed one) or as a suspicion
    if not (select nestly.has_permission('CONTENT_MODERATE')) then
      raise exception 'media: a decision needs CONTENT_MODERATE' using errcode = '42501';
    end if;
    if new.post_id is distinct from old.post_id or new.listing_id is distinct from old.listing_id
       or new.sponsored_product_id is distinct from old.sponsored_product_id or new.position is distinct from old.position then
      raise exception 'media: a decision changes nothing else' using errcode = '42501';
    end if;
    select coalesce(bool_or(r.is_suspected), false) into v_suspected from nestly.media_reviews r where r.media_id = new.id;
    if old.status = 'queued' and new.status in ('approved', 'rejected') then
      if v_suspected and new.status <> 'rejected' then
        raise exception 'media: a suspected image is rejected' using errcode = '23514';
      end if;
    elsif old.status in ('passed', 'approved') and new.status = 'rejected' then
      -- after a report on its post, its listing or its uploader that is open (the moderator acts, then closes it) or was handled with action
      -- taken; a dismissed report is no ground. Or as a suspicion. The uploader sees the same rejection either way.
      if not (select nestly.has_permission('REPORTS_VIEW')) or not (v_suspected
          or exists (select 1 from nestly.reports r where (r.status = 'open' or r.resolution = 'action_taken')
                       and ((old.post_id is not null and r.post_id = old.post_id)
                         or (old.listing_id is not null and r.listing_id = old.listing_id)
                         or r.reported_user_id = old.owner_id))) then
        raise exception 'media: a checked image is removed only after a report or as a suspicion' using errcode = '42501';
      end if;
    else
      raise exception 'media: not a decision' using errcode = '23514';
    end if;
    new.is_held := v_suspected;
    new.decided_by := (select auth.uid());
    new.decided_at := pg_catalog.now();
    return new;
  end if;
  if new.is_held is distinct from old.is_held then
    raise exception 'media: only a decision holds an image' using errcode = '42501';
  end if;
  if old.status = 'rejected' or old.post_id is not null or old.listing_id is not null or old.sponsored_product_id is not null then
    raise exception 'media: this image cannot be attached' using errcode = '42501';
  end if;
  if old.kind = 'listing' then
    -- the uploader attaches a listing image to a listing of its own, once (FR-MKT-002; VAL-041: at most 6, by the unique position)
    if new.listing_id is null or new.post_id is not null or new.sponsored_product_id is not null then
      raise exception 'media: this image cannot be attached' using errcode = '42501';
    end if;
    select exists (select 1 from nestly.marketplace_listings l where l.id = new.listing_id and l.owner_id = (select auth.uid())) into v_mine;
    if not v_mine then
      raise exception 'media: the listing is not yours' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.kind = 'sponsored' then
    -- the Admin attaches a sponsored image to a sponsored product it manages, once (FR-ADMIN-009; one image, position 0)
    if new.sponsored_product_id is null or new.post_id is not null or new.listing_id is not null
       or not (select nestly.has_permission('SPONSORED_PRODUCT_MANAGE'))
       or not exists (select 1 from nestly.sponsored_products sp where sp.id = new.sponsored_product_id and sp.status <> 'removed') then
      raise exception 'media: this image cannot be attached' using errcode = '42501';
    end if;
    return new;
  end if;
  -- the uploader attaches an unattached post image to a post of their own, once (FR-FEED-002; VAL-041: at most 4, by the unique position)
  if new.post_id is null or old.kind <> 'post' or new.listing_id is not null or new.sponsored_product_id is not null then
    raise exception 'media: this image cannot be attached' using errcode = '42501';
  end if;
  select exists (select 1 from nestly.posts p where p.id = new.post_id and p.author_id = (select auth.uid()))
      or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = (select auth.uid()))
    into v_mine;
  if not v_mine then
    raise exception 'media: the post is not yours' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function nestly.media_reviews_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'app_media_jobs' then
    if tg_op <> 'INSERT' or new.is_child or new.is_suspected then
      raise exception 'media_reviews: the job records the queue reason only' using errcode = '42501';
    end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.queue_reason is distinct from old.queue_reason or new.scores is distinct from old.scores
      or (old.is_suspected and not new.is_suspected)) then
    raise exception 'media_reviews: staff mark a child or a suspicion only' using errcode = '42501';
  end if;
  if new.is_suspected and (tg_op = 'INSERT' or not old.is_suspected) then
    new.suspected_by := (select auth.uid());
    new.suspected_at := pg_catalog.now();
    new.purge_after := pg_catalog.now() + interval '90 days';
  elsif tg_op = 'UPDATE' then
    new.suspected_by := old.suspected_by;
    new.suspected_at := old.suspected_at;
    new.purge_after := old.purge_after;
  end if;
  return new;
end
$$;

create or replace function nestly.profile_view(p_target text)
returns table (full_name text, gender text, children_count smallint, child_ages jsonb, is_pregnant boolean,
               shows_empty_journey_sentence boolean, relationship text, friends jsonb, mutual_friends jsonb, outcome text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_n integer;
  v_w integer;
  v_opens timestamptz[];
  v_logged boolean;
  v_rel text;
  v_friend boolean;
begin
  if p_target is null or p_target !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or not nestly.is_active_account() then
    return;
  end if;
  perform pg_catalog.set_config('nestly.profile_view_target', p_target, true);
  -- new (c22): the limit is stored data and fails closed.
  select l.max_count, l.window_seconds into v_n, v_w from nestly.security_limits l where l.limit_key = 'profile_open';
  if v_n is null or v_w is null or v_n < 1 or v_w < 1 then
    raise exception 'profile_view: profile_open limit missing or invalid' using errcode = 'NS001';
  end if;
  -- new (c20): the caller's own counter row, locked for the rest of the transaction (one account is serialized, others never wait).
  insert into nestly.profile_open_counts as c (user_id) values (v_me)
    on conflict (user_id) do update set is_refusal_recorded = c.is_refusal_recorded
    returning c.opened_at, c.is_refusal_recorded into v_opens, v_logged;
  v_opens := array(select t from pg_catalog.unnest(v_opens) t where t > pg_catalog.now() - pg_catalog.make_interval(secs => v_w) order by t);
  if pg_catalog.cardinality(v_opens) >= v_n then
    -- c21: the first refusal of a stretch records one Security event; the refused open is not counted.
    if not v_logged then
      insert into nestly.security_events (kind, user_id) values ('profile_open_limit', v_me);
    end if;
    update nestly.profile_open_counts c set opened_at = v_opens, is_refusal_recorded = true where c.user_id = v_me;
    perform pg_catalog.set_config('nestly.profile_view_target', '', true);
    return query select null::text, null::text, null::smallint, null::jsonb, null::boolean, null::boolean,
                        null::text, null::jsonb, null::jsonb, 'limited'::text;
    return;
  end if;
  update nestly.profile_open_counts c set opened_at = v_opens || pg_catalog.now(), is_refusal_recorded = false where c.user_id = v_me;
  -- new (c19): the relationship state, for a Regular caller only; a Professional gets NULL.
  if (select u.account_type from nestly.users u where u.id = v_me) = 'regular' then
    select case when pg_catalog.bool_or(f.status = 'accepted') then 'friends'
                when pg_catalog.bool_or(f.status = 'pending' and f.cancelled_at is null and f.addressee_id = v_me) then 'received'
                when pg_catalog.bool_or(f.status in ('pending', 'declined') and f.cancelled_at is null and f.requester_id = v_me) then 'sent'
                else 'none' end
      into v_rel
      from nestly.friendships f
      where (f.requester_id = v_me and f.addressee_id = p_target::uuid) or (f.addressee_id = v_me and f.requester_id = p_target::uuid);
  end if;
  v_friend := v_rel is not distinct from 'friends';
  return query
    select p.full_name, case when s.is_full then p.gender end, k.n,
           case when s.is_full then (
             select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('years', a.m / 12, 'months', a.m % 12)
                                                  order by c.created_at, c.slot), '[]'::jsonb)
             from nestly.children c cross join lateral (select nestly.child_age_months(c.birth_date, pg_catalog.now()) as m) a
             where c.user_id = p.user_id) end,
           k.pregnant, (k.n = 0 and not k.pregnant and p.is_empty_journey_sentence_shown),
           v_rel, fl.list, fl.mutual, 'shown'::text                                      -- new: c18, c19
    from nestly.regular_profiles p
    join nestly.users u on u.id = p.user_id and u.status = 'active' and u.account_type = 'regular'
    cross join lateral (select p.profile_visibility = 'open' or v_friend as is_full) s   -- changed: DR-2 A
    cross join lateral (select (select count(*) from nestly.children c where c.user_id = p.user_id)::smallint as n,
      exists (select 1 from nestly.journey_contexts j where j.user_id = p.user_id and j.stage = 'pregnant') as pregnant) k
    -- new (c18): the target's Friends and the ones the caller shares; each entry exactly the id and the full name.
    cross join lateral (
      select coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id), '[]'::jsonb) as list,
             coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id) filter (where x.is_mutual), '[]'::jsonb) as mutual
      from (select n.user_id, n.full_name,
                   pg_catalog.jsonb_build_object('userId', n.user_id, 'fullName', n.full_name) as e,
                   exists (select 1 from nestly.friendships m   -- the caller's own rows: friendships_select_party
                           where m.status = 'accepted'
                             and ((m.requester_id = v_me and m.addressee_id = n.user_id)
                               or (m.addressee_id = v_me and m.requester_id = n.user_id))) as is_mutual
            from nestly.friendships f
            join nestly.regular_names n on n.user_id = case when f.requester_id = p.user_id then f.addressee_id else f.requester_id end
            where p.user_id in (f.requester_id, f.addressee_id) and f.status = 'accepted' and n.user_id <> v_me) x) fl
    where p.user_id = p_target::uuid;
  perform pg_catalog.set_config('nestly.profile_view_target', '', true);
end
$$;

create or replace function nestly.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select nestly.caller_staff_role());
  v_reason text := nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '');
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_action text;
  v_kind text;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_role is null then
    -- the owner role (fixtures, bootstrap) has no identity; a runtime caller whose staff role or session does not hold leaves no record, so it does nothing
    if auth.uid() is not null then
      raise exception 'audit_trigger: an unauditable action is refused' using errcode = '42501';
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;
  if tg_table_name = 'moderator_permissions' then
    v_key := 'MODERATOR_MANAGE';
    v_action := case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end;
    v_kind := 'user';
    v_target := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('permission', v_old ->> 'permission_key') end;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('permission', v_new ->> 'permission_key') end;
  elsif tg_table_name = 'report_reasons' then
    v_key := 'COMMUNITY_CONFIG';
    v_action := 'report_reason_changed';
    v_kind := 'report_reason';
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('key', v_old ->> 'key', 'label', v_old ->> 'label',
      'priority', v_old -> 'priority', 'sortOrder', v_old -> 'sort_order', 'isActive', v_old -> 'is_active') end;
    v_after := pg_catalog.jsonb_build_object('key', v_new ->> 'key', 'label', v_new ->> 'label', 'priority', v_new -> 'priority',
      'sortOrder', v_new -> 'sort_order', 'isActive', v_new -> 'is_active');
  elsif tg_table_name = 'reports' then
    v_key := 'REPORTS_VIEW';
    v_action := 'report_handled';
    v_kind := 'report';
    v_target := (v_new ->> 'id')::uuid;
    v_reason := nullif(v_new ->> 'handler_note', '');
    v_after := pg_catalog.jsonb_build_object('resolution', v_new ->> 'resolution', 'targetKind', v_new ->> 'target_kind', 'reason', v_new ->> 'reason');
  elsif tg_table_name in ('posts', 'comments') then
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'status' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'posts' then 'post' else 'comment' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status');
  elsif tg_table_name in ('professional_reviews', 'professional_articles') then
    -- FR-MOD-001, FR-SERV-011, FR-PRO-003 (I11 follow-ups): a reported review or article hidden, removed or restored by CONTENT_MODERATE.
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'moderation' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'professional_reviews' then 'review' else 'article' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'moderation');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'moderation');
  elsif tg_table_name = 'user_enforcements' then
    v_key := case v_new ->> 'kind' when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end;
    v_action := case v_new ->> 'kind' when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end;
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := v_new ->> 'reason';
    v_before := pg_catalog.jsonb_build_object('status', v_new ->> 'status_before');
    v_after := pg_catalog.jsonb_build_object('kind', v_new ->> 'kind', 'durationHours', v_new -> 'duration_hours', 'suspendedUntil', v_new -> 'suspended_until',
      'suggestedKind', v_new ->> 'suggested_kind', 'suggestedHours', v_new -> 'suggested_hours', 'stepSkipped', v_new -> 'is_step_skipped',
      'childSafety', v_new -> 'is_child_safety', 'reportId', v_new -> 'report_id');
  elsif tg_table_name = 'status_guides' then
    -- FR-ADMIN-012: an Admin-only action (no assignable Permission Key applies). Before/After carry what the guide is, not its text.
    v_action := case
      when tg_op = 'INSERT' then 'guide_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then case v_new ->> 'status'
        when 'published' then 'guide_published' when 'hidden' then 'guide_hidden' else 'guide_unpublished' end
      else 'guide_edited' end;
    v_kind := 'guide';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'stageKind', v_old ->> 'stage_kind', 'rangeFrom', v_old -> 'range_from', 'rangeTo', v_old -> 'range_to',
      'sourceCheckedOn', v_old ->> 'source_checked_on', 'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'stageKind', v_new ->> 'stage_kind',
      'rangeFrom', v_new -> 'range_from', 'rangeTo', v_new -> 'range_to', 'sourceCheckedOn', v_new ->> 'source_checked_on',
      'bodyChars', pg_catalog.char_length(v_new ->> 'body'), 'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'media_assets' then
    -- FR-FEED-002 / BR-076 (Afik 20.10.2026): a staff decision on an image (a queued one approved or rejected; a checked one rejected after
    -- a report or as a suspicion). heldAsSuspected: the image is kept 90 days and never enters the training set.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'mediaKind', v_new ->> 'kind', 'heldAsSuspected', v_new -> 'is_held');
  elsif tg_table_name = 'media_reviews' then
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told).
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_suspected';
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after');
  elsif tg_table_name = 'support_requests' then
    -- FR-ADMIN-002: a status change of a Support request (the trigger fires only when the status moves).
    v_key := 'SUPPORT_HANDLE';
    v_action := 'support_status_changed';
    v_kind := 'support_request';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'topic', v_new ->> 'topic');
  elsif tg_table_name = 'support_messages' then
    -- FR-ADMIN-002, FR-CHAT-004: a reply in the name of Support or an internal note (the trigger fires only for author_kind 'support').
    -- The entry carries what it was, never the text.
    v_key := 'SUPPORT_HANDLE';
    v_action := case when (v_new ->> 'is_internal')::boolean then 'support_note_added' else 'support_replied' end;
    v_kind := 'support_request';
    v_target := (v_new ->> 'support_request_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('internal', v_new -> 'is_internal', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'));
  elsif tg_table_name = 'reported_message_views' then
    -- §9.6 (Afik 20.10.2026): a staff member opened a reported chat message (only that message; never the conversation).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_message_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  elsif tg_table_name = 'moderator_invitations' then
    -- FR-ADMIN-004: the Admin invites or revokes an invitation (its redemption is audited on staff_roles). Never the code or its hash.
    if tg_op = 'INSERT' then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invited';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_after := pg_catalog.jsonb_build_object('note', v_new ->> 'note', 'expiresAt', v_new ->> 'expires_at');
    elsif v_new ->> 'revoked_at' is not null and v_old ->> 'revoked_at' is null then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invitation_revoked';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_before := pg_catalog.jsonb_build_object('note', v_old ->> 'note');
    else
      raise exception 'audit_trigger: only an invitation issued or revoked is audited here' using errcode = '42501';
    end if;
  elsif tg_table_name = 'staff_roles' then
    -- FR-ADMIN-004: a Moderator created from an invitation (the new staff role exists now, so the entry carries it as the actor).
    v_action := 'moderator_joined';
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    -- I14 completion (Afik 21.10.2026, decisions-in-force.md §9.1): the use of the invitation is recorded with it
    v_after := pg_catalog.jsonb_build_object('invitationId', (select i.id from nestly.moderator_invitations i where i.code_hash = nestly.moderator_invite_hash()));
  elsif tg_table_name = 'system_announcements' then
    -- FR-ADMIN-008, AC-049: created, edited, published or removed. Before/After carry the status, the title and the body's length.
    v_key := 'SYSTEM_ANNOUNCEMENTS';
    v_action := case
      when tg_op = 'INSERT' then 'announcement_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'announcement_' || (v_new ->> 'status')
      else 'announcement_edited' end;
    v_kind := 'announcement';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'),
      'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'private_group_content_views' then
    -- NFR-PRIV-002, BR-040 (I10): a staff member opened reported Private Group content (that post or comment with its post and comments, the
    -- report's context since the I14 completion: withThread; never the rest of the Group).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_content_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('targetKind', case when v_new ->> 'post_id' is not null then 'post' else 'comment' end,
      'withThread', true);
  elsif tg_table_name = 'marketplace_listings' then
    -- §3.2 MARKETPLACE_MODERATE (I12): a listing hidden or restored (the trigger fires only when is_hidden moves). Never its title.
    v_key := 'MARKETPLACE_MODERATE';
    v_action := case when (v_new ->> 'is_hidden')::boolean then 'listing_hidden' else 'listing_restored' end;
    v_kind := 'listing';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('hidden', v_old -> 'is_hidden');
    v_after := pg_catalog.jsonb_build_object('hidden', v_new -> 'is_hidden', 'status', v_new ->> 'status', 'category', v_new ->> 'category');
  elsif tg_table_name = 'sponsored_products' then
    -- FR-ADMIN-009, AC-058 (I12): a Sponsored Product created, edited, published, paused or removed (Admin Only key).
    v_key := 'SPONSORED_PRODUCT_MANAGE';
    v_action := case
      when tg_op = 'INSERT' then 'sponsored_product_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'sponsored_product_' || (v_new ->> 'status')
      else 'sponsored_product_edited' end;
    v_kind := 'sponsored_product';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'sponsor', v_old ->> 'sponsor_name', 'category', v_old ->> 'category', 'linkUrl', v_old ->> 'link_url') end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'sponsor', v_new ->> 'sponsor_name',
      'category', v_new ->> 'category', 'linkUrl', v_new ->> 'link_url',
      'descriptionChanged', tg_op = 'UPDATE' and v_new ->> 'description' is distinct from v_old ->> 'description');
  elsif tg_table_name = 'group_staff_views' then
    -- I14 completion (§9.7, BR-040): a staff member opened a Private Group's page for review (its content, in that transaction only).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_viewed';
    v_kind := 'group';
    v_target := (v_new ->> 'group_id')::uuid;
  elsif tg_table_name = 'report_escalations' then
    -- I14 completion (Afik 21.10.2026, §9.9): a Moderator escalated a report to the Admin; the note is the entry's reason.
    v_key := 'REPORTS_VIEW';
    v_action := 'report_escalated';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_reason := v_new ->> 'note';
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;



comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one (with the invitation''s id), a System Announcement created, edited, published or removed, a staff view of reported Private Group content, a Marketplace listing hidden or restored, a Sponsored Product created, edited, published, paused or removed, a reported review or article hidden, removed or restored, or a report escalated to the Admin: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason; the note of an escalation) and Before/After. A caller who is no staff member leaves none.';
comment on function nestly.profile_view(text) is
  'One other Regular account''s profile (FR-PRIV-001, BR-044, AC-054, AC-078, NFR-SEC-006; F2.3b, F2.4c1): counts the open first (rolling window, N and W from security_limits; the Nth+1 returns one row with outcome limited and everything else NULL, and records one Security event per stretch; absent or invalid configuration raises NS001). Otherwise 0 or 1 row with outcome shown: full_name, children_count, is_pregnant, shows_empty_journey_sentence always; gender and child_ages ([{years, months}]) when the target is Open or the caller''s Friend (DR-2 A); relationship (none, sent, received, friends; NULL for a Professional caller); friends and mutual_friends ([{userId, fullName}]). Never a child''s name, sex, birth date, id or slot, a due date, a setting or a status. Caller active (is_active_account()); target active and Regular, else 0 rows, already counted. SECURITY DEFINER (data-model.md "Approved exceptions", DR-G1, DR-L A); EXECUTE authenticated.';
comment on function nestly.reports_handle_guard() is 'SECURITY INVOKER. Before update on reports by a user: only open -> handled with a resolution; sets handled_by and closed_at.';
comment on policy reports_update_staff on nestly.reports is 'REPORTS_VIEW closes an open report as handled; a post or comment report needs CONTENT_MODERATE, a user or message report a user key (USER_WARN, USER_SUSPEND or USER_BAN), a listing report MARKETPLACE_MODERATE.';
comment on function nestly.media_assets_update_guard() is 'SECURITY INVOKER. Who may change which column of media_assets: the job moves a pending image to passed or queued (a queued one has its reason first) and records a rejected image''s removed file; staff with CONTENT_MODERATE decide a queued image, or reject a checked one with REPORTS_VIEW after a report (on its post, its listing or its uploader) or as a suspicion (who, when and the hold set here); the uploader attaches an unattached post image to a post of their own, a listing image to a listing of their own, or (SPONSORED_PRODUCT_MANAGE) a sponsored image to a sponsored product.';
comment on function nestly.media_reviews_guard() is 'SECURITY INVOKER. The job writes the queue reason and scores once; staff mark a child or a suspicion (who, when and purge_after = +90 days set here); a suspicion is never withdrawn.';
comment on policy media_assets_update_jobs on nestly.media_assets is 'Rule 6 exception: the job records the check of a pending image (passed or queued, or one more failed attempt).';
comment on policy media_reviews_insert_jobs on nestly.media_reviews is 'Rule 6 exception: the job writes the queue reason and scores of a pending image, before it queues it.';
comment on policy system_announcements_select_published on nestly.system_announcements is 'Every active account reads the published announcements.';



delete from supabase_migrations.schema_migrations where version = '20261023500000';

commit;
