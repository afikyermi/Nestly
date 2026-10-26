// I9 part 2 on the real Preview (PG-061, AC-187): a Guest opens Welcome and, through the links under its actions, the terms, the privacy
// policy and the accessibility statement. Each page renders from the deployed build with its heading and its "updated" line, and is not
// the placeholder. Static pages: no user is made, no request to the server, no sign-in.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';

const documents = (page: Page) => page.getByRole('navigation', { name: 'מסמכים' });

test('[PG-061 AC-187] a Guest reaches the three public documents from Welcome', async ({ page }) => {
  await page.goto('/');
  for (const name of ['תנאי השימוש', 'מדיניות הפרטיות', 'הצהרת נגישות']) {
    if (new URL(page.url()).pathname !== '/') await page.goto('/');
    await documents(page).getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText(/^עודכן לאחרונה: /)).toBeVisible();
    await expect(page.getByText('המסך הזה ייפתח בקרוב.')).toHaveCount(0);
  }
});
