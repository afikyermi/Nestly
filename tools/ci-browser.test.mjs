// Repository tests for the CI `browser` job of .github/workflows/ci.yml, from decisions/2026-10.md "Speed-up", change 1:
// the job runs as a matrix of parallel shards. Updated for decisions/2026-10.md 19.10 "Merge and local-test throughput", item 2: the PR Chrome job has five shards, Edge has five too (19.10, run 39282719287: three shards hit the 13-minute globalTimeout). What must not drift: the matrix is exactly
// project x shard (so no browser or shard silently drops out), no leg stops the others, the job stays behind the `changes`
// filter, each leg installs only its own browser, builds the gallery before it runs, and its report has its own name.
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

const WEB_IF = /^(?:\$\{\{\s*)?needs\.changes\.outputs\.web\s*==\s*'true'(?:\s*\}\})?$/;
const EDGE_IF = /^(?:\$\{\{\s*)?needs\.changes\.outputs\.web\s*==\s*'true'\s*&&\s*github\.event_name\s*!=\s*'pull_request'(?:\s*\}\})?$/;
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
    if (JSON.stringify(shards.map(String)) !== JSON.stringify(['1', '2', '3', '4', '5'])) problems.push(`matrix.shard is [${shards}], not [1, 2, 3, 4, 5]`);
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
    }
  }

  if (String(job.strategy?.['fail-fast']) !== 'false') problems.push('fail-fast is not false: one failing leg would cancel the others');
  const minutes = Number(job['timeout-minutes']);
  if (!(minutes >= 10 && minutes <= 15)) problems.push(`timeout-minutes is ${job['timeout-minutes']}, not 10 to 15`);
  if (!needsOf(job).includes('changes')) problems.push('the job does not need `changes`');
  if (typeof job.if !== 'string' || !WEB_IF.test(job.if.trim())) problems.push(`the job's if is not needs.changes.outputs.web == 'true': ${String(job.if)}`);
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

test('[speed-up 1 · test rules] the pull-request browser job is a chrome by shards 1 to 5 matrix, behind `changes`, with a timeout of 10 to 15 minutes', () => {
  assert.deepEqual(browserProblems(browser, projectNames), []);
});

test('[speed-up 1] the playwright config names its projects chrome and edge (the PR matrix is a subset; the Edge job runs the other)', () => {
  assert.deepEqual([...projectNames].sort(), ['chrome', 'edge']);
});

test('[speed-up 1] the browser problem check can fail: every drift from the decision is caught (guards the tests above)', () => {
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
    'a sixth shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3', '4', '5', '6'] } } }),
    'the old three shards': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3'] } } }),
    'a dropped last shard (four legs)': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3', '4'] } } }),
    'a dropped middle shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '4', '5'] } } }),
    'a dropped first shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['2', '3', '4', '5'] } } }),
    'one shard': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1'] } } }),
    'shards out of order': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['5', '4', '3', '2', '1'] } } }),
    'two shards swapped': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '3', '2', '4', '5'] } } }),
    'an extra matrix key': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, os: ['ubuntu-latest'] } } }),
    'timeout 20': () => ({ ...clone(), 'timeout-minutes': '20' }),
    'timeout 5': () => ({ ...clone(), 'timeout-minutes': '5' }),
    'no needs': () => {
      const j = clone();
      delete j.needs;
      return j;
    },
    'another if': () => ({ ...clone(), if: "github.event_name == 'push'" }),
    'if always()': () => ({ ...clone(), if: 'always()' }),
    'continue-on-error': () => ({ ...clone(), 'continue-on-error': 'true' }),
    'no --project flag': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(PROJECT_FLAG, '') })),
    'no --shard flag': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(SHARD_FLAG, '') })),
    '--shard divisor 3 with five legs': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(/\}\}\/5/, '}}/3') })),
    '--shard divisor 6 with five legs': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(/\}\}\/5/, '}}/6') })),
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

// ---- Edge: not on pull requests; on main pushes and by hand ------------------------------------------------------------------

const edge = ci.jobs?.['browser-edge'];

/** Everything that must hold for the Edge job and for the triggers that make it run. */
function edgeProblems(job, triggers) {
  const problems = [];
  if (!job) return ['there is no browser-edge job'];
  const steps = stepsOf(job);
  const matrix = job.strategy?.matrix;
  if (JSON.stringify(Object.keys(matrix ?? {})) !== JSON.stringify(['shard'])) problems.push(`the matrix keys are ${Object.keys(matrix ?? {})}, not exactly shard`);
  if (JSON.stringify([matrix?.shard ?? []].flat()) !== JSON.stringify(['1', '2', '3', '4', '5'])) problems.push(`matrix.shard is [${matrix?.shard}], not [1, 2, 3, 4, 5]`);
  if (String(job.strategy?.['fail-fast']) !== 'false') problems.push('fail-fast is not false');
  if (!needsOf(job).includes('changes')) problems.push('the job does not need `changes`');
  const condition = String(job.if ?? '').trim();
  if (!EDGE_IF.test(condition)) problems.push(`the if is not exactly the web filter and not-a-pull_request: ${condition}`);
  if (JSON.stringify(triggers?.push?.branches) !== JSON.stringify(['main'])) problems.push(`on.push.branches is ${JSON.stringify(triggers?.push?.branches)}, not [main]`);
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
  for (const trigger of ['pull_request', 'push', 'workflow_dispatch']) {
    if (!has(triggers, trigger)) problems.push(`the workflow does not run on ${trigger}`);
  }
  return problems;
}

test('[test rules] Edge runs as its own job: shards 1 to 5, only msedge, never on pull_request, behind the change filter', () => {
  assert.deepEqual(edgeProblems(edge, ci.on), []);
});

test('[test rules] the workflow runs on pull_request, push and workflow_dispatch (Edge needs the last two)', () => {
  for (const trigger of ['pull_request', 'push', 'workflow_dispatch']) assert.ok(has(ci.on, trigger), `ci.yml has no ${trigger} trigger`);
});

test('[test rules] the Edge check can fail: every drift is caught (guards the tests above)', () => {
  const clone = () => structuredClone(edge);
  const mutants = {
    'Edge runs on pull requests': () => ({ ...clone(), if: "needs.changes.outputs.web == 'true'" }),
    'no change filter': () => ({ ...clone(), if: "github.event_name != 'pull_request'" }),
    'no needs': () => {
      const j = clone();
      delete j.needs;
      return j;
    },
    'fail-fast true': () => ({ ...clone(), strategy: { ...edge.strategy, 'fail-fast': 'true' } }),
    'a project key in the matrix': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { ...edge.strategy.matrix, project: ['edge'] } } }),
    'one shard': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1'] } } }),
    'the old three shards (--shard of 5)': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '3'] } } }),
    'a dropped last shard (four legs, --shard of 5)': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '3', '4'] } } }),
    'a dropped middle shard': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '4', '5'] } } }),
    'a sixth shard': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['1', '2', '3', '4', '5', '6'] } } }),
    'shards out of order': () => ({ ...clone(), strategy: { ...edge.strategy, matrix: { shard: ['5', '4', '3', '2', '1'] } } }),
    '--shard of 3 with five legs': () => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+test/.test(runOf(s)) ? { ...s, run: runOf(s).replace(/\}\}\/5/, '}}/3') } : s)) }),
    '--shard of 6 with five legs': () => ({ ...clone(), steps: clone().steps.map((s) => (/playwright\s+test/.test(runOf(s)) ? { ...s, run: runOf(s).replace(/\}\}\/5/, '}}/6') } : s)) }),
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
  const widened = { ...ci.on, push: { ...ci.on.push, branches: ['main', '**'] } };
  assert.notDeepEqual(edgeProblems(edge, widened), [], 'a push widened to every branch was not caught');
  assert.notDeepEqual(edgeProblems(edge, { ...ci.on, push: {} }), [], 'a push with no branch filter was not caught');
  for (const missing of ['pull_request', 'push', 'workflow_dispatch']) {
    const triggers = Object.fromEntries(Object.entries(ci.on).filter(([k]) => k !== missing));
    assert.notDeepEqual(edgeProblems(edge, triggers), [], `a workflow without ${missing} was not caught`);
  }
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
const jobMinutes = { browser: browser?.['timeout-minutes'], 'browser-edge': ci.jobs?.['browser-edge']?.['timeout-minutes'] };

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
