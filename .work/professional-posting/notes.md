# notes — professional-posting (PR-A3, migration only)

**Approach**        `20261019400000_professional_posting.sql` + down script per schema.md (Gate 2): helper `caller_account_type()`, three
FKs to regular_profiles dropped, `posts_insert_author` / `comments_insert_commenter` / `reactions_insert_reader` recreated with the
added terms, `posts_update_author` WITH CHECK altered, comments rewritten. Down written first: guard, verbatim restore, helper dropped.
data-model-tables.md "Feed tables" gains the PR-A3 paragraph. data-model.md unchanged: no rule or exception changes (rule 16 covers the helper).

**Decisions**       `posts_update_author` keeps its current WITH CHECK text from 20261018200000 (`status in ('active', 'deleted')`, the held
deletion), not the 20261018100000 text; the down restores that same text. The down lifts FORCE RLS on posts, comments, reaction_owners
and regular_profiles for the guard and puts it back before any other statement (the profile_privacy pattern).

**Deviations**      One comment beyond schema.md's list: `posts_author_id_created_at_idx` said "both author FK cascades"; after the
drop there is one, so it now says "the author status FK cascade" (the down restores the old text). comments.author_id had no "Regular"
wording; it now names "a Regular or Professional account" as schema.md lists it for rewriting.

**Deliberately not done**   tests (TEST ENGINEER), server/web (PR b), the stale `posts-service.ts:2` comment (PR b), `followers` (I11).

**Uncertain**       none on the SQL. The helper reads `users` in every status through `users_select_own` and filters `status = 'active'`
itself, so a stopped caller gets NULL and every new term is false.

**Evidence**        check:budgets ok. db-local pgtap: 41/43; fails only 80_comment_body_cap.sql 22/24/27 (exact-text assertions of the three
column comments schema.md rewrites, superseded, not in schema.md's list) and 85_professional_posting.sql (TEST ENGINEER's in-progress file:
"permission denied for schema nestly" at its line 83). db-local test: 780 passed, 1 failed = posts.db.test.ts F3.1-a c4 (expected, superseded).
Manual up→down→up on a kept local DB as app_owner: catalog fingerprint identical; down refuses with a Professional post present.
CI remains the verdict for the fingerprint step.

**Neighbouring**    none.
