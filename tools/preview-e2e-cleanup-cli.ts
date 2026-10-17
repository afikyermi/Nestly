// Cleanup CLI of the `preview-e2e` workflow (.work/preview-e2e/schema.md, DR-E1 option 1).
//
//   node tools/preview-e2e-cleanup-cli.ts
//
// Modes (parseMode): on workflow_run, the per-run cleanup below. On workflow_dispatch, CLEANUP_MODE = dry-run (the preflight,
// then the count of pattern users and their age range; nothing deleted) or backlog (the same, then at most 50 of the oldest
// pattern users older than SWEEP_AGE_HOURS, each in the same one-user transaction) - Afik 17.10.2026, "Preview cleanup" (c).
//
// Reads PREVIEW_DB_ADMIN_URL (postgres@nestly-preview through the session pooler), TARGET_RUN_ID and TARGET_RUN_ATTEMPT (the
// run being cleaned up: workflow_run's id and attempt) from the environment. The URL is checked before anything connects.
// The credential bypasses RLS: it is read in this one step of the preview-e2e-cleanup workflow (main's code, run on
// workflow_run) and nowhere else (data-model.md, Approved exceptions). It never prints the URL, an email, an id or a
// password; it prints counts. Exit 0 only when every user is gone and none of this run remains.

import { appendFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  SWEEP_AGE_HOURS,
  TEST_EMAIL_PATTERN,
  checkCleanupUrl,
  errorCode,
  parseMode,
  runBacklog,
  runCleanup,
  runEmailPrefix,
  type BacklogClient,
  type BacklogReport,
  type Candidate,
  type CleanupClient,
  type CleanupReport,
  type DeleteCounts,
  type PatternUser,
} from './preview-e2e-cleanup.ts';

function line(text: string): void {
  process.stdout.write(`${text}\n`);
}

function stop(reason: string): never {
  process.stdout.write(`::error::preview-e2e-cleanup: ${reason}\n`);
  process.exit(1);
}

/** Real client: one session, max one connection. Statements are the ones in schema.md, leaf first. */
function createClient(url: string): { client: CleanupClient & BacklogClient; close: () => Promise<void> } {
  const sql = postgres(url, { max: 1, ssl: 'require', onnotice: () => undefined, connect_timeout: 20, idle_timeout: 5 });
  const client: CleanupClient & BacklogClient = {
    async preflight() {
      const rows = await sql<{ db_user: string; bypassrls: boolean | null; can_delete: boolean | null; tables: string[] }[]>`
        select current_user::text as db_user,
               (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls,
               has_table_privilege('auth.users', 'DELETE') as can_delete,
               (select coalesce(array_agg(c.relname::text order by c.relname::text), '{}')
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'nestly' and c.relkind in ('r', 'p')) as tables`;
      const row = rows[0];
      if (!row) throw new Error('no preflight row');
      return { dbUser: row.db_user, bypassRls: row.bypassrls, canDeleteAuthUsers: row.can_delete, nestlyTables: row.tables };
    },
    async findCandidates(runId, runAttempt) {
      const prefix = runEmailPrefix(runId, runAttempt);
      const rows = await sql<{ id: string; own: boolean }[]>`
        select id::text as id, (email like ${prefix}) as own
          from auth.users
         where email ~ ${TEST_EMAIL_PATTERN}
           and (email like ${prefix} or created_at < now() - make_interval(hours => ${SWEEP_AGE_HOURS}))
         order by created_at asc, id asc`;
      const total = await sql<{ n: number }[]>`select count(*)::int as n from auth.users where email ~ ${TEST_EMAIL_PATTERN}`;
      const candidates: Candidate[] = rows.map((r) => ({ id: r.id, own: r.own }));
      return { candidates, patternTotal: total[0]?.n ?? Number.NaN };
    },
    async deleteUser(id): Promise<DeleteCounts> {
      return sql.begin(async (tx) => {
        await tx`set local row_security = off`;
        await tx`set local lock_timeout = '5s'`;
        await tx`set local statement_timeout = '30s'`;
        const locked = await tx`select id from auth.users where id = ${id} and email ~ ${TEST_EMAIL_PATTERN} for update`;
        const counts: DeleteCounts = {};
        if (locked.length === 0) return counts; // already gone, or no longer matches: nothing to do
        counts['recovery_throttles'] = (
          await tx`delete from nestly.recovery_throttles t using nestly.recovery_answers a
                    where a.user_id = ${id} and t.subject_kind = 'handle' and t.subject_hash = a.email_handle`
        ).count;
        counts['recovery_events'] = (await tx`delete from nestly.recovery_events where user_id = ${id}`).count;
        counts['legal_consents'] = (await tx`delete from nestly.legal_consents where user_id = ${id}`).count;
        counts['recovery_answers'] = (await tx`delete from nestly.recovery_answers where user_id = ${id}`).count;
        counts['children'] = (await tx`delete from nestly.children where user_id = ${id}`).count;
        counts['journey_contexts'] = (await tx`delete from nestly.journey_contexts where user_id = ${id}`).count;
        counts['friendships'] = (
          await tx`delete from nestly.friendships where requester_id = ${id} or addressee_id = ${id}`
        ).count;
        counts['regular_names'] = (await tx`delete from nestly.regular_names where user_id = ${id}`).count;
        counts['regular_profiles'] = (await tx`delete from nestly.regular_profiles where user_id = ${id}`).count;
        counts['identity_link_checks'] = (await tx`delete from nestly.identity_link_checks where user_id = ${id}`).count;
        counts['users'] = (await tx`delete from nestly.users where id = ${id}`).count;
        const authDeleted = (await tx`delete from auth.users where id = ${id} and email ~ ${TEST_EMAIL_PATTERN}`).count;
        if (authDeleted !== 1) throw new Error('auth.users delete was not exactly one row'); // rolls the transaction back
        counts['auth.users'] = authDeleted;
        return counts;
      });
    },
    async listPatternUsers(): Promise<PatternUser[]> {
      const rows = await sql<{ id: string; email: string; age_seconds: number | null }[]>`
        select id::text as id, email::text as email, extract(epoch from (now() - created_at))::float8 as age_seconds
          from auth.users
         where email ~ ${TEST_EMAIL_PATTERN}
         order by created_at asc, id asc`;
      return rows.map((r) => ({ id: r.id, email: r.email, ageSeconds: r.age_seconds }));
    },
    async countRunLeftovers(runId, runAttempt) {
      const prefix = runEmailPrefix(runId, runAttempt);
      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from auth.users where email ~ ${TEST_EMAIL_PATTERN} and email like ${prefix}`;
      return rows[0]?.n ?? 0;
    },
  };
  return { client, close: () => sql.end({ timeout: 5 }) };
}

/** The cleanup job's own step summary: counts only. */
function writeSummary(report: CleanupReport): void {
  const file = process.env['GITHUB_STEP_SUMMARY'];
  if (file === undefined || file === '') return;
  const text = [
    `preview-e2e-cleanup: ${report.ok ? 'OK' : 'FAILED'}`,
    `- deleted ${report.deletedOwn} user(s) of the run and ${report.deletedSwept} leftover(s)`,
    `- ${report.failedUsers} failed; the run's remaining: ${report.leftovers ?? 'unknown'}`,
    ...(report.ok ? [] : [`- ${report.reason ?? 'cleanup failed'}`]),
    '',
  ].join('\n');
  appendFileSync(file, text);
}

/** The manual run's step summary and log: counts and ages only. */
function reportBacklog(report: BacklogReport): void {
  const s = report.summary;
  const range = s === null || s.oldestHours === null ? 'none' : `${s.newestHours} h to ${s.oldestHours} h old`;
  const lines = [
    `preview-e2e-cleanup ${report.mode}: ${report.ok ? 'OK' : 'FAILED'}`,
    `- pattern users: ${s?.patternTotal ?? 'unknown'}; older than ${SWEEP_AGE_HOURS} h: ${s?.eligible ?? 'unknown'}; ages: ${range}`,
    `- selected ${report.selected}, deleted ${report.deleted}, ${report.failedUsers} failed`,
    ...(report.ok ? [] : [`- ${report.reason ?? 'cleanup failed'}`]),
  ];
  for (const l of lines) line(l);
  const rows = Object.entries(report.tableCounts).map(([table, n]) => `${table}=${n}`).join(' ');
  if (rows !== '') line(`preview-e2e-cleanup: rows removed: ${rows}`);
  const file = process.env['GITHUB_STEP_SUMMARY'];
  if (file !== undefined && file !== '') appendFileSync(file, `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const mode = parseMode(process.env['GITHUB_EVENT_NAME'], process.env['CLEANUP_MODE']);
  if (!mode.ok) stop(`${mode.reason}; nothing connected`);
  const url = process.env['PREVIEW_DB_ADMIN_URL'];
  const check = checkCleanupUrl(url);
  if (!check.ok || url === undefined) stop(`${check.ok ? 'URL missing' : check.reason}; nothing connected`);
  if (mode.mode !== 'run') {
    const { client, close } = createClient(url);
    try {
      const report = await runBacklog({ client, mode: mode.mode, log: line });
      reportBacklog(report);
      if (!report.ok) stop(report.reason ?? 'cleanup failed');
    } catch (error) {
      stop(`unexpected failure (code ${errorCode(error)})`);
    } finally {
      await close().catch(() => undefined);
    }
    return;
  }
  const runId = process.env['TARGET_RUN_ID'] ?? '';
  const runAttempt = process.env['TARGET_RUN_ATTEMPT'] ?? '';

  const { client, close } = createClient(url);
  try {
    const report = await runCleanup({ client, runId, runAttempt, log: line });
    writeSummary(report);
    line(`preview-e2e-cleanup: deleted ${report.deletedOwn} of this run and ${report.deletedSwept} leftover(s); ${report.failedUsers} failed; leftovers of this run: ${report.leftovers ?? 'unknown'}`);
    const rows = Object.entries(report.tableCounts).map(([table, n]) => `${table}=${n}`).join(' ');
    if (rows !== '') line(`preview-e2e-cleanup: rows removed: ${rows}`);
    if (!report.ok) stop(report.reason ?? 'cleanup failed');
  } catch (error) {
    stop(`unexpected failure (code ${errorCode(error)})`);
  } finally {
    await close().catch(() => undefined);
  }
  line('preview-e2e-cleanup: OK');
}

await main();
