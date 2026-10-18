# result — F3.0b feed-groundwork (schema PR, P6)
**Done:** comments (one reply level, "המחבר" by trigger, replies follow parent via parent_status), reactions + owner-only reaction_owners (active likers only), reports (8 reasons, one per person/target), held deletion ≤ 90 days via delete_post/delete_comment, purge_held_content() for app_jobs; column-level SELECT; posts body ≤ 2000 (F3.1-a c6); cleanup 22 tables.
**Path:** Elevated · DATA ARCHITECT G1/G2 + fix b-1 · BUILDER ∥ TEST ENGINEER · CRITIC opus round 1 (2 medium, 1 low) → fixes → round 2.
**Decisions:** own comment stays visible/deletable to its author (G2); moderated-content delete → I4 (debt); readable columns per algorithm-review.md; Afik 18.10: reported comment/user stays visible; Restricted unrelated to posts.
**SRS trace:** FR-FEED-003, FR-FEED-005 (r.1 "המחבר"), FR-MOD-001 (store), BR-062, BR-073, BR-074, AC-076, VAL-036 · Afik 3א, 7א · post length VAL (new, at I3-close /srs-update).
**Local evidence:** 45 pgTAP files 0 failures on a fresh DB (psql) · server db vitest 640 pass · tool tests 122/122 · test:product 1520:836 before the fix round.
**Records:** data-model.md approved exception (app_jobs purge), cleanup exception, Entities; data-model-tables.md Feed tables (Edit tool, 18.10).
**CI / migrate:** pending at candidate push; migrate after merge (P6).
