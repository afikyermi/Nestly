# schema — F2.4a friendships + DR-6 names (friends)
DATA ARCHITECT, 17.10.2026. Contract: `spec.md` c1–c12 + Gate 1 (DR-3 A, DR-4 A, DR-5 A). Elevated. **DR-6 → A, shaped below; by my reading not a security-model change** (no definer, no role, no bypass), so ORCHESTRATOR decides it at this gate. CRITIC on opus checks that reading.

**Change**        New `friendships` (§13 Friendship) + transition trigger; new `regular_names` (DR-6) + insert trigger on `regular_profiles`;
                  UNIQUE `users (id, status)`, `regular_profiles (user_id, full_name)` as FK targets. No definer. Why: FR-REL-001, VAL-017, BR-029,
                  AC-034 (c1–c10), PG-036 names (c11, F2.4b). Statuses = §13: pending, accepted, declined, removed. **Cancel (DR-4 A) is no
                  status:** `cancelled_at` on a pending or declined row ("the requester withdrew it"). No DELETE: retention of every row → I9 (§13.4).
**Counterparty**  Each row copies both parties' `users.status` (default 'active') under composite FKs to `users (id, status)` ON UPDATE CASCADE.
                  INSERT: the FK check proves B active, the FK to regular_profiles proves B Regular. A never reads B's row (RI runs as owner,
                  outside RLS, like every FK we have). A suspend/ban/reactivation by any path (I4's too) rewrites the copy in the same statement,
                  so it cannot drift. RLS shows a row only while the other copy is 'active': A only ever reads 'active' (DR-5 A, c11).
**Authorization** One point per table: its policies, all gated by `is_active_account()` (rule 15). The trigger is the only place that sees OLD
                  and NEW. Grants: INSERT (addressee_id) only (rest defaults, rules 12–13); UPDATE (status, cancelled_at); no DELETE. Moves:
                  addressee pending→accepted|declined · addressee declined→pending (DR-7) · requester cancels pending|declined · requester
                  un-cancels own declined (DR-3 silent re-send) · either accepted→removed · else 42501. `regular_names` (user_id, full_name):
                  owner, plus the other party of a row A sent (pending|declined|accepted) or received (pending|accepted), never cancelled;
                  counterparty-active is inherited from friendships' RLS.
**Migration**     `supabase/migrations/20261017130000_friendships.sql`, one transaction, F2.1 header, `comment on` every object (meaning, SRS id):
```sql
alter table nestly.users add constraint users_id_status_key unique (id, status); alter table nestly.regular_profiles add constraint regular_profiles_user_id_full_name_key unique (user_id, full_name);
create table nestly.friendships (id uuid not null default gen_random_uuid() constraint friendships_pkey primary key,
  requester_id uuid not null default auth.uid(), addressee_id uuid not null, status text not null default 'pending'
    constraint friendships_status_check check (status in ('pending', 'accepted', 'declined', 'removed')), requester_status text not null default 'active', addressee_status text not null default 'active', requested_at timestamptz not null default now(),
  responded_at timestamptz, cancelled_at timestamptz, removed_at timestamptz, created_at timestamptz not null default now(),
  constraint friendships_addressee_id_check check (addressee_id <> requester_id), constraint friendships_cancelled_at_check check (cancelled_at is null or status in ('pending', 'declined')),
  constraint friendships_responded_at_check check ((responded_at is null) = (status = 'pending')), constraint friendships_removed_at_check check ((removed_at is null) = (status <> 'removed')),
  constraint friendships_requester_id_fkey foreign key (requester_id) references nestly.regular_profiles (user_id) on delete cascade, constraint friendships_addressee_id_fkey foreign key (addressee_id) references nestly.regular_profiles (user_id) on delete cascade,
  constraint friendships_requester_status_fkey foreign key (requester_id, requester_status) references nestly.users (id, status) on update cascade on delete cascade,
  constraint friendships_addressee_status_fkey foreign key (addressee_id, addressee_status) references nestly.users (id, status) on update cascade on delete cascade);
create unique index friendships_pair_live_key on nestly.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id)) where status = 'accepted' or (status = 'pending' and cancelled_at is null);
create unique index friendships_requester_id_addressee_id_key on nestly.friendships (requester_id, addressee_id) where status = 'declined' or (status = 'pending' and cancelled_at is null);
create index friendships_requester_id_idx on nestly.friendships (requester_id); create index friendships_addressee_id_idx on nestly.friendships (addressee_id);
create function nestly.friendships_transition() returns trigger language plpgsql security invoker set search_path = '' as $$
declare me uuid; begin if (new.id, new.requester_id, new.addressee_id, new.created_at) is distinct from (old.id, old.requester_id, old.addressee_id, old.created_at) then raise exception 'friendships: immutable column' using errcode = '42501'; end if;
  if new.status = old.status and new.cancelled_at is not distinct from old.cancelled_at then return new; end if;  -- status-copy cascade
  me := auth.uid(); if me = old.addressee_id and old.status = 'pending' and old.cancelled_at is null and new.status in ('accepted', 'declined') and new.cancelled_at is null then new.responded_at := pg_catalog.now();
  elsif me = old.addressee_id and old.status = 'declined' and new.status = 'pending' and new.cancelled_at is not distinct from old.cancelled_at then new.responded_at := null;
  elsif me = old.requester_id and old.status in ('pending', 'declined') and old.cancelled_at is null and new.status = old.status and new.cancelled_at is not null then new.cancelled_at := pg_catalog.now();
  elsif me = old.requester_id and old.status = 'declined' and old.cancelled_at is not null and new.status = 'declined' and new.cancelled_at is null then new.requested_at := pg_catalog.now();
  elsif me in (old.requester_id, old.addressee_id) and old.status = 'accepted' and new.status = 'removed' and new.cancelled_at is null then new.removed_at := pg_catalog.now();
  else raise exception 'friendships: transition refused' using errcode = '42501'; end if; return new; end $$;
revoke execute on function nestly.friendships_transition() from public; create trigger friendships_transition before update on nestly.friendships for each row execute function nestly.friendships_transition();
alter table nestly.friendships enable row level security, force row level security; create policy friendships_select_party on nestly.friendships for select to authenticated using ((select nestly.is_active_account()) and (
  (requester_id = (select auth.uid()) and addressee_status = 'active') or (addressee_id = (select auth.uid()) and requester_status = 'active')));
create policy friendships_insert_requester on nestly.friendships for insert to authenticated with check (requester_id = (select auth.uid()) and (select nestly.is_active_account()) and status = 'pending' and cancelled_at is null and requester_status = 'active' and addressee_status = 'active');
create policy friendships_update_party on nestly.friendships for update to authenticated using (<select USING>) with check (<select USING>);
grant select on table nestly.friendships to authenticated; grant insert (addressee_id), update (status, cancelled_at) on table nestly.friendships to authenticated;
create table nestly.regular_names (user_id uuid not null default auth.uid() constraint regular_names_pkey primary key, full_name text not null, constraint regular_names_user_id_full_name_fkey foreign key (user_id, full_name) references nestly.regular_profiles (user_id, full_name) on update cascade on delete cascade);
alter table nestly.regular_profiles no force row level security;  -- DR-B: the owner reads every row; ACCESS EXCLUSIVE until commit
insert into nestly.regular_names (user_id, full_name) select user_id, full_name from nestly.regular_profiles; alter table nestly.regular_profiles force row level security;
alter table nestly.regular_names enable row level security, force row level security; create policy regular_names_select_party on nestly.regular_names for select to authenticated using ((select nestly.is_active_account()) and (
  user_id = (select auth.uid()) or exists (select 1 from nestly.friendships f where f.cancelled_at is null and (
    (f.requester_id = (select auth.uid()) and f.addressee_id = regular_names.user_id and f.status in ('pending', 'declined', 'accepted')) or (f.addressee_id = (select auth.uid()) and f.requester_id = regular_names.user_id and f.status in ('pending', 'accepted'))))));
create policy regular_names_insert_own on nestly.regular_names for insert to authenticated with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));
grant select on table nestly.regular_names to authenticated; grant insert (user_id, full_name) on table nestly.regular_names to authenticated;
create function nestly.regular_names_insert() returns trigger language plpgsql security invoker set search_path = '' as $$ begin insert into nestly.regular_names (user_id, full_name) values (new.user_id, new.full_name); return null; end $$;
revoke execute on function nestly.regular_names_insert() from public; create trigger regular_profiles_name_insert after insert on nestly.regular_profiles for each row execute function nestly.regular_names_insert();
```
**Rollback**      `supabase/rollback/20261017130000_friendships.down.sql`, one transaction, F2.1 app_owner guard: `no force` on friendships → raise
                  if any row (user data; after real use a forward migration, rule 7) → drop trigger regular_profiles_name_insert, fn
                  regular_names_insert(), tables regular_names, friendships, fn friendships_transition(), the two UNIQUEs → delete history row.
**Backfill**      regular_names, one row per profile (prod: a handful, ms), in the migration transaction: all or nothing, safe to interrupt. The
                  first computed backfill; its pattern (lift FORCE in-transaction, as F2.3a's down does) → DR-B.
**Indexes**       pair_live (unordered): duplicates, A→B ∥ B→A (c3, c4) · requester_addressee (directional): a declined A→B blocks A→B, not B→A
                  (DR-3) · requester_id, addressee_id: lists, names EXISTS, both cascades · the UNIQUEs: a btree on users, one more on F2.1 name
                  edits. Write cost accepted; no existing query loses an index. **Integrity** every party column has an FK; profile delete (I9
                  only, anchor RESTRICT) cascades. timestamptz now(); `requested_at` is shown and a silent re-send refreshes it.
**Blast radius**  users status changes write friendships (tests.set_status, I4, preview-e2e-cleanup). Registration writes regular_names (repository
                  unchanged; postgres fixtures work, user_id explicit). F2.1 name PUT cascades. `schema.ts`, `drift.test.ts`, `tests/db/*`; knowledge
                  (`data-model.md`, `data-model-tables.md`) by DATA ARCHITECT, same PR. **Reversible?** Yes (down refuses once rows exist).
**DR-6 → A.** B (definer, DR-G1 pattern): reserved, b waits, a second definer reaching others' rows. C (ids): PG-036 cannot ship. **A is no
security-model change:** an invoker policy on one column the SRS shows every signed-in viewer (§1.4 Basic Public Profile, Restricted too); A
narrows it to parties. **For CRITIC:** first ON UPDATE CASCADE copying another user's value into a row the caller reads (only what the FK proves
equal); the user_id INSERT grant departs from "Write grants" (fenced by WITH CHECK + own-profile FK); a send reveals the target's name outside
NFR-SEC-006's limit → F2.4c should count sends in it.
**Server** (one identity transaction, keyed by the counterpart id; ≤ 1 row per WHERE by the unique indexes). Send: (1, DR-7) `update set
status='pending' where requester_id=$t and status='declined' returning cancelled_at`, null → 409 incoming_pending; (2) `insert (addressee_id)
on conflict do nothing returning` → 201; 0 rows → read the pair: accepted → already_friends · own open pending or uncancelled declined →
request_exists · own cancelled declined → un-cancel, 201 · incoming open pending → incoming_pending · none → 404 unavailable; 23503 → 404,
42501 → 403 account_unavailable. accept/decline `requester_id=$t, pending, not cancelled`; cancel `addressee_id=$t, not cancelled,
pending|declined`; remove `accepted, $t a party`; 0 rows → 404 if no row visible, else 409 request_gone. DR-3's silence rests on c11's exact
output (never `status`): RLS cannot hide a column, a separate table would cost §13's Declined. CRITIC checks it.
**Drizzle** `friendships` all columns (status `FRIENDSHIP_STATUSES` in shared, copies `ACCOUNT_STATUSES`, `withTimezone`) · `friendshipsInsert`
{addresseeId} · `friendshipsUpdate` {requesterId, addresseeId (WHERE only), status, cancelledAt} · `regularNames` {userId, fullName} read only.

## pgTAP — `60_friendships_structure.sql`, `61_friendships_actions.sql`, `62_regular_names.sql`, fixtures `setup/60_friend_fixtures.sql`
c1 A inserts (addressee_id)=B → OK:1, defaults; A, B see it, C 0; naming requester_id/status/copy/clock → 42501. c2 addressee P, M, D, random,
B suspended, banned → 23503; A→A → 23514. c3 repeat A→B, B→A over open A→B, any over accepted → 23505; after decline A→B 23505, B→A OK:1. c5–c8
each legal move by its role → OK:1 + clock; wrong role (A accepts, B cancels, C any) → OK:0/42501; new A→B after cancel/remove OK:1. c9 ids,
created_at, requested_at → 42501; every illegal (status × cancelled_at) pair → 42501; second remove OK:0; DELETE 42501. c10 A suspended/banned →
SELECT 0, INSERT 42501, UPDATE OK:0; B suspended → rows and name hidden, accept OK:0; reactivated → back; P actor → 23503. c11 names per
(status × side × cancelled), never C's; count = regular_profiles; F2.1 edit shows. c12 RLS+FORCE; exactly five policies TO authenticated with
is_active_account; grants as above; fns invoker, fixed search_path; definer list empty; `rls_gate_product()` clean. Races c4/c9: `tests/db/`
(two connections, 20 runs). **Amend** (lines pre-F2.2a/F2.3a): `20_registration_structure.sql:176-184` (nine → eleven tables), `:367-370`
(trigger list +2); `10_identity_structure.sql:344-350` (column-UPDATE list + friendships); any other "exactly these" list that turns red.
**Open (all ORCHESTRATOR's, none reserved unless DR-6 is read as a security-model change)** · **DR-6** → A above · **DR-7** (spec gap; c9 lacks the
move): B→A while a declined A→B stands. A (recommended): B's send reopens it → 409 incoming_pending, B may accept; if A had cancelled it, it retires
and B→A is created. B: insert B→A beside it, so the decline never retires and blocks A after a later Friendship ends · **DR-B** (backfill on live data): the in-transaction FORCE lift above.

## Gate 2 — ORCHESTRATOR

**Approved — ORCHESTRATOR, 17.10.2026.** F2.4a as shaped; reversible (guarded down), no new SECURITY DEFINER, no service role.
- **DR-6 → A** (`regular_names`, invoker RLS, readable by the owner and the other person of a live pair). Not a security-model
  change: the name is already Basic Public Profile to every signed-in viewer (§1.4), here narrowed to the pair. F2.4b may build on it.
- **DR-7 → A** (B's send while B's decline of A→B stands reopens A's request; B gets 409 `incoming_pending`).
- **DR-B → approved**: the first computed backfill lifts FORCE on `regular_profiles` inside the migration transaction, under the
  table lock, as F2.3a's guarded down script does; migration-time only, never at runtime. FYI to Afik in the I2 close report.
CRITIC (opus) checks specifically: the status-copy ON UPDATE CASCADE, the `regular_names.user_id` INSERT grant, the FORCE lift, and
that no list returns `status` (DR-3's silent decline). The SQL was not run by DATA ARCHITECT; TEST ENGINEER's pgTAP is its first
run. Build order on the branch: F2.2a → F2.3a → F2.4a (migrations 110000 → 120000 → 130000).

# schema — F2.4c1 Friend branch, Friends lists, profile-open limit (friends)
DATA ARCHITECT, 17.10.2026. Contract: `spec.md` c16–c24 + "Gate 1 (F2.4c)" (DR-W/S/C/O A) · Afik DR-2 A, DR-T (100/h). On top of F2.3b
`20261017150000` (`.work/profile-privacy/schema.md`, its working-tree text of 17.10, "F2.4c1 room"): its body is kept verbatim but for the marked lines.
**SECURITY DEFINER: none new.** `nestly.profile_view(text)` stays the only one, same signature; `tests.approved_security_definer()` stays
F2.3b's list. A counter needs definer rights (an invoker that can test its count can read it — c21 forbids; one that cannot, cannot enforce
N), so the count lives **inside `profile_view`**. This widens the approved definer: it (i) reads B's accepted Friendships and those Friends'
names, (ii) writes the caller's own counter row and Security event — both only through `TO app_owner` policies open while the function
has declared a target (DR-G1's shape), (ii) only on `auth.uid()`'s rows. **My reading: not a security-model change** ((i) is the "F2.4" line
DR-G1 approved; (ii) is the caller's own data), so Gate 2 is ORCHESTRATOR's — unless it reads "a definer that writes" as outside DR-G1 (DR-L).

**Change**        New `security_limits` (Configuration), `profile_open_counts` (rolling window), `security_events` (NFR-SEC-006 (5)); one
                  `TO app_owner` SELECT policy each on F2.4a's `friendships`, `regular_names`; `profile_view` dropped + recreated, trailing columns
                  `relationship`, `friends`, `mutual_friends`, `outcome` (F2.3b's six unchanged) and `s.is_full` widened to Friends. **Why** c17 (DR-2 A) · c18 (§1.4) · c19 · c20–c24.
**Authorization** One point: the body of `profile_view`. `authenticated`/`anon` hold **no grant** on the 3 new tables (42501 on every verb, c21,
                  c22). Their policies are `TO app_owner` only, gated on `(select nestly.profile_view_target()) is not null` (inside a call);
                  counts and events also on `user_id = auth.uid()`. Events: INSERT only — nothing reads, updates or deletes one before I4.
                  Config: SELECT only; a DR-C change is a migration lifting FORCE in-transaction (DR-B pattern), never a write policy.
**Semantics**     Caller active → declare target → config (absent/out of range → `raise … errcode 'NS001'`: all rolled back, no count, no
                  event) → lock own counter row → drop instants older than W → **≥ N: refuse** (first refusal of a stretch inserts one event and
                  sets the flag; row `outcome='limited'`, rest NULL; not counted) → else append `now()`, clear flag → target lookup (unavailable =
                  0 rows, already counted). The row lock serializes one account (c20: 120 concurrent → ≤ 100); others never wait. DB clock.
**Server**        GET: `select * from nestly.profile_view($1)`; `limited` → **COMMIT**, 429 (the event persists, c21); NS001 → rollback, log, 429;
                  0 rows → F2.3b's 404/403; `shown` → strict Zod, 200. **Send (c24):** F2.4a's transaction first runs `select outcome from
                  nestly.profile_view($t)`; limited/NS001 as above, no friendship statement; else F2.4a unchanged (no profile reaches the server).
**Migration**     `supabase/migrations/20261017160000_profile_open_limit.sql`, one transaction, F2.1 header, `comment on` every object:
```sql
create table nestly.security_limits (limit_key text not null constraint security_limits_pkey primary key constraint security_limits_limit_key_check check (limit_key in ('profile_open')),
  max_count integer not null constraint security_limits_max_count_check check (max_count between 1 and 10000), window_seconds integer not null
  constraint security_limits_window_seconds_check check (window_seconds between 1 and 604800), updated_at timestamptz not null default now());
insert into nestly.security_limits (limit_key, max_count, window_seconds) values ('profile_open', 100, 3600);  -- DR-T, before FORCE
create table nestly.profile_open_counts (user_id uuid not null constraint profile_open_counts_pkey primary key constraint profile_open_counts_user_id_fkey references nestly.users (id) on delete cascade,
  opened_at timestamptz[] not null default '{}' constraint profile_open_counts_opened_at_check check (pg_catalog.cardinality(opened_at) <= 10000), is_refusal_recorded boolean not null default false);
create table nestly.security_events (id uuid not null default gen_random_uuid() constraint security_events_pkey primary key, kind text not null constraint security_events_kind_check check (kind in ('profile_open_limit')),
  user_id uuid not null constraint security_events_user_id_fkey references nestly.users (id) on delete restrict, occurred_at timestamptz not null default now());
create index security_events_user_id_idx on nestly.security_events (user_id);
alter table nestly.security_limits enable row level security, force row level security; alter table nestly.profile_open_counts enable row level security, force row level security;
alter table nestly.security_events enable row level security, force row level security; revoke all on table nestly.security_limits, nestly.profile_open_counts, nestly.security_events from public, anon, authenticated;
create policy security_limits_select_profile_view on nestly.security_limits for select to app_owner using (limit_key = 'profile_open' and (select nestly.profile_view_target()) is not null);
create policy profile_open_counts_select_profile_view on nestly.profile_open_counts for select to app_owner using (user_id = (select auth.uid()) and (select nestly.profile_view_target()) is not null);
create policy profile_open_counts_insert_profile_view … for insert to app_owner with check (<same>); create policy profile_open_counts_update_profile_view … for update to app_owner using (<same>) with check (<same>);
create policy security_events_insert_profile_view on nestly.security_events for insert to app_owner with check (user_id = (select auth.uid()) and kind = 'profile_open_limit' and (select nestly.profile_view_target()) is not null);
create policy friendships_select_profile_view on nestly.friendships for select to app_owner using (status = 'accepted' and requester_status = 'active' and addressee_status = 'active' and (select nestly.profile_view_target()) in (requester_id, addressee_id));
create policy regular_names_select_profile_view on nestly.regular_names for select to app_owner using (exists (select 1 from nestly.friendships f where f.status = 'accepted' and f.requester_status = 'active'
  and f.addressee_status = 'active' and ((f.requester_id = (select nestly.profile_view_target()) and f.addressee_id = regular_names.user_id) or (f.addressee_id = (select nestly.profile_view_target()) and f.requester_id = regular_names.user_id))));
drop function nestly.profile_view(text);
create function nestly.profile_view(p_target text) returns table (full_name text, gender text, children_count smallint, child_ages jsonb, is_pregnant boolean,
  shows_empty_journey_sentence boolean, relationship text, friends jsonb, mutual_friends jsonb, outcome text) language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare v_me uuid := auth.uid(); v_n integer; v_w integer; v_opens timestamptz[]; v_logged boolean; v_rel text; v_friend boolean;
begin
  if p_target is null or p_target !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or not nestly.is_active_account() then return; end if;
  perform pg_catalog.set_config('nestly.profile_view_target', p_target, true);
  select l.max_count, l.window_seconds into v_n, v_w from nestly.security_limits l where l.limit_key = 'profile_open';            -- new: c22
  if v_n is null or v_w is null or v_n < 1 or v_w < 1 then raise exception 'profile_view: profile_open limit missing or invalid' using errcode = 'NS001'; end if;
  insert into nestly.profile_open_counts as c (user_id) values (v_me) on conflict (user_id) do update set is_refusal_recorded = c.is_refusal_recorded
    returning c.opened_at, c.is_refusal_recorded into v_opens, v_logged;                                                         -- row lock (c20)
  v_opens := array(select t from pg_catalog.unnest(v_opens) t where t > pg_catalog.now() - pg_catalog.make_interval(secs => v_w) order by t);
  if pg_catalog.cardinality(v_opens) >= v_n then                                                                                  -- c20, c21
    if not v_logged then insert into nestly.security_events (kind, user_id) values ('profile_open_limit', v_me); end if;
    update nestly.profile_open_counts c set opened_at = v_opens, is_refusal_recorded = true where c.user_id = v_me;
    perform pg_catalog.set_config('nestly.profile_view_target', '', true);
    return query select null::text, null::text, null::smallint, null::jsonb, null::boolean, null::boolean, null::text, null::jsonb, null::jsonb, 'limited'::text; return;
  end if;
  update nestly.profile_open_counts c set opened_at = v_opens || pg_catalog.now(), is_refusal_recorded = false where c.user_id = v_me;
  if (select u.account_type from nestly.users u where u.id = v_me) = 'regular' then                                              -- c19; P: NULL
    select case when bool_or(f.status = 'accepted') then 'friends' when bool_or(f.status = 'pending' and f.cancelled_at is null and f.addressee_id = v_me) then 'received'
      when bool_or(f.status in ('pending', 'declined') and f.cancelled_at is null and f.requester_id = v_me) then 'sent' else 'none' end into v_rel   -- DR-3 A
    from nestly.friendships f where (f.requester_id = v_me and f.addressee_id = p_target::uuid) or (f.addressee_id = v_me and f.requester_id = p_target::uuid);
  end if;
  v_friend := v_rel is not distinct from 'friends';
  return query
    select p.full_name, case when s.is_full then p.gender end, k.n,
           case when s.is_full then (
             select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('years', a.m / 12, 'months', a.m % 12)
                                                  order by c.created_at, c.slot), '[]'::jsonb)
             from nestly.children c cross join lateral (select nestly.child_age_months(c.birth_date, pg_catalog.now()) as m) a
             where c.user_id = p.user_id) end,
           k.pregnant, (k.n = 0 and not k.pregnant and p.is_empty_journey_sentence_shown), v_rel, fl.list, fl.mutual, 'shown'::text   -- new: c18, c19
    from nestly.regular_profiles p
    join nestly.users u on u.id = p.user_id and u.status = 'active' and u.account_type = 'regular'
    cross join lateral (select p.profile_visibility = 'open' or v_friend as is_full) s                                          -- changed: DR-2 A
    cross join lateral (select (select count(*) from nestly.children c where c.user_id = p.user_id)::smallint as n,
      exists (select 1 from nestly.journey_contexts j where j.user_id = p.user_id and j.stage = 'pregnant') as pregnant) k
    cross join lateral (select coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id), '[]'::jsonb) as list,         -- new: c18
        coalesce(pg_catalog.jsonb_agg(x.e order by x.full_name, x.user_id) filter (where x.is_mutual), '[]'::jsonb) as mutual
      from (select n.user_id, n.full_name, pg_catalog.jsonb_build_object('userId', n.user_id, 'fullName', n.full_name) as e,
              exists (select 1 from nestly.friendships m where m.status = 'accepted' and ((m.requester_id = v_me and m.addressee_id = n.user_id)
                or (m.addressee_id = v_me and m.requester_id = n.user_id))) as is_mutual                                        -- V's rows: _select_party
            from nestly.friendships f join nestly.regular_names n on n.user_id = case when f.requester_id = p.user_id then f.addressee_id else f.requester_id end
            where p.user_id in (f.requester_id, f.addressee_id) and f.status = 'accepted' and n.user_id <> v_me) x) fl
    where p.user_id = p_target::uuid;
  perform pg_catalog.set_config('nestly.profile_view_target', '', true);
end $$;
revoke execute on function nestly.profile_view(text) from public; grant execute on function nestly.profile_view(text) to authenticated;
```
**Rollback**      `supabase/rollback/20261017160000_profile_open_limit.down.sql`, app_owner guard, one transaction: `no force` on security_events →
                  raise if any row (a Security record; after real use a forward migration) → drop `profile_view(text)`, recreate **150000's text
                  verbatim** + revoke/grant/comment → drop the 2 new friendships/regular_names policies → drop security_events, profile_open_counts
                  (every window restarts: accepted), security_limits → delete history row `20261017160000`.
**Backfill**      None: three new tables, one seeded row; no live row written. **Indexes** `security_events_user_id_idx`: the RESTRICT check
                  on a users delete, I4's per-account read; ≤ 1 insert per refusal stretch. Counts: pk; one HOT update per open (array ≤ N × 8 B;
                  80 kB at the 10 000 cap). Lists: F2.4a's `friendships_requester_id_idx`/`_addressee_id_idx` + `regular_names_pkey`. Nothing loses one.
**Integrity**     Counts cascade with the account (working state). Events RESTRICT, as `recovery_events` (retention §13.4 TBD, I9). CHECKs make
                  0/negative unstorable; the body still fails closed. timestamptz, µs, DB clock. B's lists are unbounded (no pagination: out of scope).
**Blast radius**  F2.3b's repository + Zod and `53_profile_view.sql` (columns, `'shown'`) · F2.4a send service (c24) · `tools/preview-e2e-cleanup-cli.ts:75`
                  deletes the victim's `security_events` before `users` (else 23503, loud) · `schema.ts`, `drift.test.ts` (+3 tables) · knowledge
                  (`data-model.md` profile_view exception entry widened, Entities; `data-model-tables.md`) by DATA ARCHITECT, same PR. **Reversible?** Yes, while no event exists.
**Drizzle**       `securityLimits`, `profileOpenCounts` (`timestamp('opened_at', { withTimezone: true }).array().notNull()`), `securityEvents`: drift
                  only, no write model, never queried. Shared: `SECURITY_LIMIT_KEYS`, `SECURITY_EVENT_KINDS`, `RELATIONSHIP_STATES`,
                  `PROFILE_VIEW_OUTCOMES`; strict Zod `profileViewRow`, list entries `z.strictObject({ userId: uuid, fullName })`.

## pgTAP — `63_profile_view_friend.sql`, `64_profile_open_limit.sql`, fixtures `setup/61_open_limit_fixtures.sql`
Fixtures (postgres-owned `tests` definers): `fx_set_limit(n, w)`, `fx_drop_limit()`, `fx_break_limit()` (drops the CHECK, sets 0; rolled back),
`fx_age_opens(id, interval)`, `fx_open_count(id)`, `fx_events(id)`. c17 A Friend of B, restricted and open → B's Open row (gender, child_ages);
pending/declined/cancelled/removed → non-Friend; new accept → Friend. c18 entries exactly {userId, fullName}; suspended Friend absent, back on
reactivation; never V or B; P mutual `[]`; none → `[]`,`[]`; as V, friendships shows own rows only. c19 (status × side × cancelled) → state,
DR-3 pair, P NULL. c20 `fx_set_limit(3, 3600)`: 3 shown, 4th limited (rest NULL); unavailable target counts; `fx_age_opens(3601 s)` → shown;
C unaffected; P counted. c21 first limited +1 event (columns exactly id, kind, user_id, occurred_at), second +0, after a counted open +1 again;
as authenticated every verb on the 3 tables → 42501. c22 seed (100, 3600); drop/break → NS001, count and events unchanged. c23 definers =
`{nestly.profile_view(text)}`; the 7 new policies TO app_owner only; no ACL for authenticated/anon; GUC empty after shown and limited;
`rls_gate_product()` clean. `tests/db/`: 120 concurrent → ≤ 100 shown; a committed refusal keeps its event; c24 send at the limit → 429, no
row. **Amend:** `60_friendships_structure.sql`, `62_regular_names.sql` (+1 TO app_owner policy), `53_profile_view.sql` (columns),
`10_identity_structure.sql` policy lists (except TO app_owner), `20_registration_structure.sql` table count (+3), any list that turns red.

**Open** · **DR-L** (ORCHESTRATOR; Afik's only if read as a security-model change): the count inside `profile_view`. A (recommended): above. B:
a second definer `profile_open_take()` — reserved, same reach. C: invoker INSERT-only — cannot enforce N without reading it (c21). ·
**QUESTION** (default: amend): the cleanup line is feature work, not a frozen tool change (audit decision 7); if not, events CASCADE (decides
I9's retention). · New entities `security_events`, `security_limits` (spec "Data touched"): ORCHESTRATOR here. · F2.3b (150000) merges first; if its body changes before merge, this one follows it.
SQL not run by DATA ARCHITECT; TEST ENGINEER's pgTAP is its first run. Section over the cap by the SQL block (F2.3b precedent).

## Gate 2 (F2.4c1) — ORCHESTRATOR

**ORCHESTRATOR, 17.10.2026.** Approved as shaped — `security_limits` (seeded 100 / 3600 s, fail closed `NS001`),
`profile_open_counts`, insert-only `security_events` (ON DELETE RESTRICT), the two `TO app_owner` SELECT policies, the four
trailing columns, COMMIT on `limited`, the guarded down — **except DR-L, sent to Afik**: it widens DR-G1 from a definer that
*reads* other users' rows to one that also *writes* (the caller's counter and the Security event). Until he answers, F2.4c1 is
not built; it is last-but-two in the build order, so nothing waits. The cleanup QUESTION goes to Afik with DR-L (default: amend
`tools/preview-e2e-cleanup-cli.ts:75` to delete the test user's `security_events` first). The section is over the 100-line cap
because of the exact SQL — accepted.

**Afik, 17.10.2026 (decisions.md "F2.4c1 DR-L"):** DR-L → A; the cleanup-tool line is approved. F2.4c1 is unblocked.

## Preview cleanup — DATA ARCHITECT, 17.10.2026 (standing rule, data-model.md "Migrations"; Afik 17.10 "Preview cleanup" b)
Same PR as each migration. `id` = the row locked `for update` in `deleteUser` (auth.users, pattern email). F2.2a/F2.3a/F2.3b add no
`nestly` table, so the list is still today's nine. `postgres` inherits `app_owner` (bootstrap `01-roles.sql:137`) and runs with
`row_security = off`: the missing DELETE grants/policies on these tables do not apply to it. No delete trigger on any of them.
**F2.4a** — EXPECTED_NESTLY_TABLES + `friendships`, `regular_names` (9 → 11, sorted; update the "nine tables" comment).
Insert both **after `journey_contexts`, before `regular_profiles`** (cli.ts:88 → :89):
- `counts['friendships'] = delete from nestly.friendships where requester_id = ${id} or addressee_id = ${id}` — both sides. Its four
  FKs (requester_id, addressee_id → regular_profiles; both status pairs → users) are ON DELETE CASCADE, so the profile delete
  would remove them anyway; explicit gives the count and keeps "leaf first" visible. Uses both F2.4a single-column indexes.
- `counts['regular_names'] = delete from nestly.regular_names where user_id = ${id}` — FK to regular_profiles CASCADE; own row only.
**Rows of another user.** A friendship row belongs to both parties. (a) Test ↔ test: deleted with the first user; the second user's
transaction finds 0 for it (a concurrent cleanup waits on the row lock, ≤ lock_timeout 5 s, then sees it gone). (b) Test ↔ non-test
(e.g. Afik's manual preview account): **deleted.** It cannot outlive the test user (the CASCADE FKs remove it with the profile
whatever the order), and refusing would strand the test user and, past MAX_PATTERN_USERS, stop all cleanup. Effect on the other user
= an I9 profile delete: the pair, its request or Friendship disappears; the other user's own rows (profile, `regular_names`) are
never touched — no statement keys on anyone but `id`. Never rewrite the counterparty copy columns (`*_status`); cleanup updates nothing.
**F2.4c1** — EXPECTED_NESTLY_TABLES + `profile_open_counts`, `security_events`, `security_limits` (11 → 14).
- `profile_open_counts` (FK user_id → users CASCADE) then `security_events` (FK user_id → users **ON DELETE RESTRICT**), each
  `delete … where user_id = ${id}`, **after `regular_profiles`, before `identity_link_checks`** (cli.ts:89 → :90): both before `users`,
  and `identity_link_checks` stays the statement just before `nestly.users` (test.mjs:472). F2.4c1's "cli.ts:75" is stale.
  Afik DR-L (17.10): the events deletion is allowed for test users in this tool only; RESTRICT stays for every other path (I9 TBD).
- `security_limits`: configuration, no user FK — **no delete, never touched**; list entry only. Deleting it would fail every later
  `profile_view` closed (NS001).
None of the three holds a row about another user (events and counts are keyed on the actor `auth.uid()`), so (b) does not arise.
Tests (`tools/preview-e2e-cleanup.test.mjs`, TEST ENGINEER, same PR) turn red and are amended: :458 count 9 → 11 → 14; :461 the
"nine" fixture (GOOD_FACTS :84) gains the tables; :470 requires a `delete from` for **every** expected table — add an explicit
exemption list `['security_limits']` (config, no user rows), never a dummy delete; :475 the pinned order gains `friendships`,
`regular_names` before `regular_profiles` and `profile_open_counts`, `security_events` after it; :472 unchanged. Add: friendships
deleted by `requester_id = ${id} or addressee_id = ${id}` (both sides pinned by regex).
