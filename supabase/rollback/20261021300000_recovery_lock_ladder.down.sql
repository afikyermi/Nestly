-- =====================================================================================================================
-- Down script for supabase/migrations/20261021300000_recovery_lock_ladder.sql (I4, NFR-SEC-010).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Safe:     only while no handle has a counted failure (refuses otherwise: the ladder would restart from zero). Run it before the
--           down script of any later migration that replaces has_permission() (reverse order), since it restores the 20261020300000 body.
-- Effect:   the ladder count goes (with its column grant); a lock already set in locked_until stays until it ends; has_permission()
--           names RECOVERY_LOCK_RELEASE again for the Admin (as 20261020300000 left it). The history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the recovery lock ladder down script must run as app_owner (current_user is %)', current_user;
  end if;
  if exists (select 1 from nestly.recovery_throttles where ladder_failures > 0) then
    raise exception 'a handle has counted ladder failures: dropping them would restart its ladder; the down script refuses';
  end if;
end
$$;

create or replace function nestly.has_permission(p_key text)
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

alter table nestly.recovery_throttles drop constraint recovery_throttles_ladder_failures_check;
alter table nestly.recovery_throttles drop column ladder_failures;

delete from supabase_migrations.schema_migrations where version = '20261021300000';

commit;
