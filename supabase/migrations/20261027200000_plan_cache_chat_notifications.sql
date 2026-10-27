-- =====================================================================================================================
-- Plan-cached reads for Chat and Notifications (27.10.2026, performance) — migration only.
--
-- Why. Under load the database's CPU goes mostly to planning: a statement over a policy-heavy table (regular_names: 15 SELECT policies
-- for authenticated, with EXISTS over other RLS tables) re-expands the whole policy tree on every request, and the pooler (transaction
-- mode) keeps no prepared statement between requests. A plpgsql function caches the plans of its static statements per backend
-- connection, and the pooler's backend connections persist across requests, so after one call per backend the planning cost is gone
-- (Preview, the conversations list: 486 ms on the first call, 17-21 ms after).
--
-- What. Each function below returns exactly what one read statement of the server returned, with the same SQL (the server's parameters
-- become the function's arguments; `in (…)` over a list becomes `= any(array)`; the columns are snake_case, the server's select names them
-- as before). SECURITY INVOKER: every row is read as the caller
-- (authenticated) under the same policies; nothing here reads a row the statement it replaces could not. STABLE, search_path = '',
-- plan_cache_mode = force_generic_plan (one plan per backend, never re-planned per call). EXECUTE: authenticated only.
--   chat_conversations()                    GET /api/chat: the conversation list          (chat-repository readConversations)
--   chat_pending_incoming() / _outgoing()   GET /api/chat: pending requests, either way   (chat-repository readPendingRequests)
--   chat_support_threads()                  GET /api/chat: answered Support threads       (chat-repository readSupportThreads)
--   chat_unread_count()                     the Chat badge                                (chat-repository readUnreadCount)
--   notifications_latest(…) / _before(…)    GET /api/notifications: a page                (notifications-repository readLatest)
--   notifications_unread_count()            GET /api/notifications: the bell's count      (notifications-repository countUnread)
--   notifications_bell_counts(text[])       GET /api/notifications/counts                 (notifications-repository readBellCounts)
--   regular_names_visible(uuid[])           the names a caller may read, by id            (friends-repository readVisibleNames)
-- No table, policy or grant on a table changes; no SECURITY DEFINER. Brief: .work/briefs/plan-cache.md.
-- Down script: supabase/rollback/20261027200000_plan_cache_chat_notifications.down.sql.
-- =====================================================================================================================

-- The conversation list (readConversations) ---------------------------------------------------------------------------
create function nestly.chat_conversations()
returns table (id uuid, other_user_id uuid, other_name text, last_text text, last_at text, last_mine boolean, unread integer, can_send boolean)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select c.id, case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as other_user_id, coalesce(n.full_name, pp.full_name) as other_name,
         coalesce(lm.body, op.opening_message, oo.opening_message) as last_text,
         to_char(coalesce(lm.created_at, op.created_at, oo.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as last_at,
         coalesce(lm.mine, op.mine, oo.mine) as last_mine,
         (select count(*)::int from nestly.messages m
           where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
             and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.conversation_id = c.id), '-infinity')) as unread,
         not exists (select 1 from nestly.chat_blocks b where b.lifted_at is null
           and ((b.blocker_id = c.user_a and b.blocked_id = c.user_b) or (b.blocker_id = c.user_b and b.blocked_id = c.user_a))) as can_send
  from nestly.conversations c
  left join nestly.regular_names n on n.user_id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join nestly.professional_profiles pp on pp.user_id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join lateral (select m.body, m.created_at, m.sender_id = (select auth.uid()) as mine from nestly.messages m
                      where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) lm on true
  left join lateral (select r.opening_message, r.created_at, r.requester_id = (select auth.uid()) as mine from nestly.chat_requests r
                      where r.id = c.chat_request_id) op on true
  left join lateral (select o.opening_message, o.created_at, o.professional_id = (select auth.uid()) as mine from nestly.outreach_requests o
                      where o.id = c.outreach_request_id) oo on true
  order by coalesce(lm.created_at, op.created_at, oo.created_at, c.created_at) desc, c.id
  limit 100;
end
$$;

-- Pending chat requests (readPendingRequests): one function per direction (static SQL only) ---------------------------
create function nestly.chat_pending_incoming()
returns table (id uuid, user_id uuid, name text, message text, sent_at text)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select r.id, r.requester_id as user_id, coalesce(n.full_name, pp.full_name) as name, r.opening_message as message,
         to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as sent_at
  from nestly.chat_requests r left join nestly.regular_names n on n.user_id = r.requester_id
  left join nestly.professional_profiles pp on pp.user_id = r.requester_id
  where r.target_id = (select auth.uid()) and r.status = 'pending'
  order by r.created_at desc, r.id
  limit 100;
end
$$;

create function nestly.chat_pending_outgoing()
returns table (id uuid, user_id uuid, name text, message text, sent_at text)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select r.id, r.target_id as user_id, coalesce(n.full_name, pp.full_name) as name, r.opening_message as message,
         to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as sent_at
  from nestly.chat_requests r left join nestly.regular_names n on n.user_id = r.target_id
  left join nestly.professional_profiles pp on pp.user_id = r.target_id
  where r.requester_id = (select auth.uid()) and r.status = 'pending'
  order by r.created_at desc, r.id
  limit 100;
end
$$;

-- Answered Support threads (readSupportThreads) ------------------------------------------------------------------------
create function nestly.chat_support_threads()
returns table (id uuid, topic text, status text, last_text text, last_at text, from_support boolean, unread integer)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select s.id, s.topic, s.status, lm.body as last_text, to_char(lm.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as last_at,
         lm.author_kind = 'support' as from_support,
         (select count(*)::int from nestly.support_messages m
           where m.support_request_id = s.id and m.author_kind = 'support'
             and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.support_request_id = s.id), '-infinity')) as unread
  from nestly.support_requests s
  join lateral (select m.body, m.created_at, m.author_kind from nestly.support_messages m
                 where m.support_request_id = s.id order by m.created_at desc, m.id desc limit 1) lm on true
  where s.user_id = (select auth.uid())
    and exists (select 1 from nestly.support_messages m where m.support_request_id = s.id and m.author_kind = 'support')
  order by lm.created_at desc, s.id
  limit 100;
end
$$;

-- The Chat badge (readUnreadCount; the same expression is the `chat` column of notifications_bell_counts) -----------------
create function nestly.chat_unread_count()
returns integer
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return ((select coalesce(sum((select count(*)::int from nestly.messages m
              where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
                and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.conversation_id = c.id), '-infinity'))), 0)
            from nestly.conversations c)
        + (select coalesce(sum((select count(*)::int from nestly.support_messages m
              where m.support_request_id = s.id and m.author_kind = 'support'
                and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.support_request_id = s.id), '-infinity'))), 0)
            from nestly.support_requests s where s.user_id = (select auth.uid()))
        + (select count(*) from nestly.chat_requests r where r.target_id = (select auth.uid()) and r.status = 'pending'))::int;
end
$$;

-- A page of notifications (readLatest): the first page, and a page older than a cursor ---------------------------------
create function nestly.notifications_latest(p_limit integer)
returns table (id uuid, type text, actor_id uuid, target_kind text, target_id uuid, created_at timestamptz, cursor_at text, read_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select notifications.id, notifications.type, notifications.actor_id, notifications.target_kind, notifications.target_id, notifications.created_at,
         to_char(notifications.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), notifications.read_at
  from nestly.notifications
  where not (notifications.type = 'followers_weekly' and (
    exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
    or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
                    and f.created_at >= ((notifications.created_at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem'
                    and f.created_at < notifications.created_at)))
  order by notifications.created_at desc, notifications.id desc
  limit p_limit;
end
$$;

create function nestly.notifications_latest_before(p_limit integer, p_before_at timestamptz, p_before_id uuid)
returns table (id uuid, type text, actor_id uuid, target_kind text, target_id uuid, created_at timestamptz, cursor_at text, read_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select notifications.id, notifications.type, notifications.actor_id, notifications.target_kind, notifications.target_id, notifications.created_at,
         to_char(notifications.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), notifications.read_at
  from nestly.notifications
  where not (notifications.type = 'followers_weekly' and (
    exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
    or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
                    and f.created_at >= ((notifications.created_at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem'
                    and f.created_at < notifications.created_at)))
    and (notifications.created_at, notifications.id) < (p_before_at, p_before_id)
  order by notifications.created_at desc, notifications.id desc
  limit p_limit;
end
$$;

-- The bell's unread count (countUnread) --------------------------------------------------------------------------------
create function nestly.notifications_unread_count()
returns integer
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return (select count(*)::int from nestly.notifications where notifications.read_at is null and not (notifications.type = 'followers_weekly' and (
    exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
    or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
                    and f.created_at >= ((notifications.created_at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem'
                    and f.created_at < notifications.created_at))));
end
$$;

-- The bell's light poll (readBellCounts): p_types is the list of notification types the server build knows -------------
create function nestly.notifications_bell_counts(p_types text[])
returns table (unread integer, chat integer, latest uuid)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select
    (select count(*)::int from nestly.notifications where notifications.read_at is null and not (notifications.type = 'followers_weekly' and (
      exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
      or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
                      and f.created_at >= ((notifications.created_at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem'
                      and f.created_at < notifications.created_at)))) as unread,
    ((select coalesce(sum((select count(*)::int from nestly.messages m
        where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
          and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.conversation_id = c.id), '-infinity'))), 0)
      from nestly.conversations c)
    + (select coalesce(sum((select count(*)::int from nestly.support_messages m
        where m.support_request_id = s.id and m.author_kind = 'support'
          and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.support_request_id = s.id), '-infinity'))), 0)
      from nestly.support_requests s where s.user_id = (select auth.uid()))
    + (select count(*) from nestly.chat_requests r where r.target_id = (select auth.uid()) and r.status = 'pending'))::int as chat,
    (select notifications.id from nestly.notifications where not (notifications.type = 'followers_weekly' and (
      exists (select 1 from nestly.notification_preferences p where p.category = 'followers' and not p.is_in_app_enabled)
      or not exists (select 1 from nestly.professional_follows f where f.professional_id = (select auth.uid())
                      and f.created_at >= ((notifications.created_at at time zone 'Asia/Jerusalem') - interval '7 days') at time zone 'Asia/Jerusalem'
                      and f.created_at < notifications.created_at)))
      and notifications.type::text = any(p_types)
      order by notifications.created_at desc, notifications.id desc limit 1) as latest;
end
$$;

-- The names a caller may read, by account id (readVisibleNames) ---------------------------------------------------------
create function nestly.regular_names_visible(p_ids uuid[])
returns table (user_id uuid, full_name text)
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_generic_plan
as $$
#variable_conflict use_column
begin
  return query
  select regular_names.user_id, regular_names.full_name from nestly.regular_names where regular_names.user_id = any(p_ids);
end
$$;

-- EXECUTE: authenticated only -------------------------------------------------------------------------------------------
revoke all on function nestly.chat_conversations() from public, anon;
revoke all on function nestly.chat_pending_incoming() from public, anon;
revoke all on function nestly.chat_pending_outgoing() from public, anon;
revoke all on function nestly.chat_support_threads() from public, anon;
revoke all on function nestly.chat_unread_count() from public, anon;
revoke all on function nestly.notifications_latest(integer) from public, anon;
revoke all on function nestly.notifications_latest_before(integer, timestamptz, uuid) from public, anon;
revoke all on function nestly.notifications_unread_count() from public, anon;
revoke all on function nestly.notifications_bell_counts(text[]) from public, anon;
revoke all on function nestly.regular_names_visible(uuid[]) from public, anon;

grant execute on function nestly.chat_conversations() to authenticated;
grant execute on function nestly.chat_pending_incoming() to authenticated;
grant execute on function nestly.chat_pending_outgoing() to authenticated;
grant execute on function nestly.chat_support_threads() to authenticated;
grant execute on function nestly.chat_unread_count() to authenticated;
grant execute on function nestly.notifications_latest(integer) to authenticated;
grant execute on function nestly.notifications_latest_before(integer, timestamptz, uuid) to authenticated;
grant execute on function nestly.notifications_unread_count() to authenticated;
grant execute on function nestly.notifications_bell_counts(text[]) to authenticated;
grant execute on function nestly.regular_names_visible(uuid[]) to authenticated;

comment on function nestly.chat_conversations() is
  'FR-CHAT-001: the caller''s conversations, latest activity first (at most 100). Replaces the readConversations statement verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance; .work/briefs/plan-cache.md).';
comment on function nestly.chat_pending_incoming() is
  'FR-CHAT-002: pending chat requests to the caller, newest first. Replaces readPendingRequests(incoming) verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.chat_pending_outgoing() is
  'FR-CHAT-002: the caller''s own pending chat requests, newest first. Replaces readPendingRequests(outgoing) verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.chat_support_threads() is
  'FR-ADMIN-001: the caller''s Support threads that Support has answered, latest first. Replaces readSupportThreads verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.chat_unread_count() is
  'FR-CHAT-001: the Chat badge (unread messages, unread Support replies, pending requests to the caller). Replaces readUnreadCount verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.notifications_latest(integer) is
  'FR-NOTIF-001: the caller''s first page of notifications, newest first (the weekly follower digest only while shown). Replaces readLatest verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.notifications_latest_before(integer, timestamptz, uuid) is
  'FR-NOTIF-001: the caller''s notifications older than a (time, id) cursor. Replaces readLatest with a cursor verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.notifications_unread_count() is
  'FR-NOTIF-001: how many of the caller''s notifications are unread. Replaces countUnread verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.notifications_bell_counts(text[]) is
  'FR-NOTIF-001, FR-CHAT-001: the bell''s poll (unread count, Chat badge, newest listed notification of a known type). Replaces readBellCounts verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
comment on function nestly.regular_names_visible(uuid[]) is
  'The names of these accounts that the caller''s policies let it read. Replaces readVisibleNames verbatim, as a plan-cached SECURITY INVOKER read (27.10.2026 performance).';
