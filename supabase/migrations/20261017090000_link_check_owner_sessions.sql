-- =====================================================================================================================
-- Owner sessions after a takeover clear — I2 F2.0 bug fix (escape on PR 38; `.work/account-takeover-close/bug.md`).
--
-- Source: .work/account-takeover-close/schema.md Gate 2 A6; spec.md DR-E (c2, c3, c7, c10).
-- The Auth admin password set (the clear's cancel, c7, c10) ends every session of the user, the clearing session's refresh
-- included. So the owner continues in a NEW session, created after the clear (only the owner can create one: the password is
-- cancelled, the answers are gone, every earlier token is stale). Two bodies change, nothing else:
--   session_guard()                    must_set for any non-stale session until the new password is set (was: the clearing
--                                      session only);
--   identity_link_checks_transition()  the password-set move is allowed for the clearing session, a session whose token was
--                                      issued after cleared_at, or a caller with no users row (c11).
-- No table, column, grant, policy or data changes. Stuck `pending` rows resume on the next Google request (idempotent).
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017090000_link_check_owner_sessions.down.sql (restores the 20261016100000 bodies; no data touched).
-- =====================================================================================================================

create or replace function nestly.session_guard()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'unauthenticated'
    when c.user_id is null then case when nestly.jwt_is_oauth() then 'unchecked' else 'ok' end
    when c.verdict = 'unaffected' then 'ok'
    when c.cleared_at is null then 'pending'
    when c.clearing_session_id is distinct from nestly.jwt_session_id()
         and (nestly.jwt_issued_at() is null or nestly.jwt_issued_at() <= c.cleared_at) then 'stale'
    when c.password_set_at is null then 'must_set'
    else 'ok'
  end
  from (select 1) as one
  left join nestly.identity_link_checks c on c.user_id = auth.uid()
$$;

create or replace function nestly.identity_link_checks_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.verdict is distinct from old.verdict
     or new.checked_at is distinct from old.checked_at or new.checked_session_id is distinct from old.checked_session_id then
    raise exception 'identity_link_checks: the verdict and the check are fixed' using errcode = '42501';
  end if;

  if old.verdict = 'affected' and old.cleared_at is null
     and new.cleared_at is not null and new.password_set_at is null and new.clearing_session_id is null then
    if not nestly.jwt_is_oauth() or nestly.jwt_session_id() is null then
      raise exception 'identity_link_checks: only an oauth session clears' using errcode = '42501';
    end if;
    new.cleared_at := pg_catalog.clock_timestamp();
    new.clearing_session_id := nestly.jwt_session_id();
    return new;
  end if;

  if old.verdict = 'affected' and old.cleared_at is not null and old.password_set_at is null
     and new.password_set_at is not null and new.cleared_at is not distinct from old.cleared_at
     and new.clearing_session_id is not distinct from old.clearing_session_id then
    -- A6: the clearing session, a session whose token was issued after the clear (only the owner can create one: the
    -- password is cancelled and every earlier session ended), or a caller with no users row (c11).
    if old.clearing_session_id is distinct from nestly.jwt_session_id()
       and not coalesce(nestly.jwt_issued_at() > old.cleared_at, false)
       and exists (select 1 from nestly.users u where u.id = auth.uid()) then
      raise exception 'identity_link_checks: only a session of the owner after the clear sets the password' using errcode = '42501';
    end if;
    new.password_set_at := now();
    return new;
  end if;

  raise exception 'identity_link_checks: not an allowed transition' using errcode = '42501';
end
$$;

comment on function nestly.session_guard() is
  'What the current token may do (FR-AUTH-005): unauthenticated, unchecked (no row, oauth: detection first), ok, pending (503), stale (401: another session''s token issued no later than the clear), must_set (any non-stale session after the clear, before the new password; Gate 2 A6). Read by the server with the claims, and by is_active_account(). SECURITY INVOKER, authenticated only.';
comment on function nestly.identity_link_checks_transition() is
  'Allows exactly two moves on identity_link_checks: the clear (pending to cleared, oauth session, stamped clock_timestamp() and the caller''s session) and the password set (by the clearing session, a session issued after cleared_at, or a caller with no users row; Gate 2 A6). Anything else raises 42501.';
