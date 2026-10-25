// A Professional's reviews (I11; FR-SERV-011, AC-093; I11 completion C §11.21: one per parent per Professional, edited and deleted by its
// writer). Registered by registerProfessionalsRoutes, with its answer helper and the same refusal statuses. No body names the reviewer: the
// database binds it to the token's user, and an edit or a delete reaches the caller's own review only (professional_reviews_*_reviewer).
//   POST   /api/professionals/:id/reviews { rating, text } → 201 { status: 'created' } · 403 not_allowed · 409 already_done (one per parent)
//   PUT    /api/professionals/:id/reviews { rating, text } → 204 · 404 unavailable (no own active review) · 403 not_allowed
//   DELETE /api/professionals/:id/reviews (no body)       → 204 · 404 unavailable
// Logs carry a fixed line and the SQLSTATE, never an id or a text.

import { reviewSchema } from '@nestly/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { editReview, removeReview, writeReview } from '../services/professionals-service.js';
import { answer, invalid } from './professionals.js';

type IdOf = (request: FastifyRequest) => { success: true; data: { id: string } } | { success: false };

export function registerReviewRoutes(app: FastifyInstance, db: () => Database | undefined, idOf: IdOf): void {
  app.post('/api/professionals/:id/reviews', (request, reply) => {
    const id = idOf(request);
    const body = reviewSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'review failed', (database, identity) => writeReview(database, identity, id.data.id, body.data), () => ({ status: 'created' }), 201);
  });
  app.put('/api/professionals/:id/reviews', (request, reply) => {
    const id = idOf(request);
    const body = reviewSchema.safeParse(request.body);
    if (!id.success || !body.success) return invalid(reply);
    return answer(request, reply, db(), 'review edit failed', (database, identity) => editReview(database, identity, id.data.id, body.data), () => null);
  });
  app.delete('/api/professionals/:id/reviews', (request, reply) => {
    const id = idOf(request);
    if (!id.success || request.body !== undefined) return invalid(reply);
    return answer(request, reply, db(), 'review delete failed', (database, identity) => removeReview(database, identity, id.data.id), () => null);
  });
}
