# intake — register-profile-step (I1, F1.3)

**Intent**        I1 → F1.3, as changed by Addendum 1 (Afik 13.10): registration step 1.

**Problem**       A new parent cannot tell Nestly where they are in the journey; there is no registration form.

**Requirements**  FR-REG-002, FR-REG-003 (`docs/srs/05-functional/registration.md`, updated 13.10) · VAL-001 (2–60 after trim),
                  VAL-005 (child birth date not in the future), VAL-006 (gender lists), VAL-039 (stage multi-select:
                  "מתכננים" and "בהריון" exclusive), VAL-040 (≤ 10 children) · AC-002, AC-089, AC-090 · R2 registration
                  screen, changed by Addendum 1 (multi-select, fields open only when ticked, "הוספת ילד נוסף" visible) ·
                  ChoiceCardGroup (UI wave 1) needs a multi-select variant · Zod schemas in `packages/shared` · the I1 file's
                  note for F1.3 (VAL-001 counts code points and trims spaces only — match the database CHECK).

**Open items**    Which journey the home shows first — I6 (not here). Step 1 data persists only in the client until step 2
                  (F1.4) creates the account atomically — SPEC states where it lives meanwhile; no server write in F1.3.
                  Due date limits (past / far future) and child birth-date lower bound: VAL-005 says only "not in the
                  future" — no default filled; DECISION REQUEST if SPEC needs more.

**Risk flags**    personal data / **data about minors: true** (children's names, sex, birth dates — collected, not yet stored)
                  · auth: false · schema: false (F1.4 stores) · money, provider, public surface: false (registration is a
                  public page, already in F1.2's guest routes).

**Path**          Elevated. One PR. Any new point about minors' data beyond Afik's 13.10 decisions → reserved for Afik.

**Team**          SPEC (opus) · BUILDER (opus) · TEST ENGINEER · CRITIC on opus · Accessibility and Design domains.

**Depends on**    F1.2 merged before BUILDER starts. SPEC can run now.

**Next owner**    SPEC
