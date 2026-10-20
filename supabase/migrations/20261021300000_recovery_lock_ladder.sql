-- =====================================================================================================================
-- The recovery lock ladder and its release by the Admin — I4 (NFR-SEC-010, FR-ADMIN-013, AC-113, AC-126; Afik 17.10.2026).
--
-- recovery_throttles      gains the per-account ladder (handles only): ladder_failures counts the failures since the last success
--                         or release (no window), ladder_started_at is when that count restarted, is_locked_permanently is set at
--                         the 9th failure. The server (as app_recovery, for the declared handle only) applies the ladder: the 3rd
--                         failure locks for 1 hour, the 6th for 24 hours, the 9th for good. The IP limit is unchanged.
-- recovery_lock_releases  one row per release of an account's recovery lock by the Admin: whose, by whom, an optional reason, when.
--                         Only a holder of RECOVERY_LOCK_RELEASE (the Admin; a Moderator can never hold it) inserts, in its own
--                         name; it reads them back; nobody updates or deletes. app_recovery reads the releases of the declared
--                         handle's account only, so the next attempt starts again from zero (the release gives no access).
--                         Audited by audit_trigger() (rule 18) in the same transaction: action recovery_lock_released.
-- audit_trigger()         replaced: the same body plus one branch for recovery_lock_releases. Still the one approved definer of
--                         rule 18; tests.approved_security_definer() is unchanged.
-- authenticated still holds nothing on recovery_throttles or recovery_events.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261021300000_recovery_lock_ladder.down.sql (refuses while a release or a permanent lock exists).
-- =====================================================================================================================

-- 1. The ladder on recovery_throttles (handles only).
alter table nestly.recovery_throttles
  add column ladder_failures smallint not null default 0,
  add column ladder_started_at timestamptz,
  add column is_locked_permanently boolean not null default false;

alter table nestly.recovery_throttles
  add constraint recovery_throttles_ladder_check check (
    ladder_failures >= 0
    and (subject_kind = 'handle' or (ladder_failures = 0 and ladder_started_at is null and not is_locked_permanently)));

grant update (ladder_failures, ladder_started_at, is_locked_permanently) on table nestly.recovery_throttles to app_recovery;

-- A permanent lock is lifted only by a release (FR-ADMIN-013): no update may clear it, lower the count or shorten the lock unless a release
-- later than the ladder's start exists for the account (app_recovery sees the declared account's releases only). A success may still
-- restart a lock that is not permanent.
create function nestly.ladder_release_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.subject_kind = 'handle' and old.is_locked_permanently
     and (not new.is_locked_permanently or new.ladder_failures < old.ladder_failures
          or new.locked_until is null or new.locked_until < old.locked_until)
     and not exists (select 1 from nestly.recovery_lock_releases r where r.released_at > coalesce(old.ladder_started_at, '-infinity'::timestamptz)) then
    raise exception 'recovery_throttles: a permanent lock is lifted only by a release' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function nestly.ladder_release_guard() from public;


-- 2. recovery_lock_releases.
create table nestly.recovery_lock_releases (
  id          uuid        not null default gen_random_uuid()
    constraint recovery_lock_releases_pkey primary key,
  user_id     uuid        not null
    constraint recovery_lock_releases_user_id_fkey references nestly.users (id) on delete cascade,
  released_by uuid        not null default auth.uid()
    constraint recovery_lock_releases_released_by_fkey references nestly.users (id) on delete cascade,
  reason      text
    constraint recovery_lock_releases_reason_check check (reason is null or pg_catalog.char_length(reason) between 1 and 1000),
  released_at timestamptz not null default now()
);

create index recovery_lock_releases_user_idx on nestly.recovery_lock_releases (user_id, released_at desc);
create index recovery_lock_releases_released_by_idx on nestly.recovery_lock_releases (released_by);

alter table nestly.recovery_lock_releases enable row level security, force row level security;

revoke all on table nestly.recovery_lock_releases from public, anon, authenticated;
grant select on table nestly.recovery_lock_releases to authenticated;
grant insert (user_id, reason) on table nestly.recovery_lock_releases to authenticated;
grant select (user_id, released_at) on table nestly.recovery_lock_releases to app_recovery;

create policy recovery_lock_releases_insert_admin on nestly.recovery_lock_releases
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('RECOVERY_LOCK_RELEASE'))
    and released_by = (select auth.uid()) and user_id <> (select auth.uid()));

create policy recovery_lock_releases_select_admin on nestly.recovery_lock_releases
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('RECOVERY_LOCK_RELEASE')));

-- The subquery sees at most the declared handle's answers row (recovery_answers_select_recovery): only that account's releases.
create policy recovery_lock_releases_select_recovery on nestly.recovery_lock_releases
  for select to app_recovery
  using (user_id = (select ra.user_id from nestly.recovery_answers ra));

-- 3. The audit: audit_trigger() gains one branch; nothing else in it changes.
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
  elsif tg_table_name = 'recovery_lock_releases' then
    v_key := 'RECOVERY_LOCK_RELEASE';
    v_action := 'recovery_lock_released';
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := nullif(v_new ->> 'reason', '');
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger recovery_throttles_ladder_release_guard
  before update on nestly.recovery_throttles
  for each row execute function nestly.ladder_release_guard();

create trigger recovery_lock_releases_audit
  after insert on nestly.recovery_lock_releases
  for each row execute function nestly.audit_trigger();

-- 4. Comments.
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, or a recovery lock release: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';
comment on column nestly.recovery_throttles.ladder_failures is
  'NFR-SEC-010: failures since the last success or release, handles only (0 for an IP). The 3rd locks for 1 hour, the 6th for 24 hours, the 9th for good.';
comment on column nestly.recovery_throttles.ladder_started_at is
  'When the ladder count last restarted (a success or an applied release); NULL: never. A release later than this resets the ladder at the next attempt.';
comment on column nestly.recovery_throttles.is_locked_permanently is
  'NFR-SEC-010: set at the 9th failure; only a release by the Admin (FR-ADMIN-013) clears it. Handles only.';
comment on constraint recovery_throttles_ladder_check on nestly.recovery_throttles is
  'The ladder belongs to handles: an IP row keeps 0, NULL and false.';
comment on table nestly.recovery_lock_releases is
  'FR-ADMIN-013, AC-126: a release of an account''s recovery lock by the Admin. The next attempt is checked as usual from zero; the release signs nobody in and changes no password. Inserted only with RECOVERY_LOCK_RELEASE in one''s own name, read back by that key and, for the declared handle''s account only, by app_recovery; never updated or deleted. Audited by audit_trigger().';
comment on column nestly.recovery_lock_releases.id is 'Row id.';
comment on column nestly.recovery_lock_releases.user_id is 'The account whose recovery lock is released.';
comment on column nestly.recovery_lock_releases.released_by is 'The Admin (database default auth.uid(); the insert policy refuses any other).';
comment on column nestly.recovery_lock_releases.reason is 'The Admin''s optional note (the user''s request); at most 1000 characters. Copied to the audit entry.';
comment on column nestly.recovery_lock_releases.released_at is 'Database clock.';
comment on index nestly.recovery_lock_releases_user_idx is 'The latest release of one account (the recovery attempt, the admin screen).';
comment on index nestly.recovery_lock_releases_released_by_idx is 'The cascade of a users delete.';
comment on policy recovery_lock_releases_insert_admin on nestly.recovery_lock_releases is 'A holder of RECOVERY_LOCK_RELEASE (the Admin) releases another account''s lock, in its own name.';
comment on policy recovery_lock_releases_select_admin on nestly.recovery_lock_releases is 'A holder of RECOVERY_LOCK_RELEASE reads the releases.';
comment on policy recovery_lock_releases_select_recovery on nestly.recovery_lock_releases is 'app_recovery reads the releases of the declared handle''s account only (when and whose), to restart the ladder from zero.';
comment on function nestly.ladder_release_guard() is 'Trigger before update of recovery_throttles: a permanent lock is cleared, its count lowered or its lock shortened only after a release later than the ladder''s start (FR-ADMIN-013). SECURITY INVOKER.';
comment on trigger recovery_throttles_ladder_release_guard on nestly.recovery_throttles is 'Only a release lifts a permanent lock.';
comment on trigger recovery_lock_releases_audit on nestly.recovery_lock_releases is 'audit_trigger(): each release is an Audit Log entry (recovery_lock_released) in the same transaction (rule 18).';
