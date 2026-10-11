#!/usr/bin/env node
// WORKPLAN 7.3, test T7 — nestly-preview only: with the Data API turned off, REST and GraphQL are refused while
// Auth still answers. Reads PREVIEW_PUBLISHABLE_KEY from .env.preview (Afik fills it in); never prints it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_REF } from '../db-preview.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const line = fs
  .readFileSync(path.join(ROOT, '.env.preview'), 'utf8')
  .split(/\r?\n/)
  .find((l) => /^\s*PREVIEW_PUBLISHABLE_KEY\s*=/.test(l));
const key = line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
if (!key) {
  process.stderr.write('t7: PREVIEW_PUBLISHABLE_KEY is empty in .env.preview.\n');
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
await probe('Auth health OK', '/auth/v1/health', true);
await probe('Auth settings OK', '/auth/v1/settings', true);

for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} — ${r.detail}\n`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
