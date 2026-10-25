// I9 part 1, account deletion: the main flow of the two new screens on a desktop browser (real session source, network stubbed), and the
// Admin home's counter and red bar. Settings → "מחיקת חשבון" (PG-060) → the box and the password (VAL-052; the password is checked with
// Auth as a separate sign-in) → the request → signed out, the login screen gives the date (FR-SET-002) → signing in again holds the session
// on PG-050 → "ביטול המחיקה" → the feed (AC-108). The rules are pgTAP's (file 110) and tests/db/account-deletion.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { APP, pathOf, stubAccountKind } from './app-helpers';
import { runAxe } from './helpers';
import { setupAdmin } from './support/admin-stub';
import { CORS, DESKTOP_1280, EMAIL, NOW, json, session } from './support/journeys-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PASSWORD = 'Zq-7-unique-pw-marker-91';
const DUE_AT = '2026-07-15T12:00:00.000Z';
const DUE_TEXT = '15 ביולי 2026';

interface Net {
  me: 'active' | 'deletion_scheduled';
  /** What POST /api/account/deletion answers next. */
  request: { status: number; body: unknown };
  tokenBodies: string[];
  deletionCalls: Array<{ path: string; body: unknown; authorization: string | undefined }>;
}

async function setup(page: Page, start: Partial<Net> = {}): Promise<Net> {
  const net: Net = { me: 'active', request: { status: 200, body: { status: 'scheduled', dueAt: DUE_AT } }, tokenBodies: [], deletionCalls: [], ...start };
  await page.clock.setFixedTime(NOW);
  await stubAccountKind(page);
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/token')) {
      net.tokenBodies.push(req.postData() ?? '');
      return json(route, 200, session(far));
    }
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, { id: 'u-1', email: EMAIL, app_metadata: { provider: 'email' } });
    return json(route, 404, { error: 'unstubbed' });
  });
  const answer = (path: string, body: (route: Route) => Promise<void>) =>
    page.route(`**/api/${path}`, async (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : body(route)));
  await answer('me', (route) => json(route, 200, net.me === 'active' ? { state: 'active', mustSetPassword: false, recoveryQuestions: 'set' } : { state: 'deletion_scheduled' }));
  await answer('account/deletion', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, 200, net.me === 'deletion_scheduled' ? { status: 'scheduled', dueAt: DUE_AT } : { status: 'none' });
    net.deletionCalls.push({ path: 'request', body: JSON.parse(req.postData() ?? 'null'), authorization: req.headers()['authorization'] });
    if (net.request.status === 200) net.me = 'deletion_scheduled';
    return json(route, net.request.status, net.request.body);
  });
  await answer('account/deletion/cancel', async (route) => {
    net.deletionCalls.push({ path: 'cancel', body: JSON.parse(route.request().postData() ?? 'null'), authorization: route.request().headers()['authorization'] });
    net.me = 'active';
    return json(route, 200, { status: 'none' });
  });
  return net;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

async function openDeletion(page: Page): Promise<void> {
  await page.goto('/settings#account');
  await page.getByRole('link', { name: 'מחיקת חשבון', exact: true }).click();
  await expect.poll(() => pathOf(page)).toBe('/settings/delete-account');
  await expect(page.getByRole('heading', { level: 1, name: 'מחיקת חשבון' })).toBeVisible();
}

test.describe('[I9 FR-SET-002 PG-050 PG-060] account deletion', () => {
  test('[FR-SET-002 VAL-052 PG-050 AC-108] request with the box and the password, signed out with the date, held at PG-050, cancelled', async ({ page }) => {
    const net = await setup(page);
    await signIn(page);
    await openDeletion(page);
    await expect(page.getByRole('heading', { name: 'מה יימחק' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'מה נשאר' })).toBeVisible();
    expect((await runAxe(page, { tags: AXE_TAGS })).violations).toEqual([]);

    // VAL-052: nothing goes out without the box and the password
    const button = page.getByRole('button', { name: 'מחיקת החשבון', exact: true });
    await button.click();
    await expect(page.getByText('יש לסמן את האישור כדי להמשיך')).toBeVisible();
    await expect(page.getByText('יש למלא סיסמה')).toBeVisible();
    expect(net.deletionCalls).toHaveLength(0);
    const tokensBefore = net.tokenBodies.length;

    await page.getByRole('checkbox', { name: /החשבון וכל התוכן יימחקו לצמיתות/ }).check();
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await button.click();

    // FR-SET-002: signed out, and the login screen says when; the password went to Auth only, the request names no account
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByRole('status').filter({ hasText: DUE_TEXT })).toContainText('אפשר להתחבר ולבטל את המחיקה');
    expect(net.tokenBodies.length).toBe(tokensBefore + 1);
    expect(net.tokenBodies.at(-1)).toContain(PASSWORD);
    expect(net.deletionCalls).toEqual([{ path: 'request', body: { confirmed: true }, authorization: 'Bearer e2e-access-token' }]);

    // PG-050: signing in again holds the session on the scheduled-deletion screen; nothing else opens
    await signIn(page);
    await expect.poll(() => pathOf(page)).toBe('/account/scheduled-deletion');
    await expect(page.getByRole('heading', { level: 1, name: 'החשבון שלך מתוזמן למחיקה' })).toBeVisible();
    await expect(page.getByText(`החשבון שלך מתוזמן למחיקה ב-${DUE_TEXT}.`)).toBeVisible();
    expect((await runAxe(page, { tags: AXE_TAGS })).violations).toEqual([]);
    await page.goto('/feed');
    await expect.poll(() => pathOf(page)).toBe('/account/scheduled-deletion');

    // AC-108: the cancel brings the account back
    await page.getByRole('button', { name: 'ביטול המחיקה', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
    expect(net.deletionCalls.at(-1)).toMatchObject({ path: 'cancel', body: {} });
  });

  test('[ERR-026 ERR-048] a Group Owner is told to transfer the ownership; a wrong password sends nothing', async ({ page }) => {
    const net = await setup(page, { request: { status: 409, body: { error: 'group_owner' } } });
    await signIn(page);
    await openDeletion(page);
    await page.getByRole('checkbox', { name: /החשבון וכל התוכן יימחקו לצמיתות/ }).check();
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'מחיקת החשבון', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('להעביר את הבעלות על הקבוצות שלך');
    await expect(page.getByLabel('סיסמה', { exact: true })).toHaveValue('');
    expect(pathOf(page)).toBe('/settings/delete-account');

    // ERR-048: Auth refuses the password; no request reaches the server
    const calls = net.deletionCalls.length;
    await page.route('https://e2e-stub.invalid/auth/v1/token**', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: CORS })
        : json(route, 400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
    );
    await page.getByLabel('סיסמה', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'מחיקת החשבון', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('הסיסמה שגויה');
    expect(net.deletionCalls.length).toBe(calls);
  });

  test('[§16.4] the Admin home counts the waiting deletions and shows a red bar for one past its date', async ({ page }) => {
    await setupAdmin(page, { queue: [], accountDeletions: { pending: 3, overdue: 1 } });
    await page.route('**/api/account/kind', (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { kind: 'staff' })));
    await signIn(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 2, name: 'בית הניהול' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'מחיקת חשבון אחת עברה את מועד הביצוע' })).toBeVisible();
    await expect(page.getByText('מחיקות חשבון ממתינות: 3')).toBeVisible();
  });
});
