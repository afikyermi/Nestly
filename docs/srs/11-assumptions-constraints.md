[← אינדקס ה-SRS](INDEX.md)

# 11. הנחות, מגבלות וגבולות

| סוג | פריט | סטטוס |
|---|---|---|
| Constraint | כל רכיב UI שחוזר או צפוי לחזור יפותח כ-Component עצמאי ורב-שימושי; לוגיקה עסקית ו-flow ינוהלו ב-Page/Feature ולא יוקשחו בתוך Shared Component. | מאושר |
| Constraint | Paid Promotion חייב להיות מובחן מ-Organic. | מאושר |
| Constraint | תקשורת בין משתמשים לבעלי מקצוע היא חינמית. Nestly אינה מנהלת Booking, Booking Commitment או חיוב Lead כחלק מזרימת השירות. | מאושר |
| Constraint | המערכת פתוחה להורות בכל גיל; שכבות התוכן/התפתחות המפורטות בשלב הנוכחי מתמקדות בתכנון הריון ועד גיל 5. | מאושר |
| Assumption | נדרש חיבור אינטרנט לרוב פעולות המערכת. | סביר אך לא הוגדר Offline |
| Constraint | שוק ראשון: ישראל בלבד (החלטה מ-12.9.2026; OP-001). | מאושר |
| Constraint | שלב 1: המערכת תפותח כ-Web באמצעות React בלבד. רק לאחר השלמת גרסת ה-Web ואישור מפורש למעבר לשלב הבא יחל פיתוח אפליקציה ב-React Native. אין לפתח Web ו-Native במקביל. מבנה הקוד והפרדת השכבות בשלב ה-Web יתוכננו כך שיאפשרו מעבר מקצועי לשלב האפליקציה. | מאושר |
| Constraint | שלב ה-Web ייבנה כאפליקציית React בעמוד יחיד (SPA) עם כלי ה-build Vite (החלטה מ-10.10.2026). Vite הוא כלי build בלבד. שפות הפיתוח מוגדרות בשורה הבאה. | מאושר |
| Constraint | שפות וארכיטקטורה (החלטה מ-11.10.2026): קוד המוצר נכתב ב-TypeScript — React, TypeScript, CSS ו-HTML ב-Web, ושרת ייעודי ב-Node.js ו-TypeScript (Fastify). המבנה הוא monorepo: apps/web, apps/server ו-packages/shared, שמחזיק ולידציות (VAL), טיפוסים וקבועים משותפים. ה-Web ניגש לנתוני המוצר רק דרך השרת. אפליקציית React Native (apps/mobile) תתווסף רק בשלב האפליקציה, לפי השורה הקודמת על סדר השלבים, ותתחבר לאותו שרת. | מאושר |
| TBD | מודל Multiple Children / הריון במקביל לילדים קיימים. | פתוח |
| Constraint | בפנייה יזומה של בעל מקצוע: מותרת Message Request אחת בלבד לכל Professional+Post; אין Rate Limit כללי על מספר משתמשים או פוסטים שונים. | מאושר |
| TBD | מדיניות הסלמה וטיפול בדיווחים חוזרים (Report Escalation). Chat Block כבר הוגדר כחסימת הודעות בלבד. | פתוח |
| TBD | מדיניות תוכן לפניות מקצועיות יזומות: אילו סוגי תוכן ייחשבו פרסומיים/לא רצויים לצורכי Moderation. | פתוח |
| Constraint | Marketplace מאפשר למשתמש רגיל לפרסם מוצר למכירה/מסירה ולרכוש קידום ל-Listing שלו. | מאושר |
| Constraint | בתחילת שלב האפליקציה תיבחר גרסת React Native היציבה העדכנית באותו מועד (latest stable) והיא תיקבע/תינעל בפרויקט. אין לעדכן גרסה אוטומטית במהלך הפיתוח ללא החלטה יזומה. | מאושר |
| Constraint | טכנולוגיות וכלי QA ייבחרו לפי הפתרון המקצועי, היציב והעדכני המתאים ביותר בכל שלב ולכל סוג בדיקה; אין חובה להצמד ל-React/React Native. הבחירה תיבחן מחדש לפי צורכי Web ולאחר מכן Mobile. | מאושר |
| Constraint | תאימות: Web — Google Chrome ו-Microsoft Edge. Mobile — iOS ו-Android בשלב האפליקציה העתידי. גרסאות מינימום נתמכות TBD לפני בדיקות התאימות. | מאושר |
| Constraint | Professional User אינו משתמש באותו חשבון כ-Regular User; Home/Navigation מקצועיים יותאמו לניהול עסקי ולא למעקב ילד. | מאושר |
| Constraint | Global Search החברתי כולל People, Groups ו-Posts בלבד בשלב הנוכחי; Products/Marketplace אינם חלק מ-Global Search זה אלא אם יאושר שינוי עתידי. | מאושר |
| Constraint | Admin ו-Moderator הם System Accounts ואינם משתתפים בקהילה כמשתמשים חברתיים. | מאושר |
| Constraint | Regular User משתמש ב-Friends מול Regular Users וב-Follow מול Professional Profiles; Professional Profile אינו מקבל Friend Requests. | מאושר |
| Constraint | Recommendations המבוססות על חיפוש/צריכת מידע מוצגות ב-Feed בלבד ואינן משמשות In-App Notifications. | מאושר |
| Constraint | כל Regular או Professional פעיל רשאי ליצור Public/Private Group ללא אישור Admin ולהפוך ל-Group Owner. | מאושר |
| Constraint | Group Notification Highlights v1 מוגדר ב-FR-ALG-010 כ-rule-based/deterministic; thresholds ניתנים לכיול ב-AlgorithmConfiguration. | מאושר |
| Constraint | בסיס ה-UI ב-Web (החלטה מ-11.10.2026): רכיבים על shadcn/ui ו-Radix, עם design tokens ממקור אחד ב-packages/shared. גלריית Storybook משמשת לאישור הרכיבים. השפה החזותית מחייבת לפי NFR-USAB-004 ו-`docs/design/`. | מאושר |
| Constraint | פריסה (החלטה מ-11.10.2026): האתר והשרת ב-Vercel, בפרויקט אחד. השרת (Fastify) רץ כ-Vercel Functions באזור Frankfurt, ליד המסד ב-Supabase (Central EU, Frankfurt). משימות רקע רצות בנפרד, בתפקיד מסד משלהן. לכל פיצ'ר נוצרת סביבת Preview. | מאושר |
| Constraint | ההצגה למרצה (`docs/lecturer-demo-idea-HE.md`, תוכנית גרסה 2) משתמשת במוצר הרגיל בלבד: משתמשי דמו ותוכן נוצרים דרך המוצר אחרי שהוא גמור, והכניסה היא דרך מסך ההתחברות הרגיל (FR-AUTH-002). אין קוד, מסך, הרשאה או תצורה ייעודיים להצגה, ושום FR אינו מבחין בין משתמש דמו למשתמש אחר (החלטת אפיק מ-15.10.2026; מחליף את "כלי ההצגה" מגרסה 2.15). | מאושר |
