#!/usr/bin/env node
// Screenshots a page of a nestly Vercel preview behind Deployment Protection (Afik, 14.10.2026: preview access for
// checks).
//
//   node tools/preview-shot.mjs <url> <out.png> [--width 375|1024]      (default width 1024)
//
// The bypass secret comes from .env.vercel at the repo root (VERCEL_AUTOMATION_BYPASS_SECRET=…). Afik fills it in;
// agents cannot read it (settings.json denies it, and the guard hook blocks any shell command naming it). This script
// never prints it: not on success, not in an error. PREVIEW_SHOT_ENV_FILE names another file instead (for tests).
//
// Where the secret goes:
//   - only as the x-vercel-protection-bypass header, never in a URL;
//   - only to a deployment of the nestly project (https, nestly-…-afikyermis-projects.vercel.app, or the production
//     alias), and only on requests to the origin of the URL given. Every request of the page passes through one route:
//     a request to that origin is fetched by Playwright with the header and without following redirects, so the header
//     cannot ride a redirect to another host; a request to any other origin goes out untouched. (Playwright's
//     extraHTTPHeaders would send it to every host the page loads from, so it is not used.)
//   - x-vercel-set-bypass-cookie: true goes with it, so Vercel also sets its bypass cookie on that host;
//   - Playwright's debug logging, which prints request headers, is switched off before Playwright loads, and every
//     error is scrubbed of the secret and cut to its first line (Playwright's call logs list request headers).
//
// Prints only the HTTP status the URL answered and the output path. Exits 1 on a refusal, an error, a status of 400 or
// more, or a page that ended on another host (a rejected bypass redirects to Vercel's login). The screenshot is still
// saved in the last three cases, so the page that answered can be seen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ENV_FILE = path.join(ROOT, '.env.vercel');
const ENV_FILE_VAR = 'PREVIEW_SHOT_ENV_FILE';
const SECRET_KEY = 'VERCEL_AUTOMATION_BYPASS_SECRET';
const BYPASS_HEADER = 'x-vercel-protection-bypass';
const COOKIE_HEADER = 'x-vercel-set-bypass-cookie';
// A deployment URL of the project: nestly-<hash>-afikyermis-projects.vercel.app or nestly-git-<branch>-…, as Vercel
// posts them. The character class has no dot, so no other host can match.
const DEPLOYMENT_HOST = /^nestly-[a-z0-9-]+-afikyermis-projects\.vercel\.app$/;
const PRODUCTION_HOST = 'nestly-blue.vercel.app';
// Viewport width -> height. The screenshot is full-page, so the height only shapes the first paint.
const VIEWPORTS = new Map([
  [375, 812],
  [1024, 768],
]);
const DEFAULT_WIDTH = 1024;
const NAVIGATION_TIMEOUT_MS = 45_000;

/** A refusal or a usage error: its message is safe to print as it is. */
class Refused extends Error {}

/** The env file to read: PREVIEW_SHOT_ENV_FILE when set, otherwise .env.vercel at the repo root. */
function envFilePath(env = process.env) {
  const injected = env[ENV_FILE_VAR];
  return injected ? path.resolve(injected) : DEFAULT_ENV_FILE;
}

/** The secret in the text of an env file, or '' when its line is absent or empty. Accepts `export`, quotes and CRLF. */
function parseSecret(text) {
  const keyLine = new RegExp(`^\\s*(?:export\\s+)?${SECRET_KEY}\\s*=`);
  const line = String(text)
    .split(/\r?\n/)
    .find((l) => keyLine.test(l));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

/** Reads and checks the secret. Throws Refused; no message carries the file's content. */
function readSecret(file = envFilePath()) {
  const name = file === DEFAULT_ENV_FILE ? '.env.vercel' : file;
  if (!fs.existsSync(file)) throw new Refused(`${name} not found. Afik creates it with the line ${SECRET_KEY}=<value>.`);
  const secret = parseSecret(fs.readFileSync(file, 'utf8'));
  if (!secret) throw new Refused(`${SECRET_KEY} is missing or empty in ${name}.`);
  // Printable ASCII without spaces: anything else would break the header line, or smuggle another one into it.
  if (!/^[\x21-\x7e]+$/.test(secret)) throw new Refused(`${SECRET_KEY} in ${name} holds characters a header cannot carry.`);
  return secret;
}

/** Parses and checks the target. Returns a URL of the project, or throws Refused before any secret is read or sent. */
function checkTarget(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Refused('the URL is not a valid URL.');
  }
  if (url.protocol !== 'https:') throw new Refused('refusing: the URL must be https.');
  if (url.username || url.password) throw new Refused('refusing: the URL must not carry a user or password.');
  if (url.port) throw new Refused('refusing: the URL must not name a port.');
  const host = url.hostname.toLowerCase();
  if (!DEPLOYMENT_HOST.test(host) && host !== PRODUCTION_HOST) {
    throw new Refused('refusing: the host is not a vercel.app deployment of the nestly project.');
  }
  const params = [...url.searchParams.keys()].map((k) => k.toLowerCase());
  if (params.includes(BYPASS_HEADER) || params.includes(COOKIE_HEADER)) {
    throw new Refused('refusing: the bypass goes in a header, never in the URL. Remove it from the query.');
  }
  return url;
}

/** Parses the command line. Throws Refused on a usage error. */
function parseArgs(argv) {
  const usage = 'usage: node tools/preview-shot.mjs <url> <out.png> [--width 375|1024]';
  const positional = [];
  let width = DEFAULT_WIDTH;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--width') {
      width = Number(argv[i + 1]);
      if (!VIEWPORTS.has(width)) throw new Refused(`--width must be 375 or 1024. ${usage}`);
      i += 1;
    } else if (argv[i].startsWith('--')) {
      throw new Refused(`unknown option ${argv[i]}. ${usage}`);
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional.length !== 2) throw new Refused(usage);
  const [url, out] = positional;
  if (!/\.png$/i.test(out)) throw new Refused(`the output file must end in .png. ${usage}`);
  if (path.basename(out).startsWith('.env')) throw new Refused('refusing to write over an .env file.');
  return { url, out: path.resolve(out), width };
}

/** Replaces every occurrence of the secret, and keeps only the first line (Playwright call logs list headers). */
function scrubber(secret) {
  return (text) => {
    const first = String(text).split(/\r?\n/)[0];
    return secret ? first.split(secret).join('***') : first;
  };
}

async function shoot({ target, out, width, secret }) {
  // Playwright's debug log prints request headers. It reads these when it loads, so they go before the import.
  for (const name of ['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PW_DEBUG']) delete process.env[name];
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    // Service workers are blocked: a request a service worker makes would not pass through the route below.
    const context = await browser.newContext({ viewport: { width, height: VIEWPORTS.get(width) }, serviceWorkers: 'block' });
    await context.route('**/*', async (route) => {
      const request = route.request();
      let origin = '';
      try {
        origin = new URL(request.url()).origin;
      } catch {
        origin = '';
      }
      if (origin !== target.origin) return route.continue();
      try {
        const headers = { ...request.headers(), [BYPASS_HEADER]: secret, [COOKIE_HEADER]: 'true' };
        const response = await route.fetch({ headers, maxRedirects: 0 });
        return await route.fulfill({ response });
      } catch {
        // The request fails in the page (and the navigation, if it was the page itself). The error is not kept: its
        // call log lists the request headers.
        return route.abort('failed');
      }
    });
    const page = await context.newPage();
    const response = await page.goto(target.href, { waitUntil: 'networkidle', timeout: NAVIGATION_TIMEOUT_MS });
    await page.screenshot({ path: out, fullPage: true });
    // The status is what the URL given answered, not the end of a redirect chain: a rejected bypass redirects to
    // Vercel's login page, which answers 200.
    let first = response ? response.request() : null;
    while (first && first.redirectedFrom()) first = first.redirectedFrom();
    const firstResponse = first ? await first.response() : null;
    const left = new URL(page.url()).origin !== target.origin;
    return { status: firstResponse ? firstResponse.status() : 0, left };
  } finally {
    await browser.close();
  }
}

async function main() {
  const { url, out, width } = parseArgs(process.argv.slice(2));
  const target = checkTarget(url);
  const secret = readSecret();
  const scrub = scrubber(secret);
  try {
    const { status, left } = await shoot({ target, out, width, secret });
    process.stdout.write(`status: ${status}\nsaved: ${path.relative(process.cwd(), out) || out}\n`);
    if (left) process.stderr.write('preview-shot: the page ended on another host; the bypass was not accepted, or the app redirected away.\n');
    if (left || status === 0 || status >= 400) process.exitCode = 1;
  } catch (e) {
    process.stderr.write(`preview-shot: ${scrub(e && e.message ? e.message : 'unknown error')}\n`);
    process.exitCode = 1;
  }
}

// Run only when invoked directly; tests import the functions below.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Node's default report of a stray rejection prints the whole error, call log included.
  process.on('unhandledRejection', (e) => {
    process.stderr.write(`preview-shot: unexpected error (${e && e.name ? e.name : 'Error'}); details withheld so the secret cannot leak.\n`);
    process.exitCode = 1;
  });
  main().catch((e) => {
    if (e instanceof Refused) {
      process.stderr.write(`preview-shot: ${e.message}\n`);
    } else {
      process.stderr.write(`preview-shot: unexpected error (${e && e.name ? e.name : 'Error'}); details withheld so the secret cannot leak.\n`);
    }
    process.exitCode = 1;
  });
}

export {
  BYPASS_HEADER,
  COOKIE_HEADER,
  DEFAULT_ENV_FILE,
  ENV_FILE_VAR,
  SECRET_KEY,
  Refused,
  checkTarget,
  envFilePath,
  parseArgs,
  parseSecret,
  readSecret,
  scrubber,
};
