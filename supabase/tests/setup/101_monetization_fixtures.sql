-- =====================================================================================================================
-- CI only — fixtures for 101_monetization.sql (I13: sample plans, simulated payments, promotions, promotion events). Run as postgres, in
-- name order (101_ sorts before 10_ by code point; it needs only the migration). Never a migration. Commits no row.
--
--   tests.fx_promo_end(promotion)    moves a promotion's period into the past (inside a test transaction only)
--   tests.fx_promo_age_events(promo) moves a promotion's events one day back (inside a test transaction only)
--   tests.fx_promo_count(sql_from)  count(*) of `select ... from <sql_from>` as postgres (RLS not applied): "no row was written" checks
--   tests.fx_promo_text(sql)         the first column of the first row of <sql> as text, as postgres (RLS not applied)
-- Definers owned by postgres, fixed search_path, executable by app_server only.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'the monetization fixtures must run as postgres (current_user is %)', current_user;
  end if;
  if to_regclass('nestly.promotions') is null then
    raise exception 'nestly.promotions is missing: run the I13 migration before these fixtures';
  end if;
end
$$;

create or replace function tests.fx_promo_end(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_promo_end: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.promotions set starts_at = starts_at - interval '40 days', ends_at = ends_at - interval '40 days',
         created_at = created_at - interval '40 days'
   where id = p_id;
  if not found then raise exception 'tests.fx_promo_end: no promotion %', p_id; end if;
end
$$;

create or replace function tests.fx_promo_age_events(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if transaction_timestamp() = statement_timestamp() then
    raise exception 'tests.fx_promo_age_events: call it inside the test transaction (its change would be committed)';
  end if;
  update nestly.promotion_events set occurred_on = occurred_on - 1 where promotion_id = p_id;
end
$$;

revoke all on function tests.fx_promo_age_events(uuid) from public;
grant execute on function tests.fx_promo_age_events(uuid) to app_server;

create or replace function tests.fx_promo_count(p_from text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  n bigint;
begin
  execute 'select count(*) from ' || p_from into n;
  return n;
end
$$;

create or replace function tests.fx_promo_text(p_sql text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v text;
begin
  execute p_sql into v;
  return v;
end
$$;

revoke all on function tests.fx_promo_end(uuid) from public;
revoke all on function tests.fx_promo_count(text) from public;
revoke all on function tests.fx_promo_text(text) from public;
grant execute on function tests.fx_promo_end(uuid) to app_server;
grant execute on function tests.fx_promo_count(text) to app_server;
grant execute on function tests.fx_promo_text(text) to app_server;

commit;
