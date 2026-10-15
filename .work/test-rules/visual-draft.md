# Draft for TEST ENGINEER — visual regression files (BUILDER may not write test files)

Config side is done in `playwright.config.ts` (snapshotPathTemplate `{testDir}/__screenshots__/{arg}{ext}`,
`maxDiffPixelRatio: 0.002`, `updateSnapshots: 'none'`, edge project `testIgnore: /\.visual\.spec\.ts$/`).
Create the two files below as `e2e/visual-screens.ts` and `e2e/visual.visual.spec.ts`, run them (lint, typecheck), and
adjust freely — they are untested drafts. SCREENS stays empty until the baselines task.

## e2e/visual-screens.ts

```ts
// Visual regression: the screens compared against a committed baseline. An opt-in list: only a listed screen is compared,
// so CI stays green for screens with no baseline yet. A feature that touches a screen adds an entry and commits its two
// baselines (e2e/__screenshots__/<name>-phone.png, <name>-desktop.png) in the same PR; a listed screen with a missing
// baseline FAILS. Baselines come from Linux Chrome only (the `update-baselines` workflow), never from another OS.
import type { SessionState } from './app-helpers';

interface ScreenBase {
  /** Unique, [a-z0-9-]: the baseline file name. */
  name: string;
}
export interface StoryScreen extends ScreenBase {
  kind: 'story';
  id: string;
}
/** A route of the e2e build of the app, with the test session set to `state` (null = leave it loading). */
export interface AppScreen extends ScreenBase {
  kind: 'app';
  route: string;
  state: SessionState | null;
}
export type Screen = StoryScreen | AppScreen;

export const SCREENS: Screen[] = [];
```

## e2e/visual.visual.spec.ts

```ts
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open } from './app-helpers';
import { DESKTOP, MOBILE, openStory } from './helpers';
import { SCREENS } from './visual-screens';
import type { Screen } from './visual-screens';

const FIXED_TIME = new Date('2026-01-15T10:00:00Z');
const SIZES = [
  { label: 'phone', viewport: MOBILE },
  { label: 'desktop', viewport: DESKTOP },
] as const;

test.use({ reducedMotion: 'reduce' });

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
      await page.clock.install({ time: FIXED_TIME });
      await page.clock.pauseAt(FIXED_TIME);
      await show(page, screen);
      await expect(page).toHaveScreenshot(`${screen.name}-${label}.png`, { animations: 'disabled', caret: 'hide', scale: 'css' });
    });
  }
}
```

Caveat: `pauseAt` freezes timers, which can stall app code that waits on `setTimeout`; if a screen hangs, use
`page.clock.setFixedTime(FIXED_TIME)` (Date fixed, timers run) instead.
