[← אינדקס ה-SRS](INDEX.md)

# 13. דרישות נתונים / Database

המסמך מגדיר ישויות לוגיות. בחירת ה-DB היא החלטת Design נפרדת, והיא התקבלה: **PostgreSQL דרך Supabase**, מקור אמת אחד, והרשאות שנאכפות בבסיס הנתונים באמצעות **Row Level Security** (החלטה מ-12.9.2026).

**גישה לנתונים (החלטה מ-11.10.2026):**
- הגישה לנתונים היא רק דרך שרת המערכת, באמצעות Drizzle.
- רשומת Audit נשמרת יחד עם הפעולה עצמה: אין פעולה שהושלמה בלי רשומה, ואין רשומה לפעולה שלא הושלמה (NFR-AUDIT-001).
- אחסון מדיה: Supabase Storage (סעיף 12, NFR-MEDIA-001; OP-027 נסגר ב-16.10.2026). Realtime, כשיופעל, יעביר אות בלבד ולא תוכן (סעיף 12).
- השרת רץ כ-Vercel Functions (סעיף 11).

| Entity | מטרה |
|---|---|
| User | מזהה, Role, פרטי Login/Contact, סטטוס — כולל "מתוזמן למחיקה" עם מועד המחיקה (FR-SET-002, BR-073). |
| RegularProfile | נתוני פרופיל הורה/משתמש. |
| ProfessionalProfile | מקצוע (תחום מרשימה, או "אחר" עם מלל), שם עסק (לא חובה), מין (לא חובה), ניסיון, אזור (מרשימה, לא חובה), מחיר החל מ- (לא חובה), תיאור השירות (לא חובה), דירוגים/מדדים. אין נתוני אימות, מספר עוסק/ח.פ או סטטוס אימות — האימות המקצועי הוסר (OP-005 נסגר, החלטת אפיק מ-18.10.2026). |
| Child | שם, מין (VAL-006), תאריך לידה ושיוך להורה. מוצג לפי סדר ההוספה; הסרה היא מחיקה מלאה (FR-PROFILE-002). |
| JourneyContext | סוג מסלול: מתכננים, הריון ולידה, ילד/ה, מחזור וביוץ; סטטוס פעיל; בהריון — תאריך לידה משוער (לא חובה). למשתמש יכולים להיות כמה במקביל (החלטה מ-13.10.2026; VAL-039). סיום מסלול הוא מחיקה מלאה, בלי סיבה ובלי רישום; "יש לנו ילד או ילדה" קיים אם ורק אם יש לפחות ילד אחד (FR-PROFILE-002). |
| TrackerEvent | סוג Tracker, timestamp ונתוני האירוע; האירועים מהווים חלק מ-Tracker Data המשויך למשתמש/ילד/מסלול. השדות לכל סוג — FR-TRACK-001 (OP-008 נסגר, 18.10.2026); גלויים רק למשתמש עצמו. |
| Post | מחבר (נשמר תמיד), סימון אנונימיות, תוכן, זמן, קהילה/הקשר, סטטוס. בפוסט אנונימי זהות המחבר אינה נחשפת למשתמשי קהילה (FR-FEED-005). שיתוף בפיד הוא פוסט של המשתף עם הפניה לפוסט המקורי ובלי עותק של תוכנו (FR-FEED-006, BR-065). טקסט (VAL-046); קהל "כולם" / "חברים בלבד", או "עוקבים בלבד" ל-Professional (VAL-049); תגית שלב אופציונלית שהמחבר בחר (FR-FEED-004); סימון אנונימיות שנקבע ביצירה ואינו משתנה; מחבר Regular או Professional פעיל. בפוסט אנונימי מזהה המחבר אינו נשמר בשורת הפוסט אלא ברשומה נפרדת, שרק המחבר קורא, וכן Admin ו-Moderator לפי FR-FEED-005 כלל 6. סטטוס: פעיל, מוסתר, הוסר, או נמחק-ממתין — מחיקה תחת דיווח פתוח, עם מועד שחרור של 90 יום לכל היותר (BR-080). אין שדות שימוש, צפייה או חשיפה (§13.3). |
| Comment / Reaction | אינטראקציות לתוכן. Comment יכול לכלול parentCommentId עבור Reply (אין Mention, בוטל 21.10.2026); Reaction נשמר לפי סוג האינטראקציה שיוגדר. Comment — פוסט, מגיב, תגובת-אב לתשובה (רמה אחת, VAL-047), טקסט, סטטוס כמו ב-Post (כולל נמחק-ממתין, BR-080), וסימון "המחבר" שהמערכת קובעת לתגובת המחבר בפוסט האנונימי שלו (ואז בלי מזהה מגיב גלוי). Reaction — "לייק" אחד לכל משתמש ויעד (פוסט או תגובה), בשתי רשומות: רשומה בלי מזהה, שכל מי שרשאי לראות את היעד סופר; ורשומת בעלות, שרק בעל הלייק קורא. לייקים ותגובות של חשבון שאינו פעיל אינם נספרים. |
| Group / Membership | Group עם type Public/Private, מטא-דאטה, בעלות וסטטוס; Membership משייך משתמש לקבוצה ומכיל סטטוס חברות. תפקידי קבוצה נשמרים בנפרד מ-System Roles. |
| MarketplaceListing | Listing מסחרי של משתמש: מוצר למכירה/מסירה, בעלים, תוכן, מדיה, סטטוס, מקור וקידום. השדות, הסימון "נמכר/נמסר" ותפוגה אחרי 60 יום — FR-MKT-002 (OP-012 נסגר, 18.10.2026). ב-v1: כותרת, קטגוריה, מצב, מחיר או "למסירה", עיר או אזור, עד 6 תמונות, סטטוס (פעילה / נמכר-נמסר וזמן הסימון), הסתרה על ידי הצוות (וזמנה), תפוגה, זמני פרסום ועדכון. אין בה נתוני תשלום, רכישה או משלוח (BR-069). Retention: מחיקה של המפרסם — מיד; מודעה שנמכרה או שפגה — נשמרת, משך השמירה פתוח (OP-054). |
| Promotion | קמפיין/חשיפה ממומנת, יעד, תקופה, בעלים. |
| ServiceCategory | קטגוריות בעלי מקצוע. |
| ProfessionalOutreachRequest | בעל מקצוע, Post מקור, הודעה ראשונה, סטטוס בקשה (ממתינה, אושרה, נדחתה). משתמש היעד הוא כותב הפוסט ואינו נשמר בבקשה, כך שכותב של פוסט אנונימי אינו נחשף עד שהוא מאשר (AC-147). אחת לכל בעל מקצוע ופוסט, ועד 100 ב-24 שעות לכל בעל מקצוע (FR-SERV-008, OP-010; 24.10.2026). הפוסט — כל פוסט פעיל של משתמש רגיל שבעל המקצוע רשאי לראות (FR-SERV-005). |
| Conversation / Message | Conversation/Message: משתתפים, context/source, הודעות, זמן, unread/read state וסטטוס. מצב הקריאה הוא של כל משתתף לעצמו ואינו מוצג לצד השני (אין Read Receipts, החלטת אפיק מ-20.10.2026). הודעה 1–2,000 תווים, טקסט בלבד. Contexts כוללים Friends, Regular Chat Request, Professional, Marketplace ו-Support. Conversation בין Regular Users אינה נסגרת אוטומטית בעקבות Remove Friend. |
| Report / ChatBlock | Report: יעד, סיבה (מסיבות הקהילה, או אחת מארבע סיבות הביקורת של בעל מקצוע שמדווח על ביקורת עליו, FR-MOD-001), טקסט חופשי אופציונלי, עדיפות בתור (BR-074), זמן וסטטוס טיפול. ChatBlock: blocker, blocked user, createdAt/removedAt; משפיע על Messaging בלבד ואינו חסימה גלובלית. Report — מדווח, יעד אחד (פוסט, תגובה, משתמש או הודעה בצ'אט), אחת משמונה הסיבות, טקסט עד 500 תווים (VAL-048; דיווח שנשלח לפני 26.10.2026 נשמר כפי שנכתב, עד 1,000), זמן וסטטוס "פתוח" או "פג תוקף" (BR-080); אחד לכל מדווח ויעד; רק המדווח קורא את הדיווח שלו, ואין עדכון או מחיקה מהממשק. הדיווח שומר גם עותק של הטקסט המדווח (FR-MOD-001), חוץ מהודעה בצ'אט: טקסט ההודעה אינו מועתק, וכל פתיחה שלה בידי הצוות נרשמת ב-Audit Log. |
| UserBlock | חסימת משתמש מלאה והדדית (FR-REL-002, החלטת אפיק מ-18.10.2026): החוסם, החסום (חשבון Regular או Professional פעיל בלבד, לעולם לא Admin או Moderator), סוג החשבון החסום, זמן החסימה וזמן הביטול. ביטול חסימה אינו מוחק את הרשומה אלא מסמן אותה כמבוטלת; חסימה אחת בתוקף לכל זוג. עד 20 חסימות לחשבון ב-24 שעות. נפרדת מ-ChatBlock. |
| PostHide | הסתרת פוסט על ידי משתמש (FR-ALG-009; החלטת אפיק מ-18.10.2026, 8א): משתמש, פוסט וזמן. רק בעל השורה קורא, יוצר ומוחק אותה; אינה פוסט של המשתמש עצמו. משמשת רק להוצאת הפוסט מהפיד ומעמוד הפוסט של בעל השורה, ואינה קלט לדירוג או לשום חישוב אחר. נמחקת עם ביטול ההסתרה, עם הפוסט ועם החשבון. |
| Article / Tip | תוכן ידע והקשר רלוונטיות. מדריכים לפי סטטוס הם תוכן מערכת: סטטוס ושבוע/שליש/גיל, מקורות, תאריך בדיקה ומצב פרסום (FR-ADMIN-012). |
| ProfessionalReview | ביקורת של משתמש רגיל על בעל מקצוע: השיחה שהיא נשענת עליה, דירוג 1–5, טקסט עד 1,000 תווים, זמן הכתיבה וזמן העריכה האחרונה אם נערכה (FR-SERV-011). אחת לכל הורה לכל בעל מקצוע (OP-049 נסגר, 21.10.2026); הכותב עורך ומוחק אותה כל עוד הצוות לא הסתיר או הסיר אותה. כותב הביקורת אינו מוצג לאף אחד. |
| ProfessionalArticle | מאמר של בעל מקצוע: כותרת, גוף, תחום, סטטוס וזמנים (FR-PRO-003). |
| Notification | Notification: נמען, Type, Actor/System, Text, Timestamp, Read/Unread, TargetType/TargetId או Deep Link metadata. יצירה/הצגה כפופות ל-NotificationPreference ולהרשאות. Retention: 90 יום (§13.4). |
| SponsoredProduct | מוצר/תוכן מסחרי מטעם חברה/מותג/ספונסר, עם מקור, מדיה, סטטוס וסימון ממומן. בשלב הראשון נוצר ומנוהל על ידי Admin/Back Office בלבד. ב-v1: שם המפרסם, כותרת, תיאור, קטגוריה, קישור, תמונה אחת, סטטוס (טיוטה / מפורסם / מושהה / הוסר) וזמן הפרסום הראשון (FR-ADMIN-009). |
| MediaAsset | מטא-דאטה של קובץ תמונה המשויך לפוסט, סטורי, Listing, מאמר או תמונת פרופיל, ומצבו: ממתינה לבדיקה / עברה / בתור האישור / אושרה / נדחתה (BR-076). חשד לפגיעה בילד, סיבת ההעברה לתור, ציוני הבדיקה וסימון "יש בתמונה ילד" נגישים רק לצוות. הקובץ נשמר מקודד מחדש, בלי EXIF/GPS. |
| Story | סטורי: מחבר, MediaAsset אחד, טקסט אופציונלי עד 200 תווים, קהל, זמן פרסום וזמן תפוגה (24 שעות). נמחק עם התמונה בתום התוקף (FR-FEED-008, BR-077). |
| TrainingSample | תמונה בסט האימון של מודל הבטיחות (BR-076): ההחלטה (נחסמה / אושרה), המקור (חסימה, חוסר ודאות, הסרה אחרי דיווח), סימון "יש בתמונה ילד" וזמן ההחלטה; בלי שום פרט על המעלה. נשמרת 6 חודשים בדיוק. כל הוספה, מחיקה וגישה נרשמות ברשומת גישה, שרק מי שמחזיק AUDIT_LOG_VIEW קורא. |
| SupportRequest | פנייה של משתמש: נושא (אחד משישה, FR-ADMIN-001), מלל 1–2,000 תווים, משתמש, זמן, סטטוס (פתוחה / בטיפול / סגורה), handledBy והיסטוריית תגובות. זהות המטפל נרשמת ב-Audit Log בלבד. תגובות חיצוניות מוצגות ב-Support Thread בתוך Chat בשם “Support”; הערות פנימיות אינן מוצגות. |
| CycleEntry | תאריך התחלה של מחזור והאורך הממוצע שהמשתמש מזין; חלון הביוץ מחושב ממנו ואינו נשמר (FR-TRACK-001, OP-041). גלוי רק למשתמש עצמו. |
| TrackerData | מכלול נתוני המעקב שנשמרים עבור המשתמש/ילד/מסלול לצורך תיעוד, התאמה אישית, מתן טיפים/ידע ושיפור המערכת, בכפוף למטריצת שימוש ותקנון/מדיניות פרטיות. רק המשתמש עצמו רואה אותם (FR-TRACK-001, החלטת אפיק מ-18.10.2026). |
| ModeratorPermission | מיפוי בין Moderator לבין Permission Keys שהוקצו על ידי Admin: SUPPORT_VIEW, SUPPORT_HANDLE, REPORTS_VIEW, CONTENT_MODERATE, MARKETPLACE_MODERATE, USER_VIEW, USER_WARN, USER_SUSPEND, USER_BAN, ANALYTICS_VIEW, AUDIT_LOG_VIEW, COMMUNITY_CONFIG, SYSTEM_ANNOUNCEMENTS, PRIVATE_GROUP_MODERATE; כולל created/updated metadata. PROFESSIONAL_VERIFY בוטל עם הסרת האימות המקצועי (OP-005 נסגר, 18.10.2026). |
| AccountEnforcement | פעולת אכיפה על חשבון: Target User, Action (Warn/Suspend/Ban/Unban), Reason, Actor, Permission, זמן, משך/מועד סיום במקרה Suspension וסטטוס. |
| AuditLogEntry | רשומת Audit: Actor, Role, Permission, Action, Target, Timestamp, Result, Reason לפי הצורך ו-Before/After בשינויים רלוונטיים. Retention: 12 חודשים לחשבון פעיל (§13.4). |
| AccountDeletionEvent | רשומת מחיקות החשבון (BR-084): סוג (בקשה / ביטול / ביצוע), מזהה החשבון וסוגו, זמן ומועד המחיקה המתוכנן; בלי אימייל, שם, סיבה או תוכן. נפרדת מה-Audit Log ונשמרת אחרי מחיקת החשבון. Admin בלבד. Retention: 90 יום אחרי הביצוע; בקשה שבוטלה בחשבון פעיל — 12 חודשים. |
| Friendship | קשר בין שני Regular Users: requester, addressee, status Pending/Accepted/Declined/Removed, ביטול של השולח, timestamps. לכל זוג קשר פעיל אחד לכל היותר. Declined אינו נחשף לשולח, והסטטוס אינו מוחזר לאף צד (FR-REL-001). |
| ProfessionalFollow | Follower User, Target ProfessionalProfile, createdAt; יעד Follow תמיד ProfessionalProfile. |
| GroupJoinRequest | User, Group, status Pending/Approved/Rejected, requestedAt, decidedBy/decidedAt. |
| GroupRoleAssignment | Group, User, role Owner/Admin/Moderator, assignedBy, timestamps. System Moderator אינו נשמר כאן אלא ב-ModeratorPermission. |
| NotificationPreference | User + Notification Type/Category + inAppEnabled + pushEnabled. Security/Critical categories הן mandatory ב-In-App. pushEnabled משמש רק בשלב Mobile ואפקטיבי רק כאשר הקטגוריה מאופשרת והרשאת Push של מערכת ההפעלה קיימת. Group-specific level נשמר ב-GroupNotificationPreference. |
| GroupNotificationPreference | User + Group + mode All/Highlights/Off; בלי בחירה — Highlights. Highlights לפי FR-ALG-010. נמחקת עם ה-Membership. |
| FriendContentNotificationPreference | User + Friend + enabled עבור “פוסט חדש של חבר”, כדי שההתראה לא תישלח אוטומטית מכל Friend. |
| ChildBirthdayVisibility | העדפת פרטיות של ההורה הקובעת האם ניתן להשתמש ביום ההולדת של הילד לצורך Notification לחברים. אחת לכל הורה; ברירת מחדל: מאושר (החלטת אפיק מ-16.10.2026). |
| GroupInvitation | Group, inviter, invitee, status Awaiting approval/Pending/Accepted/Declined/Cancelled/Rejected, האם נדרש אישור, מי אישר או דחה ומתי, createdAt/decidedAt. כל חבר שאינו מושתק מזמין Friend פעיל; בקבוצה פרטית הזמנה של מי שאינו Owner או Admin ממתינה לאישורם ואינה גלויה למוזמן עד האישור; הזמנה פתוחה אחת לכל קבוצה ומוזמן; קבלה יוצרת Membership. |
| GroupMemberEnforcement | פעולת אכיפה ברמת קבוצה, שלושה סוגים בלבד: אזהרה והשתקה (יחד), הסרה וחסימה (יחד), ביטול חסימה. Group, Target User, Action, Actor, Reason (רשימה סגורה, ו"אחר" עם טקסט עד 500 תווים), משך ההשתקה (24 שעות או 7 ימים) ומועד סיומה, זמן. היסטוריה שאינה נערכת ואינה נמחקת בידי משתמש; גלויה לחבר שהיא נוגעת בו ול-Group Moderator ומעלה בקבוצה, בלי זהות מי שביצע. |
| GroupHighlight | פוסט בקבוצה שהגיע לסף ה-Highlight (FR-ALG-010): הפוסט, הקבוצה, הסף, מספר החברים וגרסת ה-Configuration, ומתי. נשמר פעם אחת לכל פוסט; גלוי לחברי הקבוצה בלבד. |
| CommunityConfiguration | הגדרות קהילה תפעוליות כגון קטגוריות, סיבות דיווח ותצורות Moderation מאושרות; כוללות metadata של שינוי לפי הצורך. |
| SystemAnnouncement | הודעת מערכת רשמית: title (2–80) ו-body (עד 1,000), status Draft/Published/Removed (Removed סופי), author, זמני יצירה, עדכון, פרסום והסרה, וקהל: כולם, הורים, בעלי מקצוע או שלב אחד במסע (VAL-050; OP-042 נסגר). |
| ModeratorInvitation | הזמנה חד-פעמית של Admin להצטרפות Moderator (FR-ADMIN-004): תיאור קצר למי ההזמנה, ה-Admin שהנפיק, זמן הנפקה, תוקף (48 שעות, החלטת אפיק מ-21.10.2026), החשבון שנוצר ממנה וזמן ההצטרפות, או זמן הביטול. נשמר רק תקציר (hash) של קוד ההזמנה, לעולם לא הקוד עצמו. |
| ReportEscalation | העברת דיווח פתוח ל-Admin בידי Moderator (BR-082): הדיווח, ה-Moderator, הערה (2–500 תווים) וזמן; אפשר כמה לדיווח. נרשמת ב-Audit Log, נשמרת עם הדיווח. |
| ReportOpening | פתיחת דיווח בידי איש צוות (מצב הטיפול, BR-082): הדיווח, איש הצוות וזמן הפתיחה הראשונה; אחת לכל דיווח ואיש צוות. אינה נרשמת ב-Audit Log, נשמרת עם הדיווח. |
| StaffGroupView | פתיחת עמוד של קבוצה פרטית לבדיקה בידי מחזיק PRIVATE_GROUP_MODERATE (BR-081): הקבוצה, איש הצוות והזמן; תוכן הקבוצה נגיש לו רק באותה פעולה, בלי Membership. נרשמת ב-Audit Log. |
| EnforcementRecord | רשומה בהיסטוריית האכיפה על תוכן שנמחק בדיווח מוצדק (FR-MOD-002, FR-MOD-003): הכותב (אין בפוסט אנונימי ובביקורת), סוג התוכן, הכלל שהופר, עד 100 התווים הראשונים (במודעה ובמאמר — הכותרת), הדיווח, מי החליט ומתי. אחת לכל פריט; למחזיק USER_VIEW ול-Admin בלבד; אינה נערכת ואינה נמחקת; נמחקת עם חשבון הכותב. |
| ReportAutoHide | הסתרה של פריט אחרי דיווחים של 10 אנשים לפחות מאותה סיבה (BR-074): הפריט, הסיבה, הכותב, מתי הוסתר ועד מתי (לכל היותר 90 יום). אף משתמש אינו קורא את הסיבה ואת הכותב; הצוות רואה רק שהפריט מוסתר; מוסרת כשנסגרים הדיווחים הפתוחים על הפריט. |
| StaffCommentView / StaffProfileView | פתיחה של תגובה שדווחה, או של פרופיל, בידי איש צוות (FR-MOD-001, BR-081): הדיווח או הפרופיל, איש הצוות והזמן. כל פתיחה נרשמת ב-Audit Log. |
| ImageFingerprint | טביעה חזותית של תמונה (לא התמונה) לרשימת החסימה בהעלאה (BR-076): הטביעה של תמונה שנבדקה, ורשימת הטביעות של תמונות שסומנו או אושרו כחשד לפגיעה בילד. רשימת החסימה נשמרת לתמיד ואינה מזהה משתמש; טביעה שהצוות קבע שהתאמתה שגויה נמחקת ממנה, וב-Audit Log (החלטת אפיק מ-21.10.2026). |
| RegularChatRequest | Requester Regular User, Target Regular User, openingMessage, status Pending/Accepted/Declined, timestamps. Accept פותח Conversation; Decline אינו יוצר Chat וחל רק על הבקשה הזו (החלטת אפיק מ-20.10.2026). |
| PrivacyPreference | User + RegularProfileVisibility (Open/Restricted), הצגת משפט ה-Journey Summary (§1.4; ברירת מחדל: מוצג) והעדפות פרטיות נוספות. Regular User נשאר searchable בכל מצב. ברירות מחדל, גם לחשבונות שקדמו להן: Open, המשפט מוצג (החלטת אפיק מ-16.10.2026). |
| ProfessionalPromotionMetric | Promotion, TargetType Profile/Post, impressions/clicks/engagement ושדות מדידה נוספים שייקבעו; נשמר בנפרד ממדדי Reputation אורגניים. |
| AnalyticsEvent | Event כללי למדידת Impression/Open/Dwell/Search/Interaction/Conversion/Support/Moderation עם eventId, timestamp, entity/surface/source ו-algorithm/config version לפי צורך. |
| ContentImpression | רשומת/אירוע חשיפה של Recommendation/Feed unit: user/session, entity, surface, position, organic/paid, algorithm/config version ומשך חשיפה אם זמין. |
| SearchIntent | User + Topic (נושא או קטגוריית מוצר שזוהו בכללים קבועים) + תאריך. אין בו את טקסט החיפוש; נמחק אחרי 30 יום; אינו חשוף ל-Admin, ל-Professional או ל-Advertiser (FR-ALG-008). |
| SearchEvent | אינו נשמר. מחיפוש לא נשמרים הטקסט, המסננים, מספר התוצאות או לחיצות; נשמר רק SearchIntent — נושא, משתמש ותאריך, נמחק אחרי 30 יום (FR-ALG-008; החלטת אפיק מ-20.10.2026: הטקסט שהוקלד לא נשמר, ובלי ניתוח של Admin). |
| PersonalizationProfile | Interest/Intent scores נגזרים לפי Topic/Context. v1 Rule-Based; אינו כולל גוף Chat/Support ואינו חשוף ל-Professional/Advertiser. |
| RecommendationFeedback | **בוטל** (Not Interested / Show Less בוטלו, החלטת אפיק מ-21.10.2026). הסתרת פוסט נשמרת ב-PostHide ואינה Feedback. |
| ContentMetadata | Topic/Category/Stage/Service/Product metadata לצורכי Eligibility/Ranking; v1 מבוסס שדות מובנים, Group/category context, tags/keywords ו-curation. |
| AlgorithmConfiguration | גרסת weights/thresholds/decay/diversity/exploration/frequency caps. שינוי Admin Only דרך ALGORITHM_AI_CONFIG ונרשם ב-Audit. לכל גרסה: משטח (למשל פיד ה-Regular), סימון פעילה (אחת לכל משטח), זמן, יוצר וסיבה; גרסה אינה מתעדכנת ואינה נמחקת — שינוי הוא גרסה חדשה (BR-059). |
| AnalyticsAggregate | מדדים מצטברים לפי period/surface/entity/segment מאושר לצורך Admin/Professional dashboards. |
| PromotionPerformanceEvent | Impression/Click/ProfileVisit/Follow/ChatStart/other approved event המשויך ל-Promotion ומסומן Paid לצורך הפרדה מ-Organic. |
| LegalConsent | User, מסמך (Terms / Privacy / הצהרת גיל 18+), גרסה, זמן אישור. נוצר בהרשמה (FR-REG-004) ובכל אישור של גרסה חדשה. הגרסה היא היום שבו נוסח המסמך השתנה, כפי שהמסמך מציג (AC-186); חשבונות שנרשמו לפני 26.10.2026 אישרו גרסה מוקדמת, ואישור מחדש — OP-078. |
| RecoveryAnswers | User, שתי השאלות שנבחרו, לכל תשובה hash איטי (scrypt) עם salt ופרמטרים, מזהה האימייל (hash עם מפתח) וזמן הטענה עליו, זמנים. לעולם לא התשובה עצמה; משתמשים ומבקרים אינם קוראים את ה-hash (FR-AUTH-003, VAL-045). מידע אישי. Retention לחשבון פעיל: אינו מכוסה ב-§13.4 — TBD במסגרת OP-028; אחרי מחיקת חשבון — BR-073. |
| RecoveryThrottle | מונה ניסיונות שחזור לפי מזהה אימייל או לפי hash של כתובת IP, חלון ונעילה; למזהה האימייל גם מספר הכישלונות מאז ההצלחה האחרונה, למדרג הנעילה; אין סימון נעילה קבועה (NFR-SEC-010, 20.10.2026). Retention: אחרי מחיקת חשבון — 90 יום ואז מחיקה (BR-073); לחשבון פעיל — יום אחרי שהמונה פג (§13.4). |
| RecoveryEvent | אירוע Audit של שחזור הסיסמה: סוג (FR-ADMIN-005), User כשידוע, hash של מזהה האימייל, hash של כתובת ה-IP וזמן; בלי תשובה, סיסמה או אימייל. Retention: 12 חודשים לחשבון פעיל (§13.4). |
| BetaInvite | אימייל מוזמן, מי הוסיף ומתי, וסטטוס. יחד עם מצב הבטא קובע מי יכול להירשם בתקופת הבטא (FR-ADMIN-011). |
| AccountTakeoverCheck | מצב ניקוי S-01 לכל חשבון: ממתין או הושלם, ה-Session שביצע אותו, זמן הניקוי וזמן קביעת הסיסמה החדשה (FR-AUTH-005). בלי סיסמה, תשובה או אסימון. Retention לחשבון פעיל: אינו מכוסה ב-§13.4 — TBD במסגרת OP-028; אחרי מחיקת חשבון — BR-073. |
| ProfileOpenCount | מונה פתיחות הפרופיל של כל חשבון בחלון ההגבלה (NFR-SEC-006). נכתב ונקרא רק על ידי המערכת, לחשבון של הצופה עצמו; משתמשים אינם קוראים, מאפסים או משנים אותו. Retention: יום אחרי שהמונה פג (§13.4). |
| SecurityConfiguration | ערכי סף של הגבלות Security, כגון 100 פתיחות פרופיל ב-3,600 שניות (NFR-SEC-006). שינוי — Admin בלבד (SECURITY_SETTINGS_MANAGE). ממשק המוצר אינו קורא ואינו כותב אותם. |
| SecurityEvent | אירוע Security: סוג (למשל חריגה מהגבלת פתיחת הפרופילים), החשבון והזמן; בלי יעד, פרופיל או נתוני ילד. משתמשים אינם קוראים, משנים או מוחקים אירוע, גם את שלהם (NFR-SEC-006, ERR-032). Retention: 12 חודשים לחשבון פעיל (§13.4). |

## 13.1 קשרים מרכזיים

- User אחד יכול להיות משויך לפרופיל רגיל או מקצועי בהתאם למודל החשבון.
- RegularProfile יכול להיות קשור ליותר מילד אחד — כפי שנדרש מהסקיצה; המגבלה — VAL-040.
- User יכול להחזיק כמה JourneyContext במקביל (החלטה מ-13.10.2026). איזה מסלול מוצג ראשון בבית — OP-003.
- RegularProfile מחזיק עד 10 ילדים (VAL-040).
- User → משתמש Auth: מחיקת משתמש Auth נחסמת כל עוד יש לו נתונים במוצר (RESTRICT, החלטה מ-13.10.2026). מחיקה רק בנוהל מחיקה מסודר: FR-SET-002, BR-073 (OP-028 נסגר).
- Conversation מקשרת בין המשתתפים והודעותיהם; ProfessionalOutreachRequest מקושר לפוסט המקור ולבעל המקצוע שיזם את הפנייה.
- Promotion לא מחליף דירוג אורגני אלא מייצג שכבת חשיפה נפרדת ויכול להיות משויך לפרופיל מקצועי, Marketplace Listing של משתמש או תוכן/מוצר ממומן.
- MarketplaceListing משויך למפרסם; SponsoredProduct מנוהל בשלב הראשון על ידי Admin. Marketplace Chat מתוך Listing פעיל הוא חריג מורשה לכלל Professional→Regular Outreach.
- TrackerData מורכב מאירועי המעקב והקשריהם ונשמר לפי המשתמש/הילד/מסלול.
- SupportRequest משויך למשתמש ולנושא וכולל סטטוס והיסטוריית תגובות. Admin מלא; Moderator לפי SUPPORT_VIEW/HANDLE. תגובה חיצונית מופיעה ב-Chat כ-Support Thread בשם “Support”.
- התגובות, הלייקים וההסתרות של פוסט נמחקים יחד איתו כשהכותב מוחק אותו (BR-080); שיתוף אינו נמחק עם המקור שלו (BR-065). כל אחד מהם נקרא רק כשהפוסט זמין לצופה.

Friendship קיים רק בין Regular Users. הוא מאפשר Chat ישיר אך אינו תנאי לבקשת שיחה; RegularChatRequest משמש non-Friends. Remove Friend אינו סוגר Conversation שכבר נפתחה.

ProfessionalFollow הוא קשר חד-כיווני אל ProfessionalProfile. Regular או Professional יכולים לעקוב אחר ProfessionalProfile; Professional אינו עוקב אחר RegularProfile.

Group מוגדר Public/Private. כל Regular/Professional יכול ליצור Group ונהיה Owner. Membership קובע גישה; GroupRoleAssignment שומר Roles לפי היררכיה; GroupMemberEnforcement חייב לכבד אותה.

Search מחזיר Group metadata ו-Regular basic identity. Private Group content תלוי Membership; Regular profile content ל-non-Friend תלוי PrivacyPreference. כלי Admin/Moderation אינם חלק מ-Global Search.

NotificationPreference ו-GroupNotificationPreference מסננים אירועי In-App, ובשלב Mobile משמשים גם לקביעת זכאות ל-Push בהתאם להרשאת המכשיר. Recommendation signals המבוססים על חיפוש/צריכה שייכים ל-Feed ולא ל-Notification Center.

## 13.2 Data Inventory & Usage v1

| קטגוריית Data | דוגמאות / מקור | שימוש מותר v1 | הגבלות / שימוש אסור | גישה |
|---|---|---|---|---|
| Account / Role | Login, Role, account status, contact fields | Authentication, authorization, lifecycle analytics | לא לחשוף ל-Professional; Paid targeting רק לפי surface/category ולא contact identifiers | Admin לפי הרשאות; המשתמש לחשבונו |
| Regular Profile — Public | Basic Public Profile (§1.4): שם, תמונה, Journey Summary ללא גילאים, Friends ו-Friends משותפים; Profile Visibility | People Search, profile display, social features | Restricted מגביל non-Friend ל-Basic Public Profile; Open, וכל צפייה של Friend, חושפים את הפרופיל עם Journey Summary מלא, ללא שמות ילדים, תאריכי לידה, פרטי הריון ו-Tracker Data; לא נגזר Paid target מזהות אישית | משתמשים לפי Visibility |
| Child / Journey Context | DOB/Stage/JourneyContext, child association | My Stage, organic contextual relevance, trackers | Child DOB/identifiers אינם Paid Targeting ואינם מועברים ל-Professional/Advertiser דרך ערוצי Targeting, Analytics או Dashboard. ל-non-Friend הם אינם מוצגים: מוצג רק Journey Summary — מספר ילדים, גילאים (ב-Open ול-Friend, בשנים ובחודשים) והריון ללא פרטים — באופן זהה לצופה Regular ול-Professional (FR-PRIV-001) | Regular owner; Admin לפי הרשאה; algorithms דרך derived Stage; non-Friend רק Journey Summary |
| Tracker Data | Tracker type/events/summary | Tracking history; organic non-diagnostic tips/context | ללא Paid Targeting; ללא Professional access; ללא medical diagnosis/inference | Regular owner; restricted Admin access; תוכן מותאם לשלב לפי purpose |
| Professional Profile | profession, experience, ratings, content/activity | Directory, organic matching, profile, Professional analytics | Paid boost לא משנה organic reputation. אין נתוני אימות (OP-005 נסגר, 18.10.2026) | Public/eligible users; owner/admin |
| Social Graph | Friendship, ProfessionalFollow, Group Membership | Feed candidates, social relevance, notifications | לא לחשוף graph מלא לצדדים שלישיים | המשתמש/Features הרלוונטיים |
| Content & Metadata | Posts/Comments/Groups/Listings/Products/Articles + topic/stage/category tags | Search, Feed, Ranking, Moderation, analytics | Private Group content לפי membership/admin exception בלבד. זהות המחבר של Anonymous Post אינה נחשפת למשתמשי קהילה. Admin רואה אותה; Moderator רק בטיפול בדיווח על הפוסט, עם Audit (FR-FEED-005). תגית השלב של פוסט היא בחירת המחבר בלבד ואינה נגזרת מ-Child/Journey Data (FR-FEED-004). שם הכותב — BR-079 | לפי content visibility |
| Search Data | נושא שזוהה (SearchIntent), משתמש ותאריך — לא הטקסט, המסננים או מספר התוצאות | התאמת פיד, Marketplace ויועצים למשתמש עצמו (FR-ALG-008) | הטקסט שהוקלד אינו נשמר; נמחק אחרי 30 יום; Chat/Support לא נגזרים לנושא | System בלבד, להתאמה למשתמש עצמו; בלי ניתוח של Admin (החלטת אפיק מ-20.10.2026) |
| Interaction / Exposure | impression, open, dwell, like, comment, save, profile/product open | Interest/Intent, Ranking evaluation, Admin analytics | Dwell אינו Satisfaction יחיד; מינימום metadata נדרש | System; Admin ו-ANALYTICS_VIEW לפי BR-058 (גם ברמת משתמש, בלי שמות ובלי פרטים מזהים); Professional own aggregates |
| Negative Feedback | **בוטל** (Not Interested / Show Less בוטלו, החלטת אפיק מ-21.10.2026) | — | — | — |
| Post Hide | הסתרת פוסט (PostHide) | הוצאת הפוסט מהפיד ומעמוד הפוסט של המשתמש בלבד | לא Signal ולא קלט לדירוג (8א); לא נחשף לכותב או למשתמשים אחרים. שימוש במדדים מצטברים (§18.6, §18.8) — TBD (OP-037) | המשתמש לשורות שלו בלבד |
| Location | עיר או אזור שהמשתמש בוחר מרשימה (החלטת אפיק מ-18.10.2026) | Services לפי אזור (FR-SERV-002), Marketplace relevance | אין GPS, אין מיקום מדויק, אין מפה ואין בקשת הרשאת מיקום (§12); paid usage רק לפי policy/consent future decision | User-controlled; features scoped |
| Chat Metadata | conversation ids, timestamps, unread/read state, context | Messaging operation, unread counters, limited aggregate metrics | Message body אינו personalization/paid signal | Participants; system operation; admin only when authorized |
| Chat Content | message body/attachments אם יאושרו | Messaging בלבד, moderation/report if user submits/authorized | אסור Personalization/Recommendation/Paid Targeting | Participants; authorized moderation only |
| Support Data | category, status, thread messages, handler metadata | Support handling; aggregate issue analytics | Support message body אינו personalization/paid signal | User + Admin/Moderator authorized |
| Promotion / Payment | campaign target, budget/period/status, transaction/provider refs | Paid delivery, billing, promotion analytics | Organic score/reputation נפרדים; card data לפי gateway policy | Owner/Professional for own campaign; Admin finance |
| Moderation / Audit | reports, actions, reasons, before/after, actor/target | Trust & Safety, compliance, audit | לא משמש ad targeting. דיווח אינו קלט לדירוג; הוא רק מוציא את הפוסט המדווח מהפיד של המדווח (BR-074) | Admin/Moderator לפי permissions; המדווח לדיווח שלו בלבד |
| Derived Interest / Intent | topic/context scores + freshness | Organic personalization, candidate ranking; limited sponsored eligibility only from permitted non-sensitive sources | לא כולל Tracker/Child private data ל-Paid; לא נחשף למפרסם | System; Admin debugging under permission |

## 13.3 Event Taxonomy v1

צפייה, חשיפה, לחיצה וזמן שהייה נרשמים רק לפי הטקסונומיה של FR-DATA-001 (החלטת אפיק מ-18.10.2026). אילו גרפי Admin (FR-ADMIN-010/003) זמינים לפני שהאירועים נאספים — OP-039.

| קבוצת Event | Events עיקריים | Metadata מרכזי |
|---|---|---|
| Exposure | content_impression / recommendation_impression / promotion_impression | entity, surface, position, organic/paid, algorithm/config version |
| Consumption | content_open / dwell / article_open / profile_view / marketplace_open | entity, duration if available, source surface |
| Engagement | reaction / comment / reply / save / share-if-added | entity, actor, context |
| Negative Feedback | not_interested / show_less | entity, creator/topic/source target |
| Search | search_submit | הנושא שזוהה בלבד (SearchIntent); לא הטקסט, מספר התוצאות או לחיצות (FR-ALG-008) |
| Relationship | friend_request / friend_accept / follow / unfollow / group_join | relationship type + target |
| Messaging Conversion | chat_start / chat_request_accept / offer_help_accept | context source only; no message body |
| Commerce / Promotion | promotion_click / profile_visit_from_promo / follow_from_promo / chat_start_from_promo | promotion id + outcome |
| Support / Moderation | support_submit / support_response / report_submit / moderation_action | category/status/action metadata; no generic copy of message body |
| System | notification_open / settings_change / algorithm_config_change | target/config version/action metadata |

## 13.4 Retention, User Control & Purpose Boundaries

**תקופות שמירה לחשבון פעיל** (החלטת אפיק מ-18.10.2026): אירועי אבטחה, Audit ושחזור — 12 חודשים · דיווחים שטופלו — 12 חודשים (כמו הספירה ב-BR-074) · התראות — 90 יום · מוני הגבלת קצב — יום אחרי שפגו · תוכן שנמחק — מיד (BR-080) · תמונות — BR-077; סט האימון של מודל הבטיחות — 6 חודשים, ותמונה שסומנה בחשד לפגיעה בילד — 90 יום (החלטת אפיק מ-20.10.2026). **מדיניות הפרטיות** מציינת במפורש שתמונות שהבדיקה האוטומטית חסמה או לא הייתה בטוחה לגביהן, גם אם הצוות אישר אותן אחר כך, כולל תמונות של ילדים, ותמונות שהוסרו בעקבות דיווח, משמשות לאימון מודל הבטיחות בלבד, ונשמרות לשם כך עד 6 חודשים (החלטת אפיק מ-20.10.2026). אחרי מחיקת חשבון חל BR-073. **לא מכוסים כאן**, ונשארים TBD במסגרת OP-028: RecoveryAnswers ו-AccountTakeoverCheck לחשבון פעיל, וכל שורה בטבלה שלמטה שמסומנת "ייקבע".

| Data Class | Purpose | Retention / Control Rule |
|---|---|---|
| Account/Profile/Content | נדרש לתפעול החשבון והתוכן | מחיקת חשבון — BR-073: הכל נמחק, חוץ מרשומות אבטחה וביקורת (90 יום ואז מחיקה) ומהשיחות שנשמרות לצד השני (החריג המוגדר היחיד; 17.10.2026); תמונות — BR-077. משך מדויק ייקבע לפי Privacy Policy/שוק ראשון; מחיקה/ייצוא לפי USER_DATA_EXPORT_DELETE ותהליך המשתמש. פוסט או תגובה שהכותב מחק — נמחקים מיד; תחת דיווח פתוח — מוסתרים מכולם עד הטיפול, לכל היותר 90 יום, ואז נמחקים על ידי משימת רקע (BR-080). הסתרת פוסט נשמרת עד שהמשתמש מבטל אותה, עד מחיקת הפוסט או עד מחיקת החשבון. |
| Notifications | הצגת התראות | 90 יום (החלטת אפיק מ-18.10.2026, 15א). |
| Group membership and enforcement | הזמנות, חסימות, השתקות ואזהרות של קבוצה, ו-Highlights | נשמרים עם הקבוצה, גם השתקה שהסתיימה, ונמחקים עם הקבוצה או עם החשבון (BR-073). |
| Rate-limit counters | הגבלת קצב (NFR-SEC-006, NFR-SEC-010) | יום אחרי שהמונה פג (15א). |
| Search Intent (נושא החיפוש) | התאמת פוסטים, מודעות ויועצים למה שהמשתמש חיפש (FR-ALG-008) | 30 יום ואז נמחק (החלטת אפיק מ-20.10.2026); נשמר הנושא בלבד, לא טקסט החיפוש; מדיניות הפרטיות מציינת זאת. |
| Usage Events (כניסה יומית, צפייה בפרופיל ובפוסט) | Admin Analytics (OP-039) | 90 יום ואז נמחק (לפי ⭐, OP-067); ספירות ליום בלבד, בלי תוכן או יעד. |
| Interaction/Search/Recommendation Events | Personalization + Analytics | Retention period לא ייקבע שרירותית ב-SRS; יש לקבוע לפני Production ולהתאים ל-Notice/Consent. Aggregates יכולים להישמר בנפרד לפי policy. |
| Tracker/Child Data | Tracking + Organic Context | Retention/control חייבים להיות מפורשים במדיניות; אין Paid Targeting. הסרת ילד וסיום מסלול מוחקים את השורה מבסיס הנתונים החי מיד, ושום שורת לוג של האפליקציה, עמודה או רשומה אינם רושמים את המחיקה (FR-PROFILE-002). גיבויי Supabase והרישומים הטכניים של הפלטפורמה (לוג הבקשות של Vercel, לוג ה-Auth) נשארים מחוץ למחיקה הזו לזמן קצר, ומדיניות הפרטיות מציינת זאת ליד הגיבויים (BR-078; OP-036 נסגר). בקשת מחיקה שנכשלה מדווחת לניטור השגיאות (§12) כמו כל בקשה שנכשלה: תבנית הנתיב והשגיאה בלבד, בלי מזהים ובלי תוכן. הדיווח אינו רישום של המחיקה (החלטת אפיק מ-24.10.2026). |
| Chat/Support | תקשורת ותפעול Support | אין מחיקה אוטומטית של הודעות שיחה ו-Support; הן נמחקות עם החשבון (BR-073, החלטת אפיק מ-20.10.2026). גוף ההודעות לא נכנס ל-personalization/paid analytics. |
| Moderation/Audit | Trust/Safety/Audit | אחרי מחיקת חשבון: 90 יום ואז מחיקה (BR-073, 17.10.2026). לחשבון פעיל: אירועי אבטחה, Audit ושחזור — 12 חודשים; דיווחים שטופלו — 12 חודשים (15א); מחיקה/שינוי Audit מוגבלים לפי NFR-AUDIT. דיווח על תוכן מחוק שהגיע למועד השחרור נשמר כ"פג תוקף", בלי היעד ובלי התוכן (BR-080). |
| Payment/Promotion | Billing/financial record + campaign performance | אין שמירת full card data במערכת. פירוט אירועי קידום (חשיפות, לחיצות, עוקבים ושיחות מקידום) וצפיות בבעל מקצוע — 12 חודשים ואז נמחק; לכל קידום נשמר סיכום חודשי לתמיד. במחיקת חשבון רשומות התשלום נשמרות בלי פרטים מזהים — סכום, תאריך, סוג הקידום ותחום בעל המקצוע (החלטת אפיק מ-21.10.2026). |
