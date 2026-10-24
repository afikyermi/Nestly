// Professionals and services (I11). Signed in: the authentication hook has run before anything here (401 before the body is read, and no
// query). No body or path names the caller; the database binds the owner, the follower, the Professional and the reviewer to the token's user.
//   POST   /api/register/professional { fullName, businessName, gender, field, fieldOther, yearsExperience, area, about, priceFrom, consent }
//                                                       → 201 { status: 'created' } · 409 already_registered (FR-PROREG-001/002)
//   GET    /api/account/kind                            → 200 { kind: regular | professional | staff | none } (which product to show)
//   GET    /api/professionals?field&area&minRating&maxPrice&minYears&sort → 200 { professionals } (FR-SERV-001/002, AC-009)
//   GET    /api/professionals/following                 → 200 { professionals } (PG-039: the Professionals the caller follows)
//   GET    /api/professionals/:id                       → 200 the profile page · 404 unavailable (FR-SERV-003)
//   PUT    /api/professionals/:id/follow · DELETE      → 204 · 403 not_allowed (FR-FOLLOW-001, AC-035)
//   POST   /api/professionals/:id/reviews { rating, text } → 201 · 403 not_allowed · 409 already_done (FR-SERV-011, AC-093)
//   PUT    /api/professional/profile { …profile }       → 204 · 403 not_allowed (the owner's edit)
//   GET    /api/professional/home                       → 200 { dashboard, helpRequests } · 403 not_allowed (FR-PRO-001, AC-018)
//   POST   /api/professional/articles { title, body, field, status } → 201 { id } · 403 (FR-PRO-003)
//   PUT    /api/professional/articles/:id · DELETE      → 204 · 404 unavailable (AC-094: the owner only)
//   POST   /api/posts/:id/offer-help { text }           → 201 { id } · 403 not_allowed · 409 already_done · 429 rate_limited (FR-SERV-005/008, AC-014)
//   GET    /api/outreach                                → 200 { received, sent }
//   POST   /api/outreach/:id/accept                     → 200 { conversationId } · 404 unavailable (FR-SERV-006, AC-012/013)
//   POST   /api/outreach/:id/decline                    → 204 · 404 unavailable
//   all: 400 invalid · 401/503 session guard · 503 · 500 server_error. Other methods → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never an id or a text.

import {
  articleSchema,
  directoryQuerySchema,
  offerHelpSchema,
  professionalIdParams,
  professionalPageQuerySchema,
  professionalProfileSchema,
  professionalRegistrationSchema,
  reviewSchema,
} from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import type { Identity } from '../lib/token-verifier.js';
import { notAllowedMethod, replyChatFailure } from './chat.js';
import {
  acceptOutreach,
  changeFollow,
  createArticle,
  declineOutreach,
  editArticle,
  editOwnProfile,
  listFollowing,
  listOutreach,
  listProfessionals,
  offerHelp,
  readAccountKind,
  readProfessional,
  readProfessionalHome,
  registerProfessional,
  removeArticle,
  writeReview,
  type ProOutcome,
  type ProRefusal,
} from '../services/professionals-service.js';

export interface ProfessionalsRouteDependencies {
  readonly database: Database | undefined;
}

const STATUS: Record<ProRefusal['kind'], number> = { invalid: 400, unavailable: 404, not_allowed: 403, already_done: 409, rate_limited: 429 };

/** Runs a call for a signed-in caller and answers its outcome: `shape` on success (null: 204), the refusal's status otherwise. */
async function answer<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  database: Database | undefined,
  line: string,
  call: (database: Database, identity: Identity) => Promise<ProOutcome<T>>,
  shape: (ok: T) => unknown,
  status = 200,
): Promise<FastifyReply> {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await call(database, identity);
    if (outcome.kind !== 'ok') return reply.code(STATUS[outcome.kind]).send({ error: outcome.kind });
    const body = shape(outcome);
    return body === null ? reply.code(204).send() : reply.code(status).send(body);
  } catch (error) {
    return replyChatFailure(request, reply, error, line);
  }
}

const invalid = (reply: FastifyReply) => reply.code(400).header('cache-control', 'no-store').send({ error: 'invalid' });

const ALL = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
type Method = (typeof ALL)[number];

export function registerProfessionalsRoutes(app: FastifyInstance, deps: ProfessionalsRouteDependencies): void {
  const db = () => deps.database;
  const others = (url: string, allowed: readonly Method[]) =>
    app.route({ method: ALL.filter((method) => !allowed.includes(method)), url, handler: notAllowedMethod(allowed.join(', ')) });
  const idOf = (request: FastifyRequest) => professionalIdParams.safeParse(request.params);

  app.post('/api/register/professional', { bodyLimit: 32 * 1024 }, (request, reply) => {
    const body = professionalRegistrationSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    const { fullName, businessName, gender, field, fieldOther, yearsExperience, area, about, priceFrom } = body.data;
    const profile = { fullName, businessName, gender, field, fieldOther, yearsExperience, area, about, priceFrom };
    return answer(
      request,
      reply,
      db(),
      'professional registration failed',
      async (database, identity) => {
        const outcome = await registerProfessional(database, identity, profile);
        if (outcome.kind === 'created') return { kind: 'ok' as const };
        return outcome.kind === 'already_registered' ? { kind: 'already_done' as const } : outcome;
      },
      () => ({ status: 'created' }),
      201,
    );
  });
  others('/api/register/professional', ['POST']);

  app.get('/api/account/kind', (request, reply) =>
    answer(request, reply, db(), 'account kind failed', async (database, identity) => ({ kind: 'ok' as const, value: await readAccountKind(database, identity) }), (ok) => ({ kind: ok.value })),
  );
  others('/api/account/kind', ['GET']);

  app.get('/api/professionals', (request, reply) => {
    const query = directoryQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(reply);
    return answer(
      request,
      reply,
      db(),
      'directory failed',
      async (database, identity) => ({ kind: 'ok' as const, ...(await listProfessionals(database, identity, query.data)) }),
      (ok) => ({ professionals: ok.professionals, promoted: ok.promoted }),
    );
  });
  others('/api/professionals', ['GET']);

  app.get('/api/professionals/following', (request, reply) =>
    answer(
      request,
      reply,
      db(),
      'following failed',
      async (database, identity) => ({ kind: 'ok' as const, professionals: await listFollowing(database, identity) }),
      (ok) => ({ professionals: ok.professionals }),
    ),
  );
  others('/api/professionals/following', ['GET']);

  app.get('/api/professionals/:id', (request, reply) => {
    const id = idOf(request);
    const query = professionalPageQuerySchema.safeParse(request.query);
    if (!id.success || !query.success) return invalid(reply);
    return answer(request, reply, db(), 'professional page failed', (database, identity) => readProfessional(database, identity, id.data.id, query.data.promotion), (ok) => ok.page);
  });
  others('/api/professionals/:id', ['GET']);

  const follow = (on: boolean) => (request: FastifyRequest, reply: FastifyReply) => {
    const id = idOf(request);
    if (!id.success || request.body !== undefined) return invalid(reply);
    return answer(request, reply, db(), 'follow change failed', (database, identity) => changeFollow(database, identity, id.data.id, on), () => null);
  };
  app.put('/api/professionals/:id/follow', follow(true));
  app.delete('/api/professionals/:id/follow', follow(false));
  others('/api/professionals/:id/follow', ['PUT', 'DELETE']);

  app.post('/api/professionals/:id/reviews', (request, reply) => {
    const id = idOf(request);
    const body = reviewSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'review failed', (database, identity) => writeReview(database, identity, id.data.id, body.data), () => ({ status: 'created' }), 201);
  });
  others('/api/professionals/:id/reviews', ['POST']);

  app.put('/api/professional/profile', (request, reply) => {
    const body = professionalProfileSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    return answer(request, reply, db(), 'professional profile edit failed', (database, identity) => editOwnProfile(database, identity, body.data), () => null);
  });
  others('/api/professional/profile', ['PUT']);

  app.get('/api/professional/home', (request, reply) =>
    answer(request, reply, db(), 'professional home failed', (database, identity) => readProfessionalHome(database, identity), (ok) => ({
      dashboard: ok.dashboard,
      helpRequests: ok.helpRequests,
    })),
  );
  others('/api/professional/home', ['GET']);

  app.post('/api/professional/articles', (request, reply) => {
    const body = articleSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    return answer(request, reply, db(), 'article create failed', (database, identity) => createArticle(database, identity, body.data), (ok) => ({ id: ok.id }), 201);
  });
  others('/api/professional/articles', ['POST']);

  app.put('/api/professional/articles/:id', (request, reply) => {
    const id = idOf(request);
    const body = articleSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'article edit failed', (database, identity) => editArticle(database, identity, id.data.id, body.data), () => null);
  });
  app.delete('/api/professional/articles/:id', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'article delete failed', (database, identity) => removeArticle(database, identity, id.data.id), () => null);
  });
  others('/api/professional/articles/:id', ['PUT', 'DELETE']);

  app.post('/api/posts/:id/offer-help', (request, reply) => {
    const id = idOf(request);
    const body = offerHelpSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'offer help failed', (database, identity) => offerHelp(database, identity, id.data.id, body.data.text), (ok) => ({ id: ok.id }), 201);
  });
  others('/api/posts/:id/offer-help', ['POST']);

  app.get('/api/outreach', (request, reply) =>
    answer(request, reply, db(), 'outreach list failed', async (database, identity) => ({ kind: 'ok' as const, ...(await listOutreach(database, identity)) }), (ok) => ({
      received: ok.received,
      sent: ok.sent,
    })),
  );
  others('/api/outreach', ['GET']);

  app.post('/api/outreach/:id/accept', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'outreach accept failed', (database, identity) => acceptOutreach(database, identity, id.data.id), (ok) => ({ conversationId: ok.conversationId }));
  });
  others('/api/outreach/:id/accept', ['POST']);

  app.post('/api/outreach/:id/decline', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'outreach decline failed', (database, identity) => declineOutreach(database, identity, id.data.id), () => null);
  });
  others('/api/outreach/:id/decline', ['POST']);
}
