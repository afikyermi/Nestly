-- =====================================================================================================================
-- Down script for supabase/migrations/20261020300000_safety_admin_core.sql (the safety and admin core).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md "Never").
-- Safe:     only while the data it would drop is untouched: no moderator_permissions, audit_log or user_enforcements row, no report with a copy of
--           its text, a resolution or a handler, no users.suspended_until, and report_reasons equal to its seed. The script refuses first and
--           names the reason. FORCE RLS would hide rows from app_owner, so it is lifted inside this transaction for the check and put back.
-- Restores: content_hold, delete_post, delete_comment and reports_insert_reporter verbatim from 20261018200000, reports_reason_check; the
--           staff_roles mirror, the Admin index and the two definer functions are dropped; deletes only its own history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the safety_admin_core down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.moderator_permissions no force row level security;
alter table nestly.audit_log no force row level security;
alter table nestly.user_enforcements no force row level security;
alter table nestly.reports no force row level security;
alter table nestly.users no force row level security;
alter table nestly.report_reasons no force row level security;

do $$
begin
  if exists (select 1 from nestly.user_enforcements) or exists (select 1 from nestly.moderator_permissions) or exists (select 1 from nestly.audit_log)
     or exists (select 1 from nestly.reports where target_text is not null or resolution is not null or handled_by is not null or handler_note is not null)
     or exists (select 1 from nestly.users where suspended_until is not null) then
    raise exception 'user_enforcements, report handling or a suspension end time holds data: it is a record and is not dropped by a script. Stop: forward fix, or Afik''s decision (CLAUDE.md "Never")';
  end if;
  if (select count(*) from nestly.report_reasons) <> 8
     or exists (
       select 1 from nestly.report_reasons rr
       where (rr.key, rr.label, rr.priority, rr.sort_order, rr.is_active) not in (
         ('child_safety', 'תוכן שמסכן ילד', 1, 10, true), ('harassment', 'הטרדה או בריונות', 2, 20, true),
         ('sexual_violent_hateful', 'תוכן מיני, אלים או מסית', 2, 30, true), ('personal_information', 'חשיפת פרטים אישיים', 2, 40, true),
         ('medical_misinformation', 'מידע רפואי מסוכן או מטעה', 3, 50, true), ('impersonation', 'התחזות', 3, 60, true),
         ('spam', 'ספאם או פרסום לא קשור', 4, 70, true), ('other', 'אחר', 4, 80, true))) then
    raise exception 'report_reasons was edited: it is configuration an Admin changed and is not dropped by a script. Stop: forward fix, or Afik''s decision (CLAUDE.md "Never")';
  end if;
end
$$;

alter table nestly.report_reasons force row level security;
alter table nestly.users force row level security;
alter table nestly.reports force row level security;
alter table nestly.user_enforcements force row level security;
alter table nestly.audit_log force row level security;
alter table nestly.moderator_permissions force row level security;

-- 1. Enforcement and the end of a suspension.
drop table nestly.user_enforcements;
drop function nestly.user_enforcements_prepare();
drop function nestly.user_enforcements_apply();
drop policy users_update_own_expired_suspension on nestly.users;
drop policy users_update_staff on nestly.users;
revoke update (status, suspended_until) on table nestly.users from authenticated;
drop trigger users_status_guard on nestly.users;
drop function nestly.users_status_guard();
alter table nestly.users drop constraint users_suspended_until_check;
alter table nestly.users drop column suspended_until;

-- 2. The reveal.
drop function nestly.reveal_post_author(uuid);
drop policy regular_names_select_reveal on nestly.regular_names;
drop policy post_authors_select_reveal on nestly.post_authors;
drop policy reports_select_reveal on nestly.reports;

-- 3. The author's delete over moderated content.
drop policy comments_update_own_moderated on nestly.comments;
drop policy comments_select_own_moderated on nestly.comments;
drop policy posts_update_own_moderated on nestly.posts;
drop policy posts_select_own_moderated on nestly.posts;

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
  begin
    delete from nestly.posts where id = p_id;
    get diagnostics n = row_count;
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.posts set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
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
  begin
    delete from nestly.comments where id = p_id;
    get diagnostics n = row_count;
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.comments set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
  return n;
end
$$;

-- 4. Content moderation.
drop trigger posts_reject_staff_edit on nestly.posts;
drop function nestly.reject_staff_edit();
drop trigger comments_moderation_audit on nestly.comments;
drop trigger posts_moderation_audit on nestly.posts;
drop policy comments_update_staff on nestly.comments;
drop policy posts_update_staff on nestly.posts;

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
  if current_user = 'authenticated' and not (old.status = 'active' and new.status = 'deleted') then
    raise exception 'content: an author can only delete their content' using errcode = '42501';
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

-- 5. Staff reads.
drop policy regular_names_select_staff on nestly.regular_names;
drop policy comments_select_staff on nestly.comments;
drop policy posts_select_staff on nestly.posts;

-- 6. Reports.
drop trigger reports_audit on nestly.reports;
drop trigger reports_handle_guard on nestly.reports;
drop function nestly.reports_handle_guard();
revoke update (status, closed_at, resolution, handled_by, handler_note) on table nestly.reports from authenticated;
drop policy reports_update_staff on nestly.reports;
drop policy reports_select_staff on nestly.reports;
drop trigger reports_insert_snapshot on nestly.reports;
drop function nestly.reports_insert_snapshot();
drop policy reports_insert_reporter on nestly.reports;
create policy reports_insert_reporter on nestly.reports
  for insert to authenticated
  with check ((select nestly.is_active_account()) and reporter_id = (select auth.uid()) and status = 'open');

drop index nestly.reports_open_idx;
drop index nestly.reports_handled_by_idx;
alter table nestly.reports
  drop constraint reports_handled_by_fkey,
  drop constraint reports_handled_check,
  drop constraint reports_handler_note_check,
  drop constraint reports_resolution_check;
alter table nestly.reports
  drop column handler_note,
  drop column handled_by,
  drop column resolution,
  drop column target_text;
alter table nestly.reports drop constraint reports_reason_fkey;
alter table nestly.reports
  add constraint reports_reason_check check (reason in (
    'child_safety', 'harassment', 'sexual_violent_hateful', 'personal_information',
    'medical_misinformation', 'impersonation', 'spam', 'other'));

-- 7. The reasons.
drop table nestly.report_reasons;
drop function nestly.report_reasons_guard();

-- 8. Staff roles, permissions and the Audit Log.
drop policy users_select_staff on nestly.users;
drop trigger users_staff_mirror on nestly.users;
drop function nestly.users_staff_mirror();

drop table nestly.audit_log;
drop table nestly.moderator_permissions;
drop table nestly.staff_roles;
drop policy identity_link_checks_select_definer on nestly.identity_link_checks;

drop function nestly.audit_trigger();
drop function nestly.audit_log_append_only();
drop function nestly.has_permission(text);
drop function nestly.caller_staff_role();

delete from supabase_migrations.schema_migrations where version = '20261020300000';

commit;
