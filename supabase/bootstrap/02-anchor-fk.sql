-- =====================================================================================================================
-- Bootstrap step 2 — the anchor's FK: nestly.users (id) -> auth.users (id), ON DELETE RESTRICT.
--
-- Source: .claude/knowledge/data-model.md "The auth.users anchor and bootstrap steps" (step 2);
--         .work/identity-platform/schema.md "Bootstrap step 2"; ON DELETE RESTRICT decided by Afik on 13.10.2026
--         (decisions/2026-10.md, "I1 open points"): an Auth user who still has a Nestly account cannot be deleted;
--         deletion goes through an orderly deletion flow (I9).
--
-- Why postgres: app_owner cannot hold REFERENCES on auth.users (postgres lacks grant option, T5). postgres adds the
-- FK as itself — not SET ROLE — on a table it reaches as a member of the owner, app_owner (INHERIT TRUE, step 1).
--
-- Run as:   postgres, in the Supabase SQL Editor, once per environment, after the identity migration
--           (20261014100000_identity_schema) and before F1.4 (the first writer) deploys. nestly-prod: Afik only.
--           See supabase/bootstrap/README.md.
-- Re-run:   safe. If the FK exists exactly as below, nothing changes. If it exists in any other form, or another FK
--           from nestly reaches into auth, the script stops with an error and repairs nothing: something else
--           changed it.
-- Atomic:   one transaction.
-- Verify afterwards with supabase/bootstrap/02-anchor-fk-check.sql.
-- =====================================================================================================================

begin;

do $$
declare
  v_users     regclass := to_regclass('nestly.users');
  v_auth      regclass := to_regclass('auth.users');
  v_owner     name;
  v_con       record;
  v_users_id  smallint;
  v_auth_id   smallint;
  v_other     text;
begin
  -- 0. Preconditions --------------------------------------------------------------------------------------------------
  if current_user <> 'postgres' then
    raise exception '02-anchor-fk.sql must run as postgres (current_user is %)', current_user;
  end if;
  if v_auth is null then
    raise exception 'auth.users does not exist: this is not a Supabase database';
  end if;
  if v_users is null then
    raise exception 'nestly.users does not exist: apply the migrations (20261014100000_identity_schema) first';
  end if;
  select pg_get_userbyid(c.relowner) into v_owner from pg_class c where c.oid = v_users;
  if v_owner <> 'app_owner' then
    raise exception 'nestly.users is owned by %, not app_owner: stop and escalate', v_owner;
  end if;

  select a.attnum into v_users_id from pg_attribute a where a.attrelid = v_users and a.attname = 'id' and not a.attisdropped;
  select a.attnum into v_auth_id  from pg_attribute a where a.attrelid = v_auth  and a.attname = 'id' and not a.attisdropped;
  if v_users_id is null or v_auth_id is null then
    raise exception 'nestly.users.id or auth.users.id is missing: stop and escalate';
  end if;

  -- 1. No other FK from nestly may reach into auth (data-model: exactly one product table references auth.users) ------
  select string_agg(format('%s.%s', co.conrelid::regclass, co.conname), ', ') into v_other
  from pg_constraint co
  join pg_class c      on c.oid = co.conrelid
  join pg_namespace n  on n.oid = c.relnamespace
  join pg_class fc     on fc.oid = co.confrelid
  join pg_namespace fn on fn.oid = fc.relnamespace
  where co.contype = 'f' and n.nspname = 'nestly' and fn.nspname = 'auth'
    and not (co.conrelid = v_users and co.conname = 'users_id_fkey');
  if v_other is not null then
    raise exception 'unexpected FK from nestly to auth: % — never repaired here; stop and escalate', v_other;
  end if;

  -- 2. Add the FK, or prove the existing one is exactly it -------------------------------------------------------------
  select co.* into v_con from pg_constraint co where co.conrelid = v_users and co.conname = 'users_id_fkey';

  if not found then
    alter table nestly.users
      add constraint users_id_fkey foreign key (id) references auth.users (id) on delete restrict;
    raise notice 'bootstrap step 2: users_id_fkey added (nestly.users.id -> auth.users.id, ON DELETE RESTRICT)';
  elsif v_con.contype = 'f'
    and v_con.confrelid = v_auth
    and v_con.conkey = array[v_users_id]
    and v_con.confkey = array[v_auth_id]
    and v_con.confdeltype = 'r'   -- RESTRICT
    and v_con.confupdtype = 'a'   -- NO ACTION (ids never change)
    and v_con.confmatchtype = 's' -- MATCH SIMPLE
    and not v_con.condeferrable
    and v_con.convalidated
  then
    raise notice 'bootstrap step 2: users_id_fkey already present and identical; nothing to do';
  else
    raise exception 'users_id_fkey exists but differs (%): never repaired here; stop and escalate',
      pg_get_constraintdef(v_con.oid);
  end if;
end
$$;

commit;
