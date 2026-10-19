# notes — F3.3 w1 (post page: comments and likes)

**Approach**        `CommentsSection` (container) is drawn under the post through a new `thread` slot of `PostContent`, so it keeps its state while the post is edited. `use-comments` (thread, replies, likes), `use-comment-writes` (comment box, one reply box, delete own), `comments-state` (pure helpers), `CommentsView` / `CommentItem` / `CommentComposer` (display). Services `services/api/comments.ts`, `likes.ts`. `LikeButton` in `components/shared` (reused by w2), story + `STATES` entry.
**Decisions**
- Replies "הצגת עוד השבות": first call has no cursor (from the oldest), merged by id and sorted by `createdAt, id`; a reply posted meanwhile stays.
- The button hides once the last replies page was read (`repliesDone`), even if `replyCount` stays higher (RLS-hidden rows).
- Focus: after the last "עוד תגובות" page or the last replies page, focus goes to the first new item (`li[data-comment-id]`, tabindex -1); after sending a reply, to the new reply; after cancelling a reply, to "השבה"; after delete, to the heading.
- A 404 on delete is treated as deleted. Like failure and all other statuses use one polite `role=status` line in the region.
- `#comments` landing: the heading is focused once when the region mounts (react-router `useLocation().hash`).
- "המחבר" is the author line itself when `author` is absent and `byAuthor`; no avatar, link or author data attribute.
**Deviations**      none from screen.md as amended by ORCHESTRATOR (six gaps applied).
**Deliberately not done**   no mentions, edit, other's delete, report/share controls; the post's own `commentCount` is not shown; no tests except stories.
**Uncertain**       the exact description text for a top-level delete is two lines (second in a `span`), so "המחיקה מיידית ולצמיתות" matches as its own text. Existing e2e that open /posts/:id without mocking the comments endpoints get a failed thread load (alert), not a crash.
**Evidence**        typecheck, lint, check:budgets, check:stories, web unit tests (1088) green; Playwright chrome result below.
**Neighbouring**    none.
- F3.3w1 c20: LikeButton keeps aria-label "לייק, N" and now renders one visible span "לייק N" (was two aria-hidden spans with no space, axe label-content-name-mismatch).
