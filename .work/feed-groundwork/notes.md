# notes — feed-groundwork F3.0a

**Approach**  Migration `20261018100000_feed_posts.sql` per schema.md (4 tables, v1 seed, 3 SECURITY INVOKER triggers, policies, grants, indexes, comments) + guarded down script. Cleanup tool: 18 tables, post_hides then posts before friendships, `backlog` removed.

**Decisions**
- Two checks on `posts.audience`: `posts_audience_value_check` (list) and `posts_audience_check` (anonymous and friends).
- Down script drops the three policies that read post_hides/post_authors first. Refuses unless the config is exactly the seed.
- `runBacklog`/`summarizeBacklog` keep their names (dry-run only, TE's tests import them). `selectBacklog`, `MAX_BACKLOG_PER_RUN`, the mode, the workflow option gone; debt row closed.

**Deviations**  none.

**Deliberately not done**  F3.0b; Drizzle mirrors (F3.1); TRUNCATE guard on the config (no role holds it).

**Uncertain**
- pgTAP run by psql (no pg_prove). Failing, in TE's files: 20_registration_structure (14 to 18 tables, trigger/function/grant lists), 70 test 22 (pg_depend lists the policy twice: needs distinct), 71 (`missing FROM-clause entry for "st"`), 72 (`is(numeric, integer, unknown)`); fixture `fx_cleanup_user` fails on legal_consents.
- I removed the shared `nestly-local-db` container once with `db-local down` while TE used it; later runs used a scratch copy on another port.

**Evidence**  `db-local test`: 640 tests green (before TE's files). Scratch DB: up-down-up; anonymous insert writes the separation row; deleting it cascades the post; suspension rewrites author_status on all three copies. typecheck, eslint tools, check:budgets, cleanup tool tests (86) green. CI-only gates not run.

**Neighbouring**  none.

**Deferred protected-file edits** (data-model.md, "Preview E2E test-user cleanup" exception)
1. Replace "or `backlog` (≤ 50 oldest pattern users older than 3 h per dispatch)" with "only (`backlog` removed 18.10, audit B1)".
   Replace "exactly the fourteen nestly tables" with "exactly the eighteen nestly tables (F3.0a adds algorithm_configurations,
   post_authors, post_hides, posts; security_limits and algorithm_configurations never written)". Add "post_hides, then posts, per user before friendships".
2. As-built: posts, post_authors, post_hides, algorithm_configurations: FORCE RLS, policies TO authenticated gated by is_active_account().
   No policy reads posts. author_status FK copies; deferred circular FK for anonymous posts. post_authors readable by its author only
   (rule 20, S-26). Config append-only by trigger. No SECURITY DEFINER. · .work/feed-groundwork/schema.md
