// Vercel's rewrite "/api/:path*" → "/api/index" (vercel.json) passes the :path segment it does not use in the destination on to the
// function as a query parameter, `path`. The request keeps its own URL, so routing is unaffected, but a route that checks its query
// strictly (z.strictObject: trackers, notifications, media, support inbox, admin audit, analytics) answered 400 to every call in
// production (21.10.2026). No route takes a `path` query parameter: the adapter removes it before Fastify sees the request.

/** The URL without its `path` query parameter(s); every other parameter is kept exactly as sent, in order. */
export function withoutRewriteParam(url: string): string {
  const mark = url.indexOf('?');
  if (mark === -1) return url;
  const kept = url
    .slice(mark + 1)
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0] !== 'path');
  return kept.length === 0 ? url.slice(0, mark) : `${url.slice(0, mark)}?${kept.join('&')}`;
}
