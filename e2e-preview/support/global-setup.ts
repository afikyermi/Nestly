// Runs once in the Playwright runner, before any worker is forked and so before any flow module is imported. It takes the
// Vercel bypass secret out of process.env and hands it to the workers through a private temp file (0600) that the matching
// teardown removes. Only the file's path travels in the environment. Workers are forks of the runner and inherit its
// environment, which is why the secret has to leave process.env here and cannot ride in the config.
//
// Seam for tests: after `globalSetup()` returns, process.env.VERCEL_AUTOMATION_BYPASS_SECRET is undefined.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SECRET_ENV = 'VERCEL_AUTOMATION_BYPASS_SECRET';
export const SECRET_FILE_ENV = 'PREVIEW_E2E_BYPASS_FILE';

export default function globalSetup(): () => void {
  const secret = process.env[SECRET_ENV];
  delete process.env[SECRET_ENV];
  if (secret === undefined || secret === '') throw new Error('preview-e2e: the bypass secret is missing from the environment');
  const dir = mkdtempSync(join(tmpdir(), 'preview-e2e-'));
  const file = join(dir, 'bypass');
  writeFileSync(file, secret, { mode: 0o600 });
  process.env[SECRET_FILE_ENV] = file;
  return () => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env[SECRET_FILE_ENV];
  };
}
