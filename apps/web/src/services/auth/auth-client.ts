// The Auth client: the one module in the web that imports an auth SDK (F1.4 criterion 22, rule 1). It talks to Supabase
// Auth with the publishable key and nothing else: no database, storage or realtime call, no secret key. The session lives
// in memory (Q7): nothing is persisted, nothing is read from the URL, no timer refreshes the token. Everything the rest
// of the web sees is the port below, so a test injects a fake and no SDK type leaves this file.
import { GoTrueClient } from '@supabase/auth-js';
import { isSecretKey } from './secret-key';

/** What a failed Auth call looks like to the web: only the fields the mapping reads, never the library's message. */
export interface AuthFailure {
  status: number | undefined;
  code: string | undefined;
  name: string | undefined;
}

export type SignUpResponse =
  | { accessToken: string; failure: null }
  | { accessToken: null; failure: AuthFailure };

export interface AuthPort {
  /** Registers the email and password with Auth. The password goes to Auth and nowhere else. */
  signUp(credentials: { email: string; password: string }): Promise<SignUpResponse>;
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

/** The two build-time values, from the VITE_-prefixed names; undefined when either is missing or empty. */
function configFromEnvironment(): AuthClientConfig | undefined {
  const url: unknown = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || typeof publishableKey !== 'string') return undefined;
  if (url.trim() === '' || publishableKey.trim() === '') return undefined;
  if (isSecretKey(publishableKey)) return undefined; // never start a client with a secret key
  return { url: url.trim().replace(/\/+$/, ''), publishableKey: publishableKey.trim() };
}

export function createAuthPort(config: AuthClientConfig | undefined = configFromEnvironment()): AuthPort {
  let client: GoTrueClient | null = null;

  // Built on the first sign-up, so opening the registration screen makes no call and holds no client.
  function getClient(settings: AuthClientConfig): GoTrueClient {
    client ??= new GoTrueClient({
      url: `${settings.url}/auth/v1`,
      headers: { apikey: settings.publishableKey },
      // persistSession false = the SDK keeps the session in its own memory (no localStorage, no cookie, no cross-tab
      // channel); no refresh timer (Q7); no session read from the address bar.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
    return client;
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
  };
}
