import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { createDatabase, type Database } from './db/client.js';
import { PasswordStateBusy } from './db/password-lock.js';
import { readConfig, type ServerConfig } from './lib/config.js';
import { noErrorMonitor, type ErrorMonitor, type ErrorReport } from './lib/error-monitoring.js';
import { createTokenVerifier } from './lib/token-verifier.js';
import { registerAuthentication, replySessionRefused, type LinkGate } from './plugins/authentication.js';
import { clientAddress } from './recovery/client-ip.js';
import { registerAdminActionRoutes } from './routes/admin-actions.js';
import { registerAdminReadRoutes } from './routes/admin-read.js';
import { registerCommentsRoutes } from './routes/comments.js';
import { registerFeedRoutes } from './routes/feed.js';
import { registerFriendsRoutes } from './routes/friends.js';
import { registerLikesRoutes } from './routes/likes.js';
import { registerPostHidesRoutes } from './routes/post-hides.js';
import { registerBlocksRoutes } from './routes/blocks.js';
import { registerGroupsRoutes } from './routes/groups.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerProfessionalsRoutes } from './routes/professionals.js';
import { registerMarketplaceRoutes } from './routes/marketplace.js';
import { registerPromotionsRoutes } from './routes/promotions.js';
import { onPromotionSkip } from './services/promoted-units.js';
import { registerSupportRoutes } from './routes/support.js';
import { registerReportsRoutes } from './routes/reports.js';
import { registerNotificationsRoutes } from './routes/notifications.js';
import { registerSearchRoute } from './routes/search.js';
import { registerSharesRoutes } from './routes/shares.js';
import { registerAdminGuidesRoutes } from './routes/admin-guides.js';
import { registerTeamRoutes } from './routes/team.js';
import { registerStaffWorkRoutes } from './routes/staff-work.js';
import { registerCycleRoutes } from './routes/cycle.js';
import { registerHomeRoute } from './routes/home.js';
import { registerJourneysRoutes } from './routes/journeys.js';
import { registerTrackersRoutes } from './routes/trackers.js';
import { registerMeRoute } from './routes/me.js';
import { registerPasswordRoutes } from './routes/password.js';
import { registerPostsRoutes } from './routes/posts.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerStoriesRoutes } from './routes/stories.js';
import { registerMediaQueueRoutes } from './routes/media-queue.js';
import { processUpload } from './media/image-processing.js';
import { createJobKick } from './media/job-kick.js';
import { reuseSignedUrls } from './media/signed-url-cache.js';
import { createMediaStorage } from './media/storage-admin.js';
import type { MediaDependencies } from './services/media-service.js';
import { registerAccountDeletionRoutes } from './routes/account-deletion.js';
import { registerPrivacyRoute } from './routes/privacy.js';
import { registerProfileRoute } from './routes/profile.js';
import { registerProfileViewRoute } from './routes/profile-view.js';
import { checkIdentityLink } from './services/identity-link-service.js';
import { createRecoveryDependencies, type RecoveryDependencies } from './recovery/dependencies.js';
import { registerRecoveryQuestionsRoute } from './routes/recovery-questions.js';
import { registerRecoveryResetRoute } from './routes/recovery-reset.js';
import { registerRegistrationRoute } from './routes/register.js';
import { registerStripBypassHeader } from './plugins/strip-bypass-header.js';
import { registerServerTiming, serverTimingEnabled } from './lib/server-timing.js';
import { noteOf, reportableFailure } from './lib/failure-report.js';
import { registerAfterResponse } from './lib/after-response.js';

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
  /** I5: image storage, the image re-encoder and the background check's trigger. Defaults read the environment; a test passes fakes. */
  readonly media?: Partial<MediaDependencies>;
  /** Where 5xx answers are reported (lib/error-monitoring.ts). Defaults to none; the deployed function passes Sentry's. */
  readonly errorMonitor?: ErrorMonitor;
  /** The Server-Timing header (lib/server-timing.ts). Defaults to on for a Vercel Preview or Production deployment (VERCEL_ENV). */
  readonly serverTiming?: boolean;
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
  // Right after it, so it times the rest of the request: a Vercel Preview only (never Production, never a test unless it asks).
  registerServerTiming(app, deps.serverTiming ?? serverTimingEnabled(process.env));

  // Every 5xx is reported: a thrown error by the error handler below (with its stack), a failure a route caught and noted here
  // (failure-report.ts), any other 5xx here by status and route
  // template only (`/api/posts/:postId`, never the address). Nothing from the request goes with it.
  const monitor = deps.errorMonitor ?? noErrorMonitor;
  // Work a route starts after its answer was sent (best-effort counters, plan ח1): its failure goes to the same monitor (lib/after-response.ts)
  registerAfterResponse(app, monitor);
  const reported = new WeakSet<object>();
  const reportOf = (request: FastifyRequest, status: number): ErrorReport => ({
    route: request.routeOptions.url ?? 'unmatched',
    method: request.method,
    status,
    surface: 'api',
  });
  if (monitor.enabled) {
    app.addHook('onResponse', (request, reply, done) => {
      if (reply.statusCode >= 500 && !reported.has(request)) {
        // A route that caught the failure noted it: its error (rebuilt without database values) instead of the bare status
        const noted = noteOf(request);
        if (noted === undefined) monitor.captureStatus(reportOf(request, reply.statusCode));
        else monitor.capture(reportableFailure(noted), reportOf(request, reply.statusCode));
      }
      done();
    });
  }

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
    if (status === 500) {
      reported.add(request);
      monitor.capture(reportableFailure(error), reportOf(request, status));
    }
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
  registerHomeRoute(app, { database, clock });
  registerTrackersRoutes(app, { database, clock });
  registerCycleRoutes(app, { database, clock });
  registerAdminGuidesRoutes(app, { database, clock });
  registerPrivacyRoute(app, { database });
  registerAccountDeletionRoutes(app, { database, clock });
  registerFriendsRoutes(app, { database });
  const media: MediaDependencies = {
    storage: reuseSignedUrls(deps.media?.storage ?? createMediaStorage()),
    kick: deps.media?.kick ?? createJobKick(),
    process: deps.media?.process ?? processUpload,
  };
  registerPostsRoutes(app, { database, storage: media.storage });
  registerFeedRoutes(app, { database, storage: media.storage });
  registerMediaRoutes(app, { database, media });
  registerProfileViewRoute(app, { database, storage: media.storage });
  registerStoriesRoutes(app, { database, storage: media.storage });
  registerMediaQueueRoutes(app, { database, storage: media.storage, kick: media.kick });
  registerCommentsRoutes(app, { database });
  registerLikesRoutes(app, { database });
  registerPostHidesRoutes(app, { database });
  registerReportsRoutes(app, { database });
  registerSharesRoutes(app, { database });
  registerNotificationsRoutes(app, { database });
  registerSearchRoute(app, { database });
  registerBlocksRoutes(app, { database });
  registerGroupsRoutes(app, { database, storage: media.storage });
  registerChatRoutes(app, { database });
  registerProfessionalsRoutes(app, { database });
  registerMarketplaceRoutes(app, { database, storage: media.storage });
  registerPromotionsRoutes(app, { database });
  // ERR-028: a promoted candidate not shown is recorded by its reason code only
  onPromotionSkip((reason, count) => app.log.info({ promotionSkip: reason, count }, 'promoted candidates skipped'));
  registerSupportRoutes(app, { database });
  registerAdminReadRoutes(app, { database, storage: media.storage });
  registerAdminActionRoutes(app, { database });
  registerTeamRoutes(app, { database });
  registerStaffWorkRoutes(app, { database });

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
