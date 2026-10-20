// GET /api/home (I6; FR-HOME-001, FR-HOME-004, FR-ALG-004 stage part, AC-006, AC-069, AC-095). The caller's contexts by journey stage,
// the PUBLISHED guides that match them (drafts and hidden guides are invisible to every user, in the database), and the ovulation
// window when a cycle is tracked. Tracker data is not read: without an approved mapping the signal is ignored (AC-069).
//   GET → 200 { contexts, guides, cycle } · 403 account_unavailable · 404 no_profile · 401/503 · 500; other methods → 405.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { israelDay } from '@nestly/shared';
import { readHome } from '../services/trackers-service.js';
import { notAllowed, replyFailure, replyOutcome } from './tracker-reply.js';

export interface HomeRouteDependencies {
  readonly database: Database | undefined;
  readonly clock: () => Date;
}

async function read(request: FastifyRequest, reply: FastifyReply, deps: HomeRouteDependencies) {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    return replyOutcome(reply, await readHome(deps.database, identity, israelDay(deps.clock())), 200, (home) => home);
  } catch (error) {
    return replyFailure(request, reply, error, 'home read failed');
  }
}

export function registerHomeRoute(app: FastifyInstance, deps: HomeRouteDependencies): void {
  app.route({ method: 'GET', url: '/api/home', handler: (request, reply) => read(request, reply, deps) });
  app.route({ method: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], url: '/api/home', handler: notAllowed('GET') });
}
