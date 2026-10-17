# intake — I2 F2.4 friends

**Intent**        I2 plan F2.4: request, accept, decline, remove a Friend; what a Friend vs a non-Friend sees per FR-PRIV-001.
**Problem**       Regular users cannot connect; the Friend branch of profile visibility does not exist.
**Requirements**  FR-REL-001 (via `docs/srs/INDEX.md`) · FR-PRIV-001 · §1.4 · BR-*/VAL-* on Friendships · data-model.md authorization
                  map. F2.3 spec "What F2.4 must add" (`.work/profile-privacy/spec.md`) and its Gate 1 (DR-1 A: the viewer
                  endpoint/screen ships with the first entry point plus the NFR-SEC-006 profile-open rate limit, thresholds I7).
                  F2.5 Gate 1 Q3: F2.4 adds the Friends menu item with its own page.
                  Out: People Search (I7), chat (I8), notifications delivery (I7), blocking/reporting unless the SRS puts it here.
**Open items**    How a user reaches another user to send a request before People Search exists; whether the viewer endpoint
                  ships here (it needs the rate limit, whose thresholds are an I7 item) — SPEC proposes (DECISION REQUEST).
**Risk flags**    authz: **true** · schema: **true** (friendships) · personal data · minors (Friend sees children) · money,
                  provider, unauthenticated surface: false.
**Path**          Elevated.
**Team**          SPEC (opus) → Gate 1 → DATA ARCHITECT (opus) → BUILDER ∥ TEST ENGINEER → CRITIC (opus) → E. UI → a11y + design.
**Sequencing**    After F2.3 on the branch; spec runs now.
**Next owner**    SPEC
