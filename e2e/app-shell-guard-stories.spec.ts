// F1.2 app-shell-guard criterion 27 (design consistency): Storybook has stories for the Welcome page and for the
// composed shell: each nav item current, and the drawer open. Runs on the built Storybook (default baseURL).
// Derived from .work/app-shell-guard/spec.md only: the stories are found by what they render, not by their ids.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DESKTOP, MOBILE, openStory, runAxe, storyIds } from './helpers';

const NAV = 'ניווט ראשי';
const WELCOME_H1 = 'הצטרפות ל-Nestly';

interface Facts {
  id: string;
  h1s: string[];
  welcome: boolean;
  actions: string[];
  currentNav: string[];
  navLinks: { name: string; href: string | null }[];
  drawerItems: string[];
  drawerOpen: boolean;
}

test.use({ viewport: MOBILE });

const ids = storyIds();

/** Hyphen-like characters and spacing are folded so that U+2011 or NBSP in a rendered string do not hide a match. */
const fold = (s: string): string => s.replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();

async function factsOf(page: Page, id: string): Promise<Facts> {
  await openStory(page, id);
  const raw = await page.evaluate(
    ({ nav }) => {
      const name = (el: Element): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const navEl = document.querySelector(`[aria-label="${nav}"]`);
      const dialog = document.querySelector('[role="dialog"]');
      return {
        h1s: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent ?? ''),
        actions: Array.from(document.querySelectorAll('main a[href], main button')).map(name),
        currentNav: navEl === null ? [] : Array.from(navEl.querySelectorAll('[aria-current="page"]')).map(name),
        navLinks: navEl === null ? [] : Array.from(navEl.querySelectorAll('a')).map((a) => ({ name: name(a), href: a.getAttribute('href') })),
        drawerOpen: dialog !== null,
        drawerItems: dialog === null ? [] : Array.from(dialog.querySelectorAll('a[href], button')).map(name),
      };
    },
    { nav: NAV },
  );
  return { id, ...raw, welcome: raw.h1s.some((t) => fold(t) === fold(WELCOME_H1)) };
}

test('[F1.2 c27][NFR-USAB-004] Storybook has stories for the Welcome page and for the composed shell (each nav item current, drawer open)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const all: Facts[] = [];
  for (const id of ids) all.push(await factsOf(page, id));

  const welcomeish = all.filter((f) => /welcome/i.test(f.id));
  const welcome = all.filter((f) => f.welcome);
  expect(
    welcome.length,
    `a story renders the Welcome page (h1 "${WELCOME_H1}"). Stories with "welcome" in the id and the h1s they render: ${JSON.stringify(
      welcomeish.map((f) => ({ id: f.id, h1s: f.h1s })),
    )}`,
  ).toBeGreaterThanOrEqual(1);
  expect(welcome.some((f) => ['יצירת חשבון חדש', 'המשך עם Google', 'כבר יש לי חשבון'].every((a) => f.actions.includes(a)))).toBe(true);

  for (const item of ['בית', 'פיד', 'פרופיל']) {
    const hit = all.find((f) => f.currentNav.length === 1 && f.currentNav[0] === item && f.navLinks.length === 3);
    expect(hit, `a story shows the shell with "${item}" as the current nav item`).toBeDefined();
    expect(hit?.navLinks.map((l) => l.name)).toEqual(['בית', 'פיד', 'פרופיל']);
  }

  const drawer = all.find(
    (f) => f.drawerOpen && f.drawerItems.includes('חשבון') && f.drawerItems.includes('התנתקות') && f.navLinks.length === 3,
  );
  expect(drawer, 'a story shows the composed shell with the drawer open, holding חשבון and התנתקות').toBeDefined();
  expect(drawer?.drawerItems.filter((i) => i !== 'סגירת התפריט')).toEqual(['חברים', 'חשבון', 'פרטיות ואבטחה', 'תנאים ופרטיות', 'פנייה למוקד רפואי', 'שאלות לשחזור סיסמה', 'החלפת סיסמה', 'התנתקות']); // F1.6 c18, F2.0 c15, F2.5 c1, F3.8 c5
});

test('[F1.2 c27][NFR-A11Y-001] the Welcome story and the composed shell stories have zero axe violations at 375 and 1024', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const targets: string[] = [];
  for (const id of ids) {
    const f = await factsOf(page, id);
    if (f.welcome || f.navLinks.length === 3 || (f.drawerOpen && f.drawerItems.includes('התנתקות'))) targets.push(id);
  }
  expect(targets.length).toBeGreaterThanOrEqual(1);
  expect(
    targets.some((id) => /welcome/i.test(id)),
    'the Welcome story is among the axe targets',
  ).toBe(true);
  for (const vp of [MOBILE, DESKTOP]) {
    await page.setViewportSize(vp);
    for (const id of targets) {
      await openStory(page, id);
      const result = await runAxe(page, { tags: ['wcag2a', 'wcag2aa', 'wcag22aa'] });
      expect(result.violations, `${id} @${vp.width}`).toEqual([]);
    }
  }
});
