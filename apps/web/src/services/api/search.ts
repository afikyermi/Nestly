import { searchResponse, type SearchResponse, type SearchType } from '@nestly/shared';

// POST /api/search { q, type } (FR-SEARCH-001, AC-039, AC-078; Afik 20.10.2026: the typed text is never stored). The text travels only in
// the JSON body of this one call: never in a URL (which servers and the hosting platform log), never stored, never logged.
export type SearchOutcome =
  | { kind: 'results'; data: SearchResponse }
  | { kind: 'rate-limited' } // 429 rate_limited: the People Search limit (no number)
  | { kind: 'unauthenticated' }
  | { kind: 'account-unavailable' }
  | { kind: 'failed' };

export async function fetchSearch(accessToken: string, text: string, type: SearchType = 'all'): Promise<SearchOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/search', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ q: text, type }),
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
