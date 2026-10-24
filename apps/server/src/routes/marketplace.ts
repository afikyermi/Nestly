// Marketplace (I12; FR-MKT-001/002/003/005, FR-ADMIN-009, FR-ALG-006). Signed in: the authentication hook has run before anything here (401
// before the body is read, and no query). No body or path names the caller; the database binds the owner, the sender and the Admin to the token's
// user, and decides who may do what.
//   POST   /api/marketplace { q, category, city, condition, free, maxPrice, sort } → 200 { listings, sponsored } (FR-MKT-001, FR-ALG-006; a POST so
//          the typed text never rides in an address or a log line, as the global search's)
//   GET    /api/marketplace/mine                                         → 200 { listings } (the caller's own, every state)
//   POST   /api/marketplace/listings { title, category, condition, price, city, imageIds } → 201 { id } · 403 not_allowed (not a Regular)
//   GET    /api/marketplace/listings/:id                                 → 200 the listing page · 404 unavailable (FR-MKT-005)
//   PUT    /api/marketplace/listings/:id { …listing }                    → 204 · 404 unavailable (the owner only)
//   DELETE /api/marketplace/listings/:id                                 → 204 · 404 unavailable (deleted at once)
//   POST   /api/marketplace/listings/:id/status { status }               → 204 · 404 unavailable (sold/given, or back)
//   DELETE /api/marketplace/listings/:id/images/:imageId                 → 204 · 404 unavailable
//   POST   /api/marketplace/listings/:id/contact { text }                → 200 { conversationId } · 404 unavailable · 403 not_allowed (FR-MKT-005, AC-059)
//   staff (MARKETPLACE_MODERATE / SPONSORED_PRODUCT_MANAGE; 403 forbidden without the key):
//   POST   /api/admin/listings/search { search }                         → 200 { listings } (the text in a body, never an address)
//   POST   /api/admin/listings/:id/visibility { hidden, reason }         → 200 {} · 404 not_found (audited)
//   GET    /api/admin/sponsored                                          → 200 { items }
//   POST   /api/admin/sponsored { …product }                             → 201 the product (a draft; audited)
//   PATCH  /api/admin/sponsored/:id { …product }                         → 200 the product · 404 not_found
//   POST   /api/admin/sponsored/:id/status { status }                    → 200 the product · 400 invalid (a move the lifecycle refuses)
//   all: 400 invalid · 401/503 session guard · 503 · 500 server_error. Other methods → 405 with Allow.
// Logs carry a fixed line and the SQLSTATE, never an id, a title or a text.

import {
  listingContactSchema,
  listingIdParams,
  listingSchema,
  listingStatusSchema,
  listingVisibilitySchema,
  marketplaceQuerySchema,
  sponsoredSchema,
  sponsoredStatusSchema,
} from '@nestly/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import type { Identity } from '../lib/token-verifier.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { notAllowedMethod, replyChatFailure } from './chat.js';
import {
  changeListingStatus,
  changeListingVisibility,
  changeSponsoredStatus,
  contactSeller,
  createListing,
  createSponsored,
  editListing,
  editSponsored,
  listMarketplace,
  listOwnListings,
  listSponsored,
  listStaffListings,
  readListingPage,
  removeListingImage,
  removeOwnListing,
  type MarketOutcome,
  type MarketRefusal,
} from '../services/marketplace-service.js';

export interface MarketplaceRouteDependencies {
  readonly database: Database | undefined;
  readonly storage?: MediaStorage | undefined;
}

const USER_STATUS: Record<MarketRefusal['kind'], [number, string]> = {
  invalid: [400, 'invalid'],
  unavailable: [404, 'unavailable'],
  not_allowed: [403, 'not_allowed'],
  already_done: [409, 'already_done'],
  forbidden: [403, 'not_allowed'],
};
/** The admin screens read the admin codes (forbidden, not_found, invalid). */
const STAFF_STATUS: Record<MarketRefusal['kind'], [number, string]> = {
  invalid: [400, 'invalid'],
  unavailable: [404, 'not_found'],
  not_allowed: [403, 'forbidden'],
  already_done: [400, 'invalid'],
  forbidden: [403, 'forbidden'],
};

async function answer<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  database: Database | undefined,
  line: string,
  call: (database: Database, identity: Identity) => Promise<MarketOutcome<T>>,
  shape: (ok: T) => unknown,
  status = 200,
  codes = USER_STATUS,
): Promise<FastifyReply> {
  reply.header('cache-control', 'no-store');
  const { identity } = request;
  if (identity === null || database === undefined) return reply.code(503).send({ error: 'unavailable' });
  try {
    const outcome = await call(database, identity);
    if (outcome.kind !== 'ok') {
      const [code, error] = codes[outcome.kind];
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
const imageParams = z.object({ id: z.guid(), imageId: z.guid() });
const staffSearch = z.strictObject({ search: z.string().max(400).optional() });

const ALL = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
type Method = (typeof ALL)[number];

export function registerMarketplaceRoutes(app: FastifyInstance, deps: MarketplaceRouteDependencies): void {
  const db = () => deps.database;
  const storage = deps.storage;
  const others = (url: string, allowed: readonly Method[]) =>
    app.route({ method: ALL.filter((method) => !allowed.includes(method)), url, handler: notAllowedMethod(allowed.join(', ')) });
  const idOf = (request: FastifyRequest) => listingIdParams.safeParse(request.params);

  app.post('/api/marketplace', { bodyLimit: 4 * 1024 }, (request, reply) => {
    const query = marketplaceQuerySchema.safeParse(request.body ?? {});
    if (!query.success) return invalid(reply);
    return answer(request, reply, db(), 'marketplace failed', async (database, identity) => ok(await listMarketplace(database, identity, storage, query.data)), (v) => ({
      listings: v.listings,
      sponsored: v.sponsored,
      promoted: v.promoted,
    }));
  });
  others('/api/marketplace', ['POST']);

  app.get('/api/marketplace/mine', (request, reply) =>
    answer(request, reply, db(), 'own listings failed', async (database, identity) => ok({ listings: await listOwnListings(database, identity, storage) }), (v) => ({ listings: v.listings })),
  );
  others('/api/marketplace/mine', ['GET']);

  app.post('/api/marketplace/listings', { bodyLimit: 16 * 1024 }, (request, reply) => {
    const body = listingSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    return answer(request, reply, db(), 'listing create failed', (database, identity) => createListing(database, identity, body.data), (v) => ({ id: v.id }), 201);
  });
  others('/api/marketplace/listings', ['POST']);

  app.get('/api/marketplace/listings/:id', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'listing page failed', (database, identity) => readListingPage(database, identity, storage, id.data.id), (v) => v.page);
  });
  app.put('/api/marketplace/listings/:id', { bodyLimit: 16 * 1024 }, (request, reply) => {
    const id = idOf(request);
    const body = listingSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'listing edit failed', (database, identity) => editListing(database, identity, id.data.id, body.data), () => null);
  });
  app.delete('/api/marketplace/listings/:id', (request, reply) => {
    const id = idOf(request);
    if (!id.success) return invalid(reply);
    return answer(request, reply, db(), 'listing delete failed', (database, identity) => removeOwnListing(database, identity, id.data.id), () => null);
  });
  others('/api/marketplace/listings/:id', ['GET', 'PUT', 'DELETE']);

  app.post('/api/marketplace/listings/:id/status', (request, reply) => {
    const id = idOf(request);
    const body = listingStatusSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'listing status failed', (database, identity) => changeListingStatus(database, identity, id.data.id, body.data.status), () => null);
  });
  others('/api/marketplace/listings/:id/status', ['POST']);

  app.delete('/api/marketplace/listings/:id/images/:imageId', (request, reply) => {
    const params = imageParams.safeParse(request.params);
    if (!params.success) return invalid(reply);
    return answer(request, reply, db(), 'listing image delete failed', (database, identity) => removeListingImage(database, identity, params.data.id, params.data.imageId), () => null);
  });
  others('/api/marketplace/listings/:id/images/:imageId', ['DELETE']);

  app.post('/api/marketplace/listings/:id/contact', (request, reply) => {
    const id = idOf(request);
    const body = listingContactSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'listing contact failed', (database, identity) => contactSeller(database, identity, id.data.id, body.data.text), (v) => ({
      conversationId: v.conversationId,
    }));
  });
  others('/api/marketplace/listings/:id/contact', ['POST']);

  // ---- staff ----------------------------------------------------------------------------------------------------------------------
  const staff = <T>(request: FastifyRequest, reply: FastifyReply, line: string, call: (database: Database, identity: Identity) => Promise<MarketOutcome<T>>, shape: (v: T) => unknown, status = 200) =>
    answer(request, reply, db(), line, call, shape, status, STAFF_STATUS);

  app.post('/api/admin/listings/search', { bodyLimit: 4 * 1024 }, (request, reply) => {
    const query = staffSearch.safeParse(request.body ?? {});
    if (!query.success) return invalid(reply);
    return staff(request, reply, 'staff listings failed', (database, identity) => listStaffListings(database, identity, storage, query.data.search ?? ''), (v) => ({ listings: v.listings }));
  });
  others('/api/admin/listings/search', ['POST']);

  app.post('/api/admin/listings/:id/visibility', (request, reply) => {
    const id = idOf(request);
    const body = listingVisibilitySchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return staff(request, reply, 'listing visibility failed', (database, identity) => changeListingVisibility(database, identity, id.data.id, body.data), () => ({}));
  });
  others('/api/admin/listings/:id/visibility', ['POST']);

  app.get('/api/admin/sponsored', (request, reply) =>
    staff(request, reply, 'sponsored list failed', (database, identity) => listSponsored(database, identity, storage), (v) => ({ items: v.items })),
  );
  app.post('/api/admin/sponsored', { bodyLimit: 16 * 1024 }, (request, reply) => {
    const body = sponsoredSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    return staff(request, reply, 'sponsored create failed', (database, identity) => createSponsored(database, identity, storage, body.data), (v) => v.item, 201);
  });
  others('/api/admin/sponsored', ['GET', 'POST']);

  app.patch('/api/admin/sponsored/:id', { bodyLimit: 16 * 1024 }, (request, reply) => {
    const id = idOf(request);
    const body = sponsoredSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return staff(request, reply, 'sponsored edit failed', (database, identity) => editSponsored(database, identity, storage, id.data.id, body.data), (v) => v.item);
  });
  others('/api/admin/sponsored/:id', ['PATCH']);

  app.post('/api/admin/sponsored/:id/status', (request, reply) => {
    const id = idOf(request);
    const body = sponsoredStatusSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return staff(request, reply, 'sponsored status failed', (database, identity) => changeSponsoredStatus(database, identity, storage, id.data.id, body.data.status), (v) => v.item);
  });
  others('/api/admin/sponsored/:id/status', ['POST']);
}
