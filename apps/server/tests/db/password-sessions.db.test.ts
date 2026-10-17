import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { restoreEnv } from '../helpers/identity-fixtures.js';
import { restorePepper } from '../helpers/recovery-app.js';
import { T, accountWithAnswers, entry, kinds, handleHex, jsonOf, me, startContext, stopContext, type Context } from '../helpers/recovery-db.js';
import {
  NEW_PW,
  closeTakeoverApps,
  fakeAuth,
  googleBearer,
  linkState,
  passwordBearer,
  postPassword,
  sessionId,
  startTakeoverApp,
} from '../helpers/takeover-db.js';

// F2.0 part a, BUG (.work/account-takeover-close/bug.md), regression tests written before the fix. The fake Auth port now behaves like
// real GoTrue: an admin password set deletes EVERY session of the user, so a later logout?scope=others with any token of a session that
// existed before the set fails (403 session_not_found). Expected behaviour (spec c2, c3, c10; FR-AUTH-005, FR-AUTH-003):
//   - the S-01 clear completes ("done") and the caller's session keeps working (never stuck pending, never 503 forever);
//   - a password change with the two correct answers returns 200 and signs out only the other sessions.
// Exact expectations about the caller's own session after c10 / c7 follow design amendment A6 and are not asserted here yet.
// CI `db` job only.

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

const RIGHT = [entry('pet', 'Rex'), entry('street', 'Herzl')];

describe('[F2.0-a bug c3 c2 FR-AUTH-005] the clear completes against an Auth that deletes every session on an admin password set', () => {
  it('[F2.0-a bug c3] a Google sign-in of an affected account reaches "done": 200, not 503, and the next request works too', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const session = sessionId();
    const bearer = await googleBearer(ctx, account, session);

    const first = await me(h, bearer);
    expect(first.statusCode, first.body).toBe(200);
    expect(await linkState(ctx, account.id), 'recorded as cleared, not left pending').toBe(`affected/true/${session}/false`);
    const second = await me(h, bearer);
    expect(second.statusCode, 'not 503 forever').toBe(200);
    expect(jsonOf(second.body).mustSetPassword).toBe(true);
  });

  it('[F2.0-a bug c2] a session of the same user that existed before the clear is gone in Auth; the clearing session\'s own token still works against the server', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const registrant = sessionId();
    await passwordBearer(ctx, account, registrant);
    const bearer = await googleBearer(ctx, account);
    expect((await me(h, bearer)).statusCode).toBe(200);
    expect(auth.revoked.has(registrant), 'the earlier registrant\'s session was ended').toBe(true);
    expect((await me(h, bearer)).statusCode).toBe(200);
  });
});

describe('[F2.0-a bug c10 FR-AUTH-003] the password change with the right answers is not a 503 after the password changed', () => {
  it('[F2.0-a bug c10] correct answers: 200 {"ok":true}, audited as changed, never as an Auth failure', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const bearer = await passwordBearer(ctx, account);
    const res = await postPassword(h, 'change', { current: RIGHT, password: NEW_PW }, bearer);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe('{"ok":true}');
    const audit = await kinds(ctx, handleHex(ctx, account.email));
    expect(audit).toContain('password_changed');
    expect(audit).not.toContain('password_change_auth_failed');
  });

  it('[F2.0-a bug c10 DR-E] every session of the account is ended by the change, the caller\'s included', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const other = sessionId();
    await passwordBearer(ctx, account, other);
    const caller = sessionId();
    const res = await postPassword(h, 'change', { current: RIGHT, password: NEW_PW }, await passwordBearer(ctx, account, caller));
    expect(res.statusCode, res.body).toBe(200);
    expect(auth.revoked.has(other), 'the other device is signed out').toBe(true);
    expect(auth.revoked.has(caller), 'the caller\'s own refresh fails too').toBe(true);
  });

  it('[F2.0-a bug c10] a Google-first account changing its password the same way: 200', T, async () => {
    const auth = fakeAuth({ identities: [{ provider: 'google', createdAt: new Date('2026-01-01T00:00:00Z') }] });
    const h = await startTakeoverApp(ctx, auth);
    const account = await accountWithAnswers(ctx, h);
    const res = await postPassword(h, 'change', { current: RIGHT, password: NEW_PW }, await googleBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(200);
  });
});
