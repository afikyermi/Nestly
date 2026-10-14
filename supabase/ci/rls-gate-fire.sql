-- =====================================================================================================================
-- CI only — shows that the gate checks app_server cannot fire from its own session do fire (part a CRITIC findings 3,
-- 4 and 5; spec criterion 4). Run as postgres after rls-gate.sql and bootstrap step 2, in the disposable database.
--
-- The pgTAP fire-tests (supabase/tests/02_rls_gate_fires.sql) run as app_server and build violations in its temp
-- schema. These need a role app_server does not have:
--   relation_in_public          a table in public
--   anon_privilege              anon holding USAGE on a schema itself (a scratch schema, and nestly)
--   not_owned_by_app_owner      a schema owned by someone other than app_owner
--   matview_or_foreign_table    a materialized view (never temporary) and a foreign table (needs a foreign server)
--   history_schema_unexpected   a relation in supabase_migrations
--   product_schema_missing      nestly absent
-- postgres reaches nestly and supabase_migrations as a member of their owner, app_owner (INHERIT TRUE).
--
-- One transaction, always rolled back. Each case creates its violation and records what the gate must report; one
-- check then raises, naming every expected row the gate did not return, which fails the CI step (ON_ERROR_STOP).
-- The companion file rls-gate-fire-owner.sql runs as app_owner (a schema it owns, other than nestly).
-- =====================================================================================================================

begin;

-- via: 'product' = tests.rls_gate_product(); otherwise the schema passed to tests.rls_gate().
create temp table fire_expect (via text not null, check_name text not null, object text not null);

create function pg_temp.assert_fired(p_label text) returns void
language plpgsql as $$
declare
  missing text;
  total int;
begin
  select count(*) into total from fire_expect;
  select string_agg(format('%s (%s) via %s', e.check_name, e.object, e.via), '; ' order by e.check_name, e.object)
    into missing
  from fire_expect e
  where not exists (
    select 1 from tests.rls_gate_product() g
    where e.via = 'product' and g.check_name = e.check_name and g.object = e.object
  )
  and not exists (
    select 1 from tests.rls_gate(e.via) g
    where e.via <> 'product' and g.check_name = e.check_name and g.object = e.object
  );
  if total = 0 then
    raise exception 'rls-gate-fire (%): no case was set up', p_label;
  end if;
  if missing is not null then
    raise exception 'rls-gate-fire (%): the gate did not report: %', p_label, missing;
  end if;
  raise notice 'rls-gate-fire (%): all % expected violations reported', p_label, total;
  truncate fire_expect;
end
$$;

-- 1. A table in public (platform r7).
create table public.zz_fire_public (id int);
insert into fire_expect values ('product', 'relation_in_public', 'public.zz_fire_public');

-- 2. A schema anon can use, owned by postgres: anon_privilege and not_owned_by_app_owner on the schema itself (r1, r7).
create schema zz_fire_schema;
grant usage on schema zz_fire_schema to anon;
insert into fire_expect values
  ('zz_fire_schema', 'anon_privilege', 'schema zz_fire_schema'),
  ('zz_fire_schema', 'not_owned_by_app_owner', 'schema zz_fire_schema');

-- 3. anon USAGE on the product schema itself (r7).
grant usage on schema nestly to anon;
insert into fire_expect values ('product', 'anon_privilege', 'schema nestly');

-- 4. A materialized view in the product schema: no RLS possible (finding 4).
create materialized view nestly.zz_fire_mv as select 1 as a with no data;
insert into fire_expect values ('product', 'matview_or_foreign_table', 'nestly.zz_fire_mv');

-- 5. A foreign table in the product schema: no RLS possible (finding 4).
create extension if not exists postgres_fdw;
create server zz_fire_srv foreign data wrapper postgres_fdw;
create foreign table nestly.zz_fire_ft (id int) server zz_fire_srv;
insert into fire_expect values ('product', 'matview_or_foreign_table', 'nestly.zz_fire_ft');

-- 6. Something other than the CLI's tables in the history schema, which is exempt from the gate (finding 5).
create table supabase_migrations.zz_fire_hist (id int);
insert into fire_expect values ('product', 'history_schema_unexpected', 'supabase_migrations.zz_fire_hist');

select pg_temp.assert_fired('violations');

-- 7. The product schema absent: the gate must not pass by finding nothing to look at (finding 5).
drop schema nestly cascade;
insert into fire_expect values ('product', 'product_schema_missing', 'schema nestly');
select pg_temp.assert_fired('nestly absent');

rollback;
