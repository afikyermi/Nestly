# result — I2 F2.2a journeys-children (PR 41)

**Execution:** Succeeded · **Quality:** Good — merged PR 41 (`7e3cd04`, 17.10.2026). CRITIC (opus): no bugs. DATA ARCHITECT:
migration and rollback match Gate 2; knowledge files updated as built.
**SRS trace:** FR-PROFILE-002 c1–c13 implemented. For the SRS at I2 close: Gate 1 DR-4 A (has_child ⇔ ≥ 1 child), DR-5 A
(editable fields), the copy (Q1; "טוענים את פרטי המסע", "שומרים" per notes.md), VAL-040 enforced by the lowest-free-slot rule;
§13.1 line 76 and FR-PROFILE-002's stale "TBD" (spec findings).
**Evidence:** CI 39010993969 green on `687dcec` (db, both Chrome shards incl. 14 new baselines); preview-e2e 39011027304 green;
migrate 39010990368 (nestly-preview) success; migrate 39011590813 from main (nestly-preview + nestly-prod) success.
**Lessons:** E can start a few seconds before the branch migrate finishes (06:44:34 vs 06:44:38) — passed here; if a Preview flow
fails on a missing grant, re-run once before diagnosing. Visual baselines are viewport-only (the limit note is below the fold; the
e2e test asserts its text).
**Still open:** F2.2b — c14–c15 buildable; removal, end and birth wait for Afik's DR-1 / DR-2r.
