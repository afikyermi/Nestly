# CRITIC findings — F3.3b1 comments server (opus, round 1, 19.10.2026) — summary of returned text, saved by ORCHESTRATOR
0 critical/high; 1 medium (spec), 3 low.
1. medium — comments-repository.ts:144-153 readReplies unbounded (spec "replies unbounded"): ~2,500 replies of 1,000 chars under one parent make every thread page several MB → fails for all readers. Needs a spec decision.
2. low — pg-error.ts:46-47: race between the reads and the INSERT maps 23503 → 404 post_unavailable and 42501 → 403, where c4/c5 say 400 parent_invalid / 404.
3. low — comments-repository.ts:158-160: delete count not parsed with Zod; a driver type change turns a committed delete into a false 404.
4. low — tests: (a) G2 covers moderation 'hidden' but not the commenter's own post_hides hide; (b) banned commenter absent not asserted; (c) static repository test reads source text (precedent posts-repository.static).
Checked, no finding: identity transaction, no permission filters, isMine reads post_authors own row only under RLS (no leak), anonymous id never emitted, byAuthor from DB, names via RLS, reply rules, no oracle, delete rules incl. held/anonymous/after hide, account check order, cursor, input checks, injection, no N+1, test provenance.
## ORCHESTRATOR decisions (19.10, unreserved)
- 1: replies bounded — each thread item carries its first 3 replies (oldest first) and `replyCount` (RLS-visible replies); `GET /api/comments/:id/replies?cursor=` pages the rest, 20 per page, same keyset. SPEC amends c8 (+ screen.md for w1: a "הצגת עוד השבות" control); BUILDER and TEST ENGINEER implement in b1; CRITIC re-checks.
- 2, 3, 4a, 4b: fixed in b1. 4c: kept — spec c13 (F3.1) and A&D's F3.3 static checks require static repository tests; recorded as the accepted pattern (debt to formalise in workflow when Afik is available).
- A&D asked to confirm post_authors (own row, RLS) in the thread statement for isMine and add the allow-list line.
- ORCHESTRATOR 19.10: c8 "non-reply cursor → 400" means a cursor whose id is an existing non-reply (top-level) comment; an unknown id in a well-formed cursor is valid (keyset must survive a deleted cursor row).
