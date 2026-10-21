-- =====================================================================================================================
-- I11 follow-ups — migration only: Support metrics for the analytics screen, and reporting a Professional's review or article.
--
-- SRS: FR-ADMIN-003 (Support metrics), FR-ADMIN-010, BR-058 · FR-MOD-001 (a review and an article are reportable), FR-SERV-011 and
--      FR-PRO-003 ("subject to reporting and enforcement"), FR-MOD-003 (the queue) · platform rules 8, 9, 10, 16, 18
--      (.claude/knowledge/data-model.md).
--
-- support_requests,        *_select_analytics: ANALYTICS_VIEW (the Admin always) reads the rows only in a transaction that named the
-- support_messages         analytics screen (nestly.analytics_view), the I14 pattern (WORKPLAN item 24); the server returns counts only,
--                          never a text, a topic's author or an id (FR-ADMIN-003 "Support metrics").
-- reports                  gain review_id and article_id (target_kind 'review' and 'article'). A report on a review or an article must name
--                          one the reporter can read; an article must not be the reporter's own. The reported text is copied as for a post
--                          (a review's text; an article's title and text). Handling needs CONTENT_MODERATE, as a post (reports_update_staff
--                          is unchanged: every kind but user and message falls to CONTENT_MODERATE). When a reported review or article is
--                          deleted (its owner deletes the article; a cascade removes a review), its open reports expire with it
--                          (reports_target_gone): the queue never shows a report on nothing.
-- professional_reviews,    gain moderation (active / hidden / removed), moved only by CONTENT_MODERATE on reported rows, with a reason, each
-- professional_articles    move audited (audit_trigger, approved exception rule 18, gains one branch). A moderated review or article leaves
--                          every reader's view; an article's owner still reads its own (its screen says it was taken down). Staff never
--                          edit the text. REPORTS_VIEW reads a reported review or article whatever its state.
--
-- notifications            the Professional's own notifications (OP-051 cancelled, Afik 21.10.2026, decisions-in-force.md §9.8): an Offer Help
--                          accepted or declined, a new review, and new followers as one weekly digest. A notification is readable (and can be
--                          marked read) from its created_at: the digest row is written at the week's first new follower with created_at at the
--                          week's end (Monday 00:00, Israel time), so it appears once, when the week closes; the screen counts that week's
--                          follows (rows the Professional already reads as a count, never who).
-- legal_consents           gain has_declared_qualification (Afik 21.10.2026, §9.8): a Professional's consent row carries the required
--                          declaration that it holds the training and licence its field needs (the registration request requires it; the
--                          column records it). The insert policy is unchanged, so the running registration keeps working until the code ships.
--
-- SECURITY DEFINER: audit_trigger() (approved exception, rule 18) is replaced with one new branch for the two tables and nothing else
-- changed; and one new trigger definer, notify_professional() (rule 17; approved by Afik 21.10.2026 in the pattern and conditions of the I7
-- notification functions, decisions-in-force.md §9.8 and §6): never across a user block (either direction), the recipient's category switch
-- honoured, never to oneself, the actor never named (a reviewer, a follower and the author of an anonymous post stay hidden). It declares
-- nestly.notify_scope = professional, which opens only the existing notifications and notification_preferences TO app_owner policies; no
-- new TO app_owner or TO app_jobs policy, no new table.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261022500000_i11_followups.down.sql (refuses once a review or article report, or a moderated review or article, exists).
-- =====================================================================================================================

-- 1. Support metrics (FR-ADMIN-003): the analytics screen counts Support requests and replies --------------------------------------
create policy support_requests_select_analytics on nestly.support_requests
  for select to authenticated
  using (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy support_messages_select_analytics on nestly.support_messages
  for select to authenticated
  using (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.is_active_account()) and (select nestly.analytics_reader()));

-- 2. reviews and articles: moderation (constant default: catalog only) ----------------------------------------------------------
alter table nestly.professional_reviews
  add column moderation text not null default 'active'
    constraint professional_reviews_moderation_check check (moderation in ('active', 'hidden', 'removed'));
alter table nestly.professional_articles
  add column moderation text not null default 'active'
    constraint professional_articles_moderation_check check (moderation in ('active', 'hidden', 'removed'));

-- 3. reports: a review or an article can be reported -----------------------------------------------------------------------------
alter table nestly.reports add column review_id uuid, add column article_id uuid;
alter table nestly.reports
  add constraint reports_review_id_fkey foreign key (review_id) references nestly.professional_reviews (id) on delete set null,
  add constraint reports_article_id_fkey foreign key (article_id) references nestly.professional_articles (id) on delete set null,
  add constraint reports_reporter_review_key unique (reporter_id, review_id),
  add constraint reports_reporter_article_key unique (reporter_id, article_id);
alter table nestly.reports drop constraint reports_target_kind_check;
alter table nestly.reports add constraint reports_target_kind_check
  check (target_kind in ('post', 'comment', 'user', 'message', 'review', 'article'));
alter table nestly.reports drop constraint reports_one_target_check;
alter table nestly.reports add constraint reports_one_target_check
  check (num_nonnulls(post_id, comment_id, reported_user_id, message_id, review_id, article_id) <= 1);
alter table nestly.reports drop constraint reports_open_target_check;
alter table nestly.reports add constraint reports_open_target_check check (
  status <> 'open'
  or case target_kind
       when 'post' then post_id is not null
       when 'comment' then comment_id is not null
       when 'message' then message_id is not null
       when 'review' then review_id is not null
       when 'article' then article_id is not null
       else reported_user_id is not null
     end);
create index reports_review_id_idx on nestly.reports (review_id) where review_id is not null;
create index reports_article_id_idx on nestly.reports (article_id) where article_id is not null;

-- 4. Functions and triggers (SECURITY INVOKER) -----------------------------------------------------------------------------------

-- A reported review or article must be readable to the reporter; an article must not be its own. Everything else as before.
-- (A review's writer is never granted for SELECT, so a review cannot be refused as the reporter's own: reporting one's own review is harmless.)
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
  elsif new.review_id is not null then
    -- I11 follow-ups: a review the reporter can read (an active, unmoderated review)
    if not exists (select 1 from nestly.professional_reviews r where r.id = new.review_id) then
      raise exception 'reports: the review cannot be reported' using errcode = '42501';
    end if;
  elsif new.article_id is not null then
    -- I11 follow-ups: an article the reporter can read that is not its own
    select a.author_id into target from nestly.professional_articles a where a.id = new.article_id;
    if not found or target.author_id = uid then
      raise exception 'reports: the article cannot be reported' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

-- The copy of the reported text, read under the reporter's RLS: a post, a comment, a review, or an article's title and text.
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
  elsif new.review_id is not null then
    select r.body into new.target_text from nestly.professional_reviews r where r.id = new.review_id;
  elsif new.article_id is not null then
    select a.title || E'\n\n' || a.body into new.target_text from nestly.professional_articles a where a.id = new.article_id;
  end if;
  return new;
end
$$;

-- A reported review or article that is deleted takes its open reports with it: they expire (the FK's SET NULL runs this, as the owner).
create function nestly.reports_target_gone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'open'
     and ((new.target_kind = 'review' and old.review_id is not null and new.review_id is null)
       or (new.target_kind = 'article' and old.article_id is not null and new.article_id is null)) then
    new.status := 'expired';
    new.closed_at := pg_catalog.now();
  end if;
  return new;
end
$$;

revoke execute on function nestly.reports_target_gone() from public;

create trigger reports_target_gone
  before update of review_id, article_id on nestly.reports
  for each row execute function nestly.reports_target_gone();

-- Moderation of a review or an article: only staff with CONTENT_MODERATE move it (the policies say which rows), with a stated reason
-- (nestly.audit_reason, rule 18) when it leaves view. An article's owner holds UPDATE on its row and on nothing that moves this.
create function nestly.professional_content_moderation_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.moderation is not distinct from old.moderation or current_user <> 'authenticated' then
    return new;
  end if;
  if (select nestly.caller_staff_role()) is null or not coalesce((select nestly.has_permission('CONTENT_MODERATE')), false) then
    raise exception 'content: moderation needs CONTENT_MODERATE' using errcode = '42501';
  end if;
  if new.moderation <> 'active' and coalesce(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '') = '' then
    raise exception 'content: a moderation action needs a reason' using errcode = 'NS011';
  end if;
  return new;
end
$$;

revoke execute on function nestly.professional_content_moderation_guard() from public;

create trigger professional_reviews_moderation_guard
  before update of moderation on nestly.professional_reviews
  for each row execute function nestly.professional_content_moderation_guard();
create trigger professional_articles_moderation_guard
  before update of moderation on nestly.professional_articles
  for each row execute function nestly.professional_content_moderation_guard();

-- Staff never edit what an author wrote (I4): an article's text, field and status are its owner's.
create trigger professional_articles_reject_staff_edit
  before update of title, body, field, status on nestly.professional_articles
  for each row execute function nestly.reject_staff_edit();

-- 5. Audit (rule 18): the approved audit_trigger() gains the review and article branch; the rest is the text of 20261022300000.
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
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

create trigger professional_reviews_moderation_audit
  after update of moderation on nestly.professional_reviews
  for each row
  when (old.moderation is distinct from new.moderation)
  execute function nestly.audit_trigger();
create trigger professional_articles_moderation_audit
  after update of moderation on nestly.professional_articles
  for each row
  when (old.moderation is distinct from new.moderation)
  execute function nestly.audit_trigger();

-- 6. Grants and policies --------------------------------------------------------------------------------------------------------
grant insert (review_id, article_id) on table nestly.reports to authenticated;
grant select (moderation), update (moderation) on table nestly.professional_reviews to authenticated;
grant select (moderation), update (moderation) on table nestly.professional_articles to authenticated;

-- Readers: a moderated review or article leaves every reader's view; an article's owner still reads its own (the rest is the text of
-- 20261022400000).
alter policy professional_reviews_select_viewer on nestly.professional_reviews
  using ((select nestly.is_active_account()) and moderation = 'active' and (reviewer_id = (select auth.uid()) or reviewer_status = 'active'));
alter policy professional_articles_select_viewer on nestly.professional_articles
  using ((select nestly.is_active_account()) and (author_id = (select auth.uid())
    or (status = 'published' and moderation = 'active' and author_status = 'active'
        and author_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

-- Staff read a reported review or article (REPORTS_VIEW; the Admin always) in any state, as a reported post (I4).
create policy professional_reviews_select_staff on nestly.professional_reviews
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r where r.review_id = professional_reviews.id));
create policy professional_articles_select_staff on nestly.professional_articles
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r where r.article_id = professional_articles.id));

-- Moderation (CONTENT_MODERATE): active <-> hidden <-> removed, on reported rows only (the guard asks for the reason; the audit records it).
create policy professional_reviews_update_staff on nestly.professional_reviews
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.reports r where r.review_id = professional_reviews.id))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')));
create policy professional_articles_update_staff on nestly.professional_articles
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and exists (select 1 from nestly.reports r where r.article_id = professional_articles.id))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')));

-- 7. The Professional's notifications (OP-051 cancelled; Afik 21.10.2026, §9.8) -----------------------------------------------------
-- A notification is readable, and marked read, from its created_at (the weekly digest is written ahead with the week's end as its time).
-- The rest is the text of 20261020400000.
alter policy notifications_select_recipient on nestly.notifications
  using ((select nestly.is_active_account()) and recipient_id = (select auth.uid()) and created_at <= pg_catalog.now());
alter policy notifications_update_recipient on nestly.notifications
  using ((select nestly.is_active_account()) and recipient_id = (select auth.uid()) and created_at <= pg_catalog.now())
  with check ((select nestly.is_active_account()) and recipient_id = (select auth.uid()));

-- One definer for the Professional's three events (rule 17). The caller is the actor: the post's author answering an Offer Help, the
-- reviewer, or the new follower. None is named (actor NULL): a reviewer and a follower are never readable to the Professional, and the author
-- of an anonymous post is not named by a decline. A user block in force between the caller and the Professional (either direction; the caller
-- reads its own blocks through user_blocks_select_party) delivers nothing. The category switch is honoured (notify_deliver; the digest's own
-- insert checks it the same way).
create function nestly.notify_professional()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_pro uuid := new.professional_id;
  v_week_end timestamptz;
begin
  if v_me is null or v_pro is null or v_me = v_pro then
    return null;
  end if;
  if exists (
    select 1 from nestly.user_blocks b
    where b.lifted_at is null
      and ((b.blocker_id = v_me and b.blocked_id = v_pro) or (b.blocker_id = v_pro and b.blocked_id = v_me))) then
    return null;
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', 'professional', true);
  if tg_table_name = 'outreach_requests' then
    perform nestly.notify_deliver(v_pro, case new.status when 'accepted' then 'offer_accepted' else 'offer_declined' end, 'offers', null,
                                  'outreach', new.id, new.id, false);
  elsif tg_table_name = 'professional_reviews' then
    perform nestly.notify_deliver(v_pro, 'review_received', 'reviews', null, 'professional', v_pro, new.id, false);
  elsif tg_table_name = 'professional_follows' then
    -- the weekly digest: one row per Professional and week, timed at the week's end (Monday 00:00, Israel time)
    v_week_end := (pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'Asia/Jerusalem') + interval '7 days') at time zone 'Asia/Jerusalem';
    if not exists (
      select 1 from nestly.notification_preferences p
      where p.user_id = v_pro and p.category = 'followers' and not p.is_in_app_enabled) then
      insert into nestly.notifications (recipient_id, type, actor_id, target_kind, target_id, subject_id, is_critical, created_at)
      values (v_pro, 'followers_weekly', null, 'professional', v_pro,
              pg_catalog.md5(v_pro::text || '/' || v_week_end::text)::uuid, false, v_week_end)
      on conflict (recipient_id, type, subject_id) do nothing;
    end if;
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return null;
end
$$;

revoke execute on function nestly.notify_professional() from public;

create trigger notify_professional_outreach
  after update of status on nestly.outreach_requests
  for each row when (old.status = 'pending' and new.status in ('accepted', 'declined'))
  execute function nestly.notify_professional();
create trigger notify_professional_review
  after insert on nestly.professional_reviews
  for each row execute function nestly.notify_professional();
create trigger notify_professional_follow
  after insert on nestly.professional_follows
  for each row execute function nestly.notify_professional();

-- 8. A Professional's consent carries the qualification declaration (Afik 21.10.2026, §9.8) -------------------------------------------
alter table nestly.legal_consents add column has_declared_qualification boolean not null default false;
grant insert (has_declared_qualification) on table nestly.legal_consents to authenticated;

-- 9. Comments -------------------------------------------------------------------------------------------------------------------
comment on policy support_requests_select_analytics on nestly.support_requests is 'FR-ADMIN-003, BR-058: ANALYTICS_VIEW counts Support requests by status and topic on the analytics screen only (nestly.analytics_view); the server returns numbers, never a text, a person or an id.';
comment on policy support_messages_select_analytics on nestly.support_messages is 'FR-ADMIN-003, BR-058: ANALYTICS_VIEW times the first Support reply on the analytics screen only; never a text.';
comment on column nestly.professional_reviews.moderation is 'active, hidden or removed by staff with CONTENT_MODERATE after a report (FR-MOD-001); a moderated review leaves every view and the average.';
comment on column nestly.professional_articles.moderation is 'active, hidden or removed by staff with CONTENT_MODERATE after a report (FR-MOD-001); a moderated article leaves every view but its owner''s.';
comment on column nestly.reports.target_kind is 'post, comment, user, message, review or article; survives the target''s SET NULL.';
comment on column nestly.reports.review_id is 'The reported review (FR-SERV-011, FR-MOD-001); its text is copied into target_text. SET NULL when the review is deleted: its open reports expire (reports_target_gone).';
comment on column nestly.reports.article_id is 'The reported article (FR-PRO-003, FR-MOD-001); its title and text are copied into target_text. SET NULL when the article is deleted: its open reports expire (reports_target_gone).';
comment on index nestly.reports_review_id_idx is 'The SET NULL lookup when a review is deleted; the staff read of a reported review.';
comment on index nestly.reports_article_id_idx is 'The SET NULL lookup when an article is deleted; the staff read of a reported article.';
comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert: a reported post, comment, chat message, review or article must be readable to the reporter and (but a review, whose writer is never readable) not their own (42501); for a post or comment named or through post_authors.';
comment on function nestly.reports_insert_snapshot() is 'SECURITY INVOKER. Before insert on reports: copies the reported post, comment or review text, or an article''s title and text, read under the reporter''s RLS.';
comment on function nestly.reports_target_gone() is 'SECURITY INVOKER. Before the SET NULL of review_id or article_id: an open report on a review or article that was deleted expires.';
comment on function nestly.professional_content_moderation_guard() is 'SECURITY INVOKER. Before a change of moderation on a review or an article: only staff with CONTENT_MODERATE, and with a reason (nestly.audit_reason, NS011) when it leaves view.';
comment on policy professional_reviews_select_viewer on nestly.professional_reviews is 'Every active account reads the unmoderated reviews of an active reviewer (no block filter: it would reveal the hidden reviewer); the reviewer reads its own while unmoderated.';
comment on policy professional_articles_select_viewer on nestly.professional_articles is 'The owner reads all its articles (moderated ones too); every active account reads a published, unmoderated article of an active author with no user block between them.';
comment on policy professional_reviews_select_staff on nestly.professional_reviews is 'REPORTS_VIEW reads a reported review in any state (FR-MOD-003).';
comment on policy professional_articles_select_staff on nestly.professional_articles is 'REPORTS_VIEW reads a reported article in any state (FR-MOD-003).';
comment on policy professional_reviews_update_staff on nestly.professional_reviews is 'CONTENT_MODERATE hides, removes or restores a reported review (FR-MOD-001); only moderation is granted for UPDATE.';
comment on policy professional_articles_update_staff on nestly.professional_articles is 'CONTENT_MODERATE hides, removes or restores a reported article (FR-MOD-001); the text stays its owner''s (professional_articles_reject_staff_edit).';
comment on function nestly.notify_professional() is
  'SECURITY DEFINER (approved exception, rule 17; Afik 21.10.2026, OP-051 cancelled). After an Offer Help is accepted or declined, a review is written, or a Professional gains a follower: notifies the Professional (offer_accepted / offer_declined, review_received; followers_weekly, one row per week timed at its end). Never to oneself, never across a user block, never naming the actor; the recipient''s category switch is honoured. Declares nestly.notify_scope = professional and clears it. No EXECUTE for any runtime role.';
comment on column nestly.legal_consents.has_declared_qualification is 'A Professional declared it holds the training and licence its field needs (Afik 21.10.2026); the Professional registration request requires it. False for every other account.';
comment on policy notifications_select_recipient on nestly.notifications is 'The recipient reads its own notifications from their created_at (a weekly digest is written ahead, timed at the week''s end).';
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one, a System Announcement created, edited, published or removed, a staff view of reported Private Group content, or a reported review or article hidden, removed or restored: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';
