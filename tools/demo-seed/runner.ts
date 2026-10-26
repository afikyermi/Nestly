// Runs the demo plan against a deployed Nestly through its API, each step as the demo user who acts in it, with a Regular's or a
// Professional's own permissions (plan §3: no demo-aware code, no direct writes). Safe to run again: every step first looks for what it
// would create (by the product's own reads) and skips it when it is there. A failed step is reported and the run goes on; the exit code
// says whether any failed. Log lines name the step (kind, persona key, content key) and the HTTP status, never a text, an email, a
// password, a token or an id.
import type { DemoAccount } from './accounts.ts';
import { randomRecoveryAnswers } from './accounts.ts';
import { professionalBody, registrationBody } from './bodies.ts';
import type { Content } from './content.ts';
import type { Api, ApiResult, Auth } from './http.ts';
import { describeStep, type Step } from './plan.ts';

export class StepError extends Error {}

export type Outcome = 'done' | 'skipped';

export interface Session {
  token: string;
  userId: string;
  at: number;
}

export interface RunnerDeps {
  api: Api;
  auth: Auth;
  accounts: Map<string, DemoAccount>;
  content: Content;
  now: Date;
  log: (line: string) => void;
  /** Create an account that does not exist yet (sign up, register, recovery answers). Off: such a persona fails its steps. */
  allowSignUp: boolean;
  /** Milliseconds since the run started (a token is renewed after 45 minutes). */
  clock?: () => number;
}

export interface Ctx extends RunnerDeps {
  sessions: Map<string, Session>;
  posts: Map<string, string>;
  comments: Map<string, string>;
  groups: Map<string, string>;
  listings: Map<string, string>;
  call(actor: string, method: string, path: string, body?: unknown, contentType?: string): Promise<ApiResult>;
  userId(persona: string): string;
}

const TOKEN_LIFETIME_MS = 45 * 60 * 1000;

export function field(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const name of path) current = typeof current === 'object' && current !== null ? Reflect.get(current, name) : undefined;
  return current;
}

export function stringField(value: unknown, ...path: string[]): string | null {
  const found = field(value, ...path);
  return typeof found === 'string' ? found : null;
}

export function list(value: unknown, ...path: string[]): unknown[] {
  const found = field(value, ...path);
  return Array.isArray(found) ? found : [];
}

/** Throws unless the status is one of `ok`; returns the body. */
export function expectStatus(result: ApiResult, ok: readonly number[], what: string): unknown {
  if (!ok.includes(result.status)) {
    const code = stringField(result.body, 'error');
    throw new StepError(`${what}: HTTP ${result.status}${code === null ? '' : ` ${code}`}`);
  }
  return result.body;
}

async function signIn(ctx: Ctx, persona: string, create: boolean): Promise<Session> {
  const account = ctx.accounts.get(persona);
  if (account === undefined) throw new StepError(`no demo account for ${persona}`);
  let outcome = await ctx.auth.signIn(account.email, account.password);
  if (!outcome.ok && outcome.reason === 'invalid_credentials' && create && ctx.allowSignUp) {
    outcome = await ctx.auth.signUp(account.email, account.password);
    if (!outcome.ok && outcome.reason === 'already_registered') {
      throw new StepError(`${persona}: the email is registered with another password`);
    }
  }
  if (!outcome.ok) {
    const hint = outcome.reason === 'confirmation_required' ? ' (the project asks to confirm the email first)' : '';
    throw new StepError(`${persona}: sign-in ${outcome.reason}${hint}`);
  }
  const session: Session = { token: outcome.token, userId: outcome.userId.toLowerCase(), at: (ctx.clock ?? Date.now)() };
  ctx.sessions.set(persona, session);
  return session;
}

/** The account step: signs in (or signs up), then registers the account and stores recovery answers when the product asks for them. */
async function account(ctx: Ctx, persona: string): Promise<Outcome> {
  await signIn(ctx, persona, true);
  const me = await ctx.call(persona, 'GET', '/api/me');
  const state = stringField(expectStatus(me, [200], 'me'), 'state');
  let changed = false;
  if (state === 'unregistered') {
    const regular = ctx.content.regulars.find((r) => r.key === persona);
    const pro = ctx.content.professionals.find((p) => p.key === persona);
    const result =
      regular !== undefined
        ? await ctx.call(persona, 'POST', '/api/register', registrationBody(regular, ctx.now))
        : pro !== undefined
          ? await ctx.call(persona, 'POST', '/api/register/professional', professionalBody(pro))
          : null;
    if (result === null) throw new StepError(`${persona}: not a persona`);
    expectStatus(result, [200, 201, 409], 'register');
    changed = true;
  } else if (state !== 'active') {
    throw new StepError(`${persona}: account state ${state ?? 'unknown'}`);
  }
  const after = changed ? stringField(expectStatus(await ctx.call(persona, 'GET', '/api/me'), [200], 'me'), 'recoveryQuestions') : stringField(me.body, 'recoveryQuestions');
  if (after === 'missing') {
    expectStatus(await ctx.call(persona, 'POST', '/api/recovery-questions', { answers: randomRecoveryAnswers() }), [201, 409], 'recovery questions');
    changed = true;
  }
  return changed ? 'done' : 'skipped';
}

export type Handler = (ctx: Ctx, step: Step) => Promise<Outcome>;

export interface RunReport {
  done: number;
  skipped: number;
  failed: { step: string; reason: string }[];
}

export function createContext(deps: RunnerDeps): Ctx {
  const ctx: Ctx = {
    ...deps,
    sessions: new Map(),
    posts: new Map(),
    comments: new Map(),
    groups: new Map(),
    listings: new Map(),
    async call(actor, method, path, body, contentType) {
      let session = ctx.sessions.get(actor);
      if (session === undefined || (ctx.clock ?? Date.now)() - session.at > TOKEN_LIFETIME_MS) session = await signIn(ctx, actor, false);
      return ctx.api.call(session.token, method, path, body, contentType);
    },
    userId(persona) {
      const session = ctx.sessions.get(persona);
      if (session === undefined) throw new StepError(`${persona} has not signed in (its account step failed)`);
      return session.userId;
    },
  };
  return ctx;
}

/** Runs every step in order. Each failure is kept with its reason; a step whose actor's account failed is skipped as failed too. */
export async function runPlan(steps: readonly Step[], ctx: Ctx, handlers: Partial<Record<Step['kind'], Handler>>): Promise<RunReport> {
  const report: RunReport = { done: 0, skipped: 0, failed: [] };
  const brokenAccounts = new Set<string>();
  for (const step of steps) {
    const label = describeStep(step);
    if (brokenAccounts.has(step.actor)) {
      report.failed.push({ step: label, reason: `${step.actor}: no account` });
      continue;
    }
    try {
      const handler = step.kind === 'account' ? (c: Ctx, s: Step) => account(c, s.actor) : handlers[step.kind];
      if (handler === undefined) throw new StepError('no handler');
      const outcome = await handler(ctx, step);
      report[outcome] += 1;
      ctx.log(`${outcome === 'done' ? 'done   ' : 'skipped'} ${label}`);
    } catch (error) {
      const reason = error instanceof StepError ? error.message : 'unexpected failure';
      if (step.kind === 'account') brokenAccounts.add(step.actor);
      report.failed.push({ step: label, reason });
      ctx.log(`FAILED  ${label}: ${reason}`);
    }
  }
  return report;
}

/** The dry run: the plan, one line per step, and a count per kind. No network, no accounts. */
export function dryRun(steps: readonly Step[], log: (line: string) => void): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const step of steps) {
    log(describeStep(step));
    counts[step.kind] = (counts[step.kind] ?? 0) + 1;
  }
  log('');
  for (const [kind, n] of Object.entries(counts)) log(`${kind.padEnd(16)} ${n}`);
  log(`${'total'.padEnd(16)} ${steps.length}`);
  return counts;
}
