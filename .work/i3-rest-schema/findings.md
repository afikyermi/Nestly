# CRITIC findings — PR-A I3 rest schema (opus, round 1, 19.10.2026) — returned text, saved by ORCHESTRATOR (bug list)

--- bug ---
severity: low
file:     supabase/migrations/20261019200000_feed_i3_rest.sql (post_hides_insert_guard step (b), second `not exists (... nestly.post_hides h ...)`)
claim:    a repeat hide of a post that has since become unreadable succeeds, where hide-post c2 expects 404.
failure:  B hides A's everyone post X; X becomes held/hidden/removed or A is suspended; B repeats PUT /posts/X/hide → B's own row passes (b), (c) does not match → 23505 or 0 rows with on conflict → 204 instead of 404 post_unavailable. No data exposed, no extra row.
fix:      owner decides c2 vs c1 "repeat passes"; default accept and note in the spec.
--- end ---

--- bug ---
severity: low
file:     comment on table nestly.post_hides (20261018100000_feed_posts.sql)
claim:    the comment says no function depends on post_hides except posts_select_viewer; post_hides_insert_guard now reads it.
failure:  a reviewer relying on the comment for 7א misses the function-body read.
fix:      update the table comment.
--- end ---

ORCHESTRATOR: (1) accepted — repeat hide passes (c1 wins; nothing exposed); recorded in I3-rest-gate1.md. (2) fixed in PR-A2's migration (debt until then).
