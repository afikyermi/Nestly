import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

const root = process.cwd();

/** Every story id of the built Storybook, from storybook-static/index.json. */
export function storyIds(): string[] {
  const parsed: unknown = JSON.parse(readFileSync(path.join(root, 'apps/web/storybook-static/index.json'), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('entries' in parsed)) {
    throw new Error('index.json has no entries');
  }
  const { entries } = parsed;
  if (typeof entries !== 'object' || entries === null) throw new Error('index.json entries is not an object');
  return Object.keys(entries).filter((id) => {
    const value: unknown = Reflect.get(entries, id);
    return typeof value === 'object' && value !== null && 'type' in value && value.type === 'story';
  });
}

export const MOBILE = { width: 375, height: 812 };
export const DESKTOP = { width: 1024, height: 768 };

/** Opens a story in the preview iframe and waits until it has rendered. */
export async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await page.waitForSelector('body.sb-show-main', { timeout: 15_000 });
  await page.locator('#storybook-root > *').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export const AXE_PATH = path.join(root, 'node_modules/axe-core/axe.min.js');

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[]; html: string }[];
}
export interface AxeSummary {
  violations: AxeViolation[];
  passes: number;
  checked: number;
}

/** Injects axe-core and runs it with the given tags or rule ids; returns violations only. */
export async function runAxe(page: Page, options: { tags?: string[]; rules?: string[] }): Promise<AxeSummary> {
  await page.addScriptTag({ path: AXE_PATH });
  const runOnly = options.tags
    ? { type: 'tag', values: options.tags }
    : { type: 'rule', values: options.rules ?? [] };
  const script =
    `axe.run(document, { runOnly: ${JSON.stringify(runOnly)} }).then(r => ({
      violations: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.map(n => ({ target: n.target, html: n.html })) })),
      passes: r.passes.length,
      checked: r.passes.length + r.violations.length + r.incomplete.length + r.inapplicable.length,
    }))`;
  // addon-a11y runs its own axe in the page after load; axe refuses to run twice at once.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate<AxeSummary>(script);
    } catch (error) {
      const busy = error instanceof Error && error.message.includes('already running');
      if (!busy || attempt >= 40) throw error;
      await page.waitForTimeout(250);
    }
  }
}

/** Stories whose id starts with the given prefix, e.g. "ui-button--". */
export const storiesOf = (prefix: string): string[] => storyIds().filter((id) => id.startsWith(prefix));
