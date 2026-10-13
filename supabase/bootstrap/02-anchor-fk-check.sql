-- =====================================================================================================================
-- Bootstrap step 2 — verification. READ ONLY: one SELECT, changes nothing. Run as postgres after 02-anchor-fk.sql.
--
-- One row. Read `ok` first (the first column): true only when every other column matches the expected result below.
--
-- Column legend:
--   fk_exists        nestly.users has a constraint named users_id_fkey
--   definition       pg_get_constraintdef of it
--   on_delete        the ON DELETE action (Afik, 13.10.2026: restrict)
--   validated        the FK was checked against the existing rows (convalidated)
--   users_owner      the owner of nestly.users (must still be app_owner)
--   fks_to_auth      how many FKs from any nestly table reach into schema auth (exactly 1: the anchor)
--
-- EXPECTED RESULT (1 row):
--
--   ok | fk_exists | definition                                                   | on_delete | validated | users_owner | fks_to_auth
--   t  | t         | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT | restrict  | t         | app_owner   | 1
--
-- No row at all means nestly.users does not exist: the identity migration has not run in this project.
-- =====================================================================================================================

with users_tbl as (
  select c.oid, pg_get_userbyid(c.relowner) as owner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'nestly' and c.relname = 'users' and c.relkind = 'r'
),
anchor as (
  select co.*
  from pg_constraint co join users_tbl u on u.oid = co.conrelid
  where co.conname = 'users_id_fkey'
),
fks_to_auth as (
  select count(*) as n
  from pg_constraint co
  join pg_class c      on c.oid = co.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  join pg_class fc     on fc.oid = co.confrelid
  join pg_namespace fn on fn.oid = fc.relnamespace
  where co.contype = 'f' and ns.nspname = 'nestly' and fn.nspname = 'auth'
),
actual as (
  select
    exists (select 1 from anchor)                                            as fk_exists,
    (select pg_get_constraintdef(a.oid) from anchor a)                       as definition,
    (select case a.confdeltype when 'r' then 'restrict' when 'c' then 'cascade' when 'a' then 'no action'
                               when 'n' then 'set null' when 'd' then 'set default' end
       from anchor a)                                                        as on_delete,
    (select a.convalidated from anchor a)                                    as validated,
    u.owner                                                                  as users_owner,
    (select f.n from fks_to_auth f)                                          as fks_to_auth,
    (select a.contype = 'f'
        and a.confrelid = to_regclass('auth.users')
        and a.conkey = array[(select attnum from pg_attribute where attrelid = u.oid and attname = 'id')]
        and a.confkey = array[(select attnum from pg_attribute
                                where attrelid = to_regclass('auth.users') and attname = 'id')]
        and a.confupdtype = 'a' and a.confmatchtype = 's' and not a.condeferrable
       from anchor a)                                                        as shape_ok
  from users_tbl u
)
select
  coalesce(fk_exists and shape_ok and on_delete = 'restrict' and validated
           and users_owner = 'app_owner' and fks_to_auth = 1, false)        as ok,
  fk_exists, definition, on_delete, validated, users_owner, fks_to_auth
from actual;
