# Intake — debt-before-f15

**Intent (WORKPLAN "להמשך" 0):** one PR that closes the debt `debt.md` marks as due before F1.5, so F1.5 starts on a
clean base. No product behaviour changes; no schema change.

**Path:** Elevated — flag: authorization (a test of `nestly.is_active_account()`, the gate of every rule-15 policy) and
personal data (what the server error handler writes to the log). Team: BUILDER (D3) → TEST ENGINEER (D1, D2, D3 test)
→ DATA ARCHITECT (reads D1 only: does it pin the function's own check) → CRITIC on opus (raised D1 as b-1; validates).
No SPEC: the criteria below are the debt entries' own fix lines. Bug-fix-style: each criterion names the debt entry.

## Criteria

| # | Type | Criterion | Debt entry |
|---|---|---|---|
| D1 | 🔴 | A pgTAP test proves `nestly.is_active_account()` checks the caller's **own** row and its **status** by itself, not through the users policy: inside the test transaction a permissive `select` policy on `nestly.users` is added (rolled back with the test), and then the function returns false for a caller whose row is `suspended`, false for `banned`, false for a caller with no row while other active rows exist, and true for an active caller. A body of `select exists (select 1 from nestly.users)` must fail this test. | 2026-10-14 identity-platform b, CRITIC b-1 · `supabase/tests/13_identity_account_status.sql` |
| D2 | 🟡 | `register-step2-held-token.test.tsx`, criterion 11 "fields are NOT locked when no token is held": each Auth failure kind runs as its own test (one journey per test), each well inside the default timeout. Assertions unchanged in substance. | 2026-10-15 test-rules (ORCHESTRATOR) |
| D3 | 🔴 | The app-wide Fastify error handler (`apps/server/src/app.ts`) logs no part of the request: on a body-parse error whose message quotes the body, the log line carries the status, the error `code` and name only — never `message`, `stack` of a client error, or the body. Responses unchanged (`bad_request` / `internal`). | 2026-10-14 register-account-create, BUILDER neighbour (NFR-PRIV-001) |

## Out of scope
- The orphan Auth user (F1.4 Q2/Q8/500) — closes inside F1.5 by its own debt line.
- Enum drift check (b-2), bootstrap refusal paths (b-3), down-script guard (b-4) — not marked before F1.5.

## Also in this commit
Records waiting on the branch (WORKPLAN rule): the lecturer-presentation plan — `docs/lecturer-demo-idea-HE.md`,
`docs/lecturer-demo-plan-HE.md`, WORKPLAN part 10, `decisions.md` 15.10.
