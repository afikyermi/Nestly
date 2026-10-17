# F2.2 — Journeys and children: view, add, edit, end (journeys-children)

**Problem**        After registration a Regular parent cannot see the journeys and children they entered, add a child born
                   later, fix a child's name or birth date, add a pregnancy, or record that a pregnancy is over. What
                   onboarding stored stays for good, and the Journey Summary others will see (§1.4) is derived from it.
**Requirements**   FR-PROFILE-002 (05-functional/profile-settings.md; its "TBD" on parallel journeys is resolved in part by OP-003,
                   appendix-b-open-points.md) · PG-012 (07-screens-navigation.md) · VAL-005, 006, 039, 040, 043, 044 (09-validations.md)
                   · AC-089, AC-090 (15-acceptance.md) · §13 Child, JourneyContext, §13.1 (13-data.md) · NFR-PRIV-005 · ERR-003/004/037/038
                   · data-model.md rules 3, 11, 12, 14, 15 · data-model-tables.md journey_contexts, children · review points A1, A8, A9, S2, S3.
**Scope**          Regular account, own rows only. A section "המסע שלי" on the profile page (`PATHS.profile`, PG-012) listing the
                   caller's journeys and children. **F2.2a:** view; add and edit a child; ≤ 10 children. **F2.2b:** add a pregnancy,
                   edit its due date, end a pregnancy, remove a child, birth, planning → pregnant (DR-1..DR-6). Validation reuses the
                   registration rules in `packages/shared`. A row id may appear in a path, never a user id. As built (a, interface.md):
                   GET/POST/PUT answer the full `OwnJourneys`. Part b, names may change (notes.md): `POST /api/journeys` · `PUT`/`DELETE
                   /api/journeys/:id` · `DELETE /api/children/:id` · birth `POST /api/journeys/:id/birth`; each 200/201 → `OwnJourneys`.
**Out of scope**   Choosing or showing an active / first journey (OP-003, I6) · My Stage, Home, Dashboard: nothing reads journeys
                   today, so FR-PROFILE-002's "עדכון My Stage" updates nothing in F2.2 · what another user sees, Journey Summary, Open/
                   Restricted (F2.3/F2.4) · child photos (M1), ChildBirthdayVisibility, birthday notifications · pregnancy week, any
                   due-date reminder or clock-driven prompt · "מחזור וביוץ" (not in VAL-039) · editing a stage in place (DR-5) · reordering
                   children · change history, self-edit audit, analytics events · Professional accounts · account deletion (I9) · **part b:**
                   an end reason (DR-2r) · undo, trash, soft delete (DR-1) · adding or ending "מתכננים" alone (Q5) · removing has_child directly.
**Data touched**   `nestly.children` (name, sex, birth_date, slot): UPDATE, INSERT outside registration; part b DELETE (hard, DR-1).
                   `nestly.journey_contexts`: INSERT of has_child (c7); part b INSERT of pregnant, UPDATE of due_date, DELETE of pregnant,
                   planning, has_child. Own-row grants and policies behind `is_active_account()`. DATA ARCHITECT owns the shape (Gate 2).
**Risk flags**     F2.2a: minors' data · authorization (own-row writes) · schema → **Elevated**. F2.2b: the same, plus health-related
                   data (pregnancy) and destructive change (hard delete, DR-1) → **Elevated**.

**Acceptance criteria — F2.2a**
1. 🎨 A has journeys {pregnant, dueDate 2027-03-01}, {has_child} and children נועה (girl, 2023-05-04, slot 1), איתי (boy,
   2025-01-10, slot 2): "המסע שלי" shows "בהריון · תאריך לידה משוער: 01.03.2027", "יש לנו ילד או ילדה", then "נועה · בת ·
   04.05.2023" and "איתי · בן · 10.01.2025" in that order, each child with "עריכה". [FR-PROFILE-002, PG-012] Screens: `journey-view`.
2. 🎨 dueDate null → "תאריך לידה משוער: לא צוין". Planning only → "מתכננים", no child rows, and "הוספת ילד". While GET is pending:
   a loading state, no rows or controls. GET 5xx or network failure → "לא הצלחנו לטעון את פרטי המסע. אפשר לנסות שוב" and "נסו
   שוב", which repeats the GET; the F2.1 fields still render. [ERR-004, Q1] Screens: `journey-view-empty`, `journey-load-failed`.
3. 🎨 "הוספת ילד" opens a form: "שם", "מין" (בן / בת / עוד לא ידוע) and "תאריך לידה" in three fields (day, month, year), all
   required, as at registration. "ביטול" closes it with no request. A valid save → POST; the child appears last in the list,
   also after a full reload. [FR-REG-003, VAL-043, VAL-006, VAL-005] Screens: `child-form`.
4. 🟡 Web, after the first Save: name empty or spaces → "יש למלא שם"; 61 characters after trim → "שם צריך להכיל עד 60 תווים" (1
   and 60 accepted, stored trimmed); no sex → "יש לבחור מין"; date empty or partial → "יש למלא תאריך לידה"; 31.02.2024 → the
   registration "date does not exist" text; tomorrow → "תאריך הלידה לא יכול להיות בעתיד" (today accepted); 31.12.1899 → "התאריך
   צריך להיות מ-1900 ואילך" (01.01.1900 accepted). Nothing is sent. Focus moves to the first invalid field; its error is tied
   by `aria-describedby`. [VAL-043, VAL-006, VAL-005, ERR-003] Screens: `child-form-errors`.
5. 🟡 The server checks every write with the same shared schema on its own date. A failing value → 400 `{error:"invalid",
   reason:<the registration code>}`. A body with any other key (`userId`, `user_id`, `slot`, `id`) → 400. No row changes. [S2, rule 12]
6. 🟡 With 10 children "הוספת ילד" is disabled and "אפשר להוסיף עד 10 ילדים" shows. POST with 10 stored → 409 `{error:
   "children_too_many"}`, still 10. Two concurrent POSTs with 9 stored → exactly one succeeds. Two concurrent POSTs with 5
   stored → both stored, distinct slots. [VAL-040, AC-090] Screens: `children-limit`.
7. 🟡 Adding the first child when A has no has_child journey also creates it, in the same transaction; if either insert fails,
   neither row exists. [DR-4 — not in the SRS]
8. 🎨 A child's "עריכה" opens the form filled with its values; a save under c4/c5 updates name, sex and birth date, the order
   is unchanged, and the view shows the new values after a reload. "ביטול" sends nothing. [FR-PROFILE-002, DR-5]
9. 🔴 pgTAP as `authenticated` with A's claims: SELECT on children and journey_contexts returns only A's rows; UPDATE of B's
   child affects 0 rows; INSERT naming user_id B is denied; UPDATE of a child's user_id, slot or created_at → 42501; DELETE on
   either table is denied (part b: superseded by c18). API: PUT on B's child id, or a non-uuid id → 404 `{error:"not_found"}`, B unchanged.
10. 🔴 Suspended or banned A: every route → 403 `account_unavailable`, no data; pgTAP reads and writes 0 rows. No token or an
    invalid one → 401 and no query. Unregistered → 404 `no_profile`, nothing created. [A9, ERR-037, F2.1 DR-T1]
11. 🔴 The server runs as `app_server` under `SET LOCAL ROLE authenticated` with A's claims; no service role, no new SECURITY
    DEFINER. Captured logs of every route in 2xx, 400, 409 and 5xx hold no child name, sex, birth date, due date or stage. [A8, NFR-PRIV-001]
12. 🎨 Save on a network failure or 5xx: the form keeps its input, "השמירה לא הצליחה. אפשר לנסות שוב" in `role="alert"`; Save is
    disabled in flight, a double press sends one request. Success → "הפרטים נשמרו" in `role="status"`, focus back on the opening
    button. A refused token follows ERR-038 as F2.1 c16. [ERR-004, ERR-038] Screens: `journey-save-failed`.
13. 🎨 Every screen listed: zero axe-core violations, RTL, phone and desktop widths; every field labelled; add, edit, save and
    cancel reachable by keyboard alone. [S3, NFR-A11Y-001]

**Acceptance criteria — F2.2b** (c11–c13 extend to every part-b route and screen; copy not in the SRS is Q1)
14. 🎨 The pregnancy's "עריכה" opens "תאריך לידה משוער (לא חובה)" in three fields: today−30 and today+300 accepted, −31 and +301
    refused with the registration range text; partial → "יש להשלים את התאריך או להשאיר אותו ריק"; all cleared → saved null. The
    server re-checks on its own date (400, registration reason, no change). PUT on a planning or has_child id → 404. [VAL-044, DR-5] Screens: `pregnancy-form`.
15. 🟡 With neither planning nor pregnant, "הוספת הריון" opens the c14 date (empty allowed); a save creates the pregnant journey,
    shown in JOURNEY_STAGES order. With pregnant present the action is not shown and POST → 409 `{error:"stage_conflict"}`, no row.
    Two concurrent POSTs → exactly one pregnant row. [VAL-039, AC-089]
16. 🔴 "הסרה" on a child, "סיום מסלול ההריון" on the pregnancy and "הוספת הריון" while planning each open a confirmation naming
    the item: "להסיר את נועה? הפרטים יימחקו ולא ניתן לשחזר אותם" · "לסיים את מסלול ההריון? הפרטים יימחקו ולא ניתן לשחזר אותם" ·
    "מסלול 'מתכננים' יסתיים ויימחק". "ביטול", Escape or closing sends nothing and the view is unchanged. [DR-1, DR-3] Screens: `journey-confirm`.
17. 🔴 Confirmed removal of a child: the child row is deleted (no row with its id remains in `nestly.children`), gone from the view
    and from GET after reload, and it no longer counts: at 10, remove one, "הוספת ילד" is enabled and an add succeeds, the new child
    shown last. After an ended pregnancy, a new one can be added under c15. [DR-1, VAL-040]
18. 🔴 pgTAP as `authenticated` with A's claims: DELETE of A's child or journey removes 1 row; DELETE, UPDATE of due_date, or a
    birth on B's rows affects 0 rows, B unchanged; INSERT of a journey naming user_id B is denied; UPDATE of a journey's user_id,
    stage or created_at → 42501. API: any part-b route on B's id, an unknown id or a non-uuid → 404 `not_found`, nothing changes. [A1, rules 12, 14]
19. 🟡 Removing a child while others remain keeps has_child; removing the last child deletes has_child in the same transaction
    (a forced failure of either leaves both rows). After any two concurrent writes (remove the last two; add one while removing
    the last), has_child exists if and only if ≥ 1 child exists. [DR-4 — not in the SRS]
20. 🔴 Ending a pregnancy: no reason field; the DELETE takes no body (a body → 400); the pregnant row is deleted, and no column, row
    or log line records that it ended or why. That route on a has_child or planning id → 404 (only c19/c23 end those). [DR-1, DR-2r]
21. 🎨 Zero journeys (DR-6): ending A's only journey, or removing the last child when has_child is the only journey, succeeds; the
    view shows "עוד לא נבחר שלב במסע" with "הוספת הריון" and "הוספת ילד". [DR-6 — not in the SRS] Screens: `journey-view-none`.
22. 🔴 Birth: "הלידה התרחשה" on the pregnancy opens the c3 form (empty, c4 rules); a save adds the child (with has_child if
    missing, c7) and deletes the pregnancy in one transaction. Cancel sends nothing. With 10 children → 409 `children_too_many`,
    the pregnancy kept, the form shows the c6 text. A forced failure of any step leaves all rows as before. [DR-2, DR-4] Screens: `birth-form`.
23. 🔴 Planning → pregnant: after the c16 confirmation, POST deletes planning and creates pregnant in one transaction; the view shows
    "בהריון" and no "מתכננים". A POST with planning present that does not carry the confirmation → 409 `stage_conflict`, both
    unchanged. A forced failure leaves planning and no pregnant. [DR-3, VAL-039]
24. 🔴 Suspended or banned A: every part-b route → 403 `account_unavailable`, no row deleted or changed; pgTAP DELETE/UPDATE 0
    rows. No or invalid token → 401, no query. The web shows ERR-037 / follows ERR-038 as c12; an open dialog closes, nothing sent twice. [A9]
25. 🎨 A dialog in flight: confirm disabled, a double press sends one request; 5xx or network → it stays open with "הפעולה לא
    הצליחה. אפשר לנסות שוב" in `role="alert"`, the item still shown. 404 (gone in another tab) → GET refreshes, the item absent, no
    error. Success → "הפרטים נשמרו" in `role="status"`. [ERR-004, Q3]
26. 🎨 Dialog a11y: `role="alertdialog"`, `aria-modal`, named by its question; focus opens on "ביטול" (Q4), Tab stays inside,
    Escape cancels; on cancel focus returns to the opening button, after a delete to the h2 "המסע שלי". "הסרה" keeps that name
    with `aria-describedby` → the child's row (as "עריכה"). c13 holds on every part-b screen, RTL with `<bdi>` names. [S3, NFR-A11Y-001]

**Open questions** (closed ones are records)
- Closed: DR-1 → A, DR-2r → no reason, "סיום מסלול ההריון" (Afik 17.10, decisions/2026-10.md) · DR-2..DR-6 → A (Gate 1) · Q2 last write wins.
- Q1: copy not in the SRS (section, action, dialog, c21/c25 texts) → **assumed:** as written; dd.mm.yyyy. Record at I2's close.
- Q3: deleting an item already gone → **assumed:** API 404; the web refreshes, no error (c25). Q4: dialog focus → **assumed:** "ביטול".
- Q5 (spec gap; FR-PROFILE-002 says only "הוספה/עריכה"): adding "מתכננים" after registration, or ending it alone → **assumed:** not in
  F2.2b; a zero-journey parent can add a pregnancy or a child. Record at I2's close.
- FYI for Afik, not blocking: child names are UGC about minors; nothing leaves the owner in F2.2 (F2.3 owns exposure).

**Size estimate**  F2.2a (c1–c13) ~410, merged (PR 41). F2.2b ~460 → split: **b1** = c14–c15 (pregnancy add/edit; c18/c24 for its
routes; no DELETE grant) ~180 · **b2** = c16–c26 (dialog, deletes, birth, planning → pregnant) ~280. Both Elevated.

## Gate 1 — ORCHESTRATOR, 17.10.2026

**F2.2a approved** (c1–c13), one part, Elevated; it depends on no reserved decision. **F2.2b** is approved in shape only:
c14–c15 may be built; c16–c18 and the DR-dependent criteria wait for DR-1 / DR-2r (Afik) and are re-gated then.
- **DR-2 → A** (birth = "הלידה התרחשה" → add-child form, one transaction; the end itself follows DR-1).
- **DR-3 → A** (planning ends in the same transaction, after a confirmation line; "ends" follows DR-1).
- **DR-4 → A** (first child creates has_child; the last child's removal ends it) — keeps registration's has_child ⇔ ≥ 1 child.
- **DR-5 → A** (child: name, sex, birth date; pregnancy: due date, clearable; a stage changes only by add or end).
- **DR-6 → A** (the last journey may end; VAL-039's "at least one" is a registration rule).
Reason: each is the SPEC recommendation, inside the SRS rules (VAL-039/040, FR-REG-003) and the least data kept about children.
Q1, Q2 take their defaults. **DR-1 and DR-2r are reserved** → WORKPLAN "ממתין לך"; work continues on F2.2a, then F2.3.
FYI for Afik (not blocking): child names are UGC about minors; nothing leaves the owner in F2.2.
Code waits for PR 40 (one branch); DATA ARCHITECT runs now on F2.2a.

**Afik, 17.10.2026 (decisions.md 2026-10-17 "I2 reserved items"):** DR-1 → A (hard delete after a confirmation step) · DR-2r → no reason asked or stored; label "סיום מסלול ההריון". F2.2b is unblocked: SPEC writes the remaining criteria, then Gate 1 again.

## Re-spec for F2.2b — SPEC, 17.10.2026
c14–c26 (13, Elevated ≤ 20): c14–c15 tightened (planning case moved to c23, DR-3 A), c16–c18 rewritten for DR-1 A, c19–c26 new.
Header Scope / Out of scope / Data touched / Risk flags updated for part b; c9's "DELETE denied" marked superseded by c18 (Afik's
DR-1). New defaults Q3–Q5. Split b1/b2 proposed. **Gate 1 for F2.2b: ORCHESTRATOR**, then DATA ARCHITECT (Gate 2: DELETE grants).

## Gate 1 (F2.2b) — ORCHESTRATOR, 17.10.2026

Approved, split: **F2.2b1** (c14–c15, pregnancy add and due-date edit, no DELETE) · **F2.2b2** (c16–c26, confirmation dialog,
hard deletes, birth, planning → pregnant, has_child bookkeeping). Elevated. Q1, Q3–Q5 take their defaults (Q5: adding or ending
"מתכננים" alone is not in F2.2b — record at I2's close).
**Change control (approved F2.2a text):** c9's "DELETE on either table is denied" is replaced in b2 by c18 (own-row DELETE only),
and c15's planning case moves to c23 — both follow from Afik's DR-1 A and Gate 1 DR-3 A. Child order becomes order of addition
(a freed slot is reused), so c3/c17 keep "a new child shows last"; DATA ARCHITECT shapes the order and the has_child race (c19).

**ORCHESTRATOR, 17.10.2026 — c14 server window (TEST ENGINEER finding 1).** The server judges VAL-044 against every date an
Israeli device can hold: its UTC date or the next one (F1.4 Q4). It accepts **UTC today−30 … UTC today+1+300** and refuses
outside that; the web keeps −30 / +300 on the device's date. So c14's server half reads: −30 accepted on any server date,
−31 and +302 refused. The same shared rule serves registration step 1 (F1.4), which refused a device-valid today−30 when the
UTC and Israeli dates agree — an escape, fixed in this part (escapes.md).

**Afik, 17.10.2026 — c20 wording (OP-036, CRITIC F2.2b2 low).** c20's "no column, row or log line records that it ended"
reads **"no application log line, column or row records that it ended"**. The platform's technical logs (Vercel request
log, Supabase Auth log) are kept briefly and are covered by the Privacy Policy, beside the backups (§13.4).
`decisions.md` 17.10 "Privacy policy".
