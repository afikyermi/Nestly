# intake — I2 F2.2 journeys-children

**Intent**        I2 plan F2.2 (`.work/_initiatives/I2-profile-privacy-friends.md`): manage journeys and children, ≤ 10.
**Problem**       After onboarding (I1 F1.4) a parent cannot add a child, correct a child's details, record a birth, or end a
                  pregnancy journey; the profile shows what onboarding stored and nothing more.
**Requirements**  FR-PROFILE-002 (`docs/srs/05-functional/profile-settings.md`) — thin, status "לוגיקת כמה מסלולים פעילים במקביל TBD";
                  the onboarding rules for JourneyContext / Child (F1.4: FR-ONB-*, VAL-*, `data-model.md` journey_contexts, children);
                  §1.4 Journey Summary; NFR-PRIV-005/006 (owner-only). No AC listed — SPEC writes them.
                  Decided input: up to 10 children and journeys in parallel, as in I1 (I2-questions "לידיעה בלבד", Afik did not object).
                  Out: choosing the active JourneyContext (OP-003, I6); My Stage / Dashboard content (later Initiatives — FR text
                  says "עדכון My Stage": SPEC states what of it exists now); another user's view of children (F2.3/F2.4);
                  photos of children (media decision M1).
**Open items**    Delete vs end a journey/child (irreversible → DA + possibly Afik); what a pregnancy becomes after a birth;
                  which onboarding fields are editable. SPEC proposes each as a DECISION REQUEST with its recommendation;
                  anything that touches minors' data policy beyond the SRS is reserved for Afik → WORKPLAN "ממתין לך", work
                  continues on the rest (standing rule 2026-10-17).
**Risk flags**    minors' data: **true** · personal (health-related: pregnancy) data: **true** · authz: **true** (own-row write
                  policies) · schema: **likely** (UPDATE/INSERT/DELETE grants and policies on journey_contexts, children) ·
                  destructive: **possible** (delete) · money, provider, unauthenticated surface: false.
**Path**          Elevated.
**Team**          SPEC (opus) → Gate 1 → DATA ARCHITECT (opus) → BUILDER ∥ TEST ENGINEER → CRITIC (opus) → E. UI → a11y + design.
**Sequencing**    Code waits for PR 40 (F2.1) to merge (one branch); spec and schema can run now.
**Next owner**    SPEC
