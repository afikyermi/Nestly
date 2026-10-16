# F2.1 — Own profile: view and edit (profile-view-edit)

**Problem**        A registered Regular parent cannot see what they entered at sign-up, or fix it. The "פרופיל" tab
                   (`PATHS.profile`, bottom nav, AC-005) opens a placeholder. A typo in the name, or a parent gender they
                   want to change, stays for good, and the name is part of the Basic Public Profile (§1.4, `01-intro.md`).
**Requirements**   FR-PROFILE-001 (05-functional/profile-settings.md) · AC-015 (15-acceptance.md) · UC-10 (14-use-cases.md) ·
                   PG-012 (07-screens-navigation.md; sketch 55 shows no fields, appendix-a-sketches.md) · VAL-001, VAL-006 /
                   OP-004 closed (09-validations.md) · ERR-003, ERR-004, ERR-037, ERR-038 (10-errors-edge-cases.md) ·
                   data-model.md rules 3, 12, 14, 15 and "Write grants" · srs-review-points A1, A8, A9, S2, S3.
**Scope**          Regular account only. (1) A view of the caller's own RegularProfile fields at `PATHS.profile`. (2) An edit
                   flow for the fields DR-1 approves, checked by the same shared Zod rules registration step 1 uses
                   (`fullNameSchema`, `PARENT_GENDERS`). (3) One read endpoint and one write endpoint on the server, for the
                   caller's own row only: no user id anywhere in the request. Contract shape (the path name may change, recorded
                   in notes.md): `GET /api/profile` → `{ fullName, parentGender: <value> | null }`; `PUT /api/profile` with a strict
                   body `{ fullName, parentGender: <value> | null }` → the saved values; any other method → 405.
**Out of scope**   Profile photo (I5) · journeys, stage, due date, children (F2.2): the view does not show them in F2.1 ·
                   Open/Restricted, Journey Summary, ChildBirthdayVisibility, and what another user sees (F2.3/F2.4). Whether
                   parent gender is shown to a non-Friend under Open is F2.3's question, not settled here · email display or
                   change, password (F2.0 is done), recovery questions · Professional profile: no Professional account
                   can exist yet (the `users_insert_own` policy allows only regular) even though FR-PROFILE-001 names that
                   actor · Settings and side-menu items (F2.5) · account deletion (I9) · change history, audit of
                   self-edits, analytics events, a rate limit on edits · showing the name on other screens (none shows it today).
**Data touched**   `nestly.regular_profiles` (full_name, gender): first UPDATE path. Needs an UPDATE grant per column and an own-row
                   UPDATE policy behind `is_active_account()`. No new column expected. DATA ARCHITECT owns the shape (Gate 2).
                   `nestly.users` is read only.
**Risk flags**     authorization (new own-row write policy) · personal data · schema migration (grant + policy) → **Elevated**.
                   No money, provider, unauthenticated surface, or minors' data (children are F2.2).

**Acceptance criteria**
1. 🎨 Signed-in Regular, profile `{fullName:"דנה כהן", gender:"woman"}`: `PATHS.profile` shows "שם מלא: דנה כהן" and
   "מין ההורה: אישה", and an "עריכה" button. The four gender labels match registration step 1 (`GENDER_LABELS`). [FR-PROFILE-001, PG-012]
   Screens: `profile-view`.
2. 🎨 gender NULL → the view shows "מין ההורה: לא צוין". gender `prefer_not_to_say` → "מעדיפים לא לציין" (an answer,
   not empty). [VAL-006; the "לא צוין" text is not in the SRS, see Q1] Screens: `profile-view`.
3. 🎨 While GET is pending, a loading state renders and no field value or edit control appears. On GET 5xx or a network
   failure, the text "לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב" (Q2) and a "נסו שוב" button that repeats the GET.
   [ERR-004] Screens: `profile-load-failed`.
4. 🎨 "עריכה" opens a form with the current values filled in: a text input labelled "שם מלא" and a select labelled "מין
   ההורה" marked optional, with the four options plus an empty choice. "ביטול" returns to the view with nothing sent and the
   stored values unchanged. [UC-10] Screens: `profile-edit`.
5. 🟡 Save with fullName `"  רון לוי  "` and gender `man` → PUT sends them. The stored full_name is `"רון לוי"` (trimmed,
   `fullNameSchema`). The view shows the new values after the save and after a full page reload. [AC-015, VAL-001]
6. 🎨 Save with an empty name, or whitespace only → no PUT; the field shows "יש למלא שם מלא". 1 or 61 characters after the
   trim → "שם מלא צריך להכיל 2 עד 60 תווים". 2 and 60 are accepted. Messages appear only after the first Save. Focus moves to
   the first invalid field, and its error is tied to it with `aria-describedby`. [ERR-003, VAL-001] Screens: `profile-edit-errors`.
7. 🟡 Selecting the empty gender choice and saving stores gender NULL. Saving each of the four values stores exactly
   that value. [VAL-006 "לא חובה"; Q3]
8. 🟡 The server checks with the same shared schema as the web. A PUT whose fullName fails VAL-001 → 400
   `{error:"invalid", reason:"full_name_required"|"full_name_length"}`. A gender outside the four plus null → 400
   `parent_gender_invalid`. In both cases the row is unchanged. [VAL-001, VAL-006, S2]
9. 🔴 A PUT body with any key besides fullName and parentGender (for example `userId`, `user_id`, `accountType`,
   `createdAt`) → 400, and no row changes. The route takes no id in its path or query. [data-model rules 12, 14]
10. 🔴 pgTAP, as `authenticated` with A's claims: an UPDATE of B's regular_profiles row affects 0 rows, and B's row is
    unchanged. An UPDATE of A's `user_id`, `account_type` or `created_at` → 42501. A DELETE of A's row → denied or 0 rows. [A1, rule 12]
11. 🔴 pgTAP and API: while A's status is `suspended` or `banned`, an UPDATE of A's own row affects 0 rows and GET returns
    nothing of A's profile. The API answers as the session guard does today (ERR-037 refusal), and the web shows the
    ERR-037 text. [A9, rule 15, ERR-037]
12. 🔴 GET or PUT with no token, or an invalid one → 401, and no database query runs under that request. An Auth user
    with no account row (unregistered) → GET 404 `{error:"no_profile"}`, PUT 404 and no row created. [FR-AUTH-004, Q4]
13. 🔴 The server runs as `app_server` under `SET LOCAL ROLE authenticated` with the caller's claims. No service role and no
    SECURITY DEFINER function on this path; the approved-definer list stays as it is. [A8, rule 3]
14. 🔴 The server logs for GET and PUT `/api/profile` hold no full name or gender value, in success, 400 or 5xx. A test
    captures the log lines and asserts this. [NFR-PRIV-001]
15. 🎨 Save on a network failure or a 5xx: the form stays open with its input intact, the text "השמירה לא הצליחה. אפשר
    לנסות שוב" appears in a `role="alert"` (Q2), and Save can be pressed again. While a save is in flight, Save is disabled
    and pressing it twice sends one PUT. [ERR-004] Screens: `profile-edit-save-failed`.
16. 🟡 A save whose token is refused on refresh (expired or revoked) follows the existing guard: the session ends and the user
    lands on login with "ההתחברות פגה. אפשר להתחבר שוב". Losing the unsaved input is accepted. [ERR-038]
17. 🎨 After a successful save the view shows the new values, and "הפרטים נשמרו" (Q2) is announced in a `role="status"`.
    `profile-view`, `profile-edit`, `profile-edit-errors`, `profile-load-failed` and `profile-edit-save-failed` each have zero
    axe-core violations, RTL, at phone and desktop widths. [S3, NFR-A11Y-001]

**Screens for `e2e/visual-screens.ts`**: `profile-view`, `profile-edit`, `profile-edit-errors`, `profile-load-failed`,
`profile-edit-save-failed`. Each is an `app` entry if it can be reached by route and state; otherwise a `story` entry.

**Open questions**
- **DECISION REQUEST DR-1 (ORCHESTRATOR; I2-questions "לידיעה בלבד")**: which fields are editable. The SRS defines no list
  (FR-PROFILE-001 says only "שדות פרופיל"). The RegularProfile fields are those FR-REG-002 collects. Options:
  **A (recommended):** full name and parent gender. These are exactly the as-built `regular_profiles` columns, and stage,
  journeys and children are F2.2's.
  B: A, plus the email shown read-only (from the token). This adds a field that FR-PROFILE-001 does not call editable,
  next to an email change that I2 excludes.
  C: A, plus stage. This overlaps F2.2 and VAL-039.
  The criteria above assume A.
- Q1: the empty-gender label in the view → **assumed if unanswered:** "לא צוין".
- Q2: the load-failure, save-failure and success texts are not in the SRS for this screen (a gap, at copy level) →
  **assumed if unanswered:** the texts above. Save failure reuses the ERR-044 wording. Record them in the SRS at I2's close.
- Q3: can a parent clear a gender they gave back to "not answered" (NULL)? → **assumed if unanswered:** yes. The field is
  optional (VAL-006).
- Q4: the answer for an unregistered caller → **assumed if unanswered:** 404 `no_profile`. The web never reaches it, because
  the guard holds that state.
- Q5: two tabs saving at once → **assumed if unanswered:** the last write wins, with no conflict check.
- FYI for Afik (user-generated content, Trust & Safety): the name is public UGC (§1.4). F2.1 adds no limit on how often
  it changes and keeps no history → **assumed if unanswered:** none in I2. Not blocking.
- No reserved item found. Privacy exposure of gender belongs to F2.3.

**Size estimate**  ~350 lines without tests: migration and rollback ~60, server route/service/repository ~130, shared request
schema ~20, web page with view and edit ~140. Fits in one part. No split.

## Gate 1 — ORCHESTRATOR, 17.10.2026

Approved, 17 criteria, one part, Elevated. **DR-1 → A** (full name and parent gender — the as-built `regular_profiles`
columns; email change is out of I2 and showing it read-only adds nothing the owner needs here). Q1–Q5 take their defaults.
FYI for Afik (not blocking): the full name is part of the public basic profile — user-generated content, Trust & Safety
outside this pipeline. Code waits for PR 39 (one branch); DATA ARCHITECT runs now.
