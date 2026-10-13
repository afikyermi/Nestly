-- =====================================================================================================================
-- CI only — the structural RLS gate (spec criterion 3; WORKPLAN 7.1; data-model.md platform rules 1, 2, 7–10).
-- Run as postgres in the disposable database. Never a migration, never in a real environment.
--
--   select check_name, object from tests.rls_gate();                 -- the product schema, nestly
--   select check_name, object from tests.rls_gate('<schema>');       -- any other schema, e.g. for fire-tests:
--   select ... from tests.rls_gate(pg_my_temp_schema()::regnamespace::text) where check_name = '…';
--   (app_server can create temp tables, views, sequences and pg_temp functions, so a fire-test can build a violating
--   object inside a transaction, as app_server, and roll it back.)
--
-- One row per violation: check_name, and the object named schema-qualified. No rows = the gate passes. A schema that
-- does not exist yields no rows except relation_in_public, which always looks at `public`.
--
--   check_name                    fires when                                                           rule
--   rls_disabled                  a table (or partitioned table) has RLS off                           r8, "every table"
--   force_rls_disabled            a table has FORCE ROW LEVEL SECURITY off                             r8
--   no_policy                     a table has no policy                                                "every table"
--   not_owned_by_app_owner        the schema, a table, view, materialized view, sequence, foreign      r1, r2
--                                 table or function is owned by anyone but app_owner
--   view_not_security_invoker     a view lacks security_invoker = true                                 r9
--   definer_not_approved          a SECURITY DEFINER function is not in tests.approved_security_definer r10
--   definer_without_search_path   a SECURITY DEFINER function has no fixed search_path                 r10
--   anon_privilege                anon holds any privilege on the schema, a relation, a column, a      r7
--                                 sequence or a function in it
--   relation_in_public            any table, view, sequence or foreign table exists in `public`        r7
--
-- Runs as SECURITY INVOKER: the catalogs and has_*_privilege() are readable by app_server.
-- =====================================================================================================================

begin;

create schema if not exists tests;

-- The approved SECURITY DEFINER functions, as regprocedure text (e.g. 'nestly.fn(uuid)'). This list must equal
-- .claude/knowledge/data-model.md → "Approved exceptions" — CRITIC checks that. Today that list is empty.
create or replace function tests.approved_security_definer()
returns setof text
language sql immutable
set search_path = ''
as $$
  select f from unnest(array[]::text[]) as f
$$;

create or replace function tests.rls_gate(p_schema name default 'nestly')
returns table (check_name text, object text)
language sql stable
set search_path = ''
as $$
  with target as (
    select n.oid as nsp_oid, n.nspname as nsp_name, n.nspowner as nsp_owner
    from pg_catalog.pg_namespace n
    where n.nspname = p_schema
  ),
  owner_role as (
    select to_regrole('app_owner') as role_oid
  ),
  rels as (
    select c.oid as rel_oid, c.relkind as kind, c.relowner as rel_owner, c.relrowsecurity as rls,
           c.relforcerowsecurity as force_rls, c.reloptions as options,
           format('%I.%I', t.nsp_name, c.relname) as label
    from pg_catalog.pg_class c
    join target t on t.nsp_oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  ),
  funcs as (
    select p.oid as fn_oid, p.proowner as fn_owner, p.prosecdef as definer, p.proconfig as config,
           p.oid::pg_catalog.regprocedure::text as label
    from pg_catalog.pg_proc p
    join target t on t.nsp_oid = p.pronamespace
  )
  select 'rls_disabled', r.label from rels r where r.kind in ('r', 'p') and not r.rls
  union all
  select 'force_rls_disabled', r.label from rels r where r.kind in ('r', 'p') and not r.force_rls
  union all
  select 'no_policy', r.label from rels r
  where r.kind in ('r', 'p') and not exists (select 1 from pg_catalog.pg_policy po where po.polrelid = r.rel_oid)
  union all
  select 'not_owned_by_app_owner', 'schema ' || quote_ident(t.nsp_name) from target t
  where t.nsp_owner is distinct from (select o.role_oid from owner_role o)
  union all
  select 'not_owned_by_app_owner', r.label from rels r
  where r.rel_owner is distinct from (select o.role_oid from owner_role o)
  union all
  select 'not_owned_by_app_owner', f.label from funcs f
  where f.fn_owner is distinct from (select o.role_oid from owner_role o)
  union all
  select 'view_not_security_invoker', r.label from rels r
  where r.kind = 'v'
    and not coalesce(
      (select split_part(opt, '=', 2)::boolean
       from unnest(r.options) as opt
       where split_part(opt, '=', 1) = 'security_invoker'),
      false)
  union all
  select 'definer_not_approved', f.label from funcs f
  where f.definer and f.label not in (select a from tests.approved_security_definer() as a)
  union all
  select 'definer_without_search_path', f.label from funcs f
  where f.definer and not exists (select 1 from unnest(f.config) as cfg where cfg like 'search\_path=%')
  union all
  select 'anon_privilege', 'schema ' || quote_ident(t.nsp_name) from target t
  where has_schema_privilege('anon', t.nsp_oid, 'USAGE, CREATE')
  union all
  select 'anon_privilege', r.label from rels r
  where r.kind <> 'S'
    and (has_table_privilege('anon', r.rel_oid,
                             'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
         or has_any_column_privilege('anon', r.rel_oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
  union all
  -- CASE, not AND: SQL does not fix the order AND evaluates in, and has_sequence_privilege raises on a non-sequence.
  select 'anon_privilege', r.label from rels r
  where case when r.kind = 'S' then has_sequence_privilege('anon', r.rel_oid, 'USAGE, SELECT, UPDATE') else false end
  union all
  select 'anon_privilege', f.label from funcs f
  where has_function_privilege('anon', f.fn_oid, 'EXECUTE')
  union all
  select 'relation_in_public', format('%I.%I', n.nspname, c.relname)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
$$;

revoke all     on all functions in schema tests from public;
grant  usage   on schema tests                  to app_server;
grant  execute on all functions in schema tests to app_server;

commit;
