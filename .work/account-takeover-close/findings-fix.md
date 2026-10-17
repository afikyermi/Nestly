# CRITIC (opus) — F2.0 escape fix A6/DR-E, one round, 17.10.2026
Saved verbatim in substance by ORCHESTRATOR (the harness refused the subagent's write).

--- bug ---
severity: high
file:     supabase/migrations/20261017090000_link_check_owner_sessions.sql:28-31 (session_guard), trigger; spec.md DR-E c7
claim:    A6's premise "a post-clear session can only be the owner's" is false: a password sign-in by the earlier registrant that read the old hash before the admin PUT and inserted its session after the PUT's delete-all survives; one refresh gives iat > cleared_at, amr stays `password` → `must_set` → c7 sets a password the attacker knows (c11 same gap).
failure:  full account takeover in a bcrypt-check-wide race (rate-limited); tests password.db.test.ts:510-521 and pgTAP 41 encode the hole.
fix:      while password_set_at is null, session_guard returns `stale` for a non-clearing session whose amr includes `password`; the trigger refuses it in the password-set branch; flip the three tests; add: amr=password, iat > cleared_at, before password_set_at → 401 on /api/me, c7, c11.
--- end ---

--- bug ---
severity: medium
file:     e2e/account-takeover-web.spec.ts (c14 "no double submit")
claim:    still expects /recovery-questions after success; DR-E says /login.
failure:  browser suite red in CI.
fix:      expect /login and the sign-in-screen status after release; forcedBodies length 1.
--- end ---

Checked, no bug: pre-clear tokens, password sign-in with the cancelled password, F1.6 recovery, refresh race, OTP/magic link, c11 branch (apart from bug 1), migration vs platform rules, rollback, stuck-pending recovery in prod, F1.8 completion order, notices, tests' sources. data-model.md exception (a) A6 wording validated.
