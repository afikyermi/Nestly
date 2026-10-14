import Fastify, { type FastifyInstance } from 'fastify';
import { createDatabase, type Database } from './db/client.js';
import { readConfig, type ServerConfig } from './lib/config.js';
import { createTokenVerifier } from './lib/token-verifier.js';
import { registerAuthentication } from './plugins/authentication.js';

export interface AppDependencies {
  /** Defaults to the process environment. */
  readonly config?: ServerConfig;
  /**
   * Defaults to a client created from `config.databaseUrl` and closed with the app. One passed in stays the caller's
   * to close.
   */
  readonly database?: Database;
}

export function buildApp(deps: AppDependencies = {}): FastifyInstance {
  const app = Fastify();
  const config = deps.config ?? readConfig(process.env);
  for (const issue of config.issues) app.log.warn(`configuration: ${issue}`);

  let database = deps.database;
  if (database === undefined && config.databaseUrl !== undefined) {
    const owned = createDatabase(config.databaseUrl);
    app.addHook('onClose', () => owned.close());
    database = owned;
  }

  registerAuthentication(app, {
    verifier: config.auth === undefined ? undefined : createTokenVerifier(config.auth),
    database,
  });

  // A raw error — from the database, a library or Fastify itself — never reaches the response (conventions, "User-facing
  // errors"): a database message names tables and policies. The detail goes to the log.
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'bad_request' });
    }
    return reply.code(500).send({ error: 'internal' });
  });

  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
