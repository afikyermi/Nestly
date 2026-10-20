-- =====================================================================================================================
-- Bootstrap step 1 — the four product roles and their grants.
--
-- Source: .claude/knowledge/data-model.md rules 1, 2, 5, 6 and "The auth.users anchor and bootstrap steps" (step 1);
--         decisions.md 2026-10-11 "Migration path, migration role…" and "app_owner holds `authenticated`…";
--         .work/password-recovery/schema.md (F1.6: `app_recovery`, part (b) of the approved recovery exception).
--
-- Run as:   postgres, in the Supabase SQL Editor. Once per environment (nestly-preview, then nestly-prod).
--           nestly-prod: Afik only. See supabase/bootstrap/README.md.
-- Requires: PostgreSQL 16+ (GRANT … WITH INHERIT / SET). Verified shape on Supabase PG 17.11.
-- Re-run:   safe. Creates a role only if it is missing, then converges attributes and grants. It never touches a
--           password, and it never revokes: an unexpected membership or attribute stops the script with an error
--           instead of being silently repaired, because it means something else changed these roles.
-- Atomic:   one transaction. Any error rolls back everything this run did.
--
-- PASSWORDS — none in this file, by design (secrets are entered by Afik only).
--   A role created here has no password and CANNOT LOG IN until one is set. After this script, Afik types in the
--   SQL Editor, for each LOGIN role:   alter role app_owner  password '…';
--                                      alter role app_server password '…';
--   then waits ~20 s before using it (the pooler caches role credentials).
--   app_jobs is NOLOGIN (below) and gets no password yet.
--
-- What each role is:
--   app_owner   LOGIN. Owns the product schema; applies migrations from CI only, through the session pooler (5432).
--               Never used at runtime (rule 1). Grants: CREATE on this database (to create the product schema and
--               the CLI's supabase_migrations history schema — what T5 needed, nothing more), and `authenticated`
--               WITH INHERIT TRUE, SET FALSE (rule 5: the only way it can create and run objects calling auth.uid()).
--   app_server  LOGIN. The request server's role (rule 2). Owns nothing, can do nothing by itself: it holds
--               `authenticated` and `anon` WITH INHERIT FALSE, SET TRUE, so it acts only after SET LOCAL ROLE inside
--               the identity transaction (rule 3). NOINHERIT on the role as well, so any future grant made without
--               explicit options also defaults to fail-closed.
--   app_jobs    NOLOGIN for now. Background jobs (rule 6). The first job is decided: pg_cron runs the purge
--               (nestly.purge_held_content(), daily) as app_jobs, scheduled by bootstrap step 3 (03-cron.sql), so the
--               role stays NOLOGIN with no password and this file adds no grant. If a NOLOGIN role cannot run the job,
--               the fallbacks are in .work/i3-rest-schema/schema.md (E1). A role nobody can log in as has no
--               credential to leak. Any later job's LOGIN attribute and grants are decided with that job.
--               No memberships: cross-user reach is only ever an explicit `TO app_jobs` policy (rule 6).
--   app_recovery NOLOGIN, NOINHERIT, owns nothing, member of nothing. The guest role of the password-recovery flow
--               only (F1.6, data-model "Approved exceptions"): a signed-out request has no auth.uid(), and `anon` must hold
--               nothing in nestly. Granted to app_server alone, WITH INHERIT FALSE, SET TRUE, so it acts only after
--               SET LOCAL ROLE app_recovery inside a transaction. It sees only the rows of the email handle and the IP
--               hash the transaction declares, held by RLS + FORCE.
--   postgres    becomes a member of app_owner WITH INHERIT TRUE, SET FALSE, so it can add the one FK to auth.users
--               on a table app_owner owns (bootstrap step 2) and clean up after it. Admin-side only: postgres can
--               reach app_owner, never the reverse.
--
-- None of the four is SUPERUSER, BYPASSRLS, REPLICATION, CREATEROLE or CREATEDB, and none is a member of
-- service_role, authenticator, postgres or any other role than those listed above (rule 1).
--
-- NOT in this file: step 2 (the anchor FK to auth.users) and step 3 (extensions, pg_cron jobs).
-- Verify afterwards with supabase/bootstrap/01-roles-check.sql.
-- =====================================================================================================================

begin;

-- 0. Preconditions --------------------------------------------------------------------------------------------------
do $$
begin
  if current_user <> 'postgres' then
    raise exception '01-roles.sql must run as postgres (current_user is %)', current_user;
  end if;
  if current_setting('server_version_num')::int < 160000 then
    raise exception '01-roles.sql needs PostgreSQL 16+ (GRANT … WITH INHERIT / SET); this is %', version();
  end if;
end
$$;

-- 1. Create the roles that are missing (no password) ----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_owner') then
    create role app_owner  login   nosuperuser nobypassrls noreplication nocreatedb nocreaterole inherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_server') then
    create role app_server login   nosuperuser nobypassrls noreplication nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_jobs') then
    create role app_jobs   nologin nosuperuser nobypassrls noreplication nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_recovery') then
    create role app_recovery nologin nosuperuser nobypassrls noreplication nocreatedb nocreaterole noinherit;
  end if;
end
$$;

-- 2. Refuse to continue if a role carries a privilege this script must never grant ----------------------------------
--    (postgres is not a superuser on Supabase and cannot remove SUPERUSER, BYPASSRLS or REPLICATION; stop and escalate.)
do $$
declare
  r record;
begin
  for r in
    select rolname from pg_roles
    where rolname in ('app_owner', 'app_server', 'app_jobs', 'app_recovery') and (rolsuper or rolbypassrls or rolreplication)
  loop
    raise exception 'role % is SUPERUSER, BYPASSRLS or REPLICATION — not created by this script; stop and escalate', r.rolname;
  end loop;

  -- Memberships these roles hold beyond the ones granted below (e.g. service_role) are drift, never repaired here.
  for r in
    select r2.rolname as member, g.rolname as granted
    from pg_auth_members m
    join pg_roles r2 on r2.oid = m.member
    join pg_roles g  on g.oid  = m.roleid
    where (r2.rolname = 'app_owner'  and g.rolname <> 'authenticated')
       or (r2.rolname = 'app_server' and g.rolname not in ('authenticated', 'anon', 'app_recovery'))
       or (r2.rolname = 'app_jobs')
       or (r2.rolname = 'app_recovery')
  loop
    raise exception 'unexpected membership: % is a member of % — stop and escalate', r.member, r.granted;
  end loop;

  -- Only postgres may hold these roles (nothing at runtime may become app_owner, rule 1); app_recovery may also be held
  -- by app_server, and by nobody else.
  for r in
    select r2.rolname as member, g.rolname as granted
    from pg_auth_members m
    join pg_roles r2 on r2.oid = m.member
    join pg_roles g  on g.oid  = m.roleid
    where (g.rolname in ('app_owner', 'app_server', 'app_jobs') and r2.rolname <> 'postgres')
       or (g.rolname = 'app_recovery' and r2.rolname not in ('postgres', 'app_server'))
  loop
    raise exception 'unexpected membership: % is a member of % — stop and escalate', r.member, r.granted;
  end loop;
end
$$;

-- 3. Converge the attributes postgres is allowed to set (a re-run restores them; passwords are left untouched) -------
alter role app_owner  login   nocreatedb nocreaterole inherit;
alter role app_server login   nocreatedb nocreaterole noinherit;
alter role app_jobs   nologin nocreatedb nocreaterole noinherit;
alter role app_recovery nologin nocreatedb nocreaterole noinherit;

-- 4. Grants (re-granting with options updates them in place on PG 16+) ---------------------------------------------
grant authenticated to app_owner  with inherit true,  set false;   -- rule 5
grant authenticated to app_server with inherit false, set true;    -- rule 2
grant anon          to app_server with inherit false, set true;    -- rule 2 (guest endpoints, rule 4)
grant app_recovery  to app_server with inherit false, set true;    -- F1.6: the recovery flow only
grant app_owner     to postgres   with inherit true,  set false;   -- bootstrap step 2 needs it

do $$
begin
  execute format('grant create on database %I to app_owner', current_database());
end
$$;

commit;
