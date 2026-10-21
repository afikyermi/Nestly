-- =====================================================================================================================
-- CI only — fixtures for 99_marketplace.sql (I12: Marketplace listings, Sponsored Products, listing images, marketplace conversations,
-- listing reports). Run as postgres, in name order after 97_. Never a migration. Commits no row.
--
--   tests.fx_mkt_expire(listing)     moves a listing's expiry into the past (inside a test transaction only)
--   tests.fx_mkt_count(sql_from)     count(*) of `select ... from <sql_from>` as postgres (RLS not applied): "no row was written" checks
--   tests.fx_mkt_text(sql)           the first column of the first row of <sql> as text, as postgres (RLS not applied)
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the marketplace fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.marketplace_listings') is null then
    raise exception 'nestly.marketplace_listings is missing: run the I12 migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_mkt_expire(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_mkt_expire: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.marketplace_listings set created_at = created_at - interval '61 days', expires_at = expires_at - interval '61 days'
   where id = p_id;
  if not found then raise exception 'tests.fx_mkt_expire: no listing %', p_id; end if;
end
$$;

create or replace function tests.fx_mkt_count(p_from text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  execute 'select count(*) from ' || p_from into n;
  return n;
end
$$;

create or replace function tests.fx_mkt_text(p_sql text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v text;
begin
  execute p_sql into v;
  return v;
end
$$;

revoke all on function tests.fx_mkt_expire(uuid) from public;
revoke all on function tests.fx_mkt_count(text) from public;
revoke all on function tests.fx_mkt_text(text) from public;
grant execute on function tests.fx_mkt_expire(uuid) to app_server;
grant execute on function tests.fx_mkt_count(text) to app_server;
grant execute on function tests.fx_mkt_text(text) to app_server;

commit;
