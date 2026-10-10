[← אינדקס ה-SRS](INDEX.md)

# נספח B — נקודות פתוחות ומעקב החלטות

| ID | החלטה | למה חשובה |
|---|---|---|
| OP-001 | שוק ראשון ומדינה | משפיע על שפה, טלפון, מיקום, פרטיות, סליקה ואימות מקצועי. |
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
| OP-018 | QA Tooling Selection Gate | המדיניות אושרה: לבחור בכל שלב את כלי ה-QA/Automation היציבים, העדכניים והמתאימים ביותר לסוג הבדיקה, ללא תלות מחייבת ב-React/React Native. לפני תחילת QA בפועל יש לבחור ולתעד Stack לבדיקות Unit / Integration / E2E / Performance / Security לפי הצורך. |

> סיום: נספח B משמש גם למעקב רציף אחר מזהי OP. פריטים המסומנים “נסגר” (OP-013–OP-015) הם החלטות מאושרות ואינם חוסמי פיתוח; שאר הפריטים בנספח נשארים פתוחים בהתאם לנוסחם. Algorithm & Data v1 הוגדרו בסעיפים 13 ו-18; AI/ML מתקדם מרוכז בנספח D כהמשך שאינו חוסם v1.
