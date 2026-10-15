[← אינדקס ה-SRS](INDEX.md)

# 7. מסכי מערכת וניווט

מסכי PG-001 עד PG-011 נגזרו ישירות מהסקיצות. מסכי PG-012 ואילך הם מסכים תומכים הנדרשים מהקונספט העסקי והחידודים שאושרו, אך לא הופיעו כסקיצה מלאה.

**עיצוב:** השפה החזותית המחייבת נמצאת ב-[`docs/design/`](../design/README.md): כיוון, tokens ומוקאפים (NFR-USAB-004). הסקיצות הן קונספט ([נספח A](appendix-a-sketches.md)). מוקאפים למסכים שעוד לא עוצבו נבנים יחד עם הפיצ'ר שלהם.

| ID | עמוד | Page / Feature Owner | מקור | עיקרי תוכן |
|---|---|---|---|---|
| PG-001 | Welcome / הצטרפות | WelcomePage | [סקיצה 57(3)](../design/sketches/sk-57-3-welcome.jpeg) | איור סטטי, טקסט מתאר, יצירת חשבון חדש, מעבר לחשבון קיים. |
| PG-002 | Login | LoginPage | [סקיצה 57(4)](../design/sketches/sk-57-4-login.jpeg) | אימייל, סיסמה, התחברות, שכחת סיסמה, יצירת חשבון. |
| PG-003 | בחירת סוג חשבון | AccountTypeSelectionPage | נדרש לתהליך | בחירה בין "חשבון אישי" ו"חשבון מקצועי" בכרטיסי בחירה. נכנס יחד עם בעלי המקצוע (§2.5). |
| PG-004 | הרשמה רגילה — שלב 1 | RegularRegistrationPage / RegularRegistrationFlow | [סקיצה 57(2)](../design/sketches/sk-57-2-register-regular.jpeg) | השלב במסע, שם מלא, מין ההורה (לא חובה), פרטי ילד והוספת ילד, ותאריך לידה משוער בהריון (FR-REG-002). |
| PG-005 | הרשמה רגילה — שלב 2 | RegularRegistrationPage / RegularRegistrationFlow | [סקיצה 57(2)](../design/sketches/sk-57-2-register-regular.jpeg) | אימייל, סיסמה (VAL-003) ואישור תנאי השימוש ומדיניות הפרטיות. אין טלפון. |
| PG-006 | הרשמה מקצועית — שלב 1 | ProfessionalRegistrationPage / ProfessionalRegistrationFlow | [סקיצה 57(1)](../design/sketches/sk-57-1-register-pro.jpeg) | שם מלא, שם עסק (לא חובה), מין, תחום/מקצוע ושנות ניסיון. בלי תאריך לידה. מספר עוסק/ח.פ נאסף באימות (PG-040). |
| PG-007 | הרשמה מקצועית — שלב 2 | ProfessionalRegistrationPage / ProfessionalRegistrationFlow | [סקיצה 57(1)](../design/sketches/sk-57-1-register-pro.jpeg) | אימייל, סיסמה ואישור תנאים. אין טלפון. |
| PG-008 | Feed | FeedPage / FeedFeature | [סקיצה 56(1)](../design/sketches/sk-56-1-feed.jpeg), [סקיצה 56](../design/sketches/sk-56-social-network.jpeg) | מסך הנחיתה אחרי התחברות. TopBar, אזור Feed ו-Bottom Navigation. TopBar כולל Hamburger, לוגו, Global Search, Chat ו-Notifications; יצירת פוסט נשארת בתוך FeedFeature ולא כחלק קשיח מה-TopBar. גלילה אינסופית. בכל כרטיס פוסט: לייק, תגובה, שיתוף בפיד ושיתוף קישור (FR-FEED-006/007). |
| PG-009 | בית — מעקב ותכנון | HomeTrackingPage / HomeTrackingFeature | [סקיצה 56(2)](../design/sketches/sk-56-2-home.jpeg) | כרטיס Context, הוספת מסלול מעקב, יומן/Tracker Menu, טיפים ומאמרים. |
| PG-010 | Marketplace | MarketplacePage / MarketplaceFeature | [סקיצה 57](../design/sketches/sk-57-marketplace.jpeg) | אוסף Marketplace Listings של משתמשים, Listings מקודמים ומוצרים/תוכן ממומן של חברות/ספונסרים. |
| PG-011 | נותני שירות ויועצים | ServicesDirectoryPage / ServicesDirectoryFeature | [סקיצה 55(1)](../design/sketches/sk-55-1-services.jpeg) | קטגוריות וסינון לפי דירוג, מחיר, קרבה גיאוגרפית וניסיון. |
| PG-012 | פרופיל משתמש / עריכת מידע | UserProfilePage / ProfileEditingFeature | [סקיצה 55](../design/sketches/sk-55-profile.jpeg) | עריכת מידע המשתמש ונתוני המסע. |
| PG-013 | פרופיל מקצועי | ProfessionalProfilePage | נדרש מהקונספט | מידע מקצועי, מוניטין/פעילות, שירותים ופעולת פנייה. UI TBD. |
| PG-014 | Chat / Conversation | ChatPage / MessagingFeature | נדרש מהקונספט | מרכז שיחות + Conversation + Requests. Friends פותחים Chat ישיר; non-Friends משתמשים ב-Regular Chat Request; Conversation קיימת ממשיכה לאחר Remove Friend; Support responses מופיעות כ-Support Thread מוגבל. |
| PG-015 | Offer Help / Message Request | ProfessionalOutreachFeature | נדרש מהקונספט | פנייה יזומה של בעל מקצוע מתוך פוסט של משתמש רגיל; פנייה אחת לכל Professional+Post. |
| PG-016 | Message Request Decision | ProfessionalOutreachFeature / MessagingFeature | נדרש מהקונספט | Accept / Decline / Ignore; רק Accept פותח Chat חופשי. |
| PG-017 | תוצאות חיפוש | SearchResultsPage / SearchFeature | נדרש מה-TopBar | Global Search של People / Groups / Posts. כל Regular פעיל מופיע ב-People Search לפחות עם מידע בסיסי; פתיחת פרופיל non-Friend כפופה ל-Regular Profile Visibility. |
| PG-018 | התראות | NotificationsPage / NotificationsFeature | נדרש מה-TopBar | Notification Dropdown + NotificationsPage: read/unread, Deep Links, Mark all as read ואייקון Settings. Chat messages אינן מוכפלות כאן; Recommendations המבוססות צריכה מופיעות ב-Feed בלבד. |
| PG-019 | פריט Marketplace / מוצר | MarketplaceDetailPage | נדרש מה-Marketplace | פרטי Listing/מוצר והמשך פעולה לפי סוג המקור. |
| PG-020 | טיפ / מאמר | ArticlePage / ContextualContentFeature | נדרש מעמוד הבית | תוכן מלא לאחר בחירה. |
| PG-021 | Tracker Page / History | TrackerPage / TrackerFeature | נדרש ממעקב | עמוד ייעודי לכל סוג Tracker עם קלט והיסטוריה. |
| PG-022 | Professional Dashboard | ProfessionalDashboardPage / ProfessionalDashboardFeature | נדרש מקובץ החידודים | ניהול עסקי של החשבון המקצועי: Profile Views, Followers, Organic Reach/Engagement, Chat Starts ו-Promotion Analytics; Organic/Paid מוצגים בנפרד. |
| PG-023 | Breastfeeding Tracker | BreastfeedingTrackerPage / TrackerFeature | נדרש מקובץ החידודים | צד ימין/שמאל, התחלה וסיום בתאריך/שעה באמצעות טיימר או עריכה, הערות ושמירה. |
| PG-024 | שליחת פנייה להנהלת המערכת | SupportRequestFeature | נדרש מקובץ החידודים | בחירת נושא + מלל ושליחה. תגובת Support עתידית מופיעה ב-Chat בשם “Support” במסגרת Thread המקושר לפנייה. |
| PG-025 | Support Inbox | SupportInboxPage / SupportInboxFeature | נדרש מקובץ החידודים | תיבת פניות, סינון, סטטוס, תגובות והערות פנימיות. SUPPORT_HANDLE שולח תגובה למשתמש בשם “Support”. |
| PG-026 | Admin Analytics | AdminAnalyticsPage / AdminAnalyticsFeature | נדרש מקובץ החידודים | Owner/Admin Intelligence: Lifecycle/Retention, Feed/Search, Groups, Professionals, Marketplace, Promotions, Support/Moderation ו-Recommendation Quality. Admin מלא; Moderator רק עם ANALYTICS_VIEW ובסקופ מאושר. |
| PG-027 | Admin / Moderator Permissions | AdminAccessControlPage / ModeratorPermissionsFeature | חידוד משתמש 09.10.2026 | מסך Admin בלבד לניהול Moderator: יצירה/השבתה והקצאה/שינוי/ביטול של Permission Keys המאושרים. כל שינוי נרשם ב-Audit Log. |
| PG-028 | Admin User Management | AdminUserManagementPage / UserManagementFeature | מודל הרשאות Moderator 09.10.2026 | צפייה תפעולית במשתמשים; Warning / Suspension / Ban / Unban. Admin מלא; Moderator לפי USER_VIEW / USER_WARN / USER_SUSPEND / USER_BAN. |
| PG-029 | Admin Audit Log | AdminAuditLogPage / AuditLogFeature | מודל הרשאות Moderator 09.10.2026 | יומן פעולות ניהוליות. Admin מלא; Moderator עם AUDIT_LOG_VIEW בצפייה בלבד. |
| PG-030 | Professional Verification Queue | ProfessionalVerificationAdminPage / ProfessionalVerificationAdminFeature | מודל הרשאות Moderator 09.10.2026 | תור/סטטוס אימות Professional. Admin מלא; Moderator עם PROFESSIONAL_VERIFY. |
| PG-031 | Community Administration | AdminCommunitySettingsPage / CommunityAdministrationFeature | מודל הרשאות Moderator 09.10.2026 | ניהול קטגוריות, סיבות דיווח ותצורות Moderation שאינן קריטיות. Moderator עם COMMUNITY_CONFIG. |
| PG-032 | System Announcements | AdminAnnouncementsPage / SystemAnnouncementsFeature | מודל הרשאות Moderator 09.10.2026 | יצירה וניהול הודעות מערכת רשמיות. Moderator עם SYSTEM_ANNOUNCEMENTS. |
| PG-033 | קבוצות / הקבוצות שלי | GroupsDirectoryPage / GroupsFeature | החלטות Top Bar / Groups 10.10.2026 | Discovery של Public/Private Groups, סטטוס Membership, Join/Request וכניסה לקבוצה. |
| PG-034 | Group Page | GroupPage / GroupsFeature | החלטות Groups 10.10.2026 | תוכן קבוצה בהתאם ל-Public/Private; Members יכולים לפרסם/להגיב; Private content מוגן. |
| PG-035 | Group Management | GroupManagementPage / GroupManagementFeature | החלטות Groups 10.10.2026 | Join Requests, Members, Roles והרשאות Group Owner/Admin/Moderator. |
| PG-036 | Friends | FriendsPage / FriendsFeature | Relationship Model 10.10.2026 | רשימת Friends, Friend Requests, Accept/Decline/Remove. Regular User בלבד. |
| PG-037 | Admin Moderation Queue | AdminModerationPage / ModerationFeature | נגזר מ-Permission Matrix ו-FR-MOD-001 | תור דיווחים, צפייה בפרטי דיווח ופעולות טיפול לפי REPORTS_VIEW / CONTENT_MODERATE / MARKETPLACE_MODERATE והרשאות אכיפה רלוונטיות. |
| PG-038 | Settings | SettingsPage / SettingsFeature | החלטת מוצר 10.10.2026 | עמוד מרכזי ל-Account, Privacy & Security, Notification Settings ו-Terms/Privacy. |
| PG-039 | Following Professionals | FollowingProfessionalsPage / ProfessionalFollowFeature | החלטת מוצר 10.10.2026 | רשימת Professional Profiles במעקב, פתיחה ו-Unfollow. |
| PG-040 | Professional Verification Status | ProfessionalVerificationStatusPage / ProfessionalVerificationFeature | החלטת מוצר 10.10.2026 | סטטוס אימות מקצועי והשלבים/מידע הרלוונטיים. |
| PG-041 | Professional Promotion & Analytics | ProfessionalPromotionPage / PromotionAnalyticsPage / ProfessionalPromotionFeature | החלטת מוצר 10.10.2026 | Profile Promotion, Post Promotion ו-Promotion Analytics. |
| PG-042 | Billing / Promotions | BillingPromotionsPage / ProfessionalPromotionFeature | החלטת מוצר 10.10.2026 | ריכוז קידומים ורכישות מקצועיות; סליקה/חשבוניות לפי הספק שייבחר. |
| PG-043 | Create Group | CreateGroupPage / GroupsFeature | החלטת מוצר 10.10.2026 | כל Regular/Professional רשאי ליצור Public/Private Group ולהפוך ל-Group Owner. |
| PG-044 | Admin Sponsored Products | AdminSponsoredProductsPage / SponsoredProductManagementFeature | החלטת מוצר 10.10.2026 | Admin יוצר ומנהל Sponsored Products / Brand Promotions; אין Brand User בשלב הראשון. |
| PG-045 | Admin Beta Invites | AdminBetaInvitesPage / BetaAccessFeature | החלטת מוצר 11.10.2026 | Admin בלבד: רשימת אימיילים מוזמנים לבטא הסגורה, והפעלה או השבתה של מצב בטא (FR-ADMIN-011). כל שינוי נרשם ב-Audit Log. |
| PG-046 | Admin Content | AdminContentPage / SystemContentFeature | החלטת אפיק מ-15.10.2026 | Admin בלבד: יצירה, עריכה, שיוך לסטטוס, פרסום והסתרה של מדריכים (FR-ADMIN-012). כל שינוי נרשם ב-Audit Log. |
| PG-047 | Medical Hotlines | MedicalHotlinesPage | החלטת אפיק מ-16.10.2026 | כפתורי חיוג למד"א 101 ולמוקדי האחיות של הקופות, והשורה "לא תחליף לטיפול רפואי" (FR-MENU-002). |
| PG-048 | Story Viewer / Composer | StoryViewerPage / StoryFeature | החלטת אפיק מ-16.10.2026 | יצירת סטורי וצפייה בסטורי של אחרים; בלי לייקים, תגובות ורשימת צופים (FR-FEED-008). |
| PG-049 | Community Rules | CommunityRulesPage | החלטת אפיק מ-16.10.2026 | שמונת כללי הקהילה (BR-075), מקושר מהתפריט ומחלון הדיווח. |
| PG-050 | Account Scheduled for Deletion | AccountDeletionFeature | החלטת אפיק מ-16.10.2026 | אחרי התחברות בזמן החרטה: "החשבון שלך מתוזמן למחיקה ב-<תאריך>" עם "ביטול המחיקה" או "התנתקות" (FR-SET-002). |

## 7.1 Bottom Navigation

Regular User משתמש בניווט התחתון המוגדר בסקיצות. Professional User לא יקבל Home Tracking; יעד הבית שלו יהיה Professional Dashboard. מבנה הניווט המקצועי המלא עדיין TBD ולא ייקבע בהנחה (OP-016).

**תוויות בממשק:** בית · חנות · פיד · יועצים · פרופיל. ללשונית הפיד אייקון של הלוגו, וללשונית הפרופיל תמונת המשתמש. **ב-MVP** מוצגים רק בית, פיד ופרופיל; "חנות" ו"יועצים" נוספים כשהיעדים שלהם נבנים (§2.5). **בדסקטופ,** מרוחב 1024px, אותם יעדים מוצגים ב-rail אנכי בצד ההתחלה (NFR-USE-001) (החלטות מ-11.10.2026).

| מיקום בסקיצה | יעד | יעד Page |
|---|---|---|
| ימין | בית — מעקב ותכנון | HomeTrackingPage |
| שני מימין | Marketplace | MarketplacePage |
| מרכז | פיד | FeedPage |
| שני משמאל | נותני שירות ויועצים | ServicesDirectoryPage |
| שמאל | פרופיל | UserProfilePage |

## 7.2 מסלולי מעקב ותפריטי Tracker

הסקיצה של עמוד הבית מציגה שלושה מסלולי מעקב: ילד/ה, הריון ולידה, מחזור וביוץ. היא מציגה גם תפריט Tracking ("יומן פעולות") עם שמונה סוגי מעקב: הנקה, בקבוק, שינה, חיתול, תרופה, גדילה, חיסון ואמבטיה (האריח השמיני אושר ב-11.10.2026; OP-007 נסגר). בממשק האריחים מוצגים ברשת ולא בשורה גלילה.

> לכל Tracker ייפתח עמוד ייעודי. שדות ה-Tracker המדויקים נשארים TBD לכל סוג שלא הוגדר, למעט Tracker הנקה שהוגדר בקובץ החידודים.

## 7.3 Top Bar ומנגנונים גלובליים

TopBar הוא Component גלובלי בתוך AppShell. ב-Regular/Professional סדר הפעולות ב-RTL הוא Hamburger בצד ימין ולצידו הלוגו, Global Search במרכז, Chat ו-Notification Bell בצד שמאל. כל אזור ממומש כ-Feature עצמאי ומחובר ל-TopBar באמצעות props/events/state, כך שה-TopBar אינו מכיל לוגיקה עסקית של Search/Chat/Notifications.

### 7.3.1 Hamburger / Side Menu

Side Menu אינו משכפל את ה-Bottom Navigation. Regular: My Groups, Friends, Following Professionals, Account/Privacy/Notification/Terms דרך SettingsPage, Help/Support Request ו-Logout. Professional: My Groups, Following Professionals, Professional Profile Settings, Verification Status, Professional Promotion & Analytics, Billing/Promotions, Settings, Help/Support ו-Logout. Admin/Moderator הם חשבונות מערכת; Admin רואה את כל כלי הניהול ו-Moderator רק יעדים לפי Permission Keys.

### 7.3.2 Global Search

החיפוש מחזיר People, Groups ו-Posts. כל Regular User פעיל מופיע ב-People Search לפחות עם שם, תמונה ומידע ציבורי בסיסי. המשתמש יכול לקבוע אם פרופילו פתוח ל-non-Friends; במצב Restricted non-Friend אינו רואה מעבר למידע הבסיסי. Professional מסומן כ-Professional. Private Group ניתן לגילוי אך תוכנו מוגן.

### 7.3.3 Notifications

Bell מציג unread count ופותח Dropdown. כל Notification כולל Type, Actor/System, Text, Timestamp, Read/Unread ו-Target. NotificationsPage מציג היסטוריה מלאה ו-Mark all as read. אייקון Settings פותח Multi-select/Toggles לסוגי אירועים; Security/Critical אינם ניתנים לכיבוי ב-In-App. לכל Group ניתן לבחור All / Highlights / Off. בשלב Web ההתראות החברתיות/מערכתיות הן In-App; בשלב Mobile ניתן גם Push לקטגוריות מאופשרות ובכפוף להרשאת מערכת ההפעלה. Email/SMS אינם ערוץ להתראות החברתיות/המסחריות השוטפות.

### 7.3.4 Chat

Chat Icon מציג unread count ו-Dropdown של Recent Conversations/Requests. Friends פותחים Chat ישיר; non-Friends שולחים Regular Chat Request ל-Accept/Decline. Conversation קיימת ממשיכה לאחר Remove Friend. Offer Help נשמר באזור Requests. תגובת Support מופיעה כשרשור בשם “Support” ומוגבלת לפנייה. Chat Block משפיע רק על הודעות.

## 7.4 Relationship Model

Regular↔Regular משתמשים ב-Friends בלבד כ-Relationship Model, אך Friendship אינה תנאי לבקשת שיחה: non-Friend יכול לשלוח Regular Chat Request והנמען בוחר Accept/Decline. Friends פותחים Chat ישיר. Professional Profile אינו מקבל Friend Requests; הקשר אליו Follow.

## 7.5 Groups

Public Group: ניתן לחיפוש, תוכן גלוי למשתמשים מחוברים, Join מיידי ורק Members מפרסמים/מגיבים. Private Group: ניתן לחיפוש לפי פרטי הקבוצה אך תוכנו מוסתר ללא Membership; Join דורש Owner/Admin. כל Regular/Professional רשאי ליצור Group ולהפוך ל-Owner. היררכיה: Owner > Admin > Group Moderator > Member. גישת Moderator מערכת לתוכן Private דורשת PRIVATE_GROUP_MODERATE דרך כלי ניהול.
