// Tests for .github/workflows/preview-smoke.yml (Afik's decision 14.10.2026: preview access for checks).
// Derived from the expected behaviour as handed to TEST ENGINEER, not from the workflow's steps:
//   the Vercel bypass secret travels only as the x-vercel-protection-bypass header - never in a URL, argv, log, output or
//   artifact - and only to this project's unique deployment hosts (nestly-<hash without hyphens>-afikyermis-projects
//   .vercel.app); branch aliases, other slugs and the production alias are refused; every check fails closed.
//
// Labels (the requirement the test asserts):
//   [PA-W1] trigger only deployment_status        [PA-W2] job `if`: success + Preview + vercel[bot]
//   [PA-W3] permissions exactly contents: read    [PA-W4] the secret in one step's env only, never inside `run`
//   [PA-W5] target URL reaches the script by env  [PA-W6] the URL check precedes the first curl; what its regex accepts
//   [PA-W7] curl flags: header from stdin, https only, no redirects, no verbose/trace
//   [PA-W8] nothing prints, writes or exports the secret         [PA-W9] nothing swallows a failure
//   [PA-W10] protected statuses accepted are exactly 401 and 503, each with the server's own body
//   [PA-B*] the same promises, asserted by running the step's script with bash against a fake curl on PATH
//   [PA-M*] mutation checks: a deliberately broken copy of the workflow or script must make the check above fail, so a
//           check that can no longer fail is noticed
//
// Part one parses the workflow as data (tools/workflow-yaml.mjs); each check is a function of the workflow text, so the
// mutation tests can run it on a broken copy. Part two runs the step's script with bash: curl is a stub that records its
// argv and stdin and answers from the environment; jq is the real one, or a small stand-in when the machine has none.
// When no usable bash exists the behaviour tests skip with the reason (CI runs on ubuntu-latest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codeOf, has, nameOf, parseYaml, runOf, stepsOf, swallowProblems } from './workflow-yaml.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(join(root, '.github/workflows/preview-smoke.yml'), 'utf8').replace(/\r\n/g, '\n');
const secretName = 'VERCEL_AUTOMATION_BYPASS_SECRET';
const withoutQuotes = (s) => s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');

// Everything the checks need, from the workflow text.
function ctx(src) {
  const wf = parseYaml(src);
  const jobs = Object.entries(wf.jobs ?? {});
  const job = jobs[0]?.[1] ?? {};
  const steps = stepsOf(job);
  const holder = steps.find((s) => has(s.env, secretName));
  const script = holder ? runOf(holder) : '';
  const code = codeOf(script);
  // continuation lines joined, so a command split with a trailing backslash is one logical line
  const logical = code.replace(/\\\n\s*/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean);
  return { wf, jobs, job, steps, holder, script, code, logical };
}
const real = ctx(source);

const ACCEPT_URLS = [
  'https://nestly-abc123-afikyermis-projects.vercel.app',
  'https://nestly-abc123-afikyermis-projects.vercel.app/',
  'https://nestly-9f8e7d6c5-afikyermis-projects.vercel.app',
];
const REJECT_URLS = [
  ['an attacker host with the project suffix in the query', 'https://nestly-x.evil.com/?-afikyermis-projects.vercel.app'],
  ['an appended .evil.com', 'https://nestly-abc123-afikyermis-projects.vercel.app.evil.com'],
  ['an appended .evil.com with a slash', 'https://nestly-abc123-afikyermis-projects.vercel.app.evil.com/'],
  ['a dot inside the hash part', 'https://nestly-x.evil.com-afikyermis-projects.vercel.app'],
  ['a branch alias (nestly-git-...)', 'https://nestly-git-feat-preview-access-afikyermis-projects.vercel.app'],
  ['a branch alias with a short branch', 'https://nestly-git-main-afikyermis-projects.vercel.app'],
  ['a slug that merely ends in -afikyermis-projects', 'https://nestly-abc123-evil-afikyermis-projects.vercel.app'],
  ['a branch-shaped slug that ends in -afikyermis-projects', 'https://nestly-git-x-evil-afikyermis-projects.vercel.app'],
  ['a hash with a hyphen', 'https://nestly-abc-123-afikyermis-projects.vercel.app'],
  ['the production alias (the tool accepts it, the workflow does not)', 'https://nestly-blue.vercel.app'],
  ['the production alias with a slash', 'https://nestly-blue.vercel.app/'],
  ['plain http', 'http://nestly-abc123-afikyermis-projects.vercel.app'],
  ['userinfo before the host', 'https://user:pw@nestly-abc123-afikyermis-projects.vercel.app'],
  ['userinfo hiding the real host', 'https://nestly-abc123-afikyermis-projects.vercel.app@evil.com'],
  ['a port', 'https://nestly-abc123-afikyermis-projects.vercel.app:8443'],
  ['a path', 'https://nestly-abc123-afikyermis-projects.vercel.app/some/path'],
  ['a query', 'https://nestly-abc123-afikyermis-projects.vercel.app/?a=1'],
  ['a fragment', 'https://nestly-abc123-afikyermis-projects.vercel.app/#x'],
  ['two trailing slashes', 'https://nestly-abc123-afikyermis-projects.vercel.app//'],
  ['the project suffix as a path', 'https://evil.com/nestly-abc123-afikyermis-projects.vercel.app'],
  ['another team', 'https://nestly-abc123-otherteam-projects.vercel.app'],
  ['another project', 'https://other-abc123-afikyermis-projects.vercel.app'],
  ['no scheme', 'nestly-abc123-afikyermis-projects.vercel.app'],
  ['a second line carrying another host', 'https://nestly-abc123-afikyermis-projects.vercel.app\nhttps://evil.com'],
  ['a trailing space', 'https://nestly-abc123-afikyermis-projects.vercel.app '],
  ['the empty string', ''],
];

// ---------------------------------------------------------------------------------------------------------------------
// part one - the workflow as data. Each check throws when the workflow breaks the promise.

const checks = {
  W0(c) {
    assert.equal(c.jobs.length, 1, 'expected exactly one job');
    assert.ok(c.steps.length >= 1, 'the job has no steps');
    assert.ok(c.holder, `no step has ${secretName} in its env`);
    assert.ok(c.script.length > 0, 'the step that holds the secret has no run script');
  },
  W1(c) {
    const on = c.wf.on;
    assert.ok(on && typeof on === 'object' && !Array.isArray(on), 'on: must be a mapping');
    assert.deepEqual(Object.keys(on), ['deployment_status']);
  },
  W2(c) {
    assert.equal(typeof c.job.if, 'string', 'the job has no if');
    const cond = c.job.if.replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '').replace(/\s+/g, ' ').replace(/"/g, "'");
    assert.ok(!cond.includes('||'), `the condition has ||: ${cond}`);
    assert.ok(!/!=|!\s*\(|\bnot\b|contains\(|startsWith\(|endsWith\(/.test(cond), `the condition loosens a check: ${cond}`);
    const operands = cond.split('&&').map((s) => s.trim());
    for (const want of [
      "github.event.deployment_status.state == 'success'",
      "github.event.deployment_status.environment == 'Preview'",
      "github.event.deployment_status.creator.login == 'vercel[bot]'",
    ]) {
      assert.ok(operands.includes(want), `missing operand: ${want}`);
    }
    for (const step of c.steps) assert.ok(!has(step, 'if'), `step "${nameOf(step)}" has its own if`);
  },
  W3(c) {
    assert.deepEqual(c.wf.permissions, { contents: 'read' });
    if (has(c.job, 'permissions')) assert.deepEqual(c.job.permissions, { contents: 'read' });
    assert.ok(!/write/i.test(JSON.stringify([c.wf.permissions, c.job.permissions])), 'a write permission is present');
  },
  W4(c) {
    const exprs = [...JSON.stringify(c.wf).matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim()).filter((e) => /\bsecrets\b/.test(e));
    assert.deepEqual(exprs, [`secrets.${secretName}`], 'the secrets context must appear exactly once, for this secret');
    assert.ok(!has(c.wf, 'env'), 'workflow-level env exists');
    assert.ok(!has(c.job, 'env'), 'job-level env exists');
    assert.equal(c.steps.filter((s) => has(s.env, secretName)).length, 1, 'more than one step carries the secret');
    assert.equal(c.holder.env[secretName].replace(/\s+/g, ''), `\${{secrets.${secretName}}}`);
    for (const step of c.steps) {
      assert.ok(!runOf(step).includes('${{'), `step "${nameOf(step)}" has an expression inside run`);
      assert.ok(!has(step, 'with') || !/secrets/.test(JSON.stringify(step.with)), `step "${nameOf(step)}" passes a secret in with`);
    }
  },
  W5(c) {
    assert.ok(has(c.holder.env, 'TARGET_URL'), 'no TARGET_URL in the step env');
    assert.equal(c.holder.env.TARGET_URL.replace(/\s+/g, ''), '${{github.event.deployment_status.target_url}}');
    assert.ok(!/\bgithub\./.test(c.script), 'the script reads a github context directly');
    assert.ok(/\$\{?TARGET_URL\b/.test(c.code), 'the script never reads TARGET_URL');
  },
  W6order(c) {
    const check = c.code.search(/=~/);
    const curl = c.code.search(/\bcurl\b/);
    assert.ok(check >= 0, 'no regex check of the URL');
    assert.ok(curl >= 0, 'no curl call found');
    assert.ok(check < curl, 'curl appears before the URL check');
    assert.match(c.logical.find((l) => l.includes('=~')), /TARGET_URL/);
    assert.match(c.code.slice(check, curl), /\bexit\s+[1-9]/, 'a failed check does not exit non-zero before curl');
  },
  W6regex(c) {
    const rule = /url_rule='([^']+)'/.exec(c.script)?.[1] ?? /'(\^https:\/\/[^']+)'/.exec(c.script)?.[1];
    assert.ok(rule, 'could not find the URL regex in the script');
    const re = new RegExp(rule);
    for (const url of ACCEPT_URLS) assert.ok(re.test(url), `rejected a real-shaped URL: ${url}`);
    for (const [what, url] of REJECT_URLS) assert.ok(!re.test(url), `accepted ${what}: ${JSON.stringify(url)}`);
  },
  W7(c) {
    const curlLines = c.logical.filter((l) => /\bcurl\b/.test(l) && !/command\s+-v/.test(l));
    assert.ok(curlLines.length >= 1, 'no curl invocation');
    for (const line of curlLines) {
      assert.ok(/(^|\s)(-H|--header)\s+@-(\s|$)/.test(line), `curl does not read its header from stdin: ${line}`);
      assert.ok(/--proto\s+'?=https'?(\s|$)/.test(line), `curl is not limited with --proto =https: ${line}`);
      for (const t of withoutQuotes(line).split(/\s+/)) {
        assert.ok(!/^--(location|location-trusted|verbose|trace|trace-ascii|trace-time|dump-header|include|output|config)(=|$)/.test(t), `curl flag ${t}: ${line}`);
        if (/^-[A-Za-z]+$/.test(t)) assert.ok(!/[LvIiDoOK]/.test(t), `curl short flag ${t} (redirects, verbose, include, dump or output): ${line}`);
      }
      const headers = [...line.matchAll(/(?:^|\s)(?:-H|--header)\s+(\S+)/g)].map((m) => m[1]);
      assert.deepEqual([...new Set(headers)], ['@-'], 'a header other than @- is given on the command line');
    }
  },
  W8(c) {
    const { code, script, logical, holder, steps } = c;
    assert.ok(!/\bset\s+-[a-z]*x/.test(code) && !/xtrace/.test(code) && !/\bbash\s+-[a-z]*x/.test(code), 'xtrace is switched on');
    assert.ok(!/(^|\s)-x(\s|$)/.test(String(holder.shell ?? '')), 'the step shell traces');
    assert.ok(!/\b(printenv|declare\s+-p|export\s+-p|compgen\s+-e)\b|(^|[;&|]\s*)env(\s|$)/m.test(code), 'the script dumps the environment');
    assert.ok(!/GITHUB_(ENV|OUTPUT|STATE|PATH|STEP_SUMMARY)/.test(script), 'the script writes to a GITHUB_* file');
    assert.ok(!/::(add-mask|set-output|save-state)/.test(script), 'the script uses a workflow command that handles the value');
    for (const line of logical) {
      // a line that READS the value (the name alone, inside a message, is not a read)
      if (!/\$\{?VERCEL_AUTOMATION_BYPASS_SECRET/.test(line)) continue;
      const isEmptyCheck = /^if \[ -z "\$\{?VERCEL_AUTOMATION_BYPASS_SECRET\}?" \]; then$/.test(line);
      const isHeaderToCurl = /^printf\b.*\|\s*curl\b/.test(line);
      assert.ok(isEmptyCheck || isHeaderToCurl, `the secret is read somewhere other than the empty check and the printf piped into curl: ${line}`);
    }
    for (const line of logical) {
      const bare = withoutQuotes(line);
      for (const [, op, target] of bare.matchAll(/(\d*>>?|&>>?)\s*(\S*)/g)) {
        assert.ok(target === '/dev/null' || target.startsWith('&'), `a redirect ${op} ${target} writes somewhere: ${line}`);
      }
      assert.ok(!/\b(tee|dd)\b/.test(bare), `tee or dd in: ${line}`);
    }
    for (const step of steps) assert.ok(!/upload-artifact|actions\/cache/.test(String(step.uses ?? '')), `step "${nameOf(step)}" stores something`);
  },
  W9(c) {
    assert.deepEqual(swallowProblems('preview-smoke', c.steps), []);
    assert.ok(/\bset\s+-[a-z]*e/.test(c.code) || /-[a-z]*e/.test(String(c.holder.shell ?? '')), 'errexit is not set');
    assert.ok(/pipefail/.test(c.code) || /pipefail/.test(String(c.holder.shell ?? '')), 'pipefail is not set');
    assert.ok(!has(c.job, 'continue-on-error'), 'the job has continue-on-error');
    assert.ok(!/\|\|\s*(true|:|exit\s+0)\b/.test(c.code), 'a command is followed by || true');
  },
  W10(c) {
    const arms = [...c.code.matchAll(/^\s*(\d{3})\)/gm)].map((m) => m[1]).sort();
    assert.deepEqual(arms, ['401', '503']);
    assert.ok(c.code.includes('{"error":"unauthenticated"}'), 'the 401 body is not checked');
    assert.ok(c.code.includes('{"error":"unavailable"}'), 'the 503 body is not checked');
    assert.ok(c.code.includes('{"status":"ok"}'), 'the health body is not checked');
  },
};

test('[PA-W0] the workflow has one job and one step that carries the secret (guards the tests below)', () => checks.W0(real));
test('[PA-W1] the only trigger is deployment_status', () => checks.W1(real));
test('[PA-W2] the job runs only for state success, environment Preview and creator vercel[bot], joined by &&; no step has its own if', () => checks.W2(real));
test('[PA-W3] permissions are exactly contents: read - at the workflow, and nowhere wider on the job', () => checks.W3(real));
test('[PA-W4] the secret is in the env of one step only, not the workflow or the job, and never inside a run script', () => checks.W4(real));
test('[PA-W5] the target URL reaches the script by env only, never by an expression in the script', () => checks.W5(real));
test('[PA-W6] the URL check precedes the first curl, and a failed check exits', () => checks.W6order(real));
test('[PA-W6] the URL regex accepts unique deployment hosts and rejects aliases, other slugs, attacker shapes and over-specified URLs', () => checks.W6regex(real));
test('[PA-W7] curl takes the header from stdin (-H @-), is limited to https, and never follows redirects or traces', () => checks.W7(real));
test('[PA-W8] no xtrace, no echo of the secret, no environment dump, no file or GitHub-file output', () => checks.W8(real));
test('[PA-W9] the script and job fail closed: errexit and pipefail, nothing swallows a failure', () => checks.W9(real));
test('[PA-W10] the protected path accepts exactly the statuses 401 and 503', () => checks.W10(real));

// ---- mutation checks: break a copy of the workflow, the named check must fail ----------------------------------------
function mutate(src, from, to) {
  const out = src.replace(from, () => to);
  assert.notEqual(out, src, `the mutation ${String(from)} matched nothing, so it proves nothing`);
  return out;
}
const MUTANTS = [
  ['W1', 'a second trigger is added', (s) => mutate(s, /^on:\n/m, 'on:\n  push:\n')],
  ['W2', 'the environment check is inverted', (s) => mutate(s, "== 'Preview'", "!= 'Preview'")],
  ['W2', 'the vercel[bot] check is dropped', (s) => mutate(s, / && github\.event\.deployment_status\.creator\.login == 'vercel\[bot\]'/, '')],
  ['W2', 'the state check is widened with ||', (s) => mutate(s, "state == 'success'", "state == 'success' || github.event.deployment_status.state == 'pending'")],
  ['W3', 'contents is write', (s) => mutate(s, /^ {2}contents: read$/m, '  contents: write')],
  ['W3', 'a wider permission is added', (s) => mutate(s, /^ {2}contents: read$/m, '  contents: read\n  id-token: write')],
  ['W4', 'the secret moves to the job env', (s) => mutate(s, /^ {4}runs-on: ubuntu-latest$/m, '    runs-on: ubuntu-latest\n    env:\n      LEAK: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}')],
  ['W4', 'a second secret expression appears in the script', (s) => mutate(s, 'set -euo pipefail', 'set -euo pipefail\n          x="${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}"')],
  ['W5', 'the target URL is interpolated into the script', (s) => mutate(s, 'base="${TARGET_URL%/}"', 'base="${{ github.event.deployment_status.target_url }}"')],
  ['W6regex', 'the URL regex loses its end anchor', (s) => mutate(s, "/?$'", "'")],
  ['W6regex', 'the hash part allows a hyphen again (branch aliases and attacker slugs get through)', (s) => mutate(s, 'nestly-[a-z0-9]+-', 'nestly-[a-z0-9-]+-')],
  ['W6regex', 'the hash part allows a dot', (s) => mutate(s, 'nestly-[a-z0-9]+-', 'nestly-[a-z0-9.]+-')],
  ['W6regex', 'http is allowed', (s) => mutate(s, "'^https://", "'^https?://")],
  ['W6order', 'the URL check is skipped', (s) => mutate(s, /if ! \[\[ "\$\{TARGET_URL\}" =~ \$url_rule \]\]; then/, 'if false; then')],
  ['W7', 'curl follows redirects', (s) => mutate(s, 'curl --silent', 'curl --location --silent')],
  ['W7', 'curl is verbose', (s) => mutate(s, 'curl --silent', 'curl -sv')],
  ['W7', 'the header is on the command line', (s) => mutate(s, '--header @-', '--header "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}"')],
  ['W7', 'the https-only limit is dropped', (s) => mutate(s, /--proto '=https' /, '')],
  ['W8', 'xtrace is on', (s) => mutate(s, 'set -euo pipefail', 'set -euxo pipefail')],
  ['W8', 'the secret is echoed', (s) => mutate(s, 'set -euo pipefail', 'set -euo pipefail\n          echo "${VERCEL_AUTOMATION_BYPASS_SECRET}"')],
  ['W8', 'something is exported to later steps', (s) => mutate(s, 'set -euo pipefail', 'set -euo pipefail\n          echo "S=x" >> "$GITHUB_ENV"')],
  ['W9', 'a command swallows its failure', (s) => mutate(s, 'base="${TARGET_URL%/}"', 'base="${TARGET_URL%/}" || true')],
  ['W9', 'pipefail is dropped', (s) => mutate(s, 'set -euo pipefail', 'set -eu')],
  ['W9', 'the job continues on error', (s) => mutate(s, /^ {4}timeout-minutes: 5$/m, '    timeout-minutes: 5\n    continue-on-error: true')],
  ['W10', 'a third status is accepted', (s) => mutate(s, /^ {12}\*\)$/m, '            200) expected=\'{"error":"unauthenticated"}\' ;;\n            *)')],
  ['W10', 'the 503 arm becomes 500', (s) => mutate(s, '503)', '500)')],
];
for (const [name, what, make] of MUTANTS) {
  test(`[PA-M] check ${name} fails when ${what}`, () => {
    const mutant = ctx(make(source));
    assert.throws(() => checks[name](mutant), undefined, `check ${name} still passes when ${what}`);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// part two - run the step's script with bash against a fake curl

const SECRET = 'FAKE-SECRET-MARKER-7c1e90ab';
const posix = (p) => p.replace(/\\/g, '/');
const work = mkdtempSync(join(tmpdir(), 'preview-smoke-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

const bin = join(work, 'bin');
mkdirSync(bin);
const FAKE_CURL = `#!/usr/bin/env bash
if [ -n "\${FAKE_PROBE:-}" ]; then echo FAKE-CURL-PROBE; exit 0; fi
n=$(( $(cat "$FAKE_DIR/count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$FAKE_DIR/count"
for a in "$@"; do printf '%s\\n' "$a"; done > "$FAKE_DIR/argv-$n"
cat > "$FAKE_DIR/stdin-$n"
url="\${!#}"
case "$url" in
  */api/health) code="$HEALTH_CODE"; body="$HEALTH_BODY" ;;
  */api/anything) code="$PROT_CODE"; body="$PROT_BODY" ;;
  *) code=404; body='{}' ;;
esac
if [ "$n" = "\${CURL_FAIL_ON:-0}" ]; then exit "\${CURL_FAIL_CODE:-7}"; fi
printf '%s\\n%s' "$body" "$code"
`;
const JQ_SHIM_JS = `
const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
const args = process.argv.slice(2); const vars = {}; let filter = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--argjson') { vars[args[i + 1]] = JSON.parse(args[i + 2]); i += 2; }
  else if (!args[i].startsWith('-')) filter = args[i];
}
let input = ''; process.stdin.on('data', (d) => (input += d)); process.stdin.on('end', () => {
  let doc; try { doc = JSON.parse(input); } catch { process.exit(2); }
  const rhs = filter.replace(/^\\.\\s*==\\s*/, '').trim();
  const want = rhs.startsWith('$') ? vars[rhs.slice(1)] : JSON.parse(rhs);
  const same = JSON.stringify(sort(doc)) === JSON.stringify(sort(want));
  console.log(String(same)); process.exit(same ? 0 : 1);
});
`;
writeFileSync(join(bin, 'curl'), FAKE_CURL, { mode: 0o755 });
writeFileSync(join(work, 'jq-shim.mjs'), JQ_SHIM_JS);

function baseEnv(extra) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(VERCEL_|GITHUB_|TARGET_URL|HEALTH_|PROT_|FAKE_|CURL_)/i.test(k)) delete env[k];
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${bin}${delimiter}${env[pathKey] ?? ''}`;
  env.MSYS_NO_PATHCONV = '1';
  return { ...env, ...extra };
}

const probe = (() => {
  const r = spawnSync('bash', ['--noprofile', '--norc', '-c', 'curl --probe; command -v jq >/dev/null && echo HAS-JQ'], {
    env: baseEnv({ FAKE_PROBE: '1' }),
    encoding: 'utf8',
  });
  if (r.error || !String(r.stdout).includes('FAKE-CURL-PROBE')) {
    return { ok: false, reason: `no usable bash that runs the fake curl (${r.error?.message ?? String(r.stderr).split('\n')[0]})` };
  }
  return { ok: true, hasJq: String(r.stdout).includes('HAS-JQ') };
})();
if (probe.ok && !probe.hasJq) {
  writeFileSync(join(bin, 'jq'), `#!/usr/bin/env bash\nexec "${posix(process.execPath)}" "${posix(join(work, 'jq-shim.mjs'))}" "$@"\n`, { mode: 0o755 });
}
const skip = probe.ok ? false : probe.reason;
const asFile = (text) => {
  const file = join(work, `step-${Math.random().toString(36).slice(2)}.sh`);
  writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
  return file;
};
const scriptFile = asFile(real.script);

let runNo = 0;
// Runs a step script (the real one unless `scriptText` is given). `health` and `prot` are [status, body]; `failOn` makes
// that numbered curl call exit non-zero with `failCode`.
function run({
  target = ACCEPT_URLS[0],
  secret = SECRET,
  health = [200, '{"status":"ok"}'],
  prot = [401, '{"error":"unauthenticated"}'],
  failOn = 0,
  failCode = 7,
  unsetSecret = false,
  scriptText,
} = {}) {
  runNo += 1;
  const fake = join(work, `fake-${runNo}`);
  const cwd = join(work, `cwd-${runNo}`);
  const gh = join(work, `gh-${runNo}`);
  for (const d of [fake, cwd, gh]) mkdirSync(d);
  const ghFiles = ['ENV', 'OUTPUT', 'STATE', 'PATH', 'SUMMARY'].map((n) => join(gh, n));
  for (const f of ghFiles) writeFileSync(f, '');
  const extra = {
    FAKE_DIR: posix(fake),
    TARGET_URL: target,
    HEALTH_CODE: String(health[0]),
    HEALTH_BODY: health[1],
    PROT_CODE: String(prot[0]),
    PROT_BODY: prot[1],
    CURL_FAIL_ON: String(failOn),
    CURL_FAIL_CODE: String(failCode),
    GITHUB_ENV: posix(ghFiles[0]),
    GITHUB_OUTPUT: posix(ghFiles[1]),
    GITHUB_STATE: posix(ghFiles[2]),
    GITHUB_PATH: posix(ghFiles[3]),
    GITHUB_STEP_SUMMARY: posix(ghFiles[4]),
  };
  if (!unsetSecret) extra[secretName] = secret;
  const file = scriptText === undefined ? scriptFile : asFile(scriptText);
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', posix(file)], { cwd, env: baseEnv(extra), encoding: 'utf8', timeout: 60_000 });
  const count = existsSync(join(fake, 'count')) ? Number(readFileSync(join(fake, 'count'), 'utf8').trim()) : 0;
  const calls = Array.from({ length: count }, (_, i) => ({
    argv: readFileSync(join(fake, `argv-${i + 1}`), 'utf8').split('\n').slice(0, -1),
    stdin: readFileSync(join(fake, `stdin-${i + 1}`), 'utf8'),
  }));
  return {
    status: r.status,
    out: `${r.stdout}${r.stderr}`,
    calls,
    cwdFiles: readdirSync(cwd),
    ghSizes: ghFiles.map((f) => statSync(f).size),
  };
}

// The secret may appear in exactly one place: the stdin of a curl call.
function assertSecretOnlyInStdin(r, secret = SECRET) {
  assert.ok(!r.out.includes(secret), 'the secret reached stdout or stderr');
  for (const [i, c] of r.calls.entries()) assert.ok(!c.argv.some((a) => a.includes(secret)), `the secret is in the argv of curl call ${i + 1}`);
  assert.deepEqual(r.cwdFiles, [], 'the script wrote a file into its working directory');
  assert.deepEqual(r.ghSizes, [0, 0, 0, 0, 0], 'the script wrote to a GITHUB_* file');
}

test('[PA-B0] harness check: a healthy preview passes, so the failures below mean something', { skip }, () => {
  const r = run();
  assert.equal(r.status, 0, r.out);
  assert.equal(r.calls.length, 2);
  assertSecretOnlyInStdin(r);
});

test('[PA-B1] both requests go to the exact https origin, carry the header on stdin only, and use --proto =https with no redirects', { skip }, () => {
  const r = run({ target: 'https://nestly-abc123-afikyermis-projects.vercel.app/' });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.calls.length, 2);
  const [health, prot] = r.calls;
  assert.equal(health.argv.at(-1), 'https://nestly-abc123-afikyermis-projects.vercel.app/api/health');
  assert.equal(prot.argv.at(-1), 'https://nestly-abc123-afikyermis-projects.vercel.app/api/anything');
  for (const c of r.calls) {
    assert.equal(c.stdin, `x-vercel-protection-bypass: ${SECRET}\n`);
    assert.ok(c.argv.includes('@-'), 'the header is not read from stdin');
    assert.equal(c.argv[c.argv.indexOf('--proto') + 1], '=https');
    for (const a of c.argv) {
      assert.ok(!/^(-L|--location|--location-trusted|-v|--verbose|--trace|--trace-ascii|-i|--include|-D|-o|-O)$/.test(a), `curl argument ${a}`);
      assert.ok(!/^-[A-Za-z]*[Lv][A-Za-z]*$/.test(a), `curl short flags ${a}`);
    }
    assert.equal(c.argv.filter((a) => a.startsWith('http')).length, 1, 'curl was given more than one URL');
  }
  assertSecretOnlyInStdin(r);
});

test('[PA-B1] the secret travels verbatim as the header even when it is shaped like shell, printf or a URL', { skip }, () => {
  const hostile = 'zz%s%d`id`$(touch PWNED)"q\'x y\\n;&|<>?token=1';
  const r = run({ secret: hostile });
  assert.equal(r.status, 0, r.out);
  for (const c of r.calls) assert.equal(c.stdin, `x-vercel-protection-bypass: ${hostile}\n`);
  assert.ok(!r.out.includes(hostile));
  assert.deepEqual(r.cwdFiles, [], 'a command inside the secret ran');
  for (const c of r.calls) assert.ok(!c.argv.some((a) => a.includes('token=1') || a.includes('PWNED')));
});

for (const url of ACCEPT_URLS) {
  test(`[PA-B2] a unique deployment URL is accepted: ${url}`, { skip }, () => {
    const r = run({ target: url });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.calls.length, 2);
    assertSecretOnlyInStdin(r);
  });
}

for (const [what, url] of REJECT_URLS) {
  test(`[PA-B2] ${what} is refused before any curl: nothing is sent`, { skip }, () => {
    const r = run({ target: url });
    assert.notEqual(r.status, 0, `the script passed for ${JSON.stringify(url)}`);
    assert.equal(r.calls.length, 0, `curl was called, with the header, for ${JSON.stringify(url)}`);
    assertSecretOnlyInStdin(r);
  });
}

test('[PA-B2] a missing or an empty secret stops the script before any curl', { skip }, () => {
  for (const r of [run({ unsetSecret: true }), run({ secret: '' })]) {
    assert.notEqual(r.status, 0);
    assert.equal(r.calls.length, 0);
  }
});

const HEALTH_FAILS = [
  ['status 500 with the right body', [500, '{"status":"ok"}']],
  ['status 401 with the protected-path body', [401, '{"error":"unauthenticated"}']],
  ['status 404', [404, '{"error":"not_found"}']],
  ['status 302', [302, '']],
  ['status 204', [204, '']],
  ['status 503', [503, '{"error":"unavailable"}']],
  ['200 with an empty body', [200, '']],
  ['200 with another status value', [200, '{"status":"degraded"}']],
  ['200 with an extra field', [200, '{"status":"ok","extra":1}']],
  ['200 with a JSON array', [200, '[{"status":"ok"}]']],
  ['200 with the string "ok"', [200, '"ok"']],
  ["200 with Vercel's protection page", [200, '<!doctype html><title>Authentication Required</title>']],
  ['200 with truncated JSON', [200, '{"status":"ok"']],
];
for (const [what, health] of HEALTH_FAILS) {
  test(`[PA-B3] /api/health ${what} fails the job`, { skip }, () => {
    const r = run({ health });
    assert.notEqual(r.status, 0, 'the job passed');
    assert.ok(r.calls.length >= 1, 'it failed before it asked the server anything');
    assertSecretOnlyInStdin(r);
  });
}

test('[PA-B3] /api/health 200 with the body formatted differently (newline, indentation) still passes', { skip }, () => {
  for (const body of ['{"status":"ok"}\n', '{\n  "status": "ok"\n}']) {
    const r = run({ health: [200, body] });
    assert.equal(r.status, 0, `${JSON.stringify(body)}: ${r.out}`);
  }
});

const PROT_FAILS = [
  ...[200, 201, 204, 301, 302, 307, 308, 400, 402, 403, 404, 405, 429, 500, 501, 502, 504].map((s) => [
    `status ${s}`,
    [s, s === 200 ? '{"ok":true}' : '{"error":"unauthenticated"}'],
  ]),
  ['status 200 even with an unauthenticated-looking body', [200, '{"error":"unauthenticated"}']],
  ['status 200 with an empty body', [200, '']],
  ['401 with the 503 body', [401, '{"error":"unavailable"}']],
  ['503 with the 401 body', [503, '{"error":"unauthenticated"}']],
  ['401 with an empty body', [401, '']],
  ["401 with Vercel's protection page", [401, '<!doctype html><title>Authentication Required</title>']],
  ['401 with an extra field', [401, '{"error":"unauthenticated","detail":"x"}']],
  ['401 with a different error code', [401, '{"error":"forbidden"}']],
  ["503 with Vercel's own error page", [503, '<html>Service Unavailable</html>']],
  ['503 with an empty body', [503, '']],
];
for (const [what, prot] of PROT_FAILS) {
  test(`[PA-B4] the protected path answering ${what} fails the job (fail closed)`, { skip }, () => {
    const r = run({ prot });
    assert.notEqual(r.status, 0, 'the job passed');
    assert.equal(r.calls.length, 2, 'the job failed before it reached the protected path, so this proves nothing about it');
    assertSecretOnlyInStdin(r);
  });
}

test('[PA-B4] the protected path passes for exactly 401 {"error":"unauthenticated"} and 503 {"error":"unavailable"}', { skip }, () => {
  for (const prot of [[401, '{"error":"unauthenticated"}'], [503, '{"error":"unavailable"}'], [401, '{"error":"unauthenticated"}\n']]) {
    const r = run({ prot });
    assert.equal(r.status, 0, `${prot.join(' ')}: ${r.out}`);
    assert.equal(r.calls.length, 2);
    assertSecretOnlyInStdin(r);
  }
});

test('[PA-B5] a curl failure (connection error, timeout) on either request fails the job - nothing is swallowed', { skip }, () => {
  for (const failOn of [1, 2]) {
    for (const failCode of [6, 7, 28, 35, 56, 22]) {
      const r = run({ failOn, failCode });
      assert.notEqual(r.status, 0, `curl call ${failOn} exiting ${failCode} did not fail the job`);
      assert.ok(!r.out.includes('preview smoke passed'), 'the script reported success');
      assert.equal(r.calls.length, failOn, 'the script went on after a failed request');
      assertSecretOnlyInStdin(r);
    }
  }
});

// ---- mutation checks for the behaviour harness: broken scripts must be caught by the assertions above ----------------
const BEHAVIOUR_MUTANTS = [
  [
    'the URL check is skipped, so the header goes to an attacker host',
    (s) => mutate(s, /if ! \[\[ "\$\{TARGET_URL\}" =~ \$url_rule \]\]; then/, 'if false; then'),
    (m) => {
      const r = run({ scriptText: m, target: 'https://nestly-x.evil.com/?-afikyermis-projects.vercel.app' });
      assert.ok(r.calls.length > 0 && r.calls[0].stdin.includes(SECRET), 'the harness did not see the header leave');
    },
  ],
  [
    'the hash part allows a hyphen again, so an attacker-shaped slug gets the header',
    (s) => mutate(s, 'nestly-[a-z0-9]+-', 'nestly-[a-z0-9-]+-'),
    (m) => {
      const r = run({ scriptText: m, target: 'https://nestly-abc123-evil-afikyermis-projects.vercel.app' });
      assert.ok(r.calls.length > 0 && r.calls[0].stdin.includes(SECRET), 'the harness did not see the header leave');
    },
  ],
  [
    'the header is on the command line, so the secret is in the argv',
    (s) => mutate(s, '--header @-', '--header "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}"'),
    (m) => assert.throws(() => assertSecretOnlyInStdin(run({ scriptText: m }))),
  ],
  [
    'the secret is echoed, so it reaches the log',
    (s) => mutate(s, 'set -euo pipefail', 'set -euo pipefail\n          echo "${VERCEL_AUTOMATION_BYPASS_SECRET}"'),
    (m) => assert.throws(() => assertSecretOnlyInStdin(run({ scriptText: m }))),
  ],
  [
    'the secret is written to GITHUB_ENV',
    (s) => mutate(s, 'set -euo pipefail', 'set -euo pipefail\n          echo "S=${VERCEL_AUTOMATION_BYPASS_SECRET}" >> "$GITHUB_ENV"'),
    (m) => assert.throws(() => assertSecretOnlyInStdin(run({ scriptText: m }))),
  ],
  [
    'a 200 is accepted on the protected path',
    (s) => mutate(s, '503)', '200)'),
    (m) => assert.equal(run({ scriptText: m, prot: [200, '{"error":"unavailable"}'] }).status, 0),
  ],
  [
    'the health status is not checked',
    (s) => mutate(s, /if \[ "\$\{health_status\}" != "200" \]; then/, 'if false; then'),
    (m) => assert.equal(run({ scriptText: m, health: [500, '{"status":"ok"}'] }).status, 0),
  ],
  [
    'the protected body is not checked',
    (s) => mutate(s, /jq -e --argjson want "\$\{expected\}" '\. == \$want'/, 'cat'),
    (m) => assert.equal(run({ scriptText: m, prot: [401, '<html>Vercel login</html>'] }).status, 0),
  ],
];
for (const [what, make, prove] of BEHAVIOUR_MUTANTS) {
  test(`[PA-M] the harness catches a broken script: ${what}`, { skip }, () => prove(make(real.script)));
}
