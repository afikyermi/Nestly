import { randomUUID } from 'node:crypto';
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
  ladder,
  throttle,
  unbreakEvents,
  type Context,
} from '../helpers/recovery-db.js';
import { restorePepper } from '../helpers/recovery-app.js';
import { restoreEnv, toRecord } from '../helpers/identity-fixtures.js';

// F1.6 part a, the store and change paths against the real database (CI `db` job, as app_server). Spec criteria:
//   1 save   2 invalid body / one transaction   3 only scrypt hashes, peppered, nothing readable in clear   4 already set, change
//   5 own rows only   6 GET /api/me reports set / missing   8 one handle per account, a keyed hash   13 audit rows, no secrets
//   21 a newer claim on an email releases the older holder (an equal or older token gets 503)   23 /api/me re-keys a stale handle
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
/** The `iat` of a token, in whole seconds: what orders two claims on one email (criteria 21, 23). */
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c1 c6 FR-AUTH-003 AC-092] saving the two answers', () => {
  it('[F1.6 c1] an active account without answers: 201 {"ok":true}; the row exists; GET /api/me goes from "missing" to "set"', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);

    const before = await me(h, auth);
    expect(jsonOf(before.body)).toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: false });
    expect(await answersJson(ctx, account.id)).toBe(NONE);

    const res = await saveAnswers(h, auth);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.body).toBe(SAVED);
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');

    expect(await answersJson(ctx, account.id)).not.toBe(NONE);
    expect(jsonOf((await me(h, auth)).body)).toEqual({ state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
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
    expect(jsonOf((await me(h, await bearerFor(ctx, saver))).body)).toEqual({ state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
    expect(jsonOf((await me(h, await bearerFor(ctx, other))).body)).toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: false });
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
    expect(jsonOf((await me(h, auth)).body)).toEqual({ state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
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
    expect(jsonOf((await me(h, auth)).body)).toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: false });

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

  it('[F1.6 c8 c21] one handle per account: a second account under the same email with an EQUAL or OLDER token (same case or another) gets 503 unavailable and stores nothing', T, async () => {
    const h = await startApp(ctx);
    const email = `shared-${Date.now()}@example.invalid`;
    const first = await newAccount(ctx, email);
    const equal = await newAccount(ctx);
    const older = await newAccount(ctx);
    const t = nowSeconds();
    expect((await saveAnswers(h, await bearerFor(ctx, first, email, { iat: t }))).statusCode).toBe(201);
    const before = await answersJson(ctx, first.id);
    for (const [account, claim, iat] of [
      [equal, email, t],
      [older, ` ${email.toUpperCase()} `, t - 30],
    ] as const) {
      const res = await saveAnswers(h, await bearerFor(ctx, account, claim, { iat }));
      expect(res.statusCode, res.body).toBe(503);
      expect(jsonOf(res.body)).toEqual({ error: 'unavailable' });
      expect(await answersJson(ctx, account.id)).toBe(NONE);
      expect(await kinds(ctx, handleHex(ctx, email))).toBe('answers_saved');
    }
    expect(await answersJson(ctx, first.id), 'the holder is untouched').toBe(before);
    const reset = await attemptReset(h, resetFor(email));
    expect(reset.statusCode, reset.body).toBe(200);
    expect(toRecord(h.admin.calls[0]).userId, 'a redeem still reaches the holder').toBe(first.id);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c21 c13] a newer claim on an email releases the older holder', () => {
  const eventsOf = async (handle: string) => recordsOf(await eventsJson(ctx, handle));

  it('[F1.6 c21] the caller\'s token is NEWER than the holder\'s claim: 201; the holder keeps its row but loses the handle; a redeem reaches the caller; handle_released is audited for the holder', T, async () => {
    const h = await startApp(ctx);
    const email = `moved-${Date.now()}@example.invalid`;
    const holder = await newAccount(ctx, email);
    const caller = await newAccount(ctx);
    const handle = handleHex(ctx, email);
    const t = nowSeconds();
    expect((await saveAnswers(h, await bearerFor(ctx, holder, email, { iat: t - 120 }))).statusCode).toBe(201);

    const res = await saveAnswers(h, await bearerFor(ctx, caller, ` ${email.toUpperCase()} `, { iat: t }));
    expect(res.statusCode, res.body).toBe(201);
    expect(res.body).toBe(SAVED);

    const held = record(await answersJson(ctx, holder.id));
    expect(held.email_handle).toBeNull();
    expect(held.handle_claimed_at).toBeNull();
    expect(hexOf(record(await answersJson(ctx, caller.id)).email_handle)).toBe(handle);
    const events = await eventsOf(handle);
    expect(events.map((e) => e.kind).sort()).toEqual(['answers_saved', 'answers_saved', 'handle_released']);
    expect(events.find((e) => e.kind === 'handle_released')?.user_id).toBe(holder.id);
    expect(events.filter((e) => e.kind === 'answers_saved').map((e) => e.user_id)).toContain(caller.id);
    expect(JSON.stringify(events).toLowerCase()).not.toContain(email.toLowerCase());

    const reset = await attemptReset(h, resetFor(email));
    expect(reset.statusCode, reset.body).toBe(200);
    expect(toRecord(h.admin.calls[0]).userId, 'the email now reaches the caller\'s account').toBe(caller.id);
  });

  it('[F1.6 c21] a newer token that is refused releases nothing: invalid body 400, a suspended caller 403, no token 401', T, async () => {
    const h = await startApp(ctx);
    const email = `kept-${Date.now()}@example.invalid`;
    const holder = await newAccount(ctx, email);
    const t = nowSeconds();
    await saveAnswers(h, await bearerFor(ctx, holder, email, { iat: t - 120 }));
    const before = await answersJson(ctx, holder.id);
    const stopped = await newAccount(ctx);
    await setStatus(ctx, stopped.id, 'suspended');
    const invalid = await saveAnswers(h, await bearerFor(ctx, await newAccount(ctx), email, { iat: t }), [entry('pet', 'Rex')]);
    const forbidden = await saveAnswers(h, await bearerFor(ctx, stopped, email, { iat: t }));
    expect([invalid.statusCode, forbidden.statusCode]).toEqual([400, 403]);
    expect(await answersJson(ctx, holder.id)).toBe(before);
    expect(await kinds(ctx, handleHex(ctx, email))).toBe('answers_saved');
  });

  it('[F1.6 c21 concurrency] two newer claimants racing for one email: never a 500, exactly one account holds the handle (one of the claimants), a redeem reaches it; a 503 may retry', { timeout: 120_000 }, async () => {
    const [a, b] = [await startApp(ctx), await startApp(ctx)];
    const email = `race-${Date.now()}@example.invalid`;
    const [holder, middle, newest] = [await newAccount(ctx, email), await newAccount(ctx), await newAccount(ctx)];
    const t = nowSeconds();
    await saveAnswers(a, await bearerFor(ctx, holder, email, { iat: t - 300 }));
    const [r1, r2] = await Promise.all([
      saveAnswers(a, await bearerFor(ctx, middle, email, { iat: t - 100 })),
      saveAnswers(b, await bearerFor(ctx, newest, email, { iat: t })),
    ]);
    for (const res of [r1, r2]) expect([201, 503], res.body).toContain(res.statusCode);
    // c21: a retry is either accepted (201) or, when the holder's claim is now newer than the retrier's token, refused 503 unavailable; never 500
    const retries = [];
    if (r1.statusCode === 503) retries.push(await saveAnswers(a, await bearerFor(ctx, middle, email, { iat: t - 100 })));
    if (r2.statusCode === 503) retries.push(await saveAnswers(b, await bearerFor(ctx, newest, email, { iat: t })));
    for (const retry of retries) {
      expect([201, 503], retry.body).toContain(retry.statusCode);
      if (retry.statusCode === 503) expect(retry.body).toContain('unavailable');
    }
    const holders = [];
    // A claimant refused twice (503, then 503 on the retry) has no answers row: the fixture returns NONE, not JSON. It
    // holds nothing (main 18.10.2026: JSON.parse('-') failed the race whenever both attempts of one claimant lost).
    for (const account of [holder, middle, newest]) {
      const row = await answersJson(ctx, account.id);
      if (row !== NONE && record(row).email_handle !== null) holders.push(account.id);
    }
    expect(holders, 'exactly one account holds the handle').toHaveLength(1);
    const [winner] = holders;
    expect([holder.id, middle.id, newest.id]).toContain(winner);
    expect((await attemptReset(a, resetFor(email))).statusCode).toBe(200);
    expect(toRecord(a.admin.calls[0]).userId, 'the email reaches the holder').toBe(winner);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c23] /api/me re-keys a stale handle when the token\'s email is different and newer; the body never tells', () => {
  const BODY = { state: 'active', recoveryQuestions: 'set', mustSetPassword: false };
  const stale = async (h: Awaited<ReturnType<typeof startApp>>) => {
    const old = `old-${randomUUID()}@example.invalid`;
    const account = await newAccount(ctx, old);
    const t = nowSeconds();
    expect((await saveAnswers(h, await bearerFor(ctx, account, old, { iat: t - 300 }))).statusCode).toBe(201);
    return { account, old, fresh: `new-${randomUUID()}@example.invalid`, t, before: await answersJson(ctx, account.id) };
  };

  it('[F1.6 c23] a newer token with a new email: the body is the usual one, the handle follows the new email, handle_rekeyed is audited, a redeem by the new email succeeds (the old one no longer finds the account)', T, async () => {
    const h = await startApp(ctx);
    const s = await stale(h);
    const res = await me(h, await bearerFor(ctx, s.account, s.fresh, { iat: s.t }));
    expect(res.statusCode).toBe(200);
    expect(jsonOf(res.body)).toEqual(BODY);
    expect(hexOf(record(await answersJson(ctx, s.account.id)).email_handle)).toBe(handleHex(ctx, s.fresh));
    const events = recordsOf(await eventsJson(ctx, handleHex(ctx, s.fresh)));
    expect(events.map((e) => e.kind)).toEqual(['handle_rekeyed']);
    expect(events[0]?.user_id).toBe(s.account.id);
    expect(JSON.stringify(events).toLowerCase()).not.toContain('new-');
    const ok = await attemptReset(h, resetFor(s.fresh));
    expect(ok.statusCode, ok.body).toBe(200);
    expect(toRecord(h.admin.calls[0]).userId).toBe(s.account.id);
    expect((await attemptReset(h, resetFor(s.old))).statusCode, 'one handle per account: the old email finds nothing').toBe(401);
  });

  it('[F1.6 c23] skipped: the same email in another case, an EQUAL or OLDER token, no email claim, a stopped account, or no answers at all change nothing and the body is the same', T, async () => {
    const h = await startApp(ctx);
    const s = await stale(h);
    const handle = handleHex(ctx, s.old);
    const stopped = await newAccount(ctx);
    await saveAnswers(h, await bearerFor(ctx, stopped));
    await setStatus(ctx, stopped.id, 'suspended');
    const bare = await newAccount(ctx);
    const calls: Array<[string, Promise<string>]> = [
      ['same email, other case', bearerFor(ctx, s.account, ` ${s.old.toUpperCase()} `, { iat: s.t })],
      ['equal iat', bearerFor(ctx, s.account, s.fresh, { iat: s.t - 300 })],
      ['older iat', bearerFor(ctx, s.account, s.fresh, { iat: s.t - 600 })],
      ['no email claim', bearerFor(ctx, s.account, null, { iat: s.t })],
    ];
    for (const [label, auth] of calls) {
      const res = await me(h, await auth);
      expect(jsonOf(res.body), label).toEqual(BODY);
      expect(await answersJson(ctx, s.account.id), label).toBe(s.before);
    }
    expect(await kinds(ctx, handle)).toBe('answers_saved');
    expect(await kinds(ctx, handleHex(ctx, s.fresh))).toBe(NONE);
    expect((await me(h, await bearerFor(ctx, stopped, s.fresh, { iat: s.t }))).body).toBe('{"state":"unavailable"}');
    expect(hexOf(record(await answersJson(ctx, stopped.id)).email_handle)).toBe(handleHex(ctx, stopped.email));
    expect(jsonOf((await me(h, await bearerFor(ctx, bare, s.fresh, { iat: s.t }))).body)).toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: false });
    expect(await answersJson(ctx, bare.id)).toBe(NONE);
  });

  it('[F1.6 c23 c21] failed: the new email is held by another account under a NEWER claim, or the audit write fails: the body is the same 200, nothing changes', T, async () => {
    const h = await startApp(ctx);
    const s = await stale(h);
    const holder = await newAccount(ctx, s.fresh);
    expect((await saveAnswers(h, await bearerFor(ctx, holder, s.fresh, { iat: s.t + 5 }))).statusCode).toBe(201);
    const held = await answersJson(ctx, holder.id);
    const clash = await me(h, await bearerFor(ctx, s.account, s.fresh, { iat: s.t }));
    expect(clash.statusCode).toBe(200);
    expect(jsonOf(clash.body)).toEqual(BODY);
    expect(await answersJson(ctx, s.account.id)).toBe(s.before);
    expect(await answersJson(ctx, holder.id)).toBe(held);

    const other = await stale(h);
    await breakEvents(ctx, handleHex(ctx, other.fresh), 'handle_rekeyed');
    const broken = await me(h, await bearerFor(ctx, other.account, other.fresh, { iat: other.t }));
    expect(broken.statusCode).toBe(200);
    expect(jsonOf(broken.body)).toEqual(BODY);
    expect(await answersJson(ctx, other.account.id), 'the re-key and its audit row stand or fall together').toBe(other.before);
    expect(await kinds(ctx, handleHex(ctx, other.fresh))).toBe(NONE);
  });

  it('[F1.6 c23 concurrency] five simultaneous calls with the same newer token all answer the same 200 body and end with the new email as the handle', { timeout: 120_000 }, async () => {
    const apps = await Promise.all(Array.from({ length: 5 }, () => startApp(ctx)));
    const s = await stale(apps[0] ?? (await startApp(ctx)));
    const auth = await bearerFor(ctx, s.account, s.fresh, { iat: s.t });
    const results = await Promise.all(apps.map((h) => me(h, auth)));
    for (const res of results) {
      expect(res.statusCode, res.body).toBe(200);
      expect(jsonOf(res.body)).toEqual(BODY);
    }
    expect(hexOf(record(await answersJson(ctx, s.account.id)).email_handle)).toBe(handleHex(ctx, s.fresh));
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
    expect(after.email_handle, 'a change with the same token email leaves the lookup handle as it was').toBe(before.email_handle);
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
    const counted = await ladder(ctx, handleHex(ctx, account.email));
    expect(counted.split('/')[0], 'one failure counted on the account\'s ladder').toBe('1');
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
    expect(work.size, `the number of scrypt computations is the same whichever way the answers are wrong: ${[...work].join(', ')}`).toBe(1);
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

  it('[F1.6 c4 c12 AC-113] failed changes are counted on the same ladder: after three, even the right current answers get 429 with retry-after, from any address, and the reset is limited too', T, async () => {
    const h = await startApp(ctx);
    const account = await newAccount(ctx);
    const auth = await bearerFor(ctx, account);
    await saveAnswers(h, auth);
    const next = [entry('nickname', 'Dudi'), entry('street', 'Allenby')];
    for (let i = 1; i <= 3; i += 1) {
      const res = await changeAnswers(h, auth, [entry('pet', 'Wrong'), entry('street', 'Herzl')], next);
      expect(res.statusCode, `failure ${i}: ${res.body}`).toBe(401);
    }
    h.spy.reset();
    const limited = await changeAnswers(h, auth, [entry('pet', 'Rex'), entry('street', 'Herzl')], next);
    expect(limited.statusCode, limited.body).toBe(429);
    expect(jsonOf(limited.body)).toEqual({ error: 'rate_limited' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(3600);
    expect(h.spy.calls(), 'a limited attempt does no hashing').toBe(0);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe('answers_saved,change_failed,change_failed,change_failed,change_limited');

    const reset = await attemptReset(h, resetFor(account.email));
    expect(reset.statusCode, reset.body).toBe(429);
    expect(h.admin.calls).toEqual([]);

    // after the hour the right current answers work again
    await shift(ctx, 'handle', handleHex(ctx, account.email), '61 minutes');
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
    // B's token is issued in the second of A's claim, never later: a token newer than A's claim on A's email is criterion
    // 21's moved email and rightly releases A's handle. Left to the clock, that happened whenever a second ticked between
    // A's save and this token (main, 17.10.2026 18:46 UTC).
    const parsedA: unknown = JSON.parse(rowA);
    const claimedA = typeof parsedA === 'object' && parsedA !== null && 'handle_claimed_at' in parsedA && typeof parsedA.handle_claimed_at === 'string'
      ? parsedA.handle_claimed_at
      : undefined;
    expect(claimedA, 'A\'s row has a claim time').toBeDefined();
    const iat = Math.floor(Date.parse(claimedA ?? '') / 1000);
    const res = await changeAnswers(h, await bearerFor(ctx, b, a.email, { iat }), [entry('pet', 'Rex'), entry('street', 'Herzl')], [entry('pet', 'Hijack'), entry('street', 'Hijack2')]);
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
