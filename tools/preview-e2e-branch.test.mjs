// preview-e2e, input `branch` (Afik 28.10.2026): a branch's main flow passes on a real Preview before the branch is merged. The branch's
// tree goes on ready/preview-check exactly as main's goes on ready/nightly; the e2e job still runs main's code (the flows, the install and
// every step that holds a secret), and the branch's name reaches a run body only through env. Expected values come from that decision and
// from the existing rules of preview-e2e.test.mjs (never forced, a plain push, nothing pushed on a refusal), not from the code under test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { codeOf, parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const wf = parseYaml(readFileSync(new URL('../.github/workflows/preview-e2e.yml', import.meta.url), 'utf8'));
const dsteps = stepsOf(wf.jobs.deployment);
const esteps = stepsOf(wf.jobs.e2e);
const allSteps = [...dsteps, ...esteps];
const candidate = dsteps.find((s) => s.id === 'candidate');

test('[E c1 branch] input `branch` is optional and empty by default; it reaches a run body only through env', () => {
  const input = wf.on.workflow_dispatch.inputs.branch;
  assert.equal(String(input.required), 'false');
  assert.equal(input.default, '');
  for (const step of allSteps) assert.doesNotMatch(runOf(step), /\$\{\{\s*inputs\./, `run body of "${step.name ?? step.uses}"`);
  assert.equal(candidate.env.BRANCH, '${{ inputs.branch }}');
});

test('[E c1 branch] with a branch, the e2e job checks out main (never the branch), so no code of the branch runs beside a secret', () => {
  const checkouts = esteps.filter((s) => /actions\/checkout/.test(String(s.uses)));
  assert.match(checkouts[0].with.ref, /inputs\.branch && github\.event\.repository\.default_branch \|\|/);
  assert.equal(checkouts[1].with.ref, '${{ github.event.repository.default_branch }}', 'the trusted harness is main');
});

test('[E c1 branch] the push goes to one of exactly two ready/ branches, set as literals', () => {
  const runs = allSteps.map((st) => codeOf(runOf(st))).join('\n');
  const targets = runs.split('\n').map((l) => /^\s*target=(.*)$/.exec(l)?.[1]).filter((t) => t !== undefined);
  assert.deepEqual(targets, ['"ready/nightly"', '"ready/preview-check"']);
});

// Behaviour: the candidate step runs with bash in a sandbox (a bare origin with main and a `feature` branch).
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const toolsMissing = ['bash', 'git'].some((t) => sh('bash', ['-c', `command -v ${t}`]).status !== 0) ? 'bash or git is not available' : false;
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
const g = (cwd, ...args) => {
  const r = sh('git', ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, env: gitEnv });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'pe2e-branch-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  g(dir, 'init', '-q', '--bare', origin);
  g(dir, 'clone', '-q', origin, work);
  const commit = (msg) => {
    writeFileSync(join(work, 'f'), msg);
    g(work, 'add', 'f');
    g(work, 'commit', '-q', '-m', msg);
    return g(work, 'rev-parse', 'HEAD');
  };
  const main = commit('main');
  g(work, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  g(work, 'push', '-q', 'origin', `${main}:refs/heads/ready/nightly`);
  g(work, 'checkout', '-q', '-b', 'feature');
  const feature = commit('feature');
  g(work, 'push', '-q', 'origin', 'HEAD:refs/heads/feature');
  g(work, 'checkout', '-q', 'main');
  const ref = (name) => sh('git', ['ls-remote', origin, `refs/heads/${name}`], { env: gitEnv }).stdout.split('\t')[0];
  return { dir, work, main, feature, ref };
}

function runCandidate(cwd, env) {
  const dir = mkdtempSync(join(tmpdir(), 'pe2e-step-'));
  try {
    writeFileSync(join(dir, 'step.sh'), runOf(candidate));
    writeFileSync(join(dir, 'out'), '');
    const r = sh('bash', ['-e', join(dir, 'step.sh')], { cwd, env: { ...gitEnv, GITHUB_OUTPUT: join(dir, 'out'), ...env } });
    const out = Object.fromEntries(readFileSync(join(dir, 'out'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    return { status: r.status, text: `${r.stdout}${r.stderr}`, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("[E c1 branch] the branch's exact tree goes on ready/preview-check as a new child of the branch; ready/nightly is untouched", { skip: toolsMissing }, () => {
  const box = sandbox();
  try {
    const nightly = box.ref('ready/nightly');
    const r = runCandidate(box.work, { BRANCH: 'feature' });
    assert.equal(r.status, 0, r.text);
    assert.equal(box.ref('ready/preview-check'), r.out.sha);
    assert.notEqual(r.out.sha, box.feature, 'a new commit, so Vercel builds a Preview of it');
    g(box.work, 'fetch', '-q', 'origin', 'refs/heads/ready/preview-check');
    assert.equal(g(box.work, 'rev-parse', `${r.out.sha}^{tree}`), g(box.work, 'rev-parse', `${box.feature}^{tree}`), "exactly the branch's tree");
    assert.ok(g(box.work, 'rev-list', '--parents', '-n', '1', r.out.sha).split(' ').slice(1).includes(box.feature), 'a child of the branch');
    assert.equal(box.ref('ready/nightly'), nightly, 'ready/nightly unchanged');
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test('[E c1 branch] a second walk of the same tree pushes nothing and reuses that commit', { skip: toolsMissing }, () => {
  const box = sandbox();
  try {
    const first = runCandidate(box.work, { BRANCH: 'feature' });
    assert.equal(first.status, 0, first.text);
    const again = runCandidate(box.work, { BRANCH: 'feature' });
    assert.equal(again.status, 0, again.text);
    assert.equal(again.out.sha, first.out.sha);
    assert.match(again.text, /nothing pushed/);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

for (const [label, branch] of [
  ['main itself', 'main'],
  ['a ready/ branch', 'ready/nightly'],
  ['a name with a space', 'a b'],
  ['a name with a dollar sign', 'x$(id)'],
  ['a path climbing up', 'a/../b'],
  ['an option-looking name', '-x'],
]) {
  test(`[E c1 branch] ${label} is refused before any fetch or push`, { skip: toolsMissing }, () => {
    const box = sandbox();
    try {
      const nightly = box.ref('ready/nightly');
      const r = runCandidate(box.work, { BRANCH: branch });
      assert.equal(r.status, 1, r.text);
      assert.match(r.text, /not a branch name this workflow walks/);
      assert.equal(box.ref('ready/preview-check'), '');
      assert.equal(box.ref('ready/nightly'), nightly);
    } finally {
      rmSync(box.dir, { recursive: true, force: true });
    }
  });
}

test('[E c1 branch] a branch that is not on origin fails the run and pushes nothing', { skip: toolsMissing }, () => {
  const box = sandbox();
  try {
    const r = runCandidate(box.work, { BRANCH: 'no-such-branch' });
    assert.equal(r.status, 1, r.text);
    assert.match(r.text, /no such branch on origin/);
    assert.equal(box.ref('ready/preview-check'), '');
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});
