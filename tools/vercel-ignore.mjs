// Vercel ignoreCommand: exit 1 = BUILD, exit 0 = SKIP.
// Builds `main` and branches with an open pull request (decisions.md, 2026-10-12). Vercel only sets
// VERCEL_GIT_PULL_REQUEST_ID when the PR existed at push time, so a branch pushed before its PR is also looked up on
// GitHub (public API, read-only, no token; decisions.md, 2026-10-14 "Speed-up"). If the lookup fails: build.
import { pathToFileURL } from 'node:url';
import { CANDIDATE_PREFIX } from './vercel-branch-policy.mjs';

const TIMEOUT_MS = 5000;

// prs: undefined = not looked up (or nothing to look up with), a number = open PRs from this branch, null = lookup failed.
export function decide(env, prs) {
  const ref = env.VERCEL_GIT_COMMIT_REF ?? '';
  const pr = env.VERCEL_GIT_PULL_REQUEST_ID ?? '';
  if (ref === 'main') return { build: true, reason: 'branch is main' };
  // P4: vercel.json lets only main and ready/** deploy; a candidate is pushed before its PR exists, so it always builds.
  if (ref.startsWith(CANDIDATE_PREFIX)) return { build: true, reason: `branch "${ref}" is a candidate (${CANDIDATE_PREFIX})` };
  if (pr !== '') return { build: true, reason: `branch "${ref}" has open PR #${pr}` };
  if (prs === null) return { build: true, reason: `branch "${ref}": the GitHub lookup failed, building to be safe` };
  if (typeof prs === 'number' && prs > 0) return { build: true, reason: `branch "${ref}" has an open PR on GitHub` };
  return { build: false, reason: `branch "${ref}" has no open PR` };
}

// Open PRs whose head is this branch. Returns a count, or null when the answer could not be had.
export async function lookupOpenPrs(env, fetchFn = fetch) {
  const owner = env.VERCEL_GIT_REPO_OWNER ?? '';
  const repo = env.VERCEL_GIT_REPO_SLUG ?? '';
  const ref = env.VERCEL_GIT_COMMIT_REF ?? '';
  if (owner === '' || repo === '' || ref === '') return undefined;
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls` +
    `?state=open&head=${encodeURIComponent(`${owner}:${ref}`)}`;
  try {
    const res = await fetchFn(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'nestly-vercel-ignore' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body) ? body.length : null;
  } catch {
    // Network error, timeout or unreadable body: the caller builds (fail open) and says so in its log line.
    return null;
  }
}

export async function main(env, lookup = lookupOpenPrs) {
  // The lookup only matters when the cheap checks have not already decided.
  const early = decide(env, undefined);
  const prs = early.build ? undefined : await lookup(env);
  return decide(env, prs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { build, reason } = await main(process.env);
  console.log(`vercel-ignore: ${build ? 'building' : 'skipping'} - ${reason}`);
  process.exitCode = build ? 1 : 0;
}
