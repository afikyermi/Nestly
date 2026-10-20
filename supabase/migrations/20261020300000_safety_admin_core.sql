-- =====================================================================================================================
-- The safety and admin core: staff roles, Moderator permissions, the Audit Log, report reasons and handling, content moderation, the author's
-- delete right over moderated content, the audited reveal of an anonymous author, account enforcement and the end of a suspension.
--
-- SRS: BR-021, BR-024, BR-025, BR-026, BR-062, BR-074, BR-080 · FR-MOD-001/002/003 · FR-ADMIN-004/005/007 · AC-022, AC-025, AC-027, AC-028, AC-029,
--      AC-031, AC-077, AC-106, AC-107, AC-110 · §3.1, §3.2 · platform rules 6, 14, 15, 16, 18, 19, 20 (.claude/knowledge/data-model.md).
--
-- staff_roles             one row per Admin or Moderator: a mirror of users (account_type, status) kept by composite FKs, so a policy on `users` can
--                         ask "is the caller staff" without reading `users`. Filled by a trigger on users; one Admin (BR-021) by a unique index.
-- moderator_permissions   the Permission Keys an Admin assigned to a Moderator (deny by default). Admin-only keys cannot be stored.
-- has_permission(key)     SECURITY INVOKER, caller only: Admin = every key; Moderator = the key's row plus the companion key SRS §3.1 names; and only
--                         while the session is valid (session_guard: a revoked or stale session holds nothing).
-- audit_log               the append-only record of administrative actions. Nobody holds INSERT: rows are written only by the two SECURITY DEFINER
--                         functions below, in the same transaction as the action (rule 18). No UPDATE, DELETE or TRUNCATE.
-- report_reasons          the editable list of report reasons with the queue priority (BR-074); reports.reason references it.
-- reports                 gains the copy of the reported text, and the handling (resolution, handled_by, handler_note).
-- user_enforcements       one row per enforcement action; the ladder suggestion is computed by the database; the status change is applied and
--                         the Audit entry written in the same statement.
-- users                   gains suspended_until and the guarded update path; staff read accounts only on the admin screens (nestly.staff_view).
-- posts, comments         content moderation (hidden / removed / restored) by CONTENT_MODERATE; the author's own path to delete moderated content.
--
-- Two approved SECURITY DEFINER exceptions (rules 18 and 19), both owned by app_owner with a pinned search_path, reading only through
-- policies TO app_owner that are scoped to auth.uid() or to the one row the function has named:
--   audit_trigger()       the one trigger function that appends every Audit entry (so no role holds INSERT on audit_log and an entry cannot be forged);
--   reveal_post_author()  the audited read of the real author of an anonymous post (BR-062, AC-077).
--
-- The single Super Admin (BR-021) is created by Afik with supabase/bootstrap/03-super-admin.sql, never by the app.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261020300000_safety_admin_core.down.sql (refuses once a permission, an audit row, an enforcement or a handled report exists).
-- =====================================================================================================================

-- 1. staff_roles.
create table nestly.staff_roles (
  user_id        uuid        not null,
  account_type   text        not null,
  account_status text        not null default 'active',
  created_at     timestamptz not null default now(),
  constraint staff_roles_pkey primary key (user_id),
  constraint staff_roles_user_id_account_type_key unique (user_id, account_type),
  constraint staff_roles_account_type_check check (account_type in ('admin', 'moderator')),
  constraint staff_roles_user_id_account_type_fkey foreign key (user_id, account_type)
    references nestly.users (id, account_type) on delete cascade,
  constraint staff_roles_user_id_account_status_fkey foreign key (user_id, account_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

-- BR-021: one Admin.
create unique index staff_roles_single_admin_key on nestly.staff_roles (account_type) where account_type = 'admin';

-- Backfill: staff accounts that already exist (fixtures; an Admin created by hand). Constant-free; owner reads users through FORCE RLS lifted
-- for this transaction (the F2.4a pattern: put back before commit).
alter table nestly.users no force row level security;
insert into nestly.staff_roles (user_id, account_type, account_status)
  select u.id, u.account_type, u.status from nestly.users u where u.account_type in ('admin', 'moderator');
alter table nestly.users force row level security;

create function nestly.users_staff_mirror()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into nestly.staff_roles (user_id, account_type, account_status) values (new.id, new.account_type, new.status);
  return null;
end
$$;

revoke execute on function nestly.users_staff_mirror() from public;

create trigger users_staff_mirror
  after insert on nestly.users
  for each row when (new.account_type in ('admin', 'moderator'))
  execute function nestly.users_staff_mirror();

-- 2. moderator_permissions. The 14 assignable keys (FR-ADMIN-004); the Admin-only keys of §3.2 can never be a row.
create table nestly.moderator_permissions (
  user_id        uuid        not null,
  permission_key text        not null,
  moderator_type text        not null default 'moderator',
  granted_by     uuid        not null default auth.uid(),
  granted_at     timestamptz not null default now(),
  constraint moderator_permissions_pkey primary key (user_id, permission_key),
  constraint moderator_permissions_key_check check (permission_key in (
    'SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW', 'USER_WARN',
    'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS',
    'PRIVATE_GROUP_MODERATE')),
  constraint moderator_permissions_type_check check (moderator_type = 'moderator'),
  constraint moderator_permissions_user_id_fkey foreign key (user_id, moderator_type)
    references nestly.staff_roles (user_id, account_type) on delete cascade,
  constraint moderator_permissions_granted_by_fkey foreign key (granted_by)
    references nestly.users (id) on delete restrict
);

create index moderator_permissions_granted_by_idx on nestly.moderator_permissions (granted_by);

-- 3. The helpers. Caller-only (rule 16): they answer for auth.uid() and read only rows the caller's own policies already show.
create function nestly.caller_staff_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select sr.account_type from nestly.staff_roles sr
   where sr.user_id = auth.uid() and sr.account_status = 'active' and (select nestly.session_guard()) in ('ok', 'must_set')
$$;

create function nestly.has_permission(p_key text)
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
        'SPONSORED_PRODUCT_MANAGE', 'RECOVERY_LOCK_RELEASE')
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

revoke execute on function nestly.caller_staff_role() from public;
revoke execute on function nestly.has_permission(text) from public;
grant execute on function nestly.caller_staff_role() to authenticated;
grant execute on function nestly.has_permission(text) to authenticated;

-- 4. audit_log.
create table nestly.audit_log (
  id             uuid        not null default gen_random_uuid(),
  actor_id       uuid        not null default auth.uid(),
  actor_role     text        not null,
  permission_key text,
  action         text        not null,
  target_kind    text        not null,
  target_id      uuid,
  result         text        not null default 'success',
  reason         text,
  before_state   jsonb,
  after_state    jsonb,
  occurred_at    timestamptz not null default now(),
  constraint audit_log_pkey primary key (id),
  constraint audit_log_actor_role_check check (actor_role in ('admin', 'moderator')),
  constraint audit_log_action_check check (action ~ '^[a-z][a-z_]{2,59}$'),
  constraint audit_log_target_kind_check check (target_kind ~ '^[a-z][a-z_]{1,39}$'),
  constraint audit_log_result_check check (result in ('success', 'denied')),
  constraint audit_log_reason_check check (reason is null or (reason ~ '[^[:space:]]' and char_length(reason) <= 1000)),
  constraint audit_log_actor_id_fkey foreign key (actor_id) references nestly.users (id) on delete restrict
);

create index audit_log_occurred_at_idx on nestly.audit_log (occurred_at desc, id desc);
create index audit_log_actor_id_idx on nestly.audit_log (actor_id);
create index audit_log_target_idx on nestly.audit_log (target_kind, target_id);

create function nestly.audit_log_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit_log: append-only' using errcode = '42501';
end
$$;

revoke execute on function nestly.audit_log_append_only() from public;

create trigger audit_log_append_only
  before update or delete on nestly.audit_log
  for each row execute function nestly.audit_log_append_only();

create trigger audit_log_no_truncate
  before truncate on nestly.audit_log
  for each statement execute function nestly.audit_log_append_only();

-- 5. RLS, policies, grants. Every client policy TO authenticated; the app_owner ones belong to the two definer functions.
alter table nestly.staff_roles enable row level security, force row level security;
alter table nestly.moderator_permissions enable row level security, force row level security;
alter table nestly.audit_log enable row level security, force row level security;

-- A staff account reads its own row (the role and the status it was given); nothing reads another's, and nobody writes: the trigger on
-- users is the only writer, and it runs as the inserting role (an Admin created by the bootstrap script, never a runtime role).
create policy staff_roles_select_own on nestly.staff_roles
  for select to authenticated
  using (user_id = (select auth.uid()) and account_status = 'active');

-- A Moderator reads its own keys. The Admin reads and manages every Moderator's keys (FR-ADMIN-004; the screen is a later part). The Admin test
-- is written out, not has_permission(): that function reads this table, and a policy that calls it would recurse.
create policy moderator_permissions_select_own on nestly.moderator_permissions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy moderator_permissions_select_admin on nestly.moderator_permissions
  for select to authenticated
  using (exists (select 1 from nestly.staff_roles sr where sr.user_id = (select auth.uid()) and sr.account_type = 'admin' and sr.account_status = 'active'));

create policy moderator_permissions_insert_admin on nestly.moderator_permissions
  for insert to authenticated
  with check (exists (select 1 from nestly.staff_roles sr where sr.user_id = (select auth.uid()) and sr.account_type = 'admin' and sr.account_status = 'active')
    and granted_by = (select auth.uid()));

create policy moderator_permissions_delete_admin on nestly.moderator_permissions
  for delete to authenticated
  using (exists (select 1 from nestly.staff_roles sr where sr.user_id = (select auth.uid()) and sr.account_type = 'admin' and sr.account_status = 'active'));

-- The Audit Log. Read: Admin or AUDIT_LOG_VIEW. Insert: a staff member records its own action only.
create policy audit_log_select_viewer on nestly.audit_log
  for select to authenticated
  using ((select nestly.has_permission('AUDIT_LOG_VIEW')));

-- Nobody holds INSERT: the entries are appended by audit_trigger() and reveal_post_author() (SECURITY DEFINER, owner app_owner), which name the actor
-- themselves. The policy lets the owner role write only an entry naming the caller (rule 18).
create policy audit_log_insert_definer on nestly.audit_log
  for insert to app_owner
  with check (actor_id = (select auth.uid()));

-- What the two definer functions read, scoped to the caller (approved exceptions, rules 18 and 19): the staff role and keys of auth.uid(), and the
-- session state has_permission() and caller_staff_role() consult.
create policy staff_roles_select_definer on nestly.staff_roles
  for select to app_owner
  using (user_id = (select auth.uid()));

create policy moderator_permissions_select_definer on nestly.moderator_permissions
  for select to app_owner
  using (user_id = (select auth.uid()));

create policy identity_link_checks_select_definer on nestly.identity_link_checks
  for select to app_owner
  using (user_id = (select auth.uid()));

-- Staff read accounts: the Admin all, a Moderator with USER_VIEW (account type and status only; the users table holds nothing else). Only in a
-- transaction that has named the purpose in nestly.staff_view: every other service reads "the caller's own row" with no WHERE, and an Admin's
-- ordinary request must keep seeing exactly one row there.
create policy users_select_staff on nestly.users
  for select to authenticated
  using (pg_catalog.current_setting('nestly.staff_view', true) = 'on' and (select nestly.has_permission('USER_VIEW')));

revoke all on table nestly.staff_roles, nestly.moderator_permissions, nestly.audit_log from public, anon;
grant select on table nestly.staff_roles to authenticated;
grant select, delete on table nestly.moderator_permissions to authenticated;
grant insert (user_id, permission_key) on table nestly.moderator_permissions to authenticated;
grant select on table nestly.audit_log to authenticated;

-- 6. The one function that appends Audit entries from the tables' triggers (BR-026, rule 18). SECURITY DEFINER, owner app_owner, pinned search_path: the
--    Actor is auth.uid() with its staff role (nobody else's); the reason of the action travels in nestly.audit_reason. A caller who is no staff member
--    (the owner role: fixtures, bootstrap) leaves no entry. The triggers are created at the end of this file, once every table exists.
create function nestly.audit_trigger()
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
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

-- 7. Comments.
comment on table nestly.staff_roles is
  'Admin and Moderator accounts (BR-021, FR-ADMIN-004): a mirror of users (account_type, status) kept by composite FKs and filled by the trigger on users, so policies can ask "is the caller staff" without reading users. A staff member reads its own row only.';
comment on column nestly.staff_roles.user_id is 'The staff account (= users.id).';
comment on column nestly.staff_roles.account_type is 'admin or moderator; equal to users.account_type by the composite FK.';
comment on column nestly.staff_roles.account_status is 'Copy of users.status (composite FK, ON UPDATE CASCADE): a suspended or banned staff account holds no permission.';
comment on column nestly.staff_roles.created_at is 'When the mirror row was created.';
comment on table nestly.moderator_permissions is
  'The Permission Keys of SRS §3.1 an Admin assigned to a Moderator (FR-ADMIN-004). Deny by default; the Admin-only keys of §3.2 cannot be stored (moderator_permissions_key_check, AC-031). Each change is audited by trigger with Before/After.';
comment on column nestly.moderator_permissions.user_id is 'The Moderator.';
comment on column nestly.moderator_permissions.permission_key is 'One of the 14 assignable keys.';
comment on column nestly.moderator_permissions.moderator_type is 'Always moderator; with the composite FK, only a Moderator account can hold a key.';
comment on column nestly.moderator_permissions.granted_by is 'The Admin who assigned it (database default auth.uid()).';
comment on column nestly.moderator_permissions.granted_at is 'When the key was assigned.';
comment on table nestly.audit_log is
  'FR-ADMIN-005, BR-026: the append-only record of administrative actions (Actor, Role, Permission, Action, Target, Timestamp, Result, reason; Before/After for permission changes). Appended in the same transaction as the action; never changed or deleted (trigger and no grant).';
comment on column nestly.audit_log.actor_id is 'The staff member (database default auth.uid(); the INSERT policy refuses any other).';
comment on column nestly.audit_log.actor_role is 'admin or moderator, as the caller''s staff role at the time.';
comment on column nestly.audit_log.permission_key is 'The Permission Key the action used, when one applies.';
comment on column nestly.audit_log.action is 'What was done, a short lower-case code (user_ban, content_removed, author_revealed ...).';
comment on column nestly.audit_log.target_kind is 'What it was done to (user, post, comment, report ...).';
comment on column nestly.audit_log.target_id is 'The target''s id, when it has one.';
comment on column nestly.audit_log.result is 'success or denied.';
comment on column nestly.audit_log.reason is 'The Actor''s stated reason, when the action requires one; at most 1000 characters.';
comment on column nestly.audit_log.before_state is 'State before, for a permission or configuration change.';
comment on column nestly.audit_log.after_state is 'State after, for a permission or configuration change.';
comment on column nestly.audit_log.occurred_at is 'Database clock.';
comment on function nestly.users_staff_mirror() is 'SECURITY INVOKER. After insert of an admin or moderator users row: writes its staff_roles mirror.';
comment on function nestly.caller_staff_role() is 'SECURITY INVOKER, caller only: admin or moderator while the account is active, else NULL.';
comment on function nestly.has_permission(text) is
  'SECURITY INVOKER, caller only (rule 16): true for an active Admin on any known key; for a Moderator only when the key is assigned and its companion key is too (SUPPORT_HANDLE needs SUPPORT_VIEW; USER_WARN, USER_SUSPEND and USER_BAN need USER_VIEW; PRIVATE_GROUP_MODERATE needs REPORTS_VIEW). Admin-only keys are never true for a Moderator. Deny by default.';
comment on function nestly.audit_log_append_only() is 'SECURITY INVOKER. Refuses every UPDATE and DELETE of audit_log.';
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move or an enforcement: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';
comment on policy staff_roles_select_own on nestly.staff_roles is 'A staff account reads its own active role row; no policy shows another account''s.';
comment on policy moderator_permissions_select_own on nestly.moderator_permissions is 'A Moderator reads its own keys.';
comment on policy moderator_permissions_select_admin on nestly.moderator_permissions is 'The Admin (MODERATOR_MANAGE) reads every Moderator''s keys.';
comment on policy moderator_permissions_insert_admin on nestly.moderator_permissions is 'Only the Admin assigns a key; granted_by must be the Admin.';
comment on policy moderator_permissions_delete_admin on nestly.moderator_permissions is 'Only the Admin revokes a key.';
comment on policy audit_log_select_viewer on nestly.audit_log is 'The Admin, or a Moderator with AUDIT_LOG_VIEW, reads the log (view only).';
comment on policy audit_log_insert_definer on nestly.audit_log is 'Only the owner role (the two definer functions) appends, naming the caller as actor; no runtime role holds INSERT (rule 18).';
comment on policy staff_roles_select_definer on nestly.staff_roles is 'Approved exception: the definer functions read the caller''s own staff row.';
comment on policy moderator_permissions_select_definer on nestly.moderator_permissions is 'Approved exception: the definer functions read the caller''s own keys.';
comment on policy identity_link_checks_select_definer on nestly.identity_link_checks is 'Approved exception: session_guard() read by the definer functions for the caller''s own row.';
comment on policy users_select_staff on nestly.users is 'Staff read accounts: the Admin all, a Moderator with USER_VIEW (SRS §3.1), only in a transaction that set nestly.staff_view to on (the admin screens); other requests see the own row only. The function reads staff_roles and moderator_permissions only, never users.';
comment on index nestly.moderator_permissions_granted_by_idx is 'The RESTRICT check on a users delete.';
comment on index nestly.audit_log_occurred_at_idx is 'The log screen: newest first.';
comment on index nestly.audit_log_actor_id_idx is 'The RESTRICT check on a users delete; one actor''s actions.';
comment on index nestly.audit_log_target_idx is 'The history of one target.';

-- Part 2. report_reasons (FR-ADMIN-007). Seeded with the eight reasons of FR-MOD-001 and their priorities (BR-074) before RLS is enabled.
create table nestly.report_reasons (
  key        text        not null,
  label      text        not null,
  priority   smallint    not null,
  sort_order integer     not null,
  is_active  boolean     not null default true,
  is_core    boolean     not null default false,
  updated_at timestamptz not null default now(),
  constraint report_reasons_pkey primary key (key),
  constraint report_reasons_key_check check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint report_reasons_label_check check (char_length(btrim(label)) between 2 and 60),
  constraint report_reasons_priority_check check (priority between 1 and 4),
  constraint report_reasons_sort_order_check check (sort_order between 0 and 1000),
  constraint report_reasons_core_check check (not is_core or is_active)
);

insert into nestly.report_reasons (key, label, priority, sort_order, is_core) values
  ('child_safety',           'תוכן שמסכן ילד',                       1, 10, true),
  ('harassment',             'הטרדה או בריונות',                     2, 20, false),
  ('sexual_violent_hateful', 'תוכן מיני, אלים או מסית',              2, 30, false),
  ('personal_information',   'חשיפת פרטים אישיים',                   2, 40, false),
  ('medical_misinformation', 'מידע רפואי מסוכן או מטעה',             3, 50, false),
  ('impersonation',          'התחזות',                               3, 60, false),
  ('spam',                   'ספאם או פרסום לא קשור',                4, 70, false),
  ('other',                  'אחר',                                  4, 80, true);

alter table nestly.report_reasons enable row level security, force row level security;

create policy report_reasons_select_active_account on nestly.report_reasons
  for select to authenticated
  using ((select nestly.is_active_account()));

create policy report_reasons_insert_config on nestly.report_reasons
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('COMMUNITY_CONFIG')) and not is_core);

create policy report_reasons_update_config on nestly.report_reasons
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('COMMUNITY_CONFIG')))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('COMMUNITY_CONFIG')));

revoke all on table nestly.report_reasons from public, anon;
grant select on table nestly.report_reasons to authenticated;
grant insert (key, label, priority, sort_order, is_active) on table nestly.report_reasons to authenticated;
grant update (label, priority, sort_order, is_active) on table nestly.report_reasons to authenticated;

create function nestly.report_reasons_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.key <> old.key or new.is_core <> old.is_core then
      raise exception 'report_reasons: the key is fixed' using errcode = '42501';
    end if;
    -- "content endangering a child" keeps the top priority and cannot be switched off; "other" cannot be switched off (VAL-048)
    if old.key = 'child_safety' and new.priority <> 1 then
      raise exception 'report_reasons: child_safety keeps priority 1' using errcode = '23514';
    end if;
    if old.is_core and not new.is_active then
      raise exception 'report_reasons: a core reason stays active' using errcode = '23514';
    end if;
    new.updated_at := pg_catalog.now();
  end if;
  -- priority 1 is "content endangering a child" and nothing else (BR-074, AC-106)
  if new.priority = 1 and new.key <> 'child_safety' then
    raise exception 'report_reasons: priority 1 belongs to child_safety' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke execute on function nestly.report_reasons_guard() from public;

create trigger report_reasons_guard
  before insert or update on nestly.report_reasons
  for each row execute function nestly.report_reasons_guard();

-- 2. reports: the reason now references the list; the copy of the reported text; the handling.
alter table nestly.reports drop constraint reports_reason_check;
alter table nestly.reports
  add constraint reports_reason_fkey foreign key (reason) references nestly.report_reasons (key);

alter table nestly.reports
  add column target_text   text,
  add column resolution    text,
  add column handled_by    uuid,
  add column handler_note  text;

alter table nestly.reports
  add constraint reports_resolution_check check (resolution in ('dismissed', 'action_taken')),
  add constraint reports_handler_note_check check (handler_note is null or (handler_note ~ '[^[:space:]]' and char_length(handler_note) <= 1000)),
  add constraint reports_handled_check check (
    (resolution is null) = (handled_by is null) and (resolution is null or status = 'handled')),
  add constraint reports_handled_by_fkey foreign key (handled_by) references nestly.users (id) on delete restrict;

create index reports_handled_by_idx on nestly.reports (handled_by) where handled_by is not null;
create index reports_open_idx on nestly.reports (created_at, id) where status = 'open';

-- Only an active reason may be chosen for a new report.
drop policy reports_insert_reporter on nestly.reports;
create policy reports_insert_reporter on nestly.reports
  for insert to authenticated
  with check ((select nestly.is_active_account()) and reporter_id = (select auth.uid()) and status = 'open'
    and exists (select 1 from nestly.report_reasons rr where rr.key = reports.reason and rr.is_active));

-- The copy of the reported text (FR-MOD-001, Afik 18.10): taken at the report, read under the reporter's own RLS, so a post or comment the
-- reporter cannot read gives nothing here (reports_insert_check has already refused it). Fires after reports_insert_check (name order).
create function nestly.reports_insert_snapshot()
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

revoke execute on function nestly.reports_insert_snapshot() from public;

create trigger reports_insert_snapshot
  before insert on nestly.reports
  for each row execute function nestly.reports_insert_snapshot();

-- Staff read reports (REPORTS_VIEW; the Admin always) and close them. Handling needs a moderation key as well (AC-022).
create policy reports_select_staff on nestly.reports
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')));

create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and (case target_kind
           when 'user' then ((select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
                             or (select nestly.has_permission('USER_BAN')))
           else (select nestly.has_permission('CONTENT_MODERATE')) end))
  with check (status = 'handled');

grant update (status, closed_at, resolution, handled_by, handler_note) on table nestly.reports to authenticated;

create function nestly.reports_handle_guard()
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

revoke execute on function nestly.reports_handle_guard() from public;

create trigger reports_handle_guard
  before update of status, closed_at, resolution, handled_by, handler_note on nestly.reports
  for each row execute function nestly.reports_handle_guard();

-- 3. Staff read the content that was reported (and nothing else), and the names they need to act on it.
create policy posts_select_staff on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r where r.post_id = posts.id));

create policy comments_select_staff on nestly.comments
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r where r.comment_id = comments.id));

-- Names, like accounts, only on the admin screens (nestly.staff_view): no ordinary request lists names (NFR-SEC-006 (2)); the admin user list needs a search text.
create policy regular_names_select_staff on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account()) and pg_catalog.current_setting('nestly.staff_view', true) = 'on'
    and ((select nestly.has_permission('USER_VIEW')) or (select nestly.has_permission('REPORTS_VIEW'))));

-- 4. Content moderation (CONTENT_MODERATE): active <-> hidden <-> removed, on reported content only. The author's delete stays the author's.
create policy posts_update_staff on nestly.posts
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed')
    and exists (select 1 from nestly.reports r where r.post_id = posts.id))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed'));

create policy comments_update_staff on nestly.comments
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed')
    and exists (select 1 from nestly.reports r where r.comment_id = comments.id))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed'));

-- content_hold (replaced): the author may go active, hidden or removed -> deleted (the policies decide whose content); staff may move
-- among active, hidden and removed with CONTENT_MODERATE and a stated reason (nestly.audit_reason, rule 18). Everything else is refused.
create or replace function nestly.content_hold()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if current_user = 'authenticated' then
    if new.status = 'deleted' and old.status in ('active', 'hidden', 'removed') then
      null;
    elsif old.status in ('active', 'hidden', 'removed') and new.status in ('active', 'hidden', 'removed') then
      if not (select nestly.has_permission('CONTENT_MODERATE')) then
        raise exception 'content: moderation needs CONTENT_MODERATE' using errcode = '42501';
      end if;
      if new.status <> 'active' and coalesce(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '') = '' then
        raise exception 'content: a moderation action needs a reason' using errcode = 'NS011';
      end if;
    else
      raise exception 'content: this status change is not allowed' using errcode = '42501';
    end if;
  end if;
  if new.status = 'deleted' then
    new.held_at := now();
    new.held_until := now() + interval '2160 hours';
    new.held_xact := pg_catalog.pg_current_xact_id();
  else
    new.held_at := null;
    new.held_until := null;
    new.held_xact := null;
  end if;
  return new;
end
$$;

-- Staff never edit what an author wrote.
create function nestly.reject_staff_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (select nestly.caller_staff_role()) is not null then
    raise exception 'content: staff do not edit content' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function nestly.reject_staff_edit() from public;

create trigger posts_reject_staff_edit
  before update of audience, body, stage_tag on nestly.posts
  for each row execute function nestly.reject_staff_edit();

-- 5. The author deletes what a moderator hid or removed (the debt). The author cannot read such a row, so the delete found nothing. The two
--    delete functions below name the one row they are deleting in nestly.own_delete (transaction-local); these policies open that one row,
--    and only to its author, for the delete and for the hold (BR-080) that follows when a report is still open.
create policy posts_select_own_moderated on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

create policy posts_update_own_moderated on nestly.posts
  for update to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))))
  with check (status = 'deleted'
    and (author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

create policy comments_select_own_moderated on nestly.comments
  for select to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or (author_id is null
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

create policy comments_update_own_moderated on nestly.comments
  for update to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or (author_id is null
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))))
  with check (status = 'deleted'
    and (author_id = (select auth.uid())
      or (author_id is null
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

create or replace function nestly.delete_post(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
  violated text;
begin
  perform pg_catalog.set_config('nestly.own_delete', p_id::text, true);
  begin
    delete from nestly.posts where id = p_id;
    get diagnostics n = row_count;
    perform pg_catalog.set_config('nestly.own_delete', '', true);
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.posts set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
  perform pg_catalog.set_config('nestly.own_delete', '', true);
  return n;
end
$$;

create or replace function nestly.delete_comment(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
  violated text;
begin
  perform pg_catalog.set_config('nestly.own_delete', p_id::text, true);
  begin
    delete from nestly.comments where id = p_id;
    get diagnostics n = row_count;
    perform pg_catalog.set_config('nestly.own_delete', '', true);
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.comments set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
  perform pg_catalog.set_config('nestly.own_delete', '', true);
  return n;
end
$$;

-- 6. The audited reveal of an anonymous author (BR-062, AC-077; rule 19). Only from the handling of a report on that post, with REPORTS_VIEW
--    and CONTENT_MODERATE (the Admin has both). The function names the post and the author in transaction-local settings; the two policies
--    below open exactly that row to a caller who holds both keys; the Audit entry is written in the same call.
create policy post_authors_select_reveal on nestly.post_authors
  for select to app_owner
  using (post_id::text = pg_catalog.current_setting('nestly.reveal_post', true));

create policy regular_names_select_reveal on nestly.regular_names
  for select to app_owner
  using (user_id::text = pg_catalog.current_setting('nestly.reveal_user', true));

create policy reports_select_reveal on nestly.reports
  for select to app_owner
  using (post_id::text = pg_catalog.current_setting('nestly.reveal_post', true));

-- SECURITY DEFINER, owner app_owner, pinned search_path (approved exception, rule 19): the caller's keys and session are checked first (has_permission()
-- reads through the policies TO app_owner above, scoped to auth.uid()); only an OPEN report on that post allows it; the author's row and name are readable
-- to the owner role only while this function has named them; the Audit entry, with the report's id, is written in the same call.
create function nestly.reveal_post_author(p_post uuid)
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

revoke execute on function nestly.reveal_post_author(uuid) from public;
grant execute on function nestly.reveal_post_author(uuid) to authenticated;

-- 7. users: the end of a suspension, and the guarded update path.
alter table nestly.users add column suspended_until timestamptz;
alter table nestly.users
  add constraint users_suspended_until_check check (suspended_until is null or status = 'suspended');

create function nestly.users_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if (new.id, new.account_type, new.created_at) is distinct from (old.id, old.account_type, old.created_at) then
    raise exception 'users: immutable column' using errcode = '42501';
  end if;
  if new.status = old.status and new.suspended_until is not distinct from old.suspended_until then
    return new;
  end if;
  if new.status <> 'suspended' then
    new.suspended_until := null;
  end if;
  if current_user = 'authenticated' then
    if me = old.id then
      -- an account ends its own suspension once the end time has passed, and does nothing else to itself
      if not (old.status = 'suspended' and old.suspended_until is not null and old.suspended_until <= pg_catalog.now()
              and new.status = 'active') then
        raise exception 'users: an account cannot change its own status' using errcode = '42501';
      end if;
    else
      if old.account_type = 'admin' or (old.account_type = 'moderator' and (select nestly.caller_staff_role()) is distinct from 'admin') then
        raise exception 'users: this account cannot be acted on' using errcode = '42501';
      end if;
      -- never without the record: the same transaction holds this Actor's enforcement row for this account and this kind of change
      if not exists (
        select 1 from nestly.user_enforcements e
         where e.user_id = new.id and e.actor_id = me and e.created_at = pg_catalog.now()
           and e.kind = any (case new.status when 'suspended' then array['suspension'] when 'banned' then array['ban']
                                 else array['reinstate', 'unban'] end)
           and (new.status <> 'suspended' or e.suspended_until is not distinct from new.suspended_until)) then
        raise exception 'users: a status change needs its enforcement record' using errcode = '42501';
      end if;
      if new.status = 'suspended' and old.status in ('active', 'suspended') then
        if not (select nestly.has_permission('USER_SUSPEND')) or new.suspended_until is null or new.suspended_until <= pg_catalog.now() then
          raise exception 'users: suspension refused' using errcode = '42501';
        end if;
      elsif new.status = 'active' and old.status = 'suspended' then
        if not (select nestly.has_permission('USER_SUSPEND')) then
          raise exception 'users: reinstatement refused' using errcode = '42501';
        end if;
      elsif (new.status = 'banned' and old.status in ('active', 'suspended')) or (new.status = 'active' and old.status = 'banned') then
        if not (select nestly.has_permission('USER_BAN')) then
          raise exception 'users: ban or unban refused' using errcode = '42501';
        end if;
      else
        raise exception 'users: this status change is not allowed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end
$$;

revoke execute on function nestly.users_status_guard() from public;

create trigger users_status_guard
  before update on nestly.users
  for each row execute function nestly.users_status_guard();

create policy users_update_staff on nestly.users
  for update to authenticated
  using (id <> (select auth.uid())
    and ((select nestly.has_permission('USER_SUSPEND')) or (select nestly.has_permission('USER_BAN')))
    and (account_type in ('regular', 'professional')
      or (account_type = 'moderator' and (select nestly.caller_staff_role()) = 'admin')))
  with check (id <> (select auth.uid()));

create policy users_update_own_expired_suspension on nestly.users
  for update to authenticated
  using (id = (select auth.uid()) and status = 'suspended' and suspended_until is not null and suspended_until <= now())
  with check (id = (select auth.uid()) and status = 'active');

grant update (status, suspended_until) on table nestly.users to authenticated;

-- 8. user_enforcements (FR-MOD-002, BR-074).
create table nestly.user_enforcements (
  id                uuid        not null default gen_random_uuid(),
  user_id           uuid        not null,
  actor_id          uuid        not null default auth.uid(),
  kind              text        not null,
  reason            text        not null,
  duration_hours    integer,
  suspended_until   timestamptz,
  report_id         uuid,
  is_child_safety   boolean     not null default false,
  suggested_kind    text,
  suggested_hours   integer,
  is_step_skipped   boolean     not null default false,
  status_before     text,
  created_at        timestamptz not null default now(),
  constraint user_enforcements_pkey primary key (id),
  constraint user_enforcements_kind_check check (kind in ('warning', 'suspension', 'reinstate', 'ban', 'unban')),
  constraint user_enforcements_reason_check check (reason ~ '[^[:space:]]' and char_length(reason) <= 1000),
  constraint user_enforcements_duration_check check (
    (kind = 'suspension') = (duration_hours is not null) and (duration_hours is null or duration_hours between 1 and 8760)),
  constraint user_enforcements_until_check check ((kind = 'suspension') = (suspended_until is not null)),
  constraint user_enforcements_child_safety_check check (not is_child_safety or kind = 'ban'),
  constraint user_enforcements_status_before_check check (status_before in ('active', 'suspended', 'banned')),
  constraint user_enforcements_suggested_kind_check check (suggested_kind in ('warning', 'suspension', 'ban')),
  constraint user_enforcements_user_id_fkey foreign key (user_id) references nestly.users (id) on delete cascade,
  constraint user_enforcements_actor_id_fkey foreign key (actor_id) references nestly.users (id) on delete restrict,
  constraint user_enforcements_report_id_fkey foreign key (report_id) references nestly.reports (id) on delete set null
);

create index user_enforcements_user_id_created_at_idx on nestly.user_enforcements (user_id, created_at desc);
create index user_enforcements_actor_id_idx on nestly.user_enforcements (actor_id);
create index user_enforcements_report_id_idx on nestly.user_enforcements (report_id) where report_id is not null;

-- BEFORE INSERT: the ladder (BR-074) from the account's own history in the last 12 months — a warning or a suspension counts one, a ban counts
-- the whole ladder — suggests warning, 24 hours, 7 days, 30 days, ban. A different choice is recorded as a skipped step (the 72-hour suspension
-- and other durations are outside the ladder). The end time is the database's clock plus the duration.
create function nestly.user_enforcements_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  select coalesce(sum(case e.kind when 'warning' then 1 when 'suspension' then 1 when 'ban' then 4 else 0 end), 0) into v_count
    from nestly.user_enforcements e
   where e.user_id = new.user_id and e.created_at > pg_catalog.now() - interval '12 months';
  new.suggested_kind := case when v_count = 0 then 'warning' when v_count <= 3 then 'suspension' else 'ban' end;
  new.suggested_hours := case v_count when 1 then 24 when 2 then 168 when 3 then 720 else null end;
  if new.kind = 'suspension' then
    new.suspended_until := pg_catalog.now() + pg_catalog.make_interval(hours => new.duration_hours);
  end if;
  -- any step other than the suggested one is recorded as a skip, the 72-hour option and every other length included (BR-074, AC-107)
  new.is_step_skipped := case
    when new.kind in ('reinstate', 'unban') then false
    when new.kind <> new.suggested_kind then true
    when new.kind = 'suspension' then new.duration_hours is distinct from new.suggested_hours
    else false end;
  select u.status into new.status_before from nestly.users u where u.id = new.user_id;
  -- the child-safety mark (AC-110) belongs to a ban that comes from a report with that reason
  if new.is_child_safety and not exists (select 1 from nestly.reports r where r.id = new.report_id and r.reason = 'child_safety') then
    raise exception 'enforcement: the child-safety mark needs a child-safety report' using errcode = '23514';
  end if;
  return new;
end
$$;

-- AFTER INSERT: the status change (the Audit entry is audit_trigger()'s, a later AFTER trigger of the same statement). A change that does not apply (unban of an account that is not
-- banned ...) rolls the whole statement back.
create function nestly.user_enforcements_apply()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer := 1;
begin
  if current_user <> 'authenticated' then
    return null; -- the owner role (fixtures) writes history only; every runtime action applies and is audited
  end if;
  if new.kind = 'suspension' then
    update nestly.users set status = 'suspended', suspended_until = new.suspended_until
     where id = new.user_id and status in ('active', 'suspended');
    get diagnostics n = row_count;
  elsif new.kind = 'ban' then
    update nestly.users set status = 'banned' where id = new.user_id and status in ('active', 'suspended');
    get diagnostics n = row_count;
  elsif new.kind = 'unban' then
    update nestly.users set status = 'active' where id = new.user_id and status = 'banned';
    get diagnostics n = row_count;
  elsif new.kind = 'reinstate' then
    update nestly.users set status = 'active' where id = new.user_id and status = 'suspended';
    get diagnostics n = row_count;
  end if;
  if n = 0 then
    raise exception 'enforcement: the account is not in a state this action applies to' using errcode = 'NS013';
  end if;
  return null;
end
$$;

revoke execute on function nestly.user_enforcements_prepare() from public;
revoke execute on function nestly.user_enforcements_apply() from public;

create trigger user_enforcements_prepare
  before insert on nestly.user_enforcements
  for each row execute function nestly.user_enforcements_prepare();

create trigger user_enforcements_apply
  after insert on nestly.user_enforcements
  for each row execute function nestly.user_enforcements_apply();

alter table nestly.user_enforcements enable row level security, force row level security;

-- Staff with USER_VIEW read the history; the account reads its own (a warning is addressed to it).
create policy user_enforcements_select_staff on nestly.user_enforcements
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('USER_VIEW')));

create policy user_enforcements_select_own on nestly.user_enforcements
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

-- Never without an Actor; the key depends on the action; never on oneself; a Moderator never on an Admin or a Moderator.
create policy user_enforcements_insert_staff on nestly.user_enforcements
  for insert to authenticated
  with check ((select nestly.is_active_account()) and actor_id = (select auth.uid()) and user_id <> (select auth.uid())
    and (select case kind
          when 'warning' then nestly.has_permission('USER_WARN')
          when 'suspension' then nestly.has_permission('USER_SUSPEND')
          when 'reinstate' then nestly.has_permission('USER_SUSPEND')
          else nestly.has_permission('USER_BAN') end)
    and exists (select 1 from nestly.users u
                 where u.id = user_enforcements.user_id
                   and (u.account_type in ('regular', 'professional')
                     or (u.account_type = 'moderator' and (select nestly.caller_staff_role()) = 'admin'))));

revoke all on table nestly.user_enforcements from public, anon;
grant select on table nestly.user_enforcements to authenticated;
grant insert (user_id, kind, reason, duration_hours, report_id, is_child_safety) on table nestly.user_enforcements to authenticated;

-- Every Audit entry of a table's action comes from audit_trigger(): AFTER, so a refused action leaves none. Names order them after the other triggers.
create trigger moderator_permissions_audit
  after insert or delete on nestly.moderator_permissions
  for each row execute function nestly.audit_trigger();

create trigger report_reasons_audit
  after insert or update on nestly.report_reasons
  for each row execute function nestly.audit_trigger();

create trigger reports_audit
  after update of status on nestly.reports
  for each row
  when (old.status = 'open' and new.status = 'handled')
  execute function nestly.audit_trigger();

create trigger posts_moderation_audit
  after update of status on nestly.posts
  for each row
  when (old.status is distinct from new.status and old.status <> 'deleted' and new.status <> 'deleted')
  execute function nestly.audit_trigger();

create trigger comments_moderation_audit
  after update of status on nestly.comments
  for each row
  when (old.status is distinct from new.status and old.status <> 'deleted' and new.status <> 'deleted')
  execute function nestly.audit_trigger();

create trigger user_enforcements_audit
  after insert on nestly.user_enforcements
  for each row execute function nestly.audit_trigger();

-- 9. Comments.
comment on table nestly.report_reasons is
  'FR-MOD-001, FR-ADMIN-007, BR-074: the list of report reasons with the queue priority (1 highest: child safety). Edited by COMMUNITY_CONFIG (label, priority, order, active; a new reason); child_safety keeps priority 1 and child_safety and other stay active. Every change is audited.';
comment on column nestly.report_reasons.key is 'The stable identifier stored in reports.reason; never changes.';
comment on column nestly.report_reasons.label is 'The Hebrew text the reporter sees, 2-60 characters.';
comment on column nestly.report_reasons.priority is 'Queue priority 1-4 (BR-074); 1 is shown first.';
comment on column nestly.report_reasons.sort_order is 'The order in the report window.';
comment on column nestly.report_reasons.is_active is 'Whether a new report may use it; existing reports keep theirs.';
comment on column nestly.report_reasons.is_core is 'child_safety and other: cannot be switched off.';
comment on column nestly.report_reasons.updated_at is 'When the row last changed.';
comment on column nestly.reports.target_text is 'The reported text as it was when reported (post or comment body); NULL for a user report (Afik 18.10: the report keeps a copy).';
comment on column nestly.reports.resolution is 'How staff closed the report: dismissed or action_taken. NULL while open or expired.';
comment on column nestly.reports.handled_by is 'The staff member who closed it (set by the database).';
comment on column nestly.reports.handler_note is 'The handler''s note, at most 1000 characters; also the Audit reason.';
comment on table nestly.user_enforcements is
  'FR-MOD-002, BR-074: one row per enforcement action on an account (warning, suspension, reinstate, ban, unban), with the Actor, the reason, the database-computed ladder suggestion and whether the step was skipped. Inserting it applies the status change and writes the Audit entry; there is no automatic enforcement.';
comment on column nestly.user_enforcements.user_id is 'The account acted on.';
comment on column nestly.user_enforcements.actor_id is 'The staff member (database default auth.uid()); an action never exists without one (AC-107).';
comment on column nestly.user_enforcements.kind is 'warning, suspension, reinstate (end a suspension early), ban, unban.';
comment on column nestly.user_enforcements.reason is 'Required, at most 1000 characters; recorded in the Audit Log.';
comment on column nestly.user_enforcements.duration_hours is 'Suspension length in hours (1-8760); the ladder steps are 24, 168, 720; 72 is the extra option.';
comment on column nestly.user_enforcements.suspended_until is 'The end of the suspension: the database clock at insert plus duration_hours.';
comment on column nestly.user_enforcements.report_id is 'The report this action came from, when it did.';
comment on column nestly.user_enforcements.is_child_safety is 'An immediate ban for content endangering a child, whatever the ladder says (AC-110).';
comment on column nestly.user_enforcements.suggested_kind is 'The ladder''s suggestion at the time (BR-074): warning, suspension or ban.';
comment on column nestly.user_enforcements.suggested_hours is 'The suggested suspension length, when the suggestion is a suspension.';
comment on column nestly.user_enforcements.is_step_skipped is 'The Actor chose a different step than the suggestion (kept in the Audit entry with the reason).';
comment on column nestly.user_enforcements.created_at is 'Database clock; the ladder counts the last 12 months.';
comment on column nestly.users.suspended_until is 'The end of a suspension; NULL otherwise (or a suspension with no end). Once passed, the account ends it by itself the next time it asks for its state (users_update_own_expired_suspension).';
comment on function nestly.report_reasons_guard() is 'SECURITY INVOKER. Before insert or update on report_reasons: the key is fixed, priority 1 is child_safety''s alone, core reasons stay active.';
comment on function nestly.reports_insert_snapshot() is 'SECURITY INVOKER. Before insert on reports: copies the reported post or comment text, read under the reporter''s RLS.';
comment on function nestly.reports_handle_guard() is 'SECURITY INVOKER. Before update on reports by a user: only open -> handled with a resolution; sets handled_by and closed_at.';
comment on function nestly.reject_staff_edit() is 'SECURITY INVOKER. Before an edit of a post''s audience, body or tag by a staff account: refused.';
comment on function nestly.reveal_post_author(uuid) is 'SECURITY DEFINER (approved exception, rule 19), owner app_owner, pinned search_path. Returns the real author of an anonymous post to a caller with REPORTS_VIEW and CONTENT_MODERATE and a valid session, only while an OPEN report on that post exists, and appends author_revealed (with the report id) in the same call.';
comment on function nestly.users_status_guard() is 'SECURITY INVOKER. Before a status change on users: staff by Permission Key and target type, an account its own expired suspension; clears suspended_until when the status is not suspended.';
comment on function nestly.user_enforcements_prepare() is 'SECURITY INVOKER. Before insert: computes the ladder suggestion from the last 12 months, the suspension end, and whether the Actor skipped the suggested step.';
comment on function nestly.user_enforcements_apply() is 'SECURITY INVOKER. After insert: applies the status change (NS013 when it does not apply). The Audit entry is audit_trigger()''s.';
comment on function nestly.content_hold() is 'SECURITY INVOKER. Before update of status: the author may go active, hidden or removed to deleted (held 90 days); staff move among active, hidden and removed with CONTENT_MODERATE and a reason; anything else is refused. A change to deleted stamps the held columns.';
comment on function nestly.delete_post(uuid) is 'SECURITY INVOKER. Deletes the caller''s post under RLS, naming it in nestly.own_delete so a post a moderator hid or removed can be deleted by its author; when an open report refuses it, holds it instead. Returns 1 for either, 0 for a post that is not the caller''s.';
comment on function nestly.delete_comment(uuid) is 'SECURITY INVOKER. As delete_post, for a comment.';
comment on policy report_reasons_select_active_account on nestly.report_reasons is 'Every active account reads the list (the report window needs it).';
comment on policy report_reasons_insert_config on nestly.report_reasons is 'COMMUNITY_CONFIG adds a (non-core) reason.';
comment on policy report_reasons_update_config on nestly.report_reasons is 'COMMUNITY_CONFIG edits label, priority, order and active.';
comment on policy reports_select_staff on nestly.reports is 'REPORTS_VIEW (the Admin always) reads every report.';
comment on policy reports_update_staff on nestly.reports is 'An open report is closed by staff with REPORTS_VIEW and at least one moderation key (AC-022).';
comment on policy reports_insert_reporter on nestly.reports is 'An active account files its own open report with an active reason.';
comment on policy posts_select_staff on nestly.posts is 'REPORTS_VIEW reads a post that has a report, in any status (including held and moderated).';
comment on policy comments_select_staff on nestly.comments is 'REPORTS_VIEW reads a comment that has a report, in any status.';
comment on policy regular_names_select_staff on nestly.regular_names is 'USER_VIEW or REPORTS_VIEW reads names, only on the admin screens (nestly.staff_view).';
comment on policy posts_update_staff on nestly.posts is 'CONTENT_MODERATE moves a reported post among active, hidden and removed (content_hold requires a reason; the audit trigger records it).';
comment on policy comments_update_staff on nestly.comments is 'CONTENT_MODERATE moves a reported comment among active, hidden and removed.';
comment on policy posts_select_own_moderated on nestly.posts is 'The author reads their own hidden or removed post only while delete_post has named it in nestly.own_delete (the delete right over moderated content).';
comment on policy posts_update_own_moderated on nestly.posts is 'The author holds (status deleted) their own hidden or removed post while delete_post has named it, when an open report keeps the row.';
comment on policy comments_select_own_moderated on nestly.comments is 'As posts_select_own_moderated, for a comment.';
comment on policy comments_update_own_moderated on nestly.comments is 'As posts_update_own_moderated, for a comment.';
comment on policy post_authors_select_reveal on nestly.post_authors is 'Approved exception: the owner role reads the separation row of the one post reveal_post_author has named (rule 19, AC-077).';
comment on policy reports_select_reveal on nestly.reports is 'Approved exception: the owner role reads the reports of the one post reveal_post_author has named.';
comment on policy regular_names_select_reveal on nestly.regular_names is 'Approved exception: the owner role reads the name of the one author reveal_post_author has named.';
comment on policy users_update_staff on nestly.users is 'Staff with USER_SUSPEND or USER_BAN change the status of a Regular or Professional account (an Admin also a Moderator), never their own; users_status_guard decides which change needs which key.';
comment on policy users_update_own_expired_suspension on nestly.users is 'An account whose suspension end has passed returns itself to active.';
comment on policy user_enforcements_select_staff on nestly.user_enforcements is 'USER_VIEW (the Admin always) reads the enforcement history.';
comment on policy user_enforcements_select_own on nestly.user_enforcements is 'An active account reads the actions taken on itself.';
comment on policy user_enforcements_insert_staff on nestly.user_enforcements is 'Staff record an action naming themselves, with the key the action needs, on another account that is not an Admin (a Moderator: not a Moderator either).';
comment on index nestly.reports_handled_by_idx is 'The RESTRICT check on a users delete.';
comment on index nestly.reports_open_idx is 'The moderation queue: open reports, oldest first.';
comment on index nestly.user_enforcements_user_id_created_at_idx is 'The ladder count (last 12 months) and an account''s history; the user FK cascade.';
comment on index nestly.user_enforcements_actor_id_idx is 'The RESTRICT check on a users delete.';
comment on index nestly.user_enforcements_report_id_idx is 'The SET NULL of a report delete.';
