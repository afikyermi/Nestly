# intake — I2 F2.3 profile-privacy

**Intent**        I2 plan F2.3: Open/Restricted, the Journey Summary sentence toggle, ChildBirthdayVisibility.
**Problem**       A parent cannot choose who outside Friends sees their full profile; nothing stores the choice yet.
**Requirements**  FR-PRIV-001 (`05-functional/profile-settings.md`) · BR-037, BR-044 · VAL-027 · AC-054 · §1.4 Basic Public Profile /
                  Journey Summary · data-model.md authorization map row 5 · NFR-PRIV-*.
                  Decided by Afik (I2 questionnaire 1, 2, 5): default **Open**, existing users backfilled to Open;
                  ChildBirthdayVisibility default **on**.
                  Out: Friends themselves (F2.4) — but what a non-Friend sees must be enforced in the database now, and F2.4
                  plugs Friends into the same rule; People Search (later); notifications sending (later); Settings menu (F2.5).
**Open items**    Where the settings live (columns on regular_profiles vs a settings table) — DATA ARCHITECT; whether a viewer
                  endpoint for another user's profile is in F2.3 or F2.4 — SPEC proposes (DECISION REQUEST, recommendation).
**Risk flags**    authz: **true** · minors' data (ages in Journey Summary): **true** · schema + backfill: **true** · money,
                  provider, unauthenticated surface: false.
**Path**          Elevated.
**Team**          SPEC (opus) → Gate 1 → DATA ARCHITECT (opus) → BUILDER ∥ TEST ENGINEER → CRITIC (opus) → E. UI → a11y + design.
**Sequencing**    After F2.2a on the branch; spec runs now.
**Next owner**    SPEC
