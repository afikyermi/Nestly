import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { restoreEnv } from '../helpers/identity-fixtures.js';
import { restorePepper } from '../helpers/recovery-app.js';
import {
  T,
  accountWithAnswers,
  answersJson,
  changeAnswers,
  entry,
  eventsJson,
  handleHex,
  jsonOf,
  kinds,
  me,
  newAccount,
  nextIp,
  recordsOf,
  saveAnswers,
  startContext,
  stopContext,
  ladder,
  type Account,
  type Context,
} from '../helpers/recovery-db.js';
import {
  GOOGLE_FIRST,
  NEW_PW,
  OK_BODY,
  closeTakeoverApps,
  fakeAuth,
  googleBearer,
  linkKinds,
  linkState,
  newBareAuthUser,
  passwordBearer,
  postPassword,
  sessionId,
  startTakeoverApp,
  type FakeAuth,
  type TakeoverHarness,
} from '../helpers/takeover-db.js';

// F2.0 part a, the three password routes against the real database (CI `db` job, as app_server): c7 (forced new password),
// c8 (then the questions hold), c10 (change after two answers), c11 (the F1.8 first password), c12 (JWT subject only, no
// secrets in logs or audit). Derived from spec.md and interface.md. Auth is replaced at recovery.authAccount; the proof that a
// new password signs in and the old one fails is the Preview run (spec c17).

let ctx: Context;

beforeAll(async () => {
  ctx = await startContext();
}, 60_000);

afterEach(async () => {
  await closeTakeoverApps();
});

afterAll(async () => {
  await stopContext(ctx);
  restorePepper();
  restoreEnv();
});

const NONE = '-';
const INVALID_PASSWORD = '{"error":"invalid_password"}';
const NOT_REQUIRED = '{"error":"not_required"}';
const INVALID_RECOVERY = '{"error":"invalid_recovery"}';
const RIGHT = [entry('pet', 'Rex'), entry('street', 'Herzl')];
const chars = (n: number): string => 'x'.repeat(n);

/** An account the clear has run for: cleared, password not set. Returns the clearing session's token. */
async function clearedAccount(auth: FakeAuth, h: TakeoverHarness): Promise<{ account: Account; bearer: string; session: string }> {
  const account = await accountWithAnswers(ctx, h);
  const session = sessionId();
  const bearer = await googleBearer(ctx, account, session);
  const res = await me(h, bearer);
  expect(res.statusCode, res.body).toBe(200);
  expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/false`);
  auth.calls.length = 0;
  return { account, bearer, session };
}

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c7 FR-AUTH-005] the forced new password', () => {
  it('[F2.0-a c7 DR-E] /api/me reports "must set password" to the clearing session and to any session issued after the clear, not to a stale one', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer } = await clearedAccount(auth, h);
    expect(jsonOf((await me(h, bearer)).body)).toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: true });
    const later = await me(h, await googleBearer(ctx, account, sessionId(), 10));
    expect(jsonOf(later.body), 'an oauth session issued after the clear is the owner\'s: it is told too').toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: true });
    const stale = await me(h, await passwordBearer(ctx, account, sessionId(), -120));
    expect(stale.statusCode, 'a pre-clear token is stale').toBe(401);
  });

  it('[F2.0-a c7] a 7- or 257-character password is a 400 field error and nothing is set (8 and 256 are the edges that pass)', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer } = await clearedAccount(auth, h);
    for (const bad of [chars(7), chars(257), '', '       ']) {
      const res = await postPassword(h, 'forced', { password: bad }, bearer);
      expect(res.statusCode, `${bad.length} chars`).toBe(400);
      expect(res.body).toBe(INVALID_PASSWORD);
    }
    for (const wrong of [{}, { password: 12345678 }, { password: null }, { password: ['abcdefgh'] }]) {
      expect((await postPassword(h, 'forced', wrong, bearer)).statusCode).toBe(400);
    }
    expect(auth.of('setPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toMatch(/\/false$/);
    expect(jsonOf((await me(h, bearer)).body).mustSetPassword).toBe(true);

    const edge = await postPassword(h, 'forced', { password: chars(256) }, bearer);
    expect(edge.statusCode, edge.body).toBe(200);
    const h2 = await clearedAccount(auth, h);
    expect((await postPassword(h, 'forced', { password: chars(8) }, h2.bearer)).statusCode).toBe(200);
  });

  it('[F2.0-a c7 c12] the body takes only the password: a user id, an email or any other key is a 400', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer } = await clearedAccount(auth, h);
    for (const extra of [{ userId: account.id }, { email: account.email }, { sub: account.id }, { id: account.id }]) {
      const res = await postPassword(h, 'forced', { password: NEW_PW, ...extra }, bearer);
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c7] the server sets it: for the JWT subject, with the password given; the account is then done and audited', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer, session } = await clearedAccount(auth, h);
    const res = await postPassword(h, 'forced', { password: NEW_PW }, bearer);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe(OK_BODY);
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');
    expect(auth.of('setPassword')).toHaveLength(1);
    expect(auth.of('setPassword')[0]?.input).toMatchObject({ userId: account.id, password: NEW_PW });
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/true`);
    expect(auth.revoked.has(session), 'DR-E: after success every session ends, the clearing one included').toBe(true);
    expect((await linkKinds(ctx, account.id)).split(',')).toEqual(expect.arrayContaining(['takeover_cleared', 'password_set_forced']));
    expect(jsonOf((await me(h, bearer)).body).mustSetPassword).toBe(false);
  });

  it('[F2.0-a c7] a second call is refused (409), the password unchanged', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { bearer } = await clearedAccount(auth, h);
    expect((await postPassword(h, 'forced', { password: NEW_PW }, bearer)).statusCode).toBe(200);
    const again = await postPassword(h, 'forced', { password: 'סיסמה אחרת ארוכה 999' }, bearer);
    expect(again.statusCode, again.body).toBe(409);
    expect(again.body).toBe(NOT_REQUIRED);
    expect(auth.of('setPassword')).toHaveLength(1);
  });

  it('[F2.0-a c7 DR-E] an oauth session issued after the clear may set it: 200, set for the JWT subject', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, session } = await clearedAccount(auth, h);
    const res = await postPassword(h, 'forced', { password: NEW_PW }, await googleBearer(ctx, account, sessionId(), 10));
    expect(res.statusCode, res.body).toBe(200);
    expect(auth.of('setPassword')[0]?.input).toMatchObject({ userId: account.id, password: NEW_PW });
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/true`);
    const again = await postPassword(h, 'forced', { password: NEW_PW }, await googleBearer(ctx, account, sessionId(), 10));
    expect(again.statusCode, 'a second call is still refused').toBe(409);
  });

  it('[F2.0-a c7 DR-E2] until the password is set, a session with amr password issued AFTER the clear is stale: 401 on /api/me and c7, nothing set', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, session } = await clearedAccount(auth, h);
    const racer = await passwordBearer(ctx, account, sessionId(), 10);
    const asked = await me(h, racer);
    expect(asked.statusCode, asked.body).toBe(401);
    const res = await postPassword(h, 'forced', { password: NEW_PW }, racer);
    expect(res.statusCode, res.body).toBe(401);
    expect(auth.of('setPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/false`);
  });

  it('[F2.0-a c11 DR-E2] the unregistered variant: a password-amr session issued after the clear is refused (401) on /api/me and c11, nothing set', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    expect((await me(h, await googleBearer(ctx, bare))).statusCode).toBe(200);
    auth.calls.length = 0;
    const racer = await passwordBearer(ctx, bare, sessionId(), 10);
    expect((await me(h, racer)).statusCode).toBe(401);
    const res = await postPassword(h, 'first', { password: NEW_PW }, racer);
    expect(res.statusCode, res.body).toBe(401);
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c7 DR-E] a stale session (a token issued before the clear) is refused with 401 and nothing is set', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, session } = await clearedAccount(auth, h);
    for (const stale of [await passwordBearer(ctx, account, sessionId(), -120), await googleBearer(ctx, account, sessionId(), -120)]) {
      const res = await postPassword(h, 'forced', { password: NEW_PW }, stale);
      expect(res.statusCode, res.body).toBe(401);
    }
    expect(auth.of('setPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/false`);
  });

  it('[F2.0-a c7] an account not in that state (never cleared) is refused (409), password unchanged: an email-only account, and a Google-first one', T, async () => {
    const auth = fakeAuth({ identities: GOOGLE_FIRST });
    const h = await startTakeoverApp(ctx, auth);
    const plain = await accountWithAnswers(ctx, h);
    const plainRes = await postPassword(h, 'forced', { password: NEW_PW }, await passwordBearer(ctx, plain));
    expect(plainRes.statusCode, plainRes.body).toBe(409);
    const googleFirst = await accountWithAnswers(ctx, h);
    const gfRes = await postPassword(h, 'forced', { password: NEW_PW }, await googleBearer(ctx, googleFirst));
    expect(gfRes.statusCode, gfRes.body).toBe(409);
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c7] Auth does not confirm: 503, nothing recorded as set, and the same call succeeds on retry', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer, session } = await clearedAccount(auth, h);
    auth.script.set = 'failed';
    const failed = await postPassword(h, 'forced', { password: NEW_PW }, bearer);
    expect(failed.statusCode, failed.body).toBe(503);
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/false`);
    expect(jsonOf((await me(h, bearer)).body).mustSetPassword).toBe(true);
    auth.script.set = 'set';
    expect((await postPassword(h, 'forced', { password: NEW_PW }, bearer)).statusCode).toBe(200);
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/true`);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c8 AC-114] then the questions hold', () => {
  it('[F2.0-a c8] after c7 the account is active with recoveryQuestions "missing" until a new pair is stored; then "set"', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer } = await clearedAccount(auth, h);
    expect(await answersJson(ctx, account.id)).toBe(NONE);
    expect((await postPassword(h, 'forced', { password: NEW_PW }, bearer)).statusCode).toBe(200);
    expect(jsonOf((await me(h, bearer)).body)).toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: false });
    const saved = await saveAnswers(h, bearer, [entry('nickname', 'Dana'), entry('pet', 'Rex')]);
    expect(saved.statusCode, saved.body).toBe(201);
    expect(jsonOf((await me(h, bearer)).body)).toEqual({ state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
  });

  it('[F2.0-a c8] while the password is not yet set the account can read /api/me but is told to set it first (the screen is c14)', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { bearer } = await clearedAccount(auth, h);
    expect(jsonOf((await me(h, bearer)).body).mustSetPassword).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c10 FR-AUTH-003 S-16] the password change after two answers', () => {
  const body = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ current: RIGHT, password: NEW_PW, ...over });

  it('[F2.0-a c10] both answers right: 200, the server sets the password of the JWT subject, ends the other sessions with the caller\'s own token, audits', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const callerSession = sessionId();
    const bearer = await passwordBearer(ctx, account, callerSession);
    const res = await postPassword(h, 'change', body(), bearer);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe(OK_BODY);
    expect(String(res.headers['cache-control']).toLowerCase()).toContain('no-store');
    expect(auth.of('setPassword')).toHaveLength(1);
    expect(auth.of('setPassword')[0]?.input).toMatchObject({ userId: account.id, password: NEW_PW });
    expect(auth.revoked.has(callerSession), 'DR-E: the caller\'s own session ends too (its refresh fails); the client signs in again').toBe(true);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toBe('answers_saved,password_changed');
  });

  it('[F2.0-a c10] a wrong answer: 401 ERR-042 (the same body as recovery), the password unchanged, the attempt counted and audited', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const handle = handleHex(ctx, account.email);
    const res = await postPassword(h, 'change', body({ current: [entry('pet', 'Wrong'), entry('street', 'Herzl')] }), await passwordBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(401);
    expect(res.body).toBe(INVALID_RECOVERY);
    expect(auth.of('setPassword')).toEqual([]);
    expect((await ladder(ctx, handle)).split('/')[0], 'one failure on the account\'s ladder').toBe('1');
    expect(await kinds(ctx, handle)).toBe('answers_saved,password_change_failed');
  });

  it('[F2.0-a c10] other questions than the saved pair: 401, password unchanged, counted', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const res = await postPassword(h, 'change', body({ current: [entry('nickname', 'Rex'), entry('pet', 'Herzl')] }), await passwordBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(401);
    expect(res.body).toBe(INVALID_RECOVERY);
    expect(auth.of('setPassword')).toEqual([]);
    expect((await ladder(ctx, handleHex(ctx, account.email))).split('/')[0]).toBe('1');
  });

  it('[F2.0-a c10 NFR-SEC-010 AC-113] the 4th attempt on the account after three failures is 429 with Retry-After even with correct answers; the ladder is the question change\'s', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const bearer = await passwordBearer(ctx, account);
    const wrong = [entry('pet', 'Wrong'), entry('street', 'Herzl')];
    for (let i = 0; i < 2; i += 1) expect((await postPassword(h, 'change', body({ current: wrong }), bearer, nextIp())).statusCode).toBe(401);
    const res = await changeAnswers(h, bearer, wrong, [entry('nickname', 'Dana'), entry('pet', 'Rex')], nextIp());
    expect(res.statusCode, 'a failed question change counts on the same ladder').toBe(401);
    const fourth = await postPassword(h, 'change', body(), bearer, nextIp());
    expect(fourth.statusCode, fourth.body).toBe(429);
    expect(fourth.body).toBe('{"error":"rate_limited"}');
    expect(fourth.headers['retry-after']).toBeDefined();
    expect(auth.of('setPassword')).toEqual([]);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toContain('password_change_limited');
  });

  it('[F2.0-a c10 NFR-SEC-010] the 11th attempt from one address in 15 minutes is 429 even with correct answers', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const ip = nextIp();
    const wrong = [entry('pet', 'Wrong'), entry('street', 'Herzl')];
    for (let i = 0; i < 10; i += 1) {
      const account = await accountWithAnswers(ctx, h);
      const res = await postPassword(h, 'change', body({ current: wrong }), await passwordBearer(ctx, account), ip);
      expect(res.statusCode, `attempt ${i + 1}`).toBe(401);
    }
    const eleventh = await accountWithAnswers(ctx, h);
    const res = await postPassword(h, 'change', body(), await passwordBearer(ctx, eleventh), ip);
    expect(res.statusCode, res.body).toBe(429);
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c10 AC-116] answers typed with niqqud, final letters, case and spacing match; "ab" does not match "abc" (VAL-045)', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h, [entry('pet', 'מלך'), entry('street', 'abc')]);
    const bearer = await passwordBearer(ctx, account);
    const short = await postPassword(h, 'change', body({ current: [entry('pet', 'מלך'), entry('street', 'ab')] }), bearer);
    expect([400, 401], short.body).toContain(short.statusCode);
    expect(auth.of('setPassword')).toEqual([]);
    const typed = await postPassword(h, 'change', body({ current: [entry('pet', ' מֶלֶךְ '), entry('street', 'ABC')] }), bearer);
    expect(typed.statusCode, typed.body).toBe(200);
  });

  it('[F2.0-a c10 VAL-003] the password follows VAL-003: 7 and 257 characters are 400 and nothing is set; 8 and 256 pass', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const bearer = await passwordBearer(ctx, account);
    for (const bad of [chars(7), chars(257)]) expect((await postPassword(h, 'change', body({ password: bad }), bearer)).statusCode).toBe(400);
    expect((await postPassword(h, 'change', { current: RIGHT }, bearer)).statusCode).toBe(400);
    expect((await postPassword(h, 'change', { current: [RIGHT[0]], password: NEW_PW }, bearer)).statusCode).toBe(400);
    expect(auth.of('setPassword')).toEqual([]);
    expect((await postPassword(h, 'change', body({ password: chars(8) }), bearer)).statusCode).toBe(200);
    expect((await postPassword(h, 'change', body({ password: chars(256) }), bearer)).statusCode).toBe(200);
  });

  it('[F2.0-a c10 c12] the body names no user: a user id or an email is a 400', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    for (const extra of [{ userId: account.id }, { email: account.email }]) {
      expect((await postPassword(h, 'change', body(extra), await passwordBearer(ctx, account))).statusCode).toBe(400);
    }
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c10 ERR-044] Auth does not set it: 503, audited, and a retry succeeds', T, async () => {
    const auth = fakeAuth({ set: 'failed' });
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const bearer = await passwordBearer(ctx, account);
    const failed = await postPassword(h, 'change', body(), bearer);
    expect(failed.statusCode, failed.body).toBe(503);
    expect(await kinds(ctx, handleHex(ctx, account.email))).toContain('password_change_auth_failed');
    auth.script.set = 'set';
    expect((await postPassword(h, 'change', body(), bearer)).statusCode).toBe(200);
  });

  it('[F2.0-a c10] a Google-first account with saved answers succeeds the same way', T, async () => {
    const auth = fakeAuth({ identities: GOOGLE_FIRST });
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const res = await postPassword(h, 'change', body(), await googleBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(200);
    expect(auth.of('setPassword')).toHaveLength(1);
  });

  it('[F2.0-a c10] an account with no saved answers is refused (409 not_set) and nothing is set', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await newAccount(ctx);
    const res = await postPassword(h, 'change', body(), await passwordBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(409);
    expect(res.body).toBe('{"error":"not_set"}');
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c10 c12] the answers of another account do not open this one: it acts on the JWT subject only', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const victim = await accountWithAnswers(ctx, h);
    const caller = await accountWithAnswers(ctx, h, [entry('pet', 'Other'), entry('street', 'Street')]);
    const res = await postPassword(h, 'change', body(), await passwordBearer(ctx, caller));
    expect(res.statusCode, 'the victim\'s answers are not the caller\'s').toBe(401);
    expect(auth.of('setPassword')).toEqual([]);
    expect(victim.id).not.toBe(caller.id);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c11 D2 FR-AUTH-005] the first password of the F1.8 completion', () => {
  it('[F2.0-a c11] an Auth user with no account row: 200, set by the server for the JWT subject, audited with no user', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    const res = await postPassword(h, 'first', { password: NEW_PW }, await googleBearer(ctx, bare));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe(OK_BODY);
    expect(auth.of('setPassword')).toHaveLength(1);
    expect(auth.of('setPassword')[0]?.input).toMatchObject({ userId: bare.id, password: NEW_PW });
    const row = recordsOf(await eventsJson(ctx, handleHex(ctx, bare.email))).find((r) => r.kind === 'first_password_set');
    expect(row, 'first_password_set is audited').toBeDefined();
    expect(row?.user_id).toBeNull();
  });

  it('[F2.0-a c11] for a user WITH an account row it is refused (403) and the password is unchanged: it cannot bypass c10', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const res = await postPassword(h, 'first', { password: NEW_PW }, await passwordBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(403);
    expect(res.body).toBe('{"error":"forbidden"}');
    const google = await postPassword(h, 'first', { password: NEW_PW }, await googleBearer(ctx, account));
    expect(google.statusCode, google.body).toBe(403);
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c11 VAL-003] a 7- or 257-character password is 400 and a body naming a user is 400', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    const bearer = await googleBearer(ctx, bare);
    for (const bad of [chars(7), chars(257)]) expect((await postPassword(h, 'first', { password: bad }, bearer)).statusCode).toBe(400);
    expect((await postPassword(h, 'first', { password: NEW_PW, userId: bare.id }, bearer)).statusCode).toBe(400);
    expect(auth.of('setPassword')).toEqual([]);
  });

  it('[F2.0-a c11] Auth does not confirm: 503 and the same call works on retry (the registration is not created before it)', T, async () => {
    const auth = fakeAuth({ set: 'failed' });
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    const bearer = await googleBearer(ctx, bare);
    expect((await postPassword(h, 'first', { password: NEW_PW }, bearer)).statusCode).toBe(503);
    auth.script.set = 'set';
    expect((await postPassword(h, 'first', { password: NEW_PW }, bearer)).statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c12 NFR-SEC-001 NFR-PRIV-001] authorization and fences', () => {
  it('[F2.0-a c12] no token is 401 with a Bearer challenge on all three routes, and nothing is called', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    for (const route of ['forced', 'change', 'first'] as const) {
      const res = await postPassword(h, route, { password: NEW_PW, current: RIGHT });
      expect(res.statusCode, route).toBe(401);
      expect(res.body).toBe('{"error":"unauthenticated"}');
      expect(String(res.headers['www-authenticate'])).toMatch(/^Bearer/i);
    }
    expect(auth.calls).toEqual([]);
  });

  it('[F2.0-a c12] a request cannot target another account: whatever the body says, only the subject\'s password is set', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer } = await clearedAccount(auth, h);
    const other = await newAccount(ctx);
    const res = await postPassword(h, 'forced', { password: NEW_PW, userId: other.id, email: other.email }, bearer);
    expect(res.statusCode).toBe(400);
    const ok = await postPassword(h, 'forced', { password: NEW_PW }, bearer);
    expect(ok.statusCode).toBe(200);
    expect(auth.of('setPassword').map((c) => c.input.userId)).toEqual([account.id]);
  });

  it('[F2.0-a c12] a password, an answer, a token or an email never reaches a log line, an audit row or an error body', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const secretPassword = `Sec-${randomUUID()}-pw`;
    const secretAnswer = `Ans${randomUUID().replaceAll('-', '')}`;
    const account = await accountWithAnswers(ctx, h, [entry('pet', secretAnswer), entry('street', 'Herzl')]);
    const bearer = await passwordBearer(ctx, account);
    const token = bearer.replace(/^Bearer /, '');

    auth.script.set = 'failed';
    const results = [
      await postPassword(h, 'change', { current: [entry('pet', secretAnswer), entry('street', 'Herzl')], password: secretPassword }, bearer),
      await postPassword(h, 'change', { current: [entry('pet', `${secretAnswer}x`), entry('street', 'Herzl')], password: secretPassword }, bearer),
      await postPassword(h, 'change', { current: RIGHT, password: chars(3) + secretPassword.slice(0, 1) }, bearer),
      await postPassword(h, 'first', { password: secretPassword }, bearer),
      await postPassword(h, 'forced', { password: secretPassword }, bearer),
    ];
    const everything = [
      h.log.text(),
      ...results.map((r) => r.body),
      await eventsJson(ctx, handleHex(ctx, account.email)),
    ].join('\n');
    expect(everything).not.toContain(secretPassword);
    expect(everything).not.toContain(secretAnswer);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(account.email);
    expect(h.log.text().length, 'the capture saw the requests (not vacuous)').toBeGreaterThan(0);
  });

  it('[F2.0-a c12] the clear and the forced set both leave an audit row whose columns carry only kind, user, hashes and time', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const { account, bearer } = await clearedAccount(auth, h);
    await postPassword(h, 'forced', { password: NEW_PW }, bearer);
    const rows = recordsOf(await eventsJson(ctx, handleHex(ctx, account.email))).filter((r) => r.kind === 'takeover_cleared' || r.kind === 'password_set_forced');
    expect(rows.map((r) => r.kind).sort()).toEqual(['password_set_forced', 'takeover_cleared']);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['handle_hash', 'id', 'ip_hash', 'kind', 'occurred_at', 'user_id']);
    expect(JSON.stringify(rows)).not.toContain(NEW_PW);
  });
});
