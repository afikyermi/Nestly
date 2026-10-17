# intake — I2 F2.5 settings-menu

**Intent**        I2 plan F2.5: Settings and the side-menu destinations.
**Problem**       The side menu and Settings point at destinations that do not exist yet or lead nowhere useful.
**Requirements**  FR-SET-001 · FR-MENU-001 (via `docs/srs/INDEX.md`) · PG-038 SettingsPage · existing side menu (I1 F1.2, F2.0 part b
                  added the change-password item). No AC in the SRS — SPEC writes them.
                  Decided: account deletion is not shown until I9 (U1, I2 questionnaire "לידיעה בלבד").
                  F2.3 Gate 1 DR-2: F2.3 creates the SettingsPage route with the Privacy & Security section only; F2.5 adds
                  the rest and the menu wiring. Out: anything a destination needs that belongs to a later Initiative —
                  shown as not available or not shown (SPEC proposes which).
**Open items**    Which destinations exist now and how unbuilt ones appear — SPEC proposes (DECISION REQUEST, recommendation).
**Risk flags**    none expected (no schema, no authz, no new surface) → **Standard**; if SPEC finds a flag, go up.
**Team**          SPEC → Gate 1 → BUILDER ∥ TEST ENGINEER → CRITIC → E. UI → a11y + design.
**Sequencing**    After F2.3 on the branch; spec runs now.
**Next owner**    SPEC
