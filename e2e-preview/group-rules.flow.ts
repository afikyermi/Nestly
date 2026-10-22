// I10 completion C on the real Preview (Afik 21.10.2026, decisions-in-force §11.13-11.17; e2e-preview/README.md "the main flow"):
//   1. An Owner creates a Public Group; two members join; one posts. Likes and a comment by others reach the threshold (three members: 3),
//      and the other member sees the post in the main feed, labelled "מתוך: <name>"; a post that is not a Highlight stays on the Group page.
//   2. The Owner makes a member Group Moderator, who warns and mutes the other member (a reason, 7 days): that member sees the notice and
//      the read-only banner, has no composer, and the server refuses a post. Then remove + block and unblock.
//   3. A Private Group: a member's invitation of a Friend waits for the Owner, who approves it on the management tab; then the Friend sees it.
// Every user is fresh (the cleanup sweep's email pattern). No recovery attempts are made.
import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { createBypassRouteHandler } from './support/bypass.ts';
import { expect, test } from './support/fixtures.ts';
import { generateTestUser, type TestUser } from './support/test-user.ts';

const main = (page: Page) => page.getByRole('main');
const newUser = (): TestUser => generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');

/** Six random Hebrew letters, so this run's people and Groups are found by name and nobody else's. */
function unique(): string {
  const letters = 'אבגדהוזחטיכלמנסעפצקרשת';
  return [...randomBytes(6)].map((b) => letters[b % letters.length]).join('');
}

/** Signs a fresh Regular up through the app and returns the Authorization header of its first request. */
async function signUp(page: Page, fullName: string): Promise<string> {
  const u = newUser();
  await page.goto('/register');
  await page.getByRole('group', { name: 'השלב במסע', exact: true }).locator('label').filter({ hasText: /מתכננים/ }).click();
  await page.getByLabel(/^שם מלא/).fill(fullName);
  await page.getByRole('button', { name: 'המשך', exact: true }).click();
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(u.email);
  await page.getByLabel('סיסמה', { exact: true }).fill(u.password);
  const box = page.getByRole('checkbox', { name: /אישור תנאי השימוש/ });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery-questions$/, { timeout: 30_000 });
  await page.getByLabel(/חיית המחמד/).fill(u.answers.pet);
  await page.getByLabel(/כינו אתכם/).fill(u.answers.nickname);
  const bell = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/notifications' && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page).toHaveURL(/\/(feed|home)$/, { timeout: 30_000 });
  const authorization = (await (await bell).request().headerValue('authorization')) ?? '';
  expect(authorization).toMatch(/^Bearer /);
  return authorization;
}

/** One API call from the page with the user's Authorization header (through the deployment, as Vercel rewrites it). */
async function api(page: Page, authorization: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: unknown }> {
  const answer = await page.evaluate(
    async ({ auth, url, method, body }) => {
      const headers: Record<string, string> = { authorization: auth };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: r.status, text: await r.text() };
    },
    { auth: authorization, url: path, method: init.method ?? 'GET', body: init.body },
  );
  const parsed: unknown = answer.text === '' ? null : JSON.parse(answer.text);
  return { status: answer.status, body: parsed };
}

const field = (value: unknown, key: string): unknown => (typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined);
const list = (value: unknown, key: string): unknown[] => {
  const items = field(value, key);
  return Array.isArray(items) ? items : [];
};

/** The id of the one person called `name` in People Search. */
async function personId(page: Page, authorization: string, name: string): Promise<string> {
  const found = await api(page, authorization, '/api/search', { method: 'POST', body: { q: name, type: 'people' } });
  const person = list(found.body, 'people').find((p) => field(p, 'fullName') === name);
  const id = field(person, 'userId');
  if (typeof id !== 'string') throw new Error('person not found');
  return id;
}

test('[FR-GRP-001 FR-GRP-002 FR-GRP-003 FR-ALG-010 AC-038 AC-066 §11.13-11.17] Group Highlights in the feed, warning + mute, invitations with approval', async ({
  page,
  browser,
  baseURL,
  bypassSecret,
}) => {
  // a slow Preview: five sign-ups and many round trips
  test.setTimeout(300_000);
  if (baseURL === undefined) throw new Error('preview-e2e: no baseURL');
  const origin = new URL(baseURL).origin;
  const contexts: BrowserContext[] = [];
  const open = async (): Promise<Page> => {
    const context = await browser.newContext({ baseURL });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    contexts.push(context);
    return context.newPage();
  };
  try {
    const family = unique();
    const ownerName = `רינה ${family}`;
    const bName = `אבי ${family}`;
    const cName = `חן ${family}`;
    const groupName = `שכונה ${family}`;

    // 1. The Owner creates a Public Group through the Groups page
    const ownerAuth = await signUp(page, ownerName);
    await page.goto('/groups');
    await main(page).getByRole('button', { name: 'יצירת קבוצה' }).click();
    const sheet = page.getByRole('dialog', { name: 'קבוצה חדשה' });
    await sheet.getByLabel('שם הקבוצה').fill(groupName);
    await sheet.getByText('קבוצה ציבורית', { exact: true }).click();
    await sheet.getByRole('button', { name: 'יצירה' }).click();
    await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const groupId = new URL(page.url()).pathname.split('/').pop() ?? '';

    // two members join through the Group page; one posts in its discussion
    const bPage = await open();
    const bAuth = await signUp(bPage, bName);
    const cPage = await open();
    const cAuth = await signUp(cPage, cName);
    for (const p of [bPage, cPage]) {
      await p.goto(`/groups/${groupId}`);
      await main(p).getByRole('button', { name: 'הצטרפות', exact: true }).click();
      await expect(main(p).getByText(/חברים בקבוצה · חבר$/)).toBeVisible({ timeout: 20_000 });
    }
    const text = `שאלה טובה ${family}`;
    await main(bPage).getByRole('textbox', { name: /מה/ }).first().fill(text);
    const [created] = await Promise.all([
      bPage.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/posts'),
      main(bPage).getByRole('button', { name: 'פרסום', exact: true }).click(),
    ]);
    expect(created.status()).toBe(201);
    const postId = String(field(await created.json(), 'id'));
    const quiet = await api(page, ownerAuth, '/api/posts', { method: 'POST', body: { body: `רגיל ${family}`, audience: 'everyone', groupId } });
    expect(quiet.status).toBe(201);

    // likes and a comment by others reach the threshold (3 for three members)
    expect((await api(page, ownerAuth, `/api/posts/${postId}/like`, { method: 'PUT' })).status).toBeLessThan(300);
    expect((await api(cPage, cAuth, `/api/posts/${postId}/like`, { method: 'PUT' })).status).toBeLessThan(300);
    expect((await api(page, ownerAuth, `/api/posts/${postId}/comments`, { method: 'POST', body: { body: 'כל הכבוד' } })).status).toBe(201);

    // the other member sees it in the main feed with "מתוך: <name>"; the plain post is only on the Group page
    await cPage.goto('/feed');
    const card = main(cPage).getByRole('article').filter({ hasText: text });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('link', { name: `מתוך: ${groupName}` })).toHaveAttribute('href', `/groups/${groupId}`);
    await expect(main(cPage).getByText(`רגיל ${family}`)).toHaveCount(0);

    // 2. The Owner makes B a Group Moderator; B warns and mutes C for 7 days
    const cId = await personId(page, ownerAuth, cName);
    const bId = await personId(page, ownerAuth, bName);
    expect((await api(page, ownerAuth, `/api/groups/${groupId}/members/${bId}`, { method: 'PATCH', body: { role: 'moderator' } })).status).toBe(200);
    await bPage.goto(`/groups/${groupId}`);
    await main(bPage).getByRole('tab', { name: 'חברים' }).click();
    await main(bPage).getByRole('button', { name: `פעולות על ${cName}` }).click();
    await bPage.getByRole('menuitem', { name: 'אזהרה והשתקה' }).click();
    const warn = bPage.getByRole('dialog', { name: new RegExp(`אזהרה והשתקה: ${cName}`) });
    await warn.getByText('ספאם או פרסום', { exact: true }).click();
    await warn.getByText('7 ימים', { exact: true }).click();
    await warn.getByRole('button', { name: 'שליחת אזהרה והשתקה' }).click();
    await expect(warn).toBeHidden();

    // C sees the notice and reads only
    await cPage.goto('/notifications');
    await expect(main(cPage).getByText(`קיבלת אזהרה בקבוצה ${groupName}. בינתיים אפשר רק לקרוא`)).toBeVisible();
    await cPage.goto(`/groups/${groupId}`);
    await expect(main(cPage).getByRole('note')).toContainText('קיבלת אזהרה בקבוצה הזו (ספאם או פרסום)');
    await expect(main(cPage).getByRole('button', { name: 'פרסום', exact: true })).toHaveCount(0);
    expect((await api(cPage, cAuth, '/api/posts', { method: 'POST', body: { body: 'מושתק', audience: 'everyone', groupId } })).status).toBe(403);

    // remove + block, then unblock
    expect((await api(bPage, bAuth, `/api/groups/${groupId}/enforcements`, { method: 'POST', body: { userId: cId, kind: 'remove_block', reason: 'spam' } })).status).toBe(204);
    expect(field((await api(cPage, cAuth, `/api/groups/${groupId}`)).body, 'state')).toBe('blocked');
    expect((await api(bPage, bAuth, `/api/groups/${groupId}/bans/${cId}`, { method: 'DELETE' })).status).toBe(204);
    expect(field((await api(cPage, cAuth, `/api/groups/${groupId}`)).body, 'state')).toBe('none');

    // 3. A Private Group: B (a member) invites C (a Friend); it waits for the Owner, who approves it on the management tab
    const priv = await api(page, ownerAuth, '/api/groups', { method: 'POST', body: { name: `מעגל ${family}`, privacy: 'private' } });
    const privId = String(field(priv.body, 'id'));
    expect((await api(bPage, bAuth, `/api/groups/${privId}/membership`, { method: 'PUT' })).status).toBe(200);
    expect((await api(page, ownerAuth, `/api/groups/${privId}/requests/${bId}`, { method: 'PUT', body: { decision: 'approve' } })).status).toBe(204);
    expect((await api(bPage, bAuth, '/api/friend-requests', { method: 'POST', body: { targetUserId: cId } })).status).toBe(201);
    expect((await api(cPage, cAuth, `/api/friend-requests/${bId}/accept`, { method: 'POST' })).status).toBe(200);
    const sent = await api(bPage, bAuth, `/api/groups/${privId}/invitations`, { method: 'POST', body: { userId: cId } });
    expect([sent.status, field(sent.body, 'status')]).toEqual([200, 'awaiting_approval']);
    expect(list((await api(cPage, cAuth, '/api/group-invitations')).body, 'invitations').some((i) => field(field(i, 'group'), 'id') === privId)).toBe(false);
    await page.goto(`/groups/${privId}`);
    await main(page).getByRole('tab', { name: 'ניהול' }).click();
    const queue = main(page).getByRole('region', { name: 'הזמנות שמחכות לאישור' });
    await expect(queue.getByText(`${cName}, בהזמנה של ${bName}`)).toBeVisible();
    await queue.getByRole('button', { name: 'אישור' }).click();
    await expect(queue.getByText('אין הזמנות שמחכות')).toBeVisible();
    await cPage.goto('/groups');
    await expect(main(cPage).getByText(`מעגל ${family}`).first()).toBeVisible();
    expect(list((await api(cPage, cAuth, '/api/group-invitations')).body, 'invitations').some((i) => field(field(i, 'group'), 'id') === privId)).toBe(true);
  } finally {
    for (const context of contexts) await context.close();
  }
});
