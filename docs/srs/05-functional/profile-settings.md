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
| תיאור | Regular User תמיד ניתן לאיתור ב-People Search. המשתמש יכול לקבוע אם הפרופיל פתוח לצפייה של מי שאינו Friend. **Restricted:** non-Friend רואה רק את ה-Basic Public Profile (§1.4): שם, תמונה, מספר הילדים, סטטוס הריון או תכנון הריון, Friends ו-Friends משותפים, ופעולת שליחת הודעה בכפוף ל-FR-CHAT-002. **Open:** non-Friend רואה את כל הפרופיל, למעט מדדים ונתונים שהמשתמש מתעד או מעלה על ילדים, הריון, מחזור וביוץ (Tracker Data). |
| תנאים מוקדמים | Regular User פעיל; צופה מחובר שאינו Friend. |
| קלט / Trigger | שינוי Profile Visibility ב-SettingsPage או פתיחת Regular Profile מתוצאת חיפוש. |
| תהליך מערכת | SettingsFeature שומר Open/Restricted. Search תמיד מחזיר את ה-Basic Public Profile. Restricted מגביל את הפרופיל ל-Basic Public Profile. Open מאפשר צפייה בכל הפרופיל, ו-Tracker Data לעולם אינו מוצג ל-non-Friend. Professional נחשב non-Friend, ורואה **בדיוק** מה ש-Regular non-Friend רואה (OP-020). פרטי ילדים שאינם Tracker Data, כגון שם ותאריך לידה, גלויים בפרופיל Open. התראת יום הולדת של ילד נשארת כפופה ל-BR-037. |
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
