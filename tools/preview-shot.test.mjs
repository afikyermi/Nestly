// Tests for tools/preview-shot.mjs (Afik's decision 14.10.2026: preview access for checks).
// Derived from the expected behaviour as handed to TEST ENGINEER, and from the exported interface used as a black box:
//   the Vercel bypass secret travels only as the x-vercel-protection-bypass header - never in a URL, argv, log, output or
//   artifact - and only to this project's Vercel hosts; every check fails closed.
//
// Labels (the requirement the test asserts):
//   [PS-1] parseSecret    [PS-2] readSecret refusals (no message carries the value)    [PS-3] envFilePath
//   [PS-4] checkTarget    [PS-5] parseArgs                                              [PS-6] scrubber
//   [PS-7] the command line, run as a child process: refusals exit 1, the secret never reaches an output, the URL is
//          checked before the env file is read, nothing is sent or saved
// The real .env.vercel is never read: every test names its own temp file, with a fake marker as the secret.
// Assumption about parseArgs: it takes the arguments after the script name, e.g. [url, out, '--width', '375'], and the
// result has target (or url), out (resolved against the working directory) and width (a number, 1024 by default).
// NOT covered here: that the header never rides to another origin or a redirect target while Playwright loads a page.
// That needs an injectable fetch or a browser plus DNS control; nothing exported allows it (reported to the caller).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const shotPath = fileURLToPath(new URL('./preview-shot.mjs', import.meta.url));
const shot = await import(pathToFileURL(shotPath).href);
const { BYPASS_HEADER, COOKIE_HEADER, DEFAULT_ENV_FILE, ENV_FILE_VAR, SECRET_KEY, Refused, checkTarget, envFilePath, parseArgs, parseSecret, readSecret, scrubber } = shot;

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
  assert.equal(ENV_FILE_VAR, 'PREVIEW_SHOT_ENV_FILE');
  assert.equal(typeof Refused, 'function');
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

test('[PS-2] readSecret returns the secret from a file, and with no argument reads the file PREVIEW_SHOT_ENV_FILE names', () => {
  const file = envFile(`${KEY}=${MARK}\n`);
  assert.equal(readSecret(file), MARK);
  const before = process.env[ENV_FILE_VAR];
  process.env[ENV_FILE_VAR] = file;
  try {
    assert.equal(readSecret(), MARK);
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

// ---------------------------------------------------------------------------------------------------------------------
// envFilePath

test('[PS-3] envFilePath is PREVIEW_SHOT_ENV_FILE when set (as a path), otherwise .env.vercel at the repo root', () => {
  const custom = join(fresh(), 'x.env');
  assert.equal(resolve(envFilePath({ [ENV_FILE_VAR]: custom })), resolve(custom));
  const def = envFilePath({});
  assert.equal(def, DEFAULT_ENV_FILE);
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.equal(resolve(def), resolve(root, '.env.vercel'));
});

// ---------------------------------------------------------------------------------------------------------------------
// checkTarget

const href = (u) => String(u.href ?? u);
const ACCEPT = [
  ['a deployment', DEPLOY, DEPLOY],
  ['a deployment with a trailing slash', `${DEPLOY}/`, DEPLOY],
  ['a branch deployment', 'https://nestly-git-feat-preview-access-afikyermis-projects.vercel.app', 'https://nestly-git-feat-preview-access-afikyermis-projects.vercel.app'],
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
// the command line, as a child process

function cli(args, { file, cwd = fresh() } = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(VERCEL_|PREVIEW_SHOT|DEBUG$|PWDEBUG|HTTPS?_PROXY|ALL_PROXY)/i.test(k)) delete env[k];
  if (file !== undefined) env[ENV_FILE_VAR] = file;
  const r = spawnSync(process.execPath, [shotPath, ...args], { cwd, env, encoding: 'utf8', timeout: 60_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, stderr: r.stderr, cwd, error: r.error };
}

function assertClean(r, ...values) {
  assert.equal(r.error, undefined, String(r.error));
  for (const v of values) assert.ok(!r.out.includes(v), `the output carries ${v}`);
}

const REFUSED_RUNS = [
  ['http', ['http://nestly-abc123-afikyermis-projects.vercel.app', 'shot.png']],
  ['an attacker host', ['https://nestly-x.evil.com/?-afikyermis-projects.vercel.app', 'shot.png']],
  ['an appended .evil.com', [`${DEPLOY}.evil.com`, 'shot.png']],
  ['userinfo', ['https://user:pw@nestly-abc123-afikyermis-projects.vercel.app', 'shot.png']],
  ['a port', [`${DEPLOY}:8443`, 'shot.png']],
  ['the bypass parameter in the query', [`${DEPLOY}/?x-vercel-protection-bypass=LEAKME-URL-9`, 'shot.png']],
  ['a width outside 375|1024', [DEPLOY, 'shot.png', '--width', '800']],
  ['an output that is not .png', [DEPLOY, 'shot.jpg']],
  ['an output named .env*', [DEPLOY, '.env.png']],
  ['no arguments', []],
  ['three positionals', [DEPLOY, 'shot.png', 'extra']],
];
for (const [what, args] of REFUSED_RUNS) {
  test(`[PS-7] ${what}: exits 1, prints a refusal, leaks neither the secret nor a URL parameter, saves nothing`, () => {
    const file = envFile(`${KEY}=${MARK}\n`);
    const r = cli(args, { file });
    assert.equal(r.status, 1, r.out);
    assert.ok(r.stderr.trim().length > 0, 'a refusal prints nothing');
    assertClean(r, MARK, 'LEAKME-URL-9', 'LEAKME');
    assert.ok(!existsSync(join(r.cwd, 'shot.png')), 'a screenshot was saved after a refusal');
    assert.ok(!existsSync(join(r.cwd, '.env.png')));
  });
}

test('[PS-7] a refused URL is checked before the env file is read: a missing or unreadable file changes nothing', () => {
  const missing = join(fresh(), 'NO-SUCH-ENV-FILE-q7x.env');
  const dir = fresh();
  for (const file of [missing, dir]) {
    const r = cli(['http://nestly-abc123-afikyermis-projects.vercel.app', 'shot.png'], { file });
    assert.equal(r.status, 1, r.out);
    assert.ok(!r.out.includes('NO-SUCH-ENV-FILE'), 'the refusal talks about the env file, so the file was read first');
    assert.ok(!/EISDIR|ENOENT/.test(r.out), `a file system error surfaced before the URL check: ${r.out}`);
  }
});

test('[PS-7] with a valid URL and no usable secret the run stops before any network, exits 1 and prints no value from the file', () => {
  const files = [
    ['an empty file', ''],
    ['a file without the key', `OTHER=${MARK}\n`],
    ['the key commented out', `# ${KEY}=${MARK}\n`],
    ['an empty value', `${KEY}=\nOTHER=${MARK}\n`],
  ];
  for (const [what, content] of files) {
    const r = cli([DEPLOY, 'shot.png'], { file: envFile(content) });
    assert.equal(r.status, 1, `${what}: ${r.out}`);
    assertClean(r, MARK);
    assert.ok(!existsSync(join(r.cwd, 'shot.png')), `${what}: a screenshot was saved`);
    assert.ok(!/status|HTTP \d{3}/i.test(r.stdout), `${what}: the run reported an HTTP status, so it went to the network`);
  }
});

test('[PS-7] a missing env file with a valid URL exits 1 without a screenshot and without a stack trace', () => {
  const r = cli([DEPLOY, 'shot.png'], { file: join(fresh(), 'absent.env') });
  assert.equal(r.status, 1, r.out);
  assert.ok(!/\n\s+at\s/.test(r.out), 'a stack trace was printed');
  assert.ok(!existsSync(join(r.cwd, 'shot.png')));
});
