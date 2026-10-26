// The demo seed, a one-off tool outside the product (docs/lecturer-demo-plan-HE.md §3). It is never deployed and the product has no code
// that knows about it: it signs in as each demo user through Supabase Auth and calls the public API like the web does.
//
//   node tools/demo-seed/cli.ts plan [seed|stories]          the dry run: the content is checked and the steps are printed; no network
//   node tools/demo-seed/cli.ts run  <seed|stories> <preview|production>
//        env: DEMO_BASE_URL (preview: the deployment URL; production: https://nestly-blue.vercel.app), DEMO_ACCOUNTS (JSON, a secret),
//             SUPABASE_PUBLISHABLE_KEY, VERCEL_AUTOMATION_BYPASS_SECRET (preview only), DEMO_ALLOW_SIGNUP=1 to create missing accounts
//   node tools/demo-seed/cli.ts make-accounts <email template with {key}> <out file>
//        writes a fresh DEMO_ACCOUNTS value (random passwords) to a new file outside the repository, to paste into the secret.
//
// "seed" creates everything but the Stories; "stories" creates the Stories only and runs on the demo day (FR-FEED-008: 24 hours).
// Nothing is printed but step names, persona keys, content keys, counts and HTTP statuses.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { actionHandlers } from './actions.ts';
import { generateAccounts, maskAccounts, parseAccounts } from './accounts.ts';
import { checkContent } from './check.ts';
import { loadContent } from './content.ts';
import { Api, Auth } from './http.ts';
import { buildPlan, type Mode } from './plan.ts';
import { createContext, dryRun, runPlan } from './runner.ts';
import { checkTarget, type Target } from './target.ts';

const log = (line: string) => process.stdout.write(`${line}\n`);
const fail = (line: string): never => {
  process.stdout.write(`::error::demo-seed: ${line}\n`);
  process.exit(1);
};

function mode(value: string | undefined): Mode {
  if (value === undefined || value === 'seed') return 'seed';
  if (value === 'stories') return 'stories';
  return fail('the mode is seed or stories');
}

function content() {
  const loaded = loadContent();
  const problems = checkContent(loaded);
  if (problems.length > 0) {
    for (const p of problems) log(`content: ${p}`);
    fail(`${problems.length} content problems`);
  }
  return loaded;
}

async function run(args: string[]): Promise<void> {
  const m = mode(args[0]);
  const target = args[1];
  if (target !== 'preview' && target !== 'production') return fail('the target is preview or production');
  const checked = checkTarget(target satisfies Target, process.env['DEMO_BASE_URL']);
  if (!checked.ok) return fail(checked.reason);
  const data = content();
  const accounts = parseAccounts(process.env['DEMO_ACCOUNTS'], [...data.regulars, ...data.professionals].map((p) => p.key));
  if (!accounts.ok) return fail(accounts.reason);
  maskAccounts(accounts.accounts, (l) => process.stdout.write(l), process.env['GITHUB_ACTIONS'] === 'true');
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '';
  if (key.trim() === '' || key.startsWith('sb_secret_')) return fail('SUPABASE_PUBLISHABLE_KEY is missing or is not a publishable key');
  const bypass = target === 'preview' ? process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] : undefined;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const ctx = createContext({
    api: new Api({ baseUrl: checked.baseUrl, fetch, bypassSecret: bypass, sleep }),
    auth: new Auth({ supabaseUrl: checked.supabaseUrl, publishableKey: key.trim(), fetch, sleep }),
    accounts: accounts.accounts,
    content: data,
    now: new Date(),
    log,
    allowSignUp: process.env['DEMO_ALLOW_SIGNUP'] === '1',
  });
  const steps = buildPlan(data, m);
  log(`demo-seed: ${steps.length} steps, mode ${m}, target ${target}`);
  const report = await runPlan(steps, ctx, actionHandlers);
  log(`demo-seed: done ${report.done}, already there ${report.skipped}, failed ${report.failed.length}`);
  for (const f of report.failed) log(`  failed: ${f.step} - ${f.reason}`);
  if (report.failed.length > 0) process.exit(1);
}

function makeAccounts(args: string[]): void {
  const [template, out] = args;
  if (template === undefined || out === undefined) return fail('make-accounts <email template with {key}> <out file>');
  const file = path.resolve(out);
  const repo = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  if (file.startsWith(repo + path.sep)) return fail('write the accounts file outside the repository');
  if (existsSync(file)) return fail('the out file exists; choose a new path');
  const data = content();
  const accounts = generateAccounts([...data.regulars, ...data.professionals].map((p) => p.key), template);
  writeFileSync(file, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  log(`demo-seed: ${Object.keys(accounts).length} accounts written; paste the file's content into the DEMO_ACCOUNTS secret, then delete it`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'plan') {
  const steps = buildPlan(content(), mode(rest[0]));
  dryRun(steps, log);
} else if (command === 'run') {
  await run(rest);
} else if (command === 'make-accounts') {
  makeAccounts(rest);
} else {
  fail('usage: cli.ts plan [seed|stories] | run <seed|stories> <preview|production> | make-accounts <template> <out>');
}
