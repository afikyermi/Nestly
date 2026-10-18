import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  checks: ['changes', 'typecheck', 'lint', 'test', 'build', 'schema-gate', 'preview-e2e'].map((name) => check(name)),
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
      base: { ref: 'main' }, state: 'open', mergeable: true, mergeable_state: 'clean', html_url: 'https://github.com/afikyermi/Nestly/pull/57' };
    if (route === 'branches/main') return { commit: { sha: MAIN } };
    if (route === `contents/vercel.json?ref=${SHA}`) return { content: Buffer.from('{}').toString('base64') }; // P4
    if (route.startsWith('pulls/57/files')) return [{ filename: 'apps/server/src/x.ts' }]; // P6
    if (route.startsWith('contents/tools/')) return { content: Buffer.from(readFileSync(new URL(`../${route.slice(9).split('?')[0]}`, import.meta.url), 'utf8')).toString('base64') }; // P6 self-check
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

test('[P4] while E is not green, a PR whose head gets no Preview (head policy or fork) is a blocker naming ready/', () => {
  const POLICY = { '**': false, main: true, 'ready/**': true };
  const noE = (extra) => ({ ...fixture(), checks: fixture().checks.filter((c) => c.name !== 'preview-e2e'), headPolicy: POLICY, ...extra });
  const text = (s, o) => evaluate(s, o).blockers.join('\n');
  for (const ref of ['ccr-517c29b5-ek8cc9', 'claude/p4-deploy-policy', 'chore/records-after-f18']) {
    assert.match(text(noE({ headRef: ref })), new RegExp(`Head branch ${ref} gets no Preview`), ref);
    assert.match(text(noE({ headRef: ref })), /ready\/<part>/);
  }
  for (const ref of ['ready/f3-1', 'main']) assert.doesNotMatch(text(noE({ headRef: ref })), /gets no Preview/, ref);
  assert.match(text(noE({ headRef: 'ready/f3-1', headFork: true })), /gets no Preview/, 'a fork never deploys');
  assert.doesNotMatch(text(noE({ headRef: 'ccr-x', headPolicy: undefined })), /gets no Preview/, 'no policy at the head: every branch deploys');
  assert.deepEqual(evaluate({ ...fixture(), headRef: 'ccr-x', headPolicy: POLICY }).blockers, [], 'E already green: no false blocker');
  assert.deepEqual(evaluate(noE({ headRef: 'ccr-x' }), { noPreview: 'Afik: records only' }).blockers, [], 'Preview not required');
  assert.match(text(noE({ headRef: 'x', headPolicy: { '{a,b}': false } })), /cannot be evaluated/);
});

test('[P4] collect reads vercel.json at the head and marks a fork', () => {
  const policy = { '**': false, main: true, 'ready/**': true };
  const content = Buffer.from(JSON.stringify({ git: { deploymentEnabled: policy } })).toString('base64');
  const seen = [];
  const read = (endpoint) => {
    seen.push(endpoint);
    if (endpoint.endsWith('/pulls/57')) return { head: { sha: SHA, ref: 'ccr-x', repo: { full_name: 'someone/Nestly' } }, base: { ref: 'main' }, state: 'open', html_url: 'u' };
    if (endpoint.includes('/contents/vercel.json?ref=')) return { content };
    if (endpoint.includes('/branches/')) return { commit: { sha: MAIN } };
    return endpoint.includes('runs') ? { workflow_runs: [], jobs: [] } : endpoint.includes('check-runs') ? { check_runs: [] } : [];
  };
  const snapshot = collect({ repo: 'afikyermi/Nestly', pr: '57' }, read);
  assert.ok(seen.some((e) => e === `repos/afikyermi/Nestly/contents/vercel.json?ref=${SHA}`));
  assert.deepEqual(snapshot.headPolicy, policy);
  assert.equal(snapshot.headRef, 'ccr-x');
  assert.equal(snapshot.headFork, true);
});

test('[P4] the same repository in another letter case is not a fork (CRITIC P4 re-check, low)', () => {
  const read = (endpoint) => {
    if (endpoint.endsWith('/pulls/57')) return { head: { sha: SHA, ref: 'ready/x', repo: { full_name: 'AfikYermi/Nestly' } }, base: { ref: 'main' }, state: 'open', html_url: 'u' };
    if (endpoint.includes('/contents/vercel.json?ref=')) return { content: Buffer.from('{}').toString('base64') };
    if (endpoint.includes('/branches/')) return { commit: { sha: MAIN } };
    return endpoint.includes('runs') ? { workflow_runs: [], jobs: [] } : endpoint.includes('check-runs') ? { check_runs: [] } : [];
  };
  assert.equal(collect({ repo: 'afikyermi/Nestly', pr: '57' }, read).headFork, false);
});

test('[P6] product code and the schema gate in one PR is a blocker, read from the PR file list (CRITIC P6 finding 2)', () => {
  const text = (files) => evaluate({ ...fixture(), files }).blockers.join('\n');
  assert.match(text(['apps/server/src/x.ts', '.github/workflows/ci.yml']), /schema gate.*split it/);
  assert.match(text(['packages/shared/src/v.ts', 'tools/schema-gate.mjs']), /split it/);
  assert.doesNotMatch(text(['apps/server/src/x.ts', 'tools/other.mjs']), /schema gate/);
  assert.doesNotMatch(text(['.github/workflows/ci.yml', 'tools/schema-gate.mjs']), /schema gate/, 'a gate-only PR is fine');
  assert.deepEqual(evaluate(fixture()).blockers, [], 'no file list read: nothing claimed');
});

test('[P6] collect reads every path of the PR, both sides of a rename', () => {
  const api = apiFixture();
  const read = (endpoint) => (endpoint.includes('/pulls/57/files')
    ? [{ filename: 'tools/schema-gate2.mjs', previous_filename: 'tools/schema-gate.mjs' }, { filename: 'apps/web/src/a.tsx' }]
    : api.read(endpoint));
  const snapshot = collect({ repo: 'afikyermi/Nestly', pr: '57' }, read);
  assert.deepEqual(snapshot.files, ['tools/schema-gate2.mjs', 'tools/schema-gate.mjs', 'apps/web/src/a.tsx']);
  assert.match(evaluate(snapshot).blockers.join('\n'), /split it/);
});

test('[P6] part-status refuses to judge with a checker or gate that differs from current main (CRITIC P6 finding 2, N4)', () => {
  const api = apiFixture();
  const asked = [];
  const same = collect({ repo: 'afikyermi/Nestly', pr: '57' }, (e) => { asked.push(e); return api.read(e); });
  assert.ok(asked.includes(`repos/afikyermi/Nestly/contents/tools/schema-gate.mjs?ref=${MAIN}`), 'compared with current main, not the PR base');
  assert.ok(!same.errors.some((e) => e.includes('differs from main')), 'identical copies: no blocker');
  const edited = collect({ repo: 'afikyermi/Nestly', pr: '57' }, api.read, undefined, (file) => (file === 'tools/schema-gate.mjs' ? '// relaxed' : readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')));
  assert.match(edited.errors.join('\n'), /tools\/schema-gate\.mjs here differs from main's copy/);
  assert.match(evaluate(edited).blockers.join('\n'), /up-to-date main checkout/);
  const missing = collect({ repo: 'afikyermi/Nestly', pr: '57' }, api.read, undefined, () => undefined);
  assert.equal(missing.errors.filter((e) => e.includes('differs from main')).length, 2, 'unreadable local copies block');
});

test('[audit 18.10] a merge conflict is a blocker with its cause; a clean or merged PR is not blocked by it', () => {
  const text = (extra) => evaluate({ ...fixture(), ...extra }).blockers.join('\n');
  assert.match(text({ mergeable: false, mergeState: 'dirty' }), /Merge conflict with the base.*CI cannot start/);
  assert.match(text({ mergeable: null, mergeState: 'dirty' }), /Merge conflict/, 'dirty alone is enough');
  assert.doesNotMatch(text({ mergeable: true, mergeState: 'clean' }), /Merge conflict/);
  assert.doesNotMatch(text({ mergeable: true, mergeState: 'blocked' }), /Merge conflict/, 'blocked = required checks pending, reported by the checks');
  assert.doesNotMatch(text({ state: 'closed', merged: true, mergeable: false, mergeState: 'dirty' }), /Merge conflict/, 'after a merge it does not matter');
});

test('[audit 18.10] null mergeability is read once more; still null is a stated limitation; computed on the re-read is used', () => {
  const api = apiFixture();
  const withPull = (answers) => {
    let n = 0;
    return (endpoint) => {
      if (endpoint.endsWith('/pulls/57') && n < answers.length) return { ...api.read(endpoint), ...answers[n++] };
      return api.read(endpoint);
    };
  };
  const pauses = [];
  const pause = (ms) => pauses.push(ms);
  const still = collect({ repo: 'afikyermi/Nestly', pr: '57' }, withPull([{ mergeable: null, mergeable_state: 'unknown' }, { mergeable: null, mergeable_state: 'unknown' }]), undefined, undefined, pause);
  assert.deepEqual(pauses, [2000], 'one pause, one re-read');
  assert.ok(still.limitations.some((l) => l.includes('mergeability')));
  const later = collect({ repo: 'afikyermi/Nestly', pr: '57' }, withPull([{ mergeable: null, mergeable_state: 'unknown' }, { mergeable: false, mergeable_state: 'dirty' }]), undefined, undefined, pause);
  assert.ok(!later.limitations.some((l) => l.includes('mergeability')));
  assert.match(evaluate(later).blockers.join('\n'), /Merge conflict with the base/, 'the conflict found on the re-read is a blocker');
  const known = collect({ repo: 'afikyermi/Nestly', pr: '57' }, api.read, undefined, undefined, () => assert.fail('no pause when known'));
  assert.ok(!known.limitations.some((l) => l.includes('mergeability')));
});

test('[audit 18.10] a closed PR that was not merged gets the existing blocker only, not the conflict one', () => {
  const blockers = evaluate({ ...fixture(), state: 'closed', merged: false, mergeable: false, mergeState: 'dirty' }).blockers.join('\n');
  assert.match(blockers, /closed without a merge/);
  assert.doesNotMatch(blockers, /Merge conflict/);
});

// P1.1 (audit A1): part-status must say green for a correct PR, without losing a real blocker.
const ciUrl = (runId) => `https://github.com/afikyermi/Nestly/actions/runs/${runId}/job/1`;
const outcomeOf = (c) => (c.status === 'completed' ? c.conclusion : c.status);

test('[P1.1] main health reads one page of runs: a stated limitation, never a pagination blocker', () => {
  const api = apiFixture();
  const asked = [];
  const read = (url) => {
    asked.push(url);
    if (url.includes('actions/runs?branch=main')) {
      const data = api.read(url);
      return { workflow_runs: [...data.workflow_runs, ...Array.from({ length: 97 }, (_, i) => run(40 + i, [], { created_at: '2026-10-01T00:00:00Z' }))] };
    }
    return url.includes('/jobs') && !/runs\/1[012]\//.test(url) ? { jobs: [] } : api.read(url);
  };
  const snapshot = collect({ repo: 'afikyermi/Nestly', pr: '57' }, read);
  assert.equal(asked.filter((u) => u.includes('actions/runs?branch=main')).length, 1, 'one page only');
  assert.ok(!snapshot.errors.some((e) => e.includes('Pagination')));
  assert.ok(snapshot.limitations.some((l) => l.includes('newest 100 main runs')));
  const broken = collect({ repo: 'afikyermi/Nestly', pr: '57' }, (url) => (url.includes('actions/runs?branch=main') ? {} : api.read(url)));
  assert.match(evaluate(broken).blockers.join('\n'), /Invalid response: actions\/runs\?branch=main/, 'an unreadable page still blocks');
});

test('[P1.1] a cancellation on an older main SHA is superseded; on the current main SHA it blocks; an older failure still shows', () => {
  const e2e = (id, sha, conclusion) => run(id, [], { name: 'preview-e2e', workflow_id: 9, event: 'deployment_status', head_sha: sha, conclusion });
  assert.deepEqual(mainHealth([e2e(10, OLD, 'cancelled')], MAIN), [], 'no-jobs run cancelled on an older SHA');
  assert.deepEqual(mainHealth([run(10, [job('test', 'cancelled')], { head_sha: OLD })], MAIN), [], 'a job cancelled on an older SHA');
  assert.equal(mainHealth([e2e(10, MAIN, 'cancelled')], MAIN).length, 1, 'cancelled on the current SHA counts');
  assert.equal(mainHealth([run(10, [job('test', 'cancelled')])], MAIN).length, 1);
  const hidden = mainHealth([run(9, [job('test', 'failure')], { head_sha: OLD }), run(10, [job('test', 'cancelled')], { head_sha: OLD })], MAIN);
  assert.equal(hidden.length, 1, 'a superseded cancellation cannot erase an older failure');
  assert.equal(outcomeOf(hidden[0]), 'failure');
  assert.equal(mainHealth([e2e(10, OLD, 'cancelled')]).length, 1, 'without the main SHA nothing is passed over');
  const s = fixture(); s.mainRuns = [e2e(10, OLD, 'cancelled')];
  assert.deepEqual(evaluate(s).blockers, [], 'evaluate passes the main SHA');
});

test('[P1.1] a job skipped by this head\'s own successful CI run is an expected skip with its reason; any other skip still blocks', () => {
  const withSkip = (ciRun, url = ciUrl(77)) => ({ ...fixture(), ciRun, checks: [...fixture().checks, check('db', 'skipped', { id: 30, html_url: url })] });
  const ok = evaluate(withSkip({ id: 77, conclusion: 'success' }));
  assert.deepEqual(ok.blockers, []);
  assert.match(ok.expectedSkips.db, /successful CI run 77/);
  assert.match(formatStatus(ok), /Expected skip: db/);
  assert.match(evaluate(withSkip({ id: 77, conclusion: 'failure' })).blockers.join('\n'), /Check db: skipped/, 'the CI run did not succeed');
  assert.match(evaluate(withSkip(undefined)).blockers.join('\n'), /Check db: skipped/, 'no CI run found');
  assert.match(evaluate(withSkip({ id: 77, conclusion: 'success' }, ciUrl(78))).blockers.join('\n'), /Check db: skipped/, 'a skip from another run');
  assert.match(evaluate(withSkip({ id: 7, conclusion: 'success' }, ciUrl(77))).blockers.join('\n'), /Check db: skipped/, 'run 7 is not run 77');
  const required = withSkip({ id: 77, conclusion: 'success' });
  required.checks = required.checks.map((c) => (c.name === 'test' ? { ...c, conclusion: 'skipped' } : c));
  assert.match(evaluate(required).blockers.join('\n'), /Required test: skipped/, 'a required check skipped outside the run');
  const failed = withSkip({ id: 77, conclusion: 'success' });
  failed.checks.at(-1).conclusion = 'failure';
  assert.match(evaluate(failed).blockers.join('\n'), /Check db: failure/);
});

test('[P1.1] E is "not required" for a no-Preview branch only when no product, migration, dependency or deploy file changed', () => {
  const POLICY = { '**': false, main: true, 'ready/**': true };
  const noE = (files, extra = {}) => ({ ...fixture(), checks: fixture().checks.filter((c) => c.name !== 'preview-e2e'), headPolicy: POLICY, headRef: 'chore/records', files, ...extra });
  const records = evaluate(noE(['WORKPLAN-HE.md', 'tools/part-status.mjs', '.claude/workflow.md', '.github/workflows/ci.yml']));
  assert.deepEqual(records.blockers, []);
  assert.equal(records.e.state, 'not required');
  assert.match(records.e.reason, /no Preview by policy for chore\/records/);
  for (const f of ['apps/web/src/a.tsx', 'apps/server/src/x.ts', 'packages/shared/src/v.ts', 'api/index.ts', 'supabase/migrations/1_x.sql',
    'package-lock.json', 'package.json', 'apps/web/package.json', 'vercel.json', 'e2e-preview/a.flow.ts']) {
    assert.match(evaluate(noE(['WORKPLAN-HE.md', f])).blockers.join('\n'), /E on a{40}: missing/, f);
  }
  assert.match(evaluate(noE(undefined)).blockers.join('\n'), /E on .*missing/, 'file list not read');
  assert.match(evaluate(noE([])).blockers.join('\n'), /E on .*missing/, 'empty file list');
  assert.match(evaluate(noE(['README.md'], { headRef: 'ready/x' })).blockers.join('\n'), /E on .*missing/, 'a ready/ branch gets a Preview: E is required');
  assert.match(evaluate(noE(['README.md'], { headPolicy: undefined })).blockers.join('\n'), /E on .*missing/, 'no policy: every branch deploys');
  const failedE = noE(['README.md']);
  failedE.checks.push(check('preview-e2e', 'failure', { id: 40 }));
  assert.match(evaluate(failedE).blockers.join('\n'), /E on .*failure/, 'an E that ran and failed is never waived');
});

test('[P1.1] a merged PR\'s CI run is found by head SHA and branch; an open PR still needs the PR link', () => {
  const api = apiFixture();
  const make = ({ merged, runBranch = 'chore/x', prs = [] }) => (url) => {
    if (url.endsWith('/pulls/57')) return { ...api.read(url), state: merged ? 'closed' : 'open', merged, head: { sha: SHA, ref: 'chore/x' } };
    if (url.includes('workflows/ci.yml/runs')) return { workflow_runs: [{ ...run(12, []), head_sha: SHA, event: 'pull_request', head_branch: runBranch, pull_requests: prs }] };
    return api.read(url);
  };
  const ci = (cfg) => collect({ repo: 'afikyermi/Nestly', pr: '57' }, make(cfg)).errors.filter((e) => e.startsWith('CI run on current PR head'));
  assert.deepEqual(ci({ merged: true }), [], 'merged: found by SHA and branch');
  assert.equal(collect({ repo: 'afikyermi/Nestly', pr: '57' }, make({ merged: true })).ciRun.id, 12);
  assert.deepEqual(ci({ merged: false }), ['CI run on current PR head: missing'], 'open PR: the link is required');
  assert.deepEqual(ci({ merged: true, runBranch: 'other' }), ['CI run on current PR head: missing'], 'another branch on the same commit');
  assert.deepEqual(ci({ merged: true, prs: [{ number: 99 }] }), ['CI run on current PR head: missing'], 'linked to another PR');
  assert.deepEqual(ci({ merged: false, prs: [{ number: 57 }] }), []);
});
