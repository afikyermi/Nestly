# notes — feed-groundwork

**F3.0a** Migration `20261018100000_feed_posts.sql` per schema.md; cleanup tool 18 tables, `backlog` removed; finding 1: `post_hides_insert_guard` (invoker trigger, 42501).

## F3.0b
**Approach** `20261018200000_feed_interactions.sql` + guarded down script per schema-b.md; cleanup tool 22 tables (reports, reactions, post_hides, comments, posts per user).
**Decisions**
- `content_hold()` refuses non-`active→deleted` only for `current_user = 'authenticated'`; the owner role may set any status (moderation, fixtures) and the trigger keeps held_* consistent with the CHECK.
- reports_select_jobs is `status in ('open','expired')`: the UPDATE's new row is checked against the SELECT policy, so `open` alone made the purge fail 42501.
- Body/details checks use `~ '[^[:space:]]'`, not `btrim` (btrim trims spaces only; a newline-only body passed). Posts' `btrim` check has the same gap (neighbouring).
- Down script drops reactions_delete_owner first (reads reaction_owners). Restores F3.0a's two policies verbatim.
**Deviations** the two above (schema-b says btrim, `open`).
**Not done** moderated post delete by its author: schema-b has no branch (CRITIC F3.0a finding 1, second half). Nothing under apps/ or packages/.
**Uncertain** `xid8` held branch tested in-transaction only; the author of a post they reported-hid is impossible (own reports refused). A commenter who reported a post cannot delete their own comment on it (post unreadable).
**Evidence** up→down→up by psql; db-local test: 640 green; typecheck, eslint tools, check:budgets green. TE's 70/71/20/10/13 and tool-test expectations need b updates (see report).
**Neighbouring** posts_body_check btrim; a hold with no report purges at the next run (harmless).

**Deferred protected-file edits** (data-model.md)
1. Approved exceptions, add: `F3.0b purge — TO app_jobs policies on posts, comments, reports: read held rows and the open reports on them, delete held rows, expire open reports past release · a job has no auth.uid() and must reach every user's held rows (rule 6) · .work/feed-groundwork/schema-b.md · 2026-10-18`.
2. Cleanup exception (a, still open): drop `backlog`; "exactly the twenty-two nestly tables" (a +4, b +4: comments, reaction_owners, reactions, reports); order: reports, reactions, post_hides, comments, posts per user before friendships.
3. As-built: posts, post_authors, post_hides, comments, reactions, reaction_owners, reports: FORCE RLS, client policies TO authenticated gated by is_active_account(); no SECURITY DEFINER; app_jobs holds USAGE on nestly, SELECT/DELETE posts+comments, SELECT/UPDATE(status, closed_at) reports, EXECUTE purge_held_content. post_authors readable by its author only.
