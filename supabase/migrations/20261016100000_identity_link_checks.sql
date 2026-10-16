-- =====================================================================================================================
-- Account takeover close — I2 F2.0 part a (S-01, S-16). The per-Auth-user identity link check and its session guard, the
-- first DELETE on recovery_answers (the clear, D1), and the subject-bound audit kinds.
--
-- Source: .work/account-takeover-close/schema.md (Gate 2, passed 16.10.2026: DR-S1, DR-S2, Q-S1); decisions/2026-10.md
--         "F2.0 AR-1/AR-2" (Afik).
-- SRS: FR-AUTH-005, FR-AUTH-003, FR-AUTH-002 · NFR-SEC-010 · platform rules 3, 8, 10, 12-16, 18 and "Approved exceptions"
--      (.claude/knowledge/data-model.md).
--
-- identity_link_checks  one row per Auth user, written on its first request from a Google (oauth) session after F2.0: the
--                       verdict (is an email identity older than the google one?) and, for `affected`, the clear's state:
--                       pending (cleared_at NULL) -> must_set (cleared, password_set_at NULL) -> done.
-- session_guard()       what the current token may do: unauthenticated, unchecked, ok, pending, stale or must_set. Read by the
--                       server in the statement that sets the claims, and inside is_active_account(), so every gated table
--                       returns nothing while pending, stale or unchecked even if a route forgets (DR-O1, DR-O2).
--
-- The claims the server passes become {sub, role, session_id, iat, amr} (DR-S1): session identifiers only, compared with a
-- row the database holds. Account type, status and permissions still come from tables (platform rule 14).
-- No SECURITY DEFINER: tests.approved_security_definer() stays empty.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261016100000_identity_link_checks.down.sql (refuses while identity_link_checks or a new-kind event
-- holds a row; must ship with the server rollback, which calls the guard).
-- =====================================================================================================================

-- 1. The table. No FK: an Auth user with no users row has a verdict too (c9), and the anchor rule forbids a second FK to
--    auth.users. The I9 deletion flow (OP-028) deletes the row.
create table nestly.identity_link_checks (
  user_id             uuid        not null default auth.uid(),
  verdict             text        not null,
  checked_at          timestamptz not null default now(),
  checked_session_id  uuid        not null,
  cleared_at          timestamptz,
  clearing_session_id uuid,
  password_set_at     timestamptz,
  constraint identity_link_checks_pkey primary key (user_id),
  constraint identity_link_checks_verdict_check check (verdict in ('unaffected', 'affected')),
  constraint identity_link_checks_unaffected_check check (
    verdict = 'affected' or (cleared_at is null and clearing_session_id is null and password_set_at is null)),
  constraint identity_link_checks_clearing_check check ((cleared_at is null) = (clearing_session_id is null)),
  constraint identity_link_checks_password_set_check check (password_set_at is null or cleared_at is not null)
);

alter table nestly.identity_link_checks enable row level security;
alter table nestly.identity_link_checks force  row level security;

-- 2. Helpers on the claims. Caller-free, SECURITY INVOKER, executable by authenticated only. A malformed or missing claim
--    reads NULL (false for jwt_is_oauth), never an error.
create function nestly.jwt_session_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (auth.jwt() ->> 'session_id')::uuid
  end
$$;

create function nestly.jwt_issued_at()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(auth.jwt() -> 'iat') = 'number'
    then pg_catalog.to_timestamp((auth.jwt() ->> 'iat')::double precision)
  end
$$;

create function nestly.jwt_is_oauth()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'amr') @> '[{"method": "oauth"}]'::jsonb, false)
$$;

-- 3. The guard. The row is the caller's own (identity_link_checks_select_own). Order matters: no row, unaffected, pending
--    (every session), stale (another session's token issued no later than the clear; whole-second iat, so the cleared second
--    reads stale), must_set (the clearing session until the password is set), ok.
create function nestly.session_guard()
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
    when c.password_set_at is null and c.clearing_session_id = nestly.jwt_session_id() then 'must_set'
    else 'ok'
  end
  from (select 1) as one
  left join nestly.identity_link_checks c on c.user_id = auth.uid()
$$;

-- The transaction's subject, for the subject-bound audit kinds written as app_recovery (section 8). Reads the claims directly:
-- app_recovery holds nothing in schema auth.
create function nestly.recovery_subject()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  end
$$;

revoke execute on function nestly.jwt_session_id()   from public;
revoke execute on function nestly.jwt_issued_at()    from public;
revoke execute on function nestly.jwt_is_oauth()     from public;
revoke execute on function nestly.session_guard()    from public;
revoke execute on function nestly.recovery_subject() from public;
grant  execute on function nestly.jwt_session_id()   to authenticated;
grant  execute on function nestly.jwt_issued_at()    to authenticated;
grant  execute on function nestly.jwt_is_oauth()     to authenticated;
grant  execute on function nestly.session_guard()    to authenticated;
grant  execute on function nestly.recovery_subject() to app_recovery;

-- 4. is_active_account() gains the guard: a pending, stale or unchecked token is not an active account (c4, c6). Replaced in
--    place, so its grants stay. Still SECURITY INVOKER, caller-only (platform rule 16).
create or replace function nestly.is_active_account()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from nestly.users u where u.id = auth.uid() and u.status = 'active'
  ) and (select nestly.session_guard()) in ('ok', 'must_set')
$$;

-- 5. The transition trigger: exactly two moves, anything else raises 42501.
--    clear         OLD affected and pending, an oauth session with a session id: cleared_at := now(), clearing_session_id :=
--                  the caller's session (whatever the statement sent).
--    password set  OLD cleared, password not set; the caller is the clearing session, or has no own users row (c11):
--                  password_set_at := now().
--    verdict, checked_at, checked_session_id and user_id never change. There is no DELETE (no grant, no policy).
create function nestly.identity_link_checks_transition()
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
    new.cleared_at := now();
    new.clearing_session_id := nestly.jwt_session_id();
    return new;
  end if;

  if old.verdict = 'affected' and old.cleared_at is not null and old.password_set_at is null
     and new.password_set_at is not null and new.cleared_at is not distinct from old.cleared_at
     and new.clearing_session_id is not distinct from old.clearing_session_id then
    if old.clearing_session_id is distinct from nestly.jwt_session_id()
       and exists (select 1 from nestly.users u where u.id = auth.uid()) then
      raise exception 'identity_link_checks: only the clearing session sets the password' using errcode = '42501';
    end if;
    new.password_set_at := now();
    return new;
  end if;

  raise exception 'identity_link_checks: not an allowed transition' using errcode = '42501';
end
$$;

revoke execute on function nestly.identity_link_checks_transition() from public;

create trigger identity_link_checks_transition
  before update on nestly.identity_link_checks
  for each row execute function nestly.identity_link_checks_transition();

-- 6. Policies and grants on identity_link_checks. The INSERT needs an oauth session writing its own session id, so a password
--    session (the earlier registrant) cannot pre-write `unaffected`. Nothing to anon, app_recovery or PUBLIC.
create policy identity_link_checks_select_own on nestly.identity_link_checks
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy identity_link_checks_insert_own on nestly.identity_link_checks
  for insert to authenticated
  with check (user_id = (select auth.uid())
          and checked_session_id = (select nestly.jwt_session_id())
          and (select nestly.jwt_is_oauth()));
create policy identity_link_checks_update_own on nestly.identity_link_checks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on table nestly.identity_link_checks to authenticated;
grant insert (verdict, checked_session_id) on table nestly.identity_link_checks to authenticated;
grant update (cleared_at, password_set_at) on table nestly.identity_link_checks to authenticated;

-- 7. recovery_answers: the first DELETE (D1). The caller's own row, only while the caller's own link row is pending. Not
--    status-gated (Q-4: the clear runs first, then ERR-037). The statement that uses it has no WHERE and no RETURNING (either
--    would apply the SELECT policy, which is gated on is_active_account() and so hides the row while pending).
create policy recovery_answers_delete_clear on nestly.recovery_answers
  for delete to authenticated
  using (user_id = (select auth.uid())
     and exists (select 1 from nestly.identity_link_checks c
                 where c.user_id = (select auth.uid()) and c.verdict = 'affected' and c.cleared_at is null));

grant delete on table nestly.recovery_answers to authenticated;

-- 8. recovery_events: seven new kinds; user_id NULL also for takeover_cleared (c9) and first_password_set (c11, no account
--    row); one takeover_cleared per user; the three subject-bound kinds are written for the transaction's sub only.
alter table nestly.recovery_events drop constraint recovery_events_kind_check;
alter table nestly.recovery_events add constraint recovery_events_kind_check check (kind in (
  'answers_saved', 'answers_changed', 'change_failed', 'change_limited', 'reset_verified',
  'reset_completed', 'reset_failed', 'reset_limited', 'reset_admin_failed', 'reset_revoke_failed',
  'reset_email_mismatch', 'handle_released', 'handle_rekeyed',
  'takeover_cleared', 'password_set_forced', 'first_password_set', 'password_changed',
  'password_change_failed', 'password_change_limited', 'password_change_auth_failed'));
alter table nestly.recovery_events drop constraint recovery_events_user_id_check;
alter table nestly.recovery_events add constraint recovery_events_user_id_check check (
  user_id is not null or kind in ('reset_failed', 'reset_limited', 'takeover_cleared', 'first_password_set'));

create unique index recovery_events_takeover_cleared_key on nestly.recovery_events (user_id) where kind = 'takeover_cleared';

-- The subject-bound kinds: declared handle and IP as today, the user the transaction's sub (or none). The handle-bound policy
-- no longer covers them, so a declared handle cannot attribute one to the handle's account on another subject's behalf.
create policy recovery_events_insert_subject on nestly.recovery_events
  for insert to app_recovery
  with check (kind in ('takeover_cleared', 'password_set_forced', 'first_password_set')
          and handle_hash = (select nestly.recovery_handle())
          and ip_hash = (select nestly.recovery_ip())
          and (user_id = (select nestly.recovery_subject()) or user_id is null));

alter policy recovery_events_insert_recovery on nestly.recovery_events
  with check (kind not in ('takeover_cleared', 'password_set_forced', 'first_password_set')
          and handle_hash = (select nestly.recovery_handle())
          and ip_hash = (select nestly.recovery_ip())
          and user_id is not distinct from (select ra.user_id from nestly.recovery_answers ra));

-- 9. Comments.
comment on table nestly.identity_link_checks is
  'FR-AUTH-005 (S-01): one row per Auth user, written on its first request from a Google (oauth) session after F2.0. verdict affected = an email identity older than the google one (someone registered the email with a password first): the clear cancels that password, ends every other session and clears the recovery answers. State: pending (cleared_at NULL), must_set (cleared, password_set_at NULL), done. No FK (an Auth user may have no users row); the I9 deletion flow (OP-028) deletes it.';
comment on column nestly.identity_link_checks.user_id is
  'The Auth user. Set by the database (auth.uid()), never by the client (platform rules 12-13).';
comment on column nestly.identity_link_checks.verdict is
  'affected or unaffected, decided once from the Auth identities (provider, created_at). Never changes: a later email identity is always after the google one.';
comment on column nestly.identity_link_checks.checked_at is
  'When the verdict was written. Database clock, UTC.';
comment on column nestly.identity_link_checks.checked_session_id is
  'The session_id claim of the oauth session that wrote the verdict (the insert policy requires the caller''s own).';
comment on column nestly.identity_link_checks.cleared_at is
  'When the clear completed (the trigger stamps now()). NULL on an affected row: pending, every session answered 503.';
comment on column nestly.identity_link_checks.clearing_session_id is
  'The session that completed the clear (set by the trigger). Its tokens stay valid; any other session''s token issued no later than cleared_at is stale (401).';
comment on column nestly.identity_link_checks.password_set_at is
  'When the new password was set after the clear (the forced step, or the F1.8 first password with no account row). NULL after a clear: must_set.';

comment on function nestly.jwt_session_id() is
  'The session_id claim of the transaction''s token as uuid, or NULL. A session identifier only, never authorization (DR-S1). SECURITY INVOKER, authenticated only.';
comment on function nestly.jwt_issued_at() is
  'The iat claim as timestamptz (whole seconds), or NULL. SECURITY INVOKER, authenticated only.';
comment on function nestly.jwt_is_oauth() is
  'True when the amr claim holds method oauth (a Google sign-in); false for anything else or a malformed claim. SECURITY INVOKER, authenticated only.';
comment on function nestly.session_guard() is
  'What the current token may do (FR-AUTH-005): unauthenticated, unchecked (no row, oauth: detection first), ok, pending (503), stale (401), must_set (the clearing session before its new password). Read by the server with the claims, and by is_active_account(). SECURITY INVOKER, authenticated only.';
comment on function nestly.recovery_subject() is
  'The sub of request.jwt.claims as uuid, or NULL: the subject the three subject-bound audit kinds are attributed to. SECURITY INVOKER, app_recovery only.';
comment on function nestly.is_active_account() is
  'True only when the caller''s own account exists and is active (platform rule 15) and the session guard is ok or must_set (F2.0: pending, stale and unchecked tokens read nothing). SECURITY INVOKER, caller-only (rule 16).';
comment on function nestly.identity_link_checks_transition() is
  'Allows exactly two moves on identity_link_checks: the clear (pending to cleared, oauth session, stamped now() and the caller''s session) and the password set (by the clearing session, or a caller with no users row). Anything else raises 42501.';

comment on policy identity_link_checks_select_own on nestly.identity_link_checks is
  'An Auth user reads its own row only (the guard reads it).';
comment on policy identity_link_checks_insert_own on nestly.identity_link_checks is
  'An oauth session writes its own verdict once, with its own session id: a password session cannot pre-write unaffected.';
comment on policy identity_link_checks_update_own on nestly.identity_link_checks is
  'Own row only; which moves are allowed is the trigger''s (identity_link_checks_transition).';
comment on policy recovery_answers_delete_clear on nestly.recovery_answers is
  'D1 (FR-AUTH-005): the caller''s own answers are deleted while its own link row is pending, so the earlier registrant cannot recover the account with the answers he set. No status gate (Q-4).';
comment on policy recovery_events_insert_subject on nestly.recovery_events is
  'app_recovery appends takeover_cleared, password_set_forced and first_password_set for the declared handle and IP, attributed to the transaction''s sub (recovery_subject()) or to no account. No SELECT.';
comment on policy recovery_events_insert_recovery on nestly.recovery_events is
  'app_recovery appends an event for the declared handle and IP hash, attributed to the account of that handle (or to none), so a caller cannot attribute an event to another account. Not the three subject-bound kinds (recovery_events_insert_subject). No SELECT: the audit cannot be read back.';
comment on index nestly.recovery_events_takeover_cleared_key is
  'c5: at most one takeover_cleared row per account, even under a race (the row lock is the first fence).';
comment on column nestly.recovery_events.kind is
  'answers_saved, answers_changed, change_failed, change_limited, reset_verified, reset_completed, reset_failed, reset_limited, reset_admin_failed, reset_revoke_failed, reset_email_mismatch, handle_released, handle_rekeyed; F2.0: takeover_cleared, password_set_forced, first_password_set, password_changed, password_change_failed, password_change_limited, password_change_auth_failed. After reset_verified exactly one of reset_completed, reset_admin_failed, reset_revoke_failed, reset_email_mismatch.';
comment on column nestly.recovery_events.user_id is
  'The account the handle belongs to (forced by recovery_events_insert_recovery), or the transaction''s sub for the subject-bound kinds. NULL only for reset_failed and reset_limited on a handle with no account, and for takeover_cleared and first_password_set of an Auth user with no account row. ON DELETE RESTRICT (I9, OP-028).';
