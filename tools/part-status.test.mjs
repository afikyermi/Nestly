import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect, evaluate, formatStatus, ghRead, mainHealth, parseArgs } from './part-status.mjs';

const SHA = 'a'.repeat(40), OLD = 'b'.repeat(40), MAIN = 'c'.repeat(40);
const app = { id: 15368, slug: 'github-actions' };
const check = (name, conclusion = 'success', extra = {}) => ({
  id: 10, name, app, head_sha: SHA, status: 'completed', conclusion,
  started_at: '2026-10-17T12:00:00Z', html_url: 'https://github.com/example/check', ...extra,
});
const job = (name, conclusion = 'success') => ({ name, status: 'completed', conclusion });
const run = (id, jobs, extra = {}) => ({ id, name: 'CI', workflow_id: 1, event: 'push', head_sha: MAIN,
  status: 'completed', conclusion: 'success', created_at: `2026-10-17T${String(id).padStart(2, '0')}:00:00Z`, jobs, ...extra });
const fixture = () => ({ head: SHA, headAfter: SHA, main: MAIN, mainAfter: MAIN, state: 'open',
  url: 'https://github.com/afikyermi/Nestly/pull/57', observedAt: '2026-10-17T13:00:00Z',
  required: [{ context: 'typecheck', app_id: 15368 }],
  checks: ['changes', 'typecheck', 'lint', 'test', 'build', 'preview-e2e'].map((name) => check(name)),
  mainRuns: [run(12, [job('test')])], errors: [], limitations: [],
});

test('[P1] current SHA green snapshot reports evidence and next owner, never merge approval', () => {
  const result = evaluate(fixture());
  assert.deepEqual(result.blockers, []);
  assert.equal(result.e.sha, SHA);
  assert.equal(result.observedAt, '2026-10-17T13:00:00Z');
  assert.match(result.nextAction, /ORCHESTRATOR/);
  assert.match(result.nextAction, /not merge approval/);
  assert.match(formatStatus(result), /Head: a{40}/);
});

test('[P1] head or main changed during collection invalidates the snapshot', () => {
  for (const field of ['headAfter', 'mainAfter']) {
    const s = fixture(); s[field] = OLD;
    assert.match(evaluate(s).blockers.join('\n'), /Head changed/);
  }
});

test('[P1] merged PR remains usable for wrap-up main health; abandoned PR does not look ready', () => {
  const s = fixture(); s.state = 'closed'; s.merged = true;
  assert.deepEqual(evaluate(s).blockers, []);
  assert.match(formatStatus(evaluate(s)), /merged; inspect main/);
  s.merged = false;
  assert.match(evaluate(s).blockers.join('\n'), /without a merge/);
});

test('[P1] transport executes only a bounded gh GET without a shell or leaking raw stderr', () => {
  const execute = (file, args, options) => {
    assert.equal(file, 'gh');
    assert.deepEqual(args, ['api', '--hostname', 'github.com', '--method', 'GET', 'repos/afikyermi/Nestly/pulls/57']);
    assert.equal(options.timeout, 30000);
    assert.equal(options.shell, undefined);
    return '{"number":57}';
  };
  assert.equal(ghRead('repos/afikyermi/Nestly/pulls/57', execute).number, 57);
  assert.throws(() => ghRead('repos/afikyermi/Nestly/pulls/57', () => {
    throw Object.assign(new Error('raw detail'), { stderr: 'private sentinel HTTP 403' });
  }), (error) => /HTTP 403/.test(error.message) && !/private sentinel|raw detail/.test(error.message));
});

test('[P1] green CI and E on an old SHA do not satisfy the current head', () => {
  const s = fixture(); s.checks = s.checks.map((c) => ({ ...c, head_sha: OLD }));
  const result = evaluate(s);
  assert.ok(result.blockers.includes('Required test: missing'));
  assert.equal(result.e.state, 'missing');
});

test('[P1] missing E blocks; explicit approved no-preview reason is visible', () => {
  const s = fixture(); s.checks = s.checks.filter((c) => c.name !== 'preview-e2e');
  assert.match(evaluate(s).blockers.join('\n'), /E .*missing/);
  const result = evaluate(s, { noPreview: 'Afik: P1 tools and instructions only' });
  assert.equal(result.e.state, 'not required');
  assert.match(result.e.reason, /P1/);
  assert.deepEqual(result.blockers, []);
});

test('[P1] expected skipped E event does not erase actual E, and cannot replace missing E', () => {
  const s = fixture(); s.required.push({ context: 'preview-e2e', app_id: 15368 });
  s.checks.push(check('preview-e2e', 'skipped', { id: 20 }));
  assert.deepEqual(evaluate(s).blockers, []);
  s.checks = s.checks.filter((c) => c.name !== 'preview-e2e' || c.conclusion === 'skipped');
  assert.equal(evaluate(s).e.state, 'missing');
});

test('[P1] a newer cancelled E run blocks even after success on the same head', () => {
  const s = fixture(); s.checks.push(check('preview-e2e', 'cancelled', { id: 20 }));
  assert.equal(evaluate(s).e.state, 'cancelled');
  assert.ok(evaluate(s).blockers.length > 0);
});

test('[P1] current cancellation or missing check blocks; superseded cancellation does not', () => {
  const s = fixture(); s.checks.push(check('test', 'cancelled', { id: 11 }));
  assert.match(evaluate(s).blockers.join('\n'), /Required test: cancelled/);
  s.checks.at(-1).head_sha = OLD;
  assert.deepEqual(evaluate(s).blockers, []);
  s.checks = s.checks.filter((c) => c.name !== 'test');
  assert.match(evaluate(s).blockers.join('\n'), /Required test: missing/);
});

test('[P1] queued check without start timestamp beats an older successful execution', () => {
  const s = fixture(); s.checks.push(check('test', null, { id: 20, started_at: null, status: 'queued' }));
  assert.match(evaluate(s).blockers.join('\n'), /Required test: queued/);
});

test('[P1] another app cannot satisfy a pinned required check', () => {
  const s = fixture(); s.checks = s.checks.map((c) => c.name === 'typecheck' ? { ...c, app: { id: 8, slug: 'other' } } : c);
  assert.match(evaluate(s).blockers.join('\n'), /Required typecheck: missing/);
});

test('[P1] expected skip is not failure; unapproved skip and cancellation are not success', () => {
  const s = fixture(); s.required.push({ context: 'browser-edge', app_id: 15368 });
  s.checks.push(check('browser-edge', 'skipped'));
  assert.match(evaluate(s).blockers.join('\n'), /browser-edge: skipped/);
  const options = { expectedSkips: { 'browser-edge': 'CI: Edge runs after merge, not on PR' } };
  assert.deepEqual(evaluate(s, options).blockers, []);
  s.checks.at(-1).conclusion = 'cancelled';
  assert.match(evaluate(s, options).blockers.join('\n'), /browser-edge: cancelled/);
});

test('[P1] repaired main failure does not block; a new failure does', () => {
  const s = fixture(); s.mainRuns = [run(10, [job('test', 'failure')]), run(11, [job('test')])];
  assert.deepEqual(evaluate(s).blockers, []);
  s.mainRuns.push(run(12, [job('test', 'failure')]));
  assert.match(evaluate(s).blockers.join('\n'), /main CI \/ test: failure/);
});

test('[P1] unrelated success, skip or pending job cannot erase a main failure', () => {
  for (const newer of [job('build'), job('db', 'skipped'), { ...job('db'), status: 'in_progress', conclusion: null }]) {
    assert.equal(mainHealth([run(10, [job('db', 'failure')]), run(11, [newer])]).length, 1);
  }
});

test('[P1] unavailable requirements are a blocker, never empty green', () => {
  const s = fixture(); s.errors.push('Required checks unavailable (HTTP 403)');
  assert.match(evaluate(s).blockers.join('\n'), /unavailable/);
});

test('[P1] CLI requires reasons and rejects unknown options and invalid repositories', () => {
  assert.throws(() => parseArgs(['57', '--no-preview']), /Missing/);
  assert.throws(() => parseArgs(['57', '--expected-skip', 'db']), /reason/);
  assert.throws(() => parseArgs(['57', '--repo', '../x']), /repository/);
  assert.throws(() => parseArgs(['57', '--merge', 'yes']), /Unknown/);
  assert.equal(parseArgs(['57', '--json']).json, true);
});

function apiFixture({ changedHead = false, denied = false } = {}) {
  const calls = []; let reads = 0;
  const read = (endpoint) => {
    calls.push(endpoint);
    const route = endpoint.replace('repos/afikyermi/Nestly/', '');
    if (route === 'pulls/57') return { head: { sha: ++reads > 1 && changedHead ? OLD : SHA },
      base: { ref: 'main' }, state: 'open', html_url: 'https://github.com/afikyermi/Nestly/pull/57' };
    if (route === 'branches/main') return { commit: { sha: MAIN } };
    if (route.startsWith('rules/branches/')) {
      if (denied) throw new Error('GitHub GET failed (HTTP 403)');
      return [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'test', integration_id: 15368 }] } }];
    }
    if (route.endsWith('protection/required_status_checks')) return { checks: [{ context: 'lint', app_id: 15368 }] };
    if (route.includes('/check-runs')) return { check_runs: fixture().checks };
    if (route.startsWith(`commits/${SHA}/statuses`)) return [];
    if (route.includes('workflows/ci.yml/runs')) return { workflow_runs: [{ ...run(12, []), head_sha: SHA, pull_requests: [{ number: 57 }] }] };
    if (route.startsWith('actions/runs?')) return { workflow_runs: [
      { ...run(12, []), path: '.github/workflows/ci.yml' }, run(11, []), run(10, []),
    ] };
    if (route.startsWith('actions/runs/12/jobs')) return { jobs: [job('test'), job('db', 'skipped')] };
    if (route.startsWith('actions/runs/11/jobs')) return { jobs: [job('test'), job('db')] };
    throw new Error(`Unexpected endpoint ${route}`);
  };
  return { read, calls };
}

test('[P1] collector binds SHA, reads requirements and resolves main skip history', () => {
  const api = apiFixture();
  const result = evaluate(collect({ repo: 'afikyermi/Nestly', pr: '57' }, api.read));
  assert.deepEqual(result.blockers, []);
  assert.ok(result.required.some((c) => c.name === 'test' && c.app === 15368));
  assert.equal(api.calls.filter((c) => c.endsWith('/pulls/57')).length, 2);
  assert.ok(!api.calls.some((c) => c.includes('/10/jobs')));
});

test('[P1] collection cannot hide a head race or inaccessible requirements', () => {
  for (const config of [{ changedHead: true }, { denied: true }]) {
    assert.ok(evaluate(collect({ repo: 'afikyermi/Nestly', pr: '57' }, apiFixture(config).read)).blockers.length > 0);
  }
});

test('[P1] green contexts alone cannot hide a missing current PR CI run', () => {
  const api = apiFixture();
  const read = (url) => url.includes('workflows/ci.yml/runs') ? { workflow_runs: [] } : api.read(url);
  const result = evaluate(collect({ repo: 'afikyermi/Nestly', pr: '57' }, read));
  assert.ok(result.blockers.includes('CI run on current PR head: missing'));
});

test('[P1] current main CI cancelled before jobs start cannot look healthy through skipped jobs', () => {
  const api = apiFixture();
  const read = (url) => {
    const data = api.read(url);
    if (url.includes('actions/runs?branch=main')) data.workflow_runs[0].conclusion = 'cancelled';
    if (url.includes('actions/runs/12/jobs')) data.jobs = [job('test', 'skipped'), job('db', 'skipped')];
    return data;
  };
  const result = evaluate(collect({ repo: 'afikyermi/Nestly', pr: '57' }, read));
  assert.ok(result.blockers.includes('main CI on current main SHA: cancelled'));
});

test('[P1] required status/check pagination does not silently drop the second page', () => {
  const api = apiFixture();
  const read = (url) => {
    if (!url.includes('/statuses?')) return api.read(url);
    return url.endsWith('&page=1') ? Array.from({ length: 100 }, (_, i) => ({ id: i, context: `external-${i}`, state: 'success' })) :
      [{ id: 101, context: 'external-gate', state: 'failure' }];
  };
  const snapshot = collect({ repo: 'afikyermi/Nestly', pr: '57' }, read);
  snapshot.required.push({ context: 'external-gate' });
  assert.match(evaluate(snapshot).blockers.join('\n'), /external-gate: failure/);
});

test('[P4] a PR whose head branch gets no Preview under vercel.json is a blocker naming the ready/ route', () => {
  for (const ref of ['ccr-517c29b5-ek8cc9', 'claude/p4-deploy-policy', 'chore/records-after-f18']) {
    const s = { ...fixture(), headRef: ref };
    const blockers = evaluate(s).blockers.join('\n');
    assert.match(blockers, new RegExp(`Head branch ${ref} gets no Preview`), ref);
    assert.match(blockers, /ready\/<part>/);
  }
  for (const ref of ['ready/f3-1', 'main']) assert.deepEqual(evaluate({ ...fixture(), headRef: ref }).blockers, [], ref);
  assert.deepEqual(evaluate({ ...fixture(), headRef: 'ccr-x' }, { noPreview: 'Afik: records only' }).blockers, [], 'Preview not required');
  assert.deepEqual(evaluate(fixture()).blockers, [], 'no head ref read: nothing claimed');
});
