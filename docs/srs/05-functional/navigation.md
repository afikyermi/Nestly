[← אינדקס ה-SRS](../INDEX.md)

# 5. דרישות פונקציונליות · Navigation — Top Bar ו-Side Menu

## FR-TOP-001 — Top Bar גלובלי

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר |
| Actor | Regular User / Professional User / Admin / Moderator |
| תיאור | לאחר התחברות יוצג Top Bar גלובלי ורב-שימושי. ב-Regular/Professional יוצגו מימין לשמאל: Hamburger Menu, Global Search במרכז, Chat ו-Notification Bell. ב-Admin/Moderator יוצג Top Bar ניהולי ללא Social Chat או Global Search צרכני. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | טעינת מסך בתוך AppShell. |
| תהליך מערכת | המערכת מזהה Role/Permissions, טוענת counters ומציגה רק פעולות המותרות לחשבון. Admin/Moderator אינם משתמשים ב-Top Bar כדי להשתתף בקהילה. |
| פלט | Top Bar עקבי עם פעולות מותאמות Role ו-Unread badges. |
| מצב לאחר ביצוע | אין שינוי נתונים למעט טעינת state/counters. |
| בעל אחריות לוגי (Page / Feature) | AppShell / TopBar |

## FR-MENU-001 — Hamburger / Side Menu

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר; עודכן 15.10.2026 (F1.6) |
| Actor | Regular User / Professional User / Admin / Moderator |
| תיאור | לחיצה על אייקון שלושת הפסים תפתח Side Drawer. התפריט ישמש ליעדים משניים/ניהוליים ולא ישכפל את יעדי Bottom Navigation. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | לחיצה על Hamburger. |
| תהליך מערכת | Regular: My Groups → GroupsDirectoryPage; Friends → FriendsPage; Following Professionals → FollowingProfessionalsPage; Account Settings / Privacy & Security / Notification Settings / Terms & Privacy → Sections ב-SettingsPage; Help/Support Request → SupportRequestFeature; כללי הקהילה → CommunityRulesPage (PG-049); פנייה למוקד רפואי → MedicalHotlinesPage (FR-MENU-002); שאלות לשחזור סיסמה → RecoveryQuestionsPage (PG-052, FR-AUTH-003; F1.6); Logout. Professional: My Groups, Following Professionals, Professional Profile Settings, Verification Status → ProfessionalVerificationStatusPage, Promotion & Marketing Tools → ProfessionalPromotionPage/PromotionAnalyticsPage, Billing/Promotions → BillingPromotionsPage, Account/Privacy/Notifications/Terms → SettingsPage, Help/Support Request, כללי הקהילה, פנייה למוקד רפואי ו-Logout. Admin: כל כלי הניהול + Moderator Management + Account/Security + Logout. Moderator: רק כלי ניהול לפי Permission Keys + Account/Security + Logout. |
| פלט | Side Drawer עם MenuItems מותאמים לחשבון. |
| מצב לאחר ביצוע | בחירת MenuItem מנווטת ליעד; Logout מסיים Session. |
| בעל אחריות לוגי (Page / Feature) | SideMenuFeature / SideDrawer / MenuItem |

## FR-MENU-002 — פנייה למוקדי רפואה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — החלטת אפיק מ-16.10.2026 (I3) |
| Actor | Regular User / Professional User |
| תיאור | עמוד קבוע עם כפתורי חיוג למוקדי רפואה: מד"א 101 ומוקדי האחיות של ארבע קופות החולים. המספרים נבדקים מול מקור רשמי בבנייה. העמוד מציג "לא תחליף לטיפול רפואי. במצב חירום — 101". |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | "פנייה למוקד רפואי" ב-Side Menu, או הקישור מכלל קהילה 2 (BR-075). |
| תהליך מערכת | הצגת העמוד. לחיצה פותחת חיוג (`tel:`). לחיצות אינן נרשמות. |
| פלט | PG-047. |
| מצב לאחר ביצוע | אין שינוי נתונים. |
| בעל אחריות לוגי (Page / Feature) | MedicalHotlinesPage |
