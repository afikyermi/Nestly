# Findings — F1.5 part a (CRITIC, opus, 15.10.2026)

**Verdict: Validated with Concern.** Concern (→ debt.md): the invariant "own `users` row visible = active" is now false;
later code copying that pattern would let a stopped account through. Nothing in the diff gets it wrong.
Checked with no finding: the policy and its rollback (fingerprint), nothing else opens to a stopped account, `/api/me`
(own identity, fail-closed mapping, byte-identical unavailable, no-store, 401/503/500/405, logs), consumers
(`hasAccount` → 409 at the pre-check), pgTAP (incl. the `polqual` string), db tests, tests not weakened.
Knowledge proposal: not validated in round 1 (notes.md is not CRITIC's to read) → `.work/login-session/knowledge-proposal.md`.

## 1 — low · .claude/knowledge/data-model.md:143
"Status gate placement" still says the active check on `users` is inline; with data-model-tables.md it must say there is
no SELECT status gate on users and own-row visibility never means active. Also the stale header of
supabase/tests/13_identity_account_status.sql:2.
→ proposal written (knowledge-proposal.md §2); test header fixed by TEST ENGINEER.

## 2 — low · apps/server/src/plugins/authentication.ts:73
The 401 path logged `{ err }`, whose jose cause can carry the decoded payload (sub, email) — criterion 3 says never.
→ BUILDER: logs `reason` and jose `code` only; TEST ENGINEER: `[F1.5-a c3 NFR-PRIV-001]` asserts no token, sub or email.

## Re-check (15.10)
Findings 1 and 2: **closed**. Knowledge texts 1 and 2: **validated as written**, promoted (proposer DATA ARCHITECT, validator CRITIC). Verdict: **Validated** (concern stays in debt.md).
