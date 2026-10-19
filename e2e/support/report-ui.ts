// Locators and steps shared by the F3.7 report specs. Names are the Hebrew accessible names of .work/report/screen.md, nothing from the code.
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export const TITLE = { post: 'דיווח על פוסט', comment: 'דיווח על תגובה', user: 'דיווח על פרופיל' } as const;
export type Kind = keyof typeof TITLE;
/** FR-MOD-001 / AC-106 order; the keys are child_safety, harassment, sexual_violent_hateful, personal_information, medical_misinformation, impersonation, spam, other. */
export const REASONS = [
  'תוכן שמסכן ילד',
  'הטרדה או בריונות',
  'תוכן מיני, אלים או מסית',
  'חשיפת פרטים אישיים',
  'מידע רפואי מסוכן או מטעה',
  'התחזות',
  'ספאם או פרסום לא קשור',
  'אחר',
] as const;
export const KEYS = ['child_safety', 'harassment', 'sexual_violent_hateful', 'personal_information', 'medical_misinformation', 'impersonation', 'spam', 'other'] as const;
export const T = {
  intro: 'הדיווח מגיע רק לצוות Nestly, ולא נשלחת עליו הודעה לאף אחד',
  legend: 'מה הבעיה?',
  spamHint: 'כולל פוסט פרסומי בלי שיתוף ידע',
  details: 'פרטים נוספים',
  detailsHint: "לא חובה. בבחירת 'אחר' צריך לכתוב מה הבעיה",
  send: 'שליחת הדיווח',
  sending: 'שולחים',
  cancel: 'ביטול',
  noReason: 'יש לבחור סיבה',
  otherEmpty: "בבחירת 'אחר' יש לכתוב מה הבעיה",
  tooLong: 'הטקסט ארוך מדי. אפשר לקצר אותו עד 1,000 תווים',
  nul: 'יש בטקסט תו שאי אפשר לשמור. אפשר להסיר אותו ולנסות שוב', // F3.3's text
  failed: 'הדיווח לא נשלח. אפשר לנסות שוב',
  postReported: 'הדיווח נשלח. הפוסט לא יוצג לכם יותר',
  received: 'הדיווח נשלח. הצוות יבדוק אותו',
  already: 'כבר דיווחתם על זה. הצוות יבדוק את הדיווח',
  unavailable: 'אי אפשר לדווח על זה. ייתכן שהתוכן כבר לא זמין',
  moreOfPost: 'פעולות נוספות לפוסט',
  moreOfComment: 'פעולות נוספות לתגובה',
  menu: 'פעולות נוספות',
  reportPost: 'דיווח על הפוסט',
  reportComment: 'דיווח על התגובה',
  reportProfile: 'דיווח על הפרופיל',
  rules: 'כללי הקהילה',
  backToFeed: 'חזרה לפיד',
  retry: 'נסו שוב',
} as const;

export const sheet = (page: Page, kind: Kind) => page.getByRole('dialog', { name: TITLE[kind], exact: true });
export const radios = (box: Locator) => box.getByRole('radio');
export const sendButton = (box: Locator) => box.getByRole('button', { name: T.send, exact: true });
export const cancelButton = (box: Locator) => box.getByRole('button', { name: T.cancel, exact: true });
export const detailsBox = (box: Locator) => box.getByRole('textbox', { name: T.details, exact: true });
/** Presses the reason's card (the radio itself is visually hidden); the choice is then asserted by the caller where it matters. */
export const choose = (box: Locator, index: number) => box.getByText(REASONS[index] ?? '', { exact: true }).click();
export const menu = (page: Page) => page.getByRole('menu', { name: T.menu, exact: true });
export const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
export const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? '');
export const focusedLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
export const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

/** The element holding focus is this one (or inside it). */
export async function expectFocusIn(page: Page, scope: Locator, why: string): Promise<void> {
  await expect.poll(() => scope.evaluate((el) => el.contains(document.activeElement)), { message: why }).toBe(true);
}
/** Keyboard-reachable, 44x44 at least, with a visible focus ring. */
export async function expectTouchTarget(control: Locator, why: string): Promise<void> {
  const size = await control.boundingBox();
  expect(size?.width ?? 0, `${why} width`).toBeGreaterThanOrEqual(44);
  expect(size?.height ?? 0, `${why} height`).toBeGreaterThanOrEqual(44);
}
export async function expectFocusRing(control: Locator, why: string): Promise<void> {
  await control.focus();
  const ring = await control.evaluate((el) => {
    const s = getComputedStyle(el);
    return (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || s.boxShadow !== 'none';
  });
  expect(ring, `${why} has a visible focus`).toBe(true);
}
