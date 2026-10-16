# F2.0 account-takeover-close — S-01 + S-16

**Problem**  (S-01) A person who registered someone else's email with a password keeps signing in after the real owner
signs in with Google; Supabase links the two identities automatically (FR-AUTH-005, "לא נבנתה הגנה על השיוך").
(S-16) Anyone holding a live session (an open device, a stolen token, S-10) can set a new password with no proof and
lock the owner out (`security-privacy-open.md` S-16).

**Requirements**  Afik 16.10 Q3 (S-01, option א) and Q4 (S-16) (`decisions/2026-10.md:1824`) · FR-AUTH-005, FR-AUTH-003,
FR-AUTH-002 (`05-functional/auth.md`) · VAL-003, VAL-045 (`09-validations.md`) · ERR-001, ERR-038, ERR-042–044
(`10-errors-edge-cases.md`) · NFR-SEC-010 (`06-non-functional.md`) · AC-087, AC-111–116 (`15-acceptance.md`) · PG-052
(`07-screens-navigation.md`) · FR-MENU-001 (`05-functional/navigation.md`). ORCHESTRATOR D1–D3 (`intake.md`).
**SRS note:** Afik's Q3/Q4 change the security model, so per CLAUDE.md they enter the SRS at once, not at I2 close:
FR-AUTH-005 ("סיכון ההשתלטות ... מתקבל") and FR-AUTH-003 (a password change flow) are stale today. Criteria marked
**[not in SRS yet]** trace to Q3/Q4/D1/D2 until that update.

**Scope**  (a) server: S-01 detection and clear, the forced new-password step, an authenticated password change, and the
F1.8 first-password set moved to the server (D2). (b) web: the forced new-password screen, the password-change screen
and its side-menu entry, the F1.8 completion step switched to the server call.

**Out of scope**
- Email change of any kind (Q4) — not built; the Auth API path a stolen session still has is Open AR-2.
- Profile data the earlier registrant entered (journeys, children): stays (D3); recorded as an S-01 residual at close.
- Settings screen (F2.5). The entry point here is one side-menu item; F2.5 may move it.
- Changing the recovery questions flow (PG-052 change mode), recovery redeem (PG-051), sign-in, sign-up — unchanged.
- Turning off automatic identity linking, "Manual linking", unlink, email verification (Q3 options ב/ג, rejected).
- Telling the owner that a takeover was suspected, or distinguishing an owner who registered both identities himself:
  the rule cannot tell them apart and applies to both (Q3; accepted friction).
- Access tokens already issued live until expiry except where c6 says otherwise (S-11, accepted).
- New Supabase settings in code; Afik flips the two dashboard settings (Open item O-1).

**Data touched**  Auth (via the server only): `auth.identities` read; the user's password set; refresh tokens revoked.
`nestly.recovery_answers` (D1 clear), `recovery_throttles` (shared limits), `recovery_events` (new audit kinds). A
per-account S-01 state (pending / cleared-must-set / done, plus the clearing session) — **new; DATA ARCHITECT designs it**.

**Risk flags**  Part (a) **Elevated**: authentication/authorization · personal data (security answers) · schema migration
(likely) · irreversible for the user's data (password cancelled, answers cleared). Part (b) **Elevated**: authentication
(it is the only UI over (a)) — no schema, no new surface. No money, no new provider, no unauthenticated endpoint.

## Part (a) — server and schema · Elevated

1. 🔴 **Detection** [not in SRS yet, Q3]. A request whose JWT shows a Google sign-in (`amr` oauth) on an account whose
   `auth.identities` holds an `email` identity created **before** its `google` identity, with no recorded S-01 clear,
   runs the clear before that request is answered. None runs for: an email-only account; a Google-first account that
   set its F1.8 password (no email identity, or one created after the google identity — tested both ways); a request
   from a password-signed-in session. `app_metadata.providers` is never read for this (F1.8 as-built correction).
2. 🔴 **Clear outcome.** After it completes: sign-in with the old password fails with ERR-001; a refresh from any other
   session of the account fails (web: ERR-038); recovery (PG-051) with the old answers returns ERR-042 (D1); the
   caller's session keeps working; one audit row records the clear, with no password, answer or token in it.
3. 🔴 **Order and failure.** Steps run in this order, each safe to repeat: clear the answers and record "pending" (one
   transaction) → cancel the password → revoke every other session → record "done" with the clearing session. A failure
   injected at any step returns 503 (ERR-044 copy), records no "done", and the next request from a Google session
   resumes and completes it. Pepper or admin key missing → 503 before any step. No response reports success before "done".
4. 🔴 **Fail closed while pending.** While an account is "pending", every authenticated product endpoint answers 503 for
   every session of it, and no product data is returned (DR-O1).
5. 🔴 **Once, idempotent.** A later Google sign-in after "done" runs nothing: no audit row, and the password set in c7
   still works. Two concurrent requests from Google sessions produce exactly one clear audit row.
6. 🔴 **Pre-clear tokens refused** (DR-O2). After "done", an access token of any session other than the clearing one,
   issued before the clear, gets 401 on every authenticated endpoint, including c7, c10 and the PG-052 store.
7. 🔴 **Forced new password.** After "done", `GET /api/me` reports "must set password" (name: DATA ARCHITECT) until a new
   password is set. The set call takes only a VAL-003 password (7- or 257-char → 400 field error, nothing set), is
   accepted only from the clearing session and only in that state; the server sets it. Then sign-in with it succeeds. A
   second call, or one from any account not in that state → refused (409), password unchanged.
8. 🔴 **Then the questions hold.** After c7, the account is active with `recoveryQuestions: missing`, and the existing
   PG-052 hold applies unchanged (AC-114) until a new pair is stored; then the feed.
9. 🔴 **Unregistered variant.** An Auth user with no account row and an email identity older than its google identity:
   c1–c3 apply (no answers exist); there is no c7 state — the completion step's password (c11) is the new password.
10. 🔴 **Password change** [not in SRS yet, Q4]. An authenticated call with two current answers and a VAL-003 password:
    - both correct → the server sets the password, revokes every other session, keeps the caller's, audits; the old
      password then fails (ERR-001), the new one signs in;
    - a wrong answer, or other questions than the saved pair → ERR-042, password unchanged, counted;
    - the 6th attempt on the account in 30 min, or the 11th from an IP in 15 min → ERR-043 even with correct answers;
      the counters are the ones FR-AUTH-003 recovery and question change already use (NFR-SEC-010, AC-113 values);
    - answers typed as in AC-116 (niqqud, final letters, …) match; "ab" ≠ "abc" (VAL-045);
    - Auth fault → ERR-044 semantics: password not set → unchanged; set but revoke failed → a retry revokes;
    - a Google-first account with saved answers succeeds the same way; an account with no saved answers → refused.
11. 🔴 **First password moved (D2).** The F1.8 completion's password is set by the server, accepted **only** for an Auth
    user with no account row; for a user with an account row it is refused (403), password unchanged — so it cannot
    bypass c10. Auth's `same_password` stays a success (retry after a failed registration).
12. 🔴 **Authorization and fences.** c7, c10, c11 and the S-01 clear take no user id or email; they act on the JWT subject
    only; no token → 401. Password and answers never reach a log, audit row or error. The admin-key literals stay in the
    one admin module (`credentials.static.test`), widened only as AR-1 decides.
13. 🟡 **No client password set (D2).** A static test finds no `updateUser` call carrying `password` under `apps/web`.
    Removed: `AuthClient.setPassword` (`apps/web/src/services/auth/auth-client.ts:43–46, 374–377`), its source
    (`services/session/session-source.ts:51`, `auth-session-source.ts:291`); the metadata clear (`auth-client.ts:345`) stays.

## Part (b) — screens · Elevated

14. 🎨 **Forced new-password screen** (new; SRS PG ID at the SRS update). Shown in the shell while c7's state holds,
    before PG-052; only terms and privacy open, any other route returns to it; heading, explanation (copy Q-3), new
    password with show/hide, submit; no double submit; failure → ERR-044 text and the password field cleared; success →
    PG-052 setup. axe-core: no violations at 375 and 1280. **Screen:** `set-new-password` (state: a new
    `signed-in-needs-new-password`).
15. 🎨 **Password-change screen and entry.** Side menu (FR-MENU-001) gains "החלפת סיסמה" right after "שאלות לשחזור
    סיסמה", opening `/change-password`: the PG-052 change-mode answer fields, then "סיסמה חדשה" with show/hide, submit.
    Success → "הסיסמה הוחלפה" (copy Q-3); ERR-042–044 shown as in PG-051 and the new password cleared; answers and
    password never in browser storage, URL or history (AC-114 rule). axe-core clean at 375 and 1280. **Screens:**
    `password-change` (`signed-in`), `side-menu` (open, with the new item).
16. 🎨 **F1.8 completion on the server.** PG-005 Google variant calls c11; on failure it behaves as today: no account
    created, the form keeps everything but the password (`RegisterGoogleCompletionStep.tsx:80–85`). No visual change,
    no baseline. Existing `e2e-preview/google-sign-in.flow.ts` still passes.
17. 🟡 **Supabase settings hold** (O-1). With "Require current password when updating" and "Secure password change" on
    in nestly-preview, these preview flows pass: email sign-up, Google first sign-in + completion, sign-in, recovery
    redeem, c10, c7/c14; and a client `updateUser({password})` without the current password from a signed-in session is
    refused by Auth. Expected: nothing breaks, since after c13 no flow sets a password through the client (the metadata
    clear sets no password; admin calls are not subject to these settings) — the run is the proof, not this sentence.

## Open

**DECISION REQUEST — Afik (reserved: security model)**
- **AR-1** Afik approved the secret-key exception "for this flow only" (F1.6 recovery; `data-model.md` Approved exceptions
  (a)). c3, c7, c10, c11 need a server password set, so the exception widens to four flows. The admin API has no
  revoke-by-id; c3/c10 can revoke with the caller's own token (`logout?scope=others`), no admin. → **Proposed:** widen
  (a) to set-password in these four flows, same module, fence and audit; no new admin operation besides set-password.
  Not applied by any agent; part (a) BUILDER waits on it. Part (b) design and TEST ENGINEER can start.
- **AR-2** Email change stays reachable through the Auth API from a stolen session (`updateUser({email})`); Q4 said only
  "not built". → **Proposed:** S-16 is recorded as closed for passwords only, email-change via API stays 🔴 open in
  `security-privacy-open.md` with a target (I9 or the domain/SMTP decision). F2.0 does not touch it.

**DECISION REQUEST — ORCHESTRATOR (my recommendation)**
- **DR-O1** Pending state: fail closed (c4) vs FR-AUTH-002's fail-open for the questions hold. → fail closed: a
  half-done clear must not serve the earlier registrant. Recommend as written.
- **DR-O2** c6 is stricter than S-11 (1 h tokens accepted after reset). Without it the earlier registrant, holding a live
  access token, could store his own answers during c8 and take the account back through recovery. → keep c6.
- **DR-O3** Accounts linked before F2.0 ships: "first Google sign-in" read as "first Google sign-in after F2.0". → yes.

**QUESTION** (default stands if unanswered)
- Q-1 Does F1.8's `updateUser({password})` create an `email` identity? → assumed unknown; c1 is tested both ways.
- Q-2 Settings sequencing → Afik turns them on in nestly-preview before E runs on part (b), prod after merge.
- Q-3 Copy → forced screen: "כדי להגן על החשבון, צריך לקבוע סיסמה חדשה. הסיסמה הקודמת בוטלה וכל המכשירים האחרים
  נותקו."; change success: "הסיסמה הוחלפה. שאר המכשירים נותקו"; ux-copy-he may refine without changing meaning.
- Q-4 Suspended / scheduled-for-deletion accounts → the clear runs first, then ERR-037 / PG-050 as today.

**Size estimate**  (a) ~380 product lines (detection, clear service, 3 routes, admin module widening, schema) + tests;
(b) ~220 (two screens, menu item, completion rewire, session state). Each under ~400: one PR per part, (a) first.

## Gate 1 — ORCHESTRATOR, 16.10.2026

Approved against the SRS and Afik's Q3/Q4, both parts, 17 criteria. ORCHESTRATOR decides (reasons as in "Open"):
**DR-O1** fail closed while pending — as written · **DR-O2** keep c6 · **DR-O3** yes, first Google sign-in after F2.0.
Q-1–Q-4 take their defaults. AR-1 and AR-2 are Afik's (reserved, security model) — asked in one list; part (a) BUILDER
waits on AR-1; DATA ARCHITECT, TEST ENGINEER and part (b) proceed. The SRS entry for Q3/Q4 (security model, at once)
rides with part (a)'s PR via `/srs-update`.
