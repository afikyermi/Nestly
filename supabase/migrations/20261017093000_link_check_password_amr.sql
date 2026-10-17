-- =====================================================================================================================
-- Password sessions after a takeover clear — I2 F2.0 bug fix, CRITIC fix-round bug 1 (DR-E2).
--
-- Source: .work/account-takeover-close/schema.md Gate 2 A7; spec.md DR-E2; findings-fix.md bug 1.
-- A password sign-in by the earlier registrant that read the old hash before the clear's admin set and created its session
-- after the set's delete-all survives the clear; one refresh gives it iat > cleared_at. Until the new password is set, such a
-- session is not the owner's. Two bodies change, nothing else:
--   session_guard()                    after the clear and before password_set_at, a session other than the clearing one reads
--                                      stale (401) when its amr includes password, or when it has no readable amr (fail closed);
--   identity_link_checks_transition()  the password-set move is allowed only for the clearing session, or a session issued
--                                      after cleared_at whose amr is readable and has no password entry. The A6 exemption for
--                                      a caller with no users row is dropped: c11 is held to the same rule (it was the gap).
-- No table, column, grant, policy or data changes.
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017093000_link_check_password_amr.down.sql (restores the 20261017090000 bodies; no data touched).
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
    -- A7 (DR-E2): before the new password, a non-clearing password session (or one without a readable amr) is not the owner's.
    when c.password_set_at is null
         and c.clearing_session_id is distinct from nestly.jwt_session_id()
         and coalesce(not (pg_catalog.jsonb_typeof(auth.jwt() -> 'amr') = 'array'
                           and not ((auth.jwt() -> 'amr') @> '[{"method": "password"}]'::jsonb)), true) then 'stale'
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
    -- A7: the clearing session, or a session issued after the clear with a readable amr and no password entry (DR-E2).
    -- Holds for c7 and c11 alike (no exemption for a caller with no users row).
    if old.clearing_session_id is distinct from nestly.jwt_session_id()
       and not coalesce(nestly.jwt_issued_at() > old.cleared_at
                        and pg_catalog.jsonb_typeof(auth.jwt() -> 'amr') = 'array'
                        and not ((auth.jwt() -> 'amr') @> '[{"method": "password"}]'::jsonb), false) then
      raise exception 'identity_link_checks: only the owner''s session after the clear sets the password' using errcode = '42501';
    end if;
    new.password_set_at := now();
    return new;
  end if;

  raise exception 'identity_link_checks: not an allowed transition' using errcode = '42501';
end
$$;

comment on function nestly.session_guard() is
  'What the current token may do (FR-AUTH-005): unauthenticated, unchecked (no row, oauth: detection first), ok, pending (503), stale (401: another session''s token issued no later than the clear; or, before the new password, another session whose amr includes password or is unreadable — Gate 2 A7, DR-E2), must_set (the clearing session or a post-clear non-password session, before the new password). Read by the server with the claims, and by is_active_account(). SECURITY INVOKER, authenticated only.';
comment on function nestly.identity_link_checks_transition() is
  'Allows exactly two moves on identity_link_checks: the clear (pending to cleared, oauth session, stamped clock_timestamp() and the caller''s session) and the password set (by the clearing session, or a session issued after cleared_at whose amr is readable and has no password entry; Gate 2 A7). Anything else raises 42501.';
