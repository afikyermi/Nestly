# F1.4 — register-account-create: registration step 2 and account creation

**Status** ✅ Revision 2 re-approved at Gate 1 by ORCHESTRATOR, 14.10.2026 (Q8 at its default). ✅ Gate 1 passed by ORCHESTRATOR, 14.10.2026. Criterion 6 decided by Afik (option A) and the password minimum changed to 8 by Afik, 14.10 (`decisions/2026-10.md`). DR-2 decided as its default. **Revision 2, 14.10.2026: MATERIAL CHANGE 1 decided by Afik ("א", `impact-1.md`, `decisions/2026-10.md` "F1.4 MATERIAL CHANGE 1"). DR-1 is superseded: the web signs up against Supabase Auth directly; the server only verifies the session and writes the rows. Touched: Scope, Authorization, Risk flags, criteria 2, 6, 7, 8, 11, 12, 13, 15, 20, new 22, Q6, Q7, new Q8, Size. IDs and numbering kept.**

**Problem**  A parent who filled step 1 (F1.3) cannot finish: step 2 is a placeholder, nothing creates an account, nothing stores step 1's data, and nothing records that the parent accepted the terms and is 18 or older.

**Requirements**  FR-REG-004 (`05-functional/registration.md`) · VAL-002, VAL-003 (`09-validations.md`) · AC-002, AC-003, AC-055, AC-084, AC-088, AC-091 (`15-acceptance.md`) · ERR-002, ERR-004 (`10-errors-edge-cases.md`) · BR-045, BR-068 (`08-business-rules.md`) · NFR-SEC-006 (a taken email must not reveal an account) · NFR-USAB-003/004, NFR-A11Y-001, NFR-PRIV-001 · I1 Addendum 1 (F1.4) · F1.3 debt "must close at F1.4 Gate 2" · platform rules 2–4, 11–15 (`data-model.md`). Design: R2 `r2-screens.html#register`, step 2.

**Scope**
- Step 2 at `/register`: email, password, one required checkbox (Terms, Privacy, 18+), "יצירת חשבון".
- **Web:** validates email and password with the shared credentials schema, calls **Supabase Auth sign-up from the browser** with the publishable key, through one Auth client module. Then calls `POST /api/register` with the new session as `Authorization: Bearer`. The web uses the Auth client only: no database, storage or realtime access.
- **Server, one route `POST /api/register`:** verifies the Bearer JWT as F1.1 does, validates step 1 + consent with Zod from `packages/shared`, writes the account in one transaction under that user's identity (rule 3). **No email or password reaches our server**, and the server makes no Auth call.
- Stored, atomically: the User and RegularProfile (F1.1 tables), one JourneyContext per ticked stage (due date on the pregnant one), the Children, one LegalConsent (tables as built in part a).
- The web keeps the Auth session in memory and hands it to F1.2's session seam; the user lands on `/feed` (FR-AUTH-002, AC-091).
- Closing the F1.3 debt: the step-1 server schema rejects unknown keys and bounds raw sizes before code-point splitting.
- F1.2's source scan narrows from "no supabase-js in the web" to "Auth client only" (criterion 22).

**Out of scope**
- Email verification, a verification screen, email delivery (Addendum 1; F1.7 stays separate). Google (F1.8). Professional registration. Account type (I11).
- Login, logout, refresh, **session persistence across reload** (F1.5): until then a reload after registering signs the user out. Password recovery (F1.6).
- Consent document texts and pages (I9): links go to placeholders. Re-consent when versions change. Editing or deleting children and journeys (I2). Which journey the home shows first (OP-003, I6).
- Keeping step-1 data anywhere before submit (still tab memory only, F1.3 Q1). Any server draft.
- A project-owned rate limiter, CAPTCHA, a breached-password check (VAL-003 forbids it), a strength meter.
- Any server-side Auth call (sign-up, sign-in, admin), a secret key, `service_role`, a SECURITY DEFINER function to create rows or delete the Auth user (rules 1, 10). Hence no clean-up of the Auth user when the row write fails (Q2).
- Any database, storage or realtime call from the web; the Data API stays off.

**Data touched**  Personal data, minors' data (child name, sex, birth date), health-related data (due date), a consent record. Tables and columns are as built in part a (migration, Gate 2 passed); this revision changes none. Invariants unchanged: every row owned via `auth.uid()` set by the database (rule 12); RLS + FORCE, owner-only (layer 9), `is_active_account()` respected (rule 15); at most 10 children and one journey per stage per user; consent time is the database's clock and the version never comes from the client; the runtime role cannot update or delete a consent record; one account per Auth user, so a repeated write is safe. No email, password or hash in `nestly`.

**Risk flags**  Authentication/authorization · personal and minors' data · schema migration (part a) → Elevated. CRITIC on opus; Accessibility and Design domains. The endpoint is no longer reachable without authentication. The Auth client in the web is a new web dependency, not a new provider. Not flagged: money, irreversible (additive).

**Authorization**  Only a caller with a valid Supabase session may call `/api/register`; a Guest without a token gets 401. A valid session of an account that already exists gets 409 and writes nothing. The new rows are readable by their owner alone, created only at registration, with no runtime UPDATE or DELETE until I2; another user and `anon` see and change zero rows; nobody at runtime updates or deletes a consent record. Tested in pgTAP and at the route (criteria 14, 15).

## Acceptance criteria — the tag goes into the test name

*Shared schema (unit)*
1. **Credentials** [VAL-002 · VAL-003 · AC-003]. Used by the web before sign-up. Email trimmed, 3–254 characters, one `@`, a dot in the domain, no spaces: `""`, `a@b`, `a b@c.com` ✗; `a@b.co` ✓. Password ≥8 code points (Afik 14.10), no composition rule, spaces and Hebrew allowed, not trimmed: 7 ✗; 8 ✓; `"אבגדהוזח"` ✓; eight spaces ✓; over 256 ✗ (Q3).
2. **Request contract** [F1.3 debt]. The body is step 1 + `consent` only. The schema is `.strict()`: an unknown key at any level, including `email` or `password` → rejected, nothing written. Raw strings over their bound (name 600 units, `stages` over 3 items, `children` over 10) are rejected **before** code-point splitting: a 90 KB name is rejected in under 100 ms with no database write. `consent` must be the literal `true`; `false`, absent, `"true"` ✗. A body with a consent version or a parent birth date is rejected.
3. **Server re-check of step 1** [FR-REG-004 "תנאים מוקדמים" · VAL-001/005/039/040]. The route applies F1.3's step-1 schema with the server's clock: a birth date one day after the server's UTC date ✓ (Q4), two days ✗; every other F1.3 rule holds.

*Step 2 screen (component + E2E)*
4. **Fields and consent** [FR-REG-004 · AC-084 · AC-088 · BR-068]. Step 2 shows email (`type=email`, autocomplete `email`), password (`type=password`, autocomplete `new-password`, hint "לפחות 8 תווים"), one checkbox with the Q5 text and links "תנאי השימוש" and "מדיניות הפרטיות" to placeholder pages, and "יצירת חשבון". No phone, parent birth date or second password field. Submit with the box unticked stays on step 2, sets `aria-invalid` on the box, shows "יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך", and sends no request (no Auth call, no route call).
5. **Errors on submit** [AC-003]. After the first submit only: empty email "יש למלא כתובת אימייל"; bad email "כתובת האימייל אינה תקינה"; 7-char password "הסיסמה צריכה להכיל לפחות 8 תווים". Each is linked by `aria-describedby`, focus goes to the first invalid field, a message clears when its field is valid. No Zod, Auth or server text reaches the DOM; an unmapped issue shows "משהו השתבש. אפשר לנסות שוב".

*Taken email*
6. **Taken email — option A (Afik 14.10)** [FR-REG-004 · ERR-002 · AC-055 · AC-091 · NFR-SEC-006]. When Auth's sign-up response in the browser says the email is already registered (Regular **or** Professional, BR-045), the web shows one generic message "לא ניתן להשלים את ההרשמה עם הפרטים האלה. אפשר להתחבר או לשחזר סיסמה", with links to login and recovery, naming no account and no account type, and calls `/api/register` **not at all**. Nothing is created or changed. Tested with an injected Auth client answering the already-registered error. Accepted: it confirms existence to a patient attacker (decisions 2026-10-14); the brake is Auth's per-IP limit (Q6).
7. **Same result for both account types** [AC-055]. The Auth client's answer for an existing Professional email and for an existing Regular one produces the same message, the same DOM and the same absence of any route call.

*Atomic creation and sign-in*
8. **Happy path** [FR-REG-004 · AC-091 · AC-084 · AC-088]. Auth sign-up succeeds, then a valid body with that session creates, in one transaction, exactly: 1 User + 1 RegularProfile; one JourneyContext per ticked stage (the pregnant one with the due date, null if left empty); the entered Children; 1 LegalConsent (terms version, privacy version, age declaration true, time within 5 s of the request). Response 201 with the account and **no session** (the web already holds it); the web is signed in and on `/feed` with no email step.
9. **Consent version source** [AC-084]. Saved versions equal the constants `CONSENT_TERMS_VERSION` and `CONSENT_PRIVACY_VERSION` in `packages/shared` (placeholder strings until I9), read by the server. Changing a constant changes what the next registration stores, with no other edit.
10. **Atomicity** [rule 11]. Forcing any one insert to fail (a child, a journey, the consent) leaves no row in any `nestly` table for that user and returns 500 with the generic code, never a partial success. Part a proves the database side only; part b proves it through the real repository against the CI database, forcing the **last** insert (the consent) to fail and asserting zero rows in all five tables (CRITIC part a finding 2). The repository inserts only through the `*Insert` write models (schema.md Amendment 1); the same test proves they match the column grants.
11. **Auth succeeded, row write failed** [ERR-004 · Q2]. Any transaction of the request failing transiently (including the existing-account check) → the route answers 503 `profile_write_failed`; a deterministic refusal or a non-database error → 500 `internal`, and the web shows criterion 5's fallback text with no retry control, keeping the data (CRITIC part b findings 2–3, `decisions/2026-10.md`). On 503 the web stays on step 2, keeps all data and its in-memory session, shows "השמירה לא הצליחה. אפשר לנסות שוב" and a "ניסיון חוזר" control. Retry skips sign-up and calls the route again with the same body and the same Bearer. Afterwards the account is as in 8 and there is one Auth user for the email (asserted with the injected Auth client: one sign-up call).
12. **Network failure** [ERR-004]. If the route call does not reach the server, step 2 and step 1 data and the session stay, the same message and retry show, and a retry creates no duplicate (one account). If the Auth sign-up call itself fails on the network, the same message shows and retry calls sign-up again (Q8).
13. **No leaks and request limits** [NFR-PRIV-001 · NFR-SEC-001]. The password leaves the browser only toward Auth. In no request to the server (asserted in the E2E network log), no server log line, no response body, no console output and no web storage (`localStorage`, `sessionStorage`, IndexedDB, cookies) do email or password appear; the Auth client is configured with in-memory storage and no persistence, and the storage assertion runs after a successful registration (Q7). Server logs carry neither children's data nor the token. Other methods → 405; a body over 100 KB → 413 before parsing.

*Authorization (pgTAP + route)*
14. **Owner-only rows** [layer 9 · rules 12, 13, 15]. As user A: reads A's profile, journeys and children; A's update and delete of them are refused and change nothing (editing is I2). As user B: zero of A's rows visible, update and delete change zero rows. As `anon`: no access. A client-sent owner id is refused. A's update or delete of A's consent record changes nothing. A suspended account reads zero rows. An 11th child and a second journey of the same stage for one user are refused by the database.
15. **Session required, already registered** [Authorization]. No `Authorization` header, a malformed, tampered or expired token → 401 `unauthenticated`, no write, decided before the body is read for validation. A valid session of an account that already has rows → 409 `already_registered`, no write.

*Quality, accessibility, copy, design*
16. **axe** [NFR-A11Y-001]. Zero violations, Chrome and Edge, 375 and 1024: step 2 empty · with all errors · in the retry state · in the state criterion 6 settles on.
17. **Keyboard, targets, focus** [WCAG 2.1.1, 2.4.3, 2.5.8 · NFR-USAB-004]. Step 2 is completed by keyboard alone with focus order matching visual order; every control ≥24×24 px, "יצירת חשבון" ≥44×44; while the requests run the button is `aria-disabled` and a double activation sends one sign-up; on success focus is on `main` of `/feed`; title "פרטי התחברות · Nestly".
18. **RTL and copy** [NFR-USAB-003 · rtl-hebrew]. `dir="rtl"`; the email input is `dir="ltr"` with its label right-aligned; no horizontal scroll at 375; rendered step-2 text has no slash gender forms and actions are nouns.
19. **Back from step 2** [F1.3 criterion 13]. "חזרה" returns to step 1 with all values intact; on returning to step 2 the email is kept and the password is empty.
20. **Supabase Auth settings and Auth error mapping** [VAL-003 · Addendum 1]. On each Auth project, confirm-email is off and minimum password length is 8 (browser steps, recorded in WORKPLAN; confirm-email turned off by Afik on both, 14.10). A **web** test with an injected Auth client that answers a weak-password rejection, one that answers 429, and one that answers an unknown error asserts each maps to its fixed text (weak password → criterion 5's password text; 429 → the Q6 text; unknown → "משהו השתבש. אפשר לנסות שוב"), never a raw message. A 5xx or network failure from Auth sign-up is transient: the retry state of criterion 11 shows ("השמירה לא הצליחה. אפשר לנסות שוב" with "ניסיון חוזר"), and the retry calls sign-up again; an unmapped 4xx → the fallback with no retry (ORCHESTRATOR 15.10, `decisions/2026-10.md`).

*Source scan*
22. **Auth client only** [rule 1 · F1.2 scan change, Afik 14.10]. F1.2's source-scan test is changed so that, under `apps/web`, a `supabase-js`/`auth-js` import is allowed only in the one Auth client module; any use of database, storage or realtime (`.from`, `.rpc`, `.storage`, `.channel`) or of a secret/`service_role` key anywhere in the web fails the scan. A fixture file with each violation proves the scan fails; the real tree passes.

21. **Preview.** ORCHESTRATOR registers a parent with two children and a due date on the Preview at 375 and 1024, lands on `/feed`, and checks the criteria above that can be seen there.

## Open questions and decisions

**Decided:** criterion 6 (Afik, option A, 14.10). **DR-1 superseded** by MATERIAL CHANGE 1 (Afik, 14.10): the web calls Auth. **DR-2 stands** (Q2).

**Questions (default stated; work proceeds):**
- **Q2.** If the row write fails and the tab is lost, the Auth user stays without an account (deleting it needs the admin API, banned). Default: in-tab retry only (criterion 11); F1.5's login must send such a user to completing registration; re-registering that email meets criterion 6's rule. Goes to `debt.md`.
- **Q3.** The password upper bound is not in the SRS (gap in VAL-003). Default: 256 code points in our schema, enforced in the web; Auth's own limit applies beyond. Note for the SRS at wrap-up.
- **Q4.** One day of tolerance on "today" at the server (F1.3 Q6).
- **Q5.** Checkbox text, nouns only: "אישור תנאי השימוש ומדיניות הפרטיות, והצהרה על גיל 18 ומעלה". R2's wording is provisional and yields.
- **Q6.** "Rate-limited" in A = Supabase Auth's built-in per-IP sign-up limit (30 per 5 minutes per IP). With the browser calling Auth, it counts the user's own IP, so the global-bucket problem is gone and the Gate 1 BUILDER check is closed. Still **thin**: it is the only brake on enumeration and does not stop a distributed attacker. No own limiter. 429 maps to "בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות" (criterion 20).
- **Q7.** The session is held in memory after registration; a reload signs the user out until F1.5. F1.5 decides persistence and refresh in the browser (new, to WORKPLAN for F1.5). The access token's default life is not extended here; if it expires between sign-up and a retry, the route answers 401 and the web shows the Q8 message.
- **Q8.** (new) If the Auth sign-up call succeeded but its response was lost, or a 401 hits the retry, the user's next attempt meets "already registered". Default: criterion 6's generic message with the login and recovery links; the orphan is the DR-2 case (login in F1.5 completes it). Goes to `debt.md` with Q2.

## Size estimate

About 950 lines of diff: migration, RLS, pgTAP ~250 (part a, done) · shared schemas and constants ~100 (done in slice 1) · server route, service, repository ~150 (smaller: no Auth call, no credentials) · web Auth client module, step 2, error mapping, retry, session hand-off ~300 · source-scan change ~30 · tests and stories beyond those ~120. Over ~400, so **three PRs on one branch**:
- **a:** migration + RLS + pgTAP (10, 14) — Gate 2 passed.
- **b:** shared schemas + `/api/register` (1–3, 8–11 server side, 13 server side, 15).
- **c:** Auth client, step 2 UI, taken-email and Auth-error mapping, retry, session hand-off, source scan, accessibility, Preview (4–7, 11–12 web side, 16–22).
