import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { restoreEnv } from '../helpers/identity-fixtures.js';
import { restorePepper } from '../helpers/recovery-app.js';
import {
  T,
  answersJson,
  eventsJson,
  handleHex,
  jsonOf,
  kinds,
  me,
  recordsOf,
  saveAnswers,
  startContext,
  stopContext,
  changeAnswers,
  entry,
  bearerFor,
  type Context,
} from '../helpers/recovery-db.js';
import {
  EMAIL_FIRST,
  GOOGLE_FIRST,
  affectedAccount,
  bareSessionBearer,
  closeTakeoverApps,
  fakeAuth,
  googleBearer,
  linkKinds,
  linkPut,
  linkState,
  newBareAuthUser,
  passwordBearer,
  postPassword,
  sessionId,
  startTakeoverApp,
} from '../helpers/takeover-db.js';

// F2.0 part a, the S-01 clear against the real database (CI `db` job, as app_server). Spec criteria c1-c6 and c9
// (FR-AUTH-005, S-01), derived from spec.md and interface.md "Test seams". Auth is replaced at recovery.authAccount; what the
// real Auth service does with the calls (the old password failing sign-in, a refresh from another session failing) is proved
// in the Preview run (spec c17), not here: here the proof is that the calls are made, in order, for the right user and token.

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
// DR-T1: c4 and c6 cover every request that passes body validation; a malformed body keeps F1.6's 400 before the database.
const VALID_PAIR = [entry('pet', 'Rex'), entry('street', 'Herzl')];

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c1 FR-AUTH-005] detection: who the clear runs for', () => {
  it('[F2.0-a c1] a Google session of an account with an older email identity runs the clear before the request is answered', T, async () => {
    const auth = fakeAuth({ identities: EMAIL_FIRST });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const session = sessionId();
    const bearer = await googleBearer(ctx, account, session);

    const res = await me(h, bearer);
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ state: 'active', recoveryQuestions: 'missing', mustSetPassword: true });
    expect(auth.of('cancelPassword')).toHaveLength(1);
    expect(auth.of('cancelPassword')[0]?.input.userId).toBe(account.id);
    expect(auth.of('signOutOthers')).toHaveLength(1);
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/false`);
  });

  it('[F2.0-a c1] the identities are read with the caller\'s own access token, never anyone else\'s', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const bearer = await googleBearer(ctx, account);
    await me(h, bearer);
    expect(auth.of('readIdentities')).toHaveLength(1);
    expect(auth.of('readIdentities')[0]?.input.accessToken).toBe(bearer.replace(/^Bearer /, ''));
    expect(auth.of('signOutOthers')[0]?.input.accessToken).toBe(bearer.replace(/^Bearer /, ''));
  });

  it('[F2.0-a c1] an email-only account (a password session) runs nothing and gets no link row', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const res = await me(h, await passwordBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(200);
    expect(auth.calls).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(NONE);
  });

  it('[F2.0-a c1] a request from a password-signed-in session of an account that looks affected still runs nothing', T, async () => {
    const auth = fakeAuth({ identities: EMAIL_FIRST });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    await me(h, await passwordBearer(ctx, account));
    await me(h, await bareSessionBearer(ctx, account));
    expect(auth.calls).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(NONE);
    expect(await answersJson(ctx, account.id)).not.toBe(NONE);
  });

  it('[F2.0-a c1] a Google-first account whose email identity came later: no clear, "unaffected" stored once, answers untouched', T, async () => {
    const auth = fakeAuth({ identities: GOOGLE_FIRST });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const res = await me(h, await googleBearer(ctx, account));
    expect(res.statusCode, res.body).toBe(200);
    expect(jsonOf(res.body)).toEqual({ state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
    expect(auth.of('cancelPassword')).toEqual([]);
    expect(auth.of('signOutOthers')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe('unaffected/false/-/false');
    expect(await linkKinds(ctx, account.id)).not.toContain('takeover_cleared');
  });

  it('[F2.0-a c1] a Google-first account with no email identity at all: no clear', T, async () => {
    const auth = fakeAuth({ identities: [{ provider: 'google', createdAt: new Date('2026-01-01T00:00:00Z') }] });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    await me(h, await googleBearer(ctx, account));
    expect(auth.of('cancelPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe('unaffected/false/-/false');
  });

  it('[F2.0-a c1] app_metadata.providers is never read: a token claiming both providers does not change the verdict taken from the identities', T, async () => {
    const auth = fakeAuth({ identities: GOOGLE_FIRST });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const bearer = await bearerFor(ctx, account, account.email, {
      session_id: sessionId(),
      amr: [{ method: 'oauth' }],
      app_metadata: { provider: 'google', providers: ['email', 'google'] },
    });
    await me(h, bearer);
    expect(auth.of('cancelPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe('unaffected/false/-/false');
  });

  it('[F2.0-a c1 c3] when the identities cannot be read the request is 503, nothing runs and nothing is recorded; the next request tries again', T, async () => {
    const auth = fakeAuth({ identities: 'failed' });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const bearer = await googleBearer(ctx, account);
    const failed = await me(h, bearer);
    expect(failed.statusCode).toBe(503);
    expect(auth.of('cancelPassword')).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(NONE);
    auth.script.identities = EMAIL_FIRST;
    expect((await me(h, bearer)).statusCode).toBe(200);
    expect(await linkState(ctx, account.id)).toMatch(/^affected\/true\//);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c2 D1 FR-AUTH-005] what the clear leaves behind', () => {
  it('[F2.0-a c2] the answers are deleted, one clear row is audited with no password, answer or token in it, and the caller\'s session keeps working', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const bearer = await googleBearer(ctx, account);
    expect(await answersJson(ctx, account.id)).not.toBe(NONE);

    expect((await me(h, bearer)).statusCode).toBe(200);
    expect((await me(h, bearer)).statusCode, 'the caller\'s session keeps working').toBe(200);
    expect(await answersJson(ctx, account.id)).toBe(NONE);

    const handle = handleHex(ctx, account.email);
    const rows = recordsOf(await eventsJson(ctx, handle)).filter((row) => row.kind === 'takeover_cleared');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(account.id);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(bearer.replace(/^Bearer /, ''));
    expect(text).not.toMatch(/Rex|Herzl|password|answer/i);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['handle_hash', 'id', 'ip_hash', 'kind', 'occurred_at', 'user_id']);
  });

  it('[F2.0-a c2 D1] recovery with the old answers has nothing to match (ERR-042): the same 401 as an unknown email', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    await me(h, await googleBearer(ctx, account));
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/recovery/reset',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.250.1.1' },
      payload: JSON.stringify({
        email: account.email,
        answers: [
          { question: 'pet', answer: 'Rex' },
          { question: 'street', answer: 'Herzl' },
        ],
        password: 'סיסמה חדשה ארוכה 12345',
      }),
    });
    expect(res.statusCode, res.body).toBe(401);
    expect(res.body).toBe('{"error":"invalid_recovery"}');
    expect(h.admin.calls, 'no password was reset').toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c3 FR-AUTH-005] order and failure', () => {
  it('[F2.0-a c3] the answers are cleared and "pending" recorded first, then the password cancelled, then the other sessions ended, then "done"', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const atCancel: string[] = [];
    const atSignOut: string[] = [];
    auth.onCall.cancelPassword = async () => {
      atCancel.push(`${await linkState(ctx, account.id)}|${await answersJson(ctx, account.id)}`);
    };
    auth.onCall.signOutOthers = async () => {
      atSignOut.push(await linkState(ctx, account.id));
    };
    const session = sessionId();
    expect((await me(h, await googleBearer(ctx, account, session))).statusCode).toBe(200);
    expect(atCancel).toEqual([`affected/false/-/false|${NONE}`]);
    expect(atSignOut).toEqual(['affected/false/-/false']);
    expect(auth.calls.map((c) => c.op)).toEqual(['readIdentities', 'cancelPassword', 'signOutOthers']);
    expect(await linkState(ctx, account.id)).toBe(`affected/true/${session}/false`);
  });

  it('[F2.0-a c3] the password cannot be cancelled: 503, no "done", the answers are already gone; the next Google request resumes and completes it', T, async () => {
    const auth = fakeAuth({ cancel: 'failed' });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const bearer = await googleBearer(ctx, account);
    const failed = await me(h, bearer);
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('"state"');
    expect(await linkState(ctx, account.id)).toBe('affected/false/-/false');
    expect(await answersJson(ctx, account.id)).toBe(NONE);
    expect(await linkKinds(ctx, account.id)).not.toContain('takeover_cleared');

    auth.script.cancel = 'set';
    const resumed = await me(h, bearer);
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(await linkState(ctx, account.id)).toMatch(/^affected\/true\//);
    expect((await linkKinds(ctx, account.id)).split(',').filter((k) => k === 'takeover_cleared')).toHaveLength(1);
  });

  it('[F2.0-a c3] the other sessions cannot be ended: 503, no "done"; the retry repeats the safe steps and completes', T, async () => {
    const auth = fakeAuth({ signOut: 'failed' });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const bearer = await googleBearer(ctx, account);
    expect((await me(h, bearer)).statusCode).toBe(503);
    expect(await linkState(ctx, account.id)).toBe('affected/false/-/false');
    auth.script.signOut = 'done';
    expect((await me(h, bearer)).statusCode).toBe(200);
    expect(auth.of('cancelPassword').length, 'each step is safe to repeat').toBeGreaterThanOrEqual(2);
    expect(await linkState(ctx, account.id)).toMatch(/^affected\/true\//);
    expect((await linkKinds(ctx, account.id)).split(',').filter((k) => k === 'takeover_cleared')).toHaveLength(1);
  });

  it('[F2.0-a c3] the Auth key missing: 503 before any step (nothing read, nothing recorded, answers kept)', T, async () => {
    const auth = fakeAuth({ configured: false });
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const res = await me(h, await googleBearer(ctx, account));
    expect(res.statusCode).toBe(503);
    expect(auth.calls).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(NONE);
    expect(await answersJson(ctx, account.id)).not.toBe(NONE);
  });

  it('[F2.0-a c3] the pepper missing: 503 before any step', T, async () => {
    const good = await startTakeoverApp(ctx, fakeAuth());
    const account = await affectedAccount(ctx, good);
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth, { keys: () => undefined });
    const res = await me(h, await googleBearer(ctx, account));
    expect(res.statusCode).toBe(503);
    expect(auth.calls).toEqual([]);
    expect(await linkState(ctx, account.id)).toBe(NONE);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c4 DR-O1] fail closed while pending', () => {
  it('[F2.0-a c4] every authenticated endpoint answers 503 for a pending account, whichever session asks, and returns no product data', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    await linkPut(ctx, account.id, 'affected', sessionId());
    const tokens = [await passwordBearer(ctx, account), await passwordBearer(ctx, account, sessionId(), 10), await bareSessionBearer(ctx, account)];
    for (const authorization of tokens) {
      const results = [
        await me(h, authorization),
        await saveAnswers(h, authorization),
        await changeAnswers(h, authorization, VALID_PAIR, [entry('nickname', 'Dana'), entry('pet', 'Rex')]),
        await postPassword(h, 'change', { current: VALID_PAIR, password: 'סיסמה חדשה ארוכה 12345' }, authorization),
        await postPassword(h, 'forced', { password: 'סיסמה חדשה ארוכה 12345' }, authorization),
      ];
      for (const res of results) {
        expect(res.statusCode, res.body).toBe(503);
        expect(res.body).not.toMatch(/recoveryQuestions|"active"|mustSetPassword/);
      }
    }
    expect(auth.of('setPassword')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c5 FR-AUTH-005] once, idempotent', () => {
  it('[F2.0-a c5] a later Google sign-in after "done" runs nothing: no audit row, no Auth call, the state unchanged', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const first = sessionId();
    expect((await me(h, await googleBearer(ctx, account, first))).statusCode).toBe(200);
    const before = await linkKinds(ctx, account.id);
    const callsBefore = auth.calls.length;
    const state = await linkState(ctx, account.id);

    const later = await me(h, await googleBearer(ctx, account, sessionId(), 10));
    expect(later.statusCode, later.body).toBe(200);
    expect(jsonOf(later.body).mustSetPassword, 'only the clearing session is told to set a password').toBe(false);
    expect(auth.calls.length).toBe(callsBefore);
    expect(await linkKinds(ctx, account.id)).toBe(before);
    expect(await linkState(ctx, account.id)).toBe(state);
  });

  it('[F2.0-a c5] two concurrent Google requests of one account produce exactly one clear audit row (five rounds, two connections each)', T, async () => {
    for (let round = 0; round < 5; round += 1) {
      const a1 = fakeAuth({ cancelDelayMs: 150 });
      const a2 = fakeAuth({ cancelDelayMs: 150 });
      const h1 = await startTakeoverApp(ctx, a1);
      const h2 = await startTakeoverApp(ctx, a2);
      const account = await affectedAccount(ctx, h1);
      const s1 = sessionId();
      const s2 = sessionId();
      const [t1, t2] = [await googleBearer(ctx, account, s1), await googleBearer(ctx, account, s2)];

      const [r1, r2] = await Promise.all([me(h1, t1), me(h2, t2)]);
      const codes = [r1.statusCode, r2.statusCode];
      for (const code of codes) expect([200, 401, 503], `round ${round}: ${codes.join(',')}`).toContain(code);
      expect(codes, `round ${round}`).toContain(200);

      const clears = (await linkKinds(ctx, account.id)).split(',').filter((k) => k === 'takeover_cleared');
      expect(clears, `round ${round}`).toHaveLength(1);
      const state = await linkState(ctx, account.id);
      expect([`affected/true/${s1}/false`, `affected/true/${s2}/false`], `round ${round}`).toContain(state);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c6 DR-O2] tokens issued before the clear are refused', () => {
  it('[F2.0-a c6] after "done", an older token of another session gets 401 on every authenticated endpoint; the clearing session and later sessions do not', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const earlier = [
      await passwordBearer(ctx, account, sessionId(), -120),
      await googleBearer(ctx, account, sessionId(), -120),
      await bareSessionBearer(ctx, account),
    ];
    const clearing = sessionId();
    const clearingToken = await googleBearer(ctx, account, clearing);
    expect((await me(h, clearingToken)).statusCode).toBe(200);

    for (const authorization of earlier) {
      const results = [
        await me(h, authorization),
        await saveAnswers(h, authorization),
        await changeAnswers(h, authorization, VALID_PAIR, [entry('nickname', 'Dana'), entry('pet', 'Rex')]),
        await postPassword(h, 'forced', { password: 'סיסמה חדשה ארוכה 12345' }, authorization),
        await postPassword(h, 'change', { current: VALID_PAIR, password: 'סיסמה חדשה ארוכה 12345' }, authorization),
      ];
      for (const res of results) expect(res.statusCode, res.body).toBe(401);
    }
    expect(auth.of('setPassword')).toEqual([]);
    expect((await me(h, clearingToken)).statusCode, 'the clearing session').toBe(200);
    expect((await me(h, await passwordBearer(ctx, account, sessionId(), 10))).statusCode, 'a session issued after the clear').toBe(200);
  });

  it('[F2.0-a c6] the same refusal holds while the password is not yet set (after the clear, before c7)', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const account = await affectedAccount(ctx, h);
    const earlier = await passwordBearer(ctx, account, sessionId(), -120);
    expect((await me(h, await googleBearer(ctx, account))).statusCode).toBe(200);
    expect(await linkState(ctx, account.id)).toMatch(/^affected\/true\/.*\/false$/);
    expect((await me(h, earlier)).statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F2.0-a c9] the unregistered variant', () => {
  it('[F2.0-a c9] an Auth user with no account row and an older email identity: the clear runs (no answers exist), the audit has no user, /api/me stays {state}', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    const session = sessionId();
    const res = await me(h, await googleBearer(ctx, bare, session));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toBe('{"state":"unregistered"}');
    expect(auth.of('cancelPassword')[0]?.input.userId).toBe(bare.id);
    expect(auth.of('signOutOthers')).toHaveLength(1);
    expect(await linkState(ctx, bare.id)).toBe(`affected/true/${session}/false`);
    const handle = handleHex(ctx, bare.email);
    expect(await kinds(ctx, handle)).toContain('takeover_cleared');
    const row = recordsOf(await eventsJson(ctx, handle)).find((r) => r.kind === 'takeover_cleared');
    expect(row?.user_id, 'an unregistered user has no account to attribute the row to').toBeNull();
  });

  it('[F2.0-a c9] there is no forced-password state for it: c7 refuses (409), and the completion step\'s own password is accepted instead (c11)', T, async () => {
    const auth = fakeAuth();
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    const bearer = await googleBearer(ctx, bare);
    await me(h, bearer);
    const forced = await postPassword(h, 'forced', { password: 'סיסמה חדשה ארוכה 12345' }, bearer);
    expect(forced.statusCode, forced.body).toBe(409);
    expect(auth.of('setPassword')).toEqual([]);
    const first = await postPassword(h, 'first', { password: 'סיסמה חדשה ארוכה 12345' }, bearer);
    expect(first.statusCode, first.body).toBe(200);
    expect(auth.of('setPassword')[0]?.input.userId).toBe(bare.id);
  });

  it('[F2.0-a c9] an unregistered Google-first user: no clear', T, async () => {
    const auth = fakeAuth({ identities: GOOGLE_FIRST });
    const h = await startTakeoverApp(ctx, auth);
    const bare = await newBareAuthUser(ctx);
    const res = await me(h, await googleBearer(ctx, bare));
    expect(res.body).toBe('{"state":"unregistered"}');
    expect(auth.of('cancelPassword')).toEqual([]);
    expect(await linkState(ctx, bare.id)).toBe('unaffected/false/-/false');
  });
});
