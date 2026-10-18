// Tests for tools/schema-gate.mjs (P6, 18.10.2026): a schema pull request carries no product code; product code merges
// only after the production apply of every migration in its tree, matched by name and content; history is immutable;
// unreadable evidence fails. No network and no git: the evidence reader is injected. Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, findApplied, main, parseChanges, parseTree, PRODUCT } from './schema-gate.mjs';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
// The CI wiring (.github/workflows/ci.yml), read as data with tools/workflow-yaml.mjs and never run.
const ci = parseYaml(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));

const A = 'supabase/migrations/20261017150000_profile_view.sql';
const B = 'supabase/migrations/20261018100000_posts.sql';
const blob = (c) => c.repeat(40);
const tree = (entries) => new Map(entries);
const base = tree([[A, blob('a')]]);
const withB = tree([[A, blob('a')], [B, blob('b')]]);
const applied = (entries, sha = blob('c')) => ({ sha, tree: tree(entries) });
const ch = (...paths) => paths.map((p) => ({ status: 'M', path: p }));

const red = (v) => v.problems.length > 0;

test('[P6] parsers read NUL-separated git output; a non-ASCII migration name stays visible; garbage throws', () => {
  const hebrew = 'supabase/migrations/20261020100000_הוספת_עמודה.sql';
  const t = parseTree(`100644 blob ${blob('a')}\t${A}\x00100644 blob ${blob('d')}\t${hebrew}\x00`);
  assert.deepEqual([...t.keys()], [A, hebrew]);
  assert.throws(() => parseTree('"supabase/migrations/\\327\\224.sql"\x00'));
  assert.deepEqual(parseChanges(`A\x00${B}\x00M\x00apps/server/src/x.ts\x00`), [{ status: 'A', path: B }, { status: 'M', path: 'apps/server/src/x.ts' }]);
  assert.throws(() => parseChanges('A\x00'));
});

test('[P6] product paths: what Vercel deploys, not tests, records, tools or workflows', () => {
  for (const p of ['api/index.ts', 'apps/server/src/app.ts', 'apps/server/api/x.ts', 'apps/web/src/main.tsx', 'apps/web/index.html', 'apps/web/public/robots.txt', 'packages/shared/src/val.ts']) {
    assert.ok(PRODUCT.test(p), p);
  }
  for (const p of ['apps/server/tests/db/x.test.ts', 'apps/web/tests/x.test.tsx', 'e2e/a.spec.ts', 'tools/x.mjs', '.work/x/spec.md', 'supabase/tests/x.sql', '.github/workflows/ci.yml', 'packages/shared/tests/x.test.ts']) {
    assert.ok(!PRODUCT.test(p), p);
  }
});

test('[P6 c1] a schema pull request with no product code passes; with product code it must be split', () => {
  const ok = evaluate({ changes: [{ status: 'A', path: B }, ...ch('supabase/tests/40_posts.sql', 'apps/server/tests/db/posts.db.test.ts')], base, head: withB, applied: null });
  assert.equal(ok.kind, 'schema');
  assert.deepEqual(ok.problems, []);
  const mixed = evaluate({ changes: [{ status: 'A', path: B }, ...ch('apps/server/src/posts.ts')], base, head: withB, applied: null });
  assert.ok(red(mixed));
  assert.match(mixed.problems.join('\n'), /split it/);
  // the non-ASCII case of CRITIC finding 1, end to end through the classifier
  const hebrew = 'supabase/migrations/20261020100000_הוספת_עמודה.sql';
  assert.match(evaluate({ changes: [{ status: 'A', path: hebrew }, ...ch('apps/server/src/x.ts')], base, head: tree([[A, blob('a')], [hebrew, blob('h')]]), applied: applied([[A, blob('a')]]) }).problems.join(), /split it/);
});

test('[P6 c2] code passes only when every migration in its tree is applied with the same content', () => {
  const code = ch('apps/server/src/posts.ts');
  assert.deepEqual(evaluate({ changes: code, base: withB, head: withB, applied: applied([[A, blob('a')], [B, blob('b')]]) }).problems, []);
  assert.ok(red(evaluate({ changes: code, base: withB, head: withB, applied: applied([[A, blob('a')]]) })), 'new schema not yet applied');
  assert.ok(red(evaluate({ changes: code, base: withB, head: withB, applied: applied([[A, blob('a')], [B, blob('e')]]) })), 'stale evidence: same name, other content');
  assert.ok(red(evaluate({ changes: code, base: withB, head: withB, applied: null })), 'no apply at all');
  assert.match(evaluate({ changes: code, base: withB, head: withB, applied: 'error' }).problems.join(), /missing, not green/);
  assert.deepEqual(evaluate({ changes: code, base, head: base, applied: applied([[A, blob('a')], [B, blob('b')]]) }).problems, [], 'production ahead of the branch');
});

test('[P6] records, tests and tools need no evidence; no migration at all needs none', () => {
  assert.deepEqual(evaluate({ changes: ch('.work/x/result.md', 'tools/x.mjs', 'e2e/a.spec.ts'), base: withB, head: withB, applied: 'error' }).problems, []);
  assert.deepEqual(evaluate({ changes: ch('apps/web/src/x.tsx'), base: new Map(), head: new Map(), applied: 'error' }).problems, []);
});

test('[P6 c3] the history is immutable: a changed or deleted migration from main fails; a stray file fails', () => {
  assert.ok(red(evaluate({ changes: [{ status: 'M', path: A }], base, head: tree([[A, blob('f')]]), applied: null })));
  assert.ok(red(evaluate({ changes: [{ status: 'D', path: A }], base, head: new Map(), applied: null })));
  assert.ok(red(evaluate({ changes: ch('supabase/migrations/notes.txt'), base, head: tree([[A, blob('a')], ['supabase/migrations/notes.txt', blob('n')]]), applied: null })));
});

test('[P6] product code and the gate in one pull request: split it (CRITIC finding 2)', () => {
  for (const g of ['tools/schema-gate.mjs', '.github/workflows/ci.yml']) {
    const v = evaluate({ changes: ch('apps/server/src/x.ts', g), base, head: base, applied: applied([[A, blob('a')]]) });
    assert.match(v.problems.join(), /split it/, g);
  }
  assert.deepEqual(evaluate({ changes: ch('tools/schema-gate.mjs', '.github/workflows/ci.yml'), base, head: base, applied: 'error' }).problems, [], 'a gate-only change is judged by the old gate');
});

test('[P6 c2] findApplied: the newest dispatch on main whose db-production succeeded; failed, skipped and other branches do not count', async () => {
  const runs = { workflow_runs: [
    { id: 1, head_sha: blob('1'), head_branch: 'main', event: 'workflow_dispatch', created_at: '2026-10-17T10:00:00Z' },
    { id: 3, head_sha: blob('3'), head_branch: 'main', event: 'workflow_dispatch', created_at: '2026-10-17T12:00:00Z' },
    { id: 4, head_sha: blob('4'), head_branch: 'main', event: 'workflow_dispatch', created_at: '2026-10-17T14:00:00Z' },
    { id: 2, head_sha: blob('2'), head_branch: 'feat/x', event: 'workflow_dispatch', created_at: '2026-10-17T13:00:00Z' },
  ] };
  const jobs = {
    1: [{ name: 'db-preview', status: 'completed', conclusion: 'success' }, { name: 'db-production', status: 'completed', conclusion: 'success' }],
    3: [{ name: 'db-preview', status: 'completed', conclusion: 'success' }, { name: 'db-production', status: 'completed', conclusion: 'skipped' }],
    4: [{ name: 'db-preview', status: 'completed', conclusion: 'success' }, { name: 'db-production', status: 'completed', conclusion: 'failure' }],
    2: [{ name: 'db-production', status: 'completed', conclusion: 'success' }],
  };
  const get = async (endpoint) => (endpoint.includes('/workflows/') ? runs : { jobs: jobs[/runs\/(\d+)\/jobs/.exec(endpoint)[1]] });
  assert.equal(await findApplied('afikyermi/Nestly', get), blob('1'));
  assert.equal(await findApplied('afikyermi/Nestly', async () => ({ workflow_runs: [] })), null);
  await assert.rejects(findApplied('afikyermi/Nestly', async () => ({ message: 'rate limited' })));
});

/** A fake git for main(): diff and trees per revision, and the fetch of the evidence commit. */
function fakeGit({ diff, trees, fetchFails = false }) {
  const calls = [];
  const z = (m) => [...m].map(([path, id]) => `100644 blob ${id}\t${path}\x00`).join('');
  const git = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'diff') return diff.map((c) => `${c.status}\x00${c.path}\x00`).join('');
    if (args[0] === 'fetch') { if (fetchFails) throw new Error('fetch failed'); return ''; }
    if (args[0] === 'ls-tree') return z(trees[args[3]] ?? new Map());
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  return { git, calls };
}
const evidence = (sha) => async (endpoint) => (endpoint.includes('/workflows/')
  ? { workflow_runs: [{ id: 9, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', created_at: '2026-10-18T00:00:00Z' }] }
  : { jobs: [{ name: 'db-production', status: 'completed', conclusion: 'success' }] });
const quiet = { log: () => undefined, warn: () => undefined };
const env = { GITHUB_REPOSITORY: 'afikyermi/Nestly' };

test('[P6] main(): code PR — fetches the evidence commit and passes only when it carries the tree; any read error is red', async () => {
  const S = blob('9');
  const ok = fakeGit({ diff: ch('apps/server/src/x.ts'), trees: { 'HEAD^1': withB, HEAD: withB, [S]: withB } });
  assert.equal(await main(env, { git: ok.git, get: evidence(S), ...quiet }), 0);
  assert.ok(ok.calls.includes(`fetch --quiet --no-tags --depth=1 origin ${S}`), 'evidence fetched when product code changed');
  const stale = fakeGit({ diff: ch('apps/server/src/x.ts'), trees: { 'HEAD^1': withB, HEAD: withB, [S]: base } });
  assert.equal(await main(env, { git: stale.git, get: evidence(S), ...quiet }), 1);
  const down = fakeGit({ diff: ch('apps/server/src/x.ts'), trees: { 'HEAD^1': withB, HEAD: withB } });
  assert.equal(await main(env, { git: down.git, get: async () => { throw new Error('HTTP 503'); }, ...quiet }), 1);
  const nofetch = fakeGit({ diff: ch('apps/server/src/x.ts'), trees: { 'HEAD^1': withB, HEAD: withB }, fetchFails: true });
  assert.equal(await main(env, { git: nofetch.git, get: evidence(S), ...quiet }), 1);
  assert.equal(await main(env, { git: () => { throw new Error('not a repo'); }, get: evidence(S), ...quiet }), 1);
  assert.equal(await main({}, { git: ok.git, get: evidence(S), ...quiet }), 2);
});

test('[P6] main(): a schema or records PR needs no evidence and reads none', async () => {
  for (const diff of [[{ status: 'A', path: B }], ch('.work/x/result.md')]) {
    const g = fakeGit({ diff, trees: { 'HEAD^1': base, HEAD: diff[0].path === B ? withB : base } });
    let asked = false;
    assert.equal(await main(env, { git: g.git, get: async () => { asked = true; return {}; }, ...quiet }), 0);
    assert.equal(asked, false);
  }
});

// As CI runs it: a lone copy in a temporary directory must load and judge (CRITIC P6 N1: a gate that only works inside
// tools/ would, once merged, turn every later pull request red, its own fix included).
test('[P6] the gate runs as a lone copy outside the repository, as CI runs the base commit\'s copy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'schema-gate-'));
  try {
    const copy = join(dir, 'schema-gate.mjs');
    copyFileSync(join(root, 'tools/schema-gate.mjs'), copy);
    const lone = await import(pathToFileURL(copy).href);
    const g = fakeGit({ diff: ch('.work/x/result.md'), trees: { 'HEAD^1': base, HEAD: base } });
    assert.equal(await lone.main(env, { git: g.git, get: async () => ({}), ...quiet }), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('[P6] ci.yml: schema-gate runs on pull requests, read-only, and calls the tool', () => {
  const job = ci.jobs?.['schema-gate'];
  assert.ok(job, 'no schema-gate job');
  assert.match(String(job.if), /github\.event_name == 'pull_request'/);
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' });
  assert.ok(!('continue-on-error' in job), 'the gate must be able to fail');
  const steps = stepsOf(job);
  assert.equal(String(steps[0].with?.['fetch-depth']), '2', 'HEAD^1 is the base');
  const gateRun = steps.map((s) => runOf(s)).find((r) => r.includes('schema-gate.mjs')) ?? '';
  assert.match(gateRun, /git show 'HEAD\^1:tools\/schema-gate\.mjs' > "\$\{gate\}"/, "the base commit's copy");
  assert.match(gateRun, /node "\$\{gate\}"/);
  assert.doesNotMatch(gateRun, /node tools\/schema-gate\.mjs/, "never the pull request's own copy directly");
  assert.doesNotMatch(JSON.stringify(job), /secrets\./, 'no secret: the gate reads public data with the job token');
});

test('[P6] ci.yml: the db job runs main\'s server tests on a new migration, after its own tests and before the log step', () => {
  const steps = stepsOf(ci.jobs.db);
  const names = steps.map((s) => String(s.name ?? ''));
  const own = names.findIndex((n) => n.startsWith('Server integration tests'));
  const expand = names.findIndex((n) => n.includes('P6 expand check'));
  assert.ok(own >= 0 && expand === own + 1, 'the expand check follows the server integration tests');
  assert.equal(expand, steps.length - 2, 'only the failure-only log step comes after it');
  const run = runOf(steps[expand]);
  assert.match(run, /--diff-filter=A 'HEAD\^1' HEAD -- supabase\/migrations/);
  assert.match(run, /git worktree add --detach "\$\{base\}" 'HEAD\^1'/);
  assert.match(run, /npm ci\n\s*npm run test:db -w @nestly\/server/);
  assert.ok(!('if' in steps[expand]), 'decided inside the step: a step-level if would be skippable');
  assert.equal(String(stepsOf(ci.jobs.db)[0].with?.['fetch-depth']), '2');
});
