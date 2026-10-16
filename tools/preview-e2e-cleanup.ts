// The cleanup rules of the `preview-e2e` workflow (.work/preview-e2e/schema.md, DR-E1 option 1, spec criteria 8 and 9 with
// amendment A2): pure decisions and the control flow over an injected client. No I/O and no import of a database driver
// here; tools/preview-e2e-cleanup-cli.ts supplies the real client. Nothing here prints a URL, an email, an id or a
// password: a log line is a count or a fixed phrase.

import { TEST_EMAIL_PATTERN } from '../e2e-preview/support/test-user.ts';

export { TEST_EMAIL_PATTERN };
export const PREVIEW_PROJECT_REF = 'xmihorrkegrdlbhpktny'; // nestly-preview
export const SWEEP_AGE_HOURS = 3; // longer than the job's 20 minute timeout: a concurrent run's users are never swept
export const MAX_VICTIMS = 10; // more candidates than this: delete nothing and fail

/** The eight tables the preflight expects in `nestly`, sorted; an unknown table means this design needs re-review. */
export const EXPECTED_NESTLY_TABLES: readonly string[] = [
  'children',
  'journey_contexts',
  'legal_consents',
  'recovery_answers',
  'recovery_events',
  'recovery_throttles',
  'regular_profiles',
  'users',
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
    throw new Error('GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be numeric');
  }
  return `nestly-e2e-${runId}-${runAttempt}-%`;
}

/** One candidate the database returned: its id and whether it belongs to this run (otherwise it is a leftover). */
export interface Candidate {
  id: string;
  own: boolean;
}

export type Selection = { ok: true; victims: Candidate[] } | { ok: false; reason: string };

/** More than MAX_VICTIMS candidates in total: nothing is selected. Duplicate ids count once. */
export function selectVictims(candidates: readonly Candidate[], cap: number = MAX_VICTIMS): Selection {
  const byId = new Map<string, Candidate>();
  for (const c of candidates) byId.set(c.id, { id: c.id, own: c.own || (byId.get(c.id)?.own ?? false) });
  if (byId.size > cap) {
    return { ok: false, reason: `${byId.size} users match the pattern, more than the cap of ${cap}: nothing was deleted` };
  }
  return { ok: true, victims: [...byId.values()] };
}

// ---- control flow ------------------------------------------------------------------------------------------------------

/** Rows removed by one user's transaction, per table (zero everywhere when the user was already gone). */
export type DeleteCounts = Record<string, number>;

export interface CleanupClient {
  preflight(): Promise<PreflightFacts>;
  /** The database's own answer: this run's users plus users older than SWEEP_AGE_HOURS, both only by the pattern. */
  findCandidates(runId: string, runAttempt: string): Promise<Candidate[]>;
  /** One transaction; throws (after rolling back) on any failure. Resolves with the counts, all zero if already gone. */
  deleteUser(id: string): Promise<DeleteCounts>;
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
  leftovers: number | null;
  tableCounts: DeleteCounts;
}

export interface CleanupInput {
  client: CleanupClient;
  runId: string;
  runAttempt: string;
  log: (line: string) => void;
}

function empty(reason: string): CleanupReport {
  return { ok: false, reason, deletedOwn: 0, deletedSwept: 0, failedUsers: 0, leftovers: null, tableCounts: {} };
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
    return empty('GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be numeric');
  }

  let victims: Candidate[];
  try {
    const decision = decidePreflight(await client.preflight());
    if (!decision.ok) return empty(decision.reason);
    const selection = selectVictims(await client.findCandidates(runId, runAttempt));
    if (!selection.ok) return empty(selection.reason);
    victims = selection.victims;
  } catch (error) {
    return empty(`the database step failed before any delete (code ${errorCode(error)})`);
  }

  const report: CleanupReport = { ok: true, deletedOwn: 0, deletedSwept: 0, failedUsers: 0, leftovers: null, tableCounts: {} };
  for (const victim of victims) {
    try {
      const counts = await client.deleteUser(victim.id);
      const removed = (counts['auth.users'] ?? 0) > 0;
      if (removed) {
        if (victim.own) report.deletedOwn += 1;
        else report.deletedSwept += 1;
      }
      for (const [table, n] of Object.entries(counts)) report.tableCounts[table] = (report.tableCounts[table] ?? 0) + n;
    } catch (error) {
      report.failedUsers += 1;
      log(`a user could not be deleted (${victim.own ? 'this run' : 'leftover'}, code ${errorCode(error)}); its transaction was rolled back`);
    }
  }

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
