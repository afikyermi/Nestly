[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Admin — ניהול מערכת

## FR-ADMIN-001 — שליחת פנייה מסווגת להנהלת המערכת

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר; רשימת נושאים מדויקת TBD |
| Actor | Regular User / Professional User |
| תיאור | המערכת תאפשר למשתמש מחובר לשלוח פנייה לתמיכה באמצעות בחירת נושא וכתיבת מלל חופשי. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | נושא פנייה + מלל. |
| תהליך מערכת | שמירת הפנייה, שיוכה למשתמש ולנושא והעברתה לתיבת הפניות. Admin נגיש תמיד; Moderator בעל SUPPORT_VIEW יכול לצפות, ובעל SUPPORT_HANDLE יכול לטפל. |
| פלט | אישור שליחת פנייה. |
| מצב לאחר ביצוע | SupportRequest זמינה לטיפול. היא אינה יוצרת Chat חופשי; Support Thread יופיע ב-Chat כאשר מתקבלת תגובת Support. |
| בעל אחריות לוגי (Page / Feature) | SupportRequestFeature |

## FR-ADMIN-002 — תיבת פניות Support וניהול

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Admin / Moderator |
| תיאור | המערכת תציג תיבת פניות עם נושא, תוכן, משתמש, זמן, סטטוס והיסטוריית תגובות. Admin בעל גישה מלאה. Moderator עם SUPPORT_VIEW יכול לצפות; SUPPORT_HANDLE מאפשר תגובה בשם “Support”, שינוי סטטוס והערה פנימית. |
| תנאים מוקדמים | Admin מחובר, או Moderator מחובר עם SUPPORT_VIEW. פעולת טיפול דורשת SUPPORT_HANDLE. |
| קלט / Trigger | Support Requests שנשלחו. |
| תהליך מערכת | טעינה וסינון לפי SUPPORT_VIEW; תגובה/הערה פנימית/עדכון סטטוס רק עם SUPPORT_HANDLE. תגובת שירות נשמרת ב-SupportRequest ומוצגת למשתמש ב-Chat כ-Support Thread בשם “Support”. כל פעולה נרשמת ב-Audit Log. |
| פלט | רשימת פניות לניהול. |
| מצב לאחר ביצוע | סטטוס, תגובות והערות נשמרים; תגובה חיצונית חדשה מסומנת unread ב-Chat של המשתמש. |
| בעל אחריות לוגי (Page / Feature) | SupportInboxPage / SupportInboxFeature |

## FR-ADMIN-003 — ניתוח פניות ושימוש במערכת

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — Core metrics מוגדרים ב-FR-ADMIN-010 ובסעיף 18.6 |
| Actor | Admin / Moderator עם ANALYTICS_VIEW |
| תיאור | המערכת תאפשר ל-Admin לנתח פניות Support ומידע תפעולי/שימוש. שכבת Owner/Admin Intelligence המלאה מוגדרת ב-FR-ADMIN-010; Moderator עם ANALYTICS_VIEW רואה רק scope מאושר. |
| תנאים מוקדמים | קיימים נתוני פניות/שימוש; Admin מחובר או Moderator מחובר עם ANALYTICS_VIEW. |
| קלט / Trigger | Support Requests + Analytics Aggregates מאושרים. |
| תהליך מערכת | Aggregation לפי period/domain/segment; Organic/Paid נפרדים; ברירת מחדל Aggregate. |
| פלט | Support metrics + קישור/גישה ל-Admin Intelligence KPIs. |
| מצב לאחר ביצוע | המידע זמין לניהול וקבלת החלטות תפעוליות ומוצריות. |
| בעל אחריות לוגי (Page / Feature) | AdminAnalyticsPage / AdminAnalyticsFeature |

## FR-ADMIN-004 — ניהול הרשאות Moderator

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Admin |
| תיאור | המערכת תאפשר ל-Admin בלבד ליצור/להשבית Moderator ולהקצות, לשנות ולבטל את Permission Keys המאושרים: SUPPORT_VIEW, SUPPORT_HANDLE, REPORTS_VIEW, CONTENT_MODERATE, MARKETPLACE_MODERATE, USER_VIEW, USER_WARN, USER_SUSPEND, USER_BAN, PROFESSIONAL_VERIFY, ANALYTICS_VIEW, AUDIT_LOG_VIEW, COMMUNITY_CONFIG, SYSTEM_ANNOUNCEMENTS, PRIVATE_GROUP_MODERATE. |
| תנאים מוקדמים | Admin מחובר וקיים משתמש Moderator. |
| קלט / Trigger | בחירת Moderator + בחירת Permission Keys להוספה/הסרה או השבתת Moderator. |
| תהליך מערכת | שמירת מיפוי ההרשאות, אכיפה בצד השרת ועדכון הגישה למודולים/פעולות. כל שינוי נשמר ב-Audit Log עם מצב לפני/אחרי. |
| פלט | אישור עדכון הרשאות. |
| מצב לאחר ביצוע | ה-Moderator יכול לגשת רק ליכולות שהוקצו לו. Admin שומר גישה מלאה. פעולות Admin Only אינן ניתנות להקצאה ל-Moderator. |
| בעל אחריות לוגי (Page / Feature) | AdminAccessControlPage / ModeratorPermissionsFeature |

## FR-ADMIN-005 — Audit Log לפעולות ניהוליות

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר; נוספו אירועי שחזור הסיסמה (F1.6, 15.10.2026) |
| Actor | System / Admin / Moderator עם AUDIT_LOG_VIEW לצפייה |
| תיאור | המערכת תרשום Audit Log לכל פעולה ניהולית משמעותית של Admin/Moderator. Moderator בעל AUDIT_LOG_VIEW יכול לצפות בלבד; אין אפשרות לשנות או למחוק רשומות דרך ממשק המוצר. **אירועי שחזור הסיסמה (FR-AUTH-003, כפי שנבנה ב-F1.6):** נרשמים ברשומה נפרדת, בשרת, באותה פעולה שבה הם קורים: `answers_saved` · `answers_changed` · `change_failed` · `change_limited` · `reset_failed` · `reset_limited` · `reset_verified`, ואחריו בדיוק אחת מהתוצאות `reset_completed` · `reset_admin_failed` (קביעת הסיסמה ב-Auth נכשלה) · `reset_revoke_failed` (הסיסמה נקבעה, סיום ה-Sessions נכשל) · `reset_email_mismatch` (האימייל הנוכחי של החשבון אינו האימייל שהוזן) · ומעבר מזהה האימייל: `handle_released` (החשבון איבד את המזהה לטענה חדשה יותר) · `handle_rekeyed` (המזהה עבר לאימייל שבאסימון). כל רשומה: סוג, מזהה משתמש כשידוע, hash של מזהה האימייל, hash של כתובת ה-IP וזמן — בלי תשובה, סיסמה או אימייל. למשתמשים רגילים ולמבקרים אין גישה אליה. |
| תנאים מוקדמים | פעולה ניהולית בוצעה, או Actor מורשה פתח את מסך Audit. |
| קלט / Trigger | פעולת ניהול / פתיחת Audit Log. |
| תהליך מערכת | שמירת Actor, Role, Permission, Action, Target, Timestamp, Result וסיבה כאשר קיימת; בשינוי הרשאה נשמר Before/After. |
| פלט | רשומת Audit חדשה או רשימת רשומות בהתאם להרשאה. |
| מצב לאחר ביצוע | הפעולה ניתנת למעקב. מדיניות Retention תוגדר במסגרת Data Governance. |
| בעל אחריות לוגי (Page / Feature) | AdminAuditLogPage / AuditLogFeature |

## FR-ADMIN-006 — טיפול בבקשת Professional Verification

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר ברמת ה-flow; כללי מסמכים/מקצועות נשארים לפי OP-005 |
| Actor | Admin / Moderator עם PROFESSIONAL_VERIFY |
| תיאור | המערכת תאפשר לגורם מורשה לבחון בקשת אימות מקצועי ולעדכן את סטטוס האימות. |
| תנאים מוקדמים | קיימת בקשת/מידע אימות Professional. Admin מחובר או Moderator עם PROFESSIONAL_VERIFY. |
| קלט / Trigger | פתיחת בקשת אימות מתוך ProfessionalVerificationAdminPage. |
| תהליך מערכת | הצגת פרטי האימות הזמינים; בחירת Approve / Reject / עדכון סטטוס בהתאם לכללים שיוגדרו; שמירת Actor, זמן ותוצאה ב-Audit Log. |
| פלט | סטטוס האימות המקצועי מתעדכן. |
| מצב לאחר ביצוע | ProfessionalProfile משקף את סטטוס האימות החדש; הפעולה נרשמת ב-Audit Log. |
| בעל אחריות לוגי (Page / Feature) | ProfessionalVerificationAdminPage / ProfessionalVerificationAdminFeature |

## FR-ADMIN-007 — ניהול תצורות קהילה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Admin / Moderator עם COMMUNITY_CONFIG |
| תיאור | המערכת תאפשר ניהול הגדרות קהילה תפעוליות שאינן Admin Only, כגון קטגוריות, סיבות דיווח ותצורות Moderation מאושרות. |
| תנאים מוקדמים | Admin מחובר או Moderator עם COMMUNITY_CONFIG. |
| קלט / Trigger | פתיחת AdminCommunitySettingsPage וביצוע שינוי בתצורה מותרת. |
| תהליך מערכת | בדיקת Permission; ולידציה של הערכים; שמירת התצורה ורישום Before/After ב-Audit Log. |
| פלט | התצורה המעודכנת זמינה לרכיבים המשתמשים בה. |
| מצב לאחר ביצוע | השינוי נשמר ונרשם ב-Audit Log. |
| בעל אחריות לוגי (Page / Feature) | AdminCommunitySettingsPage / CommunityAdministrationFeature |

## FR-ADMIN-008 — ניהול הודעות מערכת

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Admin / Moderator עם SYSTEM_ANNOUNCEMENTS |
| תיאור | המערכת תאפשר ליצור, לערוך, לפרסם ולהסיר הודעות מערכת רשמיות. |
| תנאים מוקדמים | Admin מחובר או Moderator עם SYSTEM_ANNOUNCEMENTS. |
| קלט / Trigger | יצירה/עריכה/פרסום/הסרה של System Announcement. |
| תהליך מערכת | בדיקת Permission; ולידציה; שמירת ההודעה והסטטוס; רישום הפעולה ב-Audit Log. |
| פלט | הודעת מערכת נשמרת/מתפרסמת/מוסרת בהתאם לפעולה. |
| מצב לאחר ביצוע | המצב החדש של ההודעה נשמר והפעולה נרשמת ב-Audit Log. |
| בעל אחריות לוגי (Page / Feature) | AdminAnnouncementsPage / SystemAnnouncementsFeature |

## FR-ADMIN-009 — ניהול Sponsored Products

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר לשלב הראשון |
| Actor | Admin |
| תיאור | בשלב הראשון Sponsored Products / Brand Promotions ייווצרו וינוהלו על ידי Admin מתוך Back Office. אין Brand User עצמאי. |
| תנאים מוקדמים | Admin מחובר; קיימים פרטי מוצר/מותג ותוכן מסחרי. |
| קלט / Trigger | Create / Edit / Publish / Pause / Remove Sponsored Product. |
| תהליך מערכת | בדיקת Admin Only SPONSORED_PRODUCT_MANAGE; שמירת SponsoredProduct, מקור, מדיה, סטטוס וסימון Sponsored; רישום Audit. |
| פלט | Sponsored Product פעיל/מעודכן/מושהה/מוסר. |
| מצב לאחר ביצוע | Marketplace מציג את המוצר המסחרי בסימון ברור ונפרד מ-User Listing. |
| בעל אחריות לוגי (Page / Feature) | AdminSponsoredProductsPage / SponsoredProductManagementFeature |

## FR-ADMIN-010 — Owner/Admin Intelligence Dashboard v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Admin / Moderator with ANALYTICS_VIEW |
| תיאור | AdminAnalyticsPage יציג Owner/Admin Intelligence מצטבר עבור Lifecycle/Retention, Feed/Search, Groups, Professionals, Marketplace, Promotions, Support/Moderation ו-Recommendation Quality. Admin מלא; Moderator רק בסקופ שהוקצה לו. |
| תנאים מוקדמים | קיימים AnalyticsEvent/Aggregate data והרשאת צפייה. |
| קלט / Trigger | בחירת תקופה, domain ו-segment מאושר. |
| תהליך מערכת | טעינת Aggregates לפי סעיף 18.6; Organic ו-Paid מופרדים; ברירת מחדל Aggregate ולא user-level. |
| פלט | Dashboards/KPIs/filters המאפשרים זיהוי trends, funnels, demand/supply gaps ואיכות Recommendation. |
| מצב לאחר ביצוע | Admin יכול לקבל החלטות Product/Operations על בסיס מדדים; Raw Chat/Support/Tracker אינם מוצגים כ-dashboard analytics. |
| בעל אחריות לוגי (Page / Feature) | AdminAnalyticsPage / AdminAnalyticsFeature / AdminIntelligenceFeature |

## FR-ADMIN-011 — רשימת מוזמנים לבטא סגורה

| שדה | הגדרה |
|---|---|
| סטטוס | נדחה (13.10.2026) — ההרשמה פתוחה לכולם; לא נבנה כרגע. ההגדרה נשמרת אם תוחזר בטא סגורה |
| Actor | Admin |
| תיאור | לפני ההשקה הפתוחה Nestly פועלת כבטא סגורה. Admin מנהל רשימת כתובות אימייל מוזמנות, ורק אימייל ברשימה יכול להשלים הרשמה. בהשקה הפתוחה הרשימה מושבתת. |
| תנאים מוקדמים | Admin מחובר. |
| קלט / Trigger | הוספה או הסרה של כתובת אימייל, והפעלה או השבתה של מצב בטא. |
| תהליך מערכת | שמירת הרשימה ומצב הבטא; רישום Audit לכל שינוי. בהרשמה בזמן בטא, אימייל שאינו ברשימה נדחה בהודעה כללית (ERR-035). |
| פלט | רשימת מוזמנים מעודכנת ומצב בטא פעיל או מושבת. |
| מצב לאחר ביצוע | ההרשמה פתוחה רק למוזמנים, עד שהבטא מושבתת. |
| בעל אחריות לוגי (Page / Feature) | AdminBetaInvitesPage / BetaAccessFeature |

## FR-ADMIN-012 — ניהול תוכן מערכת — מדריכים לפי סטטוס

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר (החלטת אפיק מ-15.10.2026; סוגר את OP-024) |
| Actor | Admin |
| תיאור | Admin מנהל את המדריכים, שהם תוכן קבוע של המערכת: יצירה, עריכה, שיוך לסטטוס (תכנון הריון; הריון לפי שבוע או שליש; הורות לפי גיל הילד), פרסום והסתרה. מדריך מוצג למשתמשים רק אחרי שאושר ופורסם (BR-070). |
| תנאים מוקדמים | Admin מחובר. |
| קלט / Trigger | כותרת, גוף, סטטוס ושבוע/שליש/גיל, מקורות, פעולת פרסום או הסתרה. |
| תהליך מערכת | שמירת המדריך כתוכן מערכת עם המקורות ותאריך הבדיקה; ההערה "המידע אינו מחליף ייעוץ רפואי" מוצגת בכל מדריך; רישום Audit לכל פרסום, הסתרה ועריכה. |
| פלט | מדריך מפורסם או מוסתר. |
| מצב לאחר ביצוע | מדריך מפורסם מוצג לפי FR-HOME-004 למשתמשים בסטטוס המתאים. |
| בעל אחריות לוגי (Page / Feature) | AdminContentPage / SystemContentFeature |

## FR-ADMIN-013 — שחרור נעילת שחזור

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — החלטת אפיק מ-17.10.2026 (מדרג הנעילה, NFR-SEC-010); נבנה ב-I4 |
| Actor | Admin |
| תיאור | המערכת תאפשר ל-Admin לשחרר נעילת שחזור של חשבון (בעיקר נעילה קבועה), לבקשת המשתמש. |
| תנאים מוקדמים | Admin מחובר. המשתמש ביקש שחרור: מחובר — דרך Support (FR-ADMIN-001); לא מחובר — דרך כתובת התמיכה הציבורית, שתגיע עם הדומיין ושירות האימייל לפני ההשקה (§12). |
| קלט / Trigger | בחירת החשבון ב-Admin User Management (PG-028) ופעולת "שחרור נעילת שחזור". |
| תהליך מערכת | איפוס ספירת הכישלונות והנעילה של החשבון. השחרור אינו נותן גישה: אינו מחבר את המשתמש ואינו משנה סיסמה, והמשתמש עונה על שאלות השחזור כרגיל. הפעולה נרשמת ב-Audit Log (FR-ADMIN-005). Moderator — אין הרשאה. |
| פלט | אישור שהנעילה שוחררה. |
| מצב לאחר ביצוע | הניסיון הבא נבדק כרגיל, מספירה אפס (AC-126). |
| בעל אחריות לוגי (Page / Feature) | AdminUserManagementPage / RecoveryLockReleaseFeature |
