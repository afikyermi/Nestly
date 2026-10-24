# SRS — מפת כותרות

נוצר אוטומטית: `node tools/build-srs-sections.mjs` (נקרא גם מ-`tools/build-srs-index.js`). אין לערוך ידנית.
לנושא ללא מזהה: מצאו כאן את הכותרת, ואז `grep` לכותרת בקובץ וקראו רק את הקטע. בלי מספרי שורות.

## [00-document-info.md](00-document-info.md)

- היסטוריית שינויים

## [01-intro.md](01-intro.md)

- 1.1 מטרת המסמך
- 1.2 מטרת המערכת
- 1.3 קהל יעד
- 1.4 הגדרות ומונחים

## [02-system-overview.md](02-system-overview.md)

- 2.1 הצעת הערך המרכזית
- 2.2 מודל כלכלי
- 2.3 עקרונות בעלי מקצוע
- 2.4 גבולות המערכת
- 2.5 היקף השקה ראשונה (MVP)

## [03-roles-permissions.md](03-roles-permissions.md)

- 3.1 מודל ההרשאות של Moderator
- 3.2 הרשאות ופעולות ייחודיות ל-Admin (Admin Only)
- 3.3 אחריות ניהולית ויומן Audit

## [04-architecture.md](04-architecture.md)

- 4.1 שמות היחידות
- 4.2 מודל השכבות

## [05-functional/admin.md](05-functional/admin.md)

- FR-ADMIN-001 — שליחת פנייה מסווגת להנהלת המערכת
- FR-ADMIN-002 — תיבת פניות Support וניהול
- FR-ADMIN-003 — ניתוח פניות ושימוש במערכת
- FR-ADMIN-004 — ניהול הרשאות Moderator
- FR-ADMIN-005 — Audit Log לפעולות ניהוליות
- FR-ADMIN-006 — טיפול בבקשת Professional Verification (בוטל)
- FR-ADMIN-007 — ניהול תצורות קהילה
- FR-ADMIN-008 — ניהול הודעות מערכת
- FR-ADMIN-009 — ניהול Sponsored Products
- FR-ADMIN-010 — Owner/Admin Intelligence Dashboard v1
- FR-ADMIN-014 — בית הצוות: בית הניהול ו"העבודה שלי"
- FR-ADMIN-015 — מגמות בנתוני מעקב הילדים
- FR-ADMIN-011 — רשימת מוזמנים לבטא סגורה
- FR-ADMIN-012 — ניהול תוכן מערכת — מדריכים לפי סטטוס
- FR-ADMIN-013 — שחרור נעילת שחזור (בוטל)

## [05-functional/algorithms-data.md](05-functional/algorithms-data.md)

- FR-ALG-001 — איסוף Signals ו-Interest/Intent Profile
- FR-ALG-002 — Regular User Feed Ranking v1
- FR-ALG-003 — Professional User Feed Ranking v1
- FR-ALG-004 — Contextual Guidance לפי Stage/Tracker
- FR-ALG-005 — Organic Professional Matching & Exposure
- FR-ALG-006 — Marketplace & Product Ranking v1
- FR-ALG-007 — Sponsored Eligibility & Placement
- FR-ALG-008 — Global Search Ranking v1
- FR-ALG-009 — Diversity, Exploration והסתרת פוסט
- FR-ALG-010 — Group Highlights v1 וחשיפת קבוצות פעילות
- FR-DATA-001 — Analytics Event Tracking v1

## [05-functional/auth.md](05-functional/auth.md)

- FR-AUTH-001 — מסך Welcome
- FR-AUTH-002 — התחברות
- FR-AUTH-003 — שכחת סיסמה
- FR-AUTH-004 — הגבלת גישת Guest
- FR-AUTH-005 — כניסה והרשמה עם Google

## [05-functional/chat.md](05-functional/chat.md)

- FR-CHAT-001 — Chat Center ב-Top Bar
- FR-CHAT-002 — כללי פתיחת שיחה
- FR-CHAT-003 — בקשת שיחה בין Regular Users שאינם Friends
- FR-CHAT-004 — Support Thread בתוך Chat

## [05-functional/feed.md](05-functional/feed.md)

- FR-FEED-001 — הצגת Feed
- FR-FEED-002 — יצירת פוסט/שאלה
- FR-FEED-003 — תגובה ואינטראקציה
- FR-FEED-004 — התאמה לפי שלב
- FR-FEED-005 — פרסום פוסט אנונימי
- FR-FEED-006 — שיתוף פוסט בפיד
- FR-FEED-007 — שיתוף קישור לפוסט או לאתר
- FR-FEED-008 — סטורי

## [05-functional/home-tracking.md](05-functional/home-tracking.md)

- FR-HOME-001 — הצגת בית — מעקב ותכנון
- FR-HOME-002 — הוספת מסלול מעקב
- FR-HOME-003 — רישום פעילות
- FR-TRACK-001 — עמוד Tracker ייעודי
- FR-TRACK-002 — Tracker הנקה
- FR-HOME-004 — טיפים ומאמרים

## [05-functional/marketplace.md](05-functional/marketplace.md)

- FR-MKT-001 — צפייה ב-Marketplace
- FR-MKT-002 — יצירת Marketplace Listing
- FR-MKT-003 — הפרדת סוגי פרסום מסחרי
- FR-MKT-004 — קידום Marketplace Listing של משתמש רגיל
- FR-MKT-005 — פתיחת פריט/מוצר

## [05-functional/moderation.md](05-functional/moderation.md)

- FR-MOD-001 — דיווח על תוכן או משתמש
- FR-MOD-002 — פעולות אכיפה על משתמשים
- FR-MOD-003 — טיפול בדיווחים ובתוכן מדווח

## [05-functional/navigation.md](05-functional/navigation.md)

- FR-TOP-001 — Top Bar גלובלי
- FR-MENU-001 — Hamburger / Side Menu
- FR-MENU-002 — פנייה למוקדי רפואה

## [05-functional/notifications.md](05-functional/notifications.md)

- FR-NOTIF-001 — התראות
- FR-NOTIF-002 — הגדרות Notification
- FR-NOTIF-003 — אירועי Notification לפי סוג משתמש

## [05-functional/professional.md](05-functional/professional.md)

- FR-PRO-001 — Professional Dashboard
- FR-PRO-002 — Professional Performance & Promotion Analytics v1
- FR-PRO-003 — פרסום מאמר מקצועי

## [05-functional/profile-settings.md](05-functional/profile-settings.md)

- FR-PROFILE-001 — צפייה ועריכת פרופיל
- FR-PROFILE-002 — ניהול מסלולים/ילדים
- FR-PRIV-001 — פרטיות פרופיל Regular מול non-Friends
- FR-SET-001 — Settings ויעדי Side Menu
- FR-SET-002 — מחיקת חשבון

## [05-functional/registration.md](05-functional/registration.md)

- FR-REG-001 — בחירת סוג חשבון
- FR-REG-002 — הרשמת משתמש רגיל — פרטים אישיים
- FR-REG-003 — ניהול ילד נוסף בהרשמה
- FR-REG-004 — הרשמת משתמש רגיל — Credentials
- FR-PROREG-001 — הרשמת בעל מקצוע — פרטים מקצועיים
- FR-PROREG-002 — הרשמת בעל מקצוע — Credentials
- FR-PROREG-003 — אימות מקצועי (בוטל)

## [05-functional/relationships-groups.md](05-functional/relationships-groups.md)

- FR-REL-001 — מודל Friends בין משתמשים רגילים
- FR-REL-002 — חסימת משתמש
- FR-FOLLOW-001 — Follow ל-Professional Profile
- FR-GRP-001 — סוגי קבוצות וחשיפת תוכן
- FR-GRP-002 — הצטרפות, בקשות והזמנות לקבוצה
- FR-GRP-003 — תפקידי ניהול קבוצה
- FR-GRP-004 — יצירת Group

## [05-functional/search.md](05-functional/search.md)

- FR-SEARCH-001 — חיפוש

## [05-functional/services.md](05-functional/services.md)

- FR-SERV-001 — איתור בעלי מקצוע
- FR-SERV-002 — סינון בעלי מקצוע
- FR-SERV-003 — צפייה בפרופיל מקצועי
- FR-SERV-004 — פתיחת שיחה ביוזמת משתמש רגיל
- FR-SERV-005 — Offer Help בעקבות פוסט
- FR-SERV-006 — אישור/דחייה/התעלמות מפנייה
- FR-SERV-007 — שיחה חופשית לאחר אישור
- FR-SERV-008 — אכיפת פנייה אחת לכל פוסט
- FR-SERV-009 — Chat Block ודיווח
- FR-SERV-010 — קידום מקצועי בתשלום
- FR-SERV-011 — ביקורת ודירוג לבעל מקצוע

## [06-non-functional.md](06-non-functional.md)

_(אין כותרות ## או ###)_

## [07-screens-navigation.md](07-screens-navigation.md)

- 7.1 Bottom Navigation
- 7.2 מסלולי מעקב ותפריטי Tracker
- 7.3 Top Bar ומנגנונים גלובליים
  - 7.3.1 Hamburger / Side Menu
  - 7.3.2 Global Search
  - 7.3.3 Notifications
  - 7.3.4 Chat
- 7.4 Relationship Model
- 7.5 Groups

## [08-business-rules.md](08-business-rules.md)

_(אין כותרות ## או ###)_

## [09-validations.md](09-validations.md)

_(אין כותרות ## או ###)_

## [10-errors-edge-cases.md](10-errors-edge-cases.md)

_(אין כותרות ## או ###)_

## [11-assumptions-constraints.md](11-assumptions-constraints.md)

_(אין כותרות ## או ###)_

## [12-external-interfaces.md](12-external-interfaces.md)

_(אין כותרות ## או ###)_

## [13-data.md](13-data.md)

- 13.1 קשרים מרכזיים
- 13.2 Data Inventory & Usage v1
- 13.3 Event Taxonomy v1
- 13.4 Retention, User Control & Purpose Boundaries

## [14-use-cases.md](14-use-cases.md)

_(אין כותרות ## או ###)_

## [15-acceptance.md](15-acceptance.md)

_(אין כותרות ## או ###)_

## [16-future-out-of-scope.md](16-future-out-of-scope.md)

_(אין כותרות ## או ###)_

## [17-traceability.md](17-traceability.md)

- 17.1 סטטוס בנייה

## [18-algorithms-spec.md](18-algorithms-spec.md)

- 18.1 עקרונות v1
- 18.2 Signals מאושרים לפי סוג משתמש
- 18.3 Ranking Pipeline v1
- 18.4 Algorithm Catalog — חובה ל-v1
- 18.5 Paid Promotion — כללי דירוג ומדידה
- 18.6 Owner/Admin Intelligence — Core Metrics v1
- 18.7 Professional Analytics — גבולות v1
- 18.8 Success / Evaluation Principles

## [appendix-a-sketches.md](appendix-a-sketches.md)

_(אין כותרות ## או ###)_

## [appendix-b-open-points.md](appendix-b-open-points.md)

_(אין כותרות ## או ###)_

## [appendix-c-srs-structure.md](appendix-c-srs-structure.md)

_(אין כותרות ## או ###)_

## [appendix-d-ai-ml.md](appendix-d-ai-ml.md)

_(אין כותרות ## או ###)_
