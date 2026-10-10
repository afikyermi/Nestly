[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Chat

## FR-CHAT-001 — Chat Center ב-Top Bar

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | אייקון Chat ב-Top Bar יציג Unread Badge. לחיצה תפתח Dropdown של השיחות האחרונות עם ConversationPreview וקישור “כל ההודעות” ל-ChatPage מלא. |
| תנאים מוקדמים | משתמש Regular או Professional מחובר. |
| קלט / Trigger | לחיצה על Chat / שיחה / View All. |
| תהליך מערכת | המערכת טוענת Recent Conversations, הודעה אחרונה, זמן ו-unread state. לחיצה על שיחה פותחת Conversation. Message Requests מ-Offer Help יוצגו באזור בקשות בתוך Chat ולא כ-Notification כפולה. |
| פלט | Chat Dropdown / ChatPage / Conversation. |
| מצב לאחר ביצוע | סימון הודעה כנקראה מעדכן Unread count. |
| בעל אחריות לוגי (Page / Feature) | MessagingFeature / ChatPage / ConversationPreview |

## FR-CHAT-002 — כללי פתיחת שיחה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User |
| תיאור | Chat הוא מנגנון הודעות אחד המשרת מספר הקשרים, אך פתיחת Conversation חדשה תלויה ביחסים ובהקשר. |
| תנאים מוקדמים | משתמש מחובר. פתיחת/שליחת הודעה כפופה ל-Chat Block ולהקשר. |
| קלט / Trigger | פעולת Message/Chat בהקשר מורשה. |
| תהליך מערכת | Regular↔Regular: Friendship פעילה פותחת Chat ישיר. ללא Friendship וללא Conversation קיימת, ההודעה הראשונה יוצרת Regular Chat Request הדורשת Accept/Decline; רק Accept פותח Chat מלא. Conversation שכבר נפתחה ממשיכה גם לאחר Remove Friend. Regular→Professional: פתיחה ישירה לפי FR-SERV-004. Professional→Regular: רק לאחר Accept של Offer Help, למעט Marketplace Listing פעיל שבו מותר Marketplace Chat ישיר. Marketplace: כל משתמש קהילה מחובר יכול לפנות לבעל Listing פעיל שאינו עצמו. Professional→Professional אינו נפתח אוטומטית מכוח Follow. |
| פלט | Conversation קיימת נפתחת או נוצרת בהתאם לכלל. |
| מצב לאחר ביצוע | Conversation פתוחה, Regular Chat Request ממתינה להחלטה, או הפעולה נדחית לפי ההקשר. Chat Block משפיע על Messaging בלבד. |
| בעל אחריות לוגי (Page / Feature) | MessagingFeature |

## FR-CHAT-003 — בקשת שיחה בין Regular Users שאינם Friends

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User |
| תיאור | Regular User יכול לשלוח הודעת פתיחה ל-Regular User שאינו Friend. היא מוצגת כ-Regular Chat Request; הנמען יכול Accept או Decline. רק Accept פותח Conversation מלאה. |
| תנאים מוקדמים | שני הצדדים Regular Users פעילים; אין Conversation פתוחה; אין Chat Block שמונע שליחה. |
| קלט / Trigger | שליחת הודעה ראשונה ל-non-Friend. |
| תהליך מערכת | יצירת RegularChatRequest עם openingMessage ו-Pending. Accept יוצר/פותח Conversation; Decline סוגר את הבקשה ואינו פותח Chat. |
| פלט | Message Request ב-Chat Center או Conversation לאחר Accept. |
| מצב לאחר ביצוע | ללא Accept אין Chat מלא. Friendship אינה תנאי לעצם האפשרות לבקש שיחה. |
| בעל אחריות לוגי (Page / Feature) | MessagingFeature / MessageRequestItem / ChatPage |

## FR-CHAT-004 — Support Thread בתוך Chat

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User / Admin / Moderator עם SUPPORT_HANDLE |
| תיאור | כאשר קיימת תגובת Support לפניית משתמש, היא תופיע ב-Chat Center תחת השם “Support”. זהו שרשור שירות מוגבל המקושר ל-SupportRequest ולא Chat רגיל בין המשתמש לבין Admin/Moderator. |
| תנאים מוקדמים | קיימת SupportRequest. תגובת Support נשלחת על ידי Admin או Moderator עם SUPPORT_HANDLE. |
| קלט / Trigger | תגובת Support או תשובת המשתמש בתוך Support Thread פעיל. |
| תהליך מערכת | הודעות נשמרות כחלק מה-SupportRequest/SupportThread. הצד המנהלי מוצג בשם “Support” ללא חשיפת זהותו. אי אפשר לפתוח Support Chat חופשי מתוך ChatPage; נושא חדש נפתח דרך SupportRequestFeature. שליחה בתוך השרשור כפופה לסטטוס הפנייה. |
| פלט | Support Thread ב-ChatPage עם unread state והיסטוריה. |
| מצב לאחר ביצוע | האינטראקציה מוגבלת לפנייה; סגירת הפנייה מגבילה המשך שליחה ולא הופכת את הערוץ לצ’אט חברתי. |
| בעל אחריות לוגי (Page / Feature) | SupportRequestFeature / SupportInboxFeature / MessagingFeature / ChatPage |
