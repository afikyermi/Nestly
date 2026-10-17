-- =====================================================================================================================
-- The Friend branch of profile_view, the Friends lists, and the profile-open limit — I2 F2.4c1 (friends).
--
-- Source: .work/friends/schema.md (F2.4c1; Gate 2, ORCHESTRATOR 17.10.2026; DR-L A by Afik: the count and the Security event
--         happen inside profile_view, only for the caller's own rows; "Amendment — migration versions"); spec.md c16-c24
--         (DR-2 A Friend sees the Open view; DR-W A rolling window; DR-C A change by migration; DR-T 100 per 3600 s).
-- SRS: FR-PRIV-001 · §1.4 Basic Public Profile · FR-REL-001 · AC-034 · AC-078 · BR-025 · NFR-SEC-006 · ERR-032.
--
-- security_limits       Configuration (NFR-SEC-006, BR-025): the stored threshold N and window W, seeded 100 / 3600 s (DR-T).
--                       Read by profile_view at each open; no write policy, a change is a reviewed migration (DR-C A).
-- profile_open_counts   one row per account: the instants of its opens inside the window, and whether the current stretch of
--                       refusals has already been recorded. Working state, cascades with the account.
-- security_events       NFR-SEC-006 (5): one row for the first refusal of a stretch. INSERT only; nothing reads it before I4.
-- profile_view(text)    dropped and recreated, SAME signature, still the only SECURITY DEFINER (tests.approved_security_definer()
--                       is unchanged). Adds four trailing columns - relationship, friends, mutual_friends, outcome - widens
--                       s.is_full to Friends (DR-2 A), and counts the open before it reads the target. Absent or invalid
--                       configuration raises NS001: everything rolls back, nothing is counted or recorded (fail closed, c22).
-- 7 policies            TO app_owner only, open only while profile_view has declared a target (the DR-G1 shape): the three new
--                       tables, plus a SELECT each on friendships (the target's accepted rows) and regular_names (the names of
--                       the target's Friends). authenticated and anon hold no grant on the three tables (42501, c21, c22).
--
-- No table changes, no backfill. Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017170000_profile_open_limit.down.sql (refuses while security_events holds a row).
-- =====================================================================================================================

-- 1. Configuration.
create table nestly.security_limits (
  limit_key      text        not null
    constraint security_limits_pkey primary key
    constraint security_limits_limit_key_check check (limit_key in ('profile_open')),
  max_count      integer     not null
    constraint security_limits_max_count_check check (max_count between 1 and 10000),
  window_seconds integer     not null
    constraint security_limits_window_seconds_check check (window_seconds between 1 and 604800),
  updated_at     timestamptz not null default now()
);

insert into nestly.security_limits (limit_key, max_count, window_seconds) values ('profile_open', 100, 3600);  -- DR-T, before FORCE

-- 2. The rolling count per account.
create table nestly.profile_open_counts (
  user_id               uuid          not null
    constraint profile_open_counts_pkey primary key
    constraint profile_open_counts_user_id_fkey references nestly.users (id) on delete cascade,
  opened_at             timestamptz[] not null default '{}'
    constraint profile_open_counts_opened_at_check check (pg_catalog.cardinality(opened_at) <= 10000),
  is_refusal_recorded   boolean       not null default false
);

-- 3. Security events (NFR-SEC-006 (5)). RESTRICT, as recovery_events: retention is I9's.
create table nestly.security_events (
  id          uuid        not null default gen_random_uuid()
    constraint security_events_pkey primary key,
  kind        text        not null
    constraint security_events_kind_check check (kind in ('profile_open_limit')),
  user_id     uuid        not null
    constraint security_events_user_id_fkey references nestly.users (id) on delete restrict,
  occurred_at timestamptz not null default now()
);

create index security_events_user_id_idx on nestly.security_events (user_id);

-- 4. RLS and grants: no runtime role holds a privilege on any of the three.
alter table nestly.security_limits enable row level security, force row level security;
alter table nestly.profile_open_counts enable row level security, force row level security;
alter table nestly.security_events enable row level security, force row level security;

revoke all on table nestly.security_limits, nestly.profile_open_counts, nestly.security_events from public, anon, authenticated;

create policy security_limits_select_profile_view on nestly.security_limits
  for select to app_owner
  using (limit_key = 'profile_open' and (select nestly.profile_view_target()) is not null);

create policy profile_open_counts_select_profile_view on nestly.profile_open_counts
  for select to app_owner
  using (user_id = (select auth.uid()) and (select nestly.profile_view_target()) is not null);

create policy profile_open_counts_insert_profile_view on nestly.profile_open_counts
  for insert to app_owner
  with check (user_id = (select auth.uid()) and (select nestly.profile_view_target()) is not null);

create policy profile_open_counts_update_profile_view on nestly.profile_open_counts
  for update to app_owner
  using (user_id = (select auth.uid()) and (select nestly.profile_view_target()) is not null)
  with check (user_id = (select auth.uid()) and (select nestly.profile_view_target()) is not null);

create policy security_events_insert_profile_view on nestly.security_events
  for insert to app_owner
  with check (user_id = (select auth.uid()) and kind = 'profile_open_limit' and (select nestly.profile_view_target()) is not null);

create policy friendships_select_profile_view on nestly.friendships
  for select to app_owner
  using (status = 'accepted' and requester_status = 'active' and addressee_status = 'active'
    and (select nestly.profile_view_target()) in (requester_id, addressee_id));

create policy regular_names_select_profile_view on nestly.regular_names
  for select to app_owner
  using (exists (
    select 1 from nestly.friendships f
    where f.status = 'accepted' and f.requester_status = 'active' and f.addressee_status = 'active'
      and ((f.requester_id = (select nestly.profile_view_target()) and f.addressee_id = regular_names.user_id)
        or (f.addressee_id = (select nestly.profile_view_target()) and f.requester_id = regular_names.user_id))));

-- 5. profile_view: F2.3b's body (20261017150000), changed only where marked.
drop function nestly.profile_view(text);

create function nestly.profile_view(p_target text)
returns table (full_name text, gender text, children_count smallint, child_ages jsonb, is_pregnant boolean,
               shows_empty_journey_sentence boolean, relationship text, friends jsonb, mutual_friends jsonb, outcome text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_n integer;
  v_w integer;
  v_opens timestamptz[];
  v_logged boolean;
  v_rel text;
  v_friend boolean;
begin
  if p_target is null or p_target !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or not nestly.is_active_account() then
    return;
  end if;
  perform pg_catalog.set_config('nestly.profile_view_target', p_target, true);
  -- new (c22): the limit is stored data and fails closed.
  select l.max_count, l.window_seconds into v_n, v_w from nestly.security_limits l where l.limit_key = 'profile_open';
  if v_n is null or v_w is null or v_n < 1 or v_w < 1 then
    raise exception 'profile_view: profile_open limit missing or invalid' using errcode = 'NS001';
  end if;
  -- new (c20): the caller's own counter row, locked for the rest of the transaction (one account is serialized, others never wait).
  insert into nestly.profile_open_counts as c (user_id) values (v_me)
    on conflict (user_id) do update set is_refusal_recorded = c.is_refusal_recorded
    returning c.opened_at, c.is_refusal_recorded into v_opens, v_logged;
  v_opens := array(select t from pg_catalog.unnest(v_opens) t where t > pg_catalog.now() - pg_catalog.make_interval(secs => v_w) order by t);
  if pg_catalog.cardinality(v_opens) >= v_n then
    -- c21: the first refusal of a stretch records one Security event; the refused open is not counted.
    if not v_logged then
      insert into nestly.security_events (kind, user_id) values ('profile_open_limit', v_me);
    end if;
    update nestly.profile_open_counts c set opened_at = v_opens, is_refusal_recorded = true where c.user_id = v_me;
    perform pg_catalog.set_config('nestly.profile_view_target', '', true);
    return query select null::text, null::text, null::smallint, null::jsonb, null::boolean, null::boolean,
                        null::text, null::jsonb, null::jsonb, 'limited'::text;
    return;
  end if;
  update nestly.profile_open_counts c set opened_at = v_opens || pg_catalog.now(), is_refusal_recorded = false where c.user_id = v_me;
  -- new (c19): the relationship state, for a Regular caller only; a Professional gets NULL.
  if (select u.account_type from nestly.users u where u.id = v_me) = 'regular' then
    select case when pg_catalog.bool_or(f.status = 'accepted') then 'friends'
                when pg_catalog.bool_or(f.status = 'pending' and f.cancelled_at is null and f.addressee_id = v_me) then 'received'
                when pg_catalog.bool_or(f.status in ('pending', 'declined') and f.cancelled_at is null and f.requester_id = v_me) then 'sent'
                else 'none' end
      into v_rel
      from nestly.friendships f
      where (f.requester_id = v_me and f.addressee_id = p_target::uuid) or (f.addressee_id = v_me and f.requester_id = p_target::uuid);
  end if;
  v_friend := v_rel is not distinct from 'friends';
  return query
    select p.full_name, case when s.is_full then p.gender end, k.n,
           case when s.is_full then (
             select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('years', a.m / 12, 'months', a.m % 12)
                                                  order by c.created_at, c.slot), '[]'::jsonb)
             from nestly.children c cross join lateral (select nestly.child_age_months(c.birth_date, pg_catalog.now()) as m) a
             where c.user_id = p.user_id) end,
           k.pregnant, (k.n = 0 and not k.pregnant and p.is_empty_journey_sentence_shown),
           v_rel, fl.list, fl.mutual, 'shown'::text                                      -- new: c18, c19
    from nestly.regular_profiles p
    join nestly.users u on u.id = p.user_id and u.status = 'active' and u.account_type = 'regular'
    cross join lateral (select p.profile_visibility = 'open' or v_friend as is_full) s   -- changed: DR-2 A
    cross join lateral (select (select count(*) from nestly.children c where c.user_id = p.user_id)::smallint as n,
      exists (select 1 from nestly.journey_contexts j where j.user_id = p.user_id and j.stage = 'pregnant') as pregnant) k
    -- new (c18): the target's Friends and the ones the caller shares; each entry exactly the id and the full name.
    cross join lateral (
      select coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id), '[]'::jsonb) as list,
             coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id) filter (where x.is_mutual), '[]'::jsonb) as mutual
      from (select n.user_id, n.full_name,
                   pg_catalog.jsonb_build_object('userId', n.user_id, 'fullName', n.full_name) as e,
                   exists (select 1 from nestly.friendships m   -- the caller's own rows: friendships_select_party
                           where m.status = 'accepted'
                             and ((m.requester_id = v_me and m.addressee_id = n.user_id)
                               or (m.addressee_id = v_me and m.requester_id = n.user_id))) as is_mutual
            from nestly.friendships f
            join nestly.regular_names n on n.user_id = case when f.requester_id = p.user_id then f.addressee_id else f.requester_id end
            where p.user_id in (f.requester_id, f.addressee_id) and f.status = 'accepted' and n.user_id <> v_me) x) fl
    where p.user_id = p_target::uuid;
  perform pg_catalog.set_config('nestly.profile_view_target', '', true);
end
$$;

revoke execute on function nestly.profile_view(text) from public;
grant  execute on function nestly.profile_view(text) to authenticated;

-- 6. Comments.
comment on table nestly.security_limits is
  'Configuration (NFR-SEC-006, BR-025): the stored threshold and window of a limit. One row, limit_key profile_open, seeded 100 per 3600 s (Afik DR-T). Read by profile_view at each open; no runtime role reads or writes it, and no write policy exists: a change is a reviewed migration (DR-C A) until the I4 Admin screen.';
comment on column nestly.security_limits.limit_key is 'Which limit; only profile_open exists.';
comment on column nestly.security_limits.max_count is 'N: the opens allowed inside the window, 1 to 10000. The 101st at the seed is refused.';
comment on column nestly.security_limits.window_seconds is 'W: the rolling window in seconds, 1 to 604800 (DR-W A).';
comment on column nestly.security_limits.updated_at is 'When the row was last set.';
comment on constraint security_limits_limit_key_check on nestly.security_limits is 'The only limit today.';
comment on constraint security_limits_max_count_check on nestly.security_limits is 'A zero or negative N is unstorable; profile_view still fails closed on one.';
comment on constraint security_limits_window_seconds_check on nestly.security_limits is 'A zero or negative W is unstorable; profile_view still fails closed on one.';
comment on policy security_limits_select_profile_view on nestly.security_limits is
  'profile_view only: app_owner reads the profile_open row while the function has declared a target (the transaction-local nestly.profile_view_target).';

comment on table nestly.profile_open_counts is
  'Per account, the instants of its profile opens still inside the window (NFR-SEC-006 (1), DR-W A) and whether the current stretch of refusals was already recorded. Read and written only by profile_view, for auth.uid()''s own row; the row lock serializes one account. Working state: cascades with the account.';
comment on column nestly.profile_open_counts.user_id is 'The account that opened; auth.uid() of the call.';
comment on column nestly.profile_open_counts.opened_at is 'Instants of counted opens, database clock; at most N (10000 at the CHECK). Older than the window are dropped at the next open.';
comment on column nestly.profile_open_counts.is_refusal_recorded is 'True once the current stretch of refusals recorded its Security event; cleared by the next counted open.';
comment on constraint profile_open_counts_opened_at_check on nestly.profile_open_counts is 'Bounds the array at the largest storable N.';
comment on policy profile_open_counts_select_profile_view on nestly.profile_open_counts is
  'profile_view only: app_owner reads the caller''s own row (user_id = auth.uid()) while a target is declared.';
comment on policy profile_open_counts_insert_profile_view on nestly.profile_open_counts is
  'profile_view only: app_owner creates the caller''s own row while a target is declared.';
comment on policy profile_open_counts_update_profile_view on nestly.profile_open_counts is
  'profile_view only: app_owner updates the caller''s own row while a target is declared.';

comment on table nestly.security_events is
  'NFR-SEC-006 (5): a Security event, one per stretch of refused profile opens (the first refusal; ERR-032). Holds no target, name or profile data. INSERT only, by profile_view for auth.uid()''s own account; nothing reads, updates or deletes one before I4 (Admin reporting). ON DELETE RESTRICT, as recovery_events; retention is I9''s (SRS 13.4 TBD).';
comment on column nestly.security_events.id is 'Event id.';
comment on column nestly.security_events.kind is 'What happened; only profile_open_limit today.';
comment on column nestly.security_events.user_id is 'The account that was refused.';
comment on column nestly.security_events.occurred_at is 'When the refusal happened, database clock.';
comment on constraint security_events_kind_check on nestly.security_events is 'The kinds of Security event; extended by a migration.';
comment on index nestly.security_events_user_id_idx is 'The RESTRICT check on a users delete, and I4''s per-account read.';
comment on policy security_events_insert_profile_view on nestly.security_events is
  'profile_view only: app_owner inserts a profile_open_limit event for the caller''s own account while a target is declared. No other policy: nothing reads, updates or deletes an event.';

comment on policy friendships_select_profile_view on nestly.friendships is
  'profile_view only: app_owner reads the accepted rows between active accounts that involve the declared target, so the target''s Friends can be listed (FR-PRIV-001, §1.4). The caller''s own rows come from friendships_select_party.';
comment on policy regular_names_select_profile_view on nestly.regular_names is
  'profile_view only: app_owner reads the names of the declared target''s Friends (accepted pairs between active accounts); only the id and name leave the function.';

comment on function nestly.profile_view(text) is
  'One other Regular account''s profile (FR-PRIV-001, BR-044, AC-054, AC-078, NFR-SEC-006; F2.3b, F2.4c1): counts the open first (rolling window, N and W from security_limits; the Nth+1 returns one row with outcome limited and everything else NULL, and records one Security event per stretch; absent or invalid configuration raises NS001). Otherwise 0 or 1 row with outcome shown: full_name, children_count, is_pregnant, shows_empty_journey_sentence always; gender and child_ages ([{years, months}]) when the target is Open or the caller''s Friend (DR-2 A); relationship (none, sent, received, friends; NULL for a Professional caller); friends and mutual_friends ([{userId, fullName}]). Never a child''s name, sex, birth date, id or slot, a due date, a setting or a status. Caller active (is_active_account()); target active and Regular, else 0 rows, already counted. SECURITY DEFINER (data-model.md "Approved exceptions", DR-G1, DR-L A); EXECUTE authenticated.';
