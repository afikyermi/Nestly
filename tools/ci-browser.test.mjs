// Repository tests for the browser jobs of .github/workflows/ci.yml (CI contract of 20.10.2026):
// - `browser`: the whole Chrome suite as a matrix of eight parallel shards, when `changes` says browser=full (push to main,
//   nightly schedule, workflow_dispatch, and a pull request whose changed files cannot be read). On push and schedule the
//   visual specs are left out (E2E_SKIP_VISUAL, playwright.config.ts); by hand they run.
// - `browser-changed`: a pull request's added or changed specs only, in Chrome, one job, skipped when there are none.
// - `browser-edge`: the Edge suite in eight shards, by workflow_dispatch only.
// What must not drift: the matrix is exactly project x shard (so no browser or shard silently drops out), no leg stops the
// others, each job installs only its own browser, builds the gallery before it runs, its report has its own name, the
// --shard divisor equals the matrix length, and every browser job ends itself before its timeout (globalTimeout).
// They parse the workflow as data and never run it. The YAML reader is tools/workflow-yaml.mjs. Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { has, needsOf, parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ci = parseYaml(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8');

/** The `name`s of the Playwright projects, read from the config file. */
const projectNames = [...config.matchAll(/\{\s*name:\s*'([^']+)'/g)].map((m) => m[1]);

const FULL_IF = /^(?:\$\{\{\s*)?needs\.changes\.outputs\.browser\s*==\s*'full'(?:\s*\}\})?$/;
const CHANGED_IF = /^(?:\$\{\{\s*)?needs\.changes\.outputs\.browser\s*==\s*'changed'(?:\s*\}\})?$/;
const EDGE_IF = /^(?:\$\{\{\s*)?github\.event_name\s*==\s*'workflow_dispatch'(?:\s*\}\})?$/;
// The visual specs are left out on push and schedule only: a manual run (and the pull-request fail-safe) keeps them.
const VISUAL_ENV = /^\$\{\{\s*github\.event_name\s*==\s*'push'\s*\|\|\s*github\.event_name\s*==\s*'schedule'\s*\}\}$/;
const PROJECT_FLAG = /--project=\$\{\{\s*matrix\.project\s*\}\}/;
const SHARD_FLAG = /--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)\b/;

/** Everything that must hold for the browser job; each problem is one sentence. */
function browserProblems(job, names) {
  const problems = [];
  if (!job) return ['there is no browser job'];
  const steps = stepsOf(job);

  const matrix = job.strategy?.matrix;
  if (!matrix) problems.push('no strategy.matrix');
  else {
    if (JSON.stringify(Object.keys(matrix).sort()) !== JSON.stringify(['project', 'shard'])) {
      problems.push(`the matrix keys are ${Object.keys(matrix).join(', ')}, not exactly project and shard (no include or exclude)`);
    }
    const projects = [matrix.project ?? []].flat();
    const shards = [matrix.shard ?? []].flat();
    // Pull requests run Chrome only (decisions/2026-10.md "Tests: depth by criterion type"); Edge is `browser-edge`.
    if (JSON.stringify([...projects].sort()) !== JSON.stringify(['chrome'])) problems.push(`matrix.project is [${projects}], not [chrome]`);
    if (JSON.stringify(shards.map(String)) !== JSON.stringify(['1', '2', '3', '4', '5', '6', '7', '8'])) problems.push(`matrix.shard is [${shards}], not [1, 2, 3, 4, 5, 6, 7, 8]`);
    const unknown = projects.filter((p) => !names.includes(p));
    if (unknown.length > 0) problems.push(`matrix.project [${unknown}] is not a Playwright project (the config has [${names}])`);
    const test = steps.find((s) => /\bplaywright\s+test\b/.test(runOf(s)));
    if (!test) problems.push('no step runs playwright test');
    else {
      const run = runOf(test);
      if (!PROJECT_FLAG.test(run)) problems.push('the playwright step does not pass --project=${{ matrix.project }}');
      const shard = SHARD_FLAG.exec(run);
      if (!shard) problems.push('the playwright step does not pass --shard=${{ matrix.shard }}/N');
      else if (Number(shard[1]) !== shards.length) problems.push(`--shard divides into ${shard[1]} but the matrix has ${shards.length} shards`);
      if (!VISUAL_ENV.test(String(test.env?.E2E_SKIP_VISUAL ?? '').trim())) problems.push(`E2E_SKIP_VISUAL is not exactly push-or-schedule: ${String(test.env?.E2E_SKIP_VISUAL)}`);
    }
  }

  if (String(job.strategy?.['fail-fast']) !== 'false') problems.push('fail-fast is not false: one failing leg would cancel the others');
  const minutes = Number(job['timeout-minutes']);
  if (!(minutes >= 10 && minutes <= 15)) problems.push(`timeout-minutes is ${job['timeout-minutes']}, not 10 to 15`);
  if (!needsOf(job).includes('changes')) problems.push('the job does not need `changes`');
  if (typeof job.if !== 'string' || !FULL_IF.test(job.if.trim())) problems.push(`the job's if is not needs.changes.outputs.browser == 'full': ${String(job.if)}`);
  if (has(job, 'continue-on-error')) problems.push('the job has continue-on-error');

  const idx = (re) => steps.findIndex((s) => re.test(runOf(s)));
  const storybook = idx(/\bbuild-storybook\b/);
  const testAt = idx(/\bplaywright\s+test\b/);
  const installAt = idx(/\bplaywright\s+install\b/);
  if (storybook < 0) problems.push('no step builds the storybook');
  else if (testAt >= 0 && storybook > testAt) problems.push('the storybook is built after the tests run');
  if (installAt < 0) problems.push('no step installs a browser');
  else {
    if (testAt >= 0 && installAt > testAt) problems.push('the browser is installed after the tests run');
    // One browser per job: after the flags, exactly one argument, and a literal or an expression keyed on matrix.project.
    const run = runOf(steps[installAt]).replace(/\$\{\{[^}]*\}\}/g, (e) => `EXPR(${e.replace(/\s+/g, '')})`);
    const args = run.split(/\s+/).slice(run.split(/\s+/).indexOf('install') + 1).filter((a) => a !== '' && !a.startsWith('--'));
    if (args.length !== 1) problems.push(`the install step names ${args.length} browsers (${args.join(' ')}), not exactly one`);
    else if (args[0].startsWith('EXPR(') && !/matrix\.project/.test(args[0])) problems.push('the browser to install is an expression that ignores matrix.project');
    else if (!args[0].startsWith('EXPR(') && !['chrome', 'msedge'].includes(args[0])) problems.push(`the install step names ${args[0]}`);
  }

  const upload = steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'));
  const artifact = String(upload?.with?.name ?? '');
  if (!upload) problems.push('no upload-artifact step');
  else if (!/matrix\.project/.test(artifact) || !/matrix\.shard/.test(artifact)) problems.push(`the artifact name "${artifact}" lacks the project or the shard: legs would overwrite each other`);
  return problems;
}

const browser = ci.jobs?.browser;

test('[CI contract] the full browser job is a chrome by shards 1 to 8 matrix, behind browser=full, with a timeout of 10 to 15 minutes', () => {
  assert.deepEqual(browserProblems(browser, projectNames), []);
});

test('[CI contract] the playwright config names its projects chrome and edge (the Chrome matrix is a subset; the Edge job runs the other)', () => {
  assert.deepEqual([...projectNames].sort(), ['chrome', 'edge']);
});

test('[CI contract] the browser problem check can fail: every drift from the contract is caught (guards the tests above)', () => {
  const clone = () => structuredClone(browser);
  const withStep = (job, re, change) => {
    job.steps = job.steps.map((s) => (re.test(runOf(s)) ? { ...s, ...change(s) } : s));
    return job;
  };
  const mutants = {
    'fail-fast true': () => ({ ...clone(), strategy: { ...browser.strategy, 'fail-fast': 'true' } }),
    'fail-fast removed': () => ({ ...clone(), strategy: { matrix: browser.strategy.matrix } }),
    'a third browser': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, project: ['chrome', 'edge', 'firefox'] } } }),
    'edge added to the PR matrix': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, project: ['chrome', 'edge'] } } }),
    'chrome replaced by edge': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, project: ['edge'] } } }),
    'the PR matrix emptied': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, project: [] } } }),
    'a ninth shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] } } }),
    'the old three shards': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3'] } } }),
    'a dropped last shard (four legs)': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3', '4', '5', '6', '7'] } } }),
    'a dropped middle shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3', '4', '5', '6', '8'] } } }),
    'a dropped first shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['2', '3', '4', '5', '6', '7', '8'] } } }),
    'one shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1'] } } }),
    'shards out of order': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['8', '7', '6', '5', '4', '3', '2', '1'] } } }),
    'two shards swapped': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '3', '2', '4', '5', '6', '7', '8'] } } }),
    'an extra matrix key': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, os: ['ubuntu-latest'] } } }),
    'timeout 20': () => ({ ...clone(), 'timeout-minutes': '20' }),
    'timeout 5': () => ({ ...clone(), 'timeout-minutes': '5' }),
    'no needs': () => {
      const j = clone();
      delete j.needs;
      return j;
    },
    'another if': () => ({ ...clone(), if: "github.event_name == 'push'" }),
    'the old web filter': () => ({ ...clone(), if: "needs.changes.outputs.web == 'true'" }),
    'browser=changed runs the full suite': () => ({ ...clone(), if: "needs.changes.outputs.browser == 'changed'" }),
    'visual specs skipped on every event': () => withStep(clone(), /playwright\s+test/, (s) => ({ env: { ...s.env, E2E_SKIP_VISUAL: 'true' } })),
    'visual specs skipped by hand too': () => withStep(clone(), /playwright\s+test/, (s) => ({ env: { ...s.env, E2E_SKIP_VISUAL: "${{ github.event_name != 'pull_request' }}" } })),
    'visual specs never skipped': () => withStep(clone(), /playwright\s+test/, (s) => ({ env: { ...s.env, E2E_SKIP_VISUAL: undefined } })),
    'if always()': () => ({ ...clone(), if: 'always()' }),
    'continue-on-error': () => ({ ...clone(), 'continue-on-error': 'true' }),
    'no --project flag': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(PROJECT_FLAG, '') })),
    'no --shard flag': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(SHARD_FLAG, '') })),
    '--shard divisor 3 with eight legs': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(/\}\}\/8/, '}}/3') })),
    '--shard divisor 9 with eight legs': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(/\}\}\/8/, '}}/9') })),
    'every browser installed': () => withStep(clone(), /playwright\s+install/, () => ({ run: 'npx playwright install --with-deps' })),
    'both browsers installed': () => withStep(clone(), /playwright\s+install/, () => ({ run: 'npx playwright install --with-deps chrome msedge' })),
    'install ignores the matrix': () => withStep(clone(), /playwright\s+install/, () => ({ run: "npx playwright install --with-deps ${{ github.job }}" })),
    'storybook built after the tests': () => {
      const j = clone();
      const at = j.steps.findIndex((s) => /build-storybook/.test(runOf(s)));
      const [step] = j.steps.splice(at, 1);
      j.steps.push(step);
      return j;
    },
    'artifact without the shard': () => {
      const j = clone();
      j.steps = j.steps.map((s) => (typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact') ? { ...s, with: { ...s.with, name: 'playwright-report-${{ matrix.project }}' } } : s));
      return j;
    },
  };
  for (const [label, make] of Object.entries(mutants)) {
    assert.notDeepEqual(browserProblems(make(), projectNames), [], `${label} was not caught`);
  }
  // The matrix names chrome; a config that has no `chrome` project (here only a made-up one) must be caught.
  assert.notDeepEqual(browserProblems(browser, ['firefox']), [], 'a matrix project that is not a Playwright project was not caught');
});

// ---- Edge: by workflow_dispatch only -------------------------------------------------------------------------------------------

const edge = ci.jobs?.['browser-edge'];

/** Everything that must hold for the Edge job and for the triggers that make it run. */
function edgeProblems(job, triggers) {
  const problems = [];
  if (!job) return ['there is no browser-edge job'];
  const steps = stepsOf(job);
  const matrix = job.strategy?.matrix;
  if (JSON.stringify(Object.keys(matrix ?? {})) !== JSON.stringify(['shard'])) problems.push(`the matrix keys are ${Object.keys(matrix ?? {})}, not exactly shard`);
  if (JSON.stringify([matrix?.shard ?? []].flat()) !== JSON.stringify(['1', '2', '3', '4', '5', '6', '7', '8'])) problems.push(`matrix.shard is [${matrix?.shard}], not [1, 2, 3, 4, 5, 6, 7, 8]`);
  if (String(job.strategy?.['fail-fast']) !== 'false') problems.push('fail-fast is not false');
  const condition = String(job.if ?? '').trim();
  if (!EDGE_IF.test(condition)) problems.push(`the if is not exactly github.event_name == 'workflow_dispatch': ${condition}`);
  if (has(job, 'continue-on-error')) problems.push('the job has continue-on-error');
  const minutes = Number(job['timeout-minutes']);
  if (!(minutes >= 10 && minutes <= 15)) problems.push(`timeout-minutes is ${job['timeout-minutes']}, not 10 to 15`);
  const test = steps.find((s) => /\bplaywright\s+test\b/.test(runOf(s)));
  if (!test) problems.push('no step runs playwright test');
  else {
    if (!/--project=edge\b/.test(runOf(test))) problems.push('the playwright step does not run --project=edge');
    const shard = SHARD_FLAG.exec(runOf(test));
    if (!shard || Number(shard[1]) !== [matrix?.shard ?? []].flat().length) problems.push('the playwright step does not pass --shard=${{ matrix.shard }}/N with N the matrix length');
  }
  const install = steps.find((s) => /\bplaywright\s+install\b/.test(runOf(s)));
  if (!install) problems.push('no step installs a browser');
  else if (!/install\s+(?:--\S+\s+)*msedge\s*$/.test(runOf(install).trim())) problems.push(`the install step is not exactly msedge: ${runOf(install)}`);
  if (!steps.some((s) => /\bbuild-storybook\b/.test(runOf(s)))) problems.push('no step builds the storybook');
  const upload = steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'));
  if (!/matrix\.shard/.test(String(upload?.with?.name ?? ''))) problems.push('the artifact name lacks the shard');
  if (!has(triggers, 'workflow_dispatch')) problems.push('the workflow does not run on workflow_dispatch: Edge would never run');
  return problems;
}

test('[CI contract] Edge runs as its own job: shards 1 to 8, only msedge, by workflow_dispatch only', () => {
  assert.deepEqual(edgeProblems(edge, ci.on), []);
});

test('[CI contract] the workflow runs on pull_request, push to main, a nightly schedule at 22:17 UTC and workflow_dispatch', () => {
  for (const trigger of ['pull_request', 'push', 'schedule', 'workflow_dispatch']) assert.ok(has(ci.on, trigger), `ci.yml has no ${trigger} trigger`);
  assert.deepEqual([ci.on.push.branches].flat(), ['main']);
  assert.deepEqual(ci.on.schedule.map((s) => s.cron), ['17 22 * * *']);
});

test('[CI contract] the Edge check can fail: every drift is caught (guards the tests above)', () => {
  const clone = () => structuredClone(edge);
  const mutants = {
    'Edge on push and schedule too (the old not-a-pull-request rule)': () => ({ ...clone(), if: "github.event_name != 'pull_request'" }),
    'Edge behind the web filter only': () => ({ ...clone(), if: "needs.changes.outputs.web == 'true'" }),
    'Edge on schedule too': () => ({ ...clone(), if: "github.event_name == 'workflow_dispatch' || github.event_name == 'schedule'" }),
    'Edge with no condition': () => {
      const j = clone();
      delete j.if;
      return j;
    },
    'fail-fast true': () => ({ ...clone(), strategy: { ...edge.strategy, 'fail-fast': 'true' } }),
    'a project key in the matrix': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { ...edge.strategy.matrix, project: ['edge'] } } }),
    'one shard': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1'] } } }),
    'the old three shards (--shard of 8)': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '3'] } } }),
    'a dropped last shard (four legs, --shard of 5)': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '3', '4', '5', '6', '7'] } } }),
    'a dropped middle shard': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '3', '4', '5', '6', '8'] } } }),
    'a ninth shard': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] } } }),
    'shards out of order': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['8', '7', '6', '5', '4', '3', '2', '1'] } } }),
    '--shard of 3 with eight legs': () => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+test/.test(runOf(s)) ? { ...s, run: runOf(s).replace(/\}\}\/8/, '}}/3') } : s)) }),
    '--shard of 9 with eight legs': () => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+test/.test(runOf(s)) ? { ...s, run: runOf(s).replace(/\}\}\/8/, '}}/9') } : s)) }),
    'continue-on-error': () => ({ ...clone(), 'continue-on-error': 'true' }),
    'runs chrome': () => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+test/.test(runOf(s)) ? { ...s, run: runOf(s).replace('--project=edge', '--project=chrome') } : s)) }),
    'installs chrome too': () => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+install/.test(runOf(s)) ? { ...s, run: 'npx playwright install --with-deps chrome msedge' } : s)) }),
    'no storybook build': () => ({ ...clone(), steps: clone().steps.filter((s) => !/build-storybook/.test(runOf(s))) }),
    'the if widened with || true': () => ({ ...clone(), if: `${edge.if} || true` }),
    'no job at all': () => undefined,
  };
  for (const [label, make] of Object.entries(mutants)) {
    assert.notDeepEqual(edgeProblems(make(), ci.on), [], `${label} was not caught`);
  }
  const triggers = Object.fromEntries(Object.entries(ci.on).filter(([k]) => k !== 'workflow_dispatch'));
  assert.notDeepEqual(edgeProblems(edge, triggers), [], 'a workflow without workflow_dispatch was not caught');
});

// ---- browser-changed: a pull request's own specs ------------------------------------------------------------------------------

const changed = ci.jobs?.['browser-changed'];

/** Everything that must hold for the job that runs a pull request's added or changed specs. */
function changedProblems(job) {
  if (!job) return ['there is no browser-changed job'];
  const problems = [];
  const steps = stepsOf(job);
  if (!needsOf(job).includes('changes')) problems.push('the job does not need `changes`');
  if (typeof job.if !== 'string' || !CHANGED_IF.test(job.if.trim())) problems.push(`the if is not needs.changes.outputs.browser == 'changed': ${String(job.if)}`);
  for (const key of ['strategy', 'continue-on-error']) if (has(job, key)) problems.push(`the job has ${key}`);
  const minutes = Number(job['timeout-minutes']);
  if (!(minutes >= 10 && minutes <= 15)) problems.push(`timeout-minutes is ${job['timeout-minutes']}, not 10 to 15`);
  const idx = (re) => steps.findIndex((s) => re.test(runOf(s)));
  const installAt = idx(/\bplaywright\s+install\b/);
  const storybookAt = idx(/\bbuild-storybook\b/);
  const testAt = idx(/\bplaywright\s+test\b/);
  if (installAt < 0 || !/install\s+(?:--\S+\s+)*chrome\s*$/.test(runOf(steps[installAt]).trim())) problems.push('the install step is not exactly chrome');
  if (storybookAt < 0) problems.push('no step builds the storybook (the web server serves it for any spec)');
  if (testAt < 0) return [...problems, 'no step runs playwright test'];
  if (installAt > testAt || storybookAt > testAt) problems.push('the browser or the gallery comes after the tests');
  const step = steps[testAt];
  const run = runOf(step);
  if (!/playwright\s+test\s+--project=chrome\s+\$\{SPECS\}\s*$/m.test(run)) problems.push('the tests are not `playwright test --project=chrome ${SPECS}`');
  if (/--shard|--project=edge|\$\{\{/.test(run)) problems.push('the run body shards, runs Edge or interpolates an expression');
  if (!/^\$\{\{\s*needs\.changes\.outputs\.specs\s*\}\}$/.test(String(step.env?.SPECS ?? '').trim())) problems.push('SPECS does not come from needs.changes.outputs.specs through env');
  if (!/^\s*set -euf\s*$/m.test(run)) problems.push('globbing is not off (set -f) where the list is split into words');
  if (!/case "\$\{SPECS\}" in\s*\n\s*''\|\*\[!A-Za-z0-9\._\/\\ -\]\*\)[^\n]*exit 1/.test(run)) problems.push('the list is not checked again (empty, or a character outside [A-Za-z0-9._/ -]) before use');
  const upload = steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'));
  if (!upload || !/changed/.test(String(upload.with?.name ?? ''))) problems.push('no upload-artifact step with its own report name');
  return problems;
}

test('[CI contract] a pull request runs only its added or changed specs: browser-changed, Chrome, one job, behind browser=changed', () => {
  assert.deepEqual(changedProblems(changed), []);
});

test('[CI contract] the browser-changed check can fail: every drift is caught (guards the test above)', () => {
  const clone = () => structuredClone(changed);
  const onTest = (change) => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+test/.test(runOf(s)) ? { ...s, ...change(s) } : s)) });
  const mutants = {
    'no job': () => undefined,
    'no needs': () => {
      const j = clone();
      delete j.needs;
      return j;
    },
    'runs whenever web changed': () => ({ ...clone(), if: "needs.changes.outputs.web == 'true'" }),
    'runs on browser=full': () => ({ ...clone(), if: "needs.changes.outputs.browser == 'full'" }),
    'a matrix': () => ({ ...clone(), strategy: { matrix: { shard: ['1', '2'] } } }),
    'continue-on-error': () => ({ ...clone(), 'continue-on-error': 'true' }),
    'timeout 30': () => ({ ...clone(), 'timeout-minutes': '30' }),
    'the whole suite': () => onTest((s) => ({ run: runOf(s).replace(/--project=chrome \$\{SPECS\}/, '--project=chrome') })),
    'Edge instead of Chrome': () => onTest((s) => ({ run: runOf(s).replace('--project=chrome', '--project=edge') })),
    'specs interpolated in the run body': () => onTest((s) => ({ run: runOf(s).replace('${SPECS}', '${{ needs.changes.outputs.specs }}') })),
    'SPECS from somewhere else': () => onTest((s) => ({ env: { SPECS: '${{ github.event.pull_request.title }}' } })),
    'globbing left on': () => onTest((s) => ({ run: runOf(s).replace('set -euf', 'set -eu') })),
    'no second check of the list': () => onTest((s) => ({ run: runOf(s).replace(/case "\$\{SPECS\}" in[\s\S]*?esac/, '') })),
    'both browsers installed': () => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+install/.test(runOf(s)) ? { ...s, run: 'npx playwright install --with-deps chrome msedge' } : s)) }),
    'no storybook build': () => ({ ...clone(), steps: clone().steps.filter((s) => !/build-storybook/.test(runOf(s))) }),
  };
  for (const [label, make] of Object.entries(mutants)) {
    assert.notDeepEqual(changedProblems(make()), [], `${label} was not caught`);
  }
});

// ---- which browser job runs on which event ----------------------------------------------------------------------------------
// Evaluates a job `if` (or an env expression) of the forms ci.yml uses: `<name> == '<v>'` / `!=`, joined by && and ||,
// no parentheses. Anything else throws, so a changed shape fails loudly instead of being misread.
function evaluate(expr, ctx) {
  const body = String(expr).trim().replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
  return body.split('||').some((alt) => alt.split('&&').every((clause) => {
    const m = /^\s*([\w.-]+)\s*(==|!=)\s*'([^']*)'\s*$/.exec(clause);
    if (!m) throw new Error(`cannot read clause: ${clause}`);
    if (!(m[1] in ctx)) throw new Error(`unknown value ${m[1]}`);
    return m[2] === '==' ? ctx[m[1]] === m[3] : ctx[m[1]] !== m[3];
  }));
}

const BROWSER_JOBS = ['browser', 'browser-changed', 'browser-edge'];
// [event, changes' browser output, the browser jobs that run, E2E_SKIP_VISUAL of `browser`]. Every event other than a
// pull request gets browser=full from `changes` (tools/ci-path-filters.run.test.mjs).
const MATRIX = [
  ['pull_request', 'changed', ['browser-changed'], 'false'],
  ['pull_request', 'none', [], 'false'],
  ['pull_request', 'full', ['browser'], 'false'],
  ['push', 'full', ['browser'], 'true'],
  ['schedule', 'full', ['browser'], 'true'],
  ['workflow_dispatch', 'full', ['browser', 'browser-edge'], 'false'],
];

function matrixProblems(jobs) {
  const problems = [];
  const visual = stepsOf(jobs.browser ?? {}).find((s) => /\bplaywright\s+test\b/.test(runOf(s)))?.env?.E2E_SKIP_VISUAL;
  for (const [event, browser, expected, skip] of MATRIX) {
    const ctx = { 'github.event_name': event, 'needs.changes.outputs.browser': browser, 'needs.changes.outputs.web': 'true' };
    const runs = BROWSER_JOBS.filter((name) => jobs[name] && (jobs[name].if === undefined || evaluate(jobs[name].if, ctx)));
    if (JSON.stringify(runs) !== JSON.stringify(expected)) problems.push(`${event}/${browser}: [${runs}] run, not [${expected}]`);
    if (visual === undefined || String(evaluate(visual, ctx)) !== skip) problems.push(`${event}: E2E_SKIP_VISUAL is not ${skip}`);
  }
  return problems;
}

test('[CI contract] PR: changed specs only (full suite when unreadable); main and nightly: full minus visual; by hand: full with visual, and Edge', () => {
  assert.deepEqual(matrixProblems(ci.jobs), []);
});

test('[CI contract] the event matrix check can fail (guards the test above)', () => {
  const withJob = (name, change) => ({ ...ci.jobs, [name]: { ...ci.jobs[name], ...change } });
  for (const [label, jobs] of Object.entries({
    'Edge on every event': withJob('browser-edge', { if: "github.event_name != 'never'" }),
    'the full suite on every pull request': withJob('browser', { if: "needs.changes.outputs.web == 'true'" }),
    'changed specs on push': withJob('browser-changed', { if: "needs.changes.outputs.browser == 'changed' || github.event_name == 'push'" }),
  })) {
    assert.notDeepEqual(matrixProblems(jobs), [], `${label} was not caught`);
  }
  assert.throws(() => evaluate("(github.event_name == 'push')", { 'github.event_name': 'push' }), /cannot read/);
});

// ---- the visual switch in playwright.config.ts ----------------------------------------------------------------------------
let configImports = 0;
async function projectsWith(value) {
  const saved = process.env.E2E_SKIP_VISUAL;
  if (value === undefined) delete process.env.E2E_SKIP_VISUAL;
  else process.env.E2E_SKIP_VISUAL = value;
  try {
    configImports += 1;
    const cfg = (await import(`${new URL('../playwright.config.ts', import.meta.url).href}?visual=${configImports}`)).default;
    return Object.fromEntries(cfg.projects.map((p) => [p.name, p]));
  } finally {
    if (saved === undefined) delete process.env.E2E_SKIP_VISUAL;
    else process.env.E2E_SKIP_VISUAL = saved;
  }
}
const ignores = (project, file) => [project.testIgnore ?? []].flat().some((re) => re.test(file));

test('[CI contract] E2E_SKIP_VISUAL=true leaves *.visual.spec.ts out of chrome by file name; otherwise chrome runs them; edge never does', async () => {
  for (const value of [undefined, '', 'false', '1', 'TRUE']) {
    const p = await projectsWith(value);
    assert.equal(ignores(p.chrome, 'e2e/share.visual.spec.ts'), false, `E2E_SKIP_VISUAL=${value} skipped the visual specs`);
    assert.equal(ignores(p.edge, 'e2e/share.visual.spec.ts'), true);
  }
  const p = await projectsWith('true');
  assert.equal(ignores(p.chrome, 'e2e/share.visual.spec.ts'), true);
  assert.equal(ignores(p.chrome, '/home/runner/work/Nestly/Nestly/e2e/visual.visual.spec.ts'), true);
  for (const kept of ['e2e/share.spec.ts', 'e2e/visual-screens.ts', 'e2e/a11y.spec.ts']) assert.equal(ignores(p.chrome, kept), false, kept);
});

// P3 (18.10.2026): parallelism per file and timeouts by test type. What must not drift: e2e/a11y.spec.ts stays parallel,
// nothing turns on a global fullyParallel, the per-test default stays 30 s, the build tests keep their own limits, and the
// CI run ends itself (globalTimeout) at least two minutes before the browser jobs' timeout-minutes, so a hang still
// leaves a report.
const read = (path) => readFileSync(join(root, path), 'utf8');

/** The problems of the parallelism and timeout rules, for a config text, the e2e files and the browser jobs' minutes. */
function timingProblems(configText, files, jobMinutes) {
  const problems = [];
  if (/fullyParallel\s*:\s*(?!false\b)/.test(configText.replace(/\/\/.*$/gm, ''))) problems.push('the config sets fullyParallel to something other than false');
  // Top level of defineConfig only (two-space indent): a nested `timeout: 30_000` must not stand in for it.
  if (!/^ {2}timeout: 30_000,$/m.test(configText)) problems.push('the top-level per-test timeout is not 30_000');
  const global = /globalTimeout:\s*isCi\s*\?\s*(\d+)\s*\*\s*60_000\s*:\s*0\b/.exec(configText);
  if (!global) problems.push('no CI globalTimeout of N * 60_000');
  else {
    for (const [name, minutes] of Object.entries(jobMinutes)) {
      if (!(Number(minutes) - Number(global[1]) >= 2)) problems.push(`${name}: timeout-minutes ${minutes} leaves less than 2 minutes over globalTimeout ${global[1]}`);
    }
  }
  if (!/test\.describe\.configure\(\{\s*mode:\s*'parallel'\s*\}\)/.test(files['e2e/a11y.spec.ts'] ?? '')) problems.push('e2e/a11y.spec.ts is not parallel');
  for (const [name, text] of Object.entries(files)) {
    if (name.endsWith('.spec.ts') && !PARALLEL_FILES.includes(name) && /mode:\s*['"]parallel['"]/.test(text)) problems.push(`${name} turns on parallel mode without the shared-state check (P3)`);
  }
  // Each shard job builds its own Storybook index and a parallel file is dealt by position: ids must be sorted (CRITIC P3 1).
  if (!/export function storyIds\(\)[\s\S]*?\}\)\.sort\(\);\r?\n\}/.test(files['e2e/helpers.ts'] ?? '')) problems.push('storyIds() does not return sorted ids');
  if (!/test\.setTimeout\(300_000\)/.test(files['e2e/app-shell-guard-build.spec.ts'] ?? '')) problems.push('the build test lost its 300 s limit');
  if ((files['e2e/app-shell-guard-stories.spec.ts'] ?? '').match(/test\.setTimeout\(240_000\)/g)?.length !== 2) problems.push('the story build tests lost their 240 s limits');
  return problems;
}

/** Files allowed in parallel mode, each after a check that its tests share no state. */
const PARALLEL_FILES = ['e2e/a11y.spec.ts'];
const e2eFiles = Object.fromEntries(readdirSync(join(root, 'e2e')).filter((f) => f.endsWith('.ts')).map((f) => [`e2e/${f}`, read(`e2e/${f}`)]));
const jobMinutes = { browser: browser?.['timeout-minutes'], 'browser-changed': ci.jobs?.['browser-changed']?.['timeout-minutes'], 'browser-edge': ci.jobs?.['browser-edge']?.['timeout-minutes'] };

test('[P3] a11y runs in parallel, no global fullyParallel, 30 s per test, build limits kept, globalTimeout under the job timeout', () => {
  assert.deepEqual(timingProblems(config, e2eFiles, jobMinutes), []);
});

test('[P3] the timing check can fail: every drift is caught (guards the test above)', () => {
  const a11y = e2eFiles['e2e/a11y.spec.ts'];
  const mutants = {
    'global fullyParallel': [config.replace("testDir: './e2e',", "testDir: './e2e',\n  fullyParallel: true,"), e2eFiles, jobMinutes],
    'per-test timeout 15 s': [config.replace(/timeout: 30_000,/, 'timeout: 15_000,'), e2eFiles, jobMinutes],
    'fullyParallel on CI only': [config.replace("testDir: './e2e',", "testDir: './e2e',\n  fullyParallel: isCi,"), e2eFiles, jobMinutes],
    'top-level timeout moved into a nested object': [config.replace(/\n {2}timeout: 30_000,/, '\n  use2: {\n    timeout: 30_000,\n  },'), e2eFiles, jobMinutes],
    'a second file turned parallel': [config, { ...e2eFiles, 'e2e/motion.spec.ts': `${e2eFiles['e2e/motion.spec.ts']}\ntest.describe.configure({ mode: 'parallel' });` }, jobMinutes],
    'storyIds unsorted': [config, { ...e2eFiles, 'e2e/helpers.ts': e2eFiles['e2e/helpers.ts'].replace('}).sort();', '});') }, jobMinutes],
    'no globalTimeout': [config.replace(/\n\s*globalTimeout:[^\n]*/, ''), e2eFiles, jobMinutes],
    'globalTimeout equal to the job timeout': [config.replace(/globalTimeout: isCi \? \d+/, 'globalTimeout: isCi ? 15'), e2eFiles, jobMinutes],
    'job timeout cut to the globalTimeout': [config, e2eFiles, { ...jobMinutes, 'browser-edge': '12' }],
    'a11y back to file order': [config, { ...e2eFiles, 'e2e/a11y.spec.ts': a11y.replace(/test\.describe\.configure\([^)]*\);/, '') }, jobMinutes],
    'build limit removed': [config, { ...e2eFiles, 'e2e/app-shell-guard-build.spec.ts': '' }, jobMinutes],
    'one story build limit removed': [config, { ...e2eFiles, 'e2e/app-shell-guard-stories.spec.ts': e2eFiles['e2e/app-shell-guard-stories.spec.ts'].replace('test.setTimeout(240_000)', '') }, jobMinutes],
  };
  for (const [label, args] of Object.entries(mutants)) {
    assert.notDeepEqual(timingProblems(...args), [], `${label} was not caught`);
  }
});
