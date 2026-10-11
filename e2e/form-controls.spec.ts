// UI wave 1 part c: criteria 17, 18, 25-28 in the built Storybook (real Chrome and Edge).
// The 18 part c stories are covered for 14, 15 and the axe half of 18 by the specs that iterate storyIds().
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { colors } from '../packages/shared/src/design-tokens/tokens';
import { MOBILE, openStory, storiesOf, storyIds } from './helpers';

test.use({ viewport: MOBILE });

const rgb = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const INPUT = rgb(colors.input);
const BORDER = rgb(colors.border);

const ROOT = '#storybook-root';
const field = (page: Page) => page.locator(`${ROOT} input:not([type="hidden"]), ${ROOT} select`).first();

test('part c: the 18 part c stories exist in the built Storybook (so the per-story specs cover them): 19 stories', () => {
  const prefixes = ['ui-textinput--', 'shared-formfield--', 'shared-passwordinput--', 'ui-selectinput--'];
  const found = prefixes.map((p) => storyIds().filter((id) => id.startsWith(p)).length);
  expect(found).toEqual([5, 4, 6, 4]);
});

test.describe('TextInput (25)', () => {
  for (const id of ['ui-textinput--empty', 'ui-textinput--filled']) {
    test(`[25] ${id}: the border colour is the input token, not the border token`, async ({ page }) => {
      await openStory(page, id);
      const style = await field(page).evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.borderTopColor, width: s.borderTopWidth, style: s.borderTopStyle };
      });
      expect(style.color).toBe(INPUT);
      expect(style.color).not.toBe(BORDER);
      expect(Number.parseFloat(style.width)).toBeGreaterThan(0);
      expect(style.style).not.toBe('none');
    });
  }

  test('[25] ui-textinput--error-state: aria-invalid="true" and the border is not the decorative border token', async ({
    page,
  }) => {
    await openStory(page, 'ui-textinput--error-state');
    const input = field(page);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await input.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(BORDER);
  });

  test('[25] ui-textinput--disabled: disabled and skipped by Tab', async ({ page }) => {
    await openStory(page, 'ui-textinput--disabled');
    await expect(field(page)).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(field(page)).not.toBeFocused();
  });

  test('[25] ui-textinput--email: dir="ltr", type email, text aligned to the start (left) and not the right', async ({
    page,
  }) => {
    await openStory(page, 'ui-textinput--email');
    const input = field(page);
    await expect(input).toHaveAttribute('dir', 'ltr');
    const s = await input.evaluate((el) => {
      const c = getComputedStyle(el);
      return { direction: c.direction, align: c.textAlign };
    });
    expect(s.direction).toBe('ltr');
    expect(['start', 'left']).toContain(s.align);
  });

  test('[25] ui-textinput--empty: the page is rtl and a plain field inherits it', async ({ page }) => {
    await openStory(page, 'ui-textinput--empty');
    expect(await field(page).evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  });

  test('[17][25] ui-textinput--empty: Tab reaches the field and typing works', async ({ page }) => {
    await openStory(page, 'ui-textinput--empty');
    await page.keyboard.press('Tab');
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('abc');
    await expect(field(page)).toHaveValue('abc');
  });
});

test.describe('FormField (26)', () => {
  for (const id of storiesOf('shared-formfield--')) {
    test(`[26] ${id}: label for/id link, label above the field, no placeholder, describedby ids resolve`, async ({
      page,
    }) => {
      await openStory(page, id);
      const input = field(page);
      const label = page.locator(`${ROOT} label`).first();
      const inputId = await input.getAttribute('id');
      expect(inputId).toBeTruthy();
      await expect(label).toHaveAttribute('for', inputId ?? '');
      await expect(input).not.toHaveAttribute('placeholder', /.+/);
      const lb = await label.boundingBox();
      const ib = await input.boundingBox();
      expect(lb && ib).toBeTruthy();
      if (lb && ib) expect(lb.y + lb.height).toBeLessThanOrEqual(ib.y + 1);
      const dangling = await input.evaluate((el) =>
        (el.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .filter((i) => document.getElementById(i) === null),
      );
      expect(dangling).toEqual([]);
    });
  }

  test('[26] shared-formfield--with-hint: the hint is visible text referenced by aria-describedby', async ({ page }) => {
    await openStory(page, 'shared-formfield--with-hint');
    const ids = ((await field(page).getAttribute('aria-describedby')) ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    const texts = await page.evaluate(
      (list) => list.map((i) => document.getElementById(i)?.textContent?.trim() ?? ''),
      ids,
    );
    expect(texts.some((t) => t.length > 0)).toBe(true);
  });

  test('[26] shared-formfield--with-error: aria-invalid, error text with an icon (not colour alone), referenced', async ({
    page,
  }) => {
    await openStory(page, 'shared-formfield--with-error');
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    const info = await field(page).evaluate((el) => {
      const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      return ids.map((i) => {
        const n = document.getElementById(i);
        return { text: n?.textContent?.trim() ?? '', hasIcon: n?.querySelector('svg[aria-hidden="true"]') !== null };
      });
    });
    const err = info.find((i) => i.hasIcon);
    expect(err, 'an element in aria-describedby has an aria-hidden icon').toBeDefined();
    expect(err?.text.length).toBeGreaterThan(0);
  });

  test('[26] shared-formfield--optional shows "(לא חובה)"; the other field stories do not', async ({ page }) => {
    await openStory(page, 'shared-formfield--optional');
    await expect(page.locator(ROOT)).toContainText('(לא חובה)');
    for (const id of ['shared-formfield--basic', 'shared-formfield--with-hint', 'shared-formfield--with-error']) {
      await openStory(page, id);
      await expect(page.locator(ROOT)).not.toContainText('לא חובה');
    }
  });
});

test.describe('PasswordInput (27, 17)', () => {
  const toggle = (page: Page) => page.locator(`${ROOT} button`).first();

  test('[27] shared-passwordinput--empty: masked; click flips type and aria-pressed both ways', async ({ page }) => {
    await openStory(page, 'shared-passwordinput--empty');
    await expect(field(page)).toHaveAttribute('type', 'password');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await toggle(page).click();
    await expect(field(page)).toHaveAttribute('type', 'text');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await toggle(page).click();
    await expect(field(page)).toHaveAttribute('type', 'password');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('[17][27] shared-passwordinput--empty: Tab, Tab reaches the toggle; Enter and Space each flip it once', async ({
    page,
  }) => {
    await openStory(page, 'shared-passwordinput--empty');
    await page.keyboard.press('Tab');
    await expect(field(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(field(page)).toHaveAttribute('type', 'text');
    await page.keyboard.press('Space');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(field(page)).toHaveAttribute('type', 'password');
  });

  test('[27] the toggle has an accessible name', async ({ page }) => {
    await openStory(page, 'shared-passwordinput--empty');
    const name = await toggle(page).evaluate((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '');
    expect(name.length).toBeGreaterThan(0);
  });

  test('[27] paste is not blocked: a real paste event is not default-prevented', async ({ page }) => {
    await openStory(page, 'shared-passwordinput--empty');
    await field(page).focus();
    const prevented = await field(page).evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'pasted-secret');
      const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test('[27] shared-passwordinput--with-rules: an unmet rule is plain text with hidden "(עדיין לא)", no ✓', async ({
    page,
  }) => {
    await openStory(page, 'shared-passwordinput--with-rules');
    const items = page.locator(`${ROOT} li`);
    expect(await items.count()).toBeGreaterThan(0);
    for (const text of await items.allTextContents()) {
      expect(text).not.toContain('✓');
      expect(text).toContain('(עדיין לא)');
      expect(text).not.toContain('(התקיים)');
    }
  });

  test('[27] shared-passwordinput--rules-met: a met rule carries an aria-hidden ✓ and hidden "(התקיים)"', async ({
    page,
  }) => {
    await openStory(page, 'shared-passwordinput--rules-met');
    const items = page.locator(`${ROOT} li`);
    expect(await items.count()).toBeGreaterThan(0);
    for (const text of await items.allTextContents()) {
      expect(text).toContain('✓');
      expect(text).toContain('(התקיים)');
      expect(text).not.toContain('(עדיין לא)');
    }
    const glyph = page.locator(`${ROOT} li [aria-hidden="true"]`).filter({ hasText: '✓' });
    await expect(glyph.first()).toBeAttached();
    // the status text is not inside the aria-hidden glyph, so it is announced
    await expect(page.locator(`${ROOT} li [aria-hidden="true"]`).filter({ hasText: '(התקיים)' })).toHaveCount(0);
  });

  for (const id of ['shared-passwordinput--empty', 'shared-passwordinput--filled', 'shared-passwordinput--disabled']) {
    test(`[27] ${id}: no list when the story passes no rules`, async ({ page }) => {
      await openStory(page, id);
      await expect(page.locator(`${ROOT} li`)).toHaveCount(0);
    });
  }

  test('[27] shared-passwordinput--error-state: aria-invalid="true"', async ({ page }) => {
    await openStory(page, 'shared-passwordinput--error-state');
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
  });

  test('[27] shared-passwordinput--disabled: the input is disabled', async ({ page }) => {
    await openStory(page, 'shared-passwordinput--disabled');
    await expect(field(page)).toBeDisabled();
  });
});

test.describe('SelectInput (28, 17)', () => {
  test('[28] ui-selectinput--placeholder: value is "" and the shown option is the placeholder', async ({ page }) => {
    await openStory(page, 'ui-selectinput--placeholder');
    await expect(field(page)).toHaveValue('');
    const selected = await field(page).evaluate((el) => (el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent : null));
    expect(selected).toBe('בחירה');
  });

  test('[28] ui-selectinput--selected: a non-empty value is selected', async ({ page }) => {
    await openStory(page, 'ui-selectinput--selected');
    expect(await field(page).inputValue()).not.toBe('');
  });

  test('[28] ui-selectinput--error-state: aria-invalid="true"', async ({ page }) => {
    await openStory(page, 'ui-selectinput--error-state');
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
  });

  test('[28] ui-selectinput--disabled: disabled and skipped by Tab', async ({ page }) => {
    await openStory(page, 'ui-selectinput--disabled');
    await expect(field(page)).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(field(page)).not.toBeFocused();
  });

  test('[17][28] ui-selectinput--placeholder: Tab reaches it and the keyboard selects an option', async ({ page }) => {
    await openStory(page, 'ui-selectinput--placeholder');
    await page.keyboard.press('Tab');
    await expect(field(page)).toBeFocused();
    // The story may hold the value fixed (controlled, no state), so record the value at the moment of the
    // change event instead of reading it afterwards.
    await field(page).evaluate((el) => {
      el.addEventListener('change', () => {
        if (el instanceof HTMLSelectElement) el.dataset['seen'] = `${el.dataset['seen'] ?? ''}|${el.value}`;
      });
    });
    await page.keyboard.press('ArrowDown');
    await expect(field(page)).toHaveAttribute('data-seen', /^|.+$/);
  });

  test('[28] the field border is the input token', async ({ page }) => {
    await openStory(page, 'ui-selectinput--placeholder');
    expect(await field(page).evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(INPUT);
  });
});

// 18: the primary touch action of each part c story is at least 44 x 44.
const touchIds = [
  ...storiesOf('ui-textinput--'),
  ...storiesOf('shared-formfield--'),
  ...storiesOf('shared-passwordinput--'),
  ...storiesOf('ui-selectinput--'),
];
for (const id of touchIds) {
  test(`[18] ${id}: the field is at least 44 px high and the toggle is 44 x 44`, async ({ page }) => {
    await openStory(page, id);
    const box = await field(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    const toggle = page.locator(`${ROOT} button`);
    for (let i = 0; i < (await toggle.count()); i += 1) {
      const b = await toggle.nth(i).boundingBox();
      expect(b?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}

// Review round (CRITIC findings 2 and addendum).
test.describe('PasswordInput geometry and token (27)', () => {
  for (const id of ['shared-passwordinput--filled', 'shared-passwordinput--empty', 'shared-passwordinput--with-rules']) {
    test(`[27] ${id}: the toggle does not intersect the text area of the input (RTL page, dir=ltr field)`, async ({
      page,
    }) => {
      await openStory(page, id);
      expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
      const g = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('#storybook-root input');
        const toggle = document.querySelector<HTMLElement>('#storybook-root button');
        if (!input || !toggle) return null;
        const r = input.getBoundingClientRect();
        const c = getComputedStyle(input);
        const t = toggle.getBoundingClientRect();
        return {
          dir: input.getAttribute('dir'),
          textLeft: r.left + Number.parseFloat(c.borderLeftWidth) + Number.parseFloat(c.paddingLeft),
          textRight: r.right - Number.parseFloat(c.borderRightWidth) - Number.parseFloat(c.paddingRight),
          toggleLeft: t.left,
          toggleRight: t.right,
          inputLeft: r.left,
          inputRight: r.right,
        };
      });
      expect(g).not.toBeNull();
      if (!g) return;
      expect(g.dir).toBe('ltr');
      expect(g.textRight - g.textLeft, 'the text area has width').toBeGreaterThan(40);
      // the toggle sits over the input box, so the check is not vacuous
      expect(g.toggleRight).toBeGreaterThan(g.inputLeft);
      expect(g.toggleLeft).toBeLessThan(g.inputRight);
      // no horizontal overlap between toggle and text area
      const overlap = Math.min(g.toggleRight, g.textRight) - Math.max(g.toggleLeft, g.textLeft);
      expect(overlap, 'toggle overlaps the text area by this many px').toBeLessThanOrEqual(0);
    });
  }

  for (const id of ['shared-passwordinput--empty', 'shared-passwordinput--filled']) {
    test(`[27] ${id}: the field border is the input token, not the border token`, async ({ page }) => {
      await openStory(page, id);
      const color = await field(page).evaluate((el) => getComputedStyle(el).borderTopColor);
      expect(color).toBe(INPUT);
      expect(color).not.toBe(BORDER);
    });
  }
});

test.describe('SelectInput text colour (28)', () => {
  const colorOf = (page: Page) => field(page).evaluate((el) => getComputedStyle(el).color);

  test('[28] ui-selectinput--placeholder: the shown text is muted-foreground', async ({ page }) => {
    await openStory(page, 'ui-selectinput--placeholder');
    expect(await colorOf(page)).toBe(rgb(colors['muted-foreground']));
  });

  test('[28] ui-selectinput--selected: a real choice shows foreground', async ({ page }) => {
    await openStory(page, 'ui-selectinput--selected');
    expect(await colorOf(page)).toBe(rgb(colors.foreground));
  });
});
