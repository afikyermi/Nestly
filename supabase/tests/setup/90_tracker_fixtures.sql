-- =====================================================================================================================
-- CI only -- fixtures for 86_trackers_cycle_guides.sql (I6). Run as postgres by the `db` job in name order, after the other
-- setup files. Never a migration. Definers owned by postgres, fixed search_path, executable by app_server only; only inside the
-- test transaction.
--
--   tests.fx_te_count() / fx_ce_count()   rows of tracker_events / cycle_entries, unfiltered
--   tests.fx_sg_count(status)             rows of status_guides with that status (all when null), unfiltered
--   tests.fx_sg_id(stage_kind, from)      the id of the SEED guide of that kind starting at that range (null for planning): one of
--                                         the nine drafts of 20261020100000, the oldest rows (one statement, one created_at);
--                                         guides a later migration added are never returned
--   tests.fx_sg_exec(sql)                 one UPDATE of nestly.status_guides as the owner role (publish, hide):
--                                         'OK:<rows>' or 'ERR:<sqlstate>'
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the tracker fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.tracker_events') is null then
    raise exception 'nestly.tracker_events is missing: run the migrations before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_te_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.tracker_events $$;

create or replace function tests.fx_ce_count() returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.cycle_entries $$;

create or replace function tests.fx_sg_count(p_status text default null) returns bigint
language sql stable security definer set search_path = ''
as $$ select count(*) from nestly.status_guides g where p_status is null or g.status = p_status $$;

create or replace function tests.fx_sg_id(p_kind text, p_from int default null) returns uuid
language sql stable security definer set search_path = ''
as $$ select g.id from nestly.status_guides g where g.stage_kind = p_kind and g.range_from is not distinct from p_from::smallint
        and g.created_at = (select min(s.created_at) from nestly.status_guides s) $$;

create or replace function tests.fx_sg_exec(p_sql text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_sg_exec: call it inside the test transaction';
  end if;
  if p_sql !~* '^\s*update\s+nestly\.status_guides\M' then
    raise exception 'tests.fx_sg_exec: only UPDATE on nestly.status_guides';
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

revoke all on all functions in schema tests from public;
grant usage on schema tests to app_server;
grant execute on all functions in schema tests to app_server;

commit;
