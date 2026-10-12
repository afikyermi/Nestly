-- =====================================================================================================================
-- Bootstrap step 1 — verification. READ ONLY: one SELECT, changes nothing. Run as postgres after 01-roles.sql.
--
-- One row per role. Read the `ok` column first: it is true only when every other column matches the expected
-- result below. If `ok` is false, compare the row against the expected result to see which column differs.
--
-- Column legend:
--   member_of     roles this role is a member of:      role(i=inherit s=set a=admin)
--   held_by       who is a member of this role:       member(i= s= a=) by grantor
--   create_on_db  CREATE on the current database (lets the role create schemas)
--   password      a password cannot be seen from SQL here: pg_roles always shows ******** and pg_authid is not
--                 readable by postgres on Supabase. Proof that a password is set is a successful login through the
--                 pooler as <role>.<project-ref> (README). valid_until is shown because it IS visible.
--
-- EXPECTED RESULT (3 rows, every `ok` = true):
--
--   role       | ok | login | super | bypassrls | repl  | createrole | createdb | inherit | create_on_db
--   app_jobs   | t  | false | false | false     | false | false      | false    | false   | false
--   app_owner  | t  | true  | false | false     | false | false      | false    | true    | true
--   app_server | t  | true  | false | false     | false | false      | false    | false   | false
--
--   member_of:
--     app_jobs     (none)
--     app_owner    authenticated(i=t s=f a=f)
--     app_server   anon(i=f s=t a=f), authenticated(i=f s=t a=f)
--   held_by:
--     app_jobs     postgres(i=f s=f a=t) by supabase_admin
--     app_owner    postgres(i=f s=f a=t) by supabase_admin, postgres(i=t s=f a=f) by postgres
--     app_server   postgres(i=f s=f a=t) by supabase_admin
--   (The "a=t by supabase_admin" rows are made by PostgreSQL itself: on 16+, the role that creates a role gets
--    ADMIN OPTION on it. The "i=t" row on app_owner is the script's `grant app_owner to postgres`.)
--   valid_until: null for all three.
--
-- Fewer than 3 rows means a role is missing: 01-roles.sql did not run (or did not commit) in this project.
-- =====================================================================================================================

with expected(role, login, inherit, create_on_db, member_of, held_by) as (
  values
    ('app_jobs',   false, false, false,
     '(none)',
     'postgres(i=f s=f a=t) by supabase_admin'),
    ('app_owner',  true,  true,  true,
     'authenticated(i=t s=f a=f)',
     'postgres(i=f s=f a=t) by supabase_admin, postgres(i=t s=f a=f) by postgres'),
    ('app_server', true,  false, false,
     'anon(i=f s=t a=f), authenticated(i=f s=t a=f)',
     'postgres(i=f s=f a=t) by supabase_admin')
),
actual as (
  select
    r.rolname                                                           as role,
    r.rolcanlogin                                                       as login,
    r.rolsuper                                                          as super,
    r.rolbypassrls                                                      as bypassrls,
    r.rolreplication                                                    as repl,
    r.rolcreaterole                                                     as createrole,
    r.rolcreatedb                                                       as createdb,
    r.rolinherit                                                        as inherit,
    has_database_privilege(r.oid, current_database(), 'CREATE')         as create_on_db,
    coalesce((
      select string_agg(format('%s(i=%s s=%s a=%s)', g.rolname,
                               left(m.inherit_option::text, 1), left(m.set_option::text, 1),
                               left(m.admin_option::text, 1)), ', ' order by g.rolname)
      from pg_auth_members m join pg_roles g on g.oid = m.roleid
      where m.member = r.oid), '(none)')                                as member_of,
    coalesce((
      select string_agg(format('%s(i=%s s=%s a=%s) by %s', mb.rolname,
                               left(m.inherit_option::text, 1), left(m.set_option::text, 1),
                               left(m.admin_option::text, 1), pg_get_userbyid(m.grantor)),
                        ', ' order by mb.rolname, m.admin_option desc, m.inherit_option)
      from pg_auth_members m join pg_roles mb on mb.oid = m.member
      where m.roleid = r.oid), '(none)')                                as held_by,
    'not visible from SQL; test by logging in'::text                    as password,
    r.rolvaliduntil                                                     as valid_until
  from pg_roles r
  where r.rolname in ('app_owner', 'app_server', 'app_jobs')
)
select
  a.role,
  (a.login = e.login and not a.super and not a.bypassrls and not a.repl and not a.createrole and not a.createdb
   and a.inherit = e.inherit and a.create_on_db = e.create_on_db
   and a.member_of = e.member_of and a.held_by = e.held_by
   and a.valid_until is null)                                            as ok,
  a.login, a.super, a.bypassrls, a.repl, a.createrole, a.createdb, a.inherit, a.create_on_db,
  a.member_of, a.held_by, a.password, a.valid_until
from actual a
join expected e on e.role = a.role
order by a.role;
