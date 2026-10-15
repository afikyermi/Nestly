import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  T,
  accountWithAnswers,
  answersJson,
  attemptReset,
  bearerFor,
  breakEvents,
  changeAnswers,
  closeApps,
  entry,
  eventsJson,
  handleHex,
  ipHex,
  jsonOf,
  kinds,
  me,
  newAccount,
  newBareAuthUser,
  nextIp,
  record,
  recordsOf,
  hexOf,
  resetFor,
  saveAnswers,
  setStatus,
  shift,
  startApp,
  startContext,
  stopContext,
  throttle,
  unbreakEvents,
  type Context,
} from '../helpers/recovery-db.js';
import { restorePepper } from '../helpers/recovery-app.js';
import { restoreEnv } from '../helpers/identity-fixtures.js';

// F1.6 part a, the store and change paths against the real database (CI `db` job, as app_server). Spec criteria:
//   1 save   2 invalid body / one transaction   3 only scrypt hashes, peppered, nothing readable in clear   4 already set, change
//   5 own rows only   6 GET /api/me reports set / missing   8 one handle per account, a keyed hash   13 audit rows, no secrets
// Derived from spec.md, schema.md (authorization section) and interface.md only. Each test creates its own accounts (unique
// emails) and uses its own client address. The audit and the hashes are read through the fixture observers of
// supabase/tests/setup/30_recovery_fixtures.sql, because no runtime role may read them.

let ctx: Context;

beforeAll(async () => {
  ctx = await startContext();
}, 60_000);

afterEach(async () => {
  await unbreakEvents(ctx);
  await closeApps();
});

afterAll(async () => {
  await stopContext(ctx);
  restorePepper();
  restoreEnv();
});

const NONE = '-';
const SAVED = '{"ok":true}';

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c1 c6 FR-AUTH-003 AC-092] saving the two answers', () => {
  it('[F1.6 c1] an active account without answers: 201 {"ok":true}; the row exists; GET /api/me goes from "missing" to "set"', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);

    const before = await me(h, auth);
    expect(jsonOf(before.body)).toEqual({ state: 'active', recoveryQuestions: 'missing' });
    expect(await answersJson(ctx, account.id)).toBe(NONE);

    const res = await saveAnswers(h, auth);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.body).toBe(SAVED);
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');

    expect(await answersJson(ctx, account.id)).not.toBe(NONE);
    expect(jsonOf((await me(h, auth)).body)).toEqual({ state: 'active', recoveryQuestions: 'set' });
  });

  it('[F1.6 c1] any pair of the three questions can be saved, in either order', T, async () => {
    const h = await startApp(ctx);
    const pairs: Array<[string, string]> = [
      ['pet', 'nickname'],
      ['nickname', 'street'],
      ['street', 'pet'],
      ['street', 'nickname'],
    ];
    for (const [first, second] of pairs) {
      const account = await newAccount(ctx);
      const res = await saveAnswers(h, await bearerFor(ctx, account), [entry(first, 'Answer One'), entry(second, 'Answer Two')]);
      expect(res.statusCode, `${first}+${second}: ${res.body}`).toBe(201);
    }
  });

  it('[F1.6 c1] a request without a token: 401 and nothing is stored (not for any account)', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/recovery-questions',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      payload: JSON.stringify({ answers: [entry('pet', 'Rex'), entry('street', 'Herzl')] }),
    });
    expect(res.statusCode).toBe(401);
    expect(await answersJson(ctx, account.id)).toBe(NONE);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe(NONE);
  });

  it('[F1.6 c6] GET /api/me reports "set" and "missing" per account: saving for one account changes nothing for another', T, async () => {
    const h = await startApp(ctx);
    const saver = await newAccount(ctx);
    const other = await newAccount(ctx);
    await saveAnswers(h, await bearerFor(ctx, saver));
    expect(jsonOf((await me(h, await bearerFor(ctx, saver))).body)).toEqual({ state: 'active', recoveryQuestions: 'set' });
    expect(jsonOf((await me(h, await bearerFor(ctx, other))).body)).toEqual({ state: 'active', recoveryQuestions: 'missing' });
  });

  it('[F1.6 c6] other states keep {state} alone: a stopped account with saved answers reports unavailable and no recoveryQuestions', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    await saveAnswers(h, auth);
    for (const status of ['suspended', 'banned'] as const) {
      await setStatus(ctx, account.id, status);
      const res = await me(h, auth);
      expect(res.body).toBe('{"state":"unavailable"}');
    }
    await setStatus(ctx, account.id, 'active');
    expect(jsonOf((await me(h, auth)).body)).toEqual({ state: 'active', recoveryQuestions: 'set' });
    const bare = await newBareAuthUser(ctx);
    expect((await me(h, await bearerFor(ctx, bare))).body).toBe('{"state":"unregistered"}');
  });

  it('[F1.6 c1 c6 BR-024] a suspended, a banned and an unregistered caller cannot save: 403 forbidden, nothing stored', T, async () => {
    const h = await startApp(ctx);
    const suspended = await newAccount(ctx);
    const banned = await newAccount(ctx);
    const bare = await newBareAuthUser(ctx);
    await setStatus(ctx, suspended.id, 'suspended');
    await setStatus(ctx, banned.id, 'banned');
    for (const account of [suspended, banned, bare]) {
      const res = await saveAnswers(h, await bearerFor(ctx, account));
      expect(res.statusCode, `${account.email}: ${res.body}`).toBe(403);
      expect(jsonOf(res.body)).toEqual({ error: 'forbidden' });
      expect(await answersJson(ctx, account.id)).toBe(NONE);
      expect(await kinds(ctx, handleHex(ctx, account.email))).toBe(NONE);
    }
  });

  it('[F1.6 c1] a token without an email claim cannot store a lookup handle: refused, nothing stored', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const res = await saveAnswers(h, await bearerFor(ctx, account, null));
    expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
    expect(await answersJson(ctx, account.id)).toBe(NONE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c2] an invalid body stores nothing, and the write is one transaction', () => {
  const invalid: Array<[string, unknown]> = [
    ['one entry', [entry('pet', 'Rex')]],
    ['three entries', [entry('pet', 'Rex'), entry('street', 'Herzl'), entry('nickname', 'Dudi')]],
    ['the same id twice', [entry('pet', 'Rex'), entry('pet', 'Max')]],
    ['an unknown id', [entry('pet', 'Rex'), entry('school', 'Herzl')]],
    ['an answer of one character', [entry('pet', 'a'), entry('street', 'Herzl')]],
    ['an answer of 61 characters', [entry('pet', 'א'.repeat(61)), entry('street', 'Herzl')]],
  ];

  it.each(invalid)('[F1.6 c2] %s -> 400 invalid_questions; no answers row, no audit row', T, async (_label, answers) => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const res = await saveAnswers(h, await bearerFor(ctx, account), answers);
    expect(res.statusCode, res.body).toBe(400);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid_questions' });
    expect(await answersJson(ctx, account.id)).toBe(NONE);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe(NONE);
  });

  it('[F1.6 c2 c13] a failure after the first answer leaves no rows: when the audit write fails, the answers row is rolled back, and a retry then succeeds', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    const handle = handleHex(ctx, account.email);

    await breakEvents(ctx, handle, 'answers_saved');
    const failed = await saveAnswers(h, auth);
    expect(failed.statusCode, failed.body).toBeGreaterThanOrEqual(500);
    expect(failed.body).not.toBe(SAVED);
    expect(await answersJson(ctx, account.id), 'the answers row must not survive a failed save').toBe(NONE);
    expect(await kinds(ctx, handle)).toBe(NONE);
    expect(jsonOf((await me(h, auth)).body)).toEqual({ state: 'active', recoveryQuestions: 'missing' });

    await unbreakEvents(ctx);
    const retry = await saveAnswers(h, auth);
    expect(retry.statusCode, retry.body).toBe(201);
    expect(await kinds(ctx, handle)).toBe('answers_saved');
  });

  it('[F1.6 c2] a failed save does not affect the account: it can still sign in (GET /api/me still active) and save later', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    await breakEvents(ctx, handleHex(ctx, account.email), 'answers_saved');
    await saveAnswers(h, auth);
    expect((await me(h, auth)).statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c3 c8 NFR-SEC-001] only peppered scrypt hashes are stored; the handle is a keyed hash', () => {
  const PLAIN_ONE = 'Rexxy-Plaintext';
  const PLAIN_TWO = 'Herzliyya-Plaintext';

  it('[F1.6 c3] the stored row holds no plaintext and no normalised answer, in any common encoding', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    await saveAnswers(h, await bearerFor(ctx, account), [entry('pet', PLAIN_ONE), entry('street', PLAIN_TWO)]);
    const row = await answersJson(ctx, account.id);
    expect(row).not.toBe(NONE);
    for (const plain of [PLAIN_ONE, PLAIN_TWO]) {
      const normalised = plain.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const form of [plain, plain.toLowerCase(), normalised, Buffer.from(plain).toString('hex'), Buffer.from(normalised).toString('hex'), Buffer.from(plain).toString('base64'), Buffer.from(normalised).toString('base64')]) {
        expect(row.toLowerCase(), `row contains ${form}`).not.toContain(form.toLowerCase());
      }
    }
  });

  it('[F1.6 c3] scrypt with N >= 2^15, 16-byte salts that differ, 32-byte hashes, and the pair in canonical order', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    // sent in the "wrong" order on purpose: the pair has one representation
    await saveAnswers(h, await bearerFor(ctx, account), [entry('street', 'Herzl'), entry('pet', 'Rex')]);
    const row = record(await answersJson(ctx, account.id));
    expect(row.question_1).toBe('pet');
    expect(row.question_2).toBe('street');
    expect(Number(row.scrypt_log_n)).toBeGreaterThanOrEqual(15);
    expect(Number(row.scrypt_r)).toBeGreaterThanOrEqual(8);
    const bytes = (value: unknown): number => hexOf(value).length / 2;
    expect(bytes(row.answer_hash_1)).toBe(32);
    expect(bytes(row.answer_hash_2)).toBe(32);
    expect(bytes(row.answer_salt_1)).toBe(16);
    expect(bytes(row.answer_salt_2)).toBe(16);
    expect(row.answer_salt_1).not.toBe(row.answer_salt_2);
    expect(row.answer_hash_1).not.toBe(row.answer_hash_2);
  });

  it('[F1.6 c3] a per-answer random salt: two accounts with the same answers have different salts and different hashes', T, async () => {
    const h = await startApp(ctx);
    const a = await newAccount(ctx);
    const b = await newAccount(ctx);
    await saveAnswers(h, await bearerFor(ctx, a));
    await saveAnswers(h, await bearerFor(ctx, b));
    const rowA = record(await answersJson(ctx, a.id));
    const rowB = record(await answersJson(ctx, b.id));
    for (const column of ['answer_salt_1', 'answer_salt_2', 'answer_hash_1', 'answer_hash_2']) expect(rowA[column], column).not.toBe(rowB[column]);
  });

  it('[F1.6 c3] the same words under two questions do not share a hash (the question is part of what is hashed)', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    await saveAnswers(h, await bearerFor(ctx, account), [entry('pet', 'Same Words'), entry('street', 'Same Words')]);
    const row = record(await answersJson(ctx, account.id));
    expect(row.answer_hash_1).not.toBe(row.answer_hash_2);
  });

  it('[F1.6 c3] two typings of one answer store the same value: the hash is computed from the normalised form (spacing, case, niqqud do not matter)', T, async () => {
    const h = await startApp(ctx);
    const a = await accountWithAnswers(ctx, h, [entry('pet', 'Rex'), entry('street', 'בֶּן-גוריון')]);
    const res = await attemptReset(h, resetFor(a.email, [entry('pet', '  R E X '), entry('street', 'בן גוריון')]));
    expect(res.statusCode, res.body).toBe(200);
  });

  it('[F1.6 c3] the hashing work is real: saving hashes the pair with the memory-hard function (two scrypt computations per save)', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    await saveAnswers(h, await bearerFor(ctx, account));
    expect(h.spy.calls()).toBe(2);
  });

  it('[F1.6 c8] the stored handle is the keyed hash of the lower-cased, trimmed email: not the email, not its plain hash', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx, `  Handle.Check-${Date.now()}@Example.INVALID `);
    const res = await saveAnswers(h, await bearerFor(ctx, account));
    expect(res.statusCode, res.body).toBe(201);
    const row = record(await answersJson(ctx, account.id));
    const stored = hexOf(row.email_handle);
    expect(stored).toBe(handleHex(ctx, account.email));
    expect(stored).toBe(handleHex(ctx, account.email.trim().toLowerCase()));
    expect(row.email_handle).not.toContain(Buffer.from(account.email.trim().toLowerCase()).toString('hex'));
    expect(JSON.stringify(row).toLowerCase()).not.toContain('handle.check');
  });

  it('[F1.6 c8] one handle per account: a second account saving under the same email, or the same email in another case, is refused and stores nothing', T, async () => {
    const h = await startApp(ctx);
    const email = `shared-${Date.now()}@example.invalid`;
    const first = await newAccount(ctx, email);
    const sameCase = await newAccount(ctx);
    const otherCase = await newAccount(ctx);
    expect((await saveAnswers(h, await bearerFor(ctx, first))).statusCode).toBe(201);
    for (const [account, claim] of [
      [sameCase, email],
      [otherCase, ` ${email.toUpperCase()} `],
    ] as const) {
      const res = await saveAnswers(h, await bearerFor(ctx, account, claim));
      expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).not.toBe(201);
      expect(await answersJson(ctx, account.id)).toBe(NONE);
    }
    expect(await answersJson(ctx, first.id)).not.toBe(NONE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c13] the audit of the store: one row, in the same transaction, with no secret in it', () => {
  it('[F1.6 c13] a save writes exactly one answers_saved row: kind, user id, handle hash, IP hash, time', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const ip = nextIp();
    await saveAnswers(h, await bearerFor(ctx, account), [entry('pet', 'AuditWordOne'), entry('street', 'AuditWordTwo')], ip);
    const handle = handleHex(ctx, account.email);
    expect(await kinds(ctx, handle)).toBe('answers_saved');
    const events = recordsOf(await eventsJson(ctx, handle));
    expect(events).toHaveLength(1);
    const event = events[0] ?? {};
    expect(Object.keys(event).sort()).toEqual(['handle_hash', 'id', 'ip_hash', 'kind', 'occurred_at', 'user_id']);
    expect(event.user_id).toBe(account.id);
    expect(hexOf(event.handle_hash)).toBe(handle);
    expect(hexOf(event.ip_hash), 'the IP is stored as a keyed hash').toBe(ipHex(ctx, ip));
    const raw = JSON.stringify(event).toLowerCase();
    for (const secret of ['auditwordone', 'auditwordtwo', account.email.toLowerCase(), ip, 'password']) expect(raw).not.toContain(secret);
  });

  it('[F1.6 c13] a refused save (400) or a refused account (403) writes no audit row', T, async () => {
    const h = await startApp(ctx);
    const a = await newAccount(ctx);
    const s = await newAccount(ctx);
    await setStatus(ctx, s.id, 'suspended');
    await saveAnswers(h, await bearerFor(ctx, a), [entry('pet', 'Rex')]);
    await saveAnswers(h, await bearerFor(ctx, s));
    expect(await kinds(ctx, handleHex(ctx, a.email))).toBe(NONE);
    expect(await kinds(ctx, handleHex(ctx, s.email))).toBe(NONE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c4 c5] answers already set: POST is 409 and changes nothing; PUT with the current answers replaces both', () => {
  it('[F1.6 c4] a second POST -> 409 already_set, the stored row is byte-identical, no second audit row', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    await saveAnswers(h, auth);
    const before = await answersJson(ctx, account.id);
    const again = await saveAnswers(h, auth, [entry('nickname', 'Other'), entry('street', 'Different')]);
    expect(again.statusCode, again.body).toBe(409);
    expect(jsonOf(again.body)).toEqual({ error: 'already_set' });
    expect(await answersJson(ctx, account.id)).toBe(before);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe('answers_saved');
  });

  it('[F1.6 c4] PUT with the two current answers and a new valid pair -> 200; both answers and the pair are replaced; answers_changed is audited', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    await saveAnswers(h, auth);
    const before = record(await answersJson(ctx, account.id));

    const res = await changeAnswers(h, auth, [entry('pet', 'Rex'), entry('street', 'Herzl')], [entry('nickname', 'Dudi'), entry('street', 'Allenby')]);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe(SAVED);

    const after = record(await answersJson(ctx, account.id));
    expect([after.question_1, after.question_2]).toEqual(['nickname', 'street']);
    for (const column of ['answer_hash_1', 'answer_hash_2', 'answer_salt_1', 'answer_salt_2']) expect(after[column], column).not.toBe(before[column]);
    expect(after.email_handle, 'the lookup handle is never rewritten').toBe(before.email_handle);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe('answers_saved,answers_changed');

    // the new answers now open a reset; the old ones no longer do
    const ok = await attemptReset(h, { email: account.email, answers: [entry('nickname', 'Dudi'), entry('street', 'Allenby')], password: 'סיסמה ארוכה 98765' });
    expect(ok.statusCode, ok.body).toBe(200);
    const old = await attemptReset(h, { email: account.email, answers: [entry('pet', 'Rex'), entry('street', 'Herzl')], password: 'סיסמה ארוכה 98765' });
    expect(old.statusCode).toBe(401);
  });

  it('[F1.6 c4] PUT with a wrong current answer -> 401 invalid_recovery, nothing changes, the failure is counted for that account and audited', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    await saveAnswers(h, auth);
    const before = await answersJson(ctx, account.id);
    const ip = nextIp();
    const res = await changeAnswers(h, auth, [entry('pet', 'Wrong'), entry('street', 'Herzl')], [entry('nickname', 'Dudi'), entry('street', 'Allenby')], ip);
    expect(res.statusCode, res.body).toBe(401);
    expect(jsonOf(res.body)).toEqual({ error: 'invalid_recovery' });
    expect(await answersJson(ctx, account.id)).toBe(before);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe('answers_saved,change_failed');
    const counted = await throttle(ctx, 'handle', handleHex(ctx, account.email));
    expect(counted.split('/')[0], 'one failure counted for the account').toBe('1');
    expect((await throttle(ctx, 'ip', ipHex(ctx, ip))).split('/')[0], 'and for the address').toBe('1');
  });

  it('[F1.6 c4 c10] every way of getting the current pair wrong is the same 401 with the same work: first wrong, second wrong, both wrong, wrong pair, right answers under the wrong questions', T, async () => {
    const h = await startApp(ctx);
    const next = [entry('nickname', 'Dudi'), entry('street', 'Allenby')];
    const attempts: Array<[string, unknown]> = [
      ['first wrong', [entry('pet', 'Wrong'), entry('street', 'Herzl')]],
      ['second wrong', [entry('pet', 'Rex'), entry('street', 'Wrong')]],
      ['both wrong', [entry('pet', 'Wrong'), entry('street', 'Nope')]],
      ['a pair of questions that was not chosen', [entry('nickname', 'Rex'), entry('street', 'Herzl')]],
      ['the right answers under swapped questions', [entry('pet', 'Herzl'), entry('street', 'Rex')]],
    ];
    const bodies = new Set<string>();
    const work = new Set<number>();
    for (const [label, current] of attempts) {
      const account = await newAccount(ctx);
      const auth = await bearerFor(ctx, account);
      await saveAnswers(h, auth);
      h.spy.reset();
      const res = await changeAnswers(h, auth, current, next);
      expect(res.statusCode, `${label}: ${res.body}`).toBe(401);
      bodies.add(res.body);
      work.add(h.spy.calls());
    }
    expect([...bodies]).toEqual(['{"error":"invalid_recovery"}']);
    expect(work.size, `the number of scrypt computations is the same whichever way the answers are wrong: ${[...work]}`).toBe(1);
    expect([...work][0]).toBeGreaterThanOrEqual(2);
  });

  it('[F1.6 c4] PUT before any answers were saved -> 409 not_set', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const res = await changeAnswers(h, await bearerFor(ctx, account), [entry('pet', 'Rex'), entry('street', 'Herzl')], [entry('nickname', 'Dudi'), entry('street', 'Allenby')]);
    expect(res.statusCode, res.body).toBe(409);
    expect(jsonOf(res.body)).toEqual({ error: 'not_set' });
    expect(await answersJson(ctx, account.id)).toBe(NONE);
  });

  it('[F1.6 c4 c12] failed changes are counted against the same limits: after five, even the right current answers get 429 with retry-after, from any address, and the reset is limited too', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    await saveAnswers(h, auth);
    const next = [entry('nickname', 'Dudi'), entry('street', 'Allenby')];
    for (let i = 1; i <= 5; i += 1) {
      const res = await changeAnswers(h, auth, [entry('pet', 'Wrong'), entry('street', 'Herzl')], next);
      expect(res.statusCode, `failure ${i}: ${res.body}`).toBe(401);
    }
    h.spy.reset();
    const limited = await changeAnswers(h, auth, [entry('pet', 'Rex'), entry('street', 'Herzl')], next);
    expect(limited.statusCode, limited.body).toBe(429);
    expect(jsonOf(limited.body)).toEqual({ error: 'rate_limited' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(1800);
    expect(h.spy.calls(), 'a limited attempt does no hashing').toBe(0);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe('answers_saved,change_failed,change_failed,change_failed,change_failed,change_failed,change_limited');

    const reset = await attemptReset(h, resetFor(account.email));
    expect(reset.statusCode, reset.body).toBe(429);
    expect(h.admin.calls).toEqual([]);

    // after the window the right current answers work again
    await shift(ctx, 'handle', handleHex(ctx, account.email), '31 minutes');
    const later = await changeAnswers(h, auth, [entry('pet', 'Rex'), entry('street', 'Herzl')], next);
    expect(later.statusCode, later.body).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c5] a request touches only the caller\'s own rows', () => {
  it('[F1.6 c5] account B saving, changing and failing leaves account A\'s answers, audit and counters untouched', T, async () => {
    const h = await startApp(ctx);
    const a = await accountWithAnswers(ctx, h);
    const b = await accountWithAnswers(ctx, h, [entry('nickname', 'Dudi'), entry('street', 'Allenby')]);
    const rowA = await answersJson(ctx, a.id);
    const kindsA = await kinds(ctx, handleHex(ctx, a.email));
    const authB = await bearerFor(ctx, b);

    await changeAnswers(h, authB, [entry('nickname', 'Wrong'), entry('street', 'Allenby')], [entry('pet', 'X1'), entry('street', 'X2')]);
    await changeAnswers(h, authB, [entry('nickname', 'Dudi'), entry('street', 'Allenby')], [entry('pet', 'Newpet'), entry('street', 'Newstreet')]);
    await saveAnswers(h, authB);

    expect(await answersJson(ctx, a.id)).toBe(rowA);
    expect(await kinds(ctx, handleHex(ctx, a.email))).toBe(kindsA);
    expect(await throttle(ctx, 'handle', handleHex(ctx, a.email))).toBe(NONE);
  });

  it('[F1.6 c5] B cannot change A\'s answers with A\'s email in the token or A\'s answers in the body: B\'s own row is the only one in play', T, async () => {
    const h = await startApp(ctx);
    const a = await accountWithAnswers(ctx, h);
    const b = await accountWithAnswers(ctx, h, [entry('nickname', 'Dudi'), entry('street', 'Allenby')]);
    const rowA = await answersJson(ctx, a.id);
    const res = await changeAnswers(h, await bearerFor(ctx, b, a.email), [entry('pet', 'Rex'), entry('street', 'Herzl')], [entry('pet', 'Hijack'), entry('street', 'Hijack2')]);
    expect(res.statusCode, res.body).toBe(401);
    expect(await answersJson(ctx, a.id)).toBe(rowA);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c3 NFR-PRIV-001] the logs of the store and change paths hold none of it', () => {
  it('[F1.6 c3] after a save, a refused save, a change and a failed change the log has no email, answer, token or hash', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx, `log.check.${Date.now()}@example.invalid`);
    const auth = await bearerFor(ctx, account);
    const ip = nextIp();
    await saveAnswers(h, auth, [entry('pet', 'LogMarkerOne'), entry('street', 'LogMarkerTwo')], ip);
    await saveAnswers(h, auth, [entry('pet', 'LogMarkerOne'), entry('street', 'LogMarkerTwo')], ip);
    await changeAnswers(h, auth, [entry('pet', 'LogWrongOne'), entry('street', 'LogWrongTwo')], [entry('pet', 'LogMarkerThree'), entry('street', 'LogMarkerFour')], ip);
    await changeAnswers(h, auth, [entry('pet', 'LogMarkerOne'), entry('street', 'LogMarkerTwo')], [entry('pet', 'LogMarkerThree'), entry('street', 'LogMarkerFour')], ip);
    const text = h.log.text().toLowerCase();
    const handle = handleHex(ctx, account.email);
    for (const secret of [account.email, 'log.check', 'logmarker', 'logwrong', ip, handle, ipHex(ctx, ip), auth.replace('Bearer ', '')]) {
      expect(text, `log contains ${secret.slice(0, 14)}`).not.toContain(secret.toLowerCase());
    }
  });
});
