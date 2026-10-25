// Whether the web app reports errors, and how (SRS §12 "Error monitoring"). Only a build with VITE_SENTRY_DSN reports (Vercel
// Production and Preview); a local, test or e2e build has none, and Sentry is then never loaded.

export interface BrowserMonitorConfig {
  readonly dsn: string;
  readonly environment: string;
  readonly release?: string;
}

/**
 * The build's public variables (`import.meta.env`): VITE_SENTRY_DSN, and VITE_DEPLOY_ENV / VITE_DEPLOY_RELEASE, Vercel's environment
 * name and the deployed commit, set at build time (vite.config.ts).
 */
export type MonitorEnv = Readonly<Record<string, unknown>>;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function monitorConfig(env: MonitorEnv): BrowserMonitorConfig | undefined {
  const dsn = text(env.VITE_SENTRY_DSN);
  if (!dsn) return undefined;
  const release = text(env.VITE_DEPLOY_RELEASE);
  return { dsn, environment: text(env.VITE_DEPLOY_ENV) || 'development', ...(release ? { release } : {}) };
}
