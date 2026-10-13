-- =====================================================================================================================
-- Read only — proves that auth.uid(), auth.role() and auth.jwt() on the target are the pinned definitions
-- (.work/identity-platform/schema.md, "Addendum 1 — CI auth functions", step 2).
--
-- Runs in the CI `db` job after supabase/ci/auth-functions.sql, and in both migrate jobs before `supabase db push`, so
-- every pgTAP result was produced by the function text that the migration's target runs. Runs as any role that can
-- read the catalogs (postgres, app_owner). Writes nothing.
--
-- Normalized sha256 = sha256 of pg_get_functiondef with every run of whitespace collapsed to one space, then trimmed:
-- a line-ending or trailing-space change cannot fail it; a change to a name, a setting key, a cast, volatility,
-- SECURITY DEFINER or a SET does. On a mismatch the error prints the target's normalized definition (public Supabase
-- code, no secret), so a re-pin can be made from the log. The pinned values are held here and nowhere else.
-- =====================================================================================================================

begin read only;

do $$
declare
  names    constant text[] := array['uid', 'role', 'jwt'];
  pinned   constant text[] := array[
    'd6dbd1274f41320d098fa39bbf8a1949bc608a6092e7d996ba21453e068f644b',  -- auth.uid()
    '63428ce1089b4f6517fbbc1c7ddd0d710b335032d20210d750353229e48a64cb',  -- auth.role()
    '96c51f009347aad9a3e8292d05dd1fc6ffda46bf4b641335d452909994750bee'   -- auth.jwt()
  ];
  problems text[] := '{}';
  fn       oid;
  label    text;
  normal   text;
begin
  if not has_schema_privilege('authenticated', 'auth', 'USAGE') then
    problems := problems || 'role authenticated lacks USAGE on schema auth'::text;
  end if;

  for i in 1 .. cardinality(names) loop
    label := format('auth.%s()', names[i]);
    -- Looked up in the catalog, not by name resolution, so the caller needs no USAGE on schema auth.
    select p.oid into fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = names[i] and p.pronargs = 0;

    if fn is null then
      problems := problems || format('%s does not exist', label);
      continue;
    end if;

    normal := btrim(regexp_replace(pg_get_functiondef(fn), '\s+', ' ', 'g'));
    if encode(sha256(convert_to(normal, 'UTF8')), 'hex') <> pinned[i] then
      problems := problems || format('%s differs from the pinned definition; on this database it is: %s', label, normal);
    end if;

    if not has_function_privilege('authenticated', fn, 'EXECUTE') then
      problems := problems || format('role authenticated lacks EXECUTE on %s', label);
    end if;
  end loop;

  if cardinality(problems) > 0 then
    raise exception 'auth functions check failed (supabase/ci/auth-functions-check.sql): %',
      array_to_string(problems, ' | ');
  end if;

  raise notice 'auth functions check OK: auth.uid(), auth.role(), auth.jwt() match the pinned definitions';
end
$$;

commit;
