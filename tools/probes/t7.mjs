#!/usr/bin/env node
// WORKPLAN 7.3, test T7 — nestly-preview only: with the Data API turned off, REST and GraphQL are refused while
// Auth still answers. Reads PREVIEW_PUBLISHABLE_KEY from .env.preview (Afik fills it in); never prints it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_REF } from '../db-preview.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lines = fs
  .readFileSync(path.join(ROOT, '.env.preview'), 'utf8')
  .replace(/^﻿/, '')
  .split(/\r?\n/);
// Afik named it SUPABASE_PUBLISHABLE_KEY; PREVIEW_PUBLISHABLE_KEY is accepted too. The file is preview-only.
const line = lines.find((l) => /^\s*(export\s+)?(PREVIEW|SUPABASE)_PUBLISHABLE_KEY\s*=/.test(l));
const key = line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
if (!key) {
  // Names only — never values — so the file can be diagnosed without exposing a secret.
  const names = lines.map((l) => (/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l) || [])[1]).filter(Boolean);
  process.stderr.write(`t7: PREVIEW_PUBLISHABLE_KEY is ${line ? 'present but empty' : 'missing'} in .env.preview. Variable names found: ${names.join(', ') || 'none'} (${lines.length} lines).\n`);
  process.exit(1);
}
const scrub = (s) => String(s).split(key).join('***');

const base = `https://${PREVIEW_REF}.supabase.co`;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const results = [];
async function probe(id, p, expectOk) {
  try {
    const r = await fetch(base + p, { headers });
    const body = (await r.text()).slice(0, 140);
    const ok = r.status >= 200 && r.status < 300;
    results.push({ id, pass: ok === expectOk, detail: `${p} → ${r.status} ${scrub(body)}` });
  } catch (e) {
    results.push({ id, pass: !expectOk, detail: `${p} → ${scrub(e && e.message ? e.message : e)}` });
  }
}

await probe('REST refused', '/rest/v1/', false);
await probe('GraphQL refused', '/graphql/v1', false);
// A table path, not just the root: an enabled Data API would answer with a PostgREST table error or rows.
await probe('REST table path refused', '/rest/v1/probe_t7?select=*', false);
await probe('Auth health OK', '/auth/v1/health', true);
await probe('Auth settings OK', '/auth/v1/settings', true);

for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} — ${r.detail}\n`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
