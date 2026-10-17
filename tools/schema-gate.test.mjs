// Tests for tools/schema-gate.mjs (P6, 18.10.2026): a schema pull request carries no product code; product code merges
// only after the production apply of every migration in its tree, matched by name and content; history is immutable;
// unreadable evidence fails. No network and no git: the evidence reader is injected. Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, findApplied, parseChanges, parseTree, PRODUCT } from './schema-gate.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const A = 'supabase/migrations/20261017150000_profile_view.sql';
const B = 'supabase/migrations/20261018100000_posts.sql';
const blob = (c) => c.repeat(40);
const tree = (entries) => new Map(entries);
const base = tree([[A, blob('a')]]);
const withB = tree([[A, blob('a')], [B, blob('b')]]);
const applied = (entries, sha = blob('c')) => ({ sha, tree: tree(entries) });
const ch = (...paths) => paths.map((p) => ({ status: 'M', path: p }));

test('[P6] parsers read git output: ls-tree migrations only, name-status first letter', () => {
  const t = parseTree(`100644 blob ${blob('a')}\t${A}\n100644 blob ${blob('d')}\tsupabase/migrations/README.md\n`);
  assert.deepEqual([...t], [[A, blob('a')]]);
  assert.deepEqual(parseChanges(`A\t${B}\nM\tapps/server/src/x.ts\nR100\tsome\n`).map((c) => c.status), ['A', 'M', 'R']);
});

test('[P6] product paths: what Vercel deploys, not tests, records, tools or workflows', () => {
  for (const p of ['api/index.ts', 'apps/server/src/app.ts', 'apps/server/api/x.ts', 'apps/web/src/main.tsx', 'apps/web/index.html', 'apps/web/public/robots.txt', 'packages/shared/src/val.ts']) {
    assert.ok(PRODUCT.test(p), p);
  }
  for (const p of ['apps/server/tests/db/x.test.ts', 'apps/web/tests/x.test.tsx', 'e2e/a.spec.ts', 'tools/x.mjs', '.work/x/spec.md', 'supabase/tests/x.sql', '.github/workflows/ci.yml', 'packages/shared/tests/x.test.ts']) {
    assert.ok(!PRODUCT.test(p), p);
  }
});

test('[P6] a schema pull request with no product code passes; with product code it must be split', () => {
  const ok = evaluate({ changes: [{ status: 'A', path: B }, ...ch('supabase/tests/40_posts.sql', 'apps/server/tests/db/posts.db.test.ts')], base, head: withB, applied: null });
  assert.equal(ok.kind, 'schema');
  assert.deepEqual(ok.problems, []);
  const mixed = evaluate({ changes: [{ status: 'A', path: B }, ...ch('apps/server/src/posts.ts')], base, head: withB, applied: null });
  assert.match(mixed.problems.join('\n'), /split it/);
});

test('[P6] code passes only when every migration in its tree is applied with the same content', () => {
  const code = ch('apps/server/src/posts.ts');
  assert.deepEqual(evaluate({ changes: code, base: withB, head: withB, applied: applied([[A, blob('a')], [B, blob('b')]]) }).problems, []);
  // schema new and not yet applied
  assert.match(evaluate({ changes: code, base: withB, head: withB, applied: applied([[A, blob('a')]]) }).problems.join(), /not applied in production.*posts\.sql/);
  // a file of the same name with other content was applied (stale evidence)
  assert.match(evaluate({ changes: code, base: withB, head: withB, applied: applied([[A, blob('a')], [B, blob('e')]]) }).problems.join(), /not applied/);
  // no apply at all, and unreadable evidence: red, never green
  assert.match(evaluate({ changes: code, base: withB, head: withB, applied: null }).problems.join(), /no successful db-production/);
  assert.match(evaluate({ changes: code, base: withB, head: withB, applied: 'error' }).problems.join(), /missing, not green/);
  // production ahead of the branch is fine
  assert.deepEqual(evaluate({ changes: code, base, head: base, applied: applied([[A, blob('a')], [B, blob('b')]]) }).problems, []);
});

test('[P6] records, tests and tools need no evidence; no migration at all needs none', () => {
  assert.deepEqual(evaluate({ changes: ch('.work/x/result.md', 'tools/x.mjs', 'e2e/a.spec.ts'), base: withB, head: withB, applied: 'error' }).problems, []);
  assert.deepEqual(evaluate({ changes: ch('apps/web/src/x.tsx'), base: new Map(), head: new Map(), applied: 'error' }).problems, []);
});

test('[P6] the history is immutable: a changed or deleted migration from main fails, whatever else the PR does', () => {
  assert.match(evaluate({ changes: [{ status: 'M', path: A }], base, head: tree([[A, blob('f')]]), applied: null }).problems.join(), /immutable/);
  assert.match(evaluate({ changes: [{ status: 'D', path: A }], base, head: new Map(), applied: null }).problems.join(), /deleted/);
});

test('[P6] findApplied takes the newest dispatch on main whose db-production job succeeded, and fails on a bad response', async () => {
  const runs = { workflow_runs: [
    { id: 1, head_sha: blob('1'), head_branch: 'main', event: 'workflow_dispatch', created_at: '2026-10-17T10:00:00Z' },
    { id: 3, head_sha: blob('3'), head_branch: 'main', event: 'workflow_dispatch', created_at: '2026-10-17T12:00:00Z' },
    { id: 2, head_sha: blob('2'), head_branch: 'feat/x', event: 'workflow_dispatch', created_at: '2026-10-17T13:00:00Z' },
  ] };
  const jobs = {
    1: [{ name: 'db-preview', status: 'completed', conclusion: 'success' }, { name: 'db-production', status: 'completed', conclusion: 'success' }],
    3: [{ name: 'db-preview', status: 'completed', conclusion: 'success' }, { name: 'db-production', status: 'completed', conclusion: 'skipped' }],
    2: [{ name: 'db-production', status: 'completed', conclusion: 'success' }],
  };
  const get = async (endpoint) => (endpoint.includes('/workflows/') ? runs : { jobs: jobs[/runs\/(\d+)\/jobs/.exec(endpoint)[1]] });
  assert.equal(await findApplied('afikyermi/Nestly', get), blob('1'), 'skipped production and other branches do not count');
  assert.equal(await findApplied('afikyermi/Nestly', async () => ({ workflow_runs: [] })), null);
  await assert.rejects(findApplied('afikyermi/Nestly', async () => ({ message: 'rate limited' })));
});

// The CI wiring (.github/workflows/ci.yml), read as data with tools/workflow-yaml.mjs and never run.

const root = fileURLToPath(new URL('..', import.meta.url));
const ci = parseYaml(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));

test('[P6] ci.yml: schema-gate runs on pull requests, read-only, and calls the tool', () => {
  const job = ci.jobs?.['schema-gate'];
  assert.ok(job, 'no schema-gate job');
  assert.match(String(job.if), /github\.event_name == 'pull_request'/);
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' });
  assert.ok(!('continue-on-error' in job), 'the gate must be able to fail');
  const steps = stepsOf(job);
  assert.equal(String(steps[0].with?.['fetch-depth']), '2', 'HEAD^1 is the base');
  assert.ok(steps.some((s) => runOf(s).trim() === 'node tools/schema-gate.mjs'));
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
