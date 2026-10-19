// Tests for tools/db-local.mjs (Afik 18.10.2026, items 6ד and 9; Afik 19.10.2026 "Merge and local-test throughput" item 3):
// the local database is CI's — the same image and CLI pin read from ci.yml, the same files in CI's order — and the tool
// reaches 127.0.0.1 only, one container and port per checkout, with a `pgtap` command that fails like pg_prove.
// No Docker here; the full run is the manual proof (`node tools/db-local.mjs test`). Add this file to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIPPED_CI, checkoutInstance, ciPins, dockerRunArgs, localUrl, parseArgs, pgtapFiles, setupPlan, tapVerdict } from './db-local.mjs';

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

test('[6ד · 19.10 item 3] the database URL is always 127.0.0.1 with a port in 54400-54899; nothing else can be built', () => {
  const pw = 'a'.repeat(64);
  assert.equal(localUrl('app_server', pw, 54400), `postgresql://app_server:${pw}@127.0.0.1:54400/postgres`);
  assert.equal(localUrl('app_server', pw, 54899), `postgresql://app_server:${pw}@127.0.0.1:54899/postgres`);
  for (const [user, password] of [['app_server@evil.com:5432/x#', pw], ['app_server', 'short'], ['app_server', `${pw}@prod`]]) {
    assert.throws(() => localUrl(user, password, 54400), /bad local credentials/);
  }
  for (const port of [54399, 54900, 54322, 5432, 0, -1, 54400.5, NaN, '54400', undefined, null]) {
    assert.throws(() => localUrl('app_server', pw, port), /bad local port/, `port ${String(port)} was accepted`);
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

test('[6ד · 19.10 item 3] the container is named per checkout, published on 127.0.0.1 only, and the tool names no env file or remote project', () => {
  const args = dockerRunArgs('supabase/postgres:1.2.3.4', 'p', 'j', 'nestly-local-db-0123abcd', 54411);
  assert.equal(args[args.indexOf('--publish') + 1], '127.0.0.1:54411:5432');
  assert.equal(args[args.indexOf('--name') + 1], 'nestly-local-db-0123abcd');
  assert.ok(!args.some((a) => a.includes('54322')), 'the old fixed port is gone');
  assert.equal(args.at(-1), 'supabase/postgres:1.2.3.4');
  const src = readFileSync(join(root, 'tools/db-local.mjs'), 'utf8');
  assert.doesNotMatch(src, /['"`][^'"`\n]*\.env(\.[\w-]+)?['"`]/, 'no string naming an env file');
  assert.doesNotMatch(src, /dotenv|supabase\.co|pooler\.supabase|process\.env\.(DATABASE_URL|OWNER_DATABASE_URL|APP_OWNER)/);
});

// ---- 19.10 item 3: one container and port per checkout ---------------------------------------------------------------------

test('[19.10 item 3] the instance is a pure function of the checkout root: name nestly-local-db-<8 hex>, port 54400-54899, stable', () => {
  const a = checkoutInstance(root);
  assert.match(a.name, /^nestly-local-db-[0-9a-f]{8}$/);
  assert.ok(Number.isInteger(a.port) && a.port >= 54400 && a.port <= 54899, `port ${a.port} out of range`);
  assert.deepEqual(checkoutInstance(root), a);
  assert.deepEqual(checkoutInstance(root.replace(/[\\/]+$/, '') + '/'), a, 'a trailing slash is the same checkout');
});

test('[19.10 item 3] two checkouts get different containers, and every root lands in the port range', () => {
  const roots = Array.from({ length: 200 }, (_, i) => join(tmpdir(), `checkout-${i}`));
  const names = new Set(roots.map((r) => checkoutInstance(r).name));
  assert.equal(names.size, roots.length, 'container names collided');
  for (const r of roots) {
    const { port, name } = checkoutInstance(r);
    assert.ok(port >= 54400 && port <= 54899, r);
    assert.match(name, /^nestly-local-db-[0-9a-f]{8}$/);
  }
  assert.ok(new Set(roots.map((r) => checkoutInstance(r).port)).size > 100, 'ports are not spread over the range');
  assert.notEqual(checkoutInstance(join(tmpdir(), 'nestly-a')).name, checkoutInstance(join(tmpdir(), 'nestly-b')).name);
});

test('[19.10 item 3] the command line: test, pgtap [--keep] [files], down; anything else is usage', () => {
  assert.deepEqual(parseArgs(['test']), { cmd: 'test', keep: false, files: [] });
  assert.deepEqual(parseArgs(['test', '--keep']), { cmd: 'test', keep: true, files: [] });
  assert.deepEqual(parseArgs(['pgtap']), { cmd: 'pgtap', keep: false, files: [] });
  assert.deepEqual(parseArgs(['pgtap', '--keep']), { cmd: 'pgtap', keep: true, files: [] });
  assert.deepEqual(parseArgs(['pgtap', 'supabase/tests/a.sql', 'supabase/tests/b.sql']), { cmd: 'pgtap', keep: false, files: ['supabase/tests/a.sql', 'supabase/tests/b.sql'] });
  assert.deepEqual(parseArgs(['pgtap', '--keep', 'supabase/tests/a.sql']), { cmd: 'pgtap', keep: true, files: ['supabase/tests/a.sql'] });
  assert.deepEqual(parseArgs(['pgtap', 'supabase/tests/a.sql', '--keep']), { cmd: 'pgtap', keep: true, files: ['supabase/tests/a.sql'] });
  assert.deepEqual(parseArgs(['down']), { cmd: 'down', keep: false, files: [] });
  for (const bad of [[], ['nope'], ['down', '--keep'], ['down', 'x'], ['test', 'x.sql'], ['pgtap', '--other'], ['pgtap', '-f', 'a.sql'], ['--keep']]) {
    assert.equal(parseArgs(bad), null, JSON.stringify(bad));
  }
});

test('[19.10 item 3] pgtap runs every supabase/tests .sql except setup/, sorted; named files must be such files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pgtap-files-'));
  mkdirSync(join(dir, 'supabase/tests/setup'), { recursive: true });
  mkdirSync(join(dir, 'supabase/tests/sub'), { recursive: true });
  for (const f of ['b.sql', 'a.sql', 'c.txt', 'setup/01-fixture.sql', 'sub/z.sql']) writeFileSync(join(dir, 'supabase/tests', f), 'select 1;');
  writeFileSync(join(dir, 'supabase/other.sql'), 'select 1;');
  assert.deepEqual(pgtapFiles(dir, []), ['supabase/tests/a.sql', 'supabase/tests/b.sql', 'supabase/tests/sub/z.sql']);
  assert.deepEqual(pgtapFiles(dir, ['supabase/tests/b.sql', 'supabase/tests/a.sql']), ['supabase/tests/b.sql', 'supabase/tests/a.sql']);
  for (const bad of ['supabase/tests/setup/01-fixture.sql', 'supabase/tests/missing.sql', 'supabase/tests/c.txt', 'supabase/other.sql', '../outside.sql']) {
    assert.throws(() => pgtapFiles(dir, [bad]), Error, bad);
  }
  const empty = mkdtempSync(join(tmpdir(), 'pgtap-empty-'));
  mkdirSync(join(empty, 'supabase/tests/setup'), { recursive: true });
  writeFileSync(join(empty, 'supabase/tests/setup/01.sql'), 'select 1;');
  assert.throws(() => pgtapFiles(empty, []), Error, 'a suite with no test file must not pass silently');
});

test('[19.10 item 3] the real repository: pgtap selects the suite, never a setup/ fixture, and it is sorted', () => {
  const files = pgtapFiles(root, []);
  assert.ok(files.length > 0);
  assert.deepEqual(files, [...files].sort());
  assert.ok(files.every((f) => f.startsWith('supabase/tests/') && f.endsWith('.sql') && !f.startsWith('supabase/tests/setup/')));
  assert.ok(readdirSync(join(root, 'supabase/tests/setup')).length > 0, 'there are fixtures that must have been excluded');
});

test('[19.10 item 3] TAP verdict: passes only with a plan equal to the count and no not ok', () => {
  const good = tapVerdict('1..3\nok 1 - a\nok 2 - b\nok 3 - c\n');
  assert.equal(good.failed, false);
  assert.equal(good.ok, 3);
  assert.deepEqual(good.problems, []);
  assert.equal(tapVerdict('ok 1 - a\nok 2 - b\n1..2\n').failed, false, 'the plan may come last');
});

test('[19.10 item 3] TAP verdict fails on not ok, a missing plan, a plan/count mismatch, and empty output (a psql error is caught here only through the plan)', () => {
  const cases = {
    'a not ok': '1..2\nok 1 - a\nnot ok 2 - b\n',
    'a not ok with diagnostics': '1..1\nnot ok 1 - x\n# Failed test 1\n',
    'a missing plan': 'ok 1 - a\nok 2 - b\n',
    'a plan larger than the count': '1..3\nok 1 - a\nok 2 - b\n',
    'a plan smaller than the count': '1..1\nok 1 - a\nok 2 - b\n',
    'plan 1..0 with results': '1..0\nok 1 - a\n',
    'no output at all': '',
    'psql error text only, no results': 'psql:supabase/tests/x.sql:3: ERROR:  relation "nope" does not exist\n',
    'an error that cut the results short': '1..2\nok 1 - a\npsql:supabase/tests/x.sql:9: ERROR:  boom\n',
  };
  for (const [label, out] of Object.entries(cases)) {
    const v = tapVerdict(out);
    assert.equal(v.failed, true, `${label} was not caught`);
    assert.ok(v.problems.length > 0, label);
  }
});
