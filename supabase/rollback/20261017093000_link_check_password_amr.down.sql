-- =====================================================================================================================
-- Down script for supabase/migrations/20261017093000_link_check_password_amr.sql (I2 F2.0 bug fix; schema.md A7).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Order:    revert the server/tests first; with these bodies a surviving password session reads must_set again (the A7 hole).
-- Safe:     no data is touched; restores the 20261017090000 bodies and comments of the two functions and deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the link check password amr down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

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

delete from supabase_migrations.schema_migrations where version = '20261017093000';

commit;
