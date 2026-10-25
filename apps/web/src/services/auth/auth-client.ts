// The Auth client: the one module in the web that imports an auth SDK (F1.4 criterion 22, rule 1). It talks to Supabase
// Auth with the publishable key and nothing else: no database, storage or realtime call, no secret key. The session is kept in
// localStorage under one key, tokens only (F1.5 DR-3): the SDK refreshes the access token before it expires, and the user
// object (with the email) stays in memory. Everything the rest of the web sees is the two ports below, so a test injects a
// fake and no SDK type leaves this file.
import { GoTrueClient } from '@supabase/auth-js';
import { checkUserId } from '@nestly/shared';
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

/** The Google start: the provider's authorize URL to leave for, or why there is none. */
export type GoogleStartResponse = { url: string; failure: null } | { url: null; failure: AuthFailure };

/** The two Google steps (F1.8). The start builds the authorize URL and the web leaves for it; the return exchanges the code. */
export interface GoogleAuthPort {
  /** Builds the Google authorize URL (PKCE, scopes openid and email) for `redirectTo`. The verifier stays in the SDK's storage; nothing is navigated here. */
  startGoogleSignIn(redirectTo: string): Promise<GoogleStartResponse>;
  /**
   * Exchanges the code Google returned for a session, then clears Google's profile keys from the Auth user (DR-5) and, when that
   * worked, renews the session once so the token handed back no longer carries them; a failed clear or renewal changes nothing. A missing verifier, a refused or reused code and a client that is not configured are all the same failure.
   */
  completeGoogleSignIn(code: string): Promise<SignInResponse>;
  /** A return that makes no exchange (cancelled, provider error, no code): removes the PKCE verifier the start left in storage. */
  discardGoogleStart(): void;
  /**
   * The email of the Auth user when the user came in through Google, asked of Auth with the held session (nothing stored); null for
   * any other user. Rejects when Auth could not answer, so a screen never mistakes a failed read for a user without Google. It tells the completion screen whether to ask for a password.
   */
  readGoogleAccount(): Promise<{ email: string } | null>;
  // No password is ever set from the browser (F2.0 D2, S-16): the server sets it (POST /api/password/first and the F2.0 calls).
}

export interface AuthPort {
  /** Registers the email and password with Auth. The password goes to Auth and nowhere else. */
  signUp(credentials: { email: string; password: string }): Promise<SignUpResponse>;
}

/**
 * A password check with Auth that leaves the held session alone (VAL-052, the account deletion): a separate sign-in whose session is kept
 * in memory only. `accessToken` proves a fresh password sign-in to the server; `release` ends that extra session (scope local). Never stored.
 */
export type PasswordCheckResponse =
  | { accessToken: string; failure: null; release: () => Promise<void> }
  | { accessToken: null; failure: AuthFailure };

export interface PasswordCheckPort {
  /** Checks the signed-in user's password with Auth, as a separate sign-in. Rejects when the call never answered. */
  checkPassword(password: string): Promise<PasswordCheckResponse>;
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
  /** The signed-in Auth user's id, asked of Auth with the held session (nothing stored); null when there is none or Auth could not answer. Never rejects. */
  getUserId?(): Promise<string | null>;
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

// DR-5 (F1.8): the keys Google's profile adds to the Auth user's metadata. They are cleared after a Google return and never read,
// shown or sent anywhere; this list is the only place they are named.
const GOOGLE_PROFILE_KEYS = [
  'full_name',
  'name',
  'given_name',
  'family_name',
  'avatar_url',
  'picture',
] as const;

// auth-js writes a PKCE verifier twice: under the fixed key `<storage key>-code-verifier` (read by an exchange whose URL carries no
// flow id, as ours) and in a per-flow slot plus an index that only an exchange with a flow id removes. Ours never has one, so the
// slots would stay in web storage for good. They are dropped on the way in; the fixed key does the work and the exchange removes it.
function withoutVerifierSlots(inner: KeyValueStorage): KeyValueStorage {
  const isSlot = (key: string) => key.startsWith(`${AUTH_STORAGE_KEY}-flow`) && key.endsWith('-code-verifier');
  return {
    getItem: (key) => (isSlot(key) ? null : inner.getItem(key)),
    setItem: (key, value) => {
      if (!isSlot(key)) inner.setItem(key, value);
    },
    removeItem: (key) => {
      inner.removeItem(key);
    },
  };
}

// The Auth client speaks the implicit flow, so a password sign-up leaves no PKCE verifier behind. The Google start and return run the
// PKCE flow: this turns it on for the length of one call and off again.
class NestlyGoTrueClient extends GoTrueClient {
  async withPkce<T>(work: () => Promise<T>): Promise<T> {
    this.flowType = 'pkce';
    try {
      return await work();
    } finally {
      this.flowType = 'implicit';
    }
  }
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

export type BrowserAuthPort = AuthPort & AuthSessionPort & GoogleAuthPort & PasswordCheckPort;

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
  let client: NestlyGoTrueClient | null = null;
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
  function getClient(settings: AuthClientConfig): NestlyGoTrueClient {
    if (client !== null) return client;
    const created = new NestlyGoTrueClient({
      url: `${settings.url}/auth/v1`,
      headers: { apikey: settings.publishableKey },
      storageKey: AUTH_STORAGE_KEY,
      ...(storage !== undefined ? { storage: withoutVerifierSlots(storage), userStorage: memoryStorage() } : {}),
      persistSession: storage !== undefined,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      fetch: observedFetch,
    });
    created.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') {
        // A refresh that worked ends any earlier refusal, so the flag cannot colour an unrelated sign-out later.
        refreshRefused = false;
        emit('refreshed');
      } else if (event === 'SIGNED_OUT') {
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

    async getUserId() {
      if (config === undefined) return null;
      try {
        const { data, error } = await getClient(config).getUser();
        if (error !== null || data.user === null) return null;
        const checked = checkUserId(data.user.id);
        return checked.ok ? checked.userId : null;
      } catch {
        return null;
      }
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

    async checkPassword(password) {
      if (config === undefined) return { accessToken: null, failure: NOT_CONFIGURED };
      // The email is the held session's user (asked of Auth, nothing stored); the check signs in again on a client of its own, in memory,
      // with no refresh, so the held session and its storage do not change.
      const { data: held, error: heldError } = await getClient(config).getUser();
      const email = held.user?.email;
      if (heldError !== null || email === undefined) return { accessToken: null, failure: NO_SESSION };
      const checker = new GoTrueClient({
        url: `${config.url}/auth/v1`,
        headers: { apikey: config.publishableKey },
        storageKey: `${AUTH_STORAGE_KEY}-check`,
        storage: memoryStorage(),
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        ...(seams.fetch !== undefined ? { fetch: seams.fetch } : {}),
      });
      const { data, error } = await checker.signInWithPassword({ email, password });
      if (error !== null) return { accessToken: null, failure: { status: error.status, code: error.code, name: error.name } };
      const accessToken = data.session?.access_token;
      if (accessToken === undefined) return { accessToken: null, failure: NO_SESSION };
      return {
        accessToken,
        failure: null,
        release: async () => {
          try {
            await checker.signOut({ scope: 'local' });
          } catch {
            // Only tidiness: the extra session also ends when the account's sessions end.
          }
        },
      };
    },

    async startGoogleSignIn(redirectTo) {
      if (config === undefined) return { url: null, failure: NOT_CONFIGURED };
      const authClient = getClient(config);
      const { data, error } = await authClient.withPkce(() =>
        authClient.signInWithOAuth({ provider: 'google', options: { redirectTo, scopes: 'openid email', skipBrowserRedirect: true } }),
      );
      if (error !== null) return { url: null, failure: { status: error.status, code: error.code, name: error.name } };
      return { url: data.url, failure: null };
    },

    async completeGoogleSignIn(code) {
      if (config === undefined) return { accessToken: null, failure: NOT_CONFIGURED };
      const authClient = getClient(config);
      const { data, error } = await authClient.withPkce(() => authClient.exchangeCodeForSession(code));
      if (error !== null) return { accessToken: null, failure: { status: error.status, code: error.code, name: error.name } };
      const present = GOOGLE_PROFILE_KEYS.filter((key) => Object.hasOwn(data.user.user_metadata, key));
      if (present.length > 0) {
        try {
          const cleared = await authClient.updateUser({ data: Object.fromEntries(present.map((key) => [key, null])) });
          if (cleared.error === null) {
            // The token issued with the exchange still carries the keys; a renewed one is issued from the cleared user. A refused or
            // failed renewal keeps the session as it is: the sign-in goes on with the first token.
            const renewed = await authClient.refreshSession();
            if (renewed.error === null && renewed.data.session !== null) {
              return { accessToken: renewed.data.session.access_token, failure: null };
            }
          }
        } catch {
          // A clear or renewal that fails does not stop the sign-in and is not shown (DR-5); the keys are never read, so they only wait.
        }
      }
      return { accessToken: data.session.access_token, failure: null };
    },

    discardGoogleStart() {
      storage?.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
    },

    async readGoogleAccount() {
      if (config === undefined) return null;
      const { data, error } = await getClient(config).getUser();
      if (error !== null) throw new Error('The Auth user could not be read.');
      if (data.user === null) return null;
      const email = data.user.email;
      return data.user.app_metadata.provider === 'google' && email !== undefined ? { email } : null;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
