-- =====================================================================================================================
-- Down script for supabase/migrations/20261020100000_notifications_search.sql (notifications, preferences, People Search).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md "Never").
-- Order:    revert the notification and search server and web code first, then run this.
-- Safe:     only while notifications, notification_preferences, friend_content_notification_preferences and people_search_counts
--           hold no row and no people_search_limit Security event exists. FORCE RLS would hide rows from app_owner, so it is lifted
--           inside this transaction first and the check is real.
-- Restores: the security_limits and security_events CHECKs as 20261017170000 left them; removes the people_search limit row;
--           drops the four triggers, the definers, the helpers, every policy this migration added to an older table, the four
--           tables; deletes only its own history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the notifications_search down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.notifications no force row level security;
alter table nestly.notification_preferences no force row level security;
alter table nestly.friend_content_notification_preferences no force row level security;
alter table nestly.people_search_counts no force row level security;
alter table nestly.search_intents no force row level security;
alter table nestly.security_events no force row level security;

do $$
begin
  if exists (select 1 from nestly.notifications)
     or exists (select 1 from nestly.notification_preferences)
     or exists (select 1 from nestly.friend_content_notification_preferences)
     or exists (select 1 from nestly.people_search_counts)
     or exists (select 1 from nestly.search_intents)
     or exists (select 1 from nestly.security_events where kind = 'people_search_limit') then
    raise exception 'a notifications or search table holds a row (or a people_search_limit event exists): rolling back would delete user data or a Security record. Stop: forward fix, or Afik''s decision';
  end if;
end
$$;

alter table nestly.security_events force row level security;

drop trigger notify_post on nestly.posts;
drop trigger notify_comment on nestly.comments;
drop trigger notify_friendship_accept on nestly.friendships;
drop trigger notify_friendship_insert on nestly.friendships;

drop function nestly.search_people(text, integer, integer);
drop function nestly.notify_post();
drop function nestly.notify_comment();
drop function nestly.notify_friendship();
drop function nestly.notify_deliver(uuid, text, text, uuid, text, uuid, uuid, boolean);

drop policy users_select_search on nestly.users;
drop policy regular_names_select_search on nestly.regular_names;
drop policy security_events_insert_search on nestly.security_events;
drop policy security_limits_select_search_people on nestly.security_limits;
drop policy friendships_select_notify on nestly.friendships;
drop policy comments_select_notify on nestly.comments;
drop policy post_authors_select_notify on nestly.post_authors;
drop policy posts_select_notify on nestly.posts;

drop function nestly.purge_search_intents();
drop table nestly.search_intents;
drop table nestly.people_search_counts;
drop table nestly.friend_content_notification_preferences;
drop table nestly.notification_preferences;
drop table nestly.notifications;

drop function nestly.notifications_read_guard();
drop function nestly.notify_scope();
drop function nestly.search_scope();

alter table nestly.security_events drop constraint security_events_kind_check;
alter table nestly.security_events add constraint security_events_kind_check check (kind in ('profile_open_limit'));
comment on constraint security_events_kind_check on nestly.security_events is 'The kinds of Security event; extended by a migration.';

alter table nestly.security_limits no force row level security;
delete from nestly.security_limits where limit_key = 'people_search';
alter table nestly.security_limits drop constraint security_limits_limit_key_check;
alter table nestly.security_limits add constraint security_limits_limit_key_check check (limit_key in ('profile_open'));
comment on constraint security_limits_limit_key_check on nestly.security_limits is 'The only limit today.';
alter table nestly.security_limits force row level security;

delete from supabase_migrations.schema_migrations where version = '20261020100000';

commit;
