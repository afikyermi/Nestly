[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Algorithms & Data — אלגוריתמים ואנליטיקה

## FR-ALG-001 — איסוף Signals ו-Interest/Intent Profile

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1; Rule-Based ללא ML/LLM |
| Actor | System / Regular User / Professional User |
| תיאור | המערכת תאסוף Personalization Signals מאושרים ותתחזק Interest Profile ו-Intent Signals נגזרים לצורך התאמה אורגנית. ה-Profile הנגזר אינו גלוי ל-Professional/Advertiser. |
| תנאים מוקדמים | Session פעיל והאירוע מותר לפי Privacy/Data Rules. |
| קלט / Trigger | Search, Impression/Dwell, Open, Like/Reaction, Comment, Save, Follow, Group Membership, Profile/Product open; ל-Regular גם Stage. תוכן Chat/Support מוחרג. הסתרת פוסט אינה Signal (FR-ALG-009; החלטת אפיק מ-18.10.2026, 8א). |
| תהליך מערכת | נרמול האירוע → שיוך Topic/Context → עדכון Score מצטבר עם Freshness/Decay. משקולות/Decay נשמרים ב-AlgorithmConfiguration ולא Hard-coded. |
| פלט | Interest/Intent scores לפי Topic/Context. |
| מצב לאחר ביצוע | Signals זמינים ל-Ranking עתידי וניתנים ל-Audit ברמת Configuration/Event metadata. |
| בעל אחריות לוגי (Page / Feature) | קליטת אותות ההתאמה האישית / רישום אירועי שימוש |

## FR-ALG-002 — Regular User Feed Ranking v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Regular User / System |
| תיאור | המערכת תדרג Feed Units עבור Regular User לפי שילוב Stage, Interest/Intent, Social Relevance, Group/Follow context, Content Quality, Freshness ו-Diversity. המאגר האורגני כולל את הפוסטים של הצופה, של ה-Friends שלו ופוסטי "כולם" (כולל אנונימיים ושיתופים), וכן תוכן מ-Groups ומ-Follows; הציון דטרמיניסטי ובעל גרסה, ומשלב Freshness, Friend, Quality (לייקים ותגובות של אחרים), Stage Match לפי תגית המחבר (FR-FEED-004), Interest/Intent ו-Group/Follow context (AC-060); Re-ranking שמאחד שיתופים של אותו מקור ומגביל פריטים של אותו יוצר ופוסטים אנונימיים בחלון רציף; Cold Start לפי ERR-027. ספירות, ציונים וזהויות אינם מוחזרים ללקוח. |
| תנאים מוקדמים | Regular User מחובר וקיימים Candidates מורשים. |
| קלט / Trigger | Friends/Groups/Follows, Stage, Interest/Intent, Content Metadata, engagement/quality signals, Negative Feedback, eligibility. |
| תהליך מערכת | Authorization/Eligibility → Candidate Generation → Rule-Based Scoring → Re-ranking לגיוון/בטיחות/Negative Feedback → שילוב Sponsored eligible בנפרד. Anonymous Post אינו נכנס כ-Candidate ואינו מקבל Social Relevance דרך הגרף החברתי של המחבר (FR-FEED-005). כשהתצורה הפעילה חסרה או אינה תקינה — הגרסה התקינה האחרונה, ואם אין — תצורה מובנית לפי זמן בלבד (ERR-030). שינוי התצורה לפי BR-059. |
| פלט | Feed ordered list עם Organic/Sponsored labeling. |
| מצב לאחר ביצוע | Impression/Interaction נרשמים; Organic Score אינו מושפע מתשלום. |
| בעל אחריות לוגי (Page / Feature) | בניית הפיד / מנוע ההמלצות מבוסס הכללים |

## FR-ALG-003 — Professional User Feed Ranking v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Professional User / System |
| תיאור | Professional Feed מותאם לתחום מקצועי, Groups, Professionals במעקב, Search/Consumption ו-Content Quality; אין שימוש ב-Child/Journey/Tracker Data של חשבון אחר או של Professional. **פיד הקהילה (החלטת אפיק מ-19.10.2026):** Professional קורא את פיד הקהילה בפרופיל דירוג של תוכן בלבד — אותו מאגר שרואה Regular שאינו Friend, בלי רכיב Friend ובלי רכיב Stage, ובלי קריאה של מסלולים או ילדים (AC-061); תחום מקצועי, Groups ו-Follows משתלבים בדירוג כמתואר לעיל. ב-v1 פוסט של בעל מקצוע שה-Professional עוקב אחריו מקבל את משקל רכיב ה-Friend (Professional אין לו Friends). |
| תנאים מוקדמים | Professional User מחובר. |
| קלט / Trigger | Profession/Service Categories, Followed Professionals, Group Membership, Searches, content interactions, quality/freshness, negative feedback. |
| תהליך מערכת | Eligibility → Candidate Generation של Posts/Questions/Professional/Group/Business-relevant units → Ranking/Re-ranking. Sponsored מוצג רק אם relevant ומסומן. |
| פלט | Professional Feed מותאם שאינו Parent Tracking Feed. |
| מצב לאחר ביצוע | אירועי צריכה מעדכנים Interest/Intent מקצועיים בלבד. |
| בעל אחריות לוגי (Page / Feature) | בניית הפיד / מנוע ההמלצות מבוסס הכללים |

## FR-ALG-004 — Contextual Guidance לפי Stage/Tracker

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Regular User / System |
| תיאור | המערכת תעדיף Tips/Articles המתאימים ל-Stage ול-Context. ה-Stage של הורה נגזר מהמסלולים שלו: שבוע ההריון (לפי תאריך הלידה המשוער), גיל כל ילד או ילדה, או תכנון הריון; מדריך מוצג כשהשבוע או הגיל בטווח שלו.  Tracker Data יכול להשפיע רק על הכוונה כללית, לא-אבחונית ולא-מסחרית. |
| תנאים מוקדמים | קיים Regular Context; Tracker Signal אופציונלי. |
| קלט / Trigger | Stage, Content Stage/Topic Metadata, Tracker category/summary מאושר, explicit search/interest. |
| תהליך מערכת | סינון לתוכן בטוח/מאושר → Stage/Topic scoring → quality/freshness/diversity. אין inference רפואי ואין Paid Targeting. |
| פלט | Tips/Articles רלוונטיים. |
| מצב לאחר ביצוע | Feedback/engagement משמשים לשיפור Organic relevance בלבד. |
| בעל אחריות לוגי (Page / Feature) | תוכן מותאם לשלב / מנוע ההמלצות מבוסס הכללים |

## FR-ALG-005 — Organic Professional Matching & Exposure

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Regular User / System |
| תיאור | דירוג אורגני של Professional ייקבע לפי התאמת שירות/Query/Intent, Location אם אושרה, איכות/Helpful Activity, Ratings, Profile completeness, Freshness ו-Negative Feedback. אין אות אימות — האימות המקצועי הוסר (OP-005 נסגר, 18.10.2026). |
| תנאים מוקדמים | Professional פעיל וזמין להצגה; המשתמש נמצא ב-Services/Recommendation context. |
| קלט / Trigger | ServiceCategory, Search/Intent, location (עיר או אזור מרשימה, §12), professional quality/activity signals, user feedback. |
| תהליך מערכת | Eligibility → Relevance score → Quality/reliability signals → Re-ranking. Paid Promotion אינו חלק מה-Organic score. ב-v1 הסדר "הכי מתאימים" במדריך נותני השירות: התאמת נושאי החיפוש של המשתמש (Intent Signal, FR-ALG-008) לתחום ולתיאור, הדירוג הממוצע, שלמות הפרופיל (אזור, מחיר, שם עסק, תיאור) ועדכניותו. |
| פלט | Professional results/recommendations אורגניים מדורגים. |
| מצב לאחר ביצוע | Profile view/follow/chat-start נרשמים למדידה; זהות המחפש אינה נחשפת ב-Professional Analytics. |
| בעל אחריות לוגי (Page / Feature) | מדריך נותני השירות / מנוע ההמלצות מבוסס הכללים |

## FR-ALG-006 — Marketplace & Product Ranking v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Regular User / Professional User / System |
| תיאור | Marketplace Listings ומוצרים ידורגו לפי Query/Category/Intent, Freshness, availability/status, location אם אושרה ו-Negative Feedback. Promoted/Sponsored נשמרים כשכבת חשיפה נפרדת. |
| תנאים מוקדמים | Listing/Product פעיל ומותר להצגה. |
| קלט / Trigger | Search/Category, current intent, item metadata, freshness, optional location, feedback, promotion status. |
| תהליך מערכת | Eligibility → Organic relevance score. Promoted/Sponsored candidates עוברים Sponsored Eligibility ומוצבים כ-Paid units ללא שינוי ה-Organic score. |
| פלט | Marketplace/Product list עם סימון ברור של source/promotion. |
| מצב לאחר ביצוע | Impression/detail-open/chat-start נרשמים בנפרד Organic/Paid. |
| בעל אחריות לוגי (Page / Feature) | ניהול ה-Marketplace / קידום מודעת Marketplace / מנוע ההמלצות מבוסס הכללים |

## FR-ALG-007 — Sponsored Eligibility & Placement

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | System / Admin / Professional User |
| תיאור | תשלום קונה Reach בלבד. Sponsored/Promoted unit יוצג רק אם הוא Active, מתאים למשטח/קטגוריה/Query ומותר לפי Privacy/Safety; לעולם לא משנה Reputation או Organic score. |
| תנאים מוקדמים | Campaign/Promotion פעיל, יעד קיים, תקופת קמפיין/תשלום תקינים. |
| קלט / Trigger | Surface, current query/category, campaign target, item status, promotion status, frequency state. |
| תהליך מערכת | Sponsored Eligibility → paid ranking among eligible sponsored candidates → configurable frequency cap → Sponsored label. אסור להשתמש ב-Child DOB, Tracker Data, Chat/Support content או private-group content ל-Paid Targeting. **v1 (I13; החלטות אפיק מ-21.10.2026):** הגדרות הקידום נשמרות כגרסאות; רק ה-Admin מוסיף גרסה, עם סיבה, והשינוי נרשם ב-Audit עם הערכים הקודמים. **פיד:** פוסט ממומן אינו בראש הפיד אלא משולב בגלילה, לפי רלוונטיות לצופה (שלב, נושאי חיפוש); בין שני פוסטים ממומנים יש 4 עד 7 פוסטים אורגניים — מעט פוסטים ב-48 השעות האחרונות: 4, הרבה: 7, ובין לבין באופן הדרגתי; הספים של "מעט" ו"הרבה" נקבעים בהגדרות (לפי ⭐: 20 ו-200 פוסטים, OP-063). **Marketplace:** מודעות מקודמות בראש התוצאות, רק אלה שמתאימות לחיפוש ולסינון, בלי מגבלת מספר. **בעלי מקצוע:** בעלי מקצוע ממומנים שמתאימים לסינון, מעל הרשימה, עד המספר שבהגדרות (לפי ⭐: 1). **מגבלת תדירות:** אותו קידום מוצג לאותו משתמש עד מספר פעמים ביום שבהגדרות (לפי ⭐: 3), חוץ מה-Marketplace. **סימון (BR-005):** פרופיל ופוסט של בעל מקצוע — "ממומן"; מודעת Marketplace — "מודעה מקודמת"; מוצר ממומן של מותג — "ממומן". |
| פלט | Sponsored unit מסומן ומוגבל לפי Configuration. |
| מצב לאחר ביצוע | Paid impression/click/conversion metadata נרשמים בנפרד מה-Organic performance. |
| בעל אחריות לוגי (Page / Feature) | קידום מקצועי / קידום מודעת Marketplace / ניהול מוצרים ממומנים / מנוע ההמלצות מבוסס הכללים |

## FR-ALG-008 — Global Search Ranking v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1; ללא Semantic AI. מחיפוש נשמר הנושא בלבד, ואין ניתוח של Admin על החיפושים (החלטת אפיק מ-20.10.2026: "בלי ניתוח של האדמין") — לכן אין רישום של חיפושים בלי תוצאות לניתוח |
| Actor | Regular User / Professional User / System |
| תיאור | Global Search ידרג People/Groups/Posts באמצעות התאמת Exact/Prefix/Keyword ותתי-אותות רלוונטיות, לאחר החלת Privacy/Authorization. |
| תנאים מוקדמים | משתמש מחובר והקליד Query. |
| קלט / Trigger | Normalized query + entity metadata + visibility + freshness/quality tie-breakers. |
| תהליך מערכת | Authorization filter ראשון → exact/prefix/title/name match → keyword/text match → tie-break לפי relevance/freshness/quality. Semantic embeddings/LLM אינם נדרשים ב-v1. |
| פלט | Dropdown/מסך תוצאות חיפוש מדורגים ללא חשיפת תוכן לא מורשה. |
| מצב לאחר ביצוע | Intent Signal (החלטת אפיק מ-20.10.2026): מכל חיפוש נשמרים הנושא או קטגוריית המוצר שזוהו, מזהה המשתמש והתאריך — לעולם לא הטקסט שהוקלד. הזיהוי בכללים קבועים (מילים לנושא), ללא ML. הנושא נמחק אחרי 30 יום, והשפעתו דועכת עם הזמן. הנושא מקדם תוכן תואם — פוסטים, מודעות Marketplace ויועצים, אורגניים וממומנים כאחד (בכפוף לכללי Sponsored Eligibility) — בלי ניתוח של Admin. הפיד משתמש בנושאים כבר עכשיו: פוסט שהטקסט שלו תואם נושא של חיפושי המשתמש עולה בדירוג שלו, לפי משקל שדועך עם הזמן מאז החיפוש (מחצית ההשפעה בכל שבוע, כ-Configuration), וכל נושא נספר לכל היותר פעם ביום. ה-Marketplace והיועצים ישתמשו בהם כשייבנו. |
| בעל אחריות לוגי (Page / Feature) | חיפוש גלובלי / רישום אירועי שימוש |

## FR-ALG-009 — Diversity, Exploration והסתרת פוסט

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Regular User / Professional User / System |
| תיאור | אין Not Interested / Show Less ואין משוב שלילי מפורש על המלצות — לא נבנה ולא מתוכנן (החלטת אפיק מ-21.10.2026). Re-ranking ימנע חזרתיות יתר של Creator/Topic/Source וישאיר מקום ל-Exploration רלוונטי. **הסתרת פוסט** (החלטת אפיק מ-18.10.2026): "הסתרת הפוסט" בתפריט "⋯" של כרטיס בפיד מסתירה פוסט אחד מהמשתמש עצמו בלבד. היא אינה Signal ואינה משנה את הדירוג של שום פריט אחר, למשתמש או לאחרים. הכותב ושאר הקוראים ממשיכים לראות את הפוסט, המונים אינם משתנים, ואף אחד אינו יודע על ההסתרה. אי אפשר להסתיר פוסט של המשתמש עצמו, גם אנונימי. הכרטיס הופך במקום ל"הפוסט הוסתר" עם "ביטול ההסתרה", עד שהמשתמש עוזב את הפיד או טוען אותו מחדש; אחר כך ההסתרה קבועה ב-MVP, ואין רשימת פוסטים מוסתרים. הסתרת שיתוף מסתירה את השיתוף בלבד; שיתוף של פוסט מוסתר מציג "הפוסט המקורי כבר לא זמין" (BR-065). |
| תנאים מוקדמים | Recommendation/Feed unit מוצג. |
| קלט / Trigger | הרכב הפיד הנוכחי; "הסתרת הפוסט". |
| תהליך מערכת | diversity pass (בלי חזרתיות יתר של Creator/Topic/Source) → exploration candidates שעברו Eligibility. אחוזים וספים ניתנים לכיול ב-Configuration. הסתרת פוסט נשמרת בשרת (PostHide, §13) ומוציאה את הפוסט מה-Eligibility של המשתמש בלבד, גם במכשיר אחר ואחרי התחברות מחדש; היא נמחקת עם ביטול ההסתרה, עם מחיקת הפוסט או עם מחיקת החשבון. |
| פלט | Feed מגוון; פוסט שהוסתר אינו מוצג למסתיר. |
| מצב לאחר ביצוע | ההסתרה נשמרת למשתמש בלבד; אין העדפה שמשפיעה על Re-ranking. |
| בעל אחריות לוגי (Page / Feature) | הסתרת פוסט / מנוע ההמלצות מבוסס הכללים |

## FR-ALG-010 — Group Notification Highlights v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | Regular User / Professional User / System |
| תיאור | ב-Group Notification mode=Highlights יוצגו אירועים ישירים/חשובים לפי כללים דטרמיניסטיים; mode=All מציג את כל האירועים המותרים ו-Off מדכא פעילות אופציונלית. |
| תנאים מוקדמים | Membership פעילה והעדפת Group Notification קיימת. |
| קלט / Trigger | Reply, Join/Invite decision, Owner/Admin announcement/pinned content, post engagement threshold, user preference. |
| תהליך מערכת | אירועים ישירים המשפיעים על המשתמש נשמרים בכל mode: Reply/תגובה לפוסט שלו, החלטה על בקשת ההצטרפות שלו, הזמנה, המלצה של Friend, ול-Owner/Admin — בקשת הצטרפות חדשה. All: כל פוסט חדש בקבוצה, פוסט מוצמד ופוסט שעבר את ה-threshold. Highlights (ברירת המחדל כשלא נבחר mode): פוסט מוצמד (Announcement) ופוסט שעבר את ה-threshold. Off: אף אחד מאלה. ה-threshold הוא Configuration עם גרסה: מספר הלייקים והתגובות של אחרים על פוסט בקבוצה, 5 ב-v1 (OP-048); כל פוסט מדווח כ-Highlight פעם אחת לכל חבר, לא לכותב ולא למי שביצע את הפעולה. Off אינו מבטל Security/Critical/direct account events. הקטגוריה "קבוצות" בהגדרות ההתראות (FR-NOTIF-002) מכבה את כל התראות הקבוצות. |
| פלט | Notification set בהתאם ל-All/Highlights/Off. |
| מצב לאחר ביצוע | NotificationPreference נשמרת; אין ML dependency. |
| בעל אחריות לוגי (Page / Feature) | מרכז ההתראות / ניהול הקבוצות |

## FR-DATA-001 — Analytics Event Tracking v1

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — חובה ל-v1 |
| Actor | System |
| תיאור | המערכת תרשום Event Taxonomy אחיד כדי למדוד שימוש, Ranking, Search, Groups, Professionals, Marketplace, Promotions, Support ו-Moderation. |
| תנאים מוקדמים | אירוע עסקי/תצוגתי התרחש והאיסוף מותר. |
| קלט / Trigger | eventType, eventId, timestamp, actor/account type, entityType/id, surface/context, organic/paid source, position/rank, algorithmVersion/configVersion ומטא-דאטה מינימלי. |
| תהליך מערכת | Validation → deduplication/idempotency לפי eventId → storage → aggregation. אין להעתיק גוף Chat/Support לתוך generic analytics events. |
| פלט | Event records + Aggregates. |
| מצב לאחר ביצוע | Metrics זמינים לחישוב נתוני הניהול ול-Professional aggregate analytics לפי הרשאות. |
| בעל אחריות לוגי (Page / Feature) | רישום אירועי שימוש / חישוב נתוני הניהול |
