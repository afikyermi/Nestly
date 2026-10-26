// The demo time shift (docs/lecturer-demo-plan-HE.md §3): moves the created_at of the demo accounts' rows back to the ages the content
// gives them. Run from CI only, with Afik's approval (the workflow's environment), after the seed:
//
//   node tools/demo-seed/shift-cli.ts <preview|production> <dry-run|apply>
//        env: DEMO_DB_ADMIN_URL (postgres of that project, session pooler), DEMO_ACCOUNTS (the emails are read; passwords are not used),
//             DEMO_SHIFT_ANCHOR (optional ISO time the ages count back from; default now),
//             DEMO_SHIFT_ALLOW_EMPTY (optional, comma-separated statement labels or prefixes whose 0 rows may not stop an apply)
//
// dry-run runs every statement and rolls back, printing the row count per statement. It never prints the URL, an id or an email.
import postgres from 'postgres';
import { maskAccounts, parseAccounts } from './accounts.ts';
import { loadContent } from './content.ts';
import { runShift, type ShiftDb } from './shift-run.ts';
import { checkAdminUrl } from './target.ts';

const log = (line: string) => process.stdout.write(`${line}\n`);
function stop(reason: string): never {
  process.stdout.write(`::error::demo-shift: ${reason}\n`);
  process.exit(1);
}

const [target, mode] = process.argv.slice(2);
if (target !== 'preview' && target !== 'production') stop('the target is preview or production');
if (mode !== 'dry-run' && mode !== 'apply') stop('the mode is dry-run or apply');
const url = process.env['DEMO_DB_ADMIN_URL'];
const urlCheck = checkAdminUrl(target, url);
if (!urlCheck.ok || url === undefined) stop(urlCheck.ok ? 'DEMO_DB_ADMIN_URL is not set' : urlCheck.reason);
const content = loadContent();
const accounts = parseAccounts(process.env['DEMO_ACCOUNTS'], [...content.regulars, ...content.professionals].map((p) => p.key));
if (!accounts.ok) stop(accounts.reason);
maskAccounts(accounts.accounts, (l) => process.stdout.write(l), process.env['GITHUB_ACTIONS'] === 'true');
const anchorText = process.env['DEMO_SHIFT_ANCHOR'];
const anchor = anchorText === undefined || anchorText === '' ? new Date() : new Date(anchorText);
if (Number.isNaN(anchor.getTime()) || anchor.getTime() > Date.now() + 60 * 1000) stop('DEMO_SHIFT_ANCHOR is not a time up to now');

const sql = postgres(url, { max: 1, ssl: 'require', onnotice: () => undefined, connect_timeout: 20, idle_timeout: 5, prepare: false });
const db: ShiftDb = {
  async transaction(work) {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local row_security = off');
      await work({
        async run(text, params = []) {
          const rows = await tx.unsafe(text, [...params]);
          return { count: rows.count, rows: rows.map((r) => ({ ...r })) };
        },
      });
    });
  },
};

const emails = new Map([...accounts.accounts].map(([k, a]) => [k, a.email]));
const allowEmpty = (process.env['DEMO_SHIFT_ALLOW_EMPTY'] ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
const report = await runShift({ db, content, emails, anchor, apply: mode === 'apply', log, allowEmpty });
await sql.end({ timeout: 5 });
log(`demo-shift: ${report.statements} statements, ${report.rows} rows${mode === 'apply' ? '' : ' (rolled back)'}`);
if (!report.ok) stop(report.reason ?? 'failed');
