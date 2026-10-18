# result — F3.2a1 feed ranking core (packages/shared)
**Done:** config Zod + fallback chain (configVersion 0 = fallback-recency-v0), cursor Zod and base64url codec (6-digit UTC text, calendar-checked, float8 score, ≤ 512 chars), scorer and tiers, greedy re-ranker (dedup → creator cap → anonymous cap), selectFeedPage cursorFrom, strict response Zod.
**Path:** Elevated · Gate 1 (A&D 1–12 + N1–N4) · BUILDER ∥ TEST ENGINEER · CRITIC opus (1 medium + 3 low, fixed; round 2 clean) ∥ A&D (no high/medium).
**SRS trace:** FR-FEED-001, FR-FEED-004 (stage as signal, wStage 0), FR-ALG-002 subset, AC-060 subset (DR-5). **Tests:** shared 376/376; test:product ≈ 230:340.
**For a2:** convert numeric weights; integration test seeded v1 → configVersion 1; share text in sharerText; readVisibleNames narrowing.
