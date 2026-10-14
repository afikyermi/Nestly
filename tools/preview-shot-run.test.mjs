// Tests for tools/preview-shot.mjs, part two: the target confirmation (CRITIC finding 3) and the whole run, in process
// (CRITIC finding 4; the old child-process tests of [PS-7] moved here so that nothing touches the network or the real gh).
// Derived from the expected behaviour as handed to TEST ENGINEER (decision 14.10.2026 "Preview access", points 2 and 3, and
// .work/preview-access/findings.md), and from the exported interface used as a black box:
//   - the secret goes only to a URL that a vercel[bot] deployment status of this repo lists, or to the production alias; any
//     failure to establish that (gh missing, gh error, not a list, no match, another creator) refuses, and the secret file
//     is not even read for a refused target;
//   - the secret reaches the target only through context.route (never extraHTTPHeaders), service workers are blocked,
//     debug switches are cleared before the browser launches, an error is printed scrubbed and as its first line only,
//     and the run fails (exit 1) on a first response >= 400 or when the page ends on another origin.
//
// Labels (the requirement the test asserts):
//   [PS-9]  confirmTarget / createGhLookup, with a fake execFile (no gh, no network)
//   [PS-7]  the command line, in process via main(argv, { env, lookup, launch, stdout, stderr }): refusals exit 1, the
//           secret never reaches an output, the URL is checked before the lookup and before the env file is read
//   [PS-10] the run with a fake browser launcher: routing, service workers, debug switches, scrubbed errors, status, origin
//
// Interface assumptions (each isolated in a helper below, so a wrong guess is a one-place fix):
//   - execFile (injected into createGhLookup) is called as execFile(file, args[, options][, callback]) and may answer either
//     with a callback or with a promise of { stdout, stderr }; the fake supports both and util.promisify. gh's JSON is a
//     list of deployment-status-like objects: { creator: { login }, target_url, environment_url, ... } - the fake answers
//     every call with the same list, whatever the arguments.
//   - stdout / stderr given to main are written with .write(text) (or called as a function); the fakes support both.
//   - launch(options) resolves to a browser with newContext(options) -> context (route, newPage) -> page (goto, url,
//     screenshot); every other method is recorded and answered with undefined.
//   - page.goto resolves to a Playwright Response with the real shape used to find the FIRST response of a redirect
//     chain: response.request() -> Request { redirectedFrom(): Request | null (null at the start of the chain),
//     response(): Promise<Response | null> }. The status reported is the one of that first response.
// The real .env.vercel is never read, gh is never started: every secret file is a temp file holding a fake marker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const shot = await import(pathToFileURL(fileURLToPath(new URL('./preview-shot.mjs', import.meta.url))).href);
const { BYPASS_HEADER, COOKIE_HEADER, ENV_FILE_VAR, SECRET_KEY, REPO, VERCEL_BOT, Refused, checkTarget, confirmTarget, createGhLookup, ghCandidates, main } = shot;

const MARK = 'FAKE-MARKER-SECRET-8d2f61a4';
const DEPLOY = 'https://nestly-abc123-afikyermis-projects.vercel.app';
const OTHER = 'https://nestly-zz9999-afikyermis-projects.vercel.app';
const PROD = 'https://nestly-blue.vercel.app';
const DEBUG_VARS = ['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PW_DEBUG'];

const work = mkdtempSync(join(tmpdir(), 'preview-shot-run-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
let n = 0;
const fresh = () => {
  n += 1;
  const dir = join(work, `t${n}`);
  mkdirSync(dir);
  return dir;
};
const envFile = (content = `${SECRET_KEY}=${MARK}\n`) => {
  const file = join(fresh(), 'env.fake');
  writeFileSync(file, content);
  return file;
};
const missingFile = () => join(fresh(), 'NO-SUCH-ENV-FILE-q7x.env');

// ---------------------------------------------------------------------------------------------------------------------
// fakes

// A fake execFile. respond(file, args) returns gh's stdout or throws. Supports callback, promise and util.promisify styles.
function fakeExecFile(respond) {
  const calls = [];
  const settle = (file, args) => {
    calls.push({ file, args: Array.isArray(args) ? [...args] : args });
    return respond(file, args);
  };
  const fn = (file, args, ...rest) => {
    const cb = rest.find((x) => typeof x === 'function');
    let stdout;
    try {
      stdout = settle(file, args);
    } catch (e) {
      if (cb) {
        cb(e, '', '');
        return undefined;
      }
      return Promise.reject(e);
    }
    if (cb) {
      cb(null, stdout, '');
      return undefined;
    }
    return Promise.resolve({ stdout, stderr: '' });
  };
  fn[promisify.custom] = async (file, args) => ({ stdout: settle(file, args), stderr: '' });
  return { execFile: fn, calls };
}

const status = (url, login = VERCEL_BOT) => ({
  id: 1,
  state: 'success',
  creator: { login, type: 'Bot', id: 35613825 },
  description: 'Deployment has completed',
  environment: 'Preview',
  target_url: url,
  environment_url: url,
  log_url: 'https://vercel.com/team/nestly/abcdef',
  deployment_url: 'https://api.github.com/repos/o/r/deployments/1',
  url: 'https://api.github.com/repos/o/r/deployments/1/statuses/1',
});
const listing = (...items) => () => JSON.stringify(items);
const ghWith = (respond, candidates = ['gh']) => {
  const { execFile, calls } = fakeExecFile(respond);
  return { lookup: createGhLookup({ execFile, candidates }), calls };
};
const enoent = () => Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT', errno: -2, syscall: 'spawn gh' });

// A lookup that must not be called.
function forbiddenLookup() {
  const calls = [];
  const fn = async (...a) => {
    calls.push(a);
    throw new Error('lookup must not be called here');
  };
  return { lookup: fn, calls };
}

// A fake browser launcher. failAt: 'launch' | 'browser.newContext' | 'context.route' | 'context.newPage' | 'page.goto' |
// 'page.screenshot'. message: the error's message. finalUrl: what page.url() / response.url() answer (default: the URL
// that was navigated to). status: the status of the first (and, without `chain`, only) response. chain: the statuses of a
// redirect chain, first to last, e.g. [302, 200]; page.goto then resolves to the LAST response, whose request()
// walks back through redirectedFrom() to the first.
function fakeLauncher({ status: code = 200, chain, finalUrl, failAt, message = 'boom' } = {}) {
  const calls = [];
  const state = { launched: 0, launchArgs: undefined, envAtLaunch: undefined, gotoUrl: undefined };
  const SYNC = new Set(['url', 'on', 'once', 'off', 'setDefaultTimeout', 'setDefaultNavigationTimeout']);
  const final = () => finalUrl ?? state.gotoUrl;
  const statuses = chain ?? [code];
  const requests = [];
  const responses = [];
  statuses.forEach((s, i) => {
    const req = {
      url: () => final(),
      method: () => 'GET',
      redirectedFrom: () => (i === 0 ? null : requests[i - 1]),
      redirectedTo: () => (i === statuses.length - 1 ? null : requests[i + 1]),
      response: async () => responses[i],
      headers: () => ({}),
      isNavigationRequest: () => true,
    };
    const res = {
      status: () => s,
      ok: () => s >= 200 && s < 300,
      url: () => final(),
      headers: () => ({}),
      statusText: () => '',
      request: () => req,
    };
    requests.push(req);
    responses.push(res);
  });
  const values = {
    'browser.newContext': () => context,
    'context.newPage': () => page,
    'page.goto': (url) => {
      state.gotoUrl = url;
      return responses[responses.length - 1];
    },
    'page.url': () => final(),
    'page.screenshot': () => Buffer.from('PNG'),
  };
  const make = (who) =>
    new Proxy(
      {},
      {
        get(_t, p) {
          if (typeof p === 'symbol' || p === 'then') return undefined;
          const key = `${who}.${p}`;
          return (...args) => {
            calls.push({ who, method: String(p), args });
            const fail = failAt === key;
            if (SYNC.has(p)) {
              if (fail) throw new Error(message);
              return values[key]?.(...args);
            }
            return fail ? Promise.reject(new Error(message)) : Promise.resolve(values[key]?.(...args));
          };
        },
      },
    );
  const browser = make('browser');
  const context = make('context');
  const page = make('page');
  const launch = async (...args) => {
    state.launched += 1;
    state.launchArgs = args;
    state.envAtLaunch = Object.fromEntries(DEBUG_VARS.map((k) => [k, process.env[k]]));
    if (failAt === 'launch') throw new Error(message);
    return browser;
  };
  const called = (who, method) => calls.filter((c) => c.who === who && c.method === method);
  return { launch, calls, state, called };
}

// main() in process. env is process.env itself (with only the env-file variable set), so that clearing the debug switches
// is seen whichever object the tool clears; everything touched is restored.
async function run(argv, { file, lookup, launch, preset = {} } = {}) {
  const out = [];
  const err = [];
  const sink = (acc) => {
    const f = (s) => void acc.push(String(s));
    f.write = (s) => {
      acc.push(String(s));
      return true;
    };
    return f;
  };
  const keys = [ENV_FILE_VAR, ...DEBUG_VARS, ...Object.keys(preset)];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of DEBUG_VARS) delete process.env[k];
  if (file === undefined) delete process.env[ENV_FILE_VAR];
  else process.env[ENV_FILE_VAR] = file;
  Object.assign(process.env, preset);
  try {
    const guard = forbiddenLookup();
    const code = await main(argv, { env: process.env, lookup: lookup ?? guard.lookup, launch: launch ?? fakeLauncher().launch, stdout: sink(out), stderr: sink(err) });
    return { code, stdout: out.join(''), stderr: err.join(''), all: out.join('') + err.join('') };
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// A fake Playwright route, as in preview-shot.test.mjs.
function fakeRoute(url) {
  const calls = { fetch: [], fulfill: [], continue: [], abort: [] };
  const base = { url: () => url, method: () => 'GET', headers: () => ({ accept: '*/*' }), postData: () => null, postDataBuffer: () => null, resourceType: () => 'document' };
  const request = new Proxy(base, { get: (t, p) => (typeof p === 'symbol' ? undefined : p in t ? t[p] : () => undefined) });
  const route = {
    request: () => request,
    fetch: async (...a) => {
      calls.fetch.push(a);
      return { status: () => 200, headers: () => ({}), body: async () => Buffer.from('ok') };
    },
    fulfill: async (...a) => void calls.fulfill.push(a),
    continue: async (...a) => void calls.continue.push(a),
    abort: async (...a) => void calls.abort.push(a),
  };
  return { route, calls };
}

// ---------------------------------------------------------------------------------------------------------------------
// [PS-9] confirmTarget with createGhLookup and a fake execFile

const confirm = (url, lookup) => (async () => confirmTarget(checkTarget(url), lookup))();
const refused = (e) => e instanceof Refused;

test('[PS-9] the exports the confirmation rests on: vercel[bot], a repository name, ghCandidates(platform) returns a non-empty list of gh commands', () => {
  assert.equal(VERCEL_BOT, 'vercel[bot]');
  assert.match(REPO, /^[\w.-]+\/[\w.-]+$/);
  assert.equal(typeof ghCandidates, 'function');
  for (const platform of [undefined, 'win32', 'linux', 'darwin']) {
    const list = platform === undefined ? ghCandidates() : ghCandidates(platform);
    assert.ok(Array.isArray(list) && list.length > 0 && list.every((c) => typeof c === 'string' && c.length > 0), `ghCandidates(${platform}) = ${JSON.stringify(list)}`);
  }
});

test('[PS-9] confirmTarget accepts a deployment that a vercel[bot] status lists (and asks gh with an argument array, once something is asked)', async () => {
  const { lookup, calls } = ghWith(listing(status(OTHER), status(DEPLOY)));
  await confirm(DEPLOY, lookup);
  assert.ok(calls.length >= 1, 'gh was never asked');
  assert.ok(calls.every((c) => c.file === 'gh' && Array.isArray(c.args) && c.args.every((a) => typeof a === 'string')), JSON.stringify(calls));
});

test('[PS-9] confirmTarget matches by origin: a listed URL with a trailing slash accepts a target with a path and a query', async () => {
  const { lookup } = ghWith(listing(status(`${DEPLOY}/`)));
  await confirm(`${DEPLOY}/feed?tab=new`, lookup);
  await confirm(DEPLOY, ghWith(listing(status(`${DEPLOY}/feed`))).lookup);
});

const REFUSED_LISTINGS = [
  ['the same URL listed by another creator', listing(status(DEPLOY, 'someone-else'))],
  ['the same URL listed by a look-alike of the bot (evil-vercel[bot])', listing(status(DEPLOY, 'evil-vercel[bot]'))],
  ['the same URL listed by a look-alike of the bot (vercel)', listing(status(DEPLOY, 'vercel'))],
  ['the same URL listed by a user whose login only starts with the bot name', listing(status(DEPLOY, 'vercel[bot]x'))],
  ['a URL that is not listed (another deployment is)', listing(status(OTHER))],
  ['an empty list', listing()],
  ['a listing that only has the target as a prefix of another host', listing(status(`${DEPLOY}.evil.com`))],
  ['a listing of the same host on another port', listing(status(`${DEPLOY}:8443`))],
  ['a listing of the same host over http', listing(status(DEPLOY.replace('https:', 'http:')))],
  ['a list of things that are not objects', () => JSON.stringify([null, 5, 'x', [], DEPLOY])],
  ['status objects without a creator', () => JSON.stringify([{ target_url: DEPLOY, environment_url: DEPLOY }])],
  ['status objects without a URL', () => JSON.stringify([{ creator: { login: VERCEL_BOT } }])],
  ['a JSON object instead of a list ({"message":"Not Found"})', () => '{"message":"Not Found","status":"404"}'],
  ['a JSON object that holds the listing under a key', () => JSON.stringify({ items: [status(DEPLOY)] })],
  ['JSON null', () => 'null'],
  ['a JSON string', () => JSON.stringify(DEPLOY)],
  ['text that is not JSON', () => '<html>Bad gateway</html>'],
  ['empty output', () => ''],
];
for (const [what, respond] of REFUSED_LISTINGS) {
  test(`[PS-9] confirmTarget refuses a deployment target when gh returns ${what}`, async () => {
    const { lookup } = ghWith(respond);
    await assert.rejects(() => confirm(DEPLOY, lookup), refused);
  });
}

test('[PS-9] confirmTarget refuses when gh is missing (ENOENT from every candidate)', async () => {
  const { lookup, calls } = ghWith(() => {
    throw enoent();
  }, ['gh', '/usr/bin/gh']);
  await assert.rejects(() => confirm(DEPLOY, lookup), refused);
  assert.ok(calls.length >= 1);
});

test('[PS-9] confirmTarget refuses when gh fails (not logged in, rate limit, network)', async () => {
  for (const message of ['gh: HTTP 401 Bad credentials', 'gh auth login required', 'connection reset']) {
    const { lookup } = ghWith(() => {
      throw Object.assign(new Error(message), { code: 1, stderr: message });
    });
    await assert.rejects(() => confirm(DEPLOY, lookup), refused, message);
  }
});

test('[PS-9] createGhLookup goes on to the next candidate when the first gh is missing', async () => {
  const { lookup, calls } = ghWith((file) => {
    if (file === 'gh-missing') throw enoent();
    return listing(status(DEPLOY))();
  }, ['gh-missing', 'gh']);
  await confirm(DEPLOY, lookup);
  assert.deepEqual(calls.map((c) => c.file).slice(0, 2), ['gh-missing', 'gh']);
});

test('[PS-9] a lookup that itself throws, rejects or returns nothing refuses a deployment target', async () => {
  const lookups = [
    async () => {
      throw new Error('network down');
    },
    () => {
      throw new Error('network down');
    },
    async () => undefined,
    async () => null,
  ];
  for (const lookup of lookups) {
    await assert.rejects(() => confirm(DEPLOY, lookup), refused, String(lookup));
  }
});

test('[PS-9] the production alias is accepted without asking anyone: no lookup call, no gh', async () => {
  const guard = forbiddenLookup();
  await confirm(PROD, guard.lookup);
  await confirm(`${PROD}/`, guard.lookup);
  assert.equal(guard.calls.length, 0, 'the lookup was called for the production alias');
  const gh = ghWith(() => {
    throw new Error('gh must not be started');
  });
  await confirm(PROD, gh.lookup);
  assert.equal(gh.calls.length, 0, 'gh was started for the production alias');
});

// ---------------------------------------------------------------------------------------------------------------------
// [PS-7] the command line, in process

const REFUSED_RUNS = [
  ['http', ['http://nestly-abc123-afikyermis-projects.vercel.app', 'shot.png']],
  ['an attacker host', ['https://nestly-x.evil.com/?-afikyermis-projects.vercel.app', 'shot.png']],
  ['an appended .evil.com', [`${DEPLOY}.evil.com`, 'shot.png']],
  ['a branch alias', ['https://nestly-git-feat-x-afikyermis-projects.vercel.app', 'shot.png']],
  ['an attacker-shaped slug', ['https://nestly-abc123-evil-afikyermis-projects.vercel.app', 'shot.png']],
  ['userinfo', ['https://user:pw@nestly-abc123-afikyermis-projects.vercel.app', 'shot.png']],
  ['a port', [`${DEPLOY}:8443`, 'shot.png']],
  ['the bypass parameter in the query', [`${DEPLOY}/?x-vercel-protection-bypass=LEAKME-URL-9`, 'shot.png']],
  ['a width outside 375|1024', [DEPLOY, 'shot.png', '--width', '800']],
  ['an output that is not .png', [DEPLOY, 'shot.jpg']],
  ['an output named .env*', [DEPLOY, '.env.png']],
  ['no arguments', []],
  ['three positionals', [DEPLOY, 'shot.png', 'extra']],
];
for (const [what, argv] of REFUSED_RUNS) {
  test(`[PS-7] ${what}: exits 1, prints a refusal, leaks neither the secret nor a URL parameter, asks nobody and launches nothing`, async () => {
    const guard = forbiddenLookup();
    const browser = fakeLauncher();
    const r = await run(argv, { file: envFile(), lookup: guard.lookup, launch: browser.launch });
    assert.equal(r.code, 1, r.all);
    assert.ok(r.stderr.trim().length > 0, 'a refusal prints nothing to stderr');
    assert.ok(!r.all.includes(MARK) && !r.all.includes('LEAKME'), `the output carries a secret: ${r.all}`);
    assert.equal(guard.calls.length, 0, 'the lookup was called for an input that fails the URL or argument check');
    assert.equal(browser.state.launched, 0, 'a browser was launched after a refusal');
  });
}

test('[PS-7] a refused URL is checked before the env file is read: a missing or unreadable file changes nothing in the message', async () => {
  const dir = fresh();
  const reference = await run(['http://nestly-abc123-afikyermis-projects.vercel.app', 'shot.png'], { file: envFile() });
  assert.equal(reference.code, 1, reference.all);
  for (const file of [missingFile(), dir]) {
    const r = await run(['http://nestly-abc123-afikyermis-projects.vercel.app', 'shot.png'], { file });
    assert.equal(r.code, 1, r.all);
    assert.equal(r.stderr, reference.stderr, 'the refusal differs with an unreadable env file, so the file was read first');
    assert.ok(!/NO-SUCH-ENV-FILE|EISDIR|ENOENT/.test(r.all), r.all);
  }
});

test('[PS-7] with a valid target and no usable secret the run stops before the browser, exits 1 and prints no value from the file', async () => {
  const files = [
    ['an empty file', ''],
    ['a file without the key', `OTHER=${MARK}\n`],
    ['the key commented out', `# ${SECRET_KEY}=${MARK}\n`],
    ['an empty value', `${SECRET_KEY}=\nOTHER=${MARK}\n`],
  ];
  for (const [what, content] of files) {
    const browser = fakeLauncher();
    const r = await run([PROD, join(fresh(), 'shot.png')], { file: envFile(content), launch: browser.launch });
    assert.equal(r.code, 1, `${what}: ${r.all}`);
    assert.ok(!r.all.includes(MARK), `${what}: ${r.all}`);
    assert.equal(browser.state.launched, 0, `${what}: a browser was launched`);
  }
});

test('[PS-7] a missing env file with a valid target exits 1 without a browser and without a stack trace', async () => {
  const browser = fakeLauncher();
  const r = await run([PROD, join(fresh(), 'shot.png')], { file: missingFile(), launch: browser.launch });
  assert.equal(r.code, 1, r.all);
  assert.ok(!/\n\s+at\s/.test(r.all), `a stack trace was printed: ${r.all}`);
  assert.equal(browser.state.launched, 0);
});

test('[PS-9] a deployment target that gh does not list is refused by main before the env file is read and before any browser', async () => {
  const unlisted = ghWith(listing(status(OTHER))).lookup;
  const browser = fakeLauncher();
  const withFile = await run([DEPLOY, join(fresh(), 'a.png')], { file: envFile(), lookup: unlisted, launch: browser.launch });
  const withoutFile = await run([DEPLOY, join(fresh(), 'a.png')], { file: missingFile(), lookup: unlisted, launch: browser.launch });
  assert.equal(withFile.code, 1, withFile.all);
  assert.equal(withoutFile.code, 1, withoutFile.all);
  assert.equal(withoutFile.stderr, withFile.stderr, 'the message differs when the env file is missing, so the file was read before the target was confirmed');
  assert.ok(!withFile.all.includes(MARK));
  assert.equal(browser.state.launched, 0, 'a browser was launched for a target that is not confirmed');
});

test('[PS-9] a listed deployment target is shot end to end: exit 0, the browser launched, nothing printed carries the secret', async () => {
  const browser = fakeLauncher();
  const listed = ghWith(listing(status(DEPLOY))).lookup;
  const r = await run([DEPLOY, join(fresh(), 'a.png')], { file: envFile(), lookup: listed, launch: browser.launch });
  assert.equal(r.code, 0, r.all);
  assert.equal(browser.state.launched, 1);
  assert.ok(!r.all.includes(MARK));
});

// ---------------------------------------------------------------------------------------------------------------------
// [PS-10] the run, with a fake browser

const shoot = (browser, extra = {}) => run([PROD, join(fresh(), 'a.png')], { file: envFile(), launch: browser.launch, ...extra });

test('[PS-10] the secret goes through context.route only: no extraHTTPHeaders anywhere, no secret in any browser call, and the registered handler adds it for the target origin only', async () => {
  const browser = fakeLauncher();
  const r = await shoot(browser);
  assert.equal(r.code, 0, r.all);

  const routes = browser.called('context', 'route');
  assert.ok(routes.length >= 1, 'no context.route call: the header is not routed');
  assert.ok(browser.called('page', 'route').length === 0, 'the route was put on the page, not the context');
  const everything = JSON.stringify([browser.state.launchArgs, ...browser.calls.map((c) => [c.who, c.method, c.args])]);
  assert.ok(!/extraHTTPHeaders/i.test(everything), 'extraHTTPHeaders is used');
  assert.ok(browser.calls.every((c) => !/ExtraHTTPHeaders/.test(c.method)), 'setExtraHTTPHeaders is called');
  assert.ok(!everything.includes(MARK), 'the secret appears in a browser call');
  assert.ok(!everything.toLowerCase().includes(BYPASS_HEADER), 'the bypass header appears in a browser call');

  const handler = routes[0].args.find((a) => typeof a === 'function');
  assert.equal(typeof handler, 'function', 'context.route was not given a handler');
  const same = fakeRoute(`${PROD}/feed`);
  await handler(same.route);
  assert.equal(same.calls.fetch.length, 1);
  assert.equal(same.calls.fetch[0][0]?.headers?.[BYPASS_HEADER], MARK);
  assert.equal(String(same.calls.fetch[0][0]?.headers?.[COOKIE_HEADER]), 'true');
  for (const other of ['https://evil.example/x', `${PROD}.evil.com/`, DEPLOY, 'https://fonts.gstatic.com/a.woff2']) {
    const o = fakeRoute(other);
    await handler(o.route);
    assert.equal(o.calls.fetch.length, 0, `${other} was fetched with the header`);
    assert.equal(o.calls.continue.length, 1, `${other} was not continued`);
    assert.equal(o.calls.continue[0].length, 0, `${other}: continue() was given arguments`);
  }
});

test('[PS-10] the handler is bound to the confirmed deployment origin, not to the production alias', async () => {
  const browser = fakeLauncher();
  const r = await run([DEPLOY, join(fresh(), 'a.png')], { file: envFile(), lookup: ghWith(listing(status(DEPLOY))).lookup, launch: browser.launch });
  assert.equal(r.code, 0, r.all);
  const handler = browser.called('context', 'route')[0]?.args.find((a) => typeof a === 'function');
  assert.equal(typeof handler, 'function');
  const mine = fakeRoute(`${DEPLOY}/`);
  await handler(mine.route);
  assert.equal(mine.calls.fetch.length, 1);
  const prod = fakeRoute(`${PROD}/`);
  await handler(prod.route);
  assert.equal(prod.calls.fetch.length, 0, 'the production alias got the header from a handler built for a deployment');
});

test('[PS-10] service workers are blocked in the browser context', async () => {
  const browser = fakeLauncher();
  const r = await shoot(browser);
  assert.equal(r.code, 0, r.all);
  const created = browser.called('browser', 'newContext');
  assert.equal(created.length, 1);
  assert.equal(created[0].args[0]?.serviceWorkers, 'block');
});

test('[PS-10] DEBUG, DEBUG_FILE, PWDEBUG and PW_DEBUG are cleared before the browser is launched', async () => {
  const browser = fakeLauncher();
  const r = await shoot(browser, { preset: { DEBUG: 'pw:api,pw:browser*', DEBUG_FILE: join(fresh(), 'debug.log'), PWDEBUG: '1', PW_DEBUG: '1' } });
  assert.equal(r.code, 0, r.all);
  assert.equal(browser.state.launched, 1);
  for (const k of DEBUG_VARS) {
    assert.ok(!browser.state.envAtLaunch[k], `${k} was still set when the browser was launched: ${browser.state.envAtLaunch[k]}`);
    const passed = browser.state.launchArgs?.[0]?.env;
    if (passed) assert.ok(!passed[k], `${k} is in the launch options' env`);
  }
});

// The thrown message carries the secret on its first line, and a multi-line call log that lists the request headers.
const callLog = `net::ERR_FAILED at ${PROD}/?${BYPASS_HEADER}=${MARK} ${MARK}\nCall log:\n  - navigating to "${PROD}/", waiting until "load"\n  - ${BYPASS_HEADER}: ${MARK}\n  - ${COOKIE_HEADER}: true`;
for (const failAt of ['launch', 'browser.newContext', 'context.route', 'context.newPage', 'page.goto', 'page.screenshot']) {
  test(`[PS-10] an error thrown at ${failAt} exits 1 and is printed scrubbed, as its first line only`, async () => {
    const browser = fakeLauncher({ failAt, message: callLog });
    const r = await shoot(browser);
    assert.equal(r.code, 1, r.all);
    assert.ok(!r.all.includes(MARK), `the secret is in the output: ${r.all}`);
    assert.ok(!r.all.includes('Call log') && !r.all.includes('waiting until') && !r.all.includes(COOKIE_HEADER), `more than the first line was printed: ${r.all}`);
    assert.ok(r.all.includes('net::ERR_FAILED'), `the first line of the error is gone: ${r.all}`);
    assert.ok(!/\n\s+at\s/.test(r.all), `a stack trace was printed: ${r.all}`);
  });
}

for (const [code, expected] of [[200, 0], [204, 0], [302, 0], [399, 0], [400, 1], [401, 1], [403, 1], [404, 1], [500, 1], [503, 1]]) {
  test(`[PS-10] a first response with status ${code} exits ${expected}`, async () => {
    const browser = fakeLauncher({ status: code });
    const r = await shoot(browser);
    assert.equal(r.code, expected, r.all);
    assert.ok(!r.all.includes(MARK));
  });
}

// goto resolves to the last response of a redirect chain; the status that counts is the first response's.
for (const [chain, expected] of [[[401, 200], 1], [[503, 302, 200], 1], [[302, 200], 0], [[301, 302, 200], 0]]) {
  test(`[PS-10] a redirect chain with statuses ${chain.join(' -> ')} exits ${expected} (the first response decides)`, async () => {
    const browser = fakeLauncher({ chain });
    const r = await shoot(browser);
    assert.equal(r.code, expected, r.all);
    assert.ok(!r.all.includes(MARK));
  });
}

const OFF_ORIGIN = [
  ['another host', 'https://evil.example/login'],
  ['the host with .evil.com appended', `${PROD}.evil.com/`],
  ['a prefix host', 'https://evil-nestly-blue.vercel.app/'],
  ['a deployment host instead of the alias', `${DEPLOY}/`],
  ['http on the same host', 'http://nestly-blue.vercel.app/'],
  ['the same host on another port', `${PROD}:8443/`],
  ['about:blank', 'about:blank'],
  ['a Vercel login page', 'https://vercel.com/login?next=%2Fsso-api'],
];
for (const [what, finalUrl] of OFF_ORIGIN) {
  test(`[PS-10] a status 200 page that ends on ${what} exits 1`, async () => {
    const browser = fakeLauncher({ status: 200, finalUrl });
    const r = await shoot(browser);
    assert.equal(r.code, 1, r.all);
    assert.ok(!r.all.includes(MARK));
  });
}

test('[PS-10] a status 200 page that ends on the same origin (another path, query, fragment) exits 0 and prints no secret', async () => {
  for (const finalUrl of [`${PROD}/`, `${PROD}/feed?tab=new`, `${PROD}/login#next`]) {
    const browser = fakeLauncher({ status: 200, finalUrl });
    const r = await shoot(browser);
    assert.equal(r.code, 0, `${finalUrl}: ${r.all}`);
    assert.ok(!r.all.includes(MARK) && !r.all.toLowerCase().includes(BYPASS_HEADER), r.all);
    assert.equal(browser.called('page', 'screenshot').length, 1, 'no screenshot was taken');
  }
});
