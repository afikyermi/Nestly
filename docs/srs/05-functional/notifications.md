[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Notifications — התראות

## FR-NOTIF-001 — התראות

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User / Admin / Moderator |
| תיאור | המערכת תציג Notification Center דרך Bell ב-Top Bar. לחיצה תפתח Dropdown של ההתראות האחרונות; ניתן לעבור ל-NotificationsPage מלא. כל Notification כולל Type, Actor/System, Text, Timestamp, Read/Unread ו-Target/Deep Link. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | אירוע מערכת מאושר בהתאם ל-Role/Permissions ולהעדפות ההתראות. |
| תהליך מערכת | המערכת תיצור Notification, תעדכן unread count ותציג את האירוע ב-Dropdown/Page אם הוא מותר לפי העדפות. Chat messages אינן מוכפלות כ-Notification רגילה; הן מופיעות ב-Chat badge/center. המלצות תוכן המבוססות על חיפוש/צריכה אינן Notifications ומופיעות רק ב-Feed. |
| פלט | Notification Dropdown + NotificationsPage, כולל Mark all as read, מעבר ליעד וכניסה להגדרות דרך אייקון Settings. |
| מצב לאחר ביצוע | ניתן לסמן Notification כנקראה. בחירה ב-Notification פותחת את יעדה רק לאחר בדיקת הרשאה מחדש. |
| בעל אחריות לוגי (Page / Feature) | NotificationsPage / NotificationsFeature |

## FR-NOTIF-002 — הגדרות Notification

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | המערכת תאפשר ל-Regular User ול-Professional User לנהל את העדפות ה-Notification שלהם דרך אייקון Settings ב-Notification Dropdown ודרך SettingsPage. ההגדרות יוצגו באמצעות Toggles / Multi-select לפי סוגי אירועים, ובנוסף תתאפשר הגדרה ייעודית לכל Group ברמות All / Highlights / Off. בשלב Web ערוץ ההתראות החברתי/מערכתי הוא In-App. בשלב Mobile קטגוריות מאופשרות יכולות להישלח גם כ-Push לפי העדפות המשתמש והרשאות המכשיר. |
| תנאים מוקדמים | משתמש מסוג Regular User או Professional User מחובר. |
| קלט / Trigger | פתיחת Notification Settings ושינוי בחירה של סוגי Notification או רמת Notification לקבוצה מסוימת. |
| תהליך מערכת | המערכת תשמור NotificationPreference ו-GroupNotificationPreference של המשתמש ותיישם אותן על Notifications עתידיים. Security/Critical Account Notifications נשארות פעילות ב-In-App ואינן ניתנות לכיבוי. שינוי העדפה אינו מוחק Notifications היסטוריים שכבר נוצרו. Admin/Moderator מקבלים Notifications לפי Role/Permission ואינם משתמשים בהגדרות החברתיות של Regular/Professional. בשלב Mobile, Push הוא ערוץ Delivery נוסף בלבד: הוא נשלח רק לקטגוריה מאופשרת, כאשר Push הופעל והרשאת מערכת ההפעלה קיימת; חסימת Push ברמת המכשיר אינה מבטלת את ה-Notification בתוך Nestly. Email/SMS אינם ערוץ להתראות חברתיות, קבוצתיות, Marketplace או Promotion; הם שמורים לתהליכים טכניים/חשבון/אבטחה שיאושרו בנפרד. הגדרת Highlights בקבוצה כפופה ל-FR-ALG-010. |
| פלט | העדפות Notification מעודכנות ואישור שמירה. ב-Web ההעדפות חלות על In-App; ב-Mobile הממשק מציג גם מצב Push כאשר הערוץ זמין והרשאת המכשיר ידועה. |
| מצב לאחר ביצוע | Notifications עתידיים מוצגים או מושתקים לפי העדפות המשתמש, למעט Security/Critical שחייבים להישאר ב-In-App. בשלב Mobile, Push נשלח רק אם הקטגוריה והערוץ מאופשרים והרשאת מערכת ההפעלה קיימת. היסטוריית Notifications קיימת נשמרת. |
| בעל אחריות לוגי (Page / Feature) | SettingsPage / NotificationSettingsFeature / NotificationsFeature |

## FR-NOTIF-003 — אירועי Notification לפי סוג משתמש

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | System |
| תיאור | המערכת תייצר Notification לפי Role, Permission והעדפות, ללא שימוש בהתראות המלצה על בסיס חיפוש/צריכת תוכן. |
| תנאים מוקדמים | אירוע מערכת מאושר התרחש. |
| קלט / Trigger | אירוע חברתי/קבוצתי/מסחרי/ניהולי. |
| תהליך מערכת | Regular: תגובה לפוסט, Reply לתגובה, Mention/Tag, שיתוף של הפוסט שלי בפיד (FR-FEED-006), Friend Request/Accepted, פוסט חדש של Friend רק אם המשתמש בחר לקבל עדכונים ממנו (לא עבור Anonymous Post — FR-FEED-005), אישור/דחיית Group Join, Group Invite/Recommendation, פעילות/Group Mention, יום הולדת ילד של Friend רק אם ההורה התיר שיתוף, סטטוס Marketplace, פוסט חדש של Professional שנעקב, System/Account. Professional: Content interactions, New Follower, Promotion status, Moderation action, Group events, System/Account; ללא Friend Requests/Birthdays. Admin: Support Request, Report, Security/System Critical, Moderator significant action, Payment/Promotion issue. Moderator: רק אירועים בתחומים שיש לו Permission מתאים. אירועי אימות מקצועי אינם קיימים (OP-005 נסגר, 18.10.2026). |
| פלט | Notification מותאמת לנמען או לא נוצרת אם אינה מותרת. בשלב Mobile, Notification מאושרת יכולה להישלח גם כ-Push בהתאם ל-FR-NOTIF-002; ה-Push מפנה לאותו Target/Deep Link ואינו יוצר אירוע עסקי נפרד. |
| מצב לאחר ביצוע | Chat messages נשארות ב-Chat Center ולא מוכפלות כהתראה רגילה. Recommendation content המבוסס על חיפוש/צריכה מופיע ב-Feed בלבד. Email/SMS אינם משמשים להפצת התראות חברתיות/קבוצתיות/מסחריות שוטפות. |
| בעל אחריות לוגי (Page / Feature) | NotificationsFeature |
