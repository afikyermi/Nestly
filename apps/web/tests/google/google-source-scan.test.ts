// F1.8 P2a criteria 12 and 13 as scans of the web source (a named exception like source-scans.test.ts: tests that read source).
// They read file text only and report file:line, never source text. Derived from .work/google-sign-in/spec.md only.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = existsSync(path.resolve(process.cwd(), 'src')) ? process.cwd() : path.resolve(process.cwd(), 'apps/web');
const SRC = path.join(WEB, 'src');

function filesUnder(dir: string): string[] {
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
const lines = sources.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((text, i) => ({ file: rel(f), line: i + 1, text })));

const PROFILE_KEYS = ['full_name', 'avatar_url', 'picture'];

describe('F1.8 c12 nothing in the web reads the Google profile keys [DR-5][FR-AUTH-005]', () => {
  it('[F1.8 c12][DR-5] the scan is not vacuous: the clearing list names every Google profile key, once each, in one file', () => {
    for (const key of PROFILE_KEYS) {
      const hits = lines.filter((l) => new RegExp(`['"\`]${key}['"\`]`).test(l.text));
      expect(hits.map((h) => `${h.file}:${h.line}`), key).toHaveLength(1);
    }
    const files = new Set(PROFILE_KEYS.flatMap((key) => lines.filter((l) => new RegExp(`['"\`]${key}['"\`]`).test(l.text)).map((l) => l.file)));
    expect([...files]).toHaveLength(1);
  });

  it('[F1.8 c12][DR-5] no property read of full_name, avatar_url or picture, and user_metadata is never read by name', () => {
    const offenders = lines
      .filter((l) => /\.(full_name|avatar_url|picture)\b/.test(l.text) || /user_metadata\s*\??\.\s*\w+|user_metadata\s*\??\.?\[/.test(l.text))
      .map((l) => `${l.file}:${l.line}`);
    expect(offenders).toEqual([]);
  });

  it('[F1.8 c12][DR-5] user_metadata is mentioned only in the Auth client module', () => {
    const files = new Set(lines.filter((l) => /user_metadata/.test(l.text)).map((l) => l.file));
    expect([...files].filter((f) => f !== 'services/auth/auth-client.ts')).toEqual([]);
  });
});

describe('F1.8 c13 the Google start asks for openid email only [NFR-SEC-009][AC-101]', () => {
  it('[F1.8 c13] the web names the scopes "openid email" and never asks for profile', () => {
    const scopeLines = lines.filter((l) => /scopes\s*:/.test(l.text));
    expect(scopeLines.length, 'no scopes: line found').toBeGreaterThan(0);
    for (const l of scopeLines) {
      expect(l.text, `${l.file}:${l.line}`).toMatch(/['"`]openid email['"`]/);
      expect(l.text, `${l.file}:${l.line}`).not.toMatch(/profile/);
    }
  });

  it('[F1.8 c13] the only Google provider call lives in the Auth client module', () => {
    const files = new Set(lines.filter((l) => /provider\s*:\s*['"`]google['"`]/.test(l.text)).map((l) => l.file));
    expect([...files]).toEqual(['services/auth/auth-client.ts']);
  });
});
