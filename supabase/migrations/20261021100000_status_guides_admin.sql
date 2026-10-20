-- =====================================================================================================================
-- Admin management of status guides -- I6 (FR-ADMIN-012, BR-070), migration only.
--
-- SRS: FR-ADMIN-012 (Actor: Admin) · BR-070 (Afik approves every guide before publication) · BR-026 / rule 18 (Audit in the same transaction) ·
--      AC-095 (published only to users) · §3.2 (no assignable Permission Key covers guides: Admin only).
--
-- status_guides   An Admin (caller_staff_role() = 'admin', which also holds a valid session) reads every guide (drafts and hidden too),
--                 creates a guide (always a draft), and edits one, including its status. Nobody deletes: a guide is hidden, not removed.
--                 No Moderator, whatever keys they hold, and no user. Users still read published guides only (status_guides_select_published).
-- status_guides_prepare   BEFORE trigger, SECURITY INVOKER: publishing stamps published_at with the database clock; a draft has none.
-- audit_trigger() replaced   the same function with one more branch: created, edited, published, hidden, unpublished guides, with
--                 Before/After (status, title, stage, range, source date, body length; never the text). Everything else in the function is verbatim.
--                 It stays the one approved SECURITY DEFINER audit writer (data-model approved exceptions): no new definer.
-- Phase: expand. No table change. Down script: supabase/rollback/20261021100000_status_guides_admin.down.sql (refuses while a guide is
-- published or hidden; restores audit_trigger() verbatim; audit entries already written stay: the log is append-only).
-- =====================================================================================================================

-- 1. Policies and grants. The admin check is written out (the staff role helper), like the permission-assignment policies of the core.
create policy status_guides_select_admin on nestly.status_guides
  for select to authenticated
  using ((select nestly.caller_staff_role()) = 'admin');

create policy status_guides_insert_admin on nestly.status_guides
  for insert to authenticated
  with check ((select nestly.caller_staff_role()) = 'admin' and status = 'draft');

create policy status_guides_update_admin on nestly.status_guides
  for update to authenticated
  using ((select nestly.caller_staff_role()) = 'admin')
  with check ((select nestly.caller_staff_role()) = 'admin');

grant insert (stage_kind, range_from, range_to, title, body, source, source_checked_on) on table nestly.status_guides to authenticated;
grant update (stage_kind, range_from, range_to, title, body, source, source_checked_on, status) on table nestly.status_guides to authenticated;

comment on policy status_guides_select_admin on nestly.status_guides is 'The Admin reads every guide, drafts and hidden ones included (FR-ADMIN-012).';
comment on policy status_guides_insert_admin on nestly.status_guides is 'The Admin creates a guide; a new guide is a draft awaiting approval (BR-070).';
comment on policy status_guides_update_admin on nestly.status_guides is 'The Admin edits, publishes and hides a guide (FR-ADMIN-012); the CHECKs still require a source check date to publish.';

-- 2. published_at is the database's: stamped on publishing, empty on a draft.
create function nestly.status_guides_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' or old.status is distinct from 'published' then new.published_at := now(); else new.published_at := old.published_at; end if;
  elsif new.status = 'draft' then
    new.published_at := null;
  elsif tg_op = 'UPDATE' then
    new.published_at := old.published_at;
  end if;
  return new;
end
$$;

revoke execute on function nestly.status_guides_prepare() from public;

create trigger status_guides_prepare
  before insert or update on nestly.status_guides
  for each row execute function nestly.status_guides_prepare();

-- 3. The audit trigger, replaced with the guides branch.
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
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger status_guides_audit
  after insert or update on nestly.status_guides
  for each row execute function nestly.audit_trigger();

comment on trigger status_guides_audit on nestly.status_guides is 'Every creation, edit, publication and hiding of a guide is appended to the Audit Log in the same transaction (FR-ADMIN-012, rule 18).';
