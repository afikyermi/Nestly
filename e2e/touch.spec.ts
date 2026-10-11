// UI wave 1 criterion 18: every visible, enabled interactive control of every story is at least 44 x 44 CSS px.
// Generic on purpose: stories added by later parts are covered automatically.
// Addendum after part d: an a[href] whose computed display is `inline` and whose parent element also contains text
// outside the link (WCAG 2.5.8 inline exception) is exempt. Every other control keeps the 44 x 44 check.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOBILE, openStory, storyIds } from './helpers';

test.use({ viewport: MOBILE });

const INTERACTIVE = [
  'button',
  'a[href]',
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
  'select',
  '[role="button"]',
].join(', ');

interface Small {
  tag: string;
  text: string;
  width: number;
  height: number;
}

/** Visible, enabled controls under 44 x 44 inside `rootSelector`, minus the inline-link exemption. */
async function smallTargets(page: Page, rootSelector: string): Promise<Small[]> {
  return page.evaluate(
    ({ selector, root }) => {
      const scoped = selector
        .split(', ')
        .map((s) => `${root} ${s}`)
        .join(', ');
      const out: Small[] = [];
      for (const el of Array.from(document.querySelectorAll(scoped))) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible =
          style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
        if (!visible || disabled) continue;
        if (rect.width >= 44 && rect.height >= 44) continue;
        // The inline exception: an a[href], computed display inline, in a parent that has other text.
        if (el.matches('a[href]') && style.display === 'inline' && el.parentElement) {
          // "text outside the link" = a letter or digit outside every a and button of the parent;
          // separators such as "|" do not make a sentence.
          const clone = el.parentElement.cloneNode(true);
          if (clone instanceof Element) {
            for (const other of Array.from(clone.querySelectorAll('a, button'))) other.remove();
            if (/[\p{L}\p{N}]/u.test(clone.textContent ?? '')) continue;
          }
        }
        out.push({
          tag: el.tagName.toLowerCase(),
          text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
          width: rect.width,
          height: rect.height,
        });
      }
      return out;
    },
    { selector: INTERACTIVE, root: rootSelector },
  );
}

test('[18] the story list is not empty (the generic check has something to iterate)', () => {
  expect(storyIds().length).toBeGreaterThan(0);
});

for (const id of storyIds()) {
  test(`[18] ${id}: every visible, enabled control is at least 44 x 44 CSS px (inline links in a sentence exempt)`, async ({
    page,
  }) => {
    await openStory(page, id);
    expect(await smallTargets(page, '#storybook-root'), 'controls under 44 x 44').toEqual([]);
  });
}

// Controls for the exemption: it must not swallow real targets. The same function judges hand-made pages.
test.describe('[18] the inline-link exemption is narrow', () => {
  const judge = async (page: Page, inner: string): Promise<Small[]> => {
    await page.setContent(`<div id="storybook-root" dir="rtl" lang="he">${inner}</div>`);
    return smallTargets(page, '#storybook-root');
  };

  test('[18] control: an inline link inside a sentence is exempt', async ({ page }) => {
    expect(await judge(page, '<p>אני מסכים ל<a href="/terms">תנאים</a> ול<a href="/privacy">פרטיות</a></p>')).toEqual([]);
  });

  test('[18] control: a display:block link inside a sentence still fails', async ({ page }) => {
    const small = await judge(page, '<p>אני מסכים ל<a href="/terms" style="display:block">תנאים</a></p>');
    expect(small.map((s) => s.tag)).toEqual(['a']);
  });

  test('[18] control: a display:inline-block link inside a sentence still fails', async ({ page }) => {
    const small = await judge(page, '<p>אני מסכים ל<a href="/terms" style="display:inline-block">תנאים</a></p>');
    expect(small.map((s) => s.tag)).toEqual(['a']);
  });

  test('[18] control: an inline link that is alone in its parent (no other text) still fails', async ({ page }) => {
    const small = await judge(page, '<p><a href="/terms">תנאים</a></p>');
    expect(small.map((s) => s.tag)).toEqual(['a']);
  });

  test('[18] control: an inline link beside only whitespace still fails', async ({ page }) => {
    const small = await judge(page, '<p>  <a href="/terms">תנאים</a>  </p>');
    expect(small.map((s) => s.tag)).toEqual(['a']);
  });

  test('[18] control: two links separated by "|" in one parent are not a sentence and still fail', async ({ page }) => {
    const small = await judge(page, '<p><a href="/a">תנאים</a> | <a href="/b">פרטיות</a></p>');
    expect(small.map((s) => s.tag)).toEqual(['a', 'a']);
  });

  test('[18] control: a link and a button side by side with only a separator still fail', async ({ page }) => {
    const small = await judge(page, '<p><a href="/a">תנאים</a> · <button type="button">עוד</button></p>');
    expect(small.map((s) => s.tag).sort()).toEqual(['a', 'button']);
  });

  // Reading of the addendum: "text outside every a and button in the parent". A label followed by a stand-alone link
  // has such text ("סיסמה"), so by the literal definition the link is exempt. Pinned here so a change is deliberate;
  // reported to SPEC as a possible loophole.
  test('[18] control (pinned reading): a label text followed by a stand-alone link counts as text outside the link', async ({
    page,
  }) => {
    expect(await judge(page, '<div>סיסמה <a href="/forgot">שכחתי</a></div>')).toEqual([]);
  });

  test('[18] control: a too-small button inside a sentence still fails', async ({ page }) => {
    const small = await judge(page, '<p>טקסט <button type="button" style="width:20px;height:20px">x</button> טקסט</p>');
    expect(small.map((s) => s.tag)).toEqual(['button']);
  });

  test('[18] control: a 44 x 44 link passes and a 43 x 44 button fails', async ({ page }) => {
    expect(
      await judge(page, '<a href="/x" style="display:block;width:44px;height:44px">x</a>'),
    ).toEqual([]);
    const small = await judge(page, '<button type="button" style="width:43px;height:44px">x</button>');
    expect(small.map((s) => s.tag)).toEqual(['button']);
  });

  test('[18] control: a link without href is not exempt as a link (a span-like anchor is not an a[href])', async ({
    page,
  }) => {
    // a[href] only: a [role=button] styled inline in a sentence still fails
    const small = await judge(page, '<p>טקסט <span role="button" tabindex="0" style="display:inline">x</span> טקסט</p>');
    expect(small.map((s) => s.tag)).toEqual(['span']);
  });
});
