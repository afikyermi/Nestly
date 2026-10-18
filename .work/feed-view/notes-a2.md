# notes — feed-view a2 (server: repository SQL, service, route)

**Approach**  `repositories/feed-repository.ts` (raw SQL, Zod on every row read): config rows, snapshot clock, ranking statement, display statement.
`services/feed-service.ts` (one identity transaction per page), `routes/feed.ts` (`GET /api/feed?cursor=`), registered in app.ts. Shared a1 functions do config
fallback, cursor, re-rank and the answer shape (`feedPageResponse.parse` before send).
**Decisions**
- Flow: viewer classified (users own row: stopped → 403 `account_unavailable`, not Regular → 403 `not_allowed`) → clock + cursor `asOf <= now()` in the DB (else 400, no
  ranking query) → all config rows (weights `::float8`) → `resolveFeedConfig` → Stage read only if `wStage > 0` (`readOwnStages` in journeys-repository, `stage` only)
  → ranking (pageSize+1) → `selectFeedPage` → display by ids → answer. A restarted cursor is dropped: new `asOf` = DB now().
- **`extra_float_digits` is 0 on this Supabase server** (float8 text had 15 digits): the keyset then repeated/skipped rows of equal-looking scores. `readRankedPosts`
  runs `set_config('extra_float_digits','3',true)` first (transaction-local, shortest exact text). Found by a paging smoke run; keep it.
- Score in SQL mirrors `scorePost` term by term; counts are scalar subqueries evaluated only for tier 0; Friend test = accepted `friendships` row (the only `status`
  in the ranking SQL, allowed by the allow-list "accepted-friendship test"). Stages go in as one text parameter (`string_to_array`), empty when weight is 0.
- Display: separate statement, `LEFT JOIN regular_names` for author and original author, `LEFT JOIN posts` for the original (RLS: unreadable = `{available:false}`);
  `is_mine` computed in SQL so no author id reaches the app; share text → `sharerText`, `body` null; a row that cannot be a unit is left out.
- Query: only `cursor` allowed (other key, repeated or malformed → 400 `cursor_invalid`). Logs: fixed lines + SQLSTATE; fallback logs version + error class only.
- findings-names low 1: `readVisibleNames(tx, userIds)` uses `inArray` over the listed counterparts (skips the query when none).
**Deviations**  none.
**Deliberately not done**  tests (TEST ENGINEER); web (part b); no schema/Drizzle table additions (raw SQL, so the drift check is untouched).
**Uncertain**  Static test on the file text will see `status` (friendship test) and `auth.uid()`; `account_unavailable` for suspended is my reuse of the friends code (spec says only 403).
**Evidence**  server+shared typecheck, eslint, check-budgets, check-stories ok; static/route/friends unit tests 80 pass; full server db suite on private container
(54326, removed): 664 pass before the extra_float_digits change; feed paging smoke (25 posts, 2 pages, share display) ok after it. feed.db.test.ts needs TE's fixtures.
**Neighbouring**  `tools/db-local.mjs` fails on `supabase db push` here without `?sslmode=disable` on the db-url (CLI 2.120.0 tries TLS); not changed.
- A&D low 5: viewer Stage set is now bound as one array parameter (`any(${sql.param([...stages])}::text[])`, empty array allowed) instead of string_to_array over a comma-joined text; compiled SQL checked (one `$1::text[]`), DB-backed tests not run here.
