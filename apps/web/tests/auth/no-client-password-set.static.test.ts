import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// F2.0 part a, criterion c13 [D2; FR-AUTH-003, FR-AUTH-005, S-16]: "a static test finds no `updateUser` call carrying `password`
// under apps/web". The promise is about what the repository contains, so (like the credential scan in apps/server/tests/
// credentials.static.test.ts) this reads source files at run time. After c13 no web flow sets a password through the Auth client;
// the server does it (c7, c10, c11). Also: the client port that did it is gone from the three auth/session service modules.

// the web tests run in jsdom, where import.meta.url is not a file URL: find the package from the working directory
const webRoot = existsSync(join(process.cwd(), 'src')) ? process.cwd() : join(process.cwd(), 'apps/web');
const srcRoot = join(webRoot, 'src');
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP = new Set(['node_modules', 'dist', 'dist-e2e', 'storybook-static', 'build', 'coverage']);

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP.has(name)) walk(full, out);
    } else if (SOURCE.test(name)) {
      out.push(full);
    }
  }
}

/** The text between the parentheses of every `updateUser(` call in `text` (balanced, strings and templates not special-cased). */
function updateUserArguments(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/updateUser\s*\(/g)) {
    let depth = 1;
    let i = (match.index ?? 0) + match[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i += 1) {
      const ch = text[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    found.push(text.slice(start, i - 1));
  }
  return found;
}

/** Every `updateUser(...)` call whose argument names a `password` key: shorthand, quoted, or `password:`. */
function passwordSetters(text: string): string[] {
  return updateUserArguments(text).filter((args) => /(?:^|[\s,{])['"`]?password['"`]?\s*(?:[:,}]|$)/.test(args));
}

const rel = (file: string): string => relative(webRoot, file).split(sep).join('/');

describe('[F2.0-a c13 D2] the scan itself fires on what it is meant to find (it cannot pass vacuously)', () => {
  it.each([
    ['a password key', 'await client.updateUser({ password });'],
    ['an explicit password value', 'await getClient(config).updateUser({ password: next });'],
    ['a quoted key', "client.updateUser({ 'password': p })"],
    ['password alongside data', 'client.updateUser({ data: { a: 1 }, password: p })'],
    ['password on a later line', 'client.updateUser(\n  {\n    nonce: n,\n    password: p,\n  },\n)'],
  ])('finds %s', (_label, text) => {
    expect(passwordSetters(text).length).toBeGreaterThan(0);
  });

  it.each([
    ['the metadata clear', 'await authClient.updateUser({ data: Object.fromEntries(present.map((key) => [key, null])) });'],
    ['a data-only update', 'client.updateUser({ data: { full_name: n } })'],
    ['the word in another call', 'resetPassword({ password })'],
    ['no updateUser at all', 'const password = "x"'],
  ])('does not flag %s', (_label, text) => {
    expect(passwordSetters(text)).toEqual([]);
  });
});

describe('[F2.0-a c13 D2 S-16] no password is set from the browser', () => {
  it('no updateUser call under apps/web/src carries a password', () => {
    const files: string[] = [];
    walk(srcRoot, files);
    expect(files.length, 'the scan reads something').toBeGreaterThan(50);
    expect(files.map(rel)).toContain('src/services/auth/auth-client.ts');
    const offenders = files.filter((file) => passwordSetters(readFileSync(file, 'utf8')).length > 0).map(rel);
    expect(offenders).toEqual([]);
  });

  it('the metadata clear stays: auth-client.ts still calls updateUser (with data), so the scan above looks at a real call', () => {
    const text = readFileSync(join(srcRoot, 'services/auth/auth-client.ts'), 'utf8');
    expect(updateUserArguments(text).length).toBeGreaterThan(0);
  });

  it.each([
    'src/services/auth/auth-client.ts',
    'src/services/session/session-source.ts',
    'src/services/session/auth-session-source.ts',
  ])('%s no longer declares or implements setPassword', (file) => {
    const hits = readFileSync(join(webRoot, file), 'utf8')
      .split('\n')
      .flatMap((text, i) => (/\bsetPassword\b/.test(text) ? [`${file}:${i + 1}`] : []));
    expect(hits).toEqual([]);
  });
});
