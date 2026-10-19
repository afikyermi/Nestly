# notes — comments-likes F3.3a (schema-only)

**Approach**   Migration 20261019100000_comment_body_cap.sql (CHECK + nine column comments, verbatim from schema.md) and its down script (drops CHECK, restores nine old texts from source lines, deletes own history row).
**Deviations** None. data-model-tables.md line deliberately not in this PR (protected file, WORKPLAN).
**Evidence**   Private container (port 54328, removed): migrations apply; npm run test:db 702 passed / 5 skipped (pgTAP 70-79 included; TE's 80 not yet present); up->down->up->down: constraint+column-comment fingerprints after up equal the pre-down state, down differs.
