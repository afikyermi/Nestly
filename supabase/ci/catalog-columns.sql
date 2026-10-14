-- =====================================================================================================================
-- CI only — every column of every table, view and materialized view outside the system schemas, as one JSON array.
-- Read only. Run as postgres in the disposable database after the migrations (spec criterion 20). The `db` job writes
-- it to a file that apps/server/scripts/db-drift.ts compares with the Drizzle schema.
--
--   [{"schema":"nestly","table":"users","column":"id","type":"uuid","notNull":true}, …]
--
-- `type` is format_type(), the database's own spelling (e.g. "timestamp with time zone", "character varying(60)").
-- =====================================================================================================================

select coalesce(
  json_agg(
    json_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'column', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull
    )
    order by n.nspname, c.relname, a.attnum
  ),
  '[]'::json
)
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and a.attnum > 0
  and not a.attisdropped
  and n.nspname not in ('pg_catalog', 'information_schema')
  and n.nspname not like 'pg\_toast%'
  and n.nspname not like 'pg\_temp\_%';
