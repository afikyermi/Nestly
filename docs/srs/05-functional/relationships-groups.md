[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Relationships & Groups — Friends, Follow וקבוצות

## FR-REL-001 — מודל Friends בין משתמשים רגילים

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User |
| תיאור | Relationship Model בין משתמשים רגילים מבוסס Friends בלבד. Friendship הוא קשר דו-כיווני ונוצר רק לאחר Friend Request ואישור. |
| תנאים מוקדמים | שני החשבונות פעילים מסוג Regular User. |
| קלט / Trigger | שליחת Friend Request / Accept / Decline / Remove Friend. |
| תהליך מערכת | המערכת מונעת בקשת חברות לעצמי, לחשבון Professional, Admin או Moderator ומונעת Request כפולה. Accept יוצר Friendship; Decline אינו יוצר קשר; Remove Friend מסיר את הקשר החברתי בלבד ואינו סוגר Conversation שכבר נפתחה. |
| פלט | סטטוס בקשת חברות/חברות מעודכן ורשימת Friends מתעדכנת. |
| מצב לאחר ביצוע | Friendship פעילה מאפשרת פתיחת Chat ישיר ללא Message Request ויכולות Friend-specific נוספות. Conversation קיימת יכולה להמשיך לאחר Remove Friend. |
| בעל אחריות לוגי (Page / Feature) | FriendsFeature / FriendsPage |

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
| בעל אחריות לוגי (Page / Feature) | ProfessionalFollowFeature |

## FR-GRP-001 — סוגי קבוצות וחשיפת תוכן

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | המערכת תתמוך ב-Public Group וב-Private Group. שני הסוגים ניתנים לאיתור בחיפוש, אך כללי חשיפת התוכן וההצטרפות שונים. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | פתיחת GroupCard/GroupPage או תוצאת חיפוש. |
| תהליך מערכת | Public: שם/תיאור ותוכן גלויים לכל משתמש מחובר; הצטרפות מיידית; רק Members יכולים לפרסם/להגיב. Private: שם/תיאור גלויים לצורך Discovery; תוכן ופוסטים מוסתרים ממי שאינו Member; הצטרפות דורשת Request ואישור Owner/Admin. |
| פלט | GroupPage בהתאם להרשאת המשתמש ולסוג הקבוצה. |
| מצב לאחר ביצוע | אין חשיפת Private Group content למשתמש שאינו Member. |
| בעל אחריות לוגי (Page / Feature) | GroupsFeature / GroupPage |

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
| בעל אחריות לוגי (Page / Feature) | GroupsFeature / GroupManagementFeature |

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
| בעל אחריות לוגי (Page / Feature) | GroupManagementFeature / GroupManagementPage |

## FR-GRP-004 — יצירת Group

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | כל משתמש קהילה מחובר מסוג Regular או Professional רשאי ליצור Group חדש. בעת היצירה המשתמש בוחר Public או Private והופך אוטומטית ל-Group Owner. |
| תנאים מוקדמים | Regular/Professional פעיל ומחובר. |
| קלט / Trigger | Create Group: שם, תיאור בסיסי, Public/Private ושדות נוספים שיוגדרו. |
| תהליך מערכת | ולידציה, יצירת Group, Membership ליוצר והקצאת Owner. אין צורך באישור Admin ליצירת קבוצה רגילה. |
| פלט | Group חדש ו-GroupPage פעיל. |
| מצב לאחר ביצוע | היוצר הוא Group Owner ויכול לנהל לפי FR-GRP-003. |
| בעל אחריות לוגי (Page / Feature) | CreateGroupPage / GroupsFeature / GroupManagementFeature |
