// F1.3 register-profile-step, pass d (real browser): criteria 15 (E2E half), 16, 17, 18.
// Derived from .work/register-profile-step/spec.md only. Runs against the e2e build of the web app (webServer entry in
// playwright.config.ts), Chrome and Edge, like e2e/app-shell-guard-*.spec.ts. No type assertions, no force clicks.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { DESKTOP, MOBILE, runAxe } from './helpers';
import { APP, bodyText, open } from './app-helpers';

test.use({ baseURL: APP, viewport: MOBILE });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const STEP1_H1 = 'פרטים אישיים';
const STEP2_H1 = 'פרטי התחברות';
const HAS_CHILD = 'יש לנו ילד או ילדה';

const h1Of = (page: Page) => page.getByRole('heading', { level: 1 });
const stageGroup = (page: Page) => page.getByRole('group', { name: 'השלב במסע', exact: true });
const stageBox = (page: Page, name: string) => stageGroup(page).getByRole('checkbox', { name: new RegExp(name) });
/** The native checkbox is visually hidden; the card (its label) is what a user clicks. */
const stageCard = (page: Page, name: string) => stageGroup(page).locator('label').filter({ hasText: new RegExp(name) });
async function tick(page: Page, name: string): Promise<void> {
  await stageCard(page, name).click();
  await expect(stageBox(page, name)).toBeChecked();
}
async function untick(page: Page, name: string): Promise<void> {
  await stageCard(page, name).click();
  await expect(stageBox(page, name)).not.toBeChecked();
}
const fullName = (page: Page) => page.getByLabel(/^שם מלא/);
const next = (page: Page) => page.getByRole('button', { name: 'המשך', exact: true });
const addChild = (page: Page) => page.getByRole('button', { name: 'הוספת ילד נוסף', exact: true });
const childCard = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const dateOf = (scope: Locator) => scope.getByRole('group', { name: 'תאריך לידה', exact: true });

async function openStep1(page: Page): Promise<void> {
  await open(page, '/register', 'signed-out');
  await expect(h1Of(page)).toHaveText(STEP1_H1);
}
async function fillDate(scope: Locator, d: string, m: string, y: string): Promise<void> {
  await scope.getByLabel('יום', { exact: true }).fill(d);
  await scope.getByLabel('חודש', { exact: true }).fill(m);
  await scope.getByLabel('שנה', { exact: true }).fill(y);
}
async function fillValidPlanning(page: Page): Promise<void> {
  await tick(page, 'מתכננים');
  await fullName(page).fill('דנה כהן');
}
async function tenChildren(page: Page): Promise<void> {
  await tick(page, HAS_CHILD);
  for (let i = 0; i < 9; i += 1) await addChild(page).click();
  await expect(page.getByRole('group', { name: /^ילד או ילדה \d+$/ })).toHaveCount(10);
}

const AXE_STATES: { name: string; run: (page: Page) => Promise<void>; h1: string }[] = [
  { name: 'the empty step 1', h1: STEP1_H1, run: () => Promise.resolve() },
  {
    name: 'pregnant + has-child with two children',
    h1: STEP1_H1,
    run: async (page) => {
      await tick(page, 'בהריון');
      await tick(page, HAS_CHILD);
      await addChild(page).click();
    },
  },
  {
    name: 'step 1 after a failed "המשך"',
    h1: STEP1_H1,
    run: async (page) => {
      await tick(page, HAS_CHILD);
      await next(page).click();
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    },
  },
  { name: '10 children', h1: STEP1_H1, run: tenChildren },
  {
    name: 'the step-2 placeholder',
    h1: STEP2_H1,
    run: async (page) => {
      await fillValidPlanning(page);
      await next(page).click();
    },
  },
];

test.describe('F1.3 criterion 16 [NFR-A11Y-001] axe', () => {
  for (const vp of [MOBILE, DESKTOP]) {
    for (const state of AXE_STATES) {
      test(`[F1.3 c16][NFR-A11Y-001] axe finds zero violations on ${state.name} @${vp.width}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await openStep1(page);
        await state.run(page);
        await expect(h1Of(page)).toHaveText(state.h1);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const result = await runAxe(page, { tags: AXE_TAGS });
        expect(result.passes, 'axe actually evaluated rules').toBeGreaterThan(0);
        expect(result.violations).toEqual([]);
      });
    }
  }
});

interface Focused {
  label: string;
  x: number;
  y: number;
}

/**
 * What the focused element (document.activeElement, not a lookup by label) is called, and where it sits on the page.
 * Page coordinates (viewport + scroll): focusing scrolls the page, so viewport coordinates of two stops are not comparable.
 */
const focusedInfo = (page: Page): Promise<Focused> =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (a === null) return { label: '', x: 0, y: 0 };
    const labelled = a instanceof HTMLInputElement || a instanceof HTMLSelectElement ? (a.labels?.[0]?.textContent ?? '') : '';
    const label = (a.getAttribute('aria-label') ?? (labelled || (a.textContent ?? ''))).replace(/\s+/g, ' ').trim();
    const target = a instanceof HTMLInputElement && (a.type === 'checkbox' || a.type === 'radio') ? (a.closest('label') ?? a) : a;
    const r = target.getBoundingClientRect();
    return { label, x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2 };
  });

/** Presses Tab until the focused element's name matches; records where it landed. Fails after `max` presses. */
async function tabTo(page: Page, name: string | RegExp, trail: Focused[], max = 25): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const f = await focusedInfo(page);
    if (typeof name === 'string' ? f.label === name : name.test(f.label)) {
      trail.push(f);
      return;
    }
  }
  throw new Error(`Tab did not reach "${String(name)}" within ${max} presses`);
}

test.describe('F1.3 criterion 17 [NFR-A11Y-001 · NFR-USAB-004] keyboard, targets, titles', () => {
  for (const vp of [MOBILE, DESKTOP]) {
    test(`[F1.3 c17][NFR-A11Y-001] step 1 is filled by keyboard alone (two children and a due date), in the form's own order, focus order matches visual order @${vp.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await openStep1(page);
      const trail: Focused[] = [];
      // Order of the form: stage group, due date (when pregnant), children (when has-child), "שם מלא", "המשך".
      await tabTo(page, /בהריון/, trail);
      await page.keyboard.press('Space');
      await expect(stageBox(page, 'בהריון')).toBeChecked();
      await tabTo(page, new RegExp(HAS_CHILD), trail);
      await page.keyboard.press('Space');
      await expect(stageBox(page, HAS_CHILD)).toBeChecked();

      await tabTo(page, 'יום', trail);
      await page.keyboard.type('1');
      await tabTo(page, 'חודש', trail);
      await page.keyboard.type('12');
      await tabTo(page, 'שנה', trail);
      await page.keyboard.type('2026');

      await tabTo(page, 'שם', trail);
      await page.keyboard.type('נועה');
      await tabTo(page, 'מין', trail);
      await page.keyboard.press('ArrowDown');
      await tabTo(page, 'יום', trail);
      await page.keyboard.type('29');
      await tabTo(page, 'חודש', trail);
      await page.keyboard.type('2');
      await tabTo(page, 'שנה', trail);
      await page.keyboard.type('2024');

      await tabTo(page, 'הוספת ילד נוסף', trail);
      await page.keyboard.press('Enter');
      // The new card appears above the add button: start the order again from its name field (the focused element).
      trail.pop();
      await expect(page.getByLabel('שם', { exact: true }).nth(1)).toBeFocused();
      trail.push(await focusedInfo(page));
      await page.keyboard.type('אורי');
      await tabTo(page, 'מין', trail);
      await page.keyboard.press('ArrowDown');
      await tabTo(page, 'יום', trail);
      await page.keyboard.type('5');
      await tabTo(page, 'חודש', trail);
      await page.keyboard.type('3');
      await tabTo(page, 'שנה', trail);
      await page.keyboard.type('2026');

      await tabTo(page, 'הוספת ילד נוסף', trail);
      await tabTo(page, /^שם מלא/, trail);
      await page.keyboard.type('דנה כהן');

      // Visual order: each stop is lower than the one before, or on the same row and further left (RTL).
      for (let i = 1; i < trail.length; i += 1) {
        const a = trail[i - 1];
        const b = trail[i];
        if (a === undefined || b === undefined) throw new Error('trail hole');
        const lower = b.y > a.y + 2;
        const sameRowLeft = Math.abs(b.y - a.y) <= 2 && b.x < a.x;
        expect(lower || sameRowLeft, `"${a.label}" (${a.x},${a.y}) -> "${b.label}" (${b.x},${b.y}) follows the visual order`).toBe(true);
      }

      await tabTo(page, 'המשך', trail);
      await page.keyboard.press('Enter');
      await expect(h1Of(page)).toHaveText(STEP2_H1);
    });
  }

  test('[F1.3 c17][WCAG 2.5.8 · NFR-USAB-004] every control is at least 24x24 CSS px, and "המשך" at least 44x44', async ({ page }) => {
    for (const vp of [MOBILE, DESKTOP]) {
      await page.setViewportSize(vp);
      await openStep1(page);
      await tick(page, 'בהריון');
      await tick(page, HAS_CHILD);
      await addChild(page).click();
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll('input, select, button, a[href]')) {
          let target: Element = el;
          let r = el.getBoundingClientRect();
          // A visually hidden (sr-only) input is operated through its label: measure that instead.
          if (el instanceof HTMLInputElement && (r.width <= 1 || r.height <= 1)) {
            const label = el.labels?.[0] ?? el.closest('label');
            if (label !== null && label !== undefined) {
              target = label;
              r = label.getBoundingClientRect();
            }
          }
          if (r.width === 0 && r.height === 0) continue;
          if (r.width < 24 || r.height < 24) {
            out.push(`${target.tagName} ${el.getAttribute('aria-label') ?? el.textContent ?? ''} ${r.width}x${r.height}`);
          }
        }
        return out;
      });
      expect(small, `controls under 24x24 @${vp.width}`).toEqual([]);
      const box = await next(page).boundingBox();
      expect(box?.width ?? 0, `המשך width @${vp.width}`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `המשך height @${vp.width}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('[F1.3 c17][WCAG 2.4.2 · 2.4.3] the titles follow the step, and focus goes to main on each step change', async ({ page }) => {
    await openStep1(page);
    await expect(page).toHaveTitle('פרטים אישיים · Nestly');
    await fillValidPlanning(page);
    await next(page).click();
    await expect(h1Of(page)).toHaveText(STEP2_H1);
    await expect(page).toHaveTitle('פרטי התחברות · Nestly');
    await expect(page.locator('main')).toBeFocused();
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await expect(h1Of(page)).toHaveText(STEP1_H1);
    await expect(page).toHaveTitle('פרטים אישיים · Nestly');
    await expect(page.locator('main')).toBeFocused();
  });
});

const SLASH_FORMS = [/[א-ת]\/[א-ת]/, /\/(?:ה|י|ית|ת)(?![א-ת])/];

test.describe('F1.3 criterion 18 [rtl-hebrew · NFR-USAB-003] RTL and copy', () => {
  test('[F1.3 c18][rtl-hebrew] lang="he" dir="rtl"; with 10 children and errors shown there is no horizontal scroll at 375', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openStep1(page);
    await tenChildren(page);
    await next(page).click();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    const info = await page.evaluate(() => ({
      lang: document.documentElement.getAttribute('lang'),
      dir: document.documentElement.getAttribute('dir'),
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(info.lang).toBe('he');
    expect(info.dir).toBe('rtl');
    expect(info.sw).toBeLessThanOrEqual(info.cw);
  });

  test('[F1.3 c18][rtl-hebrew] in the date fields the day sits at the right and the year at the left', async ({ page }) => {
    for (const vp of [MOBILE, DESKTOP]) {
      await page.setViewportSize(vp);
      await openStep1(page);
      await tick(page, 'בהריון');
      const due = page.getByRole('group', { name: /תאריך לידה משוער/ });
      const day = await due.getByLabel('יום', { exact: true }).boundingBox();
      const month = await due.getByLabel('חודש', { exact: true }).boundingBox();
      const year = await due.getByLabel('שנה', { exact: true }).boundingBox();
      expect(day?.x ?? -1, `day right of month @${vp.width}`).toBeGreaterThan(month?.x ?? Infinity);
      expect(month?.x ?? -1, `month right of year @${vp.width}`).toBeGreaterThan(year?.x ?? Infinity);
    }
  });

  test('[F1.3 c18][NFR-USAB-003] the rendered text of both steps has no slash gender form', async ({ page }) => {
    await openStep1(page);
    await tick(page, 'בהריון');
    await tick(page, HAS_CHILD);
    const step1 = await bodyText(page);
    await untick(page, HAS_CHILD);
    await fullName(page).fill('דנה כהן');
    await next(page).click();
    await expect(h1Of(page)).toHaveText(STEP2_H1);
    const step2 = await bodyText(page);
    for (const text of [step1, step2]) {
      for (const re of SLASH_FORMS) expect(text).not.toMatch(re);
    }
  });
});

test.describe('F1.3 criterion 15 (E2E half) [NFR-PRIV-001 · minors] data stays in the tab', () => {
  test('[F1.3 c15][NFR-PRIV-001] after filling every field and reaching step 2: no storage, IndexedDB, cookie, console output or non-static request holds or carries the values', async ({
    page,
  }) => {
    const NAME = 'תמרהייחודית';
    const CHILD = 'גפןהייחודי';
    const requests: { url: string; method: string; type: string }[] = [];
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
    const consoleText: string[] = [];
    page.on('console', (m) => consoleText.push(m.text()));

    await openStep1(page);
    await tick(page, 'בהריון');
    await tick(page, HAS_CHILD);
    await fullName(page).fill(NAME);
    await fillDate(page.getByRole('group', { name: /תאריך לידה משוער/ }), '1', '12', '2026');
    await childCard(page, 'ילד או ילדה 1').getByLabel('שם', { exact: true }).fill(CHILD);
    await childCard(page, CHILD).getByLabel('מין', { exact: true }).selectOption({ label: 'בת' });
    await fillDate(dateOf(childCard(page, CHILD)), '29', '2', '2024');
    await next(page).click();
    await expect(h1Of(page)).toHaveText(STEP2_H1);
    await page.waitForTimeout(500);

    const stored = await page.evaluate(async () => {
      const dump = (s: Storage) => JSON.stringify(Object.fromEntries(Object.keys(s).map((k) => [k, s.getItem(k)])));
      const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
      return { local: dump(localStorage), session: dump(sessionStorage), cookie: document.cookie, dbCount: dbs.length };
    });
    for (const blob of [stored.local, stored.session, stored.cookie]) {
      for (const secret of [NAME, CHILD, '2026-12-01', '2024-02-29']) expect(blob).not.toContain(secret);
    }
    expect(stored.dbCount, 'no IndexedDB database exists').toBe(0);

    const dynamic = requests.filter((r) => ['fetch', 'xhr', 'ping', 'websocket', 'eventsource'].includes(r.type) || r.method !== 'GET');
    expect(dynamic, 'no non-static request').toEqual([]);
    expect(requests.filter((r) => !r.url.startsWith('data:') && new URL(r.url).origin !== APP)).toEqual([]);
    expect(requests.filter((r) => new URL(r.url).pathname.startsWith('/api/'))).toEqual([]);
    expect(requests.some((r) => r.url.includes(NAME) || r.url.includes(encodeURIComponent(NAME)))).toBe(false);
    for (const line of consoleText) {
      for (const secret of [NAME, CHILD]) expect(line).not.toContain(secret);
    }
  });
});
