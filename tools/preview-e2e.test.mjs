// preview-e2e (.work/preview-e2e/spec.md, with Gate 1 amendments A1-A3): criteria 1, 2, 12 (workflow and config), 3 (URL part),
// 4 (as A1: request helper with stubs and sentinels), 5 and 7 (user pattern, attempt counter). Criteria 8 and 9 (cleanup,
// sweep) are deferred with DR-E1 and are not asserted here. Expected values come from the spec, schema.md (the email
// pattern) and the F1.6 limit, never from the code under test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const ROOT = new URL('..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const workflowText = read('.github/workflows/preview-e2e.yml');
const wf = parseYaml(workflowText);
const job = wf.jobs.e2e;
const steps = stepsOf(job);

const GOOD = 'https://nestly-abc123def-afikyermis-projects.vercel.app';

// ---- criterion 1: trigger ---------------------------------------------------------------------------------------------
// Evaluates the job's `if` over a fixture event. Only "github.event.<path> == '<value>'" clauses joined by && are
// understood; anything else throws, so a changed shape fails loudly instead of being misread.
function evaluateIf(expr, event) {
  return expr.split('&&').every((raw) => {
    const m = /^\s*github\.event\.([\w.]+)\s*==\s*'([^']*)'\s*$/.exec(raw);
    assert.ok(m, `cannot read clause: ${raw}`);
    const actual = m[1].split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), event);
    return actual === m[2];
  });
}
const ev = (over = {}) => ({
  deployment_status: { state: 'success', environment: 'Preview', creator: { login: 'vercel[bot]' }, ...over },
});

test('[E c1] the only trigger is deployment_status', () => {
  assert.deepEqual(Object.keys(wf.on), ['deployment_status']);
});

test('[E c1] the job runs for a successful Preview deployment by vercel[bot]', () => {
  assert.equal(evaluateIf(job.if, ev()), true);
});

for (const [label, over] of [
  ['state failure', { state: 'failure' }],
  ['state pending', { state: 'pending' }],
  ['state in_progress', { state: 'in_progress' }],
  ['environment Production', { environment: 'Production' }],
  ['environment preview (lower case)', { environment: 'preview' }],
  ['creator someone-else', { creator: { login: 'someone-else' } }],
  ['creator vercel (no [bot])', { creator: { login: 'vercel' } }],
  ['creator missing', { creator: undefined }],
]) {
  test(`[E c1] the job does not run for ${label}`, () => {
    assert.equal(evaluateIf(job.if, ev(over)), false);
  });
}

test('[E c1] permissions are contents: read at the workflow and nothing broader on the job', () => {
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.ok(job.permissions === undefined || job.permissions === null);
});

// ---- criterion 2: environment and secrets -----------------------------------------------------------------------------
test('[E c2] the job declares environment preview-e2e', () => {
  assert.equal(job.environment, 'preview-e2e');
});

test('[E c2] no secret is in the workflow-level or job-level env', () => {
  for (const env of [wf.env, job.env]) {
    if (env === undefined || env === null) continue;
    assert.doesNotMatch(JSON.stringify(env), /secrets\./);
  }
});

test('[E c2] every secrets.* reference sits in the env of a step, never in a run body', () => {
  const total = (workflowText.match(/\$\{\{\s*secrets\./g) ?? []).length;
  let inStepEnv = 0;
  for (const step of steps) {
    assert.doesNotMatch(runOf(step), /\$\{\{\s*secrets\./, `a run body of "${step.name ?? step.uses}" holds a secret expression`);
    inStepEnv += (JSON.stringify(step.env ?? {}).match(/secrets\./g) ?? []).length;
  }
  assert.equal(inStepEnv, total, 'a secrets.* reference exists outside step env');
});

test('[E c2] no github.event.* expression in a run body (values arrive through env)', () => {
  for (const step of steps) {
    assert.doesNotMatch(runOf(step), /\$\{\{\s*github\.event\./, `run body of "${step.name ?? step.uses}"`);
  }
});

test('[E c2][E c4] the bypass secret is in the env of exactly one step, the one that runs Playwright', () => {
  const holders = steps.filter((s) => JSON.stringify(s.env ?? {}).includes('VERCEL_AUTOMATION_BYPASS_SECRET'));
  assert.equal(holders.length, 1);
  assert.match(runOf(holders[0]), /playwright test/);
});

test('[E c3] the URL guard step runs before install and before Playwright, and its target URL arrives through env', () => {
  const guardIdx = steps.findIndex((s) => /preview-e2e-url-guard/.test(runOf(s)));
  const installIdx = steps.findIndex((s) => /npm ci/.test(runOf(s)));
  const pwIdx = steps.findIndex((s) => /playwright test/.test(runOf(s)));
  assert.ok(guardIdx >= 0 && guardIdx < installIdx && installIdx < pwIdx);
  assert.ok(steps[guardIdx].env.TARGET_URL.includes('github.event.deployment_status.target_url'));
});

test('[E c3] the Playwright step gets its base URL only from the guard output', () => {
  const pw = steps.find((s) => /playwright test/.test(runOf(s)));
  assert.match(pw.env.PREVIEW_E2E_BASE_URL, /steps\.[\w-]+\.outputs\.base_url/);
  assert.doesNotMatch(pw.env.PREVIEW_E2E_BASE_URL, /github\.event/);
});

// ---- criterion 12: config separation ----------------------------------------------------------------------------------
let importCount = 0;
async function loadConfig(url) {
  const saved = process.env.PREVIEW_E2E_BASE_URL;
  if (url === undefined) delete process.env.PREVIEW_E2E_BASE_URL;
  else process.env.PREVIEW_E2E_BASE_URL = url;
  try {
    importCount += 1;
    return (await import(`${new URL('e2e-preview/playwright.config.ts', ROOT).href}?n=${importCount}`)).default;
  } finally {
    if (saved === undefined) delete process.env.PREVIEW_E2E_BASE_URL;
    else process.env.PREVIEW_E2E_BASE_URL = saved;
  }
}

test('[E c12] retries 0, a per-test timeout of at most 90 s, and the base URL is the validated deployment URL', async () => {
  const cfg = await loadConfig(`${GOOD}/`);
  assert.equal(cfg.retries, 0);
  assert.ok(cfg.timeout > 0 && cfg.timeout <= 90_000);
  assert.equal(cfg.use.baseURL, GOOD);
});

test('[E c12] the config refuses a missing, a branch-alias and a foreign base URL', async () => {
  for (const bad of [undefined, '', 'https://nestly-git-feat-afikyermis-projects.vercel.app', 'https://evil.example.com', 'http://nestly-abc-afikyermis-projects.vercel.app']) {
    await assert.rejects(() => loadConfig(bad), `accepted ${String(bad)}`);
  }
});

test('[E c12] the config runs two Chrome projects at 375x812 and 1280x800 and finds only *.flow.ts files', async () => {
  const cfg = await loadConfig(GOOD);
  const sizes = cfg.projects.map((p) => `${p.use.viewport.width}x${p.use.viewport.height}`).sort();
  assert.deepEqual(sizes, ['1280x800', '375x812']);
  assert.ok(cfg.projects.every((p) => p.use.channel === 'chrome'));
  assert.equal(cfg.testMatch, '**/*.flow.ts');
});

test('[E c12] no video, trace or screenshots are kept (they could capture credentials)', async () => {
  const cfg = await loadConfig(GOOD);
  assert.equal(cfg.use.video, 'off');
  assert.equal(cfg.use.trace, 'off');
  assert.equal(cfg.use.screenshot, 'off');
});

test('[E c12] the root Playwright config tests only ./e2e, so npm run e2e and the CI browser jobs never run e2e-preview/', async () => {
  const root = (await import(new URL('playwright.config.ts', ROOT).href)).default;
  assert.equal(root.testDir, './e2e');
});

test('[E c12] the Preview job runs Playwright with the e2e-preview config only', () => {
  const runs = steps.map(runOf).filter((r) => /playwright test/.test(r));
  assert.equal(runs.length, 1);
  assert.match(runs[0], /-c e2e-preview\/playwright\.config\.ts/);
  for (const r of steps.map(runOf)) assert.doesNotMatch(r, /npm run e2e|(^|\s)e2e\//);
});

test('[E c12] the workflow serialises runs: concurrency preview-e2e, no cancel-in-progress', () => {
  assert.equal(wf.concurrency.group, 'preview-e2e');
  assert.equal(wf.concurrency['cancel-in-progress'], 'false');
});

// ---- criterion 3 (URL part): the deployment-URL rule --------------------------------------------------------------------
const { checkDeploymentUrl } = await import(new URL('preview-e2e-url-check.ts', import.meta.url).href);

for (const ok of [GOOD, `${GOOD}/`, 'https://nestly-9f8e7d6c5-afikyermis-projects.vercel.app']) {
  test(`[E c3] accepted: ${ok}`, () => {
    const r = checkDeploymentUrl(ok);
    assert.equal(r.ok, true);
    assert.equal(r.base, ok.replace(/\/$/, ''));
  });
}

const REFUSED = {
  'a branch alias': 'https://nestly-git-feat-x-afikyermis-projects.vercel.app',
  'the production alias': 'https://nestly.vercel.app',
  'a port': `${GOOD}:8443`,
  'a path': `${GOOD}/api/health`,
  'a query': `${GOOD}/?x=1`,
  'a fragment': `${GOOD}#x`,
  'user info': 'https://user@nestly-abc-afikyermis-projects.vercel.app',
  'user info hiding the host': 'https://nestly-abc-afikyermis-projects.vercel.app@evil.com',
  'plain http': 'http://nestly-abc-afikyermis-projects.vercel.app',
  'another host': 'https://evil.example.com',
  'a look-alike suffix': 'https://nestly-abc-afikyermis-projects.vercel.app.evil.com',
  'another team': 'https://nestly-abc-otherteam-projects.vercel.app',
  'another project': 'https://other-abc-afikyermis-projects.vercel.app',
  'a hyphen in the hash': 'https://nestly-ab-cd-afikyermis-projects.vercel.app',
  'a trailing newline': `${GOOD}\n`,
  'a leading space': ` ${GOOD}`,
  'two trailing slashes': `${GOOD}//`,
  'an empty string': '',
  'whitespace only': '   ',
  'undefined': undefined,
  'a number': 42,
};
for (const [label, value] of Object.entries(REFUSED)) {
  test(`[E c3] refused: ${label}, and the reason does not echo the input`, () => {
    const r = checkDeploymentUrl(value);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0);
    if (typeof value === 'string' && value.trim() !== '') assert.ok(!r.reason.includes(value.trim()));
  });
}

test('[E c3] the check makes no network call (fetch stubbed to throw)', () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('network call');
  };
  try {
    assert.equal(checkDeploymentUrl(GOOD).ok, true);
    assert.equal(checkDeploymentUrl('https://evil.example.com').ok, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

function runGuard(targetUrl) {
  const dir = mkdtempSync(join(tmpdir(), 'pe2e-'));
  const out = join(dir, 'gh-output');
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GITHUB_OUTPUT: out };
  if (targetUrl !== undefined) env.TARGET_URL = targetUrl;
  const r = spawnSync(process.execPath, ['tools/preview-e2e-url-guard.ts'], { cwd: new URL('.', ROOT), env, encoding: 'utf8' });
  let written = '';
  try {
    written = readFileSync(out, 'utf8');
  } catch {
    written = '';
  }
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, text: `${r.stdout}${r.stderr}`, written };
}

test('[E c3] guard CLI: a good URL exits 0 and writes base_url; it never prints the URL', () => {
  const r = runGuard(`${GOOD}/`);
  assert.equal(r.status, 0);
  assert.equal(r.written.trim(), `base_url=${GOOD}`);
  assert.ok(!r.text.includes('nestly-abc123def'));
});

for (const [label, value] of [['a branch alias', REFUSED['a branch alias']], ['a look-alike host', REFUSED['a look-alike suffix']], ['an empty value', ''], ['a missing value', undefined]]) {
  test(`[E c3] guard CLI: ${label} exits 1, writes no output, and does not print the input`, () => {
    const r = runGuard(value);
    assert.equal(r.status, 1);
    assert.equal(r.written, '');
    if (value) assert.ok(!r.text.includes(value));
  });
}

// ---- criterion 4 (A1): the bypass secret goes only to the deployment host --------------------------------------------------
const { createBypassRouteHandler } = await import(new URL('e2e-preview/support/bypass.ts', ROOT).href);
// Header names as spec c4 states them, not imported from the code under test.
const BYPASS_HEADER = 'x-vercel-protection-bypass';
const COOKIE_HEADER = 'x-vercel-set-bypass-cookie';
const SENTINEL = 'SENTINEL-bypass-7d9a41f0c2';
const ORIGIN = GOOD;

function fakeRoute(url, { fetchFails = false } = {}) {
  const calls = { fetch: [], fulfill: [], continue: 0, abort: [] };
  const response = { status: () => 302, headers: () => ({ location: 'https://evil.example.com/steal' }) };
  const route = {
    request: () => ({ url: () => url, headers: () => ({ accept: 'text/html' }) }),
    fetch: async (opts) => {
      calls.fetch.push(opts);
      if (fetchFails) throw new Error(`fetch failed; headers: ${BYPASS_HEADER}: ${SENTINEL}`);
      return response;
    },
    fulfill: async (opts) => {
      calls.fulfill.push(opts);
    },
    continue: async () => {
      calls.continue += 1;
    },
    abort: async (reason) => {
      calls.abort.push(reason);
    },
  };
  return { route, calls, response };
}

async function capture(fn) {
  const chunks = [];
  const outW = process.stdout.write;
  const errW = process.stderr.write;
  const logW = console.log;
  const errL = console.error;
  process.stdout.write = (c) => (chunks.push(String(c)), true);
  process.stderr.write = (c) => (chunks.push(String(c)), true);
  console.log = (...a) => chunks.push(a.join(' '));
  console.error = (...a) => chunks.push(a.join(' '));
  try {
    await fn();
  } finally {
    process.stdout.write = outW;
    process.stderr.write = errW;
    console.log = logW;
    console.error = errL;
  }
  return chunks.join('');
}

test('[E c4] a request to the deployment origin carries the bypass headers, follows no redirect, and is fulfilled with the response', async () => {
  const { route, calls, response } = fakeRoute(`${ORIGIN}/feed`);
  const out = await capture(() => createBypassRouteHandler(ORIGIN, SENTINEL)(route));
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].headers[BYPASS_HEADER], SENTINEL);
  assert.equal(calls.fetch[0].headers[COOKIE_HEADER], 'true');
  assert.equal(calls.fetch[0].maxRedirects, 0);
  assert.equal(calls.fulfill.length, 1);
  assert.equal(calls.fulfill[0].response, response);
  assert.equal(calls.continue, 0);
  assert.ok(!out.includes(SENTINEL));
});

for (const [label, url] of [
  ['the Supabase project host', 'https://xmihorrkegrdlbhpktny.supabase.co/auth/v1/token'],
  ['a font host', 'https://fonts.gstatic.com/s/x.woff2'],
  ['the same host over http', 'http://nestly-abc123def-afikyermis-projects.vercel.app/feed'],
  ['the same host on another port', 'https://nestly-abc123def-afikyermis-projects.vercel.app:8443/feed'],
  ['a look-alike host', 'https://nestly-abc123def-afikyermis-projects.vercel.app.evil.com/feed'],
  ['a host with the deployment origin in its path', `https://evil.example.com/${ORIGIN}/feed`],
  ['a host with user info', 'https://nestly-abc123def-afikyermis-projects.vercel.app@evil.com/feed'],
  ['an unparseable URL', 'not a url'],
]) {
  test(`[E c4] a request to ${label} continues untouched: no fetch, no header, no sentinel`, async () => {
    const { route, calls } = fakeRoute(url);
    const out = await capture(() => createBypassRouteHandler(ORIGIN, SENTINEL)(route));
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.fulfill.length, 0);
    assert.equal(calls.continue, 1);
    assert.ok(!JSON.stringify(calls).includes(SENTINEL));
    assert.ok(!out.includes(SENTINEL));
  });
}

test('[E c4] a failed fetch aborts the request; its error (which lists headers) is not rethrown or printed', async () => {
  const { route, calls } = fakeRoute(`${ORIGIN}/feed`, { fetchFails: true });
  let thrown;
  const out = await capture(async () => {
    try {
      await createBypassRouteHandler(ORIGIN, SENTINEL)(route);
    } catch (e) {
      thrown = e;
    }
  });
  assert.equal(thrown, undefined);
  assert.equal(calls.abort.length, 1);
  assert.ok(!out.includes(SENTINEL));
  assert.ok(!JSON.stringify(calls.abort).includes(SENTINEL));
});

test('[E c4] a cross-host redirect from the deployment is handed to the browser, never followed with the credential', async () => {
  const { route, calls } = fakeRoute(`${ORIGIN}/login`);
  await createBypassRouteHandler(ORIGIN, SENTINEL)(route);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].maxRedirects, 0);
  assert.equal(calls.fetch.filter((c) => c.url !== undefined).length, 0, 'no second fetch with a Location URL');
});

test('[E c4] the sentinel is not in a URL: the handler never puts the secret in a query string', async () => {
  const { route, calls } = fakeRoute(`${ORIGIN}/feed?x=1`);
  await createBypassRouteHandler(ORIGIN, SENTINEL)(route);
  assert.ok(!JSON.stringify({ ...calls.fetch[0], headers: undefined }).includes(SENTINEL));
});

// ---- criterion 5: the test user -------------------------------------------------------------------------------------------
const { TEST_EMAIL_REGEX, generateTestUser } = await import(new URL('e2e-preview/support/test-user.ts', ROOT).href);

test('[E c5] a generated email matches the anchored pattern; alice@example.com and look-alikes do not', () => {
  const u = generateTestUser('123456', '1');
  assert.match(u.email, TEST_EMAIL_REGEX);
  assert.match(u.email, /^nestly-e2e-123456-1-[0-9a-f]{16}@gmail\.com$/);
  for (const bad of [
    'alice@example.com',
    'e2e-preview-1-x@example.test.evil.com',
    'nestly-e2e-1-1-0123456789abcdef@gmailXcom',
    'nestly-e2e-1-1-0123456789abcdef@gmail.com.evil.com',
    'xnestly-e2e-1-1-0123456789abcdef@gmail.com',
    'nestly-e2e-1-1-0123456789abcdef@gmail.com\n',
    'nestly-e2e-1-1-0123456789ABCDEF@gmail.com',
    'nestly-e2e-1-1-0123456789abcde@gmail.com',
    'nestly-e2e-1-1-0123456789abcdef0@gmail.com',
    'nestly-e2e-x-1-0123456789abcdef@gmail.com',
    'nestly-e2e-1-1000-0123456789abcdef@gmail.com',
    'nestly-e2e-1-1-0123456789abcdef@gmail.com,alice@gmail.com',
  ]) {
    assert.doesNotMatch(bad, TEST_EMAIL_REGEX, bad);
  }
});

test('[E c5] password is at least 16 characters; email, password and answers differ between users and between runs', () => {
  const a = generateTestUser('900', '1');
  const b = generateTestUser('900', '1');
  const c = generateTestUser('901', '1');
  for (const u of [a, b, c]) {
    assert.ok(u.password.length >= 16);
    assert.ok(Object.keys(u.answers).length === 2);
  }
  const all = [a, b, c];
  for (const pick of [(u) => u.email, (u) => u.password, (u) => u.answers.pet, (u) => u.answers.nickname]) {
    assert.equal(new Set(all.map(pick)).size, all.length);
  }
});

test('[E c5] the email carries the run id and attempt; a non-numeric run id is refused', () => {
  assert.match(generateTestUser('777', '2').email, /^nestly-e2e-777-2-/);
  for (const [run, attempt] of [['', '1'], ['abc', '1'], ['1', ''], ['1', '1000'], ['1; rm -rf', '1'], ['123456789012345678901', '1']]) {
    assert.throws(() => generateTestUser(run, attempt), run + attempt);
  }
});

test('[E c5] generating a user prints nothing (the password and answers are never logged)', async () => {
  let u;
  const out = await capture(() => {
    u = generateTestUser('5', '1');
  });
  assert.equal(out, '');
  assert.ok(u);
});

// ---- criterion 7: failed /recovery attempts stay under F1.6's limit of 5 per 30 minutes -----------------------------------
const { createRecoveryAttempts, MAX_FAILED_RECOVERY_ATTEMPTS } = await import(new URL('e2e-preview/support/recovery-attempts.ts', ROOT).href);

test('[E c7] the counter allows four failed attempts per user and throws on the fifth', () => {
  const counter = createRecoveryAttempts();
  const email = 'nestly-e2e-1-1-0123456789abcdef@gmail.com';
  assert.equal(MAX_FAILED_RECOVERY_ATTEMPTS, 4);
  for (let i = 1; i <= 4; i += 1) assert.equal(counter.recordFailedAttempt(email), i);
  assert.throws(() => counter.recordFailedAttempt(email));
  assert.throws(() => counter.recordFailedAttempt(email), 'it stays refused after the fifth');
});

test('[E c7] counters are per user: one user at four does not block another', () => {
  const counter = createRecoveryAttempts();
  for (let i = 0; i < 4; i += 1) counter.recordFailedAttempt('a@gmail.com');
  assert.equal(counter.recordFailedAttempt('b@gmail.com'), 1);
  assert.throws(() => counter.recordFailedAttempt('a@gmail.com'));
});

test('[E c7] two counters (two workers) are independent', () => {
  const x = createRecoveryAttempts();
  const y = createRecoveryAttempts();
  for (let i = 0; i < 4; i += 1) x.recordFailedAttempt('a@gmail.com');
  assert.equal(y.recordFailedAttempt('a@gmail.com'), 1);
});

// ---- criterion 11 (secrets leave the runner's process.env before any worker starts) ---------------------------------------
const { default: globalSetup, SECRET_ENV, SECRET_FILE_ENV } = await import(new URL('e2e-preview/support/global-setup.ts', ROOT).href);

async function withSecretEnv(value, fn) {
  const saved = { s: process.env[SECRET_ENV], f: process.env[SECRET_FILE_ENV] };
  delete process.env[SECRET_FILE_ENV];
  if (value === undefined) delete process.env[SECRET_ENV];
  else process.env[SECRET_ENV] = value;
  try {
    return await fn();
  } finally {
    for (const [k, v] of [[SECRET_ENV, saved.s], [SECRET_FILE_ENV, saved.f]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('[E c11] after global setup the secret is gone from process.env and only a private file holds it; teardown removes the file', () =>
  withSecretEnv('SENTINEL-gs-41b7', () => {
    const teardown = globalSetup();
    assert.equal(process.env[SECRET_ENV], undefined);
    const file = process.env[SECRET_FILE_ENV];
    assert.equal(typeof file, 'string');
    assert.equal(readFileSync(file, 'utf8'), 'SENTINEL-gs-41b7');
    assert.ok(!JSON.stringify(process.env).includes('SENTINEL-gs-41b7'));
    teardown();
    assert.equal(existsSync(file), false);
  }));

for (const [label, value] of [['missing', undefined], ['empty', '']]) {
  test(`[E c11] a ${label} secret makes global setup throw, and nothing is left behind`, () =>
    withSecretEnv(value, () => {
      assert.throws(() => globalSetup());
      assert.equal(process.env[SECRET_ENV], undefined);
      assert.equal(process.env[SECRET_FILE_ENV], undefined);
    }));
}

// ---- criterion 10: the result is always reported, per viewport, without user data ----------------------------------------
test('[E c10] the final step runs if: always()', () => {
  assert.equal(String(steps.at(-1).if).trim(), 'always()');
});

test('[E c10] the JSON report path is under runner.temp and is never uploaded', () => {
  const pw = steps.find((s) => /playwright test/.test(runOf(s)));
  assert.match(pw.env.PREVIEW_E2E_REPORT_FILE, /^\$\{\{\s*runner\.temp\s*\}\}\//);
  assert.doesNotMatch(workflowText, /upload-artifact/);
});

test('[E c10] the summary prints a passed/failed line for each of mobile-375 and desktop-1280', (t) => {
  const probe = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' });
  if (probe.status !== 0) return t.skip('bash or jq not available here');
  const dir = mkdtempSync(join(tmpdir(), 'pe2e-sum-'));
  try {
    const row = (projectName, status) => ({ projectName, status, results: [{ status }] });
    const report = { suites: [{ specs: [{ tests: [row('mobile-375', 'expected'), row('mobile-375', 'unexpected'), row('desktop-1280', 'expected')] }] }] };
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report));
    const summary = join(dir, 'summary.md');
    const r = spawnSync('bash', ['-c', runOf(steps.at(-1))], {
      env: { PATH: process.env.PATH, JOB_STATUS: 'failure', REPORT_FILE: join(dir, 'report.json').replaceAll('\\', '/'), GITHUB_STEP_SUMMARY: summary.replaceAll('\\', '/'), GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1' },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    const text = readFileSync(summary, 'utf8');
    assert.match(text, /mobile-375.*1 passed.*1 failed/);
    assert.match(text, /desktop-1280.*1 passed.*0 failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
