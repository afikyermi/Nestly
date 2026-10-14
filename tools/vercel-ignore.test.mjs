// Tests for tools/vercel-ignore.mjs, from the decisions.md entry
// "2026-10-12 | Vercel builds only `main` and the active branch", and decisions/2026-10.md "Speed-up", change 2: a branch
// that has an open PR on GitHub also builds, so the push order no longer matters. The lookup is injected; no network.
// Contract: exit 1 = build, exit 0 = skip (Vercel ignoreCommand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide, lookupOpenPrs, main } from './vercel-ignore.mjs';

const script = fileURLToPath(new URL('./vercel-ignore.mjs', import.meta.url));

function build(result) {
  // decide() may return a boolean or a structured value; accept the obvious shapes.
  if (typeof result === 'boolean') return result;
  if (typeof result === 'string') return /build/i.test(result) && !/skip/i.test(result);
  if (result && typeof result === 'object') {
    if ('build' in result) return Boolean(result.build);
    if ('skip' in result) return !result.skip;
  }
  throw new Error('unrecognised decide() result: ' + JSON.stringify(result));
}

/** Every string the result carries, so a reason can be found whatever its field is called. */
function textOf(result) {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') return Object.values(result).filter((v) => typeof v === 'string').join(' ');
  return '';
}

function run(env) {
  // Run with a clean environment so the CI's own variables do not leak in.
  const clean = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env };
  return spawnSync(process.execPath, [script], { env: clean, encoding: 'utf8' }).status;
}

const cases = [
  ['main builds', { VERCEL_GIT_COMMIT_REF: 'main' }, true],
  ['main with an empty PR id builds', { VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_PULL_REQUEST_ID: '' }, true],
  ['branch with a PR id builds', { VERCEL_GIT_COMMIT_REF: 'feat/x', VERCEL_GIT_PULL_REQUEST_ID: '42' }, true],
  ['branch with an empty PR id skips', { VERCEL_GIT_COMMIT_REF: 'feat/x', VERCEL_GIT_PULL_REQUEST_ID: '' }, false],
  ['branch with no PR variable skips', { VERCEL_GIT_COMMIT_REF: 'feat/x' }, false],
  ['empty env skips', {}, false],
  ['branch named like main (main-old) without a PR skips', { VERCEL_GIT_COMMIT_REF: 'main-old' }, false],
  ['branch "Main" (different case) without a PR skips', { VERCEL_GIT_COMMIT_REF: 'Main' }, false],
  ['PR id without a branch ref does not crash', { VERCEL_GIT_PULL_REQUEST_ID: '7' }, undefined],
];

for (const [name, env, expected] of cases) {
  if (expected === undefined) continue;
  test(`decide: ${name}`, () => {
    assert.equal(build(decide(env)), expected);
  });
  test(`exit code: ${name} (${expected ? '1 build' : '0 skip'})`, () => {
    // No repository variables in the clean env, so the lookup has nothing to ask and the answer is unchanged.
    assert.equal(run(env), expected ? 1 : 0);
  });
}

test('decide: tolerates a PR-id-only env without throwing', () => {
  assert.doesNotThrow(() => decide({ VERCEL_GIT_PULL_REQUEST_ID: '7' }));
});

// ---- decide(env, prs): the open-PR count of the branch --------------------------------------------------------------

const BRANCH = { VERCEL_GIT_COMMIT_REF: 'feat/x' };

test('decide: a branch with an open PR on GitHub builds, with no PR id from Vercel', () => {
  for (const prs of [1, 2, 30]) assert.equal(build(decide(BRANCH, prs)), true, `prs=${prs}`);
});

test('decide: a branch with 0 open PRs, or no answer (undefined), skips', () => {
  assert.equal(build(decide(BRANCH, 0)), false);
  assert.equal(build(decide(BRANCH, undefined)), false);
  assert.equal(build(decide(BRANCH)), false);
});

test('decide: a failed lookup (null) builds, and the reason says the lookup failed', () => {
  const result = decide(BRANCH, null);
  assert.equal(build(result), true);
  assert.match(textOf(result), /look.?up|fail|unavailable|could not|error/i);
});

test('decide: main and a PR id win whatever the lookup said', () => {
  for (const prs of [0, undefined, null, 3]) {
    assert.equal(build(decide({ VERCEL_GIT_COMMIT_REF: 'main' }, prs)), true, `main, prs=${prs}`);
    assert.equal(build(decide({ ...BRANCH, VERCEL_GIT_PULL_REQUEST_ID: '42' }, prs)), true, `PR id, prs=${prs}`);
  }
});

// ---- lookupOpenPrs(env, fetchFn) ----------------------------------------------------------------------------------------

const REPO = { VERCEL_GIT_REPO_OWNER: 'afik', VERCEL_GIT_REPO_SLUG: 'nestly', VERCEL_GIT_COMMIT_REF: 'feat/x' };
const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test('lookupOpenPrs: an array of n pull requests gives n; an empty array gives 0', async () => {
  assert.equal(await lookupOpenPrs(REPO, ok([{ number: 1 }])), 1);
  assert.equal(await lookupOpenPrs(REPO, ok([{ number: 1 }, { number: 2 }, { number: 3 }])), 3);
  assert.equal(await lookupOpenPrs(REPO, ok([])), 0);
});

test('lookupOpenPrs: anything that is not a usable answer gives null (fail open), never a throw', async () => {
  const notOk = async () => ({ ok: false, status: 403, json: async () => ({ message: 'rate limit' }) });
  const rejected = async () => {
    throw new Error('network down');
  };
  const aborted = async () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    throw e;
  };
  assert.equal(await lookupOpenPrs(REPO, notOk), null, 'non-OK');
  assert.equal(await lookupOpenPrs(REPO, rejected), null, 'rejected');
  assert.equal(await lookupOpenPrs(REPO, aborted), null, 'aborted');
  for (const body of [{}, { message: 'x' }, null, 'text', 7]) {
    assert.equal(await lookupOpenPrs(REPO, ok(body)), null, `body ${JSON.stringify(body)}`);
  }
  const badJson = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  });
  assert.equal(await lookupOpenPrs(REPO, badJson), null, 'a body that is not JSON');
});

test('lookupOpenPrs: without the owner, the repository or the branch there is nothing to ask: undefined, and fetch is not called', async () => {
  for (const missing of ['VERCEL_GIT_REPO_OWNER', 'VERCEL_GIT_REPO_SLUG', 'VERCEL_GIT_COMMIT_REF']) {
    const env = { ...REPO };
    delete env[missing];
    let calls = 0;
    const result = await lookupOpenPrs(env, async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => [{}] };
    });
    assert.equal(result, undefined, `without ${missing}`);
    assert.equal(calls, 0, `without ${missing}: fetch was called`);
  }
  let calls = 0;
  assert.equal(await lookupOpenPrs({}, async () => (calls += 1)), undefined);
  assert.equal(calls, 0);
});

const rawUrlOf = (args) => String(args[0] instanceof Object && 'url' in args[0] ? args[0].url : args[0]);

test('lookupOpenPrs: asks GitHub for open pull requests whose head is <owner>:<branch>, with the branch encoded', async () => {
  const seen = [];
  const spy = async (...args) => {
    seen.push(args);
    return { ok: true, status: 200, json: async () => [] };
  };
  await lookupOpenPrs(REPO, spy);
  assert.equal(seen.length, 1, 'exactly one request');
  const raw = rawUrlOf(seen[0]);
  const url = new URL(raw);
  assert.equal(url.hostname, 'api.github.com');
  assert.equal(url.pathname, '/repos/afik/nestly/pulls');
  assert.equal(url.searchParams.get('state'), 'open');
  assert.equal(url.searchParams.get('head'), 'afik:feat/x');
  assert.match(raw, /head=[^&]*feat%2Fx/, 'the branch name is not percent-encoded in the query');
});

test('lookupOpenPrs: a hostile branch name cannot add or change a query parameter', async () => {
  const seen = [];
  const spy = async (...args) => {
    seen.push(args);
    return { ok: true, status: 200, json: async () => [] };
  };
  await lookupOpenPrs({ ...REPO, VERCEL_GIT_COMMIT_REF: 'a&state=closed#x' }, spy);
  const url = new URL(rawUrlOf(seen[0]));
  assert.equal(url.searchParams.get('state'), 'open');
  assert.equal(url.searchParams.get('head'), 'afik:a&state=closed#x');
  assert.equal(url.hash, '');
});

// ---- main(env, lookup) --------------------------------------------------------------------------------------------------

test('main: for main and for a PR id the lookup is never called', async () => {
  for (const env of [
    { ...REPO, VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL_GIT_COMMIT_REF: 'main' },
    { ...REPO, VERCEL_GIT_PULL_REQUEST_ID: '42' },
  ]) {
    let calls = 0;
    await main(env, async () => {
      calls += 1;
      return 0;
    });
    assert.equal(calls, 0, `lookup called for ${JSON.stringify(env)}`);
  }
});

test('main: for a branch without a PR id the lookup is called once, with the environment', async () => {
  const seen = [];
  await main(REPO, async (...args) => {
    seen.push(args);
    return 0;
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0]?.VERCEL_GIT_COMMIT_REF, 'feat/x');
});
