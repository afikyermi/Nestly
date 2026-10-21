[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Notifications — התראות

## FR-NOTIF-001 — התראות

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User / Admin / Moderator |
| תיאור | המערכת תציג Notification Center דרך Bell ב-Top Bar. לחיצה תפתח Dropdown של ההתראות האחרונות; ניתן לעבור למסך ההתראות מלא. כל Notification כולל Type, Actor/System, Text, Timestamp, Read/Unread ו-Target/Deep Link. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | אירוע מערכת מאושר בהתאם ל-Role/Permissions ולהעדפות ההתראות. |
| תהליך מערכת | המערכת תיצור Notification, תעדכן unread count ותציג את האירוע ב-Dropdown/Page אם הוא מותר לפי העדפות. Chat messages אינן מוכפלות כ-Notification רגילה; הן מופיעות ב-Chat badge/center. המלצות תוכן המבוססות על חיפוש/צריכה אינן Notifications ומופיעות רק ב-Feed. **בעל מקצוע** (החלטת אפיק מ-21.10.2026; OP-051 בוטל): התראה כשהצעת עזרה שלו אושרה או נדחתה וכשנכתבה עליו ביקורת חדשה, בלי לציין מי אישר, דחה או כתב; עוקבים חדשים מגיעים כסיכום שבועי אחד, שמופיע כשהשבוע נסגר (יום שני ב-00:00, שעון ישראל) עם מספר העוקבים החדשים באותו שבוע, בלי שמות, ומוביל ללוח הבקרה. שבוע שלא נשאר בו עוקב חדש אינו מוצג. אין התראות בין משתמשים שחסמו זה את זה. |
| פלט | Notification Dropdown + מסך ההתראות, כולל Mark all as read, מעבר ליעד וכניסה להגדרות דרך אייקון Settings. |
| מצב לאחר ביצוע | ניתן לסמן Notification כנקראה. בחירה ב-Notification פותחת את יעדה רק לאחר בדיקת הרשאה מחדש. |
| בעל אחריות לוגי (Page / Feature) | מסך ההתראות / מרכז ההתראות |

## FR-NOTIF-002 — הגדרות Notification

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | המערכת תאפשר ל-Regular User ול-Professional User לנהל את העדפות ה-Notification שלהם דרך אייקון Settings ב-Notification Dropdown ודרך מסך ההגדרות. ההגדרות יוצגו באמצעות Toggles / Multi-select לפי סוגי אירועים, ובנוסף תתאפשר הגדרה ייעודית לכל Group ברמות All / Highlights / Off. בשלב Web ערוץ ההתראות החברתי/מערכתי הוא In-App. בשלב Mobile קטגוריות מאופשרות יכולות להישלח גם כ-Push לפי העדפות המשתמש והרשאות המכשיר. לבעל מקצוע שלוש קטגוריות משלו: הצעות עזרה שאושרו או נדחו, ביקורות חדשות, וסיכום שבועי של עוקבים חדשים (החלטת אפיק מ-21.10.2026); אין לו קטגוריות של חברים. ל-Regular אין את שלוש הקטגוריות האלה, ויש לו קטגוריה של "ימי הולדת של ילדים של חברים" (BR-037). |
| תנאים מוקדמים | משתמש מסוג Regular User או Professional User מחובר. |
| קלט / Trigger | פתיחת Notification Settings ושינוי בחירה של סוגי Notification או רמת Notification לקבוצה מסוימת. |
| תהליך מערכת | המערכת תשמור NotificationPreference ו-GroupNotificationPreference של המשתמש ותיישם אותן על Notifications עתידיים. Security/Critical Account Notifications נשארות פעילות ב-In-App ואינן ניתנות לכיבוי. שינוי העדפה אינו מוחק Notifications היסטוריים שכבר נוצרו. Admin/Moderator מקבלים Notifications לפי Role/Permission ואינם משתמשים בהגדרות החברתיות של Regular/Professional. בשלב Mobile, Push הוא ערוץ Delivery נוסף בלבד: הוא נשלח רק לקטגוריה מאופשרת, כאשר Push הופעל והרשאת מערכת ההפעלה קיימת; חסימת Push ברמת המכשיר אינה מבטלת את ה-Notification בתוך Nestly. Email/SMS אינם ערוץ להתראות חברתיות, קבוצתיות, Marketplace או Promotion; הם שמורים לתהליכים טכניים/חשבון/אבטחה שיאושרו בנפרד. הגדרת Highlights בקבוצה כפופה ל-FR-ALG-010. |
| פלט | העדפות Notification מעודכנות ואישור שמירה. ב-Web ההעדפות חלות על In-App; ב-Mobile הממשק מציג גם מצב Push כאשר הערוץ זמין והרשאת המכשיר ידועה. |
| מצב לאחר ביצוע | Notifications עתידיים מוצגים או מושתקים לפי העדפות המשתמש, למעט Security/Critical שחייבים להישאר ב-In-App. בשלב Mobile, Push נשלח רק אם הקטגוריה והערוץ מאופשרים והרשאת מערכת ההפעלה קיימת. היסטוריית Notifications קיימת נשמרת. |
| בעל אחריות לוגי (Page / Feature) | מסך ההגדרות / הגדרות ההתראות / מרכז ההתראות |

## FR-NOTIF-003 — אירועי Notification לפי סוג משתמש

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | System |
| תיאור | המערכת תייצר Notification לפי Role, Permission והעדפות, ללא שימוש בהתראות המלצה על בסיס חיפוש/צריכת תוכן. |
| תנאים מוקדמים | אירוע מערכת מאושר התרחש. |
| קלט / Trigger | אירוע חברתי/קבוצתי/מסחרי/ניהולי. |
| תהליך מערכת | Regular: תגובה לפוסט, Reply לתגובה, שיתוף של הפוסט שלי בפיד (FR-FEED-006), Friend Request/Accepted, פוסט חדש של Friend רק אם המשתמש בחר לקבל עדכונים ממנו (לא עבור Anonymous Post — FR-FEED-005), אישור/דחיית Group Join, Group Invite/Recommendation, פעילות בקבוצה, יום הולדת ילד של Friend רק אם ההורה התיר שיתוף, סטטוס Marketplace, פוסט חדש של Professional שנעקב, System/Account. Professional: Content interactions, New Follower, Promotion status, Moderation action, Group events, System/Account; ללא Friend Requests/Birthdays. לייק אינו מייצר Notification (זהות מי שסימן לייק אינה נחשפת בשום מסך). Admin: Support Request, Report, Security/System Critical, Moderator significant action, Payment/Promotion issue. Moderator: רק אירועים בתחומים שיש לו Permission מתאים. אירועי אימות מקצועי אינם קיימים (OP-005 נסגר, 18.10.2026). |
| פלט | Notification מותאמת לנמען או לא נוצרת אם אינה מותרת. בשלב Mobile, Notification מאושרת יכולה להישלח גם כ-Push בהתאם ל-FR-NOTIF-002; ה-Push מפנה לאותו Target/Deep Link ואינו יוצר אירוע עסקי נפרד. |
| מצב לאחר ביצוע | Chat messages נשארות ב-Chat Center ולא מוכפלות כהתראה רגילה. Recommendation content המבוסס על חיפוש/צריכה מופיע ב-Feed בלבד. Email/SMS אינם משמשים להפצת התראות חברתיות/קבוצתיות/מסחריות שוטפות. |
| בעל אחריות לוגי (Page / Feature) | מרכז ההתראות |
