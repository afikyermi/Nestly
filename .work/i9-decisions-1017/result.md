# Records — Afik's decisions of 17.10.2026 (I9 order, retention, recovery lock, Sentry/Turnstile)

Light, records only. Afik's decisions: `decisions/2026-10.md`, eight entries of 17.10 from "Initiative order".
ORCHESTRATOR's decisions inside them (Afik: "decide, record, continue"):

**D1 — roadmap edit.** roadmap.md is append-only; the new order and dependency table go in as Amendment 5 rather than
editing the original table.

**D2 — "everything is deleted" and conversations.** BR-073 (16.10) kept conversations for the other side. Read with
"everything is deleted": the deleted user's messages are deleted; the other side keeps their own messages, against
"משתמש שנמחק". Reports and enforcement count as security/audit records (90 days). Afik may reverse this in one line.
**→ Reversed by Afik, 17.10:** BR-073 of 13.10 stands — conversations stay whole for the other side, the deleted user's
messages under "משתמש שנמחק"; a defined exception to "everything is deleted" (`decisions/2026-10.md`, "Conversations").

**D3 — the lock ladder in detail (NFR-SEC-010).** Per account (email HMAC): failures counted since the last success or
release; the 3rd → 1 h, the 6th → 24 h, the 9th → permanent. During a lock answers are not checked and the failure is not
counted. Unknown emails get the same ladder (no enumeration). A successful recovery or a release resets the count. Same
flows as today's NFR-SEC-010. Per-IP limit unchanged. The permanent lock shows its own text pointing to support
(ERR-043 variant); the lock reveals nothing about the email's existence, since unknown emails lock the same way. A release
resets the ladder only — it gives no access; the user still answers the questions. Until it is built, F1.6's values stay.

**D4 — release tool in I4, with the ladder.** I4 brings the admin shell, the Super Admin account, AccountEnforcement and the
Audit Log; the release is an admin action on an account, audited (FR-ADMIN-005). The ladder ships in the same part, so a
permanent lock never exists without a way out. Admin only in I4 (moderator permission, if wanted, is I14's). The user's
request: signed in through support (I8, FR-ADMIN-001) when the password is known; signed out, the public support address
that comes with the domain and email (before launch). Until then, Super Admin on request. I4 grows by one feature (U2).

**D5 — browsers (OP-017, NFR-COMP-001).** Chrome and Edge, the current stable major and the one before it, on Windows and
macOS, and Chrome on Android — tested in CI (Chrome on PRs, Edge after merge, as built). Safari on iOS, the last two majors:
best effort, a manual check before launch, not in CI. Other browsers: not supported, not blocked.

**D6 — targets (NFR-PERF-001, NFR-LOAD-001, NFR-AVAIL-001).** Core screens (feed, home, profile, chat), mid-range phone on
4G, 75th percentile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Server API, warm: p95 ≤ 500 ms reads, ≤ 800 ms writes; a cold
start ≤ 3 s. Load: 200 concurrent signed-in users (polling included) within those targets. Availability: 99.5% a month, a
target without an SLA, on Vercel and Supabase Pro (before launch). Measured on the Preview before launch, in I9.

SRS changes: `srs-changes.md` beside this file, for `/srs-update` (Afik runs it).
