-- =====================================================================================================================
-- Down script for supabase/migrations/20261022100000_chat_support.sql (I8, chat and Support).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while none of the eight new tables holds a row and no report names a message (refuses otherwise: messages,
--           requests and reports would be lost).
-- Restores: audit_trigger() as 20261021500000 left it (run before the down script of any later migration that replaces it, reverse
--           order); reports_insert_check(), user_blocks_end_relations() and reports_update_staff as before; the reports constraints and
--           column; the regular_names policies, the triggers, functions and tables go; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the chat and Support down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): without FORCE the owner reads every row.
  -- Lifted inside this transaction only; the new tables are dropped below, reports gets FORCE back right after the check.
  alter table nestly.chat_requests no force row level security;
  alter table nestly.conversations no force row level security;
  alter table nestly.messages no force row level security;
  alter table nestly.chat_blocks no force row level security;
  alter table nestly.chat_reads no force row level security;
  alter table nestly.support_requests no force row level security;
  alter table nestly.support_messages no force row level security;
  alter table nestly.reported_message_views no force row level security;
  alter table nestly.reports no force row level security;
  if exists (select 1 from nestly.chat_requests) or exists (select 1 from nestly.conversations) or exists (select 1 from nestly.messages)
     or exists (select 1 from nestly.chat_blocks) or exists (select 1 from nestly.chat_reads) or exists (select 1 from nestly.support_requests)
     or exists (select 1 from nestly.support_messages) or exists (select 1 from nestly.reported_message_views)
     or exists (select 1 from nestly.reports where target_kind = 'message') then
    raise exception 'a chat or Support table, or a message report, holds a row: the down script refuses';
  end if;
  alter table nestly.reports force row level security;
end
$$;

drop trigger support_requests_audit on nestly.support_requests;
drop trigger support_messages_audit on nestly.support_messages;
drop trigger reported_message_views_audit on nestly.reported_message_views;

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
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

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
  end if;
  return new;
end
$$;

comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert: a reported post or comment must be readable to the reporter and not their own (42501), named or through post_authors.';

create or replace function nestly.user_blocks_end_relations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update nestly.friendships f set status = 'removed'
    where f.status = 'accepted'
      and ((f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
        or (f.addressee_id = new.blocker_id and f.requester_id = new.blocked_id));
  update nestly.friendships f set status = 'declined'
    where f.status = 'pending' and f.cancelled_at is null
      and f.addressee_id = new.blocker_id and f.requester_id = new.blocked_id;
  update nestly.friendships f set cancelled_at = pg_catalog.now()
    where f.status = 'pending' and f.cancelled_at is null
      and f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id;
  return new;
end
$$;

comment on function nestly.user_blocks_end_relations() is 'Trigger on user_blocks insert: ends the pair''s Friendship and open Friend Requests with the blocker''s own rights. SECURITY INVOKER.';

drop policy reports_update_staff on nestly.reports;
create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and (case target_kind
           when 'user' then ((select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
                             or (select nestly.has_permission('USER_BAN')))
           else (select nestly.has_permission('CONTENT_MODERATE')) end))
  with check (status = 'handled');
comment on policy reports_update_staff on nestly.reports is 'An open report is closed by staff with REPORTS_VIEW and at least one moderation key (AC-022).';

drop policy regular_names_select_conversation on nestly.regular_names;
drop policy regular_names_select_request_sent on nestly.regular_names;
drop policy regular_names_select_request_received on nestly.regular_names;
drop policy regular_names_select_support on nestly.regular_names;

-- the write policies that name another new table go first; the tables then drop in dependency order (the read policies of messages
-- and support_messages still name conversations and support_requests, so those two tables drop after them)
drop policy chat_requests_insert_requester on nestly.chat_requests;
drop policy chat_requests_update_target on nestly.chat_requests;
drop policy conversations_insert_party on nestly.conversations;
drop policy messages_insert_party on nestly.messages;
drop policy messages_select_staff on nestly.messages;
drop policy chat_reads_insert_own on nestly.chat_reads;
drop policy reported_message_views_insert_staff on nestly.reported_message_views;

revoke insert (message_id) on table nestly.reports from authenticated;
drop index nestly.reports_message_id_idx;
alter table nestly.reports drop constraint reports_open_target_check;
alter table nestly.reports add constraint reports_open_target_check check (
  status <> 'open'
  or case target_kind
       when 'post' then post_id is not null
       when 'comment' then comment_id is not null
       else reported_user_id is not null
     end);
alter table nestly.reports drop constraint reports_one_target_check;
alter table nestly.reports add constraint reports_one_target_check check (num_nonnulls(post_id, comment_id, reported_user_id) <= 1);
alter table nestly.reports drop constraint reports_target_kind_check;
alter table nestly.reports add constraint reports_target_kind_check check (target_kind in ('post', 'comment', 'user'));
alter table nestly.reports drop constraint reports_reporter_message_key;
alter table nestly.reports drop constraint reports_message_id_fkey;
alter table nestly.reports drop column message_id;
comment on column nestly.reports.target_kind is 'post, comment or user; survives the target''s SET NULL.';

drop table nestly.reported_message_views;
drop table nestly.chat_reads;
drop table nestly.support_messages;
drop table nestly.support_requests;
drop table nestly.messages;
drop table nestly.conversations;
drop table nestly.chat_blocks;
drop table nestly.chat_requests;

drop function nestly.chat_requests_transition();
drop function nestly.chat_requests_insert_limit();
drop function nestly.chat_blocks_lift_guard();
drop function nestly.chat_blocks_insert_limit();
drop function nestly.chat_reads_stamp();
drop function nestly.support_requests_transition();
drop function nestly.support_requests_insert_limit();
drop function nestly.support_messages_author();

delete from supabase_migrations.schema_migrations where version = '20261022100000';

commit;
