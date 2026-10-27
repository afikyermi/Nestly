// The load test (27.10, the lecturer's requirement: every request answered within 2 seconds with up to 500 concurrent users). The demo
// personas sign in once each; then `users` virtual users run at once, each a signed-in persona (round robin) that opens the screens of
// its kind (walk.ts SCREENS) one GET at a time, with a think time between them, until the time is up. Users start evenly over the ramp.
// Read only: GET requests, no sign-up, no write. The report gives the count, the share answered within 2 s, the percentiles and the
// slowest paths, and the Server-Timing of the slow ones (cold start, waiting for the connection, database); never a body, token or id.
import type { DemoAccount } from './accounts.ts';
import type { Auth } from './http.ts';
import { SCREENS, type PersonaKind } from './walk.ts';

export const TARGET_MS = 2000;

export interface LoadOptions {
  users: number;
  durationMs: number;
  rampMs: number;
  /** The mean pause between one user's requests; each pause is drawn between half and one and a half of it. */
  thinkMs: number;
}

export interface Sample {
  path: string;
  status: number;
  ms: number;
  /** Server-Timing: whether the request opened a new server instance, and the server's own total. */
  cold: boolean;
  serverMs: number | null;
  acqMs: number | null;
}

export type LoadFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface LoadDeps {
  baseUrl: string;
  auth: Auth;
  accounts: Map<string, DemoAccount>;
  personas: readonly { key: string; kind: PersonaKind }[];
  bypassSecret?: string | undefined;
  fetch: LoadFetch;
  log: (line: string) => void;
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** A Server-Timing metric's duration, or null when the header does not have it. */
export function timingOf(header: string | null, name: string): number | null {
  if (header === null) return null;
  const match = new RegExp(`(?:^|,)\\s*${name};dur=([0-9.]+)`).exec(header);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** The nearest-rank percentile of sorted values (p in 0..100); 0 for none. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

export interface Summary {
  requests: number;
  errors: number;
  withinTarget: number;
  share: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  cold: number;
  byStatus: Record<string, number>;
  byPath: { path: string; requests: number; p95: number; max: number; overTarget: number }[];
}

export function summarize(samples: readonly Sample[]): Summary {
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const byStatus: Record<string, number> = {};
  for (const s of samples) byStatus[String(s.status)] = (byStatus[String(s.status)] ?? 0) + 1;
  const paths = [...new Set(samples.map((s) => s.path))];
  const byPath = paths
    .map((path) => {
      const ms = samples.filter((s) => s.path === path).map((s) => s.ms).sort((a, b) => a - b);
      return { path, requests: ms.length, p95: percentile(ms, 95), max: ms.at(-1) ?? 0, overTarget: ms.filter((m) => m > TARGET_MS).length };
    })
    .sort((a, b) => b.p95 - a.p95);
  const withinTarget = samples.filter((s) => s.ms <= TARGET_MS && s.status > 0 && s.status < 500).length;
  return {
    requests: samples.length,
    errors: samples.filter((s) => s.status === 0 || s.status >= 500).length,
    withinTarget,
    share: samples.length === 0 ? 0 : withinTarget / samples.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? 0,
    cold: samples.filter((s) => s.cold).length,
    byStatus,
    byPath,
  };
}

export async function runLoad(deps: LoadDeps, options: LoadOptions): Promise<{ summary: Summary; signInFailed: string[]; samples: Sample[] }> {
  const now = deps.now ?? (() => performance.now());
  const random = deps.random ?? Math.random;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const signInFailed: string[] = [];
  const sessions: { token: string; kind: PersonaKind }[] = [];
  for (const persona of deps.personas) {
    const account = deps.accounts.get(persona.key);
    if (account === undefined) {
      signInFailed.push(`${persona.key}: no demo account`);
      continue;
    }
    const session = await deps.auth.signIn(account.email, account.password);
    if (session.ok) sessions.push({ token: session.token, kind: persona.kind });
    else signInFailed.push(`${persona.key}: sign-in ${session.reason} (HTTP ${session.status})`);
  }
  const samples: Sample[] = [];
  if (sessions.length === 0) return { summary: summarize(samples), signInFailed, samples };
  deps.log(`load: ${sessions.length} personas signed in; ${options.users} users, ramp ${options.rampMs} ms, ${options.durationMs} ms, think ${options.thinkMs} ms`);

  const base = deps.baseUrl.replace(/\/+$/, '');
  const start = now();
  const end = start + options.rampMs + options.durationMs;
  const user = async (index: number): Promise<void> => {
    await sleep((options.rampMs * index) / Math.max(1, options.users));
    const session = sessions[index % sessions.length];
    if (session === undefined) return;
    const screens = SCREENS[session.kind];
    let step = Math.floor(random() * screens.length);
    const headers: Record<string, string> = { authorization: `Bearer ${session.token}` };
    if (deps.bypassSecret !== undefined && deps.bypassSecret !== '') headers['x-vercel-protection-bypass'] = deps.bypassSecret;
    while (now() < end) {
      const screen = screens[step % screens.length];
      step += 1;
      if (screen === undefined) return;
      const started = now();
      let status = 0;
      let timing: string | null = null;
      try {
        const response = await deps.fetch(`${base}${screen.path}`, { headers });
        await response.arrayBuffer();
        status = response.status;
        timing = response.headers.get('server-timing');
      } catch {
        status = 0;
      }
      samples.push({ path: screen.path, status, ms: Math.round(now() - started), cold: timingOf(timing, 'cold') === 1, serverMs: timingOf(timing, 'total'), acqMs: timingOf(timing, 'acq') });
      await sleep(options.thinkMs * (0.5 + random()));
    }
  };
  await Promise.all(Array.from({ length: options.users }, (_unused, index) => user(index)));
  return { summary: summarize(samples), signInFailed, samples };
}

/** The report's lines (the job log and its summary page). */
export function reportLines(summary: Summary, samples: readonly Sample[], seconds: number): string[] {
  const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;
  const lines = [
    `requests ${summary.requests} (${(summary.requests / Math.max(1, seconds)).toFixed(1)}/s) · errors ${summary.errors} · statuses ${JSON.stringify(summary.byStatus)}`,
    `within ${TARGET_MS} ms: ${summary.withinTarget}/${summary.requests} = ${pct(summary.share)}`,
    `p50 ${summary.p50} ms · p95 ${summary.p95} ms · p99 ${summary.p99} ms · max ${summary.max} ms · cold starts ${summary.cold}`,
    '',
    '| path | requests | p95 ms | max ms | over 2 s |',
    '|---|---|---|---|---|',
    ...summary.byPath.map((p) => `| ${p.path} | ${p.requests} | ${p.p95} | ${p.max} | ${p.overTarget} |`),
  ];
  const slow = samples.filter((s) => s.ms > TARGET_MS);
  if (slow.length > 0) {
    const avg = (xs: number[]): string => (xs.length === 0 ? '-' : String(Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)));
    lines.push(
      '',
      `over 2 s: ${slow.length} · of them cold starts ${slow.filter((s) => s.cold).length} · no answer ${slow.filter((s) => s.status === 0).length}`,
      `  their mean server total ${avg(slow.flatMap((s) => (s.serverMs === null ? [] : [s.serverMs])))} ms · mean wait for the instance's connection (acq) ${avg(slow.flatMap((s) => (s.acqMs === null ? [] : [s.acqMs])))} ms`,
    );
  }
  return lines;
}
