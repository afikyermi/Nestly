# SRS changes for /srs-update — Afik's decisions of 17.10.2026

One batch, one version (2.22). Decisions: `decisions/2026-10.md` 17.10 (from "Initiative order"); ORCHESTRATOR's details:
`result.md` D2–D6 beside this file. New IDs continue the sequences (last today: FR-ADMIN-012, AC-125, ERR-044).

1. **Recovery lock ladder — NFR-SEC-010** (06-non-functional.md:44). Replace the per-account limits with: failures per
   account (email identifier) since the last success or release — the 3rd locks 1 hour, the 6th 24 hours, the 9th
   permanently; a permanent lock is released only by an Admin (new FR, item 2). The per-IP limit stays as written. During
   a lock answers are not checked and not counted; unknown emails lock the same way; success or release resets the count.
   Status line: built with the release tool in I4; until then the F1.6 values stand. Retention sentence → item 5. Name the
   accepted risk: anyone who knows an email can lock its recovery permanently (DoS, accepted, Afik 17.10).
   - **AC-113** rewritten to the ladder (3 → 1 h, 6 → 24 h, 9 → permanent; IP limit as now; login unaffected).
   - **ERR-043**: add the permanent case — "השחזור לחשבון הזה נחסם. לשחרור אפשר לפנות לתמיכה" (temporary locks keep
     today's text, no duration). Or a new ERR-045 if the section prefers one ID per message.
   - **§13 RecoveryThrottle** (13-data.md:69): the stage and a permanent flag.
   - **FR-AUTH-003**: one cross-reference to the ladder and the release.
2. **New FR-ADMIN-013 — releasing a recovery lock** (admin.md). Actor: Admin (I4; a moderator permission is not
   decided). Resets the account's recovery count; gives no access (the user still answers the questions). Every release
   is an Audit Log entry (FR-ADMIN-005). The user asks through Support (FR-ADMIN-001) when signed in; signed out — the
   public support address, which comes with the domain and email before launch (§12). New **AC-126**: an Admin release
   lets the next attempt be checked, writes an AuditLogEntry, and a non-Admin is refused. Add its short name to
   `tools/srs-ac-names.json`; §17 traceability (I4).
3. **Browsers — NFR-COMP-001** (06-non-functional.md:18) and **OP-017 closed** (appendix B): Chrome and Edge, current
   stable major and the one before, on Windows and macOS, and Chrome on Android; Safari on iOS, last two majors, best
   effort with a manual check before launch; other browsers not supported and not blocked. Add OP-017 to the closed list.
4. **Targets — NFR-PERF-001, NFR-LOAD-001, NFR-AVAIL-001** (06-non-functional.md:13–15): core screens (feed, home, profile,
   chat) on a mid-range phone over 4G, p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; server API warm p95 ≤ 500 ms reads,
   ≤ 800 ms writes, cold start ≤ 3 s · 200 concurrent signed-in users within those targets · 99.5% a month, a target with
   no SLA. Measured on the Preview before launch (I9). §2 line 63 ("יעדי NFR... ו-OP-017 מוגדרים") stays true as a
   pre-launch check.
5. **Retention after account deletion** — **BR-073**, **FR-SET-002**, **§13.4** (Account/Profile/Content row and
   Moderation/Audit row), **NFR-SEC-010** retention sentence, **RecoveryThrottle** retention: at the end of the grace every
   row of the account is deleted; security and audit records about it (security events, audit log, recovery audit and
   counters, reports and enforcement) are kept 90 days from the deletion and then deleted. In BR-073: "שיחות נשמרות לצד
   השני" becomes — the deleted user's messages are deleted; the other side keeps their own messages against "משתמש
   שנמחק"; "דיווחים, אכיפה ו-Audit — נשמר רישום מצומצם" becomes "נשמרים 90 יום מהמחיקה ואז נמחקים". BR-077's legal
   handling of child-abuse material is unchanged. Retention for live accounts stays TBD (§13.4, S-20).
6. **Privacy policy content — BR-078** (and §13.4): the policy is written in general sentences. It includes one sentence
   on the recovery questions (stored only as a keyed hash, used only for recovery, deleted with the account) and one,
   beside the backups, that technical logs of the server and the infrastructure providers are kept briefly for operations
   and security.
7. **OP-036 closed** (appendix B:42; add to the closed list) with item 6's wording. **§13.4 Tracker/Child row**
   (13-data.md:143) and **FR-PROFILE-002**: "בלי רישום באפליקציה" → "שום שורת לוג של האפליקציה, עמודה או רשומה אינם
   רושמים את המחיקה"; the platform logs are covered by the privacy policy (BR-078), no longer "נדרש אישור".
8. **§12 external interfaces** (12-external-interfaces.md): new row **Error monitoring** — Sentry, errors only, no Session
   Replay and no Tracing; the code sends no personal data; organization-level Data Scrubber, Default Scrubbers and
   Prevent Storing of IP Addresses on. Two projects: `nestly-server` (Fastify, `@sentry/node`) and a `javascript-react`
   project for the web. Variables in Vercel, Preview and Production: `SENTRY_DSN` (server), `VITE_SENTRY_DSN` (web). Status:
   approved, set up by Afik 17.10.2026, wired in I9. **Bot protection** row: set up 17.10 — a Managed widget for
   nestly-blue.vercel.app; `VITE_TURNSTILE_SITE_KEY` (config) and `TURNSTILE_SECRET_KEY` (secret) in Production only;
   Preview uses Cloudflare's published test keys; wired in I9 (NFR-SEC-008 cross-reference).
9. **Order — §2** (02-system-overview.md:45): "נבנית ב-Initiatives I1 עד I9" → the launch is built in I1–I14, with I9
   (launch readiness) last before the demo content, the presentation and the launch; I15 after launch (Afik 17.10).
