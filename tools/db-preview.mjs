#!/usr/bin/env node
// Runs SQL against nestly-preview — and only nestly-preview (decisions.md, 2026-10-11, "Working rules").
//
//   node tools/db-preview.mjs <file.sql>     run a SQL file
//   node tools/db-preview.mjs -e "<sql>"     run inline SQL
//
// The connection string comes from .env.preview at the repo root (PREVIEW_DATABASE_URL=…). Afik fills it in;
// agents cannot read it (settings.json denies it, and the guard hook blocks any shell command naming it).
// This script never prints it: not on success, not in an error.
//
// Refuses to run unless the connection is to the preview project, and refuses the production project outright.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

const PREVIEW_REF = 'xmihorrkegrdlbhpktny'; // nestly-preview (Frankfurt), since 2026-10-11
// Never a target: production, and the two retired projects of the first setup (opened in Asia by mistake).
const REFUSED_REFS = ['cihugbwafnaujsqabgyp', 'wnzwrkgnpvgincottwfm', 'ncsxugphtawrwotimymp'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.preview');

function fail(message) {
  process.stderr.write(`db-preview: ${message}\n`);
  process.exit(1);
}

function readUrl() {
  if (!fs.existsSync(ENV_FILE)) fail('.env.preview not found at the repo root. Afik creates it (see WORKPLAN 7.3).');
  const line = fs
    .readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*PREVIEW_DATABASE_URL\s*=/.test(l));
  const value = line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
  if (!value) fail('PREVIEW_DATABASE_URL is empty in .env.preview.');
  return value;
}

function checkTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('PREVIEW_DATABASE_URL is not a valid URL.');
  }
  const where = `${url.username}@${url.hostname}`.toLowerCase();
  if (REFUSED_REFS.some((ref) => where.includes(ref))) fail('refusing: the connection string points at nestly-prod or a retired project.');
  const preview = url.username.toLowerCase().endsWith(`.${PREVIEW_REF}`) || url.hostname.toLowerCase() === `db.${PREVIEW_REF}.supabase.co`;
  if (!preview) fail('refusing: the connection string is not for nestly-preview.');
  if (!/^postgres(ql)?:$/.test(url.protocol)) fail('PREVIEW_DATABASE_URL must be a postgres:// URL.');
  return url;
}

// Removes the URL, the password and the user from any text before it is printed.
function scrubber(raw, url) {
  const secrets = [raw, url.password, decodeURIComponent(url.password || '')].filter((s) => s && s.length >= 4);
  return (text) => secrets.reduce((t, s) => t.split(s).join('***'), String(text));
}

function readSql(argv) {
  if (argv[0] === '-e' && argv[1]) return argv[1];
  if (argv[0] && argv[0] !== '-e') {
    const file = path.resolve(argv[0]);
    if (!fs.existsSync(file)) fail(`no such file: ${argv[0]}`);
    if (path.basename(file).startsWith('.env')) fail('refusing to run an .env file as SQL.');
    return fs.readFileSync(file, 'utf8');
  }
  fail('usage: node tools/db-preview.mjs <file.sql> | -e "<sql>"');
  return '';
}

async function main() {
  const sqlText = readSql(process.argv.slice(2));
  const raw = readUrl();
  const url = checkTarget(raw);
  const scrub = scrubber(raw, url);
  const sql = postgres(raw, { ssl: 'require', prepare: false, max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
  try {
    // Simple query protocol: several statements in one call; each statement's rows come back in order.
    const result = await sql.unsafe(sqlText).simple();
    const sets = Array.isArray(result) && Array.isArray(result[0]) ? result : [result];
    sets.forEach((rows, i) => {
      const cmd = rows && rows.command ? rows.command : 'OK';
      const data = Array.isArray(rows) && rows.length ? `\n${scrub(JSON.stringify(rows, null, 2))}` : '';
      process.stdout.write(`-- [${i + 1}] ${cmd}${typeof rows?.count === 'number' ? ` (${rows.count})` : ''}${data}\n`);
    });
  } catch (e) {
    const detail = [e && e.message, e && e.detail, e && e.hint].filter(Boolean).join(' | ');
    process.stderr.write(`db-preview: SQL error: ${scrub(detail || 'unknown error')}\n`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run only when invoked directly; probes import the checks below.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => fail(`unexpected error (${e && e.name ? e.name : 'Error'}); details withheld so the connection string cannot leak.`));
}

export { PREVIEW_REF, readUrl, checkTarget, scrubber };
