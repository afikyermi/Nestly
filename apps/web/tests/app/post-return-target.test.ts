// @vitest-environment node
// F3.6 criterion 9 (.work/share-link/spec.md) [FR-AUTH-004, NFR-SEC-005]: the returnTo allow-list. After a sign-in the app follows a carried link only
// for `/posts/<uuid>` and the existing profile path `/u/<uuid>`; every hostile or malformed form lands on the signed-in landing (/feed, DR-1).
// Two doors are tested, both from the spec's list: the carried link on the password path (decideAccess on /login for a signed-in user) and the one-shot
// note on the Google path (rememberReturnTarget / takeReturnTarget). Expected values come from the spec only. Relative imports (no '@' alias at the root).
import { describe, expect, it } from 'vitest';
import { decideAccess } from '../../src/app/access';
import { rememberReturnTarget, takeReturnTarget } from '../../src/services/auth/return-target';
import type { ReturnTargetStorage } from '../../src/platform/browser-return-target';

const UUID = 'e0000000-0000-4000-8000-000000000001';
const LANDING = '/feed';
const NOW = 1_800_000_000_000;

const VALID = [`/posts/${UUID}`, `/u/${UUID}`];
const HOSTILE = [
  '//evil.example',
  '//evil.example/posts/' + UUID,
  `https://evil.example/posts/${UUID}`,
  `http://evil.example/u/${UUID}`,
  '/posts/not-a-uuid',
  '/posts/123',
  '/posts/',
  '/posts/new',
  `/posts/${UUID}/../settings`,
  `/posts/${UUID}/extra`,
  `/posts/${UUID}/..`,
  '/posts/../settings',
  '%2F%2Fevil.example',
  `%2Fposts%2F${UUID}`,
  `/posts/${UUID}%2F..%2Fsettings`,
  '\\\\evil.example',
  '/\\evil.example',
  `\\posts\\${UUID}`,
  `/posts/${UUID}\\..\\settings`,
  `/\\/evil.example/posts/${UUID}`,
  `/posts/${UUID}?next=//evil.example`,
  `/posts/${UUID}#//evil.example`,
  `javascript:alert(1)`,
  `data:text/html,<script>1</script>`,
  `/u/not-a-uuid`,
  `/u/${UUID}/../settings`,
  '/settings',
  '/feed',
  '',
  ' ',
  `/posts/${UUID}\n//evil.example`,
  `/posts/${UUID}\u0000`,
  'x'.repeat(5000),
];

describe('[F3.6 c9] the password path: a carried link is followed only if it is a post or profile link', () => {
  it.each(VALID)('[F3.6 c9] %s is followed after signing in', (path) => {
    expect(decideAccess('signed-in', '/login', false, false, false, { returnTo: path })).toEqual({ kind: 'redirect', to: path });
  });

  it.each(HOSTILE)('[F3.6 c9] %j is NOT followed: the signed-in landing', (path) => {
    expect(decideAccess('signed-in', '/login', false, false, false, { returnTo: path })).toEqual({ kind: 'redirect', to: LANDING });
  });

  it('[F3.6 c9] no carried link, or null → the landing', () => {
    expect(decideAccess('signed-in', '/login')).toEqual({ kind: 'redirect', to: LANDING });
    expect(decideAccess('signed-in', '/login', false, false, false, { returnTo: null })).toEqual({ kind: 'redirect', to: LANDING });
  });

  it('[F3.6 c9] the same holds from the registration and welcome doors (every Guest path a signed-in user is sent away from)', () => {
    for (const door of ['/login', '/register', '/']) {
      expect(decideAccess('signed-in', door, false, false, false, { returnTo: '//evil.example' }), door).toEqual({ kind: 'redirect', to: LANDING });
    }
  });

  it('[F3.6 c8] a Guest opening /posts/<uuid> is sent to Login carrying it; /posts/<not-a-uuid> and /posts/new are not carried', () => {
    expect(decideAccess('signed-out', `/posts/${UUID}`)).toEqual({ kind: 'redirect', to: '/login', returnTo: `/posts/${UUID}` });
    for (const path of ['/posts/not-a-uuid', '/posts/new', `/posts/${UUID}/extra`]) {
      const decision = decideAccess('signed-out', path);
      expect('returnTo' in decision, path).toBe(false);
    }
  });

  it('[F3.6 c8] a just-signed-out visitor (F2.4c2 behaviour) is not led back to the post', () => {
    const decision = decideAccess('signed-out', `/posts/${UUID}`, true);
    expect('returnTo' in decision).toBe(false);
    const nonGuest = decideAccess('signed-out', `/posts/${UUID}`, false, false, false, { fromGuest: false });
    expect('returnTo' in nonGuest).toBe(false);
  });
});

/** An in-memory stand-in for the one-shot note. */
function memory(initial: string | null = null): ReturnTargetStorage & { value: () => string | null; writes: number } {
  let held = initial;
  const box = {
    writes: 0,
    value: () => held,
    read: () => held,
    write: (raw: string) => {
      held = raw;
      box.writes += 1;
    },
    remove: () => {
      held = null;
    },
  };
  return box;
}

describe('[F3.6 c9] the Google path: the one-shot note', () => {
  it.each(VALID)('[F3.6 c9] %s is noted and taken once', (path) => {
    const store = memory();
    rememberReturnTarget(store, path, NOW);
    expect(takeReturnTarget(store, NOW + 1000)).toBe(path);
    expect(takeReturnTarget(store, NOW + 1000), 'taken once').toBeNull();
  });

  it.each(HOSTILE)('[F3.6 c9] %j is never written', (path) => {
    const store = memory();
    rememberReturnTarget(store, path, NOW);
    expect(store.writes).toBe(0);
    expect(takeReturnTarget(store, NOW + 1000)).toBeNull();
  });

  it.each(HOSTILE)('[F3.6 c9] a tampered note holding %j is refused when taken, and removed', (path) => {
    const store = memory(JSON.stringify({ path, at: NOW }));
    expect(takeReturnTarget(store, NOW + 1000)).toBeNull();
    expect(store.value()).toBeNull();
  });
});
