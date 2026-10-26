// The role walk after a seed (docs/lecturer-demo-plan-HE.md §2 stage ד: every route in every role before production): each demo
// persona signs in and reads the screens it opens first, through the same API the web calls. Read only: GET requests, no sign-up.
// A line per screen names the persona key, the path, the status, the time and how many items the first list held; never a text,
// an email, a token or an id. Any status other than 200 fails the walk, and so does a list that the seed should have filled but is empty.
import type { DemoAccount } from './accounts.ts';
import type { Api, Auth } from './http.ts';

export type PersonaKind = 'regular' | 'professional';

export interface Screen {
  path: string;
  /** The seed always leaves something here for every persona of this kind (an empty list is a failure). */
  filled?: boolean;
}

/** The screens each kind opens first (the bottom navigation and the menu). */
export const SCREENS: Readonly<Record<PersonaKind, readonly Screen[]>> = {
  regular: [
    { path: '/api/profile' },
    { path: '/api/home' },
    { path: '/api/feed', filled: true },
    { path: '/api/groups' },
    { path: '/api/notifications' },
    { path: '/api/friends' },
    { path: '/api/chat' },
    { path: '/api/marketplace/listings', filled: true },
    { path: '/api/professionals', filled: true },
  ],
  professional: [
    { path: '/api/profile' },
    { path: '/api/professional/home' },
    { path: '/api/feed', filled: true },
    { path: '/api/notifications' },
    { path: '/api/chat' },
    { path: '/api/outreach' },
    { path: '/api/marketplace/listings', filled: true },
  ],
};

/** The length of the first array among the body's top-level fields (or the body itself); null when there is none. */
export function firstListLength(body: unknown): number | null {
  if (Array.isArray(body)) return body.length;
  if (typeof body !== 'object' || body === null) return null;
  for (const value of Object.values(body)) if (Array.isArray(value)) return value.length;
  return null;
}

export interface WalkDeps {
  api: Api;
  auth: Auth;
  accounts: Map<string, DemoAccount>;
  personas: readonly { key: string; kind: PersonaKind }[];
  log: (line: string) => void;
  now?: () => number;
}

export async function walk(deps: WalkDeps): Promise<{ screens: number; failed: string[] }> {
  const now = deps.now ?? (() => Date.now());
  const failed: string[] = [];
  let screens = 0;
  for (const persona of deps.personas) {
    const account = deps.accounts.get(persona.key);
    if (account === undefined) {
      failed.push(`${persona.key}: no demo account`);
      continue;
    }
    const session = await deps.auth.signIn(account.email, account.password);
    if (!session.ok) {
      failed.push(`${persona.key}: sign-in ${session.reason} (HTTP ${session.status})`);
      continue;
    }
    for (const screen of SCREENS[persona.kind]) {
      const started = now();
      const result = await deps.api.call(session.token, 'GET', screen.path);
      const ms = Math.round(now() - started);
      const count = firstListLength(result.body);
      screens += 1;
      deps.log(`walk ${persona.key} ${screen.path} ${result.status} ${ms}ms ${count === null ? '-' : `${count} items`}`);
      if (result.status !== 200) failed.push(`${persona.key} ${screen.path}: HTTP ${result.status}`);
      else if (screen.filled === true && count === 0) failed.push(`${persona.key} ${screen.path}: empty`);
    }
  }
  return { screens, failed };
}
