// The demo seed, a one-off tool outside the product (docs/lecturer-demo-plan-HE.md §3). It is never deployed and the product has no code
// that knows about it: it signs in as each demo user through Supabase Auth and calls the public API like the web does.
//
//   node tools/demo-seed/cli.ts plan [seed|stories]          the dry run: the content is checked and the steps are printed; no network
//   node tools/demo-seed/cli.ts run  <seed|stories> <preview|production>
//        env: DEMO_BASE_URL (preview: the deployment URL; production: https://nestly-blue.vercel.app), DEMO_ACCOUNTS (JSON, a secret),
//             SUPABASE_PUBLISHABLE_KEY, VERCEL_AUTOMATION_BYPASS_SECRET (preview only), DEMO_ALLOW_SIGNUP=1 to create missing accounts,
//             DEMO_ONLY=<key,...> to run only the steps that touch these personas (plan and run; a persona added after the first seed)
//   node tools/demo-seed/cli.ts walk preview                  the role walk after the seed: every persona signs in and reads its first
//        screens (GET only); the env of run, without DEMO_ALLOW_SIGNUP. Preview only: on production Afik walks it signed in himself.
//   node tools/demo-seed/cli.ts load <preview|production>      the load test (load.ts): the personas sign in, then LOAD_USERS users read their
//        screens at once for LOAD_DURATION_S (after LOAD_RAMP_S), LOAD_THINK_MS apart; GET only. Production: at most 500 users, 60 s.
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
import { type Content, loadContent, personaKinds } from './content.ts';
import { Api, Auth } from './http.ts';
import { buildPlan, focusPlan, type Mode, type Step } from './plan.ts';
import { createContext, dryRun, runPlan } from './runner.ts';
import { checkTarget, type Target } from './target.ts';
import { reportLines, runLoad, TARGET_MS } from './load.ts';
import { walk } from './walk.ts';

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

/**
 * DEMO_ONLY (comma-separated persona keys, optional): run only the steps that touch these personas (plan.ts focusPlan) - how a persona
 * added after the first seed is seeded without writing the rest again. Empty: the whole plan.
 */
function steps(data: Content, m: Mode): Step[] {
  const all = buildPlan(data, m);
  const only = (process.env['DEMO_ONLY'] ?? '').split(',').map((k) => k.trim()).filter((k) => k !== '');
  if (only.length === 0) return all;
  const kinds = personaKinds(data);
  const unknown = only.filter((k) => !kinds.has(k));
  if (unknown.length > 0) return fail(`DEMO_ONLY names unknown personas: ${unknown.join(', ')}`);
  log(`demo-seed: only the steps that touch ${only.join(', ')}`);
  return focusPlan(all, data, only);
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
  const plan = steps(data, m);
  log(`demo-seed: ${plan.length} steps, mode ${m}, target ${target}`);
  const report = await runPlan(plan, ctx, actionHandlers);
  log(`demo-seed: done ${report.done}, already there ${report.skipped}, failed ${report.failed.length}`);
  for (const f of report.failed) log(`  failed: ${f.step} - ${f.reason}`);
  if (report.failed.length > 0) process.exit(1);
}

async function walkPreview(args: string[]): Promise<void> {
  if (args[0] !== 'preview') return fail('the walk runs on preview only');
  const checked = checkTarget('preview', process.env['DEMO_BASE_URL']);
  if (!checked.ok) return fail(checked.reason);
  const data = content();
  const accounts = parseAccounts(process.env['DEMO_ACCOUNTS'], [...data.regulars, ...data.professionals].map((p) => p.key));
  if (!accounts.ok) return fail(accounts.reason);
  maskAccounts(accounts.accounts, (l) => process.stdout.write(l), process.env['GITHUB_ACTIONS'] === 'true');
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '';
  if (key.trim() === '' || key.startsWith('sb_secret_')) return fail('SUPABASE_PUBLISHABLE_KEY is missing or is not a publishable key');
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const report = await walk({
    api: new Api({ baseUrl: checked.baseUrl, fetch, bypassSecret: process.env['VERCEL_AUTOMATION_BYPASS_SECRET'], sleep }),
    auth: new Auth({ supabaseUrl: checked.supabaseUrl, publishableKey: key.trim(), fetch, sleep }),
    accounts: accounts.accounts,
    personas: [
      ...data.regulars.map((p) => ({ key: p.key, kind: 'regular' as const })),
      ...data.professionals.map((p) => ({ key: p.key, kind: 'professional' as const })),
    ],
    log,
  });
  log(`demo-seed walk: ${report.screens} screens, failed ${report.failed.length}`);
  for (const f of report.failed) log(`  failed: ${f}`);
  if (report.failed.length > 0) process.exit(1);
}

function intOf(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fail(`${name} is a whole number from ${min} to ${max}`);
  return value;
}

async function load(args: string[]): Promise<void> {
  const target = args[0];
  if (target !== 'preview' && target !== 'production') return fail('the target is preview or production');
  const checked = checkTarget(target, process.env['DEMO_BASE_URL']);
  if (!checked.ok) return fail(checked.reason);
  const data = content();
  const accounts = parseAccounts(process.env['DEMO_ACCOUNTS'], [...data.regulars, ...data.professionals].map((p) => p.key));
  if (!accounts.ok) return fail(accounts.reason);
  maskAccounts(accounts.accounts, (l) => process.stdout.write(l), process.env['GITHUB_ACTIONS'] === 'true');
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '';
  if (key.trim() === '' || key.startsWith('sb_secret_')) return fail('SUPABASE_PUBLISHABLE_KEY is missing or is not a publishable key');
  const production = target === 'production';
  const options = {
    users: intOf('LOAD_USERS', 500, 1, production ? 500 : 1000),
    durationMs: intOf('LOAD_DURATION_S', production ? 30 : 60, 5, production ? 60 : 300) * 1000,
    rampMs: intOf('LOAD_RAMP_S', 20, 0, 120) * 1000,
    thinkMs: intOf('LOAD_THINK_MS', 1000, 0, 30_000),
  };
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const result = await runLoad(
    {
      baseUrl: checked.baseUrl,
      auth: new Auth({ supabaseUrl: checked.supabaseUrl, publishableKey: key.trim(), fetch, sleep }),
      accounts: accounts.accounts,
      personas: [
        ...data.regulars.map((p) => ({ key: p.key, kind: 'regular' as const })),
        ...data.professionals.map((p) => ({ key: p.key, kind: 'professional' as const })),
      ],
      bypassSecret: production ? undefined : process.env['VERCEL_AUTOMATION_BYPASS_SECRET'],
      fetch: (url, init) => fetch(url, { ...init, redirect: 'manual' }),
      log,
    },
    options,
  );
  for (const f of result.signInFailed) log(`  sign-in failed: ${f}`);
  const lines = [`load ${target}: ${options.users} users, ${options.durationMs / 1000} s after a ${options.rampMs / 1000} s ramp, think ${options.thinkMs} ms`, '', ...reportLines(result.summary, result.samples, (options.durationMs + options.rampMs) / 1000)];
  for (const line of lines) log(line);
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile !== undefined && summaryFile !== '') writeFileSync(summaryFile, `${lines.join('\n')}\n`, { flag: 'a' });
  if (result.summary.requests === 0) fail('no request was made');
  log(`load: ${result.summary.share === 1 ? 'every' : 'not every'} request answered within ${TARGET_MS} ms`);
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
  dryRun(steps(content(), mode(rest[0])), log);
} else if (command === 'run') {
  await run(rest);
} else if (command === 'walk') {
  await walkPreview(rest);
} else if (command === 'load') {
  await load(rest);
} else if (command === 'make-accounts') {
  makeAccounts(rest);
} else {
  fail('usage: cli.ts plan [seed|stories] | run <seed|stories> <preview|production> | walk preview | load <preview|production> | make-accounts <template> <out>');
}
