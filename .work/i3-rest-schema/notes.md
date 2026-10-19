# notes — I3 rest schema, PR-A (+ PR-A2)

**Approach**        PR-A `20261019200000_feed_i3_rest.sql`: S-share, S-hide, U-share, R-cap as schema.md, one transaction, down restores F3.0a's
two functions verbatim (diffed). N1 split into `20261019300000_commenter_names.sql` + down, its own commit (ORCHESTRATOR 19.10, PR-A2 after D1).
**Decisions**       Gates (a) use the own-row `regular_profiles` policy (needs is_active_account): share on `auth.uid()`, hide on `new.user_id`
(keeps `tests.fx_ph_add`). Own-post test is `orig.author_id = (select auth.uid())`; NULL author only on anonymous, already refused.
Comment added on `reports_details_length_check` (pattern of comments_body_length_check). Docs: one PR-A paragraph in data-model-tables
"Feed tables"; N1's policy in "Friendships and regular names" with PR-A2. data-model.md: no rule or exception changed, untouched.
**Deviations**      N1 not in PR-A (ORCHESTRATOR scope change). Otherwise none.
**Deliberately not done**   pgTAP (TE), PR-B, `lib/pg-error.ts` NS002–NS005 (product code, feature PRs), `post_hides_insert_owner` policy comment
still says "the FK proves the post exists" (now the guard's NS004 does first; schema.md lists no comment change for it).
**Uncertain**       Down scripts not exercised by db-local (catalog-fingerprint is CI-only); checked by a manual down→up, see Evidence.
N1 cost: per name, EXISTS over the commenter's comments until the first readable one (schema.md "Indexes"); fine at MVP.
**Evidence**        typecheck, lint, check:budgets green. `db-local test` without N1: 21 files / 757 passed, 5 skipped (main's suite green).
pgTAP is not run by db-local; ran it informally as supabase_admin + SET ROLE app_server: migration-caused failures 20#42, 20#44, 70#20/21/26,
71#179/180 (rest are harness artifacts: session_user, "app_server without SET ROLE"). File 20 is not in schema.md's amendment list.
With N1: 755 passed, 2 failed — exactly the two `[F3.3-b1 c7]` assertions (D1). Manual down N1 → down PR-A → up PR-A → up N1 in the
local container (as app_owner): catalog fingerprint (functions+comments, policies, constraints, triggers) returns to each prior value.
**Neighbouring**    `tools/db-local.mjs` uses one fixed container name/port: parallel worktrees (wt/f34) recreate it mid-run → false
"password authentication failed for app_server" failures. Two of my runs were void for that; reran when free.
