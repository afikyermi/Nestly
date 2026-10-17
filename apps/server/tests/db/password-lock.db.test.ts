import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { restoreEnv } from '../helpers/identity-fixtures.js';
import { restorePepper } from '../helpers/recovery-app.js';
import {
  T,
  accountWithAnswers,
  attemptReset,
  entry,
  me,
  resetFor,
  startContext,
  stopContext,
  type Context,
} from '../helpers/recovery-db.js';
import {
  NEW_PW,
  closeTakeoverApps,
  delayedAdmin,
  fakeAuth,
  googleBearer,
  holdingLock,
  linkState,
  newBareAuthUser,
  passwordBearer,
  postPassword,
  sessionId,
  startTakeoverApp,
  until,
} from '../helpers/takeover-db.js';

// F2.0 part a fix round: .work/account-takeover-close/findings.md bug 1 (high) and schema.md Gate 2 amendment A4. Every server
// password set (c7, c10, c11, the F1.6 reset) and the S-01 clear take one per-user lock (a transaction-scoped try-lock on
// 'nestly.password_state:' + user id). Promise under test: a password set already in flight when the clear starts lands BEFORE the
// clear's cancelPassword, never after it; a request that finds the lock held is answered 503 `unavailable` with nothing changed
// (then the client retries). Auth is replaced at the port; its calls are logged in one shared order list. CI `db` job only.

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

const UNAVAILABLE = '{"error":"unavailable"}';
const RIGHT = [entry('pet', 'Rex'), entry('street', 'Herzl')];
const SET_MS = 600;

const before = (order: string[], first: string, second: string): boolean => {
  const a = order.indexOf(first);
  const b = order.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
};

describe('[F2.0-a A4 findings-1] a password set in flight before the clear lands before cancelPassword, never after', () => {
  it('[F2.0-a A4 c11] the earlier registrant\'s first-password set is in flight; the Google request is 503 and changes nothing; after the set, the retry clears and cancels AFTER it', T, async () => {
    const auth = fakeAuth({ setDelayMs: SET_MS });
    const setter = await startTakeoverApp(ctx, auth);
    const clearer = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);

    const inFlight = postPassword(setter, 'first', { password: NEW_PW }, await passwordBearer(ctx, bare));
    await until(() => auth.order.includes('setPassword:start'));
    const google = await googleBearer(ctx, bare);
    const blocked = await me(clearer, google);
    expect(blocked.statusCode, blocked.body).toBe(503);
    expect(blocked.body).toBe(UNAVAILABLE);
    expect(auth.of('cancelPassword'), 'nothing was changed by the refused clear').toEqual([]);
    expect(await linkState(ctx, bare.id)).toBe('-');

    expect((await inFlight).statusCode).toBe(200);
    expect((await me(clearer, google)).statusCode).toBe(200);
    expect(before(auth.order, 'setPassword:end', 'cancelPassword:start'), auth.order.join(' ')).toBe(true);
  });

  it('[F2.0-a A4 c10] the earlier registrant\'s password change (his own answers) is in flight; the clear waits its turn and cancels AFTER the set', T, async () => {
    const auth = fakeAuth({ setDelayMs: SET_MS });
    const setter = await startTakeoverApp(ctx, auth);
    const clearer = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, setter);

    const inFlight = postPassword(setter, 'change', { current: RIGHT, password: NEW_PW }, await passwordBearer(ctx, account));
    await until(() => auth.order.includes('setPassword:start'));
    const google = await googleBearer(ctx, account);
    const blocked = await me(clearer, google);
    expect(blocked.statusCode, blocked.body).toBe(503);
    expect(blocked.body).toBe(UNAVAILABLE);
    expect(auth.of('cancelPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe('-');

    expect((await inFlight).statusCode).toBe(200);
    expect((await me(clearer, google)).statusCode).toBe(200);
    expect(before(auth.order, 'setPassword:end', 'cancelPassword:start'), auth.order.join(' ')).toBe(true);
  });

  it('[F2.0-a A4 reset] the F1.6 reset (his own answers) is in flight; the clear waits its turn and cancels AFTER the reset\'s set', T, async () => {
    const auth = fakeAuth();
    const setter = await startTakeoverApp(ctx, auth, { authAdmin: delayedAdmin(auth.order, SET_MS) });
    const clearer = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, setter);

    const inFlight = attemptReset(setter, resetFor(account.email, RIGHT, NEW_PW));
    await until(() => auth.order.includes('reset:start'));
    const google = await googleBearer(ctx, account);
    const blocked = await me(clearer, google);
    expect(blocked.statusCode, blocked.body).toBe(503);
    expect(blocked.body).toBe(UNAVAILABLE);
    expect(auth.of('cancelPassword')).toEqual([]);

    expect((await inFlight).statusCode).toBe(200);
    expect((await me(clearer, google)).statusCode).toBe(200);
    expect(before(auth.order, 'reset:end', 'cancelPassword:start'), auth.order.join(' ')).toBe(true);
  });
});

describe('[F2.0-a A4] a request that finds the user\'s lock held is 503 `unavailable` and changes nothing', () => {
  it('[F2.0-a A4 c11] first password: 503, nothing set; the same request succeeds once the lock is free', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    const bearer = await passwordBearer(ctx, bare);
    const res = await holdingLock(ctx, bare.id, () => postPassword(h, 'first', { password: NEW_PW }, bearer));
    expect(res.statusCode, res.body).toBe(503);
    expect(res.body).toBe(UNAVAILABLE);
    expect(auth.of('setPassword')).toEqual([]);
    expect((await postPassword(h, 'first', { password: NEW_PW }, bearer)).statusCode).toBe(200);
  });

  it('[F2.0-a A4 c10] password change: 503, nothing set, no session ended, the attempt not counted as wrong; succeeds when free', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const bearer = await passwordBearer(ctx, account);
    const res = await holdingLock(ctx, account.id, () => postPassword(h, 'change', { current: RIGHT, password: NEW_PW }, bearer));
    expect(res.statusCode, res.body).toBe(503);
    expect(res.body).toBe(UNAVAILABLE);
    expect(auth.of('setPassword')).toEqual([]);
    expect((await postPassword(h, 'change', { current: RIGHT, password: NEW_PW }, bearer)).statusCode).toBe(200);
  });

  it('[F2.0-a A4 reset] the F1.6 reset: 503, no Auth call; succeeds when free', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const res = await holdingLock(ctx, account.id, () => attemptReset(h, resetFor(account.email, RIGHT, NEW_PW)));
    expect(res.statusCode, res.body).toBe(503);
    expect(res.body).toBe(UNAVAILABLE);
    expect(h.admin.calls).toEqual([]);
    expect((await attemptReset(h, resetFor(account.email, RIGHT, NEW_PW))).statusCode).toBe(200);
  });

  it('[F2.0-a A4 c3] the clear: 503, nothing cancelled, no state recorded, answers kept; the same request clears once the lock is free', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const google = await googleBearer(ctx, account);
    const res = await holdingLock(ctx, account.id, () => me(h, google));
    expect(res.statusCode, res.body).toBe(503);
    expect(auth.of('cancelPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe('-');
    expect((await me(h, google)).statusCode).toBe(200);
  });

  it('[F2.0-a A4 c7] the forced password: 503, still "must set", nothing set; succeeds when free', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const session = sessionId();
    const bearer = await googleBearer(ctx, account, session);
    expect((await me(h, bearer)).statusCode).toBe(200);
    auth.calls.length = 0;
    const res = await holdingLock(ctx, account.id, () => postPassword(h, 'forced', { password: NEW_PW }, bearer));
    expect(res.statusCode, res.body).toBe(503);
    expect(res.body).toBe(UNAVAILABLE);
    expect(auth.of('setPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/false`);
    expect((await postPassword(h, 'forced', { password: NEW_PW }, bearer)).statusCode).toBe(200);
  });

  it('[F2.0-a A4] the lock is per user: another user\'s password set is not held up by it', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const held = await newBareAuthUser(ctx);
    const other = await newBareAuthUser(ctx);
    const res = await holdingLock(ctx, held.id, async () => postPassword(h, 'first', { password: NEW_PW }, await passwordBearer(ctx, other)));
    expect(res.statusCode, res.body).toBe(200);
  });
});
