// Steps that wait on a real network answer, measured. A sign-up is two calls (Supabase Auth, then POST /api/register or
// /api/register/professional on the deployment); a flow that only waited for the next URL could not tell which call was slow
// or refused. Each helper sets the response waits up before the action, waits up to 30 s (the function's own limit,
// vercel.json), logs status and duration, and asserts the status. Logs carry the method, path and numbers only: never a URL
// query, header or body.

import { expect, type Page, type Response } from '@playwright/test';

const LIMIT_MS = 30_000;

const label = (page: Page): string => `${page.viewportSize()?.width ?? '?'}px`;

function isAuthSignUp(r: Response): boolean {
  const u = new URL(r.url());
  return r.request().method() === 'POST' && u.hostname.endsWith('.supabase.co') && u.pathname === '/auth/v1/signup';
}

function isRegister(r: Response): boolean {
  return r.request().method() === 'POST' && /^\/api\/register(\/professional)?$/.test(new URL(r.url()).pathname);
}

/** Runs `action`, then waits for one response matching `match`; logs and asserts its status (default: 2xx). */
export async function timedResponse(
  page: Page,
  name: string,
  match: (r: Response) => boolean,
  action: () => Promise<unknown>,
  ok: (status: number) => boolean = (s) => s >= 200 && s < 300,
): Promise<Response> {
  const started = Date.now();
  const waiting = page.waitForResponse(match, { timeout: LIMIT_MS });
  // A rejection of the wait must not go unhandled if the action throws first.
  waiting.catch(() => undefined);
  await action();
  let response: Response;
  try {
    response = await waiting;
  } catch {
    console.log(`[${label(page)}] ${name}: no answer within ${LIMIT_MS} ms (page at ${new URL(page.url()).pathname})`);
    throw new Error(`${name}: no network answer within ${LIMIT_MS} ms`);
  }
  console.log(`[${label(page)}] ${name} answered ${response.status()} after ${Date.now() - started} ms`);
  expect(ok(response.status()), `${name} answered ${response.status()}`).toBe(true);
  return response;
}

/**
 * Clicks "יצירת חשבון" and waits for both sign-up calls (Auth, then the account write), each with its status and
 * duration logged. The caller still asserts the /recovery-questions URL.
 */
export async function createAccount(page: Page): Promise<void> {
  const started = Date.now();
  const auth = page.waitForResponse(isAuthSignUp, { timeout: LIMIT_MS });
  const register = page.waitForResponse(isRegister, { timeout: LIMIT_MS });
  auth.catch(() => undefined);
  register.catch(() => undefined);
  await page.getByRole('button', { name: 'יצירת חשבון', exact: true }).click();
  for (const [name, wait] of [
    ['Auth sign-up', auth],
    ['POST /api/register', register],
  ] as const) {
    let response: Response;
    try {
      response = await wait;
    } catch {
      console.log(`[${label(page)}] ${name}: no answer within ${LIMIT_MS} ms after the click (page at ${new URL(page.url()).pathname})`);
      throw new Error(`${name}: no network answer within ${LIMIT_MS} ms`);
    }
    console.log(`[${label(page)}] ${name} answered ${response.status()} after ${Date.now() - started} ms`);
    expect(response.status(), name).toBeLessThan(300);
  }
}

/** A slow Preview took over 10 s from "התחברות" to the next screen (preview-e2e 24.10): Auth's token answer, then /api/me. */
export const SIGN_IN_MS = 45_000;

function isAuthToken(r: Response): boolean {
  return r.request().method() === 'POST' && new URL(r.url()).pathname === '/auth/v1/token';
}

/**
 * Clicks "התחברות" and waits up to SIGN_IN_MS for Auth's token answer, a refusal too (its status and duration are logged, never
 * asserted: a wrong password is a flow's own check). The caller asserts where the page lands, with `{ timeout: SIGN_IN_MS }`.
 */
export async function submitSignIn(page: Page): Promise<Response> {
  const started = Date.now();
  const waiting = page.waitForResponse(isAuthToken, { timeout: SIGN_IN_MS });
  waiting.catch(() => undefined);
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  let response: Response;
  try {
    response = await waiting;
  } catch {
    console.log(`[${label(page)}] Auth sign-in: no answer within ${SIGN_IN_MS} ms (page at ${new URL(page.url()).pathname})`);
    throw new Error(`Auth sign-in: no network answer within ${SIGN_IN_MS} ms`);
  }
  console.log(`[${label(page)}] Auth sign-in answered ${response.status()} after ${Date.now() - started} ms`);
  return response;
}

/**
 * From "שמירה" on the recovery questions after a sign-up to the feed: the answers' write, then /api/me. A slow Preview took over 10 s
 * (preview-e2e 24.10), so the landing gets as long as a sign-in's.
 */
export const AFTER_ANSWERS_MS = SIGN_IN_MS;
