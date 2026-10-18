// Deletes remote branches on origin that are safe to delete (Afik 18.10.2026, guard retro item 5). The guard blocks a raw
// `git push --delete`; this tool is the one sanctioned route. A branch is deleted only when it is `ready/<part>` (a
// candidate, P4) or merged into main — its remote tip is an ancestor of origin/main, or GitHub has a pull request merged
// into main whose head is this branch at exactly this tip (squash merges). `main` (and HEAD) never; no force option exists.
// The tip is read from the server and the delete carries a lease on it, so a commit pushed after the check is never lost;
// the full ref name is pushed, so no name can point the delete at another ref (CRITIC PR 69 finding 1).
// Usage: node tools/branch-delete.mjs <branch>... [--dry-run]     Exit 0 = every branch deleted (or would be), 1 = any refused.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const NAME = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*\/$)(?!.*\.lock$)[A-Za-z0-9._/-]{1,200}$/;
const PROTECTED = /^(main|master|head)$/i;
// A name that git would read as a full or partial ref name, not a branch: refused before any lookup.
const REF_LIKE = /^(refs|heads|tags|remotes)\//i;

/** The verdict for one branch. `facts`: { exists, tip, ancestorOfMain, mergedPrHeads: string[] } — read by the caller. */
export function decide(branch, facts) {
  if (!NAME.test(branch) || REF_LIKE.test(branch)) return { ok: false, reason: 'not a plain branch name' };
  if (PROTECTED.test(branch)) return { ok: false, reason: 'main is never deleted' };
  if (!facts.exists || !/^[0-9a-f]{40}$/.test(facts.tip ?? '')) return { ok: false, reason: 'no such branch on origin' };
  if (branch.startsWith('ready/') && branch.length > 'ready/'.length) return { ok: true, reason: 'a ready/ candidate branch' };
  if (facts.ancestorOfMain === true) return { ok: true, reason: 'its tip is in main' };
  if ((facts.mergedPrHeads ?? []).includes(facts.tip)) return { ok: true, reason: 'a pull request merged into main has exactly this tip' };
  return { ok: false, reason: 'not merged into main at its current tip (unmerged commits would be lost)' };
}

/** The push that deletes exactly refs/heads/<branch>, and only while it still points at the approved tip. */
export function deleteArgs(branch, tip) {
  if (!NAME.test(branch) || REF_LIKE.test(branch) || PROTECTED.test(branch) || !/^[0-9a-f]{40}$/.test(tip)) throw new Error('refused');
  const ref = `refs/heads/${branch}`;
  return ['push', 'origin', `--force-with-lease=${ref}:${tip}`, `:${ref}`];
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function ghPath() {
  for (const p of ['gh', 'C:/Program Files/GitHub CLI/gh.exe']) {
    try {
      execFileSync(p, ['--version'], { stdio: 'ignore' });
      return p;
    } catch {
      // next
    }
  }
  return existsSync('/usr/bin/gh') ? '/usr/bin/gh' : null;
}

/** Facts from the server, git and the GitHub REST API (read only). Any failure leaves the fact unproven: the branch is refused. */
function factsOf(branch, repo, gh) {
  const facts = { exists: false, tip: null, ancestorOfMain: false, mergedPrHeads: [] };
  if (!NAME.test(branch) || REF_LIKE.test(branch)) return facts;
  try {
    const line = git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
    const tip = /^([0-9a-f]{40})\trefs\/heads\/(.+)$/.exec(line);
    if (!tip || tip[2] !== branch) return facts;
    facts.tip = tip[1];
    facts.exists = true;
  } catch {
    return facts;
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', facts.tip, 'refs/remotes/origin/main'], { stdio: 'ignore' });
    facts.ancestorOfMain = true;
  } catch {
    facts.ancestorOfMain = false; // not an ancestor, or the commit is not here: unproven
  }
  if (gh && repo) {
    try {
      const [owner] = repo.split('/');
      const query = `repos/${repo}/pulls?state=closed&base=main&per_page=100&head=${encodeURIComponent(`${owner}:${branch}`)}`;
      const template = '{{range .}}{{if and .merged_at (eq .base.ref "main")}}{{.head.sha}}{{"\\n"}}{{end}}{{end}}';
      const out = execFileSync(gh, ['api', '--method', 'GET', query, '--template', template], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      facts.mergedPrHeads = out.split('\n').map((s) => s.trim()).filter((s) => /^[0-9a-f]{40}$/.test(s));
    } catch {
      facts.mergedPrHeads = [];
    }
  }
  return facts;
}

function main(argv) {
  const dry = argv.includes('--dry-run');
  const branches = argv.filter((a) => a !== '--dry-run');
  if (branches.length === 0 || branches.some((b) => b.startsWith('-'))) {
    console.error('usage: node tools/branch-delete.mjs <branch>... [--dry-run]');
    return 2;
  }
  git(['fetch', '--quiet', '--prune', 'origin']);
  const url = git(['remote', 'get-url', 'origin']);
  const repo = /github\.com[/:]([^/]+\/[^/.]+)(\.git)?$/.exec(url)?.[1] ?? null;
  const gh = ghPath();
  let refused = 0;
  for (const branch of branches) {
    const facts = factsOf(branch, repo, gh);
    const verdict = decide(branch, facts);
    if (!verdict.ok) {
      refused += 1;
      console.log(`refused  ${branch}: ${verdict.reason}`);
      continue;
    }
    if (!dry) git(deleteArgs(branch, facts.tip));
    console.log(`${dry ? 'would delete' : 'deleted '} ${branch}: ${verdict.reason}`);
  }
  return refused ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
