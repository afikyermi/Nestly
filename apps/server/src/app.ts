import Fastify, { type FastifyInstance } from 'fastify';
import { createDatabase, type Database } from './db/client.js';
import { readConfig, type ServerConfig } from './lib/config.js';
import { createTokenVerifier } from './lib/token-verifier.js';
import { registerAuthentication } from './plugins/authentication.js';
import { registerMeRoute } from './routes/me.js';
import { createRecoveryDependencies, type RecoveryDependencies } from './recovery/dependencies.js';
import { registerRecoveryQuestionsRoute } from './routes/recovery-questions.js';
import { registerRecoveryResetRoute } from './routes/recovery-reset.js';
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
  /** Recovery's pepper, scrypt and Auth calls. Defaults read the environment (recovery/dependencies.ts); a test overrides what it needs. */
  readonly recovery?: Partial<RecoveryDependencies>;
}

export function buildApp(deps: AppDependencies = {}): FastifyInstance {
  // trustProxy trusts one hop only, the one in front of the server (Vercel's edge): `request.ip` is then the entry that hop
  // added to X-Forwarded-For, never a leftmost value the client supplied. The password-recovery limits and audit hash it.
  // The logger's request line carries the method and the path only: the default one would write that address.
  const app = Fastify({
    trustProxy: (_address, hop) => hop < 1,
    logger:
      deps.logStream === undefined
        ? false
        : {
            level: 'trace',
            stream: deps.logStream,
            serializers: { req: (request) => ({ method: request.method, url: request.routeOptions.url ?? 'unmatched' }) },
          },
  });
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
  // errors"): a database message names tables and policies. The log gets the status sent, the error's code and its name
  // — nothing from the request and never the error object: a body-parse message quotes the request body (NFR-PRIV-001).
  app.setErrorHandler((error, request, reply) => {
    const raw = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof raw === 'number' && raw >= 400 && raw < 500 ? raw : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
    request.log.error({ status, code, name }, 'request failed');
    return reply.code(status).send({ error: status === 500 ? 'internal' : 'bad_request' });
  });

  app.get('/api/health', () => ({ status: 'ok' }));
  registerMeRoute(app, { database });
  registerRegistrationRoute(app, { database, clock: deps.clock ?? (() => new Date()) });
  const recovery = createRecoveryDependencies(deps.recovery);
  registerRecoveryQuestionsRoute(app, { database, recovery });
  registerRecoveryResetRoute(app, { database, recovery });

  return app;
}
