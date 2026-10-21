-- =====================================================================================================================
-- Monetization — I13, migration only.
--
-- SRS: FR-SERV-010, FR-MKT-004, FR-PRO-002, FR-ALG-007 · NFR-SEC-007 · BR-003, BR-004, BR-005, BR-020, BR-047, BR-053, BR-054, BR-057 ·
--      VAL-012, VAL-030, VAL-032 · ERR-028 · AC-057, AC-062, AC-063, AC-068, AC-072, AC-098 · §3.2 (BILLING_FINANCE_MANAGE) · §13 Promotion,
--      ProfessionalPromotionMetric, PromotionPerformanceEvent · OP-030 (closed: simulated prices marked "מחיר לדוגמה") · decisions-in-force.md
--      §3 items 12-13 (no coupon or affiliate entity; sample prices) and §9.8 (the advertisement label of a Professional's promotion).
--
-- promotion_plans          The sample price list (OP-030, NFR-SEC-007): per target kind (a Professional's profile, a Professional's post, a
--                          Regular's listing) a few durations with a simulated price in whole shekels, always shown as "מחיר לדוגמה". Seeded
--                          here; no runtime role writes it (the real price list is set only before real payment, OP-030). Every active
--                          account reads the active plans.
-- promotion_payments       The simulated payment of one plan (NFR-SEC-007, AC-098): the payer, the plan, the amount and the target kind
--                          copied from the plan by the database (never sent by the client), provider 'simulated', a simulated transaction
--                          reference, status succeeded. No card, account or billing-address column exists. The payer and BILLING_FINANCE_MANAGE
--                          (Admin Only) read it; nobody updates or deletes it.
-- promotions               Promotion (FR-SERV-010, FR-MKT-004, BR-047, BR-020): one paid campaign on one target — the owner's own Professional
--                          profile, an own public feed post of a Professional, or an own active Marketplace listing of a Regular — bought
--                          with one payment of a plan of that kind. Runs from the purchase for the plan's days (ends_at, the database's);
--                          one running promotion per target. The owner stops it early (status stopped). The owner and BILLING_FINANCE_MANAGE
--                          read every one; every active account reads a running one of an owner it has no user block with (to be shown,
--                          always labelled: BR-005, VAL-012). Nothing here changes an organic score or a reputation (BR-004, AC-062): no
--                          organic table is written and no organic read joins these tables.
-- promotion_events         PromotionPerformanceEvent (FR-PRO-002, FR-ALG-007, §13): paid impressions, clicks, and the follows and chat starts
--                          that came within 7 days of a click — one row per promotion, viewer, kind and day (Israel time), its `times` counting
--                          repeats (the frequency cap reads it). The viewer writes and reads its own rows; the promotion's owner and
--                          BILLING_FINANCE_MANAGE read the rows of a promotion as counts only: viewer_id is never granted for SELECT, and the day
--                          is the finest time (BR-057, AC-072: no identity, no search text). Kept apart from every organic count (AC-062).
-- professional_follows,    gain an AFTER INSERT trigger each (SECURITY INVOKER, as the follower / the opener): a follow of a Professional, or a
-- conversations            professional or marketplace conversation opened, within 7 days of the caller's own click on a promotion of that
--                          Professional or that listing, is recorded as that promotion's follow / chat start.
--
-- Paid targeting inputs (BR-053, AC-068, VAL-030): only the surface, the query or category, the promotion and the target; no column here
-- names a child, a pregnancy, a tracker, a chat, a Support thread or a private Group.
--
-- Every new table: RLS + FORCE, client policies TO authenticated gated by is_active_account(), per-column write grants, owner columns
-- defaulting to auth.uid(). No new SECURITY DEFINER, no TO app_owner / app_jobs policy, no change to audit_trigger() (no staff write exists).
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261022900000_monetization.down.sql (refuses once a payment, a promotion or an event exists).
-- =====================================================================================================================

-- 1. promotion_plans ------------------------------------------------------------------------------------------------------
create table nestly.promotion_plans (
  key              text        not null
    constraint promotion_plans_pkey primary key
    constraint promotion_plans_key_check check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  target_kind      text        not null
    constraint promotion_plans_target_kind_check check (target_kind in ('profile', 'post', 'listing')),
  days             integer     not null
    constraint promotion_plans_days_check check (days between 1 and 60),
  sample_price_ils integer     not null
    constraint promotion_plans_sample_price_ils_check check (sample_price_ils between 1 and 10000),
  sort_order       integer     not null
    constraint promotion_plans_sort_order_check check (sort_order between 0 and 100),
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  constraint promotion_plans_key_target_kind_key unique (key, target_kind)
);

insert into nestly.promotion_plans (key, target_kind, days, sample_price_ils, sort_order) values
  ('profile_7', 'profile', 7, 49, 1),
  ('profile_30', 'profile', 30, 149, 2),
  ('post_3', 'post', 3, 19, 1),
  ('post_7', 'post', 7, 39, 2),
  ('listing_3', 'listing', 3, 9, 1),
  ('listing_7', 'listing', 7, 19, 2);

-- 2. promotion_payments ---------------------------------------------------------------------------------------------------
create table nestly.promotion_payments (
  id            uuid        not null default gen_random_uuid()
    constraint promotion_payments_pkey primary key,
  payer_id      uuid        not null default auth.uid()
    constraint promotion_payments_payer_id_fkey references nestly.users (id) on delete cascade,
  plan_key      text        not null,
  target_kind   text        not null,
  amount_ils    integer     not null
    constraint promotion_payments_amount_ils_check check (amount_ils between 1 and 10000),
  currency      text        not null default 'ILS'
    constraint promotion_payments_currency_check check (currency = 'ILS'),
  provider      text        not null default 'simulated'
    constraint promotion_payments_provider_check check (provider = 'simulated'),
  provider_ref  uuid        not null default gen_random_uuid()
    constraint promotion_payments_provider_ref_key unique,
  is_simulated  boolean     not null default true
    constraint promotion_payments_is_simulated_check check (is_simulated),
  status        text        not null default 'succeeded'
    constraint promotion_payments_status_check check (status = 'succeeded'),
  created_at    timestamptz not null default now(),
  constraint promotion_payments_plan_fkey foreign key (plan_key, target_kind) references nestly.promotion_plans (key, target_kind)
);

create index promotion_payments_payer_created_idx on nestly.promotion_payments (payer_id, created_at desc);
create index promotion_payments_plan_idx on nestly.promotion_payments (plan_key, target_kind);

-- 3. promotions -----------------------------------------------------------------------------------------------------------
create table nestly.promotions (
  id          uuid        not null default gen_random_uuid()
    constraint promotions_pkey primary key,
  owner_id    uuid        not null default auth.uid()
    constraint promotions_owner_id_fkey references nestly.users (id) on delete cascade,
  target_kind text        not null
    constraint promotions_target_kind_check check (target_kind in ('profile', 'post', 'listing')),
  post_id     uuid
    constraint promotions_post_id_fkey references nestly.posts (id) on delete cascade,
  listing_id  uuid
    constraint promotions_listing_id_fkey references nestly.marketplace_listings (id) on delete cascade,
  plan_key    text        not null,
  payment_id  uuid        not null
    constraint promotions_payment_id_key unique
    constraint promotions_payment_id_fkey references nestly.promotion_payments (id) on delete cascade,
  status      text        not null default 'active'
    constraint promotions_status_check check (status in ('active', 'stopped')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  stopped_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint promotions_target_check check (
    case target_kind
      when 'profile' then post_id is null and listing_id is null
      when 'post' then post_id is not null and listing_id is null
      else listing_id is not null and post_id is null
    end),
  constraint promotions_period_check check (ends_at > starts_at),
  constraint promotions_stopped_at_check check ((stopped_at is not null) = (status = 'stopped')),
  constraint promotions_plan_fkey foreign key (plan_key, target_kind) references nestly.promotion_plans (key, target_kind)
);

create index promotions_running_idx on nestly.promotions (target_kind, ends_at) where status = 'active';
create index promotions_owner_created_idx on nestly.promotions (owner_id, created_at desc);
create index promotions_post_id_idx on nestly.promotions (post_id) where post_id is not null;
create index promotions_listing_id_idx on nestly.promotions (listing_id) where listing_id is not null;
create index promotions_plan_idx on nestly.promotions (plan_key, target_kind);

-- 4. promotion_events -----------------------------------------------------------------------------------------------------
create table nestly.promotion_events (
  id           uuid        not null default gen_random_uuid()
    constraint promotion_events_pkey primary key,
  promotion_id uuid        not null
    constraint promotion_events_promotion_id_fkey references nestly.promotions (id) on delete cascade,
  viewer_id    uuid        not null default auth.uid()
    constraint promotion_events_viewer_id_fkey references nestly.users (id) on delete cascade,
  kind         text        not null
    constraint promotion_events_kind_check check (kind in ('impression', 'click', 'follow', 'chat_start')),
  occurred_on  date        not null default ((now() at time zone 'Asia/Jerusalem')::date),
  times        integer     not null default 1
    constraint promotion_events_times_check check (times between 1 and 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint promotion_events_once_key unique (promotion_id, viewer_id, kind, occurred_on)
);

create index promotion_events_viewer_idx on nestly.promotion_events (viewer_id, occurred_on);

-- 5. Triggers (SECURITY INVOKER; auth.uid() is the actor) -----------------------------------------------------------------

-- promotion_payments: the database copies the plan's kind and sample price; the client names the plan only. An inactive plan is not sold.
create function nestly.promotion_payments_prepare()
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
  return new;
end
$$;

-- promotions: the period is the database's (now, for the plan's days); one running promotion per target (an advisory lock on the target
-- serialises two purchases of the same target; 23505 when one is already running).
create function nestly.promotions_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_days integer;
begin
  select p.days into v_days from nestly.promotion_plans p where p.key = new.plan_key and p.target_kind = new.target_kind and p.is_active;
  if v_days is null then
    raise exception 'promotions: no such plan' using errcode = '23503';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8113, pg_catalog.hashtext(new.target_kind || ':'
    || coalesce(new.post_id::text, new.listing_id::text, new.owner_id::text)));
  if exists (select 1 from nestly.promotions p
              where p.status = 'active' and p.ends_at > pg_catalog.now() and p.target_kind = new.target_kind
                and p.owner_id = new.owner_id
                and p.post_id is not distinct from new.post_id and p.listing_id is not distinct from new.listing_id) then
    raise exception 'promotions: this target is already promoted' using errcode = '23505';
  end if;
  new.status := 'active';
  new.stopped_at := null;
  new.starts_at := pg_catalog.now();
  new.ends_at := pg_catalog.now() + pg_catalog.make_interval(days => v_days);
  new.created_at := pg_catalog.now();
  return new;
end
$$;

-- promotions: the owner only stops a running promotion (active -> stopped, stopped_at the database clock); nothing else changes.
create function nestly.promotions_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.owner_id, new.target_kind, new.post_id, new.listing_id, new.plan_key, new.payment_id, new.starts_at, new.ends_at, new.created_at)
     is distinct from (old.id, old.owner_id, old.target_kind, old.post_id, old.listing_id, old.plan_key, old.payment_id, old.starts_at, old.ends_at, old.created_at) then
    raise exception 'promotions: immutable column' using errcode = '42501';
  end if;
  if not (old.status = 'active' and new.status = 'stopped' and old.ends_at > pg_catalog.now()) then
    raise exception 'promotions: only a running promotion is stopped' using errcode = '23514';
  end if;
  new.stopped_at := pg_catalog.now();
  return new;
end
$$;

-- promotion_events: a follow or a chat start counts only within 7 days of the viewer's own click on that promotion; a repeat only adds one
-- to `times`, and nothing else of the row changes.
create function nestly.promotion_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.times := 1;
    new.occurred_on := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
    new.created_at := pg_catalog.now();
    new.updated_at := pg_catalog.now();
    if new.kind in ('follow', 'chat_start') and not exists (
        select 1 from nestly.promotion_events e
         where e.promotion_id = new.promotion_id and e.viewer_id = new.viewer_id and e.kind = 'click'
           and e.occurred_on >= new.occurred_on - 7) then
      raise exception 'promotion_events: no click to attribute' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.id, new.promotion_id, new.viewer_id, new.kind, new.occurred_on, new.created_at)
     is distinct from (old.id, old.promotion_id, old.viewer_id, old.kind, old.occurred_on, old.created_at)
     or new.times <> old.times + 1 then
    raise exception 'promotion_events: a repeat adds one' using errcode = '42501';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- Attribution (FR-PRO-002: paid follows and chat starts): as the follower / the opener, within 7 days of its own click on a running promotion
-- of that Professional (profile or post) or that listing. Anything else — a fixture, the owner role, a cascade — passes untouched.
create function nestly.promotion_attribution()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_kind text;
  v_other uuid;
begin
  if v_uid is null or current_user <> 'authenticated' then
    return null;
  end if;
  if tg_table_name = 'professional_follows' then
    v_kind := 'follow';
    v_other := new.professional_id;
  else
    v_kind := 'chat_start';
    v_other := case when new.user_a = v_uid then new.user_b else new.user_a end;
  end if;
  insert into nestly.promotion_events as e (promotion_id, kind)
  select p.id, v_kind
    from nestly.promotions p
   where p.owner_id = v_other and p.owner_id <> v_uid
     and ((tg_table_name = 'professional_follows' and p.target_kind in ('profile', 'post'))
       or (tg_table_name = 'conversations' and new.context = 'professional' and p.target_kind in ('profile', 'post'))
       or (tg_table_name = 'conversations' and new.context = 'marketplace' and p.target_kind = 'listing' and p.listing_id = new.listing_id))
     and exists (select 1 from nestly.promotion_events c
                  where c.promotion_id = p.id and c.viewer_id = v_uid and c.kind = 'click'
                    and c.occurred_on >= (pg_catalog.now() at time zone 'Asia/Jerusalem')::date - 7)
  on conflict on constraint promotion_events_once_key do update set times = e.times + 1;
  return null;
end
$$;

revoke execute on function nestly.promotion_payments_prepare() from public;
revoke execute on function nestly.promotions_prepare() from public;
revoke execute on function nestly.promotions_update_guard() from public;
revoke execute on function nestly.promotion_events_guard() from public;
revoke execute on function nestly.promotion_attribution() from public;

create trigger promotion_payments_prepare before insert on nestly.promotion_payments
  for each row execute function nestly.promotion_payments_prepare();
create trigger promotions_prepare before insert on nestly.promotions
  for each row execute function nestly.promotions_prepare();
create trigger promotions_update_guard before update on nestly.promotions
  for each row execute function nestly.promotions_update_guard();
create trigger promotion_events_guard before insert or update on nestly.promotion_events
  for each row execute function nestly.promotion_events_guard();
create trigger professional_follows_promotion_attribution after insert on nestly.professional_follows
  for each row execute function nestly.promotion_attribution();
create trigger conversations_promotion_attribution after insert on nestly.conversations
  for each row when (new.context in ('professional', 'marketplace')) execute function nestly.promotion_attribution();

-- 6. RLS, grants and policies ---------------------------------------------------------------------------------------------
alter table nestly.promotion_plans enable row level security, force row level security;
alter table nestly.promotion_payments enable row level security, force row level security;
alter table nestly.promotions enable row level security, force row level security;
alter table nestly.promotion_events enable row level security, force row level security;

revoke all on table nestly.promotion_plans, nestly.promotion_payments, nestly.promotions, nestly.promotion_events from public, anon, authenticated;

grant select (key, target_kind, days, sample_price_ils, sort_order, is_active) on table nestly.promotion_plans to authenticated;
grant select (id, payer_id, plan_key, target_kind, amount_ils, currency, provider, provider_ref, is_simulated, status, created_at)
  on table nestly.promotion_payments to authenticated;
grant insert (plan_key) on table nestly.promotion_payments to authenticated;
grant select (id, owner_id, target_kind, post_id, listing_id, plan_key, payment_id, status, starts_at, ends_at, stopped_at, created_at)
  on table nestly.promotions to authenticated;
grant insert (target_kind, post_id, listing_id, plan_key, payment_id) on table nestly.promotions to authenticated;
grant update (status) on table nestly.promotions to authenticated;
-- viewer_id is never granted for SELECT: the owner of a promotion counts rows and never learns who (BR-057, AC-072).
grant select (id, promotion_id, kind, occurred_on, times) on table nestly.promotion_events to authenticated;
grant insert (promotion_id, kind) on table nestly.promotion_events to authenticated;
grant update (times) on table nestly.promotion_events to authenticated;

-- promotion_plans.
create policy promotion_plans_select_reader on nestly.promotion_plans
  for select to authenticated
  using ((select nestly.is_active_account()));

-- promotion_payments.
create policy promotion_payments_select_payer on nestly.promotion_payments
  for select to authenticated
  using ((select nestly.is_active_account()) and payer_id = (select auth.uid()));

create policy promotion_payments_select_finance on nestly.promotion_payments
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('BILLING_FINANCE_MANAGE')));

create policy promotion_payments_insert_payer on nestly.promotion_payments
  for insert to authenticated
  with check ((select nestly.is_active_account()) and payer_id = (select auth.uid()) and provider = 'simulated' and is_simulated
    and ((target_kind in ('profile', 'post') and (select nestly.caller_account_type()) = 'professional')
      or (target_kind = 'listing' and (select nestly.caller_account_type()) = 'regular')));

-- promotions.
create policy promotions_select_owner on nestly.promotions
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()));

create policy promotions_select_finance on nestly.promotions
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('BILLING_FINANCE_MANAGE')));

create policy promotions_select_viewer on nestly.promotions
  for select to authenticated
  using ((select nestly.is_active_account()) and status = 'active' and starts_at <= now() and ends_at > now()
    and owner_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])));

create policy promotions_insert_owner on nestly.promotions
  for insert to authenticated
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and status = 'active' and stopped_at is null
    and exists (select 1 from nestly.promotion_payments pp
                 where pp.id = promotions.payment_id and pp.payer_id = (select auth.uid())
                   and pp.plan_key = promotions.plan_key and pp.target_kind = promotions.target_kind)
    and case target_kind
      when 'profile' then (select nestly.caller_account_type()) = 'professional'
        and exists (select 1 from nestly.professional_profiles pr where pr.user_id = (select auth.uid()))
      when 'post' then (select nestly.caller_account_type()) = 'professional'
        and exists (select 1 from nestly.posts p
                     where p.id = promotions.post_id and p.author_id = (select auth.uid()) and p.status = 'active'
                       and p.audience = 'everyone' and p.group_id is null and not p.is_share)
      else (select nestly.caller_account_type()) = 'regular'
        and exists (select 1 from nestly.marketplace_listings l
                     where l.id = promotions.listing_id and l.owner_id = (select auth.uid()) and l.status = 'active'
                       and not l.is_hidden and l.expires_at > now())
    end);

create policy promotions_update_owner on nestly.promotions
  for update to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()));

-- promotion_events.
create policy promotion_events_select_viewer on nestly.promotion_events
  for select to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

create policy promotion_events_select_owner on nestly.promotion_events
  for select to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.promotions p where p.id = promotion_events.promotion_id and p.owner_id = (select auth.uid())));

create policy promotion_events_select_finance on nestly.promotion_events
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('BILLING_FINANCE_MANAGE')));

create policy promotion_events_insert_viewer on nestly.promotion_events
  for insert to authenticated
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid())
    and (select nestly.caller_account_type()) in ('regular', 'professional')
    and exists (select 1 from nestly.promotions p
                 where p.id = promotion_events.promotion_id and p.owner_id <> (select auth.uid())
                   and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()));

create policy promotion_events_update_viewer on nestly.promotion_events
  for update to authenticated
  using ((select nestly.is_active_account()) and viewer_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and viewer_id = (select auth.uid()));

-- 7. Comments ---------------------------------------------------------------------------------------------------------------
comment on table nestly.promotion_plans is
  'The sample promotion price list (OP-030 closed 18.10.2026, NFR-SEC-007): per target kind a duration and a simulated price, always shown as "מחיר לדוגמה". Seeded by the migration; no runtime role writes it; every active account reads it.';
comment on column nestly.promotion_plans.key is 'The plan key (packages/shared names it), e.g. profile_7.';
comment on column nestly.promotion_plans.target_kind is 'profile (a Professional''s own profile), post (a Professional''s own public feed post) or listing (a Regular''s own listing).';
comment on column nestly.promotion_plans.days is 'How long a promotion of this plan runs, 1 to 60 days.';
comment on column nestly.promotion_plans.sample_price_ils is 'The simulated price in whole shekels ("מחיר לדוגמה", OP-030); no money moves (NFR-SEC-007).';
comment on column nestly.promotion_plans.sort_order is 'The order of the plans of one kind on the purchase screen.';
comment on column nestly.promotion_plans.is_active is 'Whether the plan is sold now; a payment names an active plan only (promotion_payments_prepare).';
comment on column nestly.promotion_plans.created_at is 'When the plan was added. UTC.';
comment on constraint promotion_plans_key_target_kind_key on nestly.promotion_plans is 'The pair a payment and a promotion reference: a plan is sold only for its own kind.';

comment on table nestly.promotion_payments is
  'SRS Promotion / Payment (§13, NFR-SEC-007, AC-098): the simulated payment of one plan. The client names the plan only; the database copies its kind and sample price. provider is always simulated and is_simulated always true until a payment provider is chosen; no card, account or address is stored. The payer and BILLING_FINANCE_MANAGE (Admin Only) read it; nobody updates or deletes it.';
comment on column nestly.promotion_payments.id is 'The payment id; a promotion names it (promotions.payment_id, once).';
comment on column nestly.promotion_payments.payer_id is 'Who paid (default auth.uid(), rule 12).';
comment on column nestly.promotion_payments.plan_key is 'The plan bought (the only column the client writes).';
comment on column nestly.promotion_payments.target_kind is 'The plan''s target kind, copied by promotion_payments_prepare.';
comment on column nestly.promotion_payments.amount_ils is 'The plan''s sample price in whole shekels, copied by promotion_payments_prepare ("מחיר לדוגמה"; no money moved).';
comment on column nestly.promotion_payments.currency is 'Always ILS.';
comment on column nestly.promotion_payments.provider is 'Always simulated until a payment provider is chosen (NFR-SEC-007); the payment interface on the server is the one place a real provider replaces.';
comment on column nestly.promotion_payments.provider_ref is 'The simulated transaction reference (a random uuid), shown on the billing screen.';
comment on column nestly.promotion_payments.is_simulated is 'Always true: the screen says the payment is simulated (AC-098).';
comment on column nestly.promotion_payments.status is 'Always succeeded: a simulated payment never fails for money reasons.';
comment on column nestly.promotion_payments.created_at is 'When it was paid, the database clock. UTC.';
comment on index nestly.promotion_payments_payer_created_idx is 'The billing screen: a payer''s payments, newest first; the payer FK.';
comment on index nestly.promotion_payments_plan_idx is 'The plan FK.';

comment on table nestly.promotions is
  'SRS Promotion (§13, FR-SERV-010, FR-MKT-004, BR-020, BR-047): one paid campaign on one target — a Professional''s own profile, its own public feed post, or a Regular''s own active listing — bought with one simulated payment of a plan of that kind; it runs for the plan''s days, one running promotion per target, and its owner may stop it early. Shown only when eligible and always labelled (FR-ALG-007, BR-005, BR-054, VAL-012); it never changes an organic score or a reputation (BR-004, AC-062).';
comment on column nestly.promotions.id is 'The promotion id.';
comment on column nestly.promotions.owner_id is 'The buyer (default auth.uid()): the Professional or the listing''s owner.';
comment on column nestly.promotions.target_kind is 'profile, post or listing (FR-SERV-010 Profile / Post Promotion; FR-MKT-004).';
comment on column nestly.promotions.post_id is 'The promoted post (target post): the owner''s own active post to everyone, not in a Group, not a share. Deleted with it.';
comment on column nestly.promotions.listing_id is 'The promoted listing (target listing): the owner''s own active listing. Deleted with it.';
comment on column nestly.promotions.plan_key is 'The plan bought (with target_kind, FK to promotion_plans).';
comment on column nestly.promotions.payment_id is 'The simulated payment that bought it (the payer''s own, of the same plan; used once).';
comment on column nestly.promotions.status is 'active, or stopped by its owner. A promotion runs while active and before ends_at; after ends_at it has ended.';
comment on column nestly.promotions.starts_at is 'The purchase time, the database clock.';
comment on column nestly.promotions.ends_at is 'starts_at plus the plan''s days, set by promotions_prepare. Never written by a client.';
comment on column nestly.promotions.stopped_at is 'When the owner stopped it, the database clock; NULL exactly while not stopped.';
comment on column nestly.promotions.created_at is 'When it was bought. UTC.';
comment on index nestly.promotions_running_idx is 'The running promotions of a surface (FR-ALG-007): by kind and end.';
comment on index nestly.promotions_owner_created_idx is 'An owner''s promotions, newest first (the promotion and billing screens); the owner FK.';
comment on index nestly.promotions_post_id_idx is 'The post FK (cascade).';
comment on index nestly.promotions_listing_id_idx is 'The listing FK (cascade).';
comment on index nestly.promotions_plan_idx is 'The plan FK.';

comment on table nestly.promotion_events is
  'SRS PromotionPerformanceEvent (§13, FR-PRO-002, FR-ALG-007): paid impressions and clicks, and the follows and chat starts within 7 days of a click; one row per promotion, viewer, kind and day (Israel time), times counting repeats. The viewer writes and reads its own rows; the owner and BILLING_FINANCE_MANAGE count a promotion''s rows and never read viewer_id (BR-057, AC-072). Apart from every organic count (AC-062).';
comment on column nestly.promotion_events.id is 'The row id.';
comment on column nestly.promotion_events.promotion_id is 'The promotion shown or acted on.';
comment on column nestly.promotion_events.viewer_id is 'Who saw or acted (default auth.uid()). Never granted for SELECT: used only by the viewer''s own policy (the frequency cap) and the uniqueness of the day''s row.';
comment on column nestly.promotion_events.kind is 'impression (served), click (opened), follow or chat_start (within 7 days of the viewer''s click; promotion_events_guard).';
comment on column nestly.promotion_events.occurred_on is 'The day in Israel time, the database clock: the finest time the owner reads.';
comment on column nestly.promotion_events.times is 'How many times that day, 1 to 1000; a repeat adds exactly one (promotion_events_guard).';
comment on column nestly.promotion_events.created_at is 'The first event of that day. Not granted for SELECT.';
comment on column nestly.promotion_events.updated_at is 'The latest repeat. Not granted for SELECT.';
comment on constraint promotion_events_once_key on nestly.promotion_events is 'One row per promotion, viewer, kind and day (a repeat adds to times).';
comment on index nestly.promotion_events_viewer_idx is 'The viewer FK; the viewer''s own day (the frequency cap).';

comment on function nestly.promotion_payments_prepare() is 'BEFORE INSERT, SECURITY INVOKER. Copies the active plan''s target kind and sample price into the payment and fixes the simulated provider, status and clock (23503 for no such plan).';
comment on function nestly.promotions_prepare() is 'BEFORE INSERT, SECURITY INVOKER. Sets the period from the active plan (now + its days) and refuses a second running promotion on the same target (23505; advisory lock 8113 on the target).';
comment on function nestly.promotions_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The owner only stops a running promotion (active -> stopped, stopped_at the database clock); every other column is immutable.';
comment on function nestly.promotion_events_guard() is 'BEFORE INSERT OR UPDATE, SECURITY INVOKER. A new row starts at times 1 on today''s date (Israel time); a follow or chat start needs the viewer''s click on that promotion within 7 days; an update only adds one to times.';
comment on function nestly.promotion_attribution() is 'AFTER INSERT on professional_follows and conversations, SECURITY INVOKER, as the caller: a follow of a Professional, or a professional or marketplace conversation opened, within 7 days of the caller''s own click on a running promotion of that Professional or that listing, is recorded as its follow / chat start. Passes untouched outside a client transaction.';
comment on trigger professional_follows_promotion_attribution on nestly.professional_follows is 'FR-PRO-002: a follow after a click on the Professional''s promotion counts as a paid follow.';
comment on trigger conversations_promotion_attribution on nestly.conversations is 'FR-PRO-002: a conversation opened after a click on a promotion of that Professional or listing counts as a paid chat start.';

comment on policy promotion_plans_select_reader on nestly.promotion_plans is 'Every active account reads the sample price list (the purchase screen).';
comment on policy promotion_payments_select_payer on nestly.promotion_payments is 'The payer reads its own payments (PG-042, the billing screen).';
comment on policy promotion_payments_select_finance on nestly.promotion_payments is 'BILLING_FINANCE_MANAGE (Admin Only, §3.2) reads every payment.';
comment on policy promotion_payments_insert_payer on nestly.promotion_payments is 'An active Professional pays for a profile or post plan, an active Regular for a listing plan; always simulated (NFR-SEC-007).';
comment on policy promotions_select_owner on nestly.promotions is 'The owner reads its promotions in every state.';
comment on policy promotions_select_finance on nestly.promotions is 'BILLING_FINANCE_MANAGE (Admin Only) reads every promotion.';
comment on policy promotions_select_viewer on nestly.promotions is 'Every active account reads a running promotion of an owner it has no user block with (to be shown, labelled); the target''s own policies still decide whether it is shown.';
comment on policy promotions_insert_owner on nestly.promotions is 'The buyer, with its own payment of the same plan: a Professional its profile or its own active public feed post (not in a Group, not a share), a Regular its own active, visible, unexpired listing (FR-SERV-010, FR-MKT-004).';
comment on policy promotions_update_owner on nestly.promotions is 'The owner stops its running promotion (status only; the guard allows nothing else).';
comment on policy promotion_events_select_viewer on nestly.promotion_events is 'The viewer reads its own rows (the frequency cap; the click a follow is attributed to).';
comment on policy promotion_events_select_owner on nestly.promotion_events is 'The promotion''s owner reads its rows as counts: viewer_id is not granted (BR-057, AC-072).';
comment on policy promotion_events_select_finance on nestly.promotion_events is 'BILLING_FINANCE_MANAGE (Admin Only) reads every row as counts.';
comment on policy promotion_events_insert_viewer on nestly.promotion_events is 'An active Regular or Professional records its own event on a running promotion it can read that is not its own.';
comment on policy promotion_events_update_viewer on nestly.promotion_events is 'The viewer adds one to its own row (the guard allows nothing else).';
