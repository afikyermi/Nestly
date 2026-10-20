// F1.2 criteria 5, 6, 7, 10, 12: the access decision, from (session state, path) to "render", "loading" or a redirect
// target, tested without a DOM (OP-002, section 4.1). Interface per the coordinator's message:
// decideAccess(state, pathname): { kind: 'loading' } | { kind: 'render' } | { kind: 'redirect'; to: string }.
// The expected table comes from the spec: DR-1 (signed-in, unknown -> /feed), Q2 (route table), Q3 (Guest -> /).
// Paths whose meaning depends on URL normalisation (trailing slash, dot segments, encoding, query) are not asserted
// here: the spec does not define them, and the E2E specs cover the browser-level forms.
// Relative imports, so that the file also runs from the repository root, where the '@' alias is not defined.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decideAccess } from '../../src/app/access';
import { GUEST_PATHS, PROTECTED_PATHS } from '../../src/app/paths';

// F1.4 part c adds three Guest placeholders (interface "part c"): recovery (F1.6) and the two consent-document links (I9).
const GUEST = ['/', '/login', '/register', '/auth/google', '/recovery', '/terms', '/privacy'];
const PROTECTED = ['/home', '/feed', '/profile', '/settings', '/recovery-questions', '/change-password', '/friends', '/posts/new', '/medical-hotlines', '/community-rules', '/notifications', '/search', '/admin', '/admin/reports', '/admin/users', '/admin/audit', '/admin/guides'];
const UNLISTED = [
  '/marketplace',
  '/profile/123',
  '/xyz',
  '/auth',
  '/auth/google/extra',
  '/login/extra',
  '/register/extra',
  '/login2',
  '/feed/extra',
  '/admin-panel',
  '/shop',
  '/groups',
  '/__proto__',
  '/constructor',
  '/toString',
  '/hasOwnProperty',
  '/null',
  '/undefined',
];
// F2.5 c6: signed in, these two Guest paths render (the consent documents are reachable from Settings).
const CONSENT = ['/terms', '/privacy'];
const STATES = ['loading', 'signed-in', 'signed-out', 'signed-in-no-account'] as const;

describe('the route table (6, Q2)', () => {
  it('[F1.2 c6][FR-AUTH-004][F1.4 c4] the Guest allow-list is exactly the seven Guest routes (the four of F1.2 plus /recovery, /terms, /privacy)', () => {
    expect(Array.from(GUEST_PATHS).sort()).toEqual([...GUEST].sort());
  });
  it('[F1.2 c6][FR-AUTH-004] the protected routes are exactly the four protected placeholders plus /recovery-questions (F1.6 c17 c18), /change-password (F2.0 c15) /friends (F2.4b c13) /posts/new (F3.1b), /medical-hotlines (F3.8) /community-rules (F3.7) /notifications, /search and the admin shell with its tabs (reports, users, audit, guides)', () => {
    expect(Array.from(PROTECTED_PATHS).sort()).toEqual([...PROTECTED].sort());
  });
  it('[F3.1b][FR-AUTH-004] one post page, /posts/<uuid>, is protected: a Guest is redirected, a signed-in user renders it', () => {
    const path = '/posts/d0000000-0000-4000-8000-000000000001';
    expect(decideAccess('signed-out', path)).not.toEqual({ kind: 'render' });
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'render' });
  });
  it('[F1.2 c6][FR-AUTH-004] no route is both Guest and protected', () => {
    expect(Array.from(GUEST_PATHS).filter((p) => Array.from(PROTECTED_PATHS).includes(p))).toEqual([]);
  });
});

describe('loading (7)', () => {
  it.each([...GUEST, ...PROTECTED, ...UNLISTED])(
    '[F1.2 c7][FR-AUTH-004] while loading, %s is neither rendered nor redirected',
    (path) => {
      expect(decideAccess('loading', path)).toEqual({ kind: 'loading' });
    },
  );
});

describe('signed-out: a Guest (5, 6, Q3)', () => {
  it.each(GUEST)('[F1.2 c6][FR-AUTH-004] %s renders', (path) => {
    expect(decideAccess('signed-out', path)).toEqual({ kind: 'render' });
  });
  it.each([...PROTECTED, ...UNLISTED])(
    '[F1.2 c5][c6][FR-AUTH-004][AC-016][ERR-012] %s redirects to / (deny by default)',
    (path) => {
      expect(decideAccess('signed-out', path)).toEqual({ kind: 'redirect', to: '/' });
    },
  );
});

describe('signed-in (4, 10, DR-1)', () => {
  it.each(PROTECTED)('[F1.2 c5][FR-AUTH-004] %s renders', (path) => {
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'render' });
  });
  it.each(GUEST.filter((p) => !CONSENT.includes(p)))('[F1.2 c4][FR-AUTH-001][FR-AUTH-002] a signed-in user at the Guest route %s is redirected to /feed', (path) => {
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'redirect', to: '/feed' });
  });
  it.each(CONSENT)('[F2.5 c6][FR-AUTH-004] an active signed-in user can open %s (the consent documents, reachable from Settings)', (path) => {
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'render' });
    expect(decideAccess('signed-in', path, true)).toEqual({ kind: 'render' }); // sessionEnded changes nothing for signed-in
  });
  it.each(['/terms/x', '/privacy/x', '/terms/..', '/Terms', '/privacy2', '/settings/x', '/settings/..', '/terms%2Fx'])(
    '[F2.5 c6][FR-AUTH-004] the neighbour path %s is not opened by the /terms and /privacy rule: signed-in -> /feed, signed-out -> /',
    (path) => {
      expect(decideAccess('signed-in', path)).toEqual({ kind: 'redirect', to: '/feed' });
      expect(decideAccess('signed-out', path)).toEqual({ kind: 'redirect', to: '/' });
    },
  );
  it('[F2.5 c6][FR-AUTH-004] signed-out: /settings goes to Welcome (/), and to /login once the session ended', () => {
    expect(decideAccess('signed-out', '/settings')).toEqual({ kind: 'redirect', to: '/' });
    expect(decideAccess('signed-out', '/settings', true)).toEqual({ kind: 'redirect', to: '/login' });
  });
  it.each(UNLISTED)('[F1.2 c10][FR-AUTH-004][DR-1] a signed-in user on the unknown path %s is redirected to /feed', (path) => {
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'redirect', to: '/feed' });
  });
});

// F1.5 criterion 15 [FR-AUTH-004]: the fourth state "signed in, no account yet" (DR-2) and the session that ended (notice -> /login).
describe('signed-in-no-account: only /register (completion), F1.5 c15 DR-2', () => {
  it.each(['/register', '/terms', '/privacy'])('[F1.5 c15][Amendment 1][FR-AUTH-004] %s renders (completion and the consent documents it links to)', (path) => {
    expect(decideAccess('signed-in-no-account', path)).toEqual({ kind: 'render' });
  });
  it.each([...GUEST.filter((p) => !['/register', '/terms', '/privacy'].includes(p)), ...PROTECTED, ...UNLISTED])(
    '[F1.5 c15][FR-AUTH-004] %s redirects to /register',
    (path) => {
      expect(decideAccess('signed-in-no-account', path)).toEqual({ kind: 'redirect', to: '/register' });
    },
  );
  it('[F1.5 c15] no loop: the redirect target renders for that state', () => {
    for (const path of [...GUEST, ...PROTECTED, ...UNLISTED]) {
      const d = decideAccess('signed-in-no-account', path);
      if (d.kind === 'redirect') expect(decideAccess('signed-in-no-account', d.to)).toEqual({ kind: 'render' });
    }
  });
});

describe('signed-out after a session ended (sessionEnded = true): protected paths go to /login, F1.5 c11 c13 c15', () => {
  it.each([...PROTECTED, ...UNLISTED])('[F1.5 c15][FR-AUTH-004] %s redirects to /login', (path) => {
    expect(decideAccess('signed-out', path, true)).toEqual({ kind: 'redirect', to: '/login' });
  });
  it.each(GUEST)('[F1.5 c15][FR-AUTH-004] the Guest path %s still renders (including /login itself, so no loop)', (path) => {
    expect(decideAccess('signed-out', path, true)).toEqual({ kind: 'render' });
  });
  it('[F1.5 c14] without sessionEnded (a logout) the same paths still go to / (Welcome)', () => {
    for (const path of PROTECTED) expect(decideAccess('signed-out', path, false)).toEqual({ kind: 'redirect', to: '/' });
    for (const path of PROTECTED) expect(decideAccess('signed-out', path)).toEqual({ kind: 'redirect', to: '/' });
  });
  it('[F1.5 c15] sessionEnded changes nothing for loading or signed-in', () => {
    for (const path of [...GUEST, ...PROTECTED, ...UNLISTED]) {
      expect(decideAccess('loading', path, true)).toEqual({ kind: 'loading' });
      expect(decideAccess('signed-in', path, true)).toEqual(decideAccess('signed-in', path));
    }
  });
});

// F1.6 Status line (held state) + Amendment 4: an active account without recovery questions is held on /recovery-questions.
describe('held on the questions screen (F1.6 Status, Amendment 4)', () => {
  it.each(['/recovery-questions', '/terms', '/privacy'])('[F1.6 c17][Amendment 4][FR-AUTH-004] a held user may open %s', (path) => {
    expect(decideAccess('signed-in', path, false, true)).toEqual({ kind: 'render' });
  });
  it.each(['/feed', '/home', '/profile', '/settings', '/change-password', ...GUEST.filter((p) => !['/terms', '/privacy'].includes(p)), ...UNLISTED])(
    '[F1.6 c17][FR-AUTH-004] a held user on %s is sent to /recovery-questions',
    (path) => {
      expect(decideAccess('signed-in', path, false, true)).toEqual({ kind: 'redirect', to: '/recovery-questions' });
    },
  );
  it.each([...GUEST, ...PROTECTED, ...UNLISTED])('[F1.6 c17] the flag false changes nothing for %s', (path) => {
    expect(decideAccess('signed-in', path, false, false)).toEqual(decideAccess('signed-in', path));
  });
  it.each(['loading', 'signed-out', 'signed-in-no-account'] as const)('[F1.6 c17] the flag does not alter the state %s', (state) => {
    for (const path of [...GUEST, ...PROTECTED, ...UNLISTED]) {
      expect(decideAccess(state, path, false, true)).toEqual(decideAccess(state, path));
    }
  });
});

describe('deny by default for an unknown state (F1.5 c15)', () => {
  it.each(['', 'SIGNED-IN', 'admin', 'signed_in', 'undefined'])('[F1.5 c15][FR-AUTH-004] the unknown state "%s" never renders a protected path', (state) => {
    for (const path of PROTECTED) {
      const d: unknown = Reflect.apply(decideAccess, undefined, [state, path]);
      expect(d).not.toEqual({ kind: 'render' });
    }
    for (const bad of [undefined, null, 1, {}]) {
      for (const path of PROTECTED) expect(Reflect.apply(decideAccess, undefined, [bad, path])).not.toEqual({ kind: 'render' });
    }
  });
});

describe('shape and purity (12)', () => {
  it('[F1.2 c12] every state x every listed path returns one of the three kinds, never throws, and is repeatable', () => {
    for (const state of STATES) {
      for (const path of [...GUEST, ...PROTECTED, ...UNLISTED]) {
        const a = decideAccess(state, path);
        const b = decideAccess(state, path);
        expect(b).toEqual(a);
        expect(['loading', 'render', 'redirect']).toContain(a.kind);
        if (a.kind === 'redirect') expect(['/', '/feed', '/register']).toContain(a.to);
      }
    }
  });

  it('[F1.2 c5][c8][FR-AUTH-004] a redirect never leads to a path that redirects again (no loop): the target renders for that state', () => {
    for (const state of ['signed-in', 'signed-out'] as const) {
      for (const path of [...GUEST, ...PROTECTED, ...UNLISTED]) {
        const d = decideAccess(state, path);
        if (d.kind === 'redirect') expect(decideAccess(state, d.to), `${state} ${path} -> ${d.to}`).toEqual({ kind: 'render' });
      }
    }
  });

  it('[F1.2 c5][FR-AUTH-004] a redirect target for a Guest never keeps the requested path', () => {
    for (const path of [...PROTECTED, ...UNLISTED]) {
      const d = decideAccess('signed-out', path);
      expect(d.kind === 'redirect' ? d.to : '').toBe('/');
    }
  });
});
