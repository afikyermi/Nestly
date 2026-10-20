-- Rollback of 20261021200000_feed_intent_weight.sql. Run as app_owner, in one transaction. Drops the two columns; no row is touched.
-- Revert the code that reads them first.

begin;

alter table nestly.algorithm_configurations drop column intent_half_life_hours, drop column w_intent;

delete from supabase_migrations.schema_migrations where version = '20261021200000';

commit;
