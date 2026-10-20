-- =====================================================================================================================
-- CI only -- fixtures for the profile-open limit tests (I2 F2.4c1, .work/friends/spec.md c20-c24; schema.md F2.4c1 "pgTAP").
-- Run as postgres by the `db` job, in name order AFTER 10_ .. 60_ (ci.yml: "for f in supabase/tests/setup/*.sql"). Never a migration.
--
-- WHY. The suite runs as app_server, which cannot see schema nestly; the three F2.4c1 tables are closed to every runtime role
-- (that is what is under test), so the tests reach them only through these definers, owned by postgres (a member of
-- app_owner, BYPASSRLS), fixed search_path, executable by app_server only. The pgTAP files call them inside their own
-- transaction (rolled back); the server db tests (tests/db/) call them outside one and restore the Configuration themselves.
--
--   tests.fx_set_limit(n, w)           the Configuration row 'profile_open' = n opens per w seconds (inserts it if it was dropped)
--   tests.fx_drop_limit()              deletes the Configuration row (absent: every open must fail closed, c22)
--   tests.fx_break_limit(n, w)         drops the CHECKs of security_limits and stores n, w (0 / negative: invalid, c22);
--                                      DDL, so inside a test transaction only
--   tests.fx_limit()                   'n/w' of the row, 'none' when absent;  tests.fx_limit_rows()  how many rows it holds
--   tests.fx_seed_opens(id, secs[])    the account's open times become now() - each of secs (the row is created if needed)
--   tests.fx_age_opens(id, interval)   every stored open time of the account moves back by the interval
--   tests.fx_open_count(id)            the opens of the account inside the configured window (3600 s when the window is absent or invalid)
--   tests.fx_events(id)                how many Security events the account has;  fx_events_total() all of them
--   tests.fx_event_kinds(id)           their kinds, distinct, comma-joined;  fx_event_columns() the table's column names, sorted
--   tests.fx_event_recent(id)          how many of them carry an occurred_at within a minute of now()
--   tests.fx_open_reset(id)            deletes the account's open count and Security events (cleanup of a committed test)
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the open-limit fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.security_limits') is null or to_regclass('nestly.profile_open_counts') is null
     or to_regclass('nestly.security_events') is null then
    raise exception 'the F2.4c1 tables are missing: run the F2.4c1 migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_set_limit(p_n integer, p_w integer) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.security_limits (limit_key, max_count, window_seconds) values ('profile_open', p_n, p_w)
  on conflict (limit_key) do update set max_count = excluded.max_count, window_seconds = excluded.window_seconds;
end
$$;

create or replace function tests.fx_drop_limit() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from nestly.security_limits where limit_key = 'profile_open';
end
$$;

create or replace function tests.fx_break_limit(p_n integer default 0, p_w integer default 3600) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_break_limit: call it inside the test transaction (the constraints would stay dropped)';
  end if;
  for r in select co.conname from pg_catalog.pg_constraint co
            where co.conrelid = 'nestly.security_limits'::regclass and co.contype = 'c' loop
    execute pg_catalog.format('alter table nestly.security_limits drop constraint %I', r.conname);
  end loop;
  insert into nestly.security_limits (limit_key, max_count, window_seconds) values ('profile_open', p_n, p_w)
  on conflict (limit_key) do update set max_count = excluded.max_count, window_seconds = excluded.window_seconds;
end
$$;

create or replace function tests.fx_limit() returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select l.max_count || '/' || l.window_seconds from nestly.security_limits l where l.limit_key = 'profile_open'), 'none') $$;

create or replace function tests.fx_limit_rows() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.security_limits where limit_key = 'profile_open' $$;

create or replace function tests.fx_seed_opens(p_id uuid, p_secs integer[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.profile_open_counts (user_id, opened_at, is_refusal_recorded)
  values (p_id, array(select pg_catalog.now() - pg_catalog.make_interval(secs => s) from pg_catalog.unnest(p_secs) s order by 1), false)
  on conflict (user_id) do update set opened_at = excluded.opened_at, is_refusal_recorded = false;
end
$$;

create or replace function tests.fx_age_opens(p_id uuid, p_age interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.profile_open_counts c set opened_at = array(select t - p_age from pg_catalog.unnest(c.opened_at) t order by 1)
   where c.user_id = p_id;
  if not found then raise exception 'tests.fx_age_opens: no open count for %', p_id; end if;
end
$$;

create or replace function tests.fx_open_count(p_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((select count(*)::integer from nestly.profile_open_counts c, pg_catalog.unnest(c.opened_at) t
                    where c.user_id = p_id
                      and t > pg_catalog.now() - pg_catalog.make_interval(secs =>
                            coalesce((select case when l.window_seconds >= 1 then l.window_seconds end from nestly.security_limits l where l.limit_key = 'profile_open'), 3600))), 0)
$$;

create or replace function tests.fx_events(p_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$ select count(*)::integer from nestly.security_events e where e.user_id = p_id $$;

create or replace function tests.fx_events_total() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.security_events $$;

create or replace function tests.fx_event_kinds(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(string_agg(distinct e.kind, ',' order by e.kind), '') from nestly.security_events e where e.user_id = p_id $$;

create or replace function tests.fx_event_columns() returns text
language sql stable security definer set search_path = ''
as $$
  select string_agg(a.attname, ', ' order by a.attname)
    from pg_catalog.pg_attribute a
   where a.attrelid = 'nestly.security_events'::regclass and a.attnum > 0 and not a.attisdropped
$$;

create or replace function tests.fx_event_recent(p_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from nestly.security_events e
   where e.user_id = p_id and e.occurred_at between pg_catalog.now() - interval '1 minute' and pg_catalog.now() + interval '1 minute'
$$;

create or replace function tests.fx_open_reset(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from nestly.security_events where user_id = p_id;
  delete from nestly.profile_open_counts where user_id = p_id;
end
$$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
