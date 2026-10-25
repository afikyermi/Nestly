-- =====================================================================================================================
-- CI only — one md5 over the database's structure and the migration history. Run as postgres. Read only.
--
-- Used by the `db` job to show that a step changed nothing:
--   - a second `supabase db push` with nothing pending (spec criterion 6)
--   - a migration whose last statement fails (spec criterion 7)
--   - a second run of bootstrap step 2 (spec criterion 9)
--
-- Covers every schema except the system ones and the CLI's own bookkeeping schema (supabase_migrations, which the
-- CLI may create on its first run). From that schema only the applied versions count.
-- =====================================================================================================================

with nsp as (
  select n.oid, n.nspname, n.nspowner, n.nspacl
  from pg_catalog.pg_namespace n
  where n.nspname not in ('pg_catalog', 'information_schema', 'supabase_migrations')
    and n.nspname not like 'pg\_toast%'
    and n.nspname not like 'pg\_temp\_%'
),
items(item) as (
  select format('schema %I owner=%s acl=%s', n.nspname, n.nspowner::regrole, n.nspacl)
  from nsp n
  union all
  select format('rel %I.%I kind=%s owner=%s rls=%s force=%s options=%s acl=%s',
                n.nspname, c.relname, c.relkind, c.relowner::regrole,
                c.relrowsecurity, c.relforcerowsecurity, c.reloptions,
                -- NULL (never granted) and the owner's explicit default after a GRANT + REVOKE are the same privileges: a down script
                -- cannot set relacl back to NULL, so both read as the default
                coalesce(c.relacl, pg_catalog.acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner)))
  from pg_catalog.pg_class c join nsp n on n.oid = c.relnamespace
  union all
  select format('col %I.%I.%I %s notnull=%s default=%s acl=%s',
                n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
                pg_get_expr(d.adbin, d.adrelid), a.attacl)
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join nsp n on n.oid = c.relnamespace
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
  union all
  select format('con %I.%I %s', n.nspname, co.conname, pg_get_constraintdef(co.oid))
  from pg_catalog.pg_constraint co join nsp n on n.oid = co.connamespace
  union all
  select format('policy %s %I cmd=%s permissive=%s roles=%s using=%s check=%s',
                po.polrelid::regclass, po.polname, po.polcmd, po.polpermissive, po.polroles::regrole[],
                pg_get_expr(po.polqual, po.polrelid), pg_get_expr(po.polwithcheck, po.polrelid))
  from pg_catalog.pg_policy po
  join pg_catalog.pg_class c on c.oid = po.polrelid
  join nsp n on n.oid = c.relnamespace
  union all
  select format('function %s owner=%s definer=%s config=%s acl=%s body=%s',
                p.oid::regprocedure, p.proowner::regrole, p.prosecdef, p.proconfig, p.proacl, md5(p.prosrc))
  from pg_catalog.pg_proc p join nsp n on n.oid = p.pronamespace
  union all
  select format('trigger %s %I %s', t.tgrelid::regclass, t.tgname, pg_get_triggerdef(t.oid))
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join nsp n on n.oid = c.relnamespace
  where not t.tgisinternal
  union all
  select format('default-acl %s %s %s %s', da.defaclrole::regrole, da.defaclnamespace, da.defaclobjtype, da.defaclacl)
  from pg_catalog.pg_default_acl da
  union all
  select format('extension %I %s schema=%s', e.extname, e.extversion, e.extnamespace::regnamespace)
  from pg_catalog.pg_extension e
  union all
  -- The applied versions as a text array. An absent history table and an empty one both read '{}': the CLI creates the
  -- table lazily, on the first push that has a migration, and outside that migration's transaction.
  select 'history ' || coalesce(
    case when to_regclass('supabase_migrations.schema_migrations') is not null then
      xpath('/table/row/version/text()',
            query_to_xml('select version from supabase_migrations.schema_migrations order by version', false, false, ''))
        ::text[]::text
    end, '{}')
)
select md5(coalesce(string_agg(item, E'\n' order by item), '')) from items;
