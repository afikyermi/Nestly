import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// I1 F1.1 part c, spec criterion 27 (platform r1, r5; WORKPLAN 7.3). The task asked for this as a static check:
//   "The database client uses one connection per instance and has prepared statements off. Nothing under apps/, api/ or
//    vercel.json names a credential other than app_server's: no service_role, app_owner or postgres."
// It reads source files at run time, on purpose, because the promise is about what the repository contains. The tests
// folders are skipped (this file names the forbidden credentials in order to look for them). The behavioural side of
// "one connection" is asserted against a real database in tests/db/.
//
// No connection string with a password is written out in this file: the sample strings below are assembled at run time
// from parts (pgUrl), so the repository never holds one literally.

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SLOW = { timeout: 60_000 };

const FAKE_PW = 'pw';
/** Builds a connection string (scheme, user, password, host, tail) at run time, from parts. */
function pgUrl(scheme: string, user: string, host: string, tail = '', password = FAKE_PW): string {
  return [scheme, '://', user, ':', password, '@', host, tail].join('');
}

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|json|jsonc|ya?ml|toml|env|example|sh)$|(?:^|[\\/])\.env[^\\/]*$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.vercel', '.turbo', '.next', '.vite', 'coverage', 'tests', '__tests__']);
const SKIP_FILES = new Set(['package-lock.json']);
const MAX_BYTES = 1_000_000;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (!SKIP_FILES.has(name) && TEXT_FILE.test(full) && info.size <= MAX_BYTES) {
      out.push(full);
    }
  }
}

function filesUnderChecked(): string[] {
  const files: string[] = [];
  walk(join(repoRoot, 'apps'), files);
  walk(join(repoRoot, 'api'), files);
  const vercel = join(repoRoot, 'vercel.json');
  if (existsSync(vercel)) files.push(vercel);
  return files;
}

const FORBIDDEN_USERS = /^(?:postgres|app_owner|service_role|supabase_admin|authenticator|supabase_auth_admin)(?:\.|$)/i;

/** The `role` claim of a JWT payload given as base64url, or undefined when it is not a JSON object with a string role. */
function roleOfPayload(encoded: string): string | undefined {
  try {
    const payload: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return undefined;
    const role: unknown = Reflect.get(payload, 'role');
    return typeof role === 'string' ? role : undefined;
  } catch {
    return undefined; // not a JWT after all
  }
}

/** Every way the criterion is promised to be absent, as a list of human-readable findings for one file's text. */
function credentialProblems(text: string): string[] {
  const problems: string[] = [];

  for (const match of text.matchAll(/postgres(?:ql)?:\/\/([^\s'"`<>/]*)@/g)) {
    const userinfo = match[1] ?? '';
    const user = userinfo.split(':')[0] ?? '';
    if (user === '' || /^[${%]/.test(user)) continue; // a template, not a credential
    if (user === 'app_server' || user.startsWith('app_server.')) continue;
    problems.push(`a connection string for user "${user}"`);
  }

  if (/SERVICE_ROLE/.test(text) || /service_?role_?key|serviceRoleKey/i.test(text)) problems.push('a service_role key name');
  if (/APP_OWNER_DATABASE_URL|APP_OWNER_PASSWORD/.test(text)) problems.push('an app_owner credential name');
  if (/SUPABASE_SECRET|sb_secret_|SUPABASE_DB_PASSWORD|POSTGRES_PASSWORD/.test(text)) problems.push('a secret key or database password name');

  for (const match of text.matchAll(/\b(?:user|username)\s*:\s*['"]([^'"\n]{1,64})['"]/g)) {
    const name = match[1] ?? '';
    if (FORBIDDEN_USERS.test(name)) problems.push(`a driver option naming user "${name}"`);
  }

  for (const match of text.matchAll(/eyJ[\w-]{10,}\.(eyJ[\w-]{10,})\.[\w-]*/g)) {
    const role = roleOfPayload(match[1] ?? '');
    if (role !== undefined && FORBIDDEN_USERS.test(role)) problems.push(`a hard-coded JWT with role "${role}"`);
  }
  return problems;
}

describe('[F1.1-c c27] the credential scan itself fires on what it is meant to find (it cannot pass vacuously)', () => {
  it.each([
    ['a postgres superuser URL', `const u = "${pgUrl('postgres', 'postgres', 'db.example.invalid:5432', '/postgres')}"`],
    ['a pooled postgres user URL', pgUrl('postgresql', 'postgres.abcdefgh', 'aws-0.pooler.supabase.com:6543', '/postgres')],
    ['an app_owner URL', pgUrl('postgres', 'app_owner.abcdefgh', 'host:5432', '/postgres')],
    ['a service_role user URL', pgUrl('postgres', 'service_role', 'host', '/db')],
    ['SUPABASE_SERVICE_ROLE_KEY', 'process.env.SUPABASE_SERVICE_ROLE_KEY'],
    ['APP_OWNER_DATABASE_URL', 'env: { APP_OWNER_DATABASE_URL: x }'],
    ['a driver option user: postgres', "postgres(url, { user: 'postgres', max: 1 })"],
    ['a driver option user: app_owner', 'new Pool({ user: "app_owner" })'],
    ['a hard-coded service_role JWT', `const k = "eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"role":"service_role"}').toString('base64url')}.sig"`],
  ])('finds %s', (_label, text) => {
    expect(credentialProblems(text).length).toBeGreaterThan(0);
  });

  it.each([
    ['an app_server URL', pgUrl('postgres', 'app_server', '127.0.0.1:5432', '/nestly')],
    ['a pooled app_server URL', pgUrl('postgresql', 'app_server.abcdefgh', 'aws-0.pooler.supabase.com:6543', '/postgres')],
    ['a templated URL', pgUrl('postgres', '${user}', 'host', '/db', '${password}')],
    ['a URL with no credential', 'postgres://localhost:5432/nestly'],
    ['the word service_role in a comment about claims', '// the token role claim (service_role, anon) is ignored'],
  ])('does not flag %s', (_label, text) => {
    expect(credentialProblems(text)).toEqual([]);
  });

  it('looks at a non-empty set of files', SLOW, () => {
    const files = filesUnderChecked().map((f) => relative(repoRoot, f).split(sep).join('/'));
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('apps/server/package.json');
  });
});

describe('[F1.1-c c27] nothing under apps/, api/ or vercel.json names a credential other than app_server (platform r1, r5, WORKPLAN 7.3)', () => {
  it('no connection string, key name, driver user or embedded token for service_role, app_owner or postgres', SLOW, () => {
    const offenders: string[] = [];
    for (const file of filesUnderChecked()) {
      for (const problem of credentialProblems(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(repoRoot, file).split(sep).join('/')}: ${problem}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('[F1.1-c c27] the database client: one connection per instance, prepared statements off (platform r1)', () => {
  const srcDir = join(repoRoot, 'apps', 'server', 'src');
  const clientText = (): { files: string[]; text: string } => {
    const all: string[] = [];
    walk(srcDir, all);
    const files = all.filter((f) => /from\s+['"]postgres['"]|require\(\s*['"]postgres['"]\s*\)|import\(\s*['"]postgres['"]\s*\)/.test(readFileSync(f, 'utf8')));
    return { files, text: files.map((f) => readFileSync(f, 'utf8')).join('\n') };
  };

  it('the server code that creates the database client sets max: 1', SLOW, () => {
    const { files, text } = clientText();
    expect(files.length, 'a file under apps/server/src imports the postgres driver').toBeGreaterThan(0);
    expect(text).toMatch(/\bmax\s*:\s*1\b/);
  });

  it('prepared statements are off (prepare: false), because the transaction pooler cannot carry them', SLOW, () => {
    const { files, text } = clientText();
    expect(files.length).toBeGreaterThan(0);
    expect(text).toMatch(/\bprepare\s*:\s*false\b/);
    expect(text).not.toMatch(/\bprepare\s*:\s*true\b/);
  });
});
