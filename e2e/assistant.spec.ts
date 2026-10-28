// The Nestly assistant (Afik 28.10.2026; FR-AI-001, PG-062, BR-093, ERR-055, AC-211..AC-214). Real browser, real session source, network stubbed:
// no request reaches Google. The main flow on desktop: the bubble at the bottom right, the window with the privacy note at the top and the
// "not medical advice" line with its link at the bottom, an example question sent and answered with only the typed text and earlier messages
// in the body, the urgent banner from the typed words alone, "unavailable" when the service fails, and the medical hotlines link.
import { expect, test, type Page, type Route } from '@playwright/test';
import { APP, pathOf, stubAccountKind } from './app-helpers';
import { CORS, DESKTOP_1280, EMAIL, json, scan } from './support/journeys-stub';
import { pageOf, range, setupFeed, type FeedNet } from './support/feed-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const BUBBLE = 'פתיחת העוזר של Nestly';
const WINDOW = 'העוזר של Nestly';
const PRIVACY = 'ההודעות נשלחות לשירות של Google לעיבוד. לא נשלח מידע מהחשבון שלכם.';
const UNAVAILABLE = 'העוזר לא זמין כרגע. אפשר לנסות שוב בעוד כמה דקות';

interface AssistantNet {
  bodies: unknown[];
  answer: (n: number) => { status: number; body: unknown };
  available: boolean;
}

async function setupAssistant(page: Page): Promise<AssistantNet> {
  await stubAccountKind(page);
  const net: AssistantNet = { bodies: [], answer: () => ({ status: 200, body: { answer: 'תשובה כללית מהעוזר.' } }), available: true };
  await page.route(/\/api\/assistant$/, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return json(route, 200, { available: net.available });
    const body: unknown = req.postDataJSON();
    net.bodies.push(body);
    const out = net.answer(net.bodies.length);
    return json(route, out.status, out.body);
  });
  return net;
}

async function signIn(page: Page, net: FeedNet): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill('Zq-7-unique-pw-marker-91');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).toBe('/feed');
  await page.waitForLoadState('networkidle');
  net.armed = true;
}

const window_ = (page: Page) => page.getByRole('dialog', { name: WINDOW });

test.describe('[FR-AI-001 AC-211] the assistant', () => {
  test('[AC-211 AC-212 NFR-PRIV-008] the bubble at the bottom right opens the window; an example question is answered; only the conversation is sent; axe', async ({ page }) => {
    const feed = await setupFeed(page, () => pageOf(range(1, 2), null));
    const net = await setupAssistant(page);
    await signIn(page, feed);
    const bubble = page.getByRole('button', { name: BUBBLE, exact: true });
    await expect(bubble).toBeVisible();
    const box = await bubble.boundingBox();
    const viewport = page.viewportSize();
    expect(box !== null && viewport !== null && box.x + box.width > viewport.width - 120 && box.y + box.height > viewport.height - 120, 'bottom right corner').toBe(true);

    await bubble.click();
    const dialog = window_(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(PRIVACY)).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'מוקדי רפואה', exact: true })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'הודעה לעוזר' })).toBeFocused();
    await scan(page);

    await dialog.getByRole('button', { name: 'מה כדאי לדעת לפני שמתחילים לנסות להיכנס להריון?' }).click();
    await expect(dialog.getByTestId('assistant-answer')).toHaveText(/תשובה כללית מהעוזר/);
    await dialog.getByRole('textbox', { name: 'הודעה לעוזר' }).fill('ומה לגבי חומצה פולית?');
    await dialog.getByRole('button', { name: 'שליחה לעוזר' }).click();
    await expect(dialog.getByTestId('assistant-answer')).toHaveCount(2);
    expect(net.bodies).toEqual([
      { text: 'מה כדאי לדעת לפני שמתחילים לנסות להיכנס להריון?', history: [] },
      {
        text: 'ומה לגבי חומצה פולית?',
        history: [
          { role: 'user', text: 'מה כדאי לדעת לפני שמתחילים לנסות להיכנס להריון?' },
          { role: 'assistant', text: 'תשובה כללית מהעוזר.' },
        ],
      },
    ]);

    // The conversation stays while the window is closed (Escape), and is gone after a refresh (nothing is saved).
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(bubble).toBeFocused();
    await bubble.click();
    await expect(window_(page).getByTestId('assistant-answer')).toHaveCount(2);
  });

  test('[BR-093 AC-213 ERR-055] an urgent message shows the banner even when the service fails; its link opens the medical hotlines', async ({ page }) => {
    const feed = await setupFeed(page, () => pageOf(range(1, 2), null));
    const net = await setupAssistant(page);
    net.answer = () => ({ status: 503, body: { error: 'unavailable' } });
    await signIn(page, feed);
    await page.getByRole('button', { name: BUBBLE, exact: true }).click();
    const dialog = window_(page);
    await dialog.getByRole('textbox', { name: 'הודעה לעוזר' }).fill('התינוק לא נושם טוב וחום גבוה');
    await dialog.getByRole('button', { name: 'שליחה לעוזר' }).click();
    await expect(dialog.getByTestId('assistant-urgent')).toBeVisible();
    await expect(dialog.getByTestId('assistant-notice')).toHaveText(UNAVAILABLE);
    await dialog.getByTestId('assistant-urgent').getByRole('link').click();
    await expect.poll(() => pathOf(page)).toBe('/medical-hotlines');
    await expect(window_(page)).toHaveCount(0);
  });

  test('[ERR-055 AC-214 VAL-053] without the service key the window says unavailable; a message over 1,000 characters is not sent', async ({ page }) => {
    const feed = await setupFeed(page, () => pageOf(range(1, 2), null));
    const net = await setupAssistant(page);
    await signIn(page, feed);
    await page.getByRole('button', { name: BUBBLE, exact: true }).click();
    const dialog = window_(page);
    await dialog.getByRole('textbox', { name: 'הודעה לעוזר' }).fill('א'.repeat(1001));
    await dialog.getByRole('button', { name: 'שליחה לעוזר' }).click();
    await expect(dialog.getByText('אפשר לכתוב עד 1,000 תווים בהודעה.')).toBeVisible();
    expect(net.bodies).toEqual([]);
    await page.keyboard.press('Escape');

    await page.reload();
    net.available = false;
    await page.getByRole('button', { name: BUBBLE, exact: true }).click();
    await expect(window_(page).getByTestId('assistant-unavailable')).toHaveText(UNAVAILABLE);
    await expect(window_(page).getByRole('textbox', { name: 'הודעה לעוזר' })).toHaveCount(0);
  });
});
