# Roadmap — the approved scope of the 15 initiatives

**Record, not status.** Approved by Afik on 11.10.2026 (D7, `decisions.md` → "D7 closed"). Status lives only in
`WORKPLAN-HE.md` part 8. `.work/` is append-only history: a material change to this roadmap is appended at the end
with Afik's decision, never edited in place. The SRS stays the source of truth for every ID below.

**Sources of the order:** SRS §17 (traceability), §13 (entities), §3 and the authorization layers in
`.claude/knowledge/data-model.md`.

| # | Initiative | FR | PG | AC (main) | Entities (§13) | Depends on | Blocking before it opens | Features |
|---|---|---|---|---|---|---|---|---|
| I1 | Accounts and access (Regular) | AUTH-001..004 · REG-002..004 · TOP-001 · MENU-001 (minimal) | 001, 002, 004, 005 · AppShell | 001–005 (005: three destinations in the MVP), 016, 033, 055, 078 (identifiers) | User, RegularProfile, Child, JourneyContext, PrivacyPreference | WORKPLAN 7, 9.7 | decided (see I1 file) | 7 |
| I2 | Profile, privacy and Friends | PROFILE-001/002 · PRIV-001 · REL-001 · SET-001 | 012, 036, 038 | 015, 034, 054 | Friendship, PrivacyPreference, ChildBirthdayVisibility | I1 | OP-021 | 5 |
| I3 | Community feed | FEED-001..005 · MOD-001 (report action) · ALG-002 (subset) | 008 | 060, 075, 076 | Post, Comment, Reaction, ContentMetadata, Report, AlgorithmConfiguration | I2 | Reaction name · community rules · `algorithm.md` | 6 |
| I4 | Safety and admin core | MOD-002/003 · ADMIN-005 · ADMIN-007 (report reasons) | 028, 029, 031 (partial), 037 · admin shell | 022, 025, 027–029, 031, 077 | Report, AccountEnforcement, AuditLogEntry, CommunityConfiguration | I3 | report reasons · suspension lengths | 5 |
| I5 | Media: images in posts, profile photo | FEED-002 (images) · PROFILE-001 (photo) · NFR-MEDIA-001 · MediaUploader · ERR-014 | 008, 012 | 021 (posts) | MediaAsset | I2, I3, I4 | M1–M6: storage provider, formats and limits, images of minors, EXIF/GPS, hash scanning, retention | 4 |
| I6 | Home and tracking | HOME-001..004 · TRACK-001/002 · ALG-004 (stage only) | 009, 020, 021, 023 | 006, 007, 023, 069 | JourneyContext, TrackerEvent, TrackerData, Article | I2 | OP-003 · OP-008 · cycle and ovulation fields · tips content | 5 |
| I7 | Notifications and search | NOTIF-001..003 · SEARCH-001 · ALG-008 (subset) | 017, 018, 038 | 039–042, 046, 065, 074, 078 | Notification, NotificationPreference, FriendContentNotificationPreference, SearchEvent | I2, I3 | rate-limit thresholds · event list | 4 |
| I8 | Chat and Support | CHAT-001..004 · ADMIN-001/002 · SERV-009 (Chat Block) | 014, 024, 025 | 024, 045, 051–053, 067 | Conversation, Message, RegularChatRequest, ChatBlock, SupportRequest | I2, I4, I7 | support topics | 5 |
| I9 | Launch readiness | DATA-001 (subset) · NFR-DATA-001 · NFR-A11Y-001 · NFR-SEC-006 | terms, privacy, accessibility statement | 070 | AnalyticsEvent | I1–I8 | retention (§13.4) · legal review and its budget · OP-017 · NFR-PERF/AVAIL/LOAD · beta invite list | 4 |
| I10 | Groups | GRP-001..004 · ALG-010 | 033, 034, 035, 043 | 036–038, 050, 056, 066 | Group, Membership, GroupJoinRequest, GroupInvitation, GroupRoleAssignment, GroupMemberEnforcement, GroupNotificationPreference | I3, I4, I7 | categories · highlights | 5 |
| I11 | Professionals and services | PROREG-001..003 · REG-001 · SERV-001..009 · FOLLOW-001 · PRO-001 · ADMIN-006 · ALG-003/005 | 003, 006, 007, 011, 013, 015, 016, 022, 030, 039, 040 | 009–014, 018, 035, 043, 047, 061 | ProfessionalProfile, ServiceCategory, ProfessionalOutreachRequest, ProfessionalFollow | I8, I3, I5 | OP-005 · OP-010 · OP-016 · categories · rating source (SRS gap) · price · location | 8 |
| I12 | Marketplace | MKT-001..003, 005 · ADMIN-009 · ALG-006 | 010, 019, 044 | 008, 019, 020, 021 (listings), 058, 059 | MarketplaceListing, SponsoredProduct | I5, I8 | OP-012 · coupons · affiliate | 5 |
| I13 | Monetization | MKT-004 · SERV-010 · PRO-002 · ALG-007 | 041, 042 | 057, 062, 063, 068, 072 | Promotion, ProfessionalPromotionMetric, PromotionPerformanceEvent | I11, I12 | payment provider · pricing · invoices · refunds | 5 |
| I14 | Moderator team | ADMIN-004 · ADMIN-007 (full) · ADMIN-008 | 027, 031, 032 | 026, 030, 032, 044, 048, 049 | ModeratorPermission, SystemAnnouncement | I4 | announcement audience · ANALYTICS_VIEW scope | 4 |
| I15 | Personalization and intelligence | ALG-001, 002 (full), 004 (full), 008 (full), 009 · DATA-001 (full) · ADMIN-003, 010 | 026 | 061, 064, 067, 068, 070, 071, 073 | PersonalizationProfile, ContentImpression, RecommendationFeedback, AnalyticsAggregate | I3, I9, usage data | event retention · weights · metrics | 5 |

**MVP:** I1–I9. **After launch:** I10–I15. About 77 features, 45 of them in the MVP. Every FR (83), PG (44) and AC
(78) is assigned; an FR split across two initiatives is marked "subset" in the first and "full" in the second.
AC-017 (optional phone) is not assigned: the phone field is removed (decision of 11.10.2026), and SRS batch 2.9
retires or rewrites it.

**Reviewers beyond the path:** ALGORITHM & DATA in I3, I6, I7, I9, I10, I11, I12, I13 and I15. Trust & Safety is
flagged to Afik in I3, I5, I8, I10 and I12 (user-generated content and media).

---

## Amendment 1 — 11.10.2026 — sharing enters the MVP in I3

Afik's decision (`decisions.md` → "R2 approved; the post card gets four icon actions"): the post card carries Like,
Comment, Share in feed and Share link. **I3 adds two features** — an internal share of a post into the sharer's feed,
and an external share of a link to the post or to the site. Its FR become FR-FEED-006 and FR-FEED-007 once Afik
approves the SRS definition (batch 2.9); until then the SRS definition blocks I3. I3 grows from 6 to 8 features; the
MVP from 45 to 47, and the roadmap from about 77 to about 79.

## Amendment 2 — 15.10.2026 — the lecturer presentation (SRS 2.15)

Afik's decisions on the presentation plan (`docs/lecturer-demo-plan-HE.md` §1, `decisions.md` 15.10): **I6 adds**
FR-ADMIN-012 (admin management of status guides, PG-046) · **I9 adds** NFR-SEC-008 (CAPTCHA at registration, Turnstile —
a new external provider) · **I11 adds** FR-SERV-011 (reviews and rating) and FR-PRO-003 (professional articles) · **I12**:
BR-069, the Marketplace is listing and contact only, no purchase · **I13**: NFR-SEC-007, payment is simulated behind one
payment interface; the price list stays TBD (OP-030), so "payment provider" no longer blocks I13's opening. About 4 more
features: roughly 83 in all. Presentation scope: I1–I14 (not I15).

## Amendment 3 — 16.10.2026 — Afik's decisions before I3–I5

`decisions.md` 16.10 ("Decisions before I3–I5", "Placement"): **I3 adds** the medical hotline referral (one feature, no
data); I3's blocking points "community rules" close, and OP-028 (account deletion, 30-day grace) is decided. **I4**: report
reasons and suspension lengths are decided (OP-009). **I5**: M1–M6 are decided (OP-027), with in-browser blur and a
background server check on every image; **I5 adds Stories** as its last feature (24 h expiry, ≤ 10 a day, an `app_jobs`
expiry job). **I9**: "legal review and its budget" closes — Claude writes the terms and the privacy policy; M5 (Cloudflare
CSAM scanning) needs a domain before public launch. I3 grows to 9 features, I5 to 5: about 85 in all. The SRS text for
these lands at once (scope change), as its own Standard unit, after Afik's answers on the open details.

## Amendment 4 — 16.10.2026 — account deletion, S-01 and the audit's roadmap gaps

Afik's decisions after the full system audit (`decisions.md` 16.10 "Audit decisions" 10–11; the audit's findings A11-01..12,
A4-02 and its plan §4–§5). Each line closes a gap the audit found in this file.

1. **Account deletion gets a home: feature U1 in I9 (MVP).** FR-SET-002 · AC-108 · PG-050; OP-028 (30-day grace) and
   OP-034 (related data deleted with the account) are decided. Elevated and irreversible: DATA ARCHITECT + Afik. Depends on
   I3, I5 and I8 (it deletes their data) and on the jobs runner (item 7). I9 grows from 5 to 6 features.
2. **S-01 (account takeover through Google, `security-privacy-open.md`) is closed in I2**, as I2's first part, before the
   first endpoint that shows personal data. How it is closed is in the I2 questionnaire.
3. **Missing dependencies:** I6 ← I4 for F6.6 only (FR-ADMIN-012, Amendment 2, needs the admin shell, the Admin role and
   the Audit Log of I4); F6.1–F6.5 still depend on I2 alone · I14 ← I7 (AC-044: moderators get notifications) ·
   I9 ← I1–I8 means all eight, I5 and I6 included · U1 ← I3, I5, I8.
4. **I9 no longer waits on a "beta invite list"**: FR-ADMIN-011 was deferred on 13.10.2026 (sign-up is open).
5. **I13 no longer waits on "invoices · refunds"**: payment is simulated (NFR-SEC-007, Amendment 2). "Price" (I11) and
   "affiliate" (I12) have no recorded decision and stay open points.
6. **Trust & Safety is flagged in I11 too** (reviews FR-SERV-011 and articles FR-PRO-003, Amendment 2).
7. **Cross-cutting infrastructure gets an owner** — built once, as the first part of the first Initiative that needs it:
   the jobs runner (`app_jobs`) → I5, first part (image check, Story expiry, BR-077, U1's 30-day job, notifications) ·
   the Super Admin account → I4 · Moderator accounts → I14 · the PrivacyPreference default (Open/Restricted) and its
   backfill for existing users → I2 (questionnaire) · logger, error monitoring and backups → I9 · `algorithm.md` by
   ALGORITHM & DATA before I3 opens (already an I3 blocker).
8. **Counts.** The table's FR/PG/AC columns predate Amendments 1–3; the SRS now has 93 FR, 52 PG and 116 AC. Every FR has
   an Initiative except FR-ADMIN-011 (deferred). Features: I1 7 · I2 5 · I3 9 · I4 5 · I5 5 · I6 6 · I7 4 · I8 5 · I9 6 ·
   I10 5 · I11 10 · I12 5 · I13 5 · I14 4 · I15 5 = **86, of them 52 in the MVP (I1–I9)**.
9. **Feature lists before each Initiative.** I2–I14 have counts, not lists. Before an Initiative opens, its feature list
   and parts are written with its questionnaire (`.work/_initiatives/<I>-questions.md`); a feature with no AC (17 of the
   73 in the audit's breakdown) gets its criteria from SPEC then.
10. **React Native stays after the Web** (SRS §11): no Expo work in parallel with I2–I14 unless Afik changes §11.
11. **Open for Afik before the demo:** the admin charts the lecturer demo describes (FR-ADMIN-010/003, DATA-001 full) sit
    in I15, outside the presentation scope (I1–I14). In or out is decided in the demo questionnaire.
