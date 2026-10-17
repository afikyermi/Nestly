// P4 (18.10.2026): which branch pushes create a Vercel deployment at all, from `git.deploymentEnabled` in vercel.json.
// A cancelled deployment (ignoreCommand) still counts toward Vercel's 100-a-day limit; a branch the policy disables
// creates none. The policy: `main` and candidate branches `ready/<part>` deploy; every other branch (work, records, cloud
// session branches such as ccr-*) does not. A candidate is a new branch pushed from the finished part, so no force push.
//
// `deploys` mirrors Vercel's documented rules (docs/project-configuration/git-configuration): a boolean applies to every
// branch; in an object, a branch no rule matches deploys, and a branch some rule matches deploys when at least one
// matching rule is true. Rules are minimatch globs; this file supports only the subset vercel.json may use — literal
// segments, `*` within a segment and a whole `**` segment — and `unsupported` names any other pattern so a test fails.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CANDIDATE_PREFIX = 'ready/';

/** The policy vercel.json must carry as git.deploymentEnabled (Afik adds it by hand: P4 PR, "Afik's step"). */
export const POLICY = Object.freeze({ '**': false, main: true, 'ready/**': true });

/** A pattern this file can evaluate exactly as minimatch does for git branch names. */
export function unsupported(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return true;
  if (/[?[\]{}()!+@\\]/.test(pattern) || pattern.startsWith('#')) return true; // minimatch: a leading # is a comment
  return pattern.split('/').some((seg) => seg === '' || (seg.includes('**') && seg !== '**'));
}

function segmentMatches(pattern, segment) {
  const re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.^$|]/g, '\\$&')).join('[^/]*')}$`);
  return re.test(segment);
}

function segmentsMatch(pat, parts) {
  if (pat.length === 0) return parts.length === 0;
  if (pat[0] === '**') {
    // minimatch: a trailing `**` needs at least one segment (`ready/**` does not match `ready`); inside, zero is fine.
    for (let i = pat.length === 1 ? 1 : 0; i <= parts.length; i++) if (segmentsMatch(pat.slice(1), parts.slice(i))) return true;
    return false;
  }
  return parts.length > 0 && segmentMatches(pat[0], parts[0]) && segmentsMatch(pat.slice(1), parts.slice(1));
}

/** minimatch(branch, pattern) for the supported subset. */
export function matches(pattern, branch) {
  if (unsupported(pattern)) throw new Error(`unsupported branch pattern: ${String(pattern)}`);
  const parts = branch.split('/');
  return segmentsMatch(pattern.split('/'), parts);
}

/** Whether Vercel creates a deployment for a push to `branch` under `policy` (git.deploymentEnabled). */
export function deploys(policy, branch) {
  if (policy === undefined) return true;
  if (typeof policy === 'boolean') return policy;
  const hits = Object.entries(policy).filter(([pattern]) => matches(pattern, branch));
  if (hits.length === 0) return true;
  return hits.some(([, enabled]) => enabled === true);
}

/** The git.deploymentEnabled value of the repository's vercel.json. */
export function readPolicy(root) {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  return config?.git?.deploymentEnabled;
}
