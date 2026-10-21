-- =====================================================================================================================
-- Down script for supabase/migrations/20261022600000_marketplace.sql (I12, Marketplace).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while neither new table holds a row, no image is a listing or sponsored image, no conversation has the marketplace context
--           and no report is a listing report (refuses otherwise: data would be lost).
-- Restores: media_assets_select_viewer, _insert_owner, _update_owner, _delete_jobs, media_training_candidates_insert_staff,
--           media_assets_update_guard(), media_training_candidate() and its two triggers as 20261021500000 left them; reports_update_staff,
--           reports_insert_check() and the reports constraints as 20261022100000; reports_insert_snapshot() as 20261020300000;
--           conversations_insert_party and the context constraint as 20261022400000; audit_trigger() as 20261022300000. The new columns,
--           tables, triggers, functions and regular_names_select_listing_reader go; the history row is deleted.
--           (Bodies are copied from those files: a later migration that replaces one of them rebuilds this script on its own body.)
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the marketplace down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): lifted inside this transaction only, for
  -- the check; the new tables are dropped below and the others get FORCE back right after it.
  alter table nestly.marketplace_listings no force row level security;
  alter table nestly.sponsored_products no force row level security;
  alter table nestly.media_assets no force row level security;
  alter table nestly.conversations no force row level security;
  alter table nestly.reports no force row level security;
  if exists (select 1 from nestly.marketplace_listings) or exists (select 1 from nestly.sponsored_products)
     or exists (select 1 from nestly.media_assets where kind in ('listing', 'sponsored'))
     or exists (select 1 from nestly.conversations where context = 'marketplace')
     or exists (select 1 from nestly.reports where target_kind = 'listing') then
    raise exception 'an I12 row, a listing or sponsored image, a marketplace conversation or a listing report exists: the down script refuses';
  end if;
  alter table nestly.media_assets force row level security;
  alter table nestly.conversations force row level security;
  alter table nestly.reports force row level security;
end
$$;

-- policies back to their earlier text (before the columns they name go).
drop policy regular_names_select_listing_reader on nestly.regular_names;
drop policy media_assets_select_viewer on nestly.media_assets;
create policy media_assets_select_viewer on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_status = 'active' and status in ('passed', 'approved') and (
    (kind = 'post' and post_id is not null and exists (select 1 from nestly.posts p where p.id = media_assets.post_id))
    or (kind = 'profile' and exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id))
    or (kind = 'story' and exists (select 1 from nestly.stories s where s.media_id = media_assets.id))));
comment on policy media_assets_select_viewer on nestly.media_assets is 'Others read an image only after it passed or was approved, through a post, profile photo or Story they can read.';
drop policy media_assets_insert_owner on nestly.media_assets;
create policy media_assets_insert_owner on nestly.media_assets
  for insert to authenticated
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and owner_status = 'active'
    and status = 'pending' and post_id is null and position is null and not is_held and not is_file_removed
    and (select nestly.caller_account_type()) in ('regular', 'professional'));
comment on policy media_assets_insert_owner on nestly.media_assets is 'A Regular or Professional uploads, always pending and unattached.';
drop policy media_assets_update_owner on nestly.media_assets;
create policy media_assets_update_owner on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and post_id is null and kind = 'post')
  with check (owner_id = (select auth.uid()) and post_id is not null);
comment on policy media_assets_update_owner on nestly.media_assets is 'The uploader attaches an unattached post image to their own post (the guard checks the post).';
drop policy media_assets_delete_jobs on nestly.media_assets;
create policy media_assets_delete_jobs on nestly.media_assets
  for delete to app_media_jobs
  using (
    (is_held and exists (select 1 from nestly.media_reviews r where r.media_id = media_assets.id and r.purge_after <= now())
      -- a sample of it is deleted first (it is deletable while this row says held): it never outlives the row that marks it suspected
      and not exists (select 1 from nestly.media_training_samples t where t.source_media_id = media_assets.id))
    or (not is_held and status <> 'queued' and (status <> 'rejected' or is_file_removed) and (
      (kind = 'story' and created_at <= now() - interval '25 hours'
        and not exists (select 1 from nestly.stories s where s.media_id = media_assets.id and s.expires_at > now()))
      or (status = 'rejected' and decided_at <= now() - interval '30 days')
      or (kind = 'post' and post_id is null and created_at <= now() - interval '24 hours')
      or (kind = 'profile' and created_at <= now() - interval '24 hours'
        and not exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id)))));
comment on policy media_assets_delete_jobs on nestly.media_assets is 'Rule 6 exception (BR-077, M6): a held image 90 days after the suspicion; otherwise never a queued or held image, and a rejected one only after its file is gone: an expired Story''s image, a rejected image 30 days after the decision, a post image never attached within a day, a profile image that is no one''s photo after a day.';
drop policy media_training_candidates_insert_staff on nestly.media_training_candidates;
create policy media_training_candidates_insert_staff on nestly.media_training_candidates
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (
      select 1 from nestly.media_assets m
      where m.id = media_training_candidates.media_id and m.post_id is not null
        and exists (select 1 from nestly.reports r where r.post_id = m.post_id and r.status = 'handled' and r.resolution = 'action_taken')
        and not exists (select 1 from nestly.reports r where r.post_id = m.post_id and r.reason = 'child_safety')
        and not exists (select 1 from nestly.media_reviews v where v.media_id = m.id and (v.is_suspected or v.queue_reason is not null))
        and (m.status = 'rejected'
          or (m.status in ('passed', 'approved') and exists (select 1 from nestly.posts p where p.id = m.post_id and p.status = 'removed')))));
comment on policy media_training_candidates_insert_staff on nestly.media_training_candidates is 'CONTENT_MODERATE with REPORTS_VIEW, in the trigger: an image removed after a handled post report (action taken), never with a child-safety report on the post, never a queued-path or suspected image.';
drop policy conversations_insert_party on nestly.conversations;
create policy conversations_insert_party on nestly.conversations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select auth.uid()) in (user_a, user_b)
    and a_status = 'active' and b_status = 'active'
    and (case when user_a = (select auth.uid()) then user_b else user_a end) <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and ((context = 'friends' and exists (
           select 1 from nestly.friendships f where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id) = conversations.user_a and greatest(f.requester_id, f.addressee_id) = conversations.user_b))
      or (context = 'request' and exists (
           select 1 from nestly.chat_requests r where r.id = conversations.chat_request_id and r.status = 'accepted'
            and least(r.requester_id, r.target_id) = conversations.user_a and greatest(r.requester_id, r.target_id) = conversations.user_b))
      or (context = 'professional' and (select nestly.caller_account_type()) = 'regular' and exists (
           select 1 from nestly.professional_profiles pp
            where pp.user_id =(case when conversations.user_a = (select auth.uid()) then conversations.user_b else conversations.user_a end)))
      or (context = 'outreach' and exists (
           select 1 from nestly.outreach_requests o where o.id = conversations.outreach_request_id and o.status = 'accepted'
            and o.professional_id <> (select auth.uid())
            and least(o.professional_id, (select auth.uid())) = conversations.user_a
            and greatest(o.professional_id, (select auth.uid())) = conversations.user_b))));
comment on policy conversations_insert_party on nestly.conversations is
  'A party opens a conversation: Friends (FR-CHAT-002), a pair''s accepted chat request (I8), a Regular with an active Professional (FR-SERV-004, AC-010), or the author of an accepted Offer Help with its Professional (FR-SERV-006, AC-013). Never across a user block.';
drop policy reports_update_staff on nestly.reports;
create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and (case when target_kind in ('user', 'message')
           then ((select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
                 or (select nestly.has_permission('USER_BAN')))
           else (select nestly.has_permission('CONTENT_MODERATE')) end))
  with check (status = 'handled');
comment on policy reports_update_staff on nestly.reports is 'REPORTS_VIEW closes an open report as handled; a post or comment report needs CONTENT_MODERATE, a user or message report a user key (USER_WARN, USER_SUSPEND or USER_BAN).';

-- the training-candidate triggers back to post images only.
drop trigger reports_training_candidate on nestly.reports;
create trigger reports_training_candidate
  after update of status on nestly.reports
  for each row when (new.status = 'handled' and old.status = 'open' and new.resolution = 'action_taken' and new.post_id is not null)
  execute function nestly.media_training_candidate();
drop trigger media_assets_training_candidate on nestly.media_assets;
create trigger media_assets_training_candidate
  after update of status on nestly.media_assets
  for each row when (new.status = 'rejected' and old.status = 'passed' and new.post_id is not null)
  execute function nestly.media_training_candidate();
comment on trigger media_assets_training_candidate on nestly.media_assets is 'An image rejected from passed after a handled report becomes a training candidate (unless suspected or after a child-safety report).';

-- functions back to their earlier bodies.
create or replace function nestly.media_training_candidate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_post uuid;
  v_owner uuid;
begin
  if tg_table_name = 'posts' then v_post := new.id; else v_post := new.post_id; end if;
  -- the uploader (a child-safety report on the uploader excludes the image too): the image row's own owner when it fired the trigger, else the
  -- post's named author (an anonymous post's author is not readable here; its post reports still count)
  if tg_table_name = 'media_assets' then v_owner := new.owner_id; else v_owner := (select p.author_id from nestly.posts p where p.id = v_post); end if;
  if current_user <> 'authenticated' or v_post is null
     or not (select nestly.has_permission('REPORTS_VIEW')) or not (select nestly.has_permission('CONTENT_MODERATE')) then
    return null;
  end if;
  insert into nestly.media_training_candidates (media_id)
  select m.id
    from nestly.media_assets m
   where m.post_id = v_post
     and exists (select 1 from nestly.reports r where r.post_id = v_post and r.status = 'handled' and r.resolution = 'action_taken')
     and not exists (select 1 from nestly.reports r where r.post_id = v_post and r.reason = 'child_safety')
     and (v_owner is null or not exists (select 1 from nestly.reports r where r.reported_user_id = v_owner and r.reason = 'child_safety'))
     and not exists (select 1 from nestly.media_reviews v where v.media_id = m.id and (v.is_suspected or v.queue_reason is not null))
     and (tg_table_name <> 'media_assets' or m.id = new.id)
     and (m.status = 'rejected' or (m.status in ('passed', 'approved') and exists (select 1 from nestly.posts p where p.id = v_post and p.status = 'removed')))
  on conflict do nothing;
  return null;
end
$$;
comment on function nestly.media_training_candidate() is 'SECURITY INVOKER, in the moderator''s transaction. After a post report is handled with action taken, a reported post is removed, or an image is rejected from passed after such a report: the post''s images that passed and are now removed become training candidates, unless a report on the post is a child-safety report or the image is suspected.';
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
    if new.post_id is distinct from old.post_id or new.position is distinct from old.position or new.decided_at is distinct from old.decided_at then
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
    if new.post_id is distinct from old.post_id or new.position is distinct from old.position then
      raise exception 'media: a decision changes nothing else' using errcode = '42501';
    end if;
    select coalesce(bool_or(r.is_suspected), false) into v_suspected from nestly.media_reviews r where r.media_id = new.id;
    if old.status = 'queued' and new.status in ('approved', 'rejected') then
      if v_suspected and new.status <> 'rejected' then
        raise exception 'media: a suspected image is rejected' using errcode = '23514';
      end if;
    elsif old.status in ('passed', 'approved') and new.status = 'rejected' then
      -- after a report on its post or its uploader that is open (the moderator acts, then closes it) or was handled with action taken; a
      -- dismissed report is no ground. Or as a suspicion. The uploader sees the same rejection either way.
      if not (select nestly.has_permission('REPORTS_VIEW')) or not (v_suspected
          or exists (select 1 from nestly.reports r where (r.status = 'open' or r.resolution = 'action_taken')
                       and ((old.post_id is not null and r.post_id = old.post_id) or r.reported_user_id = old.owner_id))) then
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
  -- the uploader attaches an unattached post image to a post of their own, once (FR-FEED-002; VAL-041: at most 4, by the unique position)
  if old.post_id is not null or new.post_id is null or old.kind <> 'post' or old.status = 'rejected' then
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
comment on function nestly.media_assets_update_guard() is 'SECURITY INVOKER. Who may change which column of media_assets: the job moves a pending image to passed or queued (a queued one has its reason first) and records a rejected image''s removed file; staff with CONTENT_MODERATE decide a queued image, or reject a checked one with REPORTS_VIEW after a report or as a suspicion (who, when and the hold set here); the uploader attaches an unattached post image to a post of their own.';
create or replace function nestly.reports_insert_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target record;
begin
  if new.post_id is not null then
    -- a readable post that is not the reporter's own; absent and unreadable look the same (no oracle)
    select p.author_id into target from nestly.posts p where p.id = new.post_id;
    if not found
       or target.author_id = uid
       or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = uid) then
      raise exception 'reports: the post cannot be reported' using errcode = '42501';
    end if;
  elsif new.comment_id is not null then
    select c.author_id, c.post_id into target from nestly.comments c where c.id = new.comment_id;
    if not found
       or target.author_id = uid
       or (target.author_id is null
           and exists (select 1 from nestly.post_authors pa where pa.post_id = target.post_id and pa.author_id = uid)) then
      raise exception 'reports: the comment cannot be reported' using errcode = '42501';
    end if;
  elsif new.message_id is not null then
    -- the reporter's own read of the message (a party only); its text is not copied (reports_insert_snapshot copies posts and comments only)
    select m.sender_id into target from nestly.messages m where m.id = new.message_id;
    if not found or target.sender_id = uid then
      raise exception 'reports: the message cannot be reported' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert: a reported post, comment or chat message must be readable to the reporter and not their own (42501); for a post or comment named or through post_authors.';
create or replace function nestly.reports_insert_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.post_id is not null then
    select p.body into new.target_text from nestly.posts p where p.id = new.post_id;
  elsif new.comment_id is not null then
    select c.body into new.target_text from nestly.comments c where c.id = new.comment_id;
  end if;
  return new;
end
$$;
comment on function nestly.reports_insert_snapshot() is 'SECURITY INVOKER. Before insert on reports: copies the reported post or comment text, read under the reporter''s RLS.';
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
    -- NFR-PRIV-002, BR-040 (I10): a staff member opened reported Private Group content (only that post or comment; never the Group).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_content_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('targetKind', case when v_new ->> 'post_id' is not null then 'post' else 'comment' end);
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one, a System Announcement created, edited, published or removed, or a staff view of reported Private Group content: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

-- the new tables (their foreign keys first; the listing policy names reports.listing_id).
alter table nestly.reports drop constraint reports_listing_id_fkey;
alter table nestly.conversations drop constraint conversations_listing_id_fkey;
alter table nestly.media_assets drop constraint media_assets_listing_id_fkey;
alter table nestly.media_assets drop constraint media_assets_sponsored_product_id_fkey;
drop table nestly.marketplace_listings;
drop table nestly.sponsored_products;
drop function nestly.marketplace_listings_update_guard();
drop function nestly.sponsored_products_update_guard();

-- columns and constraints.
drop index nestly.reports_listing_id_idx;
alter table nestly.reports drop constraint reports_reporter_listing_key;
alter table nestly.reports drop constraint reports_target_kind_check;
alter table nestly.reports drop constraint reports_one_target_check;
alter table nestly.reports drop constraint reports_open_target_check;
alter table nestly.reports drop column listing_id;
alter table nestly.reports add constraint reports_target_kind_check check (target_kind in ('post', 'comment', 'user', 'message'));
alter table nestly.reports add constraint reports_one_target_check check (num_nonnulls(post_id, comment_id, reported_user_id, message_id) <= 1);
alter table nestly.reports add constraint reports_open_target_check check (
  status <> 'open'
  or case target_kind
       when 'post' then post_id is not null
       when 'comment' then comment_id is not null
       when 'message' then message_id is not null
       else reported_user_id is not null
     end);
comment on column nestly.reports.target_kind is 'post, comment, user or message; survives the target''s SET NULL.';

drop index nestly.conversations_listing_id_idx;
alter table nestly.conversations drop constraint conversations_listing_id_check;
alter table nestly.conversations drop constraint conversations_context_check;
alter table nestly.conversations drop column listing_id;
alter table nestly.conversations add constraint conversations_context_check check (context in ('friends', 'request', 'professional', 'outreach'));
comment on column nestly.conversations.context is 'friends, request (I8), professional (a Regular opened it with a Professional, FR-SERV-004) or outreach (an accepted Offer Help, FR-SERV-006).';

alter table nestly.media_assets drop constraint media_assets_listing_id_position_key;
alter table nestly.media_assets drop constraint media_assets_sponsored_product_id_position_key;
alter table nestly.media_assets drop constraint media_assets_attached_position_check;
alter table nestly.media_assets drop constraint media_assets_listing_kind_check;
alter table nestly.media_assets drop constraint media_assets_sponsored_kind_check;
alter table nestly.media_assets drop constraint media_assets_position_check;
alter table nestly.media_assets drop constraint media_assets_kind_check;
alter table nestly.media_assets drop column listing_id;
alter table nestly.media_assets drop column sponsored_product_id;
alter table nestly.media_assets add constraint media_assets_kind_check check (kind in ('post', 'profile', 'story'));
alter table nestly.media_assets add constraint media_assets_position_check check (position is null or position between 0 and 3);
comment on column nestly.media_assets.kind is 'post, profile or story.';
comment on column nestly.media_assets.position is 'Order in the post, 0 to 3: at most 4 images per post (VAL-041), by the unique (post_id, position).';

delete from supabase_migrations.schema_migrations where version = '20261022600000';

commit;
