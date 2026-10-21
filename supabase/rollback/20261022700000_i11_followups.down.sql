-- =====================================================================================================================
-- Down script for supabase/migrations/20261022700000_i11_followups.sql (I11 follow-ups: Support metrics, review and article reports,
-- the Professional's notifications, the qualification declaration).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Order:    revert the code that reads these columns first, then run this.
-- Safe:     only while no report names a review or an article, no review or article is moderated, no Professional notification exists
--           and no consent carries the qualification declaration (refuses otherwise). Audit entries
--           already written stay (the log is append-only).
-- Restores: audit_trigger(), reports_insert_check() and reports_insert_snapshot() verbatim from 20261022600000_marketplace.sql, the two reader policies from 20261022400000_professionals.sql,
--           the reports constraints from 20261022600000_marketplace.sql; drops what the migration added.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the i11 follow-ups down script must run as app_owner (current_user is %)', current_user;
  end if;
  alter table nestly.reports no force row level security;
  alter table nestly.professional_reviews no force row level security;
  alter table nestly.professional_articles no force row level security;
  alter table nestly.notifications no force row level security;
  alter table nestly.legal_consents no force row level security;
  if exists (select 1 from nestly.reports where target_kind in ('review', 'article'))
     or exists (select 1 from nestly.professional_reviews where moderation <> 'active')
     or exists (select 1 from nestly.professional_articles where moderation <> 'active')
     or exists (select 1 from nestly.notifications where type in ('offer_accepted', 'offer_declined', 'review_received', 'followers_weekly'))
     or exists (select 1 from nestly.legal_consents where has_declared_qualification) then
    raise exception 'a review or article report, a moderated review or article, a Professional notification or a qualification declaration exists: the down script refuses';
  end if;
  alter table nestly.notifications force row level security;
  alter table nestly.legal_consents force row level security;
  alter table nestly.reports force row level security;
  alter table nestly.professional_reviews force row level security;
  alter table nestly.professional_articles force row level security;
end
$$;

-- the qualification declaration and the Professional's notifications (texts of 20261014200000 and 20261020400000)
revoke insert (has_declared_qualification) on table nestly.legal_consents from authenticated;
alter table nestly.legal_consents drop column has_declared_qualification;
drop trigger notify_professional_outreach on nestly.outreach_requests;
drop trigger notify_professional_review on nestly.professional_reviews;
drop trigger notify_professional_follow on nestly.professional_follows;
drop function nestly.notify_professional();
alter policy notifications_select_recipient on nestly.notifications
  using ((select nestly.is_active_account()) and recipient_id = (select auth.uid()));
alter policy notifications_update_recipient on nestly.notifications
  using ((select nestly.is_active_account()) and recipient_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and recipient_id = (select auth.uid()));
comment on policy notifications_select_recipient on nestly.notifications is 'The recipient reads their own notifications while active.';

drop policy support_requests_select_analytics on nestly.support_requests;
drop policy support_messages_select_analytics on nestly.support_messages;

drop policy professional_reviews_select_staff on nestly.professional_reviews;
drop policy professional_articles_select_staff on nestly.professional_articles;
drop policy professional_reviews_update_staff on nestly.professional_reviews;
drop policy professional_articles_update_staff on nestly.professional_articles;
alter policy professional_reviews_select_viewer on nestly.professional_reviews
  using ((select nestly.is_active_account()) and (reviewer_id = (select auth.uid()) or reviewer_status = 'active'));
alter policy professional_articles_select_viewer on nestly.professional_articles
  using ((select nestly.is_active_account()) and (author_id = (select auth.uid())
    or (status = 'published' and author_status = 'active'
        and author_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

drop trigger professional_reviews_moderation_audit on nestly.professional_reviews;
drop trigger professional_articles_moderation_audit on nestly.professional_articles;
drop trigger professional_reviews_moderation_guard on nestly.professional_reviews;
drop trigger professional_articles_moderation_guard on nestly.professional_articles;
drop trigger professional_articles_reject_staff_edit on nestly.professional_articles;
drop function nestly.professional_content_moderation_guard();
drop trigger reports_target_gone on nestly.reports;
drop function nestly.reports_target_gone();

drop index nestly.reports_review_id_idx;
drop index nestly.reports_article_id_idx;
alter table nestly.reports drop constraint reports_open_target_check;
alter table nestly.reports add constraint reports_open_target_check check (
  status <> 'open'
  or case target_kind
       when 'post' then post_id is not null
       when 'comment' then comment_id is not null
       when 'message' then message_id is not null
       when 'listing' then num_nonnulls(post_id, comment_id, reported_user_id, message_id) = 0
       else reported_user_id is not null
     end);
alter table nestly.reports drop constraint reports_one_target_check;
alter table nestly.reports add constraint reports_one_target_check check (num_nonnulls(post_id, comment_id, reported_user_id, message_id, listing_id) <= 1);
alter table nestly.reports drop constraint reports_target_kind_check;
alter table nestly.reports add constraint reports_target_kind_check check (target_kind in ('post', 'comment', 'user', 'message', 'listing'));
alter table nestly.reports drop column review_id, drop column article_id;
alter table nestly.professional_reviews drop column moderation;
alter table nestly.professional_articles drop column moderation;

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
  elsif new.listing_id is not null then
    -- the reporter's own read of the listing (FR-MKT-001); absent, hidden, expired and unreadable look the same
    select l.owner_id into target from nestly.marketplace_listings l where l.id = new.listing_id;
    if not found or target.owner_id = uid then
      raise exception 'reports: the listing cannot be reported' using errcode = '42501';
    end if;
  elsif new.target_kind = 'listing' then
    raise exception 'reports: a listing report names its listing' using errcode = '23514';
  end if;
  return new;
end
$$;

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
  elsif new.listing_id is not null then
    select l.title into new.target_text from nestly.marketplace_listings l where l.id = new.listing_id;
  end if;
  return new;
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


comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert on reports: the reported post, comment, message or listing must be readable to the reporter (absent and unreadable look the same) and not their own; a listing report names its listing.';
comment on function nestly.reports_insert_snapshot() is 'SECURITY INVOKER. Before insert on reports: copies the reported post or comment text, or the listing''s title, read under the reporter''s RLS.';
comment on column nestly.reports.target_kind is 'post, comment, user, message or listing; survives the target''s SET NULL.';
comment on policy professional_reviews_select_viewer on nestly.professional_reviews is 'Every active account reads the reviews of an active reviewer (no block filter: it would reveal the hidden reviewer); the reviewer reads its own.';
comment on policy professional_articles_select_viewer on nestly.professional_articles is 'The owner reads all its articles; every active account reads a published article of an active author with no user block between them.';
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one, a System Announcement created, edited, published or removed, a staff view of reported Private Group content, a Marketplace listing hidden or restored, or a Sponsored Product created, edited, published, paused or removed: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

delete from supabase_migrations.schema_migrations where version = '20261022700000';

commit;
