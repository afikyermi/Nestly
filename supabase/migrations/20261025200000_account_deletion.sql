-- =====================================================================================================================
-- I9 part 1 — account deletion: the request and its 30-day regret window, the cancel, the execution at day 30, the separate
-- deletion record and the 90-day retention of the security records — migration only.
--
-- SRS: FR-SET-002, BR-073, BR-077, BR-080, AC-108, ERR-026, §13 User, §13.4; decisions-in-force.md §14 (I9 order), §16.4 (the separate
--      deletion record: kind request/cancel/execute, account id and type, time, due date; no email, name, reason or content; Admin only,
--      USER_DATA_EXPORT_DELETE; kept 90 days after the execution, a cancel on a live account 12 months).
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261025200000_account_deletion.down.sql (refuses once a deletion was requested or executed).
--
-- No new SECURITY DEFINER function: every write below is the caller's own (an account schedules or cancels its own deletion through its
-- own users row, the record row is written by an INVOKER trigger under a policy that only a trigger can satisfy), or the daily job's
-- under named TO app_jobs policies (platform rule 6), as the existing purge_* functions do.
--
-- 1. users.status gains 'deletion_scheduled', with users.deletion_due_at (= the request + 30 days; NULL in every other status). Every
--    "(id, status) ON UPDATE CASCADE" FK copies the new value into the mirrored *_status columns (posts, comments, likes, friendships,
--    conversations, groups, professionals, marketplace, media, stories ...); none of them carries a CHECK of its own (checked on main,
--    25.10), and every reader's policy already shows only 'active' — so the account and its content disappear for everyone at once, as for
--    a suspended account (FR-SET-002 "hidden from everyone"). is_active_account() is false for it: it can do nothing but read its own
--    users row and cancel. users_status_guard() lets an account move itself
--      active -> deletion_scheduled   a Regular or Professional account with a valid session (is_active_account()), never a Group Owner
--                                     (ERR-026, NS030: transfer the ownership first, BR-041); deletion_due_at := now() + 30 days, whatever
--                                     the statement sent
--      deletion_scheduled -> active   while the due date has not passed (the cancel at PG-050); deletion_due_at := NULL
--    and nothing else; staff can neither schedule nor cancel a deletion, nor suspend or ban a scheduled account (the existing "not allowed").
-- 2. account_deletion_events (§16.4): written in the same transaction as the status change by account_deletion_record() (INVOKER, AFTER
--    UPDATE OF status) — kinds request and cancel — and by the job — kind execute. No FK to users: it outlives the account. Read by the
--    Admin (USER_DATA_EXPORT_DELETE); an account reads only its own execute row (so a deleted account cannot register again on the same Auth
--    identity while the Auth user still exists: users_insert_own refuses it). Nobody writes it directly: the authenticated INSERT policy
--    holds only inside a trigger (pg_trigger_depth() > 0) and only for the status the caller's own users row has just taken.
-- 3. The records BR-073 keeps 90 days after the deletion are detached from users (the FK is dropped, the uuid stays): reports.reporter_id,
--    security_events.user_id, recovery_events.user_id, enforcement_records.user_id, user_enforcements.user_id (was CASCADE). The staff-only
--    RESTRICT FKs (audit actor, handlers, viewers, inviters) stay: staff accounts have no self-deletion (a Moderator is removed by the Admin,
--    FR-ADMIN-004, later). legal_consents is not on BR-073's keep list: CASCADE (deleted with the account).
-- 4. Chats stay whole for the other side (BR-073's exception): messages.sender_id and conversations.user_a/user_b become nullable and
--    their FKs SET NULL; the request/outreach links of a conversation SET NULL too, and the conversation keeps its context once one side is
--    gone. The other side reads a conversation whose partner was deleted (the partner NULL); nobody can send into it.
-- 5. A comment of the account on someone else's post that has replies stays as a "deleted user" row (BR-073): the job empties its text and
--    author and sets comments.is_author_deleted; every other comment of the account goes with it.
-- 6. execute_account_deletions() — INVOKER, EXECUTE app_jobs only, run by the daily job: for each account whose due date has passed, unless
--    an open report still targets its posts, comments, listings, articles, the reviews it wrote or that are about it, or a message of a
--    conversation that goes with it (BR-080: reported content is kept until the report is handled; the account waits for the next run), it
--    writes the execute row, expires the open reports on the account itself (the reported account is gone), deletes the conversations
--    whose other side is already gone and detaches the rest, keeps its comments that others replied to as above, and deletes the users row
--    (a run that finds it already gone undoes its execute row): everything else goes by the existing CASCADEs
--    (profile, children, journeys, Trackers, posts, anonymous posts, likes, friendships, follows, blocks, groups memberships, listings,
--    articles, reviews by and of a Professional, promotions, support requests, notifications). Payments stay without identity
--    (promotion_payments.payer_id SET NULL). Images: media_assets.owner_id is SET NULL and the post / listing / profile links go with their
--    rows, so the media job removes the files within 24 hours (BR-077); a suspected image stays held its full 90 days. Returns three
--    numbers: executed, waiting, failed (one subtransaction per account; a failure rolls back that account only).
-- 7. purge_deleted_accounts() — INVOKER, EXECUTE app_jobs only: 90 days after an execute row, its account's kept records (security events,
--    recovery events, reports it made, enforcement records and history, the Audit entries about the account) and its deletion rows; a
--    request/cancel pair 12 months after the cancel. audit_log_append_only() lets exactly that DELETE through, for app_jobs only.
-- =====================================================================================================================

-- 1. users: the scheduled status and its due date ----------------------------------------------------------------------------------
alter table nestly.users drop constraint users_status_check;
alter table nestly.users
  add constraint users_status_check check (status in ('active', 'suspended', 'banned', 'deletion_scheduled'));
alter table nestly.users add column deletion_due_at timestamptz;
alter table nestly.users
  add constraint users_deletion_due_at_check check ((deletion_due_at is not null) = (status = 'deletion_scheduled'));

create or replace function nestly.users_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if (new.id, new.account_type, new.created_at) is distinct from (old.id, old.account_type, old.created_at) then
    raise exception 'users: immutable column' using errcode = '42501';
  end if;
  if current_user = 'authenticated' and me = old.id and new.status = old.status then
    -- an account's own update always moves its status (the policies that open its row exist for exactly those moves)
    raise exception 'users: an account cannot change its own row' using errcode = '42501';
  end if;
  if new.status = old.status and new.suspended_until is not distinct from old.suspended_until
     and new.deletion_due_at is not distinct from old.deletion_due_at then
    return new;
  end if;
  if current_user = 'authenticated' and new.status = old.status and new.deletion_due_at is distinct from old.deletion_due_at then
    raise exception 'users: the deletion date follows the status only' using errcode = '42501';
  end if;
  if new.status <> 'suspended' then
    new.suspended_until := null;
  end if;
  if new.status <> 'deletion_scheduled' then
    new.deletion_due_at := null;
  end if;
  if current_user = 'authenticated' then
    if me = old.id then
      if old.status = 'suspended' and old.suspended_until is not null and old.suspended_until <= pg_catalog.now()
         and new.status = 'active' then
        -- an account ends its own suspension once the end time has passed
        null;
      elsif old.status = 'active' and new.status = 'deletion_scheduled' then
        -- FR-SET-002: a Regular or Professional account schedules its own deletion, 30 days ahead (BR-073)
        if old.account_type not in ('regular', 'professional') or not (select nestly.is_active_account()) then
          raise exception 'users: this account cannot schedule its deletion' using errcode = '42501';
        end if;
        if exists (select 1 from nestly.group_members m join nestly.groups g on g.id = m.group_id
                    where m.user_id = me and m.role = 'owner' and g.status = 'active') then
          raise exception 'users: a Group Owner transfers the ownership before deleting the account (ERR-026)' using errcode = 'NS030';
        end if;
        new.deletion_due_at := pg_catalog.now() + interval '30 days';
      elsif old.status = 'deletion_scheduled' and new.status = 'active' then
        -- the cancel at PG-050, only inside the 30 days
        if old.deletion_due_at <= pg_catalog.now() then
          raise exception 'users: the deletion date has passed' using errcode = '42501';
        end if;
      else
        raise exception 'users: an account cannot change its own status' using errcode = '42501';
      end if;
    else
      if old.account_type = 'admin' or (old.account_type = 'moderator' and (select nestly.caller_staff_role()) is distinct from 'admin') then
        raise exception 'users: this account cannot be acted on' using errcode = '42501';
      end if;
      -- never without the record: the same transaction holds this Actor's enforcement row for this account and this kind of change
      if not exists (
        select 1 from nestly.user_enforcements e
         where e.user_id = new.id and e.actor_id = me and e.created_at = pg_catalog.now()
           and e.kind = any (case new.status when 'suspended' then array['suspension'] when 'banned' then array['ban']
                                 else array['reinstate', 'unban'] end)
           and (new.status <> 'suspended' or e.suspended_until is not distinct from new.suspended_until)) then
        raise exception 'users: a status change needs its enforcement record' using errcode = '42501';
      end if;
      if new.status = 'suspended' and old.status in ('active', 'suspended') then
        if not (select nestly.has_permission('USER_SUSPEND')) or new.suspended_until is null or new.suspended_until <= pg_catalog.now() then
          raise exception 'users: suspension refused' using errcode = '42501';
        end if;
      elsif new.status = 'active' and old.status = 'suspended' then
        if not (select nestly.has_permission('USER_SUSPEND')) then
          raise exception 'users: reinstatement refused' using errcode = '42501';
        end if;
      elsif (new.status = 'banned' and old.status in ('active', 'suspended')) or (new.status = 'active' and old.status = 'banned') then
        if not (select nestly.has_permission('USER_BAN')) then
          raise exception 'users: ban or unban refused' using errcode = '42501';
        end if;
      else
        raise exception 'users: this status change is not allowed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end
$$;

create policy users_update_own_deletion_request on nestly.users
  for update to authenticated
  using (id = (select auth.uid()) and status = 'active' and account_type in ('regular', 'professional'))
  with check (id = (select auth.uid()) and status = 'deletion_scheduled');

create policy users_update_own_deletion_cancel on nestly.users
  for update to authenticated
  using (id = (select auth.uid()) and status = 'deletion_scheduled' and deletion_due_at > now())
  with check (id = (select auth.uid()) and status = 'active');

-- 2. account_deletion_events (§16.4) ------------------------------------------------------------------------------------------------
create table nestly.account_deletion_events (
  id           uuid        not null default gen_random_uuid(),
  account_id   uuid        not null default auth.uid(),
  account_type text        not null,
  kind         text        not null,
  due_at       timestamptz not null,
  created_at   timestamptz not null default now(),
  constraint account_deletion_events_pkey primary key (id),
  constraint account_deletion_events_account_type_check check (account_type in ('regular', 'professional')),
  constraint account_deletion_events_kind_check check (kind in ('request', 'cancel', 'execute'))
);

create index account_deletion_events_account_id_idx on nestly.account_deletion_events (account_id, created_at);
create index account_deletion_events_created_at_idx on nestly.account_deletion_events (created_at desc);

alter table nestly.account_deletion_events enable row level security;
alter table nestly.account_deletion_events force  row level security;

create policy account_deletion_events_select_admin on nestly.account_deletion_events
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.caller_staff_role()) = 'admin'
    and (select nestly.has_permission('USER_DATA_EXPORT_DELETE')));

create policy account_deletion_events_select_own_execute on nestly.account_deletion_events
  for select to authenticated
  using (account_id = (select auth.uid()) and kind = 'execute');

create policy account_deletion_events_insert_own on nestly.account_deletion_events
  for insert to authenticated
  with check (account_id = (select auth.uid()) and pg_catalog.pg_trigger_depth() > 0
    and exists (select 1 from nestly.users u
                 where u.id = account_deletion_events.account_id and u.account_type = account_deletion_events.account_type
                   and ((account_deletion_events.kind = 'request' and u.status = 'deletion_scheduled'
                         and u.deletion_due_at = account_deletion_events.due_at)
                     or (account_deletion_events.kind = 'cancel' and u.status = 'active'))));

create policy account_deletion_events_select_jobs on nestly.account_deletion_events
  for select to app_jobs
  using (true);

create policy account_deletion_events_insert_jobs on nestly.account_deletion_events
  for insert to app_jobs
  with check (kind = 'execute'
    and exists (select 1 from nestly.users u
                 where u.id = account_deletion_events.account_id and u.account_type = account_deletion_events.account_type
                   and u.status = 'deletion_scheduled' and u.deletion_due_at = account_deletion_events.due_at
                   and u.deletion_due_at <= now()));

create policy account_deletion_events_delete_jobs on nestly.account_deletion_events
  for delete to app_jobs
  using (account_id in (select e.account_id from nestly.account_deletion_events e
                         where e.kind = 'execute' and e.created_at <= now() - interval '90 days')
    or (kind in ('request', 'cancel') and created_at <= now() - interval '12 months'
        and not exists (select 1 from nestly.users u where u.id = account_deletion_events.account_id and u.status = 'deletion_scheduled')));

grant select on table nestly.account_deletion_events to authenticated;
grant insert (account_type, kind, due_at) on table nestly.account_deletion_events to authenticated;
grant select, delete on table nestly.account_deletion_events to app_jobs;
grant insert (account_id, account_type, kind, due_at) on table nestly.account_deletion_events to app_jobs;

create function nestly.account_deletion_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'deletion_scheduled' and old.status <> 'deletion_scheduled' then
    insert into nestly.account_deletion_events (account_type, kind, due_at) values (new.account_type, 'request', new.deletion_due_at);
  elsif old.status = 'deletion_scheduled' and new.status <> 'deletion_scheduled' then
    insert into nestly.account_deletion_events (account_type, kind, due_at) values (new.account_type, 'cancel', old.deletion_due_at);
  end if;
  return null;
end
$$;

revoke execute on function nestly.account_deletion_record() from public;

create trigger users_deletion_record
  after update of status on nestly.users
  for each row
  when (old.status is distinct from new.status and 'deletion_scheduled' in (old.status, new.status))
  execute function nestly.account_deletion_record();

-- A deleted account cannot come back on the same Auth identity (the Auth user is removed later, WORKPLAN item 15).
alter policy users_insert_own on nestly.users
  with check (id = (select auth.uid()) and account_type in ('regular', 'professional') and status = 'active'
    and not exists (select 1 from nestly.account_deletion_events e where e.account_id = (select auth.uid()) and e.kind = 'execute'));

-- staff may still warn a scheduled account (the warning outlives a cancel); suspension and ban stay refused by users_status_guard()
alter table nestly.user_enforcements drop constraint user_enforcements_status_before_check;
alter table nestly.user_enforcements
  add constraint user_enforcements_status_before_check check (status_before in ('active', 'suspended', 'banned', 'deletion_scheduled'));

-- 3. the records BR-073 keeps 90 days: detached from users ---------------------------------------------------------------------------
alter table nestly.reports drop constraint reports_reporter_id_fkey;
alter table nestly.security_events drop constraint security_events_user_id_fkey;
alter table nestly.recovery_events drop constraint recovery_events_user_id_fkey;
alter table nestly.enforcement_records drop constraint enforcement_records_user_id_fkey;
alter table nestly.user_enforcements drop constraint user_enforcements_user_id_fkey;
alter table nestly.legal_consents drop constraint legal_consents_user_id_fkey;
alter table nestly.legal_consents
  add constraint legal_consents_user_id_fkey foreign key (user_id) references nestly.users (id) on delete cascade;

-- 4. chats stay whole for the other side ---------------------------------------------------------------------------------------------
alter table nestly.messages alter column sender_id drop not null;
alter table nestly.messages drop constraint messages_sender_id_fkey;
alter table nestly.messages
  add constraint messages_sender_id_fkey foreign key (sender_id) references nestly.users (id) on delete set null;

alter table nestly.conversations alter column user_a drop not null;
alter table nestly.conversations alter column user_b drop not null;
alter table nestly.conversations drop constraint conversations_a_status_fkey;
alter table nestly.conversations drop constraint conversations_b_status_fkey;
alter table nestly.conversations
  add constraint conversations_a_status_fkey foreign key (user_a, a_status) references nestly.users (id, status)
    on update cascade on delete set null (user_a),
  add constraint conversations_b_status_fkey foreign key (user_b, b_status) references nestly.users (id, status)
    on update cascade on delete set null (user_b),
  add constraint conversations_one_side_check check (user_a is not null or user_b is not null);
alter table nestly.conversations drop constraint conversations_chat_request_id_fkey;
alter table nestly.conversations
  add constraint conversations_chat_request_id_fkey foreign key (chat_request_id) references nestly.chat_requests (id) on delete set null;
alter table nestly.conversations drop constraint conversations_chat_request_id_check;
alter table nestly.conversations
  add constraint conversations_chat_request_id_check check (
    (context = 'request') = (chat_request_id is not null) or (user_a is null or user_b is null) and chat_request_id is null);
alter table nestly.conversations drop constraint conversations_outreach_request_id_fkey;
alter table nestly.conversations
  add constraint conversations_outreach_request_id_fkey foreign key (outreach_request_id) references nestly.outreach_requests (id)
    on delete set null;
alter table nestly.conversations drop constraint conversations_outreach_request_id_check;
alter table nestly.conversations
  add constraint conversations_outreach_request_id_check check (
    (context = 'outreach') = (outreach_request_id is not null) or (user_a is null or user_b is null) and outreach_request_id is null);

alter policy conversations_select_party on nestly.conversations
  using ((select nestly.is_active_account()) and (
    (user_a = (select auth.uid()) and (b_status = 'active' or user_b is null)
      and (user_b is null or user_b <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))))
    or (user_b = (select auth.uid()) and (a_status = 'active' or user_a is null)
      and (user_a is null or user_a <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))))));

alter policy messages_insert_party on nestly.messages
  with check ((select nestly.is_active_account()) and sender_id = (select auth.uid()) and exists (
    select 1 from nestly.conversations c
     where c.id = messages.conversation_id and c.user_a is not null and c.user_b is not null
       and not exists (select 1 from nestly.chat_blocks b
                        where b.lifted_at is null
                          and ((b.blocker_id = c.user_a and b.blocked_id = c.user_b) or (b.blocker_id = c.user_b and b.blocked_id = c.user_a)))));

-- 5. the "deleted user" comment row ------------------------------------------------------------------------------------------------
alter table nestly.comments add column is_author_deleted boolean not null default false;
alter table nestly.comments drop constraint comments_author_id_check;
alter table nestly.comments
  add constraint comments_author_id_check check (author_id is not null or is_by_post_author or is_author_deleted);
alter table nestly.comments drop constraint comments_body_check;
alter table nestly.comments
  add constraint comments_body_check check (body ~ '[^[:space:]]' or (is_author_deleted and body = ''));
alter table nestly.comments
  add constraint comments_author_deleted_check check (not is_author_deleted or (author_id is null and body = ''));
grant select (is_author_deleted) on table nestly.comments to authenticated;
grant select (is_author_deleted) on table nestly.comments to app_jobs;

-- 6. the daily job's reach (platform rule 6; data-model "Approved exceptions") --------------------------------------------------------
create policy users_select_jobs on nestly.users
  for select to app_jobs
  using (status = 'deletion_scheduled');
create policy users_delete_jobs on nestly.users
  for delete to app_jobs
  using (status = 'deletion_scheduled' and deletion_due_at <= now());
grant select (id, account_type, status, deletion_due_at), delete on table nestly.users to app_jobs;

-- the account's posts and comments, to see whether an open report still holds them (BR-080), and the replies under its comments
create policy posts_select_deletion_jobs on nestly.posts
  for select to app_jobs
  using (author_status = 'deletion_scheduled');
create policy comments_select_deletion_jobs on nestly.comments
  for select to app_jobs
  using (author_status = 'deletion_scheduled' or parent_id is not null);
create policy comments_update_deletion_jobs on nestly.comments
  for update to app_jobs
  using (author_status = 'deletion_scheduled' and author_id is not null and status in ('active', 'hidden', 'removed'))
  with check (author_id is null and is_author_deleted and body = '');
grant update (author_id, body, is_author_deleted) on table nestly.comments to app_jobs;

-- the open reports on the account itself expire with it
create policy reports_update_deletion_jobs on nestly.reports
  for update to app_jobs
  using (status = 'open' and target_kind = 'user'
    and exists (select 1 from nestly.users u where u.id = reports.reported_user_id and u.deletion_due_at <= now()))
  with check (status = 'expired');

-- its conversations are detached before the users row goes
create policy conversations_select_jobs on nestly.conversations
  for select to app_jobs
  using (a_status = 'deletion_scheduled' or b_status = 'deletion_scheduled');
create policy conversations_update_jobs on nestly.conversations
  for update to app_jobs
  using (a_status = 'deletion_scheduled' or b_status = 'deletion_scheduled')
  with check (user_a is null or user_b is null);
-- a conversation whose other side was deleted before goes with the second deletion (BR-073: nobody is left to keep it for)
create policy conversations_delete_jobs on nestly.conversations
  for delete to app_jobs
  using ((a_status = 'deletion_scheduled' or b_status = 'deletion_scheduled') and (user_a is null or user_b is null));
grant select (id, user_a, user_b, a_status, b_status), update (user_a, user_b), delete on table nestly.conversations to app_jobs;

-- BR-080 beyond posts and comments: the account's listings, articles, reviews it wrote or that are about it, and the messages of a
-- conversation that goes with it, so an open report on any of them holds the deletion
create policy marketplace_listings_select_deletion_jobs on nestly.marketplace_listings
  for select to app_jobs
  using (owner_status = 'deletion_scheduled');
create policy professional_articles_select_deletion_jobs on nestly.professional_articles
  for select to app_jobs
  using (author_status = 'deletion_scheduled');
create policy professional_reviews_select_deletion_jobs on nestly.professional_reviews
  for select to app_jobs
  using (reviewer_status = 'deletion_scheduled'
    or professional_id in (select u.id from nestly.users u where u.status = 'deletion_scheduled'));
create policy messages_select_deletion_jobs on nestly.messages
  for select to app_jobs
  using (conversation_id in (select c.id from nestly.conversations c where c.user_a is null or c.user_b is null));
grant select (id, owner_id, owner_status) on table nestly.marketplace_listings to app_jobs;
grant select (id, author_id, author_status) on table nestly.professional_articles to app_jobs;
grant select (id, reviewer_id, reviewer_status, professional_id) on table nestly.professional_reviews to app_jobs;
grant select (id, conversation_id) on table nestly.messages to app_jobs;

-- 90 days after the execution: the kept records
create policy security_events_select_jobs on nestly.security_events
  for select to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy security_events_delete_jobs on nestly.security_events
  for delete to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy recovery_events_select_jobs on nestly.recovery_events
  for select to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy recovery_events_delete_jobs on nestly.recovery_events
  for delete to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy reports_delete_deletion_jobs on nestly.reports
  for delete to app_jobs
  using (reporter_id in (select e.account_id from nestly.account_deletion_events e
                          where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy enforcement_records_select_jobs on nestly.enforcement_records
  for select to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy enforcement_records_delete_jobs on nestly.enforcement_records
  for delete to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy user_enforcements_select_jobs on nestly.user_enforcements
  for select to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy user_enforcements_delete_jobs on nestly.user_enforcements
  for delete to app_jobs
  using (user_id in (select e.account_id from nestly.account_deletion_events e
                      where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy audit_log_select_jobs on nestly.audit_log
  for select to app_jobs
  using (target_kind = 'user' and target_id in (select e.account_id from nestly.account_deletion_events e
                                                 where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy audit_log_delete_jobs on nestly.audit_log
  for delete to app_jobs
  using (target_kind = 'user' and target_id in (select e.account_id from nestly.account_deletion_events e
                                                 where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
create policy reports_select_deletion_jobs on nestly.reports
  for select to app_jobs
  using (reporter_id in (select e.account_id from nestly.account_deletion_events e
                          where e.kind = 'execute' and e.created_at <= now() - interval '90 days'));
grant select (id, user_id), delete on table nestly.security_events to app_jobs;
grant select (id, user_id), delete on table nestly.recovery_events to app_jobs;
grant delete on table nestly.reports to app_jobs;
grant select (id, user_id), delete on table nestly.enforcement_records to app_jobs;
grant select (id, user_id), delete on table nestly.user_enforcements to app_jobs;
grant select (id, target_kind, target_id), delete on table nestly.audit_log to app_jobs;

-- Audit stays append-only for everyone; the one DELETE allowed is the retention job's, on an entry about an account deleted 90 days ago.
create or replace function nestly.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_user = 'app_jobs' and old.target_kind = 'user'
     and exists (select 1 from nestly.account_deletion_events e
                  where e.account_id = old.target_id and e.kind = 'execute' and e.created_at <= pg_catalog.now() - interval '90 days') then
    return old;
  end if;
  raise exception 'audit_log: append-only' using errcode = '42501';
end
$$;

-- 7. execute_account_deletions() -------------------------------------------------------------------------------------------------
create function nestly.execute_account_deletions(out executed integer, out waiting integer, out failed integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  k integer;
  v_state text;
  v_constraint text;
begin
  executed := 0;
  waiting := 0;
  failed := 0;
  for r in
    select u.id, u.account_type, u.deletion_due_at from nestly.users u
     where u.status = 'deletion_scheduled' and u.deletion_due_at <= pg_catalog.now()
     order by u.deletion_due_at, u.id
  loop
    -- BR-080: a post or comment of the account (or a comment under its post) with an open report is kept until the report is handled.
    -- The real author of an anonymous post stays unreadable (rule 20): any anonymous post of a scheduled account under an open report
    -- holds every scheduled account (it only delays, never deletes early).
    if exists (select 1 from nestly.reports rp
                where rp.status = 'open'
                  and (rp.post_id in (select p.id from nestly.posts p where p.author_status = 'deletion_scheduled'
                                        and (p.author_id = r.id or p.is_anonymous))
                    or rp.comment_id in (select c.id from nestly.comments c where c.author_id = r.id)
                    or rp.comment_id in (select c.id from nestly.comments c join nestly.posts p on p.id = c.post_id
                                          where p.author_status = 'deletion_scheduled'
                                            and (p.author_id = r.id or p.is_anonymous))
                    or rp.listing_id in (select l.id from nestly.marketplace_listings l where l.owner_id = r.id)
                    or rp.article_id in (select a.id from nestly.professional_articles a where a.author_id = r.id)
                    or rp.review_id in (select v.id from nestly.professional_reviews v where v.reviewer_id = r.id or v.professional_id = r.id)
                    or rp.message_id in (select m.id from nestly.messages m join nestly.conversations c on c.id = m.conversation_id
                                          where (c.user_a = r.id and c.user_b is null) or (c.user_b = r.id and c.user_a is null)))) then
      waiting := waiting + 1;
      continue;
    end if;
    begin
      insert into nestly.account_deletion_events (account_id, account_type, kind, due_at)
      values (r.id, r.account_type, 'execute', r.deletion_due_at);
      update nestly.reports set status = 'expired', closed_at = pg_catalog.now()
       where status = 'open' and target_kind = 'user' and reported_user_id = r.id;
      delete from nestly.conversations where (user_a = r.id and user_b is null) or (user_b = r.id and user_a is null);
      update nestly.conversations set user_a = null where user_a = r.id;
      update nestly.conversations set user_b = null where user_b = r.id;
      -- kept only when someone else replied (the account's own replies go with it)
      update nestly.comments c set author_id = null, body = '', is_author_deleted = true
       where c.author_id = r.id and c.status in ('active', 'hidden', 'removed')
         and exists (select 1 from nestly.comments x where x.parent_id = c.id and x.author_id is distinct from r.id);
      delete from nestly.users where id = r.id and status = 'deletion_scheduled';
      get diagnostics k = row_count;
      if k = 0 then
        -- another run deleted it first: undo this run's execute row
        raise exception 'account deletion: already gone' using errcode = 'P0002';
      end if;
      executed := executed + 1;
    exception
      when no_data_found then
        null;
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name;
        raise warning 'account deletion failed for one account (SQLSTATE %, constraint %)', v_state, coalesce(nullif(v_constraint, ''), '-');
        failed := failed + 1;
    end;
  end loop;
end
$$;

revoke execute on function nestly.execute_account_deletions() from public;
grant execute on function nestly.execute_account_deletions() to app_jobs;

-- 8. purge_deleted_accounts() --------------------------------------------------------------------------------------------------
create function nestly.purge_deleted_accounts()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_gone uuid[];
  n integer := 0;
  k integer;
begin
  select coalesce(array_agg(e.account_id), '{}') into v_gone from nestly.account_deletion_events e
   where e.kind = 'execute' and e.created_at <= pg_catalog.now() - interval '90 days';
  delete from nestly.security_events where user_id = any (v_gone);
  get diagnostics k = row_count; n := n + k;
  delete from nestly.recovery_events where user_id = any (v_gone);
  get diagnostics k = row_count; n := n + k;
  delete from nestly.reports where reporter_id = any (v_gone);
  get diagnostics k = row_count; n := n + k;
  delete from nestly.enforcement_records where user_id = any (v_gone);
  get diagnostics k = row_count; n := n + k;
  delete from nestly.user_enforcements where user_id = any (v_gone);
  get diagnostics k = row_count; n := n + k;
  delete from nestly.audit_log where target_kind = 'user' and target_id = any (v_gone);
  get diagnostics k = row_count; n := n + k;
  delete from nestly.account_deletion_events
   where account_id = any (v_gone)
      or (kind in ('request', 'cancel') and created_at <= pg_catalog.now() - interval '12 months'
          and not exists (select 1 from nestly.users u where u.id = account_deletion_events.account_id and u.status = 'deletion_scheduled'));
  get diagnostics k = row_count; n := n + k;
  return n;
end
$$;

revoke execute on function nestly.purge_deleted_accounts() from public;
grant execute on function nestly.purge_deleted_accounts() to app_jobs;

-- 9. comments ----------------------------------------------------------------------------------------------------------------------
comment on column nestly.users.status is 'active | suspended | banned | deletion_scheduled (FR-SET-002, BR-073: the 30-day regret window; hidden from everyone, as suspended).';
comment on column nestly.users.deletion_due_at is 'When the scheduled deletion runs: the request + 30 days (BR-073); NULL in every other status. Set by users_status_guard(), never by the client.';
comment on constraint users_deletion_due_at_check on nestly.users is 'A due date exactly while the deletion is scheduled.';
comment on function nestly.users_status_guard() is 'SECURITY INVOKER. Before a status change on users: staff by Permission Key and target type, always with an enforcement row (BR-074); an account itself only ends an expired suspension, schedules its own deletion (Regular / Professional, a valid session, not a Group Owner: ERR-026, NS030; due = now() + 30 days) or cancels it before the due date (FR-SET-002). Staff never schedule, cancel or act on a scheduled account.';
comment on policy users_update_own_deletion_request on nestly.users is 'FR-SET-002: an active Regular or Professional account schedules its own deletion (users_status_guard sets the date).';
comment on policy users_update_own_deletion_cancel on nestly.users is 'FR-SET-002, PG-050: the account cancels its scheduled deletion while the due date has not passed.';
comment on table nestly.account_deletion_events is 'The deletion record (decisions-in-force §16.4, not the Audit Log): one row per request, cancel and execution of an account deletion. Account id and type, time, due date only: no email, name, reason or content. No FK: it outlives the account. Admin only (USER_DATA_EXPORT_DELETE). Kept 90 days after the execution; a request/cancel pair of a live account 12 months (purge_deleted_accounts()).';
comment on column nestly.account_deletion_events.id is 'Generated (gen_random_uuid()).';
comment on column nestly.account_deletion_events.account_id is 'The account (the Auth user id). A plain uuid: the account may no longer exist.';
comment on column nestly.account_deletion_events.account_type is 'regular | professional (staff accounts have no self-deletion).';
comment on column nestly.account_deletion_events.kind is 'request | cancel | execute.';
comment on column nestly.account_deletion_events.due_at is 'The scheduled deletion time this event belongs to (for a cancel: the one it cancelled).';
comment on column nestly.account_deletion_events.created_at is 'When it happened.';
comment on policy account_deletion_events_select_admin on nestly.account_deletion_events is '§16.4: only the Admin reads the deletion record (USER_DATA_EXPORT_DELETE, Admin only by BR-025).';
comment on policy account_deletion_events_select_own_execute on nestly.account_deletion_events is 'An identity reads only its own execute row, so users_insert_own can refuse a new account on a deleted identity.';
comment on policy account_deletion_events_insert_own on nestly.account_deletion_events is 'Written only by account_deletion_record() in the transaction of the status change (pg_trigger_depth() > 0): a request with the users row scheduled at that date, a cancel with the row active again. Nobody inserts directly.';
comment on policy account_deletion_events_select_jobs on nestly.account_deletion_events is 'Rule 6: the daily job reads the record (its retention, and the 90-day clock of the kept records).';
comment on policy account_deletion_events_insert_jobs on nestly.account_deletion_events is 'Rule 6: the job writes the execute row of an account whose due date has passed, in the transaction that deletes it.';
comment on policy account_deletion_events_delete_jobs on nestly.account_deletion_events is 'Rule 6, §16.4: 90 days after the execution every row of that account; a request/cancel of an account that is not scheduled now, 12 months after.';
comment on function nestly.account_deletion_record() is 'SECURITY INVOKER. After a status change into or out of deletion_scheduled: one account_deletion_events row (request with the new due date, or cancel with the old one), as the account itself.';
comment on constraint conversations_one_side_check on nestly.conversations is 'BR-073: a conversation outlives one deleted side, never both.';
comment on constraint conversations_chat_request_id_check on nestly.conversations is 'A request conversation names its chat request while both sides exist; once one side was deleted the request is gone (SET NULL).';
comment on constraint conversations_outreach_request_id_check on nestly.conversations is 'An outreach conversation names its outreach request while both sides exist; once one side was deleted the request is gone (SET NULL).';
comment on column nestly.comments.is_author_deleted is 'BR-073: the comment of a deleted account that had replies: text and author emptied, shown as "deleted user".';
comment on constraint comments_author_deleted_check on nestly.comments is 'A deleted-user comment has no author and no text.';
comment on policy users_select_jobs on nestly.users is 'Rule 6: the daily deletion job reads the scheduled accounts.';
comment on policy users_delete_jobs on nestly.users is 'Rule 6, BR-073: the job deletes an account whose due date has passed; the rest goes by CASCADE.';
comment on policy posts_select_deletion_jobs on nestly.posts is 'Rule 6: the deletion job reads the posts of scheduled accounts (is one still under an open report? BR-080).';
comment on policy comments_select_deletion_jobs on nestly.comments is 'Rule 6: the deletion job reads the comments of scheduled accounts and the replies (does a comment have replies? BR-073).';
comment on policy comments_update_deletion_jobs on nestly.comments is 'Rule 6, BR-073: the job turns a replied comment of the deleted account into a "deleted user" row.';
comment on policy reports_update_deletion_jobs on nestly.reports is 'Rule 6: an open report on an account being deleted expires with it.';
comment on policy conversations_select_jobs on nestly.conversations is 'Rule 6: the deletion job reads the conversations of scheduled accounts.';
comment on policy conversations_update_jobs on nestly.conversations is 'Rule 6, BR-073: the job detaches the deleted side so the conversation stays whole for the other.';
comment on policy conversations_delete_jobs on nestly.conversations is 'Rule 6, BR-073: a conversation whose other side was deleted before goes with the second deletion (messages and markers by cascade).';
comment on policy marketplace_listings_select_deletion_jobs on nestly.marketplace_listings is 'Rule 6, BR-080: the deletion job reads the listings of scheduled accounts (is one under an open report?).';
comment on policy professional_articles_select_deletion_jobs on nestly.professional_articles is 'Rule 6, BR-080: the deletion job reads the articles of scheduled accounts (is one under an open report?).';
comment on policy professional_reviews_select_deletion_jobs on nestly.professional_reviews is 'Rule 6, BR-080: the deletion job reads the reviews a scheduled account wrote or that are about it (is one under an open report?).';
comment on policy messages_select_deletion_jobs on nestly.messages is 'Rule 6, BR-080: the deletion job reads the message ids of a one-sided conversation of a scheduled account (it goes with the account; is one under an open report?).';
comment on policy reports_select_deletion_jobs on nestly.reports is 'Rule 6, BR-073: the purge reads every report made by an account deleted 90 days ago, handled ones included.';
comment on policy security_events_select_jobs on nestly.security_events is 'Rule 6, BR-073: the purge reads the events of accounts deleted 90 days ago.';
comment on policy security_events_delete_jobs on nestly.security_events is 'Rule 6, BR-073: and deletes them.';
comment on policy recovery_events_select_jobs on nestly.recovery_events is 'Rule 6, BR-073: the purge reads the recovery events of accounts deleted 90 days ago.';
comment on policy recovery_events_delete_jobs on nestly.recovery_events is 'Rule 6, BR-073: and deletes them.';
comment on policy reports_delete_deletion_jobs on nestly.reports is 'Rule 6, BR-073: the reports made by an account deleted 90 days ago.';
comment on policy enforcement_records_select_jobs on nestly.enforcement_records is 'Rule 6, BR-073: the enforcement records of accounts deleted 90 days ago.';
comment on policy enforcement_records_delete_jobs on nestly.enforcement_records is 'Rule 6, BR-073: and deletes them.';
comment on policy user_enforcements_select_jobs on nestly.user_enforcements is 'Rule 6, BR-073: the enforcement history of accounts deleted 90 days ago.';
comment on policy user_enforcements_delete_jobs on nestly.user_enforcements is 'Rule 6, BR-073: and deletes it.';
comment on policy audit_log_select_jobs on nestly.audit_log is 'Rule 6, BR-073: the Audit entries about an account deleted 90 days ago.';
comment on policy audit_log_delete_jobs on nestly.audit_log is 'Rule 6, BR-073: and deletes them (audit_log_append_only() lets exactly this through).';
comment on function nestly.audit_log_append_only() is 'Audit is append-only (NFR-AUDIT-001): every UPDATE, DELETE and TRUNCATE raises 42501, except the retention job''s DELETE (app_jobs) of an entry about an account whose execution is 90 days old (BR-073).';
comment on function nestly.execute_account_deletions() is 'SECURITY INVOKER, EXECUTE app_jobs (the daily job). BR-073 at the due date: per account (unless an open report holds its content, BR-080: it waits) the execute row, its open account reports expired, its conversations detached, its replied comments kept as "deleted user", the users row deleted (CASCADE does the rest). Returns executed, waiting, failed.';
comment on function nestly.purge_deleted_accounts() is 'SECURITY INVOKER, EXECUTE app_jobs (the daily job). BR-073, §16.4: 90 days after an execution the account''s security events, recovery events, reports, enforcement records and history, Audit entries about it and its deletion rows; a request/cancel of a live account 12 months after. Returns the rows deleted.';
comment on column nestly.reports.reporter_id is 'The reporter (default auth.uid()). No FK since I9: the report outlives a deleted reporter for 90 days (BR-073). Readable only by that reporter (reports_select_reporter, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.security_events.user_id is 'The account that was refused. No FK since I9: kept 90 days after its deletion (BR-073).';
comment on column nestly.recovery_events.user_id is 'The account the handle belongs to (forced by recovery_events_insert_recovery), or the transaction''s sub for the subject-bound kinds. NULL only for reset_failed and reset_limited on a handle with no account, and for takeover_cleared and first_password_set of an Auth user with no account row (the server writes NULL there). No FK since I9: kept 90 days after the account''s deletion (BR-073), so a subject-bound row may name an Auth user with no account row.';
comment on column nestly.enforcement_records.user_id is 'The author of the deleted content (a listing: its owner; a review: its writer). NULL for an anonymous post and its author''s own comments (rule 20: never named in the history). No FK since I9: kept 90 days after the account''s deletion (BR-073).';
comment on column nestly.user_enforcements.user_id is 'The account acted on. No FK since I9: kept 90 days after its deletion (BR-073).';
comment on column nestly.messages.sender_id is 'The sender; NULL once that account was deleted (BR-073: shown as "deleted user").';
comment on column nestly.conversations.user_a is 'The lower participant id; NULL once that account was deleted (BR-073).';
comment on column nestly.conversations.user_b is 'The higher participant id; NULL once that account was deleted (BR-073).';
