# CRITIC findings — F3.0b feed-groundwork (opus, round 1, 18.10.2026)

Returned as text; saved verbatim by ORCHESTRATOR.

**Done:** I finished one CRITIC round on F3.0b feed-groundwork, reading spec.md [b] with the Gate 2, re-amend and Afik 18.10 lines, schema-b.md, the ORCHESTRATOR decisions, and review.diff. I did not read notes.md. I found 2 medium bugs, 1 low bug, no critical or high, and one diff-provenance item for ORCHESTRATOR (Open 1).

**Artifact:** `.work/feed-groundwork/review.diff`, branch `work/feed-groundwork-b`. Migration line numbers below are file lines in `supabase/migrations/20261018200000_feed_interactions.sql`.

**Findings**

1. **medium**: a reply's open report keeps a held comment past 90 days, and the replies of a held comment stay visible.
   - **Where:** `20261018200000_feed_interactions.sql:366-375` (purge step 1, the expiry selection) and `:477-482` (`comments_select_viewer` branch 1 checks only that the post is readable, never the parent).
   - **Scenario:**
     - C writes top-level comment K on A's post. B replies R under K. X files an open report on R. K itself may have no report at all.
     - C calls `delete_comment(K)`. The cascade to R tries SET NULL on X's report, which raises 23514. K is held and returns 1.
     - R stays `active`. Every reader of the post still gets R, a reply to a comment nobody can see, and R's likes still count.
     - The purge never expires X's report. Step 1 only covers reports on the held comment itself or on comments of a held post, and R is neither.
     - At every later run, step 2's `delete K` hits 23514 again, so K is kept.
   - **Result:** content the author deleted stays in the database past its release, with no limit until I4 handles the reply's report. That breaks c14 ("removes it once … the time has passed", "nothing remains"). Before deletion, c13 makes replies go with their parent. Here they outlive it and stay visible, while c14 says the content is hidden from every viewer.
   - **Not tested:** no test covers a reply with an open report under a held comment.
   - **Fix (direction for DATA ARCHITECT, BUILDER implements):**
     - Extend the expiry to open reports on replies whose parent is held past release. This matches the existing rule for comments of a held post.
     - Hide replies whose parent is not readable, either with a parent-active clause in `comments_select_viewer` or by holding the replies with their parent.
     - Add a pgTAP case for both.

2. **medium**: the approved-exception entry for the `TO app_jobs` policies is missing.
   - **Where:** `.claude/knowledge/data-model.md` → "Approved exceptions" (about line 130). Searching for F3.0, purge and app_jobs policies finds no entry.
   - **Why it matters:** rule 6 and the Approved exceptions preamble say a `TO app_jobs` policy "exists only when it is listed here". The migration creates six such policies (`:550-580`; the migration header, test 73:35 and the policy comments all call them "the approved exception"). schema-b.md:69-71 gives the exact entry text and says it lands in "this PR". The records commit (9ea6029) did not add it.
   - **Failure:** the next reviewer or the RLS audit reads the authoritative list, finds six unlisted cross-user policies on posts, comments and reports, and either flags them as a rule-6 violation or comes to treat the list as optional.
   - **Fix:** add the schema-b.md entry verbatim to data-model.md Approved exceptions in this PR, under the owner of the records step.

3. **low**: the cleanup test never includes held content.
   - **Where:** `supabase/tests/75_feed_reports.sql:213-238`.
   - **Gap:** the c19 user owns posts, comments, likes and open reports, but nothing held. That is the 23514 path you asked about.
   - **What I verified:** I traced the CLI order (`tools/preview-e2e-cleanup-cli.ts`, diff 4196-4223, and its copy `tests.fx_cleanup_user`). Reports on P(U) and C(U) are deleted regardless of status before any cascade. Replies to U's comments are covered by `parent_id in`. Reports filed by U, which would trip the 23503 RESTRICT on `reporter_id`, are deleted first. So it works today.
   - **Failure:** a later edit that filters P(U) or C(U) by `status = 'active'` would pass every test and then fail 23514 on a Preview user with a held post.
   - **Fix (TEST ENGINEER):** add a held post and a held comment, each with an open report by another user, to the c19 fixture, and assert they are deleted and no row is left.

**Checked, no finding:** rule 1 recursion (no cycle; reports' policies never read posts; jobs chain reports → posts/comments → posts) · rules 2, 6 and 15 (app_server never a member of app_jobs, test 73 asserts it; every authenticated policy gated by `is_active_account()`) · functions (all eight SECURITY INVOKER with `search_path ''`; EXECUTE on delete_post/delete_comment authenticated only; purge app_jobs only; trigger functions revoked from PUBLIC) · anonymous author (comments.author_id NULL for the real author, mark set only by the trigger; is_by_post_author and author fields have no INSERT grant; reaction_owners owner-only; is_by_author carries no identity; no view; no other policy reads reaction_owners) · likes (one per (user, target); no orphan via deferred circular FK; owner-only delete; immediate liker_status cascade; counts only for readable targets) · reports (exactly the 8 reasons of decisions §3; self-reports refused for user, post, comment; one per person and target; reporter-only read; absent or unreadable target same 42501, no oracle) · held deletion (held_xact visibility limited to the holding transaction plus ownership; 90-day CHECK; only the purge deletes, only after handled or release; expired report gets NULL target, apart from finding 1) · reporter-hide posts only; G2 own branch matches the ORCHESTRATOR decision · column grants (no function/trigger read broken; count(*) works; held_xact/liker_status not selectable) · rollback (guarded, restores F3.0a's policies verbatim; table-level REVOKE clears column grants) · feed index (EXPLAIN test 77) · tests cite spec, schema-b and decisions, not migration text · test:product 1520:836 within 2× · P6 scope (no apps/ or packages/shared/src).

**Open**
1. Diff provenance: review.diff shows the F3.0a migration, rollback, workflow and tests as new files — the diff base is older than main with #75. Default: `git diff main -- supabase/migrations/20261018100000_feed_posts.sql supabase/rollback/20261018100000_feed_posts.down.sql` must be empty; if not, a modified applied migration is a blocker.
2. Findings 1 and 2 go to their owners. I re-check only those (and 3 if fixed) in round 2.

**Next owner:** ORCHESTRATOR. Route finding 1 to DATA ARCHITECT, then BUILDER; finding 2 to the records owner; finding 3 to TEST ENGINEER; and run the check in Open 1.

## ORCHESTRATOR routing (18.10)
- Open 1: checked — local `main` was stale (critic-diff base); after `git fetch origin main:main` (6f05793) the F3.0a migration and rollback are identical to main. No drift.
- 1 → DATA ARCHITECT decides the shape, BUILDER implements, TEST ENGINEER adds the pgTAP case; CRITIC re-checks.
- 2 → ORCHESTRATOR adds the schema-b entry (and F3.0a's deferred as-built text) to data-model.md with the Edit tool in this PR; CRITIC re-checks.
- 3 → TEST ENGINEER, with the fix round. F3.1's body-length CHECK (post-create c6) is folded into this migration in the same round.
