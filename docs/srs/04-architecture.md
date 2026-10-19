[← אינדקס ה-SRS](INDEX.md)

# 4. ארכיטקטורת Pages, Features ו-Components

העיקרון בפרויקט: Component הוא יחידת UI או Domain עצמאית שנועדה לשימוש חוזר. Page ו-Feature מנהלים את ה-flow, ה-state והלוגיקה העסקית ומרכיבים בתוכם Components. אין להקשיח בתוך Component פעולה עסקית של מסך מסוים אם אותה תצוגה יכולה לשמש במקום נוסף. שלב הפיתוח הראשון ייבנה כ-Web באמצעות React. רק לאחר השלמת גרסת ה-Web ואישור מפורש למעבר לשלב הבא, יפותח שלב האפליקציה באמצעות React Native. עקרונות הרכיבים והפרדת הלוגיקה יישמרו כך שיאפשרו מעבר מקצועי בין השלבים, מבלי לפתח את שתי הגרסאות במקביל.

## 4.1 כללי חלוקת קוד

- כל רכיב UI שמופיע ביותר ממקום אחד, או צפוי באופן סביר לשימוש חוזר, יוגדר כ-Component עצמאי ורב-שימושי.
- Component אחראי על תצוגה והתנהגות בסיסית בלבד. פעולה עסקית ספציפית מועברת אליו מבחוץ באמצעות קלטים ואירועים (לדוגמה: Button מקבל טקסט ופעולת לחיצה; הוא אינו יודע אם הפעולה פותחת טופס, שומרת נתונים או מנווטת).
- אין ליצור שני Components זהים רק מפני שבמסכים שונים הם מפעילים פעולות שונות. כאשר המבנה והאחריות זהים, משתמשים באותו Component עם פרמטרים/אירועים שונים.
- Feature / Container מרכז את ה-flow, ה-state והלוגיקה העסקית של יכולת מסוימת ומרכיב בתוכו את ה-Components הדרושים. Feature אינו חייב להיות Component רב-שימושי.
- Page אחראי להרכבת Features ו-Components למסך שלם ולניהול הניווט/Context של אותו מסך; אין להכניס ל-Shared UI לוגיקה עסקית של Page.
- כאשר כמה רכיבים זקוקים לאותו state, מקור האמת יישמר אצל ה-Parent/Feature המשותף או בשכבת state/service מתאימה, ולא יוכפל בין הרכיבים.
- פעולות API, אימות, תשלום ונתונים ימומשו בשכבת Service/Repository מתאימה ולא בתוך רכיב UI בלבד.
- Feature אינו מייבא Feature אחר. כאשר שני Features זקוקים לאותו רכיב או לאותה לוגיקה, הם מועברים ל-Shared/Domain Component או לשכבת Service משותפת (החלטה מ-10.10.2026).
- שכבת הלוגיקה — כללים עסקיים, ולידציה, גישה לנתונים ו-Services — אינה תלויה ביכולות ייחודיות ל-Web (DOM, window, react-dom), כדי שתעבור לשלב React Native ללא שינוי; בשלב האפליקציה נכתבת מחדש רק שכבת ה-UI (החלטה מ-10.10.2026).
- כללי החלוקה בסעיף זה נאכפים גם בכלים אוטומטיים בתהליך הפיתוח (lint ו-CI), לרבות תקרת גודל לקובץ, ולא רק בביקורת ידנית (החלטה מ-10.10.2026).
- אין לבצע פירוק יתר: רכיב חד-פעמי ופשוט יכול להישאר בתוך ה-Page/Feature. מוציאים Component כאשר קיימת אחריות עצמאית ברורה או צורך בשימוש חוזר.
- שמות היחידות במסמך הם שמות לוגיים; שמות הקוד הסופיים יכולים להשתנות בלי לשנות את ההתנהגות המוגדרת ב-SRS.

## 4.2 מודל השכבות

הטבלה מפרידה בין ארבע רמות אחריות. רק שתי השכבות הראשונות הן Components במובן של רכיבים שנועדו לשימוש חוזר; Feature ו-Page הן יחידות ארגון ואחריות שמרכיבות את הרכיבים.

| שכבה | יחידה לוגית | אחריות |
|---|---|---|
| Shared Layout Component | AppShell | מעטפת משותפת לאחר התחברות: TopBar, Bottom Navigation עבור סוגי המשתמשים הרלוונטיים ואזור תוכן. Admin/Moderator משתמשים במעטפת ניהול ללא השתתפות חברתית. |
| Shared UI Component | TopBar | סרגל עליון גלובלי ורב-שימושי. מקבל מבחוץ Role/Permissions, counters ופעולות. Regular/Professional: Hamburger, Global Search, Chat, Notifications. Admin/Moderator: Hamburger ניהולי + Notifications; אין Social Chat/Global Search צרכני. |
| Shared UI Component | BottomNavigation | ניווט תחתון קבוע בין היעדים המרכזיים; אינו מכיל את לוגיקת היעדים עצמם. |
| Shared UI Component | Button | כפתור כללי ורב-שימושי. מקבל טקסט/אייקון/מצב/variant ואירוע פעולה מבחוץ. |
| Shared UI Component | TextInput | שדה טקסט כללי. כללי ולידציה עסקיים מוגדרים בטופס/Feature המשתמש בו. |
| Shared UI Component | PasswordInput | שדה סיסמה רב-שימושי; כללי הסיסמה נמסרים מה-flow הרלוונטי. |
| Shared UI Component | TextArea | קלט טקסט רב-שורות לשימוש בטפסים ופוסטים. |
| Shared UI Component | SelectInput | בחירה מתוך רשימה; האפשרויות והפעולה נקבעות על ידי ה-Feature. |
| Shared UI Component | DateInput | בחירת תאריך לשימוש בהרשמה, מסלולים וטפסים נוספים. |
| Shared UI Component | Modal / Dialog | מעטפת חלון קופץ כללית שמקבלת תוכן ופעולות מבחוץ; אינה קשורה לטופס מסוים. **כפי שנבנה ב-I3:** גם מעטפת אחת לגיליון מלמטה (מתחת ל-1024px) ולחלון קטן (מ-1024px), שמשמשת את השיתוף, שיתוף הקישור והדיווח; כל חלון נסגר ב-Back, ב-Esc ובלחיצה מחוצה לו, ובחלון אישור לחיצה בחוץ היא ביטול (`docs/design/direction.md`). |
| Shared UI Component | Avatar | תמונת/ייצוג משתמש לשימוש בפיד, פרופילים, תגובות וכדומה. |
| Shared UI Component | Badge | תג מידע כללי, למשל Sponsored או סטטוס; התוכן נקבע מבחוץ. (אין תג אימות — OP-005 נסגר, 18.10.2026.) |
| Shared UI Component | GlobalSearchInput | קלט חיפוש גלובלי משותף. מקבל value/events בלבד; SearchFeature מנהל את הישויות, הרשאות התוצאות, ה-Dropdown והניווט. |
| Domain Reusable Component | PostCard | תצוגת פוסט חוזרת ברשימות/פיד. מקבלת נתוני פוסט ואירועי פעולה מבחוץ. |
| Domain Reusable Component | MarketplaceItemCard | כרטיס Marketplace רב-שימושי שמקבל סוג מקור/קידום מבחוץ ומציג וריאציה מתאימה: Listing אורגני של משתמש, Listing מקודם של משתמש, או מוצר ממומן של חברה/ספונסר. |
| Domain Reusable Component | ProfessionalCard | כרטיס בעל מקצוע חוזר ברשימות/המלצות. פעולת פתיחת הפרופיל או פנייה נקבעת מבחוץ. |
| Domain Reusable Component | JourneyContextCard | כרטיס Context שניתן להשתמש בו עבור ילד/ה, הריון או מסלול אחר בהתאם לנתונים. |
| Domain Reusable Component | TrackerActionItem | פעולת Tracker חוזרת; סוג המעקב והשדות הרלוונטיים נקבעים על ידי TrackerFeature. |
| Domain Reusable Component | ArticleCard | כרטיס טיפ/מאמר חוזר ברשימות תוכן. |
| Domain Reusable Component | NotificationItem | פריט התראה חוזר: icon/type, Actor, text, timestamp, read/unread ו-Target/Deep Link. הפעולה מתקבלת מ-NotificationsFeature. |
| Feature / Container | RegularRegistrationFlow | מנהל את שלבי ההרשמה הרגילה, ה-state, הוולידציות והמעבר בין השלבים. |
| Feature / Container | ProfessionalRegistrationFlow | מנהל את שלבי ההרשמה המקצועית והנתונים המקצועיים. |
| Feature / Container | FeedFeature | מרכיב Feed Units ומפעיל RuleBasedRecommendationEngine לטעינה, Eligibility, Ranking, Re-ranking וחיבור בין PostCard/Recommendation Units לפעולות המשתמש. |
| Feature / Container | CreatePostFeature | מנהל יצירת פוסט/שאלה ואת הוולידציה הנדרשת. |
| Feature / Container | PostInteractionFeature | מנהל תגובות/Reaction ושינויים בנתוני הפוסט. |
| Feature / Container | HomeTrackingFeature | מנהל Context פעיל, Summary ומרכיבי המעקב בעמוד הבית. |
| Feature / Container | JourneyManagementFeature | הוספה, בחירה וניהול של מסלולי Parent Journey. |
| Feature / Container | TrackerFeature | מנהל יצירת Tracker Event, שדות לפי סוג והיסטוריה. |
| Feature / Container | ContextualContentFeature | בוחר טיפים ומאמרים לפי My Stage ו-Context מאושר; יכול להשתמש ב-Tracker category/summary לצורך הכוונה כללית ולא-אבחונית בלבד. אינו משמש Paid Targeting. |
| Feature / Container | MarketplaceFeature | מנהל Marketplace Listings, מוצרים מסחריים, סוג מקור, קידום משתמש וסימון Sponsored. |
| Feature / Container | ServicesDirectoryFeature | מנהל קטגוריות, סינון, דירוג ותוצאות של בעלי מקצוע. |
| Feature / Container | MessagingFeature | מנהל מרכז שיחות, היסטוריה, Preview, unread state, Regular Chat Requests בין non-Friends, Chat Block והקשרי Friends / Professional Outreach / Marketplace / Support. שיחה קיימת בין Regular Users יכולה להמשיך גם לאחר Remove Friend. |
| Feature / Container | ProfessionalOutreachFeature | מנהל Offer Help / Message Request מתוך פוסט, אכיפת פנייה אחת לכל Professional+Post, ו-Accept/Decline/Ignore. |
| Feature / Container | ProfessionalPromotionFeature | מנהל Professional Marketing Tools: Profile Promotion, Post Promotion ו-Promotion Analytics, בנפרד מהמוניטין והחשיפה האורגניים. |
| Feature / Container | ProfileEditingFeature | מנהל עריכת פרטי החשבון בהתאם לסוג המשתמש; נתוני ילדים/מסלולים שייכים ל-Regular בלבד. |
| Feature / Container | SearchFeature | מנהל Global Search של People, Groups ו-Posts, כולל Dropdown, SearchResultsPage ואכיפת פרטיות. Regular User תמיד ניתן לאיתור; תצוגת הפרופיל ל-non-Friend מוגבלת לפי Regular Profile Visibility. |
| Feature / Container | NotificationsFeature | מנהל Notification Center, Dropdown, NotificationsPage, read/unread, Deep Links והתאמת סוגי האירועים לפי Role/Permissions והעדפות המשתמש. |
| Page | WelcomePage / LoginPage / AccountTypeSelectionPage | מסכי כניסה והרשמה; מרכיבים Shared UI ו-Flows רלוונטיים. |
| Page | RegularRegistrationPage / ProfessionalRegistrationPage | מסכי ההרשמה; מרכיבים את Flow ההרשמה והרכיבים הכלליים. |
| Page | FeedPage / HomeTrackingPage / MarketplacePage | מסכי הליבה המרכזיים לאחר התחברות. |
| Page | PostPage | עמוד פוסט בודד (PG-055): הפוסט, השיתוף או המקור שלו, ושרשור התגובות המלא; מרכיב את PostInteractionFeature ו-PostShareFeature (I3). |
| Page | ServicesDirectoryPage / ProfessionalProfilePage | מסכי איתור וצפייה בבעלי מקצוע. |
| Page | UserProfilePage / MarketplaceDetailPage | מסכי פרופיל משתמש ופרטי Marketplace Listing/מוצר ממומן. |
| Page | SearchResultsPage / NotificationsPage / ChatPage | מסכי תוצאות חיפוש, היסטוריית התראות ומרכז שיחות מלא. |
| Shared UI Component | MediaUploader | רכיב להוספת תמונות/סרטונים במקומות שבהם מדיה מותרת. סוגי קבצים ומגבלות מועברים מה-Feature המשתמש בו. בכל העלאה: הקטנה, ניקוי EXIF/GPS וטשטוש בדפדפן לפני השליחה (NFR-MEDIA-001, BR-076). |
| Domain Reusable Component | ReportAction | פעולת דיווח רב-שימושית לתוכן/משתמש. נפתחת כחלון נפרד מעל מסך מטושטש מעט, עם סיבה, טקסט חופשי וקישור לכללי הקהילה (FR-MOD-001). יעד הדיווח, סיבת הדיווח והמשך ה-flow נקבעים על ידי ModerationFeature. **כפי שנבנה ב-I3:** בגיליון מלמטה או בחלון קטן (Modal / Dialog), מתפריט "⋯" של פוסט ושל תגובה ומכפתור בפרופיל. |
| Feature / Container | UserBlockFeature | מנהל חסימת משתמש הדדית: הסתרת פוסטים, תגובות ופרופיל בשני הכיוונים וסיום ה-Friendship (FR-REL-002, I4). |
| Feature / Container | ProfessionalDashboardFeature | מנהל KPI מקצועיים מצטברים: Profile Views, Followers, Organic Reach/Engagement, Chat Starts ו-Promotion Analytics. Organic ו-Paid מוצגים בנפרד; אין חשיפת זהויות/חיפושים של משתמשים בודדים. |
| Feature / Container | SupportRequestFeature | מנהל שליחת פנייה מסווגת ושיוכה למשתמש. כאשר Support משיב, התגובה מוזרמת ל-Support Thread ב-Chat תחת זהות “Support”, בלי להפוך את הערוץ ל-Chat חברתי חופשי. |
| Feature / Container | SupportInboxFeature | מנהל תיבת פניות, סינון, סטטוס, הערות פנימיות ותגובות. SUPPORT_HANDLE מאפשר תגובה בשם “Support”; האינטראקציה נשמרת במסגרת SupportRequest. |
| Feature / Container | AdminAnalyticsFeature | מנהל תצוגת Analytics/Intelligence. Admin בעל גישה מלאה; Moderator יכול לצפות רק עם ANALYTICS_VIEW, בהיקף שמוגדר ב-FR-ADMIN-010. מקבל את הנתונים מ-AdminIntelligenceFeature. |
| Feature / Container | ModerationFeature | מנהל דיווחים ותוכן בעייתי. Admin בעל גישה מלאה; Moderator פועל לפי REPORTS_VIEW, CONTENT_MODERATE ו-MARKETPLACE_MODERATE. |
| Page | ProfessionalDashboardPage | מסך הבית העסקי של Professional User. מחליף את חוויית המעקב ההורי עבור חשבון מקצועי. |
| Page | SupportInboxPage / AdminAnalyticsPage | SupportInboxPage נגיש ל-Admin ול-Moderator עם SUPPORT_VIEW; פעולות טיפול דורשות SUPPORT_HANDLE. AdminAnalyticsPage נגיש ל-Admin ול-Moderator עם ANALYTICS_VIEW בלבד. |
| Feature / Container | ModeratorPermissionsFeature | מאפשר ל-Admin בלבד ליצור/להשבית Moderator ולהקצות, לשנות ולבטל Permission Keys. שינוי הרשאות נרשם ב-Audit Log. |
| Page | AdminAccessControlPage | מסך ניהול Moderator והרשאותיו. נגיש ל-Admin בלבד ומציג את Permission Matrix המאושרת ואת מצב ההרשאות לכל Moderator. |
| Feature / Container | UserManagementFeature | מנהל צפייה תפעולית במשתמשים ופעולות Warning / Suspension / Ban / Unban בהתאם ל-Permission Keys; Admin בעל גישה מלאה. |
| Feature / Container | AuditLogFeature | רושם פעולות ניהוליות באופן אוטומטי ומציג Audit Log. Admin בעל גישה מלאה; Moderator עם AUDIT_LOG_VIEW מקבל צפייה בלבד. |
| Feature / Container | ~~ProfessionalVerificationAdminFeature~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Feature / Container | CommunityAdministrationFeature | מנהל קטגוריות, סיבות דיווח ותצורות קהילה תפעוליות. Moderator פועל רק עם COMMUNITY_CONFIG. |
| Feature / Container | SystemAnnouncementsFeature | מנהל הודעות מערכת רשמיות. Moderator פועל רק עם SYSTEM_ANNOUNCEMENTS. |
| Page | AdminUserManagementPage | מסך ניהול משתמשים ואכיפה. Admin מלא; Moderator רואה/פועל לפי USER_VIEW / USER_WARN / USER_SUSPEND / USER_BAN. |
| Page | AdminAuditLogPage | מסך Audit. Admin מלא; Moderator עם AUDIT_LOG_VIEW בצפייה בלבד. |
| Page | ~~ProfessionalVerificationAdminPage~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Page | AdminCommunitySettingsPage | מסך הגדרות קהילה תפעוליות. Admin מלא; Moderator עם COMMUNITY_CONFIG. |
| Page | AdminAnnouncementsPage | מסך הודעות מערכת. Admin מלא; Moderator עם SYSTEM_ANNOUNCEMENTS. |
| Shared UI Component | DropdownPanel | מעטפת Dropdown כללית ל-Search, Notifications ו-Chat. מקבלת תוכן ופעולות מבחוץ ואינה מכילה לוגיקה עסקית. |
| Shared UI Component | SideDrawer | מעטפת תפריט צד הנפתחת מה-Hamburger. פריטי התפריט וההרשאות מוזנים על ידי SideMenuFeature. |
| Shared UI Component | MenuItem | פריט תפריט רב-שימושי המקבל label/icon/action/disabled מבחוץ. |
| Shared UI Component | UnreadBadge | Badge מספרי/מצבי להצגת unread count על Chat/Notifications. מקור הנתון מנוהל ב-Feature. |
| Domain Reusable Component | SearchResultItem | פריט תוצאת חיפוש רב-שימושי עבור Person/Group/Post; הניווט וה-visibility מגיעים מ-SearchFeature. |
| Domain Reusable Component | ConversationPreview | תצוגת שיחה אחרונה ב-Chat Dropdown/List: משתתף/ים, הודעה אחרונה, זמן ו-unread state. |
| Domain Reusable Component | GroupCard | כרטיס קבוצה ברשימות/חיפוש: שם, תיאור, Public/Private, סטטוס חברות ופעולה מתאימה. |
| Domain Reusable Component | FriendItem | פריט חבר/בקשת חברות לשימוש ב-FriendsPage ובהקשרים חברתיים. |
| Feature / Container | SideMenuFeature | בונה את תפריט ה-Hamburger לפי סוג החשבון וההרשאות, ללא שכפול יעדי Bottom Navigation. |
| Feature / Container | FriendsFeature | מנהל Friend Requests, אישור/דחייה, רשימת חברים והסרת Friendship בין Regular Users בלבד. |
| Feature / Container | ProfessionalFollowFeature | מנהל Follow/Unfollow אל Professional Profile. יעד Follow תמיד ProfessionalProfile; Professional אינו עוקב אחר Regular User. |
| Feature / Container | GroupsFeature | מנהל גילוי קבוצות, יצירת Group חדש על ידי Regular/Professional, Membership, Public/Private visibility, הצטרפות, בקשות והזמנות. |
| Feature / Container | GroupManagementFeature | מנהל Group Owner/Admin/Moderator לפי היררכיה Owner > Admin > Group Moderator > Member. Role נמוך אינו יכול לאכוף פעולה על Role שווה/גבוה ממנו. |
| Feature / Container | NotificationSettingsFeature | מנהל Multi-select/Toggles לסוגי התראות, חריגי Security/Critical והעדפת All/Highlights/Off לכל קבוצה. בשלב Web הוא מנהל In-App בלבד; בשלב Mobile הוא מנהל גם Push delivery עבור קטגוריות מאופשרות, בכפוף להרשאת מערכת ההפעלה. |
| Page | GroupsDirectoryPage / GroupPage / GroupManagementPage | מסכי גילוי/הקבוצות שלי, צפייה בקבוצה וניהול קבוצה בהתאם ל-Public/Private ולתפקיד. |
| Page | FriendsPage | מסך Friends ובקשות חברות עבור Regular User בלבד. |
| Feature / Container | PasswordRecoveryFeature | מנהל את תהליך שחזור הסיסמה מתוך Login. ערוץ האימות המדויק נשאר TBD עד להחלטה; ה-Feature אחראי ל-state, ולידציה והחלפת הסיסמה לאחר אימות. |
| Feature / Container | ~~ProfessionalVerificationFeature~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Feature / Container | MarketplacePromotionFeature | מנהל קידום בתשלום של Marketplace Listing בבעלות Regular User, בנפרד מקידום Professional Profile. |
| Page | TrackerPage / BreastfeedingTrackerPage / ArticlePage | TrackerPage הוא עמוד ייעודי לסוג מעקב; BreastfeedingTrackerPage הוא מימוש ייעודי להנקה; ArticlePage מציג טיפ/מאמר מלא. |
| Page | AdminModerationPage | מסך תור דיווחים וטיפול ב-Moderation. Admin בעל גישה מלאה; Moderator פועל לפי REPORTS_VIEW וביצוע פעולות תוכן לפי CONTENT_MODERATE / MARKETPLACE_MODERATE והרשאות אכיפה רלוונטיות. |
| Domain Reusable Component | MessageRequestItem | פריט בקשת שיחה חוזר עבור Regular Chat Request או Professional Offer Help. מקבל סוג בקשה, שולח, טקסט/הקשר, סטטוס ופעולות מבחוץ. |
| Feature / Container | SettingsFeature | מנהל SettingsPage ו-Sections של Account, Privacy & Security, Notifications ו-Terms/Privacy. |
| Page | SettingsPage | עמוד הגדרות מרכזי ל-Account, Privacy & Security, Notifications ו-Terms/Privacy. |
| Page | FollowingProfessionalsPage | רשימת Professional Profiles במעקב עם פתיחה ו-Unfollow. |
| Page | ~~ProfessionalVerificationStatusPage~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Page | ProfessionalPromotionPage / PromotionAnalyticsPage | ניהול Profile Promotion, Post Promotion ותוצאות הקידום המקצועי. |
| Page | BillingPromotionsPage | ריכוז רכישות/קידומים מקצועיים וסטטוסי תשלום; ספק סליקה/חשבוניות TBD. |
| Page | CreateGroupPage | יצירת Public/Private Group על ידי Regular או Professional; היוצר הופך ל-Group Owner. |
| Feature / Container | SponsoredProductManagementFeature | Admin בלבד: יצירה, עריכה, פרסום, השהיה והסרה של SponsoredProduct/Brand Promotion בשלב הראשון. |
| Page | AdminSponsoredProductsPage | מסך Admin לניהול Sponsored Products; אין Brand User בשלב הראשון. |
| Feature / Container | PersonalizationSignalFeature | קולט אירועי חיפוש/צריכה/אינטראקציה מאושרים ומעדכן Interest Profile ו-Intent Signals. אינו משתמש בתוכן Chat/Support; עבור Professional אינו משתמש ב-Child/Tracker Data. |
| Feature / Container | RuleBasedRecommendationEngine | מנוע v1 דטרמיניסטי ל-Candidate Generation, Ranking ו-Re-ranking עבור Feed, Professionals, Marketplace/Products ו-Contextual Guidance. הכללים והמשקולות ניתנים להגדרה באמצעות AlgorithmConfiguration. |
| Feature / Container | RecommendationFeedbackFeature | מנהל Not Interested / Show Less ואת השפעתם על Creator/Topic/Source ברמת המשתמש. "הסתרת הפוסט" נשמרת כאן ב-PostHide בלבד ואינה משפיעה על הדירוג (FR-ALG-009). |
| Feature / Container | AnalyticsEventFeature | רושם Event Taxonomy אחיד ל-Impression, Open, Dwell, Search, Engagement, Conversion ו-Administrative metrics ללא שמירת גוף Chat/Support באירועי Analytics כלליים. |
| Feature / Container | AdminIntelligenceFeature | מחשב נתונים ל-Owner/Admin: Lifecycle, Retention, Feed/Search, Groups, Professionals, Marketplace, Promotion, Moderation/Support ו-Recommendation Quality — גם ברמת משתמש בודד, בלי שמות ובלי פרטים מזהים (FR-ADMIN-010, החלטת אפיק מ-18.10.2026). אילו תחומים זמינים ב-I14 לפני אירועי I15 — OP-039. |
| Feature / Container | ContentMetadataFeature | מחזיק Topic/Category/Stage metadata לצורכי v1 באמצעות שדות מובנים, Group/Category context, Tags ומילות מפתח. סיווג סמנטי אוטומטי/Embeddings הוא Future Enhancement. |
| Shared UI Component | OverflowMenu | תפריט "⋯" לפעולות משניות בכרטיס או במסך. במובייל נפתח כ-sheet מלמטה. הפעולות מוזנות מבחוץ (החלטות עיצוב מ-11.10.2026). **כפי שנבנה ב-I3:** תפריט אחד לכל כרטיס, לכל תגובה ולכותב בעמוד הפוסט; נסגר ב-Back, ב-Esc ובלחיצה בחוץ, ולחיצה אחת על "⋯" אחר פותחת אותו. |
| Shared UI Component | Tooltip | תווית קצרה לכפתור אייקון, בריחוף ובמיקוד. ניתנת לסגירה ואינה מסתירה תוכן (WCAG 1.4.13). |
| Shared UI Component | Toast | הודעת מצב קצרה ושקטה, ב-live region. אינה המקום היחיד למידע חשוב, ו-Toast עם פעולה אינו נעלם לבד. |
| Shared UI Component | EmptyState | מצב ריק: הסבר קצר ופעולה אחת לצעד הבא. התוכן מוזן מבחוץ. |
| Shared UI Component | Skeleton | מצב טעינה רך, בלי תנועה כשהמשתמש ביקש להפחית תנועה. |
| Shared UI Component | ChoiceCardGroup | בחירה אחת מתוך כמה אפשרויות, בכרטיסים (radio), עם סימון "נבחר" שאינו בצבע בלבד. |
| Shared UI Component | StepIndicator | "שלב X מתוך Y" ופס התקדמות לטפסים מרובי שלבים. |
| Shared UI Component | ScrollToTopButton | כפתור "חזרה למעלה" שמופיע אחרי גלילה ארוכה בפיד ומחזיר את המיקוד לראש הרשימה. |
| Shared UI Component | ShareSheet | חלון שיתוף קישור: וואטסאפ, אימייל, העתקת קישור וחלון השיתוף של המכשיר. היעדים מוזנים מבחוץ. |
| Shared Layout Component | AuthLayout | מעטפת למסכים שלפני ההתחברות (Welcome, Login, שלבי ההרשמה): עמודה ממורכזת, מקום לכפתור חזרה, גוף הטופס ואזור פעולות תחתון. אינה מכילה לוגיקה של הרשמה או התחברות. |
| Shared UI Component | FormField | עוטף שדה קלט: תווית מעל השדה, רמז, סימון "(לא חובה)" והודעת שגיאה מקושרת לשדה. הוולידציה עצמה נקבעת ב-Feature. |
| Shared UI Component | Checkbox | תיבת סימון עם תווית, שיכולה להכיל קישורים (למשל אישור תנאי השימוש). |
| Shared UI Component | InlineAlert | הודעת מצב בתוך המסך, למשל שגיאת התחברות. הטקסט מגיע מבחוץ, מקטלוג השגיאות (§10). |
| Shared UI Component | Logo | סימן המותג (wordmark זמני, OP-022), כקישור או כתמונה, בשני גדלים. מוחלף במקום אחד כשתיקבע הזהות הסופית. |
| Feature / Container | PostShareFeature | מנהל שיתוף בפיד ושיתוף קישור (FR-FEED-006/007): בדיקה שמותר לשתף (BR-064), שמירת הפניה למקור (BR-065), מצב "לא זמין" ויצירת קישור בלי תוכן בתצוגה המקדימה (BR-067). |
| Feature / Container | BetaAccessFeature | מנהל את רשימת המוזמנים לבטא הסגורה ואת מצב הבטא, ובודק בהרשמה שהאימייל מוזמן (FR-ADMIN-011). |
| Page | AdminBetaInvitesPage | מסך Admin לניהול רשימת המוזמנים ומצב הבטא. |
