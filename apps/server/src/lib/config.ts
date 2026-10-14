// Server configuration, read from the environment by name only (I1 F1.1 part c, criteria 26-27). No value is ever
// committed: the deployment (Vercel) and CI provide them. Anything missing or unusable is left undefined, and the
// server fails closed on it — protected routes are rejected, `GET /api/health` keeps answering.

/** What a token must satisfy (criterion 23). All three come from Supabase Auth of the target project. */
export interface AuthConfig {
  /** Supabase's JWKS endpoint, `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`. */
  readonly jwksUrl: URL;
  /** The project's issuer, `https://<ref>.supabase.co/auth/v1`. */
  readonly issuer: string;
  /** The audience Supabase sets on a signed-in user's access token. */
  readonly audience: string;
}

export interface ServerConfig {
  readonly auth: AuthConfig | undefined;
  /** The `app_server` connection string (data-model rules 2 and 5). Never another role's. */
  readonly databaseUrl: string | undefined;
  /** One line per variable that is set but unusable. Names only — never a value. */
  readonly issues: readonly string[];
}

export const ENV = {
  jwksUrl: 'SUPABASE_JWKS_URL',
  issuer: 'SUPABASE_JWT_ISSUER',
  audience: 'SUPABASE_JWT_AUDIENCE',
  databaseUrl: 'DATABASE_URL',
} as const;

// The request server connects as app_server only: `app_server` on a direct connection, `app_server.<project ref>`
// through the Supabase pooler. Any other role could bypass or own the policies (platform rule 1), so the server refuses
// to use it.
const APP_SERVER_USER = /^app_server(\.[a-z0-9]+)?$/;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

type Env = Readonly<Record<string, string | undefined>>;

function readValue(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

// The JWKS decides which signatures are trusted, so it is fetched over TLS. Plain http is accepted on a loopback
// host only, where no network sits between the server and the key set (a local Supabase, a local test JWKS).
function parseJwksUrl(raw: string): URL | undefined {
  if (!URL.canParse(raw)) return undefined;
  const url = new URL(raw);
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return url;
  return undefined;
}

function isAppServerUrl(raw: string): boolean {
  if (!URL.canParse(raw)) return false;
  const url = new URL(raw);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return false;
  return APP_SERVER_USER.test(url.username);
}

function readAuth(env: Env, issues: string[]): AuthConfig | undefined {
  const rawJwksUrl = readValue(env, ENV.jwksUrl);
  const issuer = readValue(env, ENV.issuer);
  const audience = readValue(env, ENV.audience);
  if (rawJwksUrl === undefined || issuer === undefined || audience === undefined) return undefined;
  const jwksUrl = parseJwksUrl(rawJwksUrl);
  if (jwksUrl === undefined) {
    issues.push(`${ENV.jwksUrl} is not an https URL (http is accepted on a loopback host only)`);
    return undefined;
  }
  return { jwksUrl, issuer, audience };
}

function readDatabaseUrl(env: Env, issues: string[]): string | undefined {
  const raw = readValue(env, ENV.databaseUrl);
  if (raw === undefined) return undefined;
  if (!isAppServerUrl(raw)) {
    issues.push(`${ENV.databaseUrl} is not a postgres URL for the app_server role`);
    return undefined;
  }
  return raw;
}

export function readConfig(env: Env): ServerConfig {
  const issues: string[] = [];
  const auth = readAuth(env, issues);
  const databaseUrl = readDatabaseUrl(env, issues);
  return { auth, databaseUrl, issues };
}
