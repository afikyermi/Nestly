# intake — I2 F2.1 profile-view-edit

**Intent**        I2 plan F2.1 (`.work/_initiatives/I2-profile-privacy-friends.md`): own profile view and edit.
**Problem**       A registered parent cannot see or correct what they entered at sign-up (name, parent gender, …).
**Requirements**  FR-PROFILE-001 (`docs/srs/05-functional/profile-settings.md`) — thin ("שדות פרופיל"); VAL-001 (full name),
                  OP-004 gender options, RegularProfile in §13 / `data-model.md`; PG for UserProfilePage via INDEX; AC — SPEC
                  finds or writes them (FR-PROFILE-001 has none listed). Out: photo (I5), journeys/children (F2.2), privacy (F2.3),
                  another user's profile view (F2.3/F2.4).
**Open items**    Which fields are editable — ORCHESTRATOR decides from what the SRS defines (I2-questions "לידיעה בלבד");
                  SPEC proposes as a DECISION REQUEST with its recommendation. No reserved item.
**Risk flags**    authn/authz: **true** — own-row update policy · personal data: **true** · schema: **likely** (UPDATE grant/
                  policy on regular_profiles, maybe columns) · money, provider, unauthenticated surface: false.
**Path**          Elevated.
**Team**          SPEC (opus) → Gate 1 → DATA ARCHITECT (opus) → BUILDER ∥ TEST ENGINEER → CRITIC (opus) → E. UI → a11y + design.
**Sequencing**    Code waits for PR 39 (one branch per session); spec and schema can run now.
**Next owner**    SPEC
