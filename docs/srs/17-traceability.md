[← אינדקס ה-SRS](INDEX.md)

# 17. Traceability Matrix

| Page | Page / Feature Owner | FR | Use Case | Data |
|---|---|---|---|---|
| PG-001 | WelcomePage | FR-AUTH-001/005 | UC-01/UC-02 | — |
| PG-002 | LoginPage | FR-AUTH-002/003/005 | UC-03 | User, AccountTakeoverCheck |
| PG-004/005 | RegularRegistrationFlow / BetaAccessFeature | FR-REG-002/003/004 / FR-AUTH-005 / FR-ADMIN-011 | UC-01 | User, RegularProfile, Child, JourneyContext, LegalConsent, BetaInvite |
| PG-006/007 | ProfessionalRegistrationFlow | FR-PROREG-001/002/003 | UC-02 | User, ProfessionalProfile, LegalConsent |
| PG-008 | FeedFeature / PostShareFeature / PersonalizationSignalFeature / RuleBasedRecommendationEngine | FR-FEED-001..007 / FR-ALG-001..004 / FR-ALG-009 | UC-04/36/37/40 | Post (כולל שיתופים), Comment, Reaction, Group, Friendship, ProfessionalFollow, PersonalizationProfile, ContentImpression, RecommendationFeedback, ContentMetadata, AlgorithmConfiguration |
| PG-009 | HomeTrackingFeature | FR-HOME-001..004 | UC-05/06 | JourneyContext, TrackerEvent, Article |
| PG-010/019 | MarketplaceFeature / MarketplacePromotionFeature / MarketplaceDetailPage / RuleBasedRecommendationEngine | FR-MKT-001..005 / FR-ALG-006/007 | UC-07/39 | MarketplaceListing, SponsoredProduct, Promotion, MediaAsset, PromotionPerformanceEvent, ContentImpression, AnalyticsEvent |
| PG-011/013 | ServicesDirectoryFeature / ProfessionalProfilePage / RuleBasedRecommendationEngine / ProfessionalReviewFeature / ProfessionalArticleFeature | FR-SERV-001..003 / FR-SERV-011 / FR-PRO-003 / FR-ALG-005 | UC-08/38 | ProfessionalProfile, ServiceCategory, PersonalizationProfile, AnalyticsEvent, ProfessionalReview, ProfessionalArticle |
| PG-014/015/016 | MessagingFeature / ProfessionalOutreachFeature | FR-SERV-004..010 / FR-CHAT-001..004 | UC-09/25/30/31 | Conversation, Message, RegularChatRequest, ProfessionalOutreachRequest, Friendship, MarketplaceListing, ChatBlock, SupportRequest |
| PG-012 | UserProfilePage / ProfileEditingFeature / JourneyManagementFeature | FR-PROFILE-001/002 / FR-PRIV-001 / FR-REL-001 | UC-10/20 | User, RegularProfile, Child, JourneyContext, PrivacyPreference, Friendship, ProfileOpenCount, SecurityConfiguration, SecurityEvent |
| PG-017 | SearchFeature / AnalyticsEventFeature | FR-SEARCH-001 / FR-PRIV-001 / FR-ALG-008 | UC-19/33 | Post, User/Profiles, PrivacyPreference, Group/Membership, SearchEvent, AnalyticsEvent |
| PG-018 | NotificationsFeature / GroupsFeature | FR-NOTIF-001 / FR-ALG-010 | UC-24 | Notification, NotificationPreference, GroupNotificationPreference, AnalyticsEvent |
| PG-022 | ProfessionalDashboardFeature / ProfessionalPromotionFeature | FR-PRO-001/002 / FR-ALG-007 | UC-11/42 | ProfessionalProfile, Post, Promotion, PromotionPerformanceEvent, AnalyticsAggregate |
| PG-021/023 | TrackerPage / BreastfeedingTrackerPage / TrackerFeature | FR-HOME-003 / FR-TRACK-001/002 | UC-06/14 | TrackerEvent, TrackerData |
| PG-024/025/026 | SupportRequestFeature / SupportInboxFeature / AdminAnalyticsFeature / AdminIntelligenceFeature | FR-ADMIN-001..003/010 / FR-CHAT-004 / FR-DATA-001 | UC-12/13/31/41 | SupportRequest, Conversation/Message, AnalyticsEvent, AnalyticsAggregate, ModeratorPermission, AuditLogEntry, AlgorithmConfiguration |
| Multiple / ReportAction | ModerationFeature | FR-MOD-001 | UC-26 | Report |
| PG-027 | AdminAccessControlPage / ModeratorPermissionsFeature | FR-ADMIN-004 | UC-15 | User, ModeratorPermission, AuditLogEntry |
| PG-028 | AdminUserManagementPage / UserManagementFeature | FR-MOD-002 | UC-16 | User, AccountEnforcement, AuditLogEntry |
| PG-029 | AdminAuditLogPage / AuditLogFeature | FR-ADMIN-005 | UC-17 | AuditLogEntry |
| PG-030 | ProfessionalVerificationAdminPage / ProfessionalVerificationAdminFeature | FR-ADMIN-006 | UC-18 | ProfessionalProfile, AuditLogEntry |
| PG-031 | AdminCommunitySettingsPage / CommunityAdministrationFeature | FR-ADMIN-007 | UC-28 | CommunityConfiguration, AuditLogEntry |
| PG-032 | AdminAnnouncementsPage / SystemAnnouncementsFeature | FR-ADMIN-008 | UC-29 | SystemAnnouncement, AuditLogEntry |
| PG-033/034/035 | GroupsFeature / GroupManagementFeature | FR-GRP-001..004 | UC-22/23/32 | Group, Membership, GroupJoinRequest, GroupInvitation, GroupRoleAssignment, GroupMemberEnforcement, GroupNotificationPreference |
| PG-036 | FriendsPage / FriendsFeature | FR-REL-001 / FR-PRIV-001 / FR-MENU-001 | UC-20 | Friendship, FriendContentNotificationPreference, ProfileOpenCount |
| Multiple / ProfessionalProfile | ProfessionalFollowFeature | FR-FOLLOW-001 | UC-21 | ProfessionalFollow, ProfessionalProfile |
| Global AppShell | TopBar / SideMenuFeature | FR-TOP-001 / FR-MENU-001 | — | Role, ModeratorPermission, Notification counts |
| PG-018 + Settings | NotificationsFeature / NotificationSettingsFeature | FR-NOTIF-001..003 | UC-24 | Notification, NotificationPreference, GroupNotificationPreference, ChildBirthdayVisibility |
| Global Routing | Authentication / RouteGuard | FR-AUTH-004 | — | User / Session |
| PG-003 | AccountTypeSelectionPage | FR-REG-001 | UC-01/02 | — |
| PG-020 | ArticlePage / ContextualContentFeature | FR-HOME-004 | — | Article / Tip |
| PG-037 | AdminModerationPage / ModerationFeature | FR-MOD-003 | UC-27 | Report, AuditLogEntry |
| PG-038 | SettingsPage / SettingsFeature | FR-SET-001 / FR-PRIV-001 / FR-NOTIF-002 / FR-MENU-001 | UC-33/24 | PrivacyPreference, ChildBirthdayVisibility, NotificationPreference |
| PG-039 | FollowingProfessionalsPage / ProfessionalFollowFeature | FR-FOLLOW-001 | UC-21 | ProfessionalFollow |
| PG-040 | ProfessionalVerificationStatusPage / ProfessionalVerificationFeature | FR-PROREG-003 | UC-02 | ProfessionalProfile |
| PG-041/042 | ProfessionalPromotionFeature / ProfessionalPromotionPage / PromotionAnalyticsPage / BillingPromotionsPage | FR-SERV-010 / FR-PRO-002 / FR-ALG-007 | UC-34/42 | Promotion, ProfessionalPromotionMetric, PromotionPerformanceEvent, AnalyticsAggregate |
| PG-043 | CreateGroupPage / GroupsFeature | FR-GRP-004 | UC-32 | Group, Membership, GroupRoleAssignment |
| PG-044 | AdminSponsoredProductsPage / SponsoredProductManagementFeature | FR-ADMIN-009 / FR-MKT-003/005 | UC-35 | SponsoredProduct, MediaAsset, AuditLogEntry |
| PG-045 | AdminBetaInvitesPage / BetaAccessFeature | FR-ADMIN-011 | — | BetaInvite, AuditLogEntry |
| PG-046 | AdminContentPage / SystemContentFeature | FR-ADMIN-012 / FR-HOME-004 | — | Article, AuditLogEntry |
| PG-047 | MedicalHotlinesPage | FR-MENU-002 | — | — |
| PG-048 | StoryViewerPage / StoryFeature | FR-FEED-008 | — | Story, MediaAsset |
| PG-049 | CommunityRulesPage | FR-MOD-001 | — | — |
| PG-050 | AccountDeletionFeature | FR-SET-002 | — | User, AuditLogEntry |
| PG-051 | PasswordRecoveryPage / PasswordRecoveryFeature | FR-AUTH-003/004 | UC-03 | User, RecoveryAnswers, RecoveryThrottle, RecoveryEvent |
| PG-052 | RecoveryQuestionsPage / PasswordRecoveryFeature | FR-AUTH-003 / FR-REG-004 / FR-MENU-001 | UC-01 | User, RecoveryAnswers, RecoveryEvent |
| PG-053 | SetNewPasswordPage / ForcedPasswordFeature | FR-AUTH-005 | — | User, AccountTakeoverCheck, RecoveryAnswers, RecoveryEvent |
| PG-054 | ChangePasswordPage / PasswordChangeFeature | FR-AUTH-003 / FR-MENU-001 | — | User, RecoveryAnswers, RecoveryThrottle, RecoveryEvent |
