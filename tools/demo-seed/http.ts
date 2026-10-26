// The two network clients of the demo seed: the product's API (as a signed-in demo user) and Supabase Auth (sign-up and sign-in with
// the publishable key, exactly what the web's own Auth client does). Both take `fetch` from the caller, so the tests run without a
// network. Nothing here logs a body, a token, an email or a password: a log line names the method, the path and the status.

export type Fetch = (input: string, init: { method: string; headers: Record<string, string>; body?: string | Uint8Array<ArrayBuffer> }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface ApiResult {
  status: number;
  body: unknown;
}

export interface ApiOptions {
  baseUrl: string;
  fetch: Fetch;
  /** The Vercel Deployment Protection bypass, for a Preview only; sent to the base URL's origin and nowhere else. */
  bypassSecret?: string | undefined;
  sleep: (ms: number) => Promise<void>;
  /** Waits before each retry of a 429 / 503 / network failure. */
  retryDelaysMs?: readonly number[];
}

const RETRY_DELAYS_MS = [2000, 5000, 15000] as const;

function parseJson(text: string): unknown {
  if (text === '') return null;
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}

export class Api {
  readonly #options: ApiOptions;

  constructor(options: ApiOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') };
  }

  /** One API call. `body` is JSON unless it is bytes (an image, sent with `contentType`). Retries a 429, a 503 and a network failure. */
  async call(token: string, method: string, path: string, body?: unknown, contentType?: string): Promise<ApiResult> {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (this.#options.bypassSecret !== undefined && this.#options.bypassSecret !== '') headers['x-vercel-protection-bypass'] = this.#options.bypassSecret;
    let payload: string | Uint8Array<ArrayBuffer> | undefined;
    if (body instanceof Uint8Array) {
      payload = new Uint8Array(body);
      headers['content-type'] = contentType ?? 'application/octet-stream';
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const delays = this.#options.retryDelaysMs ?? RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt += 1) {
      let result: ApiResult | null = null;
      try {
        const init = payload === undefined ? { method, headers } : { method, headers, body: payload };
        const response = await this.#options.fetch(`${this.#options.baseUrl}${path}`, init);
        result = { status: response.status, body: parseJson(await response.text()) };
      } catch {
        result = null;
      }
      const retryable = result === null || result.status === 429 || result.status === 503;
      const delay = delays[attempt];
      if (!retryable || delay === undefined) return result ?? { status: 0, body: null };
      await this.#options.sleep(delay);
    }
  }
}

export type AuthOutcome =
  | { ok: true; token: string; userId: string }
  | { ok: false; reason: 'invalid_credentials' | 'already_registered' | 'confirmation_required' | 'refused'; status: number };

export interface AuthOptions {
  /** https://<project ref>.supabase.co */
  supabaseUrl: string;
  publishableKey: string;
  fetch: Fetch;
  /** Waits before each retry of a 429 (Auth limits sign-ups and sign-ins per address); none given: no retry. */
  sleep?: (ms: number) => Promise<void>;
  retryDelaysMs?: readonly number[];
}

const AUTH_RETRY_DELAYS_MS = [30_000, 60_000, 120_000] as const;

function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
}

function sessionOf(body: unknown): { token: string; userId: string } | null {
  const token = field(body, 'access_token');
  const userId = field(field(body, 'user'), 'id');
  return typeof token === 'string' && typeof userId === 'string' ? { token, userId } : null;
}

/** Supabase Auth's REST endpoints, as the web's Auth client calls them (the password goes to Auth and nowhere else). */
export class Auth {
  readonly #options: AuthOptions;

  constructor(options: AuthOptions) {
    this.#options = { ...options, supabaseUrl: options.supabaseUrl.replace(/\/+$/, '') };
  }

  async #post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
    const delays = this.#options.retryDelaysMs ?? AUTH_RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.#options.fetch(`${this.#options.supabaseUrl}/auth/v1${path}`, {
        method: 'POST',
        headers: { apikey: this.#options.publishableKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const answer = { status: response.status, body: parseJson(await response.text()) };
      const delay = delays[attempt];
      if (answer.status !== 429 || this.#options.sleep === undefined || delay === undefined) return answer;
      await this.#options.sleep(delay);
    }
  }

  async signIn(email: string, password: string): Promise<AuthOutcome> {
    const answer = await this.#post('/token?grant_type=password', { email, password });
    const session = sessionOf(answer.body);
    if (answer.status === 200 && session !== null) return { ok: true, ...session };
    if (answer.status === 400) return { ok: false, reason: 'invalid_credentials', status: answer.status };
    return { ok: false, reason: 'refused', status: answer.status };
  }

  async signUp(email: string, password: string): Promise<AuthOutcome> {
    const answer = await this.#post('/signup', { email, password });
    const session = sessionOf(answer.body);
    if (answer.status === 200 && session !== null) return { ok: true, ...session };
    // No session in a 200: the project wants the email confirmed first. The account cannot be used until then.
    if (answer.status === 200) return { ok: false, reason: 'confirmation_required', status: answer.status };
    if (answer.status === 422 && field(answer.body, 'error_code') === 'user_already_exists') {
      return { ok: false, reason: 'already_registered', status: answer.status };
    }
    return { ok: false, reason: 'refused', status: answer.status };
  }
}
