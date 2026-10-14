# F1.4 — register-account-create: registration step 2 and account creation

**Status** ✅ Gate 1 passed by ORCHESTRATOR, 14.10.2026, except criterion 6 (`PENDING — Afik decision (WORKPLAN)`; its tests wait). Edits at the gate: criterion 20's route test uses an injected Auth client; Q6 gains the IP-attribution check. DR-1 and DR-2 decided as their defaults (`decisions/2026-10.md`).

**Problem**  A parent who filled step 1 (F1.3) cannot finish: step 2 is a placeholder, nothing creates an account, nothing stores step 1's data, and nothing records that the parent accepted the terms and is 18 or older.

**Requirements**  FR-REG-004 (`05-functional/registration.md`) · VAL-002, VAL-003 (`09-validations.md`) · AC-002, AC-003, AC-055, AC-084, AC-088, AC-091 (`15-acceptance.md`) · ERR-002, ERR-004 (`10-errors-edge-cases.md`) · BR-045, BR-068 (`08-business-rules.md`) · NFR-SEC-006 (a taken email must not reveal an account) · NFR-USAB-003/004, NFR-A11Y-001, NFR-PRIV-001 · I1 Addendum 1 (F1.4) · F1.3 debt "must close at F1.4 Gate 2" · platform rules 2–4, 11–15 (`data-model.md`). Design: R2 `r2-screens.html#register`, step 2.

**Scope**
- Step 2 at `/register`: email, password, one required checkbox (Terms, Privacy, 18+), "יצירת חשבון".
- One guest route, `POST /api/register`: validates step 1 + step 2 with Zod from `packages/shared`, calls Supabase Auth sign-up **from the server with the anon key** (DR-1), then writes the account in one transaction under the new user's identity (rule 3).
- Stored, atomically: the User and RegularProfile (F1.1 tables), one JourneyContext per ticked stage (due date on the pregnant one), the Children, one LegalConsent. DATA ARCHITECT decides tables and columns at Gate 2.
- The response carries the new session; the web hands it to F1.2's session seam and the user lands on `/feed` (FR-AUTH-002, AC-091).
- Closing the F1.3 debt: the step-1 server schema rejects unknown keys and bounds raw sizes before code-point splitting.

**Out of scope**
- Email verification, a verification screen, email delivery (Addendum 1; F1.7 stays separate). Google (F1.8). Professional registration. Account type (I11).
- Login, logout, refresh, **session persistence across reload** (F1.5): until then a reload after registering signs the user out. Password recovery (F1.6).
- Consent document texts and pages (I9): links go to placeholders. Re-consent when versions change. Editing or deleting children and journeys (I2). Which journey the home shows first (OP-003, I6).
- Keeping step-1 data anywhere before submit (still tab memory only, F1.3 Q1). Any server draft.
- A project-owned rate limiter, CAPTCHA, a breached-password check (VAL-003 forbids it), a strength meter.
- `service_role`, the Auth admin API, or a SECURITY DEFINER function to create rows or delete the Auth user (rules 1, 10). Hence no clean-up of the Auth user when the profile write fails (Q2).

**Data touched**  Personal data, minors' data (child name, sex, birth date), health-related data (due date), a consent record. New tables = migration → **DATA ARCHITECT, Gate 2**. Must be stored: parent name and gender; per-stage journeys, the pregnant one with its due date; per child name, sex, birth date; one consent record per account: terms version, privacy version, age declaration, time. **Invariants:** every row owned via `auth.uid()` set by the database (rule 12); RLS + FORCE on each table, owner-only (layer 9), `is_active_account()` respected (rule 15); at most 10 children and at most one journey per stage per user, enforced by the database; consent time is the database's clock and the version never comes from the client; the runtime role cannot update or delete a consent record; one account per Auth user, so a repeated write is safe. No email, password or hash in `nestly`.

**Risk flags**  Authentication/authorization · personal and minors' data · schema migration · unauthenticated endpoint → Elevated. CRITIC on opus; Accessibility and Design domains. Not flagged: new provider, money, irreversible (additive).

**Authorization**  A Guest may call `/api/register`. A request carrying a valid session of an account that already exists gets 409 and writes nothing. The new rows are readable, writable and deletable by their owner alone; another user and `anon` see and change zero rows; nobody at runtime updates or deletes a consent record. Tested in pgTAP and at the route (criteria 14, 15).

## Acceptance criteria — the tag goes into the test name

*Shared schema (unit)*
1. **Credentials** [VAL-002 · VAL-003 · AC-003]. Email trimmed, 3–254 characters, one `@`, a dot in the domain, no spaces: `""`, `a@b`, `a b@c.com` ✗; `a@b.co` ✓. Password ≥10 code points, no composition rule, spaces and Hebrew allowed, not trimmed: 9 ✗; 10 ✓; `"אבגדהוזחטי"` ✓; ten spaces ✓; over 256 ✗ (Q3).
2. **Request contract** [F1.3 debt]. The body schema is `.strict()`: an unknown key at any level → rejected, nothing created. Raw strings over their bound (name 600 units, email 512, password 1024, `stages` over 3 items, `children` over 10) are rejected **before** code-point splitting: a 5 MB name is rejected in under 100 ms with no Auth call. `consent` must be the literal `true`; `false`, absent, `"true"` ✗. A body with a consent version or a parent birth date is rejected.
3. **Server re-check of step 1** [FR-REG-004 "תנאים מוקדמים" · VAL-001/005/039/040]. The route applies F1.3's step-1 schema with the server's clock: a birth date one day after the server's UTC date ✓ (Q4), two days ✗; every other F1.3 rule holds.

*Step 2 screen (component + E2E)*
4. **Fields and consent** [FR-REG-004 · AC-084 · AC-088 · BR-068]. Step 2 shows email (`type=email`, autocomplete `email`), password (`type=password`, autocomplete `new-password`, hint "לפחות 10 תווים"), one checkbox with the Q5 text and links "תנאי השימוש" and "מדיניות הפרטיות" to placeholder pages, and "יצירת חשבון". No phone, parent birth date or second password field. Submit with the box unticked stays on step 2, sets `aria-invalid` on the box, shows "יש לאשר את התנאים ואת הצהרת הגיל כדי להמשיך", and sends no request.
5. **Errors on submit** [AC-003]. After the first submit only: empty email "יש למלא כתובת אימייל"; bad email "כתובת האימייל אינה תקינה"; 9-char password "הסיסמה צריכה להכיל לפחות 10 תווים". Each is linked by `aria-describedby`, focus goes to the first invalid field, a message clears when its field is valid. No Zod or server text reaches the DOM; an unmapped issue shows "משהו השתבש. אפשר לנסות שוב".

*Taken email*
6. **PENDING — Afik decision (WORKPLAN)** [FR-REG-004 · ERR-002 · AC-055 · AC-091 · NFR-SEC-006]. An email that already exists on a Regular **or** Professional account (BR-045) creates nothing and changes neither account. Candidates, replaced by one line when decided:
   - **A — reveal at sign-up only:** the response is a generic message "לא ניתן להשלים את ההרשמה עם הפרטים האלה. אפשר להתחבר או לשחזר סיסמה", with links to login and recovery, naming no account; rate-limited (Q6). It confirms existence to a patient attacker.
   - **B — email verification restored:** sign-up always answers "נשלח אימייל" and signs nobody in. Contradicts AC-091 and Addendum 1; needs F1.7 first and a changed FR-AUTH-002.
7. **Same result for both account types** [AC-055]. Whatever 6 becomes, an existing Professional email gives the same response and the same stored result (nothing) as an existing Regular one.

*Atomic creation and sign-in*
8. **Happy path** [FR-REG-004 · AC-091 · AC-084 · AC-088]. A valid body creates the Auth user and, in one transaction, exactly: 1 User + 1 RegularProfile; one JourneyContext per ticked stage (the pregnant one with the due date, null if left empty); the entered Children; 1 LegalConsent (terms version, privacy version, age declaration true, time within 5 s of the request). Response 201 with a session; the web is signed in and on `/feed` with no email step.
9. **Consent version source** [AC-084]. Saved versions equal the constants `CONSENT_TERMS_VERSION` and `CONSENT_PRIVACY_VERSION` in `packages/shared` (placeholder strings until I9), read by the server. Changing a constant changes what the next registration stores, with no other edit.
10. **Atomicity** [rule 11]. Forcing any one insert to fail (a child, a journey, the consent) leaves no row in any `nestly` table for that user and returns 500 with the generic code, never a partial success.
11. **Auth succeeded, profile write failed** [ERR-004 · Q2]. The response is 503 `profile_write_failed` **with the session**; the web stays on step 2, keeps all data, shows "השמירה לא הצליחה. אפשר לנסות שוב" and a "ניסיון חוזר" control. Retry sends the same body with the session; the server skips sign-up for an Auth user that has no account and writes the rows. Afterwards the account is as in 8 and there is one Auth user for the email.
12. **Network failure** [ERR-004]. If the request does not reach the server, step 2 and step 1 data stay, the same message and retry show, and a retry creates no duplicate.
13. **No leaks and request limits** [NFR-PRIV-001 · NFR-SEC-001]. Password, email and children's data appear in no server log line, no response body (beyond the session), no console output and no web storage (`localStorage`, `sessionStorage`, IndexedDB, cookies); the session is in memory only (Q7). Other methods → 405; a body over 100 KB → 413 before parsing.

*Authorization (pgTAP + route)*
14. **Owner-only rows** [layer 9 · rules 12, 13, 15]. As user A: reads A's profile, journeys and children; A's update and delete of them are refused and change nothing (editing is I2 — Gate 2 change, `decisions/2026-10.md`). As user B: zero of A's rows visible, update and delete change zero rows. As `anon`: no access. A client-sent owner id is refused. A's update or delete of A's consent record changes nothing. A suspended account reads zero rows. An 11th child and a second journey of the same stage for one user are refused by the database.
15. **Already registered** [Authorization]. `/api/register` with the valid session of an account that has rows → 409 `already_registered`, no write, no Auth call. A tampered or expired token → 401, no write.

*Quality, accessibility, copy, design*
16. **axe** [NFR-A11Y-001]. Zero violations, Chrome and Edge, 375 and 1024: step 2 empty · with all errors · in the retry state · in the state criterion 6 settles on.
17. **Keyboard, targets, focus** [WCAG 2.1.1, 2.4.3, 2.5.8 · NFR-USAB-004]. Step 2 is completed by keyboard alone with focus order matching visual order; every control ≥24×24 px, "יצירת חשבון" ≥44×44; while the request runs the button is `aria-disabled` and a double activation sends one request; on success focus is on `main` of `/feed`; title "פרטי התחברות · Nestly".
18. **RTL and copy** [NFR-USAB-003 · rtl-hebrew]. `dir="rtl"`; the email input is `dir="ltr"` with its label right-aligned; no horizontal scroll at 375; rendered step-2 text has no slash gender forms and actions are nouns.
19. **Back from step 2** [F1.3 criterion 13]. "חזרה" returns to step 1 with all values intact; on returning to step 2 the email is kept and the password is empty.
20. **Supabase Auth settings** [VAL-003 · Addendum 1]. On each Auth project, confirm-email is off and minimum password length is 10 (a browser step, recorded in WORKPLAN by ORCHESTRATOR; prod after Afik's OK). A route test with an injected Auth client that answers a weak-password rejection (and one that answers 429) asserts each maps to its fixed text (criterion 5 / Q6), never a raw message.
21. **Preview.** ORCHESTRATOR registers a parent with two children and a due date on the Preview at 375 and 1024, lands on `/feed`, and checks the criteria above that can be seen there.

## Open questions and decisions

**DECISION REQUEST → Afik (reserved: security model, SRS wording): taken email.** Criterion 6. FR-REG-004 says the message does not reveal an account, ERR-002 says suggest login or recovery, AC-091 says sign in at once with no verification. These cannot all hold. A or B. **No default.** In WORKPLAN "ממתין להחלטה שלך". All else proceeds.

**DECISION REQUESTS → ORCHESTRATOR (unreserved), with default:**
- **DR-1 Who calls Auth sign-up.** *Default: the server*, anon key, one `POST /api/register`. Reasons: F1.2 forbids a supabase-js import in the web (`source-scans`); invalid step 1 is caught before any Auth user exists; one place for uniform responses and rate-limit mapping. Rejected: the client signs up, then calls a second route (two requests, a failed second leaves an Auth user the user never sees).
- **DR-2 Orphan Auth user after a lost tab** (Q2). Default below.

**Questions (default stated; work proceeds):**
- **Q2.** If the profile write fails and the tab is lost, the Auth user stays without an account, since deleting it needs the admin API (banned). Default: in-tab retry only (criterion 11); F1.5's login must send such a user to completing registration; re-registering that email meets criterion 6's rule. Goes to `debt.md`.
- **Q3.** The password upper bound is not in the SRS (gap in VAL-003). Default: 256 code points in our schema; Auth's own limit applies beyond. Note it for the SRS at wrap-up.
- **Q4.** One day of tolerance on "today" at the server (F1.3 Q6).
- **Q5.** Checkbox text, nouns only: "אישור תנאי השימוש ומדיניות הפרטיות, והצהרה על גיל 18 ומעלה". R2's wording is provisional and yields.
- **Q6.** "Rate-limited" in A = Supabase Auth's built-in per-IP sign-up limit only; the route maps its 429 to "בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות". No own limiter (it needs a store). **Thin**: under A, that limit is the only brake on enumeration; Afik should know when choosing. **Gate 1 addition (ORCHESTRATOR):** with DR-1 every sign-up reaches Auth from the function's IP, so Auth's per-IP limit may count all users together (a global throttle, and no per-attacker brake). BUILDER verifies in part b how hosted Auth attributes the client IP on a server-side anon-key call; if it cannot be the end user's, that is a `MATERIAL CHANGE` back to ORCHESTRATOR (the database-counter limiter of WORKPLAN 7.4's conditions becomes in scope) — not improvised.
- **Q7.** The session is held in memory after registration; a reload signs the user out until F1.5.

## Size estimate

About 1,000 lines of diff: migration, RLS, pgTAP ~250 · shared schemas and constants ~100 · server route, service, repository ~250 · web step 2, retry, session hand-off ~200 · tests and stories beyond those ~200. Over ~400, so **three PRs on one branch**:
- **a:** migration + RLS + pgTAP (10, 14) — Gate 2 first.
- **b:** shared schemas + `/api/register` (1–3, 6–11, 13, 15).
- **c:** step 2 UI, retry, session hand-off, accessibility, Preview (4, 5, 12, 16–21).
