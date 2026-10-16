# F1.6 password-recovery by security questions (in the product, no email)

**Status** **Approved at Gate 1** (ORCHESTRATOR, 15.10.2026; `decisions/2026-10.md` "F1.6 Gate 1"). DR-A pet/nickname/street · DR-B stored email handle · DR-C after account creation, before `/feed` — **amended: no "later"; an active account without answers is held on the questions screen until they are saved** (every criterion that mentions skipping or "אחר כך" reads through this). Q1–Q3 defaults stand. Gate 2 next.

**Problem**        A signed-out user who forgot their password cannot get back in: "שכחתי סיסמה" leads to the `/recovery`
placeholder. No email is sent and no phone exists, so nothing proves an account is theirs.

**Requirements**   FR-AUTH-003 (05-functional/auth.md) · AC-092 (15-acceptance.md) · OP-029 · VAL-003 · ERR-001 · NFR-SEC-001,
NFR-SEC-009 · FR-ADMIN-005 (audit) · platform rules 1, 10, 17, 18 and "Approved exceptions" (data-model.md). Mechanism decided by
Afik, `decisions/2026-10.md` "F1.6: password recovery by security questions": 3 questions offered, user picks 2 and answers
both; temporary until a domain allows email. Criteria 1-8 and 14-17 trace to that decision (not yet in the SRS, DR3); 9-13 to
FR-AUTH-003 / AC-092. **Residual risk, stated once:** someone who knows the user's email and two of these facts can take the
account; this spec narrows it with slow hashing, a secret pepper, per-account lockout and audit, and does not remove it.

**Scope**          (a) store: the 3 questions, saving and changing two answers, `/api/me` reports whether they are set.
(b) redeem, signed-out: email + two answers + new password, limits, audit, the isolated Auth admin call. (c) web: `/recovery`,
the questions screen after sign-in, change from the menu.

**Out of scope**   Email, SMS, recovery key, free-text custom questions, more than 3 questions · changing F1.4 steps, its server
contract or its tests (questions come after the account exists, DR-C) · a change-password feature · deleting the questions ·
sign-in with the answers (they only set a password; the user then signs in via F1.5) · re-activating a stopped account · ending
other devices as a feature (Q2) · notifying the user of a reset (no channel) · changing email (no such feature; if one comes it
must update the lookup handle) · Edge on the PR · analytics.

**Data touched**   New: recovery answers (per user: the 2 chosen question ids, 2 salted slow hashes, parameters, times), a lookup
handle (keyed hash of the normalised email), attempt counters keyed by handle and by IP hash, audit events. `auth.users.password`
changes only through the Auth admin API. `GET /api/me` gains one field. Two secrets Afik enters: the Auth admin key and the
pepper (two env vars, each read in one module). Answers are personal data. Triggers DATA ARCHITECT + Gate 2.

**Risk flags**     authentication/authorization · personal data · schema migration · unauthenticated endpoint. Elevated; CRITIC on opus.

## Design proposals (each an answer to what Afik left to us)

**The 3 questions** (ids `pet`, `nickname`, `street`; gender-neutral plural "you", per ux-copy-he). None is a fact Nestly shows
(not children, stage, city, names), each has thousands of possible values:
1. `pet` "איך קראו לחיית המחמד הראשונה שלכם? (אם לא הייתה, כתבו שם של בובה או חפץ אהוב)". Many names, not on Nestly, but common names are guessable: the weakest, kept for being easy to remember.
2. `nickname` "באיזה שם כינו אתכם בילדות?". Open vocabulary, rarely online, known to family.
3. `street` "איך קראו לרחוב שבו גדלתם? (בלי המילה רחוב)". Large value set, not on Nestly; researchable by a neighbour.
Rejected: school (public), best friend (on social media), first name of a parent or child (public/Nestly), favourite anything (changes over time).

**Answer storage.** Server only (never the browser). Normalise: Unicode NFKC, remove niqqud and cantillation (U+0591-U+05C7), Latin
to lower case, final letters to regular (ך ם ן ף ץ), Arabic-Indic digits to 0-9, remove every space, hyphen, quote, geresh and
punctuation. Length 2-60 after normalising. Hash each answer with **scrypt** (Node built-in, memory-hard, no new dependency;
N=2^15, r=8, p=1, parameters stored with the hash), a random 16-byte salt per answer, input first passed through HMAC with the
**pepper** (a secret outside the database, so a database leak alone cannot be brute-forced). Argon2id is stronger on paper but a
native/wasm dependency on Vercel Functions. Compare with `timingSafeEqual`. Never plaintext, never in logs, audit or errors.

**Finding the account without an enumeration surface.** The server never held the email. Proposed: at the moment answers are
saved (signed-in, verified token) the server stores `handle = HMAC(pepper, lower(trim(email)))` from the token's email claim;
redeem looks the account up by the handle in the database only. This keeps the Auth admin API down to the one call that matters,
"set a password for this user id", and makes an unknown email behave exactly like a known one. Alternative (Auth admin list/lookup
by email inside the exception): a wider exception, O(n) scans, and a lookup that is itself the enumeration surface. The
email claim is read for this lookup only, never for authorization (platform rule 14).
**Redeem flow:** the form is identical for everyone: email, all 3 questions, new password; the user fills the two they chose. The
server validates shapes (400 before anything else), then always computes exactly two scrypt hashes (against a fixed dummy salt
when the handle, the pair or the questions are missing), compares in constant time, updates the counters, writes audit, and only if
both match calls the admin API with the validated password (VAL-003). Every failure returns the same status, body and work.

**Attempt limits** (constants in `packages/shared`): per account/handle: 5 failures in 30 minutes lock redeem for that handle for 30
minutes whatever the IP; 15 failures in 24 hours lock for 24 hours. Per IP hash: 10 failures in 15 minutes lock that IP for 15
minutes. Counters exist for unknown handles too, so a lock looks the same. A lock affects recovery only, never sign-in. The user
sees one text for a mismatch and one for a lock. Honest cost: someone who knows the email can lock the owner's recovery out; accepted.

**Where it fits in registration.** After the account exists, not inside steps 1-2: F1.4's flow, server contract and tests stay
untouched. One path for new and existing accounts (as DR2 before): whenever the signed-in account is `active` and
`recoveryQuestions` is `missing`, the guard sends to the questions screen before `/feed`; "אחר כך" is allowed and the screen returns at the
next sign-in; the screen says plainly that without it a forgotten password cannot be recovered. Saving is one transaction (both
answers, the handle, the audit row); if it fails nothing is stored, the user sees "השמירה לא הצליחה. אפשר לנסות שוב", and the
account is unaffected. Note for BUILDER: registration's `signIn()` makes no `/api/me` call, so the web must ask for it once.
**Changing questions while signed in:** a recent token cannot prove presence (refresh renews it), and the server never sees the
password, so change requires the **current two answers** plus the new ones, counted against the same limits.

**Existing accounts:** `missing` until they save; same screen, same path.

**Acceptance criteria**

Part a: store (signed-in)
1. 🔴 `POST /api/recovery-questions` by an active account without answers, body = exactly two entries of distinct ids from `pet|nickname|street` with an answer each, returns 201 `{"ok":true}`; without a token 401, nothing stored.
2. 🔴 Invalid body (one entry, three, the same id twice, unknown id, an answer under 2 or over 60 characters after normalising, extra fields) returns 400 `{"error":"invalid_questions"}` and stores nothing; the 201 write is one transaction: a forced failure after the first answer leaves no rows.
3. 🔴 Answers are stored only as scrypt (N>=2^15) hashes with a per-answer salt, peppered; no plaintext or normalised answer in any table, log line, audit row or error; no database role used by the request server can read the hash columns (pgTAP).
4. 🔴 With answers already set, `POST` returns 409 and changes nothing; `PUT /api/recovery-questions` with the two current answers and a new valid pair returns 200 and replaces both; wrong current answers return 401 `{"error":"invalid_recovery"}` and count as a failure for that account.
5. 🔴 A request touches only the caller's own rows (RLS); a body naming another user is rejected 400; `authenticated` cannot read other users' answer rows.
6. 🔴 `GET /api/me` for `active` returns `recoveryQuestions: "set"|"missing"`; other states and fields unchanged.
7. 🔴 Normalisation maps to one value: `"  בֶּן-גוריון "`, `"בן גוריון"` and `"בןגוריון"`; `"שלום"` and `"שלום"` with final forms swapped (`"ךם"` to `"כמ"`); `"Rex"` and `"rex"`; `"٣"` and `"3"`; and keeps `"ab"` different from `"abc"`.
8. 🔴 The same email saved twice gives one handle; two emails differing only in case/space give the same handle; the handle is a keyed hash, not the email.

Part b: redeem (signed-out)
9. 🔴 `POST /api/recovery/reset {email, answers:[2 entries], password}` with correct answers returns 200 `{"ok":true}`; afterwards sign-in with the new password succeeds and the old one gets invalid_credentials. A stopped account can reset and still sees the F1.5 stopped text.
10. 🔴 Failure branches (unknown email, email without answers, first wrong, second wrong, wrong pair of questions, correct answers in swapped questions) all return the same 401 `{"error":"invalid_recovery"}`, each runs exactly two scrypt computations (spy) and increments the handle and IP counters.
11. 🔴 An unknown email and a known one are indistinguishable: same status, body, work and lock behaviour (a lock on an unknown handle returns what a lock on a known one returns).
12. 🔴 Limits: the 6th attempt on one handle within 30 minutes returns 429 `{"error":"rate_limited"}` with `retry-after` even if correct, from any IP; the 11th failure from one IP in 15 minutes returns 429 for any handle; after the window a correct attempt succeeds; 15 failures in 24 hours lock for 24 hours; stored IP is a keyed hash.
13. 🔴 Every attempt (ok, failed, limited, admin failure, answers saved, answers changed) writes one audit row in the same transaction: kind, user id when known, handle hash, IP hash, time; `authenticated`/`anon` have no access; no answer, password or email in it.
14. 🔴 Password outside VAL-003 (7, 257 characters, empty), malformed email or a body that is not exactly two answers returns 400 before any lookup, uncounted; Hebrew and spaces accepted.
15. 🔴 If the admin call fails: 503 `{"error":"unavailable"}`, audit shows an admin failure, the password is unchanged, the answers still work; the admin key is read in one source file and the pepper in one (CI check); a missing one gives 503 on these endpoints only.

Part c: web
16. 🎨 `/recovery` (Guest path): h1, email (ltr), the 3 question fields with "ענו על השתיים שבחרתם בהרשמה", new password with show/hide, submit; errors and focus as on `/login`; fewer or more than two answers filled shows a field error and sends nothing; busy blocks a second submit; mismatch, lock, unavailable and success each show one text; the password is emptied after a failure.
17. 🎨 Questions screen (new and existing accounts, `missing`): choose 2 of 3, answer each (hints in the labels), "שמירה", "אחר כך" leads to `/feed`; reappears next sign-in when `missing`, never when `set`; also appears right after registration; no entry is stored in web storage, URL or history state.
18. 🎨 Change from the menu: asks for current answers first, then new; wrong current shows the mismatch text; success shows a confirmation.
19. 🟡 `/api/me` failing or unparseable shows no questions screen and does not block the feed (F1.5 behaviour).

Test layers (one per behaviour): 7-8 unit on shared/server functions; 1-6, 10-15 server route + DB (pgTAP for RLS and grants in 3, 5, 13); 9 integration with stubbed admin call plus one real-Auth check on the preview; 16-19 component; one Chrome E2E for sign-up, questions, sign-out, reset, sign-in with the Auth stub.

**Open questions**
- Q1 change requires the current answers (above). → **assumed if unanswered:** as above.
- Q2 other sessions after a reset. → **assumed if unanswered:** Gate 2 checks whether the admin API can revoke them; if not, ships without it and is logged in `debt.md`.
- Q3 numbers in criterion 12. → **assumed:** as written, constants in `packages/shared`.

**DECISION REQUESTS** (recommended first)
- **DR-A the 3 questions, ORCHESTRATOR:** pet, nickname, street as above; alternative set with school/friend rejected. Weakest is pet.
- **DR-B lookup, ORCHESTRATOR (DATA ARCHITECT confirms at Gate 2):** stored email handle from the token; alternative Auth admin lookup in the exception.
- **DR-C placement, ORCHESTRATOR (touches F1.4):** after account creation, one path for all, skippable; alternative inside step 2 with `POST /api/register` carrying the answers (changes F1.4 contract and tests; a transaction with the account).
- **DR3 SRS IDs, ORCHESTRATOR via /srs-update:** FR-AUTH-003 rewritten and OP-029 closed; FR-REG-004 gets a pointer; new VAL (answer rules), new ERR (recovery mismatch, lock), AC for criteria 1-18, NFR-SEC limits, FR-ADMIN-005 audit kinds, PG for the two screens, §12 admin exception, 17-traceability.
- **Reserved for Afik:** (1) the privacy policy must list recovery answers as stored personal data; whether it needs a new version and re-consent is a legal point; (2) he enters the two secrets (admin key, pepper).

**Size estimate**  ~800 lines of diff; three PRs: **a** store (1-8, migration, shared normaliser and constants, ~280), **b** redeem (9-15, admin module, limits, audit, CI check, ~320, Gate 2 in full), **c** web (16-19 and E2E, ~250). a before b before c.

## Amendment 1 — 15.10.2026, ORCHESTRATOR (Gate 2; `decisions.md` "F1.6 Gate 2")
- **Criterion 3**, last clause, reads: `authenticated` and `anon` cannot read hashes or salts; `app_recovery` reads them only for the one handle its transaction declares.
- **Criterion 9** gains: a refresh token issued before the reset is refused after it (every session ends).
- **Criterion 13** audit assertions: success = `reset_verified` + `reset_completed`; admin failure = `reset_verified` + `reset_admin_failed`; revoke failure = `reset_verified` + `reset_revoke_failed`.
- **Criterion 15** covers only the admin set-password call.
- **New criterion 20 (🔴):** if the password was set but the global sign-out failed, the response is 503 `unavailable`, the audit shows `reset_revoke_failed`, the new password works, and a retry ends every session.
- **Verify on the Preview (default):** a password over 72 bytes (e.g. a long Hebrew one) through reset and sign-up; if Auth refuses it, VAL-003's maximum becomes a decision for Afik (it affects F1.4 too).

## Amendment 2 — 15.10.2026, ORCHESTRATOR (CRITIC findings 1-2; `decisions.md` "F1.6 Amendment 2")
- **Criterion 13** reads: 🔴 Every attempt that is not rate-limited (failed reset, verified reset, failed change, answers saved, answers changed) writes exactly one audit row, in the same transaction as its counters; a verified reset then adds exactly one outcome row (completed, admin failure, revoke failure, email mismatch). A rate-limited attempt writes at most one audit row per locked subject per lock: the first limited attempt in a lock writes one `reset_limited` / `change_limited` row; later attempts in the same lock write no row in any table, and while the IP is locked no throttle row is created for the submitted email. Each row holds kind, user id when known, handle hash, IP hash and time; `authenticated` and `anon` have no access; no answer, password or email is in it.
- **New 21 (🔴):** If another account holds the handle of the caller's token email under an older claim, saving answers releases it and succeeds (201); a redeem with that email then reaches the caller's account; the audit shows `handle_released` for the other account. A caller whose token is older than the holder's claim gets 503 `unavailable` and nothing changes.
- **New 22 (🔴):** If the account's current Auth email is not the request's email, a verified reset sets no password and makes no sign-in or sign-out call: 401 `invalid_recovery`, audit `reset_verified` + `reset_email_mismatch`.
- **New 23 (🔴):** When the token's email differs from the stored handle and the token is newer, `/api/me` re-keys the handle (audit `handle_rekeyed`) and a redeem by the new email succeeds; the `/api/me` body is the same whether the re-key succeeds, fails or is skipped.
- Design: `schema.md`, "CRITIC findings 1-2 — recommendation" (binding for BUILDER).

## Amendment 3 — 15.10.2026, ORCHESTRATOR (CRITIC re-check N2; wording only, no behaviour change)
- **Criterion 13**, the rate-limited clause, reads: a rate-limited attempt writes at most one audit row per locked subject per lock: the first limited attempt in a lock writes one `reset_limited` / `change_limited` row; later attempts in the same lock write no audit row and no handle row, and while the IP is locked no throttle row is created for the submitted email. An address not seen before still gets its own IP counter row (the approved lock order, `schema.md` "CRITIC findings 1-2", finding 2: growth is proportional to distinct addresses, never to request volume).

## Amendment 4 — 15.10.2026, ORCHESTRATOR (CRITIC part c finding 3; scope unchanged)
- **Held state, exception:** an account held on the questions screen may still open `/terms` and `/privacy` (read-only documents, no route onward). Reason: a user is asked for answers under the terms and privacy policy and must be able to read them. Every other route returns to the questions screen.
