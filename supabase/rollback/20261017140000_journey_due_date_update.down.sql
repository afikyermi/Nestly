-- =====================================================================================================================
-- Down script for supabase/migrations/20261017140000_journey_due_date_update.sql (I2 F2.2b1; schema.md F2.2b "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Order:    revert the F2.2b1 PUT /api/journeys/:id route with it: without the grant, the due-date edit fails closed (42501 -> 500,
--           nothing leaks). POST /api/journeys (add a pregnancy) needs no part of this migration.
-- Safe:     touches no row; due dates already edited stay (data, not schema). Drops the policy, revokes the column grant, restores
--           the table comment of 20261014200000 and deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the journey due-date update down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop policy journey_contexts_update_own on nestly.journey_contexts;

revoke update (due_date) on table nestly.journey_contexts from authenticated;

comment on table nestly.journey_contexts is
  'SRS JourneyContext (§13, VAL-039): one row per stage the parent ticked at registration. Part of the parent''s account: deleted with the profile.';

delete from supabase_migrations.schema_migrations where version = '20261017140000';

commit;
