# Design tokens — כיוון A, משמש וטרקוטה, עם Rubik

**מעמד:** מאושר על ידי אפיק ב-R1 (11.10.2026). ההחלטה ב-`decisions.md`, ברשומה "R1".
**ייעוד המסמך:** מפרט לקריאה. מקור הקוד ייבנה ב-9.7 ב-`packages/shared/src/design-tokens/`, וממנו יופקו ה-CSS וטסט
הניגודיות. אם המסמך והקוד לא מסכימים, הקוד מתוקן לפי המסמך, או שהמסמך מתעדכן בהחלטה.
**מצב כהה:** לא מוגדר (החלטה מ-11.10). הרכיבים משתמשים רק בשמות הסמנטיים שלמטה, ולכן אפשר להוסיף מצב כהה בעתיד
בלי לגעת ברכיבים.

## צבע — tokens סמנטיים

השמות תואמים ל-shadcn/ui, כדי שרכיבים שנוצרים לא יצטרכו שינוי שם. שורות שמסומנות "+" הן תוספות שלנו.

| token | ערך | תפקיד |
|---|---|---|
| `background` | `#FFF8F2` | רקע הדף, קרם חם |
| `foreground` | `#3B2F2A` | טקסט ראשי |
| `card` · `popover` | `#FFFFFF` | משטחים: כרטיס, תפריט, דיאלוג |
| `card-foreground` · `popover-foreground` | `#3B2F2A` | טקסט על משטח |
| `primary` | `#B5502C` | פעולה ראשית: כפתור מלא, טבעת focus, אייקון פעיל |
| `primary-foreground` | `#FFFFFF` | טקסט על `primary` |
| + `primary-strong` | `#8F3E21` | קישור, טקסט על פסטל, hover של כפתור ראשי |
| + `primary-soft` | `#FDE6D8` | פסטל: כפתור רך, מונה, מצב נבחר, לשונית פעילה |
| `secondary` | `#FDE6D8` | הכפתור הרך של shadcn, שווה ל-`primary-soft` |
| `secondary-foreground` | `#8F3E21` | טקסט על `secondary` |
| `muted` · `accent` | `#FBEFE6` | משטח משני: שדה חיפוש, hover בתפריט, skeleton |
| `muted-foreground` | `#6B5A51` | טקסט משני: זמן, הקשר, רמזים |
| + `accent-soft` | `#E3EEDF` | פסטל משני, מרווה: צ'יפים, תמונת Context, איורים |
| `destructive` | `#B3261E` | שגיאה ופעולה הרסנית |
| + `destructive-soft` | `#FCEBE8` | רקע הודעת שגיאה |
| + `success` · `success-soft` | `#2E6B45` · `#E6F0E9` | הצלחה |
| + `warning` · `warning-soft` | `#8A5300` · `#FBF0DC` | אזהרה. לא נקבע צבע מידע כחול |
| `border` | `#F1E6DD` | קו מפריד דקורטיבי בלבד. לא משמש לזיהוי רכיב |
| `input` | `#9C8579` | גבול שדה קלט |
| `ring` | `#B5502C` | טבעת focus |
| + `badge` · `badge-foreground` | `#FDE6D8` · `#8F3E21` | מונה שקט |

## ניגודיות — WCAG 2.2 AA

הסף: 4.5 לטקסט, ו-3 לגבולות, לאייקונים ולטבעת ה-focus. החישוב לפי נוסחת WCAG. ב-9.7 הוא יהפוך לטסט ב-Vitest.

| קדמה | רקע | יחס | סף | |
|---|---|---|---|---|
| foreground | background | 12.28 | 4.5 | ✅ |
| foreground | card | 12.92 | 4.5 | ✅ |
| foreground | muted | 11.43 | 4.5 | ✅ |
| muted-foreground | background | 6.23 | 4.5 | ✅ |
| muted-foreground | card | 6.55 | 4.5 | ✅ |
| muted-foreground | muted | 5.80 | 4.5 | ✅ |
| primary-foreground | primary | 5.06 | 4.5 | ✅ |
| primary-foreground | primary-strong (hover) | 7.29 | 4.5 | ✅ |
| primary-strong | background | 6.93 | 4.5 | ✅ |
| primary-strong | card | 7.29 | 4.5 | ✅ |
| primary-strong | primary-soft | 6.07 | 4.5 | ✅ |
| foreground | primary-soft | 10.75 | 4.5 | ✅ |
| foreground | accent-soft | 10.80 | 4.5 | ✅ |
| primary-strong | accent-soft | 6.10 | 4.5 | ✅ |
| destructive | card | 6.54 | 4.5 | ✅ |
| destructive | background | 6.21 | 4.5 | ✅ |
| destructive | destructive-soft | 5.66 | 4.5 | ✅ |
| primary-foreground | destructive | 6.54 | 4.5 | ✅ |
| success | card | 6.35 | 4.5 | ✅ |
| success | success-soft | 5.45 | 4.5 | ✅ |
| warning | card | 6.33 | 4.5 | ✅ |
| warning | warning-soft | 5.61 | 4.5 | ✅ |
| input | card | 3.47 | 3 | ✅ |
| input | background | 3.30 | 3 | ✅ |
| ring | card | 5.06 | 3 | ✅ |
| ring | background | 4.81 | 3 | ✅ |
| ring | primary-soft | 4.22 | 3 | ✅ |
| primary-soft | card | 1.20 | — | ℹ️ פסטל לבד לא נושא מידע |

**שלושה כללים שנובעים מהטבלה:**
- **פסטל לא מסמן לבד.** מצב נבחר, לשונית פעילה ומונה מקבלים גם טקסט עמוק, משקל גופן או סימן.
- **`border` הוא קישוט בלבד.** כל שדה קלט, וכל רכיב אחר שצריך גבול כדי לזהות אותו, משתמש ב-`input`.
- **הכפתור הראשי הוא הזוג הכי קרוב לסף (5.06).** לכן לא מחלישים אותו: לא שקיפות ולא גוון בהיר יותר.

## טיפוגרפיה — Rubik

- **גופן אחד**, `Rubik`, משתנה בין 300 ל-900. במוצר נטען דרך `@fontsource-variable/rubik`, ב-subsets עברית ולטינית.
- **גיבוי:** `system-ui, sans-serif`.

| token | גודל ושורה (px) | משקל | שימוש |
|---|---|---|---|
| `display` | 34 / 42 | 600 | מסכי פתיחה בלבד |
| `h1` | 28 / 36 | 600 | כותרת מסך |
| `h2` | 24 / 32 | 600 | כותרת אזור |
| `h3` | 20 / 28 | 600 | כותרת כרטיס או קבוצה |
| `lead` | 19 / 30 | 400 | פתיח |
| `body` | **17 / 28** | 400 | גוף טקסט, פוסטים |
| `label` | 15 / 22 | 600 | תוויות שדות |
| `small` | 15 / 24 | 400 | טקסט משני, רמזים |
| `caption` | 13 / 20 | 400 | זמן, הקשר, מונים |

- **מינימום 13px.** אין טקסט קטן מזה.
- **ספרות:** מונים, שעות ותאריכים בטבלאות מוצגים ב-`tabular-nums`, כלומר ספרות ברוחב שווה.
- **הדגשה:** 500 לפעולות, 600 לכותרות ולמצב פעיל. לא משתמשים ב-700 ומעלה בממשק.

## ריווח, פינות וצללים

| קבוצה | ערכים |
|---|---|
| ריווח | הסקאלה של Tailwind, עם בסיס של 4px. **קצב:** ריפוד כרטיס 16 במובייל ו-20 בדסקטופ · בין כרטיסים 12 · בין אזורים 24 עד 32 · שוליים בצדי המסך 16 |
| פינות | `sm` 8 לצ'יפ ותג · `md` 12 לשדה, כפתור ואריח · `lg` 16 לכרטיס · `xl` 24 ל-sheet ודיאלוג · `full` ל-avatar, pill ומונה |
| צל `card` | `0 1px 2px rgb(59 47 42 / .05), 0 4px 16px rgb(59 47 42 / .07)` |
| צל `raised` | `0 8px 32px rgb(59 47 42 / .14)`: תפריט, sheet, כפתור "חזרה למעלה" |
| צל `bar` | `0 1px 0 #F1E6DD, 0 2px 10px rgb(59 47 42 / .04)`: Top Bar וניווט תחתון |

## מצבים, מגע ותנועה

| token | ערך |
|---|---|
| focus | טבעת `ring` של 2px, עם מרווח 2px, רק ב-`:focus-visible` |
| hover | משטח עובר ל-`muted`. כפתור ראשי עובר ל-`primary-strong` |
| selected | `primary-soft`, גבול `primary` של 2px, טקסט `primary-strong` ו**סימן ✓** |
| error | גבול `destructive` של 2px, אייקון והודעה, עם `aria-invalid` ו-`aria-describedby` |
| disabled | רק כשאין ברירה. כפתור שליחה לא מנוטרל, ובמקום זה מוצגות שגיאות |
| גודל מגע | **44×44** לכל פעולת מגע ראשית. המינימום המוחלט הוא 24×24 (WCAG 2.5.8) |
| תנועה | `fast` 150ms · `base` 200ms · `slow` 300ms, עם `cubic-bezier(.2,0,0,1)`. ב-`prefers-reduced-motion` אין תזוזה |
| z-index | `base` 0 · `sticky` 10 (Top Bar, ניווט) · `scrolltop` 20 · `drawer` 30 · `popover` 40 · `toast` 50 · `dialog` 60 |
| breakpoints | `sm` 640 · `md` 768 · `lg` 1024. מ-`lg` ומעלה הניווט התחתון עובר ל-rail |
