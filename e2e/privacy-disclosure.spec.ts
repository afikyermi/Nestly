import { expect, test } from '@playwright/test';
import { APP, open, stubAccountKind } from './app-helpers';
import { DESKTOP } from './helpers';
import { scan } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: DESKTOP });

for (const kind of ['guest', 'regular', 'professional', 'staff'] as const) {
  test(`[OP-039 AC-071 NFR-PRIV-005] ${kind} can read usage and paid-data disclosure; keyboard and axe`, async ({ page }) => {
    if (kind !== 'guest') await stubAccountKind(page, kind);
    await open(page, '/privacy', kind === 'guest' ? 'signed-out' : 'signed-in');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'מדיניות הפרטיות', level: 1 })).toBeVisible();
    await expect(main.getByRole('region', { name: 'מדידת השימוש' })).toContainText('בלי תוכן ובלי זיהוי הפרופיל או הפוסט שנצפה');
    await expect(main.getByRole('region', { name: 'צפייה בנתוני השימוש' })).toContainText('בלי שמות, פרטי חשבון');
    await expect(main.getByRole('region', { name: 'מדידת השימוש' })).toContainText('ונשמרים 90 יום');
    // What is kept per viewer is stated, with who sees what and for how long (professional_views, promotion_events).
    const professionals = main.getByRole('region', { name: 'צפיות בבעלי מקצוע' });
    await expect(professionals).toContainText('ספירה יומית לכל חשבון צופה');
    await expect(professionals).toContainText('ואף פעם לא מי צפה');
    await expect(professionals).toContainText('הפירוט נשמר 12 חודשים ואחר כך נמחק');
    await expect(main.getByRole('region', { name: 'נתוני קידום' })).toContainText('ספירה יומית לכל חשבון צופה ולכל קידום');
    await expect(main.getByRole('region', { name: 'נתוני קידום' })).toContainText('רק סיכום חודשי לכל קידום, בלי הצופים');
    await expect(main.getByRole('region', { name: 'נתוני קידום' })).toContainText('בלי זהות הצופים');
    await expect(main.getByRole('region', { name: 'נתוני קידום' })).toContainText('מידע על ילדים ונתוני מעקב אינם משמשים להתאמת קידומים');
    const back = main.getByRole('link', { name: kind === 'guest' ? 'חזרה' : 'חזרה להגדרות', exact: true });
    await expect(back).toHaveAttribute('href', kind === 'guest' ? '/' : '/settings#terms');
    await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await scan(page);
  });
}
