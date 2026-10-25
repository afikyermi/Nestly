-- =====================================================================================================================
-- Down script for supabase/migrations/20261025200000_account_deletion.sql (I9 part 1: account deletion: the scheduled status, the
-- deletion record, the job's execution and 90-day purge, the records detached from users, the chats kept for the other side, the
-- "deleted user" comment row). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Order:    revert the code that requests, cancels or executes a deletion first, then run this.
-- Safe:     only while no deletion was ever requested (FORCE RLS lifted for that check only): it refuses when account_deletion_events holds a row, an account is scheduled,
--           a "deleted user" comment exists, a conversation lost a side or a message lost its sender (none fits the older schema).
-- Restores: users_status_guard() and audit_log_append_only() verbatim (the bodies of 20261020300000_safety_admin_core.sql, as the
--           database held them before this migration), the old status check, the dropped foreign keys (RESTRICT / CASCADE as before),
--           the conversation and message constraints and policies, users_insert_own and the column comments; drops the new table,
--           functions, trigger, policies, grants and columns; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the account deletion down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS would hide the rows from the owner: lifted for the check, inside this transaction, and set again at once
  alter table nestly.account_deletion_events no force row level security;
  alter table nestly.users no force row level security;
  alter table nestly.comments no force row level security;
  alter table nestly.conversations no force row level security;
  alter table nestly.messages no force row level security;
  if exists (select 1 from nestly.account_deletion_events)
     or exists (select 1 from nestly.users where status = 'deletion_scheduled')
     or exists (select 1 from nestly.comments where is_author_deleted)
     or exists (select 1 from nestly.conversations where user_a is null or user_b is null)
     or exists (select 1 from nestly.messages where sender_id is null) then
    raise exception 'an account deletion was requested or executed: the down script would lose it (restore from a backup instead)';
  end if;
  alter table nestly.account_deletion_events force row level security;
  alter table nestly.users force row level security;
  alter table nestly.comments force row level security;
  alter table nestly.conversations force row level security;
  alter table nestly.messages force row level security;
end
$$;

-- 8, 7, 6. the job's functions and reach -----------------------------------------------------------------------------------
drop function nestly.purge_deleted_accounts();
drop function nestly.execute_account_deletions();

create or replace function nestly.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'audit_log: append-only' using errcode = '42501';
end
$function$;
comment on function nestly.audit_log_append_only() is 'SECURITY INVOKER. Refuses every UPDATE and DELETE of audit_log.';

drop policy reports_select_deletion_jobs on nestly.reports;
drop policy messages_select_deletion_jobs on nestly.messages;
drop policy professional_reviews_select_deletion_jobs on nestly.professional_reviews;
drop policy professional_articles_select_deletion_jobs on nestly.professional_articles;
drop policy marketplace_listings_select_deletion_jobs on nestly.marketplace_listings;
drop policy conversations_delete_jobs on nestly.conversations;
drop policy audit_log_delete_jobs on nestly.audit_log;
drop policy audit_log_select_jobs on nestly.audit_log;
drop policy user_enforcements_delete_jobs on nestly.user_enforcements;
drop policy user_enforcements_select_jobs on nestly.user_enforcements;
drop policy enforcement_records_delete_jobs on nestly.enforcement_records;
drop policy enforcement_records_select_jobs on nestly.enforcement_records;
drop policy reports_delete_deletion_jobs on nestly.reports;
drop policy recovery_events_delete_jobs on nestly.recovery_events;
drop policy recovery_events_select_jobs on nestly.recovery_events;
drop policy security_events_delete_jobs on nestly.security_events;
drop policy security_events_select_jobs on nestly.security_events;
drop policy conversations_update_jobs on nestly.conversations;
drop policy conversations_select_jobs on nestly.conversations;
drop policy reports_update_deletion_jobs on nestly.reports;
drop policy comments_update_deletion_jobs on nestly.comments;
drop policy comments_select_deletion_jobs on nestly.comments;
drop policy posts_select_deletion_jobs on nestly.posts;
drop policy users_delete_jobs on nestly.users;
drop policy users_select_jobs on nestly.users;

revoke select (id, target_kind, target_id), delete on table nestly.audit_log from app_jobs;
revoke select (id, user_id), delete on table nestly.user_enforcements from app_jobs;
revoke select (id, user_id), delete on table nestly.enforcement_records from app_jobs;
revoke delete on table nestly.reports from app_jobs;
revoke select (id, user_id), delete on table nestly.recovery_events from app_jobs;
revoke select (id, user_id), delete on table nestly.security_events from app_jobs;
revoke select (id, user_a, user_b, a_status, b_status), update (user_a, user_b), delete on table nestly.conversations from app_jobs;
revoke select (id, owner_id, owner_status) on table nestly.marketplace_listings from app_jobs;
revoke select (id, author_id, author_status) on table nestly.professional_articles from app_jobs;
revoke select (id, reviewer_id, reviewer_status, professional_id) on table nestly.professional_reviews from app_jobs;
revoke select (id, conversation_id) on table nestly.messages from app_jobs;
revoke update (author_id, body) on table nestly.comments from app_jobs;
revoke select (id, account_type, status), delete on table nestly.users from app_jobs;

-- 5. the "deleted user" comment row ----------------------------------------------------------------------------------------
alter table nestly.comments drop constraint comments_author_deleted_check;
alter table nestly.comments drop constraint comments_body_check;
alter table nestly.comments add constraint comments_body_check check ((body ~ '[^[:space:]]'::text));
alter table nestly.comments drop constraint comments_author_id_check;
alter table nestly.comments add constraint comments_author_id_check check (((author_id is not null) or is_by_post_author));
alter table nestly.comments drop column is_author_deleted;

-- 4. chats: both sides required again, deleted with either -----------------------------------------------------------------
alter policy messages_insert_party on nestly.messages
  with check ((select nestly.is_active_account()) and sender_id = (select auth.uid()) and exists (
    select 1 from nestly.conversations c
     where c.id = messages.conversation_id
       and not exists (select 1 from nestly.chat_blocks b
                        where b.lifted_at is null
                          and ((b.blocker_id = c.user_a and b.blocked_id = c.user_b) or (b.blocker_id = c.user_b and b.blocked_id = c.user_a)))));

alter policy conversations_select_party on nestly.conversations
  using ((select nestly.is_active_account()) and (
    (user_a = (select auth.uid()) and b_status = 'active'
      and user_b <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))
    or (user_b = (select auth.uid()) and a_status = 'active'
      and user_a <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

alter table nestly.conversations drop constraint conversations_outreach_request_id_check;
alter table nestly.conversations
  add constraint conversations_outreach_request_id_check check (((context = 'outreach'::text) = (outreach_request_id is not null)));
alter table nestly.conversations drop constraint conversations_outreach_request_id_fkey;
alter table nestly.conversations
  add constraint conversations_outreach_request_id_fkey foreign key (outreach_request_id) references nestly.outreach_requests (id) on delete cascade;
alter table nestly.conversations drop constraint conversations_chat_request_id_check;
alter table nestly.conversations
  add constraint conversations_chat_request_id_check check (((context = 'request'::text) = (chat_request_id is not null)));
alter table nestly.conversations drop constraint conversations_chat_request_id_fkey;
alter table nestly.conversations
  add constraint conversations_chat_request_id_fkey foreign key (chat_request_id) references nestly.chat_requests (id) on delete cascade;
alter table nestly.conversations drop constraint conversations_one_side_check;
alter table nestly.conversations drop constraint conversations_a_status_fkey;
alter table nestly.conversations drop constraint conversations_b_status_fkey;
alter table nestly.conversations
  add constraint conversations_a_status_fkey foreign key (user_a, a_status) references nestly.users (id, status)
    on update cascade on delete cascade,
  add constraint conversations_b_status_fkey foreign key (user_b, b_status) references nestly.users (id, status)
    on update cascade on delete cascade;
alter table nestly.conversations alter column user_a set not null;
alter table nestly.conversations alter column user_b set not null;

alter table nestly.messages drop constraint messages_sender_id_fkey;
alter table nestly.messages
  add constraint messages_sender_id_fkey foreign key (sender_id) references nestly.users (id) on delete cascade;
alter table nestly.messages alter column sender_id set not null;

alter table nestly.user_enforcements drop constraint user_enforcements_status_before_check;
alter table nestly.user_enforcements
  add constraint user_enforcements_status_before_check check ((status_before = any (array['active'::text, 'suspended'::text, 'banned'::text])));

-- 3. the records BR-073 keeps: attached to users again -----------------------------------------------------------------------
alter table nestly.legal_consents drop constraint legal_consents_user_id_fkey;
alter table nestly.legal_consents
  add constraint legal_consents_user_id_fkey foreign key (user_id) references nestly.users (id) on delete restrict;
alter table nestly.user_enforcements
  add constraint user_enforcements_user_id_fkey foreign key (user_id) references nestly.users (id) on delete cascade;
alter table nestly.enforcement_records
  add constraint enforcement_records_user_id_fkey foreign key (user_id) references nestly.users (id) on delete restrict;
alter table nestly.recovery_events
  add constraint recovery_events_user_id_fkey foreign key (user_id) references nestly.users (id) on delete restrict;
alter table nestly.security_events
  add constraint security_events_user_id_fkey foreign key (user_id) references nestly.users (id) on delete restrict;
alter table nestly.reports
  add constraint reports_reporter_id_fkey foreign key (reporter_id) references nestly.users (id) on delete restrict;

-- 2. the deletion record ---------------------------------------------------------------------------------------------------
alter policy users_insert_own on nestly.users
  with check (id = (select auth.uid()) and account_type in ('regular', 'professional') and status = 'active');
drop trigger users_deletion_record on nestly.users;
drop function nestly.account_deletion_record();
drop table nestly.account_deletion_events;

-- 1. users: back to three statuses -----------------------------------------------------------------------------------------
drop policy users_update_own_deletion_cancel on nestly.users;
drop policy users_update_own_deletion_request on nestly.users;

create or replace function nestly.users_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  me uuid := (select auth.uid());
begin
  if (new.id, new.account_type, new.created_at) is distinct from (old.id, old.account_type, old.created_at) then
    raise exception 'users: immutable column' using errcode = '42501';
  end if;
  if new.status = old.status and new.suspended_until is not distinct from old.suspended_until then
    return new;
  end if;
  if new.status <> 'suspended' then
    new.suspended_until := null;
  end if;
  if current_user = 'authenticated' then
    if me = old.id then
      -- an account ends its own suspension once the end time has passed, and does nothing else to itself
      if not (old.status = 'suspended' and old.suspended_until is not null and old.suspended_until <= pg_catalog.now()
              and new.status = 'active') then
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
$function$;
comment on function nestly.users_status_guard() is 'SECURITY INVOKER. Before a status change on users: staff by Permission Key and target type, an account its own expired suspension; clears suspended_until when the status is not suspended.';

alter table nestly.users drop constraint users_deletion_due_at_check;
alter table nestly.users drop column deletion_due_at;
alter table nestly.users drop constraint users_status_check;
alter table nestly.users add constraint users_status_check check ((status = any (array['active'::text, 'suspended'::text, 'banned'::text])));

-- 9. the comments as they were ---------------------------------------------------------------------------------------------
comment on column nestly.users.status is 'Whether the account may use the product now: active, suspended or banned (FR-MOD-002, BR-024). Anything but active reads nothing but its own users row, from the next statement (platform rule 15; F1.5 DR-1 A). A warning is not a status.';
comment on column nestly.reports.reporter_id is 'The reporter (default auth.uid()); ON DELETE RESTRICT: I9 decides the minimal record. Readable only by that reporter (reports_select_reporter, table SELECT grant); no INSERT or UPDATE grant. API responses never emit it.';
comment on column nestly.security_events.user_id is 'The account that was refused.';
comment on column nestly.recovery_events.user_id is 'The account the handle belongs to (forced by recovery_events_insert_recovery), or the transaction''s sub for the subject-bound kinds. NULL only for reset_failed and reset_limited on a handle with no account, and for takeover_cleared and first_password_set of an Auth user with no account row. ON DELETE RESTRICT (I9, OP-028).';
comment on column nestly.enforcement_records.user_id is 'The author of the deleted content (a listing: its owner; a review: its writer). NULL for an anonymous post and its author''s own comments (rule 20: never named in the history).';
comment on column nestly.user_enforcements.user_id is 'The account acted on.';
comment on column nestly.messages.sender_id is 'The sending party (database default auth.uid()).';
comment on column nestly.conversations.user_a is 'The party with the smaller id (an account, users).';
comment on column nestly.conversations.user_b is 'The party with the larger id.';

delete from supabase_migrations.schema_migrations where version = '20261025200000';

commit;
