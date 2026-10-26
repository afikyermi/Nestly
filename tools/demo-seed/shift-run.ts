// Runs the time shift (shift.ts) in one transaction over an injected database: the preflight, the demo accounts' ids from their emails,
// the user triggers of each touched table switched off for the transaction only (the immutable-created_at guards would refuse the move;
// ALTER TABLE is transactional, so no other session ever sees them off), the UPDATEs, and commit, or rollback in the dry run.
// A log line is a label of content keys and a row count; never an id, an email or a URL.
import type { Content } from './content.ts';
import { buildShift, SHIFT_COLUMNS, touchedTables } from './shift.ts';

export interface ShiftTx {
  /** One statement; `count` is the number of rows it changed (or returned). */
  run(text: string, params?: readonly string[]): Promise<{ count: number; rows: readonly Record<string, unknown>[] }>;
}

export interface ShiftDb {
  /** Runs `work` in one transaction: commit when it returns, rollback when it throws. */
  transaction(work: (tx: ShiftTx) => Promise<void>): Promise<void>;
}

export interface ShiftInput {
  db: ShiftDb;
  content: Content;
  /** Persona key -> email, from DEMO_ACCOUNTS. */
  emails: ReadonlyMap<string, string>;
  anchor: Date;
  apply: boolean;
  log: (line: string) => void;
}

export interface ShiftReport {
  ok: boolean;
  reason?: string;
  statements: number;
  rows: number;
  missingPersonas: string[];
}

class Rollback extends Error {}
class Refused extends Error {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export async function runShift(input: ShiftInput): Promise<ShiftReport> {
  const report: ShiftReport = { ok: false, statements: 0, rows: 0, missingPersonas: [] };
  try {
    await input.db.transaction(async (tx) => {
      await tx.run("set local lock_timeout = '10s'");
      await tx.run("set local statement_timeout = '60s'");
      const facts = await tx.run('select current_user as who, (select rolbypassrls from pg_roles where rolname = current_user) as bypass');
      const [fact] = facts.rows;
      if (fact === undefined || text(fact['who']) !== 'postgres' || fact['bypass'] !== true) throw new Refused('preflight: not the postgres role with BYPASSRLS');
      const columns = await tx.run("select table_name, column_name from information_schema.columns where table_schema = 'nestly'");
      const have = new Set(columns.rows.map((r) => `${text(r['table_name'])}.${text(r['column_name'])}`));
      const missing = Object.entries(SHIFT_COLUMNS).flatMap(([t, cols]) => cols.filter((c) => !have.has(`${t}.${c}`)).map((c) => `${t}.${c}`));
      if (missing.length > 0) throw new Refused(`preflight: the schema changed (${missing.join(', ')}); re-review the shift`);

      const byEmail = new Map([...input.emails].map(([k, e]) => [e.toLowerCase(), k]));
      const found = await tx.run(
        'select u.id::text as id, lower(u.email) as email, n.account_type as kind, exists (select 1 from nestly.staff_roles s where s.user_id = u.id) as staff from auth.users u left join nestly.users n on n.id = u.id where lower(u.email) = any($1::text[])',
        [`{${[...byEmail.keys()].map((e) => `"${e.replace(/["\\]/g, '')}"`).join(',')}}`],
      );
      const ids = new Map<string, string>();
      for (const row of found.rows) {
        const persona = byEmail.get(text(row['email']));
        if (persona === undefined) continue;
        if (row['staff'] === true || !['regular', 'professional'].includes(text(row['kind']))) {
          throw new Refused(`preflight: the account of ${persona} is not a Regular or Professional account`);
        }
        ids.set(persona, text(row['id']));
      }
      report.missingPersonas = [...input.emails.keys()].filter((k) => !ids.has(k));
      for (const k of report.missingPersonas) input.log(`no account yet for ${k}: its rows are not moved`);

      const statements = buildShift(input.content, ids, input.anchor);
      for (const table of touchedTables(statements)) await tx.run(`alter table nestly.${table} disable trigger user`);
      for (const s of statements) {
        const result = await tx.run(s.text, s.params);
        report.statements += 1;
        report.rows += result.count;
        input.log(`${String(result.count).padStart(4)}  ${s.label}`);
      }
      for (const table of touchedTables(statements)) await tx.run(`alter table nestly.${table} enable trigger user`);
      if (!input.apply) throw new Rollback('dry run');
    });
    report.ok = true;
  } catch (error) {
    if (error instanceof Rollback) {
      report.ok = true;
      input.log('dry run: rolled back, nothing changed');
    } else {
      const code: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
      report.reason = error instanceof Refused ? error.message : `the shift failed and was rolled back${typeof code === 'string' ? ` (SQLSTATE ${code})` : ''}`;
    }
  }
  return report;
}
