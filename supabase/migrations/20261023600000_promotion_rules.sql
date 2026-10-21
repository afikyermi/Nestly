-- =====================================================================================================================
-- Promotion rules and usage events — I13 follow-up, migration only (Afik 21.10.2026 evening, decisions-in-force.md §11.1–11.6).
--
-- SRS: §13.3 (usage events), OP-039 (minimal usage events: Afik 21.10.2026, decisions-in-force.md §10 item 8), FR-PRO-002 (Profile Views and
--      Organic Reach of the Professional's own account), FR-ADMIN-010 / AC-071 (the usage domains of Admin Analytics), BR-057, BR-058,
--      VAL-032 · FR-ALG-007 (frequency cap and placement of promoted units), BR-059 (the settings are versioned) · FR-SERV-010, FR-MKT-004,
--      BR-047 (a promotion stopped by staff) · NFR-SEC-007, AC-098 (payment records) · BR-053, AC-068 (no child, tracker, chat, Support or
--      private-group data in any of these rows) · §13.4 (retention).
--
-- usage_events          One counter per account, kind and Israel-time day: daily_login (once a day), profile_view (a profile opened) and
--                       post_view (a post shown). No target, no content, no IP; nothing finer than the day is readable. Only an active
--                       Regular or Professional is recorded (a staff or inactive caller's event is dropped silently: recording never fails
--                       a page). The account reads its own rows; ANALYTICS_VIEW reads kind, day and count only (never the account), on the
--                       analytics screen (nestly.analytics_view). Retention 90 days (built per the ⭐ default, OP row in the SRS):
--                       purge_usage_events(), EXECUTE app_jobs, run by the daily retention job (I9).
-- professional_views    The organic views of a Professional's profile and posts (FR-PRO-002 Profile Views, Organic Reach), in the shape of the
--                       paid events (promotion_events): one row per Professional, viewer, kind and day, `times` counting repeats (up to 100
--                       a day). The viewer writes its own row; the Professional counts its rows and never learns who (viewer_id and the row
--                       id are never granted for SELECT). Its own view, a staff or inactive caller and a view across a user block are dropped
--                       silently. ANALYTICS_VIEW reads them on the analytics screen. Kept 12 months, like the paid events it is compared with.
-- promotion_settings    §11.2, FR-ALG-007, BR-059: the versioned settings of promoted units, append-only (the newest version is in force):
--                       the frequency cap (impressions of one promotion to one viewer a day), promoted units per Directory page, and the
--                       feed's interleaving — a promoted post after every N organic posts, N from feed_gap_min (few posts) to feed_gap_max
--                       (many), by the number of posts of the last 48 hours between feed_low_posts and feed_high_posts (gradual). Only
--                       BILLING_FINANCE_MANAGE (the Admin) adds a version, with a reason; every addition is audited with the previous values.
--                       v1: cap 3, one unit per Directory page, 4 to 7 organic posts, 20 and 200 posts in 48 hours (the thresholds built per
--                       the ⭐ default). The Marketplace has no cap (§11.3): every promoted listing that matches the search and filters is
--                       shown at the top.
-- promotions            §11.1: an Admin, or a Moderator with the target's moderation key (CONTENT_MODERATE for a Professional's profile or post,
--                       MARKETPLACE_MODERATE for a listing; built per the ⭐ default), stops a running promotion — with a reason, audited
--                       (promotion_stopped), no refund. stopped_by records who stopped it (owner or staff), so the promoter sees "הקידום
--                       הופסק". Those staff read the promotions of their key (the Admin's list); payments stay BILLING_FINANCE_MANAGE's.
-- promotion_payments    §11.6: a payment record outlives the account, without identifying details: payer_id becomes NULL when the account is
--                       deleted; the amount, the date, the promotion type (plan and kind) and the Professional's field (copied at payment)
--                       stay.
-- promotion_monthly_summaries  §11.4: one row per promotion and month (impressions, clicks, follows, chat starts), kept forever; it outlives
--                       the promotion anonymously (promotion_id NULL; kind and field stay). Written only by purge_promotion_data()
--                       (EXECUTE app_jobs), which first sums every completed month and then deletes paid events and professional views
--                       older than 12 months (whole months). Run by the daily retention job (I9); not called here.
-- promotion_events_guard  replaced: an impression is counted up to the newest promotion_settings daily_cap a day (was 100; 100 when no
--                       version exists). Everything else is the text of 20261022900000 unchanged.
-- audit_trigger()       replaced (the body of 20261023500000 otherwise): promotion_stopped and promotion_settings_changed.
--
-- No new SECURITY DEFINER. New TO app_jobs policies (rule 6): the retention reads and deletes, and the summary writes.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261023600000_promotion_rules.down.sql (refuses once a usage event, a professional view, a settings version beyond v1,
-- a summary, a staff stop or an anonymised payment exists).
-- =====================================================================================================================

-- 1. usage_events -----------------------------------------------------------------------------------------------------------
create table nestly.usage_events (
  user_id     uuid        not null default auth.uid()
    constraint usage_events_user_id_fkey references nestly.users (id) on delete cascade,
  kind        text        not null
    constraint usage_events_kind_check check (kind in ('daily_login', 'profile_view', 'post_view')),
  occurred_on date        not null default ((now() at time zone 'Asia/Jerusalem')::date),
  times       integer     not null default 1
    constraint usage_events_times_check check (times between 1 and 1000),
  constraint usage_events_pkey primary key (user_id, kind, occurred_on),
  constraint usage_events_daily_login_check check (kind <> 'daily_login' or times = 1)
);

create index usage_events_occurred_on_idx on nestly.usage_events (occurred_on);

-- 2. professional_views -----------------------------------------------------------------------------------------------------
create table nestly.professional_views (
  id              uuid    not null default gen_random_uuid()
    constraint professional_views_pkey primary key,
  professional_id uuid    not null
    constraint professional_views_professional_id_fkey references nestly.professional_profiles (user_id) on delete cascade,
  viewer_id       uuid    not null default auth.uid()
    constraint professional_views_viewer_id_fkey references nestly.users (id) on delete cascade,
  kind            text    not null
    constraint professional_views_kind_check check (kind in ('profile_view', 'post_view')),
  occurred_on     date    not null default ((now() at time zone 'Asia/Jerusalem')::date),
  times           integer not null default 1
    constraint professional_views_times_check check (times between 1 and 100),
  constraint professional_views_once_key unique (professional_id, viewer_id, kind, occurred_on)
);

create index professional_views_viewer_idx on nestly.professional_views (viewer_id, occurred_on);
create index professional_views_occurred_on_idx on nestly.professional_views (occurred_on);

-- 3. Triggers (SECURITY INVOKER; auth.uid() is the actor) -------------------------------------------------------------------

-- usage_events: the caller's own counter of today. A repeat the same day adds one to the row (daily_login stays 1; profile_view and
-- post_view up to 1000 a day, then nothing more is counted) and inserts none. A caller that is not an active Regular or Professional is
-- dropped silently. Serialised per account and kind (advisory lock 8115). user_id is not readable (column privilege), so no statement
-- here names it: the caller reaches its own row through its own policy (a recorded caller is never staff, so the ANALYTICS_VIEW read
-- never applies to it).
create function nestly.usage_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
  v_uid uuid := (select auth.uid());
  v_cap integer;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  v_cap := case new.kind when 'daily_login' then 1 else 1000 end;
  if tg_op = 'UPDATE' then
    if (new.user_id, new.kind, new.occurred_on) is distinct from (old.user_id, old.kind, old.occurred_on)
       or new.times <> old.times + 1 or old.occurred_on <> v_today or new.times > v_cap then
      raise exception 'usage_events: only today''s count goes up, by one, within its limit' using errcode = '42501';
    end if;
    return new;
  end if;
  if not (select nestly.is_active_account()) or coalesce((select nestly.caller_account_type()), '') not in ('regular', 'professional') then
    return null;
  end if;
  if new.user_id is distinct from v_uid then
    raise exception 'usage_events: the caller''s own event only' using errcode = '42501';
  end if;
  new.times := 1;
  new.occurred_on := v_today;
  perform pg_catalog.pg_advisory_xact_lock(8115, pg_catalog.hashtext(v_uid::text || ':' || new.kind));
  if exists (select 1 from nestly.usage_events e where e.kind = new.kind and e.occurred_on = v_today) then
    update nestly.usage_events e set times = e.times + 1 where e.kind = new.kind and e.occurred_on = v_today and e.times < v_cap;
    return null;
  end if;
  return new;
end
$$;

-- professional_views: the viewer's own row of today for that Professional and kind; a repeat adds one (up to 100 a day) and inserts none.
-- Its own view, a caller that is not an active Regular or Professional, and a view across a user block are dropped silently. Serialised
-- per Professional and viewer (advisory lock 8116). viewer_id is not readable: the caller reaches its own rows through its own policy
-- (it is never the Professional, whose own policy reads professional_id = the caller).
create function nestly.professional_views_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
  v_uid uuid := (select auth.uid());
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.professional_id, new.viewer_id, new.kind, new.occurred_on)
       is distinct from (old.id, old.professional_id, old.viewer_id, old.kind, old.occurred_on)
       or new.times <> old.times + 1 or old.occurred_on <> v_today or new.times > 100 then
      raise exception 'professional_views: only today''s count goes up, by one, within its limit' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.kind is distinct from 'profile_view' and new.kind is distinct from 'post_view' then
    raise exception 'professional_views: a profile or a post view only' using errcode = '23514';
  end if;
  if not (select nestly.is_active_account()) or coalesce((select nestly.caller_account_type()), '') not in ('regular', 'professional') or new.professional_id = v_uid
     or new.professional_id = any (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])) then
    return null;
  end if;
  if new.viewer_id is distinct from v_uid then
    raise exception 'professional_views: the caller''s own view only' using errcode = '42501';
  end if;
  new.times := 1;
  new.occurred_on := v_today;
  perform pg_catalog.pg_advisory_xact_lock(8116, pg_catalog.hashtext(new.professional_id::text || ':' || v_uid::text));
  if exists (select 1 from nestly.professional_views v
              where v.professional_id = new.professional_id and v.kind = new.kind and v.occurred_on = v_today) then
    update nestly.professional_views v set times = v.times + 1
     where v.professional_id = new.professional_id and v.kind = new.kind and v.occurred_on = v_today and v.times < 100;
    return null;
  end if;
  return new;
end
$$;

revoke execute on function nestly.usage_events_guard() from public;
revoke execute on function nestly.professional_views_guard() from public;

create trigger usage_events_guard before insert or update on nestly.usage_events
  for each row execute function nestly.usage_events_guard();
create trigger professional_views_guard before insert or update on nestly.professional_views
  for each row execute function nestly.professional_views_guard();

-- 4. The retention purge of usage events (rule 6): rows older than 90 days (Israel-time days). Professional views go with the paid events
--    (section 9, 12 months). -----------------------------------------------------------------------------------------------
create function nestly.purge_usage_events()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cutoff date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date - 90;
  n integer;
begin
  delete from nestly.usage_events where occurred_on < v_cutoff;
  get diagnostics n = row_count;
  return n;
end
$$;

revoke execute on function nestly.purge_usage_events() from public;
grant execute on function nestly.purge_usage_events() to app_jobs;

-- 5. RLS, grants and policies -------------------------------------------------------------------------------------------------
alter table nestly.usage_events enable row level security, force row level security;
alter table nestly.professional_views enable row level security, force row level security;

revoke all on table nestly.usage_events, nestly.professional_views from public, anon, authenticated;

-- user_id is never granted for SELECT: a counter is read without the account it belongs to.
grant select (kind, occurred_on, times) on table nestly.usage_events to authenticated;
grant insert (kind) on table nestly.usage_events to authenticated;
grant update (times) on table nestly.usage_events to authenticated;
-- viewer_id and the row id (which would follow one viewer's row) are never granted for SELECT: the Professional counts and never learns who.
grant select (professional_id, kind, occurred_on, times) on table nestly.professional_views to authenticated;
grant insert (professional_id, kind) on table nestly.professional_views to authenticated;
grant update (times) on table nestly.professional_views to authenticated;

grant select, delete on table nestly.usage_events, nestly.professional_views to app_jobs;

create policy usage_events_select_own on nestly.usage_events
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy usage_events_select_analytics on nestly.usage_events
  for select to authenticated
  using (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.is_active_account()) and (select nestly.analytics_reader()));

create policy usage_events_insert_own on nestly.usage_events
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid())
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

create policy usage_events_update_own on nestly.usage_events
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy usage_events_select_jobs on nestly.usage_events
  for select to app_jobs
  using (occurred_on < (now() at time zone 'Asia/Jerusalem')::date - 90);

create policy usage_events_delete_jobs on nestly.usage_events
  for delete to app_jobs
  using (occurred_on < (now() at time zone 'Asia/Jerusalem')::date - 90);

create policy professional_views_select_own on nestly.professional_views
  for select to authenticated
  using ((select nestly.is_active_account()) and professional_id = (select auth.uid()));

create policy professional_views_select_viewer on nestly.professional_views
  for select to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

create policy professional_views_select_analytics on nestly.professional_views
  for select to authenticated
  using (pg_catalog.current_setting('nestly.analytics_view', true) = 'on' and (select nestly.is_active_account()) and (select nestly.analytics_reader()));

create policy professional_views_insert_viewer on nestly.professional_views
  for insert to authenticated
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid())
    and (select nestly.caller_account_type()) in ('regular', 'professional')
    and professional_id <> (select auth.uid())
    and professional_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])));

create policy professional_views_update_viewer on nestly.professional_views
  for update to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

create policy professional_views_select_jobs on nestly.professional_views
  for select to app_jobs
  using (occurred_on < (pg_catalog.date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '12 months')::date);

create policy professional_views_delete_jobs on nestly.professional_views
  for delete to app_jobs
  using (occurred_on < (pg_catalog.date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '12 months')::date);

-- 6. promotion_settings (§11.2, FR-ALG-007, BR-059) ---------------------------------------------------------------------------
create table nestly.promotion_settings (
  version                  integer     not null
    constraint promotion_settings_pkey primary key
    constraint promotion_settings_version_check check (version > 0),
  daily_cap                integer     not null
    constraint promotion_settings_daily_cap_check check (daily_cap between 1 and 100),
  directory_units_per_page integer     not null
    constraint promotion_settings_directory_units_per_page_check check (directory_units_per_page between 1 and 3),
  feed_gap_min             integer     not null
    constraint promotion_settings_feed_gap_min_check check (feed_gap_min between 1 and 20),
  feed_gap_max             integer     not null,
  feed_low_posts           integer     not null
    constraint promotion_settings_feed_low_posts_check check (feed_low_posts between 0 and 100000),
  feed_high_posts          integer     not null,
  reason                   text        not null
    constraint promotion_settings_reason_check check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500),
  created_by               uuid        default auth.uid()
    constraint promotion_settings_created_by_fkey references nestly.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  constraint promotion_settings_feed_gap_check check (feed_gap_max between feed_gap_min and 20),
  constraint promotion_settings_feed_posts_check check (feed_high_posts > feed_low_posts and feed_high_posts <= 100000)
);

-- A new version: the database numbers it (the newest + 1, serialised by advisory lock 8117) and stamps who and when.
create function nestly.promotion_settings_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8117, 0);
  new.version := coalesce((select max(s.version) from nestly.promotion_settings s), 0) + 1;
  new.created_by := (select auth.uid());
  new.created_at := pg_catalog.now();
  return new;
end
$$;

revoke execute on function nestly.promotion_settings_prepare() from public;

create trigger promotion_settings_prepare before insert on nestly.promotion_settings
  for each row execute function nestly.promotion_settings_prepare();

alter table nestly.promotion_settings enable row level security, force row level security;
revoke all on table nestly.promotion_settings from public, anon, authenticated;
-- created_by is not granted: who changed the settings is the Audit Log's (AUDIT_LOG_VIEW).
grant select (version, daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason, created_at)
  on table nestly.promotion_settings to authenticated;
grant insert (daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason)
  on table nestly.promotion_settings to authenticated;

create policy promotion_settings_select_reader on nestly.promotion_settings
  for select to authenticated
  using ((select nestly.is_active_account()));

create policy promotion_settings_insert_finance on nestly.promotion_settings
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('BILLING_FINANCE_MANAGE')));

-- v1 (FORCE is lifted for the one insert, in this transaction; the prepare trigger passes the owner role).
alter table nestly.promotion_settings no force row level security;
insert into nestly.promotion_settings
  (version, daily_cap, directory_units_per_page, feed_gap_min, feed_gap_max, feed_low_posts, feed_high_posts, reason, created_by)
values (1, 3, 1, 4, 7, 20, 200,
  'v1 (migration 20261023600000): cap 3 impressions per viewer per promotion per day; one promoted unit per Directory page; a promoted post after 4 to 7 organic posts by the posts of the last 48 hours (20 and 200: built per the ⭐ default, awaiting Afik)', null);
alter table nestly.promotion_settings force row level security;

-- 7. promotions: stopped by the owner or by staff (§11.1) -------------------------------------------------------------------
alter table nestly.promotions add column stopped_by text
  constraint promotions_stopped_by_check check (stopped_by in ('owner', 'staff'));
alter table nestly.promotions no force row level security;
update nestly.promotions set stopped_by = 'owner' where status = 'stopped';
alter table nestly.promotions force row level security;
alter table nestly.promotions add constraint promotions_stopped_by_status_check check ((stopped_by is not null) = (status = 'stopped'));

-- The owner stops its own running promotion; an Admin or a Moderator with the target's moderation key stops anyone's, with a reason
-- (nestly.audit_reason, written to the Audit Log). Either way active -> stopped only, stopped_at the database clock; nothing else changes.
-- A cascade or the owner role passes.
create or replace function nestly.promotions_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.id, new.owner_id, new.target_kind, new.post_id, new.listing_id, new.plan_key, new.payment_id, new.starts_at, new.ends_at, new.created_at)
     is distinct from (old.id, old.owner_id, old.target_kind, old.post_id, old.listing_id, old.plan_key, old.payment_id, old.starts_at, old.ends_at, old.created_at) then
    raise exception 'promotions: immutable column' using errcode = '42501';
  end if;
  if not (old.status = 'active' and new.status = 'stopped' and old.ends_at > pg_catalog.now()) then
    raise exception 'promotions: only a running promotion is stopped' using errcode = '23514';
  end if;
  new.stopped_at := pg_catalog.now();
  if old.owner_id = (select auth.uid()) then
    new.stopped_by := 'owner';
  else
    if not (select nestly.has_permission(case old.target_kind when 'listing' then 'MARKETPLACE_MODERATE' else 'CONTENT_MODERATE' end)) then
      raise exception 'promotions: only the owner or staff with the target''s moderation key stops a promotion' using errcode = '42501';
    end if;
    if nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '') is null then
      raise exception 'promotions: a staff stop needs a reason' using errcode = '23514';
    end if;
    new.stopped_by := 'staff';
  end if;
  return new;
end
$$;

grant select (stopped_by) on table nestly.promotions to authenticated;

create policy promotions_select_staff on nestly.promotions
  for select to authenticated
  using ((select nestly.is_active_account())
    and case target_kind when 'listing' then (select nestly.has_permission('MARKETPLACE_MODERATE'))
                         else (select nestly.has_permission('CONTENT_MODERATE')) end);

create policy promotions_update_staff on nestly.promotions
  for update to authenticated
  using ((select nestly.is_active_account())
    and case target_kind when 'listing' then (select nestly.has_permission('MARKETPLACE_MODERATE'))
                         else (select nestly.has_permission('CONTENT_MODERATE')) end)
  with check ((select nestly.is_active_account())
    and case target_kind when 'listing' then (select nestly.has_permission('MARKETPLACE_MODERATE'))
                         else (select nestly.has_permission('CONTENT_MODERATE')) end);

-- 8. promotion_payments: kept without identity when the account goes (§11.6) ------------------------------------------------
alter table nestly.promotion_payments add column professional_field text
  constraint promotion_payments_professional_field_check check (professional_field is null or pg_catalog.char_length(professional_field) between 1 and 60);
alter table nestly.promotion_payments alter column payer_id drop not null;
alter table nestly.promotion_payments drop constraint promotion_payments_payer_id_fkey;
alter table nestly.promotion_payments add constraint promotion_payments_payer_id_fkey
  foreign key (payer_id) references nestly.users (id) on delete set null;
grant select (professional_field) on table nestly.promotion_payments to authenticated;

-- promotion_payments: the database copies the plan's kind and sample price and, for a Professional's plan, the payer's field; the client
-- names the plan only. An inactive plan is not sold.
create or replace function nestly.promotion_payments_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan record;
begin
  select p.target_kind, p.sample_price_ils, p.is_active into v_plan from nestly.promotion_plans p where p.key = new.plan_key;
  if not found or not v_plan.is_active then
    raise exception 'promotion_payments: no such plan' using errcode = '23503';
  end if;
  new.target_kind := v_plan.target_kind;
  new.amount_ils := v_plan.sample_price_ils;
  new.currency := 'ILS';
  new.provider := 'simulated';
  new.is_simulated := true;
  new.status := 'succeeded';
  new.created_at := pg_catalog.now();
  new.professional_field := case when v_plan.target_kind in ('profile', 'post')
    then (select pr.field from nestly.professional_profiles pr where pr.user_id = new.payer_id) end;
  return new;
end
$$;

-- 9. promotion_monthly_summaries and the 12-month purge (§11.4, rule 6) ----------------------------------------------------
create table nestly.promotion_monthly_summaries (
  id                 uuid        not null default gen_random_uuid()
    constraint promotion_monthly_summaries_pkey primary key,
  promotion_id       uuid
    constraint promotion_monthly_summaries_promotion_id_fkey references nestly.promotions (id) on delete set null,
  target_kind        text        not null
    constraint promotion_monthly_summaries_target_kind_check check (target_kind in ('profile', 'post', 'listing')),
  professional_field text
    constraint promotion_monthly_summaries_professional_field_check check (professional_field is null or pg_catalog.char_length(professional_field) between 1 and 60),
  month              date        not null
    constraint promotion_monthly_summaries_month_check check (month = pg_catalog.date_trunc('month', month)::date),
  impressions        integer     not null default 0
    constraint promotion_monthly_summaries_impressions_check check (impressions >= 0),
  clicks             integer     not null default 0
    constraint promotion_monthly_summaries_clicks_check check (clicks >= 0),
  follows            integer     not null default 0
    constraint promotion_monthly_summaries_follows_check check (follows >= 0),
  chat_starts        integer     not null default 0
    constraint promotion_monthly_summaries_chat_starts_check check (chat_starts >= 0),
  updated_at         timestamptz not null default now(),
  constraint promotion_monthly_summaries_once_key unique (promotion_id, month)
);

create index promotion_monthly_summaries_month_idx on nestly.promotion_monthly_summaries (month);

alter table nestly.promotion_monthly_summaries enable row level security, force row level security;
revoke all on table nestly.promotion_monthly_summaries from public, anon, authenticated;
grant select (promotion_id, target_kind, professional_field, month, impressions, clicks, follows, chat_starts)
  on table nestly.promotion_monthly_summaries to authenticated;
grant select, insert on table nestly.promotion_monthly_summaries to app_jobs;
grant select (id, promotion_id, kind, occurred_on, times), delete on table nestly.promotion_events to app_jobs;
grant select (id, target_kind, payment_id) on table nestly.promotions to app_jobs;
grant select (id, professional_field) on table nestly.promotion_payments to app_jobs;

create policy promotion_monthly_summaries_select_owner on nestly.promotion_monthly_summaries
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.promotions p where p.id = promotion_monthly_summaries.promotion_id and p.owner_id = (select auth.uid())));

create policy promotion_monthly_summaries_select_finance on nestly.promotion_monthly_summaries
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('BILLING_FINANCE_MANAGE')));

create policy promotion_monthly_summaries_select_jobs on nestly.promotion_monthly_summaries
  for select to app_jobs using (true);
create policy promotion_monthly_summaries_insert_jobs on nestly.promotion_monthly_summaries
  for insert to app_jobs with check (true);

-- The job reads every paid event (to sum it), every promotion's kind and payment, and every payment's field; it deletes paid events
-- older than 12 months only.
create policy promotion_events_select_jobs on nestly.promotion_events
  for select to app_jobs using (true);
create policy promotion_events_delete_jobs on nestly.promotion_events
  for delete to app_jobs
  using (occurred_on < (pg_catalog.date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '12 months')::date);
create policy promotions_select_jobs on nestly.promotions
  for select to app_jobs using (true);
create policy promotion_payments_select_jobs on nestly.promotion_payments
  for select to app_jobs using (true);

-- Sums every completed month of paid events that has no summary yet (a completed month's events never change: an event is counted only on
-- its own day), then deletes the paid events and professional views of the months more than 12 months back; a rerun changes nothing.
-- Returns the number of rows deleted. A promotion deleted before its month is summed (its target or account deleted) takes that month's
-- events with it: the summary covers completed months only, and the payment record stays (§11.6).
create function nestly.purge_promotion_data()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_month date := pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
  v_cutoff date := (pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Jerusalem') - interval '12 months')::date;
  n integer;
  m integer;
begin
  insert into nestly.promotion_monthly_summaries as s
    (promotion_id, target_kind, professional_field, month, impressions, clicks, follows, chat_starts, updated_at)
  select e.promotion_id, p.target_kind, pp.professional_field, pg_catalog.date_trunc('month', e.occurred_on)::date,
         coalesce(sum(e.times) filter (where e.kind = 'impression'), 0)::integer,
         coalesce(sum(e.times) filter (where e.kind = 'click'), 0)::integer,
         coalesce(sum(e.times) filter (where e.kind = 'follow'), 0)::integer,
         coalesce(sum(e.times) filter (where e.kind = 'chat_start'), 0)::integer,
         pg_catalog.now()
    from nestly.promotion_events e
    join nestly.promotions p on p.id = e.promotion_id
    left join nestly.promotion_payments pp on pp.id = p.payment_id
   where e.occurred_on < v_month
     and not exists (select 1 from nestly.promotion_monthly_summaries s0
                      where s0.promotion_id = e.promotion_id and s0.month = pg_catalog.date_trunc('month', e.occurred_on)::date)
   group by e.promotion_id, p.target_kind, pp.professional_field, pg_catalog.date_trunc('month', e.occurred_on)
  on conflict (promotion_id, month) do nothing;
  delete from nestly.promotion_events where occurred_on < v_cutoff;
  get diagnostics n = row_count;
  delete from nestly.professional_views where occurred_on < v_cutoff;
  get diagnostics m = row_count;
  return n + m;
end
$$;

revoke execute on function nestly.purge_promotion_data() from public;
grant execute on function nestly.purge_promotion_data() to app_jobs;

-- 10. The frequency cap in the paid events: an impression counts up to the newest promotion_settings daily_cap a day ---------------------
-- The text of 20261022900000_monetization.sql, with v_cap for an impression read from the configuration (every active account reads it).
create or replace function nestly.promotion_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
  v_uid uuid := (select auth.uid());
  v_promo record;
  v_cap integer;
begin
  if tg_op = 'UPDATE' and current_user <> 'authenticated' then
    return new;
  end if;
  if coalesce((select nestly.caller_account_type()), '') not in ('regular', 'professional') then
    raise exception 'promotion_events: only a Regular or a Professional records an event' using errcode = '42501';
  end if;
  select p.owner_id, p.target_kind, p.listing_id into v_promo
    from nestly.promotions p
   where p.id = new.promotion_id and p.owner_id <> v_uid
     and p.status = 'active' and p.starts_at <= pg_catalog.now() and p.ends_at > pg_catalog.now();
  if not found then
    raise exception 'promotion_events: not a running promotion of another that the caller can see' using errcode = '42501';
  end if;
  v_cap := case new.kind
    when 'impression' then coalesce((select s.daily_cap from nestly.promotion_settings s order by s.version desc limit 1), 100)
    when 'click' then 20 else 1 end;
  if tg_op = 'UPDATE' then
    if (new.id, new.promotion_id, new.viewer_id, new.kind, new.occurred_on, new.created_at)
       is distinct from (old.id, old.promotion_id, old.viewer_id, old.kind, old.occurred_on, old.created_at)
       or new.times <> old.times + 1 or old.occurred_on <> v_today or new.times > v_cap then
      raise exception 'promotion_events: only today''s count goes up, by one, within its limit' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.now();
    return new;
  end if;
  if new.viewer_id is distinct from v_uid then
    raise exception 'promotion_events: the caller''s own event only' using errcode = '42501';
  end if;
  new.times := 1;
  new.occurred_on := v_today;
  new.created_at := pg_catalog.now();
  new.updated_at := pg_catalog.now();
  if new.kind in ('follow', 'chat_start') then
    if not exists (select 1 from nestly.promotion_events e
                    where e.promotion_id = new.promotion_id and e.kind = 'click' and e.occurred_on >= v_today - 6) then
      raise exception 'promotion_events: no click to attribute' using errcode = '42501';
    end if;
    -- a follow counts once per promotion and viewer, ever (unfollowing and following again is not a new paid follow)
    if new.kind = 'follow' and exists (select 1 from nestly.promotion_events e where e.promotion_id = new.promotion_id and e.kind = 'follow') then
      return null;
    end if;
    if new.kind = 'follow' and not exists (
        select 1 from nestly.professional_follows f
         where f.professional_id = v_promo.owner_id and f.created_at = pg_catalog.now()) then
      raise exception 'promotion_events: no follow in this transaction' using errcode = '42501';
    end if;
    if new.kind = 'chat_start' and not exists (
        select 1 from nestly.conversations c
         where c.created_at = pg_catalog.now()
           and ((c.user_a = v_uid and c.user_b = v_promo.owner_id) or (c.user_b = v_uid and c.user_a = v_promo.owner_id))
           and (case when v_promo.target_kind = 'listing' then c.context = 'marketplace' and c.listing_id = v_promo.listing_id
                     else c.context = 'professional' end)) then
      raise exception 'promotion_events: no conversation in this transaction' using errcode = '42501';
    end if;
  end if;
  -- a repeat the same day (serialised per promotion and caller; advisory lock 8114): impressions and clicks add one to the day's row up to
  -- their limit; a follow or a chat start counts once a day. Either way no second row is inserted.
  perform pg_catalog.pg_advisory_xact_lock(8114, pg_catalog.hashtext(new.promotion_id::text || ':' || v_uid::text));
  if exists (select 1 from nestly.promotion_events e
              where e.promotion_id = new.promotion_id and e.kind = new.kind and e.occurred_on = v_today) then
    update nestly.promotion_events e set times = e.times + 1
     where e.promotion_id = new.promotion_id and e.kind = new.kind and e.occurred_on = v_today and e.times < v_cap;
    return null;
  end if;
  return new;
end
$$;


-- 11. The audit trigger, replaced with the promotion branches (the body of 20261023500000 otherwise) --------------------------
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
    -- M6: a suspicion of child abuse marked on an image (staff only; the uploader is never told). I14 completion B (Afik 21.10.2026): a staff
    -- decision on a block-list match, confirmed or not_abuse (a false positive, whose listed hashes leave the list: media_hash_removed).
    v_key := 'CONTENT_MODERATE';
    v_action := case when tg_op = 'UPDATE' and v_new ->> 'match_decision' is distinct from v_old ->> 'match_decision'
                     then 'media_hash_' || (v_new ->> 'match_decision') else 'media_suspected' end;
    v_kind := 'media';
    v_target := (v_new ->> 'media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('isChild', v_new -> 'is_child', 'purgeAfter', v_new ->> 'purge_after', 'hashDecision', v_new ->> 'match_decision');
  elsif tg_table_name = 'suspected_image_fingerprints' then
    -- I14 completion B (Afik 21.10.2026): a hash left the block list after staff decided a match was not abuse (a false positive). Never the hash.
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_hash_removed';
    v_kind := 'media';
    v_target := (v_old ->> 'source_media_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('reason', 'not_abuse');
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
    -- I14 completion B (§10.7): the audience too
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('status', v_old ->> 'status', 'title', v_old ->> 'title',
      'bodyChars', pg_catalog.char_length(v_old ->> 'body'), 'audience', v_old ->> 'audience', 'audienceStage', v_old ->> 'audience_stage') end;
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'title', v_new ->> 'title', 'bodyChars', pg_catalog.char_length(v_new ->> 'body'),
      'bodyChanged', tg_op = 'UPDATE' and v_new ->> 'body' is distinct from v_old ->> 'body', 'audience', v_new ->> 'audience',
      'audienceStage', v_new ->> 'audience_stage');
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
  elsif tg_table_name = 'enforcement_records' then
    -- I14 completion B (FR-MOD-003, §10.4): reported content deleted by a justified decision (its enforcement record). Never the text.
    v_key := case v_new ->> 'target_kind' when 'listing' then 'MARKETPLACE_MODERATE' else 'CONTENT_MODERATE' end;
    v_action := 'content_deleted';
    v_kind := v_new ->> 'target_kind';
    v_target := (v_new ->> 'target_id')::uuid;
    v_after := pg_catalog.jsonb_build_object('rule', v_new ->> 'rule', 'reportId', v_new ->> 'report_id', 'named', v_new ->> 'user_id' is not null);
  elsif tg_table_name = 'reported_comment_views' then
    -- I14 completion B (Afik 21.10.2026): a staff member opened a reported comment (every opening, also after the report closed).
    v_key := 'REPORTS_VIEW';
    v_action := 'reported_comment_viewed';
    v_kind := 'report';
    v_target := (v_new ->> 'report_id')::uuid;
  elsif tg_table_name = 'promotions' then
    -- I13 (Afik 21.10.2026, §11.1): an Admin or a Moderator with the target's moderation key stopped a running promotion; no refund.
    v_key := case v_new ->> 'target_kind' when 'listing' then 'MARKETPLACE_MODERATE' else 'CONTENT_MODERATE' end;
    v_action := 'promotion_stopped';
    v_kind := 'promotion';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'targetKind', v_new ->> 'target_kind', 'planKey', v_new ->> 'plan_key');
  elsif tg_table_name = 'promotion_settings' then
    -- I13 (Afik 21.10.2026, §11.2; Admin Only key): a new version of the promoted units' settings, with the version it replaces.
    v_key := 'BILLING_FINANCE_MANAGE';
    v_action := 'promotion_settings_changed';
    v_kind := 'promotion_settings';
    v_reason := v_new ->> 'reason';
    select pg_catalog.to_jsonb(s) - 'reason' - 'created_by' - 'created_at' into v_before
      from nestly.promotion_settings s where s.version < (v_new ->> 'version')::integer order by s.version desc limit 1;
    v_after := v_new - 'reason' - 'created_by' - 'created_at';
  elsif tg_table_name = 'profile_staff_views' then
    -- I14 completion B (BR-081, §10.3): a staff member opened a Regular account's profile (shown in full, never tracker data). No key: every
    -- staff account opens profiles for review.
    v_action := 'staff_profile_viewed';
    v_kind := 'user';
    v_target := (v_new ->> 'target_id')::uuid;
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;


revoke execute on function nestly.audit_trigger() from public;

create trigger promotions_staff_stop_audit
  after update of status on nestly.promotions
  for each row when (new.stopped_by = 'staff' and old.status = 'active' and new.status = 'stopped')
  execute function nestly.audit_trigger();

create trigger promotion_settings_audit
  after insert on nestly.promotion_settings
  for each row execute function nestly.audit_trigger();

-- 12. Comments ---------------------------------------------------------------------------------------------------------------
comment on table nestly.usage_events is
  'SRS §13.3 usage events (OP-039, Afik 21.10.2026): one counter per account, kind and Israel-time day — daily_login, profile_view, post_view. No target, no content, no IP. Only an active Regular or Professional is recorded (staff never; their event is dropped silently). The account reads its own rows; ANALYTICS_VIEW reads kind, day and count on the analytics screen. Kept 90 days (purge_usage_events).';
comment on column nestly.usage_events.user_id is 'The account (default auth.uid()). Never granted for SELECT: a counter is read without whose it is.';
comment on column nestly.usage_events.kind is 'daily_login (once a day), profile_view (a profile opened) or post_view (a post shown). Nothing else is recorded.';
comment on column nestly.usage_events.occurred_on is 'The day in Israel time, the database clock: the finest time stored.';
comment on column nestly.usage_events.times is 'How many that day: daily_login 1; profile_view and post_view up to 1000 (usage_events_guard); a repeat adds exactly one.';
comment on constraint usage_events_pkey on nestly.usage_events is 'One row per account, kind and day (a repeat adds to times).';
comment on constraint usage_events_daily_login_check on nestly.usage_events is 'A daily login counts once a day.';
comment on index nestly.usage_events_occurred_on_idx is 'The analytics days and the 90-day purge.';

comment on table nestly.professional_views is
  'SRS FR-PRO-002 (Profile Views, Organic Reach): the organic views of a Professional''s profile and of its posts — one row per Professional, viewer, kind and Israel-time day, times counting repeats (up to 100). The viewer writes its own row; the Professional counts its rows and never reads viewer_id or the row id (BR-057, VAL-032). Its own view, staff, an inactive caller and a view across a user block are dropped silently. ANALYTICS_VIEW on the analytics screen. Kept 12 months (purge_promotion_data, §11.4).';
comment on column nestly.professional_views.id is 'The row id. Not granted for SELECT (it would follow one viewer''s row).';
comment on column nestly.professional_views.professional_id is 'The Professional whose profile or post was viewed (cascade with its profile).';
comment on column nestly.professional_views.viewer_id is 'Who viewed (default auth.uid()). Never granted for SELECT: used only by the viewer''s own policy and the uniqueness of the day''s row.';
comment on column nestly.professional_views.kind is 'profile_view (its profile opened) or post_view (one of its posts shown).';
comment on column nestly.professional_views.occurred_on is 'The day in Israel time, the database clock: the finest time stored.';
comment on column nestly.professional_views.times is 'How many times that day, up to 100 (professional_views_guard); a repeat adds exactly one.';
comment on constraint professional_views_once_key on nestly.professional_views is 'One row per Professional, viewer, kind and day (a repeat adds to times): the row count is the reach.';
comment on index nestly.professional_views_viewer_idx is 'The viewer FK.';
comment on index nestly.professional_views_occurred_on_idx is 'The analytics days and the 12-month purge.';

comment on function nestly.usage_events_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. Only an active Regular or Professional is recorded (anyone else: dropped silently), its own counter of today (Israel time): a repeat adds one to the day''s row instead of a second row (daily_login once, the others up to 1000 a day, then nothing more is counted; advisory lock 8115 per account and kind); an update only adds one to today''s row within the limit. Passes untouched outside a client transaction.';
comment on function nestly.professional_views_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. The viewer''s own row of today (Israel time) for a Professional and kind: a repeat adds one (up to 100 a day; advisory lock 8116 per Professional and viewer). Its own view, a caller that is not an active Regular or Professional and a view across a user block are dropped silently. An update only adds one to today''s row. Passes untouched outside a client transaction.';
comment on function nestly.purge_usage_events() is 'Deletes usage events older than 90 days (Israel-time days); returns the number. SECURITY INVOKER, EXECUTE app_jobs only; called by the daily retention job (I9).';
comment on function nestly.promotion_events_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. Only a Regular or Professional, on a running promotion of another that it can read (target still eligible). An insert is the caller''s own on today''s date (Israel time): impressions and clicks add one to the day''s row instead of a second row, up to the newest promotion_settings daily_cap (FR-ALG-007 frequency cap; 100 when none) / 20 a day (then nothing more is counted); a follow counts once per promotion and viewer and a chat start once a day, only with a real follow / conversation of the caller created in this transaction and a click of the caller within 7 calendar days (advisory lock 8114). An update only adds one to today''s row within the same limits.';
comment on trigger usage_events_guard on nestly.usage_events is 'OP-039: one counter per account, kind and day; own rows only; staff never recorded.';
comment on trigger professional_views_guard on nestly.professional_views is 'FR-PRO-002: one counter per Professional, viewer, kind and day; the viewer''s own row.';

comment on policy usage_events_select_own on nestly.usage_events is 'The account reads its own counters (the day''s repeat adds to them).';
comment on policy usage_events_select_analytics on nestly.usage_events is 'ANALYTICS_VIEW on the analytics screen (nestly.analytics_view): kind, day and count; the account is not granted (BR-058).';
comment on policy usage_events_insert_own on nestly.usage_events is 'An active Regular or Professional records its own event; staff are never recorded.';
comment on policy usage_events_update_own on nestly.usage_events is 'The account adds one to its own row of today (the guard allows nothing else).';
comment on policy usage_events_select_jobs on nestly.usage_events is 'The retention job reads rows older than 90 days.';
comment on policy usage_events_delete_jobs on nestly.usage_events is 'The retention job deletes rows older than 90 days.';
comment on policy professional_views_select_own on nestly.professional_views is 'The Professional counts the views of its own profile and posts (FR-PRO-002, VAL-032); viewer_id is not granted.';
comment on policy professional_views_select_viewer on nestly.professional_views is 'The viewer reads its own rows (the day''s repeat adds to them).';
comment on policy professional_views_select_analytics on nestly.professional_views is 'ANALYTICS_VIEW on the analytics screen (nestly.analytics_view); viewer_id is not granted.';
comment on policy professional_views_insert_viewer on nestly.professional_views is 'An active Regular or Professional records its own view of another Professional it has no user block with.';
comment on policy professional_views_update_viewer on nestly.professional_views is 'The viewer adds one to its own row of today (the guard allows nothing else).';
comment on policy professional_views_select_jobs on nestly.professional_views is 'The retention job reads rows of the months more than 12 months back (§11.4).';
comment on policy professional_views_delete_jobs on nestly.professional_views is 'The retention job deletes rows of the months more than 12 months back (§11.4).';

comment on table nestly.promotion_settings is
  'I13 (Afik 21.10.2026, §11.2; FR-ALG-007, BR-059): the versioned settings of promoted units, append-only; the newest version is in force. The frequency cap, promoted units per Directory page, and the feed interleaving: a promoted post after every N organic posts, N from feed_gap_min (few posts in the last 48 hours, at or below feed_low_posts) to feed_gap_max (many, at or above feed_high_posts), gradual between. The Marketplace has no cap (§11.3). Only BILLING_FINANCE_MANAGE adds a version, with a reason; audited with the previous values. Every active account reads it.';
comment on column nestly.promotion_settings.version is 'The version, numbered by the database (the newest + 1); the newest is in force.';
comment on column nestly.promotion_settings.daily_cap is 'FR-ALG-007 frequency cap: impressions of one promotion to one viewer in one Israel day, 1 to 100 (promotion_events_guard counts no more).';
comment on column nestly.promotion_settings.directory_units_per_page is 'FR-ALG-007: promoted Professionals on one page of the Directory, 1 to 3.';
comment on column nestly.promotion_settings.feed_gap_min is '§11.2: the organic posts between two promoted posts when the last 48 hours had few posts (at or below feed_low_posts).';
comment on column nestly.promotion_settings.feed_gap_max is '§11.2: the organic posts between two promoted posts when the last 48 hours had many posts (at or above feed_high_posts); at least feed_gap_min, at most 20.';
comment on column nestly.promotion_settings.feed_low_posts is '§11.2: the "few posts" threshold, posts of the last 48 hours.';
comment on column nestly.promotion_settings.feed_high_posts is '§11.2: the "many posts" threshold, posts of the last 48 hours; above feed_low_posts.';
comment on column nestly.promotion_settings.reason is 'Why the version was added (1 to 500 characters); the Audit entry''s reason.';
comment on column nestly.promotion_settings.created_by is 'Who added it (the database''s auth.uid(); NULL for v1 and once the account is gone). Not granted for SELECT: the Audit Log names the actor.';
comment on column nestly.promotion_settings.created_at is 'When it was added (the database clock).';
comment on function nestly.promotion_settings_prepare() is 'BEFORE INSERT, SECURITY INVOKER. Numbers the new version (the newest + 1; advisory lock 8117) and stamps who and when.';
comment on trigger promotion_settings_audit on nestly.promotion_settings is '§11.2: every new version is audited (promotion_settings_changed) with the version it replaces.';
comment on policy promotion_settings_select_reader on nestly.promotion_settings is 'Every active account reads the settings (the surfaces place promoted units by them).';
comment on policy promotion_settings_insert_finance on nestly.promotion_settings is 'BILLING_FINANCE_MANAGE (Admin Only, §3.2: settings of promotion) adds a version.';

comment on column nestly.promotions.stopped_by is '§11.1: who stopped it — owner (the promoter) or staff (an Admin or a Moderator with the target''s moderation key; audited, no refund). NULL while not stopped.';
comment on constraint promotions_stopped_by_status_check on nestly.promotions is 'A stopped promotion says who stopped it; a running one does not.';
comment on function nestly.promotions_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. Only a running promotion is stopped (active -> stopped, stopped_at the database clock); every other column is immutable. The owner stops its own (stopped_by owner); staff with CONTENT_MODERATE (a profile or post) or MARKETPLACE_MODERATE (a listing) stop anyone''s with a reason in nestly.audit_reason (stopped_by staff; 42501 without the key, 23514 without a reason).';
comment on trigger promotions_staff_stop_audit on nestly.promotions is '§11.1: a staff stop is audited (promotion_stopped, with the reason).';
comment on policy promotions_select_staff on nestly.promotions is '§11.1: CONTENT_MODERATE reads every promotion of a Professional''s profile or post, MARKETPLACE_MODERATE every promotion of a listing (the staff list); the Admin holds both.';
comment on policy promotions_update_staff on nestly.promotions is '§11.1: the same staff stop a running promotion (status only; the guard allows nothing else and needs a reason).';
comment on policy promotions_select_jobs on nestly.promotions is '§11.4: the retention job reads every promotion''s kind and payment (to sum its paid events).';

comment on column nestly.promotion_payments.payer_id is 'The payer (default auth.uid()). NULL once the account is deleted: the record stays without identity (§11.6).';
comment on column nestly.promotion_payments.professional_field is '§11.6: the Professional''s field at payment (a profile or post plan), copied by the database; NULL for a listing. Kept when the account goes.';
comment on function nestly.promotion_payments_prepare() is 'BEFORE INSERT, SECURITY INVOKER. Copies the active plan''s target kind and sample price into the payment, and for a profile or post plan the payer''s Professional field; fixes the simulated provider, status and clock (23503 for no such plan).';
comment on policy promotion_payments_select_jobs on nestly.promotion_payments is '§11.4: the retention job reads every payment''s Professional field (granted id and professional_field only).';

comment on table nestly.promotion_monthly_summaries is
  'I13 (Afik 21.10.2026, §11.4): one row per promotion and month — impressions, clicks, follows and chat starts — kept forever. promotion_id becomes NULL when the promotion goes (the account deleted); the kind and the Professional''s field stay, never the owner. Written only by purge_promotion_data() (app_jobs). The promotion''s owner and BILLING_FINANCE_MANAGE read it.';
comment on column nestly.promotion_monthly_summaries.month is 'The month (its first day, Israel time).';
comment on constraint promotion_monthly_summaries_once_key on nestly.promotion_monthly_summaries is 'One row per promotion and month (written once, when the month is complete).';
comment on index nestly.promotion_monthly_summaries_month_idx is 'Summaries by month (the Admin view).';
comment on policy promotion_monthly_summaries_select_owner on nestly.promotion_monthly_summaries is 'The promotion''s owner reads its months.';
comment on policy promotion_monthly_summaries_select_finance on nestly.promotion_monthly_summaries is 'BILLING_FINANCE_MANAGE (Admin Only) reads every summary.';
comment on policy promotion_monthly_summaries_select_jobs on nestly.promotion_monthly_summaries is '§11.4: the retention job reads which months are summed already.';
comment on policy promotion_monthly_summaries_insert_jobs on nestly.promotion_monthly_summaries is '§11.4: the retention job writes a month''s summary.';
comment on policy promotion_events_select_jobs on nestly.promotion_events is '§11.4: the retention job reads every paid event to sum it (viewer_id not granted).';
comment on policy promotion_events_delete_jobs on nestly.promotion_events is '§11.4: the retention job deletes paid events of the months more than 12 months back.';
comment on function nestly.purge_promotion_data() is '§11.4: sums every completed month of paid events not yet summed into promotion_monthly_summaries (a rerun changes nothing), then deletes paid events and professional views of the months more than 12 months back; returns the number deleted. SECURITY INVOKER, EXECUTE app_jobs only; run by the daily retention job (I9).';
