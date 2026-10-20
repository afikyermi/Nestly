-- =====================================================================================================================
-- Chat and Support — I8 (FR-CHAT-001..004, FR-ADMIN-001/002, FR-SERV-009; BR-011, BR-034, BR-036, BR-042, BR-043, BR-052;
-- VAL-024..026; AC-024, AC-045, AC-051..053, AC-067; Afik's decisions of 20.10.2026, decisions-in-force.md §9).
--
-- chat_requests     an opening message to an account that is not a Friend (Regular Chat Request). The participants reference the
--                   account anchor (users), so a later initiative can open a request to or from a Professional by a policy of its own;
--                   in I8 only a Regular asks a Regular. One live request per pair (either direction). A decline ends only that request
--                   and is no block (§9.3): the requester may ask again later, within the limit. At most 20 new requests per account in
--                   24 hours (NS022), counted over the requester's own rows (always readable to it) under a per-requester advisory lock.
--                   The target accepts or declines; the requester may cancel a pending request. A user block ends a pending request.
-- conversations     one conversation per pair of accounts (users), opened by a party: 'friends' while an accepted Friendship holds
--                   (it survives Remove Friend, BR-042), or 'request' from that pair's accepted request. Never updated or deleted.
-- messages          text messages of a conversation (text only, OP-011), 1-2000 characters; only the parties read them; a party sends
--                   unless a Chat Block stands between the two (either direction: neither side sends, §9.4) or a user block hides the
--                   conversation. No read receipts (§9.5). No automatic deletion (§9.2): they go with the account (I9).
-- chat_blocks       Chat Block (FR-SERV-009, BR-011): messaging only, lifted by the blocker; hides nothing and ends nothing. At most 20
--                   per account in 24 hours (NS025), lifted ones included, under a per-blocker advisory lock.
-- chat_reads        each account's own read marker per conversation or Support thread (its unread count); owner only, never shown to
--                   the other party.
-- support_requests  a Regular's or Professional's Support request: topic (§9.1), text, status open / in_progress / closed; closed is
--                   final. The user reads its own; SUPPORT_VIEW reads every request on the admin screens (nestly.staff_view);
--                   SUPPORT_HANDLE changes the status (audited). At most 5 per 24 hours (NS023), under a per-user advisory lock.
-- support_messages  the thread of a request: the user's replies, Support's replies and internal notes that only staff read. A Support
--                   row stores no staff identity (the Audit Log names the actor); its author is "Support" (BR-043). Neither side writes
--                   into a closed request, except an internal note.
-- reports           a message can be reported (target_kind 'message', message_id; §9.6). Its text is never copied into the report.
-- reported_message_views   staff never read a conversation (§9.6). A REPORTS_VIEW holder on the admin screens opens a reported message
--                   by inserting a view row for that report: the Audit Log records it in the same transaction (audit_trigger), and only
--                   inside that transaction does messages_select_staff let the holder read that one message.
-- user_blocks_end_relations()   also ends a pending chat request of the pair (declined when the blocker was asked, cancelled when the
--                   blocker asked), with the blocker's own rights.
-- regular_names     three read policies for the chat (the other party of a conversation, of one's own request, of a pending request to
--                   one), split so each is one indexed lookup; and staff on the Support inbox (nestly.staff_view).
-- audit_trigger()   replaced: the body of 20261021500000 plus the support_requests, support_messages and reported_message_views branches
--                   (rule 18; still the one approved audit definer).
--
-- Every new table: RLS + FORCE, client policies TO authenticated gated by is_active_account(), per-column write grants, the owner
-- column defaulting to auth.uid(). No new SECURITY DEFINER. Chat and Support bodies are never copied anywhere else (BR-052, AC-067).
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261022100000_chat_support.down.sql (refuses while any of the new tables, or a message report, holds a row).
-- =====================================================================================================================

-- 1. chat_requests.
create table nestly.chat_requests (
  id                  uuid        not null default gen_random_uuid()
    constraint chat_requests_pkey primary key,
  requester_id        uuid        not null default auth.uid(),
  target_id           uuid        not null,
  target_account_type text        not null
    constraint chat_requests_target_account_type_check check (target_account_type in ('regular', 'professional')),
  opening_message     text        not null
    constraint chat_requests_opening_message_check check (pg_catalog.char_length(opening_message) between 1 and 2000 and opening_message ~ '[^[:space:]]'),
  status              text        not null default 'pending'
    constraint chat_requests_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  requester_status    text        not null default 'active',
  target_status       text        not null default 'active',
  created_at          timestamptz not null default now(),
  responded_at        timestamptz,
  constraint chat_requests_target_id_check check (target_id <> requester_id),
  constraint chat_requests_responded_at_check check ((responded_at is null) = (status = 'pending')),
  constraint chat_requests_target_fkey foreign key (target_id, target_account_type)
    references nestly.users (id, account_type) on delete cascade,
  constraint chat_requests_requester_status_fkey foreign key (requester_id, requester_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint chat_requests_target_status_fkey foreign key (target_id, target_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

create unique index chat_requests_pair_live_key on nestly.chat_requests
  (least(requester_id, target_id), greatest(requester_id, target_id)) where status in ('pending', 'accepted');
create index chat_requests_target_id_idx on nestly.chat_requests (target_id);
create index chat_requests_requester_created_idx on nestly.chat_requests (requester_id, created_at);

-- 2. conversations.
create table nestly.conversations (
  id              uuid        not null default gen_random_uuid()
    constraint conversations_pkey primary key,
  context         text        not null
    constraint conversations_context_check check (context in ('friends', 'request')),
  user_a          uuid        not null,
  user_b          uuid        not null,
  a_status        text        not null default 'active',
  b_status        text        not null default 'active',
  chat_request_id uuid
    constraint conversations_chat_request_id_fkey references nestly.chat_requests (id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint conversations_user_b_check check (user_a < user_b),
  constraint conversations_chat_request_id_check check ((context = 'request') = (chat_request_id is not null)),
  constraint conversations_a_status_fkey foreign key (user_a, a_status) references nestly.users (id, status) on update cascade on delete cascade,
  constraint conversations_b_status_fkey foreign key (user_b, b_status) references nestly.users (id, status) on update cascade on delete cascade
);

create unique index conversations_pair_key on nestly.conversations (user_a, user_b);
create index conversations_user_b_idx on nestly.conversations (user_b);
create index conversations_chat_request_id_idx on nestly.conversations (chat_request_id) where chat_request_id is not null;

-- 3. messages.
create table nestly.messages (
  id              uuid        not null default gen_random_uuid()
    constraint messages_pkey primary key,
  conversation_id uuid        not null
    constraint messages_conversation_id_fkey references nestly.conversations (id) on delete cascade,
  sender_id       uuid        not null default auth.uid()
    constraint messages_sender_id_fkey references nestly.users (id) on delete cascade,
  body            text        not null
    constraint messages_body_check check (pg_catalog.char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at      timestamptz not null default now()
);

create index messages_conversation_created_idx on nestly.messages (conversation_id, created_at desc);
create index messages_sender_id_idx on nestly.messages (sender_id);

-- 4. chat_blocks.
create table nestly.chat_blocks (
  id                   uuid        not null default gen_random_uuid()
    constraint chat_blocks_pkey primary key,
  blocker_id           uuid        not null default auth.uid()
    constraint chat_blocks_blocker_id_fkey references nestly.users (id) on delete cascade,
  blocked_id           uuid        not null,
  blocked_account_type text        not null
    constraint chat_blocks_blocked_account_type_check check (blocked_account_type in ('regular', 'professional')),
  created_at           timestamptz not null default now(),
  lifted_at            timestamptz,
  constraint chat_blocks_blocked_fkey foreign key (blocked_id, blocked_account_type)
    references nestly.users (id, account_type) on delete cascade,
  constraint chat_blocks_distinct_check check (blocker_id <> blocked_id),
  constraint chat_blocks_lifted_check check (lifted_at is null or lifted_at >= created_at)
);

create unique index chat_blocks_active_pair_key on nestly.chat_blocks (blocker_id, blocked_id) where lifted_at is null;
create index chat_blocks_blocked_id_idx on nestly.chat_blocks (blocked_id) where lifted_at is null;
create index chat_blocks_blocker_created_idx on nestly.chat_blocks (blocker_id, created_at);

-- 5. support_requests.
create table nestly.support_requests (
  id         uuid        not null default gen_random_uuid()
    constraint support_requests_pkey primary key,
  user_id    uuid        not null default auth.uid()
    constraint support_requests_user_id_fkey references nestly.users (id) on delete cascade,
  topic      text        not null
    constraint support_requests_topic_check check (topic in ('account', 'bug', 'privacy_safety', 'usage', 'suggestion', 'other')),
  body       text        not null
    constraint support_requests_body_check check (pg_catalog.char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  status     text        not null default 'open'
    constraint support_requests_status_check check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at  timestamptz,
  constraint support_requests_closed_at_check check ((closed_at is null) = (status <> 'closed'))
);

create index support_requests_user_created_idx on nestly.support_requests (user_id, created_at desc);
create index support_requests_status_created_idx on nestly.support_requests (status, created_at desc);

-- 6. support_messages.
create table nestly.support_messages (
  id                 uuid        not null default gen_random_uuid()
    constraint support_messages_pkey primary key,
  support_request_id uuid        not null
    constraint support_messages_support_request_id_fkey references nestly.support_requests (id) on delete cascade,
  author_kind        text        not null
    constraint support_messages_author_kind_check check (author_kind in ('user', 'support')),
  is_internal        boolean     not null default false,
  body               text        not null
    constraint support_messages_body_check check (pg_catalog.char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at         timestamptz not null default now(),
  constraint support_messages_is_internal_check check (not is_internal or author_kind = 'support')
);

create index support_messages_request_created_idx on nestly.support_messages (support_request_id, created_at);

-- 7. chat_reads.
create table nestly.chat_reads (
  id                 uuid        not null default gen_random_uuid()
    constraint chat_reads_pkey primary key,
  user_id            uuid        not null default auth.uid()
    constraint chat_reads_user_id_fkey references nestly.users (id) on delete cascade,
  conversation_id    uuid
    constraint chat_reads_conversation_id_fkey references nestly.conversations (id) on delete cascade,
  support_request_id uuid
    constraint chat_reads_support_request_id_fkey references nestly.support_requests (id) on delete cascade,
  last_read_at       timestamptz not null default now(),
  constraint chat_reads_thread_check check (pg_catalog.num_nonnulls(conversation_id, support_request_id) = 1)
);

create unique index chat_reads_user_conversation_key on nestly.chat_reads (user_id, conversation_id) where conversation_id is not null;
create unique index chat_reads_user_support_request_key on nestly.chat_reads (user_id, support_request_id) where support_request_id is not null;
create index chat_reads_conversation_id_idx on nestly.chat_reads (conversation_id) where conversation_id is not null;
create index chat_reads_support_request_id_idx on nestly.chat_reads (support_request_id) where support_request_id is not null;

-- 8. reports: a message can be reported (§9.6). The FK is SET NULL, which an open report refuses (reports_open_target_check), as for
--    posts and comments.
alter table nestly.reports add column message_id uuid;
alter table nestly.reports
  add constraint reports_message_id_fkey foreign key (message_id) references nestly.messages (id) on delete set null,
  add constraint reports_reporter_message_key unique (reporter_id, message_id);
alter table nestly.reports drop constraint reports_target_kind_check;
alter table nestly.reports add constraint reports_target_kind_check check (target_kind in ('post', 'comment', 'user', 'message'));
alter table nestly.reports drop constraint reports_one_target_check;
alter table nestly.reports add constraint reports_one_target_check check (num_nonnulls(post_id, comment_id, reported_user_id, message_id) <= 1);
alter table nestly.reports drop constraint reports_open_target_check;
alter table nestly.reports add constraint reports_open_target_check check (
  status <> 'open'
  or case target_kind
       when 'post' then post_id is not null
       when 'comment' then comment_id is not null
       when 'message' then message_id is not null
       else reported_user_id is not null
     end);
create index reports_message_id_idx on nestly.reports (message_id) where message_id is not null;

-- 9. reported_message_views.
create table nestly.reported_message_views (
  id         uuid        not null default gen_random_uuid()
    constraint reported_message_views_pkey primary key,
  report_id  uuid        not null
    constraint reported_message_views_report_id_fkey references nestly.reports (id) on delete cascade,
  viewer_id  uuid        not null default auth.uid()
    constraint reported_message_views_viewer_id_fkey references nestly.users (id) on delete restrict,
  view_xact  xid8        not null default pg_catalog.pg_current_xact_id(),
  created_at timestamptz not null default now()
);

create index reported_message_views_report_id_idx on nestly.reported_message_views (report_id);
create index reported_message_views_viewer_id_idx on nestly.reported_message_views (viewer_id);

-- 10. Triggers (SECURITY INVOKER; auth.uid() is the actor).

-- chat_requests: the target answers a pending request (accept or decline) and the requester may cancel it, once each; nothing else moves
-- (the status-copy cascade aside). A decline ends that request only (§9.3).
create function nestly.chat_requests_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.requester_id, new.target_id, new.target_account_type, new.opening_message, new.created_at)
     is distinct from (old.id, old.requester_id, old.target_id, old.target_account_type, old.opening_message, old.created_at) then
    raise exception 'chat_requests: immutable column' using errcode = '42501';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'pending'
     and ((auth.uid() = old.target_id and new.status in ('accepted', 'declined'))
       or (auth.uid() = old.requester_id and new.status = 'cancelled')) then
    new.responded_at := pg_catalog.now();
    return new;
  end if;
  raise exception 'chat_requests: transition refused' using errcode = '42501';
end
$$;

-- At most 20 new requests per account in 24 hours, every status counted. The requester always reads its own rows
-- (chat_requests_select_requester), so neither a block nor a suspension of the other side hides one from the count; the advisory lock,
-- keyed on the requester, makes concurrent inserts of one account count one after the other (the count runs after the lock, in a fresh
-- snapshot, which only read committed gives: any other isolation level is refused, 25000).
create function nestly.chat_requests_insert_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'chat_requests: the daily limit needs a read committed transaction' using errcode = '25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8101, pg_catalog.hashtext(new.requester_id::text));
  if (select pg_catalog.count(*) from nestly.chat_requests r
       where r.requester_id = new.requester_id and r.created_at > pg_catalog.now() - interval '24 hours') >= 20 then
    raise exception 'chat_requests: too many requests in 24 hours' using errcode = 'NS022';
  end if;
  return new;
end
$$;

-- chat_blocks: a lift sets lifted_at once, to the database clock.
create function nestly.chat_blocks_lift_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.blocker_id, new.blocked_id, new.blocked_account_type, new.created_at)
     is distinct from (old.id, old.blocker_id, old.blocked_id, old.blocked_account_type, old.created_at)
     or old.lifted_at is not null or new.lifted_at is null then
    raise exception 'chat_blocks: only a lift is allowed' using errcode = '42501';
  end if;
  new.lifted_at := pg_catalog.now();
  return new;
end
$$;

-- At most 20 Chat Blocks per account in 24 hours, lifted ones included (the blocker reads all its own rows), under a per-blocker lock.
create function nestly.chat_blocks_insert_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'chat_blocks: the daily limit needs a read committed transaction' using errcode = '25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8102, pg_catalog.hashtext(new.blocker_id::text));
  if (select pg_catalog.count(*) from nestly.chat_blocks b
       where b.blocker_id = new.blocker_id and b.created_at > pg_catalog.now() - interval '24 hours') >= 20 then
    raise exception 'chat_blocks: too many Chat Blocks in 24 hours' using errcode = 'NS025';
  end if;
  return new;
end
$$;

-- chat_reads: the marker is the database clock of the read, and only moves forward.
create function nestly.chat_reads_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.id, new.user_id, new.conversation_id, new.support_request_id)
     is distinct from (old.id, old.user_id, old.conversation_id, old.support_request_id) then
    raise exception 'chat_reads: immutable column' using errcode = '42501';
  end if;
  new.last_read_at := pg_catalog.now();
  return new;
end
$$;

-- support_requests: only the status moves, and a closed request stays closed; the clocks follow the status.
create function nestly.support_requests_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.user_id, new.topic, new.body, new.created_at, new.closed_at)
     is distinct from (old.id, old.user_id, old.topic, old.body, old.created_at, old.closed_at) then
    raise exception 'support_requests: immutable column' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'closed' then
      raise exception 'support_requests: a closed request is not reopened' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.now();
    new.closed_at := case when new.status = 'closed' then pg_catalog.now() end;
  end if;
  return new;
end
$$;

-- At most 5 new requests per account in 24 hours (the user reads all its own rows), under a per-user lock.
create function nestly.support_requests_insert_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'support_requests: the daily limit needs a read committed transaction' using errcode = '25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8103, pg_catalog.hashtext(new.user_id::text));
  if (select pg_catalog.count(*) from nestly.support_requests s
       where s.user_id = new.user_id and s.created_at > pg_catalog.now() - interval '24 hours') >= 5 then
    raise exception 'support_requests: too many requests in 24 hours' using errcode = 'NS023';
  end if;
  return new;
end
$$;

-- support_messages: the author is decided by the database — a staff member writes as Support, anyone else as the user.
create function nestly.support_messages_author()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.author_kind := case when (select nestly.caller_staff_role()) is not null then 'support' else 'user' end;
  return new;
end
$$;

revoke execute on function nestly.chat_requests_transition() from public;
revoke execute on function nestly.chat_requests_insert_limit() from public;
revoke execute on function nestly.chat_blocks_lift_guard() from public;
revoke execute on function nestly.chat_blocks_insert_limit() from public;
revoke execute on function nestly.chat_reads_stamp() from public;
revoke execute on function nestly.support_requests_transition() from public;
revoke execute on function nestly.support_requests_insert_limit() from public;
revoke execute on function nestly.support_messages_author() from public;

create trigger chat_requests_transition before update on nestly.chat_requests
  for each row execute function nestly.chat_requests_transition();
create trigger chat_requests_insert_limit before insert on nestly.chat_requests
  for each row execute function nestly.chat_requests_insert_limit();
create trigger chat_blocks_lift_guard before update on nestly.chat_blocks
  for each row execute function nestly.chat_blocks_lift_guard();
create trigger chat_blocks_insert_limit before insert on nestly.chat_blocks
  for each row execute function nestly.chat_blocks_insert_limit();
create trigger chat_reads_stamp before insert or update on nestly.chat_reads
  for each row execute function nestly.chat_reads_stamp();
create trigger support_requests_transition before update on nestly.support_requests
  for each row execute function nestly.support_requests_transition();
create trigger support_requests_insert_limit before insert on nestly.support_requests
  for each row execute function nestly.support_requests_insert_limit();
create trigger support_messages_author before insert on nestly.support_messages
  for each row execute function nestly.support_messages_author();

-- A reported message must be readable to the reporter (a party of its conversation) and not its own; everything else as before.
create or replace function nestly.reports_insert_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target record;
begin
  if new.post_id is not null then
    -- a readable post that is not the reporter's own; absent and unreadable look the same (no oracle)
    select p.author_id into target from nestly.posts p where p.id = new.post_id;
    if not found
       or target.author_id = uid
       or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = uid) then
      raise exception 'reports: the post cannot be reported' using errcode = '42501';
    end if;
  elsif new.comment_id is not null then
    select c.author_id, c.post_id into target from nestly.comments c where c.id = new.comment_id;
    if not found
       or target.author_id = uid
       or (target.author_id is null
           and exists (select 1 from nestly.post_authors pa where pa.post_id = target.post_id and pa.author_id = uid)) then
      raise exception 'reports: the comment cannot be reported' using errcode = '42501';
    end if;
  elsif new.message_id is not null then
    -- the reporter's own read of the message (a party only); its text is not copied (reports_insert_snapshot copies posts and comments only)
    select m.sender_id into target from nestly.messages m where m.id = new.message_id;
    if not found or target.sender_id = uid then
      raise exception 'reports: the message cannot be reported' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

-- A user block also ends a pending chat request of the pair (finding 1): declined when the blocker was asked, cancelled when it asked.
create or replace function nestly.user_blocks_end_relations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update nestly.friendships f set status = 'removed'
    where f.status = 'accepted'
      and ((f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
        or (f.addressee_id = new.blocker_id and f.requester_id = new.blocked_id));
  update nestly.friendships f set status = 'declined'
    where f.status = 'pending' and f.cancelled_at is null
      and f.addressee_id = new.blocker_id and f.requester_id = new.blocked_id;
  update nestly.friendships f set cancelled_at = pg_catalog.now()
    where f.status = 'pending' and f.cancelled_at is null
      and f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id;
  perform pg_catalog.set_config('nestly.block_ending', new.blocked_id::text, true);
  update nestly.chat_requests r set status = 'declined'
    where r.status = 'pending' and r.target_id = new.blocker_id and r.requester_id = new.blocked_id;
  perform pg_catalog.set_config('nestly.block_ending', '', true);
  update nestly.chat_requests r set status = 'cancelled'
    where r.status = 'pending' and r.requester_id = new.blocker_id and r.target_id = new.blocked_id;
  return new;
end
$$;

-- 11. RLS, grants and policies.
alter table nestly.chat_requests enable row level security, force row level security;
alter table nestly.conversations enable row level security, force row level security;
alter table nestly.messages enable row level security, force row level security;
alter table nestly.chat_blocks enable row level security, force row level security;
alter table nestly.chat_reads enable row level security, force row level security;
alter table nestly.support_requests enable row level security, force row level security;
alter table nestly.support_messages enable row level security, force row level security;
alter table nestly.reported_message_views enable row level security, force row level security;

revoke all on table nestly.chat_requests, nestly.conversations, nestly.messages, nestly.chat_blocks, nestly.chat_reads,
  nestly.support_requests, nestly.support_messages, nestly.reported_message_views from public, anon, authenticated;

-- The two status copies are never granted (the policies read them): a requester never learns the target's enforcement state.
grant select (id, requester_id, target_id, target_account_type, opening_message, status, created_at, responded_at) on table nestly.chat_requests to authenticated;
grant insert (target_id, target_account_type, opening_message), update (status) on table nestly.chat_requests to authenticated;
grant select on table nestly.conversations to authenticated;
grant insert (context, user_a, user_b, chat_request_id) on table nestly.conversations to authenticated;
grant select on table nestly.messages to authenticated;
grant insert (conversation_id, body) on table nestly.messages to authenticated;
grant select on table nestly.chat_blocks to authenticated;
grant insert (blocked_id, blocked_account_type), update (lifted_at) on table nestly.chat_blocks to authenticated;
grant select on table nestly.chat_reads to authenticated;
grant insert (conversation_id, support_request_id), update (last_read_at) on table nestly.chat_reads to authenticated;
grant select on table nestly.support_requests to authenticated;
grant insert (topic, body), update (status) on table nestly.support_requests to authenticated;
grant select on table nestly.support_messages to authenticated;
grant insert (support_request_id, body, is_internal) on table nestly.support_messages to authenticated;
grant select on table nestly.reported_message_views to authenticated;
grant insert (report_id) on table nestly.reported_message_views to authenticated;
grant insert (message_id) on table nestly.reports to authenticated;

-- chat_requests. The requester always reads its own requests and their own opening text (the daily limit counts them; the status copies
-- are not granted). The target reads a request while the requester is active and no user block stands between them; a user block ends a
-- pending request (user_blocks_end_relations names the blocked account in nestly.block_ending for its own statement only, so the
-- blocker can decline a request it can no longer see, from a suspended requester too).
create policy chat_requests_select_requester on nestly.chat_requests
  for select to authenticated
  using ((select nestly.is_active_account()) and requester_id = (select auth.uid()));

create policy chat_requests_select_target on nestly.chat_requests
  for select to authenticated
  using ((select nestly.is_active_account()) and target_id = (select auth.uid()) and (
    (requester_status = 'active' and requester_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))
    or requester_id::text = pg_catalog.current_setting('nestly.block_ending', true)));

-- I8: a Regular asks a Regular who is not a Friend, with whom it has no conversation, across no user block and no Chat Block (VAL-025).
create policy chat_requests_insert_requester on nestly.chat_requests
  for insert to authenticated
  with check ((select nestly.is_active_account()) and requester_id = (select auth.uid()) and status = 'pending'
    and (select nestly.caller_account_type()) = 'regular' and target_account_type = 'regular'
    and requester_status = 'active' and target_status = 'active'
    and target_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and not exists (select 1 from nestly.friendships f where f.status = 'accepted'
                     and ((f.requester_id = (select auth.uid()) and f.addressee_id = chat_requests.target_id)
                       or (f.addressee_id = (select auth.uid()) and f.requester_id = chat_requests.target_id)))
    and not exists (select 1 from nestly.conversations c
                     where c.user_a = least((select auth.uid()), chat_requests.target_id)
                       and c.user_b = greatest((select auth.uid()), chat_requests.target_id))
    and not exists (select 1 from nestly.chat_blocks b where b.lifted_at is null
                     and ((b.blocker_id = (select auth.uid()) and b.blocked_id = chat_requests.target_id)
                       or (b.blocked_id = (select auth.uid()) and b.blocker_id = chat_requests.target_id))));

-- The target answers a pending request. A decline always passes (also across a user block, which is how a block ends it); an accept needs
-- an active requester and neither a user block nor a Chat Block between the two.
create policy chat_requests_update_target on nestly.chat_requests
  for update to authenticated
  using ((select nestly.is_active_account()) and target_id = (select auth.uid()) and status = 'pending')
  with check ((select nestly.is_active_account()) and target_id = (select auth.uid())
    and (status = 'declined'
      or (status = 'accepted' and requester_status = 'active'
          and requester_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
          and not exists (select 1 from nestly.chat_blocks b where b.lifted_at is null
                           and ((b.blocker_id = (select auth.uid()) and b.blocked_id = chat_requests.requester_id)
                             or (b.blocked_id = (select auth.uid()) and b.blocker_id = chat_requests.requester_id))))));

-- The requester withdraws its own pending request.
create policy chat_requests_update_requester on nestly.chat_requests
  for update to authenticated
  using ((select nestly.is_active_account()) and requester_id = (select auth.uid()) and status = 'pending')
  with check ((select nestly.is_active_account()) and requester_id = (select auth.uid()) and status = 'cancelled');

-- conversations. A party sees it while the other party is active and no user block stands between them.
create policy conversations_select_party on nestly.conversations
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    (user_a = (select auth.uid()) and b_status = 'active' and user_b <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))
    or (user_b = (select auth.uid()) and a_status = 'active' and user_a <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

-- A party opens it: Friends now (FR-CHAT-002), or a party of that pair's accepted request.
create policy conversations_insert_party on nestly.conversations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select auth.uid()) in (user_a, user_b)
    and a_status = 'active' and b_status = 'active'
    and (case when user_a = (select auth.uid()) then user_b else user_a end) <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and ((context = 'friends' and exists (
           select 1 from nestly.friendships f where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id) = conversations.user_a and greatest(f.requester_id, f.addressee_id) = conversations.user_b))
      or (context = 'request' and exists (
           select 1 from nestly.chat_requests r where r.id = conversations.chat_request_id and r.status = 'accepted'
            and least(r.requester_id, r.target_id) = conversations.user_a and greatest(r.requester_id, r.target_id) = conversations.user_b))));

-- messages. Read through the conversation (a party only); a party sends while no Chat Block stands between the two (§9.4).
create policy messages_select_party on nestly.messages
  for select to authenticated
  using ((select nestly.is_active_account()) and exists (select 1 from nestly.conversations c where c.id = messages.conversation_id));

-- Staff read a reported message only (§9.6): REPORTS_VIEW on the admin screens, inside the transaction that recorded the view of a report
-- on that message (reported_message_views, audited). Never the conversation, never another message of it.
create policy messages_select_staff on nestly.messages
  for select to authenticated
  using ((select nestly.is_active_account()) and pg_catalog.current_setting('nestly.staff_view', true) = 'on'
    and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r join nestly.reported_message_views v on v.report_id = r.id
                 where r.message_id = messages.id and v.viewer_id = (select auth.uid())
                   and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned()));

create policy messages_insert_party on nestly.messages
  for insert to authenticated
  with check ((select nestly.is_active_account()) and sender_id = (select auth.uid())
    and exists (select 1 from nestly.conversations c where c.id = messages.conversation_id
                 and not exists (select 1 from nestly.chat_blocks b where b.lifted_at is null
                   and ((b.blocker_id = c.user_a and b.blocked_id = c.user_b) or (b.blocker_id = c.user_b and b.blocked_id = c.user_a)))));

-- chat_blocks. Both parties see a standing block (the send checks need it); the blocker also sees its lifted ones (the daily limit).
create policy chat_blocks_select_party on nestly.chat_blocks
  for select to authenticated
  using ((select nestly.is_active_account()) and (select auth.uid()) in (blocker_id, blocked_id)
    and (lifted_at is null or blocker_id = (select auth.uid())));

create policy chat_blocks_insert_blocker on nestly.chat_blocks
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.caller_account_type()) in ('regular', 'professional')
    and blocker_id = (select auth.uid()) and lifted_at is null);

create policy chat_blocks_update_blocker on nestly.chat_blocks
  for update to authenticated
  using ((select nestly.is_active_account()) and blocker_id = (select auth.uid()) and lifted_at is null)
  with check (blocker_id = (select auth.uid()) and lifted_at is not null);

-- chat_reads. Owner only (no read receipts, §9.5); a marker names a thread its owner can read.
create policy chat_reads_select_own on nestly.chat_reads
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy chat_reads_insert_own on nestly.chat_reads
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid())
    and (exists (select 1 from nestly.conversations c where c.id = chat_reads.conversation_id)
      or exists (select 1 from nestly.support_requests s where s.id = chat_reads.support_request_id and s.user_id = (select auth.uid()))));

create policy chat_reads_update_own on nestly.chat_reads
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()));

-- support_requests. The user reads its own; SUPPORT_VIEW reads every request on the admin screens; SUPPORT_HANDLE changes the status.
create policy support_requests_select_own on nestly.support_requests
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy support_requests_select_staff on nestly.support_requests
  for select to authenticated
  using ((select nestly.is_active_account()) and pg_catalog.current_setting('nestly.staff_view', true) = 'on'
    and (select nestly.has_permission('SUPPORT_VIEW')));

create policy support_requests_insert_own on nestly.support_requests
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()) and status = 'open'
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

create policy support_requests_update_staff on nestly.support_requests
  for update to authenticated
  using ((select nestly.is_active_account()) and pg_catalog.current_setting('nestly.staff_view', true) = 'on'
    and (select nestly.has_permission('SUPPORT_HANDLE')))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('SUPPORT_HANDLE')));

-- support_messages. The user reads its thread without the internal notes and replies while the request is not closed; SUPPORT_VIEW reads
-- every thread on the admin screens; SUPPORT_HANDLE replies (not into a closed request) and adds internal notes.
create policy support_messages_select_own on nestly.support_messages
  for select to authenticated
  using ((select nestly.is_active_account()) and not is_internal
    and exists (select 1 from nestly.support_requests s where s.id = support_messages.support_request_id and s.user_id = (select auth.uid())));

create policy support_messages_select_staff on nestly.support_messages
  for select to authenticated
  using ((select nestly.is_active_account()) and pg_catalog.current_setting('nestly.staff_view', true) = 'on'
    and (select nestly.has_permission('SUPPORT_VIEW')));

create policy support_messages_insert_own on nestly.support_messages
  for insert to authenticated
  with check ((select nestly.is_active_account()) and author_kind = 'user' and not is_internal
    and exists (select 1 from nestly.support_requests s where s.id = support_messages.support_request_id
                 and s.user_id = (select auth.uid()) and s.status <> 'closed'));

create policy support_messages_insert_staff on nestly.support_messages
  for insert to authenticated
  with check ((select nestly.is_active_account()) and author_kind = 'support' and (select nestly.has_permission('SUPPORT_HANDLE'))
    and exists (select 1 from nestly.support_requests s where s.id = support_messages.support_request_id
                 and (is_internal or s.status <> 'closed')));

-- reported_message_views. A REPORTS_VIEW holder on the admin screens records its view of a message report (audited); it reads its own rows.
create policy reported_message_views_select_own on nestly.reported_message_views
  for select to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

create policy reported_message_views_insert_staff on nestly.reported_message_views
  for insert to authenticated
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid())
    and pg_catalog.current_setting('nestly.staff_view', true) = 'on' and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r
                 where r.id = reported_message_views.report_id and r.target_kind = 'message' and r.message_id is not null));

-- reports: a message report is handled like a user report (the action is on the sender's account: USER_WARN, USER_SUSPEND or USER_BAN).
drop policy reports_update_staff on nestly.reports;
create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and (case when target_kind in ('user', 'message')
           then ((select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
                 or (select nestly.has_permission('USER_BAN')))
           else (select nestly.has_permission('CONTENT_MODERATE')) end))
  with check (status = 'handled');

-- regular_names: the other party of one's conversation, of one's own request, or of a pending request to one (three policies, each one
-- indexed lookup; finding 7); and, on the Support inbox only (nestly.staff_view), the authors of the requests SUPPORT_VIEW reads. The
-- restrictive block policy still applies.
create policy regular_names_select_conversation on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.conversations c
                 where c.user_a = least((select auth.uid()), regular_names.user_id)
                   and c.user_b = greatest((select auth.uid()), regular_names.user_id)));

create policy regular_names_select_request_sent on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.chat_requests r where r.requester_id = (select auth.uid()) and r.target_id = regular_names.user_id
                 and r.status = 'pending'));

create policy regular_names_select_request_received on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.chat_requests r
                 where r.target_id = (select auth.uid()) and r.requester_id = regular_names.user_id and r.status = 'pending'));

create policy regular_names_select_support on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account()) and pg_catalog.current_setting('nestly.staff_view', true) = 'on'
    and (select nestly.has_permission('SUPPORT_VIEW'))
    and exists (select 1 from nestly.support_requests s where s.user_id = regular_names.user_id));

-- 12. The audit: audit_trigger() gains the Support and reported-message branches; the rest is the text of 20261021500000, unchanged.
create or replace function nestly.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select nestly.caller_staff_role());
  v_reason text := nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '');
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_action text;
  v_kind text;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_role is null then
    -- the owner role (fixtures, bootstrap) has no identity; a runtime caller whose staff role or session does not hold leaves no record, so it does nothing
    if auth.uid() is not null then
      raise exception 'audit_trigger: an unauditable action is refused' using errcode = '42501';
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;
  if tg_table_name = 'moderator_permissions' then
    v_key := 'MODERATOR_MANAGE';
    v_action := case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end;
    v_kind := 'user';
    v_target := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('permission', v_old ->> 'permission_key') end;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('permission', v_new ->> 'permission_key') end;
  elsif tg_table_name = 'report_reasons' then
    v_key := 'COMMUNITY_CONFIG';
    v_action := 'report_reason_changed';
    v_kind := 'report_reason';
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('key', v_old ->> 'key', 'label', v_old ->> 'label',
      'priority', v_old -> 'priority', 'sortOrder', v_old -> 'sort_order', 'isActive', v_old -> 'is_active') end;
    v_after := pg_catalog.jsonb_build_object('key', v_new ->> 'key', 'label', v_new ->> 'label', 'priority', v_new -> 'priority',
      'sortOrder', v_new -> 'sort_order', 'isActive', v_new -> 'is_active');
  elsif tg_table_name = 'reports' then
    v_key := 'REPORTS_VIEW';
    v_action := 'report_handled';
    v_kind := 'report';
    v_target := (v_new ->> 'id')::uuid;
    v_reason := nullif(v_new ->> 'handler_note', '');
    v_after := pg_catalog.jsonb_build_object('resolution', v_new ->> 'resolution', 'targetKind', v_new ->> 'target_kind', 'reason', v_new ->> 'reason');
  elsif tg_table_name in ('posts', 'comments') then
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'status' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'posts' then 'post' else 'comment' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status');
  elsif tg_table_name = 'user_enforcements' then
    v_key := case v_new ->> 'kind' when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end;
    v_action := case v_new ->> 'kind' when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end;
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := v_new ->> 'reason';
    v_before := pg_catalog.jsonb_build_object('status', v_new ->> 'status_before');
    v_after := pg_catalog.jsonb_build_object('kind', v_new ->> 'kind', 'durationHours', v_new -> 'duration_hours', 'suspendedUntil', v_new -> 'suspended_until',
      'suggestedKind', v_new ->> 'suggested_kind', 'suggestedHours', v_new -> 'suggested_hours', 'stepSkipped', v_new -> 'is_step_skipped',
      'childSafety', v_new -> 'is_child_safety', 'reportId', v_new -> 'report_id');
  elsif tg_table_name = 'status_guides' then
    -- FR-ADMIN-012: an Admin-only action (no assignable Permission Key applies). Before/After carry what the guide is, not its text.
    v_action := case
      when tg_op = 'INSERT' then 'guide_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then case v_new ->> 'status'
        when 'published' then 'guide_published' when 'hidden' then 'guide_hidden' else 'guide_unpublished' end
      else 'guide_edited' end;
    v_kind := 'guide';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'stageKind', v_old ->> 'stage_kind', 'rangeFrom', v_old -> 'range_from', 'rangeTo', v_old -> 'range_to',
      'sourceCheckedOn', v_old ->> 'source_checked_on', 'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'stageKind', v_new ->> 'stage_kind',
      'rangeFrom', v_new -> 'range_from', 'rangeTo', v_new -> 'range_to', 'sourceCheckedOn', v_new ->> 'source_checked_on',
      'bodyChars', pg_catalog.char_length(v_new ->> 'body'), 'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'media_assets' then
    -- FR-FEED-002 / BR-076 (Afik 20.10.2026): a staff decision on an image (a queued one approved or rejected; a checked one rejected after
    -- a report or as a suspicion). heldAsSuspected: the image is kept 90 days and never enters the training set.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'mediaKind', v_new ->> 'kind', 'heldAsSuspected', v_new -> 'is_held');
  elsif tg_table_name = 'media_reviews' then
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told).
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_suspected';
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after');
  elsif tg_table_name = 'support_requests' then
    -- FR-ADMIN-002: a status change of a Support request (the trigger fires only when the status moves).
    v_key := 'SUPPORT_HANDLE';
    v_action := 'support_status_changed';
    v_kind := 'support_request';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'topic', v_new ->> 'topic');
  elsif tg_table_name = 'support_messages' then
    -- FR-ADMIN-002, FR-CHAT-004: a reply in the name of Support or an internal note (the trigger fires only for author_kind 'support').
    -- The entry carries what it was, never the text.
    v_key := 'SUPPORT_HANDLE';
    v_action := case when (v_new ->> 'is_internal')::boolean then 'support_note_added' else 'support_replied' end;
    v_kind := 'support_request';
    v_target := (v_new ->> 'support_request_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('internal', v_new -> 'is_internal', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'));
  elsif tg_table_name = 'reported_message_views' then
    -- §9.6 (Afik 20.10.2026): a staff member opened a reported chat message (only that message; never the conversation).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_message_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger support_requests_audit
  after update on nestly.support_requests
  for each row when (old.status is distinct from new.status) execute function nestly.audit_trigger();
create trigger support_messages_audit
  after insert on nestly.support_messages
  for each row when (new.author_kind = 'support') execute function nestly.audit_trigger();
create trigger reported_message_views_audit
  after insert on nestly.reported_message_views
  for each row execute function nestly.audit_trigger();

-- 13. Comments.
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, or a staff view of a reported chat message: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason) and Before/After. A caller who is no staff member leaves none.';
comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert: a reported post, comment or chat message must be readable to the reporter and not their own (42501); for a post or comment named or through post_authors.';
comment on function nestly.user_blocks_end_relations() is
  'SECURITY INVOKER. After insert of a block: ends the pair''s Friendship and pending Friend Requests, and a pending chat request (declined when the blocker was asked, cancelled when it asked), with the blocker''s rights.';

comment on table nestly.chat_requests is 'SRS RegularChatRequest (FR-CHAT-003, VAL-025, BR-042, AC-051): an opening message to an account that is not a Friend (I8: Regular to Regular). Pending until the target accepts (a conversation opens) or declines (that request only; §9.3), or the requester cancels it. No DELETE: kept until the account is deleted (§9.2).';
comment on column nestly.chat_requests.id is 'Row id.';
comment on column nestly.chat_requests.requester_id is 'The asking account (database default auth.uid()).';
comment on column nestly.chat_requests.target_id is 'The account asked.';
comment on column nestly.chat_requests.target_account_type is 'The target''s account type, held by the composite FK to users: never a staff account.';
comment on column nestly.chat_requests.opening_message is 'The opening message, 1-2000 characters, not blank. Shown to the target with the request and as the first message of the conversation it opens.';
comment on column nestly.chat_requests.status is 'pending; accepted (the target opened a conversation); declined (the target; also when the target blocks the requester); cancelled (the requester; also when the requester blocks the target). Moves once, from pending.';
comment on column nestly.chat_requests.requester_status is 'Copy of the requester''s users.status (cascade): the target sees the request only while the requester is active. Never granted.';
comment on column nestly.chat_requests.target_status is 'Copy of the target''s users.status (cascade). Never granted.';
comment on column nestly.chat_requests.created_at is 'Database clock; the 24-hour request limit counts it.';
comment on column nestly.chat_requests.responded_at is 'When the request was answered or cancelled (database clock); NULL while pending.';
comment on index nestly.chat_requests_pair_live_key is 'At most one pending or accepted request per pair, either direction.';
comment on index nestly.chat_requests_target_id_idx is 'The target''s requests; the users FK cascade.';
comment on index nestly.chat_requests_requester_created_idx is 'The 24-hour request limit; the users FK cascade.';

comment on table nestly.conversations is 'SRS Conversation (FR-CHAT-001/002, VAL-024, BR-042, AC-045): one conversation per pair of accounts, opened by a party while Friends or from the pair''s accepted request. It survives Remove Friend. Never updated or deleted by a client.';
comment on column nestly.conversations.id is 'Row id.';
comment on column nestly.conversations.context is 'How it opened: friends (an accepted Friendship) or request (an accepted chat request).';
comment on column nestly.conversations.user_a is 'The party with the smaller id (an account, users).';
comment on column nestly.conversations.user_b is 'The party with the larger id.';
comment on column nestly.conversations.a_status is 'Copy of user_a''s users.status (cascade): user_b sees the conversation only while user_a is active.';
comment on column nestly.conversations.b_status is 'Copy of user_b''s users.status (cascade).';
comment on column nestly.conversations.chat_request_id is 'The accepted request it came from (context request); NULL for friends.';
comment on column nestly.conversations.created_at is 'Database clock.';
comment on index nestly.conversations_pair_key is 'One conversation per pair.';
comment on index nestly.conversations_user_b_idx is 'The second party''s conversations; the FK cascade.';
comment on index nestly.conversations_chat_request_id_idx is 'The chat_requests FK cascade.';

comment on table nestly.messages is 'SRS Message (FR-CHAT-001, BR-036, BR-052, AC-067): a text message of a conversation (text only, OP-011). Only the parties read it; staff read a reported one only, audited (§9.6); never a Signal, never copied to analytics. No UPDATE or DELETE; kept until the account is deleted (§9.2).';
comment on column nestly.messages.id is 'Row id.';
comment on column nestly.messages.conversation_id is 'The conversation.';
comment on column nestly.messages.sender_id is 'The sending party (database default auth.uid()).';
comment on column nestly.messages.body is 'The text, 1-2000 characters, not blank.';
comment on column nestly.messages.created_at is 'Database clock; the order of the thread and the unread count.';
comment on index nestly.messages_conversation_created_idx is 'A thread, newest first; its latest message; the unread count.';
comment on index nestly.messages_sender_id_idx is 'The users FK cascade.';

comment on table nestly.chat_blocks is 'SRS ChatBlock (FR-SERV-009, BR-011, ERR-008, AC-052): messaging only; while it stands neither side sends (§9.4); hides no account, ends no Friendship or Follow. Lifted by the blocker. Separate from user_blocks (FR-REL-002). At most 20 per account in 24 hours.';
comment on column nestly.chat_blocks.id is 'Row id.';
comment on column nestly.chat_blocks.blocker_id is 'The blocking account (database default auth.uid()).';
comment on column nestly.chat_blocks.blocked_id is 'The blocked account (Regular or Professional).';
comment on column nestly.chat_blocks.blocked_account_type is 'The blocked account''s type, held by the composite FK: never a staff account.';
comment on column nestly.chat_blocks.created_at is 'Database clock; the 24-hour limit counts it.';
comment on column nestly.chat_blocks.lifted_at is 'When the blocker lifted it (database clock); NULL while it stands.';
comment on index nestly.chat_blocks_active_pair_key is 'One standing Chat Block per blocker and blocked account.';
comment on index nestly.chat_blocks_blocked_id_idx is 'The send checks from the blocked side; the FK cascade.';
comment on index nestly.chat_blocks_blocker_created_idx is 'The 24-hour Chat Block limit.';

comment on table nestly.chat_reads is 'Each account''s read marker per conversation or Support thread (FR-CHAT-001 unread state). Owner only: the other party never sees it (no read receipts, §9.5); the marker is the database clock of the read.';
comment on column nestly.chat_reads.id is 'Row id.';
comment on column nestly.chat_reads.user_id is 'The reading account (database default auth.uid()).';
comment on column nestly.chat_reads.conversation_id is 'The conversation read, or NULL.';
comment on column nestly.chat_reads.support_request_id is 'The Support thread read (the user''s own request), or NULL.';
comment on column nestly.chat_reads.last_read_at is 'Messages after this time from the other side are unread. Set by the trigger to now().';
comment on constraint chat_reads_thread_check on nestly.chat_reads is 'Exactly one thread per marker.';
comment on index nestly.chat_reads_user_conversation_key is 'One marker per account and conversation.';
comment on index nestly.chat_reads_user_support_request_key is 'One marker per account and Support thread.';
comment on index nestly.chat_reads_conversation_id_idx is 'The conversations FK cascade.';
comment on index nestly.chat_reads_support_request_id_idx is 'The support_requests FK cascade.';

comment on table nestly.support_requests is 'SRS SupportRequest (FR-ADMIN-001/002, BR-043, AC-024): a Regular''s or Professional''s request to Support. The user reads its own; SUPPORT_VIEW reads all on the admin screens; SUPPORT_HANDLE changes the status (audited). The handler is named in the Audit Log only. Kept until the account is deleted (§9.2).';
comment on column nestly.support_requests.id is 'Row id.';
comment on column nestly.support_requests.user_id is 'The requesting account (database default auth.uid()).';
comment on column nestly.support_requests.topic is 'The chosen topic (§9.1): account (account and sign-in), bug (a site problem), privacy_safety, usage (a usage question), suggestion (an improvement suggestion), other.';
comment on column nestly.support_requests.body is 'The request text, 1-2000 characters, not blank.';
comment on column nestly.support_requests.status is 'open, in_progress or closed. Closed is final: it takes no reply and is not reopened; a new topic is a new request (FR-CHAT-004).';
comment on column nestly.support_requests.created_at is 'Database clock; the 24-hour request limit counts it.';
comment on column nestly.support_requests.updated_at is 'The last status change (database clock).';
comment on column nestly.support_requests.closed_at is 'When it was closed; NULL unless closed.';
comment on index nestly.support_requests_user_created_idx is 'The user''s requests; the 24-hour limit; the users FK cascade.';
comment on index nestly.support_requests_status_created_idx is 'The Support inbox by status.';

comment on table nestly.support_messages is 'SRS SupportThread (FR-CHAT-004, VAL-026, BR-043, AC-053): the thread of a Support request. The user''s replies, Support''s replies (shown as "Support", no staff identity stored) and internal notes only staff read.';
comment on column nestly.support_messages.id is 'Row id.';
comment on column nestly.support_messages.support_request_id is 'The request.';
comment on column nestly.support_messages.author_kind is 'user or support, set by the database from the caller (a staff member writes as Support).';
comment on column nestly.support_messages.is_internal is 'An internal note: staff only, never shown to the user.';
comment on column nestly.support_messages.body is 'The text, 1-2000 characters, not blank.';
comment on column nestly.support_messages.created_at is 'Database clock.';
comment on index nestly.support_messages_request_created_idx is 'A thread in order; the FK cascade.';

comment on table nestly.reported_message_views is 'A staff view of a reported chat message (§9.6): one row per opening, written by the REPORTS_VIEW holder on the admin screens and audited in the same transaction (reported_message_viewed). Only inside that transaction does messages_select_staff show that message. No UPDATE or DELETE.';
comment on column nestly.reported_message_views.id is 'Row id.';
comment on column nestly.reported_message_views.report_id is 'The message report opened.';
comment on column nestly.reported_message_views.viewer_id is 'The staff member (database default auth.uid()).';
comment on column nestly.reported_message_views.view_xact is 'The viewing transaction (database default; no client writes it): the message is readable only inside it.';
comment on column nestly.reported_message_views.created_at is 'Database clock.';
comment on index nestly.reported_message_views_report_id_idx is 'The reports FK cascade; the read check.';
comment on index nestly.reported_message_views_viewer_id_idx is 'The users FK restrict check.';

comment on column nestly.reports.target_kind is 'post, comment, user or message; survives the target''s SET NULL.';
comment on column nestly.reports.message_id is 'The reported chat message (§9.6); as post_id. Its text is never copied into the report: staff open it through reported_message_views (audited).';
comment on index nestly.reports_message_id_idx is 'The SET NULL lookup when a message is deleted; the staff read of a reported message.';

comment on function nestly.chat_requests_transition() is 'Trigger before update of chat_requests: from pending only, once: the target accepts or declines, the requester cancels (responded_at = now()). SECURITY INVOKER.';
comment on function nestly.chat_requests_insert_limit() is 'Trigger before insert of chat_requests: at most 20 new requests per account in 24 hours (NS022), counted over the requester''s own rows under a per-requester advisory lock. A decline does not bar a new request (§9.3). SECURITY INVOKER.';
comment on function nestly.chat_blocks_lift_guard() is 'Trigger before update of chat_blocks: only a lift, once, to the database clock. SECURITY INVOKER.';
comment on function nestly.chat_blocks_insert_limit() is 'Trigger before insert of chat_blocks: at most 20 per account in 24 hours, lifted ones included (NS025), under a per-blocker advisory lock. SECURITY INVOKER.';
comment on function nestly.chat_reads_stamp() is 'Trigger before insert or update of chat_reads: the marker is now(); the thread never changes. SECURITY INVOKER.';
comment on function nestly.support_requests_transition() is 'Trigger before update of support_requests: only the status moves and a closed request is not reopened (42501); updated_at and closed_at follow it. SECURITY INVOKER.';
comment on function nestly.support_requests_insert_limit() is 'Trigger before insert of support_requests: at most 5 new requests per account in 24 hours (NS023), under a per-user advisory lock. SECURITY INVOKER.';
comment on function nestly.support_messages_author() is 'Trigger before insert of support_messages: author_kind is support for a staff caller, user otherwise. SECURITY INVOKER.';
comment on trigger support_requests_audit on nestly.support_requests is 'audit_trigger(): a status change is an Audit Log entry (support_status_changed) in the same transaction (rule 18).';
comment on trigger support_messages_audit on nestly.support_messages is 'audit_trigger(): a Support reply or internal note is an Audit Log entry (support_replied, support_note_added) in the same transaction.';
comment on trigger reported_message_views_audit on nestly.reported_message_views is 'audit_trigger(): a staff view of a reported message is an Audit Log entry (reported_message_viewed) in the same transaction.';

comment on policy chat_requests_select_requester on nestly.chat_requests is 'The requester reads its own requests, whatever their state (the daily limit counts them); the status copies are not granted.';
comment on policy chat_requests_select_target on nestly.chat_requests is 'The target reads a request while the requester is active and no user block stands between them; inside user_blocks_end_relations, the blocked requester''s rows (to decline them).';
comment on policy chat_requests_insert_requester on nestly.chat_requests is 'I8: a Regular asks a Regular who is not a Friend, with no conversation between them, across no user block and no Chat Block (VAL-025). A later initiative adds its own policy for a Professional.';
comment on policy chat_requests_update_target on nestly.chat_requests is 'The target declines a pending request, or accepts it while the requester is active and neither a user block nor a Chat Block stands between them.';
comment on policy chat_requests_update_requester on nestly.chat_requests is 'The requester cancels its own pending request.';
comment on policy conversations_select_party on nestly.conversations is 'A party, while the other party is active and no user block stands between them.';
comment on policy conversations_insert_party on nestly.conversations is 'A party opens it while Friends, or from the pair''s accepted request (FR-CHAT-002).';
comment on policy messages_select_party on nestly.messages is 'The parties of the conversation (through its own policy).';
comment on policy messages_select_staff on nestly.messages is 'REPORTS_VIEW on the admin screens reads a reported message, only inside the transaction that recorded (and audited) its view of a report on it (§9.6).';
comment on policy messages_insert_party on nestly.messages is 'A party sends in its own name while no Chat Block stands between the two, either direction (ERR-008, §9.4).';
comment on policy chat_blocks_select_party on nestly.chat_blocks is 'Both parties see a standing block; the blocker also its lifted ones.';
comment on policy chat_blocks_insert_blocker on nestly.chat_blocks is 'A Regular or Professional blocks messaging with another account, in its own name.';
comment on policy chat_blocks_update_blocker on nestly.chat_blocks is 'The blocker lifts its own standing block.';
comment on policy chat_reads_select_own on nestly.chat_reads is 'Owner only (no read receipts).';
comment on policy chat_reads_insert_own on nestly.chat_reads is 'Owner only, for a conversation it is a party of or its own Support request.';
comment on policy chat_reads_update_own on nestly.chat_reads is 'Owner only.';
comment on policy support_requests_select_own on nestly.support_requests is 'The user reads its own requests.';
comment on policy support_requests_select_staff on nestly.support_requests is 'SUPPORT_VIEW (the Admin always) reads every request, on the admin screens (nestly.staff_view).';
comment on policy support_requests_insert_own on nestly.support_requests is 'A Regular or Professional sends a request in its own name (FR-ADMIN-001). Staff send none.';
comment on policy support_requests_update_staff on nestly.support_requests is 'SUPPORT_HANDLE changes the status on the admin screens (audited).';
comment on policy support_messages_select_own on nestly.support_messages is 'The user reads its own thread, never the internal notes.';
comment on policy support_messages_select_staff on nestly.support_messages is 'SUPPORT_VIEW reads every thread, internal notes included, on the admin screens (nestly.staff_view).';
comment on policy support_messages_insert_own on nestly.support_messages is 'The user replies in its own thread while the request is not closed.';
comment on policy support_messages_insert_staff on nestly.support_messages is 'SUPPORT_HANDLE replies as Support (not into a closed request) or adds an internal note (audited).';
comment on policy reported_message_views_select_own on nestly.reported_message_views is 'A staff member reads its own view rows (the read check of messages_select_staff).';
comment on policy reported_message_views_insert_staff on nestly.reported_message_views is 'REPORTS_VIEW on the admin screens records its view of a message report (audited).';
comment on policy reports_update_staff on nestly.reports is 'REPORTS_VIEW closes an open report as handled; a post or comment report needs CONTENT_MODERATE, a user or message report a user key (USER_WARN, USER_SUSPEND or USER_BAN).';
comment on policy regular_names_select_conversation on nestly.regular_names is 'The other party of one''s conversation.';
comment on policy regular_names_select_request_sent on nestly.regular_names is 'The target of one''s own pending chat request (after an accept, the conversation policy; a cancelled or declined request shows no name).';
comment on policy regular_names_select_request_received on nestly.regular_names is 'The requester of a pending chat request to one.';
comment on policy regular_names_select_support on nestly.regular_names is 'On the Support inbox (nestly.staff_view): SUPPORT_VIEW reads the names of the requests'' authors.';
