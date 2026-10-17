# findings — F2.4b (CRITIC, 17.10.2026; saved by ORCHESTRATOR)

--- bug ---
severity: medium
file:     e2e/friends.spec.ts:1147-1152 ("fails … the action can be tried again", remove case)
claim:    the test expects the remove dialog to close after a failed removal; c14 does not say so and the page keeps it open with the alert.
failure:  remove with net.write=500 or 'abort' → `expect(dialog).toHaveCount(0)` fails; the follow-up click hits the inert page. Both red in CI.
fix:      for remove, assert the dialog stays open with an alert and the Friend still listed; retry with the dialog's "הסרה".
status:   open -> TEST ENGINEER

--- bug ---
severity: low
file:     apps/web/src/services/api/friends.ts:890 · apps/web/src/features/friends/FriendsScreen.tsx:727
claim:    a 404 `unavailable` on remove-Friend shows "הבקשה כבר לא זמינה" — no request is involved; the list reloads correctly, only the text is off.
fix:      a remove-specific text (ORCHESTRATOR: BUILDER writes it under ux-copy-he, gender-neutral).
status:   open -> BUILDER (fixed in this part)
