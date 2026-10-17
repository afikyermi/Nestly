# result — I2 F2.4c1 friends: viewer API, Friend branch, profile-open limit (PR 49)

**Execution:** Succeeded · **Quality:** Good — merged PR 49 (`cf21e16`, 17.10.2026). CRITIC (opus): one medium (a Friend Request send
to an unavailable target rolled its counted open back with the 23503 — an uncounted "is this id an active Regular" oracle against c24/
DR-W) fixed and validated; residual race (target state changes between count and insert) accepted by CRITIC. DATA ARCHITECT: as-built
matches Gate 2; the two `TO app_owner` policies are within DR-G1/DR-L; unbounded Friends lists acceptable for the MVP (pagination =
a later spec decision, trigger ~1,000 Friends or p95 over budget). CI and E green on the fix push.
**SRS trace:** FR-PRIV-001 (viewer, Friend branch, Friends and mutual lists), FR-REL-001 (relationship state), NFR-SEC-006 (1)(2)(5),
AC-078, ERR-032 (c16–c24). For the SRS at I2 close: Afik DR-2 A (Friend sees the Open view), DR-T 100 opens/3600 s as stored
Configuration (DR-C, fail closed), DR-L (the definer writes the caller's own counter and Security event), DR-W A (rolling window,
404 opens count, one event per refusal stretch), DR-S A (a send counts as an open), the viewer response shape.
**Evidence:** CI (db, browser chrome 1/2, test, typecheck, lint, build, audit, storybook) and preview-e2e green on `eee0d30`; branch
migrate 39039035885 (nestly-preview) success; migrate 39040545608 from main (nestly-preview + nestly-prod) success.
**Lessons:** a count kept inside a transaction must commit on every refusal path, including the "unavailable" answer · a new
per-account limit breaks earlier tests that reuse fixture accounts — reset counters per test, never raise the seed · pushing before
CRITIC returns, with the PR open, let CI on the real database run in parallel with the review.
**Still open:** none for F2.4c1. Admin screen/API for the Configuration and Admin reporting of Security events → I4.
