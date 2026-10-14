# F1.3 — register-profile-step: registration step 1

**Gate 1 passed** 14.10.2026, ORCHESTRATOR. DR-1 due date: today − 30 days to today + 300 days. DR-2 child name: 1–60 code points, counted and trimmed as VAL-001 (a new VAL in step 14). DR-3 child birth date: plausibility floor 1900-01-01, no age floor (VAL-005 unchanged). DR-4: ERR-003 widened to "missing or invalid", with the texts listed here. Q1–Q9 take their defaults. SRS updated in step 14. `decisions/2026-10.md`, "F1.3 Gate 1".

**Problem**  A new parent cannot tell Nestly where they are in the journey. `/register` is a placeholder, so there is
no way to enter a stage, a name or children before creating an account.

**Requirements**  FR-REG-002, FR-REG-003 (`05-functional/registration.md`, updated 13.10) · VAL-001, VAL-005, VAL-006,
VAL-039, VAL-040 (`09-validations.md`) · AC-002, AC-017, AC-089, AC-090 (`15-acceptance.md`) · ERR-003
(`10-errors-edge-cases.md`) · BR-068 (no parent birth date) · PG-004 (`07-screens-navigation.md`) · UC-01 ·
NFR-A11Y-001, NFR-USAB-003, NFR-USAB-004, NFR-PRIV-001 · I1 Addendum 1 and its F1.3 note (VAL-001 counting).
Design: R2 `r2-screens.html#register`, as changed by Addendum 1. Components: UI wave 1. Route and session: F1.2 spec.

**Scope**
- Step 1 at `/register`. Multi-select stage, full name, optional parent gender, an optional due date under "בהריון",
  children under "יש לנו ילד או ילדה" (add, remove, up to 10).
- Zod schemas and value lists in `packages/shared/src/validation/` (and `constants/`), used by the web form now and
  by F1.4's server route later.
- A multi-select mode of the existing ChoiceCardGroup.
- The step-1 → step-2 hand-off, in memory. Step 2 is a placeholder (F1.4 builds it).

**Out of scope**
- Account creation, any server route or API call, any database write, Child/JourneyContext tables (F1.4).
- Step 2 content: email, password, consent, the 18+ declaration (F1.4). Google (F1.8). Account type, PG-003 (I11).
- Keeping step-1 data anywhere but the tab's memory: browser storage, a server draft, cookies. See "Reserved".
- A warning before leaving or reloading. Analytics events. Duplicate-child detection.
- Name character rules beyond VAL-001 (letters only, script). Any child field beyond name, sex and birth date
  (photo, pregnancy week, twins). The "מחזור וביוץ" journey (§13, not a registration choice).
- Editing children or journeys after registration (FR-PROFILE-002, I2). Which journey the home shows first (OP-003, I6).
- Changes to F1.2's route table or guard: step 2 stays on `/register`, and `GUEST_PATHS` is unchanged.
- Changes to the single-select ChoiceCardGroup behaviour, or to the database CHECK.

**Data touched**  None stored. Personal data, health-related data (due date) and minors' data (child name, sex,
birth date) are held in the tab's memory only. The schemas become F1.4's input contract; DATA ARCHITECT checks them
against Child and JourneyContext at F1.4's Gate 2. No DATA ARCHITECT now.

**Risk flags**  Personal data · health-related data · data about minors (collected, not stored or sent). The public
surface already exists (F1.2's `/register`). No auth change, schema, provider or dependency. → Elevated: CRITIC on
opus, the Accessibility and Design domains.

**Authorization**  F1.3 reads, writes and deletes no stored data. A Guest only. A signed-in user at `/register` is
replaced by `/feed` (F1.2 criterion 4). The entered data never leaves the tab (criterion 24).

## Acceptance criteria — the tag goes into the test name

*Shared schemas (`packages/shared`, unit tests without a DOM)*
1. **Full name** [VAL-001 · AC-002]. Accepted iff `char_length(btrim(s)) between 2 and 60`: trim U+0020 only, at
   both ends, and count code points. Table: `"א"` ✗ · `"  אב  "` ✓ · 60 code points ✓ · 61 ✗ · `" א"` ✓ (2) ·
   `"\tא"` ✓ (2) · `"😀"` ✗ (1 code point, 2 UTF-16 units) · 31 emoji ✓ · niqqud marks counted one each · `""` and
   spaces only ✗. The output is the space-trimmed string. **The same table runs against
   `regular_profiles_full_name_check` in a db test, and every result matches.**
2. **Stage** [VAL-039 · AC-089]. At least one of three values. Planning together with pregnant ✗. The other five
   non-empty combinations ✓. An unknown or repeated value ✗.
3. **Gender lists** [VAL-006]. Parent: one of `PARENT_GENDERS`, or absent → `null`. Child: one of three values
   (בן · בת · עוד לא ידוע), required. Any other value ✗.
4. **Child birth date** [VAL-005]. Day, month and year form a real calendar date: 29.2.2024 ✓, 29.2.2025 ✗, 31.4 ✗.
   After "today" ✗, today ✓. "Today" is injected, so the tests fix it. The output is `YYYY-MM-DD`. Lower bound: DR-3.
5. **Child** [FR-REG-002 · VAL-005 · VAL-006]. Name (rule: DR-2), sex and birth date, each required.
6. **Children count** [VAL-040 · AC-090]. With the has-child stage: 1–10 ✓, 0 ✗, 11 ✗. Without it, the output has
   no children, whatever the input held.
7. **Due date** [FR-REG-002]. Only with the pregnant stage. All three parts empty → `null`. Partly filled ✗. Complete
   → a real calendar date, in the range from DR-1. Without the pregnant stage, the output has no due date.
8. **Portability** [conventions "Shared" · review point S2]. The schemas and value lists import no DOM, Node API or
   `apps/*`. The web form imports them. A grep finds no copy of their rules (bounds, value lists) in `apps/web`.

*Stage selection*

9. **Multi-select ChoiceCardGroup** [AC-089]. A mode of the existing component, not a new one. A fieldset with the
   legend "השלב במסע" and three native checkboxes, in order: מתכננים · בהריון · יש לנו ילד או ילדה. No
   `role="radiogroup"`. Tab reaches each card, Space toggles it. The single-select tests stay green.
10. **Exclusive pair** [VAL-039 · AC-089]. Ticking בהריון while מתכננים is ticked unticks מתכננים, and the reverse.
    יש לנו ילד או ילדה combines with either. The DOM never holds both of the pair checked.
11. **Fields open only when ticked** [AC-089 · FR-REG-002 · FR-REG-003]. With nothing ticked, no due-date or child
    field is in the DOM. בהריון shows the due date (three fields, marked לא חובה). יש לנו ילד או ילדה shows one
    empty child card and "הוספת ילד נוסף". מתכננים opens nothing. Unticking removes the fields from the DOM. Their
    values return if the choice is ticked again on the same page (Q3), and never reach the output (criterion 20).

*Children*

12. **Add** [FR-REG-003 · VAL-040 · AC-090]. "הוספת ילד נוסף" adds an empty card and moves focus to its name field.
    With 10 cards the button stays visible with `aria-disabled="true"`, activating it adds nothing, and
    "אפשר להוסיף עד 10 ילדים" is linked to it by `aria-describedby`. No path in the UI produces an eleventh card.
13. **Remove** [FR-REG-003]. A remove button appears on each card only when there are two or more. Its name names the
    card: "הסרת הפרטים של <name>", or of "ילד או ילדה <n>" while the name is empty. The other cards keep their values.
    Focus moves to "הוספת ילד נוסף".
14. **Card fields** [FR-REG-002 · VAL-006]. "שם", "מין" (a select: בחירה · בן · בת · עוד לא ידוע), and "תאריך לידה"
    (DateInput). The card heading is the child's name, else "ילד או ילדה <n>".

*Submit and errors*

15. **Invalid blocks the step** [AC-002 · ERR-003]. "המשך" with any missing or invalid required field stays on step 1.
    Each invalid field has `aria-invalid` and its message linked by `aria-describedby`. Focus moves to the first
    invalid field in DOM order. Cases: no stage · empty name · a one-character name · a child without sex · a future
    birth date · 31.2 · a partly filled due date.
16. **Error timing** [AC-002]. No message appears before the first "המשך". After it, a message clears as soon as its
    field becomes valid.
17. **Error text** [ERR-003 · ux-copy-he]. The texts come from DR-4, in one map, each entry tagged with its VAL and ERR
    ID. A schema issue with no entry in the map shows the generic message. No Zod text reaches the DOM.
18. **Optional stays optional** [VAL-006 · FR-REG-002]. An empty parent gender and an empty due date raise no error.
19. **No extra fields** [AC-017 · BR-068 · FR-REG-002]. Step 1 has no email, password, phone or parent birth-date field.

*Hand-off, back and reload*

20. **Hand-off** [FR-REG-002 "פלט"]. A valid "המשך" shows the step-2 placeholder on `/register`: StepIndicator
    "שלב 2 מתוך 2", the h1 "פרטי התחברות", "המסך הזה ייפתח בקרוב.", and a back control. A flow test asserts that the
    value handed to step 2 deep-equals the schema's parsed output, and holds nothing from an unticked choice.
21. **Back keeps the data.** From step 2, both the in-app "חזרה" and the browser Back return to step 1 with every
    value intact: stages, name, gender, due date and all children. The URL stays `/register` throughout.
22. **Leaving discards** [Q1]. "חזרה" on step 1 goes to `/`. Coming back to `/register` shows an empty form.
23. **Reload** [Q1]. A reload on step 1 or step 2 shows step 1, empty. Step 2 never renders without parsed step-1 data
    in memory, including after a reload followed by the browser Forward.
24. **Data stays in the tab** [NFR-PRIV-001 · minors]. After filling every field and reaching step 2:
    - `localStorage`, `sessionStorage`, IndexedDB and `document.cookie` hold none of the entered values
    - the E2E network log shows no request beyond static assets: none to `/api/*`, Supabase or any third party
    - the console shows none of the entered values

*Accessibility, RTL, copy, design*

25. **axe** [NFR-A11Y-001]. Zero violations on Chrome and Edge, at 375 and 1024, on: the empty step 1 · בהריון with
    יש לנו ילד או ילדה and two children · step 1 after a failed "המשך" · 10 children · the step-2 placeholder.
26. **Keyboard** [NFR-A11Y-001, WCAG 2.1.1, 2.4.3]. An E2E fills step 1 with two children and a due date by keyboard
    alone. Focus order matches visual order.
27. **Targets** [WCAG 2.5.8 · NFR-USAB-004]. Every control is at least 24×24 CSS px, and "המשך" at least 44×44.
28. **Titles and focus** [WCAG 2.4.2]. "פרטים אישיים · Nestly" and "פרטי התחברות · Nestly". On each step change,
    focus goes to `main`.
29. **RTL** [rtl-hebrew]. `lang="he"`, `dir="rtl"`. With 10 children and errors shown, no horizontal scroll at 375.
    In the date fields the day sits at the right and the year at the left.
30. **Gender-neutral copy** [NFR-USAB-003]. A grep finds no slash forms in the new strings. Actions are nouns.
31. **Design** [NFR-USAB-004 · design domain]. Only wave 1 components and tokens; the design lint passes. One primary
    action: "המשך". Stories: the multi-select group (none, one, two ticked, error) · step 1 empty · step 1 with both
    sections and errors · 10 children.
32. **Preview.** ORCHESTRATOR completes step 1 with both sections on the deployed Preview, at 375 and 1024, against R2
    as changed by Addendum 1.

## Open questions

**Decision requests** (owner ORCHESTRATOR, not reserved; recorded in `decisions.md` before BUILDER needs them). Each
bound lives in one constant in `packages/shared`, so a later change costs one line.

- **DR-1 Due-date range.** The SRS gives none. **Recommended:** a real date from today − 30 days to today + 300 days
  (overdue, up to about 43 weeks). Alternatives: any real date · today or later only.
- **DR-2 Child name rule.** VAL-001 covers the full name only. **Recommended:** required, 1–60 code points after
  trimming spaces, VAL-001's counting, as a new VAL in step 14. Alternative: VAL-001 as is (2–60) — rejects a
  one-letter name. Not reserved: it changes neither what is collected nor what is shown. If ORCHESTRATOR reads it
  otherwise, it goes to Afik.
- **DR-3 Birth-date lower bound.** VAL-005 says only "not in the future", and "no age limit". **Recommended:** a
  plausibility floor only, year 1900 or later. **An age-based floor (for example under 18 only) is reserved for
  Afik:** it changes which children's data is collected, and it contradicts VAL-005.
- **DR-4 Error texts for invalid values.** ERR-003 covers a missing field. AC-002 also covers an invalid one, but no ERR
  entry gives its text. **Recommended:** widen ERR-003 in step 14 to "missing or invalid", with these texts:
  לא נבחר שלב → "יש לבחור לפחות אפשרות אחת" · שם ריק → "יש למלא שם מלא" · אורך → "שם מלא צריך להכיל 2 עד 60 תווים"
  · שם ילד ריק → "יש למלא שם" · מין → "יש לבחור מין" · תאריך חסר → "יש למלא תאריך לידה" · תאריך לא קיים →
  "התאריך אינו תקין. יש לבדוק יום, חודש ושנה" · עתיד → "תאריך הלידה לא יכול להיות בעתיד" · חלקי → "יש להשלים את
  התאריך או להשאיר אותו ריק" · מחוץ לטווח → per DR-1 · generic → "משהו השתבש. אפשר לנסות שוב".

**Reserved for Afik:** none on this path. Keeping step-1 data beyond the tab's memory (browser storage, a server
draft) would be a new decision on minors' data. F1.3 does not do it; if anyone proposes it, it goes to Afik.

**Questions** — assumed if unanswered:
- **Q1. Where step-1 data lives.** → React state in the registration flow container only. A reload loses it
  (criteria 22–23). ERR-004 ("do not lose input") is about a failed save, which is F1.4's.
- **Q2. Exclusivity UX.** → auto-untick the other of the pair (criterion 10). Not disabled: a disabled card hides the
  choice.
- **Q3. Values of an unticked choice.** → kept while on the page, never in the output.
- **Q4. At 10 children.** → the button stays visible, with `aria-disabled` and the note (FR-REG-003 says visible).
- **Q5. The last child.** → no remove button on a single card. To have no children, untick the choice.
- **Q6. "Today".** → the device's local calendar date. F1.4's server re-checks with its own clock.
- **Q7. Date format.** → ASCII digits; day and month with or without a leading zero; a four-digit year; surrounding
  spaces ignored.
- **Q8. Copy.** → h1 "פרטים אישיים", sub "כדי שהתוכן יתאים למסע." (R2, provisional) · group hint "אפשר לבחור יותר
  מאפשרות אחת." · "מין ההורה (לא חובה)", placeholder "בחירה" · "תאריך לידה משוער (לא חובה)" · "הוספת ילד נוסף"
  (FR-REG-003 verbatim; replaces R2's "הוספת ילד או ילדה") · back "חזרה".
- **Q9. Multi-select look.** → the same card; the mark is a rounded square, not a circle. The design domain confirms.

## Size estimate

About 1,300 lines: BUILDER about 650 (schemas and lists 150 · ChoiceCardGroup mode 80 · flow, step 1, children,
step-2 placeholder 330 · error map 40 · stories 50), TEST ENGINEER about 650.

Over 400, so **one PR in four passes** on one branch, each within a window:
- **a:** schemas, value lists and the db parity test (1–8)
- **b:** the ChoiceCardGroup multi-select mode (9)
- **c:** the flow without children: stage, name, gender, due date, errors, hand-off, back, reload (10, 11, 15–24)
- **d:** children, accessibility, design, Preview (12–14, 25–32)

If BUILDER's share passes about 800 lines, pass d becomes its own PR.
