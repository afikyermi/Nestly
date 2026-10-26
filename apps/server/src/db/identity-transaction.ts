// The identity transaction (data-model rule 3; I1 F1.1 part c, criteria 23-24). Every product query runs inside one.
//
// app_server holds `authenticated` WITH INHERIT FALSE, SET TRUE: until the transaction sets the role it can read
// nothing, so a forgotten identity fails closed. Both settings are transaction-local (`SET LOCAL`, `set_config(...,
// true)`): when the transaction ends — commit or rollback — the connection is app_server again with no claims, and
// the next request on the same pooled connection starts from nothing.
//
// F2.0 (schema.md "Authorization"): the statement that sets the claims also reads nestly.session_guard(), so the guard costs
// no extra round trip. A pending, stale or unchecked token never reaches the work: the transaction throws SessionRefused,
// which every protected route answers 503 (pending, unchecked) or 401 (stale). The database fences the same states again in
// is_active_account(), so a gated table returns nothing even if a route forgets.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './client.js';
import type { Identity } from '../lib/token-verifier.js';
import { timeTransaction } from '../lib/server-timing.js';

export type IdentityTx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/** What nestly.session_guard() says about the current token (migration 20261016100000 §3). */
export const SESSION_GUARDS = ['unauthenticated', 'unchecked', 'ok', 'pending', 'stale', 'must_set'] as const;
export type SessionGuard = (typeof SESSION_GUARDS)[number];

/** The guards a product request may proceed under: `must_set` is the clearing session before its new password (c7, c8). */
export type ProceedGuard = Extract<SessionGuard, 'ok' | 'must_set'>;

/** A token the guard refuses: `stale` is 401, everything else 503 (the route never sees which). Carries nothing else. */
export class SessionRefused extends Error {
  constructor(readonly guard: Exclude<SessionGuard, ProceedGuard>) {
    super(`session refused: ${guard}`);
    this.name = 'SessionRefused';
  }
}

const guardRows = z.array(z.object({ guard: z.enum(SESSION_GUARDS) })).length(1);

/**
 * The claims the database sees. The user id, and the session identifiers of F2.0 (DR-S1) when the token had them; `role` is
 * always `authenticated`, whatever the token said (criterion 23). Nothing else is passed on, so no policy can come to rely
 * on `app_metadata` or `user_metadata` (data-model rule 14).
 */
function databaseClaims(identity: Identity): string {
  return JSON.stringify({
    sub: identity.userId,
    role: 'authenticated',
    ...(identity.sessionId === undefined ? {} : { session_id: identity.sessionId }),
    ...(identity.issuedAt === undefined ? {} : { iat: identity.issuedAt }),
    ...(identity.authMethods === undefined ? {} : { amr: identity.authMethods.map((method) => ({ method })) }),
  });
}

/**
 * The transaction-local settings that the `authenticated` policies (and the functions they call) read, set to '' when the
 * transaction begins (26.10, performance plan ז'). A setting never set on a connection reads NULL, and `NULL = 'on' AND (select
 * has_permission(…))` still evaluates the permission check on every row; '' makes the comparison false, so the check is skipped.
 * Every reader treats NULL and '' alike — `= 'on'`, `id::text = …`, `coalesce(…, '') = ''`, `nullif(…, '')`, the uuid pattern of
 * profile_view_target() — so no permission changes; a path that needs one sets it later in the same transaction (staff_view 'on').
 */
const UNSET_SETTINGS = [
  'nestly.staff_view',
  'nestly.analytics_view',
  'nestly.own_delete',
  'nestly.reveal_user',
  'nestly.search_scope',
  'nestly.profile_view_target',
  'nestly.block_ending',
] as const;

const unsetSettings = sql.raw(UNSET_SETTINGS.map((name) => `, pg_catalog.set_config('${name}', '', true)`).join(''));

/**
 * SET LOCAL ROLE authenticated, then the claims, the empty settings and the guard in one statement (the subquery runs first:
 * OFFSET 0; set_config is volatile, so its unused columns are still computed).
 */
async function enter(tx: IdentityTx, identity: Identity): Promise<SessionGuard> {
  await tx.execute(sql`set local role authenticated`);
  const result = await tx.execute(
    sql`select nestly.session_guard() as guard
        from (select pg_catalog.set_config('request.jwt.claims', ${databaseClaims(identity)}, true)${unsetSettings} offset 0) as claims`,
  );
  const [row] = guardRows.parse(result);
  if (row === undefined) throw new Error('the session guard returned no row');
  return row.guard;
}

/**
 * The guard again, inside a transaction that already set the claims: for a re-read under the password-state lock (A4), when a
 * concurrent clear may have moved the state since the transaction began.
 */
export async function rereadGuard(tx: IdentityTx): Promise<SessionGuard> {
  const [row] = guardRows.parse(await tx.execute(sql`select nestly.session_guard() as guard`));
  if (row === undefined) throw new Error('the session guard returned no row');
  return row.guard;
}

/** What a product transaction may ask for beyond its identity: a stricter isolation level (F3.3: one snapshot for a page's three reads). */
export interface IdentityTransactionOptions {
  readonly isolationLevel?: 'repeatable read';
  /**
   * Best-effort counters written after the answer (plan ח1): the commit does not wait for the write-ahead log to reach the disk
   * (`synchronous_commit = off`, this transaction only). A crash may lose the last such commits; it never corrupts or half-applies one.
   */
  readonly asyncCommit?: boolean;
}

/** A product transaction. Throws SessionRefused (and rolls back) unless the guard is `ok` or `must_set`. */
export async function inIdentityTransaction<T>(
  database: Database,
  identity: Identity,
  work: (tx: IdentityTx, guard: ProceedGuard) => Promise<T>,
  options: IdentityTransactionOptions = {},
): Promise<T> {
  const timer = timeTransaction(database.clock); // Server-Timing on a Vercel deployment (lib/server-timing.ts); a no-op otherwise
  return database.db
    .transaction(async (tx) => {
      timer.began();
      try {
        // Before any query takes the snapshot (the role and the claims are set after it): one snapshot for everything the work reads.
        if (options.isolationLevel === 'repeatable read') await tx.execute(sql`set transaction isolation level repeatable read`);
        if (options.asyncCommit === true) await tx.execute(sql`set local synchronous_commit = off`);
        const guard = await enter(tx, identity);
        timer.entered();
        if (guard !== 'ok' && guard !== 'must_set') throw new SessionRefused(guard);
        return await work(tx, guard);
      } finally {
        timer.settled();
      }
    })
    .finally(() => timer.freed());
}

/**
 * A transaction of the identity link check itself (services/identity-link-service.ts): the detection, the clear and its
 * resume run while the guard says `unchecked` or `pending`, so the guard is handed to the work instead of refused. Nothing
 * else may use it.
 */
export async function inLinkCheckTransaction<T>(
  database: Database,
  identity: Identity,
  work: (tx: IdentityTx, guard: SessionGuard) => Promise<T>,
): Promise<T> {
  const timer = timeTransaction(database.clock);
  return database.db
    .transaction(async (tx) => {
      timer.began();
      try {
        const guard = await enter(tx, identity);
        timer.entered();
        return await work(tx, guard);
      } finally {
        timer.settled();
      }
    })
    .finally(() => timer.freed());
}
