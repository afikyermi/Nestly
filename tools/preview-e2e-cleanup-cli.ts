// Cleanup CLI of the `preview-e2e` workflow (.work/preview-e2e/schema.md, DR-E1 option 1).
//
//   node tools/preview-e2e-cleanup-cli.ts
//
// Reads PREVIEW_DB_ADMIN_URL (postgres@nestly-preview through the session pooler), GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT from
// the environment. The URL is checked before anything connects. The credential bypasses RLS: it is read in this one step of
// the workflow and nowhere else (data-model.md, Approved exceptions). It never prints the URL, an email, an id or a
// password; it prints counts. Exit 0 only when every user is gone and none of this run remains.

import { appendFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  SWEEP_AGE_HOURS,
  TEST_EMAIL_PATTERN,
  checkCleanupUrl,
  errorCode,
  runCleanup,
  runEmailPrefix,
  type Candidate,
  type CleanupClient,
  type DeleteCounts,
} from './preview-e2e-cleanup.ts';

function line(text: string): void {
  process.stdout.write(`${text}\n`);
}

function stop(reason: string): never {
  process.stdout.write(`::error::preview-e2e-cleanup: ${reason}\n`);
  process.exit(1);
}

/** Real client: one session, max one connection. Statements are the ones in schema.md, leaf first. */
function createClient(url: string): { client: CleanupClient; close: () => Promise<void> } {
  const sql = postgres(url, { max: 1, ssl: 'require', onnotice: () => undefined, connect_timeout: 20, idle_timeout: 5 });
  const client: CleanupClient = {
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
    async findCandidates(runId, runAttempt): Promise<Candidate[]> {
      const prefix = runEmailPrefix(runId, runAttempt);
      const rows = await sql<{ id: string; own: boolean }[]>`
        select id::text as id, (email like ${prefix}) as own
          from auth.users
         where email ~ ${TEST_EMAIL_PATTERN}
           and (email like ${prefix} or created_at < now() - make_interval(hours => ${SWEEP_AGE_HOURS}))`;
      return rows.map((r) => ({ id: r.id, own: r.own }));
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
        counts['regular_profiles'] = (await tx`delete from nestly.regular_profiles where user_id = ${id}`).count;
        counts['users'] = (await tx`delete from nestly.users where id = ${id}`).count;
        const authDeleted = (await tx`delete from auth.users where id = ${id} and email ~ ${TEST_EMAIL_PATTERN}`).count;
        if (authDeleted !== 1) throw new Error('auth.users delete was not exactly one row'); // rolls the transaction back
        counts['auth.users'] = authDeleted;
        return counts;
      });
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

function writeOutputs(values: Record<string, string | number>): void {
  const file = process.env['GITHUB_OUTPUT'];
  if (file === undefined || file === '') return;
  appendFileSync(file, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}

async function main(): Promise<void> {
  const url = process.env['PREVIEW_DB_ADMIN_URL'];
  const check = checkCleanupUrl(url);
  if (!check.ok || url === undefined) stop(`${check.ok ? 'URL missing' : check.reason}; nothing connected`);
  const runId = process.env['GITHUB_RUN_ID'] ?? '';
  const runAttempt = process.env['GITHUB_RUN_ATTEMPT'] ?? '';

  const { client, close } = createClient(url);
  try {
    const report = await runCleanup({ client, runId, runAttempt, log: line });
    writeOutputs({
      deleted_own: report.deletedOwn,
      deleted_swept: report.deletedSwept,
      failed: report.failedUsers,
      leftovers: report.leftovers ?? 'unknown',
    });
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
