[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Relationships & Groups — Friends, Follow וקבוצות

## FR-REL-001 — מודל Friends בין משתמשים רגילים

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר (17.10.2026) |
| Actor | Regular User |
| תיאור | Relationship Model בין משתמשים רגילים מבוסס Friends בלבד. Friendship הוא קשר דו-כיווני ונוצר רק לאחר Friend Request ואישור. |
| תנאים מוקדמים | שני החשבונות פעילים מסוג Regular User. |
| קלט / Trigger | שליחת Friend Request / Accept / Decline / ביטול בקשה ששלחתי / Remove Friend. |
| תהליך מערכת | המערכת מונעת בקשת חברות לעצמי, לחשבון Professional, Admin או Moderator ומונעת Request כפולה. Accept יוצר Friendship; Decline אינו יוצר קשר; Remove Friend מסיר את הקשר החברתי בלבד ואינו סוגר Conversation שכבר נפתחה. **Decline שקט** — השולח אינו יודע על הדחייה: אצלו הבקשה נשארת ב"בקשות ששלחת", הקשר שהוא רואה נשאר "נשלחה", "ביטול" שלה מצליח כמו על בקשה ממתינה, ושליחה חוזרת שלו אינה מגיעה לנמען. נמען שדחה ואחר כך שולח בקשה לשולח — הבקשה המקורית חוזרת אליו כממתינה לאישורו. **ביטול** בקשה ששלחתי מסיר אותה משתי הרשימות, ואפשר לשלוח שוב. לכל זוג יש לכל היותר קשר פעיל אחד, גם בשליחות מקבילות (VAL-017). צד שאינו פעיל (מושעה או חסום) אינו מופיע ברשימות, ובקשה ממנו אינה ניתנת לאישור; השורה נשמרת, והוא חוזר כשהחשבון חוזר לפעילות. יעד שאינו Regular פעיל או אינו קיים — אותה תשובה "לא זמין" (ERR-016); Professional, Admin ו-Moderator אינם יכולים לבצע אף פעולה (ERR-022). כל שליחה נספרת כפתיחת פרופיל בהגבלת הקצב (NFR-SEC-006). ברשימות מוצגים שם ומזהה בלבד (17.10.2026). |
| פלט | סטטוס בקשת חברות/חברות מעודכן ורשימת Friends מתעדכנת. |
| מצב לאחר ביצוע | Friendship פעילה מאפשרת פתיחת Chat ישיר ללא Message Request ויכולות Friend-specific נוספות. Conversation קיימת יכולה להמשיך לאחר Remove Friend. חסימת משתמש מסיימת את ה-Friendship (FR-REL-002). |
| בעל אחריות לוגי (Page / Feature) | ניהול חברים / מסך החברים |

## FR-REL-002 — חסימת משתמש

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — החלטת אפיק מ-18.10.2026. קריטריוני קבלה: AC-135, AC-136, AC-137. Use Case טרם נכתב |
| Actor | Regular User / Professional User מחובר ופעיל |
| תיאור | משתמש יכול לחסום משתמש אחר. החסימה הדדית: היא מסתירה פוסטים, תגובות ופרופיל בשני הכיוונים, ומסיימת את ה-Friendship ביניהם. היא נפרדת מ-Chat Block (FR-SERV-009), שחל על הודעות בלבד. |
| תנאים מוקדמים | המשתמש מחובר. |
| קלט / Trigger | "חסימה" בפרופיל של משתמש אחר, אחרי חלון אישור שמסביר מה החסימה עושה; ביטול חסימה — "ביטול החסימה" ברשימת "משתמשים חסומים" בהגדרות (PG-038). |
| תהליך מערכת | שמירת החסימה; מאותו רגע הפוסטים, התגובות, השם והפרופיל של כל צד אינם מוצגים לצד השני, כל צד אינו מופיע לשני בחיפוש אנשים וברשימות החברים, לא נשלחות התראות ביניהם, לא ניתן לשלוח או לאשר בקשת חברות ביניהם, וה-Friendship ובקשות פתוחות ביניהם מסתיימים. פוסט אנונימי אינו מוסתר (אין דרך לדעת של מי הוא). תוכן של צד חסום נשאר גלוי ל-Moderator או Admin המטפלים בדיווחים: חסימה אינה מסתירה תוכן מטיפול. ביטול החסימה מחזיר את הנראות; ה-Friendship אינו חוזר. אי אפשר לחסום Admin או Moderator, וחשבון יכול לחסום עד 20 פעמים ב-24 שעות. |
| פלט | "החשבון נחסם" במקום הפרופיל, עם קישור לרשימת המשתמשים החסומים. |
| מצב לאחר ביצוע | שני הצדדים אינם רואים זה את התוכן והפרופיל של זה, ואינם Friends. |
| בעל אחריות לוגי (Page / Feature) | חסימת משתמש |

## FR-FOLLOW-001 — Follow ל-Professional Profile

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | Follow הוא קשר חד-כיווני שיכול להיות מופנה רק אל Professional Profile. Professional User אינו יכול לעקוב אחר Regular User. |
| תנאים מוקדמים | משתמש מחובר; יעד הוא Professional Profile פעיל ואינו החשבון עצמו. |
| קלט / Trigger | Follow / Unfollow. |
| תהליך מערכת | המערכת יוצרת/מסירה ProfessionalFollow. Follow אינו דורש אישור. Regular או Professional יכולים לעקוב אחר Professional Profile; Professional אינו יוצר Friends. |
| פלט | מצב Follow מעודכן; Professional עשוי לקבל Notification על Follower חדש בהתאם להגדרות. |
| מצב לאחר ביצוע | הרשימה Following והפרופיל המקצועי משקפים את המצב החדש. |
| בעל אחריות לוגי (Page / Feature) | מעקב אחר בעל מקצוע |

## FR-GRP-001 — סוגי קבוצות וחשיפת תוכן

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | המערכת תתמוך ב-Public Group וב-Private Group. שני הסוגים ניתנים לאיתור בחיפוש, אך כללי חשיפת התוכן וההצטרפות שונים. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | פתיחת כרטיס קבוצה/מסך קבוצה או תוצאת חיפוש. |
| תהליך מערכת | Public: שם/תיאור ותוכן גלויים לכל משתמש מחובר; הצטרפות מיידית; רק Members יכולים לפרסם/להגיב. Private: שם/תיאור גלויים לצורך Discovery; תוכן ופוסטים מוסתרים ממי שאינו Member; הצטרפות דורשת Request ואישור Owner/Admin. |
| פלט | מסך קבוצה בהתאם להרשאת המשתמש ולסוג הקבוצה. |
| מצב לאחר ביצוע | אין חשיפת Private Group content למשתמש שאינו Member. |
| בעל אחריות לוגי (Page / Feature) | ניהול הקבוצות / מסך קבוצה |

## FR-GRP-002 — הצטרפות, בקשות והזמנות לקבוצה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User / Group Owner / Group Admin |
| תיאור | המערכת תנהל Membership, Join Requests, הזמנות לקבוצות והמלצה על Group לחבר. |
| תנאים מוקדמים | משתמש מחובר וקבוצה פעילה. |
| קלט / Trigger | Join / Request to Join / Invite / Accept Invite / Leave / Recommend to Friend. |
| תהליך מערכת | ב-Public Group Join הופך את המשתמש ל-Member מיד. ב-Private Group נוצרת Join Request; Owner/Admin יכולים Approve/Reject. הזמנה ניהולית מאפשרת למוזמן לאשר הצטרפות. המשתמש יכול לעזוב קבוצה בעצמו. Regular User יכול לבצע Recommend to Friend רק כלפי Friendship פעילה; הפעולה שולחת Notification עם יעד הקבוצה ואינה משנה Membership. |
| פלט | Membership/JoinRequest/Invitation מעודכנים, או Notification מסוג Group Recommendation כאשר נבחרה המלצה לחבר. |
| מצב לאחר ביצוע | Notification רלוונטית נוצרת בהתאם להגדרות המשתמש. |
| בעל אחריות לוגי (Page / Feature) | ניהול הקבוצות / ניהול קבוצה |

## FR-GRP-003 — תפקידי ניהול קבוצה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Group Owner / Group Admin / Group Moderator |
| תיאור | תפקידי ניהול קבוצה נפרדים לחלוטין מ-System Admin/Moderator. |
| תנאים מוקדמים | משתמש הוא Member בקבוצה ובעל Group Role מתאים. |
| קלט / Trigger | פעולת ניהול קבוצה. |
| תהליך מערכת | היררכיה: Group Owner > Group Admin > Group Moderator > Member. Owner: שינוי Public/Private, מינוי/הסרת Admin/Moderator, העברת בעלות ומחיקה. Admin: Join Requests, הזמנות, Members, Rules, Pin וניהול Group Moderator; אינו יכול לפעול נגד Owner או Admin אחר. Group Moderator: תוכן ואכיפה על Members בלבד ואינו יכול לפעול נגד Owner/Admin/Group Moderator אחר. Owner אינו יכול לעזוב/להימחק לפני העברת בעלות. |
| פלט | פעולת הקבוצה מתבצעת רק אם ה-Group Role מאפשר. |
| מצב לאחר ביצוע | שינויי Membership/Role/Content משתקפים בקבוצה; Enforcement מכבד היררכיית Roles. |
| בעל אחריות לוגי (Page / Feature) | ניהול קבוצה / מסך ניהול קבוצה |

## FR-GRP-004 — יצירת Group

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | כל משתמש קהילה מחובר מסוג Regular או Professional רשאי ליצור Group חדש. בעת היצירה המשתמש בוחר Public או Private והופך אוטומטית ל-Group Owner. |
| תנאים מוקדמים | Regular/Professional פעיל ומחובר. |
| קלט / Trigger | Create Group: שם, תיאור בסיסי, Public/Private ושדות נוספים שיוגדרו. |
| תהליך מערכת | ולידציה, יצירת Group, Membership ליוצר והקצאת Owner. אין צורך באישור Admin ליצירת קבוצה רגילה. |
| פלט | Group חדש ומסך קבוצה פעיל. |
| מצב לאחר ביצוע | היוצר הוא Group Owner ויכול לנהל לפי FR-GRP-003. |
| בעל אחריות לוגי (Page / Feature) | מסך יצירת קבוצה / ניהול הקבוצות / ניהול קבוצה |
