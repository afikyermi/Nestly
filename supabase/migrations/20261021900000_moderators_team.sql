-- =====================================================================================================================
-- The Moderators team -- I14 (FR-ADMIN-004, FR-ADMIN-007 completion, FR-ADMIN-008, FR-ADMIN-010, FR-ADMIN-003), migration only.
--
-- SRS: FR-ADMIN-004, UC-15, PG-027 (the Admin alone creates, deactivates and assigns keys to a Moderator; BR-022, BR-023, BR-027) ·
--      FR-ADMIN-008, UC-29, PG-032, AC-049 (System Announcements with SYSTEM_ANNOUNCEMENTS) · FR-ADMIN-010, FR-ADMIN-003, PG-026, AC-071,
--      BR-058 (the Admin Analytics: ANALYTICS_VIEW, no names) · BR-026 / NFR-AUDIT-001 / rule 18 (Audit in the same transaction).
--
-- moderator_invitations   How a Moderator account comes to exist (FR-ADMIN-004 "create"): the Admin issues a one-time invitation; the server
--                 keeps only the SHA-256 of its random code and shows the code once. The invited person creates an Auth account and redeems
--                 the code: in one transaction their users row is created as a Moderator (users_insert_moderator) and the invitation marks
--                 them (accepted_by). The code travels in the transaction-local setting nestly.moderator_invite (its hash); knowing it is
--                 the only way to read or claim the row. Valid 7 days; the Admin revokes an open one. Deactivating a Moderator is the
--                 existing Admin ban (user_enforcements, I4), not part of this file.
-- staff_roles     gains one INSERT path: the mirror trigger of a Moderator who redeems a valid invitation (users_staff_mirror runs as the caller).
-- system_announcements   Official announcements: a draft, published, then removed (final). SYSTEM_ANNOUNCEMENTS (the Admin always) reads
--                 every one and writes; every active account reads the published ones. The database stamps the times.
-- analytics       *_select_analytics on users, posts, comments, reactions, reports, user_enforcements and friendships: ANALYTICS_VIEW (the
--                 Admin always), only in a transaction that named the purpose in nestly.analytics_view (the users_select_staff pattern of I4,
--                 deviation (a) in data-model-tables.md): the server answers counts only, never a name, a text or an id. No child,
--                 journey, tracker, chat or support row is opened (Afik's open item 6, default (a): children only in aggregate, and I14 shows none).
-- audit_trigger() replaced   the same function with branches for invitations (invited, revoked, joined) and announcements (created, edited,
--                 published, removed). Everything else in it is verbatim from 20261021500000_media_stories.sql. No new SECURITY DEFINER.
-- Phase: expand. Down script: supabase/rollback/20261021900000_moderators_team.down.sql.
-- =====================================================================================================================

-- 1. moderator_invitations --------------------------------------------------------------------------------------------------------
create table nestly.moderator_invitations (
  id          uuid        not null default gen_random_uuid(),
  code_hash   text        not null,
  note        text        not null,
  invited_by  uuid        not null default auth.uid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  constraint moderator_invitations_pkey primary key (id),
  constraint moderator_invitations_code_hash_key unique (code_hash),
  constraint moderator_invitations_code_hash_check check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint moderator_invitations_note_check check (char_length(btrim(note)) between 2 and 80),
  constraint moderator_invitations_accepted_check check ((accepted_by is null) = (accepted_at is null)),
  constraint moderator_invitations_state_check check (accepted_by is null or revoked_at is null),
  constraint moderator_invitations_accepted_by_key unique (accepted_by),
  constraint moderator_invitations_invited_by_fkey foreign key (invited_by) references nestly.users (id) on delete restrict,
  constraint moderator_invitations_accepted_by_fkey foreign key (accepted_by) references nestly.users (id) on delete cascade
);

create index moderator_invitations_invited_by_idx on nestly.moderator_invitations (invited_by);

alter table nestly.moderator_invitations enable row level security, force row level security;

-- The hash of the code the caller redeems, named by the server in this transaction only (NULL when none).
create function nestly.moderator_invite_hash()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('nestly.moderator_invite', true), '')
$$;

revoke execute on function nestly.moderator_invite_hash() from public;
grant execute on function nestly.moderator_invite_hash() to authenticated;

create policy moderator_invitations_select_admin on nestly.moderator_invitations
  for select to authenticated
  using ((select nestly.caller_staff_role()) = 'admin');

create policy moderator_invitations_select_invitee on nestly.moderator_invitations
  for select to authenticated
  using (code_hash = (select nestly.moderator_invite_hash()));

create policy moderator_invitations_insert_admin on nestly.moderator_invitations
  for insert to authenticated
  with check ((select nestly.caller_staff_role()) = 'admin' and invited_by = (select auth.uid())
    and accepted_by is null and revoked_at is null);

create policy moderator_invitations_update_admin on nestly.moderator_invitations
  for update to authenticated
  using ((select nestly.caller_staff_role()) = 'admin' and accepted_by is null and revoked_at is null)
  with check ((select nestly.caller_staff_role()) = 'admin' and accepted_by is null and revoked_at is not null);

create policy moderator_invitations_update_invitee on nestly.moderator_invitations
  for update to authenticated
  using (code_hash = (select nestly.moderator_invite_hash()) and accepted_by is null and revoked_at is null and expires_at > now())
  with check (accepted_by = (select auth.uid()) and revoked_at is null);

revoke all on table nestly.moderator_invitations from public, anon;
grant select on table nestly.moderator_invitations to authenticated;
grant insert (code_hash, note) on table nestly.moderator_invitations to authenticated;
grant update (accepted_by, revoked_at) on table nestly.moderator_invitations to authenticated;

-- The state moves once, stamped by the database: revoked by the Admin, or accepted by the caller who just became a Moderator with it.
create function nestly.moderator_invitations_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.revoked_at is distinct from old.revoked_at then
    if old.revoked_at is not null or old.accepted_by is not null or (select nestly.caller_staff_role()) is distinct from 'admin' then
      raise exception 'moderator_invitations: only the Admin revokes an open invitation' using errcode = '42501';
    end if;
    new.revoked_at := pg_catalog.now();
  end if;
  if new.accepted_by is distinct from old.accepted_by then
    if old.accepted_by is not null or old.revoked_at is not null or old.expires_at <= pg_catalog.now()
       or new.accepted_by is distinct from auth.uid()
       or not exists (select 1 from nestly.staff_roles sr where sr.user_id = auth.uid() and sr.account_type = 'moderator') then
      raise exception 'moderator_invitations: an invitation is accepted once, by the Moderator it created' using errcode = '42501';
    end if;
    new.accepted_at := pg_catalog.now();
  end if;
  return new;
end
$$;

revoke execute on function nestly.moderator_invitations_guard() from public;

create trigger moderator_invitations_guard
  before update on nestly.moderator_invitations
  for each row execute function nestly.moderator_invitations_guard();

-- 2. A Moderator account from a valid invitation (and its staff_roles mirror, written by users_staff_mirror as the caller) -----------
create policy users_insert_moderator on nestly.users
  for insert to authenticated
  with check (id = (select auth.uid()) and account_type = 'moderator' and status = 'active'
    and exists (select 1 from nestly.moderator_invitations i
                 where i.code_hash = (select nestly.moderator_invite_hash())
                   and i.accepted_by is null and i.revoked_at is null and i.expires_at > now()));

create policy staff_roles_insert_invited on nestly.staff_roles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and account_type = 'moderator' and account_status = 'active'
    and exists (select 1 from nestly.moderator_invitations i
                 where i.code_hash = (select nestly.moderator_invite_hash())
                   and i.accepted_by is null and i.revoked_at is null and i.expires_at > now()));

grant insert (user_id, account_type, account_status) on table nestly.staff_roles to authenticated;

-- 3. system_announcements ---------------------------------------------------------------------------------------------------------
create table nestly.system_announcements (
  id           uuid        not null default gen_random_uuid(),
  title        text        not null,
  body         text        not null,
  status       text        not null default 'draft',
  created_by   uuid        not null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  removed_at   timestamptz,
  constraint system_announcements_pkey primary key (id),
  constraint system_announcements_title_check check (char_length(btrim(title)) between 2 and 80),
  constraint system_announcements_body_check check (char_length(btrim(body)) between 1 and 1000),
  constraint system_announcements_status_check check (status in ('draft', 'published', 'removed')),
  constraint system_announcements_published_check check ((status = 'draft') = (published_at is null) or status = 'removed'),
  constraint system_announcements_removed_check check ((status = 'removed') = (removed_at is not null)),
  constraint system_announcements_created_by_fkey foreign key (created_by) references nestly.users (id) on delete restrict
);

create index system_announcements_published_idx on nestly.system_announcements (published_at desc) where status = 'published';
create index system_announcements_created_by_idx on nestly.system_announcements (created_by);

alter table nestly.system_announcements enable row level security, force row level security;

create policy system_announcements_select_staff on nestly.system_announcements
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('SYSTEM_ANNOUNCEMENTS')));

create policy system_announcements_select_published on nestly.system_announcements
  for select to authenticated
  using ((select nestly.is_active_account()) and status = 'published');

create policy system_announcements_insert_staff on nestly.system_announcements
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('SYSTEM_ANNOUNCEMENTS')) and created_by = (select auth.uid()) and status = 'draft');

create policy system_announcements_update_staff on nestly.system_announcements
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('SYSTEM_ANNOUNCEMENTS')) and status <> 'removed')
  with check ((select nestly.has_permission('SYSTEM_ANNOUNCEMENTS')));

revoke all on table nestly.system_announcements from public, anon;
grant select on table nestly.system_announcements to authenticated;
grant insert (title, body) on table nestly.system_announcements to authenticated;
grant update (title, body, status) on table nestly.system_announcements to authenticated;

-- Draft -> published -> removed, or draft -> removed; never back to draft. The times are the database's.
create function nestly.system_announcements_prepare()
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
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

revoke execute on function nestly.system_announcements_prepare() from public;

create trigger system_announcements_prepare
  before insert or update on nestly.system_announcements
  for each row execute function nestly.system_announcements_prepare();

-- 4. Analytics reads (FR-ADMIN-010, BR-058): counts only, on the analytics screen only -----------------------------------------------
create function nestly.analytics_reader()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and coalesce(nestly.has_permission('ANALYTICS_VIEW'), false)
$$;

revoke execute on function nestly.analytics_reader() from public;
grant execute on function nestly.analytics_reader() to authenticated;

create policy users_select_analytics on nestly.users
  for select to authenticated using ((select nestly.analytics_reader()));
create policy posts_select_analytics on nestly.posts
  for select to authenticated using ((select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy comments_select_analytics on nestly.comments
  for select to authenticated using ((select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy reactions_select_analytics on nestly.reactions
  for select to authenticated using ((select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy reports_select_analytics on nestly.reports
  for select to authenticated using ((select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy user_enforcements_select_analytics on nestly.user_enforcements
  for select to authenticated using ((select nestly.is_active_account()) and (select nestly.analytics_reader()));
create policy friendships_select_analytics on nestly.friendships
  for select to authenticated using ((select nestly.is_active_account()) and (select nestly.analytics_reader()));

-- 5. The audit trigger, replaced with the invitation and announcement branches -----------------------------------------------------
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
  elsif tg_table_name = 'moderator_invitations' then
    -- FR-ADMIN-004: the Admin invites (or revokes an invitation); the invited person joins as a Moderator. Never the code or its hash.
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
      v_action := 'moderator_joined';
      v_kind := 'user';
      v_target := (v_new ->> 'accepted_by')::uuid;
      v_after := pg_catalog.jsonb_build_object('invitationId', v_new ->> 'id', 'note', v_new ->> 'note');
    end if;
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
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Moderator invitation issued, revoked or redeemed, or a System Announcement created, edited, published or removed: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';

create trigger moderator_invitations_audit
  after insert or update on nestly.moderator_invitations
  for each row execute function nestly.audit_trigger();

create trigger system_announcements_audit
  after insert or update on nestly.system_announcements
  for each row execute function nestly.audit_trigger();

-- 6. Comments ----------------------------------------------------------------------------------------------------------------------
comment on table nestly.moderator_invitations is 'FR-ADMIN-004 (create a Moderator): a one-time invitation the Admin issues. Only the SHA-256 of its random code is kept; the code is shown once. Redeemed in one transaction with the new Moderator account (users_insert_moderator); valid 7 days; the Admin revokes an open one. Audited.';
comment on column nestly.moderator_invitations.id is 'The invitation.';
comment on column nestly.moderator_invitations.code_hash is 'SHA-256 (hex) of the one-time code; the code itself is never stored.';
comment on column nestly.moderator_invitations.note is 'Who it is for, in the Admin''s words (2-80 characters); shown to the Admin only.';
comment on column nestly.moderator_invitations.invited_by is 'The Admin who issued it (default auth.uid()).';
comment on column nestly.moderator_invitations.created_at is 'When it was issued.';
comment on column nestly.moderator_invitations.expires_at is 'Seven days after issue; an expired invitation cannot be redeemed.';
comment on column nestly.moderator_invitations.accepted_by is 'The Moderator account it created (set once, by that account, in the transaction that created it).';
comment on column nestly.moderator_invitations.accepted_at is 'When it was redeemed (the database clock).';
comment on column nestly.moderator_invitations.revoked_at is 'When the Admin revoked it (the database clock); a revoked invitation cannot be redeemed.';
comment on function nestly.moderator_invite_hash() is 'SECURITY INVOKER. The hash of the invitation code the server named in this transaction (nestly.moderator_invite), or NULL.';
comment on function nestly.moderator_invitations_guard() is 'BEFORE UPDATE, SECURITY INVOKER. An invitation moves once: revoked by the Admin while open, or accepted by the caller who is now the Moderator it created, before it expires. The times are the database''s.';
comment on policy moderator_invitations_select_admin on nestly.moderator_invitations is 'The Admin reads every invitation (FR-ADMIN-004, PG-027).';
comment on policy moderator_invitations_select_invitee on nestly.moderator_invitations is 'Whoever holds the code (its hash named in nestly.moderator_invite) reads that one invitation.';
comment on policy moderator_invitations_insert_admin on nestly.moderator_invitations is 'The Admin issues an invitation naming itself.';
comment on policy moderator_invitations_update_admin on nestly.moderator_invitations is 'The Admin revokes an open invitation.';
comment on policy moderator_invitations_update_invitee on nestly.moderator_invitations is 'The holder of the code marks a valid open invitation as theirs (with the guard: only once they are its Moderator).';
comment on policy users_insert_moderator on nestly.users is 'FR-ADMIN-004: an Auth account becomes a Moderator only with a valid open invitation whose code it holds (nestly.moderator_invite); no key comes with it (deny by default, BR-023).';
comment on policy staff_roles_insert_invited on nestly.staff_roles is 'The staff mirror of a Moderator created from a valid invitation (users_staff_mirror runs as the caller).';
comment on table nestly.system_announcements is 'SRS SystemAnnouncement (FR-ADMIN-008, PG-032): an official announcement. draft -> published -> removed (final), or draft -> removed. SYSTEM_ANNOUNCEMENTS (the Admin always) writes and reads all; every active account reads the published ones. Audited.';
comment on column nestly.system_announcements.id is 'The announcement.';
comment on column nestly.system_announcements.title is 'The title, 2-80 characters.';
comment on column nestly.system_announcements.body is 'The text, 1-1,000 characters.';
comment on column nestly.system_announcements.status is 'draft, published or removed.';
comment on column nestly.system_announcements.created_by is 'The staff member who created it (default auth.uid()).';
comment on column nestly.system_announcements.created_at is 'When it was created.';
comment on column nestly.system_announcements.updated_at is 'When it last changed (the database clock).';
comment on column nestly.system_announcements.published_at is 'When it was published (the database clock); NULL on a draft.';
comment on column nestly.system_announcements.removed_at is 'When it was removed (the database clock).';
comment on function nestly.system_announcements_prepare() is 'BEFORE trigger, SECURITY INVOKER. Allows draft -> published -> removed and draft -> removed only, and stamps updated_at, published_at and removed_at with the database clock.';
comment on policy system_announcements_select_staff on nestly.system_announcements is 'SYSTEM_ANNOUNCEMENTS (the Admin always) reads every announcement (AC-049).';
comment on policy system_announcements_select_published on nestly.system_announcements is 'Every active account reads the published announcements.';
comment on policy system_announcements_insert_staff on nestly.system_announcements is 'SYSTEM_ANNOUNCEMENTS creates a draft naming itself.';
comment on policy system_announcements_update_staff on nestly.system_announcements is 'SYSTEM_ANNOUNCEMENTS edits, publishes and removes; a removed announcement is final.';
comment on function nestly.analytics_reader() is 'SECURITY INVOKER. True only in a transaction that named the analytics screen (nestly.analytics_view = on) for a caller holding ANALYTICS_VIEW (the Admin always). Reads staff_roles and moderator_permissions only.';
comment on policy users_select_analytics on nestly.users is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts accounts on the analytics screen only (nestly.analytics_view); the server returns numbers, never an id.';
comment on policy posts_select_analytics on nestly.posts is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts posts on the analytics screen only; never a text, an author or an id in the answer.';
comment on policy comments_select_analytics on nestly.comments is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts comments on the analytics screen only; never a text, an author or an id in the answer.';
comment on policy reactions_select_analytics on nestly.reactions is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts likes on the analytics screen only.';
comment on policy reports_select_analytics on nestly.reports is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts reports by reason and outcome on the analytics screen only; never a text or a person.';
comment on policy user_enforcements_select_analytics on nestly.user_enforcements is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts enforcement steps by kind on the analytics screen only; never a person or a reason.';
comment on policy friendships_select_analytics on nestly.friendships is 'FR-ADMIN-010, BR-058: ANALYTICS_VIEW counts friend requests and Friendships on the analytics screen only; never a person.';
