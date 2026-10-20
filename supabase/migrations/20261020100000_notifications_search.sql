-- =====================================================================================================================
-- Notifications, notification preferences and People Search — migration only.
--
-- SRS: FR-NOTIF-001/002/003 · FR-SEARCH-001 · FR-ALG-008 (the authorization-first part) · BR-035, BR-037, BR-038, BR-061, BR-063,
--      BR-044 · NFR-SEC-006 · VAL-037 · AC-040, AC-041, AC-042, AC-074, AC-078 · platform rules 8, 9, 10, 15, 16, 17.
-- Afik: People Search 60 per hour per account as Configuration (18.10.2026); notification retention 90 days (the purge job is a
--       later job; this migration only records created_at).
--
-- notifications                       one row per event for one recipient: type, actor (NULL for the anonymous author or the system),
--                                     target (kind + id, for the deep link) and subject (the source row, so one event notifies once).
--                                     No text and no content is stored: the screen builds the sentence from the type, and the target
--                                     is re-authorized when it is opened. The recipient reads and marks read; nobody inserts but the
--                                     four definers below.
-- notification_preferences            per user and category: In-App flag (Push flag stored for the Mobile stage, never sent on Web).
--                                     A missing row means the default: on. Security/critical cannot be switched off (BR-038).
-- friend_content_notification_preferences   per user and Friend: "tell me when this Friend posts" (FR-NOTIF-003). Off by default.
-- people_search_counts                the rolling count of People Search calls per account (as profile_open_counts).
-- security_limits / security_events   extended: the people_search limit (seed 60 per 3600 s) and the people_search_limit event.
--
-- SECURITY DEFINER (data-model.md "Approved exceptions", rule 17 — one narrow function per kind of write into another user's rows):
--   nestly.notify_friendship()   AFTER INSERT/UPDATE on friendships: a Friend Request received; a Friend Request accepted.
--   nestly.notify_comment()      AFTER INSERT on comments: a comment on my post; a reply to my comment.
--   nestly.notify_post()         AFTER INSERT on posts: a share of my post; a new post of a Friend I chose to follow.
--   nestly.search_people(...)    People Search: counts the call, applies the limit, returns id and full name of matching active
--                                Regular accounts (a stranger's name is not readable under any other policy). Never a list without a query.
--   The trigger functions cannot be called by a client. Each declares its scope in a transaction-local setting that opens the
--   `TO app_owner` policies below and clears it (the profile_view shape); no runtime role is a member of app_owner (rule 1).
--   nestly.notify_deliver() is a SECURITY INVOKER helper only those definers run: no EXECUTE for any runtime role.
-- No like creates a notification: a like's author is not exposed anywhere (reaction_owners is owner-only), and FR-NOTIF-003 lists none.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261020100000_notifications_search.down.sql (refuses while any of the new tables or a people_search event holds a row).
-- =====================================================================================================================

-- 1. notifications ---------------------------------------------------------------------------------------------------
create table nestly.notifications (
  id           uuid        not null default gen_random_uuid()
    constraint notifications_pkey primary key,
  recipient_id uuid        not null
    constraint notifications_recipient_id_fkey references nestly.users (id) on delete cascade,
  type         text        not null
    constraint notifications_type_check check (type ~ '^[a-z][a-z_]{0,39}$'),
  actor_id     uuid
    constraint notifications_actor_id_fkey references nestly.users (id) on delete cascade,
  target_kind  text        not null
    constraint notifications_target_kind_check check (target_kind ~ '^[a-z][a-z_]{0,29}$'),
  target_id    uuid        not null,
  subject_id   uuid        not null,
  is_critical  boolean     not null default false,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint notifications_recipient_type_subject_key unique (recipient_id, type, subject_id)
);

create index notifications_recipient_created_idx on nestly.notifications (recipient_id, created_at desc, id desc);
create index notifications_recipient_unread_idx on nestly.notifications (recipient_id) where read_at is null;
create index notifications_actor_id_idx on nestly.notifications (actor_id) where actor_id is not null;

-- 2. notification_preferences ----------------------------------------------------------------------------------------
create table nestly.notification_preferences (
  user_id          uuid    not null default auth.uid()
    constraint notification_preferences_user_id_fkey references nestly.users (id) on delete cascade,
  category         text    not null
    constraint notification_preferences_category_check check (category ~ '^[a-z][a-z_]{0,39}$'),
  is_in_app_enabled boolean not null default true,
  is_push_enabled   boolean not null default false,
  constraint notification_preferences_pkey primary key (user_id, category),
  constraint notification_preferences_critical_check check (category <> 'security' or is_in_app_enabled)
);

-- 3. friend_content_notification_preferences -------------------------------------------------------------------------
create table nestly.friend_content_notification_preferences (
  user_id    uuid    not null default auth.uid()
    constraint friend_content_notification_preferences_user_id_fkey references nestly.users (id) on delete cascade,
  friend_id  uuid    not null
    constraint friend_content_notification_preferences_friend_id_fkey references nestly.users (id) on delete cascade,
  is_enabled boolean not null default true,
  constraint friend_content_notification_preferences_pkey primary key (user_id, friend_id),
  constraint friend_content_notification_preferences_pair_check check (user_id <> friend_id)
);

create index friend_content_notification_preferences_friend_idx
  on nestly.friend_content_notification_preferences (friend_id) where is_enabled;

-- 4. people_search_counts (as profile_open_counts) -------------------------------------------------------------------
create table nestly.people_search_counts (
  user_id             uuid          not null
    constraint people_search_counts_pkey primary key
    constraint people_search_counts_user_id_fkey references nestly.users (id) on delete cascade,
  searched_at         timestamptz[] not null default '{}'
    constraint people_search_counts_searched_at_check check (pg_catalog.cardinality(searched_at) <= 10000),
  is_refusal_recorded boolean       not null default false
);

-- 5. The Configuration and the Security event kind are extended. security_limits has no write policy (a change is a migration):
--    FORCE is lifted for the one insert and put back at once, in this transaction.
alter table nestly.security_limits drop constraint security_limits_limit_key_check;
alter table nestly.security_limits
  add constraint security_limits_limit_key_check check (limit_key in ('profile_open', 'people_search'));
alter table nestly.security_limits no force row level security;
insert into nestly.security_limits (limit_key, max_count, window_seconds) values ('people_search', 60, 3600);
alter table nestly.security_limits force row level security;

alter table nestly.security_events drop constraint security_events_kind_check;
alter table nestly.security_events
  add constraint security_events_kind_check check (kind in ('profile_open_limit', 'people_search_limit'));

-- 6. RLS and grants --------------------------------------------------------------------------------------------------
alter table nestly.notifications enable row level security, force row level security;
alter table nestly.notification_preferences enable row level security, force row level security;
alter table nestly.friend_content_notification_preferences enable row level security, force row level security;
alter table nestly.people_search_counts enable row level security, force row level security;

revoke all on table nestly.notifications, nestly.notification_preferences, nestly.friend_content_notification_preferences,
  nestly.people_search_counts from public, anon, authenticated;

grant select on nestly.notifications to authenticated;
grant update (read_at) on nestly.notifications to authenticated;

grant select on nestly.notification_preferences to authenticated;
grant insert (category, is_in_app_enabled, is_push_enabled) on nestly.notification_preferences to authenticated;
grant update (is_in_app_enabled, is_push_enabled) on nestly.notification_preferences to authenticated;

grant select on nestly.friend_content_notification_preferences to authenticated;
grant insert (friend_id, is_enabled) on nestly.friend_content_notification_preferences to authenticated;
grant update (is_enabled) on nestly.friend_content_notification_preferences to authenticated;

-- people_search_counts: no grant to any runtime role; reached only through search_people.

-- 6a. The scope helpers: the transaction-local settings the definers declare. No runtime role runs them (only their owner).
create function nestly.notify_scope()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select nullif(pg_catalog.current_setting('nestly.notify_scope', true), '') $$;

create function nestly.search_scope()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select nullif(pg_catalog.current_setting('nestly.search_scope', true), '') $$;

revoke execute on function nestly.notify_scope(), nestly.search_scope() from public;

-- 6b. notifications: the recipient reads their own and marks them read. Nothing is inserted or deleted by a client.
create policy notifications_select_recipient on nestly.notifications
  for select to authenticated
  using ((select nestly.is_active_account()) and recipient_id = (select auth.uid()));

create policy notifications_update_recipient on nestly.notifications
  for update to authenticated
  using ((select nestly.is_active_account()) and recipient_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and recipient_id = (select auth.uid()));

-- Any update marks the notification read, once: the instant is the database's, an earlier one is kept, and a read cannot be undone.
create function nestly.notifications_read_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.read_at := coalesce(old.read_at, pg_catalog.now());
  return new;
end
$$;

create trigger notifications_read_guard
  before update on nestly.notifications
  for each row execute function nestly.notifications_read_guard();

create policy notifications_insert_notify on nestly.notifications
  for insert to app_owner
  with check ((select nestly.notify_scope()) is not null);

-- INSERT ... ON CONFLICT DO NOTHING (one notification per event) also needs a SELECT policy for the inserting role.
create policy notifications_select_notify on nestly.notifications
  for select to app_owner
  using ((select nestly.notify_scope()) is not null);

-- 6c. notification_preferences: own rows; Regular or Professional only (Admin and Moderator use their Role, FR-NOTIF-002).
create policy notification_preferences_select_own on nestly.notification_preferences
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy notification_preferences_insert_own on nestly.notification_preferences
  for insert to authenticated
  with check ((select nestly.caller_account_type()) in ('regular', 'professional') and user_id = (select auth.uid()));

create policy notification_preferences_update_own on nestly.notification_preferences
  for update to authenticated
  using ((select nestly.caller_account_type()) in ('regular', 'professional') and user_id = (select auth.uid()))
  with check ((select nestly.caller_account_type()) in ('regular', 'professional') and user_id = (select auth.uid()));

create policy notification_preferences_select_notify on nestly.notification_preferences
  for select to app_owner
  using ((select nestly.notify_scope()) is not null);

-- 6d. friend_content_notification_preferences: own rows, about an accepted Friend (Regular only).
create policy friend_content_preferences_select_own on nestly.friend_content_notification_preferences
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy friend_content_preferences_insert_own on nestly.friend_content_notification_preferences
  for insert to authenticated
  with check ((select nestly.caller_account_type()) = 'regular' and user_id = (select auth.uid())
    and exists (
      select 1 from nestly.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = (select auth.uid()) and f.addressee_id = friend_content_notification_preferences.friend_id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = friend_content_notification_preferences.friend_id))));

create policy friend_content_preferences_update_own on nestly.friend_content_notification_preferences
  for update to authenticated
  using ((select nestly.caller_account_type()) = 'regular' and user_id = (select auth.uid()))
  with check ((select nestly.caller_account_type()) = 'regular' and user_id = (select auth.uid()));

create policy friend_content_preferences_select_notify on nestly.friend_content_notification_preferences
  for select to app_owner
  using ((select nestly.notify_scope()) is not null);

-- 6e. What the notification definers read to find the recipient: scoped to a declared notification event.
create policy posts_select_notify on nestly.posts
  for select to app_owner
  using ((select nestly.notify_scope()) is not null);

create policy post_authors_select_notify on nestly.post_authors
  for select to app_owner
  using ((select nestly.notify_scope()) is not null);

create policy comments_select_notify on nestly.comments
  for select to app_owner
  using ((select nestly.notify_scope()) is not null);

create policy friendships_select_notify on nestly.friendships
  for select to app_owner
  using ((select nestly.notify_scope()) = 'post' and status = 'accepted'
    and requester_status = 'active' and addressee_status = 'active');

-- 6f. People Search: what search_people reads and writes, open only while it has declared its scope.
create policy security_limits_select_search_people on nestly.security_limits
  for select to app_owner
  using (limit_key = 'people_search' and (select nestly.search_scope()) is not null);

create policy people_search_counts_select_search on nestly.people_search_counts
  for select to app_owner
  using (user_id = (select auth.uid()) and (select nestly.search_scope()) is not null);

create policy people_search_counts_insert_search on nestly.people_search_counts
  for insert to app_owner
  with check (user_id = (select auth.uid()) and (select nestly.search_scope()) is not null);

create policy people_search_counts_update_search on nestly.people_search_counts
  for update to app_owner
  using (user_id = (select auth.uid()) and (select nestly.search_scope()) is not null)
  with check (user_id = (select auth.uid()) and (select nestly.search_scope()) is not null);

create policy security_events_insert_search on nestly.security_events
  for insert to app_owner
  with check (user_id = (select auth.uid()) and kind = 'people_search_limit' and (select nestly.search_scope()) is not null);

create policy regular_names_select_search on nestly.regular_names
  for select to app_owner
  using ((select nestly.search_scope()) is not null);

create policy users_select_search on nestly.users
  for select to app_owner
  using ((select nestly.search_scope()) is not null and status = 'active' and account_type = 'regular');

-- 7. The delivery helper: one notification, unless the recipient switched the category off (never a critical one).
create function nestly.notify_deliver(p_recipient uuid, p_type text, p_category text, p_actor uuid,
                                      p_target_kind text, p_target_id uuid, p_subject uuid, p_is_critical boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_recipient is null then
    return;
  end if;
  if not p_is_critical and exists (
    select 1 from nestly.notification_preferences p
    where p.user_id = p_recipient and p.category = p_category and not p.is_in_app_enabled) then
    return;
  end if;
  insert into nestly.notifications (recipient_id, type, actor_id, target_kind, target_id, subject_id, is_critical)
  values (p_recipient, p_type, p_actor, p_target_kind, p_target_id, p_subject, p_is_critical)
  on conflict (recipient_id, type, subject_id) do nothing;
end
$$;

revoke execute on function nestly.notify_deliver(uuid, text, text, uuid, text, uuid, uuid, boolean) from public;

-- 8. friendships: a Friend Request received; a Friend Request accepted. A decline stays silent (FR-REL-001).
create function nestly.notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('nestly.notify_scope', 'friendship', true);
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.cancelled_at is null then
      perform nestly.notify_deliver(new.addressee_id, 'friend_request', 'friends', new.requester_id, 'user', new.requester_id, new.id, false);
    end if;
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform nestly.notify_deliver(new.requester_id, 'friend_accepted', 'friends', new.addressee_id, 'user', new.addressee_id, new.id, false);
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return null;
end
$$;

revoke execute on function nestly.notify_friendship() from public;

create trigger notify_friendship_insert
  after insert on nestly.friendships
  for each row execute function nestly.notify_friendship();

create trigger notify_friendship_accept
  after update of status on nestly.friendships
  for each row when (old.status = 'pending' and new.status = 'accepted')
  execute function nestly.notify_friendship();

-- 9. comments: a comment on my post (the real author of an anonymous post included); a reply to my comment. Never to oneself.
create function nestly.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
  v_parent uuid;
begin
  perform pg_catalog.set_config('nestly.notify_scope', 'comment', true);
  select p.author_id into v_owner from nestly.posts p where p.id = new.post_id;
  if v_owner is null then
    select pa.author_id into v_owner from nestly.post_authors pa where pa.post_id = new.post_id;
  end if;
  if new.parent_id is not null then
    select c.author_id into v_parent from nestly.comments c where c.id = new.parent_id;
    v_parent := coalesce(v_parent, v_owner);   -- a "המחבר" comment belongs to the post's real author
    if v_parent is distinct from v_me then
      perform nestly.notify_deliver(v_parent, 'comment_reply', 'comments', new.author_id, 'post', new.post_id, new.id, false);
    end if;
  end if;
  if v_owner is distinct from v_me and v_owner is distinct from v_parent then
    perform nestly.notify_deliver(v_owner, 'post_comment', 'comments', new.author_id, 'post', new.post_id, new.id, false);
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return null;
end
$$;

revoke execute on function nestly.notify_comment() from public;

create trigger notify_comment
  after insert on nestly.comments
  for each row execute function nestly.notify_comment();

-- 10. posts: a share of my post; a new post of a Friend I chose to follow (never an anonymous post, FR-FEED-005).
create function nestly.notify_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  r record;
begin
  perform pg_catalog.set_config('nestly.notify_scope', 'post', true);
  if new.is_share then
    select p.author_id into v_owner from nestly.posts p where p.id = new.shared_post_id;
    if v_owner is distinct from new.author_id then
      perform nestly.notify_deliver(v_owner, 'post_shared', 'shares', new.author_id, 'post', new.id, new.id, false);
    end if;
  elsif not new.is_anonymous and new.author_id is not null then
    for r in
      select fp.user_id as friend_id
        from nestly.friend_content_notification_preferences fp
       where fp.friend_id = new.author_id and fp.is_enabled
         and exists (
           select 1 from nestly.friendships f
            where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
              and ((f.requester_id = new.author_id and f.addressee_id = fp.user_id)
                or (f.addressee_id = new.author_id and f.requester_id = fp.user_id)))
    loop
      perform nestly.notify_deliver(r.friend_id, 'friend_post', 'friend_posts', new.author_id, 'post', new.id, new.id, false);
    end loop;
  end if;
  perform pg_catalog.set_config('nestly.notify_scope', '', true);
  return null;
end
$$;

revoke execute on function nestly.notify_post() from public;

create trigger notify_post
  after insert on nestly.posts
  for each row execute function nestly.notify_post();

-- 11. People Search (FR-SEARCH-001, NFR-SEC-006, VAL-037, AC-078). One call = one counted search. A query shorter than two characters
--     or longer than 100 returns nothing and is not counted (never a list without a query). At the limit one row with outcome
--     'limited' and one Security event per stretch; an absent or invalid limit raises NS001 (fail closed). Rank: exact name, name
--     prefix, a word prefix, anywhere; then name and id. Only the id and the full name leave the function.
create function nestly.search_people(p_query text, p_limit integer default 20, p_offset integer default 0)
returns table (user_id uuid, full_name text, outcome text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_q text;
  v_n integer;
  v_w integer;
  v_times timestamptz[];
  v_logged boolean;
  v_esc text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 200));
begin
  if not nestly.is_active_account() or coalesce(nestly.caller_account_type(), '') not in ('regular', 'professional') then
    return;
  end if;
  v_q := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'));
  if pg_catalog.char_length(v_q) < 2 or pg_catalog.char_length(v_q) > 100 then
    return;
  end if;
  perform pg_catalog.set_config('nestly.search_scope', 'people', true);
  select l.max_count, l.window_seconds into v_n, v_w from nestly.security_limits l where l.limit_key = 'people_search';
  if v_n is null or v_w is null or v_n < 1 or v_w < 1 then
    raise exception 'search_people: people_search limit missing or invalid' using errcode = 'NS001';
  end if;
  insert into nestly.people_search_counts as c (user_id) values (v_me)
    on conflict (user_id) do update set is_refusal_recorded = c.is_refusal_recorded
    returning c.searched_at, c.is_refusal_recorded into v_times, v_logged;
  v_times := array(select t from pg_catalog.unnest(v_times) t where t > pg_catalog.now() - pg_catalog.make_interval(secs => v_w) order by t);
  if pg_catalog.cardinality(v_times) >= v_n then
    if not v_logged then
      insert into nestly.security_events (kind, user_id) values ('people_search_limit', v_me);
    end if;
    update nestly.people_search_counts c set searched_at = v_times, is_refusal_recorded = true where c.user_id = v_me;
    perform pg_catalog.set_config('nestly.search_scope', '', true);
    return query select null::uuid, null::text, 'limited'::text;
    return;
  end if;
  update nestly.people_search_counts c set searched_at = v_times || pg_catalog.now(), is_refusal_recorded = false where c.user_id = v_me;
  v_esc := pg_catalog.regexp_replace(pg_catalog.lower(v_q), '([\\%_])', '\\\1', 'g');
  return query
    select n.user_id, n.full_name, 'found'::text
      from nestly.regular_names n
      join nestly.users u on u.id = n.user_id and u.status = 'active' and u.account_type = 'regular'
     where n.user_id <> v_me
       and pg_catalog.lower(n.full_name) like '%' || v_esc || '%'
     order by case when pg_catalog.lower(n.full_name) = pg_catalog.lower(v_q) then 0
                   when pg_catalog.lower(n.full_name) like v_esc || '%' then 1
                   when pg_catalog.lower(n.full_name) like '% ' || v_esc || '%' then 2
                   else 3 end,
              n.full_name, n.user_id
     limit v_limit offset v_offset;
  perform pg_catalog.set_config('nestly.search_scope', '', true);
end
$$;

revoke execute on function nestly.search_people(text, integer, integer) from public;
grant  execute on function nestly.search_people(text, integer, integer) to authenticated;

-- 12. Comments ------------------------------------------------------------------------------------------------------
comment on constraint security_limits_limit_key_check on nestly.security_limits is 'The limits that exist: profile_open and people_search.';
comment on constraint security_events_kind_check on nestly.security_events is 'The kinds of Security event: profile_open_limit and people_search_limit; extended by a migration.';
comment on table nestly.notifications is
  'FR-NOTIF-001/003: one event for one recipient (a Friend Request received or accepted, a comment, a reply, a share, a new post of a followed Friend). No text and no content: the screen builds the sentence from type and actor, and the target is authorized again when opened. Written only by the notification definers; the recipient reads and marks read. Retention 90 days (Afik 15א; the purge is a later job).';
comment on column nestly.notifications.id is 'Notification id.';
comment on column nestly.notifications.recipient_id is 'Who is notified; the only reader.';
comment on column nestly.notifications.type is 'The event: friend_request, friend_accepted, post_comment, comment_reply, post_shared, friend_post. Format-checked only: the list lives in the shared package, so a new event needs no schema change.';
comment on column nestly.notifications.actor_id is 'Who did it; NULL for the anonymous post author or the system. Its name is readable only where an older policy already lets the recipient read it (a live Friend Request or Friendship, a readable post or comment).';
comment on column nestly.notifications.target_kind is 'What the deep link opens: post or user.';
comment on column nestly.notifications.target_id is 'The post or user id of the deep link; re-authorized when opened.';
comment on column nestly.notifications.subject_id is 'The source row (comment, share, friendship, post): with recipient and type it makes one event notify once.';
comment on column nestly.notifications.is_critical is 'Security/critical: not affected by preferences (BR-038). Nothing sets it yet.';
comment on column nestly.notifications.created_at is 'When the event happened, database clock.';
comment on column nestly.notifications.read_at is 'When the recipient read it; NULL while unread. Set once, by the database, on any update.';
comment on constraint notifications_recipient_type_subject_key on nestly.notifications is 'One notification per event and recipient.';
comment on index nestly.notifications_recipient_created_idx is 'The recipient''s list, newest first, and its pages.';
comment on index nestly.notifications_recipient_unread_idx is 'The unread count behind the bell.';
comment on index nestly.notifications_actor_id_idx is 'The cascade of a users delete.';
comment on policy notifications_select_recipient on nestly.notifications is 'The recipient reads their own notifications while active.';
comment on policy notifications_update_recipient on nestly.notifications is 'The recipient marks their own read; only read_at is granted, and the trigger fixes its value.';
comment on policy notifications_insert_notify on nestly.notifications is 'The notification definers only: app_owner inserts while one has declared its scope.';
comment on policy notifications_select_notify on nestly.notifications is 'The notification definers only: the conflict check of the insert (one notification per event) reads while a scope is declared.';
comment on trigger notifications_read_guard on nestly.notifications is 'Any update sets read_at to the first read instant; a read cannot be undone or backdated.';

comment on table nestly.notification_preferences is
  'FR-NOTIF-002, BR-038, BR-061: per user and category, whether the In-App notification is created (Push flag stored for the Mobile stage; nothing sends Push on Web). No row means on. The security category cannot be switched off.';
comment on column nestly.notification_preferences.user_id is 'The owner; auth.uid() by default.';
comment on column nestly.notification_preferences.category is 'friends, comments, shares, friend_posts, birthdays (later: groups, security...). Format-checked only.';
comment on column nestly.notification_preferences.is_in_app_enabled is 'Whether the category creates In-App notifications.';
comment on column nestly.notification_preferences.is_push_enabled is 'Mobile stage only; effective when the category is enabled and the device allows Push.';
comment on constraint notification_preferences_critical_check on nestly.notification_preferences is 'Security/critical cannot be switched off (BR-038).';
comment on policy notification_preferences_select_own on nestly.notification_preferences is 'Own rows.';
comment on policy notification_preferences_insert_own on nestly.notification_preferences is 'Regular or Professional, own row.';
comment on policy notification_preferences_update_own on nestly.notification_preferences is 'Regular or Professional, own row.';
comment on policy notification_preferences_select_notify on nestly.notification_preferences is 'The notification definers read the recipient''s preference while a scope is declared.';

comment on table nestly.friend_content_notification_preferences is
  'FR-NOTIF-003: "tell me when this Friend posts" - so the notification is not sent automatically from every Friend. A row per user and Friend; the new-post notification needs the row, is_enabled and a live Friendship.';
comment on column nestly.friend_content_notification_preferences.user_id is 'Who wants the notifications; auth.uid() by default.';
comment on column nestly.friend_content_notification_preferences.friend_id is 'The Friend whose new posts notify.';
comment on column nestly.friend_content_notification_preferences.is_enabled is 'On or off for this Friend.';
comment on policy friend_content_preferences_select_own on nestly.friend_content_notification_preferences is 'Own rows.';
comment on policy friend_content_preferences_insert_own on nestly.friend_content_notification_preferences is 'A Regular user, own row, about an accepted Friend.';
comment on policy friend_content_preferences_update_own on nestly.friend_content_notification_preferences is 'A Regular user, own row.';
comment on policy friend_content_preferences_select_notify on nestly.friend_content_notification_preferences is 'notify_post reads who follows the author while a scope is declared.';

comment on table nestly.people_search_counts is
  'NFR-SEC-006 (1), VAL-037: per account, the instants of its People Search calls still inside the window, and whether the current stretch of refusals was recorded. Read and written only by search_people for auth.uid()''s own row; working state, cascades with the account.';
comment on column nestly.people_search_counts.user_id is 'The account that searched.';
comment on column nestly.people_search_counts.searched_at is 'Instants of counted searches, database clock; older than the window are dropped at the next search.';
comment on column nestly.people_search_counts.is_refusal_recorded is 'True once the current stretch of refusals recorded its Security event.';

comment on policy posts_select_notify on nestly.posts is 'The notification definers read the post (author, original of a share) while a scope is declared.';
comment on policy post_authors_select_notify on nestly.post_authors is 'notify_comment reads the real author of an anonymous post while a scope is declared; the id never leaves the database.';
comment on policy comments_select_notify on nestly.comments is 'notify_comment reads the parent comment''s author while a scope is declared.';
comment on policy friendships_select_notify on nestly.friendships is 'notify_post reads the accepted Friendships of the author while its scope is declared.';
comment on policy security_limits_select_search_people on nestly.security_limits is 'search_people reads the people_search limit while its scope is declared.';
comment on policy people_search_counts_select_search on nestly.people_search_counts is 'search_people reads the caller''s own row.';
comment on policy people_search_counts_insert_search on nestly.people_search_counts is 'search_people creates the caller''s own row.';
comment on policy people_search_counts_update_search on nestly.people_search_counts is 'search_people updates the caller''s own row.';
comment on policy security_events_insert_search on nestly.security_events is 'search_people records a people_search_limit event for the caller''s own account.';
comment on policy regular_names_select_search on nestly.regular_names is 'search_people reads names while its scope is declared; only id and full name leave the function.';
comment on policy users_select_search on nestly.users is 'search_people checks the match is an active Regular account.';

comment on function nestly.notify_scope() is 'The declared notification scope of this transaction, or NULL. Opens the TO app_owner policies of the notification definers; no runtime role runs it.';
comment on function nestly.search_scope() is 'The declared search scope of this transaction, or NULL. Opens the TO app_owner policies of search_people; no runtime role runs it.';
comment on function nestly.notify_deliver(uuid, text, text, uuid, text, uuid, uuid, boolean) is 'One notification, unless the recipient switched the category off (never a critical one). SECURITY INVOKER; run only by the notification definers.';
comment on function nestly.notify_friendship() is 'Trigger. A Friend Request received (insert, pending) and accepted (pending to accepted) notify the other party; a decline is silent. SECURITY DEFINER (rule 17): the caller cannot write the other party''s rows.';
comment on function nestly.notify_comment() is 'Trigger. A comment notifies the post''s author (the real author of an anonymous post too); a reply notifies the parent comment''s author; never the commenter. SECURITY DEFINER (rule 17).';
comment on function nestly.notify_post() is 'Trigger. A share notifies the original''s author; a named post notifies the Friends who chose to follow its author (never an anonymous post, FR-FEED-005). SECURITY DEFINER (rule 17).';
comment on function nestly.search_people(text, integer, integer) is
  'FR-SEARCH-001, NFR-SEC-006, BR-044, BR-063, VAL-037, AC-078: People Search. A query under two or over 100 characters returns nothing and is not counted. Counts the call (people_search limit from security_limits, 60 per 3600 s at the seed); the call over the limit returns one row with outcome limited and records one Security event per stretch; absent or invalid configuration raises NS001. Otherwise rows (user_id, full_name, outcome found) of active Regular accounts other than the caller, ranked exact, prefix, word prefix, contains; at most 50 per call, offset up to 200. Never a list without a query, never anything but id and full name. SECURITY DEFINER (data-model.md approved exceptions); EXECUTE authenticated.';
