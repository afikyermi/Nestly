# schema — F2.3 profile privacy (profile-privacy)

DATA ARCHITECT, 17.10.2026. Contract: `spec.md` c7–c15, c17, Gates 1 (DR-6 A). Elevated. DR-G1: Afik approved as shaped (below). F2.3a
**as built** in `20261017120000_profile_privacy.sql` + down (design text: git `f9eb8c2`); F2.3b changes none of it.

**Change**        `profile_view(text)` (SECURITY DEFINER), invoker helpers `profile_view_target()`, `child_age_months(date, timestamptz)`,
                  4 policies `<table>_select_profile_view` TO app_owner; no table change. **Why** c7–c15 (BR-044, AC-054, OP-020), c14 (DR-3).
**Output**        0 or 1 row: full_name text · gender text (Open, else NULL) · children_count smallint · child_ages jsonb (Open, else NULL):
                  `[{"years":y,"months":m}…]` ints, m 0–11, one per child in F2.2b's display order `(created_at, slot)` (= slot order today),
                  `[]` with none · is_pregnant boolean · shows_empty_journey_sentence boolean. jsonb: two arrays must stay aligned; a
                  composite array reaches postgres-js as text. F2.4c1 Zod-parses it strictly.
**Age rule**      months = 12·Δyear + Δmonth − [day_today < day_birth], floored at 0; years = months / 12, months % 12. Equals c14's rule:
                  if day_t ≥ day_b this month's anniversary (day_b ≤ day_t ≤ month length) is past; if day_t < day_b it (day_b, or the 1st
                  of next month) is not, and last month's (day_b, or the 1st of this month) is — so 31st and 29.02 need no case. Today =
                  `timezone('Asia/Jerusalem', now())::date` (transaction start). DR-6 A: future → (0,0). **The instant is never a
                  `profile_view` parameter**: a caller choosing the date could bisect the exact birth date.
**Authorization** One point, the body of `profile_view`: caller `is_active_account()` (rule 15, auth.uid()); target active + Regular, else
                  0 rows (c13, DR-5); gender and ages behind one expression, `s.is_full`. Fence: the TO app_owner policies match only the
                  uuid in the transaction-local GUC the function sets then clears; no runtime role is in app_owner (rule 1), so a GUC V sets
                  opens nothing (c9). Helpers: no runtime EXECUTE. One uuid per call, no listing (layer 13).
**Migration**     `supabase/migrations/20261017150000_profile_view.sql`, one transaction, F2.3a-style header, `comment on` each object:
```sql
create function nestly.child_age_months(p_birth date, p_at timestamptz) returns integer
language sql stable security invoker set search_path = '' as $$
  select greatest(0, ((extract(year from t.d) - extract(year from p_birth)) * 12 + extract(month from t.d) - extract(month from p_birth)
                      - case when extract(day from t.d) < extract(day from p_birth) then 1 else 0 end)::integer)
  from (select pg_catalog.timezone('Asia/Jerusalem', p_at)::date as d) as t $$;
create function nestly.profile_view_target() returns uuid language sql stable security invoker set search_path = '' as $$
  select case when pg_catalog.current_setting('nestly.profile_view_target', true) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then pg_catalog.current_setting('nestly.profile_view_target', true)::uuid end $$;
revoke execute on function nestly.child_age_months(date, timestamptz), nestly.profile_view_target() from public;  -- no grant
create policy users_select_profile_view on nestly.users for select to app_owner using (id = (select nestly.profile_view_target()));
create policy regular_profiles_select_profile_view on nestly.regular_profiles for select to app_owner using (user_id = (select nestly.profile_view_target()));
create policy children_select_profile_view on nestly.children for select to app_owner using (user_id = (select nestly.profile_view_target()));
create policy journey_contexts_select_profile_view on nestly.journey_contexts for select to app_owner using (user_id = (select nestly.profile_view_target()));
create function nestly.profile_view(p_target text)
returns table (full_name text, gender text, children_count smallint, child_ages jsonb, is_pregnant boolean, shows_empty_journey_sentence boolean)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_target is null or p_target !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or not nestly.is_active_account() then return; end if;
  perform pg_catalog.set_config('nestly.profile_view_target', p_target, true);
  return query
    select p.full_name, case when s.is_full then p.gender end, k.n,
           case when s.is_full then (
             select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('years', a.m / 12, 'months', a.m % 12)
                                                  order by c.created_at, c.slot), '[]'::jsonb)
             from nestly.children c cross join lateral (select nestly.child_age_months(c.birth_date, pg_catalog.now()) as m) a
             where c.user_id = p.user_id) end,
           k.pregnant, (k.n = 0 and not k.pregnant and p.is_empty_journey_sentence_shown)
    from nestly.regular_profiles p
    join nestly.users u on u.id = p.user_id and u.status = 'active' and u.account_type = 'regular'
    cross join lateral (select p.profile_visibility = 'open' as is_full) s   -- F2.4c1: "or <caller and target are Friends>"
    cross join lateral (select (select count(*) from nestly.children c where c.user_id = p.user_id)::smallint as n,
      exists (select 1 from nestly.journey_contexts j where j.user_id = p.user_id and j.stage = 'pregnant') as pregnant) k
    where p.user_id = p_target::uuid;
  perform pg_catalog.set_config('nestly.profile_view_target', '', true);
end $$;
revoke execute on function nestly.profile_view(text) from public; grant execute on function nestly.profile_view(text) to authenticated;
```
**Rollback**      `supabase/rollback/20261017150000_profile_view.down.sql`, one transaction: app_owner guard → drop `profile_view(text)` → the 4
                  policies → `profile_view_target()` → `child_age_months(date, timestamptz)` → delete history row `20261017150000`. No data:
                  always safe, F2.3a untouched. **Reversible?** Yes; no new reserved item (both helpers invoker, no runtime EXECUTE).
**Backfill** none. **Indexes** none: `regular_profiles_pkey`, `users_pkey`, `children_user_id_slot_key` (prefix), `journey_contexts_user_id_
                  stage_key`; the (created_at, slot) sort is ≤ 10 rows in memory; nothing loses an index. **Integrity** no FK/cascade/key change.
**Blast radius**  Other readers of the 4 tables unchanged: the policies act only as app_owner (inside the definer; a migration reading these
                  tables with the GUC set would see the target — none does). pgTAP files below. No Drizzle object (DR-1 A).
**F2.4c1 room**   Same function and signature `(text)`, so the approved entry stands: drop + re-create (OUT columns cannot change in place),
                  re-grant, widen `s.is_full`, append the lists and state as trailing columns; its down re-creates this version.

## pgTAP — `53_profile_view.sql`, fixtures `setup/53_profile_view_fixtures.sql` (V, P, B as in spec, a writer that sets created_at)
c7: B restricted → `(דנה כהן, NULL, 2, NULL, true, false)`; `pg_get_function_result` = the six above. c8: open → 'woman'; child_ages per child =
`child_age_months(birth, now())`, נועה first; keys exactly {years, months}, ints; NULL / prefer_not_to_say gender as stored; a slot-1 child
with a later created_at (reused seat) last. c9: as V with the GUC = B, a DO loop over every table and view in `nestly` → 0 of B's rows;
both helpers → 42501 as V. c10: planning only / zero journeys → (0, `[]` open | NULL, false, true); toggle off → false; pregnant only →
(0, …, true, false). c11: P = V, both states. c12: switch between V transactions; a child added → 3 and one more age. c13: B suspended,
banned, Professional, random uuid, `'abc'`, NULL → 0 rows, no error; V suspended / banned / link-pending → 0. c14: `child_age_months` on
every c14 row — date rows at 12:00 local, the four tz instants as given — plus 2026-10-18, 2027-05-01 → 0 (DR-6), 1900-01-01 → 1521;
via `profile_view` with births relative to `timezone('Asia/Jerusalem', now())::date`: −1 y → (1,0), −1 y +1 d → (0,11), +1 d → (0,0)
(holds on any CI day, 29.02 too). c15: approved list = `{nestly.profile_view(text)}` = nestly's definers; owner app_owner; search_path
`""`; EXECUTE authenticated only (not PUBLIC, anon, app_server, app_jobs, app_recovery, service_role); helpers invoker, executable by none
of them nor authenticated; prosrc calls `child_age_months(c.birth_date, pg_catalog.now())`; the 4 policies `r`, roles {app_owner},
permissive; app_owner's members = {postgres}; `rls_gate_product()` empty; GUC '' after a call in the same transaction.
**Amend in the same PR:** `supabase/ci/rls-gate.sql:43-52` → `array['nestly.profile_view(text)']`, comment "one function: F2.3b, DR-G1" ·
`10_identity_structure.sql:288-294` exclude `%_select_profile_view` (53 asserts them); `:381-387` definers = list, count 1; `:409-415`
except `profile_view(text)` · `13_identity_account_status.sql:218-225` same · `20_registration_structure.sql:188-198` + the 4 `.r`
(sixteen); `:200-204` exclude them; `:374-377` = list; `:379-382` + child_age_months, profile_view, profile_view_target (thirteen) ·
`30_recovery_structure.sql:348-349`, `40_link_structure.sql:277-283` → "adds no definer" (the list is unchanged by them).
**Knowledge** `data-model.md` "Approved exceptions" + the block; F1.6's "stays empty" → "adds nothing to it"; "Open, under rules 16 and 17":
reads resolved by this pattern, rule-17 writes and a computed backfill still open. `data-model-tables.md`: the 4 policies, Authorization.
```
nestly.profile_view(text) — one other Regular account's profile as a non-Friend (FR-PRIV-001, BR-044, AC-054, OP-020; F2.4c1 adds the
Friend branch here): 0/1 row — full_name, gender and child_ages (jsonb [{years, months}]) only when Open, children_count, is_pregnant,
shows_empty_journey_sentence; never a child's name, sex, birth date, id or slot, a due date, a setting or a status. Caller active
(is_active_account()); target active + Regular, else 0 rows; one uuid per call. Reach: the 4 *_select_profile_view policies TO app_owner,
only the row in the transaction-local GUC nestly.profile_view_target it sets and clears; helpers profile_view_target(), child_age_months()
invoker, no runtime EXECUTE. Why: RLS hides rows, not columns — the caller's rights would expose names, birth dates, gender under Restricted.
EXECUTE authenticated; search_path ''. · Approved in .work/profile-privacy/schema.md · Afik 2026-10-17 (DR-G1, "I2 reserved items")
```

## Gate 2 — ORCHESTRATOR (records)

**ORCHESTRATOR, 17.10.2026 — split.** **F2.3a (c1–c6, c16: the three settings, defaults, backfill, own-row update, screen)
approved**: three columns on `regular_profiles` with `ADD COLUMN … NOT NULL DEFAULT` (the backfill pattern above), column UPDATE
grant under the existing own-row policy, no INSERT/DELETE, the guarded rollback. Its migration carries only the settings; the read
moves to a later migration with no change to them (finding 3). **F2.3b (c7–c13, c15: `profile_view`) is reserved — DR-G1** (first
SECURITY DEFINER reading other users' rows = a security-model change) → WORKPLAN "ממתין לך"; it is not built until Afik answers.
The two QUESTIONs take their defaults (link-check-pending target visible; own id → the non-Friend view).

**Afik, 17.10.2026 (decisions.md 2026-10-17 "I2 reserved items"):** DR-G1 approved as shaped above. F2.3b (c7–c15, `profile_view`) is unblocked, with ages per DR-3 (years and months) added to the function in the same part.

**Gate 2 (F2.3b) — ORCHESTRATOR:** open.

**Approved (F2.3b) — ORCHESTRATOR, 17.10.2026.** `profile_view(text)` with `child_ages jsonb` (completed years/months, Asia/Jerusalem,
floor 0 per DR-6 A), invoker helper `child_age_months(date, timestamptz)` without runtime EXECUTE, the instant never a parameter of
`profile_view`, `s.is_full` as the one switch F2.4c1 widens. The approved-exceptions entry goes into data-model.md in the F2.3b PR
(CRITIC validates). **Migration order rule for the rest of I2:** each part's migration takes a timestamp later than the newest one
on main when its BUILDER starts — planned numbers in the schema files are placeholders. Build order: F2.3a → F2.2b1 → F2.2b2 →
F2.3b → F2.4a → F2.4b → F2.4c1 → F2.4c2 → F2.5 → gateway key.
