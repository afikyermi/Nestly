[← אינדקס ה-SRS](INDEX.md)

# 13. דרישות נתונים / Database

המסמך מגדיר ישויות לוגיות. בחירת ה-DB היא החלטת Design נפרדת, והיא התקבלה: **PostgreSQL דרך Supabase**, מקור אמת אחד, והרשאות שנאכפות בבסיס הנתונים באמצעות **Row Level Security** (החלטה מ-12.9.2026).

**גישה לנתונים (החלטה מ-11.10.2026):**
- הגישה לנתונים היא רק דרך שרת המערכת, באמצעות Drizzle. ה-Data API של Supabase כבוי לסכמת המוצר.
- כל שאילתה רצה בטרנזקציה שנושאת את זהות המשתמש, בתפקיד מסד שאינו יכול לעקוף את RLS. כך RLS נשאר מקור האמת להרשאות, והשרת אינו מסנן שורות לפי הרשאה.
- רשומת Audit נכתבת בבסיס הנתונים באותה טרנזקציה של הפעולה (NFR-AUDIT-001).
- אחסון מדיה: Supabase Storage (סעיף 12, NFR-MEDIA-001; OP-027 נסגר ב-16.10.2026). Realtime, כשיופעל, יעביר אות בלבד ולא תוכן (סעיף 12).
- השרת רץ כ-Vercel Functions; משימות רקע רצות בנפרד, בתפקיד מסד משלהן (סעיף 11).

| Entity | מטרה |
|---|---|
| User | מזהה, Role, פרטי Login/Contact, סטטוס — כולל "מתוזמן למחיקה" עם מועד המחיקה (FR-SET-002, BR-073). |
| RegularProfile | נתוני פרופיל הורה/משתמש. |
| ProfessionalProfile | מקצוע, שם עסק (לא חובה), ניסיון, נתוני אימות — כולל מספר עוסק/ח.פ שנאסף באימות ולא בהרשמה — דירוגים/מדדים, סטטוס אימות. |
| Child | שם, מין (VAL-006), תאריך לידה ושיוך להורה. מוצג לפי סדר ההוספה; הסרה היא מחיקה מלאה (FR-PROFILE-002). |
| JourneyContext | סוג מסלול: מתכננים, הריון ולידה, ילד/ה, מחזור וביוץ; סטטוס פעיל; בהריון — תאריך לידה משוער (לא חובה). למשתמש יכולים להיות כמה במקביל (החלטה מ-13.10.2026; VAL-039). סיום מסלול הוא מחיקה מלאה, בלי סיבה ובלי רישום; "יש לנו ילד או ילדה" קיים אם ורק אם יש לפחות ילד אחד (FR-PROFILE-002). |
| TrackerEvent | סוג Tracker, timestamp ונתוני האירוע; האירועים מהווים חלק מ-Tracker Data המשויך למשתמש/ילד/מסלול. |
| Post | מחבר (נשמר תמיד), סימון אנונימיות, תוכן, זמן, קהילה/הקשר, סטטוס. בפוסט אנונימי זהות המחבר אינה נחשפת למשתמשי קהילה (FR-FEED-005). שיתוף בפיד הוא פוסט של המשתף עם הפניה לפוסט המקורי ובלי עותק של תוכנו (FR-FEED-006, BR-065). |
| Comment / Reaction | אינטראקציות לתוכן. Comment יכול לכלול parentCommentId עבור Reply ו-Mention references לפי הצורך; Reaction נשמר לפי סוג האינטראקציה שיוגדר. |
| Group / Membership | Group עם type Public/Private, מטא-דאטה, בעלות וסטטוס; Membership משייך משתמש לקבוצה ומכיל סטטוס חברות. תפקידי קבוצה נשמרים בנפרד מ-System Roles. |
| MarketplaceListing | Listing מסחרי של משתמש: מוצר למכירה/מסירה, בעלים, תוכן, מדיה, סטטוס, מקור וקידום. |
| Promotion | קמפיין/חשיפה ממומנת, יעד, תקופה, בעלים. |
| ServiceCategory | קטגוריות בעלי מקצוע. |
| ProfessionalOutreachRequest | בעל מקצוע, משתמש יעד, Post מקור, הודעה ראשונה, סטטוס בקשה. |
| Conversation / Message | Conversation/Message: משתתפים, context/source, הודעות, זמן, unread/read state וסטטוס. Contexts כוללים Friends, Regular Chat Request, Professional, Marketplace ו-Support. Conversation בין Regular Users אינה נסגרת אוטומטית בעקבות Remove Friend. |
| Report / ChatBlock | Report: יעד, סיבה, טקסט חופשי אופציונלי, עדיפות בתור (BR-074), זמן וסטטוס טיפול. ChatBlock: blocker, blocked user, createdAt/removedAt; משפיע על Messaging בלבד ואינו חסימה גלובלית. |
| Article / Tip | תוכן ידע והקשר רלוונטיות. מדריכים לפי סטטוס הם תוכן מערכת: סטטוס ושבוע/שליש/גיל, מקורות, תאריך בדיקה ומצב פרסום (FR-ADMIN-012). |
| ProfessionalReview | ביקורת של משתמש רגיל על בעל מקצוע: הפנייה המאושרת שהיא נשענת עליה (אחת לכל פנייה), דירוג 1–5, טקסט, זמן וסטטוס (FR-SERV-011). |
| ProfessionalArticle | מאמר של בעל מקצוע: כותרת, גוף, תחום, סטטוס וזמנים (FR-PRO-003). |
| Notification | Notification: נמען, Type, Actor/System, Text, Timestamp, Read/Unread, TargetType/TargetId או Deep Link metadata. יצירה/הצגה כפופות ל-NotificationPreference ולהרשאות. |
| SponsoredProduct | מוצר/תוכן מסחרי מטעם חברה/מותג/ספונסר, עם מקור, מדיה, סטטוס וסימון ממומן. בשלב הראשון נוצר ומנוהל על ידי Admin/Back Office בלבד. |
| MediaAsset | מטא-דאטה וקישור לקובץ תמונה/סרטון המשויך לפוסט, סטורי, Listing, מאמר, תמונת פרופיל או ישות מאושרת אחרת, ומצב הבדיקה בשרת (ממתינה / עברה / נכשלה, BR-076). רק הגרסה המטושטשת נשמרת. |
| Story | סטורי: מחבר, MediaAsset אחד, טקסט קצר אופציונלי, זמן פרסום וזמן תפוגה (24 שעות). נמחק עם התמונה בתום התוקף (FR-FEED-008, BR-077). |
| SupportRequest | פנייה של משתמש: נושא, מלל, משתמש, זמן, סטטוס, handledBy והיסטוריית תגובות. תגובות חיצוניות מוצגות ב-Support Thread בתוך Chat בשם “Support”; הערות פנימיות אינן מוצגות. |
| TrackerData | מכלול נתוני המעקב שנשמרים עבור המשתמש/ילד/מסלול לצורך תיעוד, התאמה אישית, מתן טיפים/ידע ושיפור המערכת, בכפוף למטריצת שימוש ותקנון/מדיניות פרטיות. |
| ModeratorPermission | מיפוי בין Moderator לבין Permission Keys שהוקצו על ידי Admin: SUPPORT_VIEW, SUPPORT_HANDLE, REPORTS_VIEW, CONTENT_MODERATE, MARKETPLACE_MODERATE, USER_VIEW, USER_WARN, USER_SUSPEND, USER_BAN, PROFESSIONAL_VERIFY, ANALYTICS_VIEW, AUDIT_LOG_VIEW, COMMUNITY_CONFIG, SYSTEM_ANNOUNCEMENTS, PRIVATE_GROUP_MODERATE; כולל created/updated metadata. |
| AccountEnforcement | פעולת אכיפה על חשבון: Target User, Action (Warn/Suspend/Ban/Unban), Reason, Actor, Permission, זמן, משך/מועד סיום במקרה Suspension וסטטוס. |
| AuditLogEntry | רשומת Audit: Actor, Role, Permission, Action, Target, Timestamp, Result, Reason לפי הצורך ו-Before/After בשינויים רלוונטיים. Retention TBD. |
| Friendship | קשר בין שני Regular Users: requester, addressee, status Pending/Accepted/Declined/Removed, ביטול של השולח, timestamps. לכל זוג קשר פעיל אחד לכל היותר. Declined אינו נחשף לשולח, והסטטוס אינו מוחזר לאף צד (FR-REL-001, F2.4). |
| ProfessionalFollow | Follower User, Target ProfessionalProfile, createdAt; יעד Follow תמיד ProfessionalProfile. |
| GroupJoinRequest | User, Group, status Pending/Approved/Rejected, requestedAt, decidedBy/decidedAt. |
| GroupRoleAssignment | Group, User, role Owner/Admin/Moderator, assignedBy, timestamps. System Moderator אינו נשמר כאן אלא ב-ModeratorPermission. |
| NotificationPreference | User + Notification Type/Category + inAppEnabled + pushEnabled. Security/Critical categories הן mandatory ב-In-App. pushEnabled משמש רק בשלב Mobile ואפקטיבי רק כאשר הקטגוריה מאופשרת והרשאת Push של מערכת ההפעלה קיימת. Group-specific level נשמר ב-GroupNotificationPreference. |
| GroupNotificationPreference | User + Group + mode All/Highlights/Off. Highlights logic תוגדר במשימת האלגוריתמים. |
| FriendContentNotificationPreference | User + Friend + enabled עבור “פוסט חדש של חבר”, כדי שההתראה לא תישלח אוטומטית מכל Friend. |
| ChildBirthdayVisibility | העדפת פרטיות של ההורה הקובעת האם ניתן להשתמש ביום ההולדת של הילד לצורך Notification לחברים. אחת לכל הורה; ברירת מחדל: מאושר (שאלון I2 של אפיק, 16.10.2026). |
| GroupInvitation | Group, inviter, invitee, status Pending/Accepted/Declined, createdAt/decidedAt. קבלת הזמנה יכולה ליצור Membership בהתאם לכללי הקבוצה. |
| GroupMemberEnforcement | פעולת ניהול ברמת קבוצה כגון Warning/Mute/Remove/Block/Unblock: Group, Target User, Action, Actor/Group Role, Reason, timestamps ומשך/סטטוס לפי הצורך. |
| CommunityConfiguration | הגדרות קהילה תפעוליות כגון קטגוריות, סיבות דיווח ותצורות Moderation מאושרות; כוללות metadata של שינוי לפי הצורך. |
| SystemAnnouncement | הודעת מערכת רשמית: title/body, status Draft/Published/Removed, target scope לפי מה שיוגדר, author/actor ו-timestamps. |
| RegularChatRequest | Requester Regular User, Target Regular User, openingMessage, status Pending/Accepted/Declined, timestamps. Accept פותח Conversation; Decline אינו יוצר Chat. |
| PrivacyPreference | User + RegularProfileVisibility (Open/Restricted), הצגת משפט ה-Journey Summary (§1.4; ברירת מחדל: מוצג) והעדפות פרטיות נוספות. Regular User נשאר searchable בכל מצב. ברירות מחדל, גם לחשבונות שקדמו להן: Open, המשפט מוצג (שאלון I2 של אפיק, 16.10.2026). |
| ProfessionalPromotionMetric | Promotion, TargetType Profile/Post, impressions/clicks/engagement ושדות מדידה נוספים שייקבעו; נשמר בנפרד ממדדי Reputation אורגניים. |
| AnalyticsEvent | Event כללי למדידת Impression/Open/Dwell/Search/Interaction/Conversion/Support/Moderation עם eventId, timestamp, entity/surface/source ו-algorithm/config version לפי צורך. |
| ContentImpression | רשומת/אירוע חשיפה של Recommendation/Feed unit: user/session, entity, surface, position, organic/paid, algorithm/config version ומשך חשיפה אם זמין. |
| SearchEvent | Query normalized, surface, filters, result count/zero-result ו-result click. Raw query אינו נחשף ל-Professional Analytics. |
| PersonalizationProfile | Interest/Intent scores נגזרים לפי Topic/Context. v1 Rule-Based; אינו כולל גוף Chat/Support ואינו חשוף ל-Professional/Advertiser. |
| RecommendationFeedback | Not Interested / Hide / Show Less והיעד creator/topic/source לצורך Re-ranking. |
| ContentMetadata | Topic/Category/Stage/Service/Product metadata לצורכי Eligibility/Ranking; v1 מבוסס שדות מובנים, Group/category context, tags/keywords ו-curation. |
| AlgorithmConfiguration | גרסת weights/thresholds/decay/diversity/exploration/frequency caps. שינוי Admin Only דרך ALGORITHM_AI_CONFIG ונרשם ב-Audit. |
| AnalyticsAggregate | מדדים מצטברים לפי period/surface/entity/segment מאושר לצורך Admin/Professional dashboards. |
| PromotionPerformanceEvent | Impression/Click/ProfileVisit/Follow/ChatStart/other approved event המשויך ל-Promotion ומסומן Paid לצורך הפרדה מ-Organic. |
| LegalConsent | User, מסמך (Terms / Privacy / הצהרת גיל 18+), גרסה, זמן אישור. נוצר בהרשמה (FR-REG-004) ובכל אישור של גרסה חדשה. |
| RecoveryAnswers | User, שתי השאלות שנבחרו, לכל תשובה hash איטי (scrypt) עם salt ופרמטרים, מזהה האימייל (hash עם מפתח) וזמן הטענה עליו, זמנים. לעולם לא התשובה עצמה; משתמשים ומבקרים אינם קוראים את ה-hash (FR-AUTH-003, VAL-045, F1.6). מידע אישי. Retention TBD. |
| RecoveryThrottle | מונה ניסיונות שחזור לפי מזהה אימייל או לפי hash של כתובת IP, חלון ונעילה (NFR-SEC-010). Retention TBD. |
| RecoveryEvent | אירוע Audit של שחזור הסיסמה: סוג (FR-ADMIN-005), User כשידוע, hash של מזהה האימייל, hash של כתובת ה-IP וזמן; בלי תשובה, סיסמה או אימייל. Retention TBD. |
| BetaInvite | אימייל מוזמן, מי הוסיף ומתי, וסטטוס. יחד עם מצב הבטא קובע מי יכול להירשם בתקופת הבטא (FR-ADMIN-011). |
| AccountTakeoverCheck | מצב ניקוי S-01 לכל חשבון: ממתין או הושלם, ה-Session שביצע אותו, זמן הניקוי וזמן קביעת הסיסמה החדשה (FR-AUTH-005, F2.0). בלי סיסמה, תשובה או אסימון. Retention TBD. |
| ProfileOpenCount | מונה פתיחות הפרופיל של כל חשבון בחלון ההגבלה (NFR-SEC-006). נכתב ונקרא רק בבסיס הנתונים, בשורה של הצופה עצמו; משתמשים אינם קוראים, מאפסים או משנים אותו. Retention TBD. |
| SecurityConfiguration | ערכי סף של הגבלות Security, כגון 100 פתיחות פרופיל ב-3,600 שניות (NFR-SEC-006). שינוי — Admin בלבד (SECURITY_SETTINGS_MANAGE); עד I4 ב-migration. ממשק המוצר אינו קורא ואינו כותב אותם. |
| SecurityEvent | אירוע Security: סוג (למשל חריגה מהגבלת פתיחת הפרופילים), החשבון והזמן; בלי יעד, פרופיל או נתוני ילד. משתמשים אינם קוראים, משנים או מוחקים אירוע, גם את שלהם (NFR-SEC-006, ERR-032). Retention TBD (I9). |

## 13.1 קשרים מרכזיים

- User אחד יכול להיות משויך לפרופיל רגיל או מקצועי בהתאם למודל החשבון.
- RegularProfile יכול להיות קשור ליותר מילד אחד — כפי שנדרש מהסקיצה; המגבלה — VAL-040.
- User יכול להחזיק כמה JourneyContext במקביל (החלטה מ-13.10.2026). איזה מסלול מוצג ראשון בבית — OP-003, ייקבע ב-I6.
- RegularProfile מחזיק עד 10 ילדים (VAL-040).
- User → משתמש Auth: מחיקת משתמש Auth נחסמת כל עוד יש לו נתונים במוצר (RESTRICT, החלטה מ-13.10.2026). מחיקה רק בנוהל מחיקה מסודר: FR-SET-002, BR-073 (OP-028 נסגר).
- Conversation מקשרת בין המשתתפים והודעותיהם; ProfessionalOutreachRequest מקושר לפוסט המקור ולבעל המקצוע שיזם את הפנייה.
- Promotion לא מחליף דירוג אורגני אלא מייצג שכבת חשיפה נפרדת ויכול להיות משויך לפרופיל מקצועי, Marketplace Listing של משתמש או תוכן/מוצר ממומן.
- MarketplaceListing משויך למפרסם; SponsoredProduct מנוהל בשלב הראשון על ידי Admin. Marketplace Chat מתוך Listing פעיל הוא חריג מורשה לכלל Professional→Regular Outreach.
- TrackerData מורכב מאירועי המעקב והקשריהם ונשמר לפי המשתמש/הילד/מסלול.
- SupportRequest משויך למשתמש ולנושא וכולל סטטוס והיסטוריית תגובות. Admin מלא; Moderator לפי SUPPORT_VIEW/HANDLE. תגובה חיצונית מופיעה ב-Chat כ-Support Thread בשם “Support”.

Friendship קיים רק בין Regular Users. הוא מאפשר Chat ישיר אך אינו תנאי לבקשת שיחה; RegularChatRequest משמש non-Friends. Remove Friend אינו סוגר Conversation שכבר נפתחה.

ProfessionalFollow הוא קשר חד-כיווני אל ProfessionalProfile. Regular או Professional יכולים לעקוב אחר ProfessionalProfile; Professional אינו עוקב אחר RegularProfile.

Group מוגדר Public/Private. כל Regular/Professional יכול ליצור Group ונהיה Owner. Membership קובע גישה; GroupRoleAssignment שומר Roles לפי היררכיה; GroupMemberEnforcement חייב לכבד אותה.

Search מחזיר Group metadata ו-Regular basic identity. Private Group content תלוי Membership; Regular profile content ל-non-Friend תלוי PrivacyPreference. כלי Admin/Moderation אינם חלק מ-Global Search.

NotificationPreference ו-GroupNotificationPreference מסננים אירועי In-App, ובשלב Mobile משמשים גם לקביעת זכאות ל-Push בהתאם להרשאת המכשיר. Recommendation signals המבוססים על חיפוש/צריכה שייכים ל-Feed ולא ל-Notification Center.

## 13.2 Data Inventory & Usage v1

| קטגוריית Data | דוגמאות / מקור | שימוש מותר v1 | הגבלות / שימוש אסור | גישה |
|---|---|---|---|---|
| Account / Role | Login, Role, account status, contact fields | Authentication, authorization, lifecycle analytics | לא לחשוף ל-Professional; Paid targeting רק לפי surface/category ולא contact identifiers | Admin לפי הרשאות; המשתמש לחשבונו |
| Regular Profile — Public | Basic Public Profile (§1.4): שם, תמונה, Journey Summary ללא גילאים, Friends ו-Friends משותפים; Profile Visibility | People Search, profile display, social features | Restricted מגביל non-Friend ל-Basic Public Profile; Open, וכל צפייה של Friend, חושפים את הפרופיל עם Journey Summary מלא, ללא שמות ילדים, תאריכי לידה, פרטי הריון ו-Tracker Data; לא נגזר Paid target מזהות אישית | משתמשים לפי Visibility |
| Child / Journey Context | DOB/Stage/JourneyContext, child association | My Stage, organic contextual relevance, trackers | Child DOB/identifiers אינם Paid Targeting ואינם מועברים ל-Professional/Advertiser דרך ערוצי Targeting, Analytics או Dashboard. ל-non-Friend הם אינם מוצגים: מוצג רק Journey Summary — מספר ילדים, גילאים (ב-Open ול-Friend, בשנים ובחודשים) והריון ללא פרטים — באופן זהה לצופה Regular ול-Professional (FR-PRIV-001) | Regular owner; Admin לפי הרשאה; algorithms דרך derived Stage; non-Friend רק Journey Summary |
| Tracker Data | Tracker type/events/summary | Tracking history; organic non-diagnostic tips/context | ללא Paid Targeting; ללא Professional access; ללא medical diagnosis/inference | Regular owner; restricted Admin access; ContextualContentFeature לפי purpose |
| Professional Profile | profession, experience, verification, ratings, content/activity | Directory, organic matching, profile, Professional analytics | Paid boost לא משנה organic reputation | Public/eligible users; owner/admin |
| Social Graph | Friendship, ProfessionalFollow, Group Membership | Feed candidates, social relevance, notifications | לא לחשוף graph מלא לצדדים שלישיים | המשתמש/Features הרלוונטיים |
| Content & Metadata | Posts/Comments/Groups/Listings/Products/Articles + topic/stage/category tags | Search, Feed, Ranking, Moderation, analytics | Private Group content לפי membership/admin exception בלבד. זהות המחבר של Anonymous Post אינה נחשפת למשתמשי קהילה. Admin רואה אותה; Moderator רק בטיפול בדיווח על הפוסט, עם Audit (FR-FEED-005) | לפי content visibility |
| Search Data | normalized query, filters, result count, clicks | Search ranking, current intent, zero-result/demand analytics | Raw query לא מוצג ל-Professional; Chat/Support לא נגזרים ל-query | System/Admin aggregate; user personalization |
| Interaction / Exposure | impression, open, dwell, like, comment, save, profile/product open | Interest/Intent, Ranking evaluation, Admin analytics | Dwell אינו Satisfaction יחיד; מינימום metadata נדרש | System; Admin aggregate; Professional own aggregates |
| Negative Feedback | Not Interested, Hide, Show Less | Suppression/Re-ranking, recommendation quality | לא משמש אכיפה על משתמש אחר כשלעצמו | System + user preference |
| Location | coarse/precise permission-dependent location | Services proximity, Marketplace relevance לפי הרשאה | אין איסוף ללא permission; paid usage רק לפי policy/consent future decision | User-controlled; features scoped |
| Chat Metadata | conversation ids, timestamps, unread/read state, context | Messaging operation, unread counters, limited aggregate metrics | Message body אינו personalization/paid signal | Participants; system operation; admin only when authorized |
| Chat Content | message body/attachments אם יאושרו | Messaging בלבד, moderation/report if user submits/authorized | אסור Personalization/Recommendation/Paid Targeting | Participants; authorized moderation only |
| Support Data | category, status, thread messages, handler metadata | Support handling; aggregate issue analytics | Support message body אינו personalization/paid signal | User + Admin/Moderator authorized |
| Promotion / Payment | campaign target, budget/period/status, transaction/provider refs | Paid delivery, billing, promotion analytics | Organic score/reputation נפרדים; card data לפי gateway policy | Owner/Professional for own campaign; Admin finance |
| Moderation / Audit | reports, actions, reasons, before/after, actor/target | Trust & Safety, compliance, audit | לא משמש ad targeting | Admin/Moderator לפי permissions |
| Derived Interest / Intent | topic/context scores + freshness | Organic personalization, candidate ranking; limited sponsored eligibility only from permitted non-sensitive sources | לא כולל Tracker/Child private data ל-Paid; לא נחשף למפרסם | System; Admin debugging under permission |

## 13.3 Event Taxonomy v1

| קבוצת Event | Events עיקריים | Metadata מרכזי |
|---|---|---|
| Exposure | content_impression / recommendation_impression / promotion_impression | entity, surface, position, organic/paid, algorithm/config version |
| Consumption | content_open / dwell / article_open / profile_view / marketplace_open | entity, duration if available, source surface |
| Engagement | reaction / comment / reply / save / share-if-added | entity, actor, context |
| Negative Feedback | not_interested / hide / show_less | entity, creator/topic/source target |
| Search | search_submit / search_result_click | normalized query, result count, zero-result, entity clicked |
| Relationship | friend_request / friend_accept / follow / unfollow / group_join | relationship type + target |
| Messaging Conversion | chat_start / chat_request_accept / offer_help_accept | context source only; no message body |
| Commerce / Promotion | promotion_click / profile_visit_from_promo / follow_from_promo / chat_start_from_promo | promotion id + outcome |
| Support / Moderation | support_submit / support_response / report_submit / moderation_action | category/status/action metadata; no generic copy of message body |
| System | notification_open / settings_change / algorithm_config_change | target/config version/action metadata |

## 13.4 Retention, User Control & Purpose Boundaries

| Data Class | Purpose | Retention / Control Rule |
|---|---|---|
| Account/Profile/Content | נדרש לתפעול החשבון והתוכן | מחיקת חשבון — BR-073; תמונות — BR-077. משך מדויק ייקבע לפי Privacy Policy/שוק ראשון; מחיקה/ייצוא לפי USER_DATA_EXPORT_DELETE ותהליך המשתמש. |
| Interaction/Search/Recommendation Events | Personalization + Analytics | Retention period לא ייקבע שרירותית ב-SRS; יש לקבוע לפני Production ולהתאים ל-Notice/Consent. Aggregates יכולים להישמר בנפרד לפי policy. |
| Tracker/Child Data | Tracking + Organic Context | Retention/control חייבים להיות מפורשים במדיניות; אין Paid Targeting. הסרת ילד וסיום מסלול מוחקים את השורה מבסיס הנתונים החי מיד, בלי רישום באפליקציה (FR-PROFILE-002). |
| Chat/Support | תקשורת ותפעול Support | Retention נקבע לפי policy/operational need; גוף ההודעות לא נכנס ל-personalization/paid analytics. |
| Moderation/Audit | Trust/Safety/Audit | Retention TBD לפי market/legal/operational need; מחיקה/שינוי Audit מוגבלים לפי NFR-AUDIT. |
| Payment/Promotion | Billing/financial record + campaign performance | Retention לפי provider/finance/legal; אין שמירת full card data במערכת. |
