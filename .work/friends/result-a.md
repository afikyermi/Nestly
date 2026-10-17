# result — I2 F2.4a friends: friendships schema and API (PR 47)

**Execution:** Succeeded · **Quality:** Good — merged PR 47 (`6a74ee0`, 17.10.2026). CRITIC (opus): one medium (a concurrent re-send
after decline+cancel answered 404 vs 409 for pending — a decline oracle against DR-3) and one low (own id on the four action routes;
remove ended every Friendship), both fixed and validated by CRITIC; one low (F2.4c1 planned on the same migration version) → debt and a
schema.md amendment. DATA ARCHITECT: migration matches Gate 2; knowledge updated. CI and E green on the first push.
**SRS trace:** FR-REL-001, VAL-017, BR-029, AC-034 (c1–c12); PG-036 data. For the SRS at I2 close: DR-3 silent decline (sender sees a
declined request as pending; cancel succeeds alike), DR-4 cancel (not in the SRS), DR-5 inactive counterparty hidden with the row kept,
DR-6 `regular_names`, DR-7 B's send reopens A's declined request, the response shapes (`{}`; 403 `forbidden` for P/M/D) and routes.
**Evidence:** CI (db, browser chrome 1/2, test, typecheck, lint, build, audit) and preview-e2e green on `66d3592`; branch migrate
39035313798 (nestly-preview) success; migrate 39036174187 from main (nestly-preview + nestly-prod) success.
**Lessons:** a task that gives BUILDER test files collides with the guard — route every test file to TEST ENGINEER (noise.md) ·
a retried write path must re-classify after a lost race, never fall through to "unavailable" · cut review.diff against origin/main.
**Still open:** none for F2.4a. Preview cleanup now expects 11 tables (standing rule applied in the same PR).
