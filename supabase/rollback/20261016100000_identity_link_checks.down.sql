-- =====================================================================================================================
-- Down script for supabase/migrations/20261016100000_identity_link_checks.sql (I2 F2.0 part a; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the F2.0 server code first (it reads nestly.session_guard() in every identity transaction), then run this.
-- Safe:     only while identity_link_checks and the new-kind recovery_events rows are empty: a clear already ran for an account
--           otherwise, and dropping its state would let a pre-clear token back in. The script refuses then; after the first
--           production row the way back is a forward fix. FORCE RLS would hide every row from app_owner, so it is lifted on
--           both tables inside this transaction first and the counts are real (FORCE comes back on recovery_events below).
-- Restores: the F1.1 is_active_account(), the F1.6 recovery_events kind and user_id CHECKs, the F1.6 handle-bound insert
--           policy and its comment; drops the D1 delete policy and grant, the subject policy, the partial index, the trigger,
--           the five helpers and the table; deletes the migration's history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the identity link checks down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.identity_link_checks no force row level security;
alter table nestly.recovery_events      no force row level security;

do $$
begin
  if exists (select 1 from nestly.identity_link_checks)
     or exists (select 1 from nestly.recovery_events
                where kind in ('takeover_cleared', 'password_set_forced', 'first_password_set', 'password_changed',
                               'password_change_failed', 'password_change_limited', 'password_change_auth_failed')) then
    raise exception 'nestly.identity_link_checks or a F2.0 recovery_events row exists: rolling back would forget a takeover clear. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

alter table nestly.recovery_events force row level security;

create or replace function nestly.is_active_account()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from nestly.users u where u.id = auth.uid() and u.status = 'active'
  )
$$;
comment on function nestly.is_active_account() is
  'True when the caller''s own account (auth.uid()) exists and is active (platform rule 15, FR-MOD-002). Caller only: takes no user argument. SECURITY INVOKER (F1.1 Gate 2).';

alter policy recovery_events_insert_recovery on nestly.recovery_events
  with check (handle_hash = (select nestly.recovery_handle())
          and ip_hash = (select nestly.recovery_ip())
          and user_id is not distinct from (select ra.user_id from nestly.recovery_answers ra));
comment on policy recovery_events_insert_recovery on nestly.recovery_events is
  'app_recovery appends an event for the declared handle and IP hash, attributed to the account of that handle (or to none), so a caller cannot attribute an event to another account. No SELECT: the audit cannot be read back.';
drop policy recovery_events_insert_subject on nestly.recovery_events;
drop index nestly.recovery_events_takeover_cleared_key;

alter table nestly.recovery_events drop constraint recovery_events_user_id_check;
alter table nestly.recovery_events add constraint recovery_events_user_id_check check (
  user_id is not null or kind in ('reset_failed', 'reset_limited'));
alter table nestly.recovery_events drop constraint recovery_events_kind_check;
alter table nestly.recovery_events add constraint recovery_events_kind_check check (kind in (
  'answers_saved', 'answers_changed', 'change_failed', 'change_limited', 'reset_verified',
  'reset_completed', 'reset_failed', 'reset_limited', 'reset_admin_failed', 'reset_revoke_failed',
  'reset_email_mismatch', 'handle_released', 'handle_rekeyed'));
comment on column nestly.recovery_events.kind is
  'answers_saved, answers_changed, change_failed, change_limited, reset_verified, reset_completed, reset_failed, reset_limited, reset_admin_failed, reset_revoke_failed, reset_email_mismatch, handle_released or handle_rekeyed. After reset_verified exactly one of reset_completed, reset_admin_failed, reset_revoke_failed, reset_email_mismatch.';
comment on column nestly.recovery_events.user_id is
  'The account the handle belongs to, forced by the insert policy. NULL only for reset_failed and reset_limited on a handle with no account. For handle_released, the account that lost the handle. ON DELETE RESTRICT: the audit does not vanish as a side effect (I9, OP-028).';

revoke delete on table nestly.recovery_answers from authenticated;
drop policy recovery_answers_delete_clear on nestly.recovery_answers;

drop trigger identity_link_checks_transition on nestly.identity_link_checks;
drop function nestly.identity_link_checks_transition();
drop table nestly.identity_link_checks;

drop function nestly.recovery_subject();
drop function nestly.session_guard();
drop function nestly.jwt_is_oauth();
drop function nestly.jwt_issued_at();
drop function nestly.jwt_session_id();

delete from supabase_migrations.schema_migrations where version = '20261016100000';

commit;
