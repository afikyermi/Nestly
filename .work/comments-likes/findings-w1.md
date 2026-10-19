# CRITIC findings — F3.3w1 post-page comments (opus, round 1, 19.10.2026) — summary of returned text, saved by ORCHESTRATOR
0 critical/high; 1 medium, 3 low.
1. medium — CommentsSection.tsx:16-21, CommentsView.tsx:70/:81-88, PostScreen.tsx:176: a Professional on an "everyone" post sees the post "לייק" and a thread load error with a useless "נסו שוב" (thread 403 not_allowed treated as a transient error), against screen.md "Professional: no new control". Fix: no region controls without the posting right; never show retry for 403 not_allowed; e2e for the Professional case. BUILDER + TEST ENGINEER.
2. low — use-comment-writes.ts:38-42: a body with NUL shows the "too long" message. Fix: distinct message. BUILDER.
3. low — comments-state.ts:53: the counter counts untrimmed text while the rule trims → contradictory "one over". Fix: count the trimmed text. BUILDER.
4. low — no RTL unit tests for c15 [U] / c16 [U+E]. TEST ENGINEER.
## ORCHESTRATOR decisions (19.10)
- NUL message (copy): "יש בטקסט תו שאי אפשר לשמור. אפשר להסיר אותו ולנסות שוב".
- Delete 404 → treated as deleted, status "התגובה נמחקה" (accepted; added to screen.md).
- w2 note: #comments focus vs PostContent's own focus effect → w2 e2e.

## Round 2 (CRITIC opus, 19.10)
Findings 1–4 fixed (2d769e2, 6c2911f). Region after the profile check: no regression (latency only). Note for w2: focus pulled to #comments heading after the delay — covered by the w2 e2e.
