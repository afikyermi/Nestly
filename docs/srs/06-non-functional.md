[← אינדקס ה-SRS](INDEX.md)

# 6. דרישות לא-פונקציונליות

> כלל: אין לקבוע יעדי ביצועים שרירותיים. דרישות שאינן מדידות עדיין מסומנות TBD עד לקביעת יעד.

| ID | תחום | דרישה |
|---|---|---|
| NFR-SEC-001 | Security | סיסמאות לא יישמרו כטקסט גלוי. מנגנון hash מאובטח ייקבע ב-Tech Design. |
| NFR-SEC-002 | Security | המערכת תאכוף הרשאות לפי Role ו-Permission Keys בצד השרת ובממשק. עבור Moderator ברירת המחדל היא Deny; גישה נפתחת רק להרשאה שה-Admin הקצה במפורש. |
| NFR-SEC-003 | Security | אם תשלומים עבור קידום/כלים שיווקיים יתבצעו בתוך המערכת, הם יבוצעו באמצעות ספק סליקה מאושר; אין לשמור נתוני כרטיס מלאים במערכת אלא אם פתרון הסליקה דורש ומאפשר זאת בהתאם לתקן הרלוונטי. |
| NFR-PRIV-001 | Privacy | מידע אישי, מידע על ילדים ונתוני מסע הורות ייחשפו רק בהתאם להגדרות החשיפה וההרשאות שייקבעו. |
| NFR-PERF-001 | Performance | יעד זמן תגובה למסכי ליבה — TBD לפני בדיקות ביצועים. |
| NFR-LOAD-001 | Load | מספר משתמשים בו-זמניים יעד — TBD. |
| NFR-AVAIL-001 | Availability | יעד זמינות — TBD. |
| NFR-USE-001 | Usability | הסקיצות הן Mobile-first. נדרשת התאמה למסכים קטנים; תמיכה מלאה ב-Desktop/Tablet תיקבע לפי Scope הפיתוח. |
| NFR-A11Y-001 | Accessibility | גרסת ה-Web תעמוד ב-WCAG 2.2 ברמה AA (החלטה מ-10.10.2026). רמת הנגישות לשלב React Native תוגדר כחלק מתכנית המעבר (OP-002). |
| NFR-COMP-001 | Compatibility | גרסת ה-Web תתמוך ב-Google Chrome וב-Microsoft Edge. בשלב האפליקציה העתידי תפותח תמיכה ב-iOS וב-Android. גרסאות מינימום נתמכות לכל דפדפן/מערכת הפעלה יוגדרו לפני QA של אותו שלב. |
| NFR-AUDIT-001 | Audit | כל פעולה ניהולית משמעותית של Admin/Moderator תירשם ב-Audit Log: שינוי הרשאות, טיפול בפניות, Warning/Suspension/Ban/Unban, הסרה/שחזור תוכן או Listing, אימות Professional, שינוי Community Config ופרסום הודעת מערכת. הרשומה תכלול Actor, Role, Permission, Action, Target, Timestamp, Result וסיבה לפי הצורך; בשינוי הרשאות יישמר Before/After. Moderator אינו רשאי לשנות/למחוק רשומות. Retention TBD. גישת Moderator לתוכן Private Group באמצעות PRIVATE_GROUP_MODERATE תירשם גם היא, וכך גם כל חשיפה של זהות מחבר של Anonymous Post על ידי Moderator (FR-FEED-005). |
| NFR-QA-001 | Quality Assurance | כלי ה-QA והאוטומציה ייבחרו בכל שלב לפי הכלים היציבים, העדכניים והמתאימים ביותר לסוג הבדיקה ולארכיטקטורה בפועל. הבחירה אינה כבולה ל-React או ל-React Native. בדיקות אוטומטיות יכולות להיכתב כקוד, אך תשתית הבדיקות תישמר מופרדת מהלוגיקה העסקית ולא תשנה את התנהגות סביבת Production. יש להגדיר Unit, Integration, E2E ובדיקות נוספות לפי הצורך. |
| NFR-DATA-001 | Data Governance | Data Inventory & Usage v1 מוגדר בסעיף 13.2. לפני Production יש להשלים Retention periods, Privacy Policy/Terms, Consent/Notice ודרישות השוק הראשון; שינוי Purpose מחייב עדכון המסמך והמדיניות. |
| NFR-MEDIA-001 | Media | המערכת תתמוך בתמונות ובסרטונים לפחות בפוסטים קהילתיים וב-Marketplace Listings. פורמטים, גדלים, אחסון ומגבלות TBD. |
| NFR-SEC-004 | Security | פעולות Admin Only אינן ניתנות להקצאה ל-Moderator גם באמצעות שינוי Client/UI. הרשאה תיבדק מחדש ב-Backend בכל פעולה מוגנת. |
| NFR-SEC-005 | Security | כל Deep Link מתוך Search/Notification/Chat יבצע בדיקת Authorization מחדש בצד ה-Backend; קיום Notification או Search Result אינו מעניק הרשאה לתוכן. |
| NFR-PRIV-002 | Privacy | תוכן Private Group לא יוחזר ב-Search/API/Deep Link למשתמש קהילה שאינו Member. חריג ניהולי: Admin רשאי לגשת לצורך ניהול; Moderator שאינו Member רשאי לקבל גישה נקודתית דרך כלי Moderation רק עם PRIVATE_GROUP_MODERATE ובצירוף הרשאות הטיפול הנדרשות. אין Membership והגישה נרשמת ב-Audit Log. |
| NFR-PRIV-003 | Privacy | התראת יום הולדת של ילד תיווצר רק אם ההורה הגדיר שהמידע מותר לשיתוף עם Friends. |
| NFR-USAB-002 | Usability | Top Bar, Search/Notification/Chat Dropdowns ו-Side Drawer ישמרו על מבנה והתנהגות עקביים בין מסכי Web; בשלב Mobile יותאמו ל-React Native ללא שינוי לוגיקה עסקית מאושרת. |
| NFR-USAB-003 | Usability | שפת הממשק בעברית מנוסחת באופן ניטרלי מגדרית: פנייה בלשון סתמית או בשם פעולה ("אפשר לשתף", "יש למלא", כפתור "שמירה"), ולשון רבים רק כשאין חלופה. אין צורות לוכסן ("את/ה") ואין הנחה על מגדר המשתמש. ההחלטה אינה תלויה ב-OP-004 (החלטה מ-11.10.2026). |
| NFR-ALG-001 | Algorithm Governance | v1 חייב לעבוד ללא ML/LLM באמצעות Rule-Based/Scoring Configuration. משקולות, decay, thresholds, exploration/frequency caps לא יוקשחו בקוד כאשר ניתן לנהל אותם ב-AlgorithmConfiguration. |
| NFR-ALG-002 | Algorithm Safety | Authorization/Privacy/Block/Group visibility ו-content status מיושמים לפני Ranking. Recommendation לעולם אינה עוקפת הרשאה בגלל Score או Paid Promotion. |
| NFR-ALG-003 | Organic vs Paid | Organic Score/Reputation ו-Paid Promotion נשמרים ומדווחים בנפרד. תשלום אינו משנה Organic ranking history או Professional reputation. |
| NFR-DATA-002 | Analytics Quality | אירוע Analytics יכלול eventId ו-timestamp ויהיה ניתן למנוע/לזהות duplicates. כשל Analytics לא יחסום פעולה עסקית של המשתמש. |
| NFR-DATA-003 | Data Minimization | Generic analytics events ישמרו מזהים/metadata הנדרשים למדידה בלבד ולא ישכפלו גוף Chat, Support message או תוכן פרטי שאינו נדרש למדד. |
| NFR-PRIV-004 | Privacy | תוכן Chat ו-Support לא ישמש Personalization, Recommendation או Paid Targeting. ניתן להשתמש ב-metadata תפעולי מצומצם כגון timestamps/read state/Support category לצורך תפעול ו-aggregate analytics. |
| NFR-PRIV-005 | Privacy | Child DOB/פרטים מזהים ו-Tracker Data לא ישמשו Paid Targeting, ולא יועברו ל-Professional/Advertiser דרך ערוצים עסקיים: Professional Analytics, Promotion Analytics, Targeting או כל Dashboard. **צפייה בפרופיל Regular אינה ערוץ כזה:** היא כפופה ל-FR-PRIV-001, באופן זהה לצופה Regular ולצופה Professional, ו-Tracker Data אינו מוצג בה ל-non-Friend בשום מצב (OP-020). Organic contextual guidance יכול להשתמש ב-Stage/Tracker signals בהתאם לסעיף 18. |
| NFR-PRIV-006 | Privacy / Safety | Tracker/Stage personalization לא יבצע אבחון רפואי, חיזוי מחלה או המלצה רפואית מותאמת. התוכן שיוצג יהיה ידע/טיפים כלליים ובכפוף לכללי המוצר. |
| NFR-OBS-001 | Observability | כל Algorithm/Recommendation Event ישמור algorithmVersion/configVersion/sourceSurface כדי לאפשר השוואת ביצועים, Debug ו-Audit של שינויי Configuration. |
| NFR-SEC-006 | Security | הגנה מפני שליפה גורפת של משתמשים (Enumeration / Scraping): (1) הגבלת קצב (Rate Limit) לחיפושי People Search ולפתיחת פרופילים, לכל חשבון; (2) אין ממשק או API שמחזיר רשימת משתמשים ללא מחרוזת חיפוש; (3) מגבלת תוצאות ו-Pagination לכל חיפוש; (4) מזהי משתמש ופרופיל אינם רציפים ואינם ניתנים לניחוש; (5) חריגה או דפוס חריג נרשמים כאירוע Security ומדווחים ל-Admin. ערכי הסף הם Configuration שיוגדר לפני Production; שינויים — Admin בלבד (SECURITY_SETTINGS_MANAGE). |
