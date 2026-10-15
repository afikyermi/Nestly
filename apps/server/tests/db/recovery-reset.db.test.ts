import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clientAddress } from '../../src/recovery/client-ip.js';
import { restoreEnv, toRecord } from '../helpers/identity-fixtures.js';
import { fakeAdmin, postJson, restorePepper } from '../helpers/recovery-app.js';
import {
  NEW_PASSWORD,
  RIGHT,
  T,
  accountWithAnswers,
  answersJson,
  attemptReset,
  breakEvents,
  closeApps,
  entry,
  eventsJson,
  handleHex,
  hexOf,
  ipHex,
  kinds,
  newAccount,
  nextIp,
  recordsOf,
  resetFor,
  setStatus,
  shift,
  startApp,
  startContext,
  stopContext,
  throttle,
  unbreakEvents,
  type Context,
} from '../helpers/recovery-db.js';

// F1.6 part b, the redeem path against the real database (CI `db` job, as app_server). Spec criteria (with Amendment 1):
//   (Amendment 2: 13 at most one limited row per lock, none created for an address-locked email; 22 email mismatch)
//   9 success   10 every failure is the same 401, two scrypt computations, counted   11 unknown email == known email
//   12 limits (handle, IP, 24 h; stored IP is a keyed hash; window expiry)   13 one audit row per attempt, outcomes
//   14 400 uncounted   15 admin failure   20 sign-out failure, retry converges
// Derived from spec.md and interface.md only. The Auth admin module is faked at its seam (recovery.authAdmin); the database
// clock decides every window, so a test moves state with the fixture shift, not with an app clock. The audit, the counters and
// the hashes are read through supabase/tests/setup/30_recovery_fixtures.sql. Each test uses its own accounts and addresses.
//
// NOT covered here (needs the real Auth service, i.e. the Preview): that the new password signs in, that the old one gets
// invalid_credentials, that a refresh token issued before the reset is refused after it, and that a stopped account then sees
// the F1.5 stopped text.

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
const OK = '{"ok":true}';
const INVALID = '{"error":"invalid_recovery"}';
const LIMITED = '{"error":"rate_limited"}';
const UNAVAILABLE = '{"error":"unavailable"}';

/** The parts of a response that must not tell two failures apart. */
const shapeOf = (res: { statusCode: number; body: string; headers: Record<string, unknown> }): string =>
  JSON.stringify([res.statusCode, res.body, res.headers['content-type'], res.headers['cache-control'], res.headers['content-length']]);

const wrongFirst = [entry('pet', 'Wrong'), entry('street', 'Herzl')];
const unknownEmail = (): string => `nobody-${randomUUID()}@example.invalid`;

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c9 FR-AUTH-003 AC-092] a correct reset', () => {
  it('[F1.6 c9] correct email and answers: 200 {"ok":true}, no-store; Auth is asked once to set THIS account\'s password, with the new password and the client address', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const ip = nextIp();
    const res = await attemptReset(h, resetFor(account.email), ip);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe(OK);
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');
    expect(h.admin.calls).toHaveLength(1);
    const call = toRecord(h.admin.calls[0]);
    expect(call.userId, 'the user id comes from the answers row, never from the request').toBe(account.id);
    expect(call.password).toBe(NEW_PASSWORD);
    expect(String(call.email).trim().toLowerCase()).toBe(account.email.toLowerCase());
    expect(call.clientIp).toBe(clientAddress(ip).forAuth);
    expect(h.spy.calls(), 'a verified attempt does exactly two scrypt computations').toBe(2);
  });

  it('[F1.6 c9 c13] a success leaves the audit reset_verified then reset_completed, changes no counter, and the answers still work', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    const rowBefore = await answersJson(ctx, account.id);
    const ip = nextIp();
    await attemptReset(h, resetFor(account.email), ip);
    expect(await kinds(ctx, handle)).toBe('answers_saved,reset_verified,reset_completed');
    expect((await throttle(ctx, 'handle', handle)).split('/').slice(0, 2)).toEqual(['0', '0']);
    expect((await throttle(ctx, 'ip', ipHex(ctx, ip))).split('/').slice(0, 2)).toEqual(['0', '0']);
    expect(await answersJson(ctx, account.id), 'a reset does not touch the stored answers').toBe(rowBefore);
    const again = await attemptReset(h, resetFor(account.email, RIGHT, 'סיסמה שנייה ארוכה 1'));
    expect(again.statusCode, again.body).toBe(200);
  });

  it('[F1.6 c9] the email is found however it is written: capitals and surrounding space', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const res = await attemptReset(h, resetFor(`  ${account.email.toUpperCase()} `));
    expect(res.statusCode, res.body).toBe(200);
  });

  it('[F1.6 c9 c7] the answers are matched after normalising: spacing, case, niqqud, final letters; entries in either order', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h, [entry('pet', 'Rex Junior'), entry('street', 'בן יהודה')]);
    const res = await attemptReset(h, resetFor(account.email, [entry('street', ' בֶּן-יהודה '), entry('pet', 'REXJUNIOR')]));
    expect(res.statusCode, res.body).toBe(200);
  });

  it('[F1.6 c9] a stopped (suspended or banned) account can reset its password: it then meets the stopped text at sign-in (F1.5)', T, async () => {
    const h = await startApp(ctx);
    for (const status of ['suspended', 'banned'] as const) {
      const account = await accountWithAnswers(ctx, h);
      await setStatus(ctx, account.id, status);
      const res = await attemptReset(h, resetFor(account.email));
      expect(res.statusCode, `${status}: ${res.body}`).toBe(200);
      expect(h.admin.calls.length, status).toBeGreaterThan(0);
      h.admin.calls.length = 0;
    }
  });

  it('[F1.6 c9] the response carries no session: no token, cookie or user data', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const res = await attemptReset(h, resetFor(account.email));
    expect(res.body).toBe(OK);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(res.headers).toLowerCase()).not.toMatch(/bearer|access_token|refresh/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c10 c11] every failure is the same 401, with the same work, counted', () => {
  async function failureCases(): Promise<Array<[string, string, Record<string, unknown>]>> {
    const h = await startApp(ctx);
    const noAnswers = await newAccount(ctx);
    const first = await accountWithAnswers(ctx, h);
    const second = await accountWithAnswers(ctx, h);
    const both = await accountWithAnswers(ctx, h);
    const pair = await accountWithAnswers(ctx, h);
    const swapped = await accountWithAnswers(ctx, h);
    return [
      ['an unknown email', unknownEmail(), resetFor('')],
      ['an email with no answers saved', noAnswers.email, resetFor('')],
      ['the first answer wrong', first.email, resetFor('', [entry('pet', 'Wrong'), entry('street', 'Herzl')])],
      ['the second answer wrong', second.email, resetFor('', [entry('pet', 'Rex'), entry('street', 'Wrong')])],
      ['both answers wrong', both.email, resetFor('', [entry('pet', 'Wrong'), entry('street', 'Nope')])],
      ['a pair of questions that was not chosen', pair.email, resetFor('', [entry('nickname', 'Rex'), entry('street', 'Herzl')])],
      ['the right answers under swapped questions', swapped.email, resetFor('', [entry('pet', 'Herzl'), entry('street', 'Rex')])],
    ];
  }

  it('[F1.6 c10 c11] all seven branches answer 401 {"error":"invalid_recovery"} with byte-identical status, body and headers, and each runs exactly two scrypt computations', T, async () => {
    const h = await startApp(ctx);
    const cases = await failureCases();
    const shapes = new Set<string>();
    for (const [label, email, body] of cases) {
      h.spy.reset();
      h.admin.calls.length = 0;
      const res = await attemptReset(h, { ...body, email });
      expect(res.statusCode, `${label}: ${res.body}`).toBe(401);
      expect(res.body, label).toBe(INVALID);
      expect(h.spy.calls(), `${label}: exactly two scrypt computations`).toBe(2);
      expect(h.admin.calls, `${label}: Auth is never asked`).toEqual([]);
      shapes.add(shapeOf(res));
    }
    expect(shapes.size, `the responses must not tell the branches apart: ${[...shapes].join(' | ')}`).toBe(1);
  });

  it('[F1.6 c10 c13] each failure increments the handle counter and the IP counter by one, and writes one reset_failed row', T, async () => {
    const h = await startApp(ctx);
    const cases = await failureCases();
    for (const [label, email, body] of cases) {
      const ip = nextIp();
      const handle = handleHex(ctx, email);
      const res = await attemptReset(h, { ...body, email }, ip);
      expect(res.statusCode, label).toBe(401);
      expect((await throttle(ctx, 'handle', handle)).split('/')[0], `${label}: handle counter`).toBe('1');
      expect((await throttle(ctx, 'ip', ipHex(ctx, ip))).split('/')[0], `${label}: IP counter`).toBe('1');
      const last = (await kinds(ctx, handle)).split(',').pop();
      expect(last, `${label}: audit`).toBe('reset_failed');
    }
  });

  it('[F1.6 c11] an unknown email and a known one are indistinguishable: same response, same work, and BOTH get a counter row (a lock on an unknown handle looks like a lock on a known one)', T, async () => {
    const h = await startApp(ctx);
    const known = await accountWithAnswers(ctx, h);
    const unknown = unknownEmail();
    const seen: string[] = [];
    for (const email of [known.email, unknown]) {
      for (let i = 1; i <= 5; i += 1) {
        const res = await attemptReset(h, resetFor(email, wrongFirst));
        expect(res.statusCode, `${email} #${i}`).toBe(401);
        seen.push(shapeOf(res));
      }
    }
    expect(new Set(seen).size).toBe(1);
    const locked: string[] = [];
    const retry: number[] = [];
    for (const email of [known.email, unknown]) {
      h.spy.reset();
      const res = await attemptReset(h, resetFor(email, RIGHT));
      expect(res.statusCode, `${email}: ${res.body}`).toBe(429);
      expect(res.body).toBe(LIMITED);
      expect(h.spy.calls(), 'a limited attempt does no hashing, known or not').toBe(0);
      locked.push(shapeOf(res));
      retry.push(Number(res.headers['retry-after']));
    }
    expect(locked[0]).toBe(locked[1]);
    for (const seconds of retry) {
      expect(seconds).toBeGreaterThan(1700);
      expect(seconds).toBeLessThanOrEqual(1800);
    }
    expect(Math.abs((retry[0] ?? 0) - (retry[1] ?? 0))).toBeLessThanOrEqual(5);
    expect(await throttle(ctx, 'handle', handleHex(ctx, unknown))).toMatch(/^5\/5\/true\//);
    expect(await throttle(ctx, 'handle', handleHex(ctx, unknown))).toBe(await throttle(ctx, 'handle', handleHex(ctx, known.email)));
  });

  it('[F1.6 c10] a wrong attempt never reaches Auth and never changes the stored answers', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const before = await answersJson(ctx, account.id);
    for (let i = 0; i < 3; i += 1) await attemptReset(h, resetFor(account.email, wrongFirst));
    expect(h.admin.calls).toEqual([]);
    expect(await answersJson(ctx, account.id)).toBe(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c14] a malformed request is 400, before any lookup, and uncounted', () => {
  it('[F1.6 c14] 400 for a short password, a bad email, three answers: no counter row for the handle or the address, no audit row, no hashing', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const ip = nextIp();
    const handle = handleHex(ctx, account.email);
    const before = await kinds(ctx, handle);
    for (const body of [
      resetFor(account.email, RIGHT, 'short'),
      resetFor(account.email, RIGHT, 'a'.repeat(257)),
      resetFor(account.email, RIGHT, ''),
      resetFor('not an email'),
      resetFor(account.email, [...RIGHT, entry('nickname', 'Dudi')]),
      resetFor(account.email, [RIGHT[0]]),
    ]) {
      const res = await attemptReset(h, body, ip);
      expect(res.statusCode, res.body).toBe(400);
    }
    expect(h.spy.calls()).toBe(0);
    expect(await kinds(ctx, handle)).toBe(before);
    expect(await throttle(ctx, 'ip', ipHex(ctx, ip))).toBe(NONE);
    expect(await throttle(ctx, 'handle', handle)).toBe(NONE);
  });

  it('[F1.6 c14] a flood of malformed requests from one address does not lock that address out of a valid reset', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const ip = nextIp();
    for (let i = 0; i < 15; i += 1) await attemptReset(h, resetFor(account.email, RIGHT, 'short'), ip);
    const res = await attemptReset(h, resetFor(account.email), ip);
    expect(res.statusCode, res.body).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c12] limits: per account, per address, per day; the window ends; the stored address is a keyed hash', () => {
  it('[F1.6 c12] the 6th attempt on one handle within 30 minutes is 429 with retry-after, even with the right answers and from another address', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    for (let i = 1; i <= 5; i += 1) {
      const res = await attemptReset(h, resetFor(account.email, wrongFirst));
      expect(res.statusCode, `failure ${i}: ${res.body}`).toBe(401);
    }
    const countersBefore = await throttle(ctx, 'handle', handle);
    h.spy.reset();
    const limited = await attemptReset(h, resetFor(account.email, RIGHT), nextIp());
    expect(limited.statusCode, limited.body).toBe(429);
    expect(limited.body).toBe(LIMITED);
    expect(String(limited.headers['cache-control']).toLowerCase()).toContain('no-store');
    const retry = Number(limited.headers['retry-after']);
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(1800);
    expect(h.spy.calls(), 'a limited attempt does no hashing').toBe(0);
    expect(h.admin.calls, 'and never reaches Auth').toEqual([]);
    expect(await throttle(ctx, 'handle', handle), 'a limited attempt is not a failure: no counter moves').toBe(countersBefore);
    expect((await kinds(ctx, handle)).split(',').pop()).toBe('reset_limited');
  });

  it('[F1.6 c12] the 5th failure itself is still a 401 (the lock starts after it), and the lock does not depend on the address', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const fifth: string[] = [];
    for (let i = 1; i <= 5; i += 1) fifth.push((await attemptReset(h, resetFor(account.email, wrongFirst))).body);
    expect(fifth.every((body) => body === INVALID)).toBe(true);
    for (let i = 0; i < 3; i += 1) expect((await attemptReset(h, resetFor(account.email, RIGHT))).statusCode).toBe(429);
  });

  it('[F1.6 c12] after the window a correct attempt succeeds (the lock and the window are over)', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    for (let i = 0; i < 5; i += 1) await attemptReset(h, resetFor(account.email, wrongFirst));
    expect((await attemptReset(h, resetFor(account.email, RIGHT))).statusCode).toBe(429);
    await shift(ctx, 'handle', handle, '29 minutes');
    expect((await attemptReset(h, resetFor(account.email, RIGHT))).statusCode, 'still locked 29 minutes in').toBe(429);
    await shift(ctx, 'handle', handle, '2 minutes');
    const later = await attemptReset(h, resetFor(account.email, RIGHT));
    expect(later.statusCode, later.body).toBe(200);
    expect(h.admin.calls).toHaveLength(1);
  });

  it('[F1.6 c12] failures spread over more than 30 minutes do not lock: the window does not slide', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    for (let i = 0; i < 4; i += 1) await attemptReset(h, resetFor(account.email, wrongFirst));
    await shift(ctx, 'handle', handle, '31 minutes');
    for (let i = 0; i < 4; i += 1) {
      const res = await attemptReset(h, resetFor(account.email, wrongFirst));
      expect(res.statusCode, res.body).toBe(401);
    }
    const right = await attemptReset(h, resetFor(account.email, RIGHT));
    expect(right.statusCode, right.body).toBe(200);
  });

  it('[F1.6 c12] 15 failures in 24 hours lock for 24 hours, even though no 30 minute window reached 5', { timeout: 120_000 }, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    let failures = 0;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const inCycle = cycle < 3 ? 4 : 3;
      for (let i = 0; i < inCycle; i += 1) {
        const res = await attemptReset(h, resetFor(account.email, wrongFirst));
        failures += 1;
        expect(res.statusCode, `failure ${failures}: ${res.body}`).toBe(401);
      }
      if (cycle < 3) await shift(ctx, 'handle', handle, '31 minutes');
    }
    expect(failures).toBe(15);
    h.spy.reset();
    const locked = await attemptReset(h, resetFor(account.email, RIGHT));
    expect(locked.statusCode, locked.body).toBe(429);
    expect(locked.body).toBe(LIMITED);
    const retry = Number(locked.headers['retry-after']);
    expect(retry, 'the day lock is far longer than the 30 minute one').toBeGreaterThan(3600);
    expect(retry).toBeLessThanOrEqual(86_400);
    expect(h.spy.calls()).toBe(0);
    await shift(ctx, 'handle', handle, '25 hours');
    const free = await attemptReset(h, resetFor(account.email, RIGHT));
    expect(free.statusCode, free.body).toBe(200);
  });

  it('[F1.6 c12] the 11th failure from one address in 15 minutes is 429 for ANY handle, a known one with the right answers included; another address is unaffected; after the window it is free', { timeout: 120_000 }, async () => {
    const h = await startApp(ctx);
    const victim = await accountWithAnswers(ctx, h);
    const ip = nextIp();
    for (let i = 1; i <= 10; i += 1) {
      const res = await attemptReset(h, resetFor(unknownEmail(), wrongFirst), ip);
      expect(res.statusCode, `failure ${i}: ${res.body}`).toBe(401);
    }
    h.spy.reset();
    const limited = await attemptReset(h, resetFor(victim.email, RIGHT), ip);
    expect(limited.statusCode, limited.body).toBe(429);
    expect(limited.body).toBe(LIMITED);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(900);
    expect(h.spy.calls()).toBe(0);
    expect((await attemptReset(h, resetFor(unknownEmail(), wrongFirst), ip)).statusCode, 'an unknown handle from the locked address gets the same 429').toBe(429);
    expect(await throttle(ctx, 'handle', handleHex(ctx, victim.email)), 'while the address is locked no counter row is created for the submitted email').toBe(NONE);
    expect(await kinds(ctx, handleHex(ctx, victim.email)), 'the first limited attempt of the lock writes its one row').toBe('answers_saved,reset_limited');
    const second = unknownEmail();
    for (const email of [second, victim.email]) expect((await attemptReset(h, resetFor(email, RIGHT), ip)).statusCode).toBe(429);
    expect(await throttle(ctx, 'handle', handleHex(ctx, second))).toBe(NONE);
    expect(await kinds(ctx, handleHex(ctx, second)), 'later limited attempts in the same lock write no row in any table').toBe(NONE);
    expect(await kinds(ctx, handleHex(ctx, victim.email))).toBe('answers_saved,reset_limited');

    await shift(ctx, 'ip', ipHex(ctx, ip), '16 minutes');
    const later = await attemptReset(h, resetFor(victim.email, RIGHT), ip);
    expect(later.statusCode, later.body).toBe(200);
  });

  it('[F1.6 c12] another address is not limited by the first one\'s lock', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const ip = nextIp();
    for (let i = 0; i < 10; i += 1) await attemptReset(h, resetFor(unknownEmail(), wrongFirst), ip);
    expect((await attemptReset(h, resetFor(account.email, RIGHT), ip)).statusCode).toBe(429);
    expect((await attemptReset(h, resetFor(account.email, RIGHT), nextIp())).statusCode).toBe(200);
  });

  it('[F1.6 c12] the stored address is a keyed hash: the counter and the audit rows carry the hash, never the address', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const ip = nextIp();
    const handle = handleHex(ctx, account.email);
    await attemptReset(h, resetFor(account.email, wrongFirst), ip);
    expect(await throttle(ctx, 'ip', ipHex(ctx, ip))).not.toBe(NONE);
    expect(await throttle(ctx, 'ip', Buffer.from(ip).toString('hex').padEnd(64, '0').slice(0, 64)), 'no row is keyed by the plain address').toBe(NONE);
    const events = recordsOf(await eventsJson(ctx, handle));
    const last = events[events.length - 1] ?? {};
    expect(hexOf(last.ip_hash)).toBe(ipHex(ctx, ip));
    expect(JSON.stringify(events)).not.toContain(ip);
    expect(ipHex(ctx, ip)).not.toBe(ipHex(ctx, nextIp()));
  });

  it('[F1.6 c12] the address is the LAST X-Forwarded-For entry (the platform\'s); a leftmost entry chosen by the client changes nothing, so it cannot dodge the limit', { timeout: 120_000 }, async () => {
    const h = await startApp(ctx);
    const real = nextIp();
    const forged = Array.from({ length: 3 }, () => nextIp());
    for (let i = 0; i < 3; i += 1) {
      await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `${forged[i]}, ${real}`);
    }
    expect((await throttle(ctx, 'ip', ipHex(ctx, real))).split('/')[0], 'counted under the last entry').toBe('3');
    for (const spoof of forged) expect(await throttle(ctx, 'ip', ipHex(ctx, spoof)), `nothing counted under ${spoof}`).toBe(NONE);
    for (let i = 3; i < 10; i += 1) await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `${nextIp()}, ${real}`);
    const limited = await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `${nextIp()}, ${real}`);
    expect(limited.statusCode, 'rotating the leftmost entry does not evade the per-address limit').toBe(429);
  });

  it('[F1.6 c12] other headers a client controls (x-real-ip, forwarded, cf-connecting-ip, true-client-ip, x-client-ip) are not the address', T, async () => {
    const h = await startApp(ctx);
    const real = nextIp();
    const lies = nextIp();
    await postJson(h.app, '/api/recovery/reset', resetFor(unknownEmail(), wrongFirst), {
      'x-forwarded-for': real,
      'x-real-ip': lies,
      forwarded: `for=${lies}`,
      'cf-connecting-ip': lies,
      'true-client-ip': lies,
      'x-client-ip': lies,
    });
    expect((await throttle(ctx, 'ip', ipHex(ctx, real))).split('/')[0]).toBe('1');
    expect(await throttle(ctx, 'ip', ipHex(ctx, lies))).toBe(NONE);
  });

  it('[F1.6 c12] an IPv6 client counts by its /64: ten failures from different hosts of one /64 lock the whole /64, another /64 is free', { timeout: 120_000 }, async () => {
    const h = await startApp(ctx);
    const prefix = `2001:db8:${randomInt(1, 0xfff).toString(16)}:${randomInt(1, 0xfff).toString(16)}`;
    for (let i = 1; i <= 10; i += 1) {
      const res = await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `${prefix}::${i.toString(16)}`);
      expect(res.statusCode, `host ${i}`).toBe(401);
    }
    const sameNet = await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `${prefix}:ffff:ffff:ffff:ffff`);
    expect(sameNet.statusCode, 'a host never seen before in the same /64').toBe(429);
    const otherNet = await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `2001:db8:${randomInt(0x1000, 0xffff).toString(16)}::1`);
    expect(otherNet.statusCode).toBe(401);
  });

  it('[F1.6 c12] an address that is not an address counts under one shared key: garbage cannot mint fresh counters to evade the limit', { timeout: 120_000 }, async () => {
    const h = await startApp(ctx);
    for (let i = 0; i < 10; i += 1) await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `garbage-${randomUUID()}`);
    const res = await attemptReset(h, resetFor(unknownEmail(), wrongFirst), `more-garbage-${randomUUID()}`);
    expect(res.statusCode, 'the eleventh non-address attempt shares the same counter').toBe(429);
    expect(await throttle(ctx, 'ip', ipHex(ctx, 'unknown'))).not.toBe(NONE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c12 concurrency] the limits hold under parallel attempts and a double submit is harmless', () => {
  it('[F1.6 c12] six simultaneous wrong attempts on one handle (six instances): exactly five are 401, one is 429, the counter says five', { timeout: 120_000 }, async () => {
    const seed = await startApp(ctx);
    const account = await accountWithAnswers(ctx, seed);
    const apps = await Promise.all(Array.from({ length: 6 }, () => startApp(ctx)));
    const results = await Promise.all(apps.map((h) => attemptReset(h, resetFor(account.email, wrongFirst))));
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses, JSON.stringify(results.map((r) => r.body))).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await throttle(ctx, 'handle', handleHex(ctx, account.email))).split('/')[0]).toBe('5');
    const trail = (await kinds(ctx, handleHex(ctx, account.email))).split(',');
    expect(trail.filter((k) => k === 'reset_failed')).toHaveLength(5);
    expect(trail.filter((k) => k === 'reset_limited')).toHaveLength(1);
  });

  it('[F1.6 c12] simultaneous failures from one address never lose a count: ten at once leave the address at ten and the eleventh is limited', { timeout: 120_000 }, async () => {
    const apps = await Promise.all(Array.from({ length: 10 }, () => startApp(ctx)));
    const ip = nextIp();
    const results = await Promise.all(apps.map((h) => attemptReset(h, resetFor(unknownEmail(), wrongFirst), ip)));
    expect(results.map((r) => r.statusCode)).toEqual(Array(10).fill(401));
    expect((await throttle(ctx, 'ip', ipHex(ctx, ip))).split('/')[0]).toBe('10');
    expect((await attemptReset(apps[0] ?? (await startApp(ctx)), resetFor(unknownEmail(), wrongFirst), ip)).statusCode).toBe(429);
  });

  it('[F1.6 c9] a double submit of a correct reset: both answer 200 (or one of them waits), none is a server error, and the account is not locked', { timeout: 120_000 }, async () => {
    const first = await startApp(ctx);
    const second = await startApp(ctx);
    const account = await accountWithAnswers(ctx, first);
    const results = await Promise.all([attemptReset(first, resetFor(account.email)), attemptReset(second, resetFor(account.email))]);
    for (const res of results) expect(res.statusCode, res.body).toBe(200);
    expect((await throttle(ctx, 'handle', handleHex(ctx, account.email))).split('/')[0]).toBe('0');
    expect((await attemptReset(first, resetFor(account.email))).statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c13] the audit: one row per attempt, in the same transaction, no secrets', () => {
  it('[F1.6 c13] a failed attempt on a known account: reset_failed with the account\'s user id, the handle hash, the address hash, a time', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h, [entry('pet', 'AuditPetWord'), entry('street', 'AuditStreetWord')]);
    const ip = nextIp();
    await attemptReset(h, resetFor(account.email, [entry('pet', 'AuditWrongOne'), entry('street', 'AuditWrongTwo')], 'AuditPassword-123'), ip);
    const events = recordsOf(await eventsJson(ctx, handleHex(ctx, account.email)));
    const failed = events.filter((e) => e.kind === 'reset_failed');
    expect(failed).toHaveLength(1);
    const row = failed[0] ?? {};
    expect(Object.keys(row).sort()).toEqual(['handle_hash', 'id', 'ip_hash', 'kind', 'occurred_at', 'user_id']);
    expect(row.user_id).toBe(account.id);
    expect(hexOf(row.ip_hash)).toBe(ipHex(ctx, ip));
    expect(row.occurred_at).toBeTruthy();
    const raw = JSON.stringify(events).toLowerCase();
    for (const secret of ['auditpetword', 'auditstreetword', 'auditwrong', 'auditpassword', account.email.toLowerCase(), ip]) expect(raw).not.toContain(secret);
  });

  it('[F1.6 c13 c11] a failed attempt on an unknown email is audited with no user id; the row holds only hashes', T, async () => {
    const h = await startApp(ctx);
    const email = unknownEmail();
    const ip = nextIp();
    await attemptReset(h, resetFor(email, wrongFirst), ip);
    const events = recordsOf(await eventsJson(ctx, handleHex(ctx, email)));
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('reset_failed');
    expect(events[0]?.user_id).toBeNull();
    expect(hexOf(events[0]?.handle_hash)).toBe(handleHex(ctx, email));
    expect(JSON.stringify(events).toLowerCase()).not.toContain(email.toLowerCase());
  });

  it('[F1.6 c13] a limited attempt writes reset_limited, and an unknown handle\'s limited attempt has no user id', T, async () => {
    const h = await startApp(ctx);
    const email = unknownEmail();
    for (let i = 0; i < 5; i += 1) await attemptReset(h, resetFor(email, wrongFirst));
    await attemptReset(h, resetFor(email, RIGHT));
    const events = recordsOf(await eventsJson(ctx, handleHex(ctx, email)));
    expect(events.map((e) => e.kind)).toEqual(['reset_failed', 'reset_failed', 'reset_failed', 'reset_failed', 'reset_failed', 'reset_limited']);
    expect(events.every((e) => e.user_id === null)).toBe(true);
  });

  it('[F1.6 c13] a rate-limited attempt writes at most one row per lock: the first writes reset_limited, later ones in the same lock (right or wrong answers, from other addresses) write no audit row and no handle row for the submitted email; a NEW lock writes a new row', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    for (let i = 0; i < 5; i += 1) await attemptReset(h, resetFor(account.email, wrongFirst));
    expect((await attemptReset(h, resetFor(account.email, RIGHT))).statusCode).toBe(429);
    const locked = await throttle(ctx, 'handle', handle);
    const after = await kinds(ctx, handle);
    expect(after.split(',').filter((k) => k === 'reset_limited')).toHaveLength(1);
    for (const body of [resetFor(account.email, RIGHT), resetFor(account.email, wrongFirst), resetFor(account.email, RIGHT)]) {
      expect((await attemptReset(h, body, nextIp())).statusCode).toBe(429);
    }
    expect(await kinds(ctx, handle), 'no further audit row for the submitted email').toBe(after);
    expect(await throttle(ctx, 'handle', handle), 'the handle row is untouched').toBe(locked);

    await shift(ctx, 'handle', handle, '31 minutes');
    for (let i = 0; i < 5; i += 1) await attemptReset(h, resetFor(account.email, wrongFirst));
    expect((await attemptReset(h, resetFor(account.email, RIGHT))).statusCode).toBe(429);
    expect((await attemptReset(h, resetFor(account.email, RIGHT))).statusCode).toBe(429);
    const trail = (await kinds(ctx, handle)).split(',');
    expect(trail.filter((k) => k === 'reset_limited'), 'one row for the first lock and one for the second').toHaveLength(2);
    expect(trail.filter((k) => k === 'reset_failed')).toHaveLength(10);
  });

  it('[F1.6 c13 concurrency] eight simultaneous attempts on a locked handle: all 429, exactly one reset_limited row', { timeout: 120_000 }, async () => {
    const seed = await startApp(ctx);
    const account = await accountWithAnswers(ctx, seed);
    const handle = handleHex(ctx, account.email);
    for (let i = 0; i < 5; i += 1) await attemptReset(seed, resetFor(account.email, wrongFirst));
    const apps = await Promise.all(Array.from({ length: 8 }, () => startApp(ctx)));
    const results = await Promise.all(apps.map((h) => attemptReset(h, resetFor(account.email, RIGHT))));
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(429));
    expect((await kinds(ctx, handle)).split(',').filter((k) => k === 'reset_limited')).toHaveLength(1);
  });

  it('[F1.6 c13] a malformed request (400) writes no audit row', T, async () => {
    const h = await startApp(ctx);
    const email = unknownEmail();
    await attemptReset(h, resetFor(email, wrongFirst, 'short'));
    expect(await kinds(ctx, handleHex(ctx, email))).toBe(NONE);
  });

  it('[F1.6 c13] the audit and the counters change together: a request that fails in the database leaves neither', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    await breakEvents(ctx, handle, 'reset_failed');
    const res = await attemptReset(h, resetFor(account.email, wrongFirst));
    expect(res.statusCode, 'a failed audit write is not an answer about the answers').not.toBe(401);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(await throttle(ctx, 'handle', handle), 'the counter rolled back with the audit row').toBe(NONE);
    expect(await kinds(ctx, handle)).toBe('answers_saved');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c15 c20 Amendment 1] when Auth does not confirm: 503, an outcome row, no failure counted, and a retry converges', () => {
  it('[F1.6 c15] the set-password call fails: 503 {"error":"unavailable"}, reset_verified then reset_admin_failed, no failure counted, the answers still work', T, async () => {
    const admin = fakeAdmin('admin_failed');
    const h = await startApp(ctx, { admin });
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    const before = await answersJson(ctx, account.id);
    const res = await attemptReset(h, resetFor(account.email));
    expect(res.statusCode, res.body).toBe(503);
    expect(res.body).toBe(UNAVAILABLE);
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');
    expect(await kinds(ctx, handle)).toBe('answers_saved,reset_verified,reset_admin_failed');
    expect((await throttle(ctx, 'handle', handle)).split('/').slice(0, 2)).toEqual(['0', '0']);
    expect(await answersJson(ctx, account.id)).toBe(before);

    admin.answer('completed');
    const retry = await attemptReset(h, resetFor(account.email));
    expect(retry.statusCode, retry.body).toBe(200);
    expect(await kinds(ctx, handle)).toBe('answers_saved,reset_verified,reset_admin_failed,reset_verified,reset_completed');
  });

  it('[F1.6 c22] the account\'s current Auth email is not the request\'s: 401 invalid_recovery in the shape of any other failure, audit reset_verified then reset_email_mismatch, the answers still work', T, async () => {
    const admin = fakeAdmin('email_mismatch');
    const h = await startApp(ctx, { admin });
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    const before = await answersJson(ctx, account.id);
    const res = await attemptReset(h, resetFor(account.email));
    const plain = await attemptReset(h, resetFor(unknownEmail(), wrongFirst));
    expect(res.statusCode, res.body).toBe(401);
    expect(res.body).toBe(INVALID);
    expect(shapeOf(res), 'a stale handle must not tell itself apart from a wrong answer').toBe(shapeOf(plain));
    expect(await kinds(ctx, handle)).toBe('answers_saved,reset_verified,reset_email_mismatch');
    expect(await answersJson(ctx, account.id)).toBe(before);
    expect(JSON.stringify(recordsOf(await eventsJson(ctx, handle))).toLowerCase()).not.toContain(account.email.toLowerCase());

    admin.answer('completed');
    expect((await attemptReset(h, resetFor(account.email))).statusCode, 'the answers still work once the email matches').toBe(200);
  });

  it('[F1.6 c15] repeated admin failures never lock the owner out: five 503s in a row, then a correct attempt that succeeds', T, async () => {
    const admin = fakeAdmin('admin_failed');
    const h = await startApp(ctx, { admin });
    const account = await accountWithAnswers(ctx, h);
    for (let i = 1; i <= 5; i += 1) expect((await attemptReset(h, resetFor(account.email))).statusCode, `attempt ${i}`).toBe(503);
    admin.answer('completed');
    expect((await attemptReset(h, resetFor(account.email))).statusCode).toBe(200);
  });

  it('[F1.6 c20] the password is set but the global sign-out fails: 503 {"error":"unavailable"}, reset_verified then reset_revoke_failed', T, async () => {
    const admin = fakeAdmin('revoke_failed');
    const h = await startApp(ctx, { admin });
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    const res = await attemptReset(h, resetFor(account.email));
    expect(res.statusCode, res.body).toBe(503);
    expect(res.body).toBe(UNAVAILABLE);
    expect(admin.calls, 'the password was set once').toHaveLength(1);
    expect(await kinds(ctx, handle)).toBe('answers_saved,reset_verified,reset_revoke_failed');
    expect((await throttle(ctx, 'handle', handle)).split('/').slice(0, 2)).toEqual(['0', '0']);
  });

  it('[F1.6 c20] a retry after a sign-out failure runs the whole sequence again, succeeds with 200, and ends in reset_completed', T, async () => {
    const admin = fakeAdmin('revoke_failed');
    const h = await startApp(ctx, { admin });
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    await attemptReset(h, resetFor(account.email));
    admin.answer('completed');
    const retry = await attemptReset(h, resetFor(account.email, RIGHT, 'סיסמה אחרת ארוכה 777'));
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.body).toBe(OK);
    expect(admin.calls).toHaveLength(2);
    expect(toRecord(admin.calls[1]).password).toBe('סיסמה אחרת ארוכה 777');
    expect(await kinds(ctx, handle)).toBe('answers_saved,reset_verified,reset_revoke_failed,reset_verified,reset_completed');
  });

  it('[F1.6 c15] a password is never set without a committed reset_verified: if that row cannot be written, Auth is not called at all', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    await breakEvents(ctx, handle, 'reset_verified');
    const res = await attemptReset(h, resetFor(account.email));
    expect(res.statusCode, res.body).toBeGreaterThanOrEqual(500);
    expect(res.body).not.toBe(OK);
    expect(h.admin.calls, 'no audit row, no password change').toEqual([]);
    expect(await kinds(ctx, handle)).toBe('answers_saved');
  });

  it('[F1.6 c13 c9] if Auth confirmed everything but the outcome row cannot be written, the answer still follows Auth (200): the security state is right and only the record is short', T, async () => {
    const h = await startApp(ctx);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    await breakEvents(ctx, handle, 'reset_completed');
    const res = await attemptReset(h, resetFor(account.email));
    expect(res.statusCode, res.body).toBe(200);
    expect(await kinds(ctx, handle)).toBe('answers_saved,reset_verified');
    expect(h.log.text()).toContain('recovery reset: the outcome row was not written');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c3 c13 NFR-PRIV-001] the logs of the redeem path hold none of it', () => {
  it('[F1.6 c3] success, failure, limit and admin failure leave no email, answer, password, token, handle or address in the log', { timeout: 120_000 }, async () => {
    const admin = fakeAdmin('completed');
    const h = await startApp(ctx, { admin });
    const account = await accountWithAnswers(ctx, h, [entry('pet', 'LogPetMarker'), entry('street', 'LogStreetMarker')]);
    const wrongIp = nextIp();
    const rightIp = nextIp();
    const limitedEmail = unknownEmail();
    await attemptReset(h, resetFor(account.email, [entry('pet', 'LogWrongMarker'), entry('street', 'LogWrongTwoMarker')], 'LogPassword-Wrong1'), wrongIp);
    await attemptReset(h, resetFor(account.email, [entry('pet', 'LogPetMarker'), entry('street', 'LogStreetMarker')], 'LogPassword-Right1'), rightIp);
    admin.answer('admin_failed');
    await attemptReset(h, resetFor(account.email, [entry('pet', 'LogPetMarker'), entry('street', 'LogStreetMarker')], 'LogPassword-Fail1'), rightIp);
    for (let i = 0; i < 6; i += 1) await attemptReset(h, resetFor(limitedEmail, wrongFirst, 'LogPassword-Limited1'), wrongIp);
    await attemptReset(h, resetFor(account.email, RIGHT, 'short'), rightIp);

    const text = h.log.text().toLowerCase();
    const forbidden = [
      account.email,
      limitedEmail,
      'logpetmarker',
      'logstreetmarker',
      'logwrongmarker',
      'logwrongtwomarker',
      'logpassword',
      wrongIp,
      rightIp,
      handleHex(ctx, account.email),
      handleHex(ctx, limitedEmail),
      ipHex(ctx, wrongIp),
      ipHex(ctx, rightIp),
    ];
    for (const secret of forbidden) expect(text, `log contains ${secret.slice(0, 16)}`).not.toContain(secret.toLowerCase());
  });
});
