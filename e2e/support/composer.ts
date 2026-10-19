// Shared by the feed-composer specs (I3 feed-composer; .work/feed-composer/spec.md and screen.md): sign-in, the feed's locators and the
// composer's. Roles and Hebrew names are screen.md's. The stub plays the server: feed-stub.ts (GET /api/feed), posts-stub.ts (POST /api/posts).
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { pathOf } from '../app-helpers';
import { EMAIL } from './journeys-stub';
import type { FeedNet } from './feed-stub';

export const FAILED = 'הפרסום לא הצליח. אפשר לנסות שוב';
export const PUBLISHED = 'הפוסט פורסם';
export const POST_PATH = /^\/posts\/d0000000-/;

/** Signs in (the landing page's own feed request is not recorded), then opens `path` afresh with the stub recording. */
export async function openFeedAt(page: Page, net: FeedNet, path = '/feed'): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.waitForLoadState('networkidle');
  net.armed = true;
  await page.goto(path);
}

export const composer = (page: Page) => page.getByRole('form', { name: 'כתיבת פוסט' });
export const bodyBox = (page: Page) => page.getByRole('textbox', { name: 'מה תרצו לשתף?' });
export const anonToggle = (page: Page) => page.getByRole('checkbox', { name: 'פרסום אנונימי', exact: true });
export const audienceGroup = (page: Page) => page.getByRole('radiogroup', { name: 'מי יראה את הפוסט', exact: true });
export const publishButton = (page: Page) => page.getByRole('button', { name: 'פרסום', exact: true });
export const feedList = (page: Page) => page.getByRole('feed', { name: 'פוסטים בפיד' });
export const feedCards = (page: Page) => feedList(page).getByRole('article');
export const feedStatus = (page: Page) => page.getByTestId('feed-status');
/** The radio input is visually hidden; its card (the label text) is what a person presses. */
export const choice = (page: Page, name: string) => page.getByRole('radiogroup').getByText(name, { exact: true });
export const timeLinkOf = (card: Locator) => card.locator('a:has(time)');

/** Focus into the text field (a click, as a person does): the options appear after it (feed-composer c2). */
export async function openComposer(page: Page): Promise<void> {
  await bodyBox(page).click();
  await expect(bodyBox(page)).toBeFocused();
  await expect(anonToggle(page)).toBeVisible();
}

/** The browser's leave prompt (c6) asks before a reload with unsent text; a test that means to leave accepts it. */
export function acceptLeave(page: Page): void {
  page.on('dialog', (dialog) => void dialog.accept());
}
