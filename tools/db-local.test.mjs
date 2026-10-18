// Tests for tools/db-local.mjs (Afik 18.10.2026, items 6ד and 9): the local database is CI's — the same image and CLI pin
// read from ci.yml, the same files in CI's order — and the tool reaches 127.0.0.1 only. No Docker here; the full run is the
// manual proof (`node tools/db-local.mjs test`). Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIPPED_CI, ciPins, dockerRunArgs, localUrl, setupPlan } from './db-local.mjs';

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

/** The SQL files the db job of ci.yml runs, in first-run order: every `-f <file>`, `step=`/`check=` file and the fixture loop. */
function ciDbOrder(yml) {
  const job = /\n {2}db:\n([\s\S]*?)(?=\n {2}[\w-]+:\n|$)/.exec(yml)?.[1];
  assert.ok(job, 'ci.yml has a db job');
  const order = [];
  for (const m of job.matchAll(/(?:-f\s+|\b(?:step|check)=)"?(supabase\/[\w./-]+\.sql)|for f in (supabase\/tests\/setup)\/\*\.sql/g)) {
    const file = m[1] ?? `${m[2]}/*`;
    if (!order.includes(file)) order.push(file);
  }
  return order;
}

test('[9] the setup SQL is the db job of ci.yml, in its order; only the listed gates are skipped (CRITIC PR 70 finding 1)', () => {
  const plan = setupPlan(root);
  const fixtures = plan.afterMigrations.filter((f) => f.startsWith('supabase/tests/setup/'));
  assert.ok(fixtures.length > 0);
  assert.deepEqual(fixtures, [...fixtures].sort(), 'in name order, as the CI loop');
  const local = [...plan.asAdmin, ...plan.beforeRoles, ...plan.afterMigrations.filter((f) => !fixtures.includes(f)), 'supabase/tests/setup/*'];
  const ciOrder = ciDbOrder(ci);
  // Every CI file is either run here, in the same order, or an explicitly listed skip; nothing else.
  assert.deepEqual(ciOrder.filter((f) => !(f in SKIPPED_CI)), local);
  assert.deepEqual(Object.keys(SKIPPED_CI).sort(), ciOrder.filter((f) => !local.includes(f)).sort());
  assert.ok(plan.afterMigrations.includes(plan.anchorCheck), 'the anchor check runs (its ok is asserted)');
  // The parser itself: a step CI adds, or a reorder, changes what it reads.
  const added = ci.replace('-f supabase/ci/rls-gate.sql', '-f supabase/ci/rls-gate.sql\n          psql -f supabase/ci/new-step.sql');
  assert.notDeepEqual(ciDbOrder(added).filter((f) => !(f in SKIPPED_CI)), local);
});

test('[6ד] the container is published on 127.0.0.1 only, and the tool names no env file or remote project', () => {
  const args = dockerRunArgs('supabase/postgres:1.2.3.4', 'p', 'j');
  assert.equal(args[args.indexOf('--publish') + 1], '127.0.0.1:54322:5432');
  assert.equal(args.at(-1), 'supabase/postgres:1.2.3.4');
  const src = readFileSync(join(root, 'tools/db-local.mjs'), 'utf8');
  assert.doesNotMatch(src, /['"`][^'"`\n]*\.env(\.[\w-]+)?['"`]/, 'no string naming an env file');
  assert.doesNotMatch(src, /dotenv|supabase\.co|pooler\.supabase|process\.env\.(DATABASE_URL|OWNER_DATABASE_URL|APP_OWNER)/);
});
