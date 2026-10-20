// The background job's configuration (I5; Afik 20.10.2026, decisions-in-force.md §7). Read from the environment by name only, and only by
// the job (src/jobs/, api/jobs.ts): the request server never reads these names (tests/credentials.static.test.ts).
//   APP_MEDIA_JOBS_DATABASE_URL   the app_media_jobs role's connection string (data-model rule 6, bootstrap step 1): NOBYPASSRLS; every
//                                 reach is a TO app_media_jobs policy with column grants.
//   CRON_SECRET             the job's bearer secret: Vercel cron sends it, and so does the upload route's call (media/job-kick.ts).
//   MEDIA_CHECK_BLOCK_THRESHOLD, MEDIA_CHECK_LOW_THRESHOLD, MEDIA_CHECK_MAX_ATTEMPTS   optional; defaults in @nestly/shared.
// The training set's retention is not configuration: the database keeps a sample exactly 6 months (Afik 20.10.2026; a CHECK).

import { MEDIA_CHECK_DEFAULTS } from '@nestly/shared';

const MEDIA_JOBS_USER = /^app_media_jobs(\.[a-z0-9]+)?$/;

export interface JobsConfig {
  readonly databaseUrl: string | undefined;
  readonly secret: string | undefined;
  readonly blockThreshold: number;
  readonly lowThreshold: number;
  readonly maxAttempts: number;
}

type Env = Readonly<Record<string, string | undefined>>;

function numberIn(raw: string | undefined, min: number, max: number, fallback: number): number {
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

/** The job's settings; a connection string for any other role than app_media_jobs is not used (the job then refuses to run). */
export function readJobsConfig(env: Env = process.env): JobsConfig {
  const raw = env['APP_MEDIA_JOBS_DATABASE_URL']?.trim();
  let databaseUrl: string | undefined;
  if (raw !== undefined && URL.canParse(raw)) {
    const url = new URL(raw);
    if ((url.protocol === 'postgres:' || url.protocol === 'postgresql:') && MEDIA_JOBS_USER.test(url.username)) databaseUrl = raw;
  }
  const secret = env['CRON_SECRET']?.trim();
  const blockThreshold = numberIn(env['MEDIA_CHECK_BLOCK_THRESHOLD'], 0.05, 1, MEDIA_CHECK_DEFAULTS.blockThreshold);
  const lowThreshold = Math.min(blockThreshold, numberIn(env['MEDIA_CHECK_LOW_THRESHOLD'], 0.01, 1, MEDIA_CHECK_DEFAULTS.lowThreshold));
  return {
    databaseUrl,
    secret: secret === undefined || secret.length < 16 ? undefined : secret,
    blockThreshold,
    lowThreshold,
    maxAttempts: Math.round(numberIn(env['MEDIA_CHECK_MAX_ATTEMPTS'], 1, 20, MEDIA_CHECK_DEFAULTS.maxAttempts)),
  };
}
