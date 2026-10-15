// F1.2 app-shell-guard: criteria 13 (the production session source) and 14 (no test source in production).
// Builds the production bundle (apps/web/dist) once, greps it for the marker, and runs the production bundle itself
// in the browser (served from dist through request interception, with the SPA fallback), so criterion 13 is checked
// against the real production source and not against the e2e build. Chrome only: the build is shared on disk.
// Derived from .work/app-shell-guard/spec.md only.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'apps/web/dist');
const DIST_E2E = path.join(ROOT, 'apps/web/dist-e2e');
const MARKER = 'nestly-controllable-session-source';
const PROD = 'http://prod.test';
const WELCOME_H1 = 'הצטרפות ל-Nestly';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

const filesWithMarker = (dir: string): string[] =>
  filesUnder(dir)
    .filter((f) => readFileSync(f).includes(MARKER))
    .map((f) => path.relative(dir, f));

test.describe.configure({ mode: 'serial' });

// The build is shared on disk: build and run once, in the Chrome project (the `channel` option is "chrome" there).
test.beforeAll(({ channel }) => {
  test.skip(channel !== 'chrome', 'the production build is shared on disk: run once');
  test.setTimeout(300_000);
  execFileSync('npm', ['run', 'build', '-w', '@nestly/web'], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
});

test('[F1.2 c14] the production build apps/web/dist exists and has JavaScript', () => {
  expect(existsSync(path.join(DIST, 'index.html'))).toBe(true);
  expect(filesUnder(DIST).some((f) => f.endsWith('.js'))).toBe(true);
});

test('[F1.2 c14] harness control: the e2e build DOES contain the marker (so an empty grep on dist means something)', () => {
  expect(existsSync(DIST_E2E), 'run `npm run build:e2e -w @nestly/web` first (the webServer entry does)').toBe(true);
  expect(filesWithMarker(DIST_E2E).length).toBeGreaterThan(0);
});

test('[F1.2 c14] the test-only controllable session source is absent from the production build', () => {
  expect(filesWithMarker(DIST)).toEqual([]);
});

test('[F1.2 c14] the production build does not contain the test-session API names', () => {
  for (const needle of ['nestlyTestSession', 'rejectSignOut', 'signOutCalls', 'nestlyRealSession', 'e2e-stub.invalid']) {
    const hits = filesUnder(DIST)
      .filter((f) => /\.(js|mjs|html|map)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').includes(needle))
      .map((f) => path.relative(DIST, f));
    expect(hits, needle).toEqual([]);
  }
});

test.describe('the production bundle in a browser', () => {
  test.use({ baseURL: PROD });

  test.beforeEach(async ({ page }) => {
    await page.route(`${PROD}/**`, async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      let file = path.join(DIST, pathname);
      const inside = file.startsWith(DIST + path.sep) || file === DIST;
      if (!inside || !existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
      await route.fulfill({
        body: readFileSync(file),
        contentType: MIME[path.extname(file)] ?? 'application/octet-stream',
      });
    });
  });

  for (const p of ['/feed', '/home', '/profile', '/settings', '/marketplace', '/profile/123']) {
    test(`[F1.2 c13][FR-AUTH-004] production source always reports signed-out: ${p} ends at / with Welcome`, async ({
      page,
    }) => {
      await page.goto(PROD + p);
      await expect(page).toHaveURL(`${PROD}/`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(WELCOME_H1);
      await expect(page.getByRole('navigation', { name: 'ניווט ראשי' })).toHaveCount(0);
    });
  }

  test('[F1.2 c13][c14] production: no test seam on window, and Guest placeholders still render', async ({ page }) => {
    await page.goto(PROD + '/login');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('התחברות');
    const noSeam = await page.evaluate(() => Reflect.get(window, 'nestlyTestSession') === undefined);
    expect(noSeam).toBe(true);
  });

  test('[F1.2 c13][c14] production: defining a fake window.nestlyTestSession does not sign anyone in', async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.set(window, 'nestlyTestSession', { set: () => undefined, state: 'signed-in' });
    });
    await page.goto(PROD + '/feed');
    await expect(page).toHaveURL(`${PROD}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(WELCOME_H1);
  });

  test('[F1.2 c13][FR-AUTH-004] production: Welcome sends no request to /api/*, Supabase or Google', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(PROD + '/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(WELCOME_H1);
    await page.waitForTimeout(500);
    const bad = urls.filter((u) => {
      const url = new URL(u);
      return url.origin !== PROD || url.pathname.startsWith('/api/') || /supabase|google/i.test(u);
    });
    expect(bad).toEqual([]);
  });
});
