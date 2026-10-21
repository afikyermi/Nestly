import {
  listingContactResponse,
  listingCreatedResponse,
  listingPage,
  marketplaceResponse,
  myListingsResponse,
  sponsoredItem,
  sponsoredListResponse,
  staffListingsResponse,
  type ListingCard,
  type ListingInput,
  type ListingPage,
  type MarketplaceFilters,
  type MarketplaceResponse,
  type SponsoredInput,
  type SponsoredItem,
  type StaffListing,
} from '@nestly/shared';
import type { AdminOutcome, AdminRefusal } from './admin';
import type { ProRefusal, ProResult } from './professionals';

// The Marketplace (I12): /api/marketplace/* for every account and /api/admin/listings, /api/admin/sponsored for staff. The caller is never sent:
// the server acts on the token's user. Only the status, the one `error` code and a body that passes the shared schema are read; no response
// text reaches the screen.

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const nothing: Parser<null> = { safeParse: () => ({ success: true, data: null }) };
const USER_REFUSALS: Readonly<Record<string, ProRefusal>> = {
  invalid: 'invalid',
  unavailable: 'unavailable',
  not_allowed: 'not-allowed',
  already_done: 'already-done',
};
const STAFF_REFUSALS: Readonly<Record<string, AdminRefusal>> = { forbidden: 'forbidden', not_found: 'not-found', invalid: 'invalid' };

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Answer = { kind: 'status'; status: number; body: unknown } | { kind: 'failed' };

async function send(token: string, method: Method, path: string, body?: unknown): Promise<Answer> {
  try {
    const response = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
    const read: unknown = response.status === 204 ? null : await response.json().catch(() => undefined);
    return { kind: 'status', status: response.status, body: read };
  } catch {
    return { kind: 'failed' };
  }
}

const codeOf = (body: unknown): unknown => (typeof body === 'object' && body !== null ? Reflect.get(body, 'error') : undefined);

async function call<T>(token: string, method: Method, path: string, schema: Parser<T>, body?: unknown): Promise<ProResult<T>> {
  const answer = await send(token, method, path, body);
  if (answer.kind === 'failed') return { kind: 'failed' };
  const { status } = answer;
  if (status === 401) return { kind: 'unauthenticated' };
  if (status === 200 || status === 201 || status === 204) {
    const parsed = schema.safeParse(answer.body);
    return parsed.success ? { kind: 'ok', value: parsed.data } : { kind: 'failed' };
  }
  const code = codeOf(answer.body);
  if (status === 403 && code === 'account_unavailable') return { kind: 'account-unavailable' };
  const refusal = typeof code === 'string' ? USER_REFUSALS[code] : undefined;
  return refusal === undefined ? { kind: 'failed' } : { kind: refusal };
}

async function staffCall<T>(token: string, method: Method, path: string, schema: Parser<T>, body?: unknown): Promise<AdminOutcome<T>> {
  const answer = await send(token, method, path, body);
  if (answer.kind === 'failed') return { kind: 'failed' };
  const { status } = answer;
  if (status === 401) return { kind: 'unauthenticated' };
  if (status === 200 || status === 201) {
    const parsed = schema.safeParse(answer.body);
    return parsed.success ? { kind: 'ok', value: parsed.data } : { kind: 'failed' };
  }
  const code = codeOf(answer.body);
  if (status === 403 && code === 'account_unavailable') return { kind: 'account-unavailable' };
  const refusal = typeof code === 'string' ? STAFF_REFUSALS[code] : undefined;
  return refusal === undefined ? { kind: 'failed' } : { kind: refusal };
}

const enc = (value: string): string => encodeURIComponent(value);

/** POST /api/marketplace (FR-MKT-001): the filters and the typed text travel in the body, never in an address. */
export function fetchMarketplace(token: string, query: MarketplaceFilters): Promise<ProResult<MarketplaceResponse>> {
  const body = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''));
  return call(token, 'POST', '/api/marketplace', marketplaceResponse, body);
}

export async function fetchMyListings(token: string): Promise<ProResult<ListingCard[]>> {
  const result = await call(token, 'GET', '/api/marketplace/mine', myListingsResponse);
  return result.kind === 'ok' ? { kind: 'ok', value: result.value.listings } : result;
}

export const fetchListing = (token: string, id: string): Promise<ProResult<ListingPage>> => call(token, 'GET', `/api/marketplace/listings/${enc(id)}`, listingPage);

export async function createListing(token: string, listing: ListingInput): Promise<ProResult<string>> {
  const result = await call(token, 'POST', '/api/marketplace/listings', listingCreatedResponse, listing);
  return result.kind === 'ok' ? { kind: 'ok', value: result.value.id } : result;
}
export const editListing = (token: string, id: string, listing: ListingInput): Promise<ProResult<null>> => call(token, 'PUT', `/api/marketplace/listings/${enc(id)}`, nothing, listing);
export const deleteListing = (token: string, id: string): Promise<ProResult<null>> => call(token, 'DELETE', `/api/marketplace/listings/${enc(id)}`, nothing);
export const setListingStatus = (token: string, id: string, status: 'active' | 'sold'): Promise<ProResult<null>> =>
  call(token, 'POST', `/api/marketplace/listings/${enc(id)}/status`, nothing, { status });
export const deleteListingImage = (token: string, id: string, imageId: string): Promise<ProResult<null>> =>
  call(token, 'DELETE', `/api/marketplace/listings/${enc(id)}/images/${enc(imageId)}`, nothing);

export async function contactSeller(token: string, id: string, text: string): Promise<ProResult<string>> {
  const result = await call(token, 'POST', `/api/marketplace/listings/${enc(id)}/contact`, listingContactResponse, { text });
  return result.kind === 'ok' ? { kind: 'ok', value: result.value.conversationId } : result;
}

// ---- staff ------------------------------------------------------------------------------------------------------------------------------

export async function fetchStaffListings(token: string, search: string): Promise<AdminOutcome<StaffListing[]>> {
  const outcome = await staffCall(token, 'POST', '/api/admin/listings/search', staffListingsResponse, { search: search.trim() });
  return outcome.kind === 'ok' ? { kind: 'ok', value: outcome.value.listings } : outcome;
}
export const setListingVisibility = (token: string, id: string, hidden: boolean, reason: string): Promise<AdminOutcome<unknown>> =>
  staffCall(token, 'POST', `/api/admin/listings/${enc(id)}/visibility`, { safeParse: (value: unknown) => ({ success: true as const, data: value }) }, { hidden, reason });

export async function fetchSponsored(token: string): Promise<AdminOutcome<SponsoredItem[]>> {
  const outcome = await staffCall(token, 'GET', '/api/admin/sponsored', sponsoredListResponse);
  return outcome.kind === 'ok' ? { kind: 'ok', value: outcome.value.items } : outcome;
}
export const createSponsored = (token: string, product: SponsoredInput): Promise<AdminOutcome<SponsoredItem>> => staffCall(token, 'POST', '/api/admin/sponsored', sponsoredItem, product);
export const editSponsored = (token: string, id: string, product: SponsoredInput): Promise<AdminOutcome<SponsoredItem>> =>
  staffCall(token, 'PATCH', `/api/admin/sponsored/${enc(id)}`, sponsoredItem, product);
export const setSponsoredStatus = (token: string, id: string, status: 'published' | 'paused' | 'removed'): Promise<AdminOutcome<SponsoredItem>> =>
  staffCall(token, 'POST', `/api/admin/sponsored/${enc(id)}/status`, sponsoredItem, { status });
