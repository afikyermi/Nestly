// Preview E2E, on failure only: copies each test-results/**/error-context.md to $RUNNER_TEMP/preview-e2e-failures, redacted
// (tools/preview-e2e-failure-context.ts). Runs from the trusted main checkout before the staff file is removed. Prints a count only.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { redactFailureContext, staffSecrets } from './preview-e2e-failure-context.ts';

function contextFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'error-context.md')
    .map((entry) => join(entry.parentPath, entry.name));
}

const runnerTemp = process.env['RUNNER_TEMP'];
if (runnerTemp === undefined) {
  process.stderr.write('failure context: RUNNER_TEMP missing\n');
  process.exit(1);
}
const staffFile = process.env['PREVIEW_E2E_STAFF_FILE'];
const secrets = staffSecrets(staffFile !== undefined && existsSync(staffFile) ? readFileSync(staffFile, 'utf8') : null);
const out = join(runnerTemp, 'preview-e2e-failures');
mkdirSync(out, { recursive: true });
const files = contextFiles('test-results');
for (const file of files) {
  const name = createHash('md5').update(file).digest('hex').slice(0, 12);
  writeFileSync(join(out, `${name}.md`), `# ${redactFailureContext(file, secrets)}\n${redactFailureContext(readFileSync(file, 'utf8'), secrets)}`);
}
process.stdout.write(`failure context: ${files.length} file(s) collected\n`);
