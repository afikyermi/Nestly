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
