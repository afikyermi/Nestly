// F1.2 criteria 11 (import scan) and 26 (gender-neutral copy grep).
// The spec itself asks for these as scans of the source tree (recorded as a named exception: tests that read source).
// They read file text only; they never import or run it. A match is reported as file:line, never as the source text.
// The criterion 27 colour scan is not here: the design lint covers it.
// Derived from .work/app-shell-guard/spec.md only.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The web workspace runs vitest from apps/web; from the repository root the web app is at apps/web.
const WEB = existsSync(path.resolve(process.cwd(), 'src')) ? process.cwd() : path.resolve(process.cwd(), 'apps/web');
const SRC = path.join(WEB, 'src');

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join('/');
const sources = filesUnder(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string): string => readFileSync(f, 'utf8');

/** The keys of the object stored under `key` of a parsed JSON value, or [] when it is not an object. */
function keysUnder(json: unknown, key: string): string[] {
  const value: unknown = typeof json === 'object' && json !== null ? Reflect.get(json, key) : undefined;
  return typeof value === 'object' && value !== null ? Object.keys(value) : [];
}

const AUTH_SDKS = [
  /^@supabase\//,
  /^supabase/,
  /^@firebase\//,
  /^firebase/,
  /^@auth0\//,
  /^auth0/,
  /^@clerk\//,
  /^next-auth/,
  /^@auth\//,
  /^aws-amplify/,
  /^@aws-amplify\//,
  /^@aws-sdk\/client-cognito/,
  /^amazon-cognito/,
  /^better-auth/,
  /^@okta\//,
  /^oidc-client/,
  /^keycloak-js/,
  /^@stytch\//,
  /^@kinde/,
  /^passport/,
];

interface Found {
  specifier: string;
  line: number;
}

/** Every import / require / dynamic-import specifier in a source text, with its 1-based line. */
function specifiers(text: string): Found[] {
  const out: Found[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;
  for (const m of text.matchAll(re)) {
    if (m[1] === undefined) continue;
    out.push({ specifier: m[1], line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

describe('the source scan is not vacuous', () => {
  it('[F1.2 c11] finds the web source files, including screens', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((f) => rel(f).startsWith('components/'))).toBe(true);
    expect(sources.some((f) => rel(f).startsWith('pages/') || rel(f).startsWith('features/'))).toBe(true);
  });

  it('[F1.2 c11] the specifier extractor sees plain, side-effect, dynamic and require imports, with their lines', () => {
    const text = `import a from '@supabase/supabase-js';\nimport '@clerk/x';\nconst b = await import("firebase/auth");\nconst c = require('auth0');`;
    expect(specifiers(text)).toEqual([
      { specifier: '@supabase/supabase-js', line: 1 },
      { specifier: '@clerk/x', line: 2 },
      { specifier: 'firebase/auth', line: 3 },
      { specifier: 'auth0', line: 4 },
    ]);
  });
});

// F1.4 criterion 22 [rule 1 · F1.2 scan change, Afik 14.10]: "Auth client only". Under apps/web a supabase-js / auth-js import is
// allowed only in the one Auth client module; any use of database, storage or realtime (.from, .rpc, .storage, .channel) or of
// a secret / service_role key anywhere in the web fails the scan. Other auth SDKs stay banned everywhere.
const AUTH_CLIENT_MODULE = 'services/auth/auth-client.ts';
const SUPABASE_SDK = /^@supabase\//;
const ALLOWED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];

/** Violations of the F1.4 criterion 22 rules in one file's text, as short names (never the source text). */
function authClientViolations(file: string, text: string): string[] {
  const out: string[] = [];
  for (const found of specifiers(text)) {
    if (SUPABASE_SDK.test(found.specifier) && file !== AUTH_CLIENT_MODULE) out.push(`sdk-import-outside-auth-client:${found.line}`);
    else if (!SUPABASE_SDK.test(found.specifier) && AUTH_SDKS.some((re) => re.test(found.specifier))) out.push(`other-auth-sdk:${found.line}`);
  }
  // A database / storage / realtime call. Built-in receivers (Array.from, Object.fromEntries ...) are not the data API.
  if (/(?<![\w$])(?!Array\b|Object\b|Buffer\b|Uint8Array\b|Int8Array\b|Float64Array\b|Set\b|Map\b|Observable\b|JSON\b)[\w$]+(?:\??\.[\w$]+)*\??\.(?:from|rpc|channel)\s*\(/.test(text)) {
    out.push('data-api-call');
  }
  if (/(?<![\w$])(?:(?!navigator\b)[\w$]+)\.storage\b|\.storage\s*\.\s*from\s*\(/.test(text)) out.push('storage-api');
  if (/service_role|SERVICE_ROLE|sb_secret_|SUPABASE_SECRET|SECRET_KEY|serviceRole/.test(text)) out.push('secret-key');
  for (const m of text.matchAll(/\bVITE_SUPABASE\w*/g)) {
    if (!ALLOWED_ENV.includes(m[0]) || file !== AUTH_CLIENT_MODULE) out.push(`env:${m[0]}`);
  }
  return out;
}

describe('Auth client only (F1.4 criterion 22)', () => {
  it('[F1.4 c22][rule 1] the scan flags each violation in a fixture (control: it can fail)', () => {
    const fixtures: Array<[string, string, string]> = [
      ['an @supabase import in a screen', "import { createClient } from '@supabase/supabase-js';\n", 'pages/Fixture.tsx'],
      ['an @supabase import in a hook', "const m = await import('@supabase/auth-js');\n", 'hooks/use-fixture.ts'],
      ['another auth SDK, even in the Auth client module', "import x from 'firebase/auth';\n", AUTH_CLIENT_MODULE],
      ['.from() on a client', "const r = await supabase.from('users').select('*');\n", 'services/fixture.ts'],
      ['.from() on a nested client', "await client.db.from('children').insert(x);\n", 'services/fixture.ts'],
      ['.rpc()', "await client.rpc('do_thing', { a: 1 });\n", 'services/fixture.ts'],
      ['.storage', "await client.storage.from('bucket').upload('a', b);\n", 'services/fixture.ts'],
      ['.channel()', "const c = client.channel('room').subscribe();\n", 'services/fixture.ts'],
      ['a service_role key', "const k = 'service_role';\n", 'services/fixture.ts'],
      ['a service-role env variable', 'const k = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;\n', AUTH_CLIENT_MODULE],
      ['a secret key', "const k = 'sb_secret_abc';\n", 'lib/fixture.ts'],
      ['an unlisted VITE_SUPABASE variable', 'const k = import.meta.env.VITE_SUPABASE_ANON;\n', AUTH_CLIENT_MODULE],
      ['an allowed variable read outside the Auth client', 'const k = import.meta.env.VITE_SUPABASE_URL;\n', 'pages/Fixture.tsx'],
    ];
    for (const [label, text, file] of fixtures) expect(authClientViolations(file, text).length, label).toBeGreaterThan(0);
  });

  it('[F1.4 c22] the scan accepts what is allowed (control: it does not flag everything)', () => {
    const fine: Array<[string, string, string]> = [
      ['the SDK import in the Auth client module', "import { AuthClient } from '@supabase/auth-js';\n", AUTH_CLIENT_MODULE],
      ['the two build-time variables in the Auth client module', 'const a = import.meta.env.VITE_SUPABASE_URL; const b = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;\n', AUTH_CLIENT_MODULE],
      ['Array.from and Object.fromEntries', 'const a = Array.from({ length: 3 }); const b = Object.fromEntries(x);\n', 'lib/fixture.ts'],
      ['localStorage use', "const v = window.localStorage.getItem('x');\n", 'lib/fixture.ts'],
      ['a port interface with signUp', 'export interface AuthPort { signUp(c: Credentials): Promise<R>; }\n', 'services/auth/port.ts'],
    ];
    for (const [label, text, file] of fine) expect(authClientViolations(file, text), label).toEqual([]);
  });

  it('[F1.4 c22][FR-AUTH-004] the real tree has no violation: the @supabase import lives only in services/auth/auth-client.ts', () => {
    const offenders = sources.flatMap((f) => authClientViolations(rel(f), read(f)).map((v) => `${rel(f)} ${v}`));
    expect(offenders).toEqual([]);
  });

  it('[F1.4 c22] the Auth client module exists and is the file that imports the SDK (so the allowance is real, not vacuous)', () => {
    const file = sources.find((f) => rel(f) === AUTH_CLIENT_MODULE);
    expect(file, `${AUTH_CLIENT_MODULE} is missing`).toBeDefined();
    expect(specifiers(read(file ?? '')).some((s) => SUPABASE_SDK.test(s.specifier))).toBe(true);
    expect(sources.filter((f) => specifiers(read(f)).some((s) => SUPABASE_SDK.test(s.specifier))).map(rel)).toEqual([AUTH_CLIENT_MODULE]);
  });

  it('[F1.4 c22] package.json: the only auth SDK dependency is @supabase/auth-js (no supabase-js, no other provider)', () => {
    const pkg: unknown = JSON.parse(readFileSync(path.join(WEB, 'package.json'), 'utf8'));
    const deps = [...keysUnder(pkg, 'dependencies'), ...keysUnder(pkg, 'devDependencies')];
    expect(deps.length).toBeGreaterThan(0);
    expect(deps.filter((d) => AUTH_SDKS.some((re) => re.test(d)))).toEqual(['@supabase/auth-js']);
  });

  it('[F1.4 c22] no committed env file or config under apps/web names a secret / service_role key', () => {
    const configs = ['vite.config.ts', '.env', '.env.e2e', '.env.local', '.env.production', '.env.development']
      .map((n) => path.join(WEB, n))
      .filter((f) => existsSync(f));
    for (const f of configs) expect(/service_role|SERVICE_ROLE|sb_secret_|SECRET_KEY/.test(read(f)), path.basename(f)).toBe(false);
  });
});

describe('one seam (11), as changed by F1.4 criterion 22', () => {
  it('[F1.2 c11][FR-AUTH-004] no file imports any auth SDK other than @supabase/*, and no guard, page, component or feature imports @supabase/*', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      for (const found of specifiers(read(f))) {
        if (!AUTH_SDKS.some((re) => re.test(found.specifier))) continue;
        const isSupabase = SUPABASE_SDK.test(found.specifier);
        if (!isSupabase || /^(pages|components|features|app)\//.test(rel(f))) offenders.push(`${rel(f)}:${found.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('[F1.2 c11][FR-AUTH-004] a file in pages/, components/ or features/ makes no direct auth-provider URL call', () => {
    const hits = sources
      .filter((f) => /^(pages|components|features)\//.test(rel(f)))
      .filter((f) => /\/auth\/v1|\.supabase\.co|accounts\.google\.com/.test(read(f)))
      .map(rel);
    expect(hits).toEqual([]);
  });
});

describe('gender-neutral copy (26)', () => {
  // Hebrew letters that make a slash gender form: /ה /י /ית /ת, written right after Hebrew text.
  const slashForm = /[א-ת]\/(?:ה|י|ית|ת)(?![א-ת])|\/(?:ה|י|ית|ת)(?![א-ת])/;

  it('[F1.2 c26][NFR-USAB-003] the grep pattern flags a slash gender form (control)', () => {
    for (const bad of ['מחובר/ת', 'הרשם/י', 'ברוך/ה הבא', 'ללחוץ/י']) expect(slashForm.test(bad), bad).toBe(true);
    for (const ok of ['המשך עם Google', 'כבר יש לי חשבון', 'קהילה חמה להורים ולהורים לעתיד, במקום אחד.']) {
      expect(slashForm.test(ok), ok).toBe(false);
    }
  });

  it('[F1.2 c26][NFR-USAB-003] no Hebrew string in the web source uses a slash gender form', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      read(f)
        .split('\n')
        .forEach((line, i) => {
          if (/[א-ת]/.test(line) && slashForm.test(line)) offenders.push(`${rel(f)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('[F1.2 c26][NFR-USAB-003] the specified strings are present as specified: Welcome, actions, lead, shell, menu, placeholder', () => {
    const all = sources.map(read).join('\n');
    const strings = [
      'הצטרפות ל-Nestly',
      'יצירת חשבון חדש',
      'המשך עם Google',
      'כבר יש לי חשבון',
      'קהילה חמה להורים ולהורים לעתיד, במקום אחד.',
      'המסך הזה ייפתח בקרוב.',
      'בטעינה',
      'התנתקות',
      'הגדרות',
      'חזרה',
    ];
    // Compare booleans, so a failure names the missing string and does not dump the source text.
    expect(strings.filter((s) => !all.includes(s))).toEqual([]);
  });
});
