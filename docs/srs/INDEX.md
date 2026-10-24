[← README הפרויקט](../../README.md)

# SRS — אינדקס

**מקור האמת של מוצר Nestly.** SRS v2.40 · 23.10.2026.

ה-SRS מתוחזק ב-markdown ומפוצל לפי סעיפים. גרסאות ה-Word הקודמות נמצאות ב-[`archive/`](archive/) כהיסטוריה בלבד.

לנושא ללא מזהה: מצאו את הכותרת ב-[SECTIONS.md](SECTIONS.md) (מפת כותרות לכל קובץ), ואז `grep` לכותרת.

**הקובץ הזה נוצר אוטומטית** — `node tools/build-srs-index.js`. אין לערוך אותו ידנית. כשנוסף או משתנה FR או AC, מריצים את הכלי מחדש. ל-AC חדש מוסיפים קודם שם מקוצר ב-`tools/srs-ac-names.json`.

## קבצים

| § | קובץ | נושא |
|---|---|---|
| — | [00-document-info.md](00-document-info.md) | פרטי המסמך, היסטוריית שינויים, כלל הבסיס ותוכן העניינים המקורי |
| 1 | [01-intro.md](01-intro.md) | מבוא |
| 2 | [02-system-overview.md](02-system-overview.md) | תיאור כללי של המערכת |
| 3 | [03-roles-permissions.md](03-roles-permissions.md) | סוגי משתמשים והרשאות |
| 4 | [04-architecture.md](04-architecture.md) | ארכיטקטורת Pages, Features ו-Components |
| 5 | [05-functional/](05-functional/) | דרישות פונקציונליות — 97 FR ב-16 קבצי תחום (ראה למטה) |
| 6 | [06-non-functional.md](06-non-functional.md) | דרישות לא-פונקציונליות |
| 7 | [07-screens-navigation.md](07-screens-navigation.md) | מסכי מערכת וניווט |
| 8 | [08-business-rules.md](08-business-rules.md) | חוקים עסקיים (Business Rules) |
| 9 | [09-validations.md](09-validations.md) | ולידציות ובדיקות קלט |
| 10 | [10-errors-edge-cases.md](10-errors-edge-cases.md) | טיפול בשגיאות ותרחישי קצה |
| 11 | [11-assumptions-constraints.md](11-assumptions-constraints.md) | הנחות, מגבלות וגבולות |
| 12 | [12-external-interfaces.md](12-external-interfaces.md) | דרישות ממשקים חיצוניים |
| 13 | [13-data.md](13-data.md) | דרישות נתונים / Database |
| 14 | [14-use-cases.md](14-use-cases.md) | Use Cases |
| 15 | [15-acceptance.md](15-acceptance.md) | Acceptance Criteria |
| 16 | [16-future-out-of-scope.md](16-future-out-of-scope.md) | Future Enhancements / Out of Scope |
| 17 | [17-traceability.md](17-traceability.md) | Traceability Matrix |
| 18 | [18-algorithms-spec.md](18-algorithms-spec.md) | אלגוריתמים, התאמה אישית ודאטה — Specification v1 |
| A | [appendix-a-sketches.md](appendix-a-sketches.md) | נספח A — מיפוי 10 הסקיצות שהועלו |
| B | [appendix-b-open-points.md](appendix-b-open-points.md) | נספח B — נקודות פתוחות ומעקב החלטות |
| C | [appendix-c-srs-structure.md](appendix-c-srs-structure.md) | נספח C — התאמה למבנה SRS שניתן בפרויקט |
| D | [appendix-d-ai-ml.md](appendix-d-ai-ml.md) | נספח D — הצעות המשך ותחומים פתוחים: AI/ML ואלגוריתמים מתקדמים |

### 05-functional — קבצי תחום

| קובץ | תחום | קידומות | FR |
|---|---|---|---|
| [auth.md](05-functional/auth.md) | Auth — כניסה והזדהות | FR-AUTH | 5 |
| [registration.md](05-functional/registration.md) | Registration — הרשמה (רגיל ומקצועי) | FR-REG · FR-PROREG | 7 |
| [feed.md](05-functional/feed.md) | Feed — פיד, פוסטים והתאמה לשלב | FR-FEED | 8 |
| [home-tracking.md](05-functional/home-tracking.md) | Home & Tracking — בית, מסלולים ו-Trackers | FR-HOME · FR-TRACK | 6 |
| [marketplace.md](05-functional/marketplace.md) | Marketplace | FR-MKT | 5 |
| [services.md](05-functional/services.md) | Services — בעלי מקצוע, פניות וקידום | FR-SERV | 11 |
| [chat.md](05-functional/chat.md) | Chat | FR-CHAT | 4 |
| [relationships-groups.md](05-functional/relationships-groups.md) | Relationships & Groups — Friends, Follow וקבוצות | FR-REL · FR-FOLLOW · FR-GRP | 7 |
| [profile-settings.md](05-functional/profile-settings.md) | Profile, Privacy & Settings — פרופיל, פרטיות והגדרות | FR-PROFILE · FR-PRIV · FR-SET | 5 |
| [search.md](05-functional/search.md) | Search — חיפוש | FR-SEARCH | 1 |
| [notifications.md](05-functional/notifications.md) | Notifications — התראות | FR-NOTIF | 3 |
| [navigation.md](05-functional/navigation.md) | Navigation — Top Bar ו-Side Menu | FR-TOP · FR-MENU | 3 |
| [professional.md](05-functional/professional.md) | Professional — דשבורד ואנליטיקה מקצועית | FR-PRO | 3 |
| [moderation.md](05-functional/moderation.md) | Moderation — דיווחים ואכיפה | FR-MOD | 3 |
| [admin.md](05-functional/admin.md) | Admin — ניהול מערכת | FR-ADMIN | 15 |
| [algorithms-data.md](05-functional/algorithms-data.md) | Algorithms & Data — אלגוריתמים ואנליטיקה | FR-ALG · FR-DATA | 11 |

## דרישות פונקציונליות — 97

| ID | שם | קובץ |
|---|---|---|
| FR-AUTH-001 | מסך Welcome | [auth.md](05-functional/auth.md) |
| FR-AUTH-002 | התחברות | [auth.md](05-functional/auth.md) |
| FR-AUTH-003 | שכחת סיסמה | [auth.md](05-functional/auth.md) |
| FR-AUTH-004 | הגבלת גישת Guest | [auth.md](05-functional/auth.md) |
| FR-AUTH-005 | כניסה והרשמה עם Google | [auth.md](05-functional/auth.md) |
| FR-REG-001 | בחירת סוג חשבון | [registration.md](05-functional/registration.md) |
| FR-REG-002 | הרשמת משתמש רגיל — פרטים אישיים | [registration.md](05-functional/registration.md) |
| FR-REG-003 | ניהול ילד נוסף בהרשמה | [registration.md](05-functional/registration.md) |
| FR-REG-004 | הרשמת משתמש רגיל — Credentials | [registration.md](05-functional/registration.md) |
| FR-PROREG-001 | הרשמת בעל מקצוע — פרטים מקצועיים | [registration.md](05-functional/registration.md) |
| FR-PROREG-002 | הרשמת בעל מקצוע — Credentials | [registration.md](05-functional/registration.md) |
| FR-PROREG-003 | אימות מקצועי (בוטל) | [registration.md](05-functional/registration.md) |
| FR-FEED-001 | הצגת Feed | [feed.md](05-functional/feed.md) |
| FR-FEED-002 | יצירת פוסט/שאלה | [feed.md](05-functional/feed.md) |
| FR-FEED-003 | תגובה ואינטראקציה | [feed.md](05-functional/feed.md) |
| FR-FEED-004 | התאמה לפי שלב | [feed.md](05-functional/feed.md) |
| FR-FEED-005 | פרסום פוסט אנונימי | [feed.md](05-functional/feed.md) |
| FR-FEED-006 | שיתוף פוסט בפיד | [feed.md](05-functional/feed.md) |
| FR-FEED-007 | שיתוף קישור לפוסט או לאתר | [feed.md](05-functional/feed.md) |
| FR-FEED-008 | סטורי | [feed.md](05-functional/feed.md) |
| FR-HOME-001 | הצגת בית — מעקב ותכנון | [home-tracking.md](05-functional/home-tracking.md) |
| FR-HOME-002 | הוספת מסלול מעקב | [home-tracking.md](05-functional/home-tracking.md) |
| FR-HOME-003 | רישום פעילות | [home-tracking.md](05-functional/home-tracking.md) |
| FR-TRACK-001 | עמוד Tracker ייעודי | [home-tracking.md](05-functional/home-tracking.md) |
| FR-TRACK-002 | Tracker הנקה | [home-tracking.md](05-functional/home-tracking.md) |
| FR-HOME-004 | טיפים ומאמרים | [home-tracking.md](05-functional/home-tracking.md) |
| FR-MKT-001 | צפייה ב-Marketplace | [marketplace.md](05-functional/marketplace.md) |
| FR-MKT-002 | יצירת Marketplace Listing | [marketplace.md](05-functional/marketplace.md) |
| FR-MKT-003 | הפרדת סוגי פרסום מסחרי | [marketplace.md](05-functional/marketplace.md) |
| FR-MKT-004 | קידום Marketplace Listing של משתמש רגיל | [marketplace.md](05-functional/marketplace.md) |
| FR-MKT-005 | פתיחת פריט/מוצר | [marketplace.md](05-functional/marketplace.md) |
| FR-SERV-001 | איתור בעלי מקצוע | [services.md](05-functional/services.md) |
| FR-SERV-002 | סינון בעלי מקצוע | [services.md](05-functional/services.md) |
| FR-SERV-003 | צפייה בפרופיל מקצועי | [services.md](05-functional/services.md) |
| FR-SERV-004 | פתיחת שיחה ביוזמת משתמש רגיל | [services.md](05-functional/services.md) |
| FR-SERV-005 | Offer Help בעקבות פוסט | [services.md](05-functional/services.md) |
| FR-SERV-006 | אישור/דחייה/התעלמות מפנייה | [services.md](05-functional/services.md) |
| FR-SERV-007 | שיחה חופשית לאחר אישור | [services.md](05-functional/services.md) |
| FR-SERV-008 | אכיפת פנייה אחת לכל פוסט | [services.md](05-functional/services.md) |
| FR-SERV-009 | Chat Block ודיווח | [services.md](05-functional/services.md) |
| FR-SERV-010 | קידום מקצועי בתשלום | [services.md](05-functional/services.md) |
| FR-SERV-011 | ביקורת ודירוג לבעל מקצוע | [services.md](05-functional/services.md) |
| FR-CHAT-001 | Chat Center ב-Top Bar | [chat.md](05-functional/chat.md) |
| FR-CHAT-002 | כללי פתיחת שיחה | [chat.md](05-functional/chat.md) |
| FR-CHAT-003 | בקשת שיחה בין Regular Users שאינם Friends | [chat.md](05-functional/chat.md) |
| FR-CHAT-004 | Support Thread בתוך Chat | [chat.md](05-functional/chat.md) |
| FR-REL-001 | מודל Friends בין משתמשים רגילים | [relationships-groups.md](05-functional/relationships-groups.md) |
| FR-REL-002 | חסימת משתמש | [relationships-groups.md](05-functional/relationships-groups.md) |
| FR-FOLLOW-001 | Follow ל-Professional Profile | [relationships-groups.md](05-functional/relationships-groups.md) |
| FR-GRP-001 | סוגי קבוצות וחשיפת תוכן | [relationships-groups.md](05-functional/relationships-groups.md) |
| FR-GRP-002 | הצטרפות, בקשות והזמנות לקבוצה | [relationships-groups.md](05-functional/relationships-groups.md) |
| FR-GRP-003 | תפקידי ניהול קבוצה | [relationships-groups.md](05-functional/relationships-groups.md) |
| FR-GRP-004 | יצירת Group | [relationships-groups.md](05-functional/relationships-groups.md) |
| FR-PROFILE-001 | צפייה ועריכת פרופיל | [profile-settings.md](05-functional/profile-settings.md) |
| FR-PROFILE-002 | ניהול מסלולים/ילדים | [profile-settings.md](05-functional/profile-settings.md) |
| FR-PRIV-001 | פרטיות פרופיל Regular מול non-Friends | [profile-settings.md](05-functional/profile-settings.md) |
| FR-SET-001 | Settings ויעדי Side Menu | [profile-settings.md](05-functional/profile-settings.md) |
| FR-SET-002 | מחיקת חשבון | [profile-settings.md](05-functional/profile-settings.md) |
| FR-SEARCH-001 | חיפוש | [search.md](05-functional/search.md) |
| FR-NOTIF-001 | התראות | [notifications.md](05-functional/notifications.md) |
| FR-NOTIF-002 | הגדרות Notification | [notifications.md](05-functional/notifications.md) |
| FR-NOTIF-003 | אירועי Notification לפי סוג משתמש | [notifications.md](05-functional/notifications.md) |
| FR-TOP-001 | Top Bar גלובלי | [navigation.md](05-functional/navigation.md) |
| FR-MENU-001 | Hamburger / Side Menu | [navigation.md](05-functional/navigation.md) |
| FR-MENU-002 | פנייה למוקדי רפואה | [navigation.md](05-functional/navigation.md) |
| FR-PRO-001 | Professional Dashboard | [professional.md](05-functional/professional.md) |
| FR-PRO-002 | Professional Performance & Promotion Analytics v1 | [professional.md](05-functional/professional.md) |
| FR-PRO-003 | פרסום מאמר מקצועי | [professional.md](05-functional/professional.md) |
| FR-MOD-001 | דיווח על תוכן או משתמש | [moderation.md](05-functional/moderation.md) |
| FR-MOD-002 | פעולות אכיפה על משתמשים | [moderation.md](05-functional/moderation.md) |
| FR-MOD-003 | טיפול בדיווחים ובתוכן מדווח | [moderation.md](05-functional/moderation.md) |
| FR-ADMIN-001 | שליחת פנייה מסווגת להנהלת המערכת | [admin.md](05-functional/admin.md) |
| FR-ADMIN-002 | תיבת פניות Support וניהול | [admin.md](05-functional/admin.md) |
| FR-ADMIN-003 | ניתוח פניות ושימוש במערכת | [admin.md](05-functional/admin.md) |
| FR-ADMIN-004 | ניהול הרשאות Moderator | [admin.md](05-functional/admin.md) |
| FR-ADMIN-005 | Audit Log לפעולות ניהוליות | [admin.md](05-functional/admin.md) |
| FR-ADMIN-006 | טיפול בבקשת Professional Verification (בוטל) | [admin.md](05-functional/admin.md) |
| FR-ADMIN-007 | ניהול תצורות קהילה | [admin.md](05-functional/admin.md) |
| FR-ADMIN-008 | ניהול הודעות מערכת | [admin.md](05-functional/admin.md) |
| FR-ADMIN-009 | ניהול Sponsored Products | [admin.md](05-functional/admin.md) |
| FR-ADMIN-010 | Owner/Admin Intelligence Dashboard v1 | [admin.md](05-functional/admin.md) |
| FR-ADMIN-014 | בית הצוות: בית הניהול ו"העבודה שלי" | [admin.md](05-functional/admin.md) |
| FR-ADMIN-015 | מגמות בנתוני מעקב הילדים | [admin.md](05-functional/admin.md) |
| FR-ADMIN-011 | רשימת מוזמנים לבטא סגורה | [admin.md](05-functional/admin.md) |
| FR-ADMIN-012 | ניהול תוכן מערכת — מדריכים לפי סטטוס | [admin.md](05-functional/admin.md) |
| FR-ADMIN-013 | שחרור נעילת שחזור (בוטל) | [admin.md](05-functional/admin.md) |
| FR-ALG-001 | איסוף Signals ו-Interest/Intent Profile | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-002 | Regular User Feed Ranking v1 | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-003 | Professional User Feed Ranking v1 | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-004 | Contextual Guidance לפי Stage/Tracker | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-005 | Organic Professional Matching & Exposure | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-006 | Marketplace & Product Ranking v1 | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-007 | Sponsored Eligibility & Placement | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-008 | Global Search Ranking v1 | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-009 | Diversity, Exploration והסתרת פוסט | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-ALG-010 | Group Notification Highlights v1 | [algorithms-data.md](05-functional/algorithms-data.md) |
| FR-DATA-001 | Analytics Event Tracking v1 | [algorithms-data.md](05-functional/algorithms-data.md) |

## קריטריוני קבלה — 158

> השמות קוצרו לצורך ניווט בלבד. הנוסח המחייב נמצא ב-[15-acceptance.md](15-acceptance.md).

| ID | שם מקוצר | קובץ |
|---|---|---|
| AC-001 | Welcome מציג את שתי פעולות הכניסה | [15-acceptance.md](15-acceptance.md) |
| AC-002 | אין השלמת הרשמה כששדה חובה לא תקין | [15-acceptance.md](15-acceptance.md) |
| AC-003 | סיסמה שאינה עומדת בכלל נדחית | [15-acceptance.md](15-acceptance.md) |
| AC-004 | התחברות מובילה למעטפת עם הניווט המתאים | [15-acceptance.md](15-acceptance.md) |
| AC-005 | Bottom Navigation של Regular — 3 יעדים ב-MVP | [15-acceptance.md](15-acceptance.md) |
| AC-006 | עמוד הבית מציג את המסלול הפעיל | [15-acceptance.md](15-acceptance.md) |
| AC-007 | Tracker Event תקין נשמר ומוצג | [15-acceptance.md](15-acceptance.md) |
| AC-008 | תוכן ממומן מסומן ואינו מוצג כאורגני | [15-acceptance.md](15-acceptance.md) |
| AC-009 | סינון בעלי מקצוע משנה את הרשימה | [15-acceptance.md](15-acceptance.md) |
| AC-010 | Regular פותח שיחה עם Professional ללא תשלום או אישור | [15-acceptance.md](15-acceptance.md) |
| AC-011 | Message Request אחת לכל פוסט | [15-acceptance.md](15-acceptance.md) |
| AC-012 | אין Chat מלא לפני Accept | [15-acceptance.md](15-acceptance.md) |
| AC-013 | התכתבות ללא מגבלה לאחר Accept | [15-acceptance.md](15-acceptance.md) |
| AC-014 | Offer Help: רק לבקשת עזרה, עד 10 ביום, אחת לפוסט | [15-acceptance.md](15-acceptance.md) |
| AC-015 | עריכת פרופיל נשמרת ומשתקפת | [15-acceptance.md](15-acceptance.md) |
| AC-016 | Guest מנותב ל-Welcome/Login | [15-acceptance.md](15-acceptance.md) |
| AC-017 | אין שדה טלפון בהרשמה | [15-acceptance.md](15-acceptance.md) |
| AC-018 | Professional מקבל Dashboard במקום Tracking הורי | [15-acceptance.md](15-acceptance.md) |
| AC-019 | Marketplace Listing נשמרת בנפרד מפוסט | [15-acceptance.md](15-acceptance.md) |
| AC-020 | הבחנה בין Listing אורגנית, מקודמת וממומנת | [15-acceptance.md](15-acceptance.md) |
| AC-021 | פוסט ו-Listing יכולים לכלול מדיה | [15-acceptance.md](15-acceptance.md) |
| AC-022 | דיווח מגיע ל-Admin; Moderator רק עם הרשאה | [15-acceptance.md](15-acceptance.md) |
| AC-023 | Tracker הנקה נשמר רק כשהסיום אינו מוקדם מההתחלה | [15-acceptance.md](15-acceptance.md) |
| AC-024 | טיפול ב-Support לפי הרשאות; תגובה ב-Chat כ-“Support” | [15-acceptance.md](15-acceptance.md) |
| AC-025 | Admin בעל גישה מלאה ללא תלות בהרשאות Moderator | [15-acceptance.md](15-acceptance.md) |
| AC-026 | Moderator ללא Permission נדחה גם ב-API/Route | [15-acceptance.md](15-acceptance.md) |
| AC-027 | USER_BAN מאפשר Ban/Unban, עם מגבלות יעד | [15-acceptance.md](15-acceptance.md) |
| AC-028 | השעיה דורשת יעד, סיבה ומשך | [15-acceptance.md](15-acceptance.md) |
| AC-029 | פעולות ניהול יוצרות AuditLogEntry | [15-acceptance.md](15-acceptance.md) |
| AC-030 | Moderator צופה ב-Audit Log ללא שינוי או מחיקה | [15-acceptance.md](15-acceptance.md) |
| AC-031 | אין גישה לפעולות Admin Only | [15-acceptance.md](15-acceptance.md) |
| AC-032 | תלויות בין Permission Keys נאכפות | [15-acceptance.md](15-acceptance.md) |
| AC-033 | TopBar לפי סוג חשבון | [15-acceptance.md](15-acceptance.md) |
| AC-034 | Friend Request רק בין Regular Users | [15-acceptance.md](15-acceptance.md) |
| AC-035 | Follow רק אל ProfessionalProfile | [15-acceptance.md](15-acceptance.md) |
| AC-036 | Public Group: פרסום ותגובה רק לחברים | [15-acceptance.md](15-acceptance.md) |
| AC-037 | Private Group: תוכן מוגן ממי שאינו חבר | [15-acceptance.md](15-acceptance.md) |
| AC-038 | היררכיית Group Roles נאכפת | [15-acceptance.md](15-acceptance.md) |
| AC-039 | Global Search לפי סוג, תוך כיבוד הרשאות | [15-acceptance.md](15-acceptance.md) |
| AC-040 | Notification Dropdown ו-Mark all as read | [15-acceptance.md](15-acceptance.md) |
| AC-041 | העדפות Notification; Critical אינן ניתנות לכיבוי | [15-acceptance.md](15-acceptance.md) |
| AC-042 | המלצות תוכן אינן נשלחות כ-Notification | [15-acceptance.md](15-acceptance.md) |
| AC-043 | Notification Center של Professional | [15-acceptance.md](15-acceptance.md) |
| AC-044 | Moderator מקבל התראות ניהול לפי הרשאה | [15-acceptance.md](15-acceptance.md) |
| AC-045 | כללי Chat Dropdown ופתיחת שיחה | [15-acceptance.md](15-acceptance.md) |
| AC-046 | התראת יום הולדת רק בהסכמת ההורה | [15-acceptance.md](15-acceptance.md) |
| AC-047 | בוטל: אימות Professional | [15-acceptance.md](15-acceptance.md) |
| AC-048 | Community Administration רק עם COMMUNITY_CONFIG | [15-acceptance.md](15-acceptance.md) |
| AC-049 | System Announcements רק עם SYSTEM_ANNOUNCEMENTS | [15-acceptance.md](15-acceptance.md) |
| AC-050 | המלצה על Group רק ל-Friend פעיל | [15-acceptance.md](15-acceptance.md) |
| AC-051 | Regular Chat Request בין non-Friends | [15-acceptance.md](15-acceptance.md) |
| AC-052 | Chat Block מונע הודעות בלבד | [15-acceptance.md](15-acceptance.md) |
| AC-053 | תגובת Support ב-Chat ללא Chat חופשי | [15-acceptance.md](15-acceptance.md) |
| AC-054 | Restricted מציג Basic Public Profile; Open ללא Tracker Data | [15-acceptance.md](15-acceptance.md) |
| AC-055 | Email ייחודי בכל סוגי החשבונות | [15-acceptance.md](15-acceptance.md) |
| AC-056 | יצירת Group ללא אישור Admin | [15-acceptance.md](15-acceptance.md) |
| AC-057 | כלי שיווק מקצועיים לא משנים Reputation | [15-acceptance.md](15-acceptance.md) |
| AC-058 | Sponsored Product מנוהל ע"י Admin בלבד | [15-acceptance.md](15-acceptance.md) |
| AC-059 | Marketplace Chat ישיר מ-Professional ל-Regular | [15-acceptance.md](15-acceptance.md) |
| AC-060 | Regular Feed: Eligibility לפני Ranking, ללא ML | [15-acceptance.md](15-acceptance.md) |
| AC-061 | Professional Feed ללא Child/Tracker Data | [15-acceptance.md](15-acceptance.md) |
| AC-062 | Paid לא משנה Organic Score | [15-acceptance.md](15-acceptance.md) |
| AC-063 | Sponsored שנכשל ב-Eligibility אינו מוצג | [15-acceptance.md](15-acceptance.md) |
| AC-064 | Not Interested/Show Less משפיעים על Ranking; הסתרה לא | [15-acceptance.md](15-acceptance.md) |
| AC-065 | Search: Authorization לפני דירוג, ללא Semantic AI | [15-acceptance.md](15-acceptance.md) |
| AC-066 | Group Highlights ללא ML | [15-acceptance.md](15-acceptance.md) |
| AC-067 | תוכן Chat/Support לא משמש התאמה אישית | [15-acceptance.md](15-acceptance.md) |
| AC-068 | Child/Tracker Data לא משמשים Paid Targeting | [15-acceptance.md](15-acceptance.md) |
| AC-069 | הכוונת Tracker כללית ולא-אבחונית | [15-acceptance.md](15-acceptance.md) |
| AC-070 | AnalyticsEvent עם eventId וללא ספירה כפולה | [15-acceptance.md](15-acceptance.md) |
| AC-071 | Admin Analytics: כל התחומים, גם למשתמש בודד, בלי שמות | [15-acceptance.md](15-acceptance.md) |
| AC-072 | Professional Analytics — own-account aggregates בלבד | [15-acceptance.md](15-acceptance.md) |
| AC-073 | שינוי AlgorithmConfiguration: Admin, גרסה ו-Audit | [15-acceptance.md](15-acceptance.md) |
| AC-074 | ערוצי התראה: Web רק In-App; Mobile גם Push בהרשאה | [15-acceptance.md](15-acceptance.md) |
| AC-075 | פוסט אנונימי לא חושף את המחבר למשתמשי קהילה | [15-acceptance.md](15-acceptance.md) |
| AC-076 | פוסט אנונימי: תגובות המחבר, פיד, Offer Help ומונים | [15-acceptance.md](15-acceptance.md) |
| AC-077 | חשיפת מחבר אנונימי ע"י Moderator — רק בדיווח, עם Audit | [15-acceptance.md](15-acceptance.md) |
| AC-078 | אין שליפה גורפת של משתמשים; הגבלת קצב | [15-acceptance.md](15-acceptance.md) |
| AC-079 | שיתוף בפיד: המשתף, הטקסט והמקור לפי הרשאות | [15-acceptance.md](15-acceptance.md) |
| AC-080 | אין שיתוף ל"חברים בלבד", לאנונימי, לקבוצה פרטית ולממומן | [15-acceptance.md](15-acceptance.md) |
| AC-081 | מקור שנמחק: "לא זמין" ובלי תוכן | [15-acceptance.md](15-acceptance.md) |
| AC-082 | קישור: התחברות ואז הפוסט; בלי הרשאה — לא זמין | [15-acceptance.md](15-acceptance.md) |
| AC-083 | תצוגה מקדימה של קישור בלי תוכן | [15-acceptance.md](15-acceptance.md) |
| AC-084 | אישור תנאים חובה, עם גרסה ותאריך | [15-acceptance.md](15-acceptance.md) |
| AC-085 | בוטל: אין אימות אימייל | [15-acceptance.md](15-acceptance.md) |
| AC-086 | נדחה: בטא סגורה | [15-acceptance.md](15-acceptance.md) |
| AC-087 | כניסה והרשמה עם Google | [15-acceptance.md](15-acceptance.md) |
| AC-088 | הצהרת גיל 18+ עם התנאים | [15-acceptance.md](15-acceptance.md) |
| AC-089 | בחירה מרובה של השלב | [15-acceptance.md](15-acceptance.md) |
| AC-090 | עד 10 ילדים | [15-acceptance.md](15-acceptance.md) |
| AC-091 | כניסה מיד, בלי אימות אימייל | [15-acceptance.md](15-acceptance.md) |
| AC-092 | שחזור סיסמה בתוך המערכת | [15-acceptance.md](15-acceptance.md) |
| AC-093 | ביקורת רק אחרי פנייה מאושרת | [15-acceptance.md](15-acceptance.md) |
| AC-094 | מאמר מקצועי עם הערת אחריות | [15-acceptance.md](15-acceptance.md) |
| AC-095 | מדריך מוצג רק אחרי פרסום | [15-acceptance.md](15-acceptance.md) |
| AC-096 | הרשמה דורשת בדיקת אדם | [15-acceptance.md](15-acceptance.md) |
| AC-097 | אין רכישה ב-Marketplace | [15-acceptance.md](15-acceptance.md) |
| AC-098 | תשלום מדומה בלי פרטי כרטיס | [15-acceptance.md](15-acceptance.md) |
| AC-099 | חשבון מושעה או חסום נעצר בהתחברות | [15-acceptance.md](15-acceptance.md) |
| AC-100 | השלמת הרשמה שלא הסתיימה | [15-acceptance.md](15-acceptance.md) |
| AC-101 | Session נשמר ו-Logout מנקה | [15-acceptance.md](15-acceptance.md) |
| AC-102 | סטורי פג אחרי 24 שעות | [15-acceptance.md](15-acceptance.md) |
| AC-103 | מגבלת 10 סטורי ביממה | [15-acceptance.md](15-acceptance.md) |
| AC-104 | הקטנה וניקוי EXIF בהעלאה | [15-acceptance.md](15-acceptance.md) |
| AC-105 | תמונה גלויה רק אחרי בדיקה בשרת | [15-acceptance.md](15-acceptance.md) |
| AC-106 | חלון דיווח ועדיפות בתור | [15-acceptance.md](15-acceptance.md) |
| AC-107 | אכיפה ידנית ומדרג | [15-acceptance.md](15-acceptance.md) |
| AC-108 | מחיקת חשבון עם חרטה | [15-acceptance.md](15-acceptance.md) |
| AC-109 | עמוד מוקדי רפואה | [15-acceptance.md](15-acceptance.md) |
| AC-110 | חסימה מיידית על סכנה לילד | [15-acceptance.md](15-acceptance.md) |
| AC-111 | שחזור סיסמה בשתי תשובות נכונות | [15-acceptance.md](15-acceptance.md) |
| AC-112 | תגובה אחידה בכשל שחזור | [15-acceptance.md](15-acceptance.md) |
| AC-113 | נעילת ניסיונות שחזור | [15-acceptance.md](15-acceptance.md) |
| AC-114 | מסך שאלות השחזור חובה | [15-acceptance.md](15-acceptance.md) |
| AC-115 | החלפת שאלות השחזור מהתפריט | [15-acceptance.md](15-acceptance.md) |
| AC-116 | נרמול תשובות השחזור | [15-acceptance.md](15-acceptance.md) |
| AC-117 | החלפת סיסמה אחרי שתי תשובות | [15-acceptance.md](15-acceptance.md) |
| AC-118 | ניקוי ההשתלטות בכניסת Google ראשונה | [15-acceptance.md](15-acceptance.md) |
| AC-119 | פרטיות: ברירת מחדל Open | [15-acceptance.md](15-acceptance.md) |
| AC-120 | Friend רואה את תצוגת ה-Open | [15-acceptance.md](15-acceptance.md) |
| AC-121 | דחייה שקטה וביטול בקשה | [15-acceptance.md](15-acceptance.md) |
| AC-122 | 100 פתיחות פרופיל בשעה | [15-acceptance.md](15-acceptance.md) |
| AC-123 | מחיקת ילד או הריון אחרי אישור | [15-acceptance.md](15-acceptance.md) |
| AC-124 | קישור לפרופיל: התחברות ואז הפרופיל | [15-acceptance.md](15-acceptance.md) |
| AC-125 | סדר התפריט ומסך ההגדרות | [15-acceptance.md](15-acceptance.md) |
| AC-126 | בוטל: שחרור נעילת שחזור | [15-acceptance.md](15-acceptance.md) |
| AC-127 | הסתרת פוסט לעצמי, בלי השפעה על דירוג | [15-acceptance.md](15-acceptance.md) |
| AC-128 | שם מלא לכותב ולמגיב | [15-acceptance.md](15-acceptance.md) |
| AC-129 | שדה כתיבה פתוח בראש הפיד | [15-acceptance.md](15-acceptance.md) |
| AC-130 | Professional מפרסם בשמו, קורא ומגיב | [15-acceptance.md](15-acceptance.md) |
| AC-131 | מחיקה מיידית; תחת דיווח — מוסתר עד 90 יום | [15-acceptance.md](15-acceptance.md) |
| AC-132 | תוצאות דיווח ודיווח חוזר | [15-acceptance.md](15-acceptance.md) |
| AC-133 | חלונות, תפריטים ו-Back במקום | [15-acceptance.md](15-acceptance.md) |
| AC-134 | תגובות ועריכה בתוך הכרטיס | [15-acceptance.md](15-acceptance.md) |
| AC-135 | חסימת משתמש מהפרופיל | [15-acceptance.md](15-acceptance.md) |
| AC-136 | חסימה הדדית ומה היא מסתירה | [15-acceptance.md](15-acceptance.md) |
| AC-137 | רשימת החסומים וביטול חסימה | [15-acceptance.md](15-acceptance.md) |
| AC-138 | הזמנת Moderator חד-פעמית | [15-acceptance.md](15-acceptance.md) |
| AC-139 | הודעת מערכת בראש הפיד | [15-acceptance.md](15-acceptance.md) |
| AC-140 | סיבת דיווח שהושבתה | [15-acceptance.md](15-acceptance.md) |
| AC-141 | סירוב לבקשת שיחה אינו חסימה | [15-acceptance.md](15-acceptance.md) |
| AC-142 | Chat Block חוסם את שני הצדדים | [15-acceptance.md](15-acceptance.md) |
| AC-143 | דיווח על הודעה בצ'אט | [15-acceptance.md](15-acceptance.md) |
| AC-144 | הסרה וחסימה בקבוצה | [15-acceptance.md](15-acceptance.md) |
| AC-145 | התראות קבוצה לפי mode | [15-acceptance.md](15-acceptance.md) |
| AC-146 | הרשמת בעל מקצוע | [15-acceptance.md](15-acceptance.md) |
| AC-147 | הצעת עזרה לפוסט אנונימי | [15-acceptance.md](15-acceptance.md) |
| AC-148 | ניווט ותפריט של בעל מקצוע | [15-acceptance.md](15-acceptance.md) |
| AC-149 | התראות לבעל מקצוע | [15-acceptance.md](15-acceptance.md) |
| AC-150 | דיווח על ביקורת ומאמר | [15-acceptance.md](15-acceptance.md) |
| AC-151 | בעלי מקצוע במעקב | [15-acceptance.md](15-acceptance.md) |
| AC-152 | הזמנת צוות ל-48 שעות | [15-acceptance.md](15-acceptance.md) |
| AC-153 | מגמות נתוני ילדים | [15-acceptance.md](15-acceptance.md) |
| AC-154 | בית לפי תפקיד | [15-acceptance.md](15-acceptance.md) |
| AC-155 | בדיקה עצמאית של הצוות | [15-acceptance.md](15-acceptance.md) |
| AC-156 | תור העבודה של הצוות | [15-acceptance.md](15-acceptance.md) |
| AC-157 | בית הניהול ומסנני היומן | [15-acceptance.md](15-acceptance.md) |
| AC-158 | חשיפת מחבר בקבוצה פרטית | [15-acceptance.md](15-acceptance.md) |

## מזהים נוספים

| סוג | נושא | טווח | כמות | קובץ |
|---|---|---|---|---|
| BR | חוקים עסקיים | BR-001 … BR-083 | 83 | [08-business-rules.md](08-business-rules.md) |
| VAL | ולידציות | VAL-001 … VAL-051 | 50 | [09-validations.md](09-validations.md) |
| ERR | שגיאות ותרחישי קצה | ERR-001 … ERR-047 | 47 | [10-errors-edge-cases.md](10-errors-edge-cases.md) |
| NFR | דרישות לא-פונקציונליות | NFR-SEC-001 … NFR-SEC-010 | 36 | [06-non-functional.md](06-non-functional.md) |
| UC | Use Cases | UC-01 … UC-42 | 42 | [14-use-cases.md](14-use-cases.md) |
| PG | מסכים | PG-001 … PG-059 | 59 | [07-screens-navigation.md](07-screens-navigation.md) |
| OP | נקודות פתוחות ומעקב החלטות | OP-001 … OP-067 | 64 | [appendix-b-open-points.md](appendix-b-open-points.md) |
| ALG | קטלוג האלגוריתמים | ALG-01 … ALG-09 | 9 | [18-algorithms-spec.md](18-algorithms-spec.md) |
| P-ALG | עקרונות האלגוריתמים | P-ALG-01 … P-ALG-08 | 8 | [18-algorithms-spec.md](18-algorithms-spec.md) |
