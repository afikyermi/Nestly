# interface — D3 (app-wide error handler log line)

**Module:** `apps/server/src/app.ts` — exports `buildApp(deps?: AppDependencies): FastifyInstance`, `AppDependencies`.

**AppDependencies:** `config?: ServerConfig`, `database?: Database`, `logStream?: { write(message: string): void }`, `clock?: () => Date`.

**Log capture seam:** `buildApp({ logStream })` enables a pino logger at level `trace` writing one JSON line per entry to `logStream.write`. Without `logStream` there is no logger.
Existing helpers: `apps/server/tests/helpers/register-app.ts` (`buildRegisterApp(env, { database, clock, logStream })`, `logStream?: Writable`); `tests/bypass-header.test.ts` builds with `buildApp({ logStream: stream })`.

**Error handler:** `app.setErrorHandler` in `buildApp`; emits `request.log.error({ status, code, name }, 'request failed')`; replies `400-499` statusCode -> `{ error: 'bad_request' }` with that status, otherwise 500 `{ error: 'internal' }`.

**Drive:** `app.inject({ method: 'POST', url: <route>, headers: { 'content-type': 'application/json' }, payload: <malformed JSON string> })`; read lines written to the stream and `JSON.parse` each.
Routes: `GET /api/health`, registration route from `apps/server/src/routes/register.ts`.
