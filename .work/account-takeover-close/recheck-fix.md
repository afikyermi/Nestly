# CRITIC (opus) re-check — F2.0 escape fix, findings-fix.md bugs 1–2, 17.10.2026
Saved by ORCHESTRATOR (the guard lets CRITIC write only *findings.md).

Bug 1 (high) — fixed: guard `20261017093000_link_check_password_amr.sql:33-37` (password-amr or missing/non-array amr → stale
before password_set_at, fails closed); trigger :71-76 (clearing session, or post-clear session with an amr array without
`password`; no-users-row exemption gone); verifier all-or-nothing (`token-verifier.ts:80-89`, `identity-transaction.ts:48`);
c7/c11 re-read the guard under the lock before any Auth call (`password-service.ts:88`, `:118`); after the owner's c7 the admin
set ends every session. Tests: `password.db.test.ts:169-193`, `41_link_policies.sql` 163-174, 253-255, 277-278.
Bug 2 (medium) — fixed: `e2e/account-takeover-web.spec.ts:202-204`.

no bugs
