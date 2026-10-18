// WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum), AA: when a control receives keyboard focus it is not entirely hidden by
// author-created content. Here the author-created content is the sticky top bar (<header>) and the primary navigation
// (<nav>: the bottom bar below 1024, the rail from 1024). Regression for the suspected defect in debt.md:108.
// Derived from the criterion, not from the layout code. For EVERY control reached by Tab (first to last) and then by Shift+Tab
// (last back to the first), at 375x812 and 1024x768, on a screen long enough to scroll:
//   (a) the control's box has visible area outside both bars' boxes, and
//   (b) the element at the control's centre (document.elementFromPoint) is the control or one of its descendants.
// The skip link is the one control that is drawn ON TOP of the top bar by design (it appears over the bar on focus, above it in
// the stacking order): for it only (b) is asserted, since (b) is what proves it is not covered.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP, pathOf } from './app-helpers';
import { EMAIL, MOBILE } from './support/journeys-stub';
import { entry, setupProfiles } from './support/profiles-stub';
import { NOA, NOA_ID, PASSWORD, base, world } from './support/profiles-fixtures';


test.use({ baseURL: APP });

const SIZES = [
  { label: '375x812', viewport: MOBILE },
  { label: '1024x768', viewport: { width: 1024, height: 768 } },
] as const;

/** Enough links that the screen is several viewports high at both sizes. */
const MANY = (prefix: string, n: number): Array<{ userId: string; fullName: string }> =>
  Array.from({ length: n }, (_, i) =>
    entry({ userId: `e0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, fullName: `${prefix} ${i + 1}` }),
  );

interface Probe {
  tag: string;
  name: string;
  isSkipLink: boolean;
  rect: { x: number; y: number; w: number; h: number };
  bars: Array<{ which: string; x: number; y: number; w: number; h: number }>;
  /** Area of the control's box that no bar covers. */
  freeArea: number;
  centreHit: boolean;
  centreHitTag: string;
  scrollerTop: number;
}

/** Waits until the focused element's box stops moving (scroll-into-view finished), then measures it. */
async function probe(page: Page): Promise<Probe> {
  return page.evaluate(
    () =>
      new Promise<Probe>((resolve) => {
        const measure = (): Probe | null => {
          const el = document.activeElement;
          if (el === null || el === document.body) return null;
          const r = el.getBoundingClientRect();
          const bars: Probe['bars'] = [];
          for (const [which, node] of [['header', document.querySelector('header')], ['nav', document.querySelector('nav')]] as const) {
            // A control that is part of a bar is not covered by that bar; only the other bar can cover it.
            if (node === null || node.contains(el)) continue;
            const b = node.getBoundingClientRect();
            bars.push({ which, x: b.x, y: b.y, w: b.width, h: b.height });
          }
          // Free area: the box minus the union of bar boxes, by 1px-row/column sampling of the box (exact for axis-aligned boxes).
          let free = 0;
          const x0 = Math.floor(r.left);
          const x1 = Math.ceil(r.right);
          const y0 = Math.floor(r.top);
          const y1 = Math.ceil(r.bottom);
          for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
              const inBar = bars.some((b) => x + 0.5 >= b.x && x + 0.5 < b.x + b.w && y + 0.5 >= b.y && y + 0.5 < b.y + b.h);
              if (!inBar) free += 1;
            }
          }
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const main = document.querySelector('main');
          return {
            tag: el.tagName.toLowerCase(),
            name: el.getAttribute('aria-label') ?? (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
            isSkipLink: el instanceof HTMLAnchorElement && el.getAttribute('href')?.startsWith('#') === true && el === document.querySelector('a'),
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            bars,
            freeArea: free,
            centreHit: hit !== null && (hit === el || el.contains(hit)),
            centreHitTag: hit === null ? 'null (outside the viewport)' : `${hit.tagName.toLowerCase()} ${(hit.getAttribute('aria-label') ?? hit.textContent ?? '').slice(0, 30)}`,
            scrollerTop: (main?.scrollTop ?? 0) + window.scrollY,
          };
        };
        let last = '';
        let stable = 0;
        let frames = 0;
        const tick = (): void => {
          frames += 1;
          const m = measure();
          const key = JSON.stringify(m?.rect ?? null) + String(m?.scrollerTop ?? 0);
          stable = key === last ? stable + 1 : 0;
          last = key;
          if (m !== null && (stable >= 3 || frames > 120)) resolve(m);
          else if (m === null && frames > 120) resolve({ tag: 'body', name: '', isSkipLink: false, rect: { x: 0, y: 0, w: 0, h: 0 }, bars: [], freeArea: 0, centreHit: false, centreHitTag: '', scrollerTop: 0 });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

function verdict(p: Probe): string[] {
  const out: string[] = [];
  const where = `"${p.name}" <${p.tag}> rect=${JSON.stringify(p.rect)} bars=${JSON.stringify(p.bars)} at point: ${p.centreHitTag}`;
  if (p.tag === 'body') out.push(`focus was lost to body ${where}`);
  if (!p.isSkipLink && p.freeArea <= 0) out.push(`entirely inside the bars ${where}`);
  if (!p.centreHit) out.push(`centre is covered by another element ${where}`);
  return out;
}

async function signInAndOpen(page: Page, path: string, lastLink: string): Promise<void> {
  await setupProfiles(page, world({
    [NOA_ID]: { view: base(NOA, { friends: MANY('חבר', 24), mutualFriends: MANY('משותף', 12) }) },
  }));
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await expect.poll(() => pathOf(page)).not.toBe('/login');
  await page.goto(path);
  await expect(page.getByRole('main').getByRole('link', { name: new RegExp(lastLink) })).toBeVisible();
}

const SCREENS = [
  { label: '/u/:id (long list of links)', path: `/u/${NOA_ID}`, lastLink: 'משותף 12' },
] as const;

for (const size of SIZES) {
  for (const screen of SCREENS) {
    test.describe(`[SC 2.4.11 focus not obscured] ${screen.label} at ${size.label}`, () => {
      test.use({ viewport: size.viewport });

      test('[SC 2.4.11] Tab to the last control, then Shift+Tab to the first: each focused control is not covered by the top bar or the navigation', async ({ page }) => {
        await signInAndOpen(page, screen.path, screen.lastLink);

        // The page really scrolls (otherwise the test proves nothing about scroll position).
        const scrolls = await page.evaluate(() => {
          const main = document.querySelector('main');
          return Math.max((main?.scrollHeight ?? 0) - (main?.clientHeight ?? 0), document.documentElement.scrollHeight - window.innerHeight);
        });
        expect(scrolls, 'the screen is longer than the viewport').toBeGreaterThan(400);

        await page.evaluate(() => { const a = document.activeElement; if (a instanceof HTMLElement) a.blur(); });
        const forward: Probe[] = [];
        const problems: string[] = [];
        for (let i = 0; i < 200; i += 1) {
          await page.keyboard.press('Tab');
          const p = await probe(page);
          if (p.tag === 'body') break;
          // Wrapped around to the first stop: the cycle is complete.
          if (forward.length > 3 && forward[0] !== undefined && p.name === forward[0].name && p.tag === forward[0].tag && p.isSkipLink) break;
          forward.push(p);
          problems.push(...verdict(p).map((v) => `Tab #${i + 1}: ${v}`));
        }
        expect(forward.length, 'Tab reached many controls').toBeGreaterThan(30);
        expect(forward.at(-1)?.name, 'Tab reached the last control of the screen').toContain('משותף');

        const backward: Probe[] = [];
        for (let i = 0; i < forward.length; i += 1) {
          await page.keyboard.press('Shift+Tab');
          const p = await probe(page);
          if (p.tag === 'body') break;
          backward.push(p);
          problems.push(...verdict(p).map((v) => `Shift+Tab #${i + 1}: ${v}`));
          if (p.isSkipLink) break;
        }
        expect(backward.at(-1)?.isSkipLink, 'Shift+Tab came back to the first control (the skip link)').toBe(true);

        expect(problems, problems.join('\n')).toEqual([]);
      });
    });
  }
}

// Self-check (the assertion can fail): a control pushed under the sticky top bar, and one under the navigation bar, are reported.
test.describe('[SC 2.4.11] self-check: the verdict catches a covered control', () => {
  test.use({ viewport: MOBILE });
  test('a button placed under the top bar and one under the navigation are flagged; a clear one is not', async ({ page }) => {
    await page.setContent(`<!doctype html><body style="margin:0">
      <header style="position:fixed;top:0;left:0;right:0;height:56px;background:#ccc;z-index:10"></header>
      <nav style="position:fixed;bottom:0;left:0;right:0;height:64px;background:#ccc;z-index:10"></nav>
      <div style="height:2000px">
        <button id="top" style="position:absolute;top:10px;left:10px;width:100px;height:30px">top</button>
        <button id="bottom" style="position:absolute;top:760px;left:10px;width:100px;height:30px">bottom</button>
        <button id="ok" style="position:absolute;top:300px;left:10px;width:100px;height:30px">ok</button>
      </div>`);
    const run = async (id: string): Promise<string[]> => {
      await page.focus(`#${id}`, { strict: true });
      // focus() scrolls it into view only if needed; pin the scroll so the buttons sit where the test says.
      await page.evaluate(() => window.scrollTo(0, 0));
      return verdict(await probe(page));
    };
    expect((await run('top')).length, 'under the top bar').toBeGreaterThan(0);
    expect((await run('bottom')).length, 'under the navigation').toBeGreaterThan(0);
    expect(await run('ok')).toEqual([]);
  });
});
