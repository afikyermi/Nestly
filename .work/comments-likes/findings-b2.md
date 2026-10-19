# Reviews — F3.3b2 likes + counts (19.10.2026) — summaries of returned text, saved by ORCHESTRATOR
## ALGORITHM & DATA
No high/medium; feed ranking untouched, counts match the doc, likedByMe statement exact and only in likes-repository, post_authors in no count, no new inference leak, evaluation guards covered. Low 1: REPEATABLE READ test only checks the SET appears somewhere on GET /feed → assert first statement in the same transaction, and repeat for GET /posts/:id and the thread. Low 2: static placement scan reads only repositories/*.ts template strings → scan apps/server/src/** recursively, allow only readLikedTargetIds.
Open (product/privacy): DELETE on a target that became unreadable (e.g. friends-only after unfriending) returns 404, so the caller can't withdraw their own like; it keeps counting for readers. Default keep as specified → Afik question 8 (WORKPLAN).
## CRITIC (opus, round 1)
0 authz defects; 1 medium, 3 low. 1 medium — e2e stubs (e2e/support/feed-stub.ts, posts-stub.ts) lack likeCount/commentCount/likedByMe now required by the strict feedUnit/postReadView → web safeParse fails, feed/post e2e land on the error state, browser CI red. → TEST ENGINEER (stub files are test files). 2 low — like routes' 400 (incl. {userId}), 405 + Allow header, non-unique-violation faults → 500 untested. 3 low — REPEATABLE READ order (begin → set transaction → set local role) for feed, post, thread, replies. 4 low (spec) — same as A&D Open → Afik Q8; recorded S-36.
Routing: TEST ENGINEER fixes CRITIC 1–3 + A&D 1–2; CRITIC re-checks 1.

## Round 2 (CRITIC opus, 19.10)
Finding 1 and lows 2–3 fixed (8622c76, f9a9dd7); flake fix keeps the assertion. A&D lows 1–2 fixed in the same commits. No new critical/high/medium.
