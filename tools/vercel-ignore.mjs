// Vercel ignoreCommand: exit 1 = BUILD, exit 0 = SKIP.
// Builds `main` and branches with an open pull request (decisions.md, 2026-10-12).
import { pathToFileURL } from 'node:url';

export function decide(env) {
  const ref = env.VERCEL_GIT_COMMIT_REF ?? '';
  const pr = env.VERCEL_GIT_PULL_REQUEST_ID ?? '';
  if (ref === 'main') return { build: true, reason: 'branch is main' };
  if (pr !== '') return { build: true, reason: `branch "${ref}" has open PR #${pr}` };
  return { build: false, reason: `branch "${ref}" has no open PR` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { build, reason } = decide(process.env);
  console.log(`vercel-ignore: ${build ? 'building' : 'skipping'} - ${reason}`);
  process.exit(build ? 1 : 0);
}
