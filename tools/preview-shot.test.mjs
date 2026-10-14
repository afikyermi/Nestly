// Tests for tools/preview-shot.mjs (Afik's decision 14.10.2026: preview access for checks).
// Derived from the expected behaviour as handed to TEST ENGINEER, and from the exported interface used as a black box:
//   the Vercel bypass secret travels only as the x-vercel-protection-bypass header - never in a URL, argv, log, output or
//   artifact - and only to this project's unique deployment host (nestly-<hash without hyphens>-afikyermis-projects
//   .vercel.app) or the production alias nestly-blue.vercel.app; branch aliases and other slugs are refused; every check
//   fails closed.
//
// Labels (the requirement the test asserts):
//   [PS-1] parseSecret    [PS-2] readSecret(file, name = file): file required, name only labels refusals, no message carries the value
//   [PS-3] the real env file is out of reach: no exported default path, main() reads the file PREVIEW_SHOT_ENV_FILE names in deps.env
//   [PS-4] checkTarget    [PS-5] parseArgs    [PS-6] scrubber
//   [PS-8] createRouteHandler: the header goes only to requests of the target origin, never follows a redirect, other
//          origins continue untouched, a failed fetch aborts and keeps no message
//   [PS-M] a mutation check: a handler that adds the header for every origin (or follows redirects) must fail [PS-8]
// The command line ([PS-7]), the target confirmation ([PS-9]) and the run with a fake browser ([PS-10]) are in
// tools/preview-shot-run.test.mjs, in process, with no gh and no network.
// The real .env.vercel is never read, resolved or named: every test names its own temp file, with a fake marker as the
// secret, and every call of main() carries PREVIEW_SHOT_ENV_FILE in the env it is given (no case runs main without it).
// Assumption about parseArgs: it takes the arguments after the script name, e.g. [url, out, '--width', '375'], and the
// result has target (or url), out (resolved against the working directory) and width (a number, 1024 by default).
// Assumption about createRouteHandler: it reads the request URL with route.request().url().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const shotPath = fileURLToPath(new URL('./preview-shot.mjs', import.meta.url));
const shot = await import(pathToFileURL(shotPath).href);
const { BYPASS_HEADER, COOKIE_HEADER, ENV_FILE_VAR, SECRET_KEY, Refused, checkTarget, createRouteHandler, main, parseArgs, parseSecret, readSecret, scrubber } = shot;

const KEY = 'VERCEL_AUTOMATION_BYPASS_SECRET';
const MARK = 'FAKE-MARKER-SECRET-3b9d51e7';
const work = mkdtempSync(join(tmpdir(), 'preview-shot-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
let n = 0;
const fresh = () => {
  n += 1;
  const dir = join(work, `t${n}`);
  mkdirSync(dir);
  return dir;
};
const envFile = (content) => {
  const file = join(fresh(), 'env.fake');
  writeFileSync(file, content);
  return file;
};
const DEPLOY = 'https://nestly-abc123-afikyermis-projects.vercel.app';

test('[PS-0] the exported constants are what the decision names (guards the tests below)', () => {
  assert.equal(SECRET_KEY, KEY);
  assert.equal(BYPASS_HEADER, 'x-vercel-protection-bypass');
  assert.equal(COOKIE_HEADER, 'x-vercel-set-bypass-cookie');
  assert.equal(ENV_FILE_VAR, 'PREVIEW_SHOT_ENV_FILE');
  assert.equal(typeof Refused, 'function');
  assert.equal(typeof createRouteHandler, 'function');
  assert.equal(typeof main, 'function');
  assert.ok(new Refused('x') instanceof Error);
});

// ---------------------------------------------------------------------------------------------------------------------
// parseSecret

const PARSE_OK = [
  ['plain', `${KEY}=${MARK}`],
  ['with a trailing newline', `${KEY}=${MARK}\n`],
  ['with export', `export ${KEY}=${MARK}\n`],
  ['double-quoted', `${KEY}="${MARK}"\n`],
  ['single-quoted', `${KEY}='${MARK}'\n`],
  ['CRLF line endings', `OTHER=1\r\n${KEY}=${MARK}\r\nLAST=2\r\n`],
  ['CRLF and quoted', `${KEY}="${MARK}"\r\n`],
  ['between other keys', `A=1\n${KEY}=${MARK}\nB=2\n`],
  ['after a comment line', `# the bypass secret\n${KEY}=${MARK}\n`],
  ['after blank lines', `\n\n${KEY}=${MARK}\n`],
];
for (const [what, text] of PARSE_OK) {
  test(`[PS-1] parseSecret reads the secret: ${what}`, () => {
    assert.equal(parseSecret(text), MARK);
  });
}

test('[PS-1] parseSecret keeps a value that itself contains = signs', () => {
  assert.equal(parseSecret(`${KEY}=ab==cd=\n`), 'ab==cd=');
});

const PARSE_EMPTY = [
  ['the empty file', ''],
  ['only newlines', '\n\r\n'],
  ['a missing key', `OTHER=${MARK}\n`],
  ['the key commented out', `# ${KEY}=${MARK}\n`],
  ['the key commented out with export', `#export ${KEY}=${MARK}\n`],
  ['a longer key with the same prefix', `${KEY}_OLD=${MARK}\n`],
  ['a key that merely ends with the name', `X${KEY}=${MARK}\n`],
  ['the key only inside another value', `OTHER=${KEY}=${MARK}\n`],
  ['an empty value', `${KEY}=\n`],
  ['an empty value, CRLF', `${KEY}=\r\n`],
  ['an empty double-quoted value', `${KEY}=""\n`],
  ['an empty single-quoted value', `${KEY}=''\n`],
  ['the key with no =', `${KEY}\n`],
];
for (const [what, text] of PARSE_EMPTY) {
  test(`[PS-1] parseSecret returns '' for ${what}`, () => {
    assert.equal(parseSecret(text), '');
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// readSecret

// CRITIC finding 1: no exported reader may default to the real local file. The file is required; `name` is only the label
// used in refusal messages (it defaults to the file). A test must therefore always name a temp file, and a call without a
// file must not read anything.
test('[PS-2] readSecret reads exactly the file it is given', () => {
  const file = envFile(`${KEY}=${MARK}\n`);
  assert.equal(readSecret(file), MARK);
  const other = envFile(`${KEY}=OTHER-FAKE-MARKER-77\n`);
  assert.equal(readSecret(other), 'OTHER-FAKE-MARKER-77');
  assert.equal(readSecret(file, 'a label'), MARK);
});

test('[PS-2] readSecret has no default reader: without a path it throws a TypeError, even when PREVIEW_SHOT_ENV_FILE names a readable file', () => {
  const file = envFile(`${KEY}=${MARK}\n`);
  const before = process.env[ENV_FILE_VAR];
  process.env[ENV_FILE_VAR] = file;
  try {
    assert.throws(() => readSecret(), TypeError);
    assert.throws(() => readSecret(undefined), TypeError);
    assert.throws(() => readSecret(undefined, 'a label'), TypeError);
    for (const bad of [null, '', 42, {}]) {
      assert.throws(() => readSecret(bad), undefined, `readSecret(${JSON.stringify(bad)}) returned instead of throwing`);
    }
  } finally {
    if (before === undefined) delete process.env[ENV_FILE_VAR];
    else process.env[ENV_FILE_VAR] = before;
  }
});

const REFUSED_FILES = [
  ['an empty file', ''],
  ['a file without the key', `OTHER=${MARK}\nANOTHER=${MARK}\n`],
  ['the key commented out', `# ${KEY}=${MARK}\n`],
  ['the key with an empty value', `${KEY}=\nOTHER=${MARK}\n`],
  ['an empty quoted value', `${KEY}=""\nOTHER=${MARK}\n`],
  ['a longer key name', `${KEY}_OLD=${MARK}\n`],
];
for (const [what, content] of REFUSED_FILES) {
  test(`[PS-2] readSecret refuses ${what}, and the message carries no value from the file`, () => {
    const file = envFile(content);
    assert.throws(
      () => readSecret(file),
      (e) => {
        assert.ok(e instanceof Refused, `expected Refused, got ${e?.constructor?.name}: ${e?.message}`);
        assert.ok(!String(e.message).includes(MARK), 'the refusal message carries a value from the file');
        return true;
      },
    );
  });
}

test('[PS-2] readSecret refuses a file that does not exist (Refused, and the message is one line)', () => {
  const file = join(fresh(), 'no-such-file.env');
  assert.throws(
    () => readSecret(file),
    (e) => e instanceof Refused && !String(e.message).includes('\n'),
  );
});

test('[PS-2] readSecret throws, and does not return text, when the path is a directory', () => {
  assert.throws(() => readSecret(fresh()));
});

test('[PS-2] readSecret names the file in its refusals by `name` when one is given, and by the file itself when not', () => {
  const LABEL = 'THE-LABEL-q42';
  const cases = [
    ['a file without the key', envFile(`OTHER=${MARK}\n`)],
    ['an empty value', envFile(`${KEY}=\n`)],
    ['a missing file', join(fresh(), 'absent.env')],
  ];
  for (const [what, file] of cases) {
    assert.throws(
      () => readSecret(file, LABEL),
      (e) => {
        assert.ok(e instanceof Refused, `${what}: ${e?.constructor?.name}`);
        assert.ok(String(e.message).includes(LABEL), `${what}: the label is not in the message: ${e.message}`);
        assert.ok(!String(e.message).includes(basename(file)), `${what}: the real file name is in the message although a label was given: ${e.message}`);
        assert.ok(!String(e.message).includes(MARK), `${what}: a value from the file is in the message`);
        return true;
      },
    );
    assert.throws(
      () => readSecret(file),
      (e) => e instanceof Refused && String(e.message).includes(basename(file)),
      `${what}: with no name the message should name the file`,
    );
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// the real env file stays out of reach (CRITIC finding 1, re-check)

test('[PS-3] the module exports no default env-file path and no way to get one: no DEFAULT_ENV_FILE, no envFilePath, nothing named like one', () => {
  assert.ok(!('DEFAULT_ENV_FILE' in shot), 'DEFAULT_ENV_FILE is exported');
  assert.ok(!('envFilePath' in shot), 'envFilePath is exported');
  for (const [name, value] of Object.entries(shot)) {
    if (name === 'ENV_FILE_VAR') continue; // the variable's name, not a path
    assert.ok(!/default.*(env|file|path)|env.*(file|path)|secret.*(file|path)/i.test(name), `an export is named like a path to the env file: ${name}`);
    if (typeof value === 'string') assert.ok(!/\.env/.test(value), `the string export ${name} names an env file: ${value}`);
  }
});

// main() with a launcher that only counts: if the secret was read from the named file the browser is launched (and then
// fails on purpose), otherwise the run stops before it. The target is the production alias, so no lookup is needed;
// env is a plain object holding PREVIEW_SHOT_ENV_FILE and nothing else.
async function mainWithEnvFile(file) {
  const out = [];
  const sink = (s) => void out.push(String(s));
  sink.write = (s) => {
    out.push(String(s));
    return true;
  };
  let launched = 0;
  const code = await main(['https://nestly-blue.vercel.app', join(fresh(), 'a.png')], {
    env: { [ENV_FILE_VAR]: file },
    lookup: async () => {
      throw new Error('the lookup must not be called for the production alias');
    },
    launch: async () => {
      launched += 1;
      throw new Error('stop here');
    },
    stdout: sink,
    stderr: sink,
  });
  return { code, launched, output: out.join('') };
}

test('[PS-3] main() reads the file that PREVIEW_SHOT_ENV_FILE names in the env it is given: a usable file launches the browser, an unusable one stops the run before it', async () => {
  const good = await mainWithEnvFile(envFile(`${KEY}=${MARK}\n`));
  assert.equal(good.launched, 1, `the secret was not read from the named file: ${good.output}`);
  assert.equal(good.code, 1, 'the launcher fails on purpose, so the run must report failure');
  assert.ok(!good.output.includes(MARK), 'the output carries the secret');

  for (const content of ['', `OTHER=${MARK}\n`, `# ${KEY}=${MARK}\n`, `${KEY}=\n`]) {
    const bad = await mainWithEnvFile(envFile(content));
    assert.equal(bad.launched, 0, `the browser was launched with an unusable file: ${JSON.stringify(content)}`);
    assert.equal(bad.code, 1, bad.output);
    assert.ok(!bad.output.includes(MARK), bad.output);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// checkTarget

const href = (u) => String(u.href ?? u);
const ACCEPT = [
  ['a unique deployment', DEPLOY, DEPLOY],
  ['a unique deployment with a trailing slash', `${DEPLOY}/`, DEPLOY],
  ['another unique deployment (digits and letters)', 'https://nestly-9f8e7d6c5-afikyermis-projects.vercel.app', 'https://nestly-9f8e7d6c5-afikyermis-projects.vercel.app'],
  ['a deployment page with a path and query', `${DEPLOY}/feed?tab=new`, DEPLOY],
  ['the production alias', 'https://nestly-blue.vercel.app/', 'https://nestly-blue.vercel.app'],
];
for (const [what, raw, origin] of ACCEPT) {
  test(`[PS-4] checkTarget accepts ${what}`, () => {
    const t = checkTarget(raw);
    assert.equal(t.origin ?? new URL(href(t)).origin, origin);
  });
}

const REJECT = [
  ['plain http', `http://nestly-abc123-afikyermis-projects.vercel.app`],
  ['http on the production alias', 'http://nestly-blue.vercel.app'],
  ['a branch alias (nestly-git-...)', 'https://nestly-git-feat-preview-access-afikyermis-projects.vercel.app'],
  ['a branch alias with a short branch', 'https://nestly-git-main-afikyermis-projects.vercel.app'],
  ['a branch alias with a path', 'https://nestly-git-main-afikyermis-projects.vercel.app/feed'],
  ['a slug that merely ends in -afikyermis-projects', 'https://nestly-abc123-evil-afikyermis-projects.vercel.app'],
  ['a branch-shaped slug that ends in -afikyermis-projects', 'https://nestly-git-x-evil-afikyermis-projects.vercel.app'],
  ['a hash with a hyphen', 'https://nestly-abc-123-afikyermis-projects.vercel.app'],
  ['an attacker host with the project suffix in the query', 'https://nestly-x.evil.com/?-afikyermis-projects.vercel.app'],
  ['an appended .evil.com', `${DEPLOY}.evil.com`],
  ['an appended .evil.com with a path', `${DEPLOY}.evil.com/x`],
  ['a dot inside the hash part', 'https://nestly-x.evil.com-afikyermis-projects.vercel.app'],
  ['the production alias with .evil.com', 'https://nestly-blue.vercel.app.evil.com'],
  ['a prefix on the production alias', 'https://evil-nestly-blue.vercel.app'],
  ['a different project on vercel.app', 'https://blue.vercel.app'],
  ['the vercel.app apex', 'https://vercel.app'],
  ['another team', 'https://nestly-abc123-otherteam-projects.vercel.app'],
  ['another project of the team', 'https://other-abc123-afikyermis-projects.vercel.app'],
  ['userinfo before the host', 'https://user:pw@nestly-abc123-afikyermis-projects.vercel.app'],
  ['userinfo hiding the real host', `${DEPLOY}@evil.com/`],
  ['a backslash that turns the host into evil.com', 'https://evil.com\\@nestly-abc123-afikyermis-projects.vercel.app'],
  ['a port', 'https://nestly-abc123-afikyermis-projects.vercel.app:8443'],
  ['the suffix as a path on another host', 'https://evil.com/nestly-abc123-afikyermis-projects.vercel.app'],
  ['a Cyrillic look-alike letter in the host', 'https://nestly-abc123-afikyermis-projects.vercel.app'.replace('a', 'а')],
  ['the file scheme', 'file:///etc/passwd'],
  ['a javascript URL', 'javascript:alert(1)'],
  ['an ftp URL', 'ftp://nestly-abc123-afikyermis-projects.vercel.app'],
  ['text that is not a URL', 'not a url'],
  ['the empty string', ''],
  ['a bare host with no scheme', 'nestly-abc123-afikyermis-projects.vercel.app'],
];
for (const [what, raw] of REJECT) {
  test(`[PS-4] checkTarget refuses ${what}`, () => {
    assert.throws(() => checkTarget(raw), (e) => e instanceof Refused);
  });
}

test('[PS-4] checkTarget refuses a non-string target', () => {
  for (const bad of [undefined, null, 42, {}]) assert.throws(() => checkTarget(bad), Error);
});

for (const query of ['x-vercel-protection-bypass=LEAKME-1', 'a=1&x-vercel-protection-bypass=LEAKME-1', 'X-Vercel-Protection-Bypass=LEAKME-1']) {
  for (const host of [DEPLOY, 'https://nestly-blue.vercel.app']) {
    test(`[PS-4] checkTarget refuses the bypass parameter in the query (${host.slice(8, 20)}..., ?${query.slice(0, 20)}...) and does not echo its value`, () => {
      assert.throws(
        () => checkTarget(`${host}/?${query}`),
        (e) => e instanceof Refused && !String(e.message).includes('LEAKME-1'),
      );
    });
  }
}

test('[PS-4] a refusal does not echo credentials that were put in the URL', () => {
  assert.throws(
    () => checkTarget('https://user:LEAKME-PW-2@nestly-abc123-afikyermis-projects.vercel.app'),
    (e) => e instanceof Refused && !String(e.message).includes('LEAKME-PW-2'),
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// parseArgs

const pick = (r, ...keys) => keys.map((k) => r[k]).find((v) => v !== undefined);
const refuses = (argv) => assert.throws(() => parseArgs(argv), (e) => e instanceof Refused, `parseArgs accepted ${JSON.stringify(argv)}`);

test('[PS-5] parseArgs reads url, out and width, and the width defaults to 1024', () => {
  const r = parseArgs([DEPLOY, 'shot.png']);
  assert.equal(pick(r, 'target', 'url'), DEPLOY);
  assert.equal(resolve(r.out), resolve('shot.png'));
  assert.equal(Number(r.width), 1024);
});

test('[PS-5] parseArgs accepts width 375 and 1024, before or after the positionals', () => {
  for (const w of ['375', '1024']) {
    for (const argv of [[DEPLOY, 'a.png', '--width', w], ['--width', w, DEPLOY, 'a.png']]) {
      const r = parseArgs(argv);
      assert.equal(Number(r.width), Number(w), JSON.stringify(argv));
      assert.equal(resolve(r.out), resolve('a.png'));
    }
  }
});

test('[PS-5] parseArgs accepts an output path with directories', () => {
  assert.equal(resolve(parseArgs([DEPLOY, 'out/dir/page.png']).out), resolve('out/dir/page.png'));
});

for (const w of ['0', '1', '320', '376', '768', '800', '1023', '1025', '1920', '-375', '', 'abc', '375px', '1e3', 'NaN', '375,1024']) {
  test(`[PS-5] parseArgs refuses width ${JSON.stringify(w)}`, () => refuses([DEPLOY, 'a.png', '--width', w]));
}

// A number that spells 375 or 1024 in an unusual way may be read leniently; what must hold is that no other width gets through.
for (const w of ['375.0', '0x177', ' 375', '375 ', '01024', '+375']) {
  test(`[PS-5] parseArgs: width ${JSON.stringify(w)} is refused or read as exactly 375 or 1024`, () => {
    try {
      const r = parseArgs([DEPLOY, 'a.png', '--width', w]);
      assert.ok([375, 1024].includes(Number(r.width)), `width ${r.width} got through`);
    } catch (e) {
      assert.ok(e instanceof Refused);
    }
  });
}

test('[PS-5] parseArgs refuses --width with no value, and an unknown flag', () => {
  refuses([DEPLOY, 'a.png', '--width']);
  refuses([DEPLOY, 'a.png', '--height', '100']);
  refuses([DEPLOY, 'a.png', '--output']);
  refuses([DEPLOY, 'a.png', '-x']);
});

for (const out of ['a.jpg', 'a', 'a.png.txt', 'a.PNG.exe', 'a.pngx', '.png.sh', 'a.html', 'a.svg']) {
  test(`[PS-5] parseArgs refuses an output that is not a .png file: ${out}`, () => refuses([DEPLOY, out]));
}

for (const out of ['.env', '.env.vercel', '.env.local', '.env.png', '.env.vercel.png', 'dir/.env.png', 'dir/.env.vercel', '../.env.vercel.png']) {
  test(`[PS-5] parseArgs refuses an output named .env*: ${out}`, () => refuses([DEPLOY, out]));
}

test('[PS-5] parseArgs needs exactly two positionals', () => {
  refuses([]);
  refuses([DEPLOY]);
  refuses(['a.png']);
  refuses([DEPLOY, 'a.png', 'b.png']);
  refuses([DEPLOY, 'a.png', DEPLOY]);
  refuses([DEPLOY, 'a.png', '--width', '375', 'extra']);
  refuses(['--width', '375']);
});

// ---------------------------------------------------------------------------------------------------------------------
// scrubber

function scrub(secret, text) {
  const f = scrubber(secret);
  assert.equal(typeof f, 'function', 'scrubber(secret) must return a function');
  const r = f(text);
  return typeof r === 'string' ? r : String(r?.message ?? r);
}

test('[PS-6] scrubber replaces every occurrence of the secret', () => {
  const out = scrub(MARK, `a ${MARK} b ${MARK}${MARK} c ${MARK}`);
  assert.ok(!out.includes(MARK), out);
  assert.ok(out.startsWith('a '), out);
  assert.ok(out.includes(' b ') && out.includes(' c '), out);
});

test('[PS-6] scrubber keeps only the first line (call logs list request headers further down)', () => {
  const out = scrub(MARK, `navigation failed: net::ERR ${MARK}\nCall log:\n  - ${BYPASS_HEADER}: ${MARK}\n  - ${COOKIE_HEADER}: true`);
  assert.ok(!out.includes(MARK));
  assert.ok(out.includes('navigation failed: net::ERR'));
  assert.ok(!out.includes('Call log') && !out.includes(BYPASS_HEADER) && !out.includes('\n'), out);
});

test('[PS-6] scrubber keeps only the first line for CRLF text too', () => {
  const out = scrub(MARK, `first ${MARK}\r\nsecond ${MARK}\r\nthird`);
  assert.ok(out.includes('first') && !out.includes('second') && !out.includes('third') && !out.includes(MARK), out);
});

test('[PS-6] scrubber treats the secret literally: regex and replacement metacharacters leak nothing and match nothing else', () => {
  const secret = 'a.b*c+(d)[e]$&|\\^?';
  const out = scrub(secret, `x ${secret} y aXb`);
  assert.ok(!out.includes(secret), out);
  assert.ok(out.includes('aXb'), 'the dot of the secret acted as a wildcard');
  const dollars = scrub('$&', 'k $& m $& n');
  assert.ok(!dollars.includes('$&'), dollars);
});

test('[PS-6] scrubber leaves text without the secret unchanged on its first line', () => {
  assert.equal(scrub(MARK, 'plain error message'), 'plain error message');
});

test('[PS-6] scrubber also catches the secret when it is the whole first line', () => {
  assert.ok(!scrub(MARK, `${MARK}\nnext`).includes(MARK));
});

// ---------------------------------------------------------------------------------------------------------------------
// createRouteHandler, driven with a fake Playwright route

// A fake route that records every call. `fetchImpl` replaces the default fetch (which answers 200).
function fakeRoute(url, fetchImpl) {
  const calls = { fetch: [], fulfill: [], continue: [], abort: [] };
  const base = { url: () => url, method: () => 'GET', headers: () => ({ accept: '*/*' }), postData: () => null, postDataBuffer: () => null, resourceType: () => 'document' };
  const request = new Proxy(base, { get: (t, p) => (typeof p === 'symbol' ? undefined : p in t ? t[p] : () => undefined) });
  const route = {
    request: () => request,
    fetch: async (...a) => {
      calls.fetch.push(a);
      return fetchImpl ? fetchImpl(...a) : { status: () => 200, headers: () => ({}), body: async () => Buffer.from('ok') };
    },
    fulfill: async (...a) => void calls.fulfill.push(a),
    continue: async (...a) => void calls.continue.push(a),
    abort: async (...a) => void calls.abort.push(a),
  };
  return { route, calls };
}

const SAME_ORIGIN = [DEPLOY, `${DEPLOY}/`, `${DEPLOY}/feed?tab=new`, `${DEPLOY}/assets/app.js`, `${DEPLOY}/api/health`];
const OTHER_ORIGIN = [
  ['another host', 'https://evil.example/x'],
  ['another host that carries the project suffix', 'https://nestly-x.evil.com/?-afikyermis-projects.vercel.app'],
  ['the target host with .evil.com appended', `${DEPLOY}.evil.com/x`],
  ['a sibling deployment host', 'https://nestly-other1-afikyermis-projects.vercel.app/feed'],
  ['a sibling *.vercel.app host', 'https://other-project.vercel.app/'],
  ['the production alias while the target is a deployment', 'https://nestly-blue.vercel.app/'],
  ['http on the same host', 'http://nestly-abc123-afikyermis-projects.vercel.app/x'],
  ['the same host on another port', `${DEPLOY}:8443/x`],
  ['a third-party font host', 'https://fonts.gstatic.com/s/a.woff2'],
  ['a data URL', 'data:text/plain;base64,AAAA'],
];

// What a correct handler does. `make` is createRouteHandler or a broken stand-in.
async function assertRouting(make) {
  const handler = make(DEPLOY, MARK);
  assert.equal(typeof handler, 'function');

  for (const url of SAME_ORIGIN) {
    const { route, calls } = fakeRoute(url);
    await handler(route);
    assert.equal(calls.fetch.length, 1, `${url}: fetch not called once`);
    const opts = calls.fetch[0][0] ?? {};
    assert.equal(opts.headers?.[BYPASS_HEADER], MARK, `${url}: the bypass header is missing`);
    assert.equal(String(opts.headers?.[COOKIE_HEADER]), 'true', `${url}: the set-cookie header is missing`);
    assert.strictEqual(opts.maxRedirects, 0, `${url}: redirects are not switched off`);
    assert.equal(calls.fulfill.length, 1, `${url}: not fulfilled`);
    assert.equal(calls.continue.length + calls.abort.length, 0, `${url}: also continued or aborted`);
  }

  for (const [what, url] of OTHER_ORIGIN) {
    const { route, calls } = fakeRoute(url);
    await handler(route);
    assert.equal(calls.continue.length, 1, `${what}: not continued`);
    assert.equal(calls.continue[0].length, 0, `${what}: continue() was given an argument (headers?)`);
    assert.equal(calls.fetch.length + calls.fulfill.length + calls.abort.length, 0, `${what}: fetched, fulfilled or aborted`);
    assert.ok(!JSON.stringify(calls).includes(MARK), `${what}: the secret appears in a call`);
  }

  const boom = new Error(`connect failed, call log: ${BYPASS_HEADER}: ${MARK}`);
  const { route, calls } = fakeRoute(`${DEPLOY}/feed`, async () => {
    throw boom;
  });
  await handler(route); // must resolve, not reject
  assert.equal(calls.abort.length, 1, 'a failed fetch is not aborted');
  assert.deepEqual(calls.abort[0], ['failed'], 'abort must be called with just the reason "failed", no message');
  assert.equal(calls.fulfill.length + calls.continue.length, 0, 'a failed fetch was also fulfilled or continued');
  // the fetch call itself legitimately carries the header; nothing else may carry the secret
  assert.ok(!JSON.stringify([calls.abort, calls.fulfill, calls.continue]).includes(MARK), 'the secret appears in a call after a failed fetch');
}

test('[PS-8] createRouteHandler: the target origin is fetched with the bypass and cookie headers and no redirects; every other origin continues untouched; a failed fetch aborts without a message', async () => {
  await assertRouting(createRouteHandler);
});

test('[PS-8] createRouteHandler does not print the secret or the fetch error when a fetch fails', async () => {
  const seen = [];
  const originals = {};
  for (const m of ['log', 'error', 'warn', 'info', 'debug']) {
    originals[m] = console[m];
    console[m] = (...a) => void seen.push(a.map(String).join(' '));
  }
  try {
    const { route } = fakeRoute(`${DEPLOY}/`, async () => {
      throw new Error(`call log ${BYPASS_HEADER}: ${MARK}`);
    });
    await createRouteHandler(DEPLOY, MARK)(route);
  } finally {
    Object.assign(console, originals);
  }
  assert.ok(!seen.join('\n').includes(MARK), 'the handler logged the secret');
});

test('[PS-8] createRouteHandler is bound to the origin it was built for: a handler for the production alias sends nothing to a deployment', async () => {
  const handler = createRouteHandler('https://nestly-blue.vercel.app', MARK);
  const { route, calls } = fakeRoute(`${DEPLOY}/`);
  await handler(route);
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.continue.length, 1);
  assert.equal(calls.continue[0].length, 0);
});

// ---- mutation checks: a broken handler must fail the assertions above ------------------------------------------------
const headersFor = (secret) => ({ [BYPASS_HEADER]: secret, [COOKIE_HEADER]: 'true' });
const BROKEN_HANDLERS = [
  [
    'adds the header for every origin',
    (origin, secret) => async (route) => {
      try {
        await route.fulfill({ response: await route.fetch({ headers: headersFor(secret), maxRedirects: 0 }) });
      } catch {
        await route.abort('failed');
      }
    },
  ],
  [
    'continues other origins with the header attached',
    (origin, secret) => async (route) => {
      if (new URL(route.request().url()).origin !== origin) return route.continue({ headers: headersFor(secret) });
      try {
        await route.fulfill({ response: await route.fetch({ headers: headersFor(secret), maxRedirects: 0 }) });
      } catch {
        await route.abort('failed');
      }
    },
  ],
  [
    'follows redirects on the target origin',
    (origin, secret) => async (route) => {
      if (new URL(route.request().url()).origin !== origin) return route.continue();
      try {
        await route.fulfill({ response: await route.fetch({ headers: headersFor(secret) }) });
      } catch {
        await route.abort('failed');
      }
    },
  ],
  [
    'matches the origin by prefix, so the target host with .evil.com appended gets the header',
    (origin, secret) => async (route) => {
      if (!route.request().url().startsWith(origin)) return route.continue();
      try {
        await route.fulfill({ response: await route.fetch({ headers: headersFor(secret), maxRedirects: 0 }) });
      } catch {
        await route.abort('failed');
      }
    },
  ],
  [
    'keeps the error message when a fetch fails',
    (origin, secret) => async (route) => {
      if (new URL(route.request().url()).origin !== origin) return route.continue();
      try {
        await route.fulfill({ response: await route.fetch({ headers: headersFor(secret), maxRedirects: 0 }) });
      } catch (e) {
        await route.abort(e.message);
      }
    },
  ],
];
for (const [what, make] of BROKEN_HANDLERS) {
  test(`[PS-M] the routing assertions fail for a handler that ${what}`, async () => {
    await assert.rejects(() => assertRouting(make), undefined, 'the routing assertions did not notice the broken handler');
  });
}
