import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GATE_FILES, PRODUCT } from './schema-gate.mjs';
import { CANDIDATE_PREFIX, deploys } from './vercel-branch-policy.mjs';

// P1: one read-only snapshot, never a merge/dispatch/retry/polling loop.
// Usage: node tools/part-status.mjs <PR> [--repo owner/repo] [--no-preview reason]
//   [--expected-skip 'check name=reason'] [--json]
// Authentication is supplied by gh; no token or environment file is read here.
// schema-gate (P6): a pull request without it is not green, even if its ci.yml dropped the job.
const CI_NAMES = ['changes', 'typecheck', 'lint', 'test', 'build', 'schema-gate'];
const outcome = (c) => c.status === 'completed' ? c.conclusion : c.status;
const stamp = (c) => c.started_at || c.created_at || '';
const newest = (rows) => [...rows].sort((a, b) => stamp(b).localeCompare(stamp(a)) || Number(b.id) - Number(a.id));
const key = (c) => `${c.app?.id ?? 'status'}:${c.name}`;

export function latestChecks(rows, sha) {
  const map = new Map();
  for (const row of rows.filter((c) => c.head_sha === sha).sort((a, b) => Number(b.id) - Number(a.id))) {
    if (!map.has(key(row))) map.set(key(row), row);
  }
  return [...map.values()];
}

// A later skip cannot erase a previous failure. A later successful execution of
// the SAME job/workflow/event can resolve it; unrelated successes cannot.
export function mainHealth(runs) {
  const latest = new Map();
  for (const run of newest(runs)) {
    for (const job of run.jobs) {
      if (job.conclusion === 'skipped') continue;
      const id = `${run.workflow_id}:${run.event}:${job.name}`;
      if (!latest.has(id)) latest.set(id, { ...job, workflow: run.name, sha: run.head_sha, run: run.html_url });
    }
    if (!run.jobs.length && run.conclusion !== 'skipped') {
      const id = `${run.workflow_id}:${run.event}:workflow`;
      if (!latest.has(id)) latest.set(id, { ...run, name: `${run.name} (no jobs)`, sha: run.head_sha });
    }
  }
  return [...latest.values()].filter((job) => outcome(job) !== 'success');
}

export function evaluate(snapshot, { expectedSkips = {}, noPreview = '' } = {}) {
  const checks = latestChecks(snapshot.checks, snapshot.head);
  // Non-Preview deployment_status events intentionally skip E. They cannot
  // erase a real execution on this SHA, nor satisfy E if it never executed.
  const eChecks = latestChecks(snapshot.checks.filter((c) => c.conclusion !== 'skipped'), snapshot.head)
    .filter((c) => c.name === 'preview-e2e' && c.app?.slug === 'github-actions');
  const blockers = [...snapshot.errors];
  if (snapshot.head !== snapshot.headAfter || snapshot.main !== snapshot.mainAfter) {
    blockers.push('Head changed during collection; take a new snapshot (do not rerun the old SHA).');
  }
  if (snapshot.state !== 'open' && !snapshot.merged) blockers.push(`PR is ${snapshot.state} without a merge.`);
  // Audit 18.10 (PR 65 stalled ~30 min): with a merge conflict GitHub builds no merge commit, so no pull_request CI ever
  // starts; the checks alone show only "missing". Name the cause. GitHub may not have computed it yet: a limitation, not green.
  if (snapshot.state === 'open' && (snapshot.mergeable === false || snapshot.mergeState === 'dirty')) {
    blockers.push('Merge conflict with the base (mergeable_state dirty): CI cannot start. Merge the base into the branch (no force push), then a new snapshot');
  }
  // P6 (CRITIC finding 2): the PR's own ci.yml runs schema-gate, so the "product code and the gate together" rule is
  // enforced here too, from the PR's file list, where the PR cannot change the rule.
  const files = snapshot.files ?? [];
  const gateFiles = files.filter((f) => GATE_FILES.includes(f));
  if (gateFiles.length > 0 && files.some((f) => PRODUCT.test(f))) {
    blockers.push(`Changes product code and the schema gate (${gateFiles.join(', ')}) together: split it, the gate change first`);
  }
  // CI is a project gate even when GitHub branch protection has no required contexts.
  const required = [...snapshot.required, ...CI_NAMES.map((context) => ({ context, appSlug: 'github-actions' }))];
  const results = required.map((rule) => {
    const candidates = (rule.context === 'preview-e2e' ? eChecks : checks).filter((c) => c.name === rule.context &&
      (!rule.appSlug || c.app?.slug === rule.appSlug) &&
      (rule.app_id == null || rule.app_id === -1 || c.app?.id === rule.app_id));
    const statuses = candidates.map((c) => ({ name: c.name, state: outcome(c), url: c.html_url }));
    const state = candidates.length ? statuses.map((c) => c.state).join(', ') : 'missing';
    const passed = candidates.length > 0 && candidates.every((c) => outcome(c) === 'success' ||
      (outcome(c) === 'skipped' && Boolean(expectedSkips[c.name])));
    if (!passed) blockers.push(`Required ${rule.context}: ${state}`);
    return { name: rule.context, state, app: rule.app_id ?? rule.appSlug ?? 'any', evidence: statuses };
  });
  // Non-required Actions failures still matter under the project's green-CI rule.
  for (const c of checks.filter((c) => c.app?.slug === 'github-actions' && c.name !== 'preview-e2e')) {
    const state = outcome(c);
    if (state !== 'success' && !(state === 'skipped' && expectedSkips[c.name])) {
      blockers.push(`Check ${c.name}: ${state}`);
    }
  }
  const e = noPreview ? { state: 'not required', reason: noPreview } : {
    state: eChecks.length ? outcome(eChecks[0]) : 'missing', sha: snapshot.head,
    url: eChecks[0]?.html_url,
  };
  if (!noPreview && e.state !== 'success') blockers.push(`E on ${snapshot.head}: ${e.state}`);
  // P4: under the head's own vercel.json policy (main and ready/**), a PR from another branch, or from a fork, never gets a
  // Preview, so E never runs: say why while E is not green (CRITIC P4 findings 2-3).
  let noDeploy = false;
  try {
    noDeploy = snapshot.headRef !== undefined && (snapshot.headFork === true || !deploys(snapshot.headPolicy, snapshot.headRef));
  } catch (error) { blockers.push(`vercel.json policy at the head cannot be evaluated: ${error.message}`); }
  if (!noPreview && e.state !== 'success' && noDeploy) {
    blockers.push(`Head branch ${snapshot.headRef} gets no Preview (vercel.json git.deploymentEnabled): push the candidate to ${CANDIDATE_PREFIX}<part> and open the PR from it`);
  }
  const main = mainHealth(snapshot.mainRuns);
  for (const c of main) blockers.push(`main ${c.workflow ?? c.name} / ${c.name}: ${outcome(c)} (${c.sha})`);
  const unique = [...new Set(blockers)];
  let nextAction = 'Verify reviewer findings, coverage limits and merge authority; this snapshot is not merge approval.';
  if (unique.length) {
    if (snapshot.head !== snapshot.headAfter || snapshot.main !== snapshot.mainAfter) nextAction = 'Take a fresh snapshot of the new SHA; do not rerun the old SHA.';
    else if (snapshot.errors.length) nextAction = 'Resolve the missing API/CI evidence listed below, then take a new snapshot. No merge.';
    else if (main.length) nextAction = 'Inspect the linked main jobs; resolve failures or await active jobs with a deadline before the next part.';
    else if (unique.some((b) => b.includes('cancelled'))) nextAction = 'Inspect the current-SHA cancellation; retry once only if still needed and authorized, then fix a repeat failure.';
    else if (e.state === 'missing') nextAction = 'Inspect the current-SHA Preview deployment and E trigger; name an owner and a next-check time.';
    else if (unique.some((b) => b.includes('missing'))) nextAction = 'Inspect the required check trigger/queue on this SHA; schedule a bounded recheck.';
    else nextAction = 'Inspect the linked failing/pending checks and skip conditions; fix or assign a deadline before another snapshot. No merge.';
  }
  return {
    pr: snapshot.url, merged: Boolean(snapshot.merged), head: snapshot.head, observedAt: snapshot.observedAt,
    required: results, checks: checks.map((c) => ({ name: c.name, state: outcome(c), url: c.html_url })),
    expectedSkips, e, main: { sha: snapshot.main, unresolved: main, runsExamined: snapshot.mainRuns.length },
    blockers: unique, limitations: snapshot.limitations,
    nextAction: `ORCHESTRATOR: ${nextAction}`,
  };
}

export function parseArgs(args) {
  const options = { repo: 'afikyermi/Nestly', expectedSkips: {}, noPreview: '', json: false };
  options.pr = args.shift();
  if (!/^\d+$/.test(options.pr ?? '')) throw new Error('Usage: part-status.mjs <PR number> [--repo owner/repo] [--no-preview reason] [--expected-skip name=reason] [--json]');
  while (args.length) {
    const flag = args.shift();
    if (flag === '--json') { options.json = true; continue; }
    const value = args.shift();
    if (!value?.trim() || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--repo') options.repo = value;
    else if (flag === '--no-preview') options.noPreview = value;
    else if (flag === '--expected-skip') {
      const split = value.indexOf('=');
      if (split < 1 || !value.slice(split + 1).trim()) throw new Error('Expected skip needs name=reason');
      options.expectedSkips[value.slice(0, split)] = value.slice(split + 1);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!/^[\w-]+\/[\w.-]+$/.test(options.repo) || options.repo.split('/').some((s) => s === '.' || s === '..')) throw new Error('Invalid repository');
  return options;
}

export function ghRead(endpoint, execute = execFileSync) {
  // Explicit GET and argv (no shell), fixed host, no arbitrary gh commands.
  try {
    return JSON.parse(execute('gh', ['api', '--hostname', 'github.com', '--method', 'GET', endpoint], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (error) {
    // Do not echo raw CLI stderr, response bodies or environment values.
    const http = /HTTP (\d{3})/.exec(String(error.stderr ?? ''))?.[1];
    const safe = new Error(`GitHub GET failed${http ? ` (HTTP ${http})` : ''}: ${endpoint.split('?')[0]}`);
    safe.http = http;
    throw safe;
  }
}

/** The files whose local copy must equal main's: this checker and the gate it applies. */
export const SELF_FILES = ['tools/part-status.mjs', 'tools/schema-gate.mjs'];
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readLocalFile = (file) => { try { return readFileSync(join(ROOT, file), 'utf8'); } catch { return undefined; } };

export function collect({ repo, pr }, read = ghRead, clock = () => new Date().toISOString(), readLocal = readLocalFile) {
  const root = `repos/${repo}`;
  const errors = [];
  const limitations = ['Snapshot only: specialist findings and merge authority are not inferred from checks.'];
  const safe = (endpoint, fallback) => {
    try { return read(`${root}/${endpoint}`); } catch (e) { errors.push(e.message); return fallback; }
  };
  const all = (endpoint, field) => {
    const rows = [];
    for (let page = 1; page <= 10; page++) {
      const data = safe(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`, field ? { [field]: [] } : []);
      const part = field ? data[field] : data;
      if (!Array.isArray(part)) { errors.push(`Invalid response: ${endpoint}`); break; }
      rows.push(...part);
      if (part.length < 100) return rows;
    }
    errors.push(`Pagination limit reached: ${endpoint}; data may be incomplete.`);
    return rows;
  };
  const pull = read(`${root}/pulls/${pr}`);
  if (pull.state === 'open' && (pull.mergeable === null || pull.mergeable === undefined)) limitations.push('GitHub had not computed mergeability yet: take another snapshot before relying on it.');
  const head = pull.head.sha;
  // P4: the deploy policy of vercel.json at the head (undefined when absent: every branch deploys, Vercel's default).
  const vercel = safe(`contents/vercel.json?ref=${head}`, undefined);
  let headPolicy;
  try { headPolicy = vercel?.content ? JSON.parse(Buffer.from(vercel.content, 'base64').toString('utf8'))?.git?.deploymentEnabled : undefined; } catch { errors.push('Invalid vercel.json at the PR head'); }
  const base = encodeURIComponent(pull.base.ref);
  const main = read(`${root}/branches/main`).commit.sha;
  const rules = all(`rules/branches/${base}`);
  let classic = {};
  try { classic = read(`${root}/branches/${base}/protection/required_status_checks`); }
  catch (e) { if (e.http !== '404') errors.push(e.message); }
  const required = [
    ...(classic.checks ?? (classic.contexts ?? []).map((context) => ({ context }))),
    ...rules.filter((r) => r.type === 'required_status_checks').flatMap((r) =>
      (r.parameters?.required_status_checks ?? []).map((c) => ({ context: c.context, app_id: c.integration_id }))),
  ];
  const checks = all(`commits/${head}/check-runs?filter=all`, 'check_runs');
  const statuses = all(`commits/${head}/statuses`);
  for (const s of statuses) checks.push({ id: s.id, name: s.context, head_sha: head, created_at: s.created_at,
    status: s.state === 'pending' ? 'in_progress' : 'completed', conclusion: s.state, html_url: s.target_url });
  // The run head must also match: stale green check contexts cannot stand in for a current CI run.
  const ciRuns = all(`actions/workflows/ci.yml/runs?head_sha=${head}&event=pull_request`, 'workflow_runs');
  const ci = newest(ciRuns.filter((r) => r.head_sha === head && r.pull_requests?.some((p) => p.number === Number(pr))))[0];
  if (!ci || ci.status !== 'completed' || ci.conclusion !== 'success') errors.push(`CI run on current PR head: ${ci ? outcome(ci) : 'missing'}`);
  // Main health covers the available main history, up to GitHub's filtered-run 1,000-result ceiling.
  // Jobs are read only while a newer skipped job has not yet had its last execution identified.
  const mainRuns = all('actions/runs?branch=main', 'workflow_runs');
  const groups = new Map();
  const inspected = [];
  for (const run of newest(mainRuns)) {
    const group = `${run.workflow_id}:${run.event}`;
    const unresolved = groups.get(group);
    if (unresolved && unresolved.size === 0) continue;
    const jobs = all(`actions/runs/${run.id}/jobs?filter=latest`, 'jobs');
    if (!unresolved) groups.set(group, new Set(jobs.filter((j) => j.conclusion === 'skipped').map((j) => j.name)));
    else for (const job of jobs) if (job.conclusion !== 'skipped') unresolved.delete(job.name);
    inspected.push({ ...run, jobs });
  }
  // Missing main CI is never silently healthy, even if another workflow passed.
  const mainCI = newest(mainRuns.filter((r) => r.path === '.github/workflows/ci.yml' && r.head_sha === main && r.event === 'push'))[0];
  if (!mainCI || mainCI.status !== 'completed' || mainCI.conclusion !== 'success') {
    errors.push(`main CI on current main SHA: ${mainCI ? outcome(mainCI) : 'missing'}`);
  }
  for (const [group, unresolved] of groups) if (unresolved.size) {
    limitations.push(`No execution found for skipped main jobs in ${group}: ${[...unresolved].join(', ')}`);
  }
  // Every path the PR touches (both sides of a rename), for the P6 split rule; read before headAfter so a push in between
  // shows as "Head changed" (CRITIC P6 N3).
  const files = all(`pulls/${pr}/files`).flatMap((f) => [f.filename, f.previous_filename].filter(Boolean));
  // P6 (CRITIC finding 2): this check is only as good as the copy that runs it. The local part-status and schema gate
  // must equal current main's copies, which no PR can change; run from a PR worktree or a stale checkout → blocker.
  for (const file of SELF_FILES) {
    const remote = safe(`contents/${file}?ref=${main}`, null);
    if (remote === null) continue; // already an error (until P6 merges, main has no gate: P6 itself is merged by hand)
    const ours = readLocal(file);
    const theirs = typeof remote?.content === 'string' ? Buffer.from(remote.content, 'base64').toString('utf8') : undefined;
    if (ours === undefined || theirs === undefined || ours.replace(/\r\n/g, '\n') !== theirs.replace(/\r\n/g, '\n')) {
      errors.push(`${file} here differs from main's copy: run part-status from an up-to-date main checkout, not a PR worktree`);
    }
  }
  const headAfter = safe(`pulls/${pr}`, { head: {} }).head.sha;
  const mainAfter = safe('branches/main', { commit: {} }).commit.sha;
  return { head, files, mergeable: pull.mergeable, mergeState: pull.mergeable_state, headRef: pull.head.ref, headFork: pull.head.repo?.full_name?.toLowerCase() !== repo.toLowerCase(), headPolicy, headAfter, main, mainAfter, state: pull.state, merged: pull.merged, url: pull.html_url, required, checks,
    mainRuns: inspected, errors, limitations, observedAt: clock() };
}

export function formatStatus(result) {
  return [
    `PR: ${result.pr}${result.merged ? ' (merged; inspect main before next part)' : ''}`, `Head: ${result.head}`, `Updated: ${result.observedAt}`,
    'Required:', ...result.required.map((c) => `  ${c.name}: ${c.state} [${c.app}] ${c.evidence.map((e) => e.url).filter(Boolean).join(' ')}`),
    `E: ${result.e.state} (${result.e.sha ?? result.e.reason}) ${result.e.url ?? ''}`,
    ...Object.entries(result.expectedSkips).map(([name, reason]) => `Expected skip: ${name} — ${reason}`),
    `main: ${result.main.sha}; ${result.main.unresolved.length} unresolved job(s)`,
    ...result.main.unresolved.map((c) => `  ${c.name}: ${outcome(c)} ${c.html_url ?? c.run ?? ''}`),
    ...result.blockers.map((b) => `BLOCKER: ${b}`),
    ...result.limitations.map((l) => `LIMIT: ${l}`), `Next: ${result.nextAction}`,
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = evaluate(collect(options), options);
    console.log(options.json ? JSON.stringify(result, null, 2) : formatStatus(result));
    process.exitCode = result.blockers.length ? 1 : 0;
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
