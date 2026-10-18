# Reviews — F3.2a2 feed server (18.10.2026) — summaries of returned text, saved by ORCHESTRATOR
## ALGORITHM & DATA
No high/critical; production SQL matches the pipeline (RLS-only eligibility, float8 score, n definition, tiers, keyset, snapshot, forbidden inputs absent, Stage only when wStage>0, fallback/restart, extra_float_digits=3, dedup, no inference leak). a2 items closed (weights ::float8; configVersion 1 test).
1. medium — feed.db.test.ts 297–311: c5 posts A and B share created_at, so a single leaked uncounted kind ties and passes ~50% (own/anonymous author rows; suspended/banned likers). Fix: B 1 s older, or ≥ 2 rows per kind. → TEST ENGINEER.
2. medium — c5: no fixture for non-active comments or replies under a hidden/held parent. → TEST ENGINEER.
3. low — "1 µs apart" test does not exercise last float8 bits; assert the cursor score equals the DB's full-precision score. → TEST ENGINEER.
4. low — friendship/Stage changes between pages are not bounded by asOf → A&D corrects I3-algorithm.md Pipeline 6 (accepted limitation).
5. low — feed-repository.ts:150 Stage set via string_to_array; bind `${stages}::text[]`. → BUILDER.
6. advisory — per-page scoring of the whole visible pool → debt (perf targets / I15).
Open: deletion-grace fixture impossible until the status exists (I9); DR-6 was decided 18.10 (4א accept, S-34).
## CRITIC (opus, one round)
0 critical/high/medium; no production defect. Lows (tests): 1 c3 24 h half-life only bracketed (23–44 h pass) → exact-tie fixture (friend@24h vs stranger@0). 2 static check lacks `journey_contexts` in FORBIDDEN → add. 3 missing fixtures: held post absent (c1); reply under held/hidden parent not counted (c5); deletion grace impossible until the status exists (I9 → debt).
**ORCHESTRATOR routing:** TEST ENGINEER fixes A&D 1–3 and CRITIC 1–3 in the main checkout together with the fixture file, within the 2× cap; BUILDER A&D 5 (stages ::text[]) now in the worktree; A&D 6 + deletion-grace fixture → debt.md; A&D 4 → I3-algorithm.md wording (A&D). No re-check needed for lows; A&D validates its two mediums.
