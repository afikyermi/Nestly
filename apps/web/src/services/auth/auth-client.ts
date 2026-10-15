// The Auth client: the one module in the web that imports an auth SDK (F1.4 criterion 22, rule 1). It talks to Supabase
// Auth with the publishable key and nothing else: no database, storage or realtime call, no secret key. The session is kept in
// localStorage under one key, tokens only (F1.5 DR-3): the SDK refreshes the access token before it expires, and the user
// object (with the email) stays in memory. Everything the rest of the web sees is the two ports below, so a test injects a
// fake and no SDK type leaves this file.
import { GoTrueClient } from '@supabase/auth-js';
import { isSecretKey } from './secret-key';
import { AUTH_STORAGE_KEY } from './storage-key';

/** What a failed Auth call looks like to the web: only the fields the mapping reads, never the library's message. */
export interface AuthFailure {
  status: number | undefined;
  code: string | undefined;
  name: string | undefined;
}

export type SignUpResponse =
  | { accessToken: string; failure: null }
  | { accessToken: null; failure: AuthFailure };

export type SignInResponse = SignUpResponse;

export interface AuthPort {
  /** Registers the email and password with Auth. The password goes to Auth and nowhere else. */
  signUp(credentials: { email: string; password: string }): Promise<SignUpResponse>;
}

/** What the stored session came to at page load: none there, a usable one, one Auth refused, or Auth could not be reached. */
export type RestoreOutcome = 'none' | 'session' | 'refused' | 'unreachable';

/**
 * What Auth tells the session source on its own: the access token was renewed; this tab's own refresh was refused (the session
 * ended); or the session ended for a cause this tab does not know (e.g. a sign-out in another tab).
 */
export type AuthEvent = 'refreshed' | 'refresh-refused' | 'signed-out';

export interface AuthSessionPort {
  /** Checks the password with Auth. The password goes to Auth and nowhere else. A call that never answers rejects. */
  signIn(credentials: { email: string; password: string }): Promise<SignInResponse>;
  /** Reads the stored session and renews it if it has expired. A corrupt or foreign value is cleared and reads as `none`. */
  restore(): Promise<RestoreOutcome>;
  /** The current access token, renewed first if it has expired; null when there is no session. */
  getAccessToken(): Promise<string | null>;
  /** Ends the session on this device only (scope local) and clears storage whatever Auth answers. Never rejects; false when Auth could not be told. */
  signOut(): Promise<boolean>;
  /** Calls `listener` for what Auth reports by itself. Returns the function that stops it. */
  subscribe(listener: (event: AuthEvent) => void): () => void;
}

// The marker Auth uses for "this email is registered" (its error code); the SDK's own text is never shown.
const ALREADY_REGISTERED: AuthFailure = { status: 422, code: 'user_already_exists', name: 'AuthApiError' };
const NOT_CONFIGURED: AuthFailure = { status: undefined, code: undefined, name: 'AuthNotConfigured' };
const NO_SESSION: AuthFailure = { status: undefined, code: undefined, name: 'AuthNoSession' };

export interface AuthClientConfig {
  /** The project URL, e.g. https://<ref>.supabase.co */
  url: string;
  /** The publishable (anon) key, never a secret key. */
  publishableKey: string;
}

/** The part of web storage the Auth session needs; `localStorage` fits. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What the caller hands in. Without storage the session lives in memory only; without fetch the browser's is used. */
export interface AuthClientSeams {
  keyValueStorage?: KeyValueStorage | undefined;
  fetch?: typeof fetch;
}

/** The two build-time values, from the VITE_-prefixed names; undefined when either is missing or empty. */
function configFromEnvironment(): AuthClientConfig | undefined {
  const url: unknown = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || typeof publishableKey !== 'string') return undefined;
  if (url.trim() === '' || publishableKey.trim() === '') return undefined;
  return { url: url.trim().replace(/\/+$/, ''), publishableKey: publishableKey.trim() };
}

/** The user object stays out of web storage: it carries the email, and the web only ever reads the access token. */
function memoryStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/** True when `raw` is the shape Auth writes: a JSON object with both tokens and an expiry. Anything else is not ours. */
function isStoredSession(raw: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof value !== 'object' || value === null) return false;
  return (
    typeof Reflect.get(value, 'access_token') === 'string' &&
    typeof Reflect.get(value, 'refresh_token') === 'string' &&
    typeof Reflect.get(value, 'expires_at') === 'number'
  );
}

export type BrowserAuthPort = AuthPort & AuthSessionPort;

/** True for an absolute https URL, or http on localhost; anything else could send a password to our own origin or in the clear. */
function isAuthUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
}

// One guard for every way a value enters the client: blank, a relative or insecure URL, or a secret key means "not configured",
// and then no method makes a network call.
function usableConfig(given: AuthClientConfig | undefined): AuthClientConfig | undefined {
  if (given === undefined) return undefined;
  const url = given.url.trim().replace(/\/+$/, '');
  const publishableKey = given.publishableKey.trim();
  if (url === '' || publishableKey === '' || !isAuthUrl(url) || isSecretKey(publishableKey)) return undefined;
  return { url, publishableKey };
}

export function createAuthPort(
  given: AuthClientConfig | undefined = configFromEnvironment(),
  seams: AuthClientSeams = {},
): BrowserAuthPort {
  const config = usableConfig(given);
  const storage = seams.keyValueStorage;
  const listeners = new Set<(event: AuthEvent) => void>();
  let client: GoTrueClient | null = null;
  // Set when Auth answers this tab's own refresh with a 4xx: the SIGNED_OUT that follows is then "refused", not "unknown".
  let refreshRefused = false;

  const observedFetch: typeof fetch = async (input, init) => {
    const response = await (seams.fetch ?? fetch)(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('grant_type=refresh_token') && response.status >= 400 && response.status < 500 && response.status !== 429) {
      refreshRefused = true;
    }
    return response;
  };

  const emit = (event: AuthEvent) => {
    for (const listener of [...listeners]) listener(event);
  };

  // Built on first use, so a visitor who never signs in makes no call and holds no client.
  function getClient(settings: AuthClientConfig): GoTrueClient {
    if (client !== null) return client;
    const created = new GoTrueClient({
      url: `${settings.url}/auth/v1`,
      headers: { apikey: settings.publishableKey },
      storageKey: AUTH_STORAGE_KEY,
      ...(storage !== undefined ? { storage, userStorage: memoryStorage() } : {}),
      persistSession: storage !== undefined,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      fetch: observedFetch,
    });
    created.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') emit('refreshed');
      else if (event === 'SIGNED_OUT') {
        emit(refreshRefused ? 'refresh-refused' : 'signed-out');
        refreshRefused = false;
      }
    });
    client = created;
    return created;
  }

  return {
    async signUp({ email, password }) {
      if (config === undefined) return { accessToken: null, failure: NOT_CONFIGURED };
      const { data, error } = await getClient(config).signUp({ email, password });
      if (error !== null) {
        return { accessToken: null, failure: { status: error.status, code: error.code, name: error.name } };
      }
      // With confirm-email on, Auth answers an existing email with a user that has no identities; read it the same way.
      if (data.user?.identities?.length === 0) return { accessToken: null, failure: ALREADY_REGISTERED };
      const accessToken = data.session?.access_token;
      return accessToken === undefined ? { accessToken: null, failure: NO_SESSION } : { accessToken, failure: null };
    },

    async signIn({ email, password }) {
      if (config === undefined) return { accessToken: null, failure: NOT_CONFIGURED };
      const { data, error } = await getClient(config).signInWithPassword({ email, password });
      if (error !== null) {
        return { accessToken: null, failure: { status: error.status, code: error.code, name: error.name } };
      }
      const accessToken = data.session?.access_token;
      return accessToken === undefined ? { accessToken: null, failure: NO_SESSION } : { accessToken, failure: null };
    },

    async restore() {
      const raw = storage?.getItem(AUTH_STORAGE_KEY) ?? null;
      if (config === undefined || storage === undefined || raw === null) return 'none';
      if (!isStoredSession(raw)) {
        storage.removeItem(AUTH_STORAGE_KEY);
        return 'none';
      }
      const { data, error } = await getClient(config).getSession();
      if (data.session !== null) return 'session';
      if (error !== null && (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500 || error.status === 0)) {
        return 'unreachable';
      }
      storage.removeItem(AUTH_STORAGE_KEY);
      return 'refused';
    },

    async getAccessToken() {
      if (config === undefined) return null;
      const { data } = await getClient(config).getSession();
      return data.session?.access_token ?? null;
    },

    async signOut() {
      let told = false;
      try {
        if (client !== null) told = (await client.signOut({ scope: 'local' })).error === null;
      } catch {
        // Auth could not be reached; the session is still ended on this device below.
        told = false;
      }
      // Auth leaves the stored session in place when its sign-out call fails; this device ends it regardless.
      storage?.removeItem(AUTH_STORAGE_KEY);
      // A refresh already running may save its new session after the removal above. The SDK drops a refresh result when the
      // session was removed meanwhile (its removal counter); reading the session once more and removing the key again is a
      // backstop, so logout wins.
      if (client !== null) {
        try {
          await client.getSession();
        } catch {
          // Only a backstop; whatever it answered, the removal below is what counts.
        }
        storage?.removeItem(AUTH_STORAGE_KEY);
      }
      return told;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
