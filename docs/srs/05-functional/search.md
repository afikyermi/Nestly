[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Search — חיפוש

## FR-SEARCH-001 — חיפוש

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | המערכת תאפשר Global Search מתוך מרכז ה-Top Bar עבור Posts, Groups ו-People. תוצאות ראשוניות יוצגו ב-Dropdown מחולק לפי סוג, ו-“הצג את כל התוצאות” יעביר ל-SearchResultsPage. |
| תנאים מוקדמים | משתמש Regular או Professional מחובר. |
| קלט / Trigger | מחרוזת חיפוש מתוך GlobalSearchInput או בחירת Filter ב-SearchResultsPage. |
| תהליך מערכת | המערכת תחפש People, Groups ו-Posts. כל Regular User פעיל יופיע ב-People Search לפחות עם שם, תמונה ומידע ציבורי בסיסי; Professional יסומן ככזה. פתיחת Regular Profile על ידי non-Friend כפופה ל-Regular Profile Visibility. Group יכול להופיע בחיפוש, אך Post מתוך Private Group מוצג רק ל-Member. חריגי Admin/Moderator זמינים רק דרך כלי ניהול ולא דרך Global Search. |
| פלט | Dropdown עם תוצאות מובילות לפי People / Groups / Posts, וקישור ל-SearchResultsPage עם Tabs: All / People / Groups / Posts. |
| מצב לאחר ביצוע | בחירת תוצאה מבצעת Deep Link לאחר Authorization. Regular User אינו יכול להסתיר את עצם קיומו מ-People Search. |
| בעל אחריות לוגי (Page / Feature) | SearchResultsPage / SearchFeature / GlobalSearchInput / DropdownPanel |
