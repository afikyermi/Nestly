# Findings — F1.5 part c (CRITIC, opus, 15.10.2026)

**Verdict: Validated with Concern** — `SessionEntry.signIn()` applies signed-in without checking the epoch or a live session.
F6 (part b) closed: criteria 10 and 14 E2E run the real session source.

| # | Sev | Where | Claim | Route |
|---|---|---|---|---|
| 1 | medium | RegisterConsentStep.tsx:360; auth-session-source.ts:246 | a 201 arriving after sign-out runs `signIn()` → signed-in shell with no session | BUILDER (tie signIn to the session/epoch that started it) + TEST ENGINEER (sign out during a pending 201 → stays signed-out on `/`) |
| 2 | low | e2e/app-shell-guard-build.spec.ts:74 | prod-bundle test does not forbid `nestlyRealSession`, `e2e-stub.invalid` | TEST ENGINEER |
| 3 | low | login-form.ts:228 | email check runs the registration schema with a filler password (couples login to VAL-003) | BUILDER (email-only schema) |
| 4 | low | auth-client.ts:176 | `refreshRefused` reset on TOKEN_REFRESHED untested | TEST ENGINEER |

Checked with no finding: e2e seam constant-false in prod; completion paths; ERR-001 identical DOM; no Auth text; texts moved to
lib; no secrets/logging/casts; A9; design and RTL.

## Re-check (15.10)
1–3 **closed** (the concern resolved with 1). 4 **open, low** → debt.md: the "[CRITIC c4]" test does not reach the proactive-refresh case, so the reset on TOKEN_REFRESHED (auth-client.ts:176-179) is unprotected. Verdict: **Validated**.
