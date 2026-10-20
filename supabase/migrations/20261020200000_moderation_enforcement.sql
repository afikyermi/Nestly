-- =====================================================================================================================
-- Moderation and enforcement — the safety and admin core, part 2: report reasons and handling, content moderation, the author's
-- delete right over moderated content (the debt closed here), the audited reveal of an anonymous author, account enforcement
-- (warning, suspension, ban and their reversal), and the end of a suspension by its own account.
--
-- SRS: FR-MOD-001 (reasons, the report keeps a copy of the reported text), FR-MOD-002, FR-MOD-003, FR-ADMIN-005, FR-ADMIN-007 (report
--      reasons), BR-024, BR-026, BR-062, BR-074, BR-080 · AC-022, AC-027, AC-028, AC-029, AC-077, AC-106, AC-107, AC-110 ·
--      platform rules 6, 14, 15, 16, 18, 19, 20. Depends on 20261020100000 (staff_roles, has_permission(), audit_log).
--
-- report_reasons      the list of report reasons with its queue priority (BR-074) — editable by COMMUNITY_CONFIG; reports.reason references it.
-- reports             gains the copy of the reported text (target_text), and the handling (resolution, handled_by, handler_note).
-- user_enforcements   one row per enforcement action on an account (warning, suspension, reinstate, ban, unban); the ladder suggestion
--                     (BR-074) is computed by the database and a skipped step is recorded; the status change and the Audit entry are
--                     made by triggers in the same statement.
-- users               gains suspended_until and the guarded update path (staff by Permission Key; an account ends its own expired
--                     suspension).
-- posts, comments     content moderation (hidden / removed / restored) by CONTENT_MODERATE, audited; and the author's own path to delete
--                     content a moderator hid or removed (it was invisible to the author, so the delete found nothing).
-- reveal_post_author  the audited read of the real author of an anonymous post (rule 19).
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged. No policy or grant for app_jobs.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261020200000_moderation_enforcement.down.sql (refuses once an enforcement, a handled report or a changed reason exists).
-- =====================================================================================================================

-- 1. report_reasons (FR-ADMIN-007). Seeded with the eight reasons of FR-MOD-001 and their priorities (BR-074) before RLS is enabled.
create table nestly.report_reasons (
  key        text        not null,
  label      text        not null,
  priority   smallint    not null,
  sort_order integer     not null,
  is_active  boolean     not null default true,
  is_core    boolean     not null default false,
  updated_at timestamptz not null default now(),
  constraint report_reasons_pkey primary key (key),
  constraint report_reasons_key_check check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint report_reasons_label_check check (char_length(btrim(label)) between 2 and 60),
  constraint report_reasons_priority_check check (priority between 1 and 4),
  constraint report_reasons_sort_order_check check (sort_order between 0 and 1000),
  constraint report_reasons_core_check check (not is_core or is_active)
);

insert into nestly.report_reasons (key, label, priority, sort_order, is_core) values
  ('child_safety',           'תוכן שמסכן ילד',                       1, 10, true),
  ('harassment',             'הטרדה או בריונות',                     2, 20, false),
  ('sexual_violent_hateful', 'תוכן מיני, אלים או מסית',              2, 30, false),
  ('personal_information',   'חשיפת פרטים אישיים',                   2, 40, false),
  ('medical_misinformation', 'מידע רפואי מסוכן או מטעה',             3, 50, false),
  ('impersonation',          'התחזות',                               3, 60, false),
  ('spam',                   'ספאם או פרסום לא קשור',                4, 70, false),
  ('other',                  'אחר',                                  4, 80, true);

alter table nestly.report_reasons enable row level security, force row level security;

create policy report_reasons_select_active_account on nestly.report_reasons
  for select to authenticated
  using ((select nestly.is_active_account()));

create policy report_reasons_insert_config on nestly.report_reasons
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('COMMUNITY_CONFIG')) and not is_core);

create policy report_reasons_update_config on nestly.report_reasons
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('COMMUNITY_CONFIG')))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('COMMUNITY_CONFIG')));

revoke all on table nestly.report_reasons from public, anon;
grant select on table nestly.report_reasons to authenticated;
grant insert (key, label, priority, sort_order, is_active) on table nestly.report_reasons to authenticated;
grant update (label, priority, sort_order, is_active) on table nestly.report_reasons to authenticated;

create function nestly.report_reasons_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.key <> old.key or new.is_core <> old.is_core then
      raise exception 'report_reasons: the key is fixed' using errcode = '42501';
    end if;
    -- "content endangering a child" keeps the top priority and cannot be switched off; "other" cannot be switched off (VAL-048)
    if old.key = 'child_safety' and new.priority <> 1 then
      raise exception 'report_reasons: child_safety keeps priority 1' using errcode = '23514';
    end if;
    if old.is_core and not new.is_active then
      raise exception 'report_reasons: a core reason stays active' using errcode = '23514';
    end if;
    new.updated_at := pg_catalog.now();
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, before_state, after_state)
  values ((select nestly.caller_staff_role()), 'COMMUNITY_CONFIG', 'report_reason_changed', 'report_reason',
    case tg_op when 'UPDATE' then pg_catalog.jsonb_build_object('key', old.key, 'label', old.label, 'priority', old.priority,
      'sortOrder', old.sort_order, 'isActive', old.is_active) end,
    pg_catalog.jsonb_build_object('key', new.key, 'label', new.label, 'priority', new.priority,
      'sortOrder', new.sort_order, 'isActive', new.is_active));
  return new;
end
$$;

revoke execute on function nestly.report_reasons_guard() from public;

create trigger report_reasons_guard
  before insert or update on nestly.report_reasons
  for each row execute function nestly.report_reasons_guard();

-- 2. reports: the reason now references the list; the copy of the reported text; the handling.
alter table nestly.reports drop constraint reports_reason_check;
alter table nestly.reports
  add constraint reports_reason_fkey foreign key (reason) references nestly.report_reasons (key);

alter table nestly.reports
  add column target_text   text,
  add column resolution    text,
  add column handled_by    uuid,
  add column handler_note  text;

alter table nestly.reports
  add constraint reports_resolution_check check (resolution in ('dismissed', 'action_taken')),
  add constraint reports_handler_note_check check (handler_note is null or (handler_note ~ '[^[:space:]]' and char_length(handler_note) <= 1000)),
  add constraint reports_handled_check check (
    (resolution is null) = (handled_by is null) and (resolution is null or status = 'handled')),
  add constraint reports_handled_by_fkey foreign key (handled_by) references nestly.users (id) on delete restrict;

create index reports_handled_by_idx on nestly.reports (handled_by) where handled_by is not null;
create index reports_open_idx on nestly.reports (created_at, id) where status = 'open';

-- Only an active reason may be chosen for a new report.
drop policy reports_insert_reporter on nestly.reports;
create policy reports_insert_reporter on nestly.reports
  for insert to authenticated
  with check ((select nestly.is_active_account()) and reporter_id = (select auth.uid()) and status = 'open'
    and exists (select 1 from nestly.report_reasons rr where rr.key = reports.reason and rr.is_active));

-- The copy of the reported text (FR-MOD-001, Afik 18.10): taken at the report, read under the reporter's own RLS, so a post or comment the
-- reporter cannot read gives nothing here (reports_insert_check has already refused it). Fires after reports_insert_check (name order).
create function nestly.reports_insert_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.post_id is not null then
    select p.body into new.target_text from nestly.posts p where p.id = new.post_id;
  elsif new.comment_id is not null then
    select c.body into new.target_text from nestly.comments c where c.id = new.comment_id;
  end if;
  return new;
end
$$;

revoke execute on function nestly.reports_insert_snapshot() from public;

create trigger reports_insert_snapshot
  before insert on nestly.reports
  for each row execute function nestly.reports_insert_snapshot();

-- Staff read reports (REPORTS_VIEW; the Admin always) and close them. Handling needs a moderation key as well (AC-022).
create policy reports_select_staff on nestly.reports
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')));

create policy reports_update_staff on nestly.reports
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and status = 'open'
    and ((select nestly.has_permission('CONTENT_MODERATE')) or (select nestly.has_permission('MARKETPLACE_MODERATE'))
      or (select nestly.has_permission('USER_WARN')) or (select nestly.has_permission('USER_SUSPEND'))
      or (select nestly.has_permission('USER_BAN'))))
  with check (status = 'handled');

grant update (status, closed_at, resolution, handled_by, handler_note) on table nestly.reports to authenticated;

create function nestly.reports_handle_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if old.status <> 'open' or new.status <> 'handled' or new.resolution is null then
    raise exception 'reports: a report is only closed as handled, with a resolution' using errcode = '42501';
  end if;
  new.handled_by := (select auth.uid());
  new.closed_at := pg_catalog.now();
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, after_state)
  values ((select nestly.caller_staff_role()), 'REPORTS_VIEW', 'report_handled', 'report', new.id, new.handler_note,
    pg_catalog.jsonb_build_object('resolution', new.resolution, 'targetKind', old.target_kind, 'reason', old.reason));
  return new;
end
$$;

revoke execute on function nestly.reports_handle_guard() from public;

create trigger reports_handle_guard
  before update of status, closed_at, resolution, handled_by, handler_note on nestly.reports
  for each row execute function nestly.reports_handle_guard();

-- 3. Staff read the content that was reported (and nothing else), and the names they need to act on it.
create policy posts_select_staff on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r where r.post_id = posts.id));

create policy comments_select_staff on nestly.comments
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW'))
    and exists (select 1 from nestly.reports r where r.comment_id = comments.id));

create policy regular_names_select_staff on nestly.regular_names
  for select to authenticated
  using ((select nestly.is_active_account())
    and ((select nestly.has_permission('USER_VIEW')) or (select nestly.has_permission('REPORTS_VIEW'))));

-- 4. Content moderation (CONTENT_MODERATE): active <-> hidden <-> removed, on reported content only. The author's delete stays the author's.
create policy posts_update_staff on nestly.posts
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed')
    and exists (select 1 from nestly.reports r where r.post_id = posts.id))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed'));

create policy comments_update_staff on nestly.comments
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed')
    and exists (select 1 from nestly.reports r where r.comment_id = comments.id))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status in ('active', 'hidden', 'removed'));

-- content_hold (replaced): the author may go active, hidden or removed -> deleted (the policies decide whose content); staff may move
-- among active, hidden and removed with CONTENT_MODERATE and a stated reason (nestly.audit_reason, rule 18). Everything else is refused.
create or replace function nestly.content_hold()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if current_user = 'authenticated' then
    if new.status = 'deleted' and old.status in ('active', 'hidden', 'removed') then
      null;
    elsif old.status in ('active', 'hidden', 'removed') and new.status in ('active', 'hidden', 'removed') then
      if not (select nestly.has_permission('CONTENT_MODERATE')) then
        raise exception 'content: moderation needs CONTENT_MODERATE' using errcode = '42501';
      end if;
      if new.status <> 'active' and coalesce(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '') = '' then
        raise exception 'content: a moderation action needs a reason' using errcode = 'NS011';
      end if;
    else
      raise exception 'content: this status change is not allowed' using errcode = '42501';
    end if;
  end if;
  if new.status = 'deleted' then
    new.held_at := now();
    new.held_until := now() + interval '2160 hours';
    new.held_xact := pg_catalog.pg_current_xact_id();
  else
    new.held_at := null;
    new.held_until := null;
    new.held_xact := null;
  end if;
  return new;
end
$$;

-- The audit entry of a moderation move (AFTER, so a refused move leaves none).
create function nestly.content_moderation_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select nestly.caller_staff_role()) is null then
    return null;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values ((select nestly.caller_staff_role()), 'CONTENT_MODERATE',
    case new.status when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end,
    tg_argv[0], new.id, nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), ''),
    pg_catalog.jsonb_build_object('status', old.status), pg_catalog.jsonb_build_object('status', new.status));
  return null;
end
$$;

revoke execute on function nestly.content_moderation_audit() from public;

create trigger posts_moderation_audit
  after update of status on nestly.posts
  for each row
  when (old.status is distinct from new.status and old.status <> 'deleted' and new.status <> 'deleted')
  execute function nestly.content_moderation_audit('post');

create trigger comments_moderation_audit
  after update of status on nestly.comments
  for each row
  when (old.status is distinct from new.status and old.status <> 'deleted' and new.status <> 'deleted')
  execute function nestly.content_moderation_audit('comment');

-- Staff never edit what an author wrote.
create function nestly.reject_staff_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (select nestly.caller_staff_role()) is not null then
    raise exception 'content: staff do not edit content' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke execute on function nestly.reject_staff_edit() from public;

create trigger posts_reject_staff_edit
  before update of audience, body, stage_tag on nestly.posts
  for each row execute function nestly.reject_staff_edit();

-- 5. The author deletes what a moderator hid or removed (the debt). The author cannot read such a row, so the delete found nothing. The two
--    delete functions below name the one row they are deleting in nestly.own_delete (transaction-local); these policies open that one row,
--    and only to its author, for the delete and for the hold (BR-080) that follows when a report is still open.
create policy posts_select_own_moderated on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

create policy posts_update_own_moderated on nestly.posts
  for update to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))))
  with check (status = 'deleted'
    and (author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

create policy comments_select_own_moderated on nestly.comments
  for select to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or (author_id is null
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

create policy comments_update_own_moderated on nestly.comments
  for update to authenticated
  using ((select nestly.is_active_account()) and status in ('hidden', 'removed')
    and id::text = pg_catalog.current_setting('nestly.own_delete', true)
    and (author_id = (select auth.uid())
      or (author_id is null
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))))
  with check (status = 'deleted'
    and (author_id = (select auth.uid())
      or (author_id is null
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

create or replace function nestly.delete_post(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
  violated text;
begin
  perform pg_catalog.set_config('nestly.own_delete', p_id::text, true);
  begin
    delete from nestly.posts where id = p_id;
    get diagnostics n = row_count;
    perform pg_catalog.set_config('nestly.own_delete', '', true);
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.posts set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
  perform pg_catalog.set_config('nestly.own_delete', '', true);
  return n;
end
$$;

create or replace function nestly.delete_comment(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
  violated text;
begin
  perform pg_catalog.set_config('nestly.own_delete', p_id::text, true);
  begin
    delete from nestly.comments where id = p_id;
    get diagnostics n = row_count;
    perform pg_catalog.set_config('nestly.own_delete', '', true);
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.comments set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
  perform pg_catalog.set_config('nestly.own_delete', '', true);
  return n;
end
$$;

-- 6. The audited reveal of an anonymous author (BR-062, AC-077; rule 19). Only from the handling of a report on that post, with REPORTS_VIEW
--    and CONTENT_MODERATE (the Admin has both). The function names the post and the author in transaction-local settings; the two policies
--    below open exactly that row to a caller who holds both keys; the Audit entry is written in the same call.
create policy post_authors_select_reveal on nestly.post_authors
  for select to authenticated
  using (post_id::text = pg_catalog.current_setting('nestly.reveal_post', true) and (select nestly.is_active_account())
    and (select nestly.has_permission('REPORTS_VIEW')) and (select nestly.has_permission('CONTENT_MODERATE')));

create policy regular_names_select_reveal on nestly.regular_names
  for select to authenticated
  using (user_id::text = pg_catalog.current_setting('nestly.reveal_user', true) and (select nestly.is_active_account())
    and (select nestly.has_permission('REPORTS_VIEW')) and (select nestly.has_permission('CONTENT_MODERATE')));

create function nestly.reveal_post_author(p_post uuid)
returns table (user_id uuid, full_name text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_author uuid;
  v_name text;
begin
  if not ((select nestly.has_permission('REPORTS_VIEW')) and (select nestly.has_permission('CONTENT_MODERATE')))
     or not exists (select 1 from nestly.reports r where r.post_id = p_post) then
    raise exception 'reveal: not allowed' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('nestly.reveal_post', p_post::text, true);
  select pa.author_id into v_author from nestly.post_authors pa where pa.post_id = p_post;
  if v_author is null then
    perform pg_catalog.set_config('nestly.reveal_post', '', true);
    raise exception 'reveal: no anonymous author' using errcode = 'NS012';
  end if;
  perform pg_catalog.set_config('nestly.reveal_user', v_author::text, true);
  select rn.full_name into v_name from nestly.regular_names rn where rn.user_id = v_author;
  perform pg_catalog.set_config('nestly.reveal_post', '', true);
  perform pg_catalog.set_config('nestly.reveal_user', '', true);
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id)
  values ((select nestly.caller_staff_role()), 'CONTENT_MODERATE', 'author_revealed', 'post', p_post);
  return query select v_author, v_name;
end
$$;

revoke execute on function nestly.reveal_post_author(uuid) from public;
grant execute on function nestly.reveal_post_author(uuid) to authenticated;

-- 7. users: the end of a suspension, and the guarded update path.
alter table nestly.users add column suspended_until timestamptz;
alter table nestly.users
  add constraint users_suspended_until_check check (suspended_until is null or status = 'suspended');

create function nestly.users_status_guard()
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
                                 else array['reinstate', 'unban'] end)) then
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

revoke execute on function nestly.users_status_guard() from public;

create trigger users_status_guard
  before update on nestly.users
  for each row execute function nestly.users_status_guard();

create policy users_update_staff on nestly.users
  for update to authenticated
  using (id <> (select auth.uid())
    and ((select nestly.has_permission('USER_SUSPEND')) or (select nestly.has_permission('USER_BAN')))
    and (account_type in ('regular', 'professional')
      or (account_type = 'moderator' and (select nestly.caller_staff_role()) = 'admin')))
  with check (id <> (select auth.uid()));

create policy users_update_own_expired_suspension on nestly.users
  for update to authenticated
  using (id = (select auth.uid()) and status = 'suspended' and suspended_until is not null and suspended_until <= now())
  with check (id = (select auth.uid()) and status = 'active');

grant update (status, suspended_until) on table nestly.users to authenticated;

-- 8. user_enforcements (FR-MOD-002, BR-074).
create table nestly.user_enforcements (
  id                uuid        not null default gen_random_uuid(),
  user_id           uuid        not null,
  actor_id          uuid        not null default auth.uid(),
  kind              text        not null,
  reason            text        not null,
  duration_hours    integer,
  suspended_until   timestamptz,
  report_id         uuid,
  is_child_safety   boolean     not null default false,
  suggested_kind    text,
  suggested_hours   integer,
  is_step_skipped   boolean     not null default false,
  created_at        timestamptz not null default now(),
  constraint user_enforcements_pkey primary key (id),
  constraint user_enforcements_kind_check check (kind in ('warning', 'suspension', 'reinstate', 'ban', 'unban')),
  constraint user_enforcements_reason_check check (reason ~ '[^[:space:]]' and char_length(reason) <= 1000),
  constraint user_enforcements_duration_check check (
    (kind = 'suspension') = (duration_hours is not null) and (duration_hours is null or duration_hours between 1 and 8760)),
  constraint user_enforcements_until_check check ((kind = 'suspension') = (suspended_until is not null)),
  constraint user_enforcements_child_safety_check check (not is_child_safety or kind = 'ban'),
  constraint user_enforcements_suggested_kind_check check (suggested_kind in ('warning', 'suspension', 'ban')),
  constraint user_enforcements_user_id_fkey foreign key (user_id) references nestly.users (id) on delete cascade,
  constraint user_enforcements_actor_id_fkey foreign key (actor_id) references nestly.users (id) on delete restrict,
  constraint user_enforcements_report_id_fkey foreign key (report_id) references nestly.reports (id) on delete set null
);

create index user_enforcements_user_id_created_at_idx on nestly.user_enforcements (user_id, created_at desc);
create index user_enforcements_actor_id_idx on nestly.user_enforcements (actor_id);
create index user_enforcements_report_id_idx on nestly.user_enforcements (report_id) where report_id is not null;

-- BEFORE INSERT: the ladder (BR-074) from the account's own history in the last 12 months — a warning or a suspension counts one, a ban counts
-- the whole ladder — suggests warning, 24 hours, 7 days, 30 days, ban. A different choice is recorded as a skipped step (the 72-hour suspension
-- and other durations are outside the ladder). The end time is the database's clock plus the duration.
create function nestly.user_enforcements_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  select coalesce(sum(case e.kind when 'warning' then 1 when 'suspension' then 1 when 'ban' then 4 else 0 end), 0) into v_count
    from nestly.user_enforcements e
   where e.user_id = new.user_id and e.created_at > pg_catalog.now() - interval '12 months';
  new.suggested_kind := case when v_count = 0 then 'warning' when v_count <= 3 then 'suspension' else 'ban' end;
  new.suggested_hours := case v_count when 1 then 24 when 2 then 168 when 3 then 720 else null end;
  if new.kind = 'suspension' then
    new.suspended_until := pg_catalog.now() + pg_catalog.make_interval(hours => new.duration_hours);
  end if;
  new.is_step_skipped := case
    when new.kind in ('reinstate', 'unban') then false
    when new.kind <> new.suggested_kind then true
    when new.kind = 'suspension' and new.duration_hours in (24, 168, 720) then new.duration_hours is distinct from new.suggested_hours
    else false end;
  return new;
end
$$;

-- AFTER INSERT: the status change and the Audit entry, in the same statement. A change that does not apply (unban of an account that is not
-- banned ...) rolls the whole statement back.
create function nestly.user_enforcements_apply()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before text;
  n integer := 1;
begin
  if current_user <> 'authenticated' then
    return null; -- the owner role (fixtures) writes history only; every runtime action applies and is audited
  end if;
  select u.status into v_before from nestly.users u where u.id = new.user_id;
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
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values ((select nestly.caller_staff_role()),
    case new.kind when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end,
    case new.kind when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end,
    'user', new.user_id, new.reason,
    pg_catalog.jsonb_build_object('status', v_before),
    pg_catalog.jsonb_build_object('kind', new.kind, 'durationHours', new.duration_hours, 'suspendedUntil', new.suspended_until,
      'suggestedKind', new.suggested_kind, 'suggestedHours', new.suggested_hours, 'stepSkipped', new.is_step_skipped,
      'childSafety', new.is_child_safety, 'reportId', new.report_id));
  return null;
end
$$;

revoke execute on function nestly.user_enforcements_prepare() from public;
revoke execute on function nestly.user_enforcements_apply() from public;

create trigger user_enforcements_prepare
  before insert on nestly.user_enforcements
  for each row execute function nestly.user_enforcements_prepare();

create trigger user_enforcements_apply
  after insert on nestly.user_enforcements
  for each row execute function nestly.user_enforcements_apply();

alter table nestly.user_enforcements enable row level security, force row level security;

-- Staff with USER_VIEW read the history; the account reads its own (a warning is addressed to it).
create policy user_enforcements_select_staff on nestly.user_enforcements
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('USER_VIEW')));

create policy user_enforcements_select_own on nestly.user_enforcements
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

-- Never without an Actor; the key depends on the action; never on oneself; a Moderator never on an Admin or a Moderator.
create policy user_enforcements_insert_staff on nestly.user_enforcements
  for insert to authenticated
  with check ((select nestly.is_active_account()) and actor_id = (select auth.uid()) and user_id <> (select auth.uid())
    and (select case kind
          when 'warning' then nestly.has_permission('USER_WARN')
          when 'suspension' then nestly.has_permission('USER_SUSPEND')
          when 'reinstate' then nestly.has_permission('USER_SUSPEND')
          else nestly.has_permission('USER_BAN') end)
    and exists (select 1 from nestly.users u
                 where u.id = user_enforcements.user_id
                   and (u.account_type in ('regular', 'professional')
                     or (u.account_type = 'moderator' and (select nestly.caller_staff_role()) = 'admin'))));

revoke all on table nestly.user_enforcements from public, anon;
grant select on table nestly.user_enforcements to authenticated;
grant insert (user_id, kind, reason, duration_hours, report_id, is_child_safety) on table nestly.user_enforcements to authenticated;

-- 9. Comments.
comment on table nestly.report_reasons is
  'FR-MOD-001, FR-ADMIN-007, BR-074: the list of report reasons with the queue priority (1 highest: child safety). Edited by COMMUNITY_CONFIG (label, priority, order, active; a new reason); child_safety keeps priority 1 and child_safety and other stay active. Every change is audited.';
comment on column nestly.report_reasons.key is 'The stable identifier stored in reports.reason; never changes.';
comment on column nestly.report_reasons.label is 'The Hebrew text the reporter sees, 2-60 characters.';
comment on column nestly.report_reasons.priority is 'Queue priority 1-4 (BR-074); 1 is shown first.';
comment on column nestly.report_reasons.sort_order is 'The order in the report window.';
comment on column nestly.report_reasons.is_active is 'Whether a new report may use it; existing reports keep theirs.';
comment on column nestly.report_reasons.is_core is 'child_safety and other: cannot be switched off.';
comment on column nestly.report_reasons.updated_at is 'When the row last changed.';
comment on column nestly.reports.target_text is 'The reported text as it was when reported (post or comment body); NULL for a user report (Afik 18.10: the report keeps a copy).';
comment on column nestly.reports.resolution is 'How staff closed the report: dismissed or action_taken. NULL while open or expired.';
comment on column nestly.reports.handled_by is 'The staff member who closed it (set by the database).';
comment on column nestly.reports.handler_note is 'The handler''s note, at most 1000 characters; also the Audit reason.';
comment on table nestly.user_enforcements is
  'FR-MOD-002, BR-074: one row per enforcement action on an account (warning, suspension, reinstate, ban, unban), with the Actor, the reason, the database-computed ladder suggestion and whether the step was skipped. Inserting it applies the status change and writes the Audit entry; there is no automatic enforcement.';
comment on column nestly.user_enforcements.user_id is 'The account acted on.';
comment on column nestly.user_enforcements.actor_id is 'The staff member (database default auth.uid()); an action never exists without one (AC-107).';
comment on column nestly.user_enforcements.kind is 'warning, suspension, reinstate (end a suspension early), ban, unban.';
comment on column nestly.user_enforcements.reason is 'Required, at most 1000 characters; recorded in the Audit Log.';
comment on column nestly.user_enforcements.duration_hours is 'Suspension length in hours (1-8760); the ladder steps are 24, 168, 720; 72 is the extra option.';
comment on column nestly.user_enforcements.suspended_until is 'The end of the suspension: the database clock at insert plus duration_hours.';
comment on column nestly.user_enforcements.report_id is 'The report this action came from, when it did.';
comment on column nestly.user_enforcements.is_child_safety is 'An immediate ban for content endangering a child, whatever the ladder says (AC-110).';
comment on column nestly.user_enforcements.suggested_kind is 'The ladder''s suggestion at the time (BR-074): warning, suspension or ban.';
comment on column nestly.user_enforcements.suggested_hours is 'The suggested suspension length, when the suggestion is a suspension.';
comment on column nestly.user_enforcements.is_step_skipped is 'The Actor chose a different step than the suggestion (kept in the Audit entry with the reason).';
comment on column nestly.user_enforcements.created_at is 'Database clock; the ladder counts the last 12 months.';
comment on column nestly.users.suspended_until is 'The end of a suspension; NULL otherwise (or a suspension with no end). Once passed, the account ends it by itself the next time it asks for its state (users_update_own_expired_suspension).';
comment on function nestly.report_reasons_guard() is 'SECURITY INVOKER. Before insert or update on report_reasons: the key is fixed, child_safety keeps priority 1, core reasons stay active; appends report_reason_changed with Before/After.';
comment on function nestly.reports_insert_snapshot() is 'SECURITY INVOKER. Before insert on reports: copies the reported post or comment text, read under the reporter''s RLS.';
comment on function nestly.reports_handle_guard() is 'SECURITY INVOKER. Before update on reports by a user: only open -> handled with a resolution; sets handled_by and closed_at; appends report_handled.';
comment on function nestly.content_moderation_audit() is 'SECURITY INVOKER. After a staff move among active, hidden and removed: appends content_hidden, content_removed or content_restored with the reason.';
comment on function nestly.reject_staff_edit() is 'SECURITY INVOKER. Before an edit of a post''s audience, body or tag by a staff account: refused.';
comment on function nestly.reveal_post_author(uuid) is 'SECURITY INVOKER (rule 19). Returns the real author of an anonymous post to a caller with REPORTS_VIEW and CONTENT_MODERATE, only while a report on that post exists, and appends author_revealed in the same call. The two reveal policies open that one row only while the function has named it.';
comment on function nestly.users_status_guard() is 'SECURITY INVOKER. Before a status change on users: staff by Permission Key and target type, an account its own expired suspension; clears suspended_until when the status is not suspended.';
comment on function nestly.user_enforcements_prepare() is 'SECURITY INVOKER. Before insert: computes the ladder suggestion from the last 12 months, the suspension end, and whether the Actor skipped the suggested step.';
comment on function nestly.user_enforcements_apply() is 'SECURITY INVOKER. After insert: applies the status change (NS013 when it does not apply) and appends the Audit entry with the reason and the ladder.';
comment on function nestly.content_hold() is 'SECURITY INVOKER. Before update of status: the author may go active, hidden or removed to deleted (held 90 days); staff move among active, hidden and removed with CONTENT_MODERATE and a reason; anything else is refused. A change to deleted stamps the held columns.';
comment on function nestly.delete_post(uuid) is 'SECURITY INVOKER. Deletes the caller''s post under RLS, naming it in nestly.own_delete so a post a moderator hid or removed can be deleted by its author; when an open report refuses it, holds it instead. Returns 1 for either, 0 for a post that is not the caller''s.';
comment on function nestly.delete_comment(uuid) is 'SECURITY INVOKER. As delete_post, for a comment.';
comment on policy report_reasons_select_active_account on nestly.report_reasons is 'Every active account reads the list (the report window needs it).';
comment on policy report_reasons_insert_config on nestly.report_reasons is 'COMMUNITY_CONFIG adds a (non-core) reason.';
comment on policy report_reasons_update_config on nestly.report_reasons is 'COMMUNITY_CONFIG edits label, priority, order and active.';
comment on policy reports_select_staff on nestly.reports is 'REPORTS_VIEW (the Admin always) reads every report.';
comment on policy reports_update_staff on nestly.reports is 'An open report is closed by staff with REPORTS_VIEW and at least one moderation key (AC-022).';
comment on policy reports_insert_reporter on nestly.reports is 'An active account files its own open report with an active reason.';
comment on policy posts_select_staff on nestly.posts is 'REPORTS_VIEW reads a post that has a report, in any status (including held and moderated).';
comment on policy comments_select_staff on nestly.comments is 'REPORTS_VIEW reads a comment that has a report, in any status.';
comment on policy regular_names_select_staff on nestly.regular_names is 'USER_VIEW or REPORTS_VIEW reads names.';
comment on policy posts_update_staff on nestly.posts is 'CONTENT_MODERATE moves a reported post among active, hidden and removed (content_hold requires a reason; the audit trigger records it).';
comment on policy comments_update_staff on nestly.comments is 'CONTENT_MODERATE moves a reported comment among active, hidden and removed.';
comment on policy posts_select_own_moderated on nestly.posts is 'The author reads their own hidden or removed post only while delete_post has named it in nestly.own_delete (the delete right over moderated content).';
comment on policy posts_update_own_moderated on nestly.posts is 'The author holds (status deleted) their own hidden or removed post while delete_post has named it, when an open report keeps the row.';
comment on policy comments_select_own_moderated on nestly.comments is 'As posts_select_own_moderated, for a comment.';
comment on policy comments_update_own_moderated on nestly.comments is 'As posts_update_own_moderated, for a comment.';
comment on policy post_authors_select_reveal on nestly.post_authors is 'REPORTS_VIEW + CONTENT_MODERATE read the separation row of the one post reveal_post_author has named (rule 19, AC-077).';
comment on policy regular_names_select_reveal on nestly.regular_names is 'REPORTS_VIEW + CONTENT_MODERATE read the name of the one author reveal_post_author has named.';
comment on policy users_update_staff on nestly.users is 'Staff with USER_SUSPEND or USER_BAN change the status of a Regular or Professional account (an Admin also a Moderator), never their own; users_status_guard decides which change needs which key.';
comment on policy users_update_own_expired_suspension on nestly.users is 'An account whose suspension end has passed returns itself to active.';
comment on policy user_enforcements_select_staff on nestly.user_enforcements is 'USER_VIEW (the Admin always) reads the enforcement history.';
comment on policy user_enforcements_select_own on nestly.user_enforcements is 'An active account reads the actions taken on itself.';
comment on policy user_enforcements_insert_staff on nestly.user_enforcements is 'Staff record an action naming themselves, with the key the action needs, on another account that is not an Admin (a Moderator: not a Moderator either).';
comment on index nestly.reports_handled_by_idx is 'The RESTRICT check on a users delete.';
comment on index nestly.reports_open_idx is 'The moderation queue: open reports, oldest first.';
comment on index nestly.user_enforcements_user_id_created_at_idx is 'The ladder count (last 12 months) and an account''s history; the user FK cascade.';
comment on index nestly.user_enforcements_actor_id_idx is 'The RESTRICT check on a users delete.';
comment on index nestly.user_enforcements_report_id_idx is 'The SET NULL of a report delete.';
