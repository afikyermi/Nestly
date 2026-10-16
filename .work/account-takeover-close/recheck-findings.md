# recheck-findings — F2.0 part (a) · CRITIC (opus), re-check, 16.10.2026
Scope: bug 1 (high) only; bug 2 (low) and the knowledge wording corrections confirmed in one line each. No re-review.

## Bug 1 (high) — server password sets not serialized with the S-01 clear: fixed

no bugs

Checked: `lockPasswordState` (apps/server/src/db/password-lock.ts:26) is a per-user transaction-scoped try-lock, and its
key is built only there. Every taker takes it first, before any row lock: clear Tx1 (identity-link-service.ts:89, before
the verdict insert), clear Tx2 (:106), c7 (password-service.ts:86), c11 (:116), c10 second transaction (:173), and the F1.6
reset (recovery-reset-service.ts:86). Each set path re-reads under the lock before calling Auth: c7/c11/c10 call
`rereadGuard` as a fresh READ COMMITTED statement, so they see a committed Tx1 as pending; c10 and the reset re-read the
answers row, which Tx1 deleted. Each holds the lock through its Auth set until commit. The three possible orders all end
safely: (a) a set is in flight, so Tx1 or Tx2 gets busy (503), nothing is recorded, and the retry cancels after the set;
(b) Tx1 committed first, so the set's re-read refuses (pending or gone) and nothing is set; (c) Tx2 committed first, so
the guard is stale and the answers are gone. PasswordStateBusy is answered 503 both in the route helper
(recovery-common.ts:48) and in the global handler (app.ts:75). An answers store that slips in after the clear is refused
by `recovery_answers_insert_own` through `is_active_account()`. The tests cover each set path against the clear, and every
expected value traces to A4 or the spec (password-lock.db.test.ts:63-120; 42_link_lock.sql).

## Bug 2 (low) — fixed: Tx2 runs `deleteOwnAnswers` again under both locks, before `markCleared` (identity-link-service.ts:109).

## Knowledge wording
- (1) Accurate now: data-model.md:130 says that GET /user and logout?scope=others send SUPABASE_SECRET_KEY as the gateway `apikey`, and the key is read only in auth-admin.ts. Whether to switch to the publishable key stays with Afik.
- (2) Accurate now: data-model.md:129 reads "each set audited in recovery_events after it (a lost row is logged)".
- Stale `now()` comments fixed: data-model-tables.md:126 and schema.ts:242 now say clock_timestamp() for cleared_at; identity-link-repository.ts no longer says now() for cleared_at.

Knowledge validation of data-model.md Approved exception (a): validated.
