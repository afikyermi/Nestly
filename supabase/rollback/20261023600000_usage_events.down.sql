-- =====================================================================================================================
-- Down script for supabase/migrations/20261023600000_usage_events.sql (I13 follow-up: usage events, professional views, the promotions
-- configuration surface). Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     only while no usage event and no professional view exists (refuses otherwise: data would be lost). The promotions
--           configuration row is configuration: it goes with the columns.
-- Restores: promotion_events_guard() as 20261022900000 wrote it (impressions up to 100 a day), the surface check of algorithm_configurations
--           (regular_feed only) and its comment. The two tables, the three new functions and the three promo columns go; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the usage events down script must run as app_owner (current_user is %)', current_user;
  end if;
  -- FORCE RLS holds the owner to the client policies, which show it nothing (no auth.uid()): lifted inside this transaction only, for
  -- the check; the tables are dropped below.
  alter table nestly.usage_events no force row level security;
  alter table nestly.professional_views no force row level security;
  if exists (select 1 from nestly.usage_events) or exists (select 1 from nestly.professional_views) then
    raise exception 'an I13 usage event or professional view exists: the down script refuses';
  end if;
end
$$;

drop table nestly.professional_views;
drop table nestly.usage_events;

drop function nestly.purge_usage_events();
drop function nestly.professional_views_guard();
drop function nestly.usage_events_guard();

-- promotion_events_guard() as 20261022900000_monetization.sql wrote it (verbatim)
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
  v_cap := case new.kind when 'impression' then 100 when 'click' then 20 else 1 end;
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
comment on function nestly.promotion_events_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. Only a Regular or Professional, on a running promotion of another that it can read (target still eligible). An insert is the caller''s own on today''s date (Israel time): impressions and clicks add one to the day''s row instead of a second row, up to 100 / 20 a day (then nothing more is counted); a follow counts once per promotion and viewer and a chat start once a day, only with a real follow / conversation of the caller created in this transaction and a click of the caller within 7 calendar days (advisory lock 8114). An update only adds one to today''s row within the same limits.';

-- the promotions row is deleted with the guard set aside (append-only for every role, the owner included), FORCE lifted for it
alter table nestly.algorithm_configurations no force row level security;
alter table nestly.algorithm_configurations disable trigger algorithm_configurations_guard;
delete from nestly.algorithm_configurations where surface = 'promotions';
alter table nestly.algorithm_configurations enable trigger algorithm_configurations_guard;
alter table nestly.algorithm_configurations force row level security;

alter table nestly.algorithm_configurations
  drop constraint algorithm_configurations_promotions_check,
  drop column promo_feed_position,
  drop column promo_units_per_page,
  drop column promo_daily_cap;
alter table nestly.algorithm_configurations drop constraint algorithm_configurations_surface_check;
alter table nestly.algorithm_configurations
  add constraint algorithm_configurations_surface_check check (surface in ('regular_feed'));
comment on column nestly.algorithm_configurations.surface is 'The feed surface the settings belong to (regular_feed).';

delete from supabase_migrations.schema_migrations where version = '20261023600000';

commit;
