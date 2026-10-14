// The identity transaction (data-model rule 3; I1 F1.1 part c, criteria 23-24). Every product query runs inside one.
//
// app_server holds `authenticated` WITH INHERIT FALSE, SET TRUE: until the transaction sets the role it can read
// nothing, so a forgotten identity fails closed. Both settings are transaction-local (`SET LOCAL`, `set_config(...,
// true)`): when the transaction ends — commit or rollback — the connection is app_server again with no claims, and
// the next request on the same pooled connection starts from nothing.

import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import type { Identity } from '../lib/token-verifier.js';

export type IdentityTx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/**
 * The claims the database sees. Only the user id comes from the token; `role` is always `authenticated`, whatever the
 * token said (criterion 23). Nothing else is passed on, so no policy can come to rely on `app_metadata` or
 * `user_metadata` (data-model rule 14).
 */
function databaseClaims(identity: Identity): string {
  return JSON.stringify({ sub: identity.userId, role: 'authenticated' });
}

export async function inIdentityTransaction<T>(
  database: Database,
  identity: Identity,
  work: (tx: IdentityTx) => Promise<T>,
): Promise<T> {
  return database.db.transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`);
    await tx.execute(sql`select set_config('request.jwt.claims', ${databaseClaims(identity)}, true)`);
    return work(tx);
  });
}
