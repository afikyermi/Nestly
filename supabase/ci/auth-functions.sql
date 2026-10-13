-- =====================================================================================================================
-- CI only — never a migration. Installs the deployed definitions of auth.uid(), auth.role() and auth.jwt() on the
-- disposable supabase/postgres image, whose own definitions do not read request.jwt.claims
-- (.work/identity-platform/schema.md, "Addendum 1 — CI auth functions").
--
-- Source: nestly-preview, read with tools/db-preview.mjs (begin read only; pg_get_functiondef) on 14.10.2026.
-- Do not edit by hand. Re-pin per Addendum 1 step 4 ("Re-pin procedure"): this file and the three hashes in
-- supabase/ci/auth-functions-check.sql change together, and the check proves they agree on every CI run.
--
-- Run as a superuser (the image's supabase_admin). One transaction: all three or none.
-- =====================================================================================================================

begin;

do $$
begin
  if not coalesce((select rolsuper from pg_roles where rolname = session_user), false) then
    raise exception 'auth-functions.sql must run as a superuser (session_user is %)', session_user;
  end if;
  if to_regrole('supabase_auth_admin') is null then
    raise exception 'auth-functions.sql: role supabase_auth_admin does not exist';
  end if;
end
$$;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;

CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;

alter function auth.uid()  owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.jwt()  owner to supabase_auth_admin;

grant execute on function auth.uid()  to public;
grant execute on function auth.role() to public;
grant execute on function auth.jwt()  to public;

commit;
