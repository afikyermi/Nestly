-- =====================================================================================================================
-- Staff roles, Moderator permissions, has_permission(), and the append-only Audit Log — the safety and admin core, part 1.
--
-- SRS: BR-021 (one Admin), BR-024/025 (permissions, Admin-only keys), BR-026 and FR-ADMIN-005 (Audit Log), FR-ADMIN-004 (the model;
--      its screen comes later), AC-025, AC-029, AC-031 · §3.1, §3.2 · platform rules 14, 16, 18 (.claude/knowledge/data-model.md).
--
-- staff_roles             one row per Admin or Moderator account: a mirror of users (account_type, status) kept by composite FKs, so a policy
--                         on `users` can ask "is the caller staff" without reading `users` (a users policy that calls a function reading
--                         users would recurse). Filled by a trigger on users; nobody inserts it.
-- moderator_permissions   the Permission Keys an Admin assigned to a Moderator (deny by default). Admin-only keys cannot be stored.
-- has_permission(key)     SECURITY INVOKER, caller only: Admin = every key; Moderator = the key's row, plus the companion key SRS §3.1
--                         names ("requires USER_VIEW" ...). Called as (select nestly.has_permission('KEY')) in policies.
-- audit_log               the append-only record of administrative actions. Written in the same transaction as the action, by triggers
--                         and invoker functions that fill the actor from auth.uid(); the INSERT policy refuses any other actor. No
--                         UPDATE and no DELETE for any role (a trigger refuses them as well). Read: Admin, or AUDIT_LOG_VIEW.
-- users                   gains a read policy for staff (Admin: all; Moderator: USER_VIEW).
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged.
--
-- The single Super Admin (BR-021) is created by the owner of the product with supabase/bootstrap/03-super-admin.sql, never by the app.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261020300000_staff_audit_core.down.sql (refuses once a permission or an audit row exists).
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
  select sr.account_type from nestly.staff_roles sr where sr.user_id = auth.uid() and sr.account_status = 'active'
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
    where sr.user_id = auth.uid() and sr.account_status = 'active'
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

-- 5. RLS, policies, grants. Every policy TO authenticated.
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

create policy audit_log_insert_actor on nestly.audit_log
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and actor_role = (select nestly.caller_staff_role()));

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
grant insert (actor_role, permission_key, action, target_kind, target_id, result, reason, before_state, after_state)
  on table nestly.audit_log to authenticated;

-- 6. Audit of a permission change (BR-026: Before/After). The reason may travel in nestly.audit_reason (rule 18).
create function nestly.moderator_permissions_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record := case tg_op when 'INSERT' then new else old end;
begin
  if current_user <> 'authenticated' then
    return null; -- the owner role (fixtures, bootstrap) is not an Actor; every runtime change is audited
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values ((select nestly.caller_staff_role()), 'MODERATOR_MANAGE',
    case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end,
    'user', r.user_id,
    nullif(pg_catalog.current_setting('nestly.audit_reason', true), ''),
    case tg_op when 'DELETE' then pg_catalog.jsonb_build_object('permission', r.permission_key) end,
    case tg_op when 'INSERT' then pg_catalog.jsonb_build_object('permission', r.permission_key) end);
  return null;
end
$$;

revoke execute on function nestly.moderator_permissions_audit() from public;

create trigger moderator_permissions_audit
  after insert or delete on nestly.moderator_permissions
  for each row execute function nestly.moderator_permissions_audit();

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
comment on function nestly.moderator_permissions_audit() is 'SECURITY INVOKER. After insert or delete of a permission: appends permission_granted or permission_revoked with the target Moderator and the key (Before/After).';
comment on policy staff_roles_select_own on nestly.staff_roles is 'A staff account reads its own active role row; no policy shows another account''s.';
comment on policy moderator_permissions_select_own on nestly.moderator_permissions is 'A Moderator reads its own keys.';
comment on policy moderator_permissions_select_admin on nestly.moderator_permissions is 'The Admin (MODERATOR_MANAGE) reads every Moderator''s keys.';
comment on policy moderator_permissions_insert_admin on nestly.moderator_permissions is 'Only the Admin assigns a key; granted_by must be the Admin.';
comment on policy moderator_permissions_delete_admin on nestly.moderator_permissions is 'Only the Admin revokes a key.';
comment on policy audit_log_select_viewer on nestly.audit_log is 'The Admin, or a Moderator with AUDIT_LOG_VIEW, reads the log (view only).';
comment on policy audit_log_insert_actor on nestly.audit_log is 'A staff member appends an entry naming itself and its own role; entries are never changed.';
comment on policy users_select_staff on nestly.users is 'Staff read accounts: the Admin all, a Moderator with USER_VIEW (SRS §3.1), only in a transaction that set nestly.staff_view to on (the admin screens); other requests see the own row only. The function reads staff_roles and moderator_permissions only, never users.';
comment on index nestly.moderator_permissions_granted_by_idx is 'The RESTRICT check on a users delete.';
comment on index nestly.audit_log_occurred_at_idx is 'The log screen: newest first.';
comment on index nestly.audit_log_actor_id_idx is 'The RESTRICT check on a users delete; one actor''s actions.';
comment on index nestly.audit_log_target_idx is 'The history of one target.';
