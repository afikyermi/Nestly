# CRITIC (opus) — I2 F2.1 profile-view-edit, one round, 17.10.2026
Saved by ORCHESTRATOR (the harness refused the subagent's write). No critical, high or medium bug.

--- bug ---
severity: low
file:     apps/web/src/features/profile/ProfileScreen.tsx (the `load` callback)
claim:    A successful retry after a load failure loses keyboard focus: "נסו שוב" unmounts on loading, and on success nothing moves focus.
failure:  keyboard / screen-reader user on profile-load-failed presses Enter on "נסו שוב" → focus falls to <body>; next Tab restarts at the top (WCAG 2.4.3, S3).
fix:      after a retry-started load succeeds, move focus to a stable target (h1 tabIndex=-1, or `focusOn('edit')`).
--- end ---

Checked, no bug: migration grants/policy/rollback · ownership and mass assignment (no WHERE, no id, strictObject, 401 before body, 403/404) · Zod vs DB CHECK parity · logging (SQLSTATE only) · web screen states, alerts, a11y, one primary action · registration shared-text move unchanged · visual-screens list · tests trace to spec · review points A1, A8, A9, S2, S3.
