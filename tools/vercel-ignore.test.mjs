// Tests for tools/vercel-ignore.mjs, from the decisions.md entry
// "2026-10-12 | Vercel builds only `main` and the active branch".
// Contract: exit 1 = build, exit 0 = skip (Vercel ignoreCommand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from './vercel-ignore.mjs';

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
    assert.equal(run(env), expected ? 1 : 0);
  });
}

test('decide: tolerates a PR-id-only env without throwing', () => {
  assert.doesNotThrow(() => decide({ VERCEL_GIT_PULL_REQUEST_ID: '7' }));
});
