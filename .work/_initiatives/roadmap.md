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
