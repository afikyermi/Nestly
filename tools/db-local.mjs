// The CI `db` job's database, on this machine (Afik 18.10.2026, items 6ד and 9): a disposable Supabase Postgres in Docker on
// 127.0.0.1 only, set up like CI — the same image and CLI pin read from .github/workflows/ci.yml, the db job's setup files in
// its order — then `npm run test:db`. Not the db job's other gates (SKIPPED_CI below): CI remains the verdict. Passwords are random per run and live only in this process; no env file is read, and no
// other host is ever reached. psql runs inside the container (`docker exec`), never on the host.
//
// One container and one port per checkout, derived from the checkout's root path (checkoutInstance), so two checkouts or
// worktrees never collide; `down` removes only this checkout's container.
//
// Usage: node tools/db-local.mjs test [--keep]             build, run test:db, remove the container (--keep leaves it running)
//        node tools/db-local.mjs pgtap [--keep] [files…]   build the same database, run the pgTAP files as CI's pg_prove step does
//                                                          (as app_server, search_path pgtap,tests; every file under supabase/tests
//                                                          except setup/ when none given); non-zero on a `not ok`, a plan mismatch or an error
//        node tools/db-local.mjs down                      remove this checkout's container
// Needs Docker Desktop running (after a restart, open Docker Desktop first and wait for "Engine running").
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOST = '127.0.0.1';
const PORT_BASE = 54400;
const PORT_COUNT = 500;

/** The container name and host port of one checkout: a pure function of its root path (case and separators folded on
 * Windows), so a checkout always gets the same pair and two checkouts differ. The name carries 32 bits of the hash, so two
 * checkouts never share a container; two sharing a port (1 in 500) fail at docker run, loudly. Ports 54400-54899. */
export function checkoutInstance(root) {
  let norm = resolve(root).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') norm = norm.toLowerCase();
  const hash = createHash('sha256').update(norm).digest('hex');
  return { name: `nestly-local-db-${hash.slice(0, 8)}`, port: PORT_BASE + (parseInt(hash.slice(8, 16), 16) % PORT_COUNT) };
}

const { name: NAME, port: PORT } = checkoutInstance(ROOT);

/** The image and the CLI version CI pins (ci.yml, job db). Throws when either is missing: never a guess. */
export function ciPins(ciYml) {
  const image = /SUPABASE_POSTGRES_IMAGE:\s*(\S+)/.exec(ciYml)?.[1];
  const cli = /SUPABASE_CLI_VERSION:\s*(\S+)/.exec(ciYml)?.[1];
  if (!image || !/^supabase\/postgres:[\w.-]+$/.test(image)) throw new Error('ci.yml has no SUPABASE_POSTGRES_IMAGE pin');
  if (!cli || !/^\d+\.\d+\.\d+$/.test(cli)) throw new Error('ci.yml has no SUPABASE_CLI_VERSION pin');
  return { image, cli };
}

/** A database URL for this tool: always 127.0.0.1 and a port in the tool's range, never another host. */
export function localUrl(user, password, port) {
  if (!/^[a-z_]+$/.test(user) || !/^[0-9a-f]{64}$/.test(password)) throw new Error('bad local credentials');
  if (!Number.isInteger(port) || port < PORT_BASE || port >= PORT_BASE + PORT_COUNT) throw new Error('bad local port');
  return `postgresql://${user}:${password}@${HOST}:${port}/postgres`;
}

/** The command line: `test [--keep]`, `pgtap [--keep] [files…]`, `down`. Anything else is null (usage). */
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const keep = rest.includes('--keep');
  const others = rest.filter((a) => a !== '--keep');
  if (cmd === 'down' && rest.length === 0) return { cmd, keep: false, files: [] };
  if (cmd === 'test' && others.length === 0) return { cmd, keep, files: [] };
  if (cmd === 'pgtap' && others.every((a) => !a.startsWith('-'))) return { cmd, keep, files: others };
  return null;
}

/** The pgTAP files to run: the named ones (existing .sql under supabase/tests, not setup/), or CI's list (every .sql under
 * supabase/tests except setup/, sorted). Paths come back relative to the root, with forward slashes. Throws on anything else. */
export function pgtapFiles(root, named) {
  const all = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? all(join(dir, e.name)) : [join(dir, e.name)]));
  const rel = (f) => relative(root, f).replace(/\\/g, '/');
  const ci = all(join(root, 'supabase/tests')).map(rel).filter((f) => f.endsWith('.sql') && !f.startsWith('supabase/tests/setup/')).sort();
  if (named.length === 0) {
    if (ci.length === 0) throw new Error('no pgTAP test file under supabase/tests: the suite is missing');
    return ci;
  }
  return named.map((n) => {
    const f = rel(resolve(root, n));
    if (!ci.includes(f)) throw new Error(`${n} is not a pgTAP test file under supabase/tests (setup/ files are fixtures)`);
    return f;
  });
}

/** Reads one pgTAP file's psql output as pg_prove would: failed on any `not ok`, a missing plan, or a plan that differs from the count. */
export function tapVerdict(out) {
  const lines = out.split('\n');
  const notOk = lines.filter((l) => /^not ok\b/.test(l));
  const ok = lines.filter((l) => /^ok\b/.test(l)).length;
  const plan = lines.map((l) => /^1\.\.(\d+)\s*$/.exec(l)).find(Boolean);
  const problems = [...notOk];
  if (!plan) problems.push('no plan (1..N) in the output');
  else if (Number(plan[1]) !== ok + notOk.length) problems.push(`plan 1..${plan[1]} but ${ok + notOk.length} results`);
  return { ok, failed: problems.length > 0, problems };
}

/** The SQL files in CI's order (job db), relative to the repository root. The anchor check must return ok = t, as in CI.
 * Fixtures sort by code point, as the runner's C.UTF-8 glob does. */
export function setupPlan(root) {
  const setup = readdirSync(join(root, 'supabase/tests/setup')).filter((f) => f.endsWith('.sql')).sort();
  return {
    asAdmin: ['supabase/ci/auth-functions.sql'],
    beforeRoles: ['supabase/ci/auth-functions-check.sql', 'supabase/ci/image-preflight.sql', 'supabase/bootstrap/01-roles.sql'],
    afterMigrations: ['supabase/bootstrap/02-anchor-fk.sql', 'supabase/bootstrap/02-anchor-fk-check.sql', 'supabase/ci/pgtap-setup.sql', 'supabase/ci/rls-gate.sql', ...setup.map((f) => `supabase/tests/setup/${f}`)],
    anchorCheck: 'supabase/bootstrap/02-anchor-fk-check.sql',
  };
}

/** The SQL files of the db job's other gates, not run here (the README lists the gates without a file): CI runs them on every pull request that touches the database (CRITIC PR 70). */
export const SKIPPED_CI = {
  'supabase/ci/catalog-fingerprint.sql': 'up→down→up of the newest migration, the second-push no-op, the second run of step 2',
  'supabase/ci/catalog-columns.sql': 'the Drizzle drift check (criterion 20)',
  'supabase/ci/rls-gate-fire.sql': 'the RLS gate fire checks (criterion 4)',
  'supabase/ci/rls-gate-fire-owner.sql': 'the RLS gate fire checks as app_owner (criterion 4)',
};

/** The container, published on 127.0.0.1 only. */
export function dockerRunArgs(image, postgresPassword, jwtSecret, name, port) {
  return ['run', '--detach', '--name', name, '--publish', `${HOST}:${port}:5432`, '--env', `POSTGRES_PASSWORD=${postgresPassword}`,
    '--env', `JWT_SECRET=${jwtSecret}`, '--env', 'JWT_EXP=3600', image];
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

function psql(user, password, sql, label, extra = []) {
  const r = spawnSync('docker', ['exec', '-i', '-e', `PGPASSWORD=${password}`, NAME, 'psql', '-X', '-q', ...extra, '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', user, '-d', 'postgres', '-f', '-'], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${label} failed as ${user}: ${(r.stderr || '').split('\n').slice(0, 5).join(' ')}`);
  return r.stdout;
}

const running = () => spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', NAME], { encoding: 'utf8' }).stdout?.trim() === 'true';

function down() {
  spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' });
}

/** The pinned CLI's entry, run with node (the npm package's `bin` is dist/supabase.js). */
function supabaseCli(version) {
  const prefix = join(tmpdir(), `nestly-supabase-cli-${version}`);
  const bin = join(prefix, 'node_modules', 'supabase', 'dist', 'supabase.js');
  // The marker is written only after a complete install, so an interrupted one is redone, not reused.
  const done = join(prefix, '.installed');
  if (!existsSync(done)) {
    console.log(`installing the pinned Supabase CLI ${version} (once, into ${prefix})`);
    sh(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', prefix, `supabase@${version}`], { shell: process.platform === 'win32', stdio: 'inherit' });
    if (existsSync(bin)) writeFileSync(done, version);
  }
  if (!existsSync(bin)) throw new Error(`the Supabase CLI was not found at ${bin}`);
  return bin;
}

/** Builds the database as CI's db job does, runs `work(pw)` against it and returns its exit status. */
function withDatabase(keep, work) {
  try {
    sh('docker', ['info', '--format', '{{.ServerVersion}}']);
  } catch {
    throw new Error('Docker is not running: open Docker Desktop and wait for "Engine running", then run this again');
  }
  const { image, cli } = ciPins(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8'));
  const pw = { postgres: randomBytes(32).toString('hex'), app_owner: randomBytes(32).toString('hex'), app_server: randomBytes(32).toString('hex'), jwt: randomBytes(32).toString('hex') };
  const plan = setupPlan(ROOT);
  const read = (f) => readFileSync(join(ROOT, f), 'utf8');
  down();
  console.log(`starting ${image} on ${HOST}:${PORT}`);
  try {
    sh('docker', dockerRunArgs(image, pw.postgres, pw.jwt, NAME, PORT));
    // Ready = three logins in a row as postgres (the image restarts the server after its init scripts), as in CI.
    let ok = 0;
    for (let i = 0; i < 120 && ok < 3; i++) {
      if (!running()) throw new Error(`the database container exited (see docker logs ${NAME}; --keep keeps it for inspection)`);
      const r = spawnSync('docker', ['exec', '-e', `PGPASSWORD=${pw.postgres}`, NAME, 'psql', '-X', '-q', '-t', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'], { stdio: 'ignore' });
      if (r.signal) throw new Error(`interrupted (${r.signal})`);
      ok = r.status === 0 ? ok + 1 : 0;
      if (ok < 3) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)']);
    }
    if (ok < 3) throw new Error('the local database did not become ready');
    for (const f of plan.asAdmin) psql('supabase_admin', pw.postgres, read(f), f);
    for (const f of plan.beforeRoles) psql('postgres', pw.postgres, read(f), f);
    psql('postgres', pw.postgres, `alter role app_owner password '${pw.app_owner}'; alter role app_server password '${pw.app_server}';`, 'role passwords');
    console.log('applying the migrations as app_owner (supabase db push, as CI)');
    const push = spawnSync(process.execPath, [supabaseCli(cli), 'db', 'push', '--db-url', `${localUrl('app_owner', pw.app_owner, PORT)}?sslmode=disable`, '--yes', '--skip-vault', '--agent', 'no'], { cwd: ROOT, stdio: 'inherit' });
    if (push.status !== 0) throw new Error('supabase db push failed');
    for (const f of plan.afterMigrations) {
      if (f !== plan.anchorCheck) {
        psql('postgres', pw.postgres, read(f), f);
        continue;
      }
      const anchor = psql('postgres', pw.postgres, read(f), f, ['-A', '-t', '-F', ' | ']).trim();
      if (!anchor.startsWith('t | ')) throw new Error(`${f}: ok is not true (${anchor})`);
    }
    return work(pw);
  } finally {
    if (keep) console.log(`kept: container ${NAME} on ${HOST}:${PORT} (remove: node tools/db-local.mjs down)`);
    else down();
  }
}

function test(keep) {
  return withDatabase(keep, (pw) => {
    console.log('running npm run test:db -w @nestly/server');
    const run = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:db', '-w', '@nestly/server'], {
      cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: localUrl('app_server', pw.app_server, PORT), OWNER_DATABASE_URL: localUrl('app_owner', pw.app_owner, PORT) },
    });
    return run.status ?? 1;
  });
}

/** CI's "pgTAP suite with pg_prove as app_server": each file as app_server with search_path pgtap,tests, in name order.
 * pg_prove is not in the image, so the files go through psql in the container and tapVerdict reads the TAP. */
function pgtap(files, keep) {
  const list = pgtapFiles(ROOT, files);
  return withDatabase(keep, (pw) => {
    let bad = 0;
    for (const f of list) {
      const r = spawnSync('docker', ['exec', '-i', '-e', `PGPASSWORD=${pw.app_server}`, '-e', 'PGOPTIONS=-c search_path=pgtap,tests', NAME, 'psql', '-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', '5432', '-U', 'app_server', '-d', 'postgres', '-f', '-'],
        { input: readFileSync(join(ROOT, f), 'utf8'), encoding: 'utf8' });
      const v = tapVerdict(r.stdout ?? '');
      const failed = r.status !== 0 || v.failed;
      if (failed) bad++;
      console.log(`${failed ? 'FAIL' : 'ok  '} ${f} (${v.ok} ok)`);
      if (failed) {
        for (const p of v.problems) console.log(`  ${p}`);
        if (r.status !== 0) console.log(`  psql exit ${r.status}: ${(r.stderr ?? '').split('\n').slice(0, 6).join(' | ')}`);
      }
    }
    console.log(`${list.length - bad}/${list.length} pgTAP files passed`);
    return bad === 0 ? 0 : 1;
  });
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args) {
    console.error('usage: node tools/db-local.mjs test [--keep] | pgtap [--keep] [files…] | down');
    return 2;
  }
  if (args.cmd === 'down') {
    down();
    return 0;
  }
  try {
    return args.cmd === 'test' ? test(args.keep) : pgtap(args.files, args.keep);
  } catch (e) {
    console.error(`db-local: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
