[← אינדקס ה-SRS](INDEX.md)

# 17. Traceability Matrix

| Page | מסך / יכולת אחראית | FR | Use Case | Data |
|---|---|---|---|---|
| PG-001 | מסך Welcome | FR-AUTH-001/005 | UC-01/UC-02 | — |
| PG-002 | מסך Login | FR-AUTH-002/003/005 | UC-03 | User, AccountTakeoverCheck |
| PG-004/005 | תהליך ההרשמה הרגילה / גישה לבטא | FR-REG-002/003/004 / FR-AUTH-005 / FR-ADMIN-011 | UC-01 | User, RegularProfile, Child, JourneyContext, LegalConsent, BetaInvite |
| PG-006/007 | תהליך ההרשמה המקצועית | FR-PROREG-001/002 (FR-PROREG-003 בוטל) | UC-02 | User, ProfessionalProfile, LegalConsent |
| PG-008 | בניית הפיד / יצירת פוסט / תגובות ולייקים לפוסט / שיתוף פוסט / חלון שיתוף קישור / פעולת דיווח / קליטת אותות ההתאמה האישית / מנוע ההמלצות מבוסס הכללים | FR-FEED-001..007 / FR-ALG-001..004 / FR-ALG-009 / FR-MOD-001 | UC-04/26/36/37/40 | Post (כולל שיתופים), Comment, Reaction, PostHide, Report, Group, Friendship, ProfessionalFollow, PersonalizationProfile, ContentImpression, RecommendationFeedback, ContentMetadata, AlgorithmConfiguration |
| PG-055 | עמוד פוסט / תגובות ולייקים לפוסט / שיתוף פוסט / חלון שיתוף קישור / פעולת דיווח | FR-FEED-002/003/005/006/007 / FR-MOD-001 / FR-AUTH-004 | UC-04/26 | Post (כולל שיתופים), Comment, Reaction, Report |
| PG-056 | מסך ההצטרפות לצוות | FR-ADMIN-004 | UC-15 | User, ModeratorInvitation, AuditLogEntry |
| PG-057 | מסך בקשות העזרה / הצעת עזרה (ניווט Professional) | FR-SERV-005 / FR-SERV-008 | UC-25 | Post (מבקש עזרה), ProfessionalOutreachRequest; AC-148 |
| PG-058 | מסך בית הצוות / בית הניהול / העבודה שלי / מגמות נתוני ילדים | FR-ADMIN-014 / FR-ADMIN-015 / FR-ADMIN-005 / FR-MOD-003 | UC-15/27 | Report, ReportEscalation, ReportOpening, TrackerEvent (מגמות בלבד), AuditLogEntry; AC-152–AC-158 |
| PG-041/042 | מסך הקידום המקצועי / מסך חיובים וקידומים (עד I13: "עוד לא זמין") | FR-PRO-002 / FR-SERV-010 | UC-42 | — |
| PG-009 | מעקב בעמוד הבית | FR-HOME-001..004, FR-ALG-004 | UC-05/06 | JourneyContext, Child, TrackerEvent, CycleEntry, Article |
| PG-010/019 | ניהול ה-Marketplace (רשימה, "המודעות שלי", מודעה חדשה ועריכה) / קידום מודעת Marketplace / מסך פריט Marketplace (פנייה בצ'אט, דיווח) / מנוע ההמלצות מבוסס הכללים | FR-MKT-001..005 / FR-ALG-006/007/008 / FR-CHAT-002 / FR-MOD-001 | UC-07/39 | MarketplaceListing, SponsoredProduct, Promotion, MediaAsset, Conversation (Marketplace), Report, IntentSignal, PromotionPerformanceEvent, ContentImpression, AnalyticsEvent |
| PG-011/013 | מדריך נותני השירות / מסך פרופיל מקצועי / מנוע ההמלצות מבוסס הכללים / ביקורות על בעל מקצוע / מאמרים מקצועיים | FR-SERV-001..003 / FR-SERV-011 / FR-PRO-003 / FR-ALG-005 | UC-08/38 | ProfessionalProfile, ServiceCategory, PersonalizationProfile, AnalyticsEvent, ProfessionalReview, ProfessionalArticle |
| PG-014/015/016 | ניהול השיחות / פנייה יזומה של בעל מקצוע | FR-SERV-004..010 / FR-CHAT-001..004 | UC-09/25/30/31 | Conversation, Message, RegularChatRequest, ProfessionalOutreachRequest, Friendship, MarketplaceListing, ChatBlock, SupportRequest, Report (דיווח על הודעה, FR-MOD-001) |
| PG-012 | מסך פרופיל משתמש / עריכת פרופיל / ניהול מסלולי המסע / פעולת דיווח | FR-PROFILE-001/002 / FR-PRIV-001 / FR-REL-001 / FR-MOD-001 | UC-10/20/26 | User, RegularProfile, Child, JourneyContext, PrivacyPreference, Friendship, ProfileOpenCount, SecurityConfiguration, SecurityEvent, Report |
| Multiple / UserBlock | חסימת משתמש | FR-REL-002 | — | UserBlock, Friendship |
| PG-017 | חיפוש גלובלי / רישום אירועי שימוש | FR-SEARCH-001 / FR-PRIV-001 / FR-ALG-008 | UC-19/33 | Post, User/Profiles, PrivacyPreference, Group/Membership, SearchEvent, AnalyticsEvent |
| PG-018 | מרכז ההתראות / ניהול הקבוצות | FR-NOTIF-001 / FR-ALG-010 | UC-24 | Notification, NotificationPreference, GroupNotificationPreference, AnalyticsEvent; התראות בעל מקצוע וסיכום עוקבים שבועי — AC-149 |
| PG-022 | נתוני לוח הבקרה המקצועי / קידום מקצועי | FR-PRO-001/002 / FR-ALG-007 | UC-11/42 | ProfessionalProfile, Post, Promotion, PromotionPerformanceEvent, AnalyticsAggregate; לוח הבקרה בסדר של אפיק (21.10.2026): "מחכה לך", בקשות עזרה, מדדים, השלמת פרופיל, תוצאות תוכן, קידום — AC-018 |
| PG-021/023 | מסך Tracker / מסך מעקב הנקה / ניהול Tracker, כולל מחזור וביוץ | FR-HOME-003 / FR-TRACK-001/002 | UC-06/14 | TrackerEvent, CycleEntry, TrackerData |
| PG-024/025/026 | שליחת פנייה ל-Support / טיפול בתיבת הפניות / תצוגת ה-Analytics לניהול / חישוב נתוני הניהול | FR-ADMIN-001..003/010 / FR-CHAT-004 / FR-DATA-001 | UC-12/13/31/41 | SupportRequest, Conversation/Message, AnalyticsEvent, AnalyticsAggregate, ModeratorPermission, AuditLogEntry, AlgorithmConfiguration |
| Multiple / פעולת דיווח | טיפול בדיווחים | FR-MOD-001 | UC-26 | Report, Post, Comment, User, ProfessionalReview, ProfessionalArticle (דיווח על ביקורת ומאמר — AC-150) |
| PG-027 | מסך הרשאות Moderator / ניהול הרשאות Moderator | FR-ADMIN-004 | UC-15 | User, ModeratorPermission, AuditLogEntry |
| PG-028 | מסך ניהול משתמשים / ניהול משתמשים ואכיפה | FR-MOD-002 | UC-16 | User, AccountEnforcement, EnforcementRecord, AuditLogEntry; AC-159 |
| PG-028 | תור אישור התמונות ("תמונות לבדיקה") | BR-076 / BR-077 / FR-MOD-003 / NFR-MEDIA-001 | — | MediaAsset, TrainingSample, ImageFingerprint, AuditLogEntry; AC-162 |
| PG-029 | מסך יומן ה-Audit / יומן ה-Audit | FR-ADMIN-005 | UC-17 | AuditLogEntry |
| PG-030 | ~~מסך תור האימות המקצועי / ניהול אימות מקצועי~~ — **בוטל** (OP-005 נסגר, 18.10.2026) | FR-ADMIN-006 (בוטל) | UC-18 (בוטל) | — |
| PG-031 | מסך הגדרות הקהילה / ניהול הגדרות הקהילה | FR-ADMIN-007 | UC-28 | CommunityConfiguration, AuditLogEntry |
| PG-032 | מסך הודעות מערכת / ניהול הודעות מערכת | FR-ADMIN-008 / VAL-050 | UC-29 | SystemAnnouncement, AuditLogEntry; AC-163 |
| PG-033/034/035 | ניהול הקבוצות / ניהול קבוצה | FR-GRP-001..004 | UC-22/23/32 | Group, Membership, GroupJoinRequest, GroupInvitation, GroupRoleAssignment, GroupMemberEnforcement, GroupNotificationPreference; AC-036–038, AC-050, AC-056, AC-066, AC-144, AC-145 |
| PG-036 | מסך החברים / ניהול חברים | FR-REL-001 / FR-PRIV-001 / FR-MENU-001 | UC-20 | Friendship, FriendContentNotificationPreference, ProfileOpenCount |
| Multiple / ProfessionalProfile | מעקב אחר בעל מקצוע | FR-FOLLOW-001 | UC-21 | ProfessionalFollow, ProfessionalProfile |
| מעטפת האפליקציה (גלובלי) | Top Bar / בניית התפריט הצדדי / חלון שיתוף קישור | FR-TOP-001 / FR-MENU-001 / FR-FEED-007 | — | Role, ModeratorPermission, Notification counts |
| PG-018 + Settings | מרכז ההתראות / הגדרות ההתראות | FR-NOTIF-001..003 | UC-24 | Notification, NotificationPreference, GroupNotificationPreference, ChildBirthdayVisibility |
| Global Routing | Authentication / הגנת נתיבים | FR-AUTH-004 | — | User / Session |
| PG-003 | מסך בחירת סוג חשבון | FR-REG-001 | UC-01/02 | — |
| PG-020 | מסך טיפ / מאמר / תוכן מותאם לשלב | FR-HOME-004 | — | Article / Tip |
| PG-037 | מסך תור הדיווחים / טיפול בדיווחים | FR-MOD-001 / FR-MOD-003 / BR-074 / BR-081 / BR-082 | UC-27 | Report, ReportEscalation, ReportOpening, StaffGroupView, ReportAutoHide, StaffCommentView, EnforcementRecord, AuditLogEntry; AC-155/156/158/159/160/161 |
| PG-038 | מסך ההגדרות / ניהול ההגדרות | FR-SET-001 / FR-PRIV-001 / FR-NOTIF-002 / FR-MENU-001 | UC-33/24 | PrivacyPreference, ChildBirthdayVisibility, NotificationPreference |
| PG-039 | מסך בעלי מקצוע במעקב / מעקב אחר בעל מקצוע | FR-FOLLOW-001 / FR-MENU-001 | UC-21 | ProfessionalFollow (רשימה ב-`/following` עם הפסקת מעקב; מספר העוקבים בלוח הבקרה); AC-035, AC-151 |
| PG-040 | ~~מסך סטטוס האימות המקצועי / אימות מקצועי~~ — **בוטל** (OP-005 נסגר, 18.10.2026) | FR-PROREG-003 (בוטל) | — | — |
| PG-041/042 | קידום מקצועי / מסך הקידום המקצועי / מסך תוצאות הקידום / מסך חיובים וקידומים | FR-SERV-010 / FR-PRO-002 / FR-ALG-007 | UC-34/42 | Promotion, ProfessionalPromotionMetric, PromotionPerformanceEvent, AnalyticsAggregate |
| PG-043 | מסך יצירת קבוצה / ניהול הקבוצות | FR-GRP-004 | UC-32 | Group, Membership, GroupRoleAssignment |
| PG-044 | מסך מוצרים ממומנים / ניהול מוצרים ממומנים · מודעות Marketplace לצוות (הסתרה והחזרה, MARKETPLACE_MODERATE) | FR-ADMIN-009 / FR-MKT-001/003/005 / FR-MOD-003 | UC-35 | SponsoredProduct, MarketplaceListing, MediaAsset, Report, AuditLogEntry |
| PG-045 | מסך מוזמני הבטא / גישה לבטא | FR-ADMIN-011 | — | BetaInvite, AuditLogEntry |
| PG-046 | מסך ניהול מדריכים / ניהול מדריכים | FR-ADMIN-012 / FR-HOME-004 | — | Article, AuditLogEntry |
| PG-047 | מסך מוקדי רפואה | FR-MENU-001/002 | — | — |
| PG-048 | מסך הסטורי / סטורי | FR-FEED-008 / VAL-042 / BR-076 / BR-077 | — | Story, MediaAsset |
| PG-049 | מסך כללי הקהילה | FR-MOD-001 / FR-MENU-001/002 | — | — |
| PG-050 | מחיקת חשבון | FR-SET-002 | — | User, AuditLogEntry |
| PG-051 | מסך שחזור סיסמה / שחזור סיסמה | FR-AUTH-003/004 | UC-03 | User, RecoveryAnswers, RecoveryThrottle, RecoveryEvent |
| PG-052 | מסך שאלות לשחזור סיסמה / שחזור סיסמה | FR-AUTH-003 / FR-REG-004 / FR-MENU-001 | UC-01 | User, RecoveryAnswers, RecoveryEvent |
| PG-053 | מסך קביעת סיסמה חדשה / קביעת סיסמה חדשה בכפייה | FR-AUTH-005 | — | User, AccountTakeoverCheck, RecoveryAnswers, RecoveryEvent |
| PG-054 | מסך החלפת סיסמה / החלפת סיסמה | FR-AUTH-003 / FR-MENU-001 | — | User, RecoveryAnswers, RecoveryThrottle, RecoveryEvent |

## 17.1 סטטוס בנייה

| FR / NFR | סטטוס | Initiative | הערה |
|---|---|---|---|
| FR-MOD-001 | Built | I3, I14 (השלמה ב') | "אחר" ו-500 תווים בכל דיווח; תגובה והודעה שדווחו — רק הפריט |
| FR-MOD-002 | Built | I4, I14 (השלמה ב') | היסטוריית האכיפה של תוכן שנמחק |
| FR-MOD-003 | Built | I4, I14 (השלמה ב') | דיווח מוצדק מוחק; הסתרה אחרי 10 דיווחים זהים |
| FR-ADMIN-008 | Built | I14 (השלמה ב') | קהל לכל הודעה |
| FR-ADMIN-012 | Partial | I6, I14 (השלמה ב') | ביטול חובת תאריך בדיקת המקורות לפני פרסום — עדיין נדרש בפועל |
| FR-ADMIN-014 | Built | I14 (השלמה א', ב') | "דורש תשומת לב" בלי הזמנות שעומדות לפוג; מדריכים בטיוטה בלבד |
| FR-ADMIN-015 | Built | I14 (השלמה א', ב') | תקופה קלנדרית, מספרים מעוגלים |
| NFR-MEDIA-001 | Built | I5, I14 (השלמה ב') | רשימת חסימה בהעלאה |
| NFR-USAB-005 | Built | I14 (השלמה ב') | זמן יחסי בכל פרסום |
