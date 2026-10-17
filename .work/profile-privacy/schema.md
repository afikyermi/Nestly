# schema — F2.3 profile privacy (profile-privacy)

DATA ARCHITECT, 17.10.2026. Contract: `spec.md` c1–c16 + Gate 1 (DR-1 A, DR-4 A, DR-5 A; DR-3 reserved: no ages). Elevated.
**The read needs the first SECURITY DEFINER that reaches other users' rows: a security-model change → reserved for Afik (DR-G1).**

**Change**        `regular_profiles` + `profile_visibility` text NOT NULL default 'open' CHECK (open|restricted),
                  `is_empty_journey_sentence_shown` and `is_child_birthday_shared` boolean NOT NULL default true (the latter = §13
                  ChildBirthdayVisibility, stored only; I7 reads it) + their column UPDATE grant. New: `nestly.profile_view(text)`
                  (definer), helper `profile_view_target()`, 4 policies `<table>_select_profile_view` TO app_owner.
**Why**           c1–c6 (FR-PRIV-001, BR-037, OP-021; Afik's defaults) · c7–c13, c15 (BR-044, VAL-027, AC-054, OP-020, layer 5).
                  Columns, not a table: 1:1, Regular-only by the composite FK, already gated by the own-row policies, and a constant
                  default backfills with no DML (a table = one more RLS unit, a registration write, a DML backfill).
**Authorization** Settings: `regular_profiles_update_own` (unchanged, own row, is_active_account()) + per-column grant; no INSERT grant,
                  so registration cannot send them (c6); no DELETE. B's consent: no query of A returns it (own-row SELECT; not in
                  profile_view). Cross-user: **one point, the body of `profile_view`** — caller passes `is_active_account()` (rule 15
                  with the F2.0 guard; a Professional passes like a Regular, c11); target active + Regular, else 0 rows (c13, DR-5);
                  output exactly full_name, gender (Open only), children_count, is_pregnant, shows_empty_journey_sentence. Fence:
                  the TO app_owner policies reach only the row the function declares in the `nestly.profile_view_target` GUC (set,
                  then cleared); no runtime role is app_owner (rule 1) and authenticated never matches them, so c9 holds whatever V
                  sets. One uuid per call: no listing (layer 13). Approved-exceptions line follows Afik's answer.
**Migration**     `supabase/migrations/20261017120000_profile_privacy.sql` (after F2.2a's 20261017110000), one transaction:
```sql
alter table nestly.regular_profiles
  add column profile_visibility text not null default 'open'
    constraint regular_profiles_profile_visibility_check check (profile_visibility in ('open', 'restricted')),
  add column is_empty_journey_sentence_shown boolean not null default true,
  add column is_child_birthday_shared boolean not null default true;
grant update (profile_visibility, is_empty_journey_sentence_shown, is_child_birthday_shared) on table nestly.regular_profiles to authenticated;
create function nestly.profile_view_target() returns uuid language sql stable security invoker set search_path = '' as $$
  select case when pg_catalog.current_setting('nestly.profile_view_target', true) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then pg_catalog.current_setting('nestly.profile_view_target', true)::uuid end $$;
revoke execute on function nestly.profile_view_target() from public;  -- no grant: only the owner's policies call it
create policy users_select_profile_view on nestly.users for select to app_owner using (id = (select nestly.profile_view_target()));
create policy regular_profiles_select_profile_view on nestly.regular_profiles for select to app_owner using (user_id = (select nestly.profile_view_target()));
create policy children_select_profile_view on nestly.children for select to app_owner using (user_id = (select nestly.profile_view_target()));
create policy journey_contexts_select_profile_view on nestly.journey_contexts for select to app_owner using (user_id = (select nestly.profile_view_target()));
create function nestly.profile_view(p_target text)
returns table (full_name text, gender text, children_count smallint, is_pregnant boolean, shows_empty_journey_sentence boolean)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_target is null or p_target !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or not nestly.is_active_account() then return; end if;
  perform pg_catalog.set_config('nestly.profile_view_target', p_target, true);
  return query
    select p.full_name, case when p.profile_visibility = 'open' then p.gender end, k.n, k.pregnant,
           (k.n = 0 and not k.pregnant and p.is_empty_journey_sentence_shown)
    from nestly.regular_profiles p
    join nestly.users u on u.id = p.user_id and u.status = 'active' and u.account_type = 'regular'
    cross join lateral (select (select count(*) from nestly.children c where c.user_id = p.user_id)::smallint as n,
      exists (select 1 from nestly.journey_contexts j where j.user_id = p.user_id and j.stage = 'pregnant') as pregnant) k
    where p.user_id = p_target::uuid;
  perform pg_catalog.set_config('nestly.profile_view_target', '', true); end $$;
revoke execute on function nestly.profile_view(text) from public; grant execute on function nestly.profile_view(text) to authenticated;
```
                  + `comment on` each new column, function and policy (meaning, SRS id); `regular_profiles_update_own`'s names the 3.
**Rollback**      `supabase/rollback/20261017120000_profile_privacy.down.sql`, app_owner guard, one transaction: `no force row level
                  security` on regular_profiles → raise if any row holds a non-default setting (a re-apply would silently reopen a
                  Restricted profile; F1.4 down pattern) → `force row level security` → drop `profile_view(text)`, the 4 policies,
                  `profile_view_target()` → revoke the 3 UPDATEs → drop the 3 columns (drops the CHECK) → delete history row
                  `20261017120000`. Profiles, journeys, children untouched (c6). After real use: a forward migration (rule 7).
**Backfill — pattern set** A constant per row = `ADD COLUMN … NOT NULL DEFAULT <constant>`: catalog-only (PG ≥ 11 fast default),
                  no row written, so no RLS/FORCE/role question; every existing row, any status, reads it at once; constant time; one
                  transaction, safe to interrupt. The CHECK scan holds ACCESS EXCLUSIVE for ms today. A computed backfill stays open.
**Indexes**       None: `regular_profiles_pkey`, `users_pkey`, `children_user_id_slot_key` (prefix), `journey_contexts_user_id_stage_key`
                  serve every lookup; no new filter/sort; nothing loses an index. **Integrity** no FK/cascade/key change, no orphans.
**Blast radius**  registration-repository (INSERT model unchanged, defaults apply), F2.1 GET (3 more own columns), `schema.ts`,
                  `drift.test.ts`, `tests/db/*`, preview-e2e-cleanup (unaffected), pgTAP below; the 4 policies act only as app_owner.
                  Knowledge (`data-model.md` "Open" note, exceptions, Entities; `data-model-tables.md`) — DATA ARCHITECT, with it.
**Reversible?**   Yes (schema). Reserved for Afik regardless: DR-G1 (the definer and its pattern), not irreversibility.
**Rejected** (a) invoker view / TO authenticated policies: RLS hides rows not columns → gender under Restricted (c9), child names,
birth dates, and `select id from users` lists everyone. (b) app_recovery-style server role: any SQL with cross-user reach, gender
masked in code. (c) Own owner role + column grants: no USAGE on schema auth (rule 5) → no is_active_account(), rule 15 duplicated,
a prod bootstrap step. (d) Trigger-kept card table: target status needs a cross-user write (I4), ages need readable birth dates.
**Ages later (DR-3)** One migration: drop + create `profile_view` with one more output column of DR-3's type, computed in the body
from `c.birth_date` on `(pg_catalog.now() at time zone 'Asia/Jerusalem')::date`, slot order, Open only. No grant or policy change;
birth_date never in the output. **F2.4** Same function: a friendship test (auth.uid(), target) in the body adds the Friend
columns; a `_select_profile_view` policy only on a table V cannot read. One enforcement point stays.
**Drizzle** `regularProfiles` + `profileVisibility: text('profile_visibility', { enum: PROFILE_VISIBILITIES }).notNull().default('open')`,
`isEmptyJourneySentenceShown`, `isChildBirthdayShared`: `boolean(…).notNull().default(true)`; `PROFILE_VISIBILITIES` in shared. Write
model `regularProfilesPrivacyUpdate` = the three; update, no WHERE, `.returning()` (0 rows = no profile/inactive); drift covers both.
No object for profile_view in F2.3; F2.4 calls it from one repository function, Zod-parsing the row.

## pgTAP — `52_privacy_settings.sql`, `53_profile_view.sql`, fixtures `setup/50_profile_view_fixtures.sql`
c5: own 8 combos stored; no-WHERE UPDATE `OK:1`; `where user_id = B` `OK:0`, B unchanged; INSERT naming user_id → 42501; DELETE →
42501; A suspended/banned → SELECT 0, UPDATE `OK:0`; `'public'` → 23514, NULL → 23502. c6: the five fixtures open/true/true; count
lacking any → 0; a registration after → defaults; up → down → up leaves profiles/children/journeys equal; pre-existing rows: a
`tests/db` test seeding the five between down and up. c7/c8 (no ages): restricted → (name, NULL, 2, true, false); open → 'woman';
NULL and prefer_not_to_say as stored; output columns exactly the five. c9: as V after `set_config(target = B)`, every table and
view in nestly returns 0 of B's rows. c10: planning-only and zero journeys → (0, false, true) both states, toggle off → false;
pregnant only → (0, true, false). c11: P equals V, both states. c12: changes between two V transactions show. c13: B suspended,
banned, Professional, random uuid, `'abc'`, NULL → 0 rows, no error; V suspended/banned/pending → 0. c15: approved list =
`{nestly.profile_view(text)}`, owner app_owner, search_path fixed, EXECUTE authenticated only; `profile_view_target` by no runtime
role; the 4 policies cmd r, TO app_owner only; `rls_gate_product()` clean; GUC empty after a call.
**Amend in the same PR:** `ci/rls-gate.sql:46-52` list → `array['nestly.profile_view(text)']` · `10_identity_structure.sql` :125-127
(+3 columns), :292-293 (except the TO app_owner 4), :380-386 (definers = list), :410-414 (except profile_view) ·
`20_registration_structure.sql` :190-198 (sixteen), :203-204, :270 (13 → 16), :280-286, :326-327, :374 · `30_recovery_structure.sql:348`,
`40_link_structure.sql:278-284` (= list) · `50_profile_update.sql:46-54` (F2.1's two; file 52 owns the three).

## Gate 2 — ORCHESTRATOR (left open; DR-G1 routes to Afik)


**ORCHESTRATOR, 17.10.2026 — split.** **F2.3a (c1–c6, c16: the three settings, defaults, backfill, own-row update, screen)
approved**: three columns on `regular_profiles` with `ADD COLUMN … NOT NULL DEFAULT` (the backfill pattern above), column UPDATE
grant under the existing own-row policy, no INSERT/DELETE, the guarded rollback. Its migration carries only the settings; the read
moves to a later migration with no change to them (finding 3). **F2.3b (c7–c13, c15: `profile_view`) is reserved — DR-G1** (first
SECURITY DEFINER reading other users' rows = a security-model change) → WORKPLAN "ממתין לך"; it is not built until Afik answers.
The two QUESTIONs take their defaults (link-check-pending target visible; own id → the non-Friend view).

**Afik, 17.10.2026 (decisions.md 2026-10-17 "I2 reserved items"):** DR-G1 approved as shaped above. F2.3b (c7–c15, `profile_view`) is unblocked, with ages per DR-3 (years and months) added to the function in the same part.
