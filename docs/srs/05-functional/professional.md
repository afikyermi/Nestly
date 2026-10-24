[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Professional — דשבורד ואנליטיקה מקצועית

## FR-PRO-001 — Professional Dashboard

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — Core KPI מוגדרים ב-FR-PRO-002 ובסעיף 18.7 |
| Actor | Professional User |
| תיאור | המערכת תספק לבעל מקצוע מסך ניהול עסקי במקום חוויית מעקב הורי. המסך ירכז Profile Views, Followers, Organic Reach/Engagement, Chat Starts ו-Promotion Analytics, תוך הפרדה בין Organic ל-Paid. |
| תנאים מוקדמים | Professional User מחובר. |
| קלט / Trigger | Aggregated events של ProfessionalProfile, Post ו-Promotion השייכים לחשבון המקצועי. |
| תהליך מערכת | טעינת Aggregates מאושרים בלבד; אין חשיפת זהות משתמשים, raw search queries, Child/Tracker או מידע פרטי מאחורי המדדים. הבית של Professional הוא לוח הבקרה (AC-018), בסדר הזה (החלטת אפיק מ-21.10.2026): (1) **"מחכה לך"** — שיחות עם הודעות שלא נקראו, הצעות עזרה שאושרו וביקורות חדשות (לפי ההתראות שלא נקראו), כל אחד עם קישור; (2) **פוסטים בתחום שלך** — הפוסטים האחרונים בתחום שלו שהוא רשאי להציע עליהם עזרה (PG-057, החלטת אפיק מ-24.10.2026), עם המונה "הצעות עזרה היום: X מתוך 100" וקישור לכל הרשימה; (3) **מדדים** — שיחות חדשות ב-30 יום, עוקבים, דירוג ומספר ביקורות, ושיעור ההצעות שאושרו מתוך ההצעות שנענו; (4) **השלמת הפרופיל** — פס התקדמות לפי השדות שמולאו, והשדות שחסרים; (5) **תוצאות התוכן** — לייקים ותגובות של אחרים על הפוסטים שלו ב-30 יום, פוסטים ב-30 יום ומאמרים; (6) **קידום** — עד שהקידום בתשלום נבנה (FR-PRO-002) נאמר שהוא עדיין לא זמין, בלי נתונים מדומים. Profile Views ו-Reach אינם מוצגים עד שאירועי השימוש נאספים (§13.3, OP-039); Promotion — FR-PRO-002. לא ניתן לראות מי עוקב או מי כתב ביקורת. |
| פלט | Dashboard עסקי עם Organic/Paid KPIs. |
| מצב לאחר ביצוע | בעל המקצוע יכול לעקוב אחר ביצועי הנוכחות והקידום שלו ללא User-level targeting data. |
| בעל אחריות לוגי (Page / Feature) | מסך לוח הבקרה המקצועי / נתוני לוח הבקרה המקצועי |

## FR-PRO-002 — Professional Performance & Promotion Analytics v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Professional User |
| תיאור | Professional Dashboard/Promotion Analytics יציגו רק מדדים מצטברים של החשבון המקצועי: Profile Views, Followers, Organic Reach/Engagement, Chat Starts, Paid Impressions/Clicks/Profile Visits/Follows/Chat Starts ועלות נגזרת אם זמינה. |
| תנאים מוקדמים | Professional User מחובר ובבעלותו התוכן/Promotion. |
| קלט / Trigger | Aggregated events של ProfessionalProfile/Post/Promotion. |
| תהליך מערכת | Aggregation לפי תקופה ו-Organic/Paid source; אין חשיפת identity, search terms או private data של משתמשים בודדים. |
| פלט | Professional KPIs ו-Promotion performance. |
| מצב לאחר ביצוע | בעל המקצוע יכול להעריך ביצועים וקידום בלי לקבל User-level targeting data. |
| בעל אחריות לוגי (Page / Feature) | נתוני לוח הבקרה המקצועי / קידום מקצועי / מסך תוצאות הקידום |

## FR-PRO-003 — פרסום מאמר מקצועי

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר (החלטת אפיק מ-15.10.2026) |
| Actor | Professional User |
| תיאור | בעל מקצוע יכול לפרסם מאמר בתחום שלו, שמוצג בפרופיל המקצועי שלו. האחריות לתוכן היא שלו, וליד המאמר מוצגת הערת אחריות (BR-071). |
| תנאים מוקדמים | Professional Profile פעיל. |
| קלט / Trigger | כותרת, גוף המאמר ותחום. |
| תהליך מערכת | שמירת המאמר בבעלות בעל המקצוע; עריכה, הסתרה ומחיקה רק על ידי הבעלים, או על ידי Admin/Moderator בכלי האכיפה. המאמר כפוף לדיווח ולאכיפה (FR-MOD-001), ואינו מאבחן ואינו ממליץ באופן אישי (BR-012). |
| פלט | מאמר מוצג בפרופיל המקצועי, עם הערת האחריות. |
| מצב לאחר ביצוע | צפיות במאמר נספרות כמדד מצטבר ב-Professional Dashboard (FR-PRO-002), בלי זהות הצופים. |
| בעל אחריות לוגי (Page / Feature) | מסך פרופיל מקצועי / מאמרים מקצועיים |
