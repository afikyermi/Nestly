# notes — anonymous-post (F3.4)

**Approach**        Shared: optional `isAnonymous` on create, refine → `audience_not_allowed` (422); `postView` gains `isAnonymous`.
Server: insert writes `is_anonymous`; `readPostDetail` (raw SQL + Zod) holds the pinned A&D `isMine` expression, used only by
`readPostById`; `readPost` (the gate) keeps its six columns. `posts_audience_check` 23514 → 422 by constraint name. Web: composer
checkbox, notices, post-page header and own note, fixed line on edit, comment-box notices via FormField `hint`.
**Decisions**       Anonymous create sends `audience:"everyone"`; the audience choice stays in state and returns on uncheck; the
remembered audience is written only for named posts. Anonymous edit sends body and stageTag only (no audience). Named create still
omits `isAnonymous` from the request (F3.1 request shape unchanged). The ⭐ in screen.md is read as the pending-text marker, not copy.
**Deviations**      none.
**Deliberately not done**   N1 policy (PR-A2) and any migration. c9 and c10/c15 expectations need N1: tests for TEST ENGINEER.
**Uncertain**       Anonymous insert RETURNING relies on posts_select_viewer passing for an author_id-NULL "everyone" row (it should);
not run here against the DB: TE's c2 covers it.
**Evidence**        typecheck, lint, check:budgets, check:stories green. Pre-existing tests now red by design (TE to amend):
shared post-create c2 (isAnonymous accepted); server posts-errors "23514 on another CHECK" + c2 refused body; static c13 where-scan
and F3.3-b1 c6 (new pinned match); drift.test catalog lacks `posts.is_anonymous`; posts.db c3 (201 gains isAnonymous) and c2.
e2e stubs (posts-stub) must add `isAnonymous` or the strict web parse fails. Web login-screen c5 timed out under full-suite load,
passes alone. First db-local run hit "password authentication failed" in 18 files (likely a concurrent run); rerun clean apart from above.
**Neighbouring**    none.
