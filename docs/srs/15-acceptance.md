[← אינדקס ה-SRS](INDEX.md)

# 15. Acceptance Criteria

| ID | קריטריון קבלה |
|---|---|
| AC-001 | Welcome מציג את שתי פעולות הכניסה: יצירת חשבון חדש ומעבר לחשבון קיים. |
| AC-002 | משתמש אינו יכול להשלים הרשמה כאשר שדה חובה אינו תקין. |
| AC-003 | סיסמה שאינה עומדת בכלל הסקיצה (8 תווים + אות גדולה + אות קטנה + מספר) נדחית. |
| AC-004 | לאחר התחברות מוצלחת המשתמש מגיע למעטפת האפליקציה עם הניווט המתאים. |
| AC-005 | Bottom Navigation של Regular User מוביל לבית/מעקב, Marketplace, פיד, שירותים ופרופיל. |
| AC-006 | עמוד הבית מציג Context של מסלול המעקב הפעיל. |
| AC-007 | Tracker Event תקין נשמר ומופיע לאחר שמירה. |
| AC-008 | תוכן ממומן מוצג עם סימון ברור ואינו מוצג כאורגני. |
| AC-009 | סינון בעלי מקצוע משנה את הרשימה בהתאם לערכים שנבחרו. |
| AC-010 | משתמש רגיל יכול לפתוח שיחה עם בעל מקצוע ללא תשלום וללא אישור מוקדם. |
| AC-011 | בעל מקצוע יכול לשלוח Message Request אחת בלבד בעקבות אותו פוסט של משתמש רגיל. |
| AC-012 | לפני Accept של Message Request לא נפתח Chat מלא בין בעל המקצוע למשתמש הרגיל. |
| AC-013 | לאחר Accept שני הצדדים יכולים להתכתב ללא מגבלת מספר הודעות. |
| AC-014 | אין Rate Limit כללי על מספר פוסטים/משתמשים שונים; ניסיון שני של אותו בעל מקצוע על אותו Post נחסם. |
| AC-015 | עריכת פרופיל נשמרת ומשתקפת במסכים הרלוונטיים. |
| AC-016 | Guest שאינו מחובר אינו יכול לפתוח Feed/Marketplace/פרופילים/Tracking ומנותב ל-Welcome/Login. |
| AC-017 | טלפון אינו נדרש להשלמת הרשמה; אם הוזן, הוא עובר ולידציה לפי השוק. |
| AC-018 | Professional User אינו מקבל מסכי Tracking הורי באותו חשבון ומקבל Professional Dashboard במקום חוויית הבית ההורית. |
| AC-019 | Marketplace Listing של משתמש נשמרת כפרסום מסחרי נפרד מפוסט קהילתי. |
| AC-020 | Listing מקודמת של משתמש ומוצר ממומן של חברה/ספונסר מוצגים באופן שניתן להבדיל ביניהם ובין Listing אורגנית. |
| AC-021 | פוסט ו-Marketplace Listing יכולים לכלול תמונה או סרטון בכפוף למגבלות המדיה. |
| AC-022 | דיווח על פוסט/משתמש נשמר ומופיע לטיפול Admin; Moderator רואה ומטפל בדיווח רק אם הוקצתה לו הרשאת Moderation. |
| AC-023 | Tracker הנקה נשמר רק כאשר זמן הסיום אינו מוקדם מזמן ההתחלה ומציג את הנתונים בהיסטוריה. |
| AC-024 | Admin יכול לצפות ולטפל בכל Support Requests. Moderator עם SUPPORT_VIEW יכול לצפות ורק עם SUPPORT_HANDLE להגיב/לעדכן. תגובה חיצונית מופיעה ב-Chat בשם “Support”. |
| AC-025 | Admin בעל גישה מלאה לכל יכולות הניהול ואינו תלוי במיפוי הרשאות Moderator. |
| AC-026 | Moderator ללא Permission Key נדרש מקבל Access Denied גם אם ניסה להגיע ישירות ל-API/Route; לאחר הקצאת ההרשאה על ידי Admin, הגישה נפתחת בהתאם. |
| AC-027 | Moderator עם USER_BAN יכול לחסום חשבון Regular/Professional במלואו ולבצע Unban; Moderator ללא USER_BAN אינו יכול לבצע אף אחת מהפעולות הללו. Moderator אינו יכול להפעיל Ban/Unban על Admin, על עצמו או על Moderator אחר. |
| AC-028 | Moderator עם USER_SUSPEND יכול להשעות חשבון זמנית רק לאחר בחירת משתמש יעד, סיבה ומשך/מועד סיום. |
| AC-029 | כל Warning/Suspension/Ban/Unban, שינוי Permission, טיפול בפנייה, Moderation ואימות Professional יוצר AuditLogEntry עם Actor, Action, Target, Timestamp ו-Result. |
| AC-030 | Moderator עם AUDIT_LOG_VIEW יכול לצפות ולסנן Audit Log אך אינו יכול לשנות או למחוק רשומה. |
| AC-031 | אף Permission של Moderator אינו מאפשר גישה לפעולות Admin Only; ניסיון גישה נדחה בצד ה-Backend. |
| AC-032 | SUPPORT_HANDLE דורשת SUPPORT_VIEW; USER_WARN/USER_SUSPEND/USER_BAN דורשות USER_VIEW; Moderator שאינו Member צריך PRIVATE_GROUP_MODERATE בנוסף להרשאת טיפול כדי לגשת לתוכן Private Group. |
| AC-033 | TopBar של Regular/Professional מציג Hamburger, Global Search, Chat ו-Notifications; TopBar של Admin/Moderator אינו מציג Social Chat או Global Search צרכני. |
| AC-034 | Regular User אינו יכול לשלוח Friend Request ל-Professional/Admin/Moderator או לעצמו; Accept בין שני Regular Users בלבד יוצר Friendship. |
| AC-035 | Follow ניתן רק אל ProfessionalProfile. Professional אינו יכול Follow ל-RegularProfile. |
| AC-036 | Public Group ניתנת לחיפוש ותוכנה נגיש למשתמש מחובר; משתמש שאינו Member אינו יכול לפרסם, להגיב, לבצע Reply או Reaction עד Join. |
| AC-037 | Private Group ניתנת לחיפוש, אך Post לא נחשף למשתמש קהילה שאינו Member. Admin יכול לצפות לניהול; Moderator שאינו Member רק עם PRIVATE_GROUP_MODERATE דרך כלי Moderation וב-Audit. |
| AC-038 | Group hierarchy נאכפת Owner > Admin > Group Moderator > Member. Admin אינו פועל נגד Owner/Admin אחר; Moderator רק נגד Member; Owner מעביר בעלות לפני יציאה. |
| AC-039 | Global Search מציג Dropdown מחולק ל-People/Groups/Posts ו-View All; SearchResultsPage כולל All/People/Groups/Posts וכל תוצאה מכבדת הרשאות. |
| AC-040 | Notification dropdown מציג unread state ו-Deep Link; NotificationsPage מאפשר Mark all as read. Chat messages אינן מופיעות כהתראות כפולות. |
| AC-041 | Regular/Professional יכולים לשנות Notification Preferences במולטי-סלקט/Toggles; Security/Critical אינן ניתנות לכיבוי ב-In-App; Group preference תומכת All/Highlights/Off. בשלב Mobile, קטגוריה מאופשרת יכולה להישלח גם כ-Push רק כאשר Push מופעל והרשאת מערכת ההפעלה קיימת. |
| AC-042 | Recommendation המבוססת על חיפוש/צריכת תוכן אינה נוצרת כ-Notification ומופיעה רק במסגרת Feed/Recommendation logic. |
| AC-043 | Professional Notification Center אינו כולל Friend Requests או Birthdays, אך יכול לכלול New Follower, Verification, Promotion, Moderation, Group ו-System events. |
| AC-044 | Moderator מקבל Notification ניהולי רק אם Permission מתאים לתחום האירוע; Admin יכול לקבל את כלל אירועי הניהול. |
| AC-045 | Chat dropdown מציג Conversations/Requests. Friends Chat ישיר; non-Friends Regular Chat Request; Conversation קיימת ממשיכה לאחר Remove Friend; Professional→Regular Offer Help למעט Marketplace; ChatBlock מונע הודעות בלבד. |
| AC-046 | Birthday notification לילד נוצר רק כאשר ההורה התיר שיתוף זה עם Friends. |
| AC-047 | Admin או Moderator עם PROFESSIONAL_VERIFY יכולים לפתוח בקשת Professional Verification ולעדכן אותה ל-Approved/Rejected/Status אחר שהוגדר; הפעולה נרשמת ב-Audit Log. |
| AC-048 | Community Administration נגיש ל-Admin ול-Moderator עם COMMUNITY_CONFIG בלבד; שינוי תצורה נרשם ב-Audit Log. |
| AC-049 | System Announcements ניתנים ליצירה/עריכה/פרסום/הסרה על ידי Admin או Moderator עם SYSTEM_ANNOUNCEMENTS בלבד; הפעולה נרשמת ב-Audit Log. |
| AC-050 | Regular User יכול להמליץ על Group רק ל-Friendship פעילה; הפעולה שולחת Notification עם Deep Link לקבוצה ואינה מצרפת את הנמען אוטומטית. |
| AC-051 | Regular non-Friend יכול לשלוח Message Request; ללא Accept לא נפתחת Conversation מלאה. |
| AC-052 | Chat Block אינו מסתיר משתמש מחיפוש/פרופיל ואינו מסיר Friendship/Follow; הוא מונע הודעות עד Unblock. |
| AC-053 | Support reply מופיעה ב-Chat בשם “Support”, מקושרת ל-SupportRequest ואינה מאפשרת פתיחת Chat חופשי אל Admin/Moderator. |
| AC-054 | כל Regular פעיל מופיע ב-People Search. Profile Restricted מציג ל-non-Friend רק את ה-Basic Public Profile: שם, תמונה, מספר הילדים, סטטוס הריון או תכנון הריון, Friends ו-Friends משותפים ופעולת הודעה. Profile Open מציג את כל הפרופיל, ו-Tracker Data אינו מוצג ל-non-Friend בשום מצב. |
| AC-055 | Email שכבר קיים בכל חשבון Nestly נדחה גם אם החשבון הקיים מסוג משתמש אחר. |
| AC-056 | כל Regular/Professional פעיל יכול ליצור Public/Private Group והיוצר הופך Group Owner ללא אישור Admin. |
| AC-057 | Professional Marketing Tools כוללים Profile Promotion, Post Promotion ו-Promotion Analytics; Reputation אורגני אינו משתנה עקב קידום. |
| AC-058 | Sponsored Product ניתן לניהול בשלב הראשון רק על ידי Admin ומוצג בסימון מסחרי נפרד מ-User Listing. |
| AC-059 | Marketplace Listing פעיל מאפשר Professional→Regular Chat ישיר בהקשר ה-Listing; מחוץ ל-Marketplace יוזמת Professional כפופה ל-Offer Help. |
| AC-060 | Regular Feed מחיל Authorization/Eligibility לפני Ranking ומשתמש ב-Stage, Interest/Intent, Social/Group/Follow, Quality, Freshness ו-Diversity ללא תלות ב-ML/LLM. |
| AC-061 | Professional Feed אינו משתמש ב-Child/Journey/Tracker Data ומבוסס profession/groups/follows/search/content signals בלבד. |
| AC-062 | Paid Promotion אינו משנה Organic Score/Reputation; כל Paid unit מסומן ומדווח בנפרד. |
| AC-063 | Sponsored candidate שנכשל Privacy/Safety/Relevance eligibility אינו מוצג גם אם Campaign פעיל/משולם. |
| AC-064 | Not Interested/Hide/Show Less משפיעים על ranking עתידי לפי creator/topic/source וניתנים למדידה. |
| AC-065 | Global Search מבצע Authorization לפני דירוג ומיישם Exact/Prefix/Keyword ranking; Semantic AI אינו דרישת v1. |
| AC-066 | Group Highlights פועל ללא ML לפי direct events, announcements/pinned ו-threshold configurable; All/Highlights/Off מכובד. |
| AC-067 | Chat/Support message body אינו נכתב ל-PersonalizationProfile ואינו משמש Recommendation/Paid Targeting. |
| AC-068 | Child DOB/identifiers ו-Tracker Data אינם משמשים Paid Targeting ואינם נחשפים ב-Professional Analytics. |
| AC-069 | Tracker-based guidance מציגה רק תוכן כללי ולא-אבחוני; בהיעדר mapping מאושר המערכת מתעלמת מה-signal. |
| AC-070 | AnalyticsEvent כולל eventId/timestamp והמערכת מונעת ספירה כפולה של eventId זהה; כשל event logging אינו חוסם את הפעולה העסקית. |
| AC-071 | Admin Analytics מציג לפחות Lifecycle/Retention, Feed, Search, Groups, Professionals, Marketplace, Promotions, Support/Moderation ו-Recommendation Quality ב-aggregate. |
| AC-072 | Professional Dashboard/Promotion Analytics מציגים own-account aggregates ומפרידים Organic/Paid ללא user identities או raw search queries. |
| AC-073 | כל שינוי AlgorithmConfiguration דורש Admin ALGORITHM_AI_CONFIG, יוצר configVersion חדש ונרשם ב-Audit עם Before/After. |
| AC-074 | בשלב Web אין Email/SMS/Push להתראות חברתיות/קבוצתיות/Marketplace/Promotion שוטפות — הן In-App בלבד. בשלב Mobile ניתן Push לקטגוריות מאופשרות ובהרשאת מערכת ההפעלה; חסימת Push אינה מוחקת את ה-Notification מתוך Nestly. Email/SMS נשמרים לתהליכים טכניים/חשבון/אבטחה בלבד. |
| AC-075 | Regular User יכול לפרסם פוסט אנונימי. זהות המחבר אינה מוצגת למשתמש קהילה ב-Feed, בתצוגת הפוסט, בחיפוש, ב-Notifications או ב-API, ולא נוצרת עבורו התראת "פוסט חדש של Friend". Admin יכול לראות את המחבר האמיתי. |
