// preview-e2e on two runners at once (Afik 24.10.2026, §14.2): job `e2e` is a matrix over the two Playwright projects, and the two
// runners share nothing a flow writes or reads by name: their own Moderator, staff file, report and artifact, and their own rows on
// the Preview. The rest of the workflow's contract is in preview-e2e.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const ROOT = new URL('..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const wf = parseYaml(read('.github/workflows/preview-e2e.yml'));
const job = wf.jobs.e2e;
const steps = stepsOf(job);
const GOOD = 'https://nestly-abc123def-afikyermis-projects.vercel.app';

async function loadConfig(url) {
  const saved = process.env.PREVIEW_E2E_BASE_URL;
  process.env.PREVIEW_E2E_BASE_URL = url;
  try {
    return (await import(`${new URL('e2e-preview/playwright.config.ts', ROOT).href}?parallel`)).default;
  } finally {
    if (saved === undefined) delete process.env.PREVIEW_E2E_BASE_URL;
    else process.env.PREVIEW_E2E_BASE_URL = saved;
  }
}

const PER_PROJECT = /\$\{\{\s*matrix\.project\s*\}\}/;

test('[§14.2] the e2e job is a matrix over exactly the config\'s two projects, not fail-fast, after the deployment job', async () => {
  const cfg = await loadConfig(GOOD);
  assert.equal(String(job.strategy['fail-fast']), 'false');
  assert.deepEqual([...job.strategy.matrix.project].sort(), cfg.projects.map((p) => p.name).sort());
  assert.equal(job.needs, 'deployment');
  assert.match(job.name, /^preview-e2e \(\$\{\{\s*matrix\.project\s*\}\}\)$/);
});

test('[§14.2] each runner walks only its own project, given through env (no expression in the run body)', () => {
  const pw = steps.find((s) => /playwright test/.test(runOf(s)));
  assert.match(runOf(pw), /--project="\$\{PREVIEW_E2E_PROJECT\}"$/);
  assert.match(pw.env.PREVIEW_E2E_PROJECT, /^\$\{\{\s*matrix\.project\s*\}\}$/);
});

test('[§14.2] the staff setup makes only its project\'s Moderator; staff file, report and artifact are named per project', () => {
  const setup = steps.find((s) => /preview-e2e-staff-cli\.ts/.test(runOf(s)));
  assert.match(setup.env.PREVIEW_E2E_PROJECT, /^\$\{\{\s*matrix\.project\s*\}\}$/);
  const files = steps.map((s) => s.env?.PREVIEW_E2E_STAFF_FILE).filter((f) => f !== undefined);
  assert.equal(files.length, 4, 'setup, Playwright, failure context and removal');
  for (const f of files) assert.match(f, /^\$\{\{\s*runner\.temp\s*\}\}\/preview-e2e-staff-\$\{\{\s*matrix\.project\s*\}\}\.json$/);
  const pw = steps.find((s) => /playwright test/.test(runOf(s)));
  assert.match(pw.env.PREVIEW_E2E_REPORT_FILE, PER_PROJECT);
  assert.equal(steps.at(-1).env.REPORT_FILE, pw.env.PREVIEW_E2E_REPORT_FILE);
  const upload = steps.find((s) => /upload-artifact/.test(String(s.uses ?? '')));
  assert.match(upload.with.name, /^preview-e2e-failure-context-\$\{\{\s*matrix\.project\s*\}\}$/);
});

test('[§14.2] the staff CLI writes only the file named for its project and makes that project\'s actor only', async () => {
  const cli = read('tools/preview-e2e-staff-cli.ts');
  assert.match(cli, /staffProjectOf\(process\.env\)/);
  assert.match(cli, /join\(runnerTemp, staffFileName\(project\)\)/);
  assert.match(cli, /makeStaffUsers\([^)]*, project\)/);
  const { staffFileName, STAFF_PROJECTS } = await import(new URL('preview-e2e-staff.ts', import.meta.url).href);
  assert.equal(new Set(STAFF_PROJECTS.map(staffFileName)).size, STAFF_PROJECTS.length);
});

test('[§14.2] shared Preview rows: the two projects\' promoted Professionals are in different fields, listings carry the user\'s random part', () => {
  const flow = read('e2e-preview/monetization.flow.ts');
  const fields = [...flow.matchAll(/'(mobile-375|desktop-1280)': \{[^}]*field: '([a-z_]+)'/g)];
  assert.deepEqual(fields.map((m) => m[1]).sort(), ['desktop-1280', 'mobile-375']);
  assert.notEqual(fields[0][2], fields[1][2], 'the Directory\'s promoted slot is matched by field: one field per project');
  assert.match(flow, /const title = `[^`]*\$\{\/-\(\[0-9a-f\]\{16\}\)@\/\.exec\(seller\.email\)/);
});
