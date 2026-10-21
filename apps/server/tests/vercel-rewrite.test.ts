import { readFileSync } from 'node:fs';
import { trackerEventsQuery } from '@nestly/shared';
import { describe, expect, it } from 'vitest';
import { withoutRewriteParam } from '../src/lib/vercel-rewrite.js';

// Production bug 21.10.2026: Vercel's rewrite "/api/:path*" → "/api/index" adds `path` to the query, and every route that checks its
// query strictly answered 400. The adapter removes that one parameter; the rest of the URL is untouched.

describe('withoutRewriteParam', () => {
  it.each([
    ['/api/notifications?path=notifications', '/api/notifications'],
    ['/api/notifications?before=abc&path=notifications', '/api/notifications?before=abc'],
    ['/api/trackers/events?path=trackers%2Fevents&kind=sleep&from=2026-10-14&to=2026-10-20', '/api/trackers/events?kind=sleep&from=2026-10-14&to=2026-10-20'],
    ['/api/media?kind=post&path=media&path=media', '/api/media?kind=post'],
    ['/api/media?path', '/api/media'],
    ['/api/feed', '/api/feed'],
    ['/api/feed?', '/api/feed'],
    ['/api/search?pathway=x&q=%D7%90', '/api/search?pathway=x&q=%D7%90'],
  ])('%s → %s', (input, expected) => {
    expect(withoutRewriteParam(input)).toBe(expected);
  });

  it('a strict query that Vercel extended parses again once the parameter is removed', () => {
    const url = '/api/trackers/events?kind=sleep&from=2026-10-14&to=2026-10-20&path=trackers%2Fevents';
    const query = (u: string) => Object.fromEntries(new URLSearchParams(u.slice(u.indexOf('?') + 1)));
    expect(trackerEventsQuery.safeParse(query(url)).success).toBe(false);
    expect(trackerEventsQuery.safeParse(query(withoutRewriteParam(url))).success).toBe(true);
  });

  it('the Vercel adapter applies it to every request before Fastify routes it', () => {
    const adapter = readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');
    expect(adapter).toMatch(/req\.url = withoutRewriteParam\(req\.url\)/);
    expect(adapter.indexOf('withoutRewriteParam(req.url)')).toBeLessThan(adapter.indexOf("emit('request'"));
  });
});
