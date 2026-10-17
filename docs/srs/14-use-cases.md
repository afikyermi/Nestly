[← אינדקס ה-SRS](INDEX.md)

# 14. Use Cases

| ID | שם | Actors | Main Flow |
|---|---|---|---|
| UC-01 | יצירת חשבון רגיל | Guest | בחירת יצירת חשבון → Regular → מילוי פרופיל/Parent Journey → Credentials → ולידציה → חשבון נוצר. |
| UC-02 | יצירת חשבון מקצועי | Guest | בחירת Professional → פרטים מקצועיים → Credentials → יצירת חשבון → אימות אם נדרש. |
| UC-03 | התחברות | Guest | הזנת פרטים → אימות → כניסה. |
| UC-04 | צריכת ושיתוף תוכן | Regular/Professional | כניסה לפיד → צפייה → יצירת פוסט/תגובה → עדכון הפיד. |
| UC-05 | הוספת מעקב | Regular | בית → הוספת מסלול → בחירת סוג → הזנת פרטים → מסלול מופיע ב-Dashboard. |
| UC-06 | רישום Tracker Event | Regular | בית → בחירת Tracker → הזנת נתונים → שמירה → הצגת האירוע. |
| UC-07 | פרסום/איתור פריט ב-Marketplace | Regular (יצירה/צפייה) / Professional (צפייה/פתיחה/פנייה) | Marketplace → צפייה. Regular יוצר Listing ויכול לקדם. Regular או Professional פותחים Listing פעיל ויכולים לפנות ישירות לבעלים דרך Marketplace Chat; Professional→Regular כאן אינו Offer Help. |
| UC-08 | איתור בעל מקצוע | Regular | נותני שירות → קטגוריה/סינון → פרופיל מקצועי. |
| UC-09 | תקשורת עם בעל מקצוע | Regular + Professional | מסלול A: משתמש רגיל → פרופיל מקצועי → פתיחת Chat → שיחה חופשית. מסלול B: בעל מקצוע → פוסט של משתמש רגיל → Offer Help אחד → Accept → שיחה חופשית; Decline/Ignore אינם פותחים Chat. |
| UC-10 | עריכת פרופיל | Regular/Professional | פרופיל → עריכה → ולידציה → שמירה. |
| UC-11 | ניהול Professional Dashboard | Professional | כניסה לחשבון מקצועי → Dashboard → צפייה בפוסטים/חשיפה/מדדים → מעבר לניהול תוכן/פרופיל. |
| UC-12 | שליחת פנייה להנהלת המערכת | Regular/Professional | בחירת פנייה → בחירת נושא → כתיבת מלל → שליחה → אישור קליטה. |
| UC-13 | טיפול בפניות | Admin / Moderator | Support Inbox → SUPPORT_VIEW לצפייה → SUPPORT_HANDLE לתגובה/הערה/סטטוס. תגובה חיצונית נשמרת בפנייה ומופיעה למשתמש ב-Chat תחת “Support”; אין חשיפת זהות Admin/Moderator. Audit נרשם. |
| UC-14 | רישום הנקה | Regular | בחירת Tracker הנקה → בחירת צד → התחלת/עריכת זמן התחלה → סיום/עריכת זמן סיום → הערות → שמירה. |
| UC-15 | ניהול הרשאות Moderator | Admin | כניסה לניהול Moderator → בחירת Moderator → הקצאה/הסרה של Permission Keys המאושרים או השבתת Moderator → שמירה → אכיפת ההרשאות ב-Backend → רישום Before/After ב-Audit Log. |
| UC-16 | אכיפה על משתמש | Admin / Moderator מורשה | איתור משתמש → בחירת Warning / Suspension / Ban / Unban → בדיקת Permission ו-Target → הזנת סיבה/משך לפי הצורך → ביצוע → עדכון סטטוס → Audit Log. Moderator אינו יכול לאכוף פעולה על Admin, על עצמו או על Moderator אחר. |
| UC-17 | צפייה ב-Audit Log | Admin / Moderator עם AUDIT_LOG_VIEW | פתיחת Audit Log → סינון/חיפוש → צפייה בפרטי פעולה. Moderator במצב Read Only; אין שינוי או מחיקה. |
| UC-18 | אימות Professional | Admin / Moderator עם PROFESSIONAL_VERIFY | פתיחת תור אימות → צפייה בפרטי הבקשה → אישור/דחייה/עדכון סטטוס → Audit Log. |
| UC-19 | Global Search | Regular / Professional | TopBar → הקלדת חיפוש → Dropdown People/Groups/Posts → בחירת תוצאה או View All → SearchResultsPage → פתיחת Profile/Group/Post בכפוף להרשאות. |
| UC-20 | יצירת Friendship | Regular + Regular | User A שולח Friend Request → User B מקבל Notification → Accept יוצר Friendship / Decline סוגר בקשה → FriendsPage מתעדכן. הדחייה שקטה: אצל A הבקשה נשארת ממתינה, ו-A יכול לבטל אותה (FR-REL-001, F2.4). |
| UC-21 | Follow Professional | Regular/Professional → ProfessionalProfile | פתיחת Professional Profile → Follow/Unfollow → עדכון ProfessionalFollow → New Follower notification בהתאם להגדרות. |
| UC-22 | הצטרפות לקבוצה | Regular/Professional | Public: Group → Join → Membership מיידית. Private: Group → Request to Join → Owner/Admin Approve/Reject → Membership/Notification מתעדכנים. Invite יוצר GroupInvitation שהמוזמן יכול Accept/Decline. Regular User יכול Recommend Group ל-Friend פעיל; נוצרת Notification בלבד ללא שינוי Membership. |
| UC-23 | ניהול קבוצה | Group Owner/Admin/Moderator | Group Management → פעולות לפי Owner > Admin > Group Moderator > Member → בדיקת Target Role → ביצוע/חסימה → שמירה. Owner מעביר בעלות לפני עזיבה. |
| UC-24 | Notification Center והגדרות | Regular/Professional/Admin/Moderator | Bell → Dropdown → פתיחת Notification/Mark read/View All. Regular/Professional יכולים לפתוח Settings ולבחור סוגי אירועים; Group mode All/Highlights/Off; Critical נשאר פעיל. Moderator מקבל רק אירועים בסקופ Permissions. |
| UC-25 | Chat Center | Regular/Professional | Chat Icon → Conversations/Requests → פתיחה/View All. Friends Chat ישיר; non-Friends Regular Chat Request; שיחה קיימת ממשיכה אחרי Remove Friend. Professional→Regular Offer Help למעט Marketplace. Support response מופיע כ-Support Thread. ChatBlock מונע הודעות בלבד. |
| UC-26 | שליחת דיווח | Regular / Professional | בחירת Report על Post/Comment/Listing/User → בחירת סיבה → שליחה → Report נשמר → אישור קליטה. |
| UC-27 | טיפול בדיווח | Admin / Moderator מורשה | AdminModerationPage → פתיחת Report → בדיקת REPORTS_VIEW והרשאת הפעולה המתאימה → טיפול בתוכן/Listing/משתמש → עדכון סטטוס Report → Audit Log. |
| UC-28 | ניהול הגדרות קהילה | Admin / Moderator עם COMMUNITY_CONFIG | פתיחת Community Administration → שינוי קטגוריה/סיבת דיווח/תצורת Moderation מאושרת → ולידציה → שמירה → Audit Log. |
| UC-29 | פרסום הודעת מערכת | Admin / Moderator עם SYSTEM_ANNOUNCEMENTS | פתיחת System Announcements → יצירה/עריכה → Publish/Remove → שמירה → Audit Log. |
| UC-30 | בקשת שיחה בין non-Friends | Regular + Regular | User A שולח הודעת פתיחה → User B רואה Regular Chat Request → Accept פותח Conversation / Decline אינו פותח Chat. |
| UC-31 | Support Thread ב-Chat | Regular/Professional + Support | משתמש שולח SupportRequest → Admin/Moderator עם SUPPORT_HANDLE מגיב → Chat מציג Thread בשם Support → אינטראקציה רק במסגרת הפנייה; נושא חדש נפתח דרך Support Request. |
| UC-32 | יצירת קבוצה | Regular/Professional | Create Group → שם/תיאור → Public/Private → יצירה → Membership + Owner → GroupPage. |
| UC-33 | שינוי פרטיות Regular Profile | Regular | Settings → Privacy & Security → Open/Restricted → שמירה → Search ממשיך להציג basic identity; non-Friend access משתנה לפי ההגדרה. |
| UC-34 | ניהול קידום Professional | Professional | Promotion & Marketing Tools → Profile/Post Promotion → הפעלה/רכישה → Sponsored Reach → Promotion Analytics. |
| UC-35 | ניהול Sponsored Product | Admin | Admin Sponsored Products → Create/Edit → source/media/status → Publish/Pause/Remove → Audit → Marketplace מציג Sponsored. |
| UC-36 | Personalized Feed — Regular | Regular + System | Feed open → Eligibility → candidates from Friends/Groups/Follows/Public/Stage/Intent → Ranking/Re-ranking → Sponsored eligible insertion → Impressions → feedback updates signals. |
| UC-37 | Personalized Feed — Professional | Professional + System | Feed open → profession/groups/follows/search interactions → Ranking/Re-ranking without Child/Tracker → sponsored relevant units → impressions/feedback. |
| UC-38 | Professional Matching | Regular + System | Services/Search/Feed recommendation → category/query/intent/location-if-permitted → organic professional scoring → profile open/follow/chat; Paid promotion remains separate. |
| UC-39 | Marketplace/Product Recommendation | Regular/Professional + System | Marketplace/Feed → query/category/intent/freshness/location-if-permitted → organic ranking → sponsored/promoted eligible insertion → detail open/chat/conversion events. |
| UC-40 | Recommendation Feedback | Regular/Professional | Feed unit → Not Interested/Hide/Show Less → RecommendationFeedback saved → similar creator/topic/source suppressed → next ranking reflects preference. |
| UC-41 | Owner/Admin Intelligence | Admin / Moderator with ANALYTICS_VIEW | AdminAnalytics → choose period/domain → aggregated lifecycle/feed/search/group/professional/marketplace/promotion/support/moderation metrics → identify trend/gap; organic/paid shown separately. |
| UC-42 | Professional Performance Analytics | Professional | Dashboard/Promotion Analytics → period → own aggregated Profile/Content/Promotion metrics → compare Organic vs Paid → no individual user identity/search data. |
