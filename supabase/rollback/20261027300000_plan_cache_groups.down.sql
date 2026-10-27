-- =====================================================================================================================
-- Down script for supabase/migrations/20261027300000_plan_cache_groups.sql: drops nestly.group_summaries() and
-- nestly.feed_group_suggestions(). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Safe:     only together with the server code that sends the statements inline again (the code before this migration); with the code
--           of this migration, GET /api/groups and the feed's Group unit fail until the functions exist.
-- Restores: the database before the migration (no table, policy or grant on a table changed); the history row is deleted.
-- =====================================================================================================================

begin;

drop function nestly.group_summaries(text, text, integer, integer, double precision, integer);
drop function nestly.feed_group_suggestions(integer, integer, double precision, integer);

delete from supabase_migrations.schema_migrations where version = '20261027300000';

commit;
