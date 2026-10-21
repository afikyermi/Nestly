-- =====================================================================================================================
-- Down script for supabase/migrations/20261022800000_staff_work.sql (I14 completion: the invitation's 48 hours, CHILD_DATA_VIEW and
-- child_tracker_trends(), the reveal on Private Group content, the report's context, escalations and openings, staff file no report).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Order:    revert the code that uses these objects first, then run this.
-- Safe:     only while no Moderator holds CHILD_DATA_VIEW and no escalation or opening exists (refuses otherwise). The invitations' shortened
--           expiry and reports.thread_post_id are not restored (the column is dropped); Audit entries already written stay (append-only).
-- Restores: has_permission() verbatim from 20261021300000_recovery_lock_ladder.sql, reveal_post_author() from 20261020300000_safety_admin_core.sql,
--           private_group_content_views_target(), posts_group_hide and comments_group_hide from 20261022300000_groups.sql, audit_trigger() from
--           20261022700000_i11_followups.sql; drops what the migration added.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the staff work down script must run as app_owner (current_user is %)', current_user;
  end if;
  alter table nestly.moderator_permissions no force row level security;
  alter table nestly.report_escalations no force row level security;
  alter table nestly.report_openings no force row level security;
  alter table nestly.group_staff_views no force row level security;
  if exists (select 1 from nestly.moderator_permissions where permission_key = 'CHILD_DATA_VIEW')
     or exists (select 1 from nestly.report_escalations) or exists (select 1 from nestly.report_openings)
     or exists (select 1 from nestly.group_staff_views) then
    raise exception 'a CHILD_DATA_VIEW grant, an escalation, an opening or a staff Group view exists: the down script refuses';
  end if;
  alter table nestly.moderator_permissions force row level security;
  alter table nestly.report_escalations force row level security;
  alter table nestly.report_openings force row level security;
end
$$;

drop table nestly.report_openings;
drop table nestly.report_escalations;

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
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

drop policy reports_insert_community on nestly.reports;
alter policy posts_group_hide on nestly.posts
  using (group_id is null
    or exists (select 1 from nestly.groups g
                where g.id = posts.group_id and g.status = 'active'
                  and (g.privacy = 'public'
                    or exists (select 1 from nestly.group_access a where a.group_id = g.id and a.user_id = (select auth.uid()))))
    or exists (select 1 from nestly.private_group_content_views v
                where v.viewer_id = (select auth.uid()) and v.post_id = posts.id
                  and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned()));

alter policy comments_group_hide on nestly.comments
  using (group_id is null
    or exists (select 1 from nestly.groups g
                where g.id = comments.group_id and g.status = 'active'
                  and (g.privacy = 'public'
                    or exists (select 1 from nestly.group_access a where a.group_id = g.id and a.user_id = (select auth.uid()))))
    or exists (select 1 from nestly.private_group_content_views v
                where v.viewer_id = (select auth.uid()) and v.comment_id = comments.id
                  and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned()));

create or replace function nestly.private_group_content_views_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  select rp.post_id, rp.comment_id into r from nestly.reports rp where rp.id = new.report_id and rp.is_private_group;
  if not found or num_nonnulls(r.post_id, r.comment_id) <> 1 then
    raise exception 'private_group_content_views: not a report on Private Group content' using errcode = '42501';
  end if;
  new.post_id := r.post_id;
  new.comment_id := r.comment_id;
  new.view_xact := pg_catalog.pg_current_xact_id();
  return new;
end
$$;
drop table nestly.group_staff_views;
drop policy comments_select_staff_review on nestly.comments;
drop policy posts_select_staff_review on nestly.posts;
alter table nestly.private_group_content_views drop column thread_post_id;
drop trigger reports_thread_post on nestly.reports;
drop function nestly.reports_thread_post();
alter table nestly.reports drop column thread_post_id;

create or replace function nestly.reveal_post_author(p_post uuid)
returns table (user_id uuid, full_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_name text;
  v_report uuid;
  v_role text := nestly.caller_staff_role();
begin
  if v_role is null or not (nestly.has_permission('REPORTS_VIEW') and nestly.has_permission('CONTENT_MODERATE')) then
    raise exception 'reveal: not allowed' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('nestly.reveal_post', p_post::text, true);
  select r.id into v_report from nestly.reports r where r.post_id = p_post and r.status = 'open' order by r.created_at, r.id limit 1;
  if v_report is null then
    perform pg_catalog.set_config('nestly.reveal_post', '', true);
    raise exception 'reveal: no open report on this post' using errcode = '42501';
  end if;
  select pa.author_id into v_author from nestly.post_authors pa where pa.post_id = p_post;
  if v_author is null then
    perform pg_catalog.set_config('nestly.reveal_post', '', true);
    raise exception 'reveal: no anonymous author' using errcode = 'NS012';
  end if;
  perform pg_catalog.set_config('nestly.reveal_user', v_author::text, true);
  select rn.full_name into v_name from nestly.regular_names rn where rn.user_id = v_author;
  perform pg_catalog.set_config('nestly.reveal_post', '', true);
  perform pg_catalog.set_config('nestly.reveal_user', '', true);
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, after_state)
  values (v_role, 'CONTENT_MODERATE', 'author_revealed', 'post', p_post, pg_catalog.jsonb_build_object('reportId', v_report));
  return query select v_author, v_name;
end
$$;

drop function nestly.child_tracker_trends(text, text, text, integer);
drop index nestly.tracker_events_kind_occurred_at_idx;
drop policy users_select_child_data on nestly.users;
drop policy children_select_child_data on nestly.children;
drop policy tracker_events_select_child_data on nestly.tracker_events;
drop table nestly.trend_scopes;
drop policy groups_select_reveal on nestly.groups;
drop policy posts_select_reveal on nestly.posts;

create or replace function nestly.has_permission(p_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select case sr.account_type
      when 'admin' then p_key in (
        'SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW', 'USER_WARN',
        'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS',
        'PRIVATE_GROUP_MODERATE', 'MODERATOR_MANAGE', 'SECURITY_SETTINGS_MANAGE', 'BILLING_FINANCE_MANAGE', 'SYSTEM_CRITICAL_SETTINGS',
        'USER_DATA_EXPORT_DELETE', 'SENSITIVE_DATA_FULL_ACCESS', 'LEGAL_POLICY_MANAGE', 'ALGORITHM_AI_CONFIG',
        'SPONSORED_PRODUCT_MANAGE')
      else exists (
        select 1 from nestly.moderator_permissions mp where mp.user_id = sr.user_id and mp.permission_key = p_key)
        and (case p_key
          when 'SUPPORT_HANDLE' then 'SUPPORT_VIEW'
          when 'USER_WARN' then 'USER_VIEW'
          when 'USER_SUSPEND' then 'USER_VIEW'
          when 'USER_BAN' then 'USER_VIEW'
          when 'PRIVATE_GROUP_MODERATE' then 'REPORTS_VIEW'
          else p_key end) in (select mp2.permission_key from nestly.moderator_permissions mp2 where mp2.user_id = sr.user_id)
    end
    from nestly.staff_roles sr
    where sr.user_id = auth.uid() and sr.account_status = 'active' and (select nestly.session_guard()) in ('ok', 'must_set')
  ), false)
$$;

alter table nestly.moderator_permissions drop constraint moderator_permissions_key_check;
alter table nestly.moderator_permissions add constraint moderator_permissions_key_check check (permission_key in (
  'SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW', 'USER_WARN',
  'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS',
  'PRIVATE_GROUP_MODERATE'));

alter table nestly.moderator_invitations alter column expires_at set default (now() + interval '7 days');

comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one, a System Announcement created, edited, published or removed, a staff view of reported Private Group content, a Marketplace listing hidden or restored, a Sponsored Product created, edited, published, paused or removed, or a reported review or article hidden, removed or restored: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

comment on function nestly.reveal_post_author(uuid) is 'SECURITY DEFINER (approved exception, rule 19), owner app_owner, pinned search_path. Returns the real author of an anonymous post to a caller with REPORTS_VIEW and CONTENT_MODERATE and a valid session, only while an OPEN report on that post exists, and appends author_revealed (with the report id) in the same call.';

comment on function nestly.private_group_content_views_target() is 'BEFORE INSERT, SECURITY INVOKER. A view names the reported post or comment of a report on Private Group content (read under reports_select_staff); view_xact is this transaction.';

comment on policy posts_group_hide on nestly.posts is 'RESTRICTIVE (I10): a group post is readable while its Group is active and Public or the caller is a member (AC-036/037, NFR-PRIV-002, ERR-017); to staff only inside the transaction of an audited view of a report on it (ERR-024); never on the analytics screen (rows, not columns).';

comment on policy comments_group_hide on nestly.comments is 'RESTRICTIVE (I10): a group comment is readable as its post''s Group allows; to staff only inside an audited view of a report on it.';

comment on function nestly.has_permission(text) is
  'SECURITY INVOKER, caller only (rule 16): true for an active Admin on any known key; for a Moderator only when the key is assigned and its companion key is too (SUPPORT_HANDLE needs SUPPORT_VIEW; USER_WARN, USER_SUSPEND and USER_BAN need USER_VIEW; PRIVATE_GROUP_MODERATE needs REPORTS_VIEW). Admin-only keys are never true for a Moderator. Deny by default.';

comment on column nestly.moderator_invitations.expires_at is 'Seven days after issue; an expired invitation cannot be redeemed.';


delete from supabase_migrations.schema_migrations where version = '20261022800000';

commit;
