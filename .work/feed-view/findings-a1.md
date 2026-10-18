# CRITIC findings — F3.2a1 (opus, one round, 18.10.2026) — summary of returned text, saved by ORCHESTRATOR
**Result:** production code no defect; 1 medium, 3 low.
1. medium — `packages/shared/tests/feed-ranking.test.ts:200` c12 "isMine false on anonymous units" is untested: the case still carries `author`, so it is rejected for the author key; a regression to `isMine: z.boolean()` stays green. Fix: anonymous unit without author and isMine true → rejected, for post and share. → TEST ENGINEER; CRITIC re-checks.
2. low — `:149-150` anonymous-own-creator fixture cannot fail (greedy fallback gives the same order). Fix: mixed fixture [a1, a2, n1], maxSame 1, maxAnon 3, window 3 → a1, a2, n1. → TEST ENGINEER.
3. low — `:104-116` calendar validation of cursor timestamps untested (2026-02-29, month 13, day 00, T24, second 60 rejected; 2028-02-29 accepted). → TEST ENGINEER.
4. low — `packages/shared/src/feed/score.ts:38` compareRankKeys exported, unused, untested. → BUILDER removes it until a part needs it.
**Open (ORCHESTRATOR decisions):** a2's repository converts numeric weights to numbers before resolveFeedConfig, and an a2 integration test asserts configVersion 1 on the seeded DB · a share unit carries its text in `sharerText`, `body` null; b renders sharerText.
**Checked, no finding:** config Zod = doc and DB CHECKs, seed, fallback config · fallback chain branches · cursor Zod and base64url codec (total, never throws) · no DOM/Node APIs · scorer, tiers · re-ranker (dedup, windows, anonymous cap only, greedy fallback, deterministic) · selectFeedPage cursor · response Zod strict, anonymous no author + isMine literal false, original fields · test provenance · 213:361.
## ALGORITHM & DATA review (parallel, 18.10) — summary
No high/medium; core matches I3-algorithm.md. Low 1 (a2): numeric weights come back as strings → convert (::float8 or validated Number) in the repository + integration test seeded v1 → configVersion 1. Nit 2: response accepts an anonymous share (DB forbids) → drop that union member. Nit 3: cap cursor text length (≤ 512) before decoding. N1–N4: treated as closed for a1 (items #2–#11 of its review verified).
**ORCHESTRATOR routing:** BUILDER — remove compareRankKeys, drop the anonymous-share variant, cap cursor text at 512. TEST ENGINEER — CRITIC 1–3. a2 contract — numeric weights conversion + configVersion 1 integration test.

## Round 2 (CRITIC opus, 18.10)
Findings 1–4 fixed (f0b4483, 1845f00). New low: the 512-cap test cannot fail (inputs are already invalid) → debt.md. No new critical/high/medium.
