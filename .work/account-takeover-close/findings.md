# findings — F2.0 part (a) · CRITIC (opus), round 1, 16.10.2026
Saved verbatim by ORCHESTRATOR (the harness refused the subagent's write).

--- bug ---
severity: high
file:     apps/server/src/services/password-service.ts (setFirstPassword: admin set after the first accountExists transaction; changePassword: setPassword after the verification transaction commits), apps/server/src/services/identity-link-service.ts (completeClear: cancelPassword inside Tx2)
claim:    The server password sets in c11, c10 and the F1.6 reset are not serialized with the S-01 clear. Each checks the guard (or the answers) in a transaction that commits, then calls the Auth admin password set with no lock held and no re-check. A set already in flight when the clear starts can reach Auth after the clear's cancelPassword.
failure:  The earlier registrant's own password set, admitted while the guard still read `ok`, lands after the cancel. He knows the account's current password, and a new sign-in after cleared_at reads `ok`, not `stale`. c7 sets the owner's password but signs out no other session, so his refresh token stays valid. c11 has no rate limit (c9 case); c10 with his own answers and the guest reset are the same class. c1–c3 and c6 pass while S-01 is still open.
fix:      Every server password set (c7, c10, c11, F1.6 reset) and the clear (Tx1, Tx2) take one per-user lock (e.g. transaction-scoped advisory lock on the user id); each set path holds it across its Auth set and re-reads the guard / link-check state under it. Add a db test: a delayed fake setPassword from a pre-clear request must not land after cancelPassword. Changes F1.6's "no transaction open across Auth calls" for c10 → DATA ARCHITECT's view.
--- end ---

--- bug ---
severity: low
file:     apps/server/src/services/identity-link-service.ts (completeClear) / repositories/identity-link-repository.ts (deleteOwnAnswers, Tx1 only)
claim:    D1 deletes the answers only in Tx1; an answers insert still uncommitted when Tx1 runs survives the clear.
failure:  The earlier registrant's first answers store overlaps Tx1 → after "done" recoveryQuestions `set` with his answers; recovery works. One shot, millisecond window.
fix:      Run deleteOwnAnswers again in Tx2, under the row lock, before markCleared.
--- end ---

Checked, no bug: detection · fail closed · stale rule (A1) · clear concurrency · a password session cannot pre-empt or undo the clear · c11 restriction · c10 shared throttles · admin key in one module · migration RLS/grants/no DEFINER · audit append-only · tests trace to spec.

Knowledge validation (data-model.md Approved exception (a)): validated after two wording corrections — (1) GET /user and logout?scope=others also send `apikey: SUPABASE_SECRET_KEY` as gateway key: say so, or send the publishable key there (AR-1: "not the admin key"); (2) "every set audited" → "audited after the set; a lost row is logged". Stale comments saying cleared_at uses now(): data-model-tables.md, schema.ts (identityLinkChecksUpdate), identity-link-repository.ts (markCleared).
Open: security-privacy-open.md S-01 ✅ lacks the O-1 caveat its S-16 row has.
