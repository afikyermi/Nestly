# notes — F2.2a journeys-children

**Approach**  Migration `20261017110000_children_update_own.sql` + down script exactly as schema.md (column UPDATE grant, own-row
policy behind `is_active_account()`, comment). `childrenUpdate` write model. The registration child rule extracted to
`packages/shared/src/validation/child.ts` (`checkChild`, `childInput`, `CHILD_ERROR_CODES`); registration step 1 now calls it, and
`checkChildWrite` (`validation/journeys.ts`) judges the add/edit body with it. Server `GET /api/journeys`, `POST /api/children`,
`PUT /api/children/:id`: route → `journeys-service` (one identity transaction each, READ COMMITTED) → `journeys-repository` (no user
WHERE; RLS confines). Web: `JourneysSection` (flow) → `JourneysContent` (one state) + `ChildFormPanel`, composed on `ProfilePage`
under the F2.1 `ProfileScreen`. API shape for TEST ENGINEER: `interface.md`.

**Decisions**
- Body = the registration child as typed, `{name, sex, birthDate:{day, month, year}}`, so the server applies literally the same
  schema (c5) and the 400 reasons are the registration codes. The server's "today" is registration's (UTC + 1 day, F1.4 Q4),
  moved to `apps/server/src/lib/server-today.ts`; the web refuses tomorrow by the device date (c4).
- POST answers 201 and PUT 200 with the **full GET shape** (journeys + children). The web replaces its state from it, so c7's new
  has_child journey shows with no second GET. Child INSERT returns `slot` only (`childrenInsert` has no id column; schema.md wrote
  `returning({id, slot})`) — the re-read gives the id. Internal how only.
- Account gate first in every transaction (`readOwnAccounts`: status + account type): none or not Regular → 404 `no_profile`,
  not active → 403. Needed before POST because a suspended INSERT would be 42501 and abort the transaction. Journeys sorted by
  JOURNEY_STAGES order in the service (c1's order), not by SQL.
- `ChildrenFull` is thrown inside the add transaction so step 2 (has_child) rolls back with it, then mapped to 409 outside.
  >10 lost rounds → `JourneysFault` → 500.
- PUT check order: id (`z.guid()` → 404, no query) → body (400) → gate → update (0 rows → 404 `not_found`).
- `routerOptions.maxParamLength = 16 KiB` in `buildApp` (finding from TE): the router answered a long id 414 with a body that quotes
  the URL. Now any id reaches the handler → 404. First parametric route in the app, so no other route changes.
- Journey/child texts (stage labels, sex labels, field labels, child ERR-003 texts, the limit text, "date not real") moved from
  the registration feature to `apps/web/src/lib/child-fields.ts` (a feature never imports another); registration reads them, same
  output. STAGE_OPTIONS now maps JOURNEY_STAGES (same order, same labels).
- One form at a time: while a form is open, the other "עריכה" buttons and "הוספת ילד" are not rendered (no silent discard of typed
  input). The edit form replaces its child's row; the add form replaces the add button.
- "עריכה" keeps the accessible name "עריכה" (spec text, label-in-name) and gets `aria-describedby` → the child's row text, so a
  screen reader hears which child.
- 409 on add (another tab filled the tenth slot) → the form's alert reads "אפשר להוסיף עד 10 ילדים" (the c6 text) instead of the
  generic save failure.
- Dates shown as DD.MM.YYYY by splitting the ISO string (a calendar date, no zone), like registration's range text — not `Intl`.

**Deviations**  none from spec.md. From schema.md: insert RETURNING `slot` instead of `{id, slot}` (above); internal.

**Deliberately not done**  No test files (TEST ENGINEER). No visual baselines (CI's `update-baselines`). F2.2b (c14+). SRS texts for
Q1 (ORCHESTRATOR at I2's close). Knowledge files `data-model.md` / `data-model-tables.md` (DATA ARCHITECT, per schema.md).

**Uncertain**
- Loading text "טוענים את פרטי המסע" and saving "שומרים" are not written in the spec (Q1 covers written copy only); they follow
  F2.1's pattern ("טוענים את הפרופיל", "שומרים"). Record at I2's close or change.
- No body-level limit beyond Fastify's default 1 MiB; the raw Zod bounds cap the work (as F2.1).
- Two `role=status` regions on the profile page (F2.1's and this section's); both say "הפרטים נשמרו" only for their own save.

**Local checks** (final tree, TE's commit 3aeaa2c included)  typecheck · lint · check:budgets · check:stories green. Unit: server
577/577 (TE's `journeys-route.test.ts` 31/31), shared 288/288, web 1042/1042. DB on the local PG16 stand-in (port 54322, scratchpad
`localdb.sh`): migration up → down → up OK (fingerprint restored), drift none (119 columns / 9 tables), pgTAP all green incl. TE's 51
and the amended 10/20/22, except 01/02 (PG16 has no MAINTAIN, known). Server `test:db`: `children.db.test.ts` 70/70 (concurrency
9+2, 5+2 and c7 atomicity included); whole suite 374/374 on two of three runs, see Neighbouring. Browser (scratch config,
preinstalled Chromium 1194): `e2e/journeys.spec.ts` + `e2e/profile.spec.ts` 103/103 (axe included; the visual-screens test was not run
— no baselines yet). test:tools 1249/1250 (below).

**FINDING for TEST ENGINEER (not edited)**  `tools/db-workflows.test.mjs` "[F1.1-b c2] every pgTAP file … tags its tests" fails:
`51_children_write.sql: no test name carries a [Fn.n-x cN] tag` (the same pattern as F2.1's file 50).

**Preview path**  After the batched migration: sign in as a Regular parent registered with children → "פרופיל" → below the profile,
"המסע שלי" lists the journeys and children → "הוספת ילד" → "רוני", "עוד לא ידוע", 12.8.2026 (not in the future) → "שמירה" →
"הפרטים נשמרו", the child last → reload: same. Child "עריכה" → change the name → "שמירה" → new name, same order → reload. Empty name →
"שמירה" → "יש למלא שם", focus on the field. Without the migration on the preview DB, PUT is 500 (fails closed); GET and POST work.

**Neighbouring**  `apps/server/tests/db/recovery-store.db.test.ts` (F1.6) failed intermittently on the local stand-in, 1 of 3 runs
of the whole db suite — `[F1.6 c21 concurrency] two newer claimants racing…` (`SyntaxError: No number after minus sign in JSON`,
`:397`) and `[F1.6 c5] B cannot change A's answers…` (`:675`, state hash differs). Untouched by this part; may be local-timing only.

---

# notes — F2.2b1 journeys-children (c14, c15)

**Approach**  Migration `20261017140000_journey_due_date_update.sql` + down script as schema.md "b1 up" / "Rollback" (column UPDATE
grant on due_date, `journey_contexts_update_own` with `stage = 'pregnant'` in USING and WITH CHECK, policy comment, table comment;
the down restores the 20261014200000 table comment). Write model `journeyContextsUpdate`. The registration due-date rule extracted to
`packages/shared/src/validation/due-date.ts` (`checkDueDate`, `DUE_DATE_ERROR_CODES`); registration step 1 calls it, and
`checkDueDateWrite` (`validation/journeys.ts`) judges the strict `{dueDate:{day,month,year}}` body. Server `POST /api/journeys`
(201, 409 `stage_conflict`) and `PUT /api/journeys/:id` (200, 404): route → `addOwnPregnancy` / `editOwnDueDate` → repository
(`insertPregnantJourney` untargeted ON CONFLICT DO NOTHING; `updateOwnDueDate` by id, RLS confines). Web: `PregnancyFormPanel`,
the pregnancy row's "עריכה", "הוספת הריון"; the section's form state is now a union (`OpenForm` = child | pregnancy, `kind`).
Shape for TEST ENGINEER: `interface.md`, F2.2b1 part.

**Decisions**
- **Server VAL-044 window (ORCHESTRATOR ruling, spec.md last block, TEST ENGINEER finding 1):** `checkDueDate(parts, today,
  earliestToday = today)` — lower bound on `earliestToday`, upper on `today`. The server passes `serverEarliestToday` (UTC date,
  new in `lib/server-today.ts`) and `serverToday` (UTC + 1): accepts UTC −30 … UTC + 301. The web passes the device date for both
  (−30 / +300). The same call in `createRegistrationStep1Schema` / `createRegistrationRequestSchema` (optional second argument), so
  registration (F1.4) gets the fix — the escape. **F1.4 behaviour change:** only this: the server now also accepts a due date of
  UTC date − 30 (it refused it before). The upper bound, the child rules, the web registration form and every code are unchanged.
- A stage conflict throws `StageConflict` inside the transaction (rollback), mapped to 409 outside — the shape b2's planning → pregnant
  needs (a planning delete before the insert must roll back). In b1 nothing precedes the insert.
- POST insert RETURNING `stage` (`journeyContextsInsert` has no id); the re-read gives the id. Internal.
- "הוספת הריון" only with neither planning nor pregnant (`canAddPregnancy`); with planning it is b2's confirmation (c16/c23).
  409 `stage_conflict` on the web (CRITIC low, fixed): the form closes and a GET refreshes the view with no error, as c25's Q3
  pattern for 404; focus → the pregnancy's "עריכה", else "הוספת הריון" while offered, else "הוספת ילד". A failed refresh keeps the
  form with the generic save failure (401/403 refresh → recheck / ERR-037 as usual). Story `AddPregnancyConflict`.
- The pregnancy edit form opens **below the journeys card** (not inside it: a card in a card), the row stays with its stored value
  and no buttons; the add form replaces "הוספת הריון". Focus on open → the day field; after a save → the pregnancy's "עריכה" (after an
  add, the new pregnancy's); after cancel → the opener.
- The pregnancy's "עריכה" keeps the accessible name "עריכה" with `aria-describedby` → the row text, like a child's. Two "עריכה"
  buttons are now possible; my flow stories select by description.
- Due-date texts and the legend moved from `features/registration` to `lib/child-fields.ts` (`dueDateErrorTexts`,
  `DUE_DATE_FIELD_LABEL`); registration reads them.
- Optional marker (ORCHESTRATOR, after CRITIC): `DateInput` gains `optional`, rendering FormField's "(לא חובה)" in its lighter
  style (`font-normal text-muted-foreground`), with a real space instead of FormField's `ms-1` so the group's accessible name stays
  exactly "תאריך לידה משוער (לא חובה)" (TEST ENGINEER's locators). Used by the pregnancy form **and registration step 1's due date**,
  which rendered it bold too. New story `shared/DateInput` `Optional`. Screens that change: `pregnancy-form`,
  `pregnancy-form-errors` (and registration step 1 with "בהריון" ticked — not in `visual-screens.ts`).
- Focus target `name` renamed `field` (first input of whichever form is open).

**Deviations**  none from spec.md / schema.md beyond the ruling above.

**Deliberately not done**  No test files; no baselines — `journey-view` changes (the pregnancy row gets "עריכה"), and three new
entries (`pregnancy-form`, `pregnancy-form-errors`, `journey-view-add-pregnancy`) need CI's `update-baselines`. b2 (lock, deletes,
birth, planning → pregnant). Knowledge files (DATA ARCHITECT). SRS (I2 close). escapes.md line for the F1.4 escape (ORCHESTRATOR).

**Uncertain**
- `PregnancyFormPanel` repeats ChildFormPanel's footer (Save/Cancel) and failure slot; two uses, below the extraction threshold.
- The `PregnancyFormErrors` story fixes "today" at 2026-10-17 for the text; it shows the partial text, so no date drifts in the baseline.

**Local checks**  typecheck · lint · check:budgets · check:stories green. Unit: server 620/620, web 1042/1042, shared 288/288 (one
run of three: `registration-credentials.test.ts` "5 MB … refused fast" took 105 ms > 100 — timing, untouched code). DB stand-in (PG16,
scratchpad `localdb.sh`): up → down → up OK, drift none (127 columns / 9 tables), pgTAP green incl. TE's 54 and amended 10/20/22/51,
except 01/02 (no MAINTAIN on PG16, known). Server db suite: 481 passed after the ruling (journeys.db.test.ts green); one run had the
known F1.6 `recovery-store` race flake, green on rerun. Browser (scratch config, Chromium 1194, 2 workers): `journeys.spec.ts` +
`profile.spec.ts` 134/134 before the ruling; after TE's commit c94a89a, `journeys.spec.ts` + `journeys-pregnancy.spec.ts` +
`register-step1.spec.ts` 105/105. Server unit 620/620 and the db suite (TE's registration escape test included) green on c94a89a. With 4 workers the preview server dropped
(ERR_CONNECTION_REFUSED) — local resources only.

**Preview path**  After the batched migration: Regular parent with has_child only → "פרופיל" → "המסע שלי" → "הוספת הריון" → leave the
date empty → "שמירה" → "בהריון · תאריך לידה משוער: לא צוין" above "יש לנו ילד או ילדה", no "הוספת הריון" → the pregnancy's "עריכה" →
type a date within the window → "שמירה" → shown → reload: same → "עריכה" → day only → "שמירה" → "יש להשלים את התאריך או להשאיר
אותו ריק". Without the migration, PUT /api/journeys/:id is 500 (fails closed); POST works.

**After CRITIC (409 + marker)**  typecheck · lint · check:stories green; web unit 1042/1042; browser `journeys.spec.ts` +
`journeys-pregnancy.spec.ts` + `register-step1.spec.ts` + `part-d.spec.ts` 152/152. The `AddPregnancyConflict` play function was
not run locally (no story-play runner in this repo's local checks); the Storybook build includes it.

**Neighbouring**  `packages/shared/tests/registration-credentials.test.ts` 100 ms timing bounds flake under load (above).

---

# notes — F2.2b2 journeys-children (c16–c26)

**Approach**  Migration `20261017141000_journeys_children_delete_own.sql` + down script exactly as schema.md "b2 up" / "Rollback". Server:
`DELETE /api/children/:id`, `DELETE /api/journeys/:id`, `POST /api/journeys/:id/birth`; `POST /api/journeys` takes `endPlanning: true`.
Service: `gateAndLock` (gate, then `regular_profiles … for no key update`, exactly one row else `JourneysFault`) first in every write
that inserts or deletes a child or journey — `addOwnChild` and `addOwnPregnancy` included (approved internal change to F2.2a/b1);
`removeOwnChild` (R), `endOwnPregnancy` (E), `recordOwnBirth` (B: delete pregnant, then the add rounds extracted from `addOwnChild` as
`addChildRounds`). Children read `ORDER BY created_at, slot`. Web: `ConfirmDialog` (new shared component on Radix AlertDialog via
`ui/dialog.tsx` `AlertPanel`), the confirmation as a third `OpenForm` kind (`confirm`), the birth form as child-form mode `birth`.
Shape for TEST ENGINEER: `interface.md`, F2.2b2 part.

**Decisions**
- **Confirmation flag name:** `endPlanning: true` (strict: `true` or absent; `false` → 400 `invalid_body`). Not on PUT.
- **Planning → pregnant flow:** "הוספת הריון" with planning → the c16 dialog → its confirm sends nothing and opens the c14/c15 pregnancy
  form; that form's save carries `endPlanning`. So the due date can still be given (c15), and "ביטול" on either step keeps planning.
  The planning dialog's confirm label is "הוספת הריון" (no spec text for confirm labels; the others repeat the action: "הסרה",
  "סיום מסלול ההריון"). Q1 — record at I2 close.
- **Dialog title/description split:** the spec's single line "להסיר את נועה? הפרטים יימחקו…" is the title (question, the name) + the
  description (the warning), so the dialog is named by its question (c26). Planning has the line as title only.
- **DELETE body:** `request.body !== undefined` → 400 `invalid_body` on both DELETEs (c20 names the pregnancy one; the child one follows
  the same rule). A non-JSON body is Fastify's 415, as elsewhere. The web sends neither body nor content type.
- **Birth focus/404:** after a birth, focus goes to the h2 (the opener is gone, as after a delete). A 404 on birth follows Q3 (refresh,
  close, no error), since the pregnancy is gone. 409 shows the c6 text in the form.
- **c24 on the web:** a 403 closes the dialog and replaces the section with ERR-037 (the GET 403 view); a 401 closes it and rechecks.
  Forms keep their F2.2a behaviour (ERR-037 in the form).
- **Behind the dialog** the view stays drawn with its buttons (a form hides them; a dialog does not), so "the item still shown" (c25)
  and focus can return to the opener on cancel. Status "שומרים" during a confirm is under Radix's aria-hidden; the dialog's own
  pending button and alert carry it.
- `canAddPregnancy` now means "no pregnancy stored"; `hasPlanning` picks dialog vs form.
- New shared component registered in `tools/check-stories.mjs` STATES (`shared/confirm-dialog`: 4), as that file's header requires.

**Deviations**  none from spec.md / schema.md.

**Deliberately not done**  No test files; no baselines (new entries and the changed ones listed in interface.md need CI's
`update-baselines`). Knowledge files (DATA ARCHITECT). SRS (I2 close). No confirmation on the birth (c16 lists three dialogs only).

**Uncertain**
- I could not run axe or the new Storybook play functions locally on the new screens: the guard refuses a scratch spec file from
  BUILDER (correctly). TEST ENGINEER's browser specs are the first check of `journey-confirm*`, `journey-view-none`, `birth-form`.
- The pregnancy row's three buttons wrap under its text on phone width; looks right in my reading of the classes, not seen in a
  screenshot.
- Radix AlertDialog's `aria-modal` is set by me explicitly; Radix also hides the rest of the page (aria-hidden). Focus return after
  close relies on `onCloseAutoFocus` + the section's focus tick both pointing at the same element.

**Local checks**  typecheck · lint · check:budgets · check:stories green. Unit: shared 288/288, server 620/620, web 1042/1042. DB
stand-in (PG16, scratchpad `localdb.sh`): up → down → up OK, drift none (127 columns / 9 tables); pgTAP all green with TE's
in-progress 10/20/22/51/54 in the tree, except 01/02 (no MAINTAIN on PG16, known). Server db: `journeys.db.test.ts`,
`journeys-remove.db.test.ts` (TE's, uncommitted), `children.db.test.ts` 183/183. Storybook build OK. Browser (scratch config,
Chromium 1194, 2 workers): `journeys.spec.ts` + `journeys-pregnancy.spec.ts` 87/87.

**Preview path**  After the batched migration: parent with has_child + 2 children + pregnancy → "פרופיל" → "המסע שלי" → a child's
"הסרה" → dialog "להסיר את <name>?", focus on "ביטול" → Escape → nothing changed, focus on "הסרה" → again → "הסרה" → child gone,
"הפרטים נשמרו", focus on "המסע שלי" → reload: gone. Pregnancy "סיום מסלול ההריון" → confirm → no pregnancy, "הוספת הריון" offered →
add one → "הלידה התרחשה" → fill a child → "שמירה" → child last, no pregnancy. Remove all children → has_child gone →
"עוד לא נבחר שלב במסע". A planning-only parent: "הוספת הריון" → "מסלול 'מתכננים' יסתיים ויימחק" → "הוספת הריון" → form → "שמירה" →
"בהריון" only. Without the migration: every DELETE and the birth are 500 (fail closed); the lock needs only F2.1's grant.

**Neighbouring**  none new.
