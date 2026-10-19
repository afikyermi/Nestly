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
| סטטוס | מאושר; עודכן 15.10.2026 (F1.6), 17.10.2026 (F2.0, F2.4b, F2.5) ו-19.10.2026 (I3) |
| Actor | Regular User / Professional User / Admin / Moderator |
| תיאור | לחיצה על אייקון שלושת הפסים תפתח Side Drawer. התפריט ישמש ליעדים משניים/ניהוליים ולא ישכפל את יעדי Bottom Navigation. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | לחיצה על Hamburger. |
| תהליך מערכת | Regular: My Groups → GroupsDirectoryPage; Friends → FriendsPage; Following Professionals → FollowingProfessionalsPage; Account Settings / Privacy & Security / Notification Settings / Terms & Privacy → Sections ב-SettingsPage; Help/Support Request → SupportRequestFeature; כללי הקהילה → CommunityRulesPage (PG-049); פנייה למוקד רפואי → MedicalHotlinesPage (FR-MENU-002); שאלות לשחזור סיסמה → RecoveryQuestionsPage (PG-052, FR-AUTH-003; F1.6); החלפת סיסמה → ChangePasswordPage (PG-054, FR-AUTH-003; F2.0); שיתוף Nestly → ShareSheet עם קישור לאתר (FR-FEED-007); Logout. **כפי שנבנה ב-I3:** Regular רואה, לפי הסדר: "חברים", "כללי הקהילה", "חשבון", "פרטיות ואבטחה", "תנאים ופרטיות" (Sections ב-SettingsPage), "פנייה למוקד רפואי", "שאלות לשחזור סיסמה", "החלפת סיסמה", "שיתוף Nestly", "התנתקות". יעד שעוד לא נבנה אינו מוצג, וגם לא כמושבת; כל פיצ'ר מוסיף את הפריט שלו כשהוא נבנה (החלטת ORCHESTRATOR מ-17.10.2026, F2.5 DR-1). הפריט של המסך הפתוח מסומן כנוכחי. התפריט נסגר ב-Back, ב-Esc ובלחיצה מחוצה לו, והמסך נשאר במקומו; פריט שמנווט סוגר קודם את התפריט, ו-Back מהיעד חוזר למסך בלי תפריט פתוח (`docs/design/direction.md`). Professional: My Groups, Following Professionals, Professional Profile Settings, Promotion & Marketing Tools → ProfessionalPromotionPage/PromotionAnalyticsPage, Billing/Promotions → BillingPromotionsPage, Account/Privacy/Notifications/Terms → SettingsPage, Help/Support Request, כללי הקהילה, פנייה למוקד רפואי ו-Logout. אין "Verification Status" — האימות המקצועי הוסר (OP-005 נסגר, 18.10.2026). Admin: כל כלי הניהול + Moderator Management + Account/Security + Logout. Moderator: רק כלי ניהול לפי Permission Keys + Account/Security + Logout. |
| פלט | Side Drawer עם MenuItems מותאמים לחשבון. |
| מצב לאחר ביצוע | בחירת MenuItem מנווטת ליעד; Logout מסיים Session. |
| בעל אחריות לוגי (Page / Feature) | SideMenuFeature / SideDrawer / MenuItem |

## FR-MENU-002 — פנייה למוקדי רפואה

| שדה | הגדרה |
|---|---|
| סטטוס | מאושר — החלטת אפיק מ-16.10.2026 (I3); כפי שנבנה ב-I3 (19.10.2026). המוקד של מאוחדת — ממתין לאישור אפיק (החלטת ORCHESTRATOR, DR-1) |
| Actor | Regular User / Professional User |
| תיאור | עמוד קבוע עם כפתורי חיוג למוקדי רפואה: מד"א 101 ומוקדי האחיות של ארבע קופות החולים. המספרים נבדקים מול מקור רשמי בבנייה. העמוד מציג "לא תחליף לטיפול רפואי. במצב חירום — 101". **כפי שנבנה ב-I3:** `/medical-hotlines`, כותרת "פנייה למוקד רפואי" (גם שם הפריט בתפריט). השורה "לא תחליף לטיפול רפואי. במצב חירום — 101" מופיעה מעל הרשימה. חמישה קישורי חיוג, לפי הסדר: מד"א, ואחריו הקופות בסדר האלף-בית — כללית, לאומית, מאוחדת, מכבי — כך שאף קופה אינה מועדפת. כל קישור מציג את שם השירות ואת המספר, כך שגם במחשב אפשר לקרוא ולחייג. קופה שהאתר הרשמי שלה אינו מציין מוקד אחיות מקבלת את המוקד הטלפוני 24/7 שהיא מפרסמת, עם השם שלו (מאוחדת — "מוקד טלפוני 24/7"; החלטת ORCHESTRATOR מ-19.10.2026, DR-1, **ממתין לאישור אפיק**, כי ההחלטה של 16.10 מדברת על מוקדי אחיות). המספרים נבדקו מול האתרים הרשמיים ב-19.10.2026, ומשתנים רק בשינוי קוד. |
| תנאים מוקדמים | משתמש מחובר. |
| קלט / Trigger | "פנייה למוקד רפואי" ב-Side Menu, או הקישור "מוקדי רפואה" מכלל קהילה 2 (BR-075, PG-049). |
| תהליך מערכת | הצגת העמוד. לחיצה פותחת חיוג (`tel:`). לחיצות אינן נרשמות. **כפי שנבנה ב-I3:** פתיחת העמוד ולחיצה על הקישורים אינן שולחות שום בקשה לשרת ואינן כותבות לאחסון הדפדפן. |
| פלט | PG-047. |
| מצב לאחר ביצוע | אין שינוי נתונים. |
| בעל אחריות לוגי (Page / Feature) | MedicalHotlinesPage |
