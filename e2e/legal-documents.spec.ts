// I9 part 2, the public documents (PG-061; BR-078, BR-071, NFR-DATA-001, NFR-A11Y-001): the main flow on a desktop browser. A Guest goes
// from Welcome to the terms, from there to the privacy policy and the accessibility statement through the links at each document's end;
// each page states the decided rules and retention it must (AC-187), shows the day it was updated, which is the version a registration
// records (AC-186), has a way back, works by keyboard and has no axe violation. Settings → the three documents: settings-menu.spec.ts (F2.5 c7).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, WELCOME_H1, open, pathOf, stubAccountKind } from './app-helpers';
import type { SessionState } from './app-helpers';
import { DESKTOP } from './helpers';
import { scan } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: DESKTOP });

const UPDATED = 'עודכן לאחרונה: 26 באוקטובר 2026';
const region = (page: Page, name: string) => page.getByRole('main').getByRole('region', { name, exact: true });
const documents = (page: Page) => page.getByRole('navigation', { name: 'מסמכים' });

async function readDocument(page: Page, h1: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
  await expect(page.getByText(UPDATED)).toBeVisible();
  await expect(page.getByText('המסך הזה ייפתח בקרוב.')).toHaveCount(0);
  await scan(page);
}

test.describe('[I9 PG-061 BR-078 NFR-A11Y-001] the public documents', () => {
  test('[AC-186 AC-187 BR-071 BR-068] a Guest reads the terms, the privacy policy and the accessibility statement from Welcome', async ({ page }) => {
    await open(page, '/', 'signed-out');
    await expect(page.getByRole('heading', { level: 1, name: WELCOME_H1 })).toBeVisible();
    await documents(page).getByRole('link', { name: 'תנאי השימוש', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/terms');

    // The terms: the decided rules, not a placeholder
    await readDocument(page, 'תנאי השימוש');
    await expect(region(page, 'מי יכול להשתמש')).toContainText('Nestly מיועדת לבני 18 ומעלה');
    await expect(region(page, 'התוכן שאתם מפרסמים')).toContainText('היא של מי שפרסם אותו');
    await expect(region(page, 'כללי הקהילה')).toContainText('משתפים ניסיון, לא מאבחנים');
    await expect(region(page, 'בעלי מקצוע')).toContainText('Nestly אינה בודקת את ההצהרה');
    await expect(region(page, 'Marketplace')).toContainText('אין רכישה, תשלום או משלוח דרך Nestly');
    await expect(region(page, 'Marketplace')).toContainText('פגה ויורדת מהתצוגה אחרי 60 יום');
    await expect(region(page, 'בעלי מקצוע')).toContainText('או בפנייה על מודעה ב-Marketplace');
    await expect(region(page, 'קידום ותשלומים')).toContainText('מחיר לדוגמה');

    // Keyboard: the way back is the first stop, and the document links are reachable by Tab
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'חזרה', exact: true })).toBeFocused();
    const toPrivacy = documents(page).getByRole('link', { name: 'מדיניות הפרטיות', exact: true });
    await expect(documents(page).getByRole('link', { name: 'תנאי השימוש', exact: true })).toHaveCount(0);
    await toPrivacy.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => pathOf(page)).toBe('/privacy');

    // The privacy policy: children, images, search, retention, deletion, technical logs (BR-078, §13.4, BR-073, decisions §6 and §8)
    await readDocument(page, 'מדיניות הפרטיות');
    await expect(region(page, 'מה נשמר על החשבון')).toContainText('נשמרות רק כ-hash עם מפתח');
    await expect(region(page, 'מה נשמר על החשבון')).toContainText('בכניסה עם Google נלקח רק האימייל');
    await expect(region(page, 'מה נשמר על החשבון')).toContainText('הסיסמה נשמרת רק אצל שירות ההזדהות, ואינה נשמרת אצל Nestly ולא כטקסט גלוי');
    await expect(region(page, 'ילדים ונתוני מעקב')).toContainText('אינם מוצגים למשתמשים שאינם חברים');
    await expect(region(page, 'ילדים ונתוני מעקב')).toContainText('דרך נתוני קידום, ניתוח או פרסום');
    await expect(region(page, 'ילדים ונתוני מעקב')).toContainText('כמגמות כלליות בלבד');
    await expect(region(page, 'תמונות')).toContainText('גם אם הצוות אישר אותן אחר כך');
    await expect(region(page, 'תמונות')).toContainText('ונשמרות לשם כך עד 6 חודשים');
    await expect(region(page, 'תמונות')).toContainText('ונשמרת עד 90 יום מהסימון, גם אם החשבון נמחק בינתיים');
    await expect(region(page, 'תמונות')).toContainText('נשמרת לצמיתות כדי למנוע העלאה חוזרת');
    await expect(region(page, 'תמונות')).toContainText('מיקום ונתוני EXIF או GPS של התמונה אינם נשמרים');
    await expect(region(page, 'שיחות, פוסטים וחיפוש')).toContainText('הנושא נשמר עד 30 יום');
    // Retention is stated as the periods the rules set, never as a deletion that has run (OP-078)
    await expect(page.getByRole('main')).not.toContainText('מתארת את מה שהמערכת עושה היום');
    const retention = region(page, 'תקופות השמירה בחשבון פעיל');
    await expect(retention).toContainText('התראות נשמרות עד 90 יום');
    await expect(retention).toContainText('ודיווחים שטופלו, נשמרים עד 12 חודשים');
    const deletion = region(page, 'מחיקת החשבון');
    await expect(deletion).toContainText('תחת "משתמש שנמחק"');
    await expect(deletion).toContainText('רשומת הכניסה אצל שירות ההזדהות (האימייל, הסיסמה וזהות Google) נמחקת בנפרד');
    await expect(deletion).toContainText('דיווח פתוח על תוכן החשבון מעכב את המחיקה עד הטיפול בו');
    await expect(deletion).toContainText('עותקי תמונות בסט האימון של מודל הבטיחות נשמרים עד תום 6 החודשים שלהם');
    await expect(deletion).toContainText('והטביעה הממוחשבת שלה נשמרת לצמיתות');
    await expect(deletion).not.toContainText('וכל שאר התוכן');
    await expect(region(page, 'גיבויים ורישומים טכניים')).toContainText('נשמרים לזמן קצר לצורכי תפעול ואבטחה');
    await expect(region(page, 'גיבויים ורישומים טכניים')).toContainText('הפעולות האחרונות באתר בלי תוכן, וסוג הדפדפן; שירות הניטור אינו שומר את כתובת ה-IP');

    await documents(page).getByRole('link', { name: 'הצהרת נגישות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/accessibility');

    // The accessibility statement: the standard, what is supported, the known limits and how to report a barrier
    await readDocument(page, 'הצהרת נגישות');
    await expect(page.getByRole('main')).toContainText('WCAG 2.2 ברמה AA');
    await expect(region(page, 'מה נתמך')).toContainText('בתחילת כל מסך שיש בו תפריט');
    await expect(region(page, 'מגבלות ידועות')).toBeVisible();
    await expect(region(page, 'נתקלתם בבעיה?')).toContainText('Support');
    await page.getByRole('link', { name: 'חזרה', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/');
  });

  // AC-187: each account kind and each hold reads the three documents where they are, never sent elsewhere (access.ts DOCUMENT_PATHS)
  const WHO: ReadonlyArray<{ label: string; state: SessionState; kind?: 'regular' | 'professional' | 'staff' }> = [
    { label: 'a Regular account', state: 'signed-in', kind: 'regular' },
    { label: 'a Professional', state: 'signed-in', kind: 'professional' },
    { label: 'a staff account', state: 'signed-in', kind: 'staff' },
    { label: 'an account held on the recovery questions', state: 'signed-in-needs-recovery' },
    { label: 'an account held on the new password', state: 'signed-in-needs-new-password' },
  ];
  for (const who of WHO) {
    test(`[AC-187 PG-061] ${who.label} opens /terms, /privacy and /accessibility`, async ({ page }) => {
      if (who.kind !== undefined) await stubAccountKind(page, who.kind);
      for (const [path, h1] of [['/terms', 'תנאי השימוש'], ['/privacy', 'מדיניות הפרטיות'], ['/accessibility', 'הצהרת נגישות']] as const) {
        await open(page, path, who.state);
        await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
        expect(pathOf(page)).toBe(path);
      }
    });
  }
});
