verdict: Validated with Concern

# F1.6 password-recovery, parts a+b: CRITIC re-check of round 1 (opus, 15.10.2026)

Scope: round-1 findings 1 to 5, the tests for criteria 13 and 21 to 23, and the knowledge wording. Read: review.diff, the cited
source files, spec.md (Amendment 2), schema.md "CRITIC findings 1-2", interface.md lines 11-12, pgTAP 30 and 31, the two db
test files and recovery-units.test.ts. notes.md was not read.
Cost carried (goes to debt.md): a re-key of the handle starts the account's throttle counters from zero (finding N1). The
spec's "no row in any table" wording in c13 does not match the design that was approved (N2).

## Round-1 findings

--- finding ---
severity: medium (round 1 #1)
status:   fixed (as decided in Amendment 2)
file:     supabase/migrations/20261015200000_recovery_questions.sql:44-45,61,144-152,178-182,220 · apps/server/src/services/recovery-questions-service.ts:112-137,157-161,174,201-208 · apps/server/src/services/account-state-service.ts:60-72 · apps/server/src/recovery/auth-admin.ts:106-118 · apps/server/src/services/recovery-reset-service.ts:94-96
claim:    the stale or squatted handle is closed by three layers: release on store, re-key on /api/me and PUT, and a check of the current Auth email at redeem.
failure:  Re-ran these cases against the code:
          (1) Squat. The attacker saves under victim@x at t1 and moves to other@y. The victim registers and saves at t2 > t1.
          readReleasableHolder (FOR UPDATE, so the policy's UPDATE USING also applies) returns the attacker's row. The
          handle_released event is written first, while the event policy can still see the row. The UPDATE has no WHERE and
          no RETURNING, so no SELECT policy is applied to the NULL row. Then the insert happens as authenticated: 201, and a
          redeem finds the victim (c21).
          (2) Equal or older token. USING `handle_claimed_at < claimed_at` is false, so nothing comes back. The insert gets
          23505 on the handle key and the route answers 503 (recovery-questions.ts:59-61). Nothing changes because the
          transaction rolls back.
          (3) Email mismatch at redeem. Call 0 reads the email. If it is different or missing, the function returns
          'email_mismatch' before the PUT, the sign-in or the logout. The service maps that to `invalid` (401) and writes
          reset_verified + reset_email_mismatch. No counter moves (c22).
          (4) Legitimate change. /api/me runs a separate transaction after the body is built. Every failure goes to
          onFailure and the body is the same (c23). A stale token cannot move the handle back: needsRekey compares iat
          strictly, and claimOwnHandle's WHERE checks the claim again in the database.
          (5) A suspended caller's POST still runs releaseOlderHolder. The insert as authenticated then fails RLS, so the
          whole transaction, release and event included, rolls back. No effect.
          The one case that fails is a concurrent race; see N3.
fix:      none
--- end ---

--- finding ---
severity: medium (round 1 #2)
status:   fixed
file:     apps/server/src/services/recovery-attempt.ts:124-168 · apps/server/src/repositories/recovery-repository.ts:153-172 · migration :83,224-226
claim:    the IP row is locked first. While the IP is locked, no handle row is created. A limited attempt writes one event per subject per lock, through limited_noted_until.
failure:  Re-ran the round-1 scenario. A locked IP sends N random emails. ensureThrottleRow('ip') is a no-op because the row
          exists. lockThrottle('ip') returns locked. The first request runs markLimitedNoted and writes one reset_limited
          row. Requests 2 to N see noted = true and write nothing. No handle row and no scrypt. The total is 1 row, not 2N.
          locked_until cannot move during a lock, because recordFailure only runs on the unlocked path. A new lock always has
          a strictly later locked_until (greatest(...)), so noted is false again and the new lock gets one new row. Two
          requests at the same moment are serialised by FOR UPDATE on the IP row: the second one re-reads noted after the
          first commits. Lock order is IP then handle on every path. guardedAttempt is the only caller of lockThrottle, so
          there is no deadlock. Per IP, each window plus lock now writes at most 10 handle rows, 10 failed events and 1
          limited event, as the bound in schema.md says. Known and unknown handles take the same branches (c11 holds).
fix:      none (see N2 for the wording of c13)
--- end ---

--- finding ---
severity: low (round 1 #3)
status:   fixed
file:     apps/server/src/services/recovery-questions-service.ts:157-158 (POST), :210-219 (PUT)
claim:    POST checks readOwnClaim before hashing. PUT hashes the new pair only after guardedAttempt returns a match.
failure:  Re-ran both cases. A 409 POST does no scrypt (the db test at recovery-store.db.test.ts:520 covers the 409; the
          interface states no scrypt). A locked PUT does no scrypt (asserted at store test :626). The cost that remains is
          small and acceptable: a 503 handle_held POST, or two POSTs racing past readOwnClaim, still hash once each.
fix:      none
--- end ---

--- finding ---
severity: low (round 1 #4)
status:   fixed differently (the interface was corrected, the code was not changed)
file:     .work/password-recovery/interface.md:12 · apps/server/src/routes/recovery-questions.ts:4-5
claim:    the interface now says PUT by a non-active account is 409 not_set, and that this route has no 403 for that case. The code matches.
failure:  A suspended caller sends PUT. The select-own policy hides the row, so readOwnClaim returns undefined and the route
          answers 409 not_set. That is what the interface now documents. No data is exposed and no write happens.
fix:      none
--- end ---

--- finding ---
severity: low (round 1 #5)
status:   fixed
file:     supabase/rollback/20261014100000_identity_schema.down.sql:28-42
claim:    the recovery refusal (:28-34) now runs before the legal_consents refusal (:36-42). This matches the order in the header (:8-9).
failure:  With all three migrations applied, the script now tells you to run the F1.6 down script first. That is the first
          step of the documented order.
fix:      none
--- end ---

## New findings

--- finding ---
severity: low (comes from the finding-1 fix)
file:     apps/server/src/services/recovery-questions-service.ts:201-215 · account-state-service.ts:60-72
claim:    the change path's per-account limit is keyed by the current handle, and a re-key moves to a new handle with fresh counters. Changing the Auth email therefore resets the 5/30 min and 15/24 h account limits on guessing the current answers.
failure:  Someone holding the victim's session (a stolen session) calls PUT /auth/v1/user {email: fresh-N} to get a new token
          with a newer iat, then calls PUT /api/recovery-questions. The PUT re-keys to H(fresh-N) and guardedAttempt counts
          against a new handle row, so 5 more guesses are allowed. Repeated, only the per-IP limit (10/15 min, per /64)
          slows the guessing of the victim's answers. Those are personal facts and may be reused elsewhere. A stolen session
          can probably already change the password through Auth itself, so the added exposure is learning the answers, not
          taking over the account. Hence low.
fix:      Count change-path failures against something that survives a re-key, for example the handle the row held before
          the re-key, or a per-user subject. Or record it in debt.md as an accepted gap. This is DATA ARCHITECT's design
          call.
--- end ---

--- finding ---
severity: low (spec wording vs approved design; test overclaims)
file:     .work/password-recovery/spec.md:127 (c13) · apps/server/src/services/recovery-attempt.ts:147 · apps/server/tests/db/recovery-reset.db.test.ts:553-566
claim:    c13 says later limited attempts "write no row in any table". But guardedAttempt always runs ensureThrottleRow('ip') first, so a limited attempt from an address not seen before inserts a recovery_throttles IP row. The test title claims "another address … write no row" but checks only events and the handle counter.
failure:  The handle is locked, and attempts come from addresses A2..An. Each inserts one IP row. That is allowed by the
          growth bound in schema.md (proportional to distinct IPs) but contradicts the wording of c13. The test would not
          catch a regression here.
fix:      Amend c13 to say "no audit row and no handle row; an address not seen before gets its own IP counter row", or
          drop "another address" from the test's claim. Do not change the code: creating the IP row first is the approved
          lock order.
--- end ---

--- finding ---
severity: low (test asserts more than the spec or the code guarantee; flaky CI)
file:     apps/server/tests/db/recovery-store.db.test.ts:377-394
claim:    the race test expects the newest claimant to always get 201 and end as the holder. Under READ COMMITTED it can get 503 instead.
failure:  `middle` (iat t-100) starts first, because the first saveAnswers call begins before the second bearerFor is
          awaited. middle releases the holder and inserts, but has not committed yet. `newest` (iat t) runs its FOR UPDATE
          on the holder row and waits. After middle commits, EvalPlanQual re-checks the holder row, which now has a NULL
          handle, so nothing comes back. middle's row is not in newest's statement snapshot, so it is never seen as
          releasable. newest's insert then gets 23505 and a 503. The asserts `r2 == 201` and `holders == [newest]` fail
          intermittently. In the product a retry fixes it and nothing is exploitable. The defect is that the test is flaky
          and asserts an ordering that c21 does not promise.
fix:      Assert c21's real guarantees under concurrency: no 500, exactly one holder, a redeem reaches that holder, and the
          holder is one of the two claimants. Or assert that a retry by newest then succeeds. Do not add a guarantee to the
          code.
--- end ---

## Tests for criteria 13 and 21 to 23 (check 1.6)

The expected values trace to spec c13, c21, c22 and c23, to schema.md (the release statement, the one limited event per lock)
and to interface.md. None mirrors a constant or branch only the source has. pgTAP 31 :497-539 checks equal, older, unset and
newer claims, NULL-only WITH CHECK and the event attribution. The db tests check release and 503 on an equal or older token,
the re-key and the unchanged body, and the limited trail. The unit tests check call 0 and that only a GET is made on a
mismatch. The exceptions are N2 and N3 above. Note: c22's "no sign-in or sign-out call" is proved at the unit layer only
(recovery-units.test.ts:383-398). The db test uses fakeAdmin, so it covers only the service mapping. That is a correct split.

SQL expected to fail on the first CI run: none that I can see. Checked: the deparse regexes in 30 :158-167, the column lists
and grant lists in 30 against the migration, the NULL fixtures in 31 :132-137, and UPDATE without WHERE as app_recovery
(no SELECT policy is applied). Also checked that SELECT … FOR UPDATE as app_recovery has the column UPDATE grant it needs.
tests.fx_recovery_answers_json exists (setup/30_recovery_fixtures.sql:52).

## Knowledge wording

verdict:  validated with one required wording change
- Amendment 1 (rule 18: written by the server under app_recovery, not by a trigger; the policy binds handle, IP and user,
  and the server chooses kind) is satisfied.
- Amendment 2 (the rls-gate comment says "SECURITY DEFINER entries" and that no function is listed today) is satisfied.
- (a) is true of auth-admin.ts: four calls in that order, the email read and normalised, no further call on a mismatch,
  the outcome mapped to 401 and reset_email_mismatch, the static check covering the four literals. (b) is true of the
  migration: the release policy, the claimed_at helper, UPDATE on the two handle columns only, no SELECT on the audit.
- **Required:** in the `conventions.md` "Write grants" line, "hashes and salts are not readable by any request role" is
  false, because app_recovery reads them for the declared handle (migration :219; pgTAP 31 :280-282). Replace it with:
  "hashes, salts and the chosen questions are not readable by `authenticated` or `anon`; `app_recovery` reads them for the
  declared handle only".
- Optional, for precision: in (a), "`Sb-Forwarded-For` carries the platform-verified client IP" could read "on the read,
  the sign-in and the logout (not on the set-password call)" (auth-admin.ts:109,125,138,147).
