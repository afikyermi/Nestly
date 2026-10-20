-- Rollback of 20261021200000_feed_intent_weight.sql. Run as app_owner, in one transaction.
-- Restores: v1 active, v2 removed, the two columns dropped. The append-only guard is disabled for these two statements only (the owner
-- role, in this transaction): a down script is the one path that undoes a version. Any version above 2 stops it: forward fix instead.

begin;

do $$
begin
  if exists (select 1 from nestly.algorithm_configurations where version > 2) then
    raise exception 'a configuration version above 2 exists: rolling back would orphan it. Stop: forward fix';
  end if;
end
$$;

alter table nestly.algorithm_configurations no force row level security;
alter table nestly.algorithm_configurations disable trigger algorithm_configurations_guard;
delete from nestly.algorithm_configurations where surface = 'regular_feed' and version = 2;
update nestly.algorithm_configurations set is_active = true where surface = 'regular_feed' and version = 1;
alter table nestly.algorithm_configurations enable trigger algorithm_configurations_guard;
alter table nestly.algorithm_configurations force row level security;

alter table nestly.algorithm_configurations drop column intent_half_life_hours, drop column w_intent;

delete from supabase_migrations.schema_migrations where version = '20261021200000';

commit;
