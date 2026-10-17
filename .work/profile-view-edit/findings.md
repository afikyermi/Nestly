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

## Re-check — low bug above, fix 959245a, 17.10.2026
**Fixed.** `ProfileScreen.tsx:48`: on `outcome.kind === 'profile'`, `if (afterRetry) focusOn('edit')`. It is set together with
`setView({ kind: 'view' })` in the same continuation, so the effect in `ProfileContent.tsx:58-71` runs after the commit that mounts
"עריכה" and `editRef` is attached (the same path a save and a cancel already use).
- Retry that succeeds → focus moves to "עריכה". Yes.
- First load → `load(false)` from the effect, no `focusOn`; the tick stays 0 and the focus effect returns early. Focus untouched.
- Retry that fails again → line 52 unchanged, `focusOn('message')` to `[data-profile-message]`. As before.
- Stale run (unmount or a newer load) → line 43 returns before either `focusOn`. No stray focus.
New bugs: none.
