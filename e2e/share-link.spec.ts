// I3 F3.6 share-link (real browser, network stubbed): the "שיתוף קישור" action, the ShareSheet in F3.7's primitive, copy and device share, the side-menu
// "שיתוף Nestly", and what opening a link does for a Guest and for a viewer without permission. Derived from .work/share-link/spec.md criteria 3-5, 8,
// 10-12 and screen.md (roles and Hebrew names) only; the Gate 1 / direction.md amendment (sheet primitive; Back, Esc, outside click close it).
// The pure link builders and payloads are packages/shared/tests/share.test.ts; the Cache-Control of post reads is apps/server/tests/db/shares.db.test.ts;
// the preview HTML is e2e/share-preview-build.spec.ts; the returnTo allow-list is apps/web/tests/app/post-return-target.test.ts.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { APP, MENU_BUTTON, pathOf } from './app-helpers';
import { DESKTOP, MOBILE } from './helpers';
import { DESKTOP_1280, EMAIL, scan } from './support/journeys-stub';
import { anonymous, named, pageOf, range, share } from './support/feed-stub';
import type { Unit } from './support/feed-stub';
import { id, originalOf, postView, setupShare } from './support/share-stub';
import type { ShareNet } from './support/share-stub';
import { feedCards, openFeedAt } from './support/composer';
import { afterPaint } from './support/post-menu';

test.use({ baseURL: APP });

const SIZES = [
  { label: 'desktop', viewport: DESKTOP },
  { label: 'phone', viewport: MOBILE },
] as const;
const LINK = 'שיתוף קישור';
const SITE = 'שיתוף Nestly';
const POST_TITLE = 'פוסט ב-Nestly';
const COPIED = 'הקישור הועתק';
const COPY_FAILED = 'לא הצלחנו להעתיק. אפשר להעתיק את הקישור מהשדה';
const UNAVAILABLE = 'הפוסט אינו זמין';

const linkButton = (scope: Locator | Page) => scope.getByRole('button', { name: LINK, exact: true });
const sheetOf = (page: Page, name: string = LINK) => page.getByRole('dialog', { name, exact: true });
const whatsapp = (box: Locator) => box.getByRole('link', { name: /^וואטסאפ/ });
const email = (box: Locator) => box.getByRole('link', { name: /^אימייל/ });
const copyButton = (box: Locator) => box.getByRole('button', { name: 'העתקת קישור', exact: true });
const moreButton = (box: Locator) => box.getByRole('button', { name: 'אפשרויות נוספות', exact: true });
const closeButton = (box: Locator) => box.getByRole('button', { name: 'סגירה', exact: true });
const linkField = (box: Locator) => box.getByRole('textbox', { name: 'הקישור', exact: true });
const polite = (box: Locator, text: string) => box.getByRole('status').filter({ hasText: text });
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

interface Device {
  /** navigator.clipboard.writeText: resolves, rejects, or there is no Clipboard API. */
  clipboard: 'ok' | 'reject' | 'absent';
  /** navigator.share: absent, resolves, rejects with AbortError (the user cancelled), or rejects with another error. */
  share: 'absent' | 'ok' | 'abort' | 'error';
}
/** Replaces the two browser APIs before the page loads and records what they were given in window.__device. */
async function stubDevice(page: Page, device: Device): Promise<void> {
  await page.addInitScript((d: Device) => {
    const calls: { clipboard: string[]; share: unknown[] } = { clipboard: [], share: [] };
    Reflect.set(window, '__device', calls);
    const define = (key: string, value: unknown): void => {
      Object.defineProperty(navigator, key, { value, configurable: true });
    };
    define('clipboard', d.clipboard === 'absent' ? undefined : { writeText: (text: string) => {
      calls.clipboard.push(text);
      return d.clipboard === 'ok' ? Promise.resolve() : Promise.reject(new DOMException('denied', 'NotAllowedError'));
    } });
    define('share', d.share === 'absent' ? undefined : (data: unknown) => {
      calls.share.push(data);
      if (d.share === 'ok') return Promise.resolve();
      return Promise.reject(d.share === 'abort' ? new DOMException('cancelled', 'AbortError') : new DOMException('failed', 'NotAllowedError'));
    });
  }, device);
}
interface DeviceCalls { clipboard: string[]; share: unknown[] }
/** What the stubbed clipboard and share were given so far. */
async function device(page: Page): Promise<DeviceCalls> {
  const raw: unknown = JSON.parse(await page.evaluate(() => JSON.stringify(Reflect.get(window, '__device') ?? { clipboard: [], share: [] })));
  const clipboard: unknown = typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'clipboard') : undefined;
  const shared: unknown = typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'share') : undefined;
  return {
    clipboard: Array.isArray(clipboard) ? clipboard.map(String) : [],
    share: Array.isArray(shared) ? shared : [],
  };
}

async function startFeed(page: Page, items: Unit[], dev: Device = { clipboard: 'ok', share: 'absent' }, opts: { professional?: boolean } = {}): Promise<ShareNet> {
  await stubDevice(page, dev);
  const net = await setupShare(page, () => pageOf(items, null), opts);
  await openFeedAt(page, net);
  if (opts.professional === true) await page.waitForLoadState('networkidle'); // a Professional has no feed cards before the professional-posting part
  else await expect(feedCards(page).first()).toBeVisible();
  return net;
}
async function openSheet(page: Page, card: Locator): Promise<Locator> {
  await linkButton(card).click();
  const box = sheetOf(page);
  await expect(box).toBeVisible();
  return box;
}
const hrefOf = async (l: Locator): Promise<string> => (await l.getAttribute('href')) ?? '';
/** The text a WhatsApp link carries, decoded: "wa.me/?text=" + title + space + URL (spec c2). */
const waText = async (l: Locator): Promise<string> => decodeURIComponent((await hrefOf(l)).slice('https://wa.me/?text='.length));
const mailParts = async (l: Locator): Promise<[string, string]> => {
  const href = await hrefOf(l);
  const [subject = '', body = ''] = href.slice('mailto:?subject='.length).split('&body=');
  return [decodeURIComponent(subject), decodeURIComponent(body)];
};

test.describe('F3.6 c3 [FR-FEED-007, BR-064, AC-080] the "שיתוף קישור" action exists exactly when there is a link', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c3] ${label}: shown on a named everyone post (my own included) and on a share of an available everyone original; absent (never disabled) on anonymous, friends-only and a share whose original is unavailable or friends-only`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [
        named(1),
        named(2, { isMine: true }),
        share(3, originalOf(9)),
        anonymous(4),
        named(5, { audience: 'friends' }),
        share(6, { available: false }),
        share(7, originalOf(9, { audience: 'friends' })),
      ]);
      await expect(feedCards(page)).toHaveCount(7);
      for (const [n, count] of [1, 1, 1, 0, 0, 0, 0].entries()) {
        await expect(linkButton(feedCards(page).nth(n)), `card ${n + 1}`).toHaveCount(count);
        await expect(feedCards(page).nth(n).getByRole('button', { name: /שיתוף קישור/ }), `card ${n + 1}: nothing disabled`).toHaveCount(count);
      }
    });
  }

  test('[c3] tab order inside a card: like, comments, share in feed, share link, time link; the control is 44x44', async ({ page }) => {
    await startFeed(page, [named(1)]);
    const card = feedCards(page).first();
    await card.getByRole('button', { name: /^לייק/ }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''));
    }
    expect(seen[0]).toMatch(/^תגובות/);
    expect(seen.slice(1)).toEqual(['שיתוף בפיד', LINK]);
    const box = await linkButton(card).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('[c3] a Professional sees no "שיתוף קישור"', async ({ page }) => {
    await startFeed(page, [named(1)], { clipboard: 'ok', share: 'absent' }, { professional: true });
    await expect(page.getByRole('button', { name: LINK, exact: true })).toHaveCount(0);
  });

  test('[c3] on the post page: shown for an everyone post, hidden for a friends-only or anonymous one', async ({ page }) => {
    await stubDevice(page, { clipboard: 'ok', share: 'absent' });
    const net = await setupShare(page, () => pageOf([], null), { posts: [] });
    net.views[id(1)] = postView(1);
    net.views[id(2)] = postView(2, { audience: 'friends' });
    net.views[id(3)] = postView(3, { isAnonymous: true, author: undefined });
    await openFeedAt(page, net, `/posts/${id(1)}`);
    await expect(linkButton(page.getByRole('main'))).toHaveCount(1);
    for (const n of [2, 3]) {
      await page.goto(`/posts/${id(n)}`);
      await expect(page.getByRole('heading', { level: 1, name: 'פוסט', exact: true })).toBeVisible();
      await expect(page.getByRole('main').getByText(`גוף הפוסט ${n}`)).toBeVisible();
      await expect(linkButton(page.getByRole('main')), `post ${n}`).toHaveCount(0);
    }
  });
});

test.describe('F3.6 c4 [FR-FEED-007, NFR-PRIV-007] the ShareSheet', () => {
  for (const { label, viewport } of SIZES) {
    test(`[c4] ${label}: a modal dialog "${LINK}" (a bottom sheet below 1024 px, a small centred window from 1024 px); focus on the first option; WhatsApp and email links carry the title and the URL only; "העתקת קישור" and "סגירה"`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [named(1, { body: 'סוד-123', author: { name: 'דנה' } })]);
      const box = await openSheet(page, feedCards(page).first());
      await expect(box).toHaveAttribute('aria-modal', 'true');
      const url = `${APP}/posts/${id(1)}`;
      await expect(whatsapp(box)).toBeFocused();
      await expect(whatsapp(box)).toHaveAttribute('target', '_blank');
      await expect(whatsapp(box)).toHaveAttribute('rel', /noopener/);
      await expect(whatsapp(box)).toHaveAttribute('rel', /noreferrer/);
      expect(await hrefOf(whatsapp(box))).toMatch(/^https:\/\/wa\.me\/\?text=/);
      expect(await waText(whatsapp(box))).toBe(`${POST_TITLE} ${url}`);
      await expect(email(box)).toHaveAttribute('target', '_blank');
      expect(await hrefOf(email(box))).toMatch(/^mailto:\?subject=/);
      expect(await mailParts(email(box))).toEqual([POST_TITLE, url]);
      for (const secret of ['סוד-123', 'דנה']) {
        expect(decodeURIComponent(await hrefOf(whatsapp(box))), secret).not.toContain(secret);
        expect(decodeURIComponent(await hrefOf(email(box))), secret).not.toContain(secret);
      }
      await expect(moreButton(box), 'no navigator.share → no "אפשרויות נוספות"').toHaveCount(0);
      await expect(copyButton(box)).toBeVisible();
      await expect(closeButton(box)).toBeVisible();
      const rect = (await box.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
      if (viewport.width < 1024) {
        expect(Math.round(rect.y + rect.height), 'bottom edge is the screen bottom').toBe(viewport.height);
        expect(Math.round(rect.width), 'full width').toBe(viewport.width);
      } else {
        expect(rect.width, 'a small window').toBeLessThan(viewport.width / 2 + 1);
        expect(Math.abs(rect.x + rect.width / 2 - viewport.width / 2), 'centred across').toBeLessThanOrEqual(2);
      }
    });

    test(`[c4] ${label}: Esc, an outside click, "סגירה" and Back each close it; the page neither scrolls nor navigates; focus returns to the opener; no network request`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const net = await startFeed(page, range(1, 12));
      const opener = linkButton(feedCards(page).nth(1));
      await opener.scrollIntoViewIfNeeded();
      for (const close of ['Escape', 'outside', 'close', 'Back'] as const) {
        const at = await scrollY(page);
        const requests = net.apiPaths.length;
        const box = await openSheet(page, feedCards(page).nth(1));
        await page.mouse.move(viewport.width / 2, 20);
        await page.mouse.wheel(0, 600);
        await page.keyboard.press('PageDown');
        expect(await scrollY(page), `${close}: no scroll behind`).toBe(at);
        await afterPaint(page);
        if (close === 'Escape') await page.keyboard.press('Escape');
        else if (close === 'outside') await page.mouse.click(3, 3);
        else if (close === 'close') await closeButton(box).click();
        else await page.goBack();
        await expect(box, close).toHaveCount(0);
        expect(pathOf(page), `${close}: still the feed`).toBe('/feed');
        expect(await scrollY(page), `${close}: same place`).toBe(at);
        await expect(opener, `${close}: focus returns`).toBeFocused();
        expect(net.apiPaths.length, `${close}: opening and closing sent no request`).toBe(requests);
      }
    });
  }

  test('[c4] "אפשרויות נוספות" appears only when navigator.share exists and calls it with {title, url} only', async ({ page }) => {
    await startFeed(page, [named(1, { body: 'סוד-123' })], { clipboard: 'ok', share: 'ok' });
    const box = await openSheet(page, feedCards(page).first());
    await moreButton(box).click();
    await expect.poll(async () => (await device(page)).share).toEqual([{ title: POST_TITLE, url: `${APP}/posts/${id(1)}` }]);
    await expect(box.getByRole('alert')).toHaveCount(0);
    await expect(polite(box, COPIED)).toHaveCount(0);
  });

  test('[c4] a share card links to its ORIGINAL, never to the share', async ({ page }) => {
    await startFeed(page, [share(2, originalOf(9))]);
    const box = await openSheet(page, feedCards(page).first());
    expect(await waText(whatsapp(box))).toBe(`${POST_TITLE} ${APP}/posts/${id(9)}`);
    expect(decodeURIComponent(await hrefOf(whatsapp(box)))).not.toContain(id(2));
  });
});

test.describe('F3.6 c5 [FR-FEED-007] copy and device share', () => {
  test('[c5] copy: writeText gets the URL, then the polite status "הקישור הועתק" inside the window and no alert', async ({ page }) => {
    await startFeed(page, [named(1)], { clipboard: 'ok', share: 'absent' });
    const box = await openSheet(page, feedCards(page).first());
    await copyButton(box).click();
    await expect(polite(box, COPIED)).toBeVisible();
    await expect(box.getByRole('alert')).toHaveCount(0);
    await expect(linkField(box)).toHaveCount(0);
    expect((await device(page)).clipboard).toEqual([`${APP}/posts/${id(1)}`]);
  });

  for (const clipboard of ['reject', 'absent'] as const) {
    test(`[c5] copy with the Clipboard API ${clipboard === 'reject' ? 'rejecting' : 'missing'}: the alert, and a read-only field "הקישור" holding the URL, selected, dir=ltr`, async ({ page }) => {
      await startFeed(page, [named(1)], { clipboard, share: 'absent' });
      const box = await openSheet(page, feedCards(page).first());
      await copyButton(box).click();
      await expect(box.getByRole('alert')).toHaveText(COPY_FAILED);
      await expect(polite(box, COPIED)).toHaveCount(0);
      const field = linkField(box);
      const url = `${APP}/posts/${id(1)}`;
      await expect(field).toHaveValue(url);
      await expect(field).toHaveAttribute('readonly', '');
      await expect(field).toHaveAttribute('dir', 'ltr');
      const selection = await field.evaluate((el) => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? [el.selectionStart, el.selectionEnd] : null));
      expect(selection, 'the whole URL is selected').toEqual([0, url.length]);
    });
  }

  test('[c5] device share cancelled by the user (AbortError) → nothing is shown', async ({ page }) => {
    await startFeed(page, [named(1)], { clipboard: 'ok', share: 'abort' });
    const box = await openSheet(page, feedCards(page).first());
    await moreButton(box).click();
    await expect.poll(async () => (await device(page)).share.length).toBe(1);
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))); // two frames: the promise has rejected; nothing may appear afterwards
    await expect(box.getByRole('alert')).toHaveCount(0);
    await expect(linkField(box)).toHaveCount(0);
    await expect(polite(box, COPIED)).toHaveCount(0);
    await expect(box).toBeVisible();
  });

  test('[c5] device share failing any other way → the copy-failure state (the alert and the field)', async ({ page }) => {
    await startFeed(page, [named(1)], { clipboard: 'ok', share: 'error' });
    const box = await openSheet(page, feedCards(page).first());
    await moreButton(box).click();
    await expect(box.getByRole('alert')).toHaveText(COPY_FAILED);
    await expect(linkField(box)).toHaveValue(`${APP}/posts/${id(1)}`);
  });
});

test.describe('F3.6 c11 [FR-FEED-007] "שיתוף Nestly" in the side menu', () => {
  const DRAWER = 'תפריט';
  const openMenu = async (page: Page): Promise<Locator> => {
    await page.getByRole('button', { name: MENU_BUTTON, exact: true }).click();
    const drawer = page.getByRole('dialog', { name: DRAWER });
    await expect(drawer).toBeVisible();
    return drawer;
  };
  for (const { label, viewport } of SIZES) {
    test(`[c11] ${label}: the menu item opens the ShareSheet titled "${SITE}" with the site link; same options; "סגירה" returns focus to the menu button`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [named(1)]);
      const drawer = await openMenu(page);
      await drawer.getByRole('button', { name: SITE, exact: true }).click();
      const box = sheetOf(page, SITE);
      await expect(box).toBeVisible();
      expect(await waText(whatsapp(box))).toBe(`Nestly ${APP}/`);
      expect(await mailParts(email(box))).toEqual(['Nestly', `${APP}/`]);
      await copyButton(box).click();
      await expect(polite(box, COPIED)).toBeVisible();
      expect((await device(page)).clipboard).toEqual([`${APP}/`]);
      await closeButton(box).click();
      await expect(box).toHaveCount(0);
      await expect(page.getByRole('button', { name: MENU_BUTTON, exact: true })).toBeFocused();
      expect(pathOf(page)).toBe('/feed');
    });
  }
  test('[c11] Esc, an outside click and Back close the site sheet too, with no request', async ({ page }) => {
    const net = await startFeed(page, [named(1)]);
    for (const close of ['Escape', 'outside', 'Back'] as const) {
      const requests = net.apiPaths.length;
      const drawer = await openMenu(page);
      await drawer.getByRole('button', { name: SITE, exact: true }).click();
      const box = sheetOf(page, SITE);
      await expect(box).toBeVisible();
      await expect(whatsapp(box)).toBeFocused(); // the sheet has finished opening before it is closed
      await afterPaint(page);
      if (close === 'Escape') await page.keyboard.press('Escape');
      else if (close === 'outside') await page.mouse.click(3, 3);
      else await page.goBack();
      await expect(box, close).toHaveCount(0);
      expect(pathOf(page), close).toBe('/feed');
      expect(net.apiPaths.length, close).toBe(requests);
    }
  });
  test('[c11] a Professional has the menu item too (it carries no post data)', async ({ page }) => {
    await startFeed(page, [named(1)], { clipboard: 'ok', share: 'absent' }, { professional: true });
    const drawer = await openMenu(page);
    await expect(drawer.getByRole('button', { name: SITE, exact: true })).toBeVisible();
  });
});

test.describe('F3.6 c12 [NFR-A11Y-001] accessibility of the ShareSheet', () => {
  for (const { label, viewport } of [{ label: 'phone 375', viewport: MOBILE }, { label: 'desktop 1280', viewport: DESKTOP_1280 }] as const) {
    test(`[c12] ${label}: axe 0 on the post sheet and the site sheet; options at least 44x44 with a visible focus; the focus is trapped; initial focus on the first option`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startFeed(page, [named(1)], { clipboard: 'ok', share: 'ok' });
      const box = await openSheet(page, feedCards(page).first());
      await expect(whatsapp(box)).toBeFocused();
      for (const [which, control] of [['WhatsApp', whatsapp(box)], ['email', email(box)], ['copy', copyButton(box)], ['more', moreButton(box)], ['close', closeButton(box)]] as const) {
        const size = await control.boundingBox();
        expect(size?.width ?? 0, `${which} width`).toBeGreaterThanOrEqual(44);
        expect(size?.height ?? 0, `${which} height`).toBeGreaterThanOrEqual(44);
      }
      // By keyboard (a focus ring shows for the keyboard): every stop is inside the sheet and shows a ring; the tab cycle wraps within it.
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab');
        expect(await box.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} stays inside`).toBe(true);
        const ring = await page.evaluate(() => {
          const el = document.activeElement;
          if (el === null) return false;
          const s = getComputedStyle(el);
          return (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || s.boxShadow !== 'none';
        });
        expect(ring, `Tab ${i + 1}: a visible focus`).toBe(true);
      }
      await page.keyboard.press('Shift+Tab');
      expect(await box.evaluate((el) => el.contains(document.activeElement)), 'Shift+Tab stays inside').toBe(true);
      await scan(page);
      await closeButton(box).click();
      await page.getByRole('button', { name: MENU_BUTTON, exact: true }).click();
      await page.getByRole('dialog', { name: 'תפריט' }).getByRole('button', { name: SITE, exact: true }).click();
      await expect(sheetOf(page, SITE)).toBeVisible();
      await expect(whatsapp(sheetOf(page, SITE))).toBeFocused();
      await scan(page);
    });
  }
});

test.describe('F3.6 c10 [AC-082, NFR-SEC-005] a link the viewer may not open', () => {
  const HIDDEN_BODY = 'תוכן-שאסור-לראות-777';
  /** The server's answer for a post the caller cannot read: 404 (an unknown id or an unreadable post, indistinguishable) or 403 (a Professional or suspended caller). */
  async function openAs(page: Page, status: 404 | 403, opts: { professional?: boolean } = {}): Promise<string> {
    await stubDevice(page, { clipboard: 'ok', share: 'absent' });
    const net = await setupShare(page, () => pageOf([], null), { posts: [], ...opts });
    await page.route(/\/api\/posts\/[^/?]+(\?.*)?$/, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ status, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ error: status === 404 ? 'not_found' : 'not_allowed' }) });
    });
    await openFeedAt(page, net, `/posts/${id(1)}`);
    const main = page.getByRole('main');
    await expect(main.getByText(UNAVAILABLE, { exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'חזרה לפיד', exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(HIDDEN_BODY);
    const dump = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    expect(dump).not.toContain(HIDDEN_BODY);
    return (await main.innerHTML()).replace(/\s+/g, ' ');
  }

  test('[c10] a Regular opening a post that is edited to friends / deleted / by a suspended author / unknown (one 404) → "הפוסט אינו זמין" with "חזרה לפיד"; a Professional or suspended viewer (403) → the DOM is identical', async ({ page, browser }) => {
    const regular = await openAs(page, 404);
    const context = await browser.newContext({ baseURL: APP });
    const other = await context.newPage();
    const denied = await openAs(other, 403, { professional: true });
    await context.close();
    expect(denied).toBe(regular);
  });

  test('[c10] "חזרה לפיד" goes to the feed', async ({ page }) => {
    await openAs(page, 404);
    await page.getByRole('main').getByRole('link', { name: 'חזרה לפיד', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/feed');
  });
});

test.describe('F3.6 c8 [AC-082, FR-AUTH-004] a Guest opening a link', () => {
  const PASSWORD = 'Zq-7-unique-pw-marker-91';
  const GOOGLE = 'המשך עם Google';
  const AUTHORIZE = 'https://e2e-stub.invalid/auth/v1/authorize';

  async function guest(page: Page): Promise<{ net: ShareNet; apiBefore: () => string[] }> {
    await stubDevice(page, { clipboard: 'ok', share: 'absent' });
    const net = await setupShare(page, () => pageOf([], null), { posts: [] });
    net.views[id(1)] = postView(1, { body: 'גוף הפוסט שנפתח מהקישור' });
    const posts: string[] = [];
    page.on('request', (req) => {
      const path = new URL(req.url()).pathname;
      if (path.startsWith('/api/posts')) posts.push(path);
    });
    return { net, apiBefore: () => [...posts] };
  }
  const shown = async (page: Page): Promise<void> => {
    await expect.poll(() => pathOf(page)).toBe(`/posts/${id(1)}`);
    await expect(page.getByRole('main').getByText('גוף הפוסט שנפתח מהקישור')).toBeVisible();
  };

  test('[c8] email sign-in: /posts/<id> → Login → after signing in, /posts/<id> with the post; no /api/posts request before the sign-in', async ({ page }) => {
    const { apiBefore } = await guest(page);
    await page.goto(`/posts/${id(1)}`);
    await expect.poll(() => pathOf(page)).toBe('/login');
    await page.waitForLoadState('networkidle');
    expect(apiBefore(), 'nothing of the post was requested while signed out').toEqual([]);
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await shown(page);
    expect(apiBefore().length).toBeGreaterThan(0);
  });

  test('[c8] Google sign-in: /posts/<id> → Login → "המשך עם Google" → back from the provider, /posts/<id> with the post; no /api/posts request before', async ({ page }) => {
    const { apiBefore } = await guest(page);
    await page.route(`${AUTHORIZE}**`, (route) => route.fulfill({ status: 302, headers: { location: `${APP}/auth/google?code=e2e-code` } }));
    await page.goto(`/posts/${id(1)}`);
    await expect.poll(() => pathOf(page)).toBe('/login');
    await page.waitForLoadState('networkidle');
    expect(apiBefore()).toEqual([]);
    await page.getByRole('button', { name: GOOGLE, exact: true }).click();
    await shown(page);
  });

  test('[c8] a just-signed-out user keeps F2.4c2 behaviour: signing out and in again does not return to the old post', async ({ page }) => {
    const { net } = await guest(page);
    await openFeedAt(page, net, `/posts/${id(1)}`);
    await shown(page);
    await page.getByRole('button', { name: MENU_BUTTON, exact: true }).click();
    await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/');
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect.poll(() => pathOf(page)).not.toBe('/login');
    expect(pathOf(page)).not.toBe(`/posts/${id(1)}`);
  });
});
