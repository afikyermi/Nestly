[← אינדקס ה-SRS](INDEX.md)

# 9. ולידציות ובדיקות קלט

| ID | שדה/Flow | כלל |
|---|---|---|
| VAL-001 | שם מלא | שדה חובה; קלט טקסט. מגבלת אורך TBD. |
| VAL-002 | אימייל | שדה חובה; פורמט Email תקין; Email חייב להיות ייחודי גלובלית בכל חשבונות Nestly, ללא שימוש חוזר בין Regular ו-Professional. |
| VAL-003 | סיסמה | לפחות 10 תווים. אין חובה של אות גדולה, אות קטנה, מספר או תו מיוחד. כל תו מותר, כולל עברית ורווחים. אין חסימה של סיסמאות נפוצות או סיסמאות שדלפו. כלל אחד לחשבון אישי ולחשבון מקצועי. הגדרות Supabase Auth תואמות (החלטה מ-11.10.2026; מחליף את כלל הסקיצה). |
| VAL-004 | טלפון | לא בשימוש כרגע: שדה הטלפון הוסר מההרשמה (11.10.2026). אם יתווסף בעתיד בהגדרות החשבון, הפורמט ייבדק בהתאם לשוק. |
| VAL-005 | תאריך לידת ילד | תאריך לידת ילד לא יכול להיות בעתיד. אין מגבלת גיל שמונעת שימוש במערכת; התאמת תוכן/שלבים מעבר לגיל 5 עשויה להיות חלקית עד להרחבה עתידית. |
| VAL-006 | מין הורה / ילד | הורה: אישה / גבר / אחר / מעדיפים לא לציין — לא חובה. ילד: בן / בת / עוד לא ידוע — חובה כשנוספים פרטי ילד (OP-004 נסגר ב-11.10.2026). |
| VAL-007 | שנות ניסיון מקצועי | ערך מספרי שאינו שלילי. |
| VAL-008 | מספר עוסק / ח.פ | מספר עוסק (מורשה/פטור) או ח.פ. נאסף בתהליך האימות המקצועי ולא בהרשמה (FR-PROREG-003). מתי הוא חובה ופורמט הבדיקה — TBD (OP-005). |
| VAL-009 | הודעה בשיחה | לא ניתן לשלוח הודעה ריקה; מגבלת אורך/קבצים מצורפים TBD. |
| VAL-010 | Professional Outreach Request | הבקשה חייבת להיות מקושרת לפוסט פעיל של משתמש רגיל. אותו Professional לא יכול ליצור בקשה שנייה לאותו Post. |
| VAL-011 | Message Request Decision | Accept פותח Conversation; Decline סוגר את הבקשה; Ignore אינו פותח שיחה. |
| VAL-012 | Promotion | לא ניתן להציג קידום ללא סימון ממומן. |
| VAL-013 | Marketplace Listing | Listing תישמר כישות מסחרית נפרדת מפוסט קהילתי ותסומן לפי sourceType/promotionType. |
| VAL-014 | Media | תמונה/סרטון חייבים לעמוד בפורמט ובמגבלות שיוגדרו לפני העלאה. |
| VAL-015 | Breastfeeding Tracker | זמן סיום אינו יכול להיות מוקדם מזמן התחלה; צד הנקה חייב להיות ימין/שמאל לפי המודל שאושר. |
| VAL-016 | Support Request | נושא פנייה הוא שדה חובה מתוך רשימת נושאים שתוגדר; המלל חייב לעמוד במגבלת אורך TBD. |
| VAL-017 | Friend Request | Requester ו-Target חייבים להיות Regular Users שונים; אין ליצור Request כפולה או Request כאשר Friendship כבר פעילה. |
| VAL-018 | Professional Follow | Target חייב להיות ProfessionalProfile פעיל ואינו החשבון עצמו; Follow אל RegularProfile אינו חוקי. |
| VAL-019 | Private Group Access | קריאת תוכן Private Group דורשת Membership למשתמש קהילה. Admin מוחרג לניהול; Moderator שאינו Member דורש PRIVATE_GROUP_MODERATE ו-Permission טיפול רלוונטי ורק דרך Moderation. |
| VAL-020 | Private Group Join | Join Request דורשת משתמש מחובר שאינו Member ואינה יכולה להיווצר פעמיים במצב Pending. |
| VAL-021 | Group Role Management | Owner > Admin > Group Moderator > Member. רק Owner ממנה/מסיר Admin, משנה Public/Private, מעביר בעלות/מוחק. Admin אינו פועל נגד Owner/Admin אחר; Group Moderator רק נגד Members. Owner לא עוזב לפני העברת בעלות. |
| VAL-022 | Notification Preferences | לא ניתן לכבות Security/Critical ב-In-App; ערך Group Notification חייב להיות All / Highlights / Off. Push רלוונטי רק בשלב Mobile ואינו יכול לעקוף קטגוריה מושתקת או חסימת Push/הרשאה ברמת מערכת ההפעלה. |
| VAL-023 | Search Visibility | לפני החזרת Post/Deep Link, המערכת חייבת לוודא שלמחפש יש הרשאת צפייה בתוכן המקור. |
| VAL-024 | Chat Initiation | Friends פותחים Conversation ישירות. Regular non-Friends יוצרים RegularChatRequest. Professional/Marketplace כפופים ל-FR-CHAT-002. ChatBlock מונע הודעות בלבד ואינו משפיע על Search/Profile/Relationship. |
| VAL-025 | Regular Chat Request | Requester/Target חייבים להיות Regular Users פעילים ללא Conversation פתוחה. Accept פותח Chat; Decline אינו פותח Chat. |
| VAL-026 | Support Thread | חייב להיות מקושר ל-SupportRequest; תגובת צד ניהולי דורשת SUPPORT_HANDLE ומוצגת בשם “Support”. אין Support Thread חופשי ללא פנייה. |
| VAL-027 | Regular Profile Visibility | Regular User אינו יכול להסתיר עצמו מ-People Search. Visibility קובע גישת non-Friend: Restricted מחזיר רק את שדות ה-Basic Public Profile (§1.4); Open מחזיר את הפרופיל ללא Tracker Data. לכל non-Friend, מידע ילדים והריון מוחזר רק כ-Journey Summary: מספר ילדים, גילאים (ב-Open) וסימון הריון. שמות ילדים, תאריכי לידה, שבוע הריון ותאריך לידה צפוי אינם מוחזרים. Tracker Data אינו מוחזר ל-non-Friend בשום מצב. |
| VAL-028 | Group Creation | יוצר חייב להיות Regular/Professional פעיל; type חייב Public/Private; היוצר נרשם Member + Owner. |
| VAL-029 | Recommendation Candidate | Candidate חייב לעבור Authorization, content status, Block/visibility וכללי context לפני Ranking; Candidate שנכשל אינו מקבל Score להצגה. |
| VAL-030 | Sponsored Unit | חייב להיות Active, Sponsored-eligible ומסומן Sponsored/Promoted. אין להשתמש ב-Child/Tracker/Chat/Support/private-group content כ-paid targeting input. |
| VAL-031 | Analytics Event | חייב eventType, eventId, timestamp, entity/surface לפי הצורך ו-source Organic/Paid כאשר רלוונטי; eventId כפול לא ייספר פעמיים. |
| VAL-032 | Professional Analytics | שאילתת KPI חייבת להיות scoped ל-Professional account/content/promotion של המשתמש המחובר ולהחזיר aggregate בלבד. |
| VAL-033 | Algorithm Configuration | שינוי weights/thresholds/decay/frequency cap דורש Admin + ALGORITHM_AI_CONFIG; כל שינוי יוצר configVersion חדש ונרשם ב-Audit. |
| VAL-034 | Tracker Personalization | Tracker signal מותר רק ל-Organic non-diagnostic contextual guidance. אם mapping לא מאושר, מתעלמים מה-signal ולא מייצרים inference. |
| VAL-035 | Group Highlights | GroupNotificationPreference חייב All/Highlights/Off; Highlights מחושב לפי FR-ALG-010 ו-Off אינו מבטל direct/security/account events שחייבים להימסר. |
| VAL-036 | Anonymous Post | רק Regular User יכול לסמן פוסט כאנונימי. פוסט אנונימי חייב לשמור את מזהה המחבר האמיתי. לפני החזרת הפוסט, תגובות המחבר בשרשור שלו, תוצאת חיפוש או Notification למשתמש קהילה, זהות המחבר מוחלפת בזהות אנונימית: אין להחזיר מזהה מחבר, שם, תמונה או קישור לפרופיל. |
| VAL-037 | People Search | בקשה ללא מחרוזת חיפוש אינה מחזירה משתמשים. בקשות מעבר לסף הקצב נדחות, ומספר התוצאות לבקשה מוגבל לפי Configuration (NFR-SEC-006). |
| VAL-038 | שיתוף פוסט | השרת בודק לפני כל שיתוף שהפוסט ניתן לשיתוף לפי BR-064, ובכל צפייה בשיתוף — שהצופה רשאי לראות את המקור (BR-065). טקסט המשתף אינו חובה, ומגבלת האורך שלו זהה לזו של פוסט. |
