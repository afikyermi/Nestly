// I5 Stories (FR-FEED-008, VAL-042, AC-102): the main flow on a desktop browser, network stubbed. The feed's own stub is
// e2e/support/feed-stub.ts; this file adds GET/POST /api/stories and the upload POST /api/media. The rules (the 10 a day, the check, the
// 24 hours, who sees what) are pgTAP's (93_media_stories.sql) and tests/db/media.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP } from './helpers';
import { CORS, EMAIL, json } from './support/journeys-stub';
import { EMPTY, setupFeed, USER_A, USER_B } from './support/feed-stub';

test.use({ baseURL: APP, viewport: DESKTOP });

const IMAGE = 'd5000000-0000-4000-8000-000000000001';
const STORY = 'd5000000-0000-4000-8000-000000000002';
const OTHER_IMAGE = 'd5000000-0000-4000-8000-000000000003';
// a 4x4 PNG, enough for the browser to decode, shrink and redraw
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4UaEBRwzEcQBTUhaB9UsDXQAAAABJRU5ErkJggg==', 'base64');

interface StoriesNet {
  posted: Array<Record<string, unknown>>;
  uploads: number;
}

async function setupStories(page: Page): Promise<StoriesNet> {
  const net: StoriesNet = { posted: [], uploads: 0 };
  const image = (id: string, state: 'ready' | 'pending') => ({ id, state, url: null, width: 600, height: 800 });
  await page.route('**/api/stories', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'POST') {
      const body: unknown = req.postDataJSON();
      net.posted.push(typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body)) : {});
      return json(route, 201, { id: STORY });
    }
    const other = {
      authorId: USER_B,
      authorName: 'נועה רז',
      isMine: false,
      items: [{ id: 'd5000000-0000-4000-8000-000000000004', caption: 'בוקר טוב מהגן', audience: 'everyone', createdAt: '2026-10-20T08:00:00.000Z', expiresAt: '2026-10-21T08:00:00.000Z', image: image(OTHER_IMAGE, 'ready') }],
    };
    const mine = {
      authorId: USER_A,
      authorName: null,
      isMine: true,
      items: [{ id: STORY, caption: 'הסטורי הראשון', audience: 'friends', createdAt: '2026-10-20T09:00:00.000Z', expiresAt: '2026-10-21T09:00:00.000Z', image: image(IMAGE, 'pending') }],
    };
    return json(route, 200, { groups: net.posted.length === 0 ? [other] : [mine, other], postedToday: net.posted.length });
  });
  await page.route(/\/api\/media\?kind=story$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    net.uploads += 1;
    return json(route, 201, image(IMAGE, 'pending'));
  });
  return net;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test.describe('[I5 FR-FEED-008] Stories', () => {
  test('[FR-FEED-008 AC-102 VAL-042] a Regular watches another\'s Story, then publishes one with a picture, text and the Friends audience', async ({ page }) => {
    const feed = await setupFeed(page, () => EMPTY);
    const net = await setupStories(page);
    await signIn(page);
    feed.armed = true;
    await page.goto('/feed');
    const tray = page.getByRole('region', { name: 'סטורי' });
    await tray.getByRole('button', { name: 'הסטורי של נועה רז' }).click();
    const viewer = page.getByRole('dialog', { name: 'הסטורי של נועה רז' });
    await expect(viewer.getByText('בוקר טוב מהגן')).toBeVisible();
    await viewer.getByRole('button', { name: 'סגירה' }).click();

    await tray.getByRole('button', { name: 'הוספת סטורי' }).click();
    const composer = page.getByRole('dialog', { name: 'סטורי חדש' });
    const chooser = page.waitForEvent('filechooser');
    await composer.getByRole('button', { name: 'בחירת תמונה' }).click();
    await (await chooser).setFiles({ name: 'park.png', mimeType: 'image/png', buffer: PNG });
    await expect.poll(() => net.uploads).toBe(1);
    await composer.getByLabel('טקסט (לא חובה)').fill('הסטורי הראשון');
    await composer.getByRole('radiogroup', { name: 'מי יראה את הסטורי' }).getByText('חברים בלבד', { exact: true }).click(); // the card is what a person presses
    await composer.getByRole('button', { name: 'פרסום' }).click();
    await expect(composer).toHaveCount(0);
    expect(net.posted).toEqual([{ mediaId: IMAGE, caption: 'הסטורי הראשון', audience: 'friends' }]);
    await expect(tray.getByRole('button', { name: 'הסטורי שלי' })).toBeVisible();
  });
});
