# notes — ux-polish-a (comments inside the feed card)

**Approach**        `use-feed-comments` (reads, likes, the anonymous `isMine` read) and `use-feed-comment-writes`
(field, reply box, delete) keep every card's thread in one map by unit id while /feed is mounted. View rules:
`card-comments-state.ts`; `CardComments` draws them with F3.3's `CommentItem`/`CommentComposer`. `use-near-cards`
(IntersectionObserver, rootMargin 100%) calls `near(unit)` once per card. Counts and statuses go into the feed
state (`withCommentCount`, `withStatus`), so Back restores "תגובות, N" (c11).
**Decisions**       Comment menus and the comment confirmation are kinds of FeedScreen's one `Overlay`: one
`useBackCloses` covers card and comment "⋯" (c10). The comment confirmation reuses FeedContent's single
`ConfirmDialog` (keeps ux-polish-b c11's one-dialog scan); comment reports reuse the feed's `useReport`.
Exported: `COMMENT_REPORT_STATUS` (CommentsSection), `problemOf` (use-comment-writes). "תגובות" is a native
`<button>` (Button forbids `aria-label` beside visible text); it focuses `[data-comment-field] textarea`.
c10 scroll: `feed-scroll.ts` sets `history.scrollRestoration = 'manual'` while the feed is mounted (restored on
unmount); otherwise the browser put back the scroll from when the overlay entry was pushed. The feed already
restores its own scroll for Back from a post. In-card field and reply-box forms are unnamed (coordinator 19.10).
**Deviations**      None. Anonymous card whose GET /posts/:id fails: no field, load-failure alert + "נסו שוב"
(re-sends the failed read); 404 → "הפוסט אינו זמין". 403 on the first comments read: no comment area.
**Deliberately not done**   Comment area while the card's edit form is open; hide placeholders; Professional UI.
**Uncertain**       "השבה" on an anonymous card before `isMine` answers opens a box that is drawn only once it
answers. `latestOf` reads the last render (a send in the same tick as a keystroke: as the post page). No
IntersectionObserver (jsdom): cards never load.
**Evidence**        typecheck, lint (src), check:budgets, check:stories, web unit 1282/1282 with
`--testTimeout=60000` (at 5 s, machine-load timeouts in login/registration/composer suites, unrelated). No E2E run.
**Stale tests (for TEST ENGINEER)**   card "תגובות" link/href/#comments: e2e/feed-actions.spec.ts 33, 62-66, 182,
195, 229 · e2e/feed.spec.ts 105 (tab stops: now a BUTTON, comment controls after "⋯"), 128, 187 (link count) ·
e2e/anonymous-post.spec.ts 137 · e2e/posts.spec.ts 106 · e2e/report.spec.ts 361 (reaches the post via the link)
· e2e/ux-polish-b.spec.ts 122 · /feed axe scans now include the comment area.
**Neighbouring**    The post page's overlays likely share the Back scroll-restore jump (not fixed here).
