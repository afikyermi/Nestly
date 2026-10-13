-- =====================================================================================================================
-- CI only — proves what the disposable supabase/postgres image must provide before anything runs on it
-- (.work/identity-platform/schema.md, "CI `db` job" step 1, the [A] assumption). Run as postgres. Read only.
--
-- Fails with one error listing everything missing. On failure the schema.md fallback applies (the CLI local stack);
-- if that fails too, it is a MATERIAL CHANGE back to DATA ARCHITECT.
-- =====================================================================================================================

do $$
declare
  missing text[] := '{}';
  probe   uuid   := '00000000-0000-4000-8000-0000000000a1';
begin
  if current_setting('server_version_num')::int < 170000 then
    missing := missing || format('PostgreSQL 17+ (this is %s)', current_setting('server_version'));
  end if;

  if to_regrole('anon') is null then missing := missing || 'role anon'::text; end if;
  if to_regrole('authenticated') is null then missing := missing || 'role authenticated'::text; end if;

  if to_regclass('auth.users') is null then
    missing := missing || 'table auth.users'::text;
  elsif not exists (
    select 1 from pg_attribute
    where attrelid = to_regclass('auth.users') and attname = 'id' and atttypid = 'uuid'::regtype and not attisdropped
  ) then
    missing := missing || 'column auth.users.id of type uuid'::text;
  end if;

  -- Platform rule 3 sets request.jwt.claims; auth.uid() and auth.role() must read it.
  perform set_config('request.jwt.claims', json_build_object('sub', probe, 'role', 'authenticated')::text, true);
  if to_regprocedure('auth.uid()') is null then
    missing := missing || 'function auth.uid()'::text;
  elsif auth.uid() is distinct from probe then
    missing := missing || 'auth.uid() reading the sub of request.jwt.claims'::text;
  end if;
  if to_regprocedure('auth.role()') is null then
    missing := missing || 'function auth.role()'::text;
  elsif auth.role() is distinct from 'authenticated' then
    missing := missing || 'auth.role() reading the role of request.jwt.claims'::text;
  end if;
  perform set_config('request.jwt.claims', '', true);

  if not exists (select 1 from pg_available_extensions where name = 'pgtap') then
    missing := missing || 'extension pgtap (available to install)'::text;
  end if;

  if cardinality(missing) > 0 then
    raise exception 'the supabase/postgres image lacks: %', array_to_string(missing, '; ');
  end if;

  raise notice 'image preflight OK: PostgreSQL %, postgres rolsuper = %',
    current_setting('server_version'), (select rolsuper from pg_roles where rolname = current_user);
end
$$;
