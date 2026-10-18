# CRITIC findings — F3.0a feed-groundwork (opus, one round, 18.10.2026)

Returned as text; saved verbatim by ORCHESTRATOR.

**Done:** I reviewed F3.0a `feed-groundwork` (Elevated) once against spec.md (Gate 2, the re-amend and Afik's 18.10 lines take precedence) and schema.md. There is no critical, high or medium finding. There are four lows.

**Artifact:** .work/feed-groundwork/review.diff. I did not read notes.md.

**Findings**

1. **low** — An author who hides their own post can no longer edit or delete it.
   - **Where:** `supabase/migrations/20261018100000_feed_posts.sql:174-186` (posts_select_viewer, the anti-join `not exists (post_hides …)`), together with `:194-207` (posts_update_author and posts_delete_author).
   - **Failure scenario:** In Postgres, an UPDATE or DELETE whose WHERE reads the row also applies the table's SELECT policy. A can insert a post_hides row for their own post, because hide insert has no restriction. After that, `delete from nestly.posts where id = <own>` changes 0 rows, and so does any edit. A also stops seeing the post in their own list. Everyone else still sees it. The 3א right to delete one's own content (personal data) quietly fails until A finds and removes the hide.
   - The same mechanism makes a moderated (hidden/removed) post impossible for its author to delete, even though schema.md gives delete USING no status term. That second case belongs to I4 / F3.0b, but the designer should know about it.
   - **Fix (DATA ARCHITECT / BUILDER choose):** refuse a hide of one's own post, or exempt the author's own named post from the anti-join. Any change must keep c5 (no SELECT policy of another table may read post_authors) and c16's `pg_depend` rule. Add a test for the chosen behaviour.

2. **low** — c19's database proof runs against a copy of the cleanup SQL, not the tool's own statement.
   - **Where:** `supabase/tests/setup/70_feed_fixtures.sql:141-157` (`tests.fx_cleanup_user`) and `supabase/tests/71_feed_posts_access.sql` (the c19 block).
   - **Failure scenario:** The pgTAP test runs a hand-copied delete order. The only link to `tools/preview-e2e-cleanup-cli.ts` is a regex over the CLI text in the tool test. If the copy and the CLI drift apart while the regex still matches, c19 stays green and the Preview cleanup can fail on a user who owns posts. This is the pattern already recorded in debt.md rows 109 and 111.
   - **Fix:** add F3.0a to that existing debt entry (an integration test on a disposable database), or have the fixture derive from the CLI's statements.

3. **low** — A leftover `backlog` mode in the tool tests.
   - **Where:** `tools/preview-e2e-cleanup.test.mjs:634`.
   - **Failure scenario:** The test still calls `runBacklog({ …, mode: 'backlog' })`. It only passes because the listing throws first and `runBacklog` never checks its mode. That contradicts c19's "the `backlog` mode is gone", and the JS test sidesteps the type that now allows only `'dry-run'`.
   - **Fix:** use `'dry-run'`.

4. **low** — The records still describe the removed mode and the old table count.
   - **Where:** `.claude/knowledge/data-model.md:175-180` (approved exception "Preview E2E test-user cleanup").
   - **Failure scenario:** The entry still approves "`backlog` (≤ 50 oldest pattern users …)" and "exactly the fourteen nestly tables". schema.md requires this text to change in the same PR, and debt.md:121 was already updated. Readers of the approved-exception list will believe a mass-delete path is authorised that no longer exists, and will see the wrong preflight count (18). The as-built data-model also does not mention posts, post_authors, post_hides or algorithm_configurations at all.
   - **Fix:** DATA ARCHITECT updates the exception entry and the as-built sections with this PR's records.

**What holds (checked, no finding)**
- Platform rules 1, 2, 6, 8, 10, 12, 13, 15, 20: all four tables have RLS enabled and FORCE; every policy is `TO authenticated` and gated by `is_active_account()`; anon and PUBLIC hold nothing; app_server, app_jobs and service_role hold nothing; no SECURITY DEFINER, the three functions are invoker triggers with EXECUTE revoked; owner, id, status and the author-status copy are never granted to the client.
- Policy recursion: no posts policy reads posts; post_hides and post_authors policies read nothing; the share check runs in a separate invoker-trigger query.
- Anonymous author id: it lives only in post_authors, readable by its owner only. `posts.author_id` is NULL on anonymous posts; no view, no other policy and no `TO app_jobs` policy. Error DETAILs carry no author id. pg_stats hides tables with active RLS.
- Eligibility: viewer active, status active, author active; friends path through accepted friendships with both parties active; anonymous posts never reached through friendship (author_id is NULL).
- Shares: only an active, everyone, non-anonymous, non-share original the sharer can read. An absent and an unreadable original both get 42501, so there is no oracle. A restricted profile has no effect. The original's deletion leaves the share (SET NULL).
- c13 cascade: hides and the separation row go with the post; the circular deferred FK works.
- Configuration: append-only guard, one active row per surface, ranges and seed match I3-algorithm.md:134-143.
- Rollback: refuses while there is data, after lifting FORCE inside its transaction.
- Cleanup tool: 18 expected tables; hides then posts (named, or anonymous through post_authors) between the recovery rows and regular_profiles; backlog gone from the parser, CLI, workflow and constants; nothing secret is logged.
- c20 scope: the diff touches only supabase/, tools/ and the cleanup workflow input.
- Tests: expected values trace to spec.md, schema.md and I3-algorithm.md.
- Indexes: every FK action and cascade has one.

**Open**
- SRS conflict: BR-064 and BR-065 (docs/srs/08-business-rules.md:70-71) still say a restricted author's post cannot be shared and shows "unavailable". Afik's 18.10 decision overrides this, so the SRS needs updating in the Initiative's SRS update. Default: record it there.
- BR-066: it says a share of a share shares the original, while the database refuses a share whose original is itself a share. The F3.x share service must resolve the original before inserting. Default: carry this as an F3.x note; it is not a defect here.
- With Afik: the anonymous post copies the author's status (`author_status`), so an author's named and anonymous posts disappear together on suspension (the c4 test shows it). Default: accept, as the spec already says.
- Gap in the spec: if an author edits an already shared everyone post to friends-only, existing shares remain and non-friends get 0 rows for the original. No content leaks; the SRS is silent. Default: leave as is.
- Not checked: I could not measure whether test:product stays within 2× (I have no shell). ORCHESTRATOR or TEST ENGINEER should confirm from CI timings.

**Next owner:** ORCHESTRATOR (save this verbatim to .work/feed-groundwork/findings.md and route the lows: 1 to DATA ARCHITECT/BUILDER, 3 to TEST ENGINEER, 2 and 4 to DATA ARCHITECT).

## ORCHESTRATOR routing
- 1 → fix now: refuse a hide of one's own post (named or anonymous), BUILDER in the migration + TEST ENGINEER a test. No re-check (low).
- 3 → TEST ENGINEER fixes now.
- 2 → debt.md (existing integration-test entry extended to F3.0a).
- 4 → data-model.md is a protected file: deferred to the batch of protected-file edits for Afik (text in notes.md "Deferred protected-file edits"); listed in WORKPLAN "ממתין לך".
- test:product measured by ORCHESTRATOR: 951 test lines vs 513 product lines (git diff --numstat) — within 2×.
- Open SRS items (BR-064/065 restricted; BR-066 resolve-original in the F3.5 service) → I3-close /srs-update and the F3.5 spec.
