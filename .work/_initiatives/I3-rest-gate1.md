# I3 rest — Gate 1 (ORCHESTRATOR, 19.10.2026)

Approved against the SRS, with the decisions below (unreserved unless marked). Specs: `.work/anonymous-post/`,
`.work/share-in-feed/`, `.work/share-link/`, `.work/report/`, `.work/medical-hotlines/`, `.work/hide-post/`.

**PRs (cadence #88):** one schema PR (all Schema needs) → F3.4 → F3.8+F3.9 (one PR, Elevated) → F3.7 → F3.5 → F3.6.
Reason: F3.9 builds the card menu F3.7 reuses; F3.7 builds PG-049, whose rule 2 links F3.8; F3.6 depends on F3.5.

1. F3.4 Q (real author in I3): confirmed — no Admin read path before I4; only the author reads it; I4 adds the audited read.
2. F3.4 DR (reserved, privacy terms): composer notice that staff can see the author → WORKPLAN "ממתין לך"; build uses ⭐ text.
3. F3.7 Q2: PG-049 community rules built in F3.7, signed-in only. Q1 1,000 code points, Q3, Q4: defaults accepted.
4. F3.5/F3.6: two PRs (24 criteria > 20). Restricted does not block sharing (Afik 18.10). Own-post share refused (FR-FEED-006).
   Defaults accepted; F3.6 E2 real WhatsApp preview verifiable only on production → WORKPLAN device check, not blocking.
5. F3.9: hide stored on the server (FR-ALG-009 "העדפה נשמרת", 8א); AC-064 ranking effect stays I15. Q1–Q3 defaults.
6. One card options menu: F3.7 names ("פעולות נוספות לפוסט" / "פעולות נוספות"); F3.9 builds it, F3.7 adds "דיווח".
7. F3.8 DR-1: an HMO without a listed nurse line → its published 24/7 medical/call-centre number, labelled, source URL + date.
8. SRS deltas for I3 close (/srs-update): Q7 names, audience_not_allowed, report text/repeat rules, stale TBD Report
   Escalation row, BR-064/AC-080 Restricted, AC range 079–083, FR-ALG-009/AC-064/UC-40 vs 8א, post_hides in §13.

## Gate 2 (ORCHESTRATOR, 19.10) — `.work/i3-rest-schema/schema.md` approved
- PR-A (migration, P6) as designed; SQLSTATEs 42501/NS002–NS005/23514 bind the specs' error mappings.
- D1 → option 1 (skip blocked by the permission classifier → Afik, WORKPLAN 14; N1 split into PR-A2, rest of PR-A proceeds): F3.3w2's PR skips the two `[F3.3-b1 c7]` null-name assertions (reason: Afik Q7 B, restored by PR-A); PR-A merges after it.
- PR-B (pg_cron bootstrap, prod run by Afik) is decoupled from F3.7: earliest held-content release is 16.01.2027 (90 days
  from F3.0b), so F3.7 does not wait. PR-B builds after I3's features; Afik's prod run → WORKPLAN; deadline in security-privacy-open.
  E1 fallback order as schema.md (A2 approved by DATA ARCHITECT; C is Afik's).

## UX direction (Afik 19.10) — Gate 1 amendments
- Specs F3.5, F3.6, F3.7, F3.9 amended to direction.md "דפוסי אינטראקציה" (audit + decisions in I3-community-feed.md "ליטוש UX של I3").
- New part `feed-composer` approved (D1–D7). Confirmed: kept text on reopen keeps the anonymous toggle state ("unchecked on every open" = a new post); focus after success → the new card; dead "הפוסט פורסם" on the post page removed.
- Order: PR-A → F3.4 → feed-composer → F3.8+F3.9 → F3.7 (sheet primitive) → F3.5+F3.6 (one PR, Afik 19.10) → UX polish → /srs-update.
- PR-A CRITIC low 1 (ORCHESTRATOR): a repeat hide of a post that became unreadable returns 204 (c1 "repeat passes" wins over c2); nothing exposed. Low 2 (post_hides comment) fixed in PR-A2.
- Afik 19.10: work/hotlines-hide and work/report started before 1795af7 → before each candidate push: rebase on main (after F3.4 brings direction.md/CRITIC 1.11), CRITIC checks their screens against direction.md "דפוסי אינטראקציה"; a deviation → DECISION REQUEST or the I3 UX-polish list, and the I3 "שינויים ל-SRS" list.
