[← אינדקס ה-SRS](INDEX.md)

# 12. דרישות ממשקים חיצוניים

| ממשק | צורך | סטטוס |
|---|---|---|
| Authentication | זיהוי והתחברות של משתמשים (FR-AUTH). הספק: Supabase Auth. שרת המערכת מאמת את ה-JWT בכל בקשה, וסוג החשבון וההרשאות נקראים מבסיס הנתונים בלבד. ערוץ ה-Password Recovery נשאר TBD (ראה Email / SMS / Push). | מאושר (החלטה מ-11.10.2026) |
| Payment Gateway | נדרש אם קידום פרופיל/כלים שיווקיים או קידום Marketplace Listing יירכשו בתוך המערכת. ספק לא נבחר. | TBD Provider |
| Email / SMS / Push | Notification delivery ושחזור/אבטחת חשבון. בשלב Web התראות חברתיות, קבוצתיות, Marketplace, Promotion ו-System נמסרות In-App. בשלב Mobile ניתן גם Push לקטגוריות מאופשרות, בכפוף ל-Push enabled ולהרשאת מערכת ההפעלה. Email/SMS אינם ערוץ להתראות השוטפות; ניתן להשתמש בהם רק לתהליכים טכניים/חשבון/אבטחה כגון Password Recovery, לפי החלטה וספק שייבחרו בנפרד. | Notification channels מאושר: In-App + Mobile Push. ערוץ/ספק Password Recovery נשאר TBD נפרד. |
| Location / Maps | סינון בעלי מקצוע לפי קרבה גיאוגרפית. אופן קבלת מיקום והרשאה TBD. | TBD |
| Media Storage | תמונות וסרטונים בפוסטים וב-Marketplace Listings, וכן תמונות פרופיל. ספק, פורמטים ומגבלות TBD. | TBD |
| Affiliate / Commerce | קישורי Affiliate או אינטגרציה מסחרית למוצרים. | TBD |
| Professional Verification | אימות תעודות/מספרים אם יידרש. | TBD |
| External Login | Google/Apple וכדומה — לא מופיע בדרישות הקיימות. | לא מאושר / TBD |
