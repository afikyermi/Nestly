import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

// Cold start: the first full `npm run ci` after a pause loads Fastify and its plugins from a cold disk
// cache (and, on Windows, through the virus scanner), which can take longer than Vitest's 5 s default.
// The first buildApp()+inject is therefore done in beforeAll with its own generous timeout, so a slow
// first load is neither counted against the test below nor reported as a failure of the health route.
const COLD_START_MS = 60_000;

describe('GET /api/health', () => {
  const open: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    const warm = buildApp();
    await warm.ready();
    await warm.close();
  }, COLD_START_MS);

  afterEach(async () => {
    await Promise.all(open.splice(0).map((app) => app.close()));
  });

  it('returns status ok', { timeout: COLD_START_MS }, async () => {
    const app = buildApp();
    open.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
