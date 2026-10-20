[← אינדקס ה-SRS](INDEX.md)

# 4. ארכיטקטורת Pages, Features ו-Components

הסעיף מתאר את יחידות הממשק של המוצר: רכיבי ממשק משותפים, רכיבי תחום, יכולות (Feature) ומסכים (Page). שלב ה-Web מפותח ב-React. רק לאחר השלמת גרסת ה-Web ואישור מפורש למעבר לשלב הבא, יפותח שלב האפליקציה באמצעות React Native.

## 4.1 שמות היחידות

שמות היחידות בסעיף 4.2 הם שמות לוגיים של מסכים ורכיבי ממשק, והם אינם מכתיבים מבנה קוד. המימוש יכול להשתנות בלי לשנות את ההתנהגות המוגדרת ב-SRS.

## 4.2 מודל השכבות

הטבלה מפרידה בין ארבע רמות אחריות. רק שתי השכבות הראשונות הן Components במובן של רכיבים שנועדו לשימוש חוזר; Feature ו-Page הן יחידות ארגון ואחריות שמרכיבות את הרכיבים.

| שכבה | יחידה לוגית | אחריות |
|---|---|---|
| Shared Layout Component | מעטפת האפליקציה | מעטפת משותפת לאחר התחברות: Top Bar, Bottom Navigation עבור סוגי המשתמשים הרלוונטיים ואזור תוכן. Admin/Moderator משתמשים במעטפת ניהול ללא השתתפות חברתית. |
| Shared UI Component | סרגל עליון (Top Bar) | סרגל עליון גלובלי ורב-שימושי. מקבל מבחוץ Role/Permissions, counters ופעולות. Regular/Professional: Hamburger, Global Search, Chat, Notifications. Admin/Moderator: Hamburger ניהולי + Notifications; אין Social Chat/Global Search צרכני. |
| Shared UI Component | ניווט תחתון (Bottom Navigation) | ניווט תחתון קבוע בין היעדים המרכזיים; אינו מכיל את לוגיקת היעדים עצמם. |
| Shared UI Component | כפתור | כפתור כללי ורב-שימושי. מקבל טקסט/אייקון/מצב/variant ואירוע פעולה מבחוץ. |
| Shared UI Component | שדה טקסט | שדה טקסט כללי. כללי ולידציה עסקיים מוגדרים בטופס/Feature המשתמש בו. |
| Shared UI Component | שדה סיסמה | שדה סיסמה רב-שימושי; כללי הסיסמה נמסרים מה-flow הרלוונטי. |
| Shared UI Component | שדה טקסט רב-שורות | קלט טקסט רב-שורות לשימוש בטפסים ופוסטים. |
| Shared UI Component | רשימת בחירה | בחירה מתוך רשימה; האפשרויות והפעולה נקבעות על ידי ה-Feature. |
| Shared UI Component | בורר תאריך | בחירת תאריך לשימוש בהרשמה, מסלולים וטפסים נוספים. |
| Shared UI Component | חלון קופץ / גיליון | מעטפת חלון קופץ כללית שמקבלת תוכן ופעולות מבחוץ; אינה קשורה לטופס מסוים. גם מעטפת אחת לגיליון מלמטה (מתחת ל-1024px) ולחלון קטן (מ-1024px), שמשמשת את השיתוף, שיתוף הקישור והדיווח; כל חלון נסגר ב-Back, ב-Esc ובלחיצה מחוצה לו, ובחלון אישור לחיצה בחוץ היא ביטול (NFR-USAB-004). |
| Shared UI Component | תמונת משתמש | תמונת/ייצוג משתמש לשימוש בפיד, פרופילים, תגובות וכדומה. |
| Shared UI Component | תג | תג מידע כללי, למשל Sponsored או סטטוס; התוכן נקבע מבחוץ. (אין תג אימות — OP-005 נסגר, 18.10.2026.) |
| Shared UI Component | שדה החיפוש הגלובלי | קלט חיפוש גלובלי משותף. מקבל value/events בלבד; חיפוש גלובלי מנהל את הישויות, הרשאות התוצאות, ה-Dropdown והניווט. |
| Domain Reusable Component | כרטיס פוסט | תצוגת פוסט חוזרת ברשימות/פיד. מקבלת נתוני פוסט ואירועי פעולה מבחוץ. |
| Domain Reusable Component | כרטיס פריט Marketplace | כרטיס Marketplace רב-שימושי שמקבל סוג מקור/קידום מבחוץ ומציג וריאציה מתאימה: Listing אורגני של משתמש, Listing מקודם של משתמש, או מוצר ממומן של חברה/ספונסר. |
| Domain Reusable Component | כרטיס בעל מקצוע | כרטיס בעל מקצוע חוזר ברשימות/המלצות. פעולת פתיחת הפרופיל או פנייה נקבעת מבחוץ. |
| Domain Reusable Component | כרטיס Context של המסע | כרטיס Context שניתן להשתמש בו עבור ילד/ה, הריון או מסלול אחר בהתאם לנתונים. |
| Domain Reusable Component | פריט פעולת מעקב | פעולת Tracker חוזרת; סוג המעקב והשדות הרלוונטיים נקבעים על ידי ניהול Tracker. |
| Domain Reusable Component | כרטיס מאמר | כרטיס טיפ/מאמר חוזר ברשימות תוכן. |
| Domain Reusable Component | פריט התראה | פריט התראה חוזר: icon/type, Actor, text, timestamp, read/unread ו-Target/Deep Link. הפעולה מתקבלת ממרכז ההתראות. |
| Feature / Container | תהליך ההרשמה הרגילה | מנהל את שלבי ההרשמה הרגילה, ה-state, הוולידציות והמעבר בין השלבים. |
| Feature / Container | תהליך ההרשמה המקצועית | מנהל את שלבי ההרשמה המקצועית והנתונים המקצועיים. |
| Feature / Container | בניית הפיד | מרכיב Feed Units ומפעיל את מנוע ההמלצות מבוסס הכללים לטעינה, Eligibility, Ranking, Re-ranking וחיבור בין כרטיס פוסט/Recommendation Units לפעולות המשתמש. |
| Feature / Container | יצירת פוסט | מנהל יצירת פוסט/שאלה ואת הוולידציה הנדרשת. |
| Feature / Container | תגובות ולייקים לפוסט | מנהל תגובות/Reaction ושינויים בנתוני הפוסט. |
| Feature / Container | מעקב בעמוד הבית | מנהל Context פעיל, Summary ומרכיבי המעקב בעמוד הבית. |
| Feature / Container | ניהול מסלולי המסע | הוספה, בחירה וניהול של מסלולי Parent Journey. |
| Feature / Container | ניהול Tracker | מנהל יצירת Tracker Event, שדות לפי סוג והיסטוריה. |
| Feature / Container | תוכן מותאם לשלב | בוחר טיפים ומאמרים לפי My Stage ו-Context מאושר; יכול להשתמש ב-Tracker category/summary לצורך הכוונה כללית ולא-אבחונית בלבד. אינו משמש Paid Targeting. |
| Feature / Container | ניהול ה-Marketplace | מנהל Marketplace Listings, מוצרים מסחריים, סוג מקור, קידום משתמש וסימון Sponsored. |
| Feature / Container | מדריך נותני השירות | מנהל קטגוריות, סינון, דירוג ותוצאות של בעלי מקצוע. |
| Feature / Container | ניהול השיחות | מנהל מרכז שיחות, היסטוריה, Preview, unread state, Regular Chat Requests בין non-Friends, Chat Block והקשרי Friends / Professional Outreach / Marketplace / Support. שיחה קיימת בין Regular Users יכולה להמשיך גם לאחר Remove Friend. |
| Feature / Container | פנייה יזומה של בעל מקצוע | מנהל Offer Help / Message Request מתוך פוסט, אכיפת פנייה אחת לכל Professional+Post, ו-Accept/Decline/Ignore. |
| Feature / Container | קידום מקצועי | מנהל Professional Marketing Tools: Profile Promotion, Post Promotion ו-Promotion Analytics, בנפרד מהמוניטין והחשיפה האורגניים. |
| Feature / Container | עריכת פרופיל | מנהל עריכת פרטי החשבון בהתאם לסוג המשתמש; נתוני ילדים/מסלולים שייכים ל-Regular בלבד. |
| Feature / Container | חיפוש גלובלי | מנהל Global Search של People, Groups ו-Posts, כולל Dropdown, מסך תוצאות חיפוש ואכיפת פרטיות. Regular User תמיד ניתן לאיתור; תצוגת הפרופיל ל-non-Friend מוגבלת לפי Regular Profile Visibility. |
| Feature / Container | מרכז ההתראות | מנהל Notification Center, Dropdown, מסך ההתראות, read/unread, Deep Links והתאמת סוגי האירועים לפי Role/Permissions והעדפות המשתמש. |
| Page | מסך Welcome (PG-001) / מסך Login (PG-002) / מסך בחירת סוג חשבון (PG-003) | מסכי כניסה והרשמה; מרכיבים Shared UI ו-Flows רלוונטיים. |
| Page | מסך ההרשמה הרגילה (PG-004/005) / מסך ההרשמה המקצועית (PG-006/007) | מסכי ההרשמה; מרכיבים את Flow ההרשמה והרכיבים הכלליים. |
| Page | מסך הפיד (PG-008) / מסך הבית — מעקב ותכנון (PG-009) / מסך ה-Marketplace (PG-010) | מסכי הליבה המרכזיים לאחר התחברות. |
| Page | עמוד פוסט | עמוד פוסט בודד (PG-055): הפוסט, השיתוף או המקור שלו, ושרשור התגובות המלא; מרכיב את התגובות והלייקים לפוסט ואת שיתוף הפוסט. |
| Page | מסך נותני שירות ויועצים (PG-011) / מסך פרופיל מקצועי (PG-013) | מסכי איתור וצפייה בבעלי מקצוע. |
| Page | מסך פרופיל משתמש (PG-012) / מסך פריט Marketplace (PG-019) | מסכי פרופיל משתמש ופרטי Marketplace Listing/מוצר ממומן. |
| Page | מסך תוצאות חיפוש (PG-017) / מסך ההתראות (PG-018) / מסך השיחות (PG-014) | מסכי תוצאות חיפוש, היסטוריית התראות ומרכז שיחות מלא. |
| Shared UI Component | העלאת מדיה | רכיב להוספת תמונות/סרטונים במקומות שבהם מדיה מותרת. סוגי קבצים ומגבלות מועברים מה-Feature המשתמש בו. בכל העלאה: הקטנה, ניקוי EXIF/GPS וטשטוש בדפדפן לפני השליחה (NFR-MEDIA-001, BR-076). |
| Domain Reusable Component | פעולת דיווח | פעולת דיווח רב-שימושית לתוכן/משתמש. נפתחת כחלון נפרד מעל מסך מטושטש מעט, עם סיבה, טקסט חופשי וקישור לכללי הקהילה (FR-MOD-001). יעד הדיווח, סיבת הדיווח והמשך ה-flow נקבעים על ידי הטיפול בדיווחים. נפתחת בגיליון מלמטה או בחלון קטן (חלון קופץ / גיליון), מתפריט "⋯" של פוסט ושל תגובה ומכפתור בפרופיל. |
| Feature / Container | חסימת משתמש | מנהל חסימת משתמש הדדית: הסתרת פוסטים, תגובות ופרופיל בשני הכיוונים וסיום ה-Friendship (FR-REL-002). |
| Feature / Container | נתוני לוח הבקרה המקצועי | מנהל KPI מקצועיים מצטברים: Profile Views, Followers, Organic Reach/Engagement, Chat Starts ו-Promotion Analytics. Organic ו-Paid מוצגים בנפרד; אין חשיפת זהויות/חיפושים של משתמשים בודדים. |
| Feature / Container | שליחת פנייה ל-Support | מנהל שליחת פנייה מסווגת ושיוכה למשתמש. כאשר Support משיב, התגובה מוזרמת ל-Support Thread ב-Chat תחת זהות “Support”, בלי להפוך את הערוץ ל-Chat חברתי חופשי. |
| Feature / Container | טיפול בתיבת הפניות | מנהל תיבת פניות, סינון, סטטוס, הערות פנימיות ותגובות. SUPPORT_HANDLE מאפשר תגובה בשם “Support”; האינטראקציה נשמרת במסגרת SupportRequest. |
| Feature / Container | תצוגת ה-Analytics לניהול | מנהל תצוגת Analytics/Intelligence. Admin בעל גישה מלאה; Moderator יכול לצפות רק עם ANALYTICS_VIEW, בהיקף שמוגדר ב-FR-ADMIN-010. מקבל את הנתונים מחישוב נתוני הניהול. |
| Feature / Container | טיפול בדיווחים | מנהל דיווחים ותוכן בעייתי. Admin בעל גישה מלאה; Moderator פועל לפי REPORTS_VIEW, CONTENT_MODERATE ו-MARKETPLACE_MODERATE. |
| Page | מסך לוח הבקרה המקצועי (PG-022) | מסך הבית העסקי של Professional User. מחליף את חוויית המעקב ההורי עבור חשבון מקצועי. |
| Page | מסך תיבת הפניות (PG-025) / מסך ה-Analytics לניהול (PG-026) | מסך תיבת הפניות נגיש ל-Admin ול-Moderator עם SUPPORT_VIEW; פעולות טיפול דורשות SUPPORT_HANDLE. מסך ה-Analytics לניהול נגיש ל-Admin ול-Moderator עם ANALYTICS_VIEW בלבד. |
| Feature / Container | ניהול הרשאות Moderator | מאפשר ל-Admin בלבד ליצור/להשבית Moderator ולהקצות, לשנות ולבטל Permission Keys. שינוי הרשאות נרשם ב-Audit Log. |
| Page | מסך הרשאות Moderator (PG-027) | מסך ניהול Moderator והרשאותיו. נגיש ל-Admin בלבד ומציג את Permission Matrix המאושרת ואת מצב ההרשאות לכל Moderator. |
| Feature / Container | ניהול משתמשים ואכיפה | מנהל צפייה תפעולית במשתמשים ופעולות Warning / Suspension / Ban / Unban בהתאם ל-Permission Keys; Admin בעל גישה מלאה. |
| Feature / Container | יומן ה-Audit | רושם פעולות ניהוליות באופן אוטומטי ומציג Audit Log. Admin בעל גישה מלאה; Moderator עם AUDIT_LOG_VIEW מקבל צפייה בלבד. |
| Feature / Container | ~~ניהול אימות מקצועי~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Feature / Container | ניהול הגדרות הקהילה | מנהל קטגוריות, סיבות דיווח ותצורות קהילה תפעוליות. Moderator פועל רק עם COMMUNITY_CONFIG. |
| Feature / Container | ניהול הודעות מערכת | מנהל הודעות מערכת רשמיות. Moderator פועל רק עם SYSTEM_ANNOUNCEMENTS. |
| Page | מסך ניהול משתמשים (PG-028) | מסך ניהול משתמשים ואכיפה. Admin מלא; Moderator רואה/פועל לפי USER_VIEW / USER_WARN / USER_SUSPEND / USER_BAN. |
| Page | מסך יומן ה-Audit (PG-029) | מסך Audit. Admin מלא; Moderator עם AUDIT_LOG_VIEW בצפייה בלבד. |
| Page | ~~מסך תור האימות המקצועי (PG-030)~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Page | מסך הגדרות הקהילה (PG-031) | מסך הגדרות קהילה תפעוליות. Admin מלא; Moderator עם COMMUNITY_CONFIG. |
| Page | מסך הודעות מערכת (PG-032) | מסך הודעות מערכת. Admin מלא; Moderator עם SYSTEM_ANNOUNCEMENTS. |
| Shared UI Component | חלונית נפתחת (Dropdown) | מעטפת Dropdown כללית ל-Search, Notifications ו-Chat. מקבלת תוכן ופעולות מבחוץ ואינה מכילה לוגיקה עסקית. |
| Shared UI Component | מגירת תפריט צד | מעטפת תפריט צד הנפתחת מה-Hamburger. פריטי התפריט וההרשאות מוזנים על ידי בניית התפריט הצדדי. |
| Shared UI Component | פריט תפריט | פריט תפריט רב-שימושי המקבל label/icon/action/disabled מבחוץ. |
| Shared UI Component | מונה שלא נקראו | Badge מספרי/מצבי להצגת unread count על Chat/Notifications. מקור הנתון מנוהל ב-Feature. |
| Domain Reusable Component | פריט תוצאת חיפוש | פריט תוצאת חיפוש רב-שימושי עבור Person/Group/Post; הניווט וה-visibility מגיעים מהחיפוש הגלובלי. |
| Domain Reusable Component | תצוגה מקדימה של שיחה | תצוגת שיחה אחרונה ב-Chat Dropdown/List: משתתף/ים, הודעה אחרונה, זמן ו-unread state. |
| Domain Reusable Component | כרטיס קבוצה | כרטיס קבוצה ברשימות/חיפוש: שם, תיאור, Public/Private, סטטוס חברות ופעולה מתאימה. |
| Domain Reusable Component | פריט חבר | פריט חבר/בקשת חברות לשימוש במסך החברים ובהקשרים חברתיים. |
| Feature / Container | בניית התפריט הצדדי | בונה את תפריט ה-Hamburger לפי סוג החשבון וההרשאות, ללא שכפול יעדי Bottom Navigation. |
| Feature / Container | ניהול חברים | מנהל Friend Requests, אישור/דחייה, רשימת חברים והסרת Friendship בין Regular Users בלבד. |
| Feature / Container | מעקב אחר בעל מקצוע | מנהל Follow/Unfollow אל Professional Profile. יעד Follow תמיד ProfessionalProfile; Professional אינו עוקב אחר Regular User. |
| Feature / Container | ניהול הקבוצות | מנהל גילוי קבוצות, יצירת Group חדש על ידי Regular/Professional, Membership, Public/Private visibility, הצטרפות, בקשות והזמנות. |
| Feature / Container | ניהול קבוצה | מנהל Group Owner/Admin/Moderator לפי היררכיה Owner > Admin > Group Moderator > Member. Role נמוך אינו יכול לאכוף פעולה על Role שווה/גבוה ממנו. |
| Feature / Container | הגדרות ההתראות | מנהל Multi-select/Toggles לסוגי התראות, חריגי Security/Critical והעדפת All/Highlights/Off לכל קבוצה. בשלב Web הוא מנהל In-App בלבד; בשלב Mobile הוא מנהל גם Push delivery עבור קטגוריות מאופשרות, בכפוף להרשאת מערכת ההפעלה. |
| Page | מסך הקבוצות (PG-033) / מסך קבוצה (PG-034) / מסך ניהול קבוצה (PG-035) | מסכי גילוי/הקבוצות שלי, צפייה בקבוצה וניהול קבוצה בהתאם ל-Public/Private ולתפקיד. |
| Page | מסך החברים (PG-036) | מסך Friends ובקשות חברות עבור Regular User בלבד. |
| Feature / Container | שחזור סיסמה | מנהל את תהליך שחזור הסיסמה מתוך Login. ערוץ האימות המדויק נשאר TBD עד להחלטה; ה-Feature אחראי ל-state, ולידציה והחלפת הסיסמה לאחר אימות. |
| Feature / Container | ~~אימות מקצועי~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Feature / Container | קידום מודעת Marketplace | מנהל קידום בתשלום של Marketplace Listing בבעלות Regular User, בנפרד מקידום Professional Profile. |
| Page | מסך Tracker (PG-021) / מסך מעקב הנקה (PG-023) / מסך טיפ / מאמר (PG-020) | מסך Tracker הוא עמוד ייעודי לסוג מעקב; מסך מעקב הנקה הוא מימוש ייעודי להנקה; מסך טיפ / מאמר מציג טיפ/מאמר מלא. |
| Page | מסך תור הדיווחים (PG-037) | מסך תור דיווחים וטיפול ב-Moderation. Admin בעל גישה מלאה; Moderator פועל לפי REPORTS_VIEW וביצוע פעולות תוכן לפי CONTENT_MODERATE / MARKETPLACE_MODERATE והרשאות אכיפה רלוונטיות. |
| Domain Reusable Component | פריט בקשת שיחה | פריט בקשת שיחה חוזר עבור Regular Chat Request או Professional Offer Help. מקבל סוג בקשה, שולח, טקסט/הקשר, סטטוס ופעולות מבחוץ. |
| Feature / Container | ניהול ההגדרות | מנהל מסך ההגדרות ו-Sections של Account, Privacy & Security, Notifications ו-Terms/Privacy. |
| Page | מסך ההגדרות (PG-038) | עמוד הגדרות מרכזי ל-Account, Privacy & Security, Notifications ו-Terms/Privacy. |
| Page | מסך בעלי מקצוע במעקב (PG-039) | רשימת Professional Profiles במעקב עם פתיחה ו-Unfollow. |
| Page | ~~מסך סטטוס האימות המקצועי (PG-040)~~ — **בוטל** | אין אימות מקצועי (OP-005 נסגר, 18.10.2026). |
| Page | מסך הקידום המקצועי (PG-041) / מסך תוצאות הקידום (PG-041) | ניהול Profile Promotion, Post Promotion ותוצאות הקידום המקצועי. |
| Page | מסך חיובים וקידומים (PG-042) | ריכוז רכישות/קידומים מקצועיים וסטטוסי תשלום; ספק סליקה/חשבוניות TBD. |
| Page | מסך יצירת קבוצה (PG-043) | יצירת Public/Private Group על ידי Regular או Professional; היוצר הופך ל-Group Owner. |
| Feature / Container | ניהול מוצרים ממומנים | Admin בלבד: יצירה, עריכה, פרסום, השהיה והסרה של SponsoredProduct/Brand Promotion בשלב הראשון. |
| Page | מסך מוצרים ממומנים (PG-044) | מסך Admin לניהול Sponsored Products; אין Brand User בשלב הראשון. |
| Feature / Container | קליטת אותות ההתאמה האישית | קולט אירועי חיפוש/צריכה/אינטראקציה מאושרים ומעדכן Interest Profile ו-Intent Signals. אינו משתמש בתוכן Chat/Support; עבור Professional אינו משתמש ב-Child/Tracker Data. |
| Feature / Container | מנוע ההמלצות מבוסס הכללים | מנוע v1 דטרמיניסטי ל-Candidate Generation, Ranking ו-Re-ranking עבור Feed, Professionals, Marketplace/Products ו-Contextual Guidance. הכללים והמשקולות ניתנים להגדרה באמצעות AlgorithmConfiguration. |
| Feature / Container | משוב על המלצות | מנהל Not Interested / Show Less ואת השפעתם על Creator/Topic/Source ברמת המשתמש. "הסתרת הפוסט" נשמרת כאן ב-PostHide בלבד ואינה משפיעה על הדירוג (FR-ALG-009). |
| Feature / Container | רישום אירועי שימוש | רושם Event Taxonomy אחיד ל-Impression, Open, Dwell, Search, Engagement, Conversion ו-Administrative metrics ללא שמירת גוף Chat/Support באירועי Analytics כלליים. |
| Feature / Container | חישוב נתוני הניהול | מחשב נתונים ל-Owner/Admin: Lifecycle, Retention, Feed/Search, Groups, Professionals, Marketplace, Promotion, Moderation/Support ו-Recommendation Quality — גם ברמת משתמש בודד, בלי שמות ובלי פרטים מזהים (FR-ADMIN-010, החלטת אפיק מ-18.10.2026). אילו תחומים זמינים לפני שאירועי השימוש נאספים — OP-039. |
| Feature / Container | מטא-דאטה של תוכן | מחזיק Topic/Category/Stage metadata לצורכי v1 באמצעות שדות מובנים, Group/Category context, Tags ומילות מפתח. סיווג סמנטי אוטומטי/Embeddings הוא Future Enhancement. |
| Shared UI Component | תפריט פעולות "⋯" | תפריט "⋯" לפעולות משניות בכרטיס או במסך. במובייל נפתח כ-sheet מלמטה. הפעולות מוזנות מבחוץ (החלטות עיצוב מ-11.10.2026). תפריט אחד לכל כרטיס, לכל תגובה ולכותב בעמוד הפוסט; נסגר ב-Back, ב-Esc ובלחיצה בחוץ, ולחיצה אחת על "⋯" אחר פותחת אותו. |
| Shared UI Component | תווית עזרה (Tooltip) | תווית קצרה לכפתור אייקון, בריחוף ובמיקוד. ניתנת לסגירה ואינה מסתירה תוכן (WCAG 1.4.13). |
| Shared UI Component | הודעה קצרה (Toast) | הודעת מצב קצרה ושקטה, ב-live region. אינה המקום היחיד למידע חשוב, ו-Toast עם פעולה אינו נעלם לבד. |
| Shared UI Component | מצב ריק | מצב ריק: הסבר קצר ופעולה אחת לצעד הבא. התוכן מוזן מבחוץ. |
| Shared UI Component | שלד טעינה | מצב טעינה רך, בלי תנועה כשהמשתמש ביקש להפחית תנועה. |
| Shared UI Component | כרטיסי בחירה | בחירה אחת מתוך כמה אפשרויות, בכרטיסים (radio), עם סימון "נבחר" שאינו בצבע בלבד. |
| Shared UI Component | מחוון שלבים | "שלב X מתוך Y" ופס התקדמות לטפסים מרובי שלבים. |
| Shared UI Component | כפתור "חזרה למעלה" | כפתור "חזרה למעלה" שמופיע אחרי גלילה ארוכה בפיד ומחזיר את המיקוד לראש הרשימה. |
| Shared UI Component | חלון שיתוף קישור | חלון שיתוף קישור: וואטסאפ, אימייל, העתקת קישור וחלון השיתוף של המכשיר. היעדים מוזנים מבחוץ. |
| Shared Layout Component | מעטפת מסכי הכניסה | מעטפת למסכים שלפני ההתחברות (Welcome, Login, שלבי ההרשמה): עמודה ממורכזת, מקום לכפתור חזרה, גוף הטופס ואזור פעולות תחתון. אינה מכילה לוגיקה של הרשמה או התחברות. |
| Shared UI Component | שדה טופס | עוטף שדה קלט: תווית מעל השדה, רמז, סימון "(לא חובה)" והודעת שגיאה מקושרת לשדה. הוולידציה עצמה נקבעת ב-Feature. |
| Shared UI Component | תיבת סימון | תיבת סימון עם תווית, שיכולה להכיל קישורים (למשל אישור תנאי השימוש). |
| Shared UI Component | הודעה בתוך המסך | הודעת מצב בתוך המסך, למשל שגיאת התחברות. הטקסט מגיע מבחוץ, מקטלוג השגיאות (§10). |
| Shared UI Component | לוגו | סימן המותג (wordmark זמני, OP-022), כקישור או כתמונה, בשני גדלים. מוחלף במקום אחד כשתיקבע הזהות הסופית. |
| Feature / Container | שיתוף פוסט | מנהל שיתוף בפיד ושיתוף קישור (FR-FEED-006/007): בדיקה שמותר לשתף (BR-064), שמירת הפניה למקור (BR-065), מצב "לא זמין" ויצירת קישור בלי תוכן בתצוגה המקדימה (BR-067). |
| Feature / Container | גישה לבטא | מנהל את רשימת המוזמנים לבטא הסגורה ואת מצב הבטא, ובודק בהרשמה שהאימייל מוזמן (FR-ADMIN-011). |
| Page | מסך מוזמני הבטא (PG-045) | מסך Admin לניהול רשימת המוזמנים ומצב הבטא. |
