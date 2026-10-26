// A serial group's later tests continue with the session its earlier test signed in with, instead of signing in again (performance
// plan N, T4: 14 fewer sign-ins per run). Only for tests that do not check the sign-in itself; a flow that checks it signs in for real.
//
// The Auth session is the web app's one localStorage entry (apps/web/src/services/auth/auth-client.ts). keepSession reads the page's
// localStorage for the deployment origin at the end of a test; resumeSession writes it into the next test's fresh context before the
// app's first script runs, once per tab (a reload keeps what the app itself stored since), then opens `path`. The entries stay in this
// worker's memory, keyed by flow and project: never logged, never written to a file. A serial group that fails skips its later tests,
// so a missing session is a broken flow, and resumeSession says so.

import type { Page } from '@playwright/test';

interface Kept {
  origin: string;
  entries: { name: string; value: string }[];
}

const kept = new Map<string, Kept>();
const RESUMED = 'nestly-e2e-session-resumed';

/** Keeps the signed-in session of `page` under `key` (e.g. `privacy:${project}`); call it after the test's last step. */
export async function keepSession(page: Page, key: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  const state = await page.context().storageState();
  const entries = state.origins.find((o) => o.origin === origin)?.localStorage ?? [];
  if (entries.length === 0) throw new Error(`keepSession(${key}): the page holds no session to keep`);
  kept.set(key, { origin, entries });
}

/** Opens `path` signed in with the session kept under `key` by an earlier test of the same serial group. */
export async function resumeSession(page: Page, key: string, path: string): Promise<void> {
  const session = kept.get(key);
  if (session === undefined) throw new Error(`resumeSession(${key}): no session was kept by the earlier test of this group`);
  await page.context().addInitScript(
    ({ origin, entries, marker }) => {
      if (window.location.origin !== origin || window.sessionStorage.getItem(marker) !== null) return;
      for (const entry of entries) window.localStorage.setItem(entry.name, entry.value);
      window.sessionStorage.setItem(marker, '1');
    },
    { ...session, marker: RESUMED },
  );
  await page.goto(path);
}
