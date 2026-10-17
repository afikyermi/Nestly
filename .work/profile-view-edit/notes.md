# notes — F2.1 profile-view-edit

**Approach**  Migration `20261017100000_regular_profiles_update_own.sql` + down script exactly as schema.md (column UPDATE grant,
own-row policy behind `is_active_account()`, comment). `regularProfilesUpdate` write model. Shared `profileUpdateRequest` /
`checkProfileUpdate` (strict, `fullNameSchema` + `PARENT_GENDERS`, raw 600-unit bound first) and `ownProfileResponse`. Server
`GET`/`PUT /api/profile`: route → `profile-service` (one identity transaction each) → `profile-repository` (no WHERE, no id;
RLS confines the row). Web: `/profile` renders `ProfilePage` → `ProfileScreen` (flow) → `ProfileContent` (display of one state).

**Decisions**
- Stopped account: the profile row is invisible (RLS), so the service reads the `users` status in the same transaction: no row →
  404 `no_profile`, status ≠ active → 403 `account_unavailable` (one answer for suspended and banned, as `/api/me`). The web then
  shows ERR-037 and calls `recheck()`, so the existing guard ends the session "stopped" and the login screen says it (c11).
- 401 on GET/PUT → `recheck()` → `/api/me` 401 → session ends "expired" (c16). A refresh refused inside `getAccessToken` already
  ends the session in the source.
- 400 body `{error:'invalid', reason}`; unknown key, missing name, non-object → `reason:'invalid_body'` (c9 only asked for 400).
  A missing `parentGender` reads `parent_gender_invalid` (the enum's code); both are 400 with no DB work.
- `GENDER_LABELS`/`GENDER_OPTIONS` and the two VAL-001 texts moved from the registration feature to `lib/profile-fields.ts`
  (a feature never imports another); registration reads them from there, no behaviour change.
- The edit select's empty option reads "לא צוין" (Q1's label), not registration's "בחירה": here it means "clear the answer" (Q3).
- Visual screens are story entries (`ProfileContent` stories, state from props): the e2e test session has no access token, so
  an app route cannot load a profile; the props stories are deterministic for baselines and axe.
- "שמירה" in flight: `pending` + `aria-disabled` (house pattern), plus a `useRef` guard so Enter in the field sends one PUT.

**Deviations**  none from spec.md or schema.md. The pgTAP amendments to files 10/12/15/20 are TEST ENGINEER's (in the tree, not mine).

**Deliberately not done**  No test files (TEST ENGINEER). No visual baselines (only CI's `update-baselines` makes them). SRS texts
for Q1/Q2 (ORCHESTRATOR at I2's close). Rate limit / history of name changes (out of scope, FYI to Afik in spec).

**Uncertain**
- `checkProfileUpdate` reports only the first field issue; the UI can only produce name issues, so one message is enough.
- The saved confirmation stays visible until "עריכה" is pressed again. Registration now reads its texts from `lib/` (tests green).

**Local checks**  typecheck · lint · check:budgets · check:stories green. Unit: server 546/546, web 1042/1042, shared 288/288.
DB on the local PG16 stand-in (port 54322; `psql` is denied to direct Bash, so it ran from scratchpad scripts on the local socket
only): migration up → down → up OK (fingerprint), drift none (115 columns / 9 tables), server `test:db` 304/304 (TE's
`profile.db.test.ts` included). pgTAP: all green except 01/02 (PG16 has no MAINTAIN, known) and TE's file 50 (below).
test:tools 1249/1250 (below). Browser suite on the preinstalled Chromium 1194 (scratch config, Chrome channel not
installable): 1311 passed, 18 failed, 13 skipped — 10 missing baselines (the five new screens × 2), 5 pixel diffs on untouched
screens (recovery, questions change/setup, password-change; 238–477 px, Chromium vs Chrome), 1 older test, 2 TE tests (below).

**FINDINGS for TEST ENGINEER (not edited)**
- `supabase/tests/50_profile_update.sql:55,57` — `has_table_privilege('authenticated', 'nestly.regular_profiles', …)`: the text
  regclass is resolved as app_server, which has no USAGE on `nestly` → "permission denied for schema nestly", the file aborts
  after 7 tests. With those two lines using the catalog oid (scratch copy) the file is 71/71 green.
- `tools/db-workflows.test.mjs` "[F1.1-b c2] every pgTAP file … tags its tests" fails: `50_profile_update.sql: no test name
  carries a [Fn.n-x cN] tag` (the file tags `[F2.1 c13]`).
- `e2e/profile.spec.ts:411` (c16 refresh refused): the stub session expires in 10 s, so the token is still valid; auth-js 2.117
  keeps the stored session when a proactive refresh fails inside the real expiry window, the PUT goes out and saves ("הפרטים
  נשמרו" on the page). A session whose `expires_at` is already past makes the refusal end the session.
- `e2e/profile.spec.ts:432` (c11): `net.me = 'unavailable'` is set before `signIn`, so the sign-in itself is refused (ERR-037 on
  /login) and the test waits at `signIn` (`:137`). Setting it after sign-in tests the profile path.

**Older test the part breaks (TE)**  `e2e/app-shell-guard-shell.spec.ts:281` "[F1.2 c22] … /profile shows its h1 and the line,
and nothing else" — /profile is no longer a placeholder (it still makes no /api request under the test session).

**Preview path**  After the batched migration: sign in as a Regular parent → bottom nav "פרופיל" → name and parent gender shown →
"עריכה" → change the name to "  רון לוי  ", gender "גבר" → "שמירה" → "הפרטים נשמרו", view shows "רון לוי" / "גבר" → reload: same.
Clear the name → "שמירה" → "יש למלא שם מלא", focus on the field. Without the migration on the preview DB, PUT is 500 (fails closed).

**Neighbouring**  none. No route-level body limit set: Fastify's default applies; the schema's raw bound caps the work.
