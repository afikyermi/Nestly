import { searchResponse, type SearchResponse, type SearchType } from '@nestly/shared';

// GET /api/search?q=&type= (FR-SEARCH-001, AC-039, AC-078). The text goes in the query string of this one call and nowhere else: it is not
// stored, not kept in the address of a page beyond the results screen's own `q`, and not logged.
export type SearchOutcome =
  | { kind: 'results'; data: SearchResponse }
  | { kind: 'rate-limited' } // 429 rate_limited: the People Search limit (no number)
  | { kind: 'unauthenticated' }
  | { kind: 'account-unavailable' }
  | { kind: 'failed' };

export async function fetchSearch(accessToken: string, text: string, type: SearchType = 'all'): Promise<SearchOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/search?q=${encodeURIComponent(text)}&type=${type}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    return { kind: 'failed' };
  }
  if (response.status === 401) return { kind: 'unauthenticated' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'failed' };
  }
  const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined;
  if (response.status === 429) return code === 'rate_limited' ? { kind: 'rate-limited' } : { kind: 'failed' };
  if (response.status === 403) return code === 'account_unavailable' ? { kind: 'account-unavailable' } : { kind: 'failed' };
  if (response.status !== 200) return { kind: 'failed' };
  const parsed = searchResponse.safeParse(body);
  return parsed.success ? { kind: 'results', data: parsed.data } : { kind: 'failed' };
}
