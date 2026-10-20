-- =====================================================================================================================
-- CI only -- observers and levers for the password-recovery tests (F1.6, criteria 2, 3, 11, 12, 13, 15, 20).
-- Run as postgres by the `db` job, in name order AFTER 10_ and 20_ (ci.yml: "for f in supabase/tests/setup/*.sql"). Never a
-- migration; never in a real environment.
--
-- WHY. No runtime role may read the audit (recovery_events), the hashes (authenticated) or move a clock (nobody), and the
-- spec asks the tests to prove exactly what the audit, the counters and the stored hashes hold. These definer functions
-- (owner postgres, fixed search_path, executable by app_server only, like the other fixtures here) are the test's eyes:
--
--   tests.fx_recovery_kinds(handle_hex)              the audit kinds for one handle hash, oldest first, comma separated ('-' for none)
--   tests.fx_recovery_events_json(handle_hex)        the audit rows themselves as JSON text (for "no answer / password / email in it")
--   tests.fx_recovery_answers_json(user_id)          the stored answers row of one account as JSON text ('-' for none)
--   tests.fx_recovery_throttle(kind, subject_hex)    'short/long/locked/shortWindow/longWindow' of one counter row ('-' for none)
--   tests.fx_recovery_ladder(handle_hex)           'failures/permanent/locked' of a handle's lock ladder (NFR-SEC-010) ('-' for none)
--   tests.fx_recovery_shift(kind, subject_hex, by)   moves a counter row's windows and lock `by` into the past (the DB clock
--                                                    decides everything, so a test moves state with SQL, not with a clock)
--   tests.fx_recovery_break_events(handle_hex, kind) makes an audit INSERT fail for that handle (and kind, '' = any), to force a
--                                                    failure in the middle of a transaction; scoped, so parallel tests are unaffected
--   tests.fx_recovery_unbreak_events()               removes it
--   tests.fx_recovery_new_account(email)             an Auth user with that email and an ACTIVE regular nestly.users row
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the recovery fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.recovery_events') is null or to_regclass('nestly.recovery_answers') is null or to_regclass('nestly.recovery_throttles') is null then
    raise exception 'the recovery tables are missing: run the migrations before the recovery fixtures';
  end if;
  if to_regprocedure('tests.fx_id_checked(text)') is null then
    raise exception 'tests.fx_id_checked is missing: run 10_identity_fixtures.sql first';
  end if;
end
$$;

create or replace function tests.fx_recovery_kinds(p_handle_hex text) returns text
language sql security definer set search_path = ''
as $$
  select coalesce(string_agg(e.kind, ',' order by e.occurred_at, e.id), '-')
  from nestly.recovery_events e where e.handle_hash = decode(p_handle_hex, 'hex')
$$;

create or replace function tests.fx_recovery_events_json(p_handle_hex text) returns text
language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at, e.id)::text, '[]')
  from nestly.recovery_events e where e.handle_hash = decode(p_handle_hex, 'hex')
$$;

create or replace function tests.fx_recovery_answers_json(p_user uuid) returns text
language sql security definer set search_path = ''
as $$
  select coalesce((select to_jsonb(a)::text from nestly.recovery_answers a where a.user_id = p_user), '-')
$$;

create or replace function tests.fx_recovery_throttle(p_kind text, p_subject_hex text) returns text
language sql security definer set search_path = ''
as $$
  select coalesce((
    select t.short_failures || '/' || t.long_failures || '/' || coalesce(t.locked_until > now(), false)::text
           || '/' || (t.short_window_started_at is not null)::text || '/' || (t.long_window_started_at is not null)::text
    from nestly.recovery_throttles t
    where t.subject_kind = p_kind and t.subject_hash = decode(p_subject_hex, 'hex')), '-')
$$;

-- NFR-SEC-010: the handle's lock ladder, 'failures/permanent/locked' ('-' for none).
create or replace function tests.fx_recovery_ladder(p_subject_hex text) returns text
language sql security definer set search_path = ''
as $$
  select coalesce((
    select t.ladder_failures || '/' || t.is_locked_permanently::text || '/' || (t.is_locked_permanently or coalesce(t.locked_until > now(), false))::text
    from nestly.recovery_throttles t
    where t.subject_kind = 'handle' and t.subject_hash = decode(p_subject_hex, 'hex')), '-')
$$;

create or replace function tests.fx_recovery_shift(p_kind text, p_subject_hex text, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.recovery_throttles t
     set short_window_started_at = t.short_window_started_at - p_by,
         long_window_started_at  = t.long_window_started_at - p_by,
         locked_until            = t.locked_until - p_by,
         limited_noted_until     = t.limited_noted_until - p_by
   where t.subject_kind = p_kind and t.subject_hash = decode(p_subject_hex, 'hex');
  if not found then raise exception 'tests.fx_recovery_shift: no throttle row for % %', p_kind, p_subject_hex; end if;
end
$$;

create or replace function tests.fx_recovery_break_trg() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if encode(new.handle_hash, 'hex') = tg_argv[0] and (tg_argv[1] = '' or new.kind = tg_argv[1]) then
    raise exception 'forced failure of the audit write (test lever)' using errcode = 'XX000';
  end if;
  return new;
end
$$;

create or replace function tests.fx_recovery_break_events(p_handle_hex text, p_kind text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  execute 'drop trigger if exists zz_fx_break_events on nestly.recovery_events';
  execute format('create trigger zz_fx_break_events before insert on nestly.recovery_events for each row execute function tests.fx_recovery_break_trg(%L, %L)',
                 p_handle_hex, coalesce(p_kind, ''));
end
$$;

create or replace function tests.fx_recovery_unbreak_events() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  execute 'drop trigger if exists zz_fx_break_events on nestly.recovery_events';
end
$$;

create or replace function tests.fx_recovery_new_account(p_email text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email) values (v, 'authenticated', 'authenticated', p_email);
  insert into nestly.users (id, account_type, status) values (v, 'regular', 'active');
  return v;
end
$$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
