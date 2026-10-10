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
| תהליך מערכת | בדיקת הרשאות ההקשר, שמירת האינטראקציה ועדכון מוני/תצוגה. Reply/Mention/Tag מייצרים אירוע Notification בהתאם ל-FR-NOTIF-003 ולהעדפות הנמען. בפוסט אנונימי, תגובה של המחבר עצמו מוצגת תחת "המחבר" (FR-FEED-005). |
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

## FR-FEED-005 — פרסום פוסט אנונימי

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר (10.10.2026). כללי הפירוט נסגרו ב-OP-019 |
| Actor | Regular User בלבד. Professional User אינו רשאי לפרסם באופן אנונימי |
| תיאור | בעת יצירת פוסט או שאלה, Regular User יכול לבחור לפרסם באופן אנונימי, בכל מקום שבו הוא רשאי לפרסם: Feed, וכל Group שהוא Member פעיל בה. זהותו אינה מוצגת למשתמשי קהילה אחרים, והפוסט מוצג תחת זהות תצוגה אנונימית. |
| תנאים מוקדמים | Regular User מחובר. אם היעד הוא Group — Membership פעילה, כמו ב-FR-FEED-002. |
| קלט / Trigger | בחירת "פרסום אנונימי" ביצירת הפוסט, בנוסף לקלט של FR-FEED-002. |
| תהליך מערכת | הפוסט נשמר עם מזהה המחבר האמיתי וסימון אנונימיות. בכל תצוגה, תוצאת חיפוש, Notification ו-API, המערכת מחזירה למשתמש קהילה זהות אנונימית בלבד: ללא שם, תמונה או קישור לפרופיל. **כללים:** (1) תגובה או Reply של המחבר בשרשור הפוסט האנונימי שלו מוצגת תחת "המחבר" ולא בשמו. משתמשים אחרים אינם יכולים להגיב באופן אנונימי ב-v1. (2) פוסט אנונימי אינו מייצר Notification שמזהה את המחבר, למשל "פוסט חדש של Friend". (3) פוסט אנונימי אינו נכנס כ-Candidate ואינו מקבל Social Relevance דרך הגרף החברתי של המחבר — Friends, Follows וקבוצות משותפות — כדי שלא ניתן יהיה להסיק את זהותו. הוא מדורג לפי Stage, Interest, Quality ו-Freshness בלבד. (4) Professional רשאי לשלוח Offer Help לפוסט אנונימי (FR-SERV-005). הבקשה נמסרת למחבר בלי לחשוף את זהותו לבעל המקצוע, והזהות נחשפת רק אם המחבר מאשר את הבקשה ונפתחת שיחה. (5) הפוסט אינו נספר במוניטין, ב-Give Back או במונים ציבוריים בפרופיל המחבר. (6) Admin רואה את המחבר האמיתי במסגרת הגישה המלאה (סעיף 1.3). Moderator רשאי לחשוף את זהות המחבר רק דרך כלי ה-Moderation, בעת טיפול בדיווח על אותו פוסט, ובהרשאות REPORTS_VIEW ו-CONTENT_MODERATE. כל חשיפה כזו נרשמת ב-Audit Log. |
| פלט | פוסט אנונימי מוצג לפי כללי החשיפה הרגילים, ללא פרטי מחבר. |
| מצב לאחר ביצוע | זהות המחבר שמורה במערכת לצורכי Moderation ואכיפה, ואינה נחשפת למשתמשי קהילה. |
| בעל אחריות לוגי (Page / Feature) | CreatePostFeature / FeedFeature |
