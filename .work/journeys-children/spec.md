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
                   registration rules in `packages/shared`. A row id may appear in a path, never a user id. Shape (names may change,
                   noted in notes.md): `GET /api/journeys` → `{journeys:[{id, stage, dueDate|null}], children:[{id, name, sex,
                   birthDate}]}` (children by slot) · `POST /api/children` · `PUT /api/children/:id` · part b: `POST`/`PUT /api/journeys`.
**Out of scope**   Choosing or showing an active / first journey (OP-003, I6) · My Stage, Home, Dashboard: nothing reads journeys
                   today, so FR-PROFILE-002's "עדכון My Stage" updates nothing in F2.2 · what another user sees, Journey Summary, Open/
                   Restricted (F2.3/F2.4) · child photos (M1), ChildBirthdayVisibility, birthday notifications · pregnancy week, any
                   due-date reminder or clock-driven prompt · "מחזור וביוץ" (not in VAL-039) · editing a stage in place (DR-5) ·
                   reordering children · change history, self-edit audit, analytics events · Professional accounts · account deletion (I9).
**Data touched**   `nestly.children` (name, sex, birth_date, slot): first UPDATE path, INSERT outside registration. `nestly.journey_contexts`:
                   INSERT of has_child (c7); part b UPDATE of due_date. Column UPDATE grants and own-row UPDATE policies behind
                   `is_active_account()`; part b may need DELETE or an end marker (DR-1), which would change the (user_id, stage)
                   unique key if rows are kept. DATA ARCHITECT owns the shape (Gate 2).
**Risk flags**     F2.2a: minors' data · authorization (own-row writes) · schema → **Elevated**. F2.2b: the same, plus health-related
                   data (pregnancy) and a possibly destructive change (DR-1) → **Elevated**.

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
   either table is denied. API: PUT on B's child id, or a non-uuid id → 404 `{error:"not_found"}`, B unchanged. [A1, rules 12, 14, NFR-PRIV-005]
10. 🔴 Suspended or banned A: every route → 403 `account_unavailable`, no data; pgTAP reads and writes 0 rows. No token or an
    invalid one → 401 and no query. Unregistered → 404 `no_profile`, nothing created. [A9, ERR-037, F2.1 DR-T1]
11. 🔴 The server runs as `app_server` under `SET LOCAL ROLE authenticated` with A's claims; no service role, no new SECURITY
    DEFINER. Captured logs of every route in 2xx, 400, 409 and 5xx hold no child name, sex, birth date, due date or stage. [A8, NFR-PRIV-001]
12. 🎨 Save on a network failure or 5xx: the form keeps its input, "השמירה לא הצליחה. אפשר לנסות שוב" in `role="alert"`; Save is
    disabled in flight, a double press sends one request. Success → "הפרטים נשמרו" in `role="status"`, focus back on the opening
    button. A refused token follows ERR-038 as F2.1 c16. [ERR-004, ERR-038] Screens: `journey-save-failed`.
13. 🎨 Every screen listed: zero axe-core violations, RTL, phone and desktop widths; every field labelled; add, edit, save and
    cancel reachable by keyboard alone. [S3, NFR-A11Y-001]

**Acceptance criteria — F2.2b** (c14–c15 need no DR; c16–c18 hold under every DR-1 option; the rest is written after DR-1/2/3/6)
14. 🎨 The pregnancy's "עריכה" opens "תאריך לידה משוער (לא חובה)" in three fields: today−30 and today+300 accepted, −31 and +301
    refused with the registration range text; partial → "יש להשלים את התאריך או להשאיר אותו ריק"; all cleared → null. [VAL-044]
15. 🟡 With neither planning nor pregnant, "הוספת הריון" opens the c14 date; a save creates the pregnant journey. With planning or
    pregnant present the action is not shown, and the API → 409 `{error:"stage_conflict"}`, no row. pgTAP: A cannot UPDATE B's
    journey, nor a journey's user_id, stage or created_at (42501). [VAL-039, AC-089; planning → pregnant is DR-3]
16. 🔴 Removing a child or ending a pregnancy takes a confirmation naming the item; cancelling it sends nothing.
17. 🔴 After a confirmed removal or end, the item is gone from the view and GET, and no longer counts toward 10 (at 10, remove
    one, an add succeeds). After a pregnancy ends, a new one can be added under c15.
18. 🔴 pgTAP and API: A cannot remove or end B's rows (0 rows / 404); a suspended A affects 0 rows.

**Open questions**
- **DECISION REQUEST DR-1 — RESERVED for Afik** (irreversible; minors' and health-related data beyond the SRS; retention §13.4
  TBD). What "remove a child" and "end a pregnancy" do. A (recommended): hard delete after confirmation — no tracker data exists
  yet, it matches OP-028's "deleted in full", and it minimises children's data. B: keep the row marked ended (history for I6;
  needs a retention rule and a new unique key). C: delete a child, keep an ended pregnancy. F2.2b's c16–c18 and later wait; F2.2a does not.
- **DR-2 (ORCHESTRATOR; spec gap) — birth.** A (recommended): "הלידה התרחשה" on the pregnancy opens the add-child form; one save
  adds the child (c7) and ends the pregnancy per DR-1, in one transaction. B: no birth action; end and add separately.
  **DR-2r — RESERVED for Afik** (health data beyond the SRS): whether a reason for an end without a birth is asked or stored, and
  its wording. Recommended: never asked or stored; neutral "סיום מסלול ההריון".
- **DR-3 (ORCHESTRATOR)** — a planning parent adds a pregnancy (VAL-039 forbids both). A (recommended): planning ends in the same
  transaction, after a confirmation line. B: refused until planning is ended. "Ends" follows DR-1.
- **DR-4 (ORCHESTRATOR; spec gap)** — has_child journey vs children. A (recommended, c7): the first child creates it, the last
  child's removal ends it (F2.2b). B: independent. Registration keeps has_child ⇔ ≥ 1 child; A keeps that true.
- **DR-5 (ORCHESTRATOR)** — editable fields. A (recommended, assumed in c8, c14): a child's name, sex, birth date; a pregnancy's
  due date, clearable; a stage changes only by add or end. B: A plus editing a stage in place, outside VAL-039's flow.
- **DR-6 (ORCHESTRATOR)** — may the last journey end (zero journeys)? A (recommended): yes; VAL-039's "at least one" is a
  registration rule, and forcing a stage after a loss is wrong. B: no, refused on the last one.
- Q1: copy ("המסע שלי", "הוספת ילד", "הוספת הריון", c2/c12 texts) is not in the SRS → **assumed:** as written; reused texts keep
  their registration wording; dates as dd.mm.yyyy. Record at I2's close.
- Q2: two tabs editing one child → **assumed:** last write wins.
- FYI for Afik, not blocking: child names are UGC about minors; nothing leaves the owner in F2.2 (F2.3 owns exposure).

**Size estimate**  Split. **F2.2a** (c1–c13): migration ~40, shared schemas extracted from registration ~40, server ~150, web
~180 → ~410. **F2.2b** (c14–c18 + the DR-dependent criteria): ~300; c14–c15 can start before DR-1 is answered.

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
