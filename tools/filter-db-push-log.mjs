#!/usr/bin/env node
// Log filter for `supabase db push` in the migrate workflow (14.10 review finding 1: a connection error of the CLI can
// quote the owner URL in a PUBLIC log, and GitHub masks only exact secret matches).
//
//   supabase db push ... 2>&1 | node tools/filter-db-push-log.mjs
//
// Reads the CLI's combined output from stdin and prints ONLY allowlisted lines (the migration being applied, "up to
// date", ERROR: text with its SQLSTATE, "At statement"), after redacting anything shaped like a URL, an `@host`, a
// `password=` or a libpq key=value connection field. Everything else is counted, never printed. Exit 0 always: the
// caller's `set -o pipefail` carries the CLI's exit status.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const REDACTIONS = [
  [/[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[redacted]'],
  [/\S*@[\w.-]+\S*/g, '[redacted]'],
  [/\b(?:password|passwd|pwd)\s*[=:]\s*\S+/gi, 'password=[redacted]'],
  [/\b(?:host|hostaddr|user|dbname|port|sslmode|service)=\S+/gi, '[redacted]'],
];
const ALLOWED = [
  /^Connecting to remote database/i,
  /^Applying migration \S+/,
  /^Remote database is up to date/i,
  /^Finished supabase db push/i,
  /^Initialising login role/i,
  /^ERROR:/,
  /SQLSTATE/,
  /^At statement/i,
];

/** The text to print for one CLI line, or null when the line is withheld. */
export function filterLine(raw) {
  let line = raw.replace(ANSI, '').replace(/\r/g, '').trim();
  if (line === '') return null;
  for (const [pattern, replacement] of REDACTIONS) line = line.replace(pattern, replacement);
  return ALLOWED.some((re) => re.test(line)) ? line : null;
}

async function main() {
  let withheld = 0;
  for await (const raw of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    const out = filterLine(raw);
    if (out === null) {
      if (raw.trim() !== '') withheld += 1;
    } else process.stdout.write(`${out}\n`);
  }
  if (withheld > 0) process.stdout.write(`(${withheld} other output lines withheld: the CLI can quote the connection URL)\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
