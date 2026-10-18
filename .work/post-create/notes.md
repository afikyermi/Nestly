# notes — post-create F3.1a (server)

**Approach**  Shared `POST_BODY_MAX`, `POST_AUDIENCES`, Zod `createPostSchema`/`updatePostSchema` + `checkCreatePost`/`checkUpdatePost`.
Fastify `routes/posts.ts` → `services/posts-service.ts` → `repositories/posts-repository.ts`, all in `inIdentityTransaction`. Drizzle mirrors
`posts`, `postsInsert`, `postsUpdate` added (only the columns used). Delete = `select nestly.delete_post($1::uuid)`.

**Decisions**
- URLs sit under `/api` (`/api/posts`, `/api/posts/:id`) like every route; spec wrote `/posts`.
- Error bodies are the spec's codes: 400 `invalid`, 422 `body_required|body_too_long`, 403 `not_allowed`, 500 `server_error`, 404 `not_found`.
- 400 for shape/key/enum, 422 only when every issue is a body code. A bad uuid in the path is 404 with no query (journeys pattern).
- `postFaultReply` in `lib/pg-error.ts`: 23514 only on constraint `posts_body_length_check` → 422; other 23514 → 500. Connection failures stay 503.
- PATCH takes any of body/audience/stageTag, at least one (else 400); absent = unchanged, `stageTag:null` clears.
- `isMine` = `author_id` equals caller (display only). No actor pre-check: the DB (FK 23503, policy 42501) refuses Professional/suspended.
- GET/PATCH/DELETE of unreadable or not-owned post: one 404 body; delete of a held post is the same 204.

**Deviations**  URL prefix `/api` (above). Response of POST/PATCH has no `isMine`; GET has.

**Deliberately not done**  anonymous handling, shares, rate limit, edit snapshot of a reported post (open DECISION REQUEST default applies),
web (F3.1b), migration (CHECK is already in F3.0b).

**Uncertain**  `isTransientFailure` is not used for posts, so a non-connection pg error such as 40001 is 500, as criterion 7 says.

**Evidence**  typecheck, `check:budgets`, shared tests (380) green; `db-local test --keep` 670 passed (first run collided with another run
on the shared container). Lint: one error in TEST ENGINEER's `apps/server/tests/db/posts.db.test.ts:62` (type assertion), not mine.

**Neighbouring**  none.

**Follow-up (CRITIC low 1)**  `postBody` refuses U+0000 as `invalid` (400) on POST and PATCH; test pending from TEST ENGINEER.
