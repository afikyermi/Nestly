// Chat and Support (I8; FR-CHAT-001..004, FR-ADMIN-001/002, FR-SERV-009; Afik's decisions of 20.10.2026, §9): the main flow of each new screen on a
// desktop browser, network stubbed (e2e/support/chat-stub.ts). The rules (who reads and writes, the limits, blocks, the audit) are pgTAP's (file 94)
// and tests/db/chat.db.test.ts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { DESKTOP_1280, EMAIL, main } from './support/journeys-stub';
import { CONV, SUP, setupChat } from './support/chat-stub';
import { choose, sendButton, sheet } from './support/report-ui';

test.use({ baseURL: APP, viewport: DESKTOP_1280 });

const PASSWORD = 'Zq-7-unique-pw-marker-91';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
}

test.describe('[I8 FR-CHAT-001 FR-CHAT-003] the Chat Center', () => {
  test('[AC-045 AC-051] the Top Bar shows the unread badge; the dropdown leads to the Chat Center, where accepting a request opens the conversation', async ({ page }) => {
    const net = await setupChat(page);
    await signIn(page);
    const button = page.getByRole('banner').getByRole('button', { name: 'הודעות, 2 חדשות' });
    await expect(button).toBeVisible();
    await button.click();
    const dropdown = page.getByRole('dialog', { name: 'שיחות אחרונות' });
    await expect(dropdown).toContainText('Support');
    await dropdown.getByRole('link', { name: 'כל ההודעות' }).click();
    await expect.poll(() => pathOf(page)).toBe('/chat');
    await expect(main(page).getByRole('heading', { level: 1, name: 'הודעות' })).toBeVisible();
    const requests = main(page).getByRole('list', { name: 'בקשות שיחה שממתינות לך' });
    await expect(requests).toContainText('דנה כהן');
    await expect(requests).toContainText('היי, ראיתי את הפוסט שלך');
    await requests.getByRole('button', { name: /^אישור/ }).click();
    await expect.poll(() => pathOf(page)).toBe(`/chat/${CONV}`);
    expect(net.sent.map((s) => `${s.method} ${s.path}`)).toContain(`POST /api/chat/requests/${'c8000000-0000-4000-8000-000000000020'}/accept`);
  });
});

test.describe('[I8 FR-CHAT-001 FR-SERV-009 §9.4 §9.6] a conversation', () => {
  test('a message is sent; a reported message names only it; a Chat Block stops sending with "לא ניתן לשלוח הודעות בשיחה הזו"', async ({ page }) => {
    const net = await setupChat(page, { incoming: false });
    await signIn(page);
    await page.goto(`/chat/${CONV}`);
    const thread = main(page).getByRole('list', { name: 'ההודעות בשיחה' });
    await expect(thread).toContainText('הודעת הפתיחה');
    await main(page).getByLabel('הודעה', { exact: true }).fill('נשמח להיפגש');
    await main(page).getByRole('button', { name: 'שליחה', exact: true }).click();
    await expect(thread).toContainText('נשמח להיפגש');
    expect(net.sent).toContainEqual({ method: 'POST', path: `/api/chat/conversations/${CONV}/messages`, body: { text: 'נשמח להיפגש' } });

    await thread.getByRole('button', { name: /^דיווח על ההודעה: אשמח לדבר/ }).click();
    await page.getByRole('menuitem', { name: 'דיווח על ההודעה' }).click();
    const box = sheet(page, 'message');
    await expect(box).toBeVisible();
    await choose(box, 1);
    await sendButton(box).click();
    await expect(box).toHaveCount(0);
    expect(net.sent).toContainEqual({ method: 'POST', path: '/api/reports', body: { targetKind: 'message', targetId: 'c8000000-0000-4000-8000-000000000041', reason: 'harassment' } });

    await main(page).getByRole('button', { name: 'פעולות בשיחה' }).click();
    await page.getByRole('menuitem', { name: 'חסימת הודעות' }).click();
    await expect(main(page).getByText('לא ניתן לשלוח הודעות בשיחה הזו')).toBeVisible();
    await expect(main(page).getByLabel('הודעה', { exact: true })).toHaveCount(0);
  });
});

test.describe('[I8 FR-ADMIN-001 FR-CHAT-004] Support', () => {
  test('[§9.1] the form sends a topic from the list and a text; the request shows under "הפניות שלי"', async ({ page }) => {
    const net = await setupChat(page);
    await signIn(page);
    await page.goto('/support');
    await expect(main(page).getByRole('heading', { level: 1, name: 'פנייה לתמיכה' })).toBeVisible();
    await main(page).getByRole('button', { name: 'שליחת הפנייה' }).click();
    await expect(main(page).getByText('יש לבחור נושא')).toBeVisible();
    expect(net.sent.filter((s) => s.path === '/api/support')).toHaveLength(0);
    await main(page).getByRole('combobox', { name: 'נושא' }).selectOption({ label: 'פרטיות ובטיחות' });
    await main(page).getByLabel('מה קרה?').fill('מישהו משתמש בתמונה שלי');
    await main(page).getByRole('button', { name: 'שליחת הפנייה' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'הפנייה נשלחה' })).toBeVisible();
    expect(net.sent).toContainEqual({ method: 'POST', path: '/api/support', body: { topic: 'privacy_safety', text: 'מישהו משתמש בתמונה שלי' } });
    await expect(main(page).getByRole('list', { name: 'הפניות ששלחת' })).toContainText('פרטיות ובטיחות');
  });

  test('[AC-053 BR-043] a Support thread shows the replies as "Support" and takes the user\'s reply', async ({ page }) => {
    const net = await setupChat(page);
    await signIn(page);
    await page.goto(`/support/${SUP}`);
    const thread = main(page).getByRole('list', { name: 'ההודעות בשיחה' });
    await expect(thread).toContainText('Support');
    await expect(thread).toContainText('בודקים ונחזור אלייך');
    await main(page).getByLabel('תגובה', { exact: true }).fill('תודה, מחכה');
    await main(page).getByRole('button', { name: 'שליחה', exact: true }).click();
    await expect(thread).toContainText('תודה, מחכה');
    expect(net.sent).toContainEqual({ method: 'POST', path: `/api/support/${SUP}/messages`, body: { text: 'תודה, מחכה' } });
  });
});

test.describe('[I8 FR-ADMIN-002 AC-024] the Support inbox', () => {
  test('a staff member opens a request, replies as Support, adds an internal note and closes it', async ({ page }) => {
    const net = await setupChat(page, { staff: true });
    await signIn(page);
    await page.goto('/admin/support');
    await expect(page.getByRole('navigation', { name: 'מסכי הניהול' }).getByRole('link', { name: 'פניות Support' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: /^הודעות/ })).toHaveCount(0); // BR-034: no social chat for staff
    const list = main(page).getByRole('list', { name: 'פניות Support' });
    await expect(list).toContainText('ליאור אברהם');
    await list.getByRole('button', { name: /^פתיחת הפנייה/ }).click();
    await main(page).getByLabel('תגובה בשם Support').fill('תוקן, אפשר לנסות שוב');
    await main(page).getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'התגובה נשלחה בשם Support' })).toBeVisible();
    await main(page).getByLabel('תגובה בשם Support').fill('נבדק מול הצוות הטכני');
    await main(page).getByRole('checkbox', { name: 'הערה פנימית (רק הצוות רואה)' }).check();
    await main(page).getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(main(page).getByRole('list', { name: 'ההודעות בפנייה' })).toContainText('הערה פנימית');
    await main(page).getByRole('combobox', { name: 'שינוי סטטוס' }).selectOption({ label: 'סגורה' });
    await expect(page.getByRole('status').filter({ hasText: 'הסטטוס עודכן' })).toBeVisible();
    expect(net.sent.map((s) => s.body)).toEqual([
      { text: 'תוקן, אפשר לנסות שוב', internal: false },
      { text: 'נבדק מול הצוות הטכני', internal: true },
      { status: 'closed' },
    ]);
  });
});
