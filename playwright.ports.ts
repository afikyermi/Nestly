import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// The ports of the two servers Playwright starts. On CI they stay 6007 (Storybook) and 4174 (the e2e app). Locally each
// checkout gets its own pair, derived from the checkout root as tools/db-local.mjs derives its container and port
// (Storybook 6100-6599, app 4200-4699), so `reuseExistingServer` can only ever match this checkout's own build and a run in
// one worktree never tests another worktree's.
const CI_STORYBOOK_PORT = 6007;
const CI_APP_PORT = 4174;

/** The two ports for a checkout root: a pure function of the path (separators and trailing slash folded; lower case on Windows). */
export function checkoutPorts(root: string, isCi: boolean): { storybook: number; app: number } {
  if (isCi) return { storybook: CI_STORYBOOK_PORT, app: CI_APP_PORT };
  let norm = resolve(root).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') norm = norm.toLowerCase();
  const hash = createHash('sha256').update(norm).digest('hex');
  return {
    storybook: 6100 + (parseInt(hash.slice(0, 8), 16) % 500),
    app: 4200 + (parseInt(hash.slice(8, 16), 16) % 500),
  };
}

const ports = checkoutPorts(process.cwd(), process.env['CI'] !== undefined);
export const STORYBOOK_PORT = ports.storybook;
export const APP_PORT = ports.app;
