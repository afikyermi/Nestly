-- =====================================================================================================================
-- CI only — installs pgTAP into its own schema in the disposable database and lets app_server use it
-- (.work/identity-platform/schema.md, "CI `db` job" step 5). Run as postgres. Migrations never create this, the
-- structural checks never look at it, and it never reaches nestly-preview or nestly-prod.
--
-- The suite runs as app_server with search_path `pgtap, tests` (set by the job), so tests call plan(), is(), … and
-- the gate (tests.rls_gate, supabase/ci/rls-gate.sql) without a schema prefix.
-- =====================================================================================================================

begin;

create schema if not exists pgtap;
create extension if not exists pgtap with schema pgtap;

grant usage   on schema pgtap                   to app_server;
grant execute on all functions in schema pgtap  to app_server;

commit;
