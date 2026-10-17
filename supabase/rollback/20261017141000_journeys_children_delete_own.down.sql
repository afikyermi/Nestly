-- =====================================================================================================================
-- Down script for supabase/migrations/20261017141000_journeys_children_delete_own.sql (I2 F2.2b2; schema.md F2.2b "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Order:    revert the F2.2b2 routes with it (DELETE /api/children/:id, DELETE /api/journeys/:id, POST /api/journeys/:id/birth and
--           planning -> pregnant): without the grant they fail closed (42501 -> 500, nothing leaks).
-- Safe:     touches no row; rows the owners deleted stay gone (DR-1 A, data, not schema). Drops both policies, revokes the table
--           grant, restores the slot comment of 20261014200000 and the table comment of 20261017140000, deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the journeys and children delete down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop policy children_delete_own on nestly.children;

drop policy journey_contexts_delete_own on nestly.journey_contexts;

revoke delete on table nestly.children, nestly.journey_contexts from authenticated;

comment on column nestly.children.slot is
  'The child''s position in the parent''s list, 1 to 10 (VAL-040). Means nothing beyond order and the limit; not data about the child.';

comment on table nestly.journey_contexts is
  'SRS JourneyContext (§13, VAL-039): one row per stage the parent is in, ticked at registration or added later by the owner (F2.2b). Part of the parent''s account: deleted with the profile.';

delete from supabase_migrations.schema_migrations where version = '20261017141000';

commit;
