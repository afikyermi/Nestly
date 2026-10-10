[← אינדקס ה-SRS](INDEX.md)

# נספח B — נקודות פתוחות ומעקב החלטות

| ID | החלטה | למה חשובה |
|---|---|---|
| OP-001 | שוק ראשון ומדינה — נסגר | החלטה מאושרת (12.9.2026): ישראל בלבד בשלב ההשקה. משפיע על שפה, טלפון, מיקום, פרטיות, סליקה ואימות מקצועי. |
| OP-002 | Web → Mobile / React Native transition plan | החלטה עקרונית סגורה: Web ב-React תחילה; Mobile ב-React Native רק לאחר השלמה ואישור. לפני תחילת שלב Mobile יש להגדיר תכנית מעבר מקצועית: אילו שכבות/לוגיקה משותפות, מה נכתב מחדש, מבנה Repository/Packages ותכנית Migration. |
| OP-003 | מודל My Stage + Multiple Children | מהו Context פעיל כאשר יש מספר ילדים או הריון במקביל לילד קיים. |
| OP-004 | אפשרויות שדה מין/זהות | הסקיצות כוללות בחירה אך הערכים לא הוגדרו. |
| OP-005 | Professional Verification | מי חייב באימות, איזה מסמך/מספר ואיך מאשרים. |
| OP-006 | שדה מקצועי לא-קריא בסקיצת Professional Registration | יש לאשר האם מדובר במספר רישיון/תעודה/מספר מקצועי אחר. |
| OP-007 | Tracker נוסף בעמוד הבית | האריח השמאלי ביותר אינו קריא בוודאות. |
| OP-008 | Tracker Fields | לכל Tracker צריך להגדיר קלטים, חוקים והיסטוריה. |
| OP-009 | Report Escalation Policy | Chat Block הוגדר. עדיין יש להגדיר מדיניות טיפול/הסלמה של Reports חוזרים: thresholds, review, warnings ואכיפה. |
| OP-010 | Professional Outreach Content Policy | להגדיר אילו סוגי פנייה יזומה נחשבים שימושיים/מותרים ואילו ייחשבו ספאם או פרסום לא רצוי לצורכי Moderation. |
| OP-011 | Messaging Capabilities | האם Chat כולל תמונות/קבצים, Read Receipts, Typing Indicator ויכולות נוספות מעבר לטקסט. |
| OP-012 | Marketplace Commerce Rules | העלאת Listing וקידום משתמש אושרו; עדיין יש להגדיר שדות Listing, מסירה/מכירה, סגירת Listing והמשך הפעולה המסחרית. |
| OP-013 | Scope Search — נסגר | החלטה מאושרת: Global Search החברתי מחפש People, Groups ו-Posts בלבד. Professional מופיע תחת People; Marketplace/Products אינם חלק מהחיפוש החברתי ב-v1. Admin/Moderator משתמשים בכלי חיפוש ניהוליים ולא ב-Global Search הצרכני. נשמר כאן לצורכי רציפות IDs ו-Traceability. |
| OP-014 | Notification Delivery Channels — נסגר | החלטה מאושרת: Web משתמש ב-In-App Notifications. בשלב Mobile ניתן גם Push לקטגוריות שהמשתמש הפעיל, בכפוף להרשאת מערכת ההפעלה. Email/SMS אינם משמשים להתראות חברתיות/קבוצתיות/Marketplace/Promotion שוטפות; הם שמורים לתהליכים טכניים/חשבון/אבטחה. בחירת ספק/ערוץ Password Recovery נשארת החלטה נפרדת. |
| OP-015 | Admin / Moderator Permission Model — נסגר | החלטה מאושרת: Admin הוא Super Admin יחיד עם גישה מלאה. Moderator הוא חשבון מערכת נפרד הפועל רק לפי Permission Keys שה-Admin מקצה/משנה/מבטל; אין Support User. פעולות ניהול ואכיפה כפופות להרשאות Backend ול-Audit Log. נשמר כאן לצורכי רציפות IDs ו-Traceability. |
| OP-016 | Professional Navigation | Professional Dashboard אושר; יש להגדיר את מבנה ה-Bottom Navigation/ניווט המלא של Professional User מעבר להחלפת ה-Home ההורי. |
| OP-017 | Browser / OS versions | Web תומך ב-Chrome וב-Microsoft Edge; שלב האפליקציה יתמוך ב-iOS וב-Android. יש לקבוע גרסאות מינימום נתמכות לפני QA של כל שלב. |
| OP-018 | QA Tooling Selection Gate — נסגר ל-Web | המדיניות אושרה: לבחור בכל שלב את כלי ה-QA/Automation היציבים, העדכניים והמתאימים ביותר לסוג הבדיקה, ללא תלות מחייבת ב-React/React Native. **Stack שנבחר ל-Web (10.10.2026):** Unit / Integration — Vitest + React Testing Library · E2E — Playwright, על Chrome ו-Edge (NFR-COMP-001) · נגישות אוטומטית — axe-core בתוך Playwright (NFR-A11Y-001) · הרשאות ו-RLS בבסיס הנתונים — pgTAP · תלויות — npm audit ב-CI · Performance — לא בשלב זה. ה-Stack לשלב Mobile ייבחר מחדש בתחילת שלב React Native. |
| OP-019 | Anonymous Post Rules — נסגר | החלטה מאושרת (10.10.2026): (1) רק Regular User רשאי לפרסם אנונימית; (2) בכל מקום שבו Regular רשאי לפרסם — Feed וכל Group שהוא Member בה; (3) תגובות המחבר בשרשור הפוסט האנונימי שלו מוצגות תחת "המחבר", ואין תגובות אנונימיות של משתמשים אחרים ב-v1; (4) Offer Help מותר, והזהות נחשפת לבעל המקצוע רק ב-Accept; (5) פוסט אנונימי אינו נכנס לפיד דרך הגרף החברתי של המחבר; (6) Moderator חושף זהות רק בטיפול בדיווח על הפוסט, עם REPORTS_VIEW ו-CONTENT_MODERATE, ועם Audit; (7) אינו נספר במוניטין, ב-Give Back או במונים ציבוריים. מיושם ב-FR-FEED-003, FR-FEED-005, FR-SERV-005, FR-ALG-002, BR-062, VAL-036, AC-075–AC-077 ו-NFR-AUDIT-001. |
| OP-020 | פרטים מזהים של ילדים בפרופיל Open — נסגר | החלטה מאושרת (10.10.2026): בצפייה בפרופיל, Professional כפוף לאותם כללים כמו Regular non-Friend. מידע על ילדים והריון מוצג ל-non-Friend רק כ-**Journey Summary** (§1.4): מספר ילדים, גילאים (ב-Open בלבד), ו"בהריון" אם קיים — ללא פרטים. שמות ילדים, תאריכי לידה, שבוע הריון ותאריך לידה צפוי אינם מוצגים. אם אין ילדים ואין הריון — משפט הומוריסטי הקשור לתכנון (OP-021). NFR-PRIV-005 הובהר: האיסור חל על Paid Targeting ועל ערוצים עסקיים, ולא על צפייה בפרופיל. BR-037 ללא שינוי. מיושם ב-§1.4, FR-PRIV-001, NFR-PRIV-005, BR-044, BR-053, VAL-027, AC-054 ו-§13.2. |
| OP-021 | נוסח משפט התכנון ההומוריסטי | ב-Journey Summary, כשאין ילדים ואין הריון, מוצג משפט קליל והומוריסטי הקשור לתכנון (OP-020). נדרשת החלטה על הנוסח. המשפט מוצג לכל מי שאין לו ילדים והריון, ולכן אינו חושף מי עוקב בפועל אחרי מחזור וביוץ; כדאי שיהיה ניטרלי ולא יניח כוונה. עוד שאלה לבחינה: האם המשתמש יכול להסתיר אותו. |

> סיום: נספח B משמש גם למעקב רציף אחר מזהי OP. פריטים המסומנים “נסגר” (OP-001, OP-013–OP-015, OP-018 ל-Web, OP-019, OP-020) הם החלטות מאושרות ואינם חוסמי פיתוח; שאר הפריטים בנספח, כולל OP-021, נשארים פתוחים בהתאם לנוסחם. Algorithm & Data v1 הוגדרו בסעיפים 13 ו-18; AI/ML מתקדם מרוכז בנספח D כהמשך שאינו חוסם v1.
