// Tests for tools/migrate-url-guard.mjs, from I1 F1.1 spec criterion 5:
//   "It rejects a URL whose user is not app_owner.<ref> for that environment or whose port is not 5432,
//    and it never prints the URL."
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
  const clean = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env };
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
