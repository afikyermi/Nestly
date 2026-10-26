// Runs the time shift (shift.ts) in one transaction over an injected database: the preflight, the demo accounts' ids from their emails,
// then the UPDATEs table by table. Each table is tried first with its triggers on, inside a savepoint; only when a guard refuses the move
// (the immutable-created_at guards raise 42501 or P0001) is that table's savepoint rolled back and its user triggers switched off for this
// transaction alone (ALTER TABLE is transactional: no other session ever sees them off) and the table done again. Then commit, or
// rollback in the dry run. A statement that should move a row and moved none is flagged in the dry run and stops an apply (rollback),
// unless it is optional (shift.ts) or its label is allow-listed.
// A log line is a label of content keys and a row count; never an id, an email or a URL.
import type { Content } from './content.ts';
import { buildShift, SHIFT_COLUMNS, type Statement, touchedTables } from './shift.ts';

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
  /** Labels (or label prefixes) whose 0 rows do not stop an apply: content the product refused at seed time. */
  allowEmpty?: readonly string[];
}

export interface ShiftReport {
  ok: boolean;
  reason?: string;
  statements: number;
  rows: number;
  missingPersonas: string[];
  /** Required statements that moved no row. */
  empty: string[];
  /** Tables whose triggers had to be switched off. */
  triggersOff: string[];
}

class Rollback extends Error {}

const GUARD_CODES = new Set(['42501', 'P0001']);

async function runAll(tx: ShiftTx, statements: readonly Statement[]): Promise<number[]> {
  const counts: number[] = [];
  for (const s of statements) counts.push((await tx.run(s.text, s.params)).count);
  return counts;
}

/** The table's statements with its triggers on, in a savepoint: the counts, or null when a guard refused (the savepoint rolled back). */
async function tryTable(tx: ShiftTx, statements: readonly Statement[]): Promise<number[] | null> {
  await tx.run('savepoint demo_shift_table');
  try {
    const counts = await runAll(tx, statements);
    await tx.run('release savepoint demo_shift_table');
    return counts;
  } catch (error) {
    const code: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
    if (typeof code !== 'string' || !GUARD_CODES.has(code)) throw error;
    await tx.run('rollback to savepoint demo_shift_table');
    return null;
  }
}
class Refused extends Error {}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export async function runShift(input: ShiftInput): Promise<ShiftReport> {
  const report: ShiftReport = { ok: false, statements: 0, rows: 0, missingPersonas: [], empty: [], triggersOff: [] };
  let phase = 'statements';
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
      const allowed = (label: string) => (input.allowEmpty ?? []).some((a) => a !== '' && label.startsWith(a));
      for (const table of touchedTables(statements)) {
        const mine = statements.filter((s) => s.table === table);
        let counts = await tryTable(tx, mine);
        if (counts === null) {
          await tx.run(`alter table nestly.${table} disable trigger user`);
          counts = await runAll(tx, mine);
          await tx.run(`alter table nestly.${table} enable trigger user`);
          report.triggersOff.push(table);
          input.log(`triggers off for nestly.${table} inside this transaction (a guard refused the move)`);
        }
        mine.forEach((s, i) => {
          const count = counts?.[i] ?? 0;
          report.statements += 1;
          report.rows += count;
          const flag = count === 0 && s.optional !== true ? (allowed(s.label) ? '  (0 rows, allow-listed)' : '  <- 0 ROWS') : '';
          if (count === 0 && s.optional !== true && !allowed(s.label)) report.empty.push(s.label);
          input.log(`${String(count).padStart(4)}  ${s.label}${flag}`);
        });
      }
      // The deferred constraints are checked here, not at commit: a dry run then meets what would refuse the commit, and a refusal is
      // reported while its statement is known. row_security goes back on first: a constraint check runs as the table's owner, which has no
      // BYPASSRLS, and with row_security off a check that RLS would touch is refused (42501); postgres itself still bypasses RLS.
      phase = 'deferred constraints';
      await tx.run('set local row_security = on');
      await tx.run('set constraints all immediate');
      if (input.apply && report.empty.length > 0) {
        throw new Refused(`${report.empty.length} statements moved no row (marked "0 ROWS" above); nothing was changed. Allow-list them only if that content is meant to be missing`);
      }
      if (!input.apply) throw new Rollback('dry run');
      phase = 'commit';
    });
    report.ok = true;
  } catch (error) {
    if (error instanceof Rollback) {
      report.ok = true;
      input.log('dry run: rolled back, nothing changed');
    } else {
      const part = (name: string): string => {
        const value: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, name) : undefined;
        return typeof value === 'string' && /^[A-Za-z0-9_]{1,63}$/.test(value) ? value : '';
      };
      // only schema names (table, constraint, server routine) beside the SQLSTATE: never the message, which may quote a value
      const names = ['table_name', 'constraint_name', 'routine'].map((n) => (part(n) === '' ? '' : ` ${n.replace('_name', '')} ${part(n)}`)).join('');
      // the PL/pgSQL context names the function that raised ("PL/pgSQL function nestly.f() line 4 at RAISE"); only that name is kept
      const context: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'where') : undefined;
      const fn = typeof context === 'string' ? (/function ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\(/i.exec(context)?.[1] ?? '') : '';
      const where = `${names}${fn === '' ? '' : ` function ${fn}`} at ${phase}`;
      report.reason = error instanceof Refused ? error.message : `the shift failed and was rolled back${part('code') === '' ? '' : ` (SQLSTATE ${part('code')}${where})`}`;
    }
  }
  return report;
}
