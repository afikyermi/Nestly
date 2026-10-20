-- =====================================================================================================================
-- The recovery lock ladder — I4 (NFR-SEC-010, AC-113; Afik 20.10.2026, replacing the 17.10 ladder with its permanent step).
--
-- recovery_throttles  gains the per-account ladder (handles only): ladder_failures counts the failures since the last success
--                     (no window). The server (as app_recovery, for the declared handle only) applies the ladder: the 3rd failure
--                     locks recovery for 1 hour, the 6th for 24 hours, and after that every further failure locks it again for
--                     24 hours, until a success, which resets the count to 0. There is no permanent lock and nothing to release.
--                     The lock itself is the existing locked_until. The IP limit is unchanged.
-- app_recovery        gains exactly one privilege: UPDATE of the ladder column ladder_failures (column level). Nothing else changes:
--                     no new table, no policy, no function, no trigger. authenticated still holds nothing on recovery_throttles.
-- has_permission()    replaced with the same body minus RECOVERY_LOCK_RELEASE: with no permanent lock there is nothing to release
--                     (FR-ADMIN-013 cancelled), so the Admin's key list no longer names it. Owner, grants and comment are kept.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261021300000_recovery_lock_ladder.down.sql.
-- =====================================================================================================================

alter table nestly.recovery_throttles
  add column ladder_failures smallint not null default 0;

alter table nestly.recovery_throttles
  add constraint recovery_throttles_ladder_failures_check check (ladder_failures >= 0 and (subject_kind = 'handle' or ladder_failures = 0));

grant update (ladder_failures) on table nestly.recovery_throttles to app_recovery;

-- FR-ADMIN-013 cancelled: the Admin's key list without RECOVERY_LOCK_RELEASE (nothing else changes).
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
        'SPONSORED_PRODUCT_MANAGE')
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

comment on column nestly.recovery_throttles.ladder_failures is
  'NFR-SEC-010: failures since the last success, handles only (0 for an IP). The 3rd locks recovery for 1 hour, the 6th and every later one for 24 hours (locked_until); a success resets it to 0. Written by app_recovery (column grant). Kept with its row: the row''s retention (§13.4) decides when the count goes.';
comment on constraint recovery_throttles_ladder_failures_check on nestly.recovery_throttles is
  'The ladder belongs to handles: an IP row keeps 0.';
