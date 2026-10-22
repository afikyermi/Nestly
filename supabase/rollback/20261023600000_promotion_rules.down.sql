-- =====================================================================================================================
-- Down script for supabase/migrations/20261023600000_promotion_rules.sql (I13 follow-up: usage events, professional views, promotion
-- settings, staff stop, anonymised payments, monthly summaries). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while no usage event, professional view, summary, settings version beyond v1, staff stop or anonymised payment exists
--           (refuses otherwise: data would be lost).
-- Restores: promotion_events_guard(), promotions_update_guard() and promotion_payments_prepare() as 20261022900000 wrote them,
--           audit_trigger() as 20261023500000 wrote it, the payer FK (ON DELETE CASCADE, NOT NULL). Drops what the migration added; the
--           history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the promotion rules down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): lifted inside this transaction only, for
  -- the checks; put back below for the tables that stay.
  alter table nestly.usage_events no force row level security;
  alter table nestly.professional_views no force row level security;
  alter table nestly.promotion_monthly_summaries no force row level security;
  alter table nestly.promotion_settings no force row level security;
  alter table nestly.promotions no force row level security;
  alter table nestly.promotion_payments no force row level security;
  if exists (select 1 from nestly.usage_events) or exists (select 1 from nestly.professional_views)
     or exists (select 1 from nestly.promotion_monthly_summaries) or exists (select 1 from nestly.promotion_settings where version > 1)
     or exists (select 1 from nestly.promotions where stopped_by = 'staff') or exists (select 1 from nestly.promotion_payments where payer_id is null or professional_field is not null) then
    raise exception 'an I13 promotion-rules row exists (usage event, professional view, summary, settings version, staff stop, anonymised payment or a payment field): the down script refuses';
  end if;
  alter table nestly.promotions force row level security;
  alter table nestly.promotion_payments force row level security;
end
$$;

drop trigger promotions_staff_stop_audit on nestly.promotions;
drop trigger promotion_settings_audit on nestly.promotion_settings;

-- audit_trigger() as 20261023500000_staff_rules.sql wrote it (verbatim)
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
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told). I14 completion B (Afik 21.10.2026): a staff
    -- decision on a block-list match, confirmed or not_abuse (a false positive, whose listed hashes leave the list: media_hash_removed).
    v_key := 'CONTENT_MODERATE';
    v_action := case when tg_op = 'UPDATE' and v_new ->> 'match_decision' is distinct from v_old ->> 'match_decision'
                     then 'media_hash_' || (v_new ->> 'match_decision') else 'media_suspected' end;
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after', 'hashDecision', v_new ->> 'match_decision');
  elsif tg_table_name = 'suspected_image_fingerprints' then
    -- I14 completion B (Afik 21.10.2026): a hash left the block list after staff decided a match was not abuse (a false positive). Never the hash.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_hash_removed';
    v_kind := 'media';
    v_target := (v_old ->> 'source_media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('reason', 'not_abuse');
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
    -- I14 completion B (§10.7): the audience too
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'bodyChars', pg_catalog.char_length(v_old ->> 'body'), 'audience', v_old ->> 'audience', 'audienceStage', v_old ->> 'audience_stage') end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'),
      'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body', 'audience', v_new ->> 'audience',
      'audienceStage', v_new ->> 'audience_stage');
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
  elsif tg_table_name = 'enforcement_records' then
    -- I14 completion B (FR-MOD-003, §10.4): reported content deleted by a justified decision (its enforcement record). Never the text.
    v_key := case v_new ->> 'target_kind' when 'listing' then 'MARKETPLACE_MODERATE' else 'CONTENT_MODERATE' end;
    v_action := 'content_deleted';
    v_kind := v_new ->> 'target_kind';
    v_target := (v_new ->> 'target_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('rule', v_new ->> 'rule', 'reportId', v_new ->> 'report_id', 'named', v_new ->> 'user_id' is not null);
  elsif tg_table_name = 'reported_comment_views' then
    -- I14 completion B (Afik 21.10.2026): a staff member opened a reported comment (every opening, also after the report closed).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_comment_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  elsif tg_table_name = 'profile_staff_views' then
    -- I14 completion B (BR-081, §10.3): a staff member opened a Regular account's profile (shown in full, never tracker data). No key: every
    -- staff account opens profiles for review.
    v_action := 'staff_profile_viewed';
    v_kind := 'user';
    v_target := (v_new ->> 'target_id')::uuid;
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

drop function nestly.purge_promotion_data();
drop policy promotion_payments_select_jobs on nestly.promotion_payments;
drop policy promotions_select_jobs on nestly.promotions;
drop policy promotion_events_delete_jobs on nestly.promotion_events;
drop policy promotion_events_select_jobs on nestly.promotion_events;
revoke all on table nestly.promotion_events, nestly.promotions, nestly.promotion_payments from app_jobs;
drop table nestly.promotion_monthly_summaries;

-- payments: the payer FK as it was (every row has a payer: checked above)
create or replace function nestly.promotion_payments_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan record;
begin
  select p.target_kind, p.sample_price_ils, p.is_active into v_plan from nestly.promotion_plans p where p.key = new.plan_key;
  if not found or not v_plan.is_active then
    raise exception 'promotion_payments: no such plan' using errcode = '23503';
  end if;
  new.target_kind := v_plan.target_kind;
  new.amount_ils := v_plan.sample_price_ils;
  new.currency := 'ILS';
  new.provider := 'simulated';
  new.is_simulated := true;
  new.status := 'succeeded';
  new.created_at := pg_catalog.now();
  return new;
end
$$;

alter table nestly.promotion_payments drop constraint promotion_payments_payer_id_fkey;
alter table nestly.promotion_payments add constraint promotion_payments_payer_id_fkey
  foreign key (payer_id) references nestly.users (id) on delete cascade;
alter table nestly.promotion_payments alter column payer_id set not null;
alter table nestly.promotion_payments drop column professional_field;
comment on function nestly.promotion_payments_prepare() is 'BEFORE INSERT, SECURITY INVOKER. Copies the active plan''s target kind and sample price into the payment and fixes the simulated provider, status and clock (23503 for no such plan).';

comment on column nestly.promotion_payments.payer_id is 'Who paid (default auth.uid(), rule 12).';

-- promotions: the owner-only stop as it was
drop policy promotions_update_staff on nestly.promotions;
drop policy promotions_select_staff on nestly.promotions;
create or replace function nestly.promotions_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.id, new.owner_id, new.target_kind, new.post_id, new.listing_id, new.plan_key, new.payment_id, new.starts_at, new.ends_at, new.created_at)
     is distinct from (old.id, old.owner_id, old.target_kind, old.post_id, old.listing_id, old.plan_key, old.payment_id, old.starts_at, old.ends_at, old.created_at) then
    raise exception 'promotions: immutable column' using errcode = '42501';
  end if;
  if not (old.status = 'active' and new.status = 'stopped' and old.ends_at > pg_catalog.now()) then
    raise exception 'promotions: only a running promotion is stopped' using errcode = '23514';
  end if;
  new.stopped_at := pg_catalog.now();
  return new;
end
$$;

comment on function nestly.promotions_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The owner only stops a running promotion (active -> stopped, stopped_at the database clock); every other column is immutable.';

alter table nestly.promotions drop constraint promotions_stopped_by_status_check;
alter table nestly.promotions drop column stopped_by;

-- the frequency cap as it was (impressions up to 100 a day)
create or replace function nestly.promotion_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
  v_uid uuid := (select auth.uid());
  v_promo record;
  v_cap integer;
begin
  if tg_op = 'UPDATE' and current_user <> 'authenticated' then
    return new;
  end if;
  if coalesce((select nestly.caller_account_type()), '') not in ('regular', 'professional') then
    raise exception 'promotion_events: only a Regular or a Professional records an event' using errcode = '42501';
  end if;
  select p.owner_id, p.target_kind, p.listing_id into v_promo
    from nestly.promotions p
   where p.id = new.promotion_id and p.owner_id <> v_uid
     and p.status = 'active' and p.starts_at <= pg_catalog.now() and p.ends_at > pg_catalog.now();
  if not found then
    raise exception 'promotion_events: not a running promotion of another that the caller can see' using errcode = '42501';
  end if;
  v_cap := case new.kind when 'impression' then 100 when 'click' then 20 else 1 end;
  if tg_op = 'UPDATE' then
    if (new.id, new.promotion_id, new.viewer_id, new.kind, new.occurred_on, new.created_at)
       is distinct from (old.id, old.promotion_id, old.viewer_id, old.kind, old.occurred_on, old.created_at)
       or new.times <> old.times + 1 or old.occurred_on <> v_today or new.times > v_cap then
      raise exception 'promotion_events: only today''s count goes up, by one, within its limit' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.now();
    return new;
  end if;
  if new.viewer_id is distinct from v_uid then
    raise exception 'promotion_events: the caller''s own event only' using errcode = '42501';
  end if;
  new.times := 1;
  new.occurred_on := v_today;
  new.created_at := pg_catalog.now();
  new.updated_at := pg_catalog.now();
  if new.kind in ('follow', 'chat_start') then
    if not exists (select 1 from nestly.promotion_events e
                    where e.promotion_id = new.promotion_id and e.kind = 'click' and e.occurred_on >= v_today - 6) then
      raise exception 'promotion_events: no click to attribute' using errcode = '42501';
    end if;
    -- a follow counts once per promotion and viewer, ever (unfollowing and following again is not a new paid follow)
    if new.kind = 'follow' and exists (select 1 from nestly.promotion_events e where e.promotion_id = new.promotion_id and e.kind = 'follow') then
      return null;
    end if;
    if new.kind = 'follow' and not exists (
        select 1 from nestly.professional_follows f
         where f.professional_id = v_promo.owner_id and f.created_at = pg_catalog.now()) then
      raise exception 'promotion_events: no follow in this transaction' using errcode = '42501';
    end if;
    if new.kind = 'chat_start' and not exists (
        select 1 from nestly.conversations c
         where c.created_at = pg_catalog.now()
           and ((c.user_a = v_uid and c.user_b = v_promo.owner_id) or (c.user_b = v_uid and c.user_a = v_promo.owner_id))
           and (case when v_promo.target_kind = 'listing' then c.context = 'marketplace' and c.listing_id = v_promo.listing_id
                     else c.context = 'professional' end)) then
      raise exception 'promotion_events: no conversation in this transaction' using errcode = '42501';
    end if;
  end if;
  -- a repeat the same day (serialised per promotion and caller; advisory lock 8114): impressions and clicks add one to the day's row up to
  -- their limit; a follow or a chat start counts once a day. Either way no second row is inserted.
  perform pg_catalog.pg_advisory_xact_lock(8114, pg_catalog.hashtext(new.promotion_id::text || ':' || v_uid::text));
  if exists (select 1 from nestly.promotion_events e
              where e.promotion_id = new.promotion_id and e.kind = new.kind and e.occurred_on = v_today) then
    update nestly.promotion_events e set times = e.times + 1
     where e.promotion_id = new.promotion_id and e.kind = new.kind and e.occurred_on = v_today and e.times < v_cap;
    return null;
  end if;
  return new;
end
$$;

comment on function nestly.promotion_events_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. Only a Regular or Professional, on a running promotion of another that it can read (target still eligible). An insert is the caller''s own on today''s date (Israel time): impressions and clicks add one to the day''s row instead of a second row, up to 100 / 20 a day (then nothing more is counted); a follow counts once per promotion and viewer and a chat start once a day, only with a real follow / conversation of the caller created in this transaction and a click of the caller within 7 calendar days (advisory lock 8114). An update only adds one to today''s row within the same limits.';


drop table nestly.promotion_settings;
drop function nestly.promotion_settings_prepare();

drop table nestly.professional_views;
drop table nestly.usage_events;
drop function nestly.purge_usage_events();
drop function nestly.professional_views_guard();
drop function nestly.usage_events_guard();

delete from supabase_migrations.schema_migrations where version = '20261023600000';

commit;
