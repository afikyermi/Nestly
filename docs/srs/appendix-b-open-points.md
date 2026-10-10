[← אינדקס ה-SRS](INDEX.md)

# נספח B — נקודות פתוחות שחייבות החלטה לפני פיתוח מלא

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
| OP-016 | Professional Navigation | Professional Dashboard אושר; יש להגדיר את מבנה ה-Bottom Navigation/ניווט המלא של Professional User מעבר להחלפת ה-Home ההורי. |
| OP-017 | Browser / OS versions | Web תומך ב-Chrome וב-Microsoft Edge; שלב האפליקציה יתמוך ב-iOS וב-Android. יש לקבוע גרסאות מינימום נתמכות לפני QA של כל שלב. |
| OP-018 | QA Tooling Selection Gate | המדיניות אושרה: לבחור בכל שלב את כלי ה-QA/Automation היציבים, העדכניים והמתאימים ביותר לסוג הבדיקה, ללא תלות מחייבת ב-React/React Native. לפני תחילת QA בפועל יש לבחור ולתעד Stack לבדיקות Unit / Integration / E2E / Performance / Security לפי הצורך. |

> סיום: הפריטים בנספח B הם החלטות מוצר/טכנולוגיה שעדיין פתוחות. Algorithm & Data v1 הוגדרו בסעיפים 13 ו-18 ואינם נשארים כ-TBD כללי; AI/ML מתקדם מרוכז בנספח D כהמשך שאינו חוסם v1.
