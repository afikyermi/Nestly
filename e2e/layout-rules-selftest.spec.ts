// Layer 1 (decisions-in-force §14.1): proof that each rule of e2e/support/layout-rules.ts can fail. A small sound page passes every
// rule; each fixture below breaks exactly one thing on it, and the helper must name that rule (the same idea as the "can fail" CI
// contract tests in tools/). The pages are written in place (setContent): no app, no Storybook, so a rule's failure here is the rule's.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOBILE } from './helpers';
import { button, heading, layoutProblems, role, rulesOf, text } from './support/layout-rules';
import type { Skeleton } from './support/layout-rules';

test.use({ viewport: MOBILE });

const SKELETON: Skeleton = [heading('דף בדיקה', 1), button('שמירה'), button('ביטול'), text('פסקה קצרה לבדיקה')];

interface Page0 {
  root?: string;
  head?: string;
  before?: string;
  after?: string;
  heading?: string;
}

// The sound page: Hebrew and rtl, one h1, two buttons side by side, a password field with its toggle inside it, an email and a Latin
// name isolated by dir / <bdi>, a deliberately truncated name, a visually hidden text, and a small dialog on top of the heading.
function page0({ root = '<html dir="rtl" lang="he">', head = '', before = '', after = '', heading: h = '<h1>דף בדיקה</h1>' }: Page0 = {}): string {
  return `<!doctype html>${root}<head><meta charset="utf-8"><title>בדיקה</title>
<style>
  body { margin: 0; font: 16px/1.5 sans-serif; color: #111; background: #fff; }
  main { padding: 16px; }
  button { min-width: 44px; min-height: 44px; }
  .row { display: flex; gap: 8px; }
  .field { position: relative; width: 300px; }
  .field input { box-sizing: border-box; width: 100%; height: 44px; }
  .field button { position: absolute; top: 0; left: 0; width: 44px; height: 44px; min-width: 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .name { display: inline-block; width: 90px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: bottom; }
  .top { position: fixed; top: 0; right: 0; width: 200px; padding: 8px; background: #fff; border: 1px solid #111; }
</style>${head}</head>
<body><main>
  ${before}
  ${h}
  <p>פסקה קצרה לבדיקה</p>
  <div class="row"><button type="button">שמירה</button><button type="button">ביטול</button></div>
  <label for="pw">סיסמה</label>
  <div class="field"><input id="pw" type="password"><button type="button" aria-label="הצגת הסיסמה">👁</button></div>
  <p>אימייל: <span dir="ltr">dana@example.com</span>, שם: <bdi>Avi Mizrahi</bdi></p>
  <p>שם ארוך: <span class="name" data-layout-truncate>אביגיל-אלכסנדרה בן-שושן</span></p>
  <span class="sr-only">טקסט נסתר שארוך מאוד ונחתך לגמרי בכוונה כדי שרק קורא מסך יקרא אותו</span>
  ${after}
</main>
<div class="top" role="dialog" aria-modal="false" aria-label="הודעה"><button type="button">סגירה</button></div>
</body></html>`;
}

async function problemsOf(page: Page, html: string, skeleton: Skeleton = SKELETON, axe = false): Promise<string[]> {
  await page.setContent(html);
  return layoutProblems(page, skeleton, { timeout: 500, axe });
}

test('[layer 1] the sound page passes every rule, axe included (so a failure below is the broken thing, not the page)', async ({ page }) => {
  expect(await problemsOf(page, page0(), SKELETON, true)).toEqual([]);
});

test('[layer 1] the sound page still passes with the dialog over the heading (an overlay on top is not an overlap)', async ({ page }) => {
  await page.setContent(page0());
  const top = await page.getByRole('dialog').boundingBox();
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(top && h1 && top.y < h1.y + h1.height && top.x + top.width > h1.x, 'the fixture really covers the heading').toBe(true);
  expect(await layoutProblems(page, SKELETON, { timeout: 500, axe: false })).toEqual([]);
});

const BROKEN: { name: string; html: string; skeleton?: Skeleton; axe?: boolean; rule: string; only?: boolean }[] = [
  { name: 'an overflowing row (a block wider than the viewport)', html: page0({ after: '<div style="width:1600px">שורה רחבה מדי</div>' }), rule: 'horizontal-scroll' },
  {
    name: "a scrolling box (as the shell's main) holding a too-wide row",
    html: page0({ after: '<div style="overflow:auto;height:80px"><div style="width:900px">שורה רחבה בתוך תיבה גוללת</div></div>' }),
    rule: 'horizontal-scroll',
  },
  {
    name: 'text pushed past the right (start) edge, which rtl cannot scroll to',
    html: page0({ after: '<div style="position:relative;right:-200px;width:300px">טקסט שבורח ימינה</div>' }),
    rule: 'off-screen',
    only: true,
  },
  { name: 'ellipsis text', html: page0({ after: '<p style="width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">טקסט ארוך שנחתך באמצע</p>' }), rule: 'clipped-text', only: true },
  { name: 'text cut in height', html: page0({ after: '<p style="width:120px;height:24px;overflow:hidden">שורה ראשונה, שורה שנייה, שורה שלישית</p>' }), rule: 'clipped-text', only: true },
  {
    name: 'a line-clamped paragraph',
    html: page0({ after: '<p style="width:120px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden">שורה ראשונה, שורה שנייה, שורה שלישית</p>' }),
    rule: 'clipped-text',
    only: true,
  },
  {
    name: 'overlapping buttons',
    html: page0({ after: '<div style="position:relative;height:50px"><button style="position:absolute;right:0">אחת</button><button style="position:absolute;right:20px">שתיים</button></div>' }),
    rule: 'overlap',
    only: true,
  },
  { name: 'a button over a heading', html: page0({ after: '<h2>כותרת משנה</h2><button style="display:block;margin-top:-30px">כפתור</button>' }), rule: 'overlap', only: true },
  { name: 'an ltr root', html: page0({ root: '<html dir="ltr" lang="he">' }), rule: 'rtl-root' },
  { name: 'a root with no dir', html: page0({ root: '<html lang="he">' }), rule: 'rtl-root' },
  { name: 'a root in English', html: page0({ root: '<html dir="rtl" lang="en">' }), rule: 'rtl-root', only: true },
  { name: 'a section flipped to ltr by CSS', html: page0({ after: '<section style="direction:ltr"><p>טקסט שהפך לשמאל לימין</p></section>' }), rule: 'direction', only: true },
  { name: 'a missing heading', html: page0({ heading: '' }), rule: 'skeleton', only: true },
  { name: 'the heading at another level', html: page0({ heading: '<h2>דף בדיקה</h2>' }), rule: 'skeleton', only: true },
  { name: 'an expected button that is hidden', html: page0(), skeleton: [...SKELETON, button('מחיקה')], rule: 'skeleton' },
  { name: 'a skeleton with no heading', html: page0(), skeleton: [button('שמירה'), role('dialog', 'הודעה')], rule: 'skeleton', only: true },
  { name: 'an image with no alt (axe)', html: page0({ after: '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40">' }), axe: true, rule: 'axe', only: true },
  { name: 'text too faint to read (axe)', html: page0({ after: '<p style="color:#ddd">טקסט חיוור</p>' }), axe: true, rule: 'axe', only: true },
];

for (const c of BROKEN) {
  test(`[layer 1] can fail: ${c.name} -> ${c.rule}`, async ({ page }) => {
    const problems = await problemsOf(page, c.html, c.skeleton ?? SKELETON, c.axe ?? false);
    if (c.only === true) expect(rulesOf(problems), problems.join('\n')).toEqual([c.rule]);
    else expect(rulesOf(problems), problems.join('\n')).toContain(c.rule);
  });
}

test('[layer 1] a hidden expected button is not taken for a visible one', async ({ page }) => {
  const problems = await problemsOf(page, page0({ after: '<button type="button" style="display:none">מחיקה</button>' }), [...SKELETON, button('מחיקה')]);
  expect(problems).toEqual(['skeleton: no visible button מחיקה']);
});

test('[layer 1] the truncation marker is what lets the deliberate name pass: without it, it is clipped text', async ({ page }) => {
  const problems = await problemsOf(page, page0().replace(' data-layout-truncate', ''));
  expect(rulesOf(problems), problems.join('\n')).toEqual(['clipped-text']);
});

test('[layer 1] a deliberate horizontal scroller (data-layout-scroll-x) passes; the same box unmarked does not', async ({ page }) => {
  const wide = (mark: string) => page0({ after: `<div ${mark} style="overflow-x:auto"><div style="width:900px">טבלה רחבה בתוך תיבה גוללת</div></div>` });
  expect(await problemsOf(page, wide('data-layout-scroll-x'))).toEqual([]);
  expect(rulesOf(await problemsOf(page, wide('')))).toContain('horizontal-scroll');
});

test('[layer 1] the field exception is narrow: a button half outside its field is an overlap', async ({ page }) => {
  const problems = await problemsOf(page, page0({ head: '<style>.field button { left: -22px; }</style>' }));
  expect(rulesOf(problems), problems.join('\n')).toEqual(['overlap']);
});
