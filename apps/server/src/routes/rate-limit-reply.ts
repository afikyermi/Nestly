// The one answer to a refused profile open (I2 F2.4c1; NFR-SEC-006 (2), ERR-032): 429 `rate_limited`, a fixed body. Never a threshold, a
// window, a remaining count or a reset time, and no Retry-After header. A limit that is missing or invalid is the same answer to the
// caller and one logged server error (c22): a fixed line, no id, no name.

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RateLimited } from '../lib/profile-open-limit.js';

export function replyRateLimited(request: FastifyRequest, reply: FastifyReply, limited: RateLimited): FastifyReply {
  if (limited.misconfigured) request.log.error({ sqlstate: 'NS001' }, 'profile open limit missing or invalid');
  return reply.code(429).send({ error: 'rate_limited' });
}
