// F1.2 criteria 11 (import scan), 26 (gender-neutral copy grep) and 27 (no hex outside tokens in screens).
// The spec itself asks for these as scans of the source tree. They read file text only; they never import or run it.
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

/** Every import / require / dynamic-import specifier in a source text. */
function specifiers(text: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;
  for (const m of text.matchAll(re)) if (m[1] !== undefined) out.push(m[1]);
  return out;
}

describe('the source scan is not vacuous', () => {
  it('[F1.2 c11] finds the web source files, including screens', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((f) => rel(f).startsWith('components/'))).toBe(true);
    expect(sources.some((f) => rel(f).startsWith('pages/') || rel(f).startsWith('features/'))).toBe(true);
  });

  it('[F1.2 c11] the specifier extractor sees plain, side-effect, dynamic and require imports', () => {
    const text = `import a from '@supabase/supabase-js';\nimport '@clerk/x';\nconst b = await import("firebase/auth");\nconst c = require('auth0');`;
    expect(specifiers(text)).toEqual(['@supabase/supabase-js', '@clerk/x', 'firebase/auth', 'auth0']);
  });
});

describe('one seam (11)', () => {
  it('[F1.2 c11][FR-AUTH-004] no file under pages/, components/ or features/, and no guard, imports @supabase/* or any other auth SDK', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      for (const s of specifiers(read(f))) {
        if (AUTH_SDKS.some((re) => re.test(s))) offenders.push(`${rel(f)} -> ${s}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('[F1.2 c11][Q1] F1.2 adds no supabase-js and no VITE_SUPABASE_* variable', () => {
    const pkg: unknown = JSON.parse(readFileSync(path.join(WEB, 'package.json'), 'utf8'));
    const deps = [...keysUnder(pkg, 'dependencies'), ...keysUnder(pkg, 'devDependencies')];
    expect(deps.length).toBeGreaterThan(0);
    expect(deps.filter((d) => AUTH_SDKS.some((re) => re.test(d)))).toEqual([]);
    expect(sources.filter((f) => read(f).includes('VITE_SUPABASE')).map(rel)).toEqual([]);
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
          if (/[א-ת]/.test(line) && slashForm.test(line)) offenders.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('[F1.2 c26][NFR-USAB-003] the specified strings are present as specified: Welcome, actions, lead, shell, menu, placeholder', () => {
    const all = sources.map(read).join('\n');
    for (const s of [
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
    ]) {
      expect(all, s).toContain(s);
    }
  });
});

describe('design consistency (27)', () => {
  it('[F1.2 c27][NFR-USAB-004] screens (pages/, features/) use tokens only: no hex colour literal and no rgb()/hsl() literal', () => {
    const screens = sources.filter((f) => /^(pages|features)\//.test(rel(f)));
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const fn = /\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/;
    const offenders = screens.filter((f) => hex.test(read(f)) || fn.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});
