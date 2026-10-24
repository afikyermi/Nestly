// The Moderators team (I14; FR-ADMIN-004, FR-ADMIN-007, FR-ADMIN-008, FR-ADMIN-010, AC-044, AC-048, AC-049, AC-071): the main flow of each new
// screen on a desktop browser, network stubbed (e2e/support/admin-stub.ts plus the team endpoints below). The rules are pgTAP's (file 95) and
// tests/db/team.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { CORS, DESKTOP_1280, EMAIL, json } from './support/journeys-stub';
import { ID, setupAdmin, type Net } from './support/admin-stub';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';
const ALL_KEYS = [
  'SUPPORT_VIEW',
  'SUPPORT_HANDLE',
  'REPORTS_VIEW',
  'CONTENT_MODERATE',
  'MARKETPLACE_MODERATE',
  'USER_VIEW',
  'USER_WARN',
  'USER_SUSPEND',
  'USER_BAN',
  'ANALYTICS_VIEW',
  'AUDIT_LOG_VIEW',
  'COMMUNITY_CONFIG',
  'SYSTEM_ANNOUNCEMENTS',
  'PRIVATE_GROUP_MODERATE',
];
const MOD = ID(70);
const CODE = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE'.slice(0, 43);

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

interface TeamNet {
  sent: Array<{ method: string; path: string; body: unknown }>;
}

/** The team endpoints, registered after the admin stub (later routes win). */
async function stubTeam(page: Page): Promise<TeamNet> {
  const net: TeamNet = { sent: [] };
  let keys: string[] = ['REPORTS_VIEW'];
  const announcements: Array<Record<string, unknown>> = [];
  const reasons = [
    {
      key: 'child_safety',
      label: 'תוכן שמסכן ילד',
      priority: 1,
      sortOrder: 10,
      isActive: true,
      isCore: true,
    },
    {
      key: 'spam',
      label: 'ספאם או פרסום לא קשור',
      priority: 4,
      sortOrder: 70,
      isActive: true,
      isCore: false,
    },
  ];
  const record = (route: Route): void => {
    const req = route.request();
    const raw = req.postData();
    net.sent.push({
      method: req.method(),
      path: new URL(req.url()).pathname,
      body: raw === null ? null : JSON.parse(raw),
    });
  };
  await page.route('**/api/admin/inbox', (route) => json(route, 200, { openReports: 2 }));
  await page.route('**/api/admin/team**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    record(route);
    const path = new URL(req.url()).pathname;
    if (req.method() === 'GET') {
      return json(route, 200, {
        moderators: [
          {
            userId: MOD,
            label: 'נועה לוי',
            status: 'active',
            permissions: keys,
            joinedAt: '2026-06-10T09:00:00.000Z',
          },
        ],
        invitations: [],
      });
    }
    if (path.endsWith('/invitations'))
      return json(route, 201, {
        id: ID(71),
        code: CODE,
        expiresAt: '2026-06-22T09:00:00.000Z',
      });
    if (path.endsWith('/permissions')) {
      const body: unknown = req.postDataJSON();
      const sentKeys: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'permissions') : [];
      keys = Array.isArray(sentKeys) ? sentKeys.map(String) : keys;
      return json(route, 200, {});
    }
    return json(route, 200, {});
  });
  await page.route('**/api/admin/announcements**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    record(route);
    const path = new URL(req.url()).pathname;
    if (req.method() === 'GET') return json(route, 200, { items: announcements });
    const body: unknown = req.postDataJSON();
    const field = (name: string) => (typeof body === 'object' && body !== null ? String(Reflect.get(body, name)) : '');
    if (path === '/api/admin/announcements') {
      const item = {
        id: ID(80),
        title: field('title'),
        body: field('body'),
        status: 'draft',
        createdAt: '2026-06-15T09:00:00.000Z',
        updatedAt: '2026-06-15T09:00:00.000Z',
        publishedAt: null,
      };
      announcements.unshift(item);
      return json(route, 201, item);
    }
    if (path.endsWith('/status')) {
      const item = {
        ...announcements[0],
        status: field('status'),
        publishedAt: '2026-06-15T09:05:00.000Z',
      };
      announcements[0] = item;
      return json(route, 200, item);
    }
    return json(route, 200, announcements[0]);
  });
  await page.route('**/api/admin/report-reasons**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    record(route);
    if (req.method() === 'GET') return json(route, 200, { items: reasons });
    const body: unknown = req.postDataJSON();
    const field = (name: string): unknown => (typeof body === 'object' && body !== null ? Reflect.get(body, name) : undefined);
    if (req.method() === 'POST')
      return json(route, 201, {
        key: 'custom_0a1b2c3d',
        label: String(field('label')),
        priority: Number(field('priority')),
        sortOrder: Number(field('sortOrder')),
        isActive: true,
        isCore: false,
      });
    return json(route, 200, {
      ...reasons[1],
      label: String(field('label')),
      priority: Number(field('priority')),
      sortOrder: Number(field('sortOrder')),
      isActive: field('isActive') === true,
    });
  });
  await page.route('**/api/admin/analytics**', async (route) => {
    record(route);
    const days = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-06-${String(9 + i).padStart(2, '0')}`,
      count: i,
    }));
    return json(route, 200, {
      days: 7,
      accounts: {
        byType: { regular: 120, professional: 8, moderator: 2, admin: 1 },
        byStatus: { active: 128, suspended: 2, banned: 1 },
        registrations: days.map((d) => ({
          day: d.day,
          regular: d.count,
          professional: 0,
        })),
      },
      content: {
        posts: days,
        comments: days,
        likes: days,
        postsPerAuthor: [
          { bucket: '1', accounts: 10 },
          { bucket: '2-5', accounts: 4 },
          { bucket: '6-20', accounts: 1 },
          { bucket: '21+', accounts: 0 },
        ],
      },
      friendships: { requested: 30, accepted: 21 },
      moderation: {
        reports: days,
        byReason: [{ label: 'ספאם או פרסום לא קשור', count: 3 }],
        open: 2,
        actionTaken: 5,
        dismissed: 1,
        medianHoursToClose: 3.5,
        enforcements: { warning: 2, suspension: 1, ban: 0 },
      },
      support: {
        requests: days,
        byTopic: [{ topic: 'bug', count: 4 }],
        byStatus: { open: 1, inProgress: 2, closed: 3 },
        answered: 5,
        medianHoursToFirstReply: 1.5,
      },
      groups: { active: { public: 3, private: 1 }, created: 1, publicMembers: 12, publicJoins: 4, publicPosts: 6, publicComments: 9 },
      professionals: { active: 2, byField: [{ field: 'doula', count: 2 }], follows: 5, chatStarts: 3, reviews: 1 },
      marketplace: { active: 4, byCategory: [{ category: 'strollers', count: 4 }], created: 2, sold: 1, chats: 2 },
      usage: { dailyLogins: days, profileViews: days, postViews: days },
      promotions: { running: { profile: 2, post: 1, listing: 3 }, purchases: days, impressions: days, clicks: days, sampleRevenueIls: 147 },
    });
  });
  return net;
}

async function openAdmin(page: Page, tab: string, start: Partial<Net> = {}): Promise<TeamNet> {
  await setupAdmin(page, { role: 'admin', permissions: ALL_KEYS, ...start });
  const net = await stubTeam(page);
  await signIn(page);
  await page.goto('/admin');
  await page.getByRole('navigation', { name: 'מסכי הניהול' }).getByRole('link', { name: tab, exact: true }).click();
  return net;
}

test.describe('[I14] the Moderators team', () => {
  test('[I14 FR-ADMIN-004 AC-044] the Admin opens "צוות": the reports tab shows what waits, a key is added with its base and saved, an invitation link is made once', async ({
    page,
  }) => {
    const net = await openAdmin(page, 'צוות');
    await expect.poll(() => pathOf(page)).toBe('/admin/team');
    await expect(page.getByRole('navigation', { name: 'מסכי הניהול' }).getByRole('link', { name: /דיווחים/ })).toContainText('2 ממתינים');
    const card = page.getByRole('article', { name: 'נועה לוי' });
    await expect(card).toBeVisible();
    await card.getByRole('checkbox', { name: 'אזהרת משתמש' }).check();
    await expect(card.getByRole('checkbox', { name: 'צפייה במשתמשים' }), 'BR-028: the base key comes with it').toBeChecked();
    await card.getByRole('button', { name: 'שמירת ההרשאות' }).click();
    await expect(card.getByRole('status').filter({ hasText: 'ההרשאות נשמרו' })).toBeVisible();
    expect(net.sent.find((s) => s.path.endsWith('/permissions'))?.body).toEqual({ permissions: ['REPORTS_VIEW', 'USER_VIEW', 'USER_WARN'] });
    await page.getByRole('textbox', { name: 'למי ההזמנה' }).fill('דנה כהן');
    await page.getByRole('button', { name: 'יצירת הזמנה' }).click();
    await expect(page.getByRole('textbox', { name: 'קישור ההזמנה' })).toHaveValue(new RegExp(`/team/join#${CODE}$`));
    expect(net.sent.find((s) => s.path === '/api/admin/team/invitations')?.body).toEqual({ note: 'דנה כהן' });
  });

  test('[I14 FR-ADMIN-008 AC-049] "הודעות מערכת": a draft is created and published', async ({ page }) => {
    const net = await openAdmin(page, 'הודעות מערכת');
    await expect.poll(() => pathOf(page)).toBe('/admin/announcements');
    await page.getByRole('textbox', { name: 'כותרת' }).fill('תחזוקה מתוכננת');
    await page.getByRole('textbox', { name: 'תוכן ההודעה' }).fill('האתר ייסגר לשעה ביום שישי');
    await page.getByRole('button', { name: 'שמירה כטיוטה' }).click();
    const card = page.getByRole('article', { name: 'תחזוקה מתוכננת' });
    await expect(card).toContainText('טיוטה');
    await card.getByRole('button', { name: 'פרסום', exact: true }).click();
    await expect(card).toContainText('מפורסמת');
    expect(net.sent.filter((s) => s.method === 'POST').map((s) => s.body)).toEqual([
      { title: 'תחזוקה מתוכננת', body: 'האתר ייסגר לשעה ביום שישי' },
      { status: 'published' },
    ]);
  });

  test('[I14 FR-ADMIN-007 AC-048] "הגדרות קהילה": a reason is switched off and saved, and a new one is added', async ({ page }) => {
    const net = await openAdmin(page, 'הגדרות קהילה');
    await expect.poll(() => pathOf(page)).toBe('/admin/community');
    const spam = page.getByRole('group', { name: 'ספאם או פרסום לא קשור' });
    await spam.getByRole('checkbox', { name: 'פעילה בחלון הדיווח' }).uncheck();
    await spam.getByRole('button', { name: 'שמירה' }).click();
    await expect(spam.getByRole('status').filter({ hasText: 'הסיבה נשמרה' })).toBeVisible();
    expect(net.sent.find((s) => s.method === 'PATCH')).toMatchObject({
      path: '/api/admin/report-reasons/spam',
      body: {
        label: 'ספאם או פרסום לא קשור',
        priority: 4,
        sortOrder: 70,
        isActive: false,
      },
    });
    await expect(
      page.getByRole('group', { name: 'תוכן שמסכן ילד' }).getByRole('checkbox', { name: 'פעילה בחלון הדיווח' }),
      'a core reason stays on',
    ).toBeDisabled();
    await page.getByRole('textbox', { name: 'שם הסיבה' }).last().fill('הונאה');
    await page.getByRole('button', { name: 'הוספת הסיבה' }).click();
    await expect(page.getByText('הסיבה נוספה')).toBeVisible();
  });

  test('[I14 FR-ADMIN-010 AC-071 BR-058] "נתונים": numbers per period, no names', async ({ page }) => {
    const net = await openAdmin(page, 'נתונים');
    await expect.poll(() => pathOf(page)).toBe('/admin/analytics');
    await expect(page.getByRole('heading', { level: 3, name: 'חשבונות' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'פוסטים ליום' })).toBeVisible();
    await expect(page.getByText('זמן טיפול חציוני (שעות)')).toBeVisible();
    // SRS audit 21.10: Groups, Professionals and Marketplace are measured, not "not yet measured"
    for (const name of ['קבוצות', 'בעלי מקצוע', 'Marketplace']) await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    await expect(page.getByText('חשבונות מקצועיים פעילים', { exact: true })).toBeVisible();
    await expect(page.getByText('מודעות מוצגות עכשיו', { exact: true })).toBeVisible();
    // I13 (OP-039, AC-071): usage by day, and the Admin's Promotions domain
    for (const name of ['שימוש', 'קידום']) await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'חשבונות שנכנסו' })).toBeVisible();
    await expect(page.getByText('קידומי מודעה פעילים', { exact: true })).toBeVisible();
    await page.getByLabel('תקופה').selectOption('7');
    await expect.poll(() => net.sent.filter((s) => s.path === '/api/admin/analytics').length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('[I14 FR-ADMIN-004] joining with an invitation', () => {
  test('[I14 FR-ADMIN-004 BR-023] the invited person creates a staff account, redeems the code once and lands in its "my work" with no key yet', async ({
    page,
  }) => {
    let joined = false;
    const sentJoin: unknown[] = [];
    const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
    await page.addInitScript(() => {
      Reflect.set(window, 'nestlyRealSession', true);
    });
    const signed = {
      access_token: 'e2e-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: far,
      refresh_token: 'e2e-refresh',
      user: {
        id: 'f0000000-0000-4000-8000-0000000000f1',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'staff@example.com',
        identities: [
          {
            identity_id: 'f0000000-0000-4000-8000-0000000000f2',
            id: 'f0000000-0000-4000-8000-0000000000f1',
            provider: 'email',
          },
        ],
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-06-15T10:00:00Z',
      },
    };
    await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (req.url().includes('/signup') || req.url().includes('/token')) return json(route, 200, signed);
      if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, signed.user);
      return json(route, 404, { error: 'unstubbed' });
    });
    await page.route('**/api/me', (route) =>
      json(
        route,
        200,
        joined
          ? {
              state: 'active',
              recoveryQuestions: 'set',
              mustSetPassword: false,
            }
          : { state: 'unregistered' },
      ),
    );
    await page.route('**/api/team/join', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      sentJoin.push(route.request().postDataJSON());
      joined = true;
      return json(route, 201, {});
    });
    await page.route('**/api/admin/access', (route) => json(route, 200, { staff: true, role: 'moderator', permissions: [] }));
    await page.route('**/api/admin/inbox', (route) => json(route, 200, {}));
    await page.route('**/api/profile', (route) => json(route, 404, { error: 'not_found' }));
    await page.goto(`/team/join#${CODE}`);
    await expect(page.getByRole('heading', { level: 1, name: 'הצטרפות לצוות Nestly' })).toBeVisible();
    await page.getByRole('textbox', { name: 'אימייל' }).fill('staff@example.com');
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'יצירת חשבון צוות' }).click();
    await expect.poll(() => pathOf(page)).toBe('/admin');
    expect(sentJoin).toEqual([{ code: CODE }]);
    await expect(page.getByRole('heading', { level: 2, name: 'העבודה שלי' })).toBeVisible(); // I14c: its "my work" (no key yet)
  });
});
