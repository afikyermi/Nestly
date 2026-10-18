// The CI `db` job's database, on this machine (Afik 18.10.2026, items 6ד and 9): a disposable Supabase Postgres in Docker on
// 127.0.0.1 only, built like CI — the same image and CLI pin read from .github/workflows/ci.yml, the same files in the same
// order — then `npm run test:db`. Passwords are random per run and live only in this process; no env file is read, and no
// other host is ever reached. psql runs inside the container (`docker exec`), never on the host.
//
// Usage: node tools/db-local.mjs test [--keep]     build, run test:db, remove the container (--keep leaves it running)
//        node tools/db-local.mjs down              remove the container
// Needs Docker Desktop running (after a restart, open Docker Desktop first and wait for "Engine running").
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAME = 'nestly-local-db';
const HOST = '127.0.0.1';
const PORT = 54322;

/** The image and the CLI version CI pins (ci.yml, job db). Throws when either is missing: never a guess. */
export function ciPins(ciYml) {
  const image = /SUPABASE_POSTGRES_IMAGE:\s*(\S+)/.exec(ciYml)?.[1];
  const cli = /SUPABASE_CLI_VERSION:\s*(\S+)/.exec(ciYml)?.[1];
  if (!image || !/^supabase\/postgres:[\w.-]+$/.test(image)) throw new Error('ci.yml has no SUPABASE_POSTGRES_IMAGE pin');
  if (!cli || !/^\d+\.\d+\.\d+$/.test(cli)) throw new Error('ci.yml has no SUPABASE_CLI_VERSION pin');
  return { image, cli };
}

/** A database URL for this tool: always 127.0.0.1:54322, never another host. */
export function localUrl(user, password) {
  if (!/^[a-z_]+$/.test(user) || !/^[0-9a-f]{64}$/.test(password)) throw new Error('bad local credentials');
  return `postgresql://${user}:${password}@${HOST}:${PORT}/postgres`;
}

/** The SQL files in CI's order (job db), relative to the repository root. */
export function setupPlan(root) {
  const setup = readdirSync(join(root, 'supabase/tests/setup')).filter((f) => f.endsWith('.sql')).sort();
  return {
    asAdmin: ['supabase/ci/auth-functions.sql'],
    beforeRoles: ['supabase/ci/auth-functions-check.sql', 'supabase/ci/image-preflight.sql', 'supabase/bootstrap/01-roles.sql'],
    afterMigrations: ['supabase/bootstrap/02-anchor-fk.sql', 'supabase/ci/pgtap-setup.sql', 'supabase/ci/rls-gate.sql', ...setup.map((f) => `supabase/tests/setup/${f}`)],
  };
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

function psql(user, password, sql, label) {
  const r = spawnSync('docker', ['exec', '-i', '-e', `PGPASSWORD=${password}`, NAME, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '5432', '-U', user, '-d', 'postgres', '-f', '-'], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${label} failed as ${user}: ${(r.stderr || '').split('\n').slice(0, 5).join(' ')}`);
}

function down() {
  spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' });
}

/** The pinned CLI's entry, run with node (the npm package's `bin` is dist/supabase.js). */
function supabaseCli(version) {
  const prefix = join(tmpdir(), `nestly-supabase-cli-${version}`);
  const bin = join(prefix, 'node_modules', 'supabase', 'dist', 'supabase.js');
  if (!existsSync(bin)) {
    console.log(`installing the pinned Supabase CLI ${version} (once, into ${prefix})`);
    sh(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', prefix, `supabase@${version}`], { shell: process.platform === 'win32', stdio: 'inherit' });
  }
  if (!existsSync(bin)) throw new Error(`the Supabase CLI was not found at ${bin}`);
  return bin;
}

function test(keep) {
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
  sh('docker', ['run', '--detach', '--name', NAME, '--publish', `${HOST}:${PORT}:5432`, '--env', `POSTGRES_PASSWORD=${pw.postgres}`, '--env', `JWT_SECRET=${pw.jwt}`, '--env', 'JWT_EXP=3600', image]);
  try {
    // Ready = three logins in a row as postgres (the image restarts the server after its init scripts), as in CI.
    let ok = 0;
    for (let i = 0; i < 120 && ok < 3; i++) {
      const r = spawnSync('docker', ['exec', '-e', `PGPASSWORD=${pw.postgres}`, NAME, 'psql', '-X', '-q', '-t', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'], { stdio: 'ignore' });
      ok = r.status === 0 ? ok + 1 : 0;
      if (ok < 3) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)']);
    }
    if (ok < 3) throw new Error('the local database did not become ready');
    for (const f of plan.asAdmin) psql('supabase_admin', pw.postgres, read(f), f);
    for (const f of plan.beforeRoles) psql('postgres', pw.postgres, read(f), f);
    psql('postgres', pw.postgres, `alter role app_owner password '${pw.app_owner}'; alter role app_server password '${pw.app_server}';`, 'role passwords');
    console.log('applying the migrations as app_owner (supabase db push, as CI)');
    const push = spawnSync(process.execPath, [supabaseCli(cli), 'db', 'push', '--db-url', localUrl('app_owner', pw.app_owner), '--yes', '--skip-vault', '--agent', 'no'], { cwd: ROOT, stdio: 'inherit' });
    if (push.status !== 0) throw new Error('supabase db push failed');
    for (const f of plan.afterMigrations) psql('postgres', pw.postgres, read(f), f);
    console.log('running npm run test:db -w @nestly/server');
    const run = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:db', '-w', '@nestly/server'], {
      cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: localUrl('app_server', pw.app_server), OWNER_DATABASE_URL: localUrl('app_owner', pw.app_owner) },
    });
    return run.status ?? 1;
  } finally {
    if (keep) console.log(`kept: container ${NAME} on ${HOST}:${PORT} (remove: node tools/db-local.mjs down)`);
    else down();
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'down') {
    down();
    return 0;
  }
  if (cmd === 'test') {
    try {
      return test(rest.includes('--keep'));
    } catch (e) {
      console.error(`db-local: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }
  console.error('usage: node tools/db-local.mjs test [--keep] | down');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
