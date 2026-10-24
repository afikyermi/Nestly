// Repository tests for the migrate hardening (14.10 review of identity-platform a: findings 1-4 and low 7).
//   pinned actions   every `uses:` of every workflow is a full commit SHA with a version comment
//   pinned CLI       the Supabase CLI comes from a committed lockfile with integrity hashes
//   TLS and logs     every step that holds the URL sets PGSSLMODE=require; the guard masks; db push is filtered
//   the gate         the RLS gate refuses materialized views and foreign tables, and a fire test proves it
// Workflows are read as data and never run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterLine } from './filter-db-push-log.mjs';
import { PROJECT_REFS, checkMigrationUrl, maskValues } from './migrate-url-guard.mjs';
import { codeOf, nameOf, parseYaml, runOf, stepsOf } from './workflow-yaml.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const workflowFiles = readdirSync(join(root, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f));
// Built from parts: a literal URL with a password trips the secret scanners (these are placeholders).
const SCHEME = 'postgres' + 'ql://';
const AT = String.fromCharCode(64);
const migrate = parseYaml(read('.github/workflows/migrate.yml'));

test('every `uses:` in every workflow is pinned to a full 40-hex commit SHA with a version comment', () => {
  assert.ok(workflowFiles.length >= 7);
  let count = 0;
  for (const file of workflowFiles) {
    for (const line of read(`.github/workflows/${file}`).split('\n')) {
      if (!/^\s*-?\s*uses:/.test(line)) continue;
      count += 1;
      assert.match(line, /uses:\s+[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/, `${file}: not SHA-pinned: ${line.trim()}`);
    }
  }
  assert.ok(count >= 40, 'the scan found suspiciously few uses: lines');
});

test('the Supabase CLI is installed from the committed lockfile, never by a movable npm install', () => {
  const pkg = JSON.parse(read('tools/supabase-cli/package.json'));
  const lock = JSON.parse(read('tools/supabase-cli/package-lock.json'));
  const version = pkg.dependencies.supabase;
  assert.match(version, /^\d+\.\d+\.\d+$/, 'the CLI version must be exact');
  assert.equal(lock.packages['node_modules/supabase'].version, version);
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue;
    assert.match(entry.integrity ?? '', /^sha512-/, `${path} has no sha512 integrity`);
    assert.match(entry.resolved ?? '', /^https:\/\/registry\.npmjs\.org\//, `${path} is not from the npm registry`);
  }
  for (const platform of ['linux-x64', 'linux-arm64']) assert.ok(lock.packages[`node_modules/@supabase/cli-${platform}`], `no ${platform} binary package in the lock`);
  assert.match(read('tools/install-supabase-cli.sh'), /npm ci --ignore-scripts/);
  for (const file of ['ci.yml', 'migrate.yml']) {
    const text = read(`.github/workflows/${file}`);
    assert.doesNotMatch(text, /npm install[^\n]*supabase@/, `${file} installs the CLI by a movable npm install`);
    assert.match(text, /bash tools\/install-supabase-cli\.sh/, `${file} does not use the pinned installer`);
    assert.match(text, new RegExp(`SUPABASE_CLI_VERSION:\\s*${version.replaceAll('.', '\\.')}\\b`), `${file}: SUPABASE_CLI_VERSION differs from tools/supabase-cli/package.json`);
  }
});

test('migrate: every step that holds the URL sets PGSSLMODE=require, and the guard masks the password', () => {
  for (const [id, job] of Object.entries(migrate.jobs)) {
    const holders = stepsOf(job).filter((s) => /APP_OWNER_DATABASE_URL/.test(JSON.stringify(s)));
    assert.ok(holders.length >= 3, `${id}: expected the guard, the hash check and the push to hold the URL`);
    for (const step of holders) assert.equal(step.env?.PGSSLMODE, 'require', `${id}: "${nameOf(step)}" lacks PGSSLMODE=require`);
    const guard = holders.find((s) => /migrate-url-guard\.mjs/.test(runOf(s)));
    assert.match(runOf(guard), /migrate-url-guard\.mjs\s+db-\w+\s+--mask\b/, `${id}: the guard does not mask`);
  }
});

test('migrate: supabase db push output only reaches the log through the allowlist filter, with pipefail', () => {
  for (const [id, job] of Object.entries(migrate.jobs)) {
    const pushes = stepsOf(job).filter((s) => /supabase\s+db\s+push/.test(runOf(s)));
    assert.equal(pushes.length, 1, `${id}: expected one push step`);
    const run = codeOf(runOf(pushes[0]));
    assert.match(run, /set -euo pipefail/, `${id}: no pipefail`);
    assert.match(run, /supabase\s+db\s+push[^\n|]*2>&1\s*\|\s*node tools\/filter-db-push-log\.mjs/, `${id}: the push is not piped through the filter`);
    assert.doesNotMatch(run, /\|\|\s*(true|:)/);
  }
});

test('db-check requires TLS and discards psql error output', () => {
  const dbCheck = read('.github/workflows/db-check.yml');
  assert.match(dbCheck, /PGSSLMODE:\s*require/);
  assert.match(dbCheck, /2>\/dev\/null/);
});

test('the push filter withholds everything but allowlisted lines and redacts URL-shaped text', () => {
  assert.equal(filterLine('Applying migration 20261014_a.sql...'), 'Applying migration 20261014_a.sql...');
  assert.equal(filterLine('Remote database is up to date.'), 'Remote database is up to date.');
  assert.equal(filterLine('ERROR: relation "x" already exists (SQLSTATE 42P07)'), 'ERROR: relation "x" already exists (SQLSTATE 42P07)');
  assert.equal(filterLine('At statement: 3'), 'At statement: 3');
  for (const leak of [
    'failed to connect to `host=aws-0.pooler.supabase.com user=app_owner.abc database=postgres`: password authentication failed',
    `dial error: ${SCHEME}app_owner.abc:s3cret${AT}aws-0.pooler.supabase.com:5432/postgres`,
    'unexpected line mentioning s3cret',
  ]) assert.equal(filterLine(leak), null, leak);
  const redacted = filterLine(`ERROR: could not reach ${SCHEME}u:s3cret${AT}h:5432/db or u${AT}h password=s3cret (SQLSTATE 08006)`);
  assert.doesNotMatch(redacted, /s3cret|@|postgresql:/);
  assert.match(redacted, /SQLSTATE 08006/);
});

test('the guard fails closed on TLS and masks the password in every form', () => {
  const base = `${SCHEME}app_owner.${PROJECT_REFS['db-production']}:p%40ss%2Fw${AT}aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  assert.equal(checkMigrationUrl(base, 'db-production', { pgsslmode: 'require' }).ok, true);
  assert.equal(checkMigrationUrl(base, 'db-production', { pgsslmode: '' }).ok, false);
  assert.equal(checkMigrationUrl(base, 'db-production', { pgsslmode: 'prefer' }).ok, false);
  assert.equal(checkMigrationUrl(`${base}?sslmode=require`, 'db-production', { pgsslmode: '' }).ok, true);
  assert.equal(checkMigrationUrl(base, 'db-production').ok, true, 'without the option the check is as before');
  const masks = maskValues(base);
  for (const form of [base, 'p%40ss%2Fw', 'p@ss/w']) assert.ok(masks.includes(form), `no mask for ${form}`);
});

test('the RLS gate refuses materialized views and foreign tables in the product schema, and a fire test proves both', () => {
  const gate = read('supabase/ci/rls-gate.sql');
  assert.match(gate, /select 'matview_or_foreign_table', r\.label from rels r where r\.kind in \('m', 'f'\)/);
  assert.match(gate, /where c\.relkind in \('r', 'p', 'v', 'm', 'S', 'f'\)/, 'the gate no longer looks at relkind m and f');
  const fire = read('supabase/ci/rls-gate-fire.sql');
  assert.match(fire, /create materialized view nestly\.zz_fire_mv/);
  assert.match(fire, /create foreign table nestly\.zz_fire_ft/);
  assert.match(fire, /'matview_or_foreign_table', 'nestly\.zz_fire_mv'/);
  assert.match(fire, /'matview_or_foreign_table', 'nestly\.zz_fire_ft'/);
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /rls-gate-fire\.sql/);
  assert.match(ci, /rls_gate_product/);
});
