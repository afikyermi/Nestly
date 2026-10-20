-- =====================================================================================================================
-- Down script for supabase/migrations/20261020100000_staff_audit_core.sql (staff roles, Moderator permissions, Audit Log).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md "Never").
-- Safe:     only while no moderator_permissions row and no audit_log row exists (both are records; the script refuses and names
--           the table). staff_roles is derived from users and dropped with the migration. FORCE RLS would hide rows from
--           app_owner, so it is lifted inside this transaction for the check and put back before the drop.
-- Restores: the previous state of nestly.users (the staff-read policy and the mirror trigger are dropped); deletes only its own
--           history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the staff_audit_core down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.moderator_permissions no force row level security;
alter table nestly.audit_log no force row level security;

do $$
begin
  if exists (select 1 from nestly.moderator_permissions) or exists (select 1 from nestly.audit_log) then
    raise exception 'moderator_permissions or audit_log holds a row: both are records and are not dropped by a script. Stop: forward fix, or Afik''s decision (CLAUDE.md "Never")';
  end if;
end
$$;

drop policy users_select_staff on nestly.users;
drop trigger users_staff_mirror on nestly.users;
drop function nestly.users_staff_mirror();

drop table nestly.audit_log;
drop table nestly.moderator_permissions;
drop table nestly.staff_roles;

drop function nestly.moderator_permissions_audit();
drop function nestly.audit_log_append_only();
drop function nestly.has_permission(text);
drop function nestly.caller_staff_role();

delete from supabase_migrations.schema_migrations where version = '20261020100000';

commit;
