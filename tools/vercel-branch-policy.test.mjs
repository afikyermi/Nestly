// Tests for tools/vercel-branch-policy.mjs (P4, 18.10.2026): Vercel creates deployments only for main and ready/**
// branches; work, records and cloud-session branches create none (a cancelled deployment still counts toward the daily
// limit). The matcher is checked against Vercel's documented examples, then the policy against real branch names of
// this repository. Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CANDIDATE_PREFIX, POLICY, deploys, matches, readPolicy, unsupported } from './vercel-branch-policy.mjs';
import { decide } from './vercel-ignore.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('[P4] the matcher follows Vercel\'s documented examples (git-configuration)', () => {
  assert.equal(deploys({ dev: false }, 'dev'), false);
  assert.equal(deploys({ dev: false }, 'main'), true, 'a branch no rule matches deploys');
  assert.equal(deploys({ 'internal-*': false }, 'internal-tools'), false);
  assert.equal(deploys({ 'experiment-*': false, '*-dev': true }, 'experiment-my-branch-dev'), true, 'one true rule wins');
  assert.equal(deploys(false, 'main'), false);
  assert.equal(deploys(undefined, 'anything'), true);
});

test('[P4] minimatch subset: * stays within a segment, ** spans segments', () => {
  assert.equal(matches('*', 'ccr-517c29b5-ek8cc9'), true);
  assert.equal(matches('*', 'claude/p4'), false);
  assert.equal(matches('**', 'claude/p4/x'), true);
  assert.equal(matches('ready/**', 'ready/f3-1'), true);
  assert.equal(matches('ready/**', 'ready/i3/f3-1'), true);
  assert.equal(matches('ready/**', 'ready'), false);
  assert.equal(matches('ready/**', 'not-ready/x'), false);
  assert.equal(matches('main', 'main2'), false);
  assert.equal(matches('ma.n', 'main'), false, 'a dot is literal');
  for (const bad of ['', 'ready/{a,b}', 'feat/?', 'a**', '[ab]', 'a//b', '!main']) assert.equal(unsupported(bad), true, bad);
  assert.throws(() => matches('ready/{a,b}', 'ready/a'));
});

const DEPLOY = ['main', 'ready/f3-1', 'ready/i3/f3-1a', 'ready/records-fix'];
const NO_DEPLOY = [
  'ccr-517c29b5-ek8cc9', 'ccr-49631ac6-8tint3', 'claude/p4-deploy-policy', 'codex/p2-short-contracts', 'chore/records-after-f18',
  'feat/google-sign-in', 'records/after-i3', 'dev', 'ready', 'main-backup', 'release/main', 'x/ready/y',
];

test('[P4] POLICY: main and ready/** deploy; work, records and cloud-session branches create no deployment', () => {
  for (const branch of DEPLOY) assert.equal(deploys(POLICY, branch), true, `${branch} should deploy`);
  for (const branch of NO_DEPLOY) assert.equal(deploys(POLICY, branch), false, `${branch} should not deploy`);
  for (const pattern of Object.keys(POLICY)) assert.equal(unsupported(pattern), false, pattern);
});

test('[P4] the POLICY check can fail: each drift is caught (guards the test above)', () => {
  const caught = (policy) => DEPLOY.some((b) => !deploys(policy, b)) || NO_DEPLOY.some((b) => deploys(policy, b));
  const mutants = {
    'no catch-all': { main: true, 'ready/**': true },
    'catch-all * (misses slashed branches)': { '*': false, main: true, 'ready/**': true },
    'main not enabled': { '**': false, 'ready/**': true },
    'ready/* (one level only)': { '**': false, main: true, 'ready/*': true },
    'every branch enabled': true,
    'cloud branches enabled': { ...POLICY, 'ccr-*': true },
    'no policy': undefined,
  };
  for (const [label, policy] of Object.entries(mutants)) assert.ok(caught(policy), `${label} was not caught`);
});

test('[P4] vercel.json carries POLICY as git.deploymentEnabled', (t) => {
  const actual = readPolicy(root);
  if (actual === undefined) {
    // The agent may not edit vercel.json (deploy configuration): Afik adds the block from the P4 PR by hand.
    t.todo('vercel.json has no git.deploymentEnabled yet — Afik adds the block from the P4 PR');
    return;
  }
  assert.deepEqual(actual, { ...POLICY });
});

test('[P4] the ignoreCommand builds every candidate: it is pushed before its PR exists', () => {
  for (const ref of ['ready/f3-1', 'ready/i3/f3-1a']) {
    assert.equal(decide({ VERCEL_GIT_COMMIT_REF: ref }, 0).build, true, ref);
  }
  assert.equal(CANDIDATE_PREFIX, 'ready/');
  assert.equal(decide({ VERCEL_GIT_COMMIT_REF: 'readyish/x' }, 0).build, false, 'only the exact prefix');
});
