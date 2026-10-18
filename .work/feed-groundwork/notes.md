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
**Decisions (G2, 18.10)** comments_select_viewer gains the own active branch (author_id = uid): a commenter who reported or hid the post can read and delete their own comment. G1 deferred to I4.
**Not done** moderated post delete by its author: schema-b has no branch (CRITIC F3.0a finding 1, second half). Nothing under apps/ or packages/.
**Uncertain** `xid8` held branch tested in-transaction only; the author of a post they reported-hid is impossible (own reports refused).
**Evidence** up→down→up by psql; db-local test: 640 green; typecheck, eslint tools, check:budgets green. TE's 70/71/20/10/13 and tool-test expectations need b updates (see report).
**TE finding 1 (18.10)** SELECT for authenticated on posts, comments, reactions is column-level, without
posts/comments.held_xact and reactions.liker_status; policies and triggers still read them.
F3.1+ builders: `select *` / `returning *` on these three tables is 42501 for the app role; list columns.
Other "never granted" columns (author_id, is_by_post_author, reactions.is_by_author) stay readable
because tests 74 filter on them; reported.
**Neighbouring** posts_body_check btrim; a hold with no report purges at the next run (harmless).

Done by ORCHESTRATOR 18.10 (data-model.md exceptions + Entities, data-model-tables.md Feed tables).
**Fix b-1 (CRITIC 1)** comments.parent_status + FK/key/CHECK per schema-b; viewer, purge, jobs policies know a held parent; posts_body_length_check (down drops it).
