-- =====================================================================================================================
-- Down script for supabase/migrations/20261027200000_plan_cache_chat_notifications.sql: drops the ten plan-cached read functions.
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
-- Safe:     only after the server code that calls these functions is rolled back too (that code sends the same SQL itself); no data,
--           table, policy or grant on a table is touched.
-- Restores: the schema as 20261027100000_birthdays_daily.sql left it; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the plan-cache (chat, notifications) down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop function nestly.chat_conversations();
drop function nestly.chat_pending_incoming();
drop function nestly.chat_pending_outgoing();
drop function nestly.chat_support_threads();
drop function nestly.chat_unread_count();
drop function nestly.notifications_latest(integer);
drop function nestly.notifications_latest_before(integer, timestamptz, uuid);
drop function nestly.notifications_unread_count();
drop function nestly.notifications_bell_counts(text[]);
drop function nestly.regular_names_visible(uuid[]);

delete from supabase_migrations.schema_migrations where version = '20261027200000';

commit;
