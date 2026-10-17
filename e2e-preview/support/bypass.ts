// The Vercel Deployment Protection bypass for a browser context (spec criterion 4). A request to the deployment origin
// is fetched with the bypass headers and without following redirects, then fulfilled; every other origin (supabase.co,
// fonts, http on the same host) continues untouched and never sees the secret. Never use extraHTTPHeaders: they go to
// every host. A failed fetch aborts the request and its error is dropped, since its call log lists request headers; if the route was already settled by a navigation, the abort's own error is dropped as well.

import type { Route } from '@playwright/test';

export const BYPASS_HEADER = 'x-vercel-protection-bypass';
export const COOKIE_HEADER = 'x-vercel-set-bypass-cookie';

export function createBypassRouteHandler(targetOrigin: string, secret: string) {
  return async (route: Route): Promise<void> => {
    let origin = '';
    try {
      origin = new URL(route.request().url()).origin;
    } catch {
      origin = '';
    }
    if (origin !== targetOrigin) return route.continue();
    try {
      const headers = { ...route.request().headers(), [BYPASS_HEADER]: secret, [COOKIE_HEADER]: 'true' };
      const response = await route.fetch({ headers, maxRedirects: 0 });
      return await route.fulfill({ response });
    } catch {
      // A navigation may already have settled the route ("Route is already handled!"): aborting it throws again. That error
      // is dropped too (like the fetch's), so a settled route never fails the test.
      try {
        return await route.abort('failed');
      } catch {
        return undefined;
      }
    }
  };
}
