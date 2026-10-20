import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// I1 F1.1 part c, spec criterion 27 (platform r1, r5; WORKPLAN 7.3). The task asked for this as a static check:
//   "The database client uses one connection per instance and has prepared statements off. Nothing under apps/, api/ or
//    vercel.json names a credential other than app_server's: no service_role, app_owner or postgres."
// The credential half reads source files at run time, on purpose, because the promise is about what the repository
// contains (a named exception to "tests do not read source": criterion 27 is a property of the repository's text). The
// tests folders are skipped (this file names the forbidden credentials in order to look for them). The client half is
// asserted on the exported interface, createDatabase(url).client.options, and not on the text of the source; the
// behavioural side of "one connection" is asserted against a real database in tests/db/.
//
// No connection string with a password is written out in this file: the sample strings below are assembled at run time
// from parts (pgUrl), so the repository never holds one literally.

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SLOW = { timeout: 60_000 };

const FAKE_PW = 'pw';
const FAKE_KEY = ['sb', 'secret', 'abcdefghijklmnop'].join('_');
/** Builds a connection string (scheme, user, password, host, tail) at run time, from parts. */
function pgUrl(scheme: string, user: string, host: string, tail = '', password = FAKE_PW): string {
  return [scheme, '://', user, ':', password, '@', host, tail].join('');
}

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|json|jsonc|ya?ml|toml|env|example|sh)$|(?:^|[\\/])\.env[^\\/]*$/i;
// Build output is generated from source and gitignored, so the scan reads the source it comes from, not the bundle: a bundle inlines the
// assembled text of the key guard's marker (apps/web/src/services/auth/secret-key.ts builds it from parts on purpose). 'dist-e2e' and
// 'storybook-static' are skipped by name; a test below proves both are gitignored, so no tracked source can hide in a skipped folder.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-e2e', 'storybook-static', 'build', '.vercel', '.turbo', '.next', '.vite', 'coverage', 'tests', '__tests__']);
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

// F1.6-b (Gate 2, schema.md "CI check"; FR-AUTH-003 exception part (a)): the Auth admin key's NAME may appear in exactly one source file.
const AUTH_ADMIN_MODULE = 'apps/server/src/recovery/auth-admin.ts';
// I5 (Afik 20.10.2026; data-model "Approved exceptions", I5 media): the same key, for Storage only, in one more module.
const STORAGE_MODULE = 'apps/server/src/media/storage-admin.ts';
const SECRET_KEY_MODULES = [AUTH_ADMIN_MODULE, STORAGE_MODULE];
const PEPPER_MODULE = 'apps/server/src/recovery/pepper.ts';
const relPath = (file: string): string => relative(repoRoot, file).split(sep).join('/');

/**
 * Every way the criterion is promised to be absent, as a list of human-readable findings for one file's text.
 * `allowAdminKeyName` is true for the one module that reads the Auth admin key; a literal key (sb_secret_) is never allowed.
 */
function credentialProblems(text: string, allowAdminKeyName = false): string[] {
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
  if (/SUPABASE_SECRET(?!_KEY\b)|sb_secret_|SUPABASE_DB_PASSWORD|POSTGRES_PASSWORD/.test(text)) problems.push('a secret key or database password name');
  if (!allowAdminKeyName && /SUPABASE_SECRET_KEY/.test(text)) problems.push('the secret key name outside recovery/auth-admin.ts and media/storage-admin.ts');

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
    ['SUPABASE_SECRET_KEY outside the one module', 'process.env.SUPABASE_SECRET_KEY'],
    ['SUPABASE_SECRET under another name', 'process.env.SUPABASE_SECRET_TOKEN'],
    ['a literal secret key', `const k = "${FAKE_KEY}"`],
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

  it('F1.6-b: SUPABASE_SECRET_KEY is allowed in the one module that reads it, and a literal key is not allowed even there', () => {
    expect(credentialProblems('process.env.SUPABASE_SECRET_KEY', true)).toEqual([]);
    expect(credentialProblems(`const k = "${FAKE_KEY}"`, true).length).toBeGreaterThan(0);
    expect(credentialProblems('process.env.SUPABASE_SERVICE_ROLE_KEY', true).length).toBeGreaterThan(0);
  });

  it('looks at a non-empty set of files', SLOW, () => {
    const files = filesUnderChecked().map((f) => relative(repoRoot, f).split(sep).join('/'));
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('apps/server/package.json');
  });
});

describe('[F1.1-c c27] the folders the scan skips are untracked build output or test code, not source', () => {
  it('every skipped build-output folder is listed in .gitignore (so skipping it cannot hide tracked source)', () => {
    const ignored = readFileSync(join(repoRoot, '.gitignore'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\/$/, ''));
    const buildOutput = ['node_modules', 'dist', 'dist-e2e', 'storybook-static', 'build', '.vercel', 'coverage'];
    expect(buildOutput.filter((name) => SKIP_DIRS.has(name) && !ignored.includes(name))).toEqual([]);
  });

  it('the scan still reads the web source that handles keys: the key guard module is in the checked set and passes without an exception', () => {
    const files = filesUnderChecked().map((f) => relative(repoRoot, f).split(sep).join('/'));
    expect(files).toContain('apps/web/src/services/auth/secret-key.ts');
    expect(credentialProblems(readFileSync(join(repoRoot, 'apps/web/src/services/auth/secret-key.ts'), 'utf8'))).toEqual([]);
  });
});

describe('[F1.1-c c27] nothing under apps/, api/ or vercel.json names a credential other than app_server (platform r1, r5, WORKPLAN 7.3)', () => {
  it('no connection string, key name, driver user or embedded token for service_role, app_owner or postgres', SLOW, () => {
    const offenders: string[] = [];
    for (const file of filesUnderChecked()) {
      for (const problem of credentialProblems(readFileSync(file, 'utf8'), SECRET_KEY_MODULES.includes(relPath(file)))) {
        offenders.push(`${relPath(file)}: ${problem}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// F1.6-b criterion 15 ("the admin key is read in one source file and the pepper in one (CI check)"), schema.md "CI check" and
// "The pepper". Like the scan above, this is a property of the repository's text, so it reads source files at run time.
describe('[F1.6-b c15 FR-AUTH-003] the Auth admin key and the pepper are named in one source file each, and never in CI config', () => {
  const scanned = (): Array<{ path: string; text: string }> =>
    filesUnderChecked().map((file) => ({ path: relPath(file), text: readFileSync(file, 'utf8') }));
  const namingIn = (name: RegExp): string[] =>
    scanned()
      .filter((f) => name.test(f.text))
      .map((f) => f.path);

  it('SUPABASE_SECRET_KEY is named in recovery/auth-admin.ts and (I5) media/storage-admin.ts and in no other file under apps/, api/ or vercel.json (both do name it: not vacuous)', SLOW, () => {
    expect(namingIn(/SUPABASE_SECRET_KEY/).sort()).toEqual([...SECRET_KEY_MODULES].sort());
  });

  it('[gateway-key c9] SUPABASE_PUBLISHABLE_KEY is named under apps/server/src in auth-admin.ts only, and the module does name it', SLOW, () => {
    const serverSrc = scanned().filter((f) => f.path.startsWith('apps/server/src/'));
    expect(serverSrc.filter((f) => /(?<![A-Z_])SUPABASE_PUBLISHABLE_KEY/.test(f.text)).map((f) => f.path)).toEqual([AUTH_ADMIN_MODULE]);
    expect(serverSrc.filter((f) => /sb_publishable_/.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it('RECOVERY_PEPPER is named in apps/server/src/recovery/pepper.ts and in no other file under apps/, api/ or vercel.json (and the module does name it: not vacuous)', SLOW, () => {
    expect(namingIn(/RECOVERY_PEPPER/)).toEqual([PEPPER_MODULE]);
  });

  it('the Auth admin literals (/admin/, grant_type=password, /logout, Sb-Forwarded-For) appear under apps/server/src in auth-admin.ts only, and the module has all four', SLOW, () => {
    const serverSrc = scanned().filter((f) => f.path.startsWith('apps/server/src/'));
    for (const literal of ['/admin/', 'grant_type=password', '/logout', 'Sb-Forwarded-For']) {
      // the product's own staff API paths (/api/admin/..., I4, I5) are not Auth's admin endpoints
      const where = serverSrc.filter((f) => f.text.toLowerCase().replaceAll('/api/admin/', '').includes(literal.toLowerCase())).map((f) => f.path);
      expect(where, `the literal ${literal}`).toEqual([AUTH_ADMIN_MODULE]);
    }
  });

  it('neither secret name appears anywhere under .github/ (CI uses a stub; Afik sets both on the host only)', SLOW, () => {
    const files: string[] = [];
    const dir = join(repoRoot, '.github');
    expect(existsSync(dir), '.github/ exists, so this check reads something').toBe(true);
    walk(dir, files);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /SUPABASE_SECRET|RECOVERY_PEPPER/.test(readFileSync(f, 'utf8'))).map(relPath);
    expect(offenders).toEqual([]);
  });
});

describe('[F1.1-c c27] the database client: one connection per instance, prepared statements off (platform r1)', () => {
  // The exported interface, not the source text: createDatabase(url) hands back a postgres-js client whose parsed options
  // are what the driver will use. Nothing connects until a query runs, so a loopback address that nobody listens on is
  // enough. The URL is built at run time, with no literal password.
  const loopback = (): string => pgUrl('postgres', 'app_server', '127.0.0.1:1', '/nestly_test', 'throwaway');

  async function withDatabase<T>(use: (options: { max: number; prepare: boolean }) => T): Promise<T> {
    const { createDatabase } = await import('../src/db/client.js');
    const database = createDatabase(loopback());
    try {
      const { max, prepare } = database.client.options;
      return use({ max, prepare });
    } finally {
      await database.close();
    }
  }

  it('createDatabase(url).client.options.max is 1 (one connection per server instance)', SLOW, async () => {
    expect(await withDatabase((o) => o.max)).toBe(1);
  });

  it('createDatabase(url).client.options.prepare is false (the transaction pooler cannot carry prepared statements)', SLOW, async () => {
    expect(await withDatabase((o) => o.prepare)).toBe(false);
  });

  it('the options are not taken from the URL: a query string asking for more connections or prepared statements does not change them', SLOW, async () => {
    const { createDatabase } = await import('../src/db/client.js');
    const database = createDatabase(`${loopback()}?max=20&prepare=true`);
    try {
      expect(database.client.options.max).toBe(1);
      expect(database.client.options.prepare).toBe(false);
    } finally {
      await database.close();
    }
  });
});

// I5 (Afik 20.10.2026, decisions-in-force.md §7; data-model "Approved exceptions", I5 media): the storage key is fenced to one module, the
// training bucket and the job's storage operations to that module and the job, and the job's database credential and model to the job. The
// request server (everything under apps/server/src outside jobs/) never imports the job. A property of the repository's text, read at run time.
describe('[I5 Afik 20.10] the storage and job fences', () => {
  const serverSrc = (): Array<{ path: string; text: string }> =>
    filesUnderChecked()
      .map((file) => ({ path: relPath(file), text: readFileSync(file, 'utf8') }))
      .filter((f) => f.path.startsWith('apps/server/src/') || f.path.startsWith('apps/server/api/') || f.path.startsWith('api/'));
  const namingIn = (name: RegExp): string[] =>
    filesUnderChecked()
      .map((file) => ({ path: relPath(file), text: readFileSync(file, 'utf8') }))
      .filter((f) => name.test(f.text))
      .map((f) => f.path);
  const inJob = (path: string): boolean => path.startsWith('apps/server/src/jobs/') || path === 'apps/server/api/jobs.ts' || path === 'api/jobs.ts';

  it('APP_MEDIA_JOBS_DATABASE_URL is named only in src/jobs/config.ts (and it does name it)', SLOW, () => {
    expect(namingIn(/APP_MEDIA_JOBS_DATABASE_URL/)).toEqual(['apps/server/src/jobs/config.ts']);
  });

  it('CRON_SECRET is named only in src/jobs/config.ts and the upload route\'s caller media/job-kick.ts', SLOW, () => {
    expect(namingIn(/CRON_SECRET/).sort()).toEqual(['apps/server/src/jobs/config.ts', 'apps/server/src/media/job-kick.ts']);
  });

  it('the training bucket is named only in media/storage-admin.ts', SLOW, () => {
    expect(serverSrc().filter((f) => f.text.includes('media-training')).map((f) => f.path)).toEqual([STORAGE_MODULE]);
  });

  it('the job-only storage (createJobStorage, JobStorage) is used only by the job', SLOW, () => {
    const users = serverSrc().filter((f) => /\b(createJobStorage|JobStorage)\b/.test(f.text) && f.path !== STORAGE_MODULE).map((f) => f.path);
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((path) => !inJob(path))).toEqual([]);
  });

  it('no request-server file imports the job, and only the job imports onnxruntime-node or the model', SLOW, () => {
    const importsJob = /from\s+['"][^'"]*\/jobs\/[^'"]*['"]/;
    expect(serverSrc().filter((f) => !inJob(f.path) && importsJob.test(f.text)).map((f) => f.path)).toEqual([]);
    expect(serverSrc().filter((f) => /onnxruntime-node|nudenet-320n/.test(f.text)).map((f) => f.path)).toEqual(['apps/server/src/jobs/nudenet.ts']);
  });

  it('the storage key never reaches the web app or the CI configuration', SLOW, () => {
    expect(namingIn(/SUPABASE_SECRET_KEY|APP_MEDIA_JOBS_DATABASE_URL/).filter((path) => path.startsWith('apps/web/'))).toEqual([]);
  });
});
