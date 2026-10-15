import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, open } from './app-helpers';
import { DESKTOP, MOBILE, openStory } from './helpers';
import { SCREENS } from './visual-screens';
import type { Screen } from './visual-screens';

// Visual regression (Afik's test rules, 14.10.2026): every listed screen, at phone (375) and desktop (1024), compared with a
// committed baseline. Noise is stabilised, never switched off: fonts are awaited, animations and the caret are disabled by
// Playwright, motion is reduced, the clock is fixed, and the screens are static (no live data). Chrome only (the edge project ignores
// *.visual.spec.ts); baselines come from Linux Chrome through the update-baselines workflow. updateSnapshots is 'none' in the config:
// a listed screen with no baseline FAILS instead of writing one.
const FIXED_TIME = new Date('2026-01-15T10:00:00Z');
const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP },
] as const;

test.use({ reducedMotion: 'reduce', baseURL: APP });

async function show(page: Page, screen: Screen): Promise<void> {
  if (screen.kind === 'story') await openStory(page, screen.id);
  else await open(page, screen.route, screen.state);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('visual: screen names are unique and safe as file names', () => {
  const names = SCREENS.map((s) => s.name);
  expect(new Set(names).size).toBe(names.length);
  for (const n of names) expect(n).toMatch(/^[a-z0-9-]+$/);
});

for (const screen of SCREENS) {
  for (const { label, viewport } of SIZES) {
    test(`visual: ${screen.name} @${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // Date is fixed but timers run: the app waits on setTimeout (session seam), so the clock is not paused.
      await page.clock.setFixedTime(FIXED_TIME);
      await show(page, screen);
      await expect(page).toHaveScreenshot(`${screen.name}-${label}.png`, { animations: 'disabled', caret: 'hide', scale: 'css' });
    });
  }
}
