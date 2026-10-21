import {
  adminPromotionsResponse,
  billingResponse,
  promotionOverview,
  promotionPurchaseResponse,
  promotionSettingsCreated,
  promotionSettingsResponse,
  type AdminPromotions,
  type BillingItem,
  type PromotionOverview,
  type PromotionPurchaseInput,
  type PromotionPurchaseResult,
  type PromotionSettingsResponse,
  type PromotionSettingsWriteInput,
} from '@nestly/shared';
import type { AdminOutcome, AdminRefusal } from './admin';
import type { ProRefusal, ProResult } from './professionals';

// Promotions (I13): /api/promotions/* for the promoter and the viewer, /api/admin/promotions* and /api/admin/promotion-settings for staff. The
// caller is never sent: the server acts on the token's user. The payment is simulated (NFR-SEC-007): no card or amount is ever sent — the plan
// only. Only the status, the one `error` code and a body that passes the shared schema are read.

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const nothing: Parser<null> = { safeParse: () => ({ success: true, data: null }) };
const USER_REFUSALS: Readonly<Record<string, ProRefusal>> = {
  invalid: 'invalid',
  unavailable: 'unavailable',
  not_allowed: 'not-allowed',
  already_promoted: 'already-done',
};
const STAFF_REFUSALS: Readonly<Record<string, AdminRefusal>> = { forbidden: 'forbidden', unavailable: 'not-found', invalid: 'invalid' };

type Method = 'GET' | 'POST';
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
  if (status === 200 || status === 201 || status === 204) {
    const parsed = schema.safeParse(answer.body);
    return parsed.success ? { kind: 'ok', value: parsed.data } : { kind: 'failed' };
  }
  const code = codeOf(answer.body);
  if (status === 403 && code === 'account_unavailable') return { kind: 'account-unavailable' };
  const refusal = typeof code === 'string' ? STAFF_REFUSALS[code] : undefined;
  return refusal === undefined ? { kind: 'failed' } : { kind: refusal };
}

const enc = (value: string): string => encodeURIComponent(value);

/** GET /api/promotions (PG-041): the plans for the caller's kind of account, its promotions, the posts it may promote and its analytics. */
export const fetchPromotionOverview = (token: string): Promise<ProResult<PromotionOverview>> => call(token, 'GET', '/api/promotions', promotionOverview);

/** POST /api/promotions: a simulated payment of the plan and the promotion it buys, together (AC-098). */
export const buyPromotion = (token: string, purchase: PromotionPurchaseInput): Promise<ProResult<PromotionPurchaseResult>> =>
  call(token, 'POST', '/api/promotions', promotionPurchaseResponse, purchase);

/** POST /api/promotions/:id/stop: the owner stops its running promotion. */
export const stopOwnPromotion = (token: string, id: string): Promise<ProResult<null>> => call(token, 'POST', `/api/promotions/${enc(id)}/stop`, nothing);

/** POST /api/promotions/:id/click: the viewer opened a promoted unit (a paid click). Best effort: the screen never waits on it. */
export const reportPromotionClick = (token: string, id: string): Promise<ProResult<null>> => call(token, 'POST', `/api/promotions/${enc(id)}/click`, nothing);

/** GET /api/promotions/billing (PG-042): the caller's simulated payments. */
export async function fetchBilling(token: string): Promise<ProResult<BillingItem[]>> {
  const result = await call(token, 'GET', '/api/promotions/billing', billingResponse);
  return result.kind === 'ok' ? { kind: 'ok', value: result.value.payments } : result;
}

// ---- staff --------------------------------------------------------------------------------------------------------------------------------

export const fetchAdminPromotions = (token: string): Promise<AdminOutcome<AdminPromotions>> => staffCall(token, 'GET', '/api/admin/promotions', adminPromotionsResponse);

/** §11.1: staff stop a running promotion, with the reason the Audit Log keeps. */
export const staffStopPromotion = (token: string, id: string, reason: string): Promise<AdminOutcome<null>> =>
  staffCall(token, 'POST', `/api/admin/promotions/${enc(id)}/stop`, nothing, { reason });

export const fetchPromotionSettings = (token: string): Promise<AdminOutcome<PromotionSettingsResponse>> =>
  staffCall(token, 'GET', '/api/admin/promotion-settings', promotionSettingsResponse);

export const savePromotionSettings = (token: string, write: PromotionSettingsWriteInput): Promise<AdminOutcome<{ version: number }>> =>
  staffCall(token, 'POST', '/api/admin/promotion-settings', promotionSettingsCreated, write);
