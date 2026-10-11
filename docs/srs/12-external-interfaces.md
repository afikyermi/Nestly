[← אינדקס ה-SRS](INDEX.md)

# 12. דרישות ממשקים חיצוניים

| ממשק | צורך | סטטוס |
|---|---|---|
| Authentication | זיהוי והתחברות של משתמשים (FR-AUTH). הספק: Supabase Auth. שרת המערכת מאמת את ה-JWT בכל בקשה, וסוג החשבון וההרשאות נקראים מבסיס הנתונים בלבד. אימות אימייל נדרש לפני התחברות ראשונה, ו-Password Recovery נעשה באימייל (ראה Email / SMS / Push). | מאושר (החלטות מ-11.10.2026) |
| Payment Gateway | נדרש אם קידום פרופיל/כלים שיווקיים או קידום Marketplace Listing יירכשו בתוך המערכת. ספק לא נבחר. | TBD Provider |
| Email / SMS / Push | Notification delivery ושחזור/אבטחת חשבון. בשלב Web התראות חברתיות, קבוצתיות, Marketplace, Promotion ו-System נמסרות In-App. בשלב Mobile ניתן גם Push לקטגוריות מאופשרות, בכפוף ל-Push enabled ולהרשאת מערכת ההפעלה. Email אינו ערוץ להתראות השוטפות; הוא משמש רק לאימות אימייל ול-Password Recovery. SMS אינו בשימוש, כי מספר טלפון אינו נאסף (החלטה מ-11.10.2026). ספק האימייל לאימות ולשחזור ייבחר בפיצ'ר הראשון שנוגע בו. | Notification channels מאושר: In-App + Mobile Push. Password Recovery באימייל — מאושר. ספק האימייל — TBD. |
| Location / Maps | סינון בעלי מקצוע לפי קרבה גיאוגרפית. אופן קבלת מיקום והרשאה TBD. | TBD |
| Media Storage | תמונות בפוסטים, ב-Marketplace Listings ובתמונות פרופיל; סרטונים בשלב מאוחר יותר. העלאה ישירה לאחסון בכתובת חתומה שהשרת מנפיק. ספק, פורמטים, מגבלות ומדיניות — TBD (OP-027, NFR-MEDIA-001). | TBD |
| Realtime | עדכונים חיים לצ'אט ולהתראות. ב-MVP: polling. בהמשך: Supabase Realtime בערוצים פרטיים שמעבירים רק אות ("משהו השתנה") ולא תוכן; התוכן נטען דרך השרת, תחת אותן הרשאות (החלטה מ-11.10.2026). | מאושר — כיוון; הפעלה בהמשך |
| Affiliate / Commerce | קישורי Affiliate או אינטגרציה מסחרית למוצרים. | TBD |
| Professional Verification | אימות תעודות/מספרים אם יידרש. | TBD |
| External Login | Google/Apple וכדומה — לא מופיע בדרישות הקיימות. | לא מאושר / TBD |
