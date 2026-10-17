# interface — F2.2a journeys-children, for TEST ENGINEER

## Server — `apps/server/src/routes/journeys.ts` (registered in `buildApp`, `apps/server/src/app.ts`)

Protected: no/invalid token → 401 `{error:'unauthenticated'}` + `www-authenticate: Bearer`, from the auth hook, before any handler and
any transaction (c10). Every answer of the three routes carries `cache-control: no-store`. No user id in path, query or body.

| Route | Body | Answers |
|---|---|---|
| `GET /api/journeys` | — | 200 `OwnJourneys` (below) · 403 `{error:'account_unavailable'}` (suspended/banned) · 404 `{error:'no_profile'}` (no users row; also a non-Regular account) · 401 stale / 503 pending (session guard) · 503 `{error:'unavailable'}` (transient DB failure, no DB configured) · 500 `{error:'internal'}` |
| `POST /api/children` | strict `{ name: string, sex: string, birthDate: { day: string, month: string, year: string } }` — the registration child as typed | **201 `OwnJourneys` after the add** (the full GET shape, the new child last; has_child included when it was created, c7) · 400 `{error:'invalid', reason}` before any DB work · 409 `{error:'children_too_many'}` (10 stored; nothing written) · 403 / 404 `no_profile` (nothing created) / 401 / 503 / 500 as GET |
| `PUT /api/children/:id` | the same body | **200 `OwnJourneys` after the edit** (order unchanged) · 404 `{error:'not_found'}` (not a uuid's text form, any length — no query; B's id; an unknown id) · 400 / 403 / 404 `no_profile` / 401 / 503 / 500 as POST |
| other methods | — | 405 `{error:'method_not_allowed'}`, `allow`: `GET` on `/api/journeys`, `POST` on `/api/children`, `PUT` on `/api/children/:id` (after auth) |

`OwnJourneys` (`ownJourneysResponse`, `packages/shared/src/validation/journeys.ts`):
`{ journeys: [{ id: string, stage: 'planning'|'pregnant'|'has_child', dueDate: 'YYYY-MM-DD'|null }], children: [{ id: string, name: string, sex: 'boy'|'girl'|'unknown', birthDate: 'YYYY-MM-DD' }] }`.
Journeys in JOURNEY_STAGES order (planning, pregnant, has_child); children by slot. Names stored space-trimmed.

Order of checks on PUT: id (404) → body (400) → account gate (403/404 no_profile) → update (404 not_found when 0 rows).
POST/PUT bodies are judged against the server's date: UTC date **plus one day** of tolerance (`lib/server-today.ts`, the
registration rule F1.4 Q4) — so tomorrow-UTC is accepted by the server, while the web refuses tomorrow by the device date.

`reason` (`CHILD_WRITE_REASONS`): `child_name_required` · `child_name_length` (> 60 code points after trim; raw > 600 UTF-16 units) ·
`child_sex_required` (`''`) · `child_sex_invalid` (not boy/girl/unknown; raw > 32) · `birth_date_required` (empty or partial) ·
`birth_date_invalid` (not a real date, non-digits; a part > 32 units) · `birth_date_future` · `birth_date_out_of_range` (< 1900-01-01) ·
`invalid_body` (any unknown key — `userId`, `user_id`, `slot`, `id` —, a missing field, a non-string, a non-object). The first field
issue in the order name, sex, birth date. A non-JSON body → 400 `{error:'bad_request'}` (global handler) / 415.

Shared: `checkChild(input, today)` (all field issues; used by registration step 1 and the web form), `checkChildWrite(body, today) →
{ok:true, value:{name, sex, birthDate}} | {ok:false, reason}`, `childInput`, `childPathParams` (`z.guid()`), `CHILD_ERROR_CODES`, types
`ChildInput`, `ChildIssue`, `OwnJourneys`, `OwnJourney`, `OwnChild`, `RegistrationChild` (moved here from registration-step1).

Layers: route → `services/journeys-service.ts` (`readOwnJourneysAndChildren`, `addOwnChild`, `editOwnChild`; one identity transaction
each, READ COMMITTED; gate = `readOwnAccounts` status + account type first) → `repositories/journeys-repository.ts` (reads with no
WHERE; slot pick: read slots → lowest free of 1..10 (none → throw, rollback, 409) → has_child INSERT … ON CONFLICT DO NOTHING
(untargeted, every add) → child INSERT … ON CONFLICT DO NOTHING RETURNING slot; 0 rows → next round, ≤ 10 rounds then 500;
edit: `update(childrenUpdate).set(...).where(id).returning(id)`). Write model `childrenUpdate` in `apps/server/src/db/schema.ts`.

Logs (fixed lines, `{sqlstate}` only): `journeys read failed` · `child add failed` · `child edit failed`. Request line is method +
route pattern. Name, sex, dates, stage, token, ids and the body are never logged (c11). Test seam: `buildApp({ database, logStream, clock })`.
App option: `routerOptions.maxParamLength = 16 KiB`, so a long id reaches the handler (404), never the router's 414.

## Database — `supabase/migrations/20261017110000_children_update_own.sql`

`grant update (name, sex, birth_date) on nestly.children to authenticated` · policy `children_update_own` (for update, to authenticated,
USING and WITH CHECK `user_id = (select auth.uid()) and (select nestly.is_active_account())`) · policy comment.
Down: `supabase/rollback/20261017110000_children_update_own.down.sql` (app_owner guard; drop policy, revoke, history row).

## Web — section "המסע שלי" on `PATHS.profile` (`/profile`), below the F2.1 profile

Page `apps/web/src/pages/profile/ProfilePage.tsx` composes `ProfileScreen` and `apps/web/src/features/journeys/JourneysSection.tsx`
(container) → `JourneysContent.tsx` (one state) + `ChildFormPanel.tsx`; texts and form check in `journeys-form.ts`; shared texts in
`apps/web/src/lib/child-fields.ts`. API: `apps/web/src/services/api/journeys.ts` — `fetchOwnJourneys(token)`, `addOwnChild(token, form)`,
`saveOwnChild(token, id, form)`; the form is sent as typed (`ChildInput`). Each feature loads and fails on its own.

`<section aria-labelledby>` with h2 "המסע שלי" (`data-testid="journeys"`), one `role=status` (`journeys-status`).

| State | What renders |
|---|---|
| loading (`journeys-loading`) | skeletons (aria-hidden) + status "טוענים את פרטי המסע"; no rows, no buttons |
| load failed (`journeys-load-failed`) | alert "לא הצלחנו לטעון את פרטי המסע. אפשר לנסות שוב" + "נסו שוב" (repeats GET). 403: ERR-037 text, no retry, `recheck()` |
| view (`journeys-view`) | `journeys-list` rows (`journey-row`): "מתכננים" · "בהריון · תאריך לידה משוער: 01.03.2027" (null → "לא צוין") · "יש לנו ילד או ילדה". `children-list` rows (`child-row`): "<bdi>נועה</bdi> · בת · 04.05.2023" + button "עריכה" (`aria-describedby` → the row text; name stays "עריכה"). Then "הוספת ילד" |
| limit | 10 children: "הוספת ילד" `aria-disabled=true` + `aria-describedby` → "אפשר להוסיף עד 10 ילדים"; a press does nothing |
| form (`child-form`) | add: in place of "הוספת ילד"; edit: in place of that child's row. "שם", "מין" (select: "בחירה", בן, בת, עוד לא ידוע), fieldset "תאריך לידה" (יום, חודש, שנה), "שמירה", "ביטול". While open, no other "עריכה" / "הוספת ילד" is shown. Focus to the name on open |
| form errors | after the first "שמירה" only, live after that; texts as registration; focus to the first `aria-invalid` field; nothing sent |
| saving | "שמירה" `aria-disabled` + loader, status "שומרים"; a second press sends nothing |
| save failed | form keeps its input; alert "השמירה לא הצליחה. אפשר לנסות שוב" (5xx, network, 400, 404, null token); 409 → alert "אפשר להוסיף עד 10 ילדים"; 403 → ERR-037 + recheck; 401 → recheck (ERR-038) |
| saved | form closes, view from the answer, status "הפרטים נשמרו" visible; focus to the opening button ("הוספת ילד" or that child's "עריכה") |

**Stories.** `apps/web/src/features/journeys/JourneysContent.stories.tsx` (title `features/journeys/JourneysContent`): `JourneyView`,
`JourneyViewNoDueDate`, `JourneyViewEmpty`, `Saved`, `Loading`, `JourneyLoadFailed`, `AccountStopped`, `ChildForm`, `ChildFormEdit`,
`ChildFormErrors`, `ChildrenLimit`, `Saving`, `JourneySaveFailed`. Flows: `JourneysSection.stories.tsx` — `Loaded`,
`LoadFailsThenRetries`, `AddChild`, `SaveWithErrors`, `EditFails`. `e2e/visual-screens.ts` entries: `journey-view`,
`journey-view-empty`, `journey-load-failed`, `child-form`, `child-form-errors`, `children-limit`, `journey-save-failed`
(ids `features-journeys-journeyscontent--<same>`).

---

# interface — F2.2b1 (c14, c15): add a pregnancy, edit its due date

## Server — `apps/server/src/routes/journeys.ts`

Same auth, `cache-control: no-store`, gate, logs and error answers as F2.2a. No user id anywhere; a journey is named by its row id.

| Route | Body | Answers |
|---|---|---|
| `POST /api/journeys` | strict `{ dueDate: { day: string, month: string, year: string } }` — all three `''` = no due date | **201 `OwnJourneys`** after the add (pregnant in JOURNEY_STAGES order) · 400 `{error:'invalid', reason}` before any DB work · **409 `{error:'stage_conflict'}`** (a pregnant or a planning journey exists; nothing written) · 403 / 404 `no_profile` / 401 / 503 / 500 as F2.2a |
| `PUT /api/journeys/:id` | the same body | **200 `OwnJourneys`** after the edit · 404 `{error:'not_found'}` (not a uuid — no query; B's id; unknown id; a planning or has_child id — the policy admits pregnant rows only) · 400 / 403 / 404 `no_profile` / 401 / 503 / 500 as POST |
| other methods | — | 405 `{error:'method_not_allowed'}`; `allow`: `GET, POST` on `/api/journeys`, `PUT` on `/api/journeys/:id` |

Check order on PUT: id (404) → body (400) → gate (403 / 404 no_profile) → update (0 rows → 404 not_found). POST: body → gate → insert.
`reason` (`DUE_DATE_WRITE_REASONS`): `due_date_partial` (one or two parts empty) · `due_date_invalid` (not a real date, non-digits,
a part > 32 UTF-16 units) · `due_date_out_of_range` · `invalid_body` (unknown key — `userId`, `user_id`, `stage`, `id` —, missing
`dueDate`, a non-string part, a non-object). The window is registration's (VAL-044, `checkDueDate`): `today − 30 ≤ due ≤ today + 300`,
on the server (ORCHESTRATOR ruling, spec.md last block) the lower bound is on the UTC date (`serverEarliestToday`) and the upper on `serverToday` (UTC date + 1, F1.4 Q4): **UTC date −30 .. UTC date + 301** accepted, −31 and +302 refused. Registration step 1 uses the same window.
The web judges by the device's local date (−30 .. +300).

Logs (fixed lines, `{sqlstate}` only): `pregnancy add failed` · `due date edit failed`. No date, stage or id is logged.

Layers: `journeys-service.ts` `addOwnPregnancy(db, identity, dueDate | null)` (gate → insert pregnant `ON CONFLICT DO NOTHING`
untargeted, `RETURNING id`; 0 rows → `StageConflict` thrown → rollback → 409) · `editOwnDueDate(db, identity, id, dueDate | null)`
(gate → `update(journeyContextsUpdate).set({dueDate}).where(id).returning(id)`; 0 → 404). No profile-row lock in b1 (b2).
Write model `journeyContextsUpdate` (`id` for WHERE only, `dueDate`) in `apps/server/src/db/schema.ts`.

Shared (`packages/shared/src/validation/`): `due-date.ts` — `checkDueDate(parts, today, earliestToday = today) → {ok:true, value: 'YYYY-MM-DD' | null} |
{ok:false, code}`, `DUE_DATE_ERROR_CODES`, `DueDateErrorCode` (registration step 1 now calls it) · `journeys.ts` — `dueDateInput`
(strict body), `checkDueDateWrite(body, today, earliestToday = today) → {ok:true, value: string | null} | {ok:false, reason}`, `DUE_DATE_WRITE_REASONS`,
`journeyPathParams` (`z.guid()`), type `DueDateInput`.

## Database — `supabase/migrations/20261017140000_journey_due_date_update.sql`

`grant update (due_date) on nestly.journey_contexts to authenticated` · policy `journey_contexts_update_own` (for update, to
authenticated; USING and WITH CHECK `user_id = (select auth.uid()) and stage = 'pregnant' and (select nestly.is_active_account())`)
· policy comment · table comment redefined. Down: `supabase/rollback/20261017140000_journey_due_date_update.down.sql`.

## Web — "המסע שלי"

| State | What renders |
|---|---|
| view | the pregnancy row (`journey-row`) gets a button "עריכה" (`data-journeys-edit-journey=<id>`, `aria-describedby` → the row text). With neither planning nor pregnant: a button "הוספת הריון" (`data-journeys-add-pregnancy`) under "הוספת ילד". With planning or pregnant: not rendered |
| pregnancy form (`pregnancy-form`) | edit: in place of the pregnancy row, filled from the stored date (empty when null); add: in place of "הוספת הריון", empty. Fieldset "תאריך לידה משוער (לא חובה)" (יום, חודש, שנה), "שמירה", "ביטול". While any form is open no other action shows. Focus to the day field on open |
| pregnancy form errors | after the first "שמירה" only, then live: partial → "יש להשלים את התאריך או להשאיר אותו ריק"; not real → the registration "date does not exist" text; out of range → "התאריך צריך להיות בין D.M.YYYY ל-D.M.YYYY" (registration's, today −30 / +300); focus to the first `aria-invalid` field; nothing sent. All cleared → saved as null |
| saving / save failed / saved | as the child form. 409 `stage_conflict` → the form closes and GET refreshes the view, no error (Q3 pattern; CRITIC low), focus to the pregnancy's "עריכה" (else "הוספת הריון" / "הוספת ילד"); a failed refresh → the generic save failure, form kept; 404 → the generic save failure; 403 → ERR-037 + recheck; 401 → recheck. Saved → focus to the opening button (the pregnancy's "עריכה"; after an add, the new pregnancy's "עריכה") |

API client: `apps/web/src/services/api/journeys.ts` — `addOwnPregnancy(token, dueDate)`, `saveOwnDueDate(token, id, dueDate)`
(`dueDate` = the three parts as typed). Outcome gains `{kind:'stage-conflict'}` (409 `stage_conflict`).
Stories (`JourneysContent.stories.tsx`): `PregnancyForm`, `PregnancyFormAdd`, `PregnancyFormErrors`, `JourneyViewAddPregnancy`.
Flow stories (`JourneysSection.stories.tsx`): `EditDueDate`, `AddPregnancy`, `AddPregnancyConflict`. `e2e/visual-screens.ts`: `pregnancy-form`,
`pregnancy-form-errors`, `journey-view-add-pregnancy`.
