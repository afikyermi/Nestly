[← אינדקס ה-SRS](INDEX.md)

# 16. Future Enhancements / Out of Scope

| נושא | סיווג | הערה |
|---|---|---|
| קביעת פגישה, Booking Commitment וחיוב Lead בתוך Nestly | Out of Scope | המודל המעודכן מאפשר תקשורת חופשית ואינו מנהל קביעת פגישה או חיוב Lead כחלק מזרימת השירות. |
| אבחון רפואי על ידי הפלטפורמה | Out of Scope | המערכת אינה תחליף רפואי. |
| Marketplace C2C / User Listings | In Scope | משתמשים רגילים יכולים לפרסם מוצר למכירה/מסירה ולקדם Listing בתשלום. |
| Native Mobile App | שלב עתידי לאחר Web | לאחר השלמת גרסת ה-Web ב-React ורק לאחר אישור מפורש יחל שלב אפליקציה ב-React Native. |
| AI / ML / LLM / Chat capabilities | Future Enhancement / Open Decision | v1 Personalization/Ranking מוגדר כ-Rule-Based. ML/LLM/semantic/assistant capabilities אינן נדרשות להפעלת v1 וייבחנו לפי נספח D לאחר הגדרת Use Case, Data, Value, Safety, Cost ו-Fallback. |
| Premium subscription למשתמשים/בעלי מקצוע | Out of current model | המודל שנבחר שומר בסיס חינמי; תשלום מבעלי מקצוע מיועד לקידום פרופיל וכלים שיווקיים. |
| שכבות התפתחות לגילאים מעל 5 | Future Enhancement | המערכת פתוחה לכל גיל, אך שכבות ייעודיות לגילאים מבוגרים יותר יתווספו בהמשך בהתאם לצורך. |
| Brand / Advertiser Self-Service Portal | Future Enhancement / Out of Scope for current phase | בשלב הראשון Sponsored Products מנוהלים על ידי Admin. פורטל עצמאי למותגים/מפרסמים ייבחן בעתיד; Brand User ו-auction אינם נדרשים כעת. |
| ML Learned Ranking / Collaborative Filtering | Future Enhancement | אפשרי לאחר הצטברות data/traffic והוכחת צורך מעבר ל-v1 rule-based. |
| Semantic Search / Embeddings | Future Enhancement | Global Search v1 נשאר Exact/Prefix/Keyword; semantic retrieval ייבחן בהמשך. |
| Experimentation Platform / A-B Testing | Future Enhancement | אפשר להוסיף לאחר שיש traffic מספיק ומדדים יציבים; אינו blocker לפיתוח v1. |
| מצב כהה (Dark mode) | Future Enhancement | לא נדרש ב-v1 (החלטה מ-11.10.2026). ה-tokens סמנטיים, כך שאפשר להוסיף אותו בעתיד בלי לשנות רכיבים. |
| סרטונים בפוסטים וב-Listings | Future Enhancement | ב-MVP תמונות בלבד (NFR-MEDIA-001). |
| אימון מחדש של מודל בדיקת התמונות | Future Enhancement — השלב הבא | אימון מחדש של מודל זיהוי העירום (BR-076, OP-031) על אוסף התמונות שנחסמו, יחד עם החלטות ה-Admin עליהן (החלטת אפיק מ-20.10.2026). |
