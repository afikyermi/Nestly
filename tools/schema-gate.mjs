// P6 (18.10.2026): schema before code. A pull request that adds a migration changes no deployed product code; a pull
// request that changes product code merges only when every migration in its tree is applied in production, proven by a
// successful `db-production` job of migrate.yml on a commit whose migrations match by name and content (git blob id).
// `nestly-review/comparison.md` §3 A and P6. Read only: GitHub REST GETs and local git; it never dispatches anything.
//
// Usage (CI `schema-gate`, pull requests): node tools/schema-gate.mjs
//   env GITHUB_REPOSITORY, GITHUB_TOKEN (contents: read, actions: read). The checkout is the merge commit: HEAD^1 = base.
// Exit 0 = pass, 1 = a problem (the gate is red), 2 = usage. Evidence that cannot be read is a problem, never a pass.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MIGRATION = /^supabase\/migrations\/[^/]+\.sql$/;
// What Vercel deploys and the database must already serve: the functions, the server, the web app, the shared package.
export const PRODUCT = /^(?:api\/|apps\/server\/(?:src|api)\/|apps\/web\/(?:src\/|public\/|index\.html$)|packages\/shared\/src\/)/;
export const PRODUCTION_JOB = 'db-production';

/** Migration name → git blob id, from `git ls-tree -r <rev> -- supabase/migrations` output. */
export function parseTree(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (m && MIGRATION.test(m[2])) map.set(m[2], m[1]);
  }
  return map;
}

/** [{ status, path }] from `git diff --name-status --no-renames` output. */
export function parseChanges(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [status, path] = line.split('\t');
    return { status: status.charAt(0), path };
  });
}

/**
 * The verdict. `applied` is { sha, tree } of the newest successful production job, null when there is none, or
 * 'error' when the evidence could not be read.
 */
export function evaluate({ changes, base, head, applied }) {
  const problems = [];
  const notes = [];
  for (const [name, blob] of base) {
    if (!head.has(name)) problems.push(`${name} is deleted: an applied migration stays in the history (add a new one instead)`);
    else if (head.get(name) !== blob) problems.push(`${name} is changed: a migration already on main is immutable (add a new one instead)`);
  }
  const added = [...head.keys()].filter((name) => !base.has(name));
  const product = changes.filter((c) => PRODUCT.test(c.path)).map((c) => c.path);
  let kind = 'other';
  if (added.length > 0) {
    kind = 'schema';
    if (product.length > 0) {
      problems.push(`adds ${added.join(', ')} and changes product code (${product.slice(0, 5).join(', ')}${product.length > 5 ? ', …' : ''}): split it — the schema pull request first, compatible with the code on main; the code after the production apply`);
    } else {
      notes.push(`schema pull request (${added.join(', ')}): the db job runs main's server tests on this schema; after the merge, migrate is dispatched on main before any product code merges`);
    }
  } else if (product.length > 0) {
    kind = 'code';
    if (head.size > 0) {
      if (applied === 'error') problems.push('the production apply evidence could not be read: the gate is missing, not green');
      else if (applied === null) problems.push(`no successful ${PRODUCTION_JOB} job of migrate.yml on main: apply the migrations first`);
      else {
        const missing = [...head].filter(([name, blob]) => applied.tree.get(name) !== blob).map(([name]) => name);
        if (missing.length > 0) {
          problems.push(`not applied in production (as of ${applied.sha.slice(0, 7)}): ${missing.join(', ')}. Dispatch migrate on main, then re-run this job`);
        } else notes.push(`every migration in this tree is applied in production (${PRODUCTION_JOB} on ${applied.sha.slice(0, 7)})`);
      }
    }
  }
  return { kind, problems, notes };
}

/** The newest successful production job: its commit, or null. Throws when the API cannot be read. */
export async function findApplied(repo, get) {
  const runs = await get(`repos/${repo}/actions/workflows/migrate.yml/runs?branch=main&event=workflow_dispatch&status=success&per_page=20`);
  if (!Array.isArray(runs?.workflow_runs)) throw new Error('unexpected runs response');
  const ordered = [...runs.workflow_runs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  for (const run of ordered) {
    if (run.head_branch !== 'main' || run.event !== 'workflow_dispatch') continue;
    const jobs = await get(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
    if (!Array.isArray(jobs?.jobs)) throw new Error('unexpected jobs response');
    if (jobs.jobs.some((j) => j.name === PRODUCTION_JOB && j.status === 'completed' && j.conclusion === 'success')) return run.head_sha;
  }
  return null;
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });

async function main(env) {
  const repo = env.GITHUB_REPOSITORY ?? '';
  if (!/^[\w-]+\/[\w.-]+$/.test(repo)) {
    console.error('schema-gate: GITHUB_REPOSITORY is not owner/repo');
    return 2;
  }
  const changes = parseChanges(git(['diff', '--name-status', '--no-renames', 'HEAD^1', 'HEAD']));
  const base = parseTree(git(['ls-tree', '-r', 'HEAD^1', '--', 'supabase/migrations']));
  const head = parseTree(git(['ls-tree', '-r', 'HEAD', '--', 'supabase/migrations']));
  let applied = null;
  const needsEvidence = changes.some((c) => PRODUCT.test(c.path)) && ![...head.keys()].some((n) => !base.has(n)) && head.size > 0;
  if (needsEvidence) {
    try {
      const get = async (endpoint) => {
        const res = await fetch(`https://api.github.com/${endpoint}`, {
          headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_TOKEN ?? ''}`, 'user-agent': 'nestly-schema-gate' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`GitHub GET ${endpoint.split('?')[0]}: HTTP ${res.status}`);
        return res.json();
      };
      const sha = await findApplied(repo, get);
      if (sha !== null) {
        if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('bad head_sha');
        git(['fetch', '--quiet', '--no-tags', '--depth=1', 'origin', sha]);
        applied = { sha, tree: parseTree(git(['ls-tree', '-r', sha, '--', 'supabase/migrations'])) };
      }
    } catch (error) {
      console.error(`schema-gate: ${error instanceof Error ? error.message : 'evidence error'}`);
      applied = 'error';
    }
  }
  const verdict = evaluate({ changes, base, head, applied });
  console.log(`schema-gate: ${verdict.kind} pull request`);
  for (const n of verdict.notes) console.log(`  ok: ${n}`);
  for (const p of verdict.problems) console.log(`::error::${p}`);
  return verdict.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.env);
}
