# F2.4 — Friends: request, accept, decline, cancel, remove; the Friend branch of a profile (friends)

**Problem**        A Regular parent cannot connect with another parent: nothing stores a Friend Request or Friendship, there is no FriendsPage,
                   no Friend branch of profile visibility, and no way to reach another user — People Search is I7.
**Requirements**   FR-REL-001 (05-functional/relationships-groups.md) · FR-PRIV-001 (05-functional/profile-settings.md) · BR-025, -029, -034, -044,
                   -063 (08) · VAL-017, -027 (09) · ERR-004, -016, -022, -032, -038 (10) · AC-034, -054, -078 (15) · §1.4 Basic Public Profile,
                   §13 Friendship, §13.2 · NFR-SEC-005, NFR-SEC-006 (06) · FR-AUTH-004 · PG-036 · UC-20 · F2.3 Gate 1, schema.md DR-G1 · F2.5 Q3 ·
                   data-model.md layers 4, 5, 13 · review A1, A4, A7–A9, P1, P2, P6, S3 · Afik 17.10.2026 "I2 reserved items" (DR-2, DR-T, DR-G1).
**Scope**          Four parts. **F2.4a** schema + API (c1–c12). **F2.4b** PG-036 and the "חברים" menu item (c13–c15). **F2.4c1** another
                   Regular's profile over the API: Friend branch, Friends and mutual Friends, relationship state, the NFR-SEC-006 profile-open
                   limit and its Security event (c16–c24). **F2.4c2** the screen: UserProfilePage for others, the DR-1 copy-link entry point,
                   relationship actions (c25–c30). Until F2.4c2 merges, no screen creates a request.
**Out of scope**   Friend Request / Accepted notifications, badges, counts (FR-NOTIF-003 — I7) · birthday notifications (I7) · direct chat, the
                   message action (I8) · People Search and its rate limit (I7) · "people you may know" (not in the SRS) · blocking or reporting
                   (I3/I4) · a cap on Friends or requests · Admin/Moderator access (I4), **including an Admin screen or API to change the
                   thresholds or to read Security events, and NFR-SEC-006 (5)'s "reported to Admin" delivery** · detection of an "abnormal
                   pattern" beyond the threshold · photos (I5) · Recommend Group (I10) · the feed (I3) · pagination or search in any list ·
                   deletion's effect, retention of declined/removed rows (I9) · ages anywhere but F2.3b's `profile_view` output · a share
                   sheet, QR code, link preview or short link · a profile link to a Professional profile (FR-SERV-003).
**Data touched**   a: `friendships`, `regular_names` (schema.md, Gate 2 approved). c1: `profile_view` gains the Friend branch and the two lists
                   (DR-G1 shape, schema.md "F2.4") · new: a per-account profile-open count, the threshold configuration, a Security event store
                   → DATA ARCHITECT, Gate 2. c2: none.
**Risk flags**     a, c1: authorization · schema migration · personal data · minors (c1: ages to Friends). b: personal data. c2: personal data,
                   minors (ages on screen), a link shared outside the app (login-gated). All → Elevated.

**Acceptance criteria** — A, B, C are active Regular accounts; P, M, D are fixture Professional, Moderator, Admin accounts.
*F2.4a — schema and API* (approved; c11 with names per DR-6 A)
1. 🔴 A sends B a request → 201; one pending row, requester A, addressee B; it is in A's sent list and B's incoming list. As C, no query
   returns it (pgTAP). Body is `{targetUserId}` only; the requester is set by the database. [FR-REL-001, VAL-017, rule 12]
2. 🔴 Refused targets: P, M, D, a random uuid, B suspended or banned → no row, 404 `unavailable`, identical body across all six. A to A
   → 400 `invalid`. pgTAP as A: INSERT naming any of these, or naming a requester other than A, is denied. [AC-034, BR-029, ERR-016, DR-5]
3. 🔴 Duplicates: A→B pending, A sends again → 409 `request_exists`. A and B Friends, either sends → 409 `already_friends`. B→A while
   A→B is pending → 409 `incoming_pending`, no second row, no Friendship. At most one live row per unordered pair. [VAL-017; FR-REL-001 "רק לאחר אישור"]
4. 🔴 Races: A→B with B→A, and A→B with A→B, each pair sent concurrently (20 runs) → every run ends with exactly one pending row for
   the pair; the other call gets 409. No run creates a Friendship. [VAL-017]
5. 🔴 Accept: B accepts → A and B each appear in the other's Friends list, the request leaves both request lists. A or C accepting
   the same request → 404 `unavailable`, pgTAP 0 rows changed. [FR-REL-001, AC-034]
6. 🔴 Decline: B declines → no Friendship; it leaves B's incoming list; A's side and a later A→B follow DR-3. A, C → 404, 0 rows. [FR-REL-001]
7. 🔴 Cancel (not in the SRS, DR-4): A cancels a pending A→B → it leaves both lists; B or C → 404, 0 rows; A→B may then be sent again.
8. 🔴 Remove: A or B removes the Friendship → on the next read neither Friends list holds the other; either may send a new request;
   C → 404, 0 rows. [FR-REL-001]
9. 🔴 Transitions: accept, decline or cancel of a request no longer pending → 409 `request_gone`, no change; accept and cancel sent
   concurrently → exactly one takes effect; a second remove → 409. pgTAP: requester, addressee and creation time cannot be updated;
   no status move outside pending→accepted|declined (addressee), pending→cancelled (requester), accepted→removed (either). [rule 11]
10. 🔴 Stopped: A suspended or banned → every action 403 `account_unavailable`, pgTAP 0 rows. A pending request whose other party is not
    active is in neither list and cannot be accepted; a non-active Friend is absent from the other's list and returns on reactivation,
    the row kept (DR-5). P, M, D as actor → 403, no row. No token → 401, no query. [A9, rule 15, ERR-022, BR-034, A7]
11. 🔴 `GET` lists returns the caller's incoming, sent and Friends lists only; each entry holds exactly user id, full name and, for
    requests, the request time — no email, gender, children, journeys, account status, request status or privacy setting of the
    other user. A new account → three empty lists. [PG-036, P1, P2]
12. 🔴 Strict shared Zod: a non-uuid id, or any extra key (`requesterId`, `status`, `addresseeId`) → 400, no row. Runtime is `app_server`
    under `SET LOCAL ROLE authenticated`; a SECURITY DEFINER only if listed in data-model.md; rollback removes Friendship only. [A1, A8]
*F2.4b — FriendsPage (PG-036)* (approved in shape; DR-6 A passed Gate 2)
13. 🎨 Side menu shows "חברים" to a Regular user (F2.5 Q3) → `/friends`: "בקשות שקיבלת" (אישור · דחייה), "בקשות ששלחת" (ביטול), "החברים
    שלי" (הסרה), each with its own empty text (Q1). Accept moves the entry into "החברים שלי" without a reload. Remove opens a dialog
    naming the Friend, "הסרה" / "ביטול"; "ביטול" sends nothing. Screens: `friends`, `friends-empty`, `friends-remove`. [PG-036, FR-MENU-001]
14. 🎨 Loading shows no lists. Load failure: message + "נסו שוב". Action failure keeps the entry, message in `role="alert"`; the button is
    disabled in flight, a double press sends one request. 409 `request_gone` → the list reloads, "הבקשה כבר לא זמינה". [ERR-004]
15. 🎨 The three screens: zero axe-core violations, RTL, phone and desktop; the dialog traps and returns focus; every action reachable
    by keyboard and named with the person's name. [S3, NFR-A11Y-001]
*F2.4c1 — viewer API, Friend branch, profile-open limit* (needs F2.3b and F2.4a merged; not F2.4b). "Open" = one viewer-API request.
16. 🔴 `GET /api/profiles/:userId` (name may change) returns F2.3b's `profile_view` result: a non-Friend Regular V and P get F2.3b's
    Restricted or Open view by B's state, item for item. F2.3b's unavailable targets → 404 `unavailable`, one identical body; a non-uuid
    → 400, no query; no token → 401, no query; viewer suspended or banned → 403 `account_unavailable`. [FR-PRIV-001, BR-044, OP-020, A9]
17. 🔴 Friend branch (Afik DR-2 A): A, a Friend of B, gets a result equal item for item to F2.3b's Open view of B — ages in its years-and-
    months text — whether B is open or restricted; still no child name, sex, birth date, due date, pregnancy week, id, slot, email,
    consent or tracker data. A pending, declined or cancelled request is not a Friendship: both parties get the non-Friend view. After
    Remove, either party's next read is the non-Friend view of B's current state; a new Friendship gives the Friend view on the next read.
18. 🔴 The response carries B's Friends and the mutual Friends of viewer and B, each entry exactly user id and full name, in both of B's
    states and for every viewer; a non-active Friend of B is absent; neither list holds the viewer or B; P's mutual list is empty; B
    with no Friends → two empty lists. pgTAP as V: no direct SELECT returns a Friendship V is not party to. [§1.4 Basic Public Profile]
19. 🔴 The response carries the relationship state, exactly one of `none` · `sent` · `received` · `friends`, from F2.4a's rows; after B
    declines A's request A's state stays `sent` and B's is `none` (DR-3 A). P as viewer gets no state. [FR-REL-001, AC-034]
20. 🔴 With 100 opens per 3600 s configured, an account's 101st open within the window (DR-W) → 429 `rate_limited` with no profile,
    lists or state; opens of unavailable targets count. Once the window allows it, opens succeed. Accounts are counted apart (A at the
    limit, C unaffected); P is counted too. 120 concurrent opens by one account → at most 100 return 200. [NFR-SEC-006 (1), AC-078, ERR-032]
21. 🔴 The first refused open of an account in a window records exactly one Security event — kind (profile-open limit), the account,
    the time; no target name, profile or child data — and further refusals in that window record none. The event persists although
    the request was refused. pgTAP: no Regular or Professional reads, inserts, alters or deletes any Security event, its own included,
    nor reads, resets or alters any open count. [NFR-SEC-006 (5), ERR-032, AC-078]
22. 🔴 Configuration (DR-C): N and W are stored values read at each open, never code constants; seeded at 100 and 3600 s. A test that
    sets N = 3 sees the 4th open refused with no restart or code change. No product API reads or writes them; pgTAP: `authenticated`
    cannot read or write them. Absent or invalid (0, negative, non-integer) → every open refused as c20, no profile data, no Security
    event, a server error logged. [NFR-SEC-006 "Configuration … Admin בלבד", BR-025, P6]
23. 🔴 No response — 200, 404 or 429 — carries a threshold, window, remaining count or reset time; no endpoint returns users without a
    target id. Runtime `app_server` under `SET LOCAL ROLE authenticated`; SECURITY DEFINERs match data-model.md "Approved exceptions"
    (pgTAP list check). [NFR-SEC-006 (2), ERR-032 "שאינה חושפת את הספים", A8, DR-G1]
24. 🔴 (DR-S A; dropped under B) An F2.4a send counts as one open: at the limit, a send → 429 `rate_limited`, no row. [NFR-SEC-006 (1)]
*F2.4c2 — UserProfilePage for others, copy link, actions* (needs F2.4c1 and F2.4b merged)
25. 🎨 `/u/:userId` (path may change) shows exactly what c16–c19 return: name, gender when returned, the Journey Summary items (count,
    ages as returned, "בהריון" or the sentence), "החברים של <name>" and "חברים משותפים", each with its own empty text (Q1); every list
    entry links to that person's profile. Screens: `user-profile`, `user-profile-restricted`, `user-profile-friend`. [§1.4, FR-PRIV-001]
26. 🔴 FriendsPage shows "העתקת הקישור לפרופיל שלי" (DR-1 A): it writes the absolute URL of the caller's own `/u/:userId` to the clipboard
    and shows "הקישור הועתק" in `role="status"`; clipboard refused → the link appears as selectable text. The URL holds the user id only —
    no name, token or other parameter. [FR-PRIV-001 "Profile/Deep Link", NFR-SEC-006 (4)]
27. 🔴 A Guest opening a profile link → Login (FR-AUTH-004), then that profile. Every visit calls the API again; after sign-out no
    profile content stays on screen or in browser storage. The caller's own link → own ProfilePage (F2.1), no viewer call (DR-O). [NFR-SEC-005, A4]
28. 🎨 Actions by state: `none` "שליחת בקשת חברות" · `sent` "ביטול הבקשה" · `received` "אישור" / "דחייה" · `friends` "הסרה מהחברים" with
    F2.4b's dialog; each calls F2.4a's API and the state changes without a reload; after accept or remove the profile is fetched again
    (one open). P as viewer sees no action. Disabled in flight; a double press sends one request; 409 → refetch + F2.4b c14 message. [FR-REL-001]
29. 🎨 Loading shows no profile. 404 → "הפרופיל לא זמין", one text for every reason. 429 → ERR-032's general message, no number, no
    countdown, no profile. Other failure → message + "נסו שוב". 401 → ERR-038 as F2.1. Screens: `user-profile-unavailable`,
    `user-profile-rate-limited`, `user-profile-load-failed`. [ERR-032, ERR-004, ERR-038]
30. 🎨 c25–c29's screens and FriendsPage with the copy button: zero axe-core violations, RTL, phone and desktop, keyboard; every action
    and list link named with the person's name. [S3, NFR-A11Y-001]

**"Configuration" here** (NFR-SEC-006, BR-025): N = 100 opens and W = 3600 s (Afik DR-T) are stored data the server reads on each open,
not constants in code, and fail closed (c22). The SRS lets only an Admin holding SECURITY_SETTINGS_MANAGE change them; no Admin role,
screen or API exists before I4. **In scope now:** the stored values, the seed, the read, fail-closed, and that no product role can read
or write them. **Later (I4):** an Admin screen/API with that permission and an audit of each change, and Admin reporting of Security
events. Until then a change follows DR-C. Where and how the values and the event store live is DATA ARCHITECT's, at Gate 2.

**Open questions** — new, for F2.4c's Gate 1 (all ORCHESTRATOR's; none reserved)
- **DR-W (spec gap: "per hour" fixes neither the window nor what counts).** **A (recommended):** a rolling 60-minute window; every open
  that reaches the database counts, 404s included; refused (429) opens do not; one Security event at the first refusal, none again
  until an open succeeds. B: fixed clock-hour windows — a burst of 200 across an hour boundary passes.
- **DR-S (DATA ARCHITECT, F2.4a schema.md: a send returns the target's name outside the limit).** **A (recommended):** a send counts
  as an open (c24); it touches F2.4a's approved endpoint, recorded as a c1 change. B: not counted — accepted gap: target ids come only
  from lists already counted or shared links.
- **DR-C (spec gap: the SRS's changer, an Admin, does not exist before I4).** **A (recommended):** a change is a reviewed migration on
  the normal pipeline (prod in the batch), recorded in that part's `result.md`. B: an environment variable Afik edits in Vercel — no
  audit trail, outside the product's "Admin only".
- **DR-O (spec gap).** The caller's own link. **A (recommended):** own ProfilePage, no viewer call, not counted (c27). B: the viewer API
  with own id → the non-Friend view (F2.3 schema.md default), counted.
- Q3: copy for c25–c29 is not in the SRS → **assumed:** as written there; the rest by BUILDER (ux-copy-he), recorded at I2's close.

**Closed (records)** — DR-1 → A, copy-my-profile-link entry (Gate 1, 17.10) · DR-2 → A, Friend sees F2.3's Open view in both states
(Afik, 17.10) · DR-T → 100 opens/hour/account, changeable Configuration (Afik, 17.10) · DR-G1 → `profile_view` approved (Afik, 17.10) ·
DR-3 → A, silent decline · DR-4 → A, Cancel included · DR-5 → A, inactive counterparty hidden, row kept (Gate 1) · DR-6 → A,
`regular_names` · DR-7 → A, B's send reopens A's request · DR-B → FORCE lift in migration (Gate 2) · Q1, Q2 → defaults (Gate 1).

**Size estimate**  a ~305 · b ~220 (+ names ~40) · **c1 ~360** (`profile_view` Friend branch + lists ~90, count + configuration + Security
event migration and rollback ~90, server route/service/repository + limit ~150, shared Zod ~30) · **c2 ~300** (screen ~200, copy link
~40, action wiring ~60). Order: F2.3b → F2.4a → c1; F2.4b → c2. c1 and b may run in either order.

## Gate 1 — ORCHESTRATOR, 17.10.2026

Split approved: **F2.4a** (c1–c12) **approved**, Elevated. **F2.4b** (c13–c15) approved in shape, built once DR-6 passes Gate 2 (it did,
DR-6 A). **F2.4c** waited for Afik (DR-G1, DR-T, DR-2), to be re-gated and split. DR-1, DR-3, DR-4, DR-5 → A; Q1, Q2 defaults. Reason:
SPEC's recommendations; DR-1 A uses the "Profile/Deep Link" FR-PRIV-001 already names and leaks no email.

**Afik, 17.10.2026 (decisions.md 2026-10-17 "I2 reserved items"):** DR-2 → A · DR-T → 100 profile opens per hour per account, as
changeable Configuration · DR-G1 approved. F2.4c re-specced above as F2.4c1 + F2.4c2; its Gate 1 is ORCHESTRATOR's.

## Gate 1 (F2.4c) — ORCHESTRATOR, 17.10.2026

Split approved: **F2.4c1** (c16–c24) after F2.3b and F2.4a are merged; **F2.4c2** (c25–c30) after c1 and F2.4b. Both Elevated
(c2 adds an external surface: a shareable link, login still required). **DR-W → A** (rolling 60 minutes; 404 opens count, 429
refusals do not; one Security event per stretch of refusals) · **DR-S → A** (a Friend-request send counts as a profile open;
built in c1, F2.4a ships without it) · **DR-C → A** (threshold changes by a reviewed migration until the I4 Admin screen) ·
**DR-O → A** (own link → own profile page, nothing counted). Q3 default. Reason: SPEC's recommendations; DR-C keeps an audit
trail. Gate 2 must say whether the counter/event write needs a new SECURITY DEFINER — if so it is reserved for Afik. For the I2
close report: NFR-SEC-006 (5) "reported to Admin" and pattern detection deferred to I4.

## Gate 1 clarifications (F2.4a) — ORCHESTRATOR, 17.10.2026, from TEST ENGINEER's return
Internal HOW, not a change to an approved criterion.
- **Routes.** `POST /api/friend-requests` {targetUserId} · `POST /api/friend-requests/:userId/accept|decline` · `DELETE /api/friend-requests/:userId`
  (cancel) · `DELETE /api/friends/:userId` (remove) · `GET /api/friends` → `{incoming, sent, friends}`, entries `{userId, fullName[, requestedAt]}`.
  Actions are keyed by the counterpart id (schema.md). One source: `apps/server/tests/helpers/friends-api.ts`.
- **c5/c9 vs schema.md "0 rows → 404 if no row visible, else 409".** The spec binds: "visible" means a row **in the action's own direction**
  (accept/decline: requester = $t, addressee = me; cancel: requester = me, addressee = $t; remove: an accepted-or-removed row with $t). So A
  accepting B's id while only A→B exists → 404 `unavailable` (c5); 409 `request_gone` only when that direction's row exists but is no longer in
  the required state (c9).
- **c9 cancel after a decline.** The requester cannot know of a decline (DR-3 silent), so to A a declined row is still "pending": cancel succeeds
  exactly as on pending (schema.md's requester declined-cancel move), and returns the same response. "No longer pending" in c9 means, from the
  requester's side, cancelled, accepted or removed.
- **Response shapes (BUILDER's choices, accepted).** Success bodies `{}` — 201 on send, 200 on accept/decline/cancel/remove. A caller who is
  P, M, D or has no account row → 403 `forbidden` (c10 says only 403; `account_unavailable` stays for a suspended or banned Regular). The sent
  list keeps an uncancelled declined request (DR-3 silent). No list or body returns `status`.

## Gate 1 clarifications (F2.4b) — ORCHESTRATOR, 17.10.2026, from TEST ENGINEER's return
- **c13 "to a Regular only".** The web has only Regular sessions until I4/I7 (`/api/me` carries `state` only), so the positive case is
  asserted; the negative case is enforced by F2.4a's 403 for P/M/D and is re-asserted when a non-Regular web session exists.
- **c13/c14 copy.** Q1's defaults stand: the empty texts and failure messages are BUILDER's under `ux-copy-he` (ERR-004 for failures);
  tests assert structure (a non-empty text per empty list, a message plus "נסו שוב", a non-empty `role="alert"`). Only "הבקשה כבר לא
  זמינה" is verbatim.
