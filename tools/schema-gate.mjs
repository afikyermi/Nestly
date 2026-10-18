// P6 (18.10.2026): schema before code. A pull request that adds a migration changes no deployed product code; a pull
// request that changes product code merges only when every migration in its tree is applied in production, proven by a
// successful `db-production` job of migrate.yml on a commit whose migrations match by name and content (git blob id).
// `nestly-review/comparison.md` §3 A and P6. Read only: GitHub REST GETs and local git; it never dispatches anything.
//
// Usage (CI `schema-gate`, pull requests): node <copy of the BASE commit's tools/schema-gate.mjs>
//   env GITHUB_REPOSITORY, GITHUB_TOKEN (contents: read, actions: read). The checkout is the merge commit: HEAD^1 = base.
//   CI runs the base's copy so a pull request never judges itself (CRITIC P6 finding 2): keep this file free of local
//   imports. Exit 0 = pass, 1 = a problem (the gate is red), 2 = usage. Unreadable evidence is a problem, never a pass.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MIGRATION = /^supabase\/migrations\/[^/]+\.sql$/;
// What Vercel deploys and the database must already serve: the functions, the server, the web app, the shared package.
export const PRODUCT = /^(?:api\/|apps\/server\/(?:src|api)\/|apps\/web\/(?:src\/|public\/|index\.html$)|packages\/shared\/src\/)/;
export const PRODUCTION_JOB = 'db-production';
// The gate itself: changed together with product code, a pull request could relax the rule it is judged by.
export const GATE_FILES = ['tools/schema-gate.mjs', '.github/workflows/ci.yml'];

/**
 * Every path under supabase/migrations → git blob id, from `git ls-tree -r -z <rev> -- supabase/migrations` (NUL-separated,
 * never quoted, so a non-ASCII name stays visible: CRITIC P6 finding 1). A record that cannot be read throws.
 */
export function parseTree(text) {
  const map = new Map();
  for (const record of text.split('\0').filter(Boolean)) {
    const m = /^\d+ (?:blob|commit|tree) ([0-9a-f]{40})\t([\s\S]+)$/.exec(record);
    if (!m) throw new Error(`unreadable ls-tree record: ${JSON.stringify(record.slice(0, 80))}`);
    map.set(m[2], m[1]);
  }
  return map;
}

/** [{ status, path }] from `git diff -z --name-status --no-renames` (NUL-separated status and path pairs). */
export function parseChanges(text) {
  const parts = text.split('\0');
  if (parts.at(-1) === '') parts.pop();
  if (parts.length % 2 !== 0) throw new Error('unreadable diff output');
  const changes = [];
  for (let i = 0; i < parts.length; i += 2) changes.push({ status: parts[i].charAt(0), path: parts[i + 1] });
  return changes;
}

/** What the pull request adds to the migration history, and which deployed product files it changes. */
export function classify({ changes, base, head }) {
  return {
    added: [...head.keys()].filter((name) => !base.has(name)),
    product: changes.filter((c) => PRODUCT.test(c.path)).map((c) => c.path),
  };
}

/**
 * The verdict. `applied` is { sha, tree } of the newest successful production job, null when there is none, or
 * 'error' when the evidence could not be read.
 */
export function evaluate({ changes, base, head, applied }) {
  const problems = [];
  const notes = [];
  for (const name of head.keys()) {
    if (!MIGRATION.test(name)) problems.push(`${name} is not a migration file (supabase/migrations/<name>.sql): the gate cannot judge it`);
  }
  for (const [name, blob] of base) {
    if (!head.has(name)) problems.push(`${name} is deleted: an applied migration stays in the history (add a new one instead)`);
    else if (head.get(name) !== blob) problems.push(`${name} is changed: a migration already on main is immutable (add a new one instead)`);
  }
  const { added, product } = classify({ changes, base, head });
  const gate = changes.filter((c) => GATE_FILES.includes(c.path)).map((c) => c.path);
  if (product.length > 0 && gate.length > 0) {
    problems.push(`changes product code and the gate (${gate.join(', ')}) together: split it — the gate change first, judged by the old gate`);
  }
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

const gitCli = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });

function githubGet(token) {
  return async (endpoint) => {
    const res = await fetch(`https://api.github.com/${endpoint}`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'nestly-schema-gate' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GitHub GET ${endpoint.split('?')[0]}: HTTP ${res.status}`);
    return res.json();
  };
}

/** The gate run; git, GitHub and the log are injected for tests. Returns the exit code. */
export async function main(env, { git = gitCli, get = githubGet(env.GITHUB_TOKEN ?? ''), log = console.log, warn = console.error } = {}) {
  const repo = env.GITHUB_REPOSITORY ?? '';
  if (!/^[\w-]+\/[\w.-]+$/.test(repo)) {
    warn('schema-gate: GITHUB_REPOSITORY is not owner/repo');
    return 2;
  }
  let changes;
  let base;
  let head;
  try {
    changes = parseChanges(git(['diff', '-z', '--name-status', '--no-renames', 'HEAD^1', 'HEAD']));
    base = parseTree(git(['ls-tree', '-r', '-z', 'HEAD^1', '--', 'supabase/migrations']));
    head = parseTree(git(['ls-tree', '-r', '-z', 'HEAD', '--', 'supabase/migrations']));
  } catch (error) {
    log(`::error::the pull request's files could not be read: ${error instanceof Error ? error.message : 'git error'}`);
    return 1;
  }
  const { added, product } = classify({ changes, base, head });
  let applied = null;
  if (product.length > 0 && added.length === 0 && head.size > 0) {
    try {
      const sha = await findApplied(repo, get);
      if (sha !== null) {
        if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('bad head_sha');
        git(['fetch', '--quiet', '--no-tags', '--depth=1', 'origin', sha]);
        applied = { sha, tree: parseTree(git(['ls-tree', '-r', '-z', sha, '--', 'supabase/migrations'])) };
      }
    } catch (error) {
      warn(`schema-gate: ${error instanceof Error ? error.message : 'evidence error'}`);
      applied = 'error';
    }
  }
  const verdict = evaluate({ changes, base, head, applied });
  log(`schema-gate: ${verdict.kind} pull request`);
  for (const n of verdict.notes) log(`  ok: ${n}`);
  for (const p of verdict.problems) log(`::error::${p}`);
  return verdict.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.env);
}
