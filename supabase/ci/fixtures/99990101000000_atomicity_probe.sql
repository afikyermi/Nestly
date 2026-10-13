-- CI only — the failing migration of spec criterion 7 (I1 F1.1). Never placed under supabase/migrations: the `db`
-- job copies it, with the real migrations, into a scratch workdir and pushes it to the disposable database.
--
-- Every statement before the last one creates something. The last one fails. If the CLI applies a migration
-- atomically, the push fails with the message below and the database is left exactly as before (same catalog
-- fingerprint, no history row for 99990101000000). The version sorts after every real migration.

create schema ci_atomicity_probe;
create table ci_atomicity_probe.probe (id integer primary key);
create function ci_atomicity_probe.probe_fn() returns integer language sql as $$ select 1 $$;

do $$ begin raise exception 'atomicity probe: intended failure'; end $$;
