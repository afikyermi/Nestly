// URL guard CLI for the `preview-e2e` workflow (spec criterion 3, URL part).
//
//   node tools/preview-e2e-url-guard.ts
//
// Reads TARGET_URL (the deployment_status target_url) from the environment and refuses it unless
// tools/preview-e2e-url-check.ts accepts it. It never prints the URL, not on success and not in a reason, and makes no
// network call. Exit 0 when acceptable (and writes base_url=<origin> to GITHUB_OUTPUT when that is set), 1 otherwise.

import { appendFileSync } from 'node:fs';
import { checkDeploymentUrl } from './preview-e2e-url-check.ts';

const result = checkDeploymentUrl(process.env['TARGET_URL']);
if (!result.ok) {
  process.stdout.write(`::error::preview-e2e-url-guard: ${result.reason}; nothing was sent\n`);
  process.exit(1);
}
const output = process.env['GITHUB_OUTPUT'];
if (output !== undefined && output !== '') appendFileSync(output, `base_url=${result.base}\n`);
process.stdout.write('preview-e2e-url-guard: OK - a deployment URL of the nestly project\n');
