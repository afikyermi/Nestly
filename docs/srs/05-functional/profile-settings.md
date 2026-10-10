[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Profile, Privacy & Settings — פרופיל, פרטיות והגדרות

## FR-PROFILE-001 — צפייה ועריכת פרופיל

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר/נגזר מהקונספט |
| Actor | Regular/Professional |
| תיאור | המערכת תאפשר גישה לעמוד פרופיל המכיל את המידע הניתן לעריכה של המשתמש. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | שדות פרופיל. |
| תהליך מערכת | טעינה/עדכון לאחר ולידציה. |
| פלט | פרופיל מעודכן. |
| מצב לאחר ביצוע | הנתונים נשמרים. |
| בעל אחריות לוגי (Page / Feature) | UserProfilePage / ProfileEditingFeature |

## FR-PROFILE-002 — ניהול מסלולים/ילדים

| שדה | הגדרה |
|---|---|
| סטטוס | לוגיקת כמה מסלולים פעילים במקביל TBD |
| Actor | Regular User |
| תיאור | המערכת תאפשר לנהל את נתוני הילד/ים והמסלולים המשויכים לפרופיל. |
| תנאים מוקדמים | משתמש רגיל מחובר. |
| קלט / Trigger | הוספה/עריכה/בחירת מסלול. |
| תהליך מערכת | שמירת הנתונים ועדכון My Stage. |
| פלט | פרופיל ו-Dashboard מעודכנים. |
| מצב לאחר ביצוע | Context המשתמש מתעדכן. |
| בעל אחריות לוגי (Page / Feature) | JourneyManagementFeature |

## FR-PRIV-001 — פרטיות פרופיל Regular מול non-Friends

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / System |
| תיאור | Regular User תמיד ניתן לאיתור ב-People Search. המשתמש יכול לקבוע אם הפרופיל פתוח לצפייה של מי שאינו Friend. כאשר אינו פתוח, non-Friend רואה רק שם, תמונה ומידע ציבורי בסיסי ואינו מקבל גישה לפרטי הורות/ילדים/Tracker או תוכן פרופיל שאינו ציבורי. |
| תנאים מוקדמים | Regular User פעיל; צופה מחובר שאינו Friend. |
| קלט / Trigger | שינוי Profile Visibility ב-SettingsPage או פתיחת Regular Profile מתוצאת חיפוש. |
| תהליך מערכת | SettingsFeature שומר Open/Restricted. Search תמיד מחזיר כרטיס בסיסי. Restricted מגביל את הפרופיל למידע בסיסי בלבד; Open מאפשר פתיחת הפרופיל וצפייה רק בחלקים שהוגדרו ציבוריים. Professional נחשב non-Friend. |
| פלט | תצוגת פרופיל בהתאם ל-Visibility ללא הסתרה מ-People Search. |
| מצב לאחר ביצוע | הגדרת הפרטיות נשמרת ומיושמת בכל פתיחת Profile/Deep Link. |
| בעל אחריות לוגי (Page / Feature) | SettingsPage / SettingsFeature / UserProfilePage / SearchFeature |

## FR-SET-001 — Settings ויעדי Side Menu

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | המערכת תרכז Account, Privacy & Security, Notification Settings ו-Terms/Privacy ב-SettingsPage מרכזי. Professional Verification, Promotion ו-Billing יהיו Pages עצמאיים. |
| תנאים מוקדמים | Regular או Professional מחובר. |
| קלט / Trigger | בחירת יעד הגדרות מתוך Side Menu. |
| תהליך מערכת | SideMenuFeature מנווט ל-SettingsPage ול-Section המתאים, או ל-Page עצמאי עבור Following/Verification/Promotion/Billing. |
| פלט | עמוד/Section היעד מוצג. |
| מצב לאחר ביצוע | שינויים נשמרים באמצעות Feature הייעודי. |
| בעל אחריות לוגי (Page / Feature) | SideMenuFeature / SettingsPage / SettingsFeature |
