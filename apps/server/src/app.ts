import Fastify, { type FastifyInstance } from 'fastify';

export function buildApp(): FastifyInstance {
  const app = Fastify();

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
