[← אינדקס ה-SRS](INDEX.md)

# 8. חוקים עסקיים (Business Rules)

| ID | חוק |
|---|---|
| BR-001 | השימוש החברתי הבסיסי ב-Nestly יהיה חינמי למשתמש רגיל. |
| BR-002 | Professional Profile בסיסי, השתתפות בקהילה וקבלת פניות יהיו חינמיים לבעל המקצוע. |
| BR-003 | קידום ממומן וכלים שיווקיים יכולים להיות בתשלום. |
| BR-004 | קידום ממומן לא ישנה Reputation אורגני ולא יוצג כהמלצה אורגנית. |
| BR-005 | תוכן/מוצר/פרופיל ממומן יסומן בבירור. |
| BR-006 | משתמש רגיל יכול לפתוח שיחה עם בעל מקצוע ללא תשלום וללא מגבלת מספר הודעות. |
| BR-007 | בעל מקצוע יכול ליזום פנייה למשתמש רגיל רק כ-Message Request / Offer Help בעקבות פוסט, למעט Marketplace Listing פעיל: מתוך Listing מותר Professional→Regular Marketplace Chat ישיר. |
| BR-008 | אותו בעל מקצוע יכול לשלוח לכל היותר Message Request אחת עבור אותו פוסט. |
| BR-009 | אין מגבלה כללית על מספר פוסטים או משתמשים שונים שאליהם בעל מקצוע רשאי לשלוח Offer Help. |
| BR-010 | Message Request אינה פותחת Chat מלא. המשתמש הרגיל יכול Accept / Decline / Ignore; רק Accept פותח שיחה חופשית. |
| BR-011 | Chat Block הוא חסימת הודעות בלבד וניתן להסרה. הוא אינו חסימה גלובלית, אינו מסתיר חשבון ואינו מסיר Friendship/Follow; Report הוא מנגנון נפרד. |
| BR-012 | הפלטפורמה אינה מספקת אבחון רפואי ואינה תחליף לאיש מקצוע רפואי. |
| BR-013 | המערכת פתוחה להורים לילדים בכל גיל; הקונספט ושכבות ההתאמה המפורטות מתמקדים כיום בתכנון הריון ועד גיל 5. |
| BR-014 | חשיפה אורגנית של בעל מקצוע יכולה להיות מושפעת מפעילות איכותית, רלוונטיות, תגובות מועילות, דירוגים ואמינות; הנוסחה המדויקת TBD. |
| BR-015 | Guest שאינו מחובר רשאי לגשת רק למסכי Welcome/Login/Registration. |
| BR-016 | Professional User אינו משתמש באותו חשבון כ-Regular/Parent User ואינו מקבל יכולות Tracking הורי; נדרש חשבון נפרד לכל סוג שימוש. |
| BR-017 | Marketplace Listing של משתמש רגיל היא תוכן מכירה/מסירה ואינה פוסט קהילתי רגיל. |
| BR-018 | Marketplace Listing מקודמת של משתמש רגיל תוצג באופן שונה מפרסום מוצר של חברה/ספונסר. |
| BR-019 | פוסט קהילתי שמטרתו פרסום מסחרי ללא שיתוף ידע רלוונטי יכול להיות מדווח כפרסום לא רלוונטי/ספאם. |
| BR-020 | משתמש רגיל יכול לקדם Marketplace Listing שבבעלותו בתשלום, בהתאם למודל קידום שייקבע. |
| BR-021 | במערכת יהיה Admin יחיד (Super Admin) המייצג את בעל המערכת ובעל גישה מלאה לכל המידע, המסכים והפעולות המנהליות. |
| BR-022 | Moderator הוא משתמש נפרד. הרשאות Moderator מוקצות, משתנות או מבוטלות על ידי ה-Admin בלבד; Moderator אינו מקבל גישה מנהלית מעבר להרשאות שהוקצו לו. |
| BR-023 | הרשאות Moderator מנוהלות לפי Permission Keys גרנולריים ב-Deny by Default; רק Admin יכול להקצות, לשנות או לבטל אותן. |
| BR-024 | Moderator עם USER_BAN יכול לבצע חסימה מלאה של חשבון ולבצע Unban/שחרור חסימה. חסימה מלאה אינה מחיקת החשבון והיא ניתנת לביטול. |
| BR-025 | הפעולות MODERATOR_MANAGE, SECURITY_SETTINGS_MANAGE, BILLING_FINANCE_MANAGE, SYSTEM_CRITICAL_SETTINGS, USER_DATA_EXPORT_DELETE, SENSITIVE_DATA_FULL_ACCESS, LEGAL_POLICY_MANAGE ו-ALGORITHM_AI_CONFIG ו-SPONSORED_PRODUCT_MANAGE הן Admin Only ואינן ניתנות להקצאה ל-Moderator. |
| BR-026 | כל פעולה ניהולית משמעותית של Admin או Moderator תירשם ב-Audit Log; שינוי הרשאות כולל Before/After. |
| BR-027 | Moderator אינו רשאי לשנות את הרשאות עצמו או של Moderator אחר, ואינו רשאי לשנות/למחוק Audit Log. |
| BR-028 | SUPPORT_HANDLE דורשת SUPPORT_VIEW; USER_WARN, USER_SUSPEND ו-USER_BAN דורשות USER_VIEW. |
| BR-029 | Relationship Model בין Regular Users הוא Friends בלבד; Professional, Admin ו-Moderator אינם משתתפים ב-Friendship. |
| BR-030 | Follow יכול להיות מופנה רק ל-Professional Profile. Regular או Professional יכולים לעקוב אחר Professional Profile; Professional אינו עוקב אחר Regular User. |
| BR-031 | Public Group ניתנת לחיפוש ותוכנה גלוי למשתמשים מחוברים; Join מיידי ורק Members יכולים לפרסם/להגיב. |
| BR-032 | Private Group ניתנת לחיפוש לפי מטא-דאטה בסיסי, אך תוכנה מוסתר ממי שאינו Member; Join דורש אישור Group Owner/Admin. |
| BR-033 | Group Owner/Admin/Moderator הם תפקידי קבוצה נפרדים מ-System Admin/Moderator; הרשאותיהם תקפות רק בתוך הקבוצה. |
| BR-034 | Admin ו-Moderator הם חשבונות מערכת ואינם מפרסמים, יוצרים Friends, מצטרפים לקבוצות או משתמשים ב-Social Chat. |
| BR-035 | תוכן מומלץ על בסיס חיפושים, צריכת תוכן או תחומי עניין יוצג ב-Feed בלבד ולא יישלח כ-Notification. |
| BR-036 | Chat messages יוצגו ב-Chat Center וב-Unread Badge ולא ייווצר עבור כל הודעה Notification רגילה נוספת. |
| BR-037 | יום הולדת של ילד יכול לשמש Notification לחברים רק אם ההורה אישר שיתוף נתון זה עם Friends. |
| BR-038 | Security/Critical Account Notifications אינן ניתנות לכיבוי בהגדרות Notification. |
| BR-039 | פוסט מתוך Private Group לא יוצג ב-Global Search למי שאינו Member, גם אם מחרוזת החיפוש מתאימה. |
| BR-040 | Admin רשאי לגשת לתוכן Private Group לצורך ניהול. Moderator שאינו Member רשאי לגשת רק דרך כלי Moderation ורק עם PRIVATE_GROUP_MODERATE והרשאות הטיפול הנדרשות; הגישה נרשמת ב-Audit Log. |
| BR-041 | היררכיית Group Roles היא Owner > Admin > Group Moderator > Member. Role נמוך אינו אוכף פעולה על Role שווה/גבוה; Owner אינו ניתן להסרה/עזיבה לפני העברת בעלות. |
| BR-042 | Regular non-Friend יכול לשלוח Regular Chat Request. Friendship פעילה מאפשרת Chat ישיר; Conversation שכבר נפתחה ממשיכה גם לאחר Remove Friend. |
| BR-043 | Support communication מוצגת ב-Chat בשם “Support” רק בהקשר SupportRequest. אין Chat חופשי אל Admin/Moderator דרך Support. |
| BR-044 | Regular User תמיד ניתן לאיתור ב-People Search. Profile Visibility שולט בגישה לפרופיל מצד non-Friends; Restricted מציג רק שם, תמונה ומידע ציבורי בסיסי. |
| BR-045 | Email ייחודי גלובלית בין כל חשבונות Nestly; אותו Email אינו יכול לשמש גם Regular וגם Professional Account. |
| BR-046 | בשלב הראשון Sponsored Products מנוהלים על ידי Admin בלבד; אין Brand User עצמאי. |
| BR-047 | Professional Marketing Tools בשלב הראשון כוללים Profile Promotion, Post Promotion ו-Promotion Analytics; תשלום קונה Reach ואינו משנה Reputation אורגני. |
| BR-048 | כל Regular או Professional פעיל רשאי ליצור Public/Private Group ללא אישור Admin ולהפוך ל-Group Owner. |
| BR-049 | Personalization v1 הוא Rule-Based/Scoring ואינו תלוי ב-ML/LLM. ניתן להחליף/להרחיב בעתיד רק לאחר Decision/Evaluation נפרד. |
| BR-050 | Stage הוא Signal חזק ל-Regular אך אינו Hard Filter; Search/Intent מפורש יכול להציג תוכן מחוץ לשלב. |
| BR-051 | Professional User personalization אינו משתמש ב-Child/Journey/Tracker Data; הוא מבוסס Profession, Groups, Follows, Searches ו-Content interactions. |
| BR-052 | תוכן Chat/Support אינו Signal ל-Personalization ואינו משמש Paid Targeting. |
| BR-053 | Child/Tracker Data יכולים לשמש Organic Contextual Guidance בלבד; אסור להשתמש בהם ל-Paid Targeting או לשתף אותם עם Professional/Advertiser. |
| BR-054 | Paid Promotion עובר Sponsored Eligibility ורלוונטיות לפני הצגה. Budget/Payment אינם יכולים לבטל Privacy, Safety או Relevance eligibility. |
| BR-055 | Not Interested/Hide/Show Less הם Signals שליליים שחייבים להשפיע על Re-ranking עתידי; exact weights/decay הם Configuration. |
| BR-056 | Recommendation Engine חייב לשמור Diversity בין creator/topic/source ולהימנע מחזרתיות מוגזמת; exploration יתבצע רק מתוך Eligible content. |
| BR-057 | Professional Analytics מציג Aggregates של החשבון המקצועי בלבד ואינו חושף identity/search/private data של משתמשים בודדים. |
| BR-058 | Admin Analytics יוצג כברירת מחדל כ-Aggregates. גישה ל-Raw user-level data מיועדת לצורך תפעולי/אבטחה/Debug בהתאם להרשאה ול-Audit, לא להצגת Dashboard רגילה. |
| BR-059 | שינוי AlgorithmConfiguration הוא Admin Only דרך ALGORITHM_AI_CONFIG ונרשם ב-Audit Log עם Before/After ו-version חדש. |
| BR-060 | Group Highlights v1 הוא דטרמיניסטי; שינוי ל-ML Highlights בעתיד דורש עדכון SRS והחלטת AI/Algorithm נפרדת. |
