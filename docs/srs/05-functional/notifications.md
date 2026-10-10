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
| תיאור | המערכת תאפשר ל-Regular User ול-Professional User לנהל את העדפות ה-Notification שלהם דרך אייקון Settings ב-Notification Dropdown ודרך SettingsPage. ההגדרות יוצגו באמצעות Toggles / Multi-select לפי סוגי אירועים, ובנוסף תתאפשר הגדרה ייעודית לכל Group ברמות All / Highlights / Off. |
| תנאים מוקדמים | משתמש מסוג Regular User או Professional User מחובר. |
| קלט / Trigger | פתיחת Notification Settings ושינוי בחירה של סוגי Notification או רמת Notification לקבוצה מסוימת. |
| תהליך מערכת | המערכת תשמור NotificationPreference ו-GroupNotificationPreference של המשתמש ותיישם אותן על Notifications עתידיים. Security/Critical Account Notifications נשארות פעילות ואינן ניתנות לכיבוי. שינוי העדפה אינו מוחק Notifications היסטוריים שכבר נוצרו. Admin/Moderator מקבלים Notifications לפי Role/Permission ואינם משתמשים בהגדרות החברתיות של Regular/Professional. הגדרת Highlights בקבוצה כפופה למנגנון האלגוריתמי שייקבע בנפרד. |
| פלט | העדפות Notification מעודכנות ואישור שמירה; ממשק ההגדרות מציג את המצב המעודכן. |
| מצב לאחר ביצוע | Notifications עתידיים מוצגים או מושתקים לפי העדפות המשתמש, למעט Security/Critical Notifications. היסטוריית Notifications קיימת נשמרת. |
| בעל אחריות לוגי (Page / Feature) | SettingsPage / NotificationSettingsFeature / NotificationsFeature |

## FR-NOTIF-003 — אירועי Notification לפי סוג משתמש

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | System |
| תיאור | המערכת תייצר Notification לפי Role, Permission והעדפות, ללא שימוש בהתראות המלצה על בסיס חיפוש/צריכת תוכן. |
| תנאים מוקדמים | אירוע מערכת מאושר התרחש. |
| קלט / Trigger | אירוע חברתי/קבוצתי/מסחרי/ניהולי. |
| תהליך מערכת | Regular: תגובה לפוסט, Reply לתגובה, Mention/Tag, Friend Request/Accepted, פוסט חדש של Friend רק אם המשתמש בחר לקבל עדכונים ממנו, אישור/דחיית Group Join, Group Invite/Recommendation, פעילות/Group Mention, יום הולדת ילד של Friend רק אם ההורה התיר שיתוף, סטטוס Marketplace, פוסט חדש של Professional שנעקב, System/Account. Professional: Content interactions, New Follower, Verification, Promotion status, Moderation action, Group events, System/Account; ללא Friend Requests/Birthdays. Admin: Support Request, Report, Professional Verification pending, Security/System Critical, Moderator significant action, Payment/Promotion issue. Moderator: רק אירועים בתחומים שיש לו Permission מתאים. |
| פלט | Notification מותאמת לנמען או לא נוצרת אם אינה מותרת. |
| מצב לאחר ביצוע | Chat messages נשארות ב-Chat Center ולא מוכפלות כהתראה רגילה. Recommendation content המבוסס על חיפוש/צריכה מופיע ב-Feed בלבד. |
| בעל אחריות לוגי (Page / Feature) | NotificationsFeature |
