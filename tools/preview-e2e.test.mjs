// preview-e2e (Afik 16.10.2026; nightly and by hand since 20.10.2026): criteria 1 (triggers, the ready/nightly push that is
// never forced, the Preview-only deployment search), 2, 12 (workflow and config), 3 (URL part), 4 (request helper with stubs
// and sentinels), 5 and 7 (user pattern, attempt counter). Criteria 8 and 9 (cleanup, sweep) are asserted in
// preview-e2e-cleanup.test.mjs. Expected values come from the spec, the email pattern and the F1.6 limit, never from the
// code under test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { codeOf, parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const ROOT = new URL('..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const workflowText = read('.github/workflows/preview-e2e.yml');
const wf = parseYaml(workflowText);
const job = wf.jobs.e2e;
const steps = stepsOf(job);

const GOOD = 'https://nestly-abc123def-afikyermis-projects.vercel.app';

// ---- criterion 1 (as of 20.10.2026): nightly and by hand, on a Preview of main reached through ready/nightly -------------
const deployment = wf.jobs.deployment;
const dsteps = stepsOf(deployment);
const allSteps = [...dsteps, ...steps];
const ciWorkflow = parseYaml(read('.github/workflows/ci.yml'));
const minuteOfDay = (cron) => {
  const m = /^(\d+) (\d+) \* \* \*$/.exec(cron);
  assert.ok(m, `not a daily cron: ${cron}`);
  return Number(m[2]) * 60 + Number(m[1]);
};

test('[E c1] the triggers are schedule and workflow_dispatch only: no deployment_status, push or workflow_run', () => {
  assert.deepEqual(Object.keys(wf.on), ['schedule', 'workflow_dispatch']);
  assert.deepEqual(wf.on.schedule.map((s) => s.cron), ['47 22 * * *']);
});

test('[E c1] the nightly run starts after the nightly CI run, the same night', () => {
  const ciNightly = minuteOfDay(ciWorkflow.on.schedule[0].cron);
  const e2eNightly = minuteOfDay(wf.on.schedule[0].cron);
  assert.ok(e2eNightly - ciNightly >= 20, `preview-e2e at ${e2eNightly}, CI at ${ciNightly} (minutes of the day, UTC)`);
});

test('[E c1] only the deployment job can write: contents write and deployments read, from the default branch only', () => {
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.deepEqual(deployment.permissions, { contents: 'write', deployments: 'read' });
  assert.equal(deployment.if, "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
  assert.ok(job.permissions === undefined || job.permissions === null, 'the e2e job widens its permissions');
  assert.deepEqual([job.needs].flat(), ['deployment']);
});

test('[E c1] the deployment job checks out the default branch; the e2e job checks out the commit it found, without credentials', () => {
  const co = dsteps.find((s) => /actions\/checkout/.test(String(s.uses)));
  assert.equal(co.with.ref, '${{ github.event.repository.default_branch }}');
  assert.equal(String(co.with['fetch-depth']), '0');
  const eco = steps.find((s) => /actions\/checkout/.test(String(s.uses)));
  assert.match(eco.with.ref, /^\$\{\{\s*needs\.deployment\.outputs\.sha\s*\}\}$/);
  assert.equal(String(eco.with['persist-credentials']), 'false');
});

test('[E c1] the deployment job runs no repository code and holds no secret: git and gh only, the token as github.token in one step', () => {
  for (const s of dsteps) {
    assert.doesNotMatch(runOf(s), /\bnpm\b|\bnode\b|\bnpx\b|tools\//, `step "${s.name ?? s.uses}" runs repository code`);
    assert.doesNotMatch(JSON.stringify(s), /secrets\./);
  }
  const holders = dsteps.filter((s) => JSON.stringify(s.env ?? {}).includes('github.token'));
  assert.equal(holders.length, 1);
  assert.match(runOf(holders[0]), /gh api/);
});

test('[E c1] ready/nightly is never force-pushed: exactly one plain push of the commit to refs/heads/ready/nightly', () => {
  const runs = allSteps.map((st) => codeOf(runOf(st))).join('\n');
  const pushes = runs.split('\n').filter((l) => /\bgit\s+push\b/.test(l));
  assert.equal(pushes.length, 1, pushes.join('\n'));
  assert.match(pushes[0], /git push origin "\$\{sha\}:refs\/heads\/ready\/nightly"/);
  assert.doesNotMatch(runs, /--force|--force-with-lease|--mirror|--delete|\bpush\b[^\n]*\s-f\b|\bpush\b[^\n]*\s\+|update-ref|branch -D/);
});

test('[E c1] the deployment searched for is a Preview of that exact commit by vercel[bot] with a latest status of success', () => {
  const wait = runOf(dsteps.find((s) => s.id === 'wait'));
  for (const piece of ['-f environment=Preview', '-f sha="${SHA}"', '.sha == \\"${SHA}\\"', '.environment == \\"Preview\\"', '.production_environment != true', '.creator.login == \\"vercel[bot]\\"', 'statuses?per_page=1', '.[0] | select(.state == "success")', '15 * 60']) {
    assert.ok(wait.includes(piece), `the wait step lacks ${piece}`);
  }
});

// Behaviour: the two deployment steps run with bash in a sandbox (a bare origin, a fake gh over jq, a fake clock).
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const toolsMissing = ['bash', 'git', 'jq'].some((t) => sh('bash', ['-c', `command -v ${t}`]).status !== 0) ? 'bash, git or jq is not available' : false;
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
const g = (cwd, ...args) => {
  const r = sh('git', ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, env: gitEnv });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

function runStepIn(cwd, step, env) {
  const dir = mkdtempSync(join(tmpdir(), 'pe2e-step-'));
  try {
    writeFileSync(join(dir, 'step.sh'), runOf(step));
    writeFileSync(join(dir, 'out'), '');
    const r = sh('bash', ['-e', join(dir, 'step.sh')], { cwd, env: { ...gitEnv, GITHUB_OUTPUT: join(dir, 'out'), ...env } });
    const out = Object.fromEntries(readFileSync(join(dir, 'out'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    return { status: r.status, text: `${r.stdout}${r.stderr}`, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// origin (bare) with main = c1 -> c2; `ready` sets ready/nightly to 'c1', 'c2', 'diverged' or nothing.
function sandbox(ready, { rejectPushes = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pe2e-git-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  g(dir, 'init', '-q', '--bare', origin);
  g(dir, 'clone', '-q', origin, work);
  const commit = (msg) => {
    writeFileSync(join(work, 'f'), msg);
    g(work, 'add', 'f');
    g(work, 'commit', '-q', '-m', msg);
    return g(work, 'rev-parse', 'HEAD');
  };
  const c1 = commit('c1');
  if (ready === 'diverged') {
    commit('side');
    g(work, 'push', '-q', 'origin', 'HEAD:refs/heads/ready/nightly');
    g(work, 'reset', '-q', '--hard', c1);
  }
  const c2 = commit('c2');
  g(work, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  if (ready === 'c1' || ready === 'c2') g(work, 'push', '-q', 'origin', `${ready === 'c1' ? c1 : c2}:refs/heads/ready/nightly`);
  const before = sh('git', ['ls-remote', origin, 'refs/heads/ready/nightly'], { env: gitEnv }).stdout.split('\t')[0];
  if (rejectPushes) writeFileSync(join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\necho "rejected by a rule" >&2\nexit 1\n', { mode: 0o755 });
  const remote = () => sh('git', ['ls-remote', origin, 'refs/heads/ready/nightly'], { env: gitEnv }).stdout.split('\t')[0];
  return { dir, work, c1, c2, before, remote };
}

const candidate = dsteps.find((s) => s.id === 'candidate');
const treeOf = (box, rev) => g(box.work, 'rev-parse', `${rev}^{tree}`);
const parentsOf = (box, rev) => { g(box.work, 'fetch', '-q', 'origin', 'refs/heads/ready/nightly'); return g(box.work, 'rev-list', '--parents', '-n', '1', rev).split(' ').slice(1); };
for (const [label, ready] of [
  ['ready/nightly missing: created as a new commit of main', undefined],
  ['ready/nightly behind main: a new child of it and of main', 'c1'],
  ["ready/nightly at main's own commit (Production, no Preview): a new child", 'c2'],
  ['ready/nightly diverged from main: still a fast-forward, a child of both', 'diverged'],
]) {
  test(`[E c1] ${label}`, { skip: toolsMissing }, () => {
    const box = sandbox(ready);
    try {
      const r = runStepIn(box.work, candidate, {});
      assert.equal(r.status, 0, r.text);
      assert.equal(box.remote(), r.out.sha);
      assert.notEqual(r.out.sha, box.c2, "never main's own commit: Vercel builds no Preview of it");
      assert.equal(treeOf(box, r.out.sha), treeOf(box, box.c2), "exactly main's tree");
      const parents = parentsOf(box, r.out.sha);
      assert.ok(parents.includes(box.c2), 'a child of main');
      if (box.before) assert.ok(parents.includes(box.before), 'a child of the old tip, so the push is a fast-forward');
    } finally {
      rmSync(box.dir, { recursive: true, force: true });
    }
  });
}

test("[E c1] ready/nightly already holds main's tree in a nightly commit: nothing is pushed (a push would be refused here) and that commit is used", { skip: toolsMissing }, () => {
  const box = sandbox('c2');
  try {
    const first = runStepIn(box.work, candidate, {});
    assert.equal(first.status, 0, first.text);
    writeFileSync(join(box.dir, 'origin.git', 'hooks', 'pre-receive'), '#!/bin/sh\necho "rejected by a rule" >&2\nexit 1\n', { mode: 0o755 });
    const r = runStepIn(box.work, candidate, {});
    assert.equal(r.status, 0, r.text);
    assert.equal(r.out.sha, first.out.sha);
    assert.match(r.text, /nothing pushed/);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test('[E c1] the push is refused by the server: the run fails, says it is never forced, and the branch is unchanged', { skip: toolsMissing }, () => {
  const box = sandbox('c1', { rejectPushes: true });
  try {
    const r = runStepIn(box.work, candidate, {});
    assert.equal(r.status, 1, r.text);
    assert.match(r.text, /never force-pushed/);
    assert.equal(box.remote(), box.before);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

const SHA = 'a'.repeat(40);
const PROD = 'https://nestly-prod111-afikyermis-projects.vercel.app';
const dep = (id, over = {}) => ({ id, sha: SHA, environment: 'Preview', production_environment: false, creator: { login: 'vercel[bot]' }, ...over });
const FAKE_GH = `#!/usr/bin/env bash
set -eu
path=""; jqexpr="."
while [ $# -gt 0 ]; do
  case "$1" in
    api) ;; -X) shift ;; -f) echo "$2" >> "$FAKE/params"; shift ;; --jq) jqexpr="$2"; shift ;; *) path="$1" ;;
  esac
  shift
done
case "$path" in
  */statuses*) id="\${path#*/deployments/}"; file="$FAKE/statuses-\${id%%/*}.json" ;;
  */deployments) file="$FAKE/deployments.json" ;;
  *) exit 2 ;;
esac
jq -r "$jqexpr" "$file"
`;
const FAKE_DATE = '#!/usr/bin/env bash\nn=$(cat "$FAKE/now" 2>/dev/null || echo 1000)\necho $((n + 400)) > "$FAKE/now"\necho "$n"\n';

function waitWith(deployments, statuses) {
  const fake = mkdtempSync(join(tmpdir(), 'pe2e-gh-'));
  try {
    for (const [name, text] of [['gh', FAKE_GH], ['date', FAKE_DATE], ['sleep', '#!/bin/sh\nexit 0\n']]) writeFileSync(join(fake, name), text, { mode: 0o755 });
    writeFileSync(join(fake, 'deployments.json'), JSON.stringify(deployments));
    for (const [id, list] of Object.entries(statuses)) writeFileSync(join(fake, `statuses-${id}.json`), JSON.stringify(list));
    const r = runStepIn(fake, dsteps.find((s) => s.id === 'wait'), { PATH: `${fake}:${process.env.PATH}`, FAKE: fake, SHA, GH_TOKEN: 'x', GITHUB_REPOSITORY: 'o/r' });
    let params = '';
    try {
      params = readFileSync(join(fake, 'params'), 'utf8');
    } catch {
      params = '';
    }
    return { ...r, params };
  } finally {
    rmSync(fake, { recursive: true, force: true });
  }
}

const DECOYS = [dep(1, { environment: 'Production', production_environment: true }), dep(2, { creator: { login: 'someone-else' } }), dep(3, { sha: 'b'.repeat(40) }), dep(4), dep(6, { environment: 'preview' })];
const DECOY_STATUSES = { 1: [{ state: 'success', target_url: PROD }], 2: [{ state: 'success', target_url: 'https://evil.example.com' }], 3: [{ state: 'success', target_url: PROD }], 4: [{ state: 'failure', target_url: PROD }, { state: 'success', target_url: PROD }], 6: [{ state: 'success', target_url: PROD }] };

test('[E c1] wait: Production, another creator, another commit, a failed latest status and a wrong environment are passed over; the Preview is taken', { skip: toolsMissing }, () => {
  const r = waitWith([...DECOYS, dep(5)], { ...DECOY_STATUSES, 5: [{ state: 'success', target_url: GOOD, environment_url: PROD }] });
  assert.equal(r.status, 0, r.text);
  assert.equal(r.out.target_url, GOOD);
  assert.ok(!r.text.includes(GOOD), 'the URL is printed');
  assert.match(r.params, /^sha=a{40}$/m);
  assert.match(r.params, /^environment=Preview$/m);
});

test('[E c1] wait: environment_url is the fallback when the status has no target_url', { skip: toolsMissing }, () => {
  const r = waitWith([dep(5)], { 5: [{ state: 'success', environment_url: GOOD }] });
  assert.equal(r.out.target_url, GOOD);
});

test('[E c1] wait: no matching deployment fails after the deadline and writes no URL', { skip: toolsMissing }, () => {
  const r = waitWith(DECOYS, DECOY_STATUSES);
  assert.equal(r.status, 1, r.text);
  assert.match(r.text, /within 15 minutes/);
  assert.deepEqual(r.out, {});
});

test('[E c1] wait: a URL with a newline or a space cannot reach the output file', { skip: toolsMissing }, () => {
  for (const bad of [`${GOOD}\ninjected=1`, `${GOOD} x`]) {
    const r = waitWith([dep(5)], { 5: [{ state: 'success', target_url: bad }] });
    assert.equal(r.status, 1, r.text);
    assert.deepEqual(r.out, {});
  }
});

// ---- criterion 2: environment and secrets -----------------------------------------------------------------------------
test('[E c2] temporary staff setup uses the main-restricted preview-e2e environment (Afik 23.10)', () => {
  assert.equal(job.environment, 'preview-e2e');
  assert.equal(wf.environment, undefined);
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

test('[E c2] no github.event.* expression in a run body of either job (values arrive through env)', () => {
  for (const step of allSteps) {
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
  assert.match(steps[guardIdx].env.TARGET_URL, /^\$\{\{\s*needs\.deployment\.outputs\.target_url\s*\}\}$/);
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
  // The one upload (24.10.2026, failure only) is the redacted error-context.md folder: never the report, a trace, a video or a screenshot.
  const uploads = steps.filter((s) => /upload-artifact/.test(String(s.uses ?? '')));
  assert.equal(uploads.length, 1);
  assert.equal(String(uploads[0].if).trim(), 'failure()');
  assert.match(uploads[0].with.path, /preview-e2e-failures$/);
  assert.equal(String(uploads[0].with['retention-days']), '7');
  assert.doesNotMatch(String(uploads[0].with.path), /report/);
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


// ---- temporary staff (Afik 23.10.2026; review 24.10.2026): the database credential never meets the tested tree's code -----
const idxOf = (re) => steps.findIndex((s) => re.test(runOf(s)) || re.test(String(s.uses ?? '')) || re.test(String(s.name ?? '')));

test('[BR-083 Preview] the harness checkout, its own script-free install and the staff setup all run before the tested tree is installed', () => {
  const harness = steps.findIndex((s) => /actions\/checkout/.test(String(s.uses ?? '')) && s.with?.path === '.preview-harness');
  const harnessInstall = steps.findIndex((s) => s['working-directory'] === '.preview-harness' && /npm ci/.test(runOf(s)));
  const setup = idxOf(/preview-e2e-staff-cli\.ts/);
  const testedInstall = steps.findIndex((s) => s['working-directory'] === undefined && /^\s*npm ci\s*$/.test(runOf(s)));
  const browsers = idxOf(/playwright install/);
  assert.ok(harness >= 0 && harness < harnessInstall && harnessInstall < setup, 'harness checkout, then its install, then setup');
  assert.ok(setup < testedInstall && setup < browsers, 'staff setup must come before the tested tree is installed');
  assert.match(runOf(steps[harnessInstall]), /npm ci --ignore-scripts/);
  assert.equal(steps[harness].with.ref, '${{ github.event.repository.default_branch }}');
  assert.equal(String(steps[harness].with['persist-credentials']), 'false');
});

test('[BR-083 Preview] only the staff setup step holds PREVIEW_DB_ADMIN_URL, and it runs with NODE_OPTIONS cleared', () => {
  const holders = steps.filter((s) => JSON.stringify(s.env ?? {}).includes('PREVIEW_DB_ADMIN_URL'));
  assert.equal(holders.length, 1);
  assert.match(runOf(holders[0]), /^node \.preview-harness\/tools\/preview-e2e-staff-cli\.ts$/);
  assert.equal(holders[0].env.NODE_OPTIONS, '');
});

test('[BR-083 Preview] the failure context is collected by the harness while the staff file exists; removal always runs after it', () => {
  const collect = idxOf(/preview-e2e-failure-context-cli\.ts/);
  const remove = steps.findIndex((s) => /rmSync\(process\.env\.PREVIEW_E2E_STAFF_FILE/.test(runOf(s)));
  const upload = steps.findIndex((s) => /upload-artifact/.test(String(s.uses ?? '')));
  const pw = idxOf(/playwright test/);
  assert.ok(pw < collect && collect < remove && remove < upload);
  assert.equal(String(steps[collect].if).trim(), 'failure()');
  assert.equal(String(steps[remove].if).trim(), 'always()');
  assert.match(steps[collect].env.PREVIEW_E2E_STAFF_FILE, /^\$\{\{\s*runner\.temp\s*\}\}\/preview-e2e-staff\.json$/);
  assert.equal(steps[collect].env.NODE_OPTIONS, '');
  assert.match(runOf(steps[collect]), /^node \.preview-harness\//);
});
