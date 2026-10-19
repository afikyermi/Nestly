# CRITIC findings — F3.4 anonymous-post (opus, round 1, 19.10.2026) — returned text, saved by ORCHESTRATOR

--- bug ---
severity: low
file:     apps/server/tests/db/anonymous-post.db.test.ts:1163
claim:    The PATCH path that turns a refusal into 422 (editPost: readPostAnonymity + 42501 → audience_not_allowed) has no test showing that a non-author's `audience:"friends"` PATCH on an anonymous post still answers 404, so a regression could slip through unnoticed.
failure:  Other users' PATCH tests send only {body, stageTag} (1170; leak scan 1230 only {body}). If the 42501 → 422 mapping moved ahead of the anonymity read or caught 42501 by default, X's PATCH {audience:"friends"} on A's anonymous id would get 422 instead of the unknown-id 404 — an existence oracle — and every test would pass. Today correct: posts_update_author USING drops the non-author row → 0 rows → 404.
fix:      Add {audience:"friends"} (alone and with body) for X, V, C expecting [404, missing.body] and row unchanged; same for A after setStatus(A,'suspended') (not 422).
--- end ---

A&D step 9: no bugs. ORCHESTRATOR: low → debt.md (test-only; no re-check).
