-- =====================================================================================================================
-- The staff's work -- I14 completion (Afik's decisions of 21.10.2026, decisions-in-force.md §9.1, §9.2, §9.4, §9.7, §9.9, §9.10), migration only.
--
-- SRS: FR-ADMIN-004 (the invitation: 48 hours), FR-ADMIN-010 / BR-058 (children's tracker data only as trends), FR-MOD-003 (the report with its
--      context; escalation; who opened it), BR-040 / NFR-PRIV-002 (Private Group content), BR-062 / AC-077 (the audited reveal), BR-016 / BR-034
--      (staff accounts take no part in the community) · platform rules 8, 10, 16-19 (.claude/knowledge/data-model.md).
--
-- moderator_invitations   valid 48 hours (was 7 days); an open invitation already issued keeps at most 48 hours from its issue. The use of an
--                         invitation is recorded with it: moderator_joined carries the invitation's id.
-- CHILD_DATA_VIEW         a new assignable Permission Key, apart from ANALYTICS_VIEW (the Admin always). It opens one thing only:
-- child_tracker_trends()  the one function over children's tracker data (SECURITY DEFINER, approved by Afik 21.10.2026 for this family, §9.2):
--                         metric x field x dimension, each from a closed list, over the last 30, 90 or 365 days; aggregates only (a cell's number
--                         of children and one average); a cell of fewer than 10 children is suppressed (no number at all); never a row, an id,
--                         a name, a birth date, a medicine's or vaccine's name or a note. Every call appends child_data_queried to the Audit Log
--                         in the same call. It reads tracker_events and children through two TO app_owner policies opened only while it has set
--                         nestly.child_data_scope (no runtime role is a member of app_owner).
-- reveal_post_author()    replaced: on Private Group content the reveal also needs PRIVATE_GROUP_MODERATE (§9.4, gap 3; BR-040), and the entry
--                         says so. Everything else as in 20261020300000.
-- reports                 gain thread_post_id: for a comment report, the comment's post (set at report time by the reporter's own read).
--                         Every active staff account reads every active post and comment for independent review (posts_select_staff_review,
--                         comments_select_staff_review: whatever the audience or the author's privacy). On Private Group content the audited opening (private_group_content_views, which gains thread_post_id) opens that context too,
--                         inside its own transaction only (posts_group_hide and comments_group_hide altered).
--                         A staff account files no report (reports_insert_community, RESTRICTIVE): staff act, they do not report (§9.7: a
--                         Moderator never posts, comments or sends requests; every other social write already refuses a staff account).
-- report_escalations      "escalate to the Admin" with a note (§9.9): a Moderator with REPORTS_VIEW, once per open report; REPORTS_VIEW reads
--                         them; audited (report_escalated, the note as the reason). No UPDATE, no DELETE; they go with their report.
-- group_staff_views       a staff review of a Private Group's page by PRIVATE_GROUP_MODERATE, audited (private_group_viewed); its content is readable
--                         in that transaction only.
-- report_openings         who opened a report, and when (§9.10, the Admin's handling status): one row per report and staff member, written by
--                         REPORTS_VIEW when it opens the report; REPORTS_VIEW reads them. Not audited (an opening is no action). They go with
--                         their report.
-- audit_trigger() replaced   the body of 20261022700000 plus the report_escalations branch and the invitation id on moderator_joined.
-- Phase: expand. Down script: supabase/rollback/20261022800000_staff_work.down.sql.
-- =====================================================================================================================


-- 1. The invitation: 48 hours (FR-ADMIN-004, §9.1) ---------------------------------------------------------------------------------
alter table nestly.moderator_invitations alter column expires_at set default (now() + interval '48 hours');

-- an open invitation already issued keeps at most 48 hours (the owner, FORCE lifted for this one statement and put back at once)
alter table nestly.moderator_invitations no force row level security;
update nestly.moderator_invitations
   set expires_at = least(expires_at, created_at + interval '48 hours')
 where accepted_by is null and revoked_at is null;
alter table nestly.moderator_invitations force row level security;

-- 2. CHILD_DATA_VIEW: assignable, and the Admin always (it depends on no other key) -------------------------------------------------
alter table nestly.moderator_permissions drop constraint moderator_permissions_key_check;
alter table nestly.moderator_permissions add constraint moderator_permissions_key_check check (permission_key in (
  'SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW', 'USER_WARN',
  'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS',
  'PRIVATE_GROUP_MODERATE', 'CHILD_DATA_VIEW'));

create or replace function nestly.has_permission(p_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select case sr.account_type
      when 'admin' then p_key in (
        'SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW', 'CONTENT_MODERATE', 'MARKETPLACE_MODERATE', 'USER_VIEW', 'USER_WARN',
        'USER_SUSPEND', 'USER_BAN', 'ANALYTICS_VIEW', 'AUDIT_LOG_VIEW', 'COMMUNITY_CONFIG', 'SYSTEM_ANNOUNCEMENTS',
        'PRIVATE_GROUP_MODERATE', 'CHILD_DATA_VIEW', 'MODERATOR_MANAGE', 'SECURITY_SETTINGS_MANAGE', 'BILLING_FINANCE_MANAGE',
        'SYSTEM_CRITICAL_SETTINGS', 'USER_DATA_EXPORT_DELETE', 'SENSITIVE_DATA_FULL_ACCESS', 'LEGAL_POLICY_MANAGE', 'ALGORITHM_AI_CONFIG',
        'SPONSORED_PRODUCT_MANAGE')
      else exists (
        select 1 from nestly.moderator_permissions mp where mp.user_id = sr.user_id and mp.permission_key = p_key)
        and (case p_key
          when 'SUPPORT_HANDLE' then 'SUPPORT_VIEW'
          when 'USER_WARN' then 'USER_VIEW'
          when 'USER_SUSPEND' then 'USER_VIEW'
          when 'USER_BAN' then 'USER_VIEW'
          when 'PRIVATE_GROUP_MODERATE' then 'REPORTS_VIEW'
          else p_key end) in (select mp2.permission_key from nestly.moderator_permissions mp2 where mp2.user_id = sr.user_id)
    end
    from nestly.staff_roles sr
    where sr.user_id = auth.uid() and sr.account_status = 'active' and (select nestly.session_guard()) in ('ok', 'must_set')
  ), false)
$$;

-- 3. Children's tracker data, as trends only (§9.2) ---------------------------------------------------------------------------------
-- The owner role reads tracker events, children and the parents' account status only while child_tracker_trends() has named its purpose
-- in this transaction (it sets the scope for its one aggregate statement and clears it), and only for a caller who holds CHILD_DATA_VIEW: a
-- caller who names the scope and then reaches another definer gains nothing without the key.
create policy tracker_events_select_child_data on nestly.tracker_events
  for select to app_owner
  using (pg_catalog.current_setting('nestly.child_data_scope', true) = 'on' and (select nestly.has_permission('CHILD_DATA_VIEW')));

create policy children_select_child_data on nestly.children
  for select to app_owner
  using (pg_catalog.current_setting('nestly.child_data_scope', true) = 'on' and (select nestly.has_permission('CHILD_DATA_VIEW')));

create policy users_select_child_data on nestly.users
  for select to app_owner
  using (pg_catalog.current_setting('nestly.child_data_scope', true) = 'on' and (select nestly.has_permission('CHILD_DATA_VIEW')));

-- the trends read events of one kind over a period
create index tracker_events_kind_occurred_at_idx on nestly.tracker_events (kind, occurred_at);

-- SECURITY DEFINER, owner app_owner, pinned search_path (approved exception, Afik 21.10.2026): the caller's staff role, session and
-- CHILD_DATA_VIEW are checked first (has_permission() reads through the TO app_owner policies scoped to auth.uid()); the three choices come
-- from closed lists; the answer is one row per cell of a fixed bucket list (a cell with no data is suppressed like any other small one, so the
-- answer does not tell which cells hold anyone); the Audit entry is written in the same call.
-- A cell is shown only when it holds at least 10 children of at least 10 families (one family's children never make a cell alone; the
-- conservative reading of "10 children per cell", OP-052). Each child counts once: the cell's value is the average over its children of each
-- child's own average, so no child's many entries outweigh the others. Only children of active accounts count.
create function nestly.child_tracker_trends(p_metric text, p_field text, p_dimension text, p_days integer)
returns table (bucket text, bucket_order integer, children integer, value numeric, is_suppressed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := nestly.caller_staff_role();
  v_min constant integer := 10;
  v_cells integer;
begin
  if v_role is null or not nestly.has_permission('CHILD_DATA_VIEW') then
    raise exception 'child_tracker_trends: not allowed' using errcode = '42501';
  end if;
  if p_metric is null or p_metric not in ('breastfeeding', 'bottle', 'sleep', 'diaper', 'medicine', 'growth', 'vaccine', 'bath')
     or p_field is null or not (p_field = 'events_per_day'
       or (p_field = 'duration_minutes' and p_metric in ('breastfeeding', 'sleep'))
       or (p_field = 'amount_ml' and p_metric = 'bottle')
       or (p_field in ('weight_kg', 'height_cm', 'head_cm') and p_metric = 'growth'))
     or p_dimension is null or p_dimension not in ('child_age', 'child_sex', 'week', 'month')
     or p_days is null or p_days not in (30, 90, 365) then
    raise exception 'child_tracker_trends: not a metric, field, dimension and period from the lists' using errcode = '22023';
  end if;

  perform pg_catalog.set_config('nestly.child_data_scope', 'on', true);
  return query
  with ev as (
    select e.child_id, e.user_id, l.local::date as day, l.local, c.sex, c.birth_date, e.occurred_at,
           case p_field
             when 'duration_minutes' then extract(epoch from e.ended_at - e.occurred_at) / 60
             when 'amount_ml' then e.amount_ml::numeric
             when 'weight_kg' then e.weight_kg
             when 'height_cm' then e.height_cm
             when 'head_cm' then e.head_cm
           end as measure
      from nestly.tracker_events e
      join nestly.children c on c.id = e.child_id
      join nestly.users u on u.id = e.user_id and u.status = 'active'
      cross join lateral (select e.occurred_at at time zone 'Asia/Jerusalem' as local) l
     where e.kind = p_metric
       and e.occurred_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)
       and e.occurred_at <= pg_catalog.now()
       and c.birth_date <= l.local::date
  ),
  celled as (
    select ev.child_id, ev.user_id, ev.day, ev.measure,
           case p_dimension
             when 'child_sex' then ev.sex
             when 'week' then pg_catalog.to_char(pg_catalog.date_trunc('week', ev.local), 'YYYY-MM-DD')
             when 'month' then pg_catalog.to_char(pg_catalog.date_trunc('month', ev.local), 'YYYY-MM')
             else (select case when a.m < 3 then '0-2' when a.m < 6 then '3-5' when a.m < 12 then '6-11' when a.m < 24 then '12-23'
                                when a.m < 60 then '24-59' else '60+' end
                     from (select nestly.child_age_months(ev.birth_date, ev.occurred_at) as m) a)
           end as cell
      from ev
     where p_field = 'events_per_day' or ev.measure is not null
  ),
  per_child as (
    select x.cell, x.child_id, x.user_id,
           case when p_field = 'events_per_day' then count(*)::numeric / count(distinct x.day) else avg(x.measure) end as v
      from celled x
     group by x.cell, x.child_id, x.user_id
  ),
  agg as (
    select pc.cell, count(*)::integer as n, count(distinct pc.user_id)::integer as families, avg(pc.v) as v
      from per_child pc
     group by pc.cell
  ),
  buckets as (
    select b.name, b.ord::integer as ord
      from pg_catalog.unnest(case p_dimension
             when 'child_age' then array['0-2', '3-5', '6-11', '12-23', '24-59', '60+']
             when 'child_sex' then array['girl', 'boy', 'unknown'] end) with ordinality as b(name, ord)
     where p_dimension in ('child_age', 'child_sex')
    union all
    select pg_catalog.to_char(w.w, case p_dimension when 'week' then 'YYYY-MM-DD' else 'YYYY-MM' end),
           (row_number() over (order by w.w))::integer
      from pg_catalog.generate_series(
             pg_catalog.date_trunc(case p_dimension when 'week' then 'week' else 'month' end,
               (pg_catalog.now() - pg_catalog.make_interval(days => p_days)) at time zone 'Asia/Jerusalem'),
             pg_catalog.date_trunc(case p_dimension when 'week' then 'week' else 'month' end, pg_catalog.now() at time zone 'Asia/Jerusalem'),
             case p_dimension when 'week' then interval '1 week' else interval '1 month' end) as w(w)
     where p_dimension in ('week', 'month')
  )
  select b.name,
         b.ord,
         case when coalesce(a.n, 0) >= v_min and coalesce(a.families, 0) >= v_min then a.n end,
         case when coalesce(a.n, 0) >= v_min and coalesce(a.families, 0) >= v_min then round(a.v, 2) end,
         not (coalesce(a.n, 0) >= v_min and coalesce(a.families, 0) >= v_min)
    from buckets b
    left join agg a on a.cell = b.name
   order by b.ord;
  get diagnostics v_cells = row_count;
  perform pg_catalog.set_config('nestly.child_data_scope', '', true);

  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, after_state)
  values (v_role, 'CHILD_DATA_VIEW', 'child_data_queried', 'child_data',
          pg_catalog.jsonb_build_object('metric', p_metric, 'field', p_field, 'dimension', p_dimension, 'days', p_days, 'cells', v_cells));
  return;
end
$$;

revoke execute on function nestly.child_tracker_trends(text, text, text, integer) from public;
grant execute on function nestly.child_tracker_trends(text, text, text, integer) to authenticated;

-- 4. The audited reveal: on Private Group content also PRIVATE_GROUP_MODERATE (§9.4, BR-040) --------------------------------------
create or replace function nestly.reveal_post_author(p_post uuid)
returns table (user_id uuid, full_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_name text;
  v_report uuid;
  v_private boolean;
  v_role text := nestly.caller_staff_role();
begin
  if v_role is null or not (nestly.has_permission('REPORTS_VIEW') and nestly.has_permission('CONTENT_MODERATE')) then
    raise exception 'reveal: not allowed' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('nestly.reveal_post', p_post::text, true);
  select r.id, r.is_private_group into v_report, v_private
    from nestly.reports r where r.post_id = p_post and r.status = 'open' order by r.created_at, r.id limit 1;
  if v_report is null then
    perform pg_catalog.set_config('nestly.reveal_post', '', true);
    raise exception 'reveal: no open report on this post' using errcode = '42501';
  end if;
  -- Private Group content as the post is now, not only as it was reported: a post this caller cannot see as a non-group or Public Group
  -- post (the RESTRICTIVE posts_group_hide hides a Private Group's post from the owner role as from the caller) counts as private.
  v_private := coalesce(v_private, true)
    or exists (select 1 from nestly.reports r where r.post_id = p_post and r.status = 'open' and r.is_private_group)
    or not exists (select 1 from nestly.posts p where p.id = p_post
                     and (p.group_id is null or exists (select 1 from nestly.groups g where g.id = p.group_id and g.privacy = 'public')));
  if v_private and not nestly.has_permission('PRIVATE_GROUP_MODERATE') then
    perform pg_catalog.set_config('nestly.reveal_post', '', true);
    raise exception 'reveal: Private Group content needs PRIVATE_GROUP_MODERATE' using errcode = '42501';
  end if;
  select pa.author_id into v_author from nestly.post_authors pa where pa.post_id = p_post;
  if v_author is null then
    perform pg_catalog.set_config('nestly.reveal_post', '', true);
    raise exception 'reveal: no anonymous author' using errcode = 'NS012';
  end if;
  perform pg_catalog.set_config('nestly.reveal_user', v_author::text, true);
  select rn.full_name into v_name from nestly.regular_names rn where rn.user_id = v_author;
  perform pg_catalog.set_config('nestly.reveal_post', '', true);
  perform pg_catalog.set_config('nestly.reveal_user', '', true);
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, after_state)
  values (v_role, case when v_private then 'PRIVATE_GROUP_MODERATE' else 'CONTENT_MODERATE' end, 'author_revealed', 'post', p_post,
          pg_catalog.jsonb_build_object('reportId', v_report, 'privateGroup', v_private));
  return query select v_author, v_name;
end
$$;

-- 5. The report's context (§9.7) --------------------------------------------------------------------------------------------------
alter table nestly.reports add column thread_post_id uuid
  constraint reports_thread_post_id_fkey references nestly.posts (id) on delete set null;
alter table nestly.reports add constraint reports_thread_post_check check (thread_post_id is null or target_kind = 'comment');
create index reports_thread_post_id_idx on nestly.reports (thread_post_id) where thread_post_id is not null;

-- the comment's post, read as the reporter (who can read the comment it reports; reports_insert_check requires it)
create function nestly.reports_thread_post()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.thread_post_id := case when new.target_kind = 'comment' and new.comment_id is not null
    then (select c.post_id from nestly.comments c where c.id = new.comment_id) end;
  return new;
end
$$;

revoke execute on function nestly.reports_thread_post() from public;

create trigger reports_thread_post
  before insert on nestly.reports
  for each row execute function nestly.reports_thread_post();

-- the comment reports already there (computed backfill, data-model "Backfills": FORCE lifted for this one statement and put back at once)
alter table nestly.reports no force row level security;
alter table nestly.comments no force row level security;
update nestly.reports r set thread_post_id = c.post_id
  from nestly.comments c where r.target_kind = 'comment' and c.id = r.comment_id;
alter table nestly.comments force row level security;
alter table nestly.reports force row level security;

-- Independent review (§9.7, Afik 21.10.2026: "a Moderator opens any page for review, views and acts per its keys, never posts"): every active
-- staff account reads every active post and comment, whatever its audience or its author's privacy (a Friends-only or followers-only post, a
-- closed profile's author, a block). Group content stays behind the RESTRICTIVE group policies: a Public Group's for everyone, a Private Group's
-- only inside an audited opening (a reported item, or the Group's page by PRIVATE_GROUP_MODERATE, group_staff_views below). Writes are unchanged:
-- staff post, comment, like and request nothing (file 100 c7).
create policy posts_select_staff_review on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.caller_staff_role()) is not null and status = 'active');

create policy comments_select_staff_review on nestly.comments
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.caller_staff_role()) is not null and status = 'active');

-- A staff review of a Private Group's page (§9.7, BR-040, NFR-PRIV-002): PRIVATE_GROUP_MODERATE (the Admin always) opens one Group for the
-- transaction of the opening only, audited (private_group_viewed). No Membership comes with it.
create table nestly.group_staff_views (
  id         uuid        not null default gen_random_uuid(),
  group_id   uuid        not null,
  viewer_id  uuid        not null default auth.uid(),
  view_xact  xid8        not null default pg_catalog.pg_current_xact_id(),
  created_at timestamptz not null default now(),
  constraint group_staff_views_pkey primary key (id),
  constraint group_staff_views_group_id_fkey foreign key (group_id) references nestly.groups (id) on delete cascade,
  constraint group_staff_views_viewer_id_fkey foreign key (viewer_id) references nestly.users (id) on delete restrict
);

create index group_staff_views_group_id_idx on nestly.group_staff_views (group_id);
create index group_staff_views_viewer_id_idx on nestly.group_staff_views (viewer_id);

alter table nestly.group_staff_views enable row level security, force row level security;

create policy group_staff_views_select_own on nestly.group_staff_views
  for select to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

create policy group_staff_views_insert_staff on nestly.group_staff_views
  for insert to authenticated
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid())
    and (select nestly.has_permission('PRIVATE_GROUP_MODERATE'))
    and exists (select 1 from nestly.groups g where g.id = group_staff_views.group_id and g.status = 'active' and g.privacy = 'private'));

revoke all on table nestly.group_staff_views from public, anon;
grant select on table nestly.group_staff_views to authenticated;
grant insert (group_id) on table nestly.group_staff_views to authenticated;

-- the audited opening of Private Group content opens its context too: the post and its thread, in that transaction only
alter table nestly.private_group_content_views add column thread_post_id uuid;

create or replace function nestly.private_group_content_views_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  select rp.post_id, rp.comment_id, rp.thread_post_id into r from nestly.reports rp where rp.id = new.report_id and rp.is_private_group;
  if not found or num_nonnulls(r.post_id, r.comment_id) <> 1 then
    raise exception 'private_group_content_views: not a report on Private Group content' using errcode = '42501';
  end if;
  new.post_id := r.post_id;
  new.comment_id := r.comment_id;
  new.thread_post_id := r.thread_post_id;
  new.view_xact := pg_catalog.pg_current_xact_id();
  return new;
end
$$;

alter policy posts_group_hide on nestly.posts
  using (group_id is null
    or exists (select 1 from nestly.groups g
                where g.id = posts.group_id and g.status = 'active'
                  and (g.privacy = 'public'
                    or exists (select 1 from nestly.group_access a where a.group_id = g.id and a.user_id = (select auth.uid()))))
    or exists (select 1 from nestly.private_group_content_views v
                where v.viewer_id = (select auth.uid()) and (v.post_id = posts.id or v.thread_post_id = posts.id)
                  and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned())
    or exists (select 1 from nestly.group_staff_views s
                where s.viewer_id = (select auth.uid()) and s.group_id = posts.group_id
                  and s.view_xact = pg_catalog.pg_current_xact_id_if_assigned()));

alter policy comments_group_hide on nestly.comments
  using (group_id is null
    or exists (select 1 from nestly.groups g
                where g.id = comments.group_id and g.status = 'active'
                  and (g.privacy = 'public'
                    or exists (select 1 from nestly.group_access a where a.group_id = g.id and a.user_id = (select auth.uid()))))
    or exists (select 1 from nestly.private_group_content_views v
                where v.viewer_id = (select auth.uid())
                  and (v.comment_id = comments.id or v.post_id = comments.post_id or v.thread_post_id = comments.post_id)
                  and v.view_xact = pg_catalog.pg_current_xact_id_if_assigned())
    or exists (select 1 from nestly.group_staff_views s
                where s.viewer_id = (select auth.uid()) and s.group_id = comments.group_id
                  and s.view_xact = pg_catalog.pg_current_xact_id_if_assigned()));

-- A staff account files no report (§9.7): only a Regular or Professional account reports.
create policy reports_insert_community on nestly.reports
  as restrictive for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.caller_account_type()) in ('regular', 'professional'));

-- 6. report_escalations (§9.9) ------------------------------------------------------------------------------------------------------
create table nestly.report_escalations (
  id           uuid        not null default gen_random_uuid(),
  report_id    uuid        not null,
  escalated_by uuid        not null default auth.uid(),
  note         text        not null,
  created_at   timestamptz not null default now(),
  constraint report_escalations_pkey primary key (id),
  constraint report_escalations_report_id_key unique (report_id),
  constraint report_escalations_note_check check (char_length(note) <= 500 and char_length(btrim(note)) >= 2),
  constraint report_escalations_report_id_fkey foreign key (report_id) references nestly.reports (id) on delete cascade,
  constraint report_escalations_escalated_by_fkey foreign key (escalated_by) references nestly.users (id) on delete restrict
);

create index report_escalations_escalated_by_idx on nestly.report_escalations (escalated_by);

alter table nestly.report_escalations enable row level security, force row level security;

create policy report_escalations_select_staff on nestly.report_escalations
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')));

-- a Moderator (never the Admin, to whom it goes) escalates an open report it can read
create policy report_escalations_insert_moderator on nestly.report_escalations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.caller_staff_role()) = 'moderator'
    and (select nestly.has_permission('REPORTS_VIEW')) and escalated_by = (select auth.uid())
    and exists (select 1 from nestly.reports r where r.id = report_escalations.report_id and r.status = 'open'));

revoke all on table nestly.report_escalations from public, anon;
grant select on table nestly.report_escalations to authenticated;
grant insert (report_id, note) on table nestly.report_escalations to authenticated;

-- 7. report_openings (§9.10) --------------------------------------------------------------------------------------------------------
create table nestly.report_openings (
  id        uuid        not null default gen_random_uuid(),
  report_id uuid        not null,
  opened_by uuid        not null default auth.uid(),
  opened_at timestamptz not null default now(),
  constraint report_openings_pkey primary key (id),
  constraint report_openings_report_opener_key unique (report_id, opened_by),
  constraint report_openings_report_id_fkey foreign key (report_id) references nestly.reports (id) on delete cascade,
  constraint report_openings_opened_by_fkey foreign key (opened_by) references nestly.users (id) on delete restrict
);

create index report_openings_opened_by_idx on nestly.report_openings (opened_by);

alter table nestly.report_openings enable row level security, force row level security;

create policy report_openings_select_staff on nestly.report_openings
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')));

create policy report_openings_insert_staff on nestly.report_openings
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('REPORTS_VIEW')) and opened_by = (select auth.uid())
    and exists (select 1 from nestly.reports r where r.id = report_openings.report_id and r.status = 'open'));

revoke all on table nestly.report_openings from public, anon;
grant select on table nestly.report_openings to authenticated;
grant insert (report_id) on table nestly.report_openings to authenticated;

-- 8. The audit trigger, replaced with the escalation branch and the invitation on moderator_joined --------------------------------
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
  elsif tg_table_name in ('professional_reviews', 'professional_articles') then
    -- FR-MOD-001, FR-SERV-011, FR-PRO-003 (I11 follow-ups): a reported review or article hidden, removed or restored by CONTENT_MODERATE.
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'moderation' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'professional_reviews' then 'review' else 'article' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'moderation');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'moderation');
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
  elsif tg_table_name = 'moderator_invitations' then
    -- FR-ADMIN-004: the Admin invites or revokes an invitation (its redemption is audited on staff_roles). Never the code or its hash.
    if tg_op = 'INSERT' then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invited';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_after := pg_catalog.jsonb_build_object('note', v_new ->> 'note', 'expiresAt', v_new ->> 'expires_at');
    elsif v_new ->> 'revoked_at' is not null and v_old ->> 'revoked_at' is null then
      v_key := 'MODERATOR_MANAGE';
      v_action := 'moderator_invitation_revoked';
      v_kind := 'moderator_invitation';
      v_target := (v_new ->> 'id')::uuid;
      v_before := pg_catalog.jsonb_build_object('note', v_old ->> 'note');
    else
      raise exception 'audit_trigger: only an invitation issued or revoked is audited here' using errcode = '42501';
    end if;
  elsif tg_table_name = 'staff_roles' then
    -- FR-ADMIN-004: a Moderator created from an invitation (the new staff role exists now, so the entry carries it as the actor).
    v_action := 'moderator_joined';
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    -- I14 completion (Afik 21.10.2026, decisions-in-force.md §9.1): the use of the invitation is recorded with it
    v_after := pg_catalog.jsonb_build_object('invitationId', (select i.id from nestly.moderator_invitations i where i.code_hash = nestly.moderator_invite_hash()));
  elsif tg_table_name = 'system_announcements' then
    -- FR-ADMIN-008, AC-049: created, edited, published or removed. Before/After carry the status, the title and the body's length.
    v_key := 'SYSTEM_ANNOUNCEMENTS';
    v_action := case
      when tg_op = 'INSERT' then 'announcement_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'announcement_' || (v_new ->> 'status')
      else 'announcement_edited' end;
    v_kind := 'announcement';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'bodyChars', pg_catalog.char_length(v_old ->> 'body')) end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'),
      'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body');
  elsif tg_table_name = 'private_group_content_views' then
    -- NFR-PRIV-002, BR-040 (I10): a staff member opened reported Private Group content (that post or comment with its post and comments, the
    -- report's context since the I14 completion: withThread; never the rest of the Group).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_content_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('targetKind', case when v_new ->> 'post_id' is not null then 'post' else 'comment' end,
      'withThread', true);
  elsif tg_table_name = 'marketplace_listings' then
    -- §3.2 MARKETPLACE_MODERATE (I12): a listing hidden or restored (the trigger fires only when is_hidden moves). Never its title.
    v_key := 'MARKETPLACE_MODERATE';
    v_action := case when (v_new ->> 'is_hidden')::boolean then 'listing_hidden' else 'listing_restored' end;
    v_kind := 'listing';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('hidden', v_old -> 'is_hidden');
    v_after := pg_catalog.jsonb_build_object('hidden', v_new -> 'is_hidden', 'status', v_new ->> 'status', 'category', v_new ->> 'category');
  elsif tg_table_name = 'sponsored_products' then
    -- FR-ADMIN-009, AC-058 (I12): a Sponsored Product created, edited, published, paused or removed (Admin Only key).
    v_key := 'SPONSORED_PRODUCT_MANAGE';
    v_action := case
      when tg_op = 'INSERT' then 'sponsored_product_created'
      when v_new ->> 'status' is distinct from v_old ->> 'status' then 'sponsored_product_' || (v_new ->> 'status')
      else 'sponsored_product_edited' end;
    v_kind := 'sponsored_product';
    v_target := (v_new ->> 'id')::uuid;
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'sponsor', v_old ->> 'sponsor_name', 'category', v_old ->> 'category', 'linkUrl', v_old ->> 'link_url') end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'sponsor', v_new ->> 'sponsor_name',
      'category', v_new ->> 'category', 'linkUrl', v_new ->> 'link_url',
      'descriptionChanged', tg_op = 'UPDATE' and v_new ->> 'description' is distinct from v_old ->> 'description');
  elsif tg_table_name = 'group_staff_views' then
    -- I14 completion (§9.7, BR-040): a staff member opened a Private Group's page for review (its content, in that transaction only).
    v_key := 'PRIVATE_GROUP_MODERATE';
    v_action := 'private_group_viewed';
    v_kind := 'group';
    v_target := (v_new ->> 'group_id')::uuid;
  elsif tg_table_name = 'report_escalations' then
    -- I14 completion (Afik 21.10.2026, §9.9): a Moderator escalated a report to the Admin; the note is the entry's reason.
    v_key := 'REPORTS_VIEW';
    v_action := 'report_escalated';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
    v_reason := v_new ->> 'note';
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger report_escalations_audit
  after insert on nestly.report_escalations
  for each row execute function nestly.audit_trigger();

create trigger group_staff_views_audit
  after insert on nestly.group_staff_views
  for each row execute function nestly.audit_trigger();

-- 9. Comments ----------------------------------------------------------------------------------------------------------------------
comment on function nestly.audit_trigger() is 'SECURITY DEFINER (approved exception, rule 18), owner app_owner, pinned search_path. After a permission change, a report-reason change, a report closed, a moderation move, an enforcement, an Admin''s creation, edit, publication or hiding of a status guide, a staff decision on an image or a suspicion marked on one, a Support request''s status change, a Support reply or internal note, a staff view of a reported chat message, a Moderator invitation issued or revoked, a Moderator joining with one (with the invitation''s id), a System Announcement created, edited, published or removed, a staff view of reported Private Group content, a Marketplace listing hidden or restored, a Sponsored Product created, edited, published, paused or removed, a reported review or article hidden, removed or restored, or a report escalated to the Admin: appends the Audit entry for the caller''s staff role, with the reason (nestly.audit_reason; the note of an escalation) and Before/After. A caller who is no staff member leaves none.';
comment on function nestly.has_permission(text) is 'SECURITY INVOKER, caller only (rule 16): true for an active Admin on any known key (CHILD_DATA_VIEW included); for a Moderator only when the key is assigned and its companion key is too (SUPPORT_HANDLE needs SUPPORT_VIEW; USER_WARN, USER_SUSPEND and USER_BAN need USER_VIEW; PRIVATE_GROUP_MODERATE needs REPORTS_VIEW; CHILD_DATA_VIEW needs none and is not part of ANALYTICS_VIEW). Admin-only keys are never true for a Moderator. Deny by default.';
comment on column nestly.moderator_invitations.expires_at is 'Forty-eight hours after issue (Afik 21.10.2026); an expired invitation cannot be redeemed.';
comment on function nestly.child_tracker_trends(text, text, text, integer) is 'SECURITY DEFINER (approved exception, Afik 21.10.2026, decisions-in-force.md §9.2), owner app_owner, pinned search_path. Children''s tracker data as general trends only, for CHILD_DATA_VIEW (the Admin always; not part of ANALYTICS_VIEW) with a valid session: metric (a tracker kind) x field (events_per_day; duration_minutes for breastfeeding and sleep; amount_ml for bottle; weight_kg, height_cm, head_cm for growth) x dimension (child_age, child_sex, week, month) over the last 30, 90 or 365 days, each from a closed list (else 22023). One row per cell of a fixed bucket list: the number of children and one average (of each child''s own average), both NULL and is_suppressed unless the cell holds at least 10 children of at least 10 families (OP-052). Only children of active accounts count. Never a row, an id, a name, a birth date, a medicine''s or vaccine''s name or a note. Appends child_data_queried to the Audit Log in the same call. Reads through tracker_events_select_child_data, children_select_child_data and users_select_child_data, opened only while it has set nestly.child_data_scope.';
comment on policy tracker_events_select_child_data on nestly.tracker_events is 'Approved exception (§9.2): the owner role reads tracker events only while child_tracker_trends() has set nestly.child_data_scope in this transaction, for a caller holding CHILD_DATA_VIEW; no runtime role is a member of app_owner.';
comment on policy children_select_child_data on nestly.children is 'Approved exception (§9.2): the owner role reads children (for their age and sex) only while child_tracker_trends() has set nestly.child_data_scope, for a caller holding CHILD_DATA_VIEW.';
comment on policy users_select_child_data on nestly.users is 'Approved exception (§9.2): the owner role reads accounts (only to count the children of active ones) only while child_tracker_trends() has set nestly.child_data_scope, for a caller holding CHILD_DATA_VIEW.';
comment on function nestly.reveal_post_author(uuid) is 'SECURITY DEFINER (approved exception, rule 19), owner app_owner, pinned search_path. Returns the real author of an anonymous post to a caller with REPORTS_VIEW and CONTENT_MODERATE (and PRIVATE_GROUP_MODERATE when the post is Private Group content) and a valid session, only while an OPEN report on that post exists, and appends author_revealed (with the report id and whether it is Private Group content) in the same call.';
comment on column nestly.reports.thread_post_id is 'For a comment report: the comment''s post, set at report time (reports_thread_post, as the reporter). Opens the report''s context to REPORTS_VIEW (the post and its thread).';
comment on function nestly.reports_thread_post() is 'BEFORE INSERT, SECURITY INVOKER. A comment report records the comment''s post (read as the reporter); every other report records none.';
comment on column nestly.private_group_content_views.thread_post_id is 'For a comment report: the comment''s post (from the report; set by the trigger). The opening shows the post and its thread too.';
comment on function nestly.private_group_content_views_target() is 'BEFORE INSERT, SECURITY INVOKER. The view names the reported post or comment, and a comment''s post (its thread), from the report (read under the caller''s RLS); only a report on Private Group content.';
comment on policy posts_group_hide on nestly.posts is 'RESTRICTIVE (I10): a group post is readable while its Group is active and Public or the caller is a member (AC-036/037, NFR-PRIV-002, ERR-017); to staff only inside the transaction of an audited view of a report on it or on a comment in it (ERR-024; the context, I14 completion); never on the analytics screen (rows, not columns).';
comment on policy comments_group_hide on nestly.comments is 'RESTRICTIVE (I10): a group comment is readable as its post''s Group allows; to staff only inside an audited view of a report on it, on its post or on a comment of its post (the thread).';
comment on policy reports_insert_community on nestly.reports is 'RESTRICTIVE (I14 completion, §9.7): only a Regular or Professional account files a report; a staff account acts, it does not report.';
comment on table nestly.report_escalations is 'I14 completion (Afik 21.10.2026, §9.9): a Moderator escalated an open report to the Admin, with a note (2-500). Once per report; REPORTS_VIEW reads them; audited (report_escalated). No UPDATE or DELETE; they go with their report.';
comment on column nestly.report_escalations.id is 'The escalation.';
comment on column nestly.report_escalations.report_id is 'The report escalated (on the screens: the oldest open report on its target).';
comment on column nestly.report_escalations.escalated_by is 'The Moderator (default auth.uid()).';
comment on column nestly.report_escalations.note is 'What the Moderator asks of the Admin: at most 500 characters, at least 2 that are not blank. Staff text: never shown to a community user.';
comment on column nestly.report_escalations.created_at is 'Database clock.';
comment on policy report_escalations_select_staff on nestly.report_escalations is 'REPORTS_VIEW (the Admin always) reads the escalations.';
comment on policy report_escalations_insert_moderator on nestly.report_escalations is 'A Moderator with REPORTS_VIEW escalates an open report it can read, in its own name.';
comment on policy posts_select_staff_review on nestly.posts is 'I14 completion (§9.7): every active staff account reads every active post for independent review, whatever its audience; group posts stay behind posts_group_hide. Staff write nothing.';
comment on policy comments_select_staff_review on nestly.comments is 'I14 completion (§9.7): every active staff account reads every active comment for independent review; group comments stay behind comments_group_hide.';
comment on table nestly.group_staff_views is 'I14 completion (§9.7, BR-040, NFR-PRIV-002): a staff review of a Private Group''s page, one row per opening, by PRIVATE_GROUP_MODERATE (the Admin always), audited (private_group_viewed). Only inside that transaction is the Group''s content readable to them. No Membership, no UPDATE or DELETE.';
comment on column nestly.group_staff_views.id is 'Row id.';
comment on column nestly.group_staff_views.group_id is 'The Private Group opened.';
comment on column nestly.group_staff_views.viewer_id is 'The staff member (default auth.uid()).';
comment on column nestly.group_staff_views.view_xact is 'The viewing transaction (the database''s default; not granted): the content is readable only inside it.';
comment on column nestly.group_staff_views.created_at is 'Database clock.';
comment on policy group_staff_views_select_own on nestly.group_staff_views is 'A staff member reads its own openings.';
comment on policy group_staff_views_insert_staff on nestly.group_staff_views is 'PRIVATE_GROUP_MODERATE (the Admin always) opens an active Private Group, in its own name.';
comment on table nestly.report_openings is 'I14 completion (Afik 21.10.2026, §9.10): who opened a report on the admin screens, and when (the Admin''s handling status). One row per report and staff member; REPORTS_VIEW writes its own and reads all. Not audited. They go with their report.';
comment on column nestly.report_openings.id is 'Row id.';
comment on column nestly.report_openings.report_id is 'The report opened.';
comment on column nestly.report_openings.opened_by is 'The staff member (default auth.uid()).';
comment on column nestly.report_openings.opened_at is 'When they first opened it (the database clock).';
comment on policy report_openings_select_staff on nestly.report_openings is 'REPORTS_VIEW (the Admin always) reads who opened which report.';
comment on policy report_openings_insert_staff on nestly.report_openings is 'REPORTS_VIEW records its own opening of an open report.';
