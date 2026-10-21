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
--   matview_or_foreign_table      a materialized view or foreign table exists in the schema: neither   r8, "every table"
--                                 can carry RLS, so whoever holds SELECT reads every row. Allowed only
--                                 through data-model.md "Approved exceptions" (none today, so no list)
--
-- tests.rls_gate_product() is the product-wide verdict the CI job enforces (part a CRITIC finding 5): the gate over
-- `nestly` and over every other schema app_owner owns, except the Supabase CLI's history schema, plus:
--   product_schema_missing        `nestly` does not exist (the gate must never pass by finding nothing to look at)
--   history_schema_unexpected     `supabase_migrations` holds a relation or function other than the CLI's own tables
--                                 (it is exempt from the gate, so nothing else may live there)
--
-- Runs as SECURITY INVOKER: the catalogs and has_*_privilege() are readable by app_server.
-- =====================================================================================================================

begin;

create schema if not exists tests;

-- The approved SECURITY DEFINER functions, as regprocedure text (e.g. 'nestly.fn(uuid)'). This list must equal the
-- SECURITY DEFINER entries of .claude/knowledge/data-model.md → "Approved exceptions" — CRITIC checks that. profile_view, I4's two (rules 18 and 19) and, for the notifications,
-- F2.3b, DR-G1 (F1.6's entries are an Auth call sequence and a role, not functions). I4 adds two (rules 18 and 19; approved by Afik 20.10.2026). The notification triggers and People Search: rule 17, one narrow function per kind of write into another user's rows (approved by Afik 20.10.2026, with conditions). I10 adds notify_group (rule 17, the same shape: one definer for the Group notifications). The I11 follow-ups add notify_professional (rule 17, approved by Afik 21.10.2026: one definer for the Professional's notifications). The SRS-audit fixes add deliver_child_birthdays (rule 17, the I7 shape: the caller's own child_birthday notifications; approved by Afik 21.10.2026, night). The I14 completion adds child_tracker_trends (approved by Afik 21.10.2026, §9.2); completion B its calendar-period version (the same family; the 30/90/365-day one goes with the next migration) and identical_reports_hide (rule 17, the approved shape: a count over other people's reports; TO BE CONFIRMED BY AFIK, appendix B).
create or replace function tests.approved_security_definer()
returns setof text
language sql immutable
set search_path = ''
as $$
  select f from unnest(array['nestly.profile_view(text)', 'nestly.audit_trigger()', 'nestly.reveal_post_author(uuid)',
    'nestly.notify_friendship()', 'nestly.notify_comment()', 'nestly.notify_post()',
    'nestly.search_people(text,integer,integer)', 'nestly.notify_group()', 'nestly.notify_professional()',
    'nestly.child_tracker_trends(text,text,text,integer)', 'nestly.child_tracker_trends(text,text,text,text)',
    'nestly.identical_reports_hide()', 'nestly.deliver_child_birthdays()']::text[]) as f
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
  select 'matview_or_foreign_table', r.label from rels r where r.kind in ('m', 'f')
  union all
  select 'relation_in_public', format('%I.%I', n.nspname, c.relname)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
$$;

-- The product-wide verdict. Every schema app_owner owns is a product schema, so each one gets the full gate; the CLI's
-- history schema is the one exception, and only the CLI's own tables may live in it.
create or replace function tests.rls_gate_product()
returns table (check_name text, object text)
language sql stable
set search_path = ''
as $$
  select distinct g.check_name, g.object
  from (
    select n.nspname
    from pg_catalog.pg_namespace n
    where n.nspname = 'nestly'
       or (n.nspowner = (select to_regrole('app_owner')) and n.nspname <> 'supabase_migrations')
  ) s
  cross join lateral tests.rls_gate(s.nspname) g
  union
  select 'product_schema_missing', 'schema nestly'
  where not exists (select 1 from pg_catalog.pg_namespace n where n.nspname = 'nestly')
  union
  -- relation_in_public does not depend on the schema argument; this keeps it when no product schema exists at all.
  select g.check_name, g.object from tests.rls_gate('public') g where g.check_name = 'relation_in_public'
  union
  select 'history_schema_unexpected', format('%I.%I', n.nspname, c.relname)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'supabase_migrations'
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    and c.relname not in ('schema_migrations', 'seed_files')
  union
  select 'history_schema_unexpected', p.oid::pg_catalog.regprocedure::text
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'supabase_migrations'
$$;

revoke all     on all functions in schema tests from public;
grant  usage   on schema tests                  to app_server;
grant  execute on all functions in schema tests to app_server;
-- CI only: rls-gate-fire-owner.sql calls the gate as app_owner (a schema app_owner owns cannot be made by postgres).
grant  usage   on schema tests                  to app_owner;
grant  execute on all functions in schema tests to app_owner;

commit;
