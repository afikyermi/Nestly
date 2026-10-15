# F1.5 — login-session: email sign-in, logout, session refresh, stopped accounts, orphan Auth user

**Status** **Approved at Gate 1** (ORCHESTRATOR, 15.10.2026). DR-1 A, DR-2 A, DR-3 A decided (`decisions.md` 15.10, "F1.5 Gate 1"); Q1–Q6 defaults stand. Gate 2 (DATA ARCHITECT) for part a.

**Problem**  A registered user who leaves cannot come back: `/login` is a placeholder, the session lives in memory only so a reload signs the user out (F1.4 Q7), and the menu's "התנתקות" ends only local state. A sign-up whose profile write failed leaves an email that can neither sign in nor register again (F1.4 Q2/Q8). And nothing yet says what a suspended or banned user sees on signing in.

**Requirements**  FR-AUTH-002 (`05-functional/auth.md`; "no email verification") · FR-AUTH-004 (same file) · FR-MENU-001 Logout (`05-functional/navigation.md`) · AC-004, AC-091 (`15-acceptance.md`) · ERR-001 (`10-errors-edge-cases.md`) · VAL-002 (`09-validations.md`) · NFR-SEC-001, NFR-SEC-004 (`06-non-functional.md`) · NFR-USAB-003/004, NFR-A11Y-001 · FR-MOD-002, BR-024 (status; read, not changed) · SRS §12 Authentication row · platform rules 12–15 · I1 Addendum 1 · F1.4 DR-2, Q2, Q8, criterion 13 (changed here). **Not in the SRS (gaps, see DRs):** copy and behaviour for a stopped account at sign-in; completing an unfinished registration; session lifetime and persistence. ERR-036 (email not verified) is obsolete since 13.10.2026 and is not implemented (SRS clean-up at wrap-up).

**Scope**
- **Login screen** at `/login`: email + password, "התחברות", through the one browser Auth module (the only file importing auth-js) with the publishable key. The link "שכחתי סיסמה" goes to the existing `/recovery` placeholder; a link to `/register`.
- **After Auth accepts the credentials** the web asks the server `GET /api/me` (Bearer) for the account state: `active` → signed in, `/feed` (AC-004); `unavailable` → stopped (DR-1); `unregistered` → complete registration (DR-2).
- **Session**: persisted across reload, refreshed before expiry, ended on logout or when refresh is refused (DR-3). The F1.2 session seam gets a real source behind it; registration (F1.4) uses the same source, which closes F1.4 Q7.
- **Logout** in the menu: the existing "התנתקות" item now ends the Auth session on this device and clears storage.
- **Stopped accounts** are noticed at sign-in, at page load, at each token refresh and when the tab becomes visible (Q1); the database already returns nothing for them from the next statement.
- **Guest limits** (FR-AUTH-004): the F1.2 guard stays; it gains the state "signed in, no account yet" (DR-2).

**Out of scope**
- Google sign-in (F1.8). Password recovery and its screen (F1.6). Email verification (F1.7, out of I1). Registration changes beyond the shared session source and the completion path.
- Suspension lengths, appeals, the reason shown to a user, any contact channel for a stopped user, notifying a user on suspension (I4, FR-MOD-002). Support requests (need a session).
- Return to the originally requested page after login (the post deep-link return is FR-FEED, later); login always lands on `/feed`.
- "Remember me" choice, device list, sign out of all devices, session timeout by inactivity or maximum age (Pro-plan features).
- Our own rate limiter, CAPTCHA at login (NFR-SEC-008 covers registration only), lockout counters. The brake is Auth's built-in sign-in limit (thin, as F1.4 Q6).
- Any server-side Auth call, `service_role`, SECURITY DEFINER function (rules 1, 10); deleting orphan Auth users.
- Any database, storage or realtime call from the web.

**Data touched**  No new table or column. Read: own `nestly.users` row (id, status) at `/api/me`. **If DR-1 is A: one policy changes** (`users_select_own` loses `and status = 'active'`, migration, Gate 2). Browser storage: the Auth session (tokens) under one key (DR-3). Personal data: email, password in transit only to Auth; nothing of them in `nestly` or in our logs.

**Risk flags**  Authentication/authorization · personal data · schema migration if DR-1 A (a policy, reversible) → Elevated. CRITIC on opus; Accessibility and Design domains. `GET /api/me` is an ordinary authenticated endpoint (not a flag). Not flagged: money, new provider, irreversible.

**Authorization**  `GET /api/me` answers only for the caller's own identity, never takes an id. A Guest, a malformed, tampered or expired token gets 401. Reading the own row's status is the only widening; every other table still returns zero rows to a stopped account (rule 15). Nobody can learn another account's state.

## Acceptance criteria — the tag goes into the test name; layer in brackets

*Part a: database and route (pgTAP + route)*
1. 🔴 **Own status readable, nothing else** (DR-1 A) [layer 9 · rules 13, 15 · BR-024] [pgTAP]. Active, suspended and banned A each read exactly their own `users` row with its status, from the next statement and the same claims; user B reads zero rows of A's; `anon` none; an identity with no row reads zero. For a suspended or banned account `regular_profiles`, `journey_contexts`, `children`, `legal_consents` still return zero rows, `is_active_account()` is still false, and the D1 test (permissive-policy section) passes unchanged. No new grant, column or function. F1.1 c15 assertions that expected zero `users` rows for a stopped account are changed to expect the own row; the rest of c15 stays.
2. 🔴 **`GET /api/me` contract** [FR-AUTH-002 · DR-1] [route, real database in CI]. Active account → 200 `{"state":"active"}`; suspended and banned → 200 `{"state":"unavailable"}`, byte-identical; Auth user with no `users` row → 200 `{"state":"unregistered"}`. No id, email, type, status word or timestamp in any body. `cache-control: no-store`. Other methods → 405 with `allow: GET`, protected too.
3. 🔴 **Session required** [NFR-SEC-004] [route]. No `Authorization`, malformed, tampered or expired token → 401 `unauthenticated` with `www-authenticate: Bearer`, no database call. Verifier or database missing → 503 `unavailable`; a transient database fault → 503; a deterministic one → 500 `internal`, as `/api/register`. Logs carry status and SQLSTATE only, never token or ids.
4. 🔴 **Stopped at once** [BR-024 · exit criterion of F1.1] [route]. One token: `/api/me` answers `active`; the status is set to suspended; the next call with the same token answers `unavailable`; set to active, the next answers `active`. No caching between calls.

*Part b: Auth module, session, logout (unit with an injected Auth port + component)*
5. 🔴 **ERR-001** [FR-AUTH-002 · ERR-001] [component]. Auth answers `invalid_credentials` for a wrong password and the same for an unknown email (also `user_not_found`, `email_not_confirmed`, `user_banned`): one text, "האימייל או הסיסמה שגויים. אפשר לנסות שוב", identical DOM, no session, no `/api/me` call; email kept, password cleared, focus on the message. The text names neither field.
6. 🟡 **Other sign-in failures** [ERR-001] [unit]. 429 or `over_request_rate_limit` → "בוצעו יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות"; network error, rejected promise or status ≥500 → "ההתחברות לא הצליחה. אפשר לנסות שוב"; any other → "משהו השתבש. אפשר לנסות שוב". Never an Auth or server string in the DOM.
7. 🔴 **Success** [AC-004 · AC-091] [component, `/api/me` stubbed]. Valid credentials and `active` → the session source reports signed-in, `/login` is replaced by `/feed`, focus on `main`, title "פיד · Nestly". A signed-in user opening `/login` or `/register` is sent to `/feed` (F1.2 guard, unchanged).
8. 🔴 **Stopped account at sign-in** (DR-1) [component]. `unavailable` after correct credentials → the web ends the Auth session on this device, clears storage, stays on `/login`, shows (`role=alert`) "הכניסה לחשבון הזה אינה זמינה כרגע". Suspended and banned give the same DOM. No protected screen or shell is rendered at any moment, and the text appears only after Auth accepted the credentials, so a wrong password never reaches it.
9. 🔴 **Fail closed** [rule 15] [component]. If `/api/me` fails (401, 503, 500, unreachable, unparseable) after Auth accepted the credentials, the session source never reports signed-in: the session is ended locally, the sign-in message of criterion 6 shows, no feed is rendered.
10. 🔴 **No leaks** [NFR-SEC-001 · F1.4 criterion 13 changed] [E2E, network log and storage]. The password appears only in the request to the Auth URL; in no request to our server, log line, response, console output, DOM attribute or web storage. Storage after login holds only the Auth session under the one key of DR-3 (no email, no password); after logout or a stopped-account sign-in it holds nothing. This replaces F1.4's "no web storage at all".
11. 🔴 **Persistence and restore** (DR-3) [component, injected clock]. Reload with a valid stored session: state `loading`, then `/api/me`, then the page asked for, no login screen. A stored session whose refresh token the Auth server refuses → signed-out, `/login`, message "ההתחברות פגה. אפשר להתחבר שוב", storage cleared. Corrupt or foreign storage content → signed-out, no exception shown.
12. 🔴 **Refresh** (DR-3) [component, fake timers]. The access token is refreshed before it expires, and a request made after expiry carries the new token. Refresh answered "invalid/revoked" → as criterion 11. Refresh failing on the network or 5xx → the user stays signed in, refresh is retried, no sign-out. Two tabs: a refresh in one does not log the other out; a logout in one signs the other out within one storage event.
13. 🔴 **Re-check of the account state** (Q1) [component]. `/api/me` is called at restore, after each token refresh, and when the tab becomes visible if the last check is over 60 s old. Answering `unavailable` → session ended, `/login` with the criterion 8 text, no protected content afterwards. Answering `unregistered` → criterion 16. Failing network → no sign-out, next trigger retries.
14. 🔴 **Logout** [FR-MENU-001] [component + E2E]. Menu "התנתקות" → Auth sign-out with scope local, storage cleared, state signed-out, the guard sends to `/` (Welcome). Browser Back does not render a protected screen. If the Auth sign-out call fails, local state is still cleared and the user is signed out (F1.2 fail-closed seam). Other devices stay signed in.
15. 🔴 **Guest limits** [FR-AUTH-004] [unit on `decideAccess`]. For each protected path (`/home`, `/feed`, `/profile`, `/settings`) a signed-out state redirects to `/`; Guest paths render; `loading` renders nothing protected. The new state "signed in, no account yet" renders only `/register` (completion) and redirects every other path to it. Deny by default holds for an unknown state.

*Orphan Auth user (DR-2)*
16. 🔴 **Complete registration** [F1.4 Q2/Q8 · FR-REG-004] [component + route stub]. `unregistered` → no feed; `/register` opens in completion mode: heading "השלמת ההרשמה", text "ההרשמה הקודמת לא הסתיימה. עוד רגע מסיימים.", step 1 as F1.3, then a step with only the consent checkbox (F1.4 Q5 text) and "יצירת חשבון"; no email or password field. Submit calls `POST /api/register` with the held session and no sign-up; 201 → `/feed`. 409 → `/api/me` is asked again (a stopped account reaches criterion 8's text, else `/feed`); 401 → signed-out, `/login`. A reload keeps the user in completion (criterion 11). The only other action is "התנתקות" on that screen.
17. 🟡 **Unchanged F1.4 paths** [F1.4 criteria 6, 11, 20] [component]. Taken email at sign-up still shows the F1.4 message; its links "התחברות" and "שחזור סיסמה" now open the real login and the placeholder. Registration success enters through the same session source and stays signed in after reload.

*Screen (component + E2E; Chrome on PR, Edge on main)*
18. 🎨 **Fields and errors** [FR-AUTH-002 · VAL-002 · NFR-USAB-003]. `/login` shows h1 "התחברות", email (`type=email`, `dir=ltr`, autocomplete `username`), password (`type=password`, autocomplete `current-password`, `dir=ltr`, toggle "הצגת הסיסמה" with `aria-pressed`), button "התחברות", link "שכחתי סיסמה" (`/recovery`), link "יצירת חשבון חדש" (`/register`). After the first submit only: empty email "יש למלא כתובת אימייל"; bad email "כתובת האימייל אינה תקינה"; empty password "יש למלא סיסמה". The password is not length-checked (Q4). Each error is linked by `aria-describedby`, focus goes to the first invalid field, no request is sent while invalid.
19. 🎨 **States** [NFR-A11Y-001]. While requests run: button `aria-disabled` and `aria-busy`, sr-only status "מתחברים", a double activation sends one sign-in. Server-side messages (criteria 5, 6, 8, 11) are in an `InlineAlert` `role=alert`, one at a time.
20. 🎨 **axe, keyboard, RTL** [WCAG 2.1.1, 2.4.3, 2.5.8 · NFR-USAB-004]. Zero axe violations at 375 and 1024 for: empty · field errors · ERR-001 · stopped · completion screen · menu open. Login completed by keyboard alone, focus order matches visual order, targets ≥24×24, the button ≥44×44; `dir="rtl"`, no horizontal scroll at 375, title "התחברות · Nestly", no slash gender forms, actions are nouns.
21. 🟡 **Auth settings and scan** [Addendum 1]. Auth projects: JWT expiry 3600 s, refresh-token rotation on, confirm-email off (browser steps recorded in WORKPLAN by ORCHESTRATOR, values re-read before Preview). F1.4's source scan still passes (auth-js only in the Auth module; no `.from/.rpc/.storage/.channel`); the F1.4 test that pinned `persistSession:false` is changed to the DR-3 setting.
22. 🎨 **Preview.** ORCHESTRATOR signs in on the Preview at 375 and 1024 with an account, reloads (still signed in), logs out from the menu, signs in with a wrong password, and (with a stopped fixture account, if one can be set) sees the criterion 8 text.

## DECISION REQUESTS (owner: ORCHESTRATOR; each decides, records in `decisions.md`)

**DR-1 — Suspended or banned at sign-in (open item 1; the SRS names no copy).**
- **A (recommended):** one behaviour for both. Needs `GET /api/me` and a **policy change**: `users_select_own` hides a stopped account's own row (`and status = 'active'`, migration `20261014100000` line 81), so without it a stopped user and an orphan both read zero rows and cannot be told apart. Drop only the status clause: a user reads their own `users` row (id, account_type, status, created_at); `is_active_account()` and every other table's policy still gate on status, so no profile, child or consent data is exposed (D1 test unaffected: it pins the function through a permissive policy). The server answers only `unavailable`, never the word suspended or banned; the web ends the session and shows "הכניסה לחשבון הזה אינה זמינה כרגע", no reason, no length, no contact link (none exists). Cost: F1.1 c15 assertions that stopped accounts read zero `users` rows change (criterion 1). DATA ARCHITECT Gate 2, CRITIC on opus. If ORCHESTRATOR reads this as a change to the security model it is reserved for Afik (CLAUDE.md, Decision authority 3) — my reading: it is not, since the user learns only their own state, but it is for ORCHESTRATOR to say.
- **B:** no policy change; treat "zero rows" as one state. Then orphan and stopped are indistinguishable, a stopped user would be sent into completion and meet a 409 after typing step 1. Misleading; not recommended.
- **C:** ban the user in Auth. Needs the admin API; banned by rules 1, 10.

**DR-2 — The orphan Auth user (open item 2; F1.4 DR-2/Q2/Q8 stand).**
- **A (recommended):** complete in place (criterion 16). Sign-in works because the Auth user exists; the held session goes to `/api/register`, exactly F1.4's retry path, so no Auth call and no new endpoint. Consent is asked again because it is recorded at creation. Needs the new guard state.
- **B:** sign out with "ההרשמה לא הושלמה" and no way forward. The email stays unusable (re-registering meets F1.4 criterion 6, deletion is banned); a dead end.
- **C:** the server creates a default account. Needs step 1's data and consent; impossible without the user.

**DR-3 — Session persistence and lifetime (the SRS is silent; a gap).**
- **A (recommended):** auth-js `persistSession` in `localStorage` under the one Auth key, `autoRefreshToken` on, Supabase defaults (access token 1 h, rotating refresh token), logout scope local. Tokens only; password never. Known cost: a script on the page (XSS) can read the refresh token; mitigated by the F1.2 scan, no third-party scripts, and CRITIC's review.
- **B:** memory only. A reload signs the user out — the problem this feature exists to fix.
- **C:** httpOnly cookie through our server. Needs server-side Auth calls (banned) and a new unauthenticated surface.

## Open questions (default stated; work proceeds)
- **Q1.** Re-check cadence of the account state: restore, every refresh, tab visible after 60 s. No timer polling. Default as stated; an open tab can show a stopped account's screens until the next trigger, while all data reads already return nothing.
- **Q2.** Logout ends this device only (scope local). Default: local.
- **Q3.** Expired session: message on `/login`, then `/feed` after the next sign-in, no return-to. Default as stated.
- **Q4.** Login does not enforce the 8-character minimum (an old or imported password must reach Auth's answer, and a length hint would reveal the rule for a wrong password). Default: non-empty only.
- **Q5.** Timing differences between "unknown email" and "wrong password" are Auth's, outside this feature. Default: not tested.
- **Q6.** Hebrew copy of criteria 5, 6, 8, 11 is mine and yields to `ux-copy-he` review.

## Size estimate
About 1,000 lines of diff. Over ~400, so **three PRs on one branch**:
- **a:** policy migration + pgTAP change + `GET /api/me` (criteria 1–4), ~300. Gate 2 if DR-1 A.
- **b:** Auth module sign-in/out, real session source, persistence, refresh, re-check, logout, guard state, scan change (5–15, 21), ~450.
- **c:** login screen, completion mode, states, accessibility, Preview (16–20, 22), ~250.

## Amendment 1 — 15.10.2026, ORCHESTRATOR (from CRITIC part b, F1 and F2; `decisions.md` "F1.5 part b")
- **Criterion 15:** the state "signed in, no account yet" renders `/register` (completion) **and the read-only Guest documents `/terms` and `/privacy`** (the consent step links to them); every other path redirects to `/register`.
- **Restore when `/api/me` cannot answer (new, criterion 11):** only `unreachable` (network error, 503) keeps the state `loading` and retries, with backoff (15 s, 30 s, 60 s, then every 5 min, ±20 % jitter) while the tab is visible; any other failure (`failed`: 500, 404, unreadable) resolves to **signed-out with the stored session kept**, so a later reload tries again. No other timer (Q1 stands).
- **Criterion 12 / logout in another tab:** a sign-out whose cause this tab does not know ends the session **without** a notice; "ההתחברות פגה" only when this tab's own refresh was refused.
