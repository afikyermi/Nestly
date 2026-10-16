-- =====================================================================================================================
-- CI only -- observers and levers for the account-takeover-close pgTAP tests (F2.0 part a, S-01 / S-16, FR-AUTH-005).
-- Run as postgres by the `db` job, in name order AFTER 10_, 20_ and 30_ (ci.yml: "for f in supabase/tests/setup/*.sql").
-- Never a migration; never in a real environment. Source: .work/account-takeover-close/schema.md (table and column names).
--
--   tests.fx_link_put(user, verdict, checked_session, cleared_at, clearing_session, password_set_at)
--                                      replaces the identity_link_checks row of one Auth user with exactly that state, as postgres
--                                      (the transition trigger guards UPDATE only; a fixture puts a row in any legal state)
--   tests.fx_link_state(user)          'verdict/clearedSet/clearingSession/passwordSet' of the row, '-' for none
--   tests.fx_link_cleared_in_flight(user) true when transaction start < cleared_at <= clock_timestamp() (A1: stamped at the UPDATE, not at now())
--   tests.fx_link_answers_put(user, handle_hex)   a valid recovery_answers row for the user (handle NULL when handle_hex is NULL)
--   tests.fx_link_event_kinds(user)    the audit kinds written for one user_id, oldest first, '-' for none
--   tests.fx_link_events_json(user)    those audit rows as JSON text
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the link fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.identity_link_checks') is null then
    raise exception 'nestly.identity_link_checks is missing: run the migrations before the link fixtures';
  end if;
  if to_regprocedure('tests.fx_id_checked(text)') is null then
    raise exception 'tests.fx_id_checked is missing: run 10_identity_fixtures.sql first';
  end if;
end
$$;

create or replace function tests.fx_link_put(
  p_user uuid, p_verdict text, p_checked_session uuid,
  p_cleared_at timestamptz default null, p_clearing_session uuid default null, p_password_set_at timestamptz default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from nestly.identity_link_checks where user_id = p_user;
  insert into nestly.identity_link_checks (user_id, verdict, checked_session_id, cleared_at, clearing_session_id, password_set_at)
  values (p_user, p_verdict, p_checked_session, p_cleared_at, p_clearing_session, p_password_set_at);
end
$$;

create or replace function tests.fx_link_state(p_user uuid) returns text
language sql security definer set search_path = ''
as $$
  select coalesce((
    select l.verdict || '/' || (l.cleared_at is not null)::text || '/' || coalesce(l.clearing_session_id::text, '-') || '/' || (l.password_set_at is not null)::text
    from nestly.identity_link_checks l where l.user_id = p_user), '-')
$$;

create or replace function tests.fx_link_cleared_in_flight(p_user uuid) returns boolean
language sql security definer set search_path = ''
as $$
  select coalesce((select l.cleared_at > now() and l.cleared_at <= clock_timestamp() from nestly.identity_link_checks l where l.user_id = p_user), false)
$$;

create or replace function tests.fx_link_answers_put(p_user uuid, p_handle_hex text default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.recovery_answers (user_id, email_handle, handle_claimed_at, question_1, question_2,
                                       answer_hash_1, answer_salt_1, answer_hash_2, answer_salt_2, scrypt_log_n, scrypt_r, scrypt_p)
  values (p_user,
          case when p_handle_hex is null then null else decode(p_handle_hex, 'hex') end,
          case when p_handle_hex is null then null else timestamptz '2026-10-15 10:00:00+00' end,
          'nickname', 'pet',
          decode(repeat('11', 32), 'hex'), decode(repeat('21', 16), 'hex'), decode(repeat('12', 32), 'hex'), decode(repeat('22', 16), 'hex'), 15, 8, 1);
end
$$;

create or replace function tests.fx_link_event_kinds(p_user uuid) returns text
language sql security definer set search_path = ''
as $$
  select coalesce(string_agg(e.kind, ',' order by e.occurred_at, e.id), '-') from nestly.recovery_events e where e.user_id = p_user
$$;

create or replace function tests.fx_link_events_json(p_user uuid) returns text
language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at, e.id)::text, '[]') from nestly.recovery_events e where e.user_id = p_user
$$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
