// Where the demo seed may write: a Preview deployment of the nestly project (its Supabase project nestly-preview) or the production site
// (nestly-prod). Pure; a reason names what was expected and never contains the input.
import { checkDeploymentUrl } from '../preview-e2e-url-check.ts';

export type Target = 'preview' | 'production';

/** The Supabase project of each target (tools/migrate-url-guard.mjs, PROJECT_REFS). */
export const PROJECT_REFS: Readonly<Record<Target, string>> = { preview: 'xmihorrkegrdlbhpktny', production: 'cihugbwafnaujsqabgyp' };
export const PRODUCTION_URL = 'https://nestly-blue.vercel.app';

export type TargetCheck = { ok: true; baseUrl: string; supabaseUrl: string } | { ok: false; reason: string };

export function checkTarget(target: Target, baseUrl: string | undefined): TargetCheck {
  const supabaseUrl = `https://${PROJECT_REFS[target]}.supabase.co`;
  if (target === 'production') {
    if (baseUrl !== undefined && baseUrl !== '' && baseUrl.replace(/\/$/, '') !== PRODUCTION_URL) {
      return { ok: false, reason: `the production base URL is ${PRODUCTION_URL}` };
    }
    return { ok: true, baseUrl: PRODUCTION_URL, supabaseUrl };
  }
  const checked = checkDeploymentUrl(baseUrl);
  return checked.ok ? { ok: true, baseUrl: checked.base, supabaseUrl } : { ok: false, reason: checked.reason };
}

const POOLER_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.pooler\.supabase\.com$/;

/**
 * The shift's database URL: the `postgres` role of the target's own project through the session pooler (port 5432), TLS required. Same
 * rules as tools/preview-e2e-cleanup.ts checkCleanupUrl, for either project. A reason never contains the input.
 */
export function checkAdminUrl(target: Target, raw: string | undefined): { ok: true } | { ok: false; reason: string } {
  if (raw === undefined || raw.trim() === '') return { ok: false, reason: 'DEMO_DB_ADMIN_URL is not set' };
  if (!/^postgres(ql)?:\/\//.test(raw)) return { ok: false, reason: 'the secret is not a postgresql:// URL' };
  if (raw.includes('#')) return { ok: false, reason: 'the URL contains "#" (percent-encode it as %23 in the password)' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'the secret is not a valid URL' };
  }
  let user: string;
  let password: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    return { ok: false, reason: 'the URL user or password is not valid percent-encoding' };
  }
  if (user !== `postgres.${PROJECT_REFS[target]}`) return { ok: false, reason: `the URL user is not postgres.${PROJECT_REFS[target]} - wrong project or role` };
  if (password === '' || password.includes('\0')) return { ok: false, reason: 'the URL password is empty or contains %00' };
  if (!POOLER_HOST.test(url.hostname)) return { ok: false, reason: 'the URL host is not a single *.pooler.supabase.com host' };
  if (url.port !== '5432') return { ok: false, reason: 'the URL port is not 5432 (session pooler)' };
  for (const [key, value] of url.searchParams) {
    if (key !== 'sslmode' || !['require', 'verify-full'].includes(value)) return { ok: false, reason: 'the URL may carry sslmode=require or verify-full only' };
  }
  return { ok: true };
}
