// Tests for tools/db-local.mjs (Afik 18.10.2026, items 6ד and 9): the local database is CI's — the same image and CLI pin
// read from ci.yml, the same files in CI's order — and the tool reaches 127.0.0.1 only. No Docker here; the full run is the
// manual proof (`node tools/db-local.mjs test`). Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciPins, localUrl, setupPlan } from './db-local.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

test('[9] the image and the CLI are the ones ci.yml pins, read from it, never a default', () => {
  const pins = ciPins(ci);
  assert.match(pins.image, /^supabase\/postgres:\d+\.\d+\.\d+\.\d+$/);
  assert.ok(ci.includes(`SUPABASE_POSTGRES_IMAGE: ${pins.image}`));
  assert.ok(ci.includes(`SUPABASE_CLI_VERSION: ${pins.cli}`));
  assert.throws(() => ciPins('jobs: {}'), /no SUPABASE_POSTGRES_IMAGE/);
  assert.throws(() => ciPins('SUPABASE_POSTGRES_IMAGE: evil/image:1'), /no SUPABASE_POSTGRES_IMAGE/);
});

test('[6ד] the database URL is always 127.0.0.1:54322; nothing else can be built', () => {
  const pw = 'a'.repeat(64);
  assert.equal(localUrl('app_server', pw), `postgresql://app_server:${pw}@127.0.0.1:54322/postgres`);
  for (const [user, password] of [['app_server@evil.com:5432/x#', pw], ['app_server', 'short'], ['app_server', `${pw}@prod`]]) {
    assert.throws(() => localUrl(user, password), /bad local credentials/);
  }
});

test('[9] the SQL runs in CI order: auth functions, checks and roles, then after the migrations step 2, pgTAP setup, the RLS gate and every fixture', () => {
  const plan = setupPlan(root);
  assert.deepEqual(plan.asAdmin, ['supabase/ci/auth-functions.sql']);
  assert.deepEqual(plan.beforeRoles, ['supabase/ci/auth-functions-check.sql', 'supabase/ci/image-preflight.sql', 'supabase/bootstrap/01-roles.sql']);
  assert.deepEqual(plan.afterMigrations.slice(0, 3), ['supabase/bootstrap/02-anchor-fk.sql', 'supabase/ci/pgtap-setup.sql', 'supabase/ci/rls-gate.sql']);
  const fixtures = plan.afterMigrations.slice(3);
  assert.ok(fixtures.length > 0 && fixtures.every((f) => f.startsWith('supabase/tests/setup/')));
  assert.deepEqual(fixtures, [...fixtures].sort(), 'in name order, as the CI loop');
  for (const f of ['auth-functions.sql', 'image-preflight.sql', 'pgtap-setup.sql', 'rls-gate.sql']) assert.ok(ci.includes(`supabase/ci/${f}`), `ci.yml runs ${f}`);
});

test('[6ד] the tool never reads an env file and never names a remote project', () => {
  const src = readFileSync(join(root, 'tools/db-local.mjs'), 'utf8');
  assert.doesNotMatch(src, /['"`][^'"`\n]*\.env(\.[\w-]+)?['"`]/, 'no string naming an env file');
  assert.doesNotMatch(src, /dotenv|supabase\.co|pooler\.supabase|process\.env\.(DATABASE_URL|OWNER_DATABASE_URL|APP_OWNER)/);
  assert.match(src, /const HOST = '127\.0\.0\.1';/);
});
