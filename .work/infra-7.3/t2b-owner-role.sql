-- T2 block B (nestly-preview only): the grants a dedicated migration owner (app_owner, decision R1) needs.
-- A throwaway role; dropped after T5.
create role probe_owner login nobypassrls;
grant create on database postgres to probe_owner;
grant usage on schema auth to probe_owner;
grant execute on function auth.uid() to probe_owner;
grant references on auth.users to probe_owner;
