# bug — F2.0 part (a), merged in PR 38

**Expected (spec c2, c3, c10; SRS FR-AUTH-005, FR-AUTH-003 2.20):** the S-01 clear completes ("done") and the caller's
session keeps working; a password change with the two answers returns 200 and signs out only the other sessions.
**Actual (suspected, BUILDER's read of GoTrue; confirmation: preview-e2e on PR 39, `password-change.flow.ts`):** the admin
`PUT /admin/users/<id>` with a password deletes every session of the user. Then `POST /logout?scope=others` with the
caller's token fails → c10 answers 503 with the password changed; the clear's Tx2 rolls back → account stays `pending` →
503 on every request from a Google session, permanently. c7 also ends the clearing session it requires.
**Reproduction:** Preview: fresh user, store answers, `/change-password` with the right answers → no 200 (flow timeout).
**Classification:** authentication — Elevated; DATA ARCHITECT designs (Gate 2 A6); TEST ENGINEER a failing regression test
(the fake Auth port must revoke all sessions on an admin password set); CRITIC on opus.
**Production:** the code is live on nestly-prod since 16.10 23:10; affected only an account whose email identity predates its
google identity, signing in with Google (S-01 case) — and every password change from the menu (c10 has no UI there yet, part (b) unmerged).
