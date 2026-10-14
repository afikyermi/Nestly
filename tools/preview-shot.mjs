#!/usr/bin/env node
// Screenshots a page of a nestly Vercel preview behind Deployment Protection (Afik, 14.10.2026: preview access for
// checks).
//
//   node tools/preview-shot.mjs <url> <out.png> [--width 375|1024]      (default width 1024)
//
// The bypass secret comes from .env.vercel at the repo root (VERCEL_AUTOMATION_BYPASS_SECRET=…). Afik fills it in;
// agents cannot read it (settings.json denies it, and the guard hook blocks any shell command naming it). This script
// never prints it: not on success, not in an error. PREVIEW_SHOT_ENV_FILE names another file instead (for tests). The
// default path is resolved only when the tool runs; the exported reader takes an explicit path.
//
// Where the secret goes:
//   - only as the x-vercel-protection-bypass header, never in a URL;
//   - only to a deployment of the nestly project (https, nestly-<hash>-afikyermis-projects.vercel.app, or the production
//     alias). The host pattern is a first filter and is not trusted on its own (Vercel does not document the
//     `-afikyermis-projects` suffix as reserved): before the secret is read, the origin must also be the environment_url
//     or target_url of a deployment status created by vercel[bot] on afikyermi/Nestly, among the last deployments,
//     listed with `gh api` (no shell). The production alias needs no lookup. Without gh the tool refuses;
//   - only on requests to the origin of the URL given. Every request of the page passes through one route:
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

import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ENV_FILE = path.join(ROOT, '.env.vercel');
const ENV_FILE_VAR = 'PREVIEW_SHOT_ENV_FILE';
const SECRET_KEY = 'VERCEL_AUTOMATION_BYPASS_SECRET';
const BYPASS_HEADER = 'x-vercel-protection-bypass';
const COOKIE_HEADER = 'x-vercel-set-bypass-cookie';
// The unique deployment URL of the project, as Vercel posts it: nestly-<hash>-afikyermis-projects.vercel.app. The hash
// has no hyphen, so a team whose slug merely ends in -afikyermis-projects does not match. Branch aliases
// (nestly-git-<branch>-…) are not accepted: a hyphenated branch name makes the team slug ambiguous.
const DEPLOYMENT_HOST = /^nestly-[a-z0-9]+-afikyermis-projects\.vercel\.app$/;
const PRODUCTION_HOST = 'nestly-blue.vercel.app';
// Viewport width -> height. The screenshot is full-page, so the height only shapes the first paint.
const VIEWPORTS = new Map([
  [375, 812],
  [1024, 768],
]);
const DEFAULT_WIDTH = 1024;
const NAVIGATION_TIMEOUT_MS = 45_000;
// The GitHub lookup that confirms a non-production target (see the header comment).
const REPO = 'afikyermi/Nestly';
const VERCEL_BOT = 'vercel[bot]';
const LOOKUP_DEPLOYMENTS = 40;
const LOOKUP_STATUSES = 10;
const GH_TIMEOUT_MS = 30_000;
const GH_MAX_BUFFER = 5 * 1024 * 1024;

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

/**
 * Reads and checks the secret in the file at `file`. The path is required: there is deliberately no default here, so
 * importing this module and calling the reader cannot reach the real secret file. Throws Refused; no message carries
 * the file's content.
 */
function readSecret(file) {
  if (typeof file !== 'string' || file === '') throw new TypeError('readSecret needs an explicit file path.');
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

/** The origin of a URL string, or '' when it is not a URL. */
function originOf(text) {
  try {
    return new URL(String(text)).origin;
  } catch {
    return '';
  }
}

/** The first line of a text, cut to 200 characters. */
function firstLine(text) {
  return String(text).split(/\r?\n/)[0].slice(0, 200);
}

/** Where gh may be: on PATH, and on Windows at its installer's default place. */
function ghCandidates(platform = process.platform) {
  return platform === 'win32' ? ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe'] : ['gh'];
}

/** True when `status` is a deployment status created by vercel[bot] whose environment_url or target_url is `origin`. */
function isVercelStatusFor(status, origin) {
  if (typeof status !== 'object' || status === null) return false;
  const creator = status.creator;
  if (typeof creator !== 'object' || creator === null || creator.login !== VERCEL_BOT) return false;
  return [status.environment_url, status.target_url].some((u) => typeof u === 'string' && originOf(u) === origin);
}

/**
 * The default lookup: `async (origin) => boolean`, true when a vercel[bot] deployment status of REPO, among the last
 * LOOKUP_DEPLOYMENTS deployments (newest first), lists `origin`. It runs `gh api` through execFile, no shell. Throws
 * Refused when gh is unavailable, fails, or answers something that is not a list.
 * `execFile` (promisified, like node:util's) and `candidates` are injectable for tests.
 */
function createGhLookup({ execFile = promisify(execFileCallback), candidates = ghCandidates() } = {}) {
  async function gh(endpoint) {
    for (const file of candidates) {
      let stdout;
      try {
        ({ stdout } = await execFile(file, ['api', endpoint], { encoding: 'utf8', timeout: GH_TIMEOUT_MS, maxBuffer: GH_MAX_BUFFER, windowsHide: true }));
      } catch (e) {
        if (e && e.code === 'ENOENT') continue;
        const why = firstLine((e && (e.stderr || e.message)) || 'unknown error');
        throw new Refused(`refusing: the deployments of ${REPO} could not be listed with gh (${why}). Run \`gh auth login\`.`);
      }
      let list;
      try {
        list = JSON.parse(stdout);
      } catch {
        list = null;
      }
      if (!Array.isArray(list)) throw new Refused(`refusing: gh did not answer a list for ${endpoint}.`);
      return list;
    }
    throw new Refused('refusing: the GitHub CLI (gh) is not available, so the deployment cannot be confirmed. Install gh and run `gh auth login`.');
  }

  return async (origin) => {
    const deployments = await gh(`repos/${REPO}/deployments?per_page=${LOOKUP_DEPLOYMENTS}`);
    for (const deployment of deployments.slice(0, LOOKUP_DEPLOYMENTS)) {
      const id = typeof deployment === 'object' && deployment !== null ? deployment.id : undefined;
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const statuses = await gh(`repos/${REPO}/deployments/${id}/statuses?per_page=${LOOKUP_STATUSES}`);
      if (statuses.some((status) => isVercelStatusFor(status, origin))) return true;
    }
    return false;
  };
}

/**
 * Confirms a target that passed checkTarget, before the secret is read: the production alias passes; any other origin
 * must be listed by `lookup`. A lookup that fails, or answers anything but true, refuses (fail closed).
 */
async function confirmTarget(target, lookup) {
  if (target.hostname.toLowerCase() === PRODUCTION_HOST) return;
  let listed = false;
  try {
    listed = await lookup(target.origin);
  } catch (e) {
    if (e instanceof Refused) throw e;
    throw new Refused(`refusing: the deployments of ${REPO} could not be listed.`);
  }
  if (listed !== true) {
    throw new Refused(`refusing: no ${VERCEL_BOT} deployment status of ${REPO} lists this origin among the last ${LOOKUP_DEPLOYMENTS} deployments.`);
  }
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

/**
 * The route every request of the page passes through. A request to `targetOrigin` is fetched with the bypass and
 * cookie headers and without following redirects, then fulfilled; a request to any other origin (another host, or
 * http on the same host) continues untouched. A failed fetch aborts the request; its error is not kept, since its
 * call log lists the request headers.
 */
function createRouteHandler(targetOrigin, secret) {
  return async (route) => {
    const request = route.request();
    let origin = '';
    try {
      origin = new URL(request.url()).origin;
    } catch {
      origin = '';
    }
    if (origin !== targetOrigin) return route.continue();
    try {
      const headers = { ...request.headers(), [BYPASS_HEADER]: secret, [COOKIE_HEADER]: 'true' };
      const response = await route.fetch({ headers, maxRedirects: 0 });
      return await route.fulfill({ response });
    } catch {
      // The request fails in the page (and the navigation, if it was the page itself).
      return route.abort('failed');
    }
  };
}

/** The default browser launcher: Playwright's Chromium. Playwright loads here, after shoot() has cleared its debug variables. */
async function launchChromium() {
  const { chromium } = await import('@playwright/test');
  return chromium.launch();
}

/** `launch` (async, returns a Playwright-shaped browser) is injectable for tests. */
async function shoot({ target, out, width, secret }, launch = launchChromium) {
  // Playwright's debug log prints request headers. It reads these when it loads, so they go before the launcher runs.
  for (const name of ['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PW_DEBUG']) delete process.env[name];
  const browser = await launch();
  try {
    // Service workers are blocked: a request a service worker makes would not pass through the route below.
    const context = await browser.newContext({ viewport: { width, height: VIEWPORTS.get(width) }, serviceWorkers: 'block' });
    await context.route('**/*', createRouteHandler(target.origin, secret));
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

/**
 * The whole run, returning the exit code instead of setting it. The env file path is resolved here and nowhere else.
 * `deps` is for tests: env, lookup (see createGhLookup), launch (see shoot), stdout, stderr.
 */
async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const lookup = deps.lookup ?? createGhLookup();
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let args;
  let target;
  let secret;
  try {
    args = parseArgs(argv);
    target = checkTarget(args.url);
    await confirmTarget(target, lookup);
    secret = readSecret(envFilePath(env));
  } catch (e) {
    if (e instanceof Refused) stderr.write(`preview-shot: ${e.message}\n`);
    else stderr.write(`preview-shot: unexpected error (${e && e.name ? e.name : 'Error'}); details withheld so the secret cannot leak.\n`);
    return 1;
  }
  const scrub = scrubber(secret);
  try {
    const { status, left } = await shoot({ target, out: args.out, width: args.width, secret }, deps.launch);
    stdout.write(`status: ${status}\nsaved: ${path.relative(process.cwd(), args.out) || args.out}\n`);
    if (left) stderr.write('preview-shot: the page ended on another host; the bypass was not accepted, or the app redirected away.\n');
    return left || status === 0 || status >= 400 ? 1 : 0;
  } catch (e) {
    stderr.write(`preview-shot: ${scrub(e && e.message ? e.message : 'unknown error')}\n`);
    return 1;
  }
}

// Run only when invoked directly; tests import the functions below.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Node's default report of a stray rejection prints the whole error, call log included.
  const withheld = (e) => {
    process.stderr.write(`preview-shot: unexpected error (${e && e.name ? e.name : 'Error'}); details withheld so the secret cannot leak.\n`);
    process.exitCode = 1;
  };
  process.on('unhandledRejection', withheld);
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, withheld);
}

export {
  BYPASS_HEADER,
  COOKIE_HEADER,
  DEFAULT_ENV_FILE,
  ENV_FILE_VAR,
  LOOKUP_DEPLOYMENTS,
  REPO,
  SECRET_KEY,
  VERCEL_BOT,
  Refused,
  checkTarget,
  confirmTarget,
  createGhLookup,
  createRouteHandler,
  envFilePath,
  ghCandidates,
  main,
  parseArgs,
  parseSecret,
  readSecret,
  scrubber,
  shoot,
};
