# CRITIC findings — F3.2b feed page (opus, round 1, 19.10.2026) — summary of returned text, saved by ORCHESTRATOR
0 critical/high, 2 medium, 4 low.
1. medium — use-feed.ts:59–66, feed-memory.ts, RouteGuard.tsx:36–39: the tab's account can change to another user without a signed-out state (tab 2's /api/me 500 → B signs in, storage overwritten, tab 1 stays signed-in with B's token) → Back restores A's remembered feed for B. Fix: store userIdOfAccessToken(token) with the memory; restore only if the current token's sub equals it (unknown → no restore). BUILDER.
2. medium — no test protects cross-user restore (sign-out → sign-in → Back must refetch, old cards absent; + changed token owner once 1 is fixed). TEST ENGINEER.
3. low — e2e/app-shell-guard-shell.spec.ts:316–325 rewritten F1.2 c22 guard weaker: forced signed-in without a session must send no /api/* and show no cards. TEST ENGINEER.
4. low — FeedScreen.tsx:11 waits for the profile check (challenge 5 says request the feed; hung /api/profile → endless skeleton). Fix: request the feed regardless; 403 → placeholder; posting right only for the button. BUILDER.
5. low — feed-state.ts:50–64: a `restarted` replace drops focus to body. Fix: when focus was inside the list, move focus to the h1 and scroll to top (no new announcement text). BUILDER.
6. low — feed.spec.ts c19 first-load never asserts a skeleton; c13 focus ring check always true (shadow-card). TEST ENGINEER.
Open: anonymous original in c12/c17/screen.md is impossible (schema literal false; DB forbids) — ORCHESTRATOR strikes it (decided earlier).
Routing: BUILDER 1, 4, 5 · TEST ENGINEER 2, 3, 6 · CRITIC re-checks 1–4.
