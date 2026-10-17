# findings — F2.5 settings-menu (CRITIC, 17.10.2026; saved by ORCHESTRATOR)

--- bug ---
severity: medium
file:     e2e-preview/privacy.flow.ts:59
claim:    the Preview E2E still opens Settings through the profile link "הגדרות פרטיות", which c10 removes; not updated in the diff.
failure:  the first serial test (it registers the user) times out on the missing link → the dependent tests fail → E red, merge blocked.
fix:      reach Settings by the menu or `page.goto('/settings#privacy')`; assert `/\/settings#privacy$/`; update the header comment.
status:   open -> TEST ENGINEER
