-- =====================================================================================================================
-- CI only — fixtures for 110_account_deletion.sql (I9 part 1: account deletion). Run as postgres by the `db` job, in name order (110_
-- sorts after 10_; everything it calls at test time exists by then). Never a migration. Commits no row.
--
--   tests.fx_dl_exec(sql)        one statement as postgres (bypasses RLS: the observer's and the fixture writer's view): 'OK:<rows>' or
--                                'ERR:<sqlstate>' (inside a test transaction only)
--   tests.fx_dl_text(sql)        the first column of one query as postgres, as text (unfiltered observer)
--   tests.fx_dl_person(type)     a fresh Auth user with an active nestly.users row of that type (regular: with a profile; professional:
--                                with a professional profile); returns its id (inside a test transaction only)
--   tests.fx_dl_due(id, by)      moves a scheduled account's due date `by` into the past (as if 30 days went by)
--   tests.fx_dl_age(id, by)      moves an account's deletion rows `by` into the past (as if 90 days or 12 months went by)
-- The jobs run as app_jobs through 71_'s tests.jobs_as (membership granted and revoked inside the test transaction).
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the account deletion fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.account_deletion_events') is null then
    raise exception 'nestly.account_deletion_events is missing: run the I9 account deletion migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_dl_exec(p_sql text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_dl_exec: call it inside the test transaction (its change would be committed)';
  end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    return 'OK:' || n;
  exception when others then
    return 'ERR:' || sqlstate;
  end;
end
$$;

create or replace function tests.fx_dl_text(p_sql text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v text;
begin
  execute p_sql into v;
  return v;
end
$$;

create or replace function tests.fx_dl_person(p_type text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v uuid := gen_random_uuid();
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_dl_person: call it inside the test transaction (its rows would be committed)';
  end if;
  insert into auth.users (id, aud, role, email) values (v, 'authenticated', 'authenticated', 'i9-' || v::text || '@example.invalid');
  insert into nestly.users (id, account_type, status) values (v, p_type, 'active');
  if p_type = 'regular' then
    insert into nestly.regular_profiles (user_id, full_name) values (v, 'Deleted Person');
  elsif p_type = 'professional' then
    insert into nestly.professional_profiles (user_id, full_name, field, years_experience) values (v, 'Pro Person', 'doula', 3);
  end if;
  return v;
end
$$;

create or replace function tests.fx_dl_due(p_id uuid, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_dl_due: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.users set deletion_due_at = deletion_due_at - p_by where id = p_id and status = 'deletion_scheduled';
  update nestly.account_deletion_events set due_at = due_at - p_by, created_at = created_at - p_by where account_id = p_id;
end
$$;

create or replace function tests.fx_dl_age(p_id uuid, p_by interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_dl_age: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.account_deletion_events set created_at = created_at - p_by where account_id = p_id;
end
$$;

revoke all on function tests.fx_dl_exec(text) from public;
revoke all on function tests.fx_dl_text(text) from public;
revoke all on function tests.fx_dl_person(text) from public;
revoke all on function tests.fx_dl_due(uuid, interval) from public;
revoke all on function tests.fx_dl_age(uuid, interval) from public;
grant execute on function tests.fx_dl_exec(text) to app_server;
grant execute on function tests.fx_dl_text(text) to app_server;
grant execute on function tests.fx_dl_person(text) to app_server;
grant execute on function tests.fx_dl_due(uuid, interval) to app_server;
grant execute on function tests.fx_dl_age(uuid, interval) to app_server;

commit;
