[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Marketplace

## FR-MKT-001 — צפייה ב-Marketplace

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר/נגזר מהקונספט |
| Actor | Regular/Professional |
| תיאור | המערכת תציג עמוד Marketplace כאוסף פרסומי מוצרים. העמוד יכלול Marketplace Listings שמשתמשים רגילים מפרסמים לצורך מכירה/מסירה, וכן תוכן מסחרי/מוצרים ממומנים לפי המודל העסקי. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | Marketplace Listings, Sponsored Products/Content ונתוני קידום. |
| תהליך מערכת | טעינת פריטים והצגתם לפי סוג המקור והקידום. |
| פלט | רשימת פריטי Marketplace עם זיהוי ברור של סוג הפרסום. |
| מצב לאחר ביצוע | המשתמש יכול לבחור פריט/מוצר. |
| בעל אחריות לוגי (Page / Feature) | MarketplaceFeature |

## FR-MKT-002 — יצירת Marketplace Listing

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User |
| תיאור | המערכת תאפשר למשתמש רגיל ליצור Marketplace Listing נפרדת מפוסט קהילתי רגיל, לצורך מכירה או מסירה של מוצר. |
| תנאים מוקדמים | משתמש רגיל מחובר. |
| קלט / Trigger | פרטי המוצר, מלל ותמונות/סרטונים בהתאם למגבלות שיוגדרו. |
| תהליך מערכת | ולידציה ושמירת Listing עם sourceType של משתמש רגיל. |
| פלט | Marketplace Listing חדשה. |
| מצב לאחר ביצוע | הפריט מופיע ב-Marketplace בהתאם לכללי החשיפה. |
| בעל אחריות לוגי (Page / Feature) | MarketplaceFeature |

## FR-MKT-003 — הפרדת סוגי פרסום מסחרי

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר/נגזר מהקונספט |
| Actor | System |
| תיאור | המערכת תבדיל חזותית ולוגית בין Marketplace Listing אורגנית של משתמש רגיל, Marketplace Listing מקודמת בתשלום על ידי משתמש רגיל, ומוצר/תוכן ממומן של חברה או ספונסר. |
| תנאים מוקדמים | קיים פריט ממומן. |
| קלט / Trigger | sourceType + promotionType. |
| תהליך מערכת | המערכת מחילה סימון/וריאציה מתאימים לפי מקור הפרסום וסוג הקידום. |
| פלט | המשתמש יכול לזהות מי פרסם את הפריט והאם מדובר בקידום משתמש או בפרסום חברה/ספונסר. |
| מצב לאחר ביצוע | המשתמש יכול לזהות תוכן מסחרי. |
| בעל אחריות לוגי (Page / Feature) | MarketplaceFeature |

## FR-MKT-004 — קידום Marketplace Listing של משתמש רגיל

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר ברמת יכולת; מחיר/משך/קהל TBD |
| Actor | Regular User |
| תיאור | המערכת תאפשר למשתמש רגיל לרכוש קידום בתשלום ל-Marketplace Listing שלו. |
| תנאים מוקדמים | Listing פעילה בבעלות המשתמש. |
| קלט / Trigger | בחירת אפשרות קידום ותנאי קמפיין שייקבעו. |
| תהליך מערכת | יצירת Promotion המשויכת ל-Listing ושמירת סוג הקידום כ-User Promoted Listing. |
| פלט | Listing מקודמת ומסומנת בהתאם. |
| מצב לאחר ביצוע | הקידום מוצג באופן שונה מפרסום של חברה/ספונסר. |
| בעל אחריות לוגי (Page / Feature) | MarketplaceFeature / MarketplacePromotionFeature |

## FR-MKT-005 — פתיחת פריט/מוצר

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר/נגזר מהקונספט |
| Actor | Regular/Professional |
| תיאור | המערכת תאפשר לפתוח Marketplace Listing או Sponsored Product לקבלת מידע נוסף. מתוך Marketplace Listing פעיל ניתן לפתוח Marketplace Chat עם בעל ה-Listing בהתאם ל-FR-CHAT-002; החריג חל גם כאשר השולח Professional והבעלים Regular. |
| תנאים מוקדמים | הפריט זמין. |
| קלט / Trigger | בחירת פריט Marketplace. |
| תהליך מערכת | טעינת פרטי הפריט וסוג המקור. Listing פעיל יכול להציג Message לבעל ה-Listing; Sponsored Product מציג פעולת המשך מסחרית בהתאם להגדרתו. |
| פלט | Marketplace Item Detail ופעולת המשך מתאימה לפי סוג המקור. |
| מצב לאחר ביצוע | נרשמת צפייה/פעולת המשך לפי צורך. |
| בעל אחריות לוגי (Page / Feature) | MarketplaceDetailPage |
