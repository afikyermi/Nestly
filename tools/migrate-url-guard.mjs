#!/usr/bin/env node
// URL guard for the `migrate` workflow (I1 F1.1, spec criterion 5).
//
//   node tools/migrate-url-guard.mjs <db-preview|db-production>
//
// Reads APP_OWNER_DATABASE_URL from the environment and refuses it unless it is the session-pooler URL of
// app_owner for that GitHub environment: user `app_owner.<project ref>`, a *.pooler.supabase.com host, port 5432
// (data-model.md rule 5; decisions 2026-10-11 "Migration path", 2026-10-12 the migration secret). It also refuses
// what would make libpq print the password or skip TLS: a password that is not valid percent-encoding or decodes to
// a NUL, a fragment or any raw "#", and an sslmode other than require / verify-full (part a CRITIC findings 1 and 6).
//
// It never prints the URL or any part of it — not on success, not in a reason. A reason names only what was
// expected. Exit 0 when the URL is acceptable, 1 otherwise. `checkMigrationUrl` is exported for unit tests.

import { pathToFileURL } from 'node:url';

export const PROJECT_REFS = Object.freeze({
  'db-preview': 'xmihorrkegrdlbhpktny', // nestly-preview
  'db-production': 'cihugbwafnaujsqabgyp', // nestly-prod
});

const POOLER_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.pooler\.supabase\.com$/;
// Query parameters may override the user, host or port (libpq, node-postgres and pgx all honour them). Only the
// TLS mode is allowed, and only a mode that requires TLS (absent = the workflow's PGSSLMODE=require).
const ALLOWED_QUERY_KEYS = new Set(['sslmode']);
const ALLOWED_SSLMODES = new Set(['require', 'verify-full']);

/**
 * @param {string | undefined} raw  the connection string
 * @param {string} environment      the GitHub environment the job runs in
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkMigrationUrl(raw, environment) {
  const ref = Object.hasOwn(PROJECT_REFS, environment) ? PROJECT_REFS[environment] : undefined;
  if (!ref) return { ok: false, reason: 'unknown environment: expected db-preview or db-production' };
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: `APP_OWNER_DATABASE_URL is not set in ${environment}` };
  }
  if (!/^postgres(ql)?:\/\//.test(raw)) return { ok: false, reason: 'the secret is not a postgresql:// URL' };
  // libpq has no fragment: psql reads `#?host=…` as part of the URL and applies it. Percent-encode a `#` in the password.
  if (raw.includes('#')) return { ok: false, reason: 'the URL contains "#" (percent-encode it as %23 in the password)' };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'the secret is not a valid URL (percent-encode special characters in the password)' };
  }

  let user;
  try {
    user = decodeURIComponent(url.username);
  } catch {
    return { ok: false, reason: 'the URL user is not valid percent-encoding' };
  }
  if (user !== `app_owner.${ref}`) {
    return { ok: false, reason: `the URL user is not app_owner.${ref} - wrong project or role for ${environment}` };
  }
  if (url.hash !== '') return { ok: false, reason: 'the URL has a fragment' };
  if (url.password === '') return { ok: false, reason: 'the URL carries no password' };
  // The URL parser keeps invalid percent-encoding as it is; libpq then refuses it with an error that quotes the decoded
  // password, which the log's secret masking does not cover. Refuse it here, before any psql step sees the URL.
  let password;
  try {
    password = decodeURIComponent(url.password);
  } catch {
    return { ok: false, reason: 'the URL password is not valid percent-encoding (encode "%" as %25)' };
  }
  if (password.includes('\0')) return { ok: false, reason: 'the URL password contains %00' };
  if (!POOLER_HOST.test(url.hostname)) {
    return { ok: false, reason: 'the URL host is not a single *.pooler.supabase.com host' };
  }
  if (url.port !== '5432') return { ok: false, reason: 'the URL port is not 5432 (session pooler)' };
  for (const [key, value] of url.searchParams) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return { ok: false, reason: 'the URL has a query parameter other than sslmode' };
    }
    if (key === 'sslmode' && !ALLOWED_SSLMODES.has(value)) {
      return { ok: false, reason: 'the URL sslmode is not require or verify-full' };
    }
  }
  return { ok: true };
}

function main() {
  const environment = process.argv[2] ?? '';
  const result = checkMigrationUrl(process.env.APP_OWNER_DATABASE_URL, environment);
  if (!result.ok) {
    process.stdout.write(`::error::migrate-url-guard: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(`migrate-url-guard: OK - app_owner.${PROJECT_REFS[environment]} on the session pooler, port 5432\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
