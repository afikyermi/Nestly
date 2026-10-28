// The Nestly assistant (Afik 28.10.2026; FR-AI-001, BR-092, ERR-055, NFR-PRIV-008). The caller is already authenticated. A message is first
// counted against the account's limits in one identity transaction (the database decides who may count: an active Regular or Professional
// account), and only then, outside any transaction, sent to the model: the database is never held while the model answers. A message counted
// and not answered stays counted. Nothing of the conversation is stored or logged.

import type { AssistantTurn } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { decideLimit, type AssistantLimits } from '../assistant/assistant-limits.js';
import type { AssistantFailure, AssistantModel } from '../assistant/assistant-model.js';
import { lockAssistantCount, writeAssistantCount } from '../repositories/assistant-repository.js';

export type AssistantOutcome =
  | { readonly kind: 'ok'; readonly answer: string }
  | { readonly kind: 'not_allowed' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'unavailable'; readonly failure?: AssistantFailure; readonly status?: number };

/** Counts the message against the caller's limits (BR-092): 'counted', 'limited', or 'not_allowed' (staff, a stopped account: 42501). */
export async function countAssistantMessage(database: Database, identity: Identity, limits: AssistantLimits): Promise<'counted' | 'limited' | 'not_allowed'> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const { instants, now } = await lockAssistantCount(tx);
      const decision = decideLimit(instants, now, limits);
      await writeAssistantCount(tx, decision.kept);
      return decision.kind;
    });
  } catch (error) {
    if (readDatabaseFault(error)?.code === '42501') return 'not_allowed';
    throw error;
  }
}

/** POST /api/assistant: unavailable without a key (nothing counted), else counted, then answered by the model or unavailable (ERR-055). */
export async function askAssistant(
  database: Database,
  identity: Identity,
  model: AssistantModel,
  limits: AssistantLimits,
  text: string,
  history: readonly AssistantTurn[],
): Promise<AssistantOutcome> {
  if (!model.available) return { kind: 'unavailable' };
  const counted = await countAssistantMessage(database, identity, limits);
  if (counted === 'not_allowed') return { kind: 'not_allowed' };
  if (counted === 'limited') return { kind: 'rate_limited' };
  const reply = await model.answer(history, text);
  if (reply.kind === 'ok') return { kind: 'ok', answer: reply.answer };
  return { kind: 'unavailable', failure: reply.failure, ...(reply.status === undefined ? {} : { status: reply.status }) };
}
