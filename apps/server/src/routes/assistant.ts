// The Nestly assistant (Afik 28.10.2026; FR-AI-001). Signed in: the authentication hook has run before anything here. No body names the caller.
//   GET  /api/assistant                     → 200 { available }: whether the assistant has its service key (no database, nothing counted)
//   POST /api/assistant { text, history }   → 200 { answer } · 400 invalid · 403 not_allowed (staff, a stopped account) · 429 rate_limited
//                                             (BR-092) · 503 unavailable (no key, the model failed, was too slow or out of quota: ERR-055)
//   all: 401/503 session guard · 500. Other methods → 405 with Allow.
// Logs carry a fixed line, the failure's kind and the model's HTTP status, never a text (NFR-PRIV-008).

import { assistantMessageSchema } from '@nestly/shared';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import type { AssistantLimits } from '../assistant/assistant-limits.js';
import type { AssistantModel } from '../assistant/assistant-model.js';
import { askAssistant } from '../services/assistant-service.js';
import { notAllowedMethod, replyChatFailure } from './chat.js';

export interface AssistantRouteDependencies {
  readonly database: Database | undefined;
  readonly model: AssistantModel;
  readonly limits: AssistantLimits;
}

const URL = '/api/assistant';
const STATUS = { not_allowed: 403, rate_limited: 429, unavailable: 503 } as const;

export function registerAssistantRoutes(app: FastifyInstance, deps: AssistantRouteDependencies): void {
  app.get(URL, (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (request.identity === null) return reply.code(503).send({ error: 'unavailable' });
    return reply.send({ available: deps.model.available });
  });

  app.post(URL, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const body = assistantMessageSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const { identity } = request;
    const database = deps.database;
    if (identity === null || database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      const outcome = await askAssistant(database, identity, deps.model, deps.limits, body.data.text, body.data.history);
      if (outcome.kind === 'ok') return reply.send({ answer: outcome.answer });
      if (outcome.kind === 'unavailable' && outcome.failure !== undefined) {
        request.log.warn({ failure: outcome.failure, status: outcome.status }, 'assistant model failed');
      }
      return reply.code(STATUS[outcome.kind]).send({ error: outcome.kind });
    } catch (error) {
      return replyChatFailure(request, reply, error, 'assistant failed');
    }
  });

  app.route({ method: ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: URL, handler: notAllowedMethod('GET, POST') });
}
