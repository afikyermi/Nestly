# result — I2 F2.3b profile-privacy: profile_view, the cross-user read (PR 45)

**Execution:** Succeeded · **Quality:** Good — merged PR 45 (`72da636`, 17.10.2026). CRITIC (opus): no critical, high or medium;
one low (a spec defect: "slot order" → display order), spec amended. CI red once on a test-mechanics bug (pg_auth_members keeps one
row per grantor on CI's Postgres) — fixed in the test. E was cancelled once by the shared preview-e2e concurrency group and re-run.
**SRS trace:** FR-PRIV-001 c7–c15, c17 implemented (database read only, DR-1 A). For the SRS at I2 close: Afik DR-G1 (the first
definer reading other users' rows) and DR-3 (ages in years and months, the c17 phrases), DR-4/DR-5/DR-6 A, display order.
**Evidence:** CI and preview-e2e green on `c734c89`; branch migrate (nestly-preview) success; migrate 39032428260 from main
(nestly-preview + nestly-prod) success.
**Lessons:** role-membership assertions must compare distinct sets · the shared E concurrency group lets main deployments push
out a PR's pending E run (watch for "cancelled" before reading E as green).
**Still open:** none for F2.3. The viewer endpoint and screen ship in F2.4c.
