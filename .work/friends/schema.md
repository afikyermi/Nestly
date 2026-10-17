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
