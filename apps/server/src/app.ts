import Fastify, { type FastifyInstance } from 'fastify';
import { createDatabase, type Database } from './db/client.js';
import { PasswordStateBusy } from './db/password-lock.js';
import { readConfig, type ServerConfig } from './lib/config.js';
import { createTokenVerifier } from './lib/token-verifier.js';
import { registerAuthentication, replySessionRefused, type LinkGate } from './plugins/authentication.js';
import { clientAddress } from './recovery/client-ip.js';
import { registerFeedRoutes } from './routes/feed.js';
import { registerFriendsRoutes } from './routes/friends.js';
import { registerJourneysRoutes } from './routes/journeys.js';
import { registerMeRoute } from './routes/me.js';
import { registerPasswordRoutes } from './routes/password.js';
import { registerPostsRoutes } from './routes/posts.js';
import { registerPrivacyRoute } from './routes/privacy.js';
import { registerProfileRoute } from './routes/profile.js';
import { registerProfileViewRoute } from './routes/profile-view.js';
import { checkIdentityLink } from './services/identity-link-service.js';
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
    // A path parameter (PUT /api/children/:id, F2.2a) reaches its handler at any length, so the handler's own check answers (404
    // not_found) instead of the router's 414, whose default body quotes the URL. 16 KiB is Node's whole header limit; no route has
    // a regular-expression parameter, which is what the router's default of 100 guards.
    routerOptions: { maxParamLength: 16 * 1024 },
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

  const recovery = createRecoveryDependencies(deps.recovery);
  registerAuthentication(app, {
    verifier: config.auth === undefined ? undefined : createTokenVerifier(config.auth),
    database,
    ...(database === undefined ? {} : { linkGate: linkGateFor(database, recovery) }),
  });

  // A raw error — from the database, a library or Fastify itself — never reaches the response (conventions, "User-facing
  // errors"): a database message names tables and policies. The log gets the status sent, the error's code and its name
  // — nothing from the request and never the error object: a body-parse message quotes the request body (NFR-PRIV-001).
  app.setErrorHandler((error, request, reply) => {
    // A token the session guard refused (F2.0): 401 or 503, never a 500, wherever it surfaced.
    const refused = replySessionRefused(reply, error);
    if (refused !== undefined) return refused;
    if (error instanceof PasswordStateBusy) return reply.code(503).send({ error: 'unavailable' });
    const raw = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof raw === 'number' && raw >= 400 && raw < 500 ? raw : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
    request.log.error({ status, code, name }, 'request failed');
    return reply.code(status).send({ error: status === 500 ? 'internal' : 'bad_request' });
  });

  app.get('/api/health', () => ({ status: 'ok' }));
  const clock = deps.clock ?? (() => new Date());
  registerMeRoute(app, { database, recovery });
  registerRegistrationRoute(app, { database, clock });
  registerRecoveryQuestionsRoute(app, { database, recovery });
  registerRecoveryResetRoute(app, { database, recovery });
  registerPasswordRoutes(app, { database, recovery });
  registerProfileRoute(app, { database });
  registerJourneysRoutes(app, { database, clock });
  registerPrivacyRoute(app, { database });
  registerFriendsRoutes(app, { database });
  registerProfileViewRoute(app, { database });
  registerPostsRoutes(app, { database });
  registerFeedRoutes(app, { database });

  return app;
}

/** F2.0: the identity link gate of a Google session's request (services/identity-link-service.ts). */
function linkGateFor(database: Database, recovery: RecoveryDependencies): LinkGate {
  return (request, identity, accessToken) => {
    const address = clientAddress(request.ip);
    return checkIdentityLink(database, recovery, identity, {
      accessToken,
      email: request.verifiedEmail,
      addressKey: address.key,
      address: address.forAuth,
      onFailure: (step, sqlstate) => request.log.warn({ step, sqlstate }, 'identity link check failed'),
    });
  };
}
