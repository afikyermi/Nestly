-- =====================================================================================================================
-- Down script for supabase/migrations/20261026500000_account_deletion_rules.sql: restores, verbatim as 20261020300000_safety_admin_core.sql
-- and 20261025200000_account_deletion.sql left them, users_status_guard(), user_enforcements_apply(), account_deletion_record() and
-- execute_account_deletions() with their comments; drops account_deletion_events_insert_enforcement, reports_text_gone_with_account (trigger and function),
-- reports_select_deletion_text_jobs, reports_update_deletion_text_jobs, account_deletion_events_update_jobs and the column auth_removed_at; restores
-- account_deletion_events_delete_jobs and purge_deleted_accounts() as 20261025200000 left them; revokes the grants it added.
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod: Afik only.
-- Refuses:  once an Auth user was stamped as removed (auth_removed_at set: dropping it would let the job call Auth again for it).
-- Restores: the state before the migration; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the account deletion rules down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.account_deletion_events no force row level security;
do $$
begin
  if exists (select 1 from nestly.account_deletion_events e where e.auth_removed_at is not null) then
    raise exception 'account deletion rules down: an Auth user was already removed and stamped; not rolled back';
  end if;
end
$$;
alter table nestly.account_deletion_events force row level security;

drop policy account_deletion_events_update_jobs on nestly.account_deletion_events;
drop policy account_deletion_events_delete_jobs on nestly.account_deletion_events;
create policy account_deletion_events_delete_jobs on nestly.account_deletion_events
  for delete to app_jobs
  using (account_id in (select e.account_id from nestly.account_deletion_events e
                         where e.kind = 'execute' and e.created_at <= now() - interval '90 days')
    or (kind in ('request', 'cancel') and created_at <= now() - interval '12 months'
        and not exists (select 1 from nestly.users u where u.id = account_deletion_events.account_id and u.status = 'deletion_scheduled')));

create or replace function nestly.purge_deleted_accounts()
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


comment on policy account_deletion_events_delete_jobs on nestly.account_deletion_events is 'Rule 6, §16.4: 90 days after the execution every row of that account; a request/cancel of an account that is not scheduled now, 12 months after.';
comment on function nestly.purge_deleted_accounts() is 'SECURITY INVOKER, EXECUTE app_jobs (the daily job). BR-073, §16.4: 90 days after an execution the account''s security events, recovery events, reports, enforcement records and history, Audit entries about it and its deletion rows; a request/cancel of a live account 12 months after. Returns the rows deleted.';

revoke update (auth_removed_at) on table nestly.account_deletion_events from app_jobs;
alter table nestly.account_deletion_events drop constraint account_deletion_events_auth_removed_check;
alter table nestly.account_deletion_events drop column auth_removed_at;

drop trigger reports_text_gone_with_account on nestly.reports;
drop function nestly.reports_text_gone_with_account();
drop policy reports_select_deletion_text_jobs on nestly.reports;
drop policy reports_update_deletion_text_jobs on nestly.reports;
revoke update (target_text) on table nestly.reports from app_jobs;

drop policy account_deletion_events_insert_enforcement on nestly.account_deletion_events;
revoke insert (account_id) on table nestly.account_deletion_events from authenticated;

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


create or replace function nestly.user_enforcements_apply()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer := 1;
begin
  if current_user <> 'authenticated' then
    return null; -- the owner role (fixtures) writes history only; every runtime action applies and is audited
  end if;
  if new.kind = 'suspension' then
    update nestly.users set status = 'suspended', suspended_until = new.suspended_until
     where id = new.user_id and status in ('active', 'suspended');
    get diagnostics n = row_count;
  elsif new.kind = 'ban' then
    update nestly.users set status = 'banned' where id = new.user_id and status in ('active', 'suspended');
    get diagnostics n = row_count;
  elsif new.kind = 'unban' then
    update nestly.users set status = 'active' where id = new.user_id and status = 'banned';
    get diagnostics n = row_count;
  elsif new.kind = 'reinstate' then
    update nestly.users set status = 'active' where id = new.user_id and status = 'suspended';
    get diagnostics n = row_count;
  end if;
  if n = 0 then
    raise exception 'enforcement: the account is not in a state this action applies to' using errcode = 'NS013';
  end if;
  return null;
end
$$;


create or replace function nestly.account_deletion_record()
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


create or replace function nestly.execute_account_deletions(out executed integer, out waiting integer, out failed integer)
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


comment on function nestly.users_status_guard() is 'SECURITY INVOKER. Before a status change on users: staff by Permission Key and target type, always with an enforcement row (BR-074); an account itself only ends an expired suspension, schedules its own deletion (Regular / Professional, a valid session, not a Group Owner: ERR-026, NS030; due = now() + 30 days) or cancels it before the due date (FR-SET-002). Staff never schedule, cancel or act on a scheduled account.';
comment on function nestly.user_enforcements_apply() is 'SECURITY INVOKER. After insert: applies the status change (NS013 when it does not apply). The Audit entry is audit_trigger()''s.';
comment on function nestly.account_deletion_record() is 'SECURITY INVOKER. After a status change into or out of deletion_scheduled: one account_deletion_events row (request with the new due date, or cancel with the old one), as the account itself.';
comment on function nestly.execute_account_deletions() is 'SECURITY INVOKER, EXECUTE app_jobs (the daily job). BR-073 at the due date: per account (unless an open report holds its content, BR-080: it waits) the execute row, its open account reports expired, its conversations detached, its replied comments kept as "deleted user", the users row deleted (CASCADE does the rest). Returns executed, waiting, failed.';
comment on column nestly.reports.target_text is 'The reported text as it was when reported (post or comment body); NULL for a user report (Afik 18.10: the report keeps a copy).';

delete from supabase_migrations.schema_migrations where version = '20261026500000';

commit;
