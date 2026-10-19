# notes — F3.5 share-in-feed + F3.6 share-link (one PR, work/sharing)

**Approach**  Shared: validation/shares.ts (createShareSchema, shareReadView, postPageView),
feed/share-target.ts (shareTargetOf, postLinkOf, siteLinkOf, shareTargetsOf); original.isMine.
Server: routes/shares.ts → shares-service → shares-repository (bound SQL); PATCH share → 400;
NS002 → 403 not_shareable; GET post: private, no-store. Web: ShareFeedSheet, ShareLinkSheet,
use-share-*, browser-share adapter, PostShareView, menu item, isReturnPath, post.html + rewrite.
**Decisions**
- shareTargetOf of a share reads only original.isMine (sharing a post twice is allowed).
- Share columns not in Drizzle (drift list), so share reads are bound SQL.
- 201 = readPostById in a second transaction (F3.4 c5 pins readPostDetail there).
- Share text over limit → 422 body_too_long, as a post.
- Refusals log one fixed line, no SQLSTATE (c5).
- SheetPanel `described` prop; AppShell `closeMenuThen` so the site sheet opens from the
  Hamburger and returns focus to it.
- GET 403 not_allowed → "post unavailable" view (F3.6 c10).
**Deviations**  Quote on a plain post's page shows the fallback name (post read has no author,
c7). Email link also target=_blank (spec c4).
**Deliberately not done**  No Professional check on the post page (server refuses); no counts,
notifications, events, SSR or per-post preview.
**Uncertain**  Device-share success leaves the sheet open. A delete between the share commit
and its read would answer 500.
**Evidence**  commit 87db4f1: typecheck, check:budgets, check:stories, server/web unit,
test:tools, share-preview pass; db-local test 856 pass / 7 skip (isolated copy). Lint fails
only on TE's untracked scratch config. e2e/visual not run.
**Stale for TEST ENGINEER**  feed-ranking.test.ts c12 fixture (original.isMine); e2e c9 tab
order (share link is now third); share-stub postView has author on kind post; exact GET
/posts/:id compares (new kind); icon/FeedCard/PostContent baselines; new stories' baselines.
**Neighbouring**  login-screen.test.tsx F1.5 c5 timed out once in a full run, passed alone.
