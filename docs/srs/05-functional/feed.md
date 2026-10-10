[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Feed — פיד, פוסטים והתאמה לשלב

## FR-FEED-001 — הצגת Feed

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — v1 Rule-Based |
| Actor | Regular User / Professional User |
| תיאור | המערכת תציג Feed מותאם הכולל תוכן קהילתי ומודולי Recommendation מאושרים. Candidate Types יכולים לכלול Posts, Groups, Professionals, Marketplace/Product/Article units ו-Sponsored units בהתאם לסוג המשתמש וההרשאות. |
| תנאים מוקדמים | Session פעיל. |
| קלט / Trigger | Role + Context מאושר + Personalization Signals + Eligible Content. |
| תהליך מערכת | Eligibility → Candidate Generation → Ranking → Re-ranking. ההבדל בין Regular ו-Professional מפורט ב-FR-ALG-002/003 ובסעיף 18. |
| פלט | Feed Units מדורגים ומסומנים לפי Organic/Sponsored. |
| מצב לאחר ביצוע | Impressions/Interactions נרשמים ב-AnalyticsEventFeature ומשפיעים על אותות עתידיים בהתאם למדיניות. |
| בעל אחריות לוגי (Page / Feature) | FeedFeature / RuleBasedRecommendationEngine |

## FR-FEED-002 — יצירת פוסט/שאלה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר/נגזר מהקונספט |
| Actor | Regular/Professional |
| תיאור | המערכת תאפשר יצירת תוכן חדש מתוך רכיב כתיבה/יצירת פוסט. |
| תנאים מוקדמים | משתמש מחובר. אם היעד הוא Group, המשתמש חייב להיות Member פעיל בקבוצה. |
| קלט / Trigger | טקסט, תמונות ו/או סרטונים בהתאם למגבלות המדיה שייקבעו. |
| תהליך מערכת | בדיקת קלט/מדיה; אם ההקשר הוא Group מתבצעת בדיקת Membership והרשאת פרסום לפני שמירת הפוסט. |
| פלט | פוסט חדש מופיע בהתאם לכללי החשיפה. |
| מצב לאחר ביצוע | הפוסט נשמר. |
| בעל אחריות לוגי (Page / Feature) | CreatePostFeature |

## FR-FEED-003 — תגובה ואינטראקציה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר/נגזר מהקונספט |
| Actor | Regular/Professional |
| תיאור | המערכת תאפשר תגובה, Reply לתגובה, Mention/Tag ו-Reaction לתוכן קהילתי. סוגי Reaction המדויקים TBD. |
| תנאים מוקדמים | פוסט זמין לצפייה. אם הפוסט שייך ל-Group, נדרשת Membership פעילה לצורך תגובה/Reply/Reaction. |
| קלט / Trigger | תגובה / Reply / Mention / Tag / Reaction. |
| תהליך מערכת | בדיקת הרשאות ההקשר, שמירת האינטראקציה ועדכון מוני/תצוגה. Reply/Mention/Tag מייצרים אירוע Notification בהתאם ל-FR-NOTIF-003 ולהעדפות הנמען. |
| פלט | האינטראקציה מוצגת. |
| מצב לאחר ביצוע | נשמרת אינטראקציה משויכת למשתמש ולפוסט. |
| בעל אחריות לוגי (Page / Feature) | PostInteractionFeature |

## FR-FEED-004 — התאמה לפי שלב

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — v1 Rule-Based; משקולות וספים ניתנים לכיול |
| Actor | System |
| תיאור | My Stage/JourneyContext הוא Signal מרכזי לרלוונטיות של Regular User אך אינו Hard Filter; חיפוש/Intent מפורש יכול להעלות תוכן מחוץ לשלב כאשר הוא רלוונטי. |
| תנאים מוקדמים | Regular User עם Context פעיל או מידע Stage זמין. |
| קלט / Trigger | JourneyContext/Stage + Content Stage Metadata + Signals נוספים. |
| תהליך מערכת | המערכת מחשבת Stage Match, משלבת אותו בציון הכולל ומחילה Re-ranking. כאשר Stage חסר, האלגוריתם ממשיך ללא רכיב Stage. |
| פלט | Feed/Guidance שבו Stage משפיע על סדר התוכן בלי לחסום נושאים מפורשים אחרים. |
| מצב לאחר ביצוע | הצגת התוכן נרשמת כ-Impression לצורך מדידת איכות ההתאמה. |
| בעל אחריות לוגי (Page / Feature) | FeedFeature / RuleBasedRecommendationEngine |
