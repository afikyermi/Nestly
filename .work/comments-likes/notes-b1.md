# notes b1 — F3.3 comments server (c2-c9)

**Approach**  Shared `COMMENT_BODY_MAX`/`COMMENT_PAGE_SIZE`, `validation/comments.ts` (strict create schema, NUL → 400, views, cursor). Server:
`comments-repository` (raw column-listed SQL, like feed-repository: no Drizzle table, so no drift entry), `comments-service`, `routes/comments.ts`
(POST/GET `/api/posts/:id/comments`, DELETE `/api/comments/:id`), `commentFaultReply` in pg-error (23514 on comments_body_length_check → 422).
**Decisions**
- Create/read/delete first classify the viewer like the feed: stopped → 403 account_unavailable, non-Regular → 403 not_allowed (c4).
- Create pre-reads the post and (for a reply) the parent under RLS, to give 404 post_unavailable / 400 parent_invalid; the trigger's 42501 stays 403, 23503 → 404 (race only).
- `isMine` for a NULL-author comment = own `post_authors` row (display only). `author` key present iff `author_id` is not null; `byAuthor` = `is_by_post_author` (also true for a named post author's comment, which keeps `author`).
- Thread cursor is `<µs timestamp>~<uuid>` (shared parse/serialize), not base64; keyset `(created_at,id) >`. Replies via one `parent_id in (...)` read, same transaction.
- Non-uuid `parentId` → 400 `invalid` (shape), unknown/unreadable → 400 `parent_invalid`. Non-uuid post id → 404 post_unavailable.
**Deviations**  none.
**Deliberately not done**  likes/counts (b2), tests (TEST ENGINEER), web.
**Uncertain**  DELETE for a stopped account answers 403 (spec c9 silent); easy to drop the classify there if the tests expect 404.
**Evidence**  typecheck, lint, check:budgets, check:stories, server unit (813) and shared (432) green; server db suite 702 passed on a private container
(port 54330, removed). The new SQL is not in that suite; I ran a throwaway smoke (anonymous "המחבר" with no author key and isMine, reply under reply
→ parent_invalid, other's delete 404, unknown post 404, paging 20+3 without repeat) — it caught a cursor-case bug, fixed. TE's comments.db.test.ts is the real proof.
**Neighbouring**  none. Leftover: untracked `apps/server/tests/b1-smoke.scratch.ts` (my throwaway; a hook blocked me deleting it) — delete, never commit.
F3.3b1 round 2: replies bounded (3 inline + replyCount; GET /api/comments/:id/replies, 20 a page; a cursor naming a readable row of another parent is cursor_invalid, a deleted cursor row pages on), commentFaultReply takes the create operation (23503/42501 → parent_invalid or post_unavailable), delete count Zod-parsed.
