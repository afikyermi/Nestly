// Monetization (I13; FR-SERV-010, FR-MKT-004, FR-PRO-002, NFR-SEC-007, PG-041, PG-042, PG-059). Signed in: the authentication hook has run
// before anything here (401 before the body is read, and no query). No body or path names the caller; the database binds the payer, the owner and
// the viewer to the token's user, and decides who may buy, stop, read and count what.
//   GET    /api/promotions                      → 200 { plans, promotions, posts, analytics } (the caller's own; plans "מחיר לדוגמה")
//   POST   /api/promotions { planKey, target }  → 201 { promotionId, receipt } (a simulated payment and its promotion, together; AC-098)
//                                                 · 409 already_promoted / 403 not_allowed (ERR-047) · 404 unavailable
//   POST   /api/promotions/:id/stop             → 204 · 404 unavailable (the owner, a running promotion)
//   POST   /api/promotions/:id/click            → 204 · 403 not_allowed (a viewer opened a promoted unit: a paid click)
//   GET    /api/promotions/billing              → 200 { payments } (PG-042: the caller's simulated payments)
//   GET    /api/admin/promotions                → 200 { totals, promotions, isFinance } · 403 forbidden (§11.1: the Admin; a Moderator with
//                                                 CONTENT_MODERATE / MARKETPLACE_MODERATE sees the promotions of its keys)
//   POST   /api/admin/promotions/:id/stop { reason } → 204 · 404 unavailable · 403 forbidden (§11.1: audited, no refund)
//   GET    /api/admin/promotion-settings        → 200 { versions } · 403 forbidden (§11.2: BILLING_FINANCE_MANAGE)
//   POST   /api/admin/promotion-settings { … }  → 201 { version } · 403 forbidden (§11.2, BR-059: a new version with a reason)
//   all: 400 invalid · 401/503 session guard · 503 · 500 server_error. Other methods → 405 with Allow.
// No route here reads a query string. Logs carry a fixed line and the SQLSTATE, never an id, a plan or a target.

import { promotionIdParams, promotionPurchaseSchema, promotionSettingsWriteSchema, promotionStopSchema } from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import type { Identity } from '../lib/token-verifier.js';
import { notAllowedMethod, replyChatFailure } from './chat.js';
import {
  buyPromotion,
  readAdminView,
  readBilling,
  readOverview,
  readSettings,
  recordPromotionEvent,
  staffStop,
  stopOwnPromotion,
  writeSettings,
  type PromotionOutcome,
  type PromotionRefusal,
} from '../services/promotions-service.js';

export interface PromotionsRouteDependencies {
  readonly database: Database | undefined;
}

const STATUS: Record<PromotionRefusal['kind'], [number, string]> = {
  invalid: [400, 'invalid'],
  unavailable: [404, 'unavailable'],
  not_allowed: [403, 'not_allowed'],
  already_promoted: [409, 'already_promoted'],
  forbidden: [403, 'forbidden'],
};

async function answer<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  database: Database | undefined,
  line: string,
  call: (database: Database, identity: Identity) => Promise<PromotionOutcome<T>>,
  shape: (ok: T) => unknown,
  status = 200,
): Promise<FastifyReply> {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await call(database, identity);
    if (outcome.kind !== 'ok') {
      const [code, error] = STATUS[outcome.kind];
      return reply.code(code).send({ error });
    }
    const body = shape(outcome);
    return body === null ? reply.code(204).send() : reply.code(status).send(body);
  } catch (error) {
    return replyChatFailure(request, reply, error, line);
  }
}

const invalid = (reply: FastifyReply) => reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });
const ok = <T extends object>(value: T) => ({ kind: 'ok' as const, ...value });

const ALL = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
type Method = (typeof ALL)[number];

export function registerPromotionsRoutes(app: FastifyInstance, deps: PromotionsRouteDependencies): void {
  const db = () => deps.database;
  const others = (url: string, allowed: readonly Method[]) =>
    app.route({ method: ALL.filter((method) => !allowed.includes(method)), url, handler: notAllowedMethod(allowed.join(', ')) });
  const idOf = (request: FastifyRequest) => promotionIdParams.safeParse(request.params);

  app.get('/api/promotions', (request, reply) =>
    answer(request, reply, db(), 'promotions overview failed', async (database, identity) => ok({ overview: await readOverview(database, identity) }), (v) => v.overview),
  );
  app.post('/api/promotions', { bodyLimit: 2 * 1024 }, (request, reply) => {
    const body = promotionPurchaseSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    return answer(request, reply, db(), 'promotion purchase failed', (database, identity) => buyPromotion(database, identity, body.data), (v) => ({
      promotionId: v.promotionId,
      receipt: v.receipt,
    }), 201);
  });
  others('/api/promotions', ['GET', 'POST']);

  app.get('/api/promotions/billing', (request, reply) =>
    answer(request, reply, db(), 'billing failed', async (database, identity) => ok({ payments: await readBilling(database, identity) }), (v) => ({ payments: v.payments })),
  );
  others('/api/promotions/billing', ['GET']);

  app.post('/api/promotions/:id/stop', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'promotion stop failed', (database, identity) => stopOwnPromotion(database, identity, id.data.id), () => null);
  });
  others('/api/promotions/:id/stop', ['POST']);

  app.post('/api/promotions/:id/click', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'promotion click failed', (database, identity) => recordPromotionEvent(database, identity, id.data.id, 'click'), () => null);
  });
  others('/api/promotions/:id/click', ['POST']);

  app.post('/api/promotions/:id/impression', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'promotion impression failed', (database, identity) => recordPromotionEvent(database, identity, id.data.id, 'impression'), () => null);
  });
  others('/api/promotions/:id/impression', ['POST']);

  app.get('/api/admin/promotions', (request, reply) =>
    answer(request, reply, db(), 'admin promotions failed', (database, identity) => readAdminView(database, identity), (v) => v.view),
  );
  others('/api/admin/promotions', ['GET']);

  app.post('/api/admin/promotions/:id/stop', { bodyLimit: 2 * 1024 }, (request, reply) => {
    const id = idOf(request);
    const body = promotionStopSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'staff promotion stop failed', (database, identity) => staffStop(database, identity, id.data.id, body.data), () => null);
  });
  others('/api/admin/promotions/:id/stop', ['POST']);

  app.get('/api/admin/promotion-settings', (request, reply) =>
    answer(request, reply, db(), 'promotion settings failed', (database, identity) => readSettings(database, identity), (v) => v.settings),
  );
  app.post('/api/admin/promotion-settings', { bodyLimit: 2 * 1024 }, (request, reply) => {
    const body = promotionSettingsWriteSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    return answer(request, reply, db(), 'promotion settings write failed', (database, identity) => writeSettings(database, identity, body.data), (v) => ({ version: v.version }), 201);
  });
  others('/api/admin/promotion-settings', ['GET', 'POST']);
}
