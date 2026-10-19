# notes-w2 — F3.3 w2 feed card action row

**Approach**  FeedCard gets optional `onToggleLike`; with it, after the body: shared LikeButton + link "תגובות" / "תגובות, N" to `/posts/:id#comments`. `useFeed.toggleLike` (optimistic via `withLike`, one request per unit, revert + `likeStatus` on failure, 401/403 recheck like w1) feeds the feed's single polite region. Items live in feed state, so `rememberFeed` keeps the new like for Back (c14). Landing on the heading is w1's `landOnHeading`; FocusOnNavigation focuses `main` on navigation first, the heading after the post loads wins (no change needed).
**Decisions**  Tab order like, comments, time link: the time link moved after the row in the DOM and is placed beside the author line with flex `order` (visual layout unchanged). No posting-right check on the feed: a Professional gets no feed list at all (FeedScreen `none`), so no card and no action row; avoids an extra request.
**Deviations**  none.
**Deliberately not done**  no tests except stories; post-page like changes are not pushed back into the remembered feed.
**Uncertain**  DOM reading order for screen readers now has the time link after the actions.
**Evidence**  typecheck, lint, budgets, stories, web unit (1101) green; Playwright chrome result below.
**Neighbouring**  none.

**Playwright chrome**  2641 passed, 22 failed. 14 are older feed tests that assert F3.2b's "no button / time is the only link / tab order" and now conflict with the action row (not edited): feed-owner.spec.ts:38, :56; feed.spec.ts:82, :104 (x2), :141 (x2), :171 (x2), :200 (x2), :222, :331 (x2). 8 are visual.visual.spec.ts screenshots of unrelated screens (recovery-questions, password-change, settings, privacy-settings) — not touched by this diff; not verified against main.
