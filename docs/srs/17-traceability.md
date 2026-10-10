[← אינדקס ה-SRS](INDEX.md)

# 17. Traceability Matrix

| Page | Page / Feature Owner | FR | Use Case | Data |
|---|---|---|---|---|
| PG-001 | WelcomePage | FR-AUTH-001 | UC-01/UC-02 | — |
| PG-002 | LoginPage | FR-AUTH-002/003 | UC-03 | User |
| PG-004/005 | RegularRegistrationFlow | FR-REG-002/003/004 | UC-01 | User, RegularProfile, Child, JourneyContext |
| PG-006/007 | ProfessionalRegistrationFlow | FR-PROREG-001/002/003 | UC-02 | User, ProfessionalProfile |
| PG-008 | FeedFeature / PersonalizationSignalFeature / RuleBasedRecommendationEngine | FR-FEED-001..004 / FR-ALG-001..004 / FR-ALG-009 | UC-04/36/37/40 | Post, Comment, Reaction, Group, Friendship, ProfessionalFollow, PersonalizationProfile, ContentImpression, RecommendationFeedback, ContentMetadata, AlgorithmConfiguration |
| PG-009 | HomeTrackingFeature | FR-HOME-001..004 | UC-05/06 | JourneyContext, TrackerEvent, Article |
| PG-010/019 | MarketplaceFeature / MarketplacePromotionFeature / MarketplaceDetailPage / RuleBasedRecommendationEngine | FR-MKT-001..005 / FR-ALG-006/007 | UC-07/39 | MarketplaceListing, SponsoredProduct, Promotion, MediaAsset, PromotionPerformanceEvent, ContentImpression, AnalyticsEvent |
| PG-011/013 | ServicesDirectoryFeature / ProfessionalProfilePage / RuleBasedRecommendationEngine | FR-SERV-001..003 / FR-ALG-005 | UC-08/38 | ProfessionalProfile, ServiceCategory, PersonalizationProfile, AnalyticsEvent |
| PG-014/015/016 | MessagingFeature / ProfessionalOutreachFeature | FR-SERV-004..010 / FR-CHAT-001..004 | UC-09/25/30/31 | Conversation, Message, RegularChatRequest, ProfessionalOutreachRequest, Friendship, MarketplaceListing, ChatBlock, SupportRequest |
| PG-012 | UserProfilePage / ProfileEditingFeature | FR-PROFILE-001/002 | UC-10 | User, Profile, Child, JourneyContext |
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
| PG-036 | FriendsFeature | FR-REL-001 | UC-20 | Friendship, FriendContentNotificationPreference |
| Multiple / ProfessionalProfile | ProfessionalFollowFeature | FR-FOLLOW-001 | UC-21 | ProfessionalFollow, ProfessionalProfile |
| Global AppShell | TopBar / SideMenuFeature | FR-TOP-001 / FR-MENU-001 | — | Role, ModeratorPermission, Notification counts |
| PG-018 + Settings | NotificationsFeature / NotificationSettingsFeature | FR-NOTIF-001..003 | UC-24 | Notification, NotificationPreference, GroupNotificationPreference, ChildBirthdayVisibility |
| Global Routing | Authentication / RouteGuard | FR-AUTH-004 | — | User / Session |
| PG-003 | AccountTypeSelectionPage | FR-REG-001 | UC-01/02 | — |
| PG-020 | ArticlePage / ContextualContentFeature | FR-HOME-004 | — | Article / Tip |
| PG-037 | AdminModerationPage / ModerationFeature | FR-MOD-003 | UC-27 | Report, AuditLogEntry |
| PG-038 | SettingsPage / SettingsFeature | FR-SET-001 / FR-PRIV-001 / FR-NOTIF-002 | UC-33/24 | PrivacyPreference, NotificationPreference |
| PG-039 | FollowingProfessionalsPage / ProfessionalFollowFeature | FR-FOLLOW-001 | UC-21 | ProfessionalFollow |
| PG-040 | ProfessionalVerificationStatusPage / ProfessionalVerificationFeature | FR-PROREG-003 | UC-02 | ProfessionalProfile |
| PG-041/042 | ProfessionalPromotionFeature / ProfessionalPromotionPage / PromotionAnalyticsPage / BillingPromotionsPage | FR-SERV-010 / FR-PRO-002 / FR-ALG-007 | UC-34/42 | Promotion, ProfessionalPromotionMetric, PromotionPerformanceEvent, AnalyticsAggregate |
| PG-043 | CreateGroupPage / GroupsFeature | FR-GRP-004 | UC-32 | Group, Membership, GroupRoleAssignment |
| PG-044 | AdminSponsoredProductsPage / SponsoredProductManagementFeature | FR-ADMIN-009 / FR-MKT-003/005 | UC-35 | SponsoredProduct, MediaAsset, AuditLogEntry |
