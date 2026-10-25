// Layer 1 of the UI checks (Afik 24.10, decisions-in-force §14.1): rule-based, no images, so an intentional design change passes and
// only real breakage fails. Each rule checks the intent, not the code:
//   rtl-root           the document is Hebrew and right-to-left: <html dir="rtl" lang="he">, and the body computes to rtl.
//   direction          no visible text flips to left-to-right by CSS alone; only an explicit dir (an email, a link, a name in
//                      <bdi>) may change it.
//   horizontal-scroll  the page never scrolls sideways at the viewport (document scrollWidth <= clientWidth + 1), nor does a box
//                      that scrolls (the app shell's `main` is one), unless marked data-layout-scroll-x (a wide table).
//   off-screen         no visible text or control sticks out past the viewport's left or right edge. In RTL an overflow past the
//                      right (start) edge cannot be scrolled to and does not count in scrollWidth, so this catches what the rule above cannot.
//   clipped-text       no visible text is cut off: an element that hides its overflow (overflow hidden/clip, text-overflow
//                      ellipsis, line-clamp) holds more than it shows. An element (or its subtree) deliberately truncated carries
//                      data-layout-truncate (used sparingly: a long name in a one-line row whose full text is reachable elsewhere).
//   overlap            no two visible controls or headings cover each other (by more than 2 px each way). A pair is compared only
//                      within one layer: the page, or one overlay on top of it (fixed or sticky, a dialog, a menu, a tooltip, a
//                      listbox, a popover). Ancestor and descendant are never a pair, nor a field and a control that sits wholly
//                      inside it (the password field's "הצגת הסיסמה").
//   axe                axe-core with the suite's rule set (wcag2a, wcag2aa, wcag22aa: e2e/a11y.spec.ts), zero violations.
//   skeleton           the screen's expected parts are there and visible: its headings, buttons, links, key texts, by role and
//                      accessible name. A skeleton must name at least one heading.
// layoutProblems() returns one line per problem, each starting with its rule; expectSoundLayout() asserts there are none.
// The checks are proven able to fail by e2e/layout-rules-selftest.spec.ts.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { runAxe } from '../helpers';

type AriaRole = Parameters<Page['getByRole']>[0];
export type Name = string | RegExp;

/** One expected part of a screen: an element by role and accessible name (exact when a string), or a visible text. */
export type Part = { role: AriaRole; name: Name; level?: number } | { text: Name };
export type Skeleton = readonly Part[];

export const heading = (name: Name, level?: number): Part => (level === undefined ? { role: 'heading', name } : { role: 'heading', name, level });
export const button = (name: Name): Part => ({ role: 'button', name });
export const link = (name: Name): Part => ({ role: 'link', name });
export const text = (value: Name): Part => ({ text: value });
export const role = (r: AriaRole, name: Name): Part => ({ role: r, name });

/** The marker of a deliberately truncated element (and its subtree). */
export const TRUNCATE_OK = 'data-layout-truncate';
/** The marker of a deliberate horizontal scroller (a wide table in its own scrolling box). */
export const SCROLL_X_OK = 'data-layout-scroll-x';
/** The axe tags of the suite (e2e/a11y.spec.ts [14]). */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];

const describe = (part: Part): string =>
  'text' in part ? `text ${String(part.text)}` : `${part.role}${part.level === undefined ? '' : ` (level ${part.level})`} ${String(part.name)}`;

// includeHidden: what the skeleton asks is whether a person sees the part. A page behind an open modal is hidden from assistive
// technology (aria-hidden or inert) yet still on screen; whether that is right for a screen reader is axe's question.
function locate(page: Page, part: Part) {
  if ('text' in part) return page.getByText(part.text, typeof part.text === 'string' ? { exact: true } : {});
  return page.getByRole(part.role, {
    includeHidden: true,
    name: part.name,
    ...(typeof part.name === 'string' ? { exact: true } : {}),
    ...(part.level === undefined ? {} : { level: part.level }),
  });
}

/** Waits (up to `timeout`) for every part to be visible; returns one problem per part still missing. */
export async function skeletonProblems(page: Page, skeleton: Skeleton, timeout = 10_000): Promise<string[]> {
  const problems: string[] = [];
  if (!skeleton.some((part) => 'role' in part && part.role === 'heading')) problems.push('skeleton: the screen\'s skeleton names no heading');
  const deadline = Date.now() + timeout;
  let missing: Part[] = [...skeleton];
  for (;;) {
    const still: Part[] = [];
    for (const part of missing) {
      if ((await locate(page, part).filter({ visible: true }).count()) === 0) still.push(part);
    }
    missing = still;
    if (missing.length === 0 || Date.now() >= deadline) break;
    await page.waitForTimeout(200);
  }
  return [...problems, ...missing.map((part) => `skeleton: no visible ${describe(part)}`)];
}

/** The DOM rules (rtl-root, direction, horizontal-scroll, off-screen, clipped-text, overlap), evaluated in the page. */
async function domProblems(page: Page): Promise<string[]> {
  return page.evaluate(({ truncateOk, scrollOk }) => {
    const problems: string[] = [];
    const html = document.documentElement;
    const { body } = document;
    const label = (el: Element): string => {
      const id = el.id === '' ? '' : `#${el.id}`;
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `<${el.tagName.toLowerCase()}${id}> "${name}"`;
    };

    // rtl-root
    if (html.getAttribute('dir') !== 'rtl') problems.push(`rtl-root: <html dir> is "${String(html.getAttribute('dir'))}", not "rtl"`);
    if (html.getAttribute('lang') !== 'he') problems.push(`rtl-root: <html lang> is "${String(html.getAttribute('lang'))}", not "he"`);
    if (getComputedStyle(body).direction !== 'rtl') problems.push(`rtl-root: the body computes to direction ${getComputedStyle(body).direction}`);

    // What a person sees: rendered, not transparent, not visibility:hidden, and not a visually hidden (sr-only) box.
    const visuallyHidden = (el: Element): boolean => {
      for (let node: Element | null = el; node !== null && node !== body; node = node.parentElement) {
        const cs = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        if ((r.width <= 1 || r.height <= 1) && cs.overflow !== 'visible') return true;
        if (cs.clip.startsWith('rect(0') || cs.clipPath === 'inset(50%)') return true;
      }
      return false;
    };
    // Both spellings of the options (the older ones are what Chrome shipped first); a variable, so neither is an excess property.
    const visibility = { checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true };
    const seen = (el: Element): boolean => {
      if (!el.checkVisibility(visibility)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1 && !visuallyHidden(el);
    };
    const ownText = (el: Element): boolean =>
      Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
    const all = Array.from(body.querySelectorAll('*')).filter((el) => !['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName));
    const textEls = all.filter((el) => ownText(el) && seen(el));

    // direction: an explicit dir (other than the root's) or a <bdi> may isolate a run; CSS alone may not flip Hebrew UI to ltr.
    for (const el of textEls) {
      if (getComputedStyle(el).direction === 'rtl') continue;
      const isolate = el.closest('bdi, [dir]');
      if (isolate !== null && isolate !== html) continue;
      problems.push(`direction: ${label(el)} computes to ${getComputedStyle(el).direction} with no dir attribute`);
    }

    // horizontal-scroll
    const width = html.clientWidth;
    const scrollWidth = Math.max(html.scrollWidth, body.scrollWidth);
    if (scrollWidth > width + 1) problems.push(`horizontal-scroll: the page is ${scrollWidth}px wide at a ${width}px viewport`);

    // A box that scrolls sideways is a horizontal scroll too (the shell's `main` scrolls, not the document), unless it is a deliberate
    // horizontal scroller (a wide table), marked data-layout-scroll-x.
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') continue;
      if (el.closest(`[${scrollOk}]`) !== null || !seen(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`horizontal-scroll: ${label(el)} scrolls sideways (${el.scrollWidth}px in ${el.clientWidth}px)`);
    }

    // The part of a box a person can see across: cut by every ancestor that hides its horizontal overflow (what such an ancestor
    // hides is its own matter, clipped-text) or is a deliberate horizontal scroller, never by the root or a scroll container (whose
    // overflow past the start edge in rtl cannot be scrolled to). null when nothing of it shows.
    const shownAcross = (el: Element): { left: number; right: number } | null => {
      const r = el.getBoundingClientRect();
      let { left, right } = r;
      for (let node = el.parentElement; node !== null && node !== body && node !== html; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX !== 'hidden' && overflowX !== 'clip' && !node.hasAttribute(scrollOk)) continue;
        const a = node.getBoundingClientRect();
        left = Math.max(left, a.left);
        right = Math.min(right, a.right);
      }
      return right - left >= 1 ? { left, right } : null;
    };
    const INTERACTIVE =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])';
    const HEADINGS = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

    // off-screen
    const boxes = new Set<Element>([...textEls, ...all.filter((el) => el.matches(INTERACTIVE) && seen(el))]);
    for (const el of boxes) {
      const r = shownAcross(el);
      if (r === null) continue;
      if (r.left < -1 || r.right > width + 1) problems.push(`off-screen: ${label(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} at a ${width}px viewport`);
    }

    // clipped-text
    for (const el of all) {
      if (el === body || el === html || el.matches('input, textarea, select')) continue;
      if (el.closest(`[${truncateOk}]`) !== null) continue;
      if ((el.textContent ?? '').trim() === '' || !seen(el)) continue;
      const cs = getComputedStyle(el);
      const hidesX = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis';
      const hidesY = cs.overflowY === 'hidden' || cs.overflowY === 'clip' || (cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '');
      if (hidesX && el.scrollWidth > el.clientWidth + 1) problems.push(`clipped-text: ${label(el)} shows ${el.clientWidth}px of ${el.scrollWidth}px`);
      else if (hidesY && el.scrollHeight > el.clientHeight + 1) problems.push(`clipped-text: ${label(el)} shows ${el.clientHeight}px of ${el.scrollHeight}px in height`);
    }

    // overlap
    const LAYER_ROLES = ['dialog', 'alertdialog', 'menu', 'tooltip', 'listbox'];
    const layerOf = (el: Element): Element | null => {
      for (let node: Element | null = el; node !== null && node !== body; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky' || LAYER_ROLES.includes(node.getAttribute('role') ?? '') || node.hasAttribute('popover')) return node;
      }
      return null;
    };
    const candidates = all
      .filter((el) => el.matches(`${INTERACTIVE}, ${HEADINGS}`) && seen(el))
      .map((el) => ({ el, r: el.getBoundingClientRect(), layer: layerOf(el) }))
      .filter((c) => c.r.width >= 2 && c.r.height >= 2);
    const contains = (outer: DOMRect, inner: DOMRect): boolean =>
      inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    const FIELD = 'input, textarea, select';
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i];
        const b = candidates[j];
        if (a === undefined || b === undefined || a.layer !== b.layer) continue;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w <= 2 || h <= 2) continue;
        if ((a.el.matches(FIELD) && contains(a.r, b.r)) || (b.el.matches(FIELD) && contains(b.r, a.r))) continue;
        problems.push(`overlap: ${label(a.el)} and ${label(b.el)} overlap by ${Math.round(w)}x${Math.round(h)}px`);
      }
    }
    return problems;
  }, { truncateOk: TRUNCATE_OK, scrollOk: SCROLL_X_OK });
}

export interface LayoutOptions {
  /** How long the skeleton may take to appear (the screen's data, a story's play). */
  timeout?: number;
  /** Leave axe out (only the self-test's DOM fixtures, which have their own axe case). */
  axe?: boolean;
}

/** Every layer-1 problem of the page as it stands, one line each, prefixed by its rule. The skeleton is awaited first. */
export async function layoutProblems(page: Page, skeleton: Skeleton, options: LayoutOptions = {}): Promise<string[]> {
  const problems = await skeletonProblems(page, skeleton, options.timeout);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Two frames, so a layout that reacts to the viewport (a resize, a media query in script) has settled.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  problems.push(...(await domProblems(page)));
  if (options.axe !== false) {
    const result = await runAxe(page, { tags: AXE_TAGS });
    if (result.passes === 0) problems.push('axe: axe evaluated no rule');
    for (const v of result.violations) problems.push(`axe: ${v.id} (${v.help}) at ${v.nodes.map((n) => JSON.stringify(n.target)).join(', ')}`);
  }
  return problems;
}

/** The rule names of a problem list (the part before the first colon), sorted and unique. */
export const rulesOf = (problems: readonly string[]): string[] => [...new Set(problems.map((p) => p.split(':')[0] ?? ''))].sort();

export async function expectSoundLayout(page: Page, skeleton: Skeleton, where: string, options: LayoutOptions = {}): Promise<void> {
  expect(await layoutProblems(page, skeleton, options), where).toEqual([]);
}
