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
| תהליך מערכת | טעינת Aggregates מאושרים בלבד; אין חשיפת זהות משתמשים, raw search queries, Child/Tracker או מידע פרטי מאחורי המדדים. |
| פלט | Dashboard עסקי עם Organic/Paid KPIs. |
| מצב לאחר ביצוע | בעל המקצוע יכול לעקוב אחר ביצועי הנוכחות והקידום שלו ללא User-level targeting data. |
| בעל אחריות לוגי (Page / Feature) | ProfessionalDashboardPage / ProfessionalDashboardFeature |

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
| בעל אחריות לוגי (Page / Feature) | ProfessionalDashboardFeature / ProfessionalPromotionFeature / PromotionAnalyticsPage |
