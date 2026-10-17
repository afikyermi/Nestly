# F2.4 — Friends: request, accept, decline, cancel, remove; the Friend branch of a profile (friends)

**Problem**        A Regular parent cannot connect with another parent: nothing stores a Friend Request or Friendship, there is no FriendsPage,
                   no Friend branch of profile visibility, and no way to reach another user — People Search is I7 (DR-1).
**Requirements**   FR-REL-001 (05-functional/relationships-groups.md) · FR-PRIV-001 (05-functional/profile-settings.md) · BR-029, -034, -044, -063
                   (08) · VAL-017, -027 (09) · ERR-016, -022, -032 (10) · AC-034, -054, -078 (15) · §1.4, §13 Friendship · NFR-SEC-006 · PG-036 ·
                   UC-20 · F2.3 Gate 1 DR-1 A, schema.md DR-G1 · F2.5 Q3 · data-model.md layers 4, 5, 13 · review A1, A4, A7–A9, P1, P2, P6, S3.
**Scope**          Three parts. **F2.4a** schema + API (c1–c12): Friendship with RLS; send, accept, decline, cancel, remove; the caller's three
                   lists. **F2.4b** (c13–c15): PG-036 and the "חברים" menu item. **F2.4c** (c16–c22): another Regular's profile over the API and on
                   screen — F2.3's read, Friend branch, Friends and mutual Friends, relationship action, DR-1 entry point, NFR-SEC-006 profile-open
                   rate limit. Until F2.4c merges, no screen creates a request (API and fixtures only).
**DR-G1 split**    (F2.3 schema.md: `profile_view`, the first definer reading other users' rows, reserved for Afik.) **Builds without it:** c1–c10,
                   c12, and c11 with ids only — friendship rows, where the caller is always a party, read no other user's profile. **Needs a
                   cross-user read:** the names in c11, so all of F2.4b — `regular_profiles` is own-row only, and a row policy there would also
                   expose gender under Restricted and B's birthday consent (schema.md rejected (a)) → DR-6. **Needs DR-G1:** all of F2.4c
                   (`profile_view` plus its Friend columns, schema.md "F2.4"; others' Friends lists) — and DR-T, DR-2, DR-1.
**Out of scope**   Friend Request / Accepted notifications, badges, counts (FR-NOTIF-003, UC-20's notification step — I7) · birthday notifications,
                   FriendContentNotificationPreference (I7) · direct chat, the message action (I8) · People Search (I7, unless DR-1 C) · any
                   "people you may know" (not in the SRS) · blocking (no such feature) or reporting a user (I3/I4) · a cap on Friends or requests
                   (none in the SRS) · Admin/Moderator access (I4) · photos (I5) · Recommend Group (I10) · the feed (I3) · pagination or search
                   in lists · deletion's effect, retention of declined/removed rows (I9, §13.4 open) · ages anywhere (F2.3 DR-3, reserved).
**Data touched**   New: Friendship (§13: requester, addressee, status, timestamps); shape, statuses (DR-3, DR-4), pair constraint → DATA ARCHITECT,
                   Gate 2. Cross-user: names for the lists (DR-6); in c `profile_view`, others' Friendships, an open counter, threshold config, a Security event.
**Risk flags**     a, c: authorization · schema migration · personal data (c also minors). b: personal data (others' names). All → Elevated.

**Acceptance criteria** — A, B, C are active Regular accounts; P, M, D are fixture Professional, Moderator, Admin accounts.
*F2.4a — schema and API*
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
11. 🔴 `GET` lists returns the caller's incoming, sent and Friends lists only; each entry holds exactly user id, full name (DR-6; until
    then id only) and, for requests, the request time — no email, gender, children, journeys, account status or privacy setting of the
    other user. A new account → three empty lists. [PG-036, P1, P2]
12. 🔴 Strict shared Zod: a non-uuid id, or any extra key (`requesterId`, `status`, `addresseeId`) → 400, no row. Runtime is `app_server`
    under `SET LOCAL ROLE authenticated`; a SECURITY DEFINER only if listed in data-model.md; rollback removes Friendship only. [A1, A8]
*F2.4b — FriendsPage (PG-036) — waits on DR-6*
13. 🎨 Side menu shows "חברים" to a Regular user (F2.5 Q3) → `/friends`: "בקשות שקיבלת" (אישור · דחייה), "בקשות ששלחת" (ביטול), "החברים
    שלי" (הסרה), each with its own empty text (Q1). Accept moves the entry into "החברים שלי" without a reload. Remove opens a dialog
    naming the Friend, "הסרה" / "ביטול"; "ביטול" sends nothing. Screens: `friends`, `friends-empty`, `friends-remove`. [PG-036, FR-MENU-001]
14. 🎨 Loading shows no lists. Load failure: message + "נסו שוב". Action failure keeps the entry, message in `role="alert"`; the button is
    disabled in flight, a double press sends one request. 409 `request_gone` → the list reloads, "הבקשה כבר לא זמינה". [ERR-004]
15. 🎨 The three screens: zero axe-core violations, RTL, phone and desktop; the dialog traps and returns focus; every action reachable
    by keyboard and named with the person's name. [S3, NFR-A11Y-001]
*F2.4c — viewer, entry point, Friend branch, rate limit — waits on DR-G1, DR-T, DR-2, DR-1*
16. 🔴 Every active viewer (Regular non-Friend, Friend, P) reading B gets B's Friends list and the mutual Friends with the viewer, in both
    visibility states; a non-active Friend is absent; P's mutual list is empty. [§1.4 Basic Public Profile, FR-PRIV-001, OP-020]
17. 🔴 F2.3 c7–c13 hold over the API for a non-Friend pair and for P. A Friend of B gets the DR-2 view in both of B's states; after
    Remove, the next read is the non-Friend view of B's current state. [FR-PRIV-001, BR-044, P1, P2]
18. 🔴 The profile carries the viewer's relationship state — none / sent / received / Friends — and the screen offers send, cancel,
    accept-or-decline, remove through the F2.4a API; P sees no Friend action. [FR-REL-001, AC-034]
19. 🔴 The DR-1 entry point. A Guest opening it → Login, then the profile (FR-AUTH-004); every open re-checks access. [A4]
20. 🔴 With threshold N per window W in configuration, a viewer's N+1th profile open within W → 429, no profile data, the ERR-032
    message with no threshold in it, one Security event (viewer, time, no profile data); after W, opens succeed. No endpoint lists
    users without a target id. [AC-078, NFR-SEC-006 (1), (2), (5)]
21. 🔴 N and W are read from configuration, never code; with no value set, every profile open is refused as in c20 (DR-T). [P6]
22. 🎨 UserProfilePage for others, its failure and rate-limit screens: zero axe-core violations, RTL, phone and desktop, keyboard. [S3]

**Open questions**
- **DR-1 (ORCHESTRATOR; spec gap) — how a user reaches another user before People Search.** Every honest option opens a profile or looks
  a user up, so each needs NFR-SEC-006's rate limit (DR-T) and the cross-user read (DR-G1). **A (recommended):** a profile link —
  "העתקת הקישור לפרופיל שלי" on FriendsPage, shared outside the app; it opens the profile (c16–c19), whose Friends list leads to friends of
  friends. FR-PRIV-001 already names "Profile/Deep Link"; the copy button is the only new thing. B: request by exact email — not in the
  SRS; confirms whether an email is registered. C: pull People Search (FR-SEARCH-001) from I7 — a scope change, **reserved for Afik**,
  plus ALGORITHM & DATA (ALG-008). D: no entry point in I2; "connects with Friends" waits for I7.
- **DR-T — RESERVED for Afik (open SRS item: NFR-SEC-006 "שיוגדר לפני Production", an I7 questionnaire blocker, Admin-only change)** —
  profile-open thresholds N per W, per account. No number proposed. Recommendation: answer with DR-G1, pulled forward from I7. Until
  then c is built and tested with fixture values in tests only, and merges only in c21's fail-closed state.
- **DR-2 — RESERVED for Afik (minors' data; the SRS defines only the non-Friend view)** — what a Friend sees. Derived floor: Visibility
  governs non-Friends only (BR-044, FR-PRIV-001), so a Friend of a Restricted user is not held to the basic profile. **A (recommended):**
  F2.3's Open view in both states, children and pregnancy still only as Journey Summary — least about minors; widening later is possible,
  a name once shown cannot be taken back. B: plus children's first names. C: names, birth dates, due date.
- **DR-6 (DATA ARCHITECT shape at Gate 2; reserved for Afik if Gate 2 finds it a security-model change)** — names in the lists. A
  (recommended to evaluate): invoker RLS only — full_name readable, alone, by the parties of a live pair (e.g. a name-only table the
  owner's own write keeps in step); no definer. B: a names function on DR-G1's definer pattern — waits on Afik. C: ids only until DR-G1;
  b waits. Note for CRITIC: under A or B, sending a request to an id returns that id's name outside the profile-open limit.
- **DR-3 (ORCHESTRATOR; spec gap)** — after Decline. **A (recommended):** silent — B's incoming loses it, A's sent list keeps it; a new A→B
  (also after A cancels it) never reaches B while the decline stands; B may still request A. B: it leaves A's list; A may resend at once.
- **DR-4 (ORCHESTRATOR; spec gap: FR-REL-001 has no Cancel)** — A (recommended): include it (c7); §13 lacks a "cancelled" status. B: none.
- **DR-5 (ORCHESTRATOR; spec gap)** — non-active counterparty. A (recommended): hidden, row kept, back on reactivation (c10). B: "לא זמין".
- Q1: copy is not in the SRS → **assumed:** as in c13–c14, empty texts by BUILDER (ux-copy-he). Q2 → **assumed:** newest first, no pagination.

**Size estimate**  a ~305 (migration + policies + rollback ~110, server ~170, shared ~25) · b ~220 (+ DR-6's name read ~40) · c ~470 (viewer
~120, rate limit + config + Security event ~150, screen ~200) → split again at c's Gate 1 (c16–c19 · c20–c22). One part (~1,000) does not fit.

## Gate 1 — ORCHESTRATOR, 17.10.2026

Split approved: **F2.4a** (c1–c12; c11 with ids only until DR-6) **approved**, Elevated. **F2.4b** (c13–c15) approved in shape;
built once DR-6 has a shape that passes Gate 2 without a reserved item. **F2.4c** (c16–c22) waits for Afik (DR-G1, DR-T, DR-2)
and is re-gated and split then.
- **DR-1 → A** (a "copy my profile link" entry point; built in F2.4c). **DR-3 → A** (silent decline). **DR-4 → A** (Cancel
  included). **DR-5 → A** (an inactive counterparty is hidden, the row kept, shown again on reactivation — as F2.3 DR-5).
Reason: SPEC's recommendations; A in DR-1 uses the "Profile/Deep Link" FR-PRIV-001 already names and leaks no email.
Q1, Q2 take their defaults. **DR-T** (profile-open thresholds) and **DR-2** (what a Friend sees) are reserved → WORKPLAN.
**DR-6** goes to DATA ARCHITECT at F2.4a's Gate 2; if its shape is a security-model change it joins DR-G1 for Afik.
