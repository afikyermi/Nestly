// Tests for tools/migrate-url-guard.mjs, from I1 F1.1 spec criterion 5:
//   "It rejects a URL whose user is not app_owner.<ref> for that environment or whose port is not 5432,
//    and it never prints the URL."
// and, carried into part b, from part a's CRITIC finding 1 and finding 6 (.work/identity-platform/findings.md):
//   the guard rejects a password that fails decodeURIComponent or decodes to a NUL, a non-empty URL hash or any raw "#",
//   and an sslmode other than absent / require / verify-full; and it still never prints the URL or the password.
// Only fake URLs and a fake password are used. The password below is a marker: it must never appear in any output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkMigrationUrl, PROJECT_REFS } from './migrate-url-guard.mjs';

const script = fileURLToPath(new URL('./migrate-url-guard.mjs', import.meta.url));

const PASSWORD = 'Zq7MARKERpassw0rdXk3';
const HOST = 'aws-0-eu-central-1.pooler.supabase.com';
const FAKE_REF = 'zzzzfakerefzzzzfakeref';
const ENVIRONMENTS = ['db-preview', 'db-production'];
const other = (environment) => (environment === 'db-preview' ? 'db-production' : 'db-preview');

const urlFor = ({ user, password = PASSWORD, host = HOST, port = '5432', path = '/postgres', query = '' }) =>
  `postgresql://${user}:${password}@${host}${port === '' ? '' : `:${port}`}${path}${query}`;
const good = (environment) => urlFor({ user: `app_owner.${PROJECT_REFS[environment]}` });

// Everything a caller could see: the result object, whatever its shape.
const visible = (result) => JSON.stringify(result);
const leaks = (result, extra = []) => [PASSWORD, ...extra].filter((secret) => visible(result).includes(secret));

test('[F1.1-a c5] the guard knows exactly the two environments, with different project refs', () => {
  assert.deepEqual(Object.keys(PROJECT_REFS).sort(), ['db-preview', 'db-production']);
  assert.ok(PROJECT_REFS['db-preview'].length > 8 && PROJECT_REFS['db-production'].length > 8);
  assert.notEqual(PROJECT_REFS['db-preview'], PROJECT_REFS['db-production']);
});

for (const environment of ENVIRONMENTS) {
  test(`[F1.1-a c5] accepts app_owner.<ref> on port 5432 for ${environment}`, () => {
    assert.equal(checkMigrationUrl(good(environment), environment).ok, true);
  });
}

for (const environment of ENVIRONMENTS) {
  test(`[F1.1-a c5] rejects the other environment's URL for ${environment} (wrong ref)`, () => {
    const result = checkMigrationUrl(good(other(environment)), environment);
    assert.equal(result.ok, false);
    assert.deepEqual(leaks(result, [good(other(environment))]), []);
  });
}

const wrongUsers = (environment) => {
  const ref = PROJECT_REFS[environment];
  return {
    'a bare app_owner with no ref': 'app_owner',
    'postgres.<ref>': `postgres.${ref}`,
    'app_server.<ref>': `app_server.${ref}`,
    'app_jobs.<ref>': `app_jobs.${ref}`,
    'service_role.<ref>': `service_role.${ref}`,
    'a made-up ref': `app_owner.${FAKE_REF}`,
    'a ref with a suffix': `app_owner.${ref}x`,
    'a ref with a prefix': `app_owner.x${ref}`,
    'a ref plus a second segment': `app_owner.${ref}.extra`,
    'a prefixed role name': `xapp_owner.${ref}`,
    'an upper-case role': `APP_OWNER.${ref}`,
    'an empty user': '',
  };
};

for (const environment of ENVIRONMENTS) {
  for (const [label, user] of Object.entries(wrongUsers(environment))) {
    test(`[F1.1-a c5] rejects ${label} as the user for ${environment}`, () => {
      const result = checkMigrationUrl(urlFor({ user }), environment);
      assert.equal(result.ok, false);
      assert.deepEqual(leaks(result, [FAKE_REF]), []);
    });
  }
}

for (const environment of ENVIRONMENTS) {
  for (const port of ['6543', '5433', '54322', '543', '1', '65535']) {
    test(`[F1.1-a c5] rejects port ${port} for ${environment} (transaction pooler or other, not the session pooler)`, () => {
      const result = checkMigrationUrl(urlFor({ user: `app_owner.${PROJECT_REFS[environment]}`, port }), environment);
      assert.equal(result.ok, false);
      assert.deepEqual(leaks(result), []);
    });
  }
}

for (const environment of ENVIRONMENTS) {
  const user = `app_owner.${PROJECT_REFS[environment]}`;
  // libpq, node-postgres and pgx let a query parameter override the user or the port of the URL.
  const overrides = {
    'a user override': `?user=postgres.${PROJECT_REFS[environment]}`,
    'a port override': '?port=6543',
  };
  for (const [label, query] of Object.entries(overrides)) {
    test(`[F1.1-a c5] rejects a URL with ${label} in the query for ${environment}`, () => {
      const result = checkMigrationUrl(urlFor({ user, query }), environment);
      assert.equal(result.ok, false);
      assert.deepEqual(leaks(result), []);
    });
  }
}

for (const environment of ENVIRONMENTS) {
  const malformed = {
    'undefined': undefined,
    'null': null,
    'an empty string': '',
    'whitespace': '   ',
    'a number': 5432,
    'not a URL': 'this is not a url',
    'a bare scheme': 'postgresql://',
    'no credentials': `postgresql://${HOST}:5432/postgres`,
    'colons only': 'postgresql://:@:',
    'an invalid percent escape in the user': `postgresql://app_owner.%ZZ:${PASSWORD}@${HOST}:5432/postgres`,
    'an unencoded / in the password': `postgresql://app_owner.${PROJECT_REFS[environment]}:pa/${PASSWORD}@${HOST}:5432/postgres`,
  };
  for (const [label, raw] of Object.entries(malformed)) {
    test(`[F1.1-a c5] rejects ${label} for ${environment} without echoing it`, () => {
      const result = checkMigrationUrl(raw, environment);
      assert.equal(result.ok, false);
      assert.deepEqual(leaks(result, typeof raw === 'string' && raw.trim() ? [raw] : []), []);
    });
  }
}

test('[F1.1-a c5] rejects an unknown or hostile environment name, even with a URL good for another', () => {
  for (const environment of ['', 'db-staging', 'DB-PREVIEW', 'preview', 'db-preview ', '__proto__', 'constructor', 'toString', undefined]) {
    const result = checkMigrationUrl(good('db-preview'), environment);
    assert.equal(result.ok, false, `accepted environment ${String(environment)}`);
    assert.deepEqual(leaks(result), []);
  }
});

test('[F1.1-a c5] a rejection says something: it is a result with a reason, not a bare false', () => {
  const result = checkMigrationUrl(good('db-production'), 'db-preview');
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.reason.length > 0);
});

test('[F1.1-a c5] no rejection reason contains the password, the full URL or the supplied (wrong) user', () => {
  const supplied = urlFor({ user: `app_owner.${FAKE_REF}`, port: '6543' });
  for (const environment of ENVIRONMENTS) {
    const result = checkMigrationUrl(supplied, environment);
    assert.equal(result.ok, false);
    assert.deepEqual(leaks(result, [supplied, FAKE_REF, `${PASSWORD}@`]), []);
  }
});

// ---- the command line: what the workflow actually runs and what ends up in the job log -----------------------------

function run(args, env) {
  const clean = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PGSSLMODE: 'require', ...env };
  const result = spawnSync(process.execPath, [script, ...args], { env: clean, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

for (const environment of ENVIRONMENTS) {
  test(`[F1.1-a c5] the command exits 0 for a good URL in ${environment} and prints nothing of the URL`, () => {
    const result = run([environment], { APP_OWNER_DATABASE_URL: good(environment) });
    assert.equal(result.status, 0);
    assert.ok(!result.output.includes(PASSWORD), 'the password is printed');
    assert.ok(!result.output.includes(good(environment)), 'the URL is printed');
  });

  test(`[F1.1-a c5] the command exits non-zero for the other environment's URL in ${environment} and prints nothing of it`, () => {
    const supplied = good(other(environment));
    const result = run([environment], { APP_OWNER_DATABASE_URL: supplied });
    assert.notEqual(result.status, 0);
    assert.ok(!result.output.includes(PASSWORD), 'the password is printed');
    assert.ok(!result.output.includes(supplied), 'the URL is printed');
  });

  test(`[F1.1-a c5] the command exits non-zero for port 6543 in ${environment} and prints nothing of the URL`, () => {
    const supplied = urlFor({ user: `app_owner.${PROJECT_REFS[environment]}`, port: '6543' });
    const result = run([environment], { APP_OWNER_DATABASE_URL: supplied });
    assert.notEqual(result.status, 0);
    assert.ok(!result.output.includes(PASSWORD));
    assert.ok(!result.output.includes(supplied));
  });

  test(`[F1.1-a c5] the command exits non-zero when APP_OWNER_DATABASE_URL is unset in ${environment}`, () => {
    assert.notEqual(run([environment], {}).status, 0);
  });
}

test('[F1.1-a c5] the command exits non-zero with no environment argument or an unknown one, and never prints the URL', () => {
  for (const args of [[], ['db-staging'], ['']]) {
    const result = run(args, { APP_OWNER_DATABASE_URL: good('db-preview') });
    assert.notEqual(result.status, 0, `accepted arguments ${JSON.stringify(args)}`);
    assert.ok(!result.output.includes(PASSWORD));
  }
});

// =====================================================================================================================
// Part a CRITIC finding 1 - a password libpq cannot parse.
//   WHATWG URL accepts a password with invalid percent-encoding; psql then rejects it with an error that quotes the
//   decoded password, which GitHub's masking of the whole secret does not cover. The guard must refuse it first.
//   Failure being guarded: a raw "%" in the pasted prod password -> guard passes -> psql prints it in a public log.
// =====================================================================================================================

const userOf = (environment) => `app_owner.${PROJECT_REFS[environment]}`;

// Each of these fails decodeURIComponent.
const UNDECODABLE = {
  'a lone %': '%',
  'a trailing %': 'abc%',
  'a % followed by one hex digit': 'ab%2',
  'a % followed by non-hex characters': '%ZZ',
  'a % followed by a hex digit and a non-hex character': 'ab%Z1cd',
  'a doubled %': '%%',
  'a truncated multi-byte sequence': '%E0%A4%A',
  'a lone UTF-8 continuation byte': '%80',
  'an invalid UTF-8 lead byte (%C0)': '%C0',
  'an invalid UTF-8 byte (%FF)': '%FF',
  'a %u escape': '%u0041',
};

for (const environment of ENVIRONMENTS) {
  for (const [label, tail] of Object.entries(UNDECODABLE)) {
    test(`[F1.1-a c5 finding 1] rejects a password with ${label} for ${environment}, naming no part of it`, () => {
      const supplied = urlFor({ user: userOf(environment), password: `${PASSWORD}${tail}` });
      const result = checkMigrationUrl(supplied, environment);
      assert.equal(result.ok, false, 'a password that decodeURIComponent rejects was accepted');
      assert.equal(typeof result.reason, 'string');
      assert.deepEqual(leaks(result, [supplied, `${PASSWORD}${tail}`]), []);
    });
  }
}

// A password that decodes to a NUL byte: libpq refuses it with the same kind of error.
const NUL_PASSWORDS = {
  'only %00': '%00',
  '%00 at the end': `${PASSWORD}%00`,
  '%00 at the start': `%00${PASSWORD}`,
  '%00 in the middle': 'ab%00cd',
  'a doubled %00%00': '%00%00',
};

for (const environment of ENVIRONMENTS) {
  for (const [label, password] of Object.entries(NUL_PASSWORDS)) {
    test(`[F1.1-a c5 finding 1] rejects a password containing ${label} for ${environment}`, () => {
      const supplied = urlFor({ user: userOf(environment), password });
      const result = checkMigrationUrl(supplied, environment);
      assert.equal(result.ok, false, 'a password that decodes to a NUL byte was accepted');
      assert.deepEqual(leaks(result, [supplied]), []);
    });
  }
}

// The refusal must not become a ban on legitimate passwords: valid percent-encoding still passes.
const ENCODED_BUT_VALID = {
  '%25 (an encoded %)': `${PASSWORD}%25`,
  '%23 (an encoded #)': `${PASSWORD}%23`,
  '%40 (an encoded @)': `${PASSWORD}%40x`,
  '%2F (an encoded /)': `a%2Fb${PASSWORD}`,
  '%3A (an encoded :)': `a%3Ab${PASSWORD}`,
  'a valid multi-byte sequence (%E2%82%AC)': `${PASSWORD}%E2%82%AC`,
  'plain URL-safe characters': `${PASSWORD}-._~`,
};

for (const environment of ENVIRONMENTS) {
  for (const [label, password] of Object.entries(ENCODED_BUT_VALID)) {
    test(`[F1.1-a c5 finding 1] still accepts a password with ${label} for ${environment}`, () => {
      const result = checkMigrationUrl(urlFor({ user: userOf(environment), password }), environment);
      assert.equal(result.ok, true, `rejected a valid password: ${visible(result).replace(PASSWORD, '<marker>')}`);
    });
  }
}

test('[F1.1-a c5 finding 1] the command refuses an undecodable or NUL password, exits non-zero and prints neither password nor URL', () => {
  const cases = [`${PASSWORD}%`, `${PASSWORD}%ZZ`, `${PASSWORD}%E0%A4%A`, `${PASSWORD}%00`, `%00${PASSWORD}`];
  for (const environment of ENVIRONMENTS) {
    for (const password of cases) {
      const supplied = urlFor({ user: userOf(environment), password });
      const result = run([environment], { APP_OWNER_DATABASE_URL: supplied });
      assert.notEqual(result.status, 0, `accepted password ${password.replace(PASSWORD, '<marker>')}`);
      assert.ok(!result.output.includes(PASSWORD), 'the password is printed');
      assert.ok(!result.output.includes(supplied), 'the URL is printed');
    }
  }
});

// =====================================================================================================================
// Part a CRITIC finding 6 - the fragment.
//   libpq has no fragment: psql reads "#?host=evil" as part of the URL and applies it. Reject a non-empty hash and any
//   raw "#", wherever it sits. An encoded %23 stays legal (checked above).
// =====================================================================================================================

for (const environment of ENVIRONMENTS) {
  const user = userOf(environment);
  const withHash = {
    'a fragment after the path': urlFor({ user, path: '/postgres#frag' }),
    'a bare # after the path (empty hash)': urlFor({ user, path: '/postgres#' }),
    'a fragment that smuggles a host parameter': urlFor({ user, path: '/postgres#?host=evil.example.com' }),
    'a fragment that smuggles a port parameter': urlFor({ user, path: '/postgres#?port=6543' }),
    'a fragment after a valid sslmode query': urlFor({ user, query: '?sslmode=require#x' }),
    'a fragment right after the port': `postgresql://${user}:${PASSWORD}@${HOST}:5432#?host=evil.example.com`,
    'a raw # inside the password': urlFor({ user, password: `${PASSWORD}#x` }),
    'a raw # at the end of the password': urlFor({ user, password: `${PASSWORD}#` }),
    'a raw # inside the user': `postgresql://app_owner.${PROJECT_REFS[environment]}#x:${PASSWORD}@${HOST}:5432/postgres`,
  };
  for (const [label, supplied] of Object.entries(withHash)) {
    test(`[F1.1-a c5 finding 6] rejects ${label} for ${environment}`, () => {
      const result = checkMigrationUrl(supplied, environment);
      assert.equal(result.ok, false, 'a URL with a "#" was accepted');
      assert.deepEqual(leaks(result, [supplied]), []);
    });
  }

  test(`[F1.1-a c5 finding 6] the command refuses a fragment for ${environment}, exits non-zero and prints nothing of the URL`, () => {
    const supplied = urlFor({ user, path: '/postgres#?host=evil.example.com' });
    const result = run([environment], { APP_OWNER_DATABASE_URL: supplied });
    assert.notEqual(result.status, 0);
    assert.ok(!result.output.includes(PASSWORD));
    assert.ok(!result.output.includes(supplied));
    assert.ok(!result.output.includes('evil.example.com'), 'the smuggled host is echoed');
  });
}

// =====================================================================================================================
// Part a CRITIC finding 6 - TLS. sslmode absent (the workflow sets PGSSLMODE=require), require, or verify-full; nothing else.
// =====================================================================================================================

for (const environment of ENVIRONMENTS) {
  const user = userOf(environment);
  for (const sslmode of ['require', 'verify-full']) {
    test(`[F1.1-a c5 finding 6] accepts sslmode=${sslmode} for ${environment}`, () => {
      assert.equal(checkMigrationUrl(urlFor({ user, query: `?sslmode=${sslmode}` }), environment).ok, true);
    });
  }
  test(`[F1.1-a c5 finding 6] accepts a URL with no sslmode for ${environment} (the workflow requires TLS itself)`, () => {
    assert.equal(checkMigrationUrl(urlFor({ user }), environment).ok, true);
  });

  const badModes = {
    'sslmode=disable': '?sslmode=disable',
    'sslmode=allow': '?sslmode=allow',
    'sslmode=prefer': '?sslmode=prefer',
    'sslmode=verify-ca': '?sslmode=verify-ca',
    'an empty sslmode': '?sslmode=',
    'sslmode=Require (case matters to libpq)': '?sslmode=Require',
    'sslmode=REQUIRE': '?sslmode=REQUIRE',
    'sslmode=require with a trailing space': '?sslmode=require%20',
    'sslmode=require followed by a NUL': '?sslmode=require%00',
    'sslmode=true': '?sslmode=true',
    'sslmode=0': '?sslmode=0',
    'require first, then disable': '?sslmode=require&sslmode=disable',
    'disable first, then require': '?sslmode=disable&sslmode=require',
    'require twice with prefer': '?sslmode=require&sslmode=verify-full&sslmode=prefer',
    'an encoded parameter name': '?ssl%6Dmode=disable',
  };
  for (const [label, query] of Object.entries(badModes)) {
    test(`[F1.1-a c5 finding 6] rejects ${label} for ${environment}`, () => {
      const supplied = urlFor({ user, query });
      const result = checkMigrationUrl(supplied, environment);
      assert.equal(result.ok, false, 'a URL that does not require TLS was accepted');
      assert.deepEqual(leaks(result, [supplied]), []);
    });
  }

  // Parameters libpq honours that can move the connection somewhere else, or weaken it, next to a valid sslmode.
  for (const key of ['host', 'hostaddr', 'user', 'password', 'service', 'passfile', 'options', 'sslrootcert', 'sslcert', 'sslkey']) {
    test(`[F1.1-a c5 finding 6] rejects a ${key} parameter next to a valid sslmode for ${environment}`, () => {
      const supplied = urlFor({ user, query: `?sslmode=require&${key}=evil.example.com` });
      const result = checkMigrationUrl(supplied, environment);
      assert.equal(result.ok, false, `the ${key} parameter was accepted`);
      assert.deepEqual(leaks(result, [supplied, 'evil.example.com']), []);
    });
  }

  test(`[F1.1-a c5 finding 6] the command refuses sslmode=disable for ${environment}, exits non-zero and prints nothing of the URL`, () => {
    const supplied = urlFor({ user, query: '?sslmode=disable' });
    const result = run([environment], { APP_OWNER_DATABASE_URL: supplied });
    assert.notEqual(result.status, 0);
    assert.ok(!result.output.includes(PASSWORD));
    assert.ok(!result.output.includes(supplied));
  });
}

// =====================================================================================================================
// Part a CRITIC finding 6 - the host check had no failing test.
// =====================================================================================================================

const NOT_THE_POOLER = {
  'the direct database host': 'db.cihugbwafnaujsqabgyp.supabase.co',
  'localhost': 'localhost',
  'an IPv4 address': '127.0.0.1',
  'an unrelated host': 'evil.example.com',
  'the pooler name as a prefix of another domain': 'aws-0-eu-central-1.pooler.supabase.com.evil.example.com',
  'the pooler name inside another domain': 'aws-0-eu-central-1.pooler.supabase.com-evil.example.com',
  'the supabase.com apex': 'supabase.com',
  'a lookalike domain': 'aws-0-eu-central-1.pooler.supabase.co',
  'a pooler name under a different parent': 'aws-0-eu-central-1.pooler.evil.com',
};

for (const environment of ENVIRONMENTS) {
  for (const [label, host] of Object.entries(NOT_THE_POOLER)) {
    test(`[F1.1-a c5 finding 6] rejects ${label} as the host for ${environment}`, () => {
      const supplied = urlFor({ user: userOf(environment), host });
      const result = checkMigrationUrl(supplied, environment);
      assert.equal(result.ok, false, `the host ${host} was accepted`);
      assert.deepEqual(leaks(result, [supplied]), []);
    });
  }
}
