# F2.3 — Profile privacy: Open / Restricted, Journey Summary, birthday consent (profile-privacy)

**Problem**        A Regular parent cannot choose whether people who are not their Friends see their full profile or only the
                   basic one, cannot hide the no-children sentence, and cannot say whether their child's birthday may reach
                   Friends. Nothing stores these choices, and nothing yet guarantees what a non-Friend can read of a parent's
                   children: today the only rule is "owner only" (data-model layer 9), with no defined public view (layer 5).
**Requirements**   FR-PRIV-001 (05-functional/profile-settings.md) · BR-044, BR-037 (08-business-rules.md) · VAL-027 (09-validations.md)
                   · AC-054, AC-046 (15-acceptance.md) · §1.4 Regular Profile Visibility, Basic Public Profile, Journey Summary
                   (01-intro.md) · OP-020, OP-021 closed (appendix-b-open-points.md) · §13 PrivacyPreference, ChildBirthdayVisibility,
                   §13.2 rows "Regular Profile — Public", "Child / Journey Context" (13-data.md) · NFR-PRIV-001, NFR-PRIV-003 · PG-038
                   · data-model.md layer 5, rules 1–3, 9, 10, 12, 14, 15 · review points A1, A8, A9, P1, P2, P3, P7, S2, S3.
                   Decided by Afik (I2 questionnaire 1, 2, 5): default Open; existing accounts backfilled to Open; birthday on.
**Scope**          (1) Owner settings, Regular only, own row: visibility (open | restricted), the Journey Summary sentence toggle
                   (default shown), ChildBirthdayVisibility (one switch per parent, §13 "העדפת פרטיות של ההורה"; default on). A
                   screen (location: DR-2) and `GET`/`PUT /api/privacy` (name may change) with a strict body and no user id.
                   (2) Defaults for new accounts and the backfill of existing ones. (3) A database-level read of another Regular
                   user's public profile, as a non-Friend, enforced by RLS — DATA ARCHITECT chooses the shape (policy, a
                   `security_invoker` view, or a function on the approved list). F2.3 asserts it in pgTAP. Server and screen: DR-1.
**Out of scope**   Friends, the Friends and mutual-Friends lists, any Friend branch (F2.4) · the message action (FR-CHAT-002, I8) ·
                   profile photo (I5) · People Search and searchability (I7) · the NFR-SEC-006 / ERR-032 / AC-078 rate limit on
                   opening profiles (thresholds are an I7 blocker) · sending any birthday notification (I7); F2.3 only stores the
                   consent · birthday consent per child · an "as others see me" preview · Admin / Moderator access to profiles
                   (USER_VIEW, I4) · a Regular viewing a Professional profile (FR-SERV-003) · sharing rules for Restricted posts
                   (BR-064, I3) · Settings menu and side-menu entry (F2.5) · any option to hide from search (VAL-027 forbids it) ·
                   audit or history of setting changes, analytics events · Tracker Data (none exists; the exclusion is still asserted).
**Data touched**   New: the three settings per Regular account (columns on `regular_profiles` or a settings table — DATA ARCHITECT,
                   Gate 2), with a backfill. Read across users for the first time: `regular_profiles` (full_name, gender), `children`
                   (count and derived age only), `journey_contexts` (presence of a pregnant journey only). If a SECURITY DEFINER
                   function is chosen, it is the first one that reads other users' rows (data-model "Open, under rules 16 and 17").
**Risk flags**     authorization (first cross-user read) · minors' data (ages, count) · health-related data (pregnancy) · schema
                   migration with a backfill → **Elevated**. No money, provider or unauthenticated surface.

**Acceptance criteria** — "V" is an active Regular viewer, never a Friend (no Friendship exists before F2.4); "B" is the
target. B's fixture unless stated: full_name "דנה כהן", gender woman; children נועה (girl, 2023-05-04, slot 1) and איתי
(boy, 2025-01-10, slot 2); a pregnant journey with dueDate 2027-03-01; a has_child journey.
1. 🎨 Owner A with defaults opens the settings screen: "פרופיל פתוח" selected over "פרופיל מוגבל", each with one line on what a
   non-Friend sees; "הצגת המשפט כשאין ילדים והריון" on; "יום הולדת של ילד בהתראות לחברים" on. [FR-PRIV-001, BR-037, Q1]
   Screens: `privacy-settings`.
2. 🟡 A sets restricted, sentence off, birthday off and saves → `PUT`; the screen and `GET /api/privacy` show those values after a
   full reload. Each of the 8 combinations is stored exactly as sent. One Save for the three. [FR-PRIV-001, Q2]
3. 🟡 Server, shared Zod schema: visibility outside {open, restricted}, or a toggle that is not a boolean → 400 `{error:"invalid"}`.
   Any other key (`userId`, `user_id`, `searchable`, `hiddenFromSearch`) → 400. No row changes. [VAL-027, S2, rule 12]
4. 🎨 Loading: no values or controls. GET failure: "לא הצלחנו לטעון את הגדרות הפרטיות. אפשר לנסות שוב" + "נסו שוב". Save failure: input
   kept, "השמירה לא הצליחה. אפשר לנסות שוב" in `role="alert"`; Save disabled in flight, a double press sends one request. Success:
   "הפרטים נשמרו" in `role="status"`. A refused token follows ERR-038 as F2.1 c16. [ERR-004, ERR-038, Q1]
   Screens: `privacy-settings-load-failed`, `privacy-settings-save-failed`.
5. 🔴 pgTAP as A: A reads and updates only A's settings; UPDATE of B's settings affects 0 rows; A cannot read B's birthday consent
   by any query; INSERT naming user_id B denied; DELETE denied. API: no token → 401, no query; suspended or banned A → 403
   `account_unavailable`, pgTAP 0 rows; unregistered → 404 `no_profile`. [A1, A9, rules 12, 14, 15]
6. 🔴 After the migration, every existing Regular account (fixtures: with children, pregnant only, planning only, none, suspended)
   has open, sentence shown, birthday on; a pgTAP count of Regular accounts lacking any of the three is 0. An account registered
   after the migration has the same three values without registration sending them. The rollback removes the settings and
   leaves profiles, journeys and children unchanged. [Afik questionnaire 1, 2, 5; OP-021]
7. 🔴 B restricted. V's read of B returns exactly: full name, number of children 2, "בהריון". It returns no age, gender, child name,
   sex, birth date, child id or slot, due date, pregnancy week, journey id, planning status, email, created_at, birthday consent,
   or tracker data. [BR-044, VAL-027, AC-054, P1, P2]
8. 🔴 B open, today 2026-10-17 in Asia/Jerusalem. V's read of B returns exactly: full name, gender (DR-4), number of children 2, the
   ages as numbers in slot order — נועה (3 years, 5 months), איתי (1 year, 9 months) — and "בהריון"; no age text. Every other
   exclusion of c7 holds. gender NULL → no gender item. [FR-PRIV-001, AC-054, P2, P3, DR-3 (Afik 17.10)]
9. 🔴 No other path: as V, direct SELECTs on every table and view in `nestly` return none of B's children or journey rows, no
   child name, birth date or due date in any state, and no gender while B is restricted. Only the c7/c8 read exposes B. [A1, A8, P2]
10. 🔴 B with no children and no pregnancy (planning only; and zero journeys), sentence on: in both states V gets the name and the
    sentence "עוד אין כאן ילדים, אז הקפה עדיין מגיע חם ☕", no count. Sentence off: no Journey Summary item at all. Pregnant only:
    "בהריון", no count, no sentence. Children present: the toggle changes nothing. Planning never appears. [§1.4, VAL-027, OP-021]
11. 🔴 A Professional viewer P (fixture account) gets a result equal, item for item, to V's for the same B, in both states. [OP-020]
12. 🔴 A change applies on the next read: B switches open → restricted, V's next transaction gets c7; back → c8. B adds a child →
    count 3 on V's next read. [FR-PRIV-001 "מיושמת בכל פתיחת"]
13. 🔴 Unavailable: B suspended or banned (DR-5), B a Professional account, a random uuid, a non-uuid → V gets 0 rows, identical
    across the four. V suspended or banned → 0 rows for every B. [A9, BR-063, DR-5]
14. 🔴 Ages — database, numbers only (Open, c8): per child, slot order, completed years and months 0–11, computed in the database from
    birth_date on today's date in Asia/Jerusalem; birth_date never leaves the database on this path; no Hebrew text there. Rule:
    completed calendar months since birth; the Nth monthly anniversary is the birth day of the month, or the 1st of the next month
    when that month has no such day; years = months ÷ 12, months = the remainder. Today 2026-10-17, born: 2026-10-17 → (0,0) ·
    2026-09-18 → (0,0) · 2026-09-17 → (0,1) · 2026-08-17 → (0,2) · 2025-10-18 → (0,11) · 2025-10-17 → (1,0) · 2025-09-17 →
    (1,1) · 2024-10-18 → (1,11) · 2024-10-17 → (2,0). Born 2024-02-29, on: 2025-02-28 → (0,11) · 2025-03-01 → (1,0) · 2027-02-28
    → (2,11) · 2028-02-29 → (4,0). Born 2026-01-31, on: 02-28 → (0,0) · 03-01 → (0,1) · 03-30 → (0,1) · 03-31 → (0,2) · 04-30 →
    (0,2) · 05-01 → (0,3); born 2024-01-31 on 2024-02-29 → (0,0). Time zone, born 2025-10-18: at 2026-10-17T20:59Z (23:59 IDT) →
    (0,11), at 21:00Z (00:00 IDT 18.10) → (1,0); born 2026-01-01: at 2026-12-31T21:59Z (23:59 IST) → (0,11), 22:00Z → (1,0). The
    test controls the date and instant (how: DATA ARCHITECT). A birth_date after today: DR-6. [DR-3 Afik; FR-PRIV-001; VAL-005; P2]
15. 🔴 Runtime runs as `app_server` under `SET LOCAL ROLE authenticated`; no service role. A new SECURITY DEFINER exists only if
    DATA ARCHITECT lists it in data-model.md "Approved exceptions", and the pgTAP list check matches that list. [A8, rules 1, 10]
16. 🎨 `privacy-settings` and its two failure screens: zero axe-core violations, RTL, phone and desktop widths; the visibility choice
    is a labelled radio group, the toggles expose their state, all reachable and operable by keyboard. [S3, NFR-A11Y-001]
17. 🟡 Age phrase — web copy, a pure function in `packages/shared` (name may change), Vitest-tested in F2.3b, first rendered by
    the viewer screen in F2.4c. Input (years, months) → one whole phrase per case, never assembled from fragments that break
    agreement; no "בן"/"בת" or other sex marker (sex is not in the read, c7), no "גיל" prefix (Q3–Q6): (0,0) "פחות מחודש" ·
    (0,1) "חודש" · (0,2) "חודשיים" · (0,4) "4 חודשים" · (0,11) "11 חודשים" · (1,0) "שנה" · (1,1) "שנה וחודש" · (1,2) "שנה
    וחודשיים" · (1,3) "שנה ו-3 חודשים" · (2,0) "שנתיים" · (2,1) "שנתיים וחודש" · (2,2) "שנתיים וחודשיים" · (2,5) "שנתיים ו-5
    חודשים" · (3,0) "3 שנים" · (3,5) "3 שנים ו-5 חודשים" · (11,0) "11 שנים" · (25,7) "25 שנים ו-7 חודשים". Years negative or not
    an integer, months outside 0–11 or not an integer → throws; no partial phrase. [DR-3 Afik; NFR-USAB-003; ux-copy-he]

**What F2.4 must add:** the Friend branch (what a Friend sees, FR-REL-001) · Friends and mutual-Friends lists in both states ·
c7–c13 re-run with a Friend pair, a non-Friend pair, and a removed Friend reverting at once · the message action (I8) · and,
under DR-1 A, the viewer endpoint and screen with the first entry point, plus the profile-open rate limit (thresholds: I7) ·
the viewer screen (F2.4c) renders each age with c17's function from c14's numbers, never its own wording.

**Open questions**
- **DR-1 (ORCHESTRATOR)** — viewer endpoint and screen. **A (recommended):** F2.3 ships the database read only (c7–c15, pgTAP);
  `GET` of another profile and UserProfilePage-for-others ship with the first entry point (F2.4's list or I7 Search). Reason:
  nothing reaches another profile yet; NFR-SEC-006 requires a rate limit on opening profiles whose thresholds are open (I7);
  the I2 plan already gives F2.4 "what a non-Friend sees". B: endpoint now, no screen, no rate limit (breaks NFR-SEC-006 until
  I7). C: endpoint and a URL-only screen (B's gap, +~200 lines → split).
- **DR-2 (ORCHESTRATOR)** — where the owner settings live before F2.5. **A (recommended):** PG-038 SettingsPage at its own route
  with only the Privacy & Security section, linked from the profile page until F2.5 adds the menu. B: a section on the profile page.
- **DR-3 — decided by Afik 17.10.2026:** years and months, months at every age ("4 חודשים", "שנה ו-3 חודשים") → c8, c14, c17.
- **DR-4 (ORCHESTRATOR; spec gap — "כל הפרופיל" is not enumerated)** — A (recommended): Open adds the as-built fields beyond the
  basic profile, which today is parent gender only; prefer_not_to_say shown as such, NULL omitted. B: gender never to a non-Friend.
- **DR-5 (ORCHESTRATOR; spec gap)** — a suspended, banned or deletion-pending target. A (recommended): 0 rows, identical to an
  unknown id (c13). B: shown as "לא זמין" — distinguishable, reveals status.
- **DR-6 (ORCHESTRATOR; spec gap)** — a birth_date after today in Asia/Jerusalem. VAL-005 is checked by the server only, on its own
  clock; the column allows it. A (recommended): (0,0), never a negative number. B: that child's age item omitted, count kept.
- Q1: copy (screen title "פרטיות", option and toggle labels, the one-line explanations, c4 texts) is not in the SRS → **assumed:**
  as written; explanations quote §1.4. Record at I2's close.
- Q2: one Save for the three settings → **assumed:** yes, as F2.1. Two tabs → last write wins.
- Q3: under one month → **assumed:** "פחות מחודש" (not "0 חודשים"; "נולד/ה" is gendered and a slash form).
- Q4: a whole number of years → **assumed:** months omitted ("שנה", "שנתיים", "3 שנים"); "months at every age" read as "months
  shown whenever non-zero, at any age", not "ו-0 חודשים".
- Q5: one and two → **assumed:** the word forms "חודש", "חודשיים", "שנה", "שנתיים" (Afik's "שנה ו-3"), never "1 חודש" / "2 שנים";
  the conjunction joins them as "וחודש", "וחודשיים".
- Q6: 3 and up → **assumed:** digits as Afik wrote them, plural "שנים" also from 11 ("11 שנים", not "11 שנה"), "ו-" with an ASCII
  hyphen before a digit, as in Afik's example; no "גיל" in the phrase — any label is F2.4c's copy. Record at I2's close.
- No reserved item open. Birthday consent default on and visibility default Open are Afik's (questionnaire 1, 5).

**Size estimate**  Under DR-1 A: migration + backfill + rollback ~80, the public read object ~60, server route/service/repository
~110, shared schema ~20, web screen ~140 → ~410. One part. Under DR-1 B or C, split: F2.3a = c1–c6, c15–c16 (settings);
F2.3b = c7–c14 plus the endpoint (and screen).

## Gate 1 — ORCHESTRATOR, 17.10.2026

Approved, 16 criteria, one part, Elevated. **DR-1 → A** (database read only, asserted in pgTAP; the viewer endpoint and screen ship
with the first entry point and the NFR-SEC-006 rate limit) · **DR-2 → A** (PG-038 SettingsPage at its own route, Privacy & Security
section only, linked from the profile page until F2.5) · **DR-4 → A** (Open adds parent gender; prefer_not_to_say shown as such,
empty omitted) · **DR-5 → A** (an unavailable target = 0 rows, identical to an unknown id). Q1, Q2 take their defaults.
Reason: each is the SPEC recommendation; A keeps NFR-SEC-006 whole and reveals no account status.
**DR-3 is reserved** (how a child's age reads) → WORKPLAN "ממתין לך". Until answered, c8's ages and c14 are not built: the read
returns the count and "בהריון" in both states; ages are added in a follow-up part once Afik answers. Everything else proceeds.
If DATA ARCHITECT's shape for the cross-user read needs a new SECURITY DEFINER or changes the security model, Gate 2 says so and
it becomes a reserved item; otherwise Gate 2 is ORCHESTRATOR's. Code waits for F2.2a on the branch; DATA ARCHITECT runs now.

**Afik, 17.10.2026 (decisions.md 2026-10-17 "I2 reserved items"):** DR-3 → ages in years and months, e.g. "4 חודשים", "שנה ו-3 חודשים" (months at every age). c8 and c14 are rewritten to this format before F2.3b.

## Re-spec for F2.3b — SPEC, 17.10.2026 (Gate 1 for this delta: ORCHESTRATOR, open)

F2.3b = c7–c15 + c17, after DR-G1 (Afik: `profile_view` as in schema.md) and DR-3. Changed: c8 (ages as numbers, fixture values
on 2026-10-17), c14 (rewritten: numbers only, the month rule, the boundary table, now 🔴 for minors' data), DR-3 entry (resolved);
added c17 (the shared phrase function), DR-6, Q3–Q6, the F2.4 line on c17. Unchanged: c1–c7, c9–c13, c15–c16, DR-1/2/4/5, Q1–Q2.
Split by layer (Gate 1 DR-1 A): the database returns (years, months) only; the Hebrew phrase is web copy in `packages/shared`,
tested now, rendered first by F2.4c. Schema.md "Ages later" names "one more output column of DR-3's type": its type is
DATA ARCHITECT's — c14 only fixes the values. Size (F2.3b): `profile_view` + ages ~70, rollback and list amends ~30, pgTAP
53 + fixtures ~170, shared function + test ~100 → ~370. One part. 17 criteria, within the Elevated 20.

## Gate 1 (F2.3b re-spec) — ORCHESTRATOR, 17.10.2026

Approved: c8, c14 (database returns completed years and months, Asia/Jerusalem), c17 (shared Hebrew phrase, no בן/בת). **DR-6 →
A** (a birth_date after today reads (0,0), never negative). Q3–Q6 take their defaults. Over the 100-line cap by the Gate records —
accepted for this file. SPEC finding 2 (a daily reader learns the exact birth day of the month, hence the full birth date) goes
to Afik as a refinement of his DR-3 accepted cost; F2.3b is built as decided meanwhile, ages being one additive column.
