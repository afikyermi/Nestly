// The post page's "⋯" (ux-polish-b c3; .work/ux-polish-b/screen.md): the author's edit and delete live in it, no longer as visible buttons.
// Roles and Hebrew names are screen.md's. Shared by the specs whose steps used the removed "עריכה" / "מחיקה" buttons.
import type { Locator, Page } from '@playwright/test';

export const POST_MORE = 'פעולות נוספות לפוסט';
export const EDIT_ITEM = 'עריכת הפוסט';
export const DELETE_ITEM = 'מחיקת הפוסט';

/** The post page's own "⋯" (inside main, so a comment's "⋯" is never it). */
export const postMore = (page: Page): Locator => page.getByRole('main').getByRole('button', { name: POST_MORE, exact: true });
export const menuItem = (page: Page, name: string): Locator => page.getByRole('menuitem', { name, exact: true });

/** "⋯" then the item, as a person does. */
export async function chooseFromPostMenu(page: Page, name: typeof EDIT_ITEM | typeof DELETE_ITEM): Promise<void> {
  await postMore(page).click();
  await menuItem(page, name).click();
}

/** Two animation frames: a menu's, sheet's or dialog's history entry is pushed after its first paint, so a Back or an outside press in between is not what a person does. */
export const afterPaint = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
