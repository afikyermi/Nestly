-- =====================================================================================================================
-- CI only -- fixtures for the notification and People Search tests (file 90). Run as postgres by the `db` job in name order
-- AFTER 10_ .. 80_. Never a migration. Definers owned by postgres, fixed search_path, executable by app_server only.
--
--   tests.fx_nt_count(recipient)           notifications of the recipient, unfiltered
--   tests.fx_nt_types(recipient)           their types, oldest first, comma-separated ('' when none)
--   tests.fx_nt_one(recipient, type)       'actor=<uuid|-> target=<kind>:<uuid> critical=<t|f> read=<t|f>' of the one of that type, or ''
--   tests.fx_nt_actor_count(user)          notifications whose actor is the user
--   tests.fx_nt_purge()                    deletes every notification and preference (a test section starts clean)
--   tests.fx_nt_total()                    every notification
--   tests.fx_nt_pref(user, category, on)   a notification preference row, written as postgres
--   tests.fx_nt_follow(user, friend, on)   a friend-content preference row, written as postgres
--   tests.fx_ns_limit()                    the people_search limit as 'n/w', or 'none'
--   tests.fx_ns_set_limit(n, w)            stores the people_search limit
--   tests.fx_ns_break_limit(n, w)          drops the CHECKs of security_limits and stores n, w (invalid values)
--   tests.fx_ns_drop_limit()               deletes the people_search limit
--   tests.fx_ns_count(user)                counted searches inside the window
--   tests.fx_ns_seed(user, secs[])         the account's search instants: now() minus each number of seconds
--   tests.fx_ns_age(user, interval)        moves the account's search instants into the past
--   tests.fx_ns_events(user)               people_search_limit Security events of the account
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the notification fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.notifications') is null or to_regclass('nestly.people_search_counts') is null then
    raise exception 'the notification tables are missing: run the notifications migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_nt_count(p_id uuid) returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.notifications where recipient_id = p_id $$;

create or replace function tests.fx_nt_types(p_id uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(string_agg(n.type, ',' order by n.created_at, n.type), '') from nestly.notifications n where n.recipient_id = p_id $$;

create or replace function tests.fx_nt_one(p_id uuid, p_type text) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select 'actor=' || coalesce(n.actor_id::text, '-') || ' target=' || n.target_kind || ':' || n.target_id
                          || ' critical=' || left(n.is_critical::text, 1) || ' read=' || left((n.read_at is not null)::text, 1)
                     from nestly.notifications n where n.recipient_id = p_id and n.type = p_type limit 1), '')
$$;

create or replace function tests.fx_nt_actor_count(p_id uuid) returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.notifications where actor_id = p_id $$;

create or replace function tests.fx_nt_purge() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from nestly.notifications;
  delete from nestly.notification_preferences;
  delete from nestly.friend_content_notification_preferences;
end
$$;

create or replace function tests.fx_nt_total() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.notifications $$;

create or replace function tests.fx_nt_pref(p_user uuid, p_category text, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.notification_preferences (user_id, category, is_in_app_enabled) values (p_user, p_category, p_on)
  on conflict (user_id, category) do update set is_in_app_enabled = excluded.is_in_app_enabled;
end
$$;

create or replace function tests.fx_nt_follow(p_user uuid, p_friend uuid, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.friend_content_notification_preferences (user_id, friend_id, is_enabled) values (p_user, p_friend, p_on)
  on conflict (user_id, friend_id) do update set is_enabled = excluded.is_enabled;
end
$$;

create or replace function tests.fx_ns_limit() returns text
language sql stable security definer set search_path = ''
as $$ select coalesce((select l.max_count || '/' || l.window_seconds from nestly.security_limits l where l.limit_key = 'people_search'), 'none') $$;

create or replace function tests.fx_ns_set_limit(p_n integer, p_w integer) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.security_limits (limit_key, max_count, window_seconds) values ('people_search', p_n, p_w)
  on conflict (limit_key) do update set max_count = excluded.max_count, window_seconds = excluded.window_seconds;
end
$$;

create or replace function tests.fx_ns_break_limit(p_n integer default 0, p_w integer default 3600) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_ns_break_limit: call it inside the test transaction (the constraints would stay dropped)';
  end if;
  for r in select co.conname from pg_catalog.pg_constraint co
            where co.conrelid = 'nestly.security_limits'::regclass and co.contype = 'c' loop
    execute pg_catalog.format('alter table nestly.security_limits drop constraint %I', r.conname);
  end loop;
  insert into nestly.security_limits (limit_key, max_count, window_seconds) values ('people_search', p_n, p_w)
  on conflict (limit_key) do update set max_count = excluded.max_count, window_seconds = excluded.window_seconds;
end
$$;

create or replace function tests.fx_ns_drop_limit() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from nestly.security_limits where limit_key = 'people_search';
end
$$;

create or replace function tests.fx_ns_count(p_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((select count(*)::integer from nestly.people_search_counts c, pg_catalog.unnest(c.searched_at) t
                    where c.user_id = p_id
                      and t > pg_catalog.now() - pg_catalog.make_interval(secs =>
                            coalesce((select case when l.window_seconds >= 1 then l.window_seconds end from nestly.security_limits l where l.limit_key = 'people_search'), 3600))), 0)
$$;

create or replace function tests.fx_ns_seed(p_id uuid, p_secs integer[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into nestly.people_search_counts (user_id, searched_at, is_refusal_recorded)
  values (p_id, array(select pg_catalog.now() - pg_catalog.make_interval(secs => s) from pg_catalog.unnest(p_secs) s order by 1), false)
  on conflict (user_id) do update set searched_at = excluded.searched_at, is_refusal_recorded = false;
end
$$;

create or replace function tests.fx_ns_age(p_id uuid, p_age interval) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update nestly.people_search_counts c set searched_at = array(select t - p_age from pg_catalog.unnest(c.searched_at) t order by 1)
   where c.user_id = p_id;
  if not found then raise exception 'tests.fx_ns_age: no search count for %', p_id; end if;
end
$$;

create or replace function tests.fx_ns_events(p_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$ select count(*)::integer from nestly.security_events e where e.user_id = p_id and e.kind = 'people_search_limit' $$;

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
