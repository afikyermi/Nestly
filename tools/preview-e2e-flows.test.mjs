// The load the Preview flows put on the Preview itself (performance plan N: T3 pre-check and maxFailures, T4 one sign-in per serial
// group, T5 phone flows). Split from preview-e2e.test.mjs (line budget).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const GOOD = 'https://nestly-abc123def-afikyermis-projects.vercel.app';

async function loadConfig() {
  const saved = process.env.PREVIEW_E2E_BASE_URL;
  process.env.PREVIEW_E2E_BASE_URL = GOOD;
  try {
    return await import(`${new URL('e2e-preview/playwright.config.ts', ROOT).href}?flows=1`);
  } finally {
    if (saved === undefined) delete process.env.PREVIEW_E2E_BASE_URL;
    else process.env.PREVIEW_E2E_BASE_URL = saved;
  }
}

const { default: cfg, PHONE_FLOWS } = await loadConfig();
const preflight = await import(new URL('e2e-preview/support/preflight.ts', ROOT).href);

test('[N T3] a run stops after 5 failures, and the pre-check runs as the second global setup, after the bypass secret left the env', () => {
  assert.equal(cfg.maxFailures, 5);
  assert.deepEqual(cfg.globalSetup, ['./support/global-setup.ts', './support/preflight.ts']);
});

test('[N T3] the pre-check stops the run on a missing answer, a wrong status, or more than 10 s; it passes otherwise', () => {
  const ok200 = (s) => s === 200;
  const ok400 = (s) => s === 400;
  assert.equal(preflight.PREFLIGHT_LIMIT_MS, 10_000);
  assert.deepEqual(preflight.judgeProbes([{ name: 'h', status: 200, ms: 900, expected: ok200 }, { name: 'a', status: 400, ms: 10_000, expected: ok400 }]), { ok: true });
  assert.match(preflight.judgeProbes([{ name: 'a', status: 400, ms: 10_001, expected: ok400 }]).reason, /^a took 10001 ms \(limit 10000 ms\)$/);
  assert.match(preflight.judgeProbes([{ name: 'a', status: 422, ms: 50, expected: ok400 }]).reason, /^a answered 422$/);
  assert.match(preflight.judgeProbes([{ name: 'h', status: null, ms: 10_000, expected: ok200 }]).reason, /^h did not answer within 10000 ms$/);
  // the first bad probe names the stop
  assert.match(preflight.judgeProbes([{ name: 'h', status: 500, ms: 1, expected: ok200 }, { name: 'a', status: 400, ms: 99_999, expected: ok400 }]).reason, /^h answered 500$/);
  const message = preflight.stopMessage('a took 12000 ms (limit 10000 ms)');
  assert.match(message, /pre-check: a took 12000 ms.*none was run/);
  assert.doesNotMatch(message, /https?:|@/);
});

test('[N T3] the pre-check makes no user: no /register, a fresh pattern email signs in and Auth must refuse it (400)', () => {
  const text = read('e2e-preview/support/preflight.ts').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(text, /register|signUp|createAccount/i);
  assert.match(text, /generateTestUser\(/);
  assert.match(text, /goto\('\/api\/health'/);
  assert.match(text, /goto\('\/login'/);
  assert.match(text, /expected: \(s\) => s === 400/);
  assert.match(text, /createBypassRouteHandler\(origin,/, 'the bypass goes to the deployment origin only');
  assert.doesNotMatch(text, /console\.log\([^)]*(email|password|secret)/i);
});

test('[N T5] the phone project walks only the listed flows, each an existing file; the desktop project walks every flow', () => {
  const phone = cfg.projects.find((p) => p.name === 'mobile-375');
  const desk = cfg.projects.find((p) => p.name === 'desktop-1280');
  assert.deepEqual(phone.testMatch, PHONE_FLOWS.map((f) => `**/${f}.flow.ts`));
  assert.ok(PHONE_FLOWS.length > 0);
  for (const f of PHONE_FLOWS) assert.ok(existsSync(new URL(`e2e-preview/${f}.flow.ts`, ROOT)), f);
  assert.equal(desk.testMatch, undefined);
  assert.equal(cfg.testMatch, '**/*.flow.ts');
  // the README lists the same phone flows
  const readme = read('e2e-preview/README.md');
  for (const f of PHONE_FLOWS) assert.match(readme, new RegExp(`\`${f}\``));
});

for (const flow of ['journeys', 'privacy', 'profile']) {
  test(`[N T4] ${flow}: one sign-up per serial group, the later tests resume its session; none signs in again`, () => {
    const text = read(`e2e-preview/${flow}.flow.ts`);
    assert.doesNotMatch(text, /goto\('\/login'\)|submitSignIn/);
    const resumes = [...text.matchAll(/resumeSession\(page, /g)].length;
    const keeps = [...text.matchAll(/await keepSession\(page, /g)].length;
    assert.ok(resumes >= 1 && keeps >= 1);
    // the first test of a group (its sign-up) keeps the session before any test resumes it (privacy resumes in a helper defined above)
    const tests = text.split(/\n  test\(/).slice(1);
    assert.match(tests[0], /\/register'[\s\S]*await keepSession\(page, /);
    assert.doesNotMatch(tests[0], /resumeSession/);
  });
}

test('[N T4] the session stays in the worker: never logged, never written to a file', () => {
  const text = read('e2e-preview/support/session.ts');
  assert.doesNotMatch(text, /console\.|writeFile|appendFile/);
  assert.match(text, /sessionStorage\.getItem\(marker\) !== null\) return/, 'written once per tab: a reload keeps what the app stored');
});
