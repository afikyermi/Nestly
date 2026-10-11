// UI wave 1 part d: criteria 29-33, 17, 18 in the built Storybook (real Chrome and Edge, RTL page at 375).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { colors } from '../packages/shared/src/design-tokens/tokens';
import { MOBILE, openStory, storiesOf } from './helpers';

test.use({ viewport: MOBILE });

const rgb = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const ROOT = '#storybook-root';

test('part d: the part d stories exist (so the per-story specs cover them)', () => {
  const prefixes = [
    'shared-dateinput--',
    'shared-choicecardgroup--',
    'shared-stepindicator--',
    'ui-checkbox--',
    'shared-inlinealert--',
  ];
  const counts = prefixes.map((p) => storiesOf(p).length);
  for (const c of counts) expect(c).toBeGreaterThanOrEqual(2);
  expect(counts[0]).toBeGreaterThanOrEqual(3); // empty, filled, error
  expect(counts[1]).toBeGreaterThanOrEqual(4); // unselected, selected, error, + one more
  expect(counts[3]).toBeGreaterThanOrEqual(4); // unchecked, checked, error, required
});

test.describe('DateInput (29)', () => {
  const fields = (page: Page) => page.locator(`${ROOT} fieldset input`);

  for (const id of ['shared-dateinput--empty', 'shared-dateinput--filled', 'shared-dateinput--error-state']) {
    test(`[29] ${id}: three named fields in a fieldset with a legend, numeric inputMode`, async ({ page }) => {
      await openStory(page, id);
      await expect(page.locator(`${ROOT} fieldset > legend`)).toHaveCount(1);
      await expect(fields(page)).toHaveCount(3);
      for (const name of ['יום', 'חודש', 'שנה']) {
        await expect(page.getByLabel(name, { exact: true })).toHaveAttribute('inputmode', 'numeric');
      }
    });

    test(`[29] ${id}: in the RTL page at 375 the three fields do not overlap and stay inside the viewport`, async ({
      page,
    }) => {
      await openStory(page, id);
      expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
      const boxes = [];
      for (const name of ['יום', 'חודש', 'שנה']) {
        const b = await page.getByLabel(name, { exact: true }).boundingBox();
        expect(b, `box of ${name}`).not.toBeNull();
        if (b) boxes.push({ name, ...b });
      }
      for (const b of boxes) {
        expect(b.x, `${b.name} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${b.name} right edge`).toBeLessThanOrEqual(MOBILE.width);
        expect(b.width, `${b.name} has usable width`).toBeGreaterThan(30);
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const c = boxes[j];
          if (!a || !c) continue;
          const overlapX = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x);
          const overlapY = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
          expect(overlapX > 0.5 && overlapY > 0.5, `${a.name} overlaps ${c.name}`).toBe(false);
        }
      }
      const doc = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(doc, 'no horizontal scroll').toBeLessThanOrEqual(MOBILE.width);
    });
  }

  test('[29] shared-dateinput--filled shows values; empty shows none', async ({ page }) => {
    await openStory(page, 'shared-dateinput--filled');
    for (const name of ['יום', 'חודש', 'שנה']) {
      expect(await page.getByLabel(name, { exact: true }).inputValue()).not.toBe('');
    }
    await openStory(page, 'shared-dateinput--empty');
    for (const name of ['יום', 'חודש', 'שנה']) {
      await expect(page.getByLabel(name, { exact: true })).toHaveValue('');
    }
  });

  test('[29] shared-dateinput--error-state: every field is aria-invalid and none is in the empty story', async ({
    page,
  }) => {
    await openStory(page, 'shared-dateinput--error-state');
    for (const name of ['יום', 'חודש', 'שנה']) {
      await expect(page.getByLabel(name, { exact: true })).toHaveAttribute('aria-invalid', 'true');
    }
    await openStory(page, 'shared-dateinput--empty');
    for (const name of ['יום', 'חודש', 'שנה']) {
      await expect(page.getByLabel(name, { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
    }
  });

  test('[29] shared-dateinput--disabled: all three fields are disabled', async ({ page }) => {
    await openStory(page, 'shared-dateinput--disabled');
    for (const name of ['יום', 'חודש', 'שנה']) await expect(page.getByLabel(name, { exact: true })).toBeDisabled();
  });

  test('[17][29] shared-dateinput--empty: Tab visits all three fields and numbers can be typed', async ({ page }) => {
    await openStory(page, 'shared-dateinput--empty');
    const visited: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      visited.push(await page.evaluate(() => document.activeElement?.id ?? ''));
    }
    expect(new Set(visited).size).toBe(3);
    await page.getByLabel('יום', { exact: true }).focus();
    await page.keyboard.type('12');
    await expect(page.getByLabel('יום', { exact: true })).toHaveValue('12');
  });
});

test.describe('ChoiceCardGroup (30)', () => {
  const radios = (page: Page) => page.locator(`${ROOT} input[type="radio"], ${ROOT} [role="radio"]`);
  const checked = (page: Page) =>
    page.locator(`${ROOT} input[type="radio"]:checked, ${ROOT} [role="radio"][aria-checked="true"]`);

  /** What the user sees for one radio: its card is the label bound to it (or the radio itself when it is a role). */
  const cardStyle = (radio: Locator) =>
    radio.evaluate((el) => {
      const card = el instanceof HTMLInputElement ? (el.labels?.[0] ?? null) : el;
      if (!card) return null;
      const cs = getComputedStyle(card);
      const rect = card.getBoundingClientRect();
      // label text colour: the first text node that is not the check glyph
      let labelColor = '';
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? '').trim();
        if (text && text !== '✓' && n.parentElement) {
          labelColor = getComputedStyle(n.parentElement).color;
          break;
        }
      }
      // the check mark: the glyph in text, or an svg icon
      let markRect: DOMRect | null = null;
      const w2 = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = w2.nextNode(); n; n = w2.nextNode()) {
        if ((n.textContent ?? '').includes('✓')) {
          const r = document.createRange();
          r.selectNodeContents(n);
          markRect = r.getBoundingClientRect();
          break;
        }
      }
      if (!markRect) markRect = card.querySelector('svg')?.getBoundingClientRect() ?? null;
      return {
        borderWidth: cs.borderTopWidth,
        borderStyle: cs.borderTopStyle,
        borderColor: cs.borderTopColor,
        labelColor,
        height: rect.height,
        width: rect.width,
        hasMark: markRect !== null,
        card: { left: rect.left, right: rect.right },
        mark: markRect ? { left: markRect.left, right: markRect.right } : null,
      };
    });

  for (const id of [
    'shared-choicecardgroup--unselected',
    'shared-choicecardgroup--selected',
    'shared-choicecardgroup--error-state',
  ]) {
    test(`[30] ${id}: radio group in a fieldset with a legend, at most one checked`, async ({ page }) => {
      await openStory(page, id);
      await expect(page.locator(`${ROOT} fieldset > legend`)).toHaveCount(1);
      expect(await radios(page).count()).toBeGreaterThanOrEqual(2);
      expect(await checked(page).count()).toBeLessThanOrEqual(1);
    });
  }

  test('[30] shared-choicecardgroup--unselected: nothing checked and no card shows a mark', async ({ page }) => {
    await openStory(page, 'shared-choicecardgroup--unselected');
    expect(await checked(page).count()).toBe(0);
    const all = radios(page);
    for (let i = 0; i < (await all.count()); i += 1) {
      expect((await cardStyle(all.nth(i)))?.hasMark).toBe(false);
    }
  });

  test('[30] shared-choicecardgroup--selected: one checked card with a mark, 2px primary border, primary-strong text', async ({
    page,
  }) => {
    await openStory(page, 'shared-choicecardgroup--selected');
    expect(await checked(page).count()).toBe(1);
    const info = await cardStyle(checked(page).first());
    expect(info, 'a card for the checked radio').not.toBeNull();
    expect(info?.hasMark).toBe(true);
    expect(info?.borderWidth).toBe('2px');
    expect(info?.borderStyle).not.toBe('none');
    expect(info?.borderColor).toBe(rgb(colors.primary));
    expect(info?.labelColor).toBe(rgb(colors['primary-strong']));
  });

  test('[30] shared-choicecardgroup--selected: unselected cards are not primary-bordered and show no mark', async ({
    page,
  }) => {
    await openStory(page, 'shared-choicecardgroup--selected');
    const all = radios(page);
    let unselected = 0;
    for (let i = 0; i < (await all.count()); i += 1) {
      const r = all.nth(i);
      const on = await r.evaluate((el) =>
        el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true',
      );
      if (on) continue;
      unselected += 1;
      const s = await cardStyle(r);
      expect(s).not.toBeNull();
      expect(s?.hasMark).toBe(false);
      expect(s?.borderColor === rgb(colors.primary)).toBe(false);
      expect(s?.labelColor === rgb(colors['primary-strong'])).toBe(false);
    }
    expect(unselected).toBeGreaterThanOrEqual(1);
  });

  test('[30] shared-choicecardgroup--selected: the mark sits at the inline-start edge of its card (right side, RTL)', async ({
    page,
  }) => {
    await openStory(page, 'shared-choicecardgroup--selected');
    expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
    const g = await cardStyle(checked(page).first());
    expect(g?.mark, 'a mark inside the selected card').not.toBeNull();
    if (!g?.mark) return;
    const gapStart = g.card.right - g.mark.right; // the right edge is inline-start in RTL
    const gapEnd = g.mark.left - g.card.left;
    expect(gapStart).toBeGreaterThanOrEqual(0);
    expect(gapStart, 'closer to the inline-start edge than to the inline-end edge').toBeLessThan(gapEnd);
    expect(gapStart).toBeLessThan(40);
  });

  test('[30] shared-choicecardgroup--error-state: the cards look different from plain ones and are not the decorative border', async ({
    page,
  }) => {
    await openStory(page, 'shared-choicecardgroup--error-state');
    const err = await cardStyle(radios(page).first());
    await openStory(page, 'shared-choicecardgroup--unselected');
    const plain = await cardStyle(radios(page).first());
    expect(err?.borderColor).not.toBe(rgb(colors.border));
    expect(err?.borderColor, 'error border differs from a plain card').not.toBe(plain?.borderColor);
    expect(err?.hasMark).toBe(false);
  });

  test('[17][30] shared-choicecardgroup--interactive: one tab stop; Arrow keys move the selection in RTL (Right = previous, Left = next)', async ({
    page,
  }) => {
    await openStory(page, 'shared-choicecardgroup--interactive');
    expect(await page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
    const all = radios(page);
    expect(await all.count()).toBeGreaterThanOrEqual(3);
    const isChecked = (i: number) =>
      all.nth(i).evaluate((el) => (el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true'));
    await page.locator(`${ROOT} label`).nth(1).click(); // select the second card with the pointer
    expect(await isChecked(1)).toBe(true);

    // one tab stop: from a control before the group, Tab lands on the selected radio; the next Tab leaves the group
    await page.evaluate(() => {
      const before = document.createElement('button');
      before.id = 'probe-before';
      before.type = 'button';
      before.textContent = 'before';
      document.querySelector('#storybook-root')?.prepend(before);
    });
    await page.locator('#probe-before').focus();
    await page.keyboard.press('Tab');
    await expect(all.nth(1)).toBeFocused();
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.activeElement?.closest('fieldset') ?? null),
      'the second Tab left the radio group',
    ).toBeNull();

    await all.nth(1).focus();
    await page.keyboard.press('ArrowLeft'); // RTL: next
    expect(await isChecked(2), 'ArrowLeft selects the next card in RTL').toBe(true);
    expect(await isChecked(1)).toBe(false);
    await page.keyboard.press('ArrowRight'); // RTL: previous
    expect(await isChecked(1), 'ArrowRight selects the previous card in RTL').toBe(true);
    await page.keyboard.press('ArrowRight');
    expect(await isChecked(0)).toBe(true);
    expect(await checked(page).count(), 'at most one selected').toBe(1);
  });

  test('[30] shared-choicecardgroup--disabled: every radio is disabled and skipped by Tab', async ({ page }) => {
    await openStory(page, 'shared-choicecardgroup--disabled');
    const all = radios(page);
    for (let i = 0; i < (await all.count()); i += 1) {
      expect(await all.nth(i).evaluate((el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true')).toBe(true);
    }
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('type') === 'radio')).toBe(false);
  });

  for (const id of ['shared-choicecardgroup--unselected', 'shared-choicecardgroup--selected']) {
    test(`[18][30] ${id}: each card is at least 44 px high and the page has no horizontal scroll`, async ({ page }) => {
      await openStory(page, id);
      const all = radios(page);
      for (let i = 0; i < (await all.count()); i += 1) {
        const s = await cardStyle(all.nth(i));
        expect(s?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(s?.width ?? 0).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE.width);
    });
  }
});

test.describe('StepIndicator (31)', () => {
  /** The bar is aria-hidden; its leaf elements are the segments. A segment is "on" when it is painted primary. */
  const info = (page: Page, primary: string) =>
    page.evaluate(
      ({ rootSel, on }) => {
        const root = document.querySelector(rootSel);
        const bar = root?.querySelector('[aria-hidden="true"]');
        if (!root || !bar) return null;
        const barRect = bar.getBoundingClientRect();
        const leaves = Array.from(bar.querySelectorAll('*')).filter((e) => e.children.length === 0);
        const segs = (leaves.length ? leaves : [bar]).map((e) => ({
          rect: e.getBoundingClientRect(),
          on: getComputedStyle(e).backgroundColor === on,
        }));
        const total = segs.reduce((a, s) => a + s.rect.width, 0);
        const filled = segs.filter((s) => s.on);
        return {
          text: (root.textContent ?? '').trim(),
          barHeight: barRect.height,
          coverage: total === 0 ? 0 : filled.reduce((a, s) => a + s.rect.width, 0) / total,
          filledRights: filled.map((s) => s.rect.right),
          barRight: barRect.right,
        };
      },
      { rootSel: ROOT, on: primary },
    );

  test('[31] shared-stepindicator--first-of-two: text "שלב 1 מתוך 2", bar about half primary, starting at the inline-start edge', async ({
    page,
  }) => {
    await openStory(page, 'shared-stepindicator--first-of-two');
    const i = await info(page, rgb(colors.primary));
    expect(i).not.toBeNull();
    if (!i) return;
    expect(i.text).toContain('שלב 1 מתוך 2');
    expect(i.barHeight).toBeGreaterThan(0);
    expect(i.coverage).toBeGreaterThan(0.4);
    expect(i.coverage).toBeLessThan(0.6);
    // RTL: progress starts at the right edge
    expect(Math.max(...i.filledRights)).toBeGreaterThan(i.barRight - 2);
  });

  test('[31] shared-stepindicator--last-of-two: text "שלב 2 מתוך 2" and the bar is full', async ({ page }) => {
    await openStory(page, 'shared-stepindicator--last-of-two');
    const i = await info(page, rgb(colors.primary));
    expect(i).not.toBeNull();
    if (!i) return;
    expect(i.text).toContain('שלב 2 מתוך 2');
    expect(i.coverage).toBeGreaterThan(0.98);
  });
});

test.describe('Checkbox (32)', () => {
  const box = (page: Page) => page.locator(`${ROOT} input[type="checkbox"], ${ROOT} [role="checkbox"]`).first();
  const isOn = (page: Page) =>
    box(page).evaluate((el) => (el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true'));

  test('[32] ui-checkbox--unchecked / checked: initial states', async ({ page }) => {
    await openStory(page, 'ui-checkbox--unchecked');
    expect(await isOn(page)).toBe(false);
    await openStory(page, 'ui-checkbox--checked');
    expect(await isOn(page)).toBe(true);
  });

  test('[17][32] ui-checkbox--unchecked: Tab reaches it, Space toggles on and off, Enter does not toggle', async ({
    page,
  }) => {
    await openStory(page, 'ui-checkbox--unchecked');
    await page.keyboard.press('Tab');
    await expect(box(page)).toBeFocused();
    await page.keyboard.press('Space');
    expect(await isOn(page)).toBe(true);
    await page.keyboard.press('Space');
    expect(await isOn(page)).toBe(false);
    await page.keyboard.press('Enter');
    expect(await isOn(page)).toBe(false);
  });

  test('[32] ui-checkbox--error-state: aria-invalid; ui-checkbox--required: required exposed', async ({ page }) => {
    await openStory(page, 'ui-checkbox--error-state');
    await expect(box(page)).toHaveAttribute('aria-invalid', 'true');
    await openStory(page, 'ui-checkbox--required');
    const required = await box(page).evaluate(
      (el) => el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    );
    expect(required).toBe(true);
  });

  test('[32] ui-checkbox--disabled: disabled and skipped by Tab', async ({ page }) => {
    await openStory(page, 'ui-checkbox--disabled');
    expect(await box(page).evaluate((el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true')).toBe(true);
    await page.keyboard.press('Tab');
    await expect(box(page)).not.toBeFocused();
  });

  test('[32] a link inside the label is a real link and clicking it does not toggle the checkbox', async ({ page }) => {
    await openStory(page, 'ui-checkbox--unchecked');
    const links = page.locator(`${ROOT} a[href]`);
    expect(await links.count(), 'the label of the unchecked story holds at least one link (terms / privacy)').toBeGreaterThan(0);
    // keep the click inert: no navigation away from the story
    await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
    await links.first().click();
    expect(await isOn(page)).toBe(false);
  });

  test('[18][32] ui-checkbox--unchecked: the tap area (control or its label) is at least 44 px high', async ({ page }) => {
    await openStory(page, 'ui-checkbox--unchecked');
    const h = await box(page).evaluate((el) => {
      const own = el.getBoundingClientRect().height;
      const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
      return Math.max(own, label ? label.getBoundingClientRect().height : 0);
    });
    expect(h).toBeGreaterThanOrEqual(44);
  });
});

test.describe('InlineAlert (33)', () => {
  for (const id of ['shared-inlinealert--error-variant', 'shared-inlinealert--long-text']) {
    test(`[33] ${id}: role="alert", aria-hidden icon, visible text, within the viewport`, async ({ page }) => {
      await openStory(page, id);
      const alert = page.locator(`${ROOT} [role="alert"]`);
      await expect(alert).toHaveCount(1);
      await expect(alert.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      const text = (await alert.textContent())?.trim() ?? '';
      expect(text.length).toBeGreaterThan(0);
      const b = await alert.boundingBox();
      expect(b).not.toBeNull();
      expect((b?.x ?? -1)).toBeGreaterThanOrEqual(0);
      expect((b?.x ?? 0) + (b?.width ?? 0)).toBeLessThanOrEqual(MOBILE.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE.width);
    });
  }

  test('[33] shared-inlinealert--error-variant: the text is not coloured as the card background (not invisible)', async ({
    page,
  }) => {
    await openStory(page, 'shared-inlinealert--error-variant');
    const alert = page.locator(`${ROOT} [role="alert"]`);
    const c = await alert.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor };
    });
    expect(c.color).not.toBe(c.bg);
  });
});
