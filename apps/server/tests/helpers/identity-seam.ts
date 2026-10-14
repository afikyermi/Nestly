import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/client.js';
import type { IdentityTx } from '../../src/db/identity-transaction.js';

// The one place that touches the server's transaction API, for tests/db/ (spec criteria 23, 24).
//
//   inIdentity(request, sql)    runs `sql` (one statement, no parameters) in the identity transaction of a protected
//                               request, through request.inIdentityTransaction, and returns the rows. A failing statement
//                               throws; the route then answers 5xx and the transaction rolls back.
//   outsideIdentity(db, sql)    runs `sql` on the Database the test passed to buildApp({ database }), through its
//                               postgres-js client, outside any identity transaction. The client has one connection, so
//                               this is the connection the previous request used.

export type Row = Record<string, unknown>;

interface CanRunInIdentity {
  inIdentityTransaction<T>(work: (tx: IdentityTx) => Promise<T>): Promise<T>;
}

function canRun(request: unknown): request is CanRunInIdentity {
  return typeof request === 'object' && request !== null && typeof Reflect.get(request, 'inIdentityTransaction') === 'function';
}

export async function inIdentity(request: unknown, text: string): Promise<Row[]> {
  if (!canRun(request)) throw new Error('request.inIdentityTransaction is missing: the route is not protected, or the hook did not run');
  return request.inIdentityTransaction(async (tx) => Array.from(await tx.execute(sql.raw(text))));
}

export async function outsideIdentity(database: Database, text: string): Promise<Row[]> {
  return Array.from(await database.client.unsafe(text));
}
