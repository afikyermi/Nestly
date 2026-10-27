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
| PG-057 | מסך בקשות העזרה / הצעת עזרה (מלוח הבקרה ומהתפריט של Professional) | FR-SERV-005 / FR-SERV-008 / FR-PRO-001 | UC-25 | Post, ProfessionalProfile (התחום), ProfessionalOutreachRequest; AC-148, AC-169, AC-171 |
| PG-058 | מסך בית הצוות / בית הניהול / העבודה שלי / מגמות נתוני ילדים | FR-ADMIN-014 / FR-ADMIN-015 / FR-ADMIN-005 / FR-MOD-003 / BR-084 | UC-15/27 | Report, ReportEscalation, ReportOpening, TrackerEvent (מגמות בלבד), AuditLogEntry, AccountDeletionEvent (מספרים בלבד); AC-152–AC-158, AC-184 |
| PG-041/042 | מסך הקידום המקצועי / מסך חיובים וקידומים (I13: קידום, תוצאות, תשלומים מדומים) | FR-PRO-002 / FR-SERV-010 | UC-42 | Promotion, PromotionPerformanceEvent |
| PG-059 | מסך הקידומים בניהול (I13) | FR-SERV-010 / FR-MKT-004 / FR-ALG-007 / BR-083 | UC-42 | Promotion, AuditLogEntry, AlgorithmConfiguration |
| PG-009 | מעקב בעמוד הבית | FR-HOME-001..004, FR-ALG-004 | UC-05/06 | JourneyContext, Child, TrackerEvent, CycleEntry, Article |
| PG-010/019 | ניהול ה-Marketplace (רשימה, "המודעות שלי", מודעה חדשה ועריכה) / קידום מודעת Marketplace / מסך פריט Marketplace (פנייה בצ'אט, דיווח) / מנוע ההמלצות מבוסס הכללים | FR-MKT-001..005 / FR-ALG-006/007/008 / FR-CHAT-002 / FR-MOD-001 | UC-07/39 | MarketplaceListing, SponsoredProduct, Promotion, MediaAsset, Conversation (Marketplace), Report, IntentSignal, PromotionPerformanceEvent, ContentImpression, AnalyticsEvent |
| PG-011/013 | מדריך נותני השירות / מסך פרופיל מקצועי / מנוע ההמלצות מבוסס הכללים / ביקורות על בעל מקצוע / מאמרים מקצועיים | FR-SERV-001..003 / FR-SERV-011 / FR-PRO-003 / FR-ALG-005 | UC-08/38 | ProfessionalProfile, ServiceCategory, PersonalizationProfile, AnalyticsEvent, ProfessionalReview, ProfessionalArticle |
| PG-014/015/016 | ניהול השיחות / פנייה יזומה של בעל מקצוע | FR-SERV-004..010 / FR-CHAT-001..004 | UC-09/25/30/31 | Conversation, Message, RegularChatRequest, ProfessionalOutreachRequest, Friendship, MarketplaceListing, ChatBlock, SupportRequest, Report (דיווח על הודעה, FR-MOD-001) |
| PG-012 | מסך פרופיל משתמש / עריכת פרופיל / ניהול מסלולי המסע / פעולת דיווח | FR-PROFILE-001/002 / FR-PRIV-001 / FR-REL-001 / FR-MOD-001 | UC-10/20/26 | User, RegularProfile, Child, JourneyContext, PrivacyPreference, Friendship, ProfileOpenCount, SecurityConfiguration, SecurityEvent, Report |
| Multiple / UserBlock | חסימת משתמש | FR-REL-002 | — | UserBlock, Friendship |
| PG-017 | חיפוש גלובלי / רישום אירועי שימוש | FR-SEARCH-001 / FR-PRIV-001 / FR-ALG-008 | UC-19/33 | Post, User/Profiles, ProfessionalProfile, PrivacyPreference, Group/Membership, SearchEvent, AnalyticsEvent |
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
| PG-033/034/035 | ניהול הקבוצות / ניהול קבוצה | FR-GRP-001..004 | UC-22/23/32 | Group, Membership, GroupJoinRequest, GroupInvitation, GroupRoleAssignment, GroupMemberEnforcement, GroupHighlight, GroupNotificationPreference; AC-036–038, AC-050, AC-056, AC-066, AC-144, AC-145, AC-164–AC-168, AC-185 |
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
| PG-050 | מחיקת חשבון — החשבון מתוזמן למחיקה | FR-SET-002 / FR-AUTH-002 | — | User, AccountDeletionEvent; AC-108, AC-183 |
| PG-060 | מסך ההגדרות / מחיקת חשבון | FR-SET-002 / FR-SET-001 / BR-073 / BR-084 | — | User, AccountDeletionEvent; AC-108, AC-175–AC-183, AC-188–AC-191 |
| PG-061 | תנאי השימוש / מדיניות הפרטיות / הצהרת הנגישות | FR-REG-004 / FR-SET-001 / BR-078 / NFR-A11Y-001 / NFR-DATA-001 | UC-01 | LegalConsent; AC-186, AC-187 |
| PG-051 | מסך שחזור סיסמה / שחזור סיסמה | FR-AUTH-003/004 | UC-03 | User, RecoveryAnswers, RecoveryThrottle, RecoveryEvent |
| PG-052 | מסך שאלות לשחזור סיסמה / שחזור סיסמה | FR-AUTH-003 / FR-REG-004 / FR-MENU-001 | UC-01 | User, RecoveryAnswers, RecoveryEvent |
| PG-053 | מסך קביעת סיסמה חדשה / קביעת סיסמה חדשה בכפייה | FR-AUTH-005 | — | User, AccountTakeoverCheck, RecoveryAnswers, RecoveryEvent |
| PG-054 | מסך החלפת סיסמה / החלפת סיסמה | FR-AUTH-003 / FR-MENU-001 | — | User, RecoveryAnswers, RecoveryThrottle, RecoveryEvent |

## 17.1 סטטוס בנייה

שורה אחת לכל FR ו-NFR, לפי סדר הסעיפים. Built — נבנה; Partial — נבנה בחלקו, וההערה אומרת מה חסר; Planned — לא נבנה עדיין; Removed — בוטל או נדחה, והמזהה נשמר לרציפות.

| FR / NFR | סטטוס | Initiative | הערה |
|---|---|---|---|
| FR-AUTH-001 | Built | I1 | מסך הפתיחה עם איור קבוע ושתי פעולות: יצירת חשבון וכניסה לחשבון קיים |
| FR-AUTH-002 | Built | I1 | אימייל וסיסמה או Google, בלי אימות אימייל |
| FR-AUTH-003 | Built | I1, I2 | שחזור בשתי שאלות אבטחה בתוך המערכת, מדרג נעילה; החלפת סיסמה מהתפריט |
| FR-AUTH-004 | Built | I1 | אורח רואה רק פתיחה, התחברות, הרשמה, שחזור והמסמכים הציבוריים; כל נתיב אחר מוגן |
| FR-AUTH-005 | Built | I1 | "המשך עם Google" בפתיחה, בהתחברות ובהרשמה; האימייל בלבד, השלמת הרשמה מלאה |
| FR-REG-001 | Built | I1, I11 | "חשבון אישי" ו"חשבון מקצועי", מעבר בקישור מהשלב הראשון; סוג החשבון קבוע |
| FR-REG-002 | Built | I1 | שלב במסע בבחירה מרובה, שם ומין לא חובה, פרטי ילד והריון לפי הבחירה |
| FR-REG-003 | Built | I1 | "הוספת ילד נוסף", עד 10 ילדים |
| FR-REG-004 | Built | I1, I9 חלק 2 | הגרסה שנשמרת באישור היא תאריך העדכון של המסמך |
| FR-PROREG-001 | Built | I11 | שם, שם עסק, מין, תחום מרשימה או חופשי, ניסיון, אזור, מחיר ותיאור; בלי מספר עוסק |
| FR-PROREG-002 | Built | I11 | אימייל וסיסמה, אישור התנאים והצהרת ההכשרה והרישיון |
| FR-PROREG-003 | Removed | — | בוטל (OP-005, 18.10.2026): אין אימות מקצועי |
| FR-FEED-001 | Built | I3, I10 ג' (22.10) | Highlights של קבוצות ויחידת קבוצות פעילות |
| FR-FEED-002 | Built | I3, I5 | קהל "כולם" או "חברים בלבד" שנזכר, תגית שלב לא חובה, עד 4 תמונות; פוסט בקבוצה |
| FR-FEED-003 | Built | I3 | לייק אחד, תגובה ותשובה ברמה אחת, מונים בלי רשימת מי סימן; תגובות בתוך הכרטיס |
| FR-FEED-004 | Built | I3 | השלב משפיע על הדירוג ואינו מסנן; שלב הפוסט רק מהתגית שהכותב בחר |
| FR-FEED-005 | Built | I3 | פרסום אנונימי בפיד ובקבוצה, תמיד "כולם"; הזהות נחשפת לצוות רק בדיווח פתוח |
| FR-FEED-006 | Built | I3 | שיתוף בפיד עם טקסט וקהל, הפוסט המקורי בתוך הכרטיס |
| FR-FEED-007 | Built | I3 | וואטסאפ, אימייל, העתקת קישור וחלון השיתוף של המכשיר; קישור נפתח רק למחובר ומורשה |
| FR-FEED-008 | Built | I5 | תמונה אחת וטקסט קצר, נמחק אחרי 24 שעות, עד 10 ביממה |
| FR-HOME-001 | Built | I6 | כרטיס לכל מסלול: הריון לפי שבוע, ילד לפי גיל, תכנון, מחזור וביוץ |
| FR-HOME-002 | Built | I6 | ילד והריון נוספים בפרופיל; מסלול מחזור וביוץ נוצר עם המחזור הראשון |
| FR-HOME-003 | Built | I6 | רשת שמונת ה-Trackers בבית, כל אריח פותח את העמוד שלו |
| FR-HOME-004 | Built | I6 | מדריכים לפי שלב עם "המידע אינו מחליף ייעוץ רפואי"; נתוני Tracker אינם משמשים (VAL-034) |
| FR-TRACK-001 | Built | I6 | עמוד לכל Tracker: זמן, ילד, ערך עיקרי והערה, היסטוריה; חלון הביוץ לפי ⭐ OP-041 |
| FR-TRACK-002 | Built | I6 | תיעוד הנקה: צד, התחלה וסוף, הערה |
| FR-MKT-001 | Built | I12, I12 ב' (26.10) | "חנות" ל-Professional מהתפריט, צפייה ופנייה בלבד (AC-205); מודעה שנמכרה לא מוצגת; קופוני הדגמה "ממומן" בלי "דוגמה" (תוכן, בשלב הסופי) |
| FR-MKT-002 | Built | I12, I12 ב' (26.10) | "מכשירי חשמל", תיאור עד 1,000, מחיר 0–100,000 (0 = "למסירה"); נמכר — נשמר, ולא חוזר למכירה אחרי 60 יום; פג — נמחק (עבודת השמירה היומית, מופעלת עם שאר עבודות השמירה; ⭐ OP-082) |
| FR-MKT-003 | Built | I12 | מוצר ממומן באזור נפרד, במסגרת צבועה, "ממומן" ו"מטעם …"; מודעה מקודמת — FR-MKT-004 |
| FR-MKT-004 | Built | I13 | קידום מודעה מ"המודעות שלי", בראש התוצאות התואמות, "מודעה מקודמת" |
| FR-MKT-005 | Built | I12, I12 ב' (26.10) | התיאור בדף המודעה ולצוות שבודק דיווח |
| FR-SERV-001 | Built | I11 | מדריך "יועצים"; כרטיס עם שם, עסק, תחום, ניסיון, אזור, מחיר ודירוג; מושעה וחסום לא מוצגים |
| FR-SERV-002 | Built | I11 | סינון לפי תחום, אזור, דירוג, מחיר וניסיון; מיון "הכי מתאימים", דירוג, מחיר, ניסיון |
| FR-SERV-003 | Built | I11, השלמת I11 ג' | הדירוג בספרה אחת מעל כוכבים ברבעים, גם בכרטיסים |
| FR-SERV-004 | Built | I11 | הורה פותח שיחה עם בעל מקצוע מהעמוד המקצועי, בלי אישור מראש |
| FR-SERV-005 | Built | I11, השלמת I11 ג' | הצעת עזרה על כל פוסט שבעל המקצוע רשאי לראות, מהכרטיס, מעמוד הפוסט ומ"בקשות עזרה" לפי תחום; בלי סימון "מבקש עזרה" |
| FR-SERV-006 | Built | I11 | אישור, דחייה או התעלמות מהצעת עזרה |
| FR-SERV-007 | Built | I8, I11 | שיחה פתוחה — הודעות בלי הגבלת מספר |
| FR-SERV-008 | Built | I11, השלמת I11 ג' | אחת לכל פוסט, עד 100 ב-24 שעות |
| FR-SERV-009 | Built | I8 | חסימת צ'אט וביטולה, נפרדת מחסימת משתמש; דיווח על הודעה |
| FR-SERV-010 | Built | I13 | קידום פרופיל ופוסט, תשלום מדומה, עצירה על ידי הבעלים או הצוות (בלי החזר) |
| FR-SERV-011 | Built | I11, השלמת I11 ג' | ביקורת אחת להורה לכל בעל מקצוע, עריכה ("נערכה") ומחיקה בידי הכותב |
| FR-CHAT-001 | Built | I8 | אייקון שיחות עם מונה, חלונית השיחות האחרונות ו"כל ההודעות"; אישורי קריאה |
| FR-CHAT-002 | Built | I8 | פתיחת שיחה לפי הקשר: Friends, בעל מקצוע, מודעה, בקשת שיחה |
| FR-CHAT-003 | Built | I8 | בקשת שיחה בין הורים שאינם Friends: אישור או דחייה |
| FR-CHAT-004 | Built | I8 | תשובת התמיכה בשיחות תחת "Support", שרשור לכל פנייה |
| FR-REL-001 | Built | I2 | בקשת חברות, אישור, דחייה, ביטול והסרה; מסך החברים |
| FR-REL-002 | Built | I4 | חסימה הדדית: פוסטים, תגובות ופרופיל מוסתרים, החברות מסתיימת; פוסט אנונימי נשאר גלוי |
| FR-FOLLOW-001 | Built | I11 | מעקב אחר בעל מקצוע והפסקתו; רשימת "בעלי מקצוע במעקב" |
| FR-GRP-001 | Built | I10, השלמת I10 ג' (22.10) | רק Highlights בפיד הראשי של חברי הקבוצה, עם "מתוך"; "כל הפוסטים" / "עיקרי הדברים" |
| FR-GRP-002 | Built | I10, השלמת I10 ג' (22.10) | כל חבר מזמין Friends; בקבוצה פרטית — אישור Owner או Admin |
| FR-GRP-003 | Built | I10, השלמת I10 ג' (22.10) | אזהרה והשתקה, הסרה וחסימה, ביטול חסימה, היסטוריה למנהלים; מנהל מושתק בלי פעולות ניהול, ובמסך שורה שהניהול מושהה ובלי פקדי ניהול (AC-185), חסימה רק כפעולת אכיפה (26.10); כל משתמש רואה את ההיסטוריה שלו ב"על הקבוצה"; אין הסרה רגילה |
| FR-GRP-004 | Built | I10 | ללא שינוי |
| FR-PROFILE-001 | Built | I2, I5 | עריכת שם ומין; תמונת פרופיל עם בדיקה |
| FR-PROFILE-002 | Built | I2 | הוספה ועריכה של ילדים והריון, לידה, סיום הריון, מעבר מתכנון להריון |
| FR-PRIV-001 | Built | I2 | פרופיל פתוח או מוגבל ל-non-Friend; ילדים ונתוני מעקב רק לפי ההגדרות; מגבלת פתיחת פרופילים |
| FR-SET-001 | Built | I2, תיקוני בדיקת ה-SRS (21.10), I9 | ההגדרות לפי סוג החשבון: הורה, בעל מקצוע, צוות; "מחיקת חשבון" ב"חשבון" |
| FR-SET-002 | Partial | I9 חלק 1, I9 §22 | בקשה עם אישור וסיסמה, 30 יום מוסתר, PG-050 וביטול, רשומת המחיקות, מונה ופס אדום ל-Admin, הביצוע ביום 30 והמחיקה של מה שנשמר אחרי 90 יום בבסיס הנתונים; השעיה או חסימה גוברות על המחיקה (BR-085); עותק הטקסט בדיווחים מתרוקן; הריצה היומית מבצעת את המחיקות ומוחקת את פרטי ההתחברות. חסר: הרשאת הריצה היומית בכל סביבה (bootstrap, אפיק) |
| FR-SEARCH-001 | Built | I7, תיקוני בדיקת ה-SRS (21.10), השלמת I10 ג' (22.10) | בעלי מקצוע ב"אנשים", מסומנים, נפתחים בעמוד המקצועי; בין קבוצות שמתאימות באותה מידה — הפעילה קודם (AC-166) |
| FR-NOTIF-001 | Built | I7 | פעמון עם מונה, חלונית ההתראות האחרונות ומסך התראות מלא, קישור ליעד |
| FR-NOTIF-002 | Built | I7, I11, תיקוני בדיקת ה-SRS (21.10) | קטגוריות לפי סוג החשבון, "ימי הולדת" להורה בלבד |
| FR-NOTIF-003 | Built | I7, תיקוני בדיקת ה-SRS (21.10) | התראה על יום הולדת של ילד של Friend |
| FR-TOP-001 | Built | I1, I7, I8 | תפריט, חיפוש, שיחות ופעמון; לצוות — בלי שיחות וחיפוש |
| FR-MENU-001 | Built | I2, I11, השלמת I11 ג', I12 ב' (26.10) | "בקשות עזרה" ו"חנות" (צפייה ופנייה בלבד) בתפריט של Professional |
| FR-MENU-002 | Built | I3 | עמוד חיוג למד"א ולארבע הקופות עם "לא תחליף לטיפול רפואי"; מספר מאוחדת ממתין לאישור |
| FR-PRO-001 | Built | I11, תיקוני בדיקת ה-SRS (21.10), השלמת I11 ג' | הדירוג בלוח הבקרה; "פוסטים בתחום שלך" |
| FR-PRO-002 | Built | I13 | תוצאות 30 יום: אורגני ובתשלום בנפרד, מספרים בלבד |
| FR-PRO-003 | Built | I11 | מאמר בתחום בעמוד המקצועי, עם הערת אחריות; דיווח על מאמר |
| FR-MOD-001 | Built | I3, I11, השלמת I11 ג', I14 (השלמה ב') | ארבע סיבות הביקורת לבעל המקצוע שהביקורת עליו; "אחר" ו-500 תווים בכל דיווח; תגובה והודעה שדווחו — רק הפריט |
| FR-MOD-002 | Built | I4, I14 (השלמה ב'), I9 §22 | היסטוריית האכיפה של תוכן שנמחק; השעיה וחסימה של חשבון שמתוזמן למחיקה (BR-085) |
| FR-MOD-003 | Built | I4, I14 (השלמה ב') | דיווח מוצדק מוחק; הסתרה אחרי 10 דיווחים זהים |
| FR-ADMIN-001 | Built | I8 | פנייה לתמיכה עם נושא ומלל, מהתפריט וממסך השיחות; הפניות שלי |
| FR-ADMIN-002 | Built | I8 | תיבת הפניות לצוות: צפייה, תשובה בשם "Support", סטטוס והערה פנימית לפי ההרשאות |
| FR-ADMIN-003 | Built | I14 | פניות התמיכה במסך הנתונים: מספר, לפי נושא, שנענו וזמן תשובה |
| FR-ADMIN-004 | Built | I14 | הזמנת Moderator בקישור, הקצאה וביטול של הרשאות, השבתה; Admin בלבד, עם Audit |
| FR-ADMIN-005 | Built | I4 | יומן Audit לצפייה בלבד, עם סינון; כולל אירועי שחזור הסיסמה |
| FR-ADMIN-006 | Removed | — | בוטל (OP-005, 18.10.2026): אין אימות מקצועי |
| FR-ADMIN-007 | Partial | I4, I14 | סיבות הדיווח: שם, עדיפות, סדר והשבתה, עם Audit. חסר: ניהול הקטגוריות של השירותים ושל ה-Marketplace — הרשימות קבועות |
| FR-ADMIN-008 | Built | I14 (השלמה ב') | קהל לכל הודעה |
| FR-ADMIN-009 | Built | I12 | מוצרים ממומנים ל-Admin: יצירה, עריכה, תמונות, פרסום והסרה |
| FR-ADMIN-010 | Built | I14, I13, תיקוני בדיקת ה-SRS (21.10), I12 ב' (26.10) | קבוצות, בעלי מקצוע ו-Marketplace במסך הנתונים; שימוש לפי יום (OP-039), ותחום הקידום ל-Admin בלבד (AC-071); גרף המודעות שנמכרו לפי יום (AC-206) |
| FR-ADMIN-011 | Removed | — | נדחה (13.10.2026): ההרשמה פתוחה לכולם |
| FR-ADMIN-012 | Built | I6, I14 (השלמה ב') | פרסום בלי תאריך בדיקת מקורות |
| FR-ADMIN-013 | Removed | — | בוטל (20.10.2026): אין נעילת שחזור קבועה |
| FR-ADMIN-014 | Built | I14 (השלמה א', ב'), I9 | "דורש תשומת לב" בלי הזמנות שעומדות לפוג; מדריכים בטיוטה בלבד; מונה מחיקות חשבון ופס אדום למחיקה שעברה את מועדה |
| FR-ADMIN-015 | Built | I14 (השלמה א', ב') | תקופה קלנדרית, מספרים מעוגלים |
| FR-ALG-001 | Partial | I7 | נושאי החיפוש נשמרים 30 יום ודועכים, ומשפיעים על הפיד, המדריך וה-Marketplace. פרופיל עניין מאותות נוספים — אחרי ההשקה (I15) |
| FR-ALG-002 | Partial | I3, I7 | דירוג לפי עדכניות, Friend, איכות, שלב ונושאי חיפוש, גיוון ותצורה עם גרסה. רכיב Group/Follow בציון ופרופיל עניין — אחרי ההשקה (I15) |
| FR-ALG-003 | Partial | I3, I11 | פיד תוכן לבעל מקצוע: עדכניות, איכות ובעלי מקצוע במעקב, בלי Friend ושלב. חסר: התאמה לתחום המקצועי ול-Groups בדירוג |
| FR-ALG-004 | Partial | I6 | מדריכים לפי שלב (שבוע הריון, גיל ילד, תכנון). הכוונה לפי נתוני Tracker — אחרי ההשקה (I15) |
| FR-ALG-005 | Built | I11 | "הכי מתאימים": נושאי חיפוש, דירוג, שלמות פרופיל ועדכניות; קידום בתשלום מחוץ לציון |
| FR-ALG-006 | Built | I12 | התאמה לנושאי החיפוש ועדכניות, סינון לפי עיר וקטגוריה; ממומן ומקודם בנפרד |
| FR-ALG-007 | Built | I13 | התאמה לפי נושאי חיפוש, דירוג בין הממומנים, מגבלת תדירות, שילוב בפיד כברירת מחדל כל 4–7 פוסטים (טווח וספים ניתנים לשינוי בידי Admin, אפיק 23.10.2026), סימון "ממומן"; התאמה לשלב נדחית בהחלטת אפיק מ-23.10.2026 |
| FR-ALG-008 | Built | I7 | התאמה מדויקת, תחילית ומילה אחרי סינון ההרשאות, ואז החדש קודם; בלי חיפוש סמנטי |
| FR-ALG-009 | Partial | I3 | גיוון לפי יוצר ופוסטים אנונימיים; הסתרת פוסט מהמשתמש בלבד. מקום ל-Exploration — אחרי ההשקה (I15) |
| FR-ALG-010 | Built | I10, השלמת I10 ג' (22.10) | סף 5% מהחברים (3 עד 20), נספר לפי אנשים שונים (26.10); חשיפת קבוצות פעילות בחיפוש, ב-Discovery ובפיד |
| FR-DATA-001 | Partial | I13 | נספרים ליום: כניסה, צפייה בפרופיל ובפוסט של בעל מקצוע, ואירועי הקידום. טקסונומיית אירועים מלאה — אחרי ההשקה (I15) |
| NFR-SEC-001 | Built | I1 | סיסמאות בשירות ה-Auth; תשובות השחזור נשמרות כ-hash |
| NFR-SEC-002 | Built | כל ה-Initiatives | הרשאות לפי תפקיד והרשאה בבסיס הנתונים ובשרת; Moderator — רק מה שהוקצה |
| NFR-SEC-003 | Planned | — | חל רק כשייבחר ספק סליקה; עד אז התשלום מדומה (NFR-SEC-007) |
| NFR-PRIV-001 | Built | I2, I6 | פרטים, ילדים ונתוני מסע לפי הגדרות הפרטיות וההרשאות |
| NFR-PERF-001 | Planned | — | יעד שנמדד לפני ההשקה; עד אז נמדדים זמני התגובה של השרת |
| NFR-LOAD-001 | Planned | — | בדיקת עומס לפני ההשקה |
| NFR-AVAIL-001 | Planned | — | יעד לפני ההשקה, על התוכניות בתשלום |
| NFR-USE-001 | Built | I1 | Mobile-first; מ-1024px עמודה ממורכזת וניווט אנכי בצד |
| NFR-A11Y-001 | Partial | כל ה-Initiatives, I9 חלק 2 | בדיקות axe ומקלדת במסכים; הצהרת נגישות; פרטי רכז הנגישות — OP-078 |
| NFR-COMP-001 | Built | כל ה-Initiatives | הבדיקות רצות ב-Chrome וב-Edge; Safari ב-iOS — מאמץ סביר |
| NFR-AUDIT-001 | Partial | I4, I14, I9 | כל פעולה ניהולית נרשמת, לקריאה בלבד. חסר: המחיקה לפי תקופות השמירה (12 חודשים, 90 יום) עד שהריצה היומית מופעלת בכל סביבה |
| NFR-QA-001 | Built | I1 | הבדיקות בסביבה נפרדת, בלי שינוי בהתנהגות Production |
| NFR-DATA-001 | Partial | I9 חלק 2 | תנאים ומדיניות פרטיות נכתבו; הסעיפים המשפטיים ואישור מחדש — OP-078 |
| NFR-MEDIA-001 | Built | I5, I14 (השלמה ב') | רשימת חסימה בהעלאה |
| NFR-SEC-004 | Built | I4, I14 | פעולות Admin בלבד נבדקות בשרת ובבסיס הנתונים בכל קריאה |
| NFR-SEC-005 | Built | I7, I8 | קישור מחיפוש, מהתראה ומשיחה נבדק מחדש בפתיחה |
| NFR-PRIV-002 | Built | I10, I14 | תוכן קבוצה פרטית רק לחבר; גישת Moderator עם PRIVATE_GROUP_MODERATE נרשמת ב-Audit |
| NFR-PRIV-003 | Built | I7 | התראת יום הולדת רק כשההורה התיר |
| NFR-USAB-002 | Built | I1, I7, I8 | Top Bar, חלוניות החיפוש, ההתראות והשיחות והתפריט — אחידים בכל המסכים |
| NFR-USAB-003 | Built | כל ה-Initiatives | ניסוח ניטרלי מגדרית בכל הממשק |
| NFR-USAB-004 | Built | כל ה-Initiatives | השפה החזותית ודפוסי האינטראקציה; פעולות במקום |
| NFR-USAB-005 | Built | I14 (השלמה ב') | זמן יחסי בכל פרסום |
| NFR-ALG-001 | Partial | I3, I10, I13 | בלי ML; משקלות הפיד, סף ה-Highlights והגדרות הקידום בתצורה עם גרסה. חסר: משקלות הסדר במדריך בעלי המקצוע וב-Marketplace קבועים |
| NFR-ALG-002 | Built | I3, I7, I13 | הרשאות, חסימות, קבוצות ומצב התוכן לפני הדירוג; קידום לא עוקף הרשאה |
| NFR-ALG-003 | Built | I13 | אורגני ובתשלום נמדדים ומוצגים בנפרד; תשלום לא משנה דירוג ומוניטין |
| NFR-DATA-002 | Partial | I13 | אירועי השימוש נספרים ליום ואינם חוסמים פעולה. חסר: מזהה אירוע וזיהוי כפילויות — עם טקסונומיית האירועים (I15) |
| NFR-DATA-003 | Built | I13 | אירועי השימוש שומרים סוג, יום ומספר בלבד |
| NFR-PRIV-004 | Built | I8 | תוכן שיחות ותמיכה אינו משמש להתאמה, להמלצה או לקידום |
| NFR-PRIV-005 | Built | I11, I13, I14 | נתוני ילדים ומעקב לא מגיעים לבעל מקצוע, לקידום או ללוחות; לצוות — מגמות בלבד |
| NFR-PRIV-006 | Built | I6 | מדריכים כלליים, בלי אבחון, עם "המידע אינו מחליף ייעוץ רפואי" |
| NFR-PRIV-007 | Built | I3 | תצוגה מקדימה כללית של Nestly בלי שם, טקסט ותמונה; התוכן רק למחובר ומורשה |
| NFR-OBS-001 | Partial | I3 | לכל טעינת פיד ידועה גרסת התצורה שדירגה אותו. רישום אירועי המלצה עם גרסה ומשטח — אחרי ההשקה (I15) |
| NFR-SEC-006 | Built | I2, I7, I9 חלק 2 | כל מגבלות הקצב נבדקו: בבסיס הנתונים ובתשובת השרת (429 בלי מספר) |
| NFR-SEC-007 | Built | I13 | ממשק תשלום אחד, מדומה, בלי פרטי כרטיס, "מחיר לדוגמה" |
| NFR-SEC-008 | Planned | I9 חלק 3 | בדיקת האדם בהרשמה (Turnstile) — לא נבנתה. לפני הזמנת משתמשים אמיתיים |
| NFR-SEC-009 | Built | I1 | Session באסימונים בלבד; Logout מנקה גם בלי תשובה מהשירות |
| NFR-SEC-010 | Built | I1, I4 | מדרג הנעילה לכל חשבון, נעילה לפי IP, אותה תגובה בכל כשל, Audit |
