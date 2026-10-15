import Fastify, { type FastifyInstance } from 'fastify';
import { createDatabase, type Database } from './db/client.js';
import { readConfig, type ServerConfig } from './lib/config.js';
import { createTokenVerifier } from './lib/token-verifier.js';
import { registerAuthentication } from './plugins/authentication.js';
import { registerRegistrationRoute } from './routes/register.js';
import { registerStripBypassHeader } from './plugins/strip-bypass-header.js';

export interface AppDependencies {
  /** Defaults to the process environment. */
  readonly config?: ServerConfig;
  /**
   * Defaults to a client created from `config.databaseUrl` and closed with the app. One passed in stays the caller's
   * to close.
   */
  readonly database?: Database;
  /** Where the logger writes. Defaults to no logger; a test passes one to read what would be logged. */
  readonly logStream?: { write(message: string): void };
  /** The server's clock, for rules that compare with today. Defaults to the system clock. */
  readonly clock?: () => Date;
}

export function buildApp(deps: AppDependencies = {}): FastifyInstance {
  const app = Fastify({ logger: deps.logStream === undefined ? false : { level: 'trace', stream: deps.logStream } });
  const config = deps.config ?? readConfig(process.env);
  for (const issue of config.issues) app.log.warn(`configuration: ${issue}`);

  let database = deps.database;
  if (database === undefined && config.databaseUrl !== undefined) {
    const owned = createDatabase(config.databaseUrl);
    app.addHook('onClose', () => owned.close());
    database = owned;
  }

  // Before authentication: the first onRequest hook of the app.
  registerStripBypassHeader(app);

  registerAuthentication(app, {
    verifier: config.auth === undefined ? undefined : createTokenVerifier(config.auth),
    database,
  });

  // A raw error — from the database, a library or Fastify itself — never reaches the response (conventions, "User-facing
  // errors"): a database message names tables and policies. The detail goes to the log.
  app.setErrorHandler((error, request, reply) => {
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    // Never the error object: a body-parse message quotes the request body (NFR-PRIV-001).
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
    request.log.error({ status, code, name }, 'request failed');
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'bad_request' });
    }
    return reply.code(500).send({ error: 'internal' });
  });

  app.get('/api/health', () => ({ status: 'ok' }));
  registerRegistrationRoute(app, { database, clock: deps.clock ?? (() => new Date()) });

  return app;
}
