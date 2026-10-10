[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Moderation — דיווחים ואכיפה

## FR-MOD-001 — דיווח על תוכן או משתמש

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר ברמת קטגוריות בסיס |
| Actor | Regular User / Professional User |
| תיאור | המערכת תאפשר לדווח על פוסט או משתמש. בין סיבות הדיווח המאושרות: פוסט פרסומי ללא שיתוף ידע רלוונטי, ספאם, ודיווח על משתמש. |
| תנאים מוקדמים | המשתמש מחובר ויעד הדיווח זמין. |
| קלט / Trigger | בחירת Report, יעד וסיבה. |
| תהליך מערכת | שמירת Report והעברתו ל-Admin ולממשק Moderation. Moderator יכול לטפל בדיווח רק אם ה-Admin הקצה לו הרשאת Moderation מתאימה. |
| פלט | אישור קליטת הדיווח. |
| מצב לאחר ביצוע | הדיווח מופיע בממשק Moderation בהתאם להרשאות. |
| בעל אחריות לוגי (Page / Feature) | ModerationFeature |

## FR-MOD-002 — פעולות אכיפה על משתמשים

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Admin / Moderator בהתאם להרשאה |
| תיאור | המערכת תאפשר פעולות אכיפה לפי Permission Keys: USER_WARN לאזהרה; USER_SUSPEND להשעיה זמנית; USER_BAN לחסימה מלאה הפיכה ול-Unban. Admin יכול לבצע את כל הפעולות. |
| תנאים מוקדמים | Actor מחובר; Admin או Moderator עם Permission Key מתאים. Moderator אינו רשאי להפעיל אכיפה על Admin, על עצמו או על Moderator אחר. |
| קלט / Trigger | משתמש יעד + פעולה + סיבה; במקרה Suspension גם משך/מועד סיום. |
| תהליך מערכת | בדיקת Permission בצד ה-Backend; בדיקת Target; ביצוע Warning/Suspension/Ban/Unban; עדכון סטטוס החשבון ורישום Audit. ניהול/השבתת Moderator מתבצעים רק ע"י Admin דרך FR-ADMIN-004. |
| פלט | אישור הפעולה וסטטוס החשבון המעודכן. |
| מצב לאחר ביצוע | Warning נשמר; Suspension מגביל את החשבון זמנית; Ban חוסם את החשבון במלואו אך ניתן לשחרור באמצעות Unban על ידי Admin או Moderator בעל USER_BAN. |
| בעל אחריות לוגי (Page / Feature) | AdminUserManagementPage / UserManagementFeature / ModerationFeature |

## FR-MOD-003 — טיפול בדיווחים ובתוכן מדווח

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — נגזר מ-Permission Matrix ומנגנון הדיווחים |
| Actor | Admin / Moderator בהתאם להרשאות |
| תיאור | המערכת תאפשר לפתוח תור דיווחים, לבחון Report ויעדו, לבצע פעולת טיפול מותרת ולעדכן את סטטוס הדיווח. |
| תנאים מוקדמים | Admin מחובר, או Moderator עם REPORTS_VIEW. פעולת תוכן דורשת CONTENT_MODERATE או MARKETPLACE_MODERATE; גישה לתוכן Private Group שאינו Member דורשת בנוסף PRIVATE_GROUP_MODERATE. פעולת אכיפה דורשת Permission מתאים. |
| קלט / Trigger | בחירת Report מתוך AdminModerationPage. |
| תהליך מערכת | טעינת הדיווח והיעד ובדיקת Permission. Admin רשאי לגשת לתוכן Private Group לצורך ניהול. Moderator שאינו Member יקבל גישה נקודתית רק אם הוקצתה PRIVATE_GROUP_MODERATE ובמסגרת טיפול בדיווח/אירוע ניהולי; אין בכך Membership או גלישה חופשית. לאחר מכן מתבצעת פעולה מותרת והגישה/הפעולה נרשמות ב-Audit Log. |
| פלט | Report וסטטוס הטיפול מתעדכנים; הפעולה שבוצעה משתקפת ביעד בהתאם להרשאה. |
| מצב לאחר ביצוע | הדיווח נשמר עם סטטוס טיפול והפעולה הניהולית ניתנת למעקב ב-Audit Log. |
| בעל אחריות לוגי (Page / Feature) | AdminModerationPage / ModerationFeature |
