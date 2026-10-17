# result — I2 F2.4c2 friends: another user's profile screen, actions, copy-my-profile-link (PR 50)

**Execution:** Succeeded · **Quality:** Acceptable — merged PR 50 (`1f7244f`, 17.10.2026). CRITIC (opus): two medium (a duplicate
visual-screens block; c27 lost on Google sign-in → a one-shot validated sessionStorage note, ORCHESTRATOR decision) and two low (the
e2e token fixture; a stale note surviving a plain start) — all fixed and validated by CRITIC. CI red twice: an F2.4b c15 test too broad
for the new page-level copy button, then the never-run Google tests hanging (`page.evaluate` during a navigation) plus a list heading
that did not wrap a 60-character name — all fixed. Per Afik the browser jobs moved to three shards in the same PR.
**SRS trace:** FR-PRIV-001 Profile/Deep Link (DR-1 A, DR-O A), FR-REL-001 UI, FR-AUTH-004 (c27 narrows F1.2's "requested path is
not kept" for `/u/<uuid>` only), ERR-032/ERR-004/ERR-038 (c25–c30). For the SRS at I2 close: the copy (`notes-c2.md`), the send-409
text, the Google return note.
**Evidence:** CI (db, browser chrome 1/2/3, test, typecheck, lint, build, audit, storybook) and preview-e2e green on `0e33e25`;
visual baselines (user-profile states, friends with the copy button, link shown) reviewed image by image (update-baselines
39041292520). No migration.
**Lessons:** tests that never ran in a browser are not evidence — run them before CI · `page.evaluate` during a pending navigation
hangs · a wait without a ceiling stalled the PR for 90 minutes (Afik's standing rule, decisions 17.10).
**Still open:** none for F2.4c2.
