// The cleanup rules of the `preview-e2e` workflow (.work/preview-e2e/schema.md, DR-E1 option 1, spec criteria 8 and 9 with
// amendment A2): pure decisions and the control flow over an injected client. No I/O and no import of a database driver
// here; tools/preview-e2e-cleanup-cli.ts supplies the real client. Nothing here prints a URL, an email, an id or a
// password: a log line is a count or a fixed phrase.

import { TEST_EMAIL_PATTERN } from '../e2e-preview/support/test-user.ts';
import { formatTimings, type UserTiming } from './preview-e2e-cleanup-timings.ts';

export { TEST_EMAIL_PATTERN, formatTimings, type UserTiming };
export const PREVIEW_PROJECT_REF = 'xmihorrkegrdlbhpktny'; // nestly-preview
export const SWEEP_AGE_HOURS = 3; // longer than the job's 20 minute timeout: a concurrent run's users are never swept
// Leftovers (not this run's) read per run, oldest first; this run's own users are never capped. 200 because a missed cleanup leaves a
// whole run (up to 80 users) behind, and 10 per run never caught up (nightly 24.10: the step timed out). SWEEP_BUDGET_SECONDS bounds the work.
export const MAX_SWEEP_PER_RUN = 200;
// One user's transaction is about 80 statements: one round trip each, 8-12 s per user (22.10, 23.10), and 8 users at once queued on the
// Audit table lock (25.10). Now pipelined (the CLI): a connection's first user still pays a round trip per statement (prepared once per
// connection), the next ones about four. Two connections at once, each user in its own transaction.
export const DELETE_CONCURRENCY = 2;
// No leftover is started after this many seconds from the first delete (this run's own users always are), so the step ends with its
// counts well inside its timeout; the rest are swept by the next runs.
export const SWEEP_BUDGET_SECONDS = 240;
// SQLSTATEs that two concurrent deletes of related test users (friends, a conversation) can cause: deadlock_detected,
// lock_not_available (lock_timeout) and serialization_failure. Such a user is retried once, alone, after the concurrent pass.
export const RETRY_CODES: readonly string[] = ['40P01', '55P03', '40001'];
// More of this run's own users than this: a wrong pattern, delete nothing and fail. A full run creates 62 (30 per size and 2 staff).
export const MAX_PATTERN_USERS = 80;

/**
 * The ninety-four tables the preflight expects in `nestly`, sorted; an unknown table means this design needs re-review. A part that
 * adds a `nestly` table updates this list and the delete order in the CLI in the same PR (Afik, 17.10.2026).
 */
export const EXPECTED_NESTLY_TABLES: readonly string[] = [
  'account_deletion_events', 'algorithm_configurations', 'assistant_message_counts', 'audit_log', 'auto_hide_scopes', 'birthday_checks', 'chat_blocks', 'chat_reads', 'chat_requests', 'children', 'comments',
  'conversations', 'cycle_entries', 'enforcement_records', 'friend_content_notification_preferences', 'friendships', 'group_access',
  'group_bans', 'group_highlight_configurations', 'group_highlights', 'group_invitations', 'group_join_requests', 'group_member_enforcements', 'group_members',
  'group_notification_preferences', 'group_staff_views', 'group_suggestions', 'groups', 'identity_link_checks', 'journey_contexts',
  'legal_consents', 'marketplace_listings', 'media_assets', 'media_fingerprints', 'media_reviews', 'media_training_candidates',
  'media_training_events', 'media_training_samples', 'messages', 'moderator_invitations', 'moderator_permissions',
  'notification_preferences', 'notifications', 'outreach_requests', 'people_search_counts', 'post_authors', 'post_hides', 'posts',
  'private_group_content_views', 'professional_articles', 'professional_follows', 'professional_profiles', 'professional_reviews',
  'professional_views', 'profile_open_counts', 'profile_photos', 'profile_staff_views', 'promotion_events', 'promotion_monthly_summaries',
  'promotion_payments', 'promotion_plans', 'promotion_settings', 'promotions', 'reaction_owners', 'reactions', 'recovery_answers',
  'recovery_events', 'recovery_throttles', 'regular_names', 'regular_profiles', 'report_auto_hides', 'report_escalations',
  'report_openings', 'report_reasons', 'reported_comment_views', 'reported_message_views', 'reports', 'search_intents', 'security_events',
  'security_limits', 'sponsored_products', 'staff_roles', 'status_guides', 'stories', 'support_messages', 'support_requests',
  'suspected_image_fingerprints', 'system_announcements', 'tracker_events', 'trend_scopes', 'usage_events', 'user_blocks',
  'user_enforcements', 'users',
];

// ---- the URL guard -----------------------------------------------------------------------------------------------------

export type UrlCheck = { ok: true } | { ok: false; reason: string };

const POOLER_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.pooler\.supabase\.com$/;
const ALLOWED_SSLMODES = new Set(['require', 'verify-full']);

/** Same shape as tools/migrate-url-guard.mjs, for the user `postgres.<preview ref>`. A reason never contains the input. */
export function checkCleanupUrl(raw: string | undefined): UrlCheck {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, reason: 'PREVIEW_DB_ADMIN_URL is not set' };
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
  if (user !== `postgres.${PREVIEW_PROJECT_REF}`) {
    return { ok: false, reason: `the URL user is not postgres.${PREVIEW_PROJECT_REF} - wrong project or role` };
  }
  if (password === '') return { ok: false, reason: 'the URL carries no password' };
  if (password.includes('\0')) return { ok: false, reason: 'the URL password contains %00' };
  if (!POOLER_HOST.test(url.hostname)) return { ok: false, reason: 'the URL host is not a single *.pooler.supabase.com host' };
  if (url.port !== '5432') return { ok: false, reason: 'the URL port is not 5432 (session pooler)' };
  for (const [key, value] of url.searchParams) {
    if (key !== 'sslmode') return { ok: false, reason: 'the URL has a query parameter other than sslmode' };
    if (!ALLOWED_SSLMODES.has(value)) return { ok: false, reason: 'the URL sslmode is not require or verify-full' };
  }
  return { ok: true };
}

// ---- the preflight decision --------------------------------------------------------------------------------------------

/** What the in-connection preflight query reads. */
export interface PreflightFacts {
  dbUser: string;
  bypassRls: boolean | null;
  canDeleteAuthUsers: boolean | null;
  nestlyTables: readonly string[];
}

export type Decision = { ok: true } | { ok: false; reason: string };

/** Fail closed: anything but the exact expected facts stops the run before a delete. */
export function decidePreflight(facts: PreflightFacts): Decision {
  if (facts.dbUser !== 'postgres') return { ok: false, reason: 'preflight: the session role is not postgres' };
  if (facts.bypassRls !== true) {
    return { ok: false, reason: 'preflight: postgres has no BYPASSRLS - deletes would remove nothing (MATERIAL CHANGE)' };
  }
  if (facts.canDeleteAuthUsers !== true) return { ok: false, reason: 'preflight: no DELETE on auth.users' };
  const tables = [...facts.nestlyTables].sort();
  const same = tables.length === EXPECTED_NESTLY_TABLES.length && tables.every((t, i) => t === EXPECTED_NESTLY_TABLES[i]);
  if (!same) return { ok: false, reason: 'preflight: the set of nestly tables changed - re-review the cleanup design' };
  return { ok: true };
}

// ---- victim selection --------------------------------------------------------------------------------------------------

const TEST_EMAIL_REGEX = new RegExp(TEST_EMAIL_PATTERN);

/** True only for the reserved shape. The SQL uses the same pattern; this is the in-process twin used by tests and logs. */
export function matchesTestEmail(email: string): boolean {
  return TEST_EMAIL_REGEX.test(email);
}

/** The `like` prefix of this run's users: nestly-e2e-<run>-<attempt>-%. Both parts must be numeric (else it throws). */
export function runEmailPrefix(runId: string, runAttempt: string): string {
  if (!/^[0-9]{1,20}$/.test(runId) || !/^[0-9]{1,3}$/.test(runAttempt)) {
    throw new Error('the run id and attempt must be numeric');
  }
  return `nestly-e2e-${runId}-${runAttempt}-%`;
}

/** One candidate the database returned: its id and whether it belongs to this run (otherwise it is a leftover). */
export interface Candidate {
  id: string;
  own: boolean;
}

export type Selection = { ok: true; victims: Candidate[] } | { ok: false; reason: string };

/**
 * This run's users are always selected. Leftovers (candidates that are not this run's) must arrive oldest first; at most
 * `maxSweep` of them are selected, and they never count toward the cap. Above `maxPattern` of this run's own users
 * nothing is selected. Duplicate ids count once.
 */
export function selectVictims(
  candidates: readonly Candidate[],
  limits: { maxSweep?: number; maxPattern?: number } = {},
): Selection {
  const maxSweep = limits.maxSweep ?? MAX_SWEEP_PER_RUN;
  const maxPattern = limits.maxPattern ?? MAX_PATTERN_USERS;
  const byId = new Map<string, Candidate>();
  for (const c of candidates) byId.set(c.id, { id: c.id, own: c.own || (byId.get(c.id)?.own ?? false) });
  const all = [...byId.values()];
  const own = all.filter((c) => c.own);
  if (own.length > maxPattern) {
    return { ok: false, reason: `${own.length} users of this run match the pattern, more than ${maxPattern}: nothing was deleted` };
  }
  const swept = all.filter((c) => !c.own).slice(0, maxSweep);
  return { ok: true, victims: [...own, ...swept] };
}

// ---- control flow ------------------------------------------------------------------------------------------------------

/** Rows removed by one user's transaction, per table (zero everywhere when the user was already gone). */
export type DeleteCounts = Record<string, number>;

export interface CleanupClient {
  preflight(): Promise<PreflightFacts>;
  /**
   * The database's own answer, only by the pattern: this run's users, plus at most MAX_SWEEP_PER_RUN other users older
   * than SWEEP_AGE_HOURS, oldest first.
   */
  findCandidates(runId: string, runAttempt: string): Promise<{ candidates: Candidate[] }>;
  /** One transaction; throws (after rolling back) on any failure; the counts, all zero if already gone. onAuditLock: the lock's ms. */
  deleteUser(id: string, onAuditLock?: (ms: number) => void): Promise<DeleteCounts>;
  /** Users of this run still matching the pattern. */
  countRunLeftovers(runId: string, runAttempt: string): Promise<number>;
}

export interface CleanupReport {
  ok: boolean;
  /** A fixed phrase naming the stop, when ok is false. */
  reason?: string;
  deletedOwn: number;
  deletedSwept: number;
  failedUsers: number;
  /** Leftovers selected but not started because the time budget ran out; the next runs sweep them (not a failure). */
  deferredSwept: number;
  leftovers: number | null;
  tableCounts: DeleteCounts;
  /** One entry per deleteUser call (a retried user has two), in the order they ended: milliseconds only, never an id. */
  timings: UserTiming[];
}

export interface CleanupInput {
  client: CleanupClient;
  runId: string;
  runAttempt: string;
  log: (line: string) => void;
  /** Deletes running at once (default DELETE_CONCURRENCY). */
  concurrency?: number;
  /** Seconds after which no leftover is started (default SWEEP_BUDGET_SECONDS). */
  budgetSeconds?: number;
  /** Milliseconds clock, injectable for tests (default Date.now). */
  now?: () => number;
}

function empty(reason: string): CleanupReport {
  return { ok: false, reason, deletedOwn: 0, deletedSwept: 0, failedUsers: 0, deferredSwept: 0, leftovers: null, tableCounts: {}, timings: [] };
}

/** Runs `work` over `items` in order, at most `concurrency` at a time. */
async function inPool<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

/** An error's code at most (a Postgres SQLSTATE or a Node code): its message can carry a host, an id or an email. */
export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && /^[0-9A-Za-z_]{3,32}$/.test(code)) return code;
  }
  return 'unknown';
}

export async function runCleanup(input: CleanupInput): Promise<CleanupReport> {
  const { client, runId, runAttempt, log } = input;
  try {
    runEmailPrefix(runId, runAttempt);
  } catch {
    return empty('the run id and attempt must be numeric');
  }

  let victims: Candidate[];
  try {
    const decision = decidePreflight(await client.preflight());
    if (!decision.ok) return empty(decision.reason);
    const found = await client.findCandidates(runId, runAttempt);
    const selection = selectVictims(found.candidates);
    if (!selection.ok) return empty(selection.reason);
    victims = selection.victims;
  } catch (error) {
    return empty(`the database step failed before any delete (code ${errorCode(error)})`);
  }

  const report: CleanupReport = { ok: true, deletedOwn: 0, deletedSwept: 0, failedUsers: 0, deferredSwept: 0, leftovers: null, tableCounts: {}, timings: [] };
  const now = input.now ?? Date.now;
  const started = now();
  const budgetMs = (input.budgetSeconds ?? SWEEP_BUDGET_SECONDS) * 1000;
  // This run's users are always deleted; a leftover only while the budget lasts.
  const mayStart = (victim: Candidate): boolean => victim.own || now() - started < budgetMs;
  const retry: Candidate[] = [];
  const attempt = async (victim: Candidate, last: boolean): Promise<void> => {
    if (!mayStart(victim)) {
      report.deferredSwept += 1;
      return;
    }
    const began = now();
    let auditLockMs: number | null = null;
    const timed = (ok: boolean): void => {
      report.timings.push({ own: victim.own, ok, transactionMs: now() - began, auditLockMs });
    };
    try {
      const counts = await client.deleteUser(victim.id, (lockMs) => {
        auditLockMs = lockMs;
      });
      timed(true);
      const removed = (counts['auth.users'] ?? 0) > 0;
      if (removed) {
        if (victim.own) report.deletedOwn += 1;
        else report.deletedSwept += 1;
      }
      for (const [table, n] of Object.entries(counts)) report.tableCounts[table] = (report.tableCounts[table] ?? 0) + n;
    } catch (error) {
      timed(false);
      const code = errorCode(error);
      if (!last && RETRY_CODES.includes(code)) {
        retry.push(victim);
        return;
      }
      report.failedUsers += 1;
      log(`a user could not be deleted (${victim.own ? 'this run' : 'leftover'}, code ${code}); its transaction was rolled back`);
    }
  };
  // This run's users first in the queue, then the leftovers oldest first; each user is still one transaction.
  await inPool(victims, input.concurrency ?? DELETE_CONCURRENCY, (victim) => attempt(victim, false));
  if (retry.length > 0) log(`${retry.length} user(s) met a concurrent delete and were retried one at a time`);
  for (const victim of retry) await attempt(victim, true);

  try {
    report.leftovers = await client.countRunLeftovers(runId, runAttempt);
  } catch (error) {
    report.ok = false;
    report.reason = `the final count failed (code ${errorCode(error)})`;
  }
  if (report.failedUsers > 0) {
    report.ok = false;
    report.reason ??= `${report.failedUsers} user(s) could not be deleted`;
  }
  if (report.leftovers !== null && report.leftovers > 0) {
    report.ok = false;
    report.reason ??= `${report.leftovers} user(s) of this run remain`;
  }
  return report;
}

// ---- the manual mode (workflow_dispatch, Afik 17.10.2026 "Preview cleanup" (c); `backlog` removed, audit B1) ----------------------------------------

export type CleanupMode = 'run' | 'dry-run';
export type ModeCheck = { ok: true; mode: CleanupMode } | { ok: false; reason: string };

/**
 * workflow_run (or no event) is the per-run cleanup and must carry no mode. workflow_dispatch must name dry-run.
 * Anything else stops before a connection.
 */
export function parseMode(eventName: string | undefined, rawMode: string | undefined): ModeCheck {
  const mode = rawMode ?? '';
  if (eventName === 'workflow_dispatch') {
    if (mode === 'dry-run') return { ok: true, mode };
    return { ok: false, reason: 'a manual run needs mode dry-run' };
  }
  if (mode !== '') return { ok: false, reason: 'a mode is allowed only on a manual (workflow_dispatch) run' };
  return { ok: true, mode: 'run' };
}

/** One user matching the pattern, as the database returned it; the email stays in memory and is never logged. */
export interface PatternUser {
  id: string;
  email: string;
  /** now() - created_at, measured by the database; null when created_at is null. */
  ageSeconds: number | null;
}

export interface BacklogSummary {
  patternTotal: number;
  /** Pattern users older than SWEEP_AGE_HOURS. */
  eligible: number;
  /** Age of the oldest and the newest pattern user, hours, one decimal; null when there is none. */
  oldestHours: number | null;
  newestHours: number | null;
}

const isOld = (u: PatternUser, ageHours: number): boolean =>
  typeof u.ageSeconds === 'number' && Number.isFinite(u.ageSeconds) && u.ageSeconds > ageHours * 3600;

function onlyPattern(users: readonly PatternUser[]): PatternUser[] {
  const byId = new Map<string, PatternUser>();
  for (const u of users) if (matchesTestEmail(u.email) && !byId.has(u.id)) byId.set(u.id, u);
  return [...byId.values()];
}

/** Counts and the age range only: no email, no id. */
export function summarizeBacklog(users: readonly PatternUser[], ageHours: number = SWEEP_AGE_HOURS): BacklogSummary {
  const matching = onlyPattern(users);
  const ages = matching.map((u) => u.ageSeconds).filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
  const hours = (s: number): number => Math.round(s / 360) / 10;
  return {
    patternTotal: matching.length,
    eligible: matching.filter((u) => isOld(u, ageHours)).length,
    oldestHours: ages.length > 0 ? hours(Math.max(...ages)) : null,
    newestHours: ages.length > 0 ? hours(Math.min(...ages)) : null,
  };
}

export interface BacklogClient {
  preflight(): Promise<PreflightFacts>;
  /** Every auth user whose email matches TEST_EMAIL_PATTERN (by the database's own `~`), any age. */
  listPatternUsers(): Promise<PatternUser[]>;
}

export interface BacklogReport {
  ok: boolean;
  reason?: string;
  mode: 'dry-run';
  summary: BacklogSummary | null;
}

/** The manual dry-run: preflight, then counts and the age range of the pattern users. Deletes nothing. */
export async function runBacklog(input: { client: BacklogClient; mode: 'dry-run' }): Promise<BacklogReport> {
  const { client, mode } = input;
  const report: BacklogReport = { ok: true, mode, summary: null };
  try {
    const decision = decidePreflight(await client.preflight());
    if (!decision.ok) return { ...report, ok: false, reason: decision.reason };
    report.summary = summarizeBacklog(await client.listPatternUsers());
  } catch (error) {
    return { ...report, ok: false, reason: `the database step failed before any delete (code ${errorCode(error)})` };
  }
  return report;
}
