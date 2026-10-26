// The run's pre-check (performance plan N, T3): before any flow, one browser on the deployment times two answers the flows depend on, and the
// run stops with a clear reason when either is slower than PREFLIGHT_LIMIT_MS or wrong. 25.10: a sick Preview (sign-ups of 12-25 s, 422)
// still walked every flow for 16 minutes, each making users.
//   1. GET /api/health on the deployment (the platform and the server function, cold start included);
//   2. a sign-in with a fresh pattern email that was never registered, through /login: Auth answers 400 (invalid credentials). It goes
//      through the same Auth service and database as a sign-up, but creates no user and no row (a refused sign-in makes no server call).
// Runs as the second global setup, after support/global-setup.ts has moved the bypass secret into its private file. Logs carry the
// path, status and milliseconds only.

import { readFileSync } from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import { createBypassRouteHandler } from './bypass.ts';
import { SECRET_FILE_ENV } from './global-setup.ts';
import { generateTestUser } from './test-user.ts';
import { submitSignIn } from './timed-steps.ts';

export const PREFLIGHT_LIMIT_MS = 10_000;

export interface ProbeResult {
  name: string;
  status: number | null;
  ms: number;
  expected: (status: number) => boolean;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/** The first probe that did not answer, answered wrong, or took longer than the limit stops the run. */
export function judgeProbes(results: readonly ProbeResult[], limitMs: number = PREFLIGHT_LIMIT_MS): Verdict {
  for (const r of results) {
    if (r.status === null) return { ok: false, reason: `${r.name} did not answer within ${limitMs} ms` };
    if (!r.expected(r.status)) return { ok: false, reason: `${r.name} answered ${r.status}` };
    if (r.ms > limitMs) return { ok: false, reason: `${r.name} took ${Math.round(r.ms)} ms (limit ${limitMs} ms)` };
  }
  return { ok: true };
}

export function stopMessage(reason: string): string {
  return `preview-e2e pre-check: ${reason}. The Preview is too slow or unhealthy to walk the flows, so none was run and no user was made. Check the Preview (Auth, database) before running again.`;
}

export default async function preflight(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  const file = process.env[SECRET_FILE_ENV];
  if (baseURL === undefined || file === undefined || file === '') throw new Error('preview-e2e pre-check: no base URL or bypass file');
  const origin = new URL(baseURL).origin;
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, readFileSync(file, 'utf8')));
    const page = await context.newPage();
    const results: ProbeResult[] = [];

    let started = Date.now();
    const health = await page.goto('/api/health', { timeout: PREFLIGHT_LIMIT_MS }).catch(() => null);
    results.push({ name: 'GET /api/health', status: health?.status() ?? null, ms: Date.now() - started, expected: (s) => s === 200 });

    if (judgeProbes(results).ok) {
      const u = generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
      await page.goto('/login', { timeout: 30_000 });
      await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(u.email);
      await page.getByLabel('סיסמה', { exact: true }).fill(u.password);
      started = Date.now();
      const auth = await submitSignIn(page).catch(() => null);
      results.push({ name: 'Auth sign-in of an unknown user', status: auth?.status() ?? null, ms: Date.now() - started, expected: (s) => s === 400 });
    }
    for (const r of results) console.log(`[pre-check] ${r.name}: ${r.status ?? 'no answer'} after ${Math.round(r.ms)} ms`);
    const verdict = judgeProbes(results);
    if (!verdict.ok) throw new Error(stopMessage(verdict.reason));
  } finally {
    await browser.close();
  }
}
