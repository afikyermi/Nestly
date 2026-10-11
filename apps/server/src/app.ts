import Fastify, { type FastifyInstance } from 'fastify';

export function buildApp(): FastifyInstance {
  const app = Fastify();

  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
