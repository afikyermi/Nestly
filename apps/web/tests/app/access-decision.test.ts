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
const PROTECTED = ['/home', '/feed', '/profile', '/settings'];
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
  '/admin',
  '/shop',
  '/groups',
  '/__proto__',
  '/constructor',
  '/toString',
  '/hasOwnProperty',
  '/null',
  '/undefined',
];
const STATES = ['loading', 'signed-in', 'signed-out'] as const;

describe('the route table (6, Q2)', () => {
  it('[F1.2 c6][FR-AUTH-004][F1.4 c4] the Guest allow-list is exactly the seven Guest routes (the four of F1.2 plus /recovery, /terms, /privacy)', () => {
    expect(Array.from(GUEST_PATHS).sort()).toEqual([...GUEST].sort());
  });
  it('[F1.2 c6][FR-AUTH-004] the protected routes are exactly the four protected placeholders', () => {
    expect(Array.from(PROTECTED_PATHS).sort()).toEqual([...PROTECTED].sort());
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
  it.each(GUEST)('[F1.2 c4][FR-AUTH-001][FR-AUTH-002] a signed-in user at the Guest route %s is redirected to /feed', (path) => {
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'redirect', to: '/feed' });
  });
  it.each(UNLISTED)('[F1.2 c10][FR-AUTH-004][DR-1] a signed-in user on the unknown path %s is redirected to /feed', (path) => {
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'redirect', to: '/feed' });
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
        if (a.kind === 'redirect') expect(['/', '/feed']).toContain(a.to);
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
