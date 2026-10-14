// Repository tests for the CI `browser` job of .github/workflows/ci.yml, from decisions/2026-10.md "Speed-up", change 1:
// the job runs as a matrix, chrome and edge with two shards each, in parallel. What must not drift: the matrix is exactly
// project x shard (so no browser or shard silently drops out), no leg stops the others, the job stays behind the `changes`
// filter, each leg installs only its own browser, builds the gallery before it runs, and its report has its own name.
// They parse the workflow as data and never run it. The YAML reader is tools/workflow-yaml.mjs. Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { has, needsOf, parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ci = parseYaml(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8');

/** The `name`s of the Playwright projects, read from the config file. */
const projectNames = [...config.matchAll(/\{\s*name:\s*'([^']+)'/g)].map((m) => m[1]);

const WEB_IF = /^(?:\$\{\{\s*)?needs\.changes\.outputs\.web\s*==\s*'true'(?:\s*\}\})?$/;
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
    if (JSON.stringify([...projects].sort()) !== JSON.stringify(['chrome', 'edge'])) problems.push(`matrix.project is [${projects}], not [chrome, edge]`);
    if (JSON.stringify(shards) !== JSON.stringify(['1', '2'])) problems.push(`matrix.shard is [${shards}], not [1, 2]`);
    if (JSON.stringify([...projects].sort()) !== JSON.stringify([...names].sort())) {
      problems.push(`matrix.project [${projects}] differs from the Playwright project names [${names}]`);
    }
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

test('[speed-up 1] the browser job is a chrome x edge by shard 1 and 2 matrix, behind `changes`, with a timeout of 10 to 15 minutes', () => {
  assert.deepEqual(browserProblems(browser, projectNames), []);
});

test('[speed-up 1] the playwright config names its projects chrome and edge (the matrix names must equal them)', () => {
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
    'edge dropped': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, project: ['chrome'] } } }),
    'a third shard that --shard does not divide': () => ({ ...clone(), strategy: { ...browser.strategy, matrix: { ...browser.strategy.matrix, shard: ['1', '2', '3'] } } }),
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
    '--shard of 3': () => withStep(clone(), /playwright\s+test/, (s) => ({ run: runOf(s).replace(/\}\}\/2/, '}}/3') })),
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
  assert.notDeepEqual(browserProblems(browser, ['chrome']), [], 'a matrix project that is not a Playwright project was not caught');
});
