// The assistant's limits per account (Afik 28.10.2026; BR-092): at most 20 messages in an hour and 60 in a day (24 hours). The thresholds are
// configuration (conventions, "Server": rate limits): ASSISTANT_HOURLY_LIMIT and ASSISTANT_DAILY_LIMIT override the defaults; a value that is
// not a whole number from 1 to 1,000 is ignored. The count is the database's (nestly.assistant_message_counts); the decision is here.

import { ASSISTANT_PER_DAY, ASSISTANT_PER_HOUR } from '@nestly/shared';

export interface AssistantLimits {
  readonly perHour: number;
  readonly perDay: number;
}

type Env = Readonly<Record<string, string | undefined>>;

const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

function readCount(raw: string | undefined, fallback: number): number {
  const value = raw?.trim();
  if (value === undefined || !/^\d{1,4}$/.test(value)) return fallback;
  const n = Number(value);
  return n >= 1 && n <= 1000 ? n : fallback;
}

export function readAssistantLimits(env: Env = process.env): AssistantLimits {
  return {
    perHour: readCount(env['ASSISTANT_HOURLY_LIMIT'], ASSISTANT_PER_HOUR),
    perDay: readCount(env['ASSISTANT_DAILY_LIMIT'], ASSISTANT_PER_DAY),
  };
}

export type LimitDecision = { readonly kind: 'counted'; readonly kept: readonly Date[] } | { readonly kind: 'limited'; readonly kept: readonly Date[] };

/**
 * Whether one more message fits: the instants of the last 24 hours are kept (older ones dropped), and a message is counted when fewer than
 * `perHour` fall in the last hour and fewer than `perDay` in the last day. A refused message is not counted.
 */
export function decideLimit(instants: readonly Date[], now: Date, limits: AssistantLimits): LimitDecision {
  const at = now.getTime();
  const kept = instants.filter((instant) => at - instant.getTime() < DAY_MS).sort((a, b) => a.getTime() - b.getTime());
  const lastHour = kept.filter((instant) => at - instant.getTime() < HOUR_MS).length;
  if (lastHour >= limits.perHour || kept.length >= limits.perDay) return { kind: 'limited', kept };
  return { kind: 'counted', kept: [...kept, now] };
}
