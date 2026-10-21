-- =====================================================================================================================
-- Usage events, Professional view counts and the promotion frequency cap — I13 follow-up, migration only.
--
-- SRS: §13.3 (usage events), OP-039 (minimal usage events: Afik 21.10.2026, decisions-in-force.md §10 item 8), FR-PRO-002 (Profile Views and
--      Organic Reach of the Professional's own account), FR-ADMIN-010 / AC-071 (the usage domains of Admin Analytics), BR-057, BR-058,
--      VAL-032 · FR-ALG-007 (a configurable frequency cap), BR-059 (the configuration is versioned) · BR-053, AC-068 (no child, tracker,
--      chat, Support or private-group data in any of these rows).
--
-- usage_events          One counter per account, kind and Israel-time day: daily_login (once a day), profile_view (a profile opened) and
--                       post_view (a post shown). No target, no content, no IP; nothing finer than the day is readable. Only an active
--                       Regular or Professional is recorded (a staff or inactive caller's event is dropped silently: recording never fails
--                       a page). The account reads its own rows (the repeat of the day adds one to them); ANALYTICS_VIEW reads kind, day
--                       and count only (never the account), on the analytics screen (nestly.analytics_view). Retention 90 days (built per
--                       the ⭐ default, OP row in the SRS): purge_usage_events(), run by the daily retention job as app_jobs.
-- professional_views    The organic views of a Professional's profile and posts (FR-PRO-002 Profile Views, Organic Reach), in the shape of the
--                       paid events (promotion_events): one row per Professional, viewer, kind and day, `times` counting repeats (up to 100
--                       a day). The viewer writes its own row (rule 12: the row is the viewer's; rule 17 does not apply); the Professional
--                       counts its rows and never learns who (viewer_id and the row id are never granted for SELECT; the day is the finest
--                       time). Its own view, a staff or inactive caller and a view across a user block are dropped silently (no error,
--                       so a block is not revealed). ANALYTICS_VIEW reads them on the analytics screen. Retention 90 days, the same purge.
-- algorithm_configurations  a new surface, promotions (P-ALG-07, FR-ALG-007): promo_daily_cap (the frequency cap: impressions of one
--                       promotion to one viewer in one day, 1 to 100; v1 3), promo_units_per_page (promoted units on one page of a surface,
--                       1 to 3; v1 1) and promo_feed_position (the organic posts before the promoted post in the feed, 1 to 20; v1 3).
--                       Versioned and append-only like the feed (the guard is unchanged); the feed's columns of a promotions row repeat
--                       feed v1 because they are NOT NULL and are never read for that surface. The three promo columns are set exactly on
--                       a promotions row.
-- promotion_events_guard  replaced: an impression is counted up to the active promotions version's promo_daily_cap a day (was 100; 100
--                       when no version is active). Everything else is the text of 20261022900000 unchanged.
--
-- No new SECURITY DEFINER. New TO app_jobs policies (rule 6): usage_events and professional_views, read and delete rows older than 90 days.
-- audit_trigger() unchanged (no staff write). The Promotions domain of Admin Analytics reads the promotion tables through the existing
-- BILLING_FINANCE_MANAGE policies (Admin Only): no new read of promotions or payments.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261023600000_usage_events.down.sql (refuses once a usage event or a professional view exists).
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
  if coalesce((select nestly.caller_account_type()), '') not in ('regular', 'professional') then
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
  if coalesce((select nestly.caller_account_type()), '') not in ('regular', 'professional') or new.professional_id = v_uid
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

-- 4. The retention purge (rule 6): usage events and professional views older than 90 days (Israel-time days). --------------
create function nestly.purge_usage_events()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cutoff date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date - 90;
  n integer;
  m integer;
begin
  delete from nestly.usage_events where occurred_on < v_cutoff;
  get diagnostics n = row_count;
  delete from nestly.professional_views where occurred_on < v_cutoff;
  get diagnostics m = row_count;
  return n + m;
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
  using (occurred_on < (now() at time zone 'Asia/Jerusalem')::date - 90);

create policy professional_views_delete_jobs on nestly.professional_views
  for delete to app_jobs
  using (occurred_on < (now() at time zone 'Asia/Jerusalem')::date - 90);

-- 6. The promotion surface of the configuration (P-ALG-07, FR-ALG-007, BR-059) ----------------------------------------------
alter table nestly.algorithm_configurations drop constraint algorithm_configurations_surface_check;
alter table nestly.algorithm_configurations
  add constraint algorithm_configurations_surface_check check (surface in ('regular_feed', 'promotions'));
alter table nestly.algorithm_configurations
  add column promo_daily_cap integer
    constraint algorithm_configurations_promo_daily_cap_check check (promo_daily_cap between 1 and 100),
  add column promo_units_per_page integer
    constraint algorithm_configurations_promo_units_per_page_check check (promo_units_per_page between 1 and 3),
  add column promo_feed_position integer
    constraint algorithm_configurations_promo_feed_position_check check (promo_feed_position between 1 and 20),
  add constraint algorithm_configurations_promotions_check check (
    num_nonnulls(promo_daily_cap, promo_units_per_page, promo_feed_position) = case when surface = 'promotions' then 3 else 0 end);

-- v1 of the promotions surface. The table has no insert policy (a change is a migration): FORCE is lifted for the one insert and put
-- back at once, in this transaction. The feed columns repeat feed v1 (NOT NULL; never read for this surface).
alter table nestly.algorithm_configurations no force row level security;
insert into nestly.algorithm_configurations
  (surface, version, is_active, w_fresh, half_life_hours, w_friend, w_quality, quality_cap, w_stage, scored_window_days, diversity_window,
   max_same_creator_in_window, max_anonymous_in_window, page_size, w_intent, intent_half_life_hours,
   promo_daily_cap, promo_units_per_page, promo_feed_position, created_by, reason)
select 'promotions', 1, true, c.w_fresh, c.half_life_hours, c.w_friend, c.w_quality, c.quality_cap, c.w_stage, c.scored_window_days,
       c.diversity_window, c.max_same_creator_in_window, c.max_anonymous_in_window, c.page_size, c.w_intent, c.intent_half_life_hours,
       3, 1, 3, 'migration 20261023600000', 'I13: frequency cap 3 impressions per viewer per promotion per day; one promoted unit per page; the promoted post after the third organic post (built per the ⭐ default, awaiting Afik)'
  from nestly.algorithm_configurations c
 where c.surface = 'regular_feed' and c.version = 1;
do $$
begin
  if not exists (select 1 from nestly.algorithm_configurations where surface = 'promotions' and version = 1 and is_active) then
    raise exception 'the promotions configuration v1 was not written (no regular_feed v1 to copy the feed columns from)';
  end if;
end
$$;
alter table nestly.algorithm_configurations force row level security;

-- 7. The frequency cap in the paid events: an impression counts up to the active promo_daily_cap a day ---------------------
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
    when 'impression' then coalesce((select c.promo_daily_cap from nestly.algorithm_configurations c where c.surface = 'promotions' and c.is_active), 100)
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

-- 8. Comments ---------------------------------------------------------------------------------------------------------------
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
  'SRS FR-PRO-002 (Profile Views, Organic Reach): the organic views of a Professional''s profile and of its posts — one row per Professional, viewer, kind and Israel-time day, times counting repeats (up to 100). The viewer writes its own row; the Professional counts its rows and never reads viewer_id or the row id (BR-057, VAL-032). Its own view, staff, an inactive caller and a view across a user block are dropped silently. ANALYTICS_VIEW on the analytics screen. Kept 90 days (purge_usage_events).';
comment on column nestly.professional_views.id is 'The row id. Not granted for SELECT (it would follow one viewer''s row).';
comment on column nestly.professional_views.professional_id is 'The Professional whose profile or post was viewed (cascade with its profile).';
comment on column nestly.professional_views.viewer_id is 'Who viewed (default auth.uid()). Never granted for SELECT: used only by the viewer''s own policy and the uniqueness of the day''s row.';
comment on column nestly.professional_views.kind is 'profile_view (its profile opened) or post_view (one of its posts shown).';
comment on column nestly.professional_views.occurred_on is 'The day in Israel time, the database clock: the finest time stored.';
comment on column nestly.professional_views.times is 'How many times that day, up to 100 (professional_views_guard); a repeat adds exactly one.';
comment on constraint professional_views_once_key on nestly.professional_views is 'One row per Professional, viewer, kind and day (a repeat adds to times): the row count is the reach.';
comment on index nestly.professional_views_viewer_idx is 'The viewer FK.';
comment on index nestly.professional_views_occurred_on_idx is 'The analytics days and the 90-day purge.';

comment on function nestly.usage_events_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. Only an active Regular or Professional is recorded (anyone else: dropped silently), its own counter of today (Israel time): a repeat adds one to the day''s row instead of a second row (daily_login once, the others up to 1000 a day, then nothing more is counted; advisory lock 8115 per account and kind); an update only adds one to today''s row within the limit. Passes untouched outside a client transaction.';
comment on function nestly.professional_views_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. The viewer''s own row of today (Israel time) for a Professional and kind: a repeat adds one (up to 100 a day; advisory lock 8116 per Professional and viewer). Its own view, a caller that is not an active Regular or Professional and a view across a user block are dropped silently. An update only adds one to today''s row. Passes untouched outside a client transaction.';
comment on function nestly.purge_usage_events() is 'Deletes usage events and professional views older than 90 days (Israel-time days); returns the number. SECURITY INVOKER, EXECUTE app_jobs only; called by the daily retention job.';
comment on function nestly.promotion_events_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. Only a Regular or Professional, on a running promotion of another that it can read (target still eligible). An insert is the caller''s own on today''s date (Israel time): impressions and clicks add one to the day''s row instead of a second row, up to the active promo_daily_cap (FR-ALG-007 frequency cap; 100 when none) / 20 a day (then nothing more is counted); a follow counts once per promotion and viewer and a chat start once a day, only with a real follow / conversation of the caller created in this transaction and a click of the caller within 7 calendar days (advisory lock 8114). An update only adds one to today''s row within the same limits.';
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
comment on policy professional_views_select_jobs on nestly.professional_views is 'The retention job reads rows older than 90 days.';
comment on policy professional_views_delete_jobs on nestly.professional_views is 'The retention job deletes rows older than 90 days.';

comment on column nestly.algorithm_configurations.surface is 'The surface the settings belong to: regular_feed (the feed ranking) or promotions (the frequency cap and the placement of promoted units).';
comment on column nestly.algorithm_configurations.promo_daily_cap is 'FR-ALG-007 frequency cap: impressions of one promotion to one viewer in one Israel day, 1 to 100 (promotion_events_guard counts no more). Set exactly on a promotions row.';
comment on column nestly.algorithm_configurations.promo_units_per_page is 'FR-ALG-007: promoted units on one page of a surface (Directory, Marketplace, feed), 1 to 3. Set exactly on a promotions row.';
comment on column nestly.algorithm_configurations.promo_feed_position is 'FR-ALG-007: the organic posts shown before the promoted post on a feed page, 1 to 20. Set exactly on a promotions row.';
comment on constraint algorithm_configurations_surface_check on nestly.algorithm_configurations is 'The surfaces that exist: regular_feed and promotions; extended by a migration.';
comment on constraint algorithm_configurations_promotions_check on nestly.algorithm_configurations is 'The three promo columns are set exactly on a promotions row; a promotions row''s feed columns are never read.';
