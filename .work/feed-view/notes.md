# notes — feed-view F3.2 6b names schema PR (P6, schema only)

**Approach**        `supabase/migrations/20261018300000_feed_author_names.sql`: the one policy `regular_names_select_post_reader`, verbatim from
schema.md, plus its `comment on policy`. Down script `supabase/rollback/20261018300000_feed_author_names.down.sql`: app_owner guard, drop policy,
delete the history row, one transaction (house style of the 20261018200000 down script, minus the data guards: nothing to protect).
**Decisions**       Header in the house style (source, SRS, "No SECURITY DEFINER", down path). No FORCE RLS toggling in the down script: it
touches no rows. No apps/ or packages/ change (readVisibleNames narrowing is F3.2a2). `.claude/**` untouched.
**Deviations**      None.
**Deliberately not done**   readVisibleNames targeting; data-model-tables line (ORCHESTRATOR); 79_feed_author_names.sql (TEST ENGINEER).
**Uncertain**       The up -> down -> up run is not done locally (db-local skips catalog-fingerprint); CI does it. The down script was read, not run.
**Evidence**        Private container (127.0.0.1:54324, same image/CLI pins as CI, removed after): all 18 migrations apply as app_owner.
pgTAP as app_server, search_path pgtap,tests: 50-54, 61-64, 70-78 pass (62 passes: the stranger fixture has no readable named post).
60_friendships_structure.sql FAILS 3 asserts (11, 12, 13): they pin exact policy counts on friendships/regular_names (7 -> 8; 5 -> 6;
5 -> 6 for is_active_account). Expected consequence of the new policy; TEST ENGINEER must update the counts (not edited here).
**Neighbouring**    None.
