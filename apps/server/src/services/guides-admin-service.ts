// The Admin's management of status guides (FR-ADMIN-012, BR-070). One identity transaction per call. The database decides who may write
// (an Admin only, policies) and writes the Audit entry (trigger); this layer answers a caller who is not an Admin with `forbidden` before
// the work, and names a database refusal. A Moderator holding every Permission Key is still forbidden: no key covers guides.
import type { AdminGuideDto, GuideValue } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { insertGuide, listGuides, readStaffRole, updateGuide } from '../repositories/guides-admin-repository.js';

export type GuideOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'invalid' };

async function asAdmin<T>(database: Database, identity: Identity, work: (tx: IdentityTx) => Promise<GuideOutcome<T>>): Promise<GuideOutcome<T>> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => ((await readStaffRole(tx)) === 'admin' ? work(tx) : { kind: 'forbidden' }));
  } catch (error) {
    const code = readDatabaseFault(error)?.code;
    if (code === '42501') return { kind: 'forbidden' };
    if (code === '23514' || code === '22P02') return { kind: 'invalid' };
    throw error;
  }
}

export const readGuides = (database: Database, identity: Identity) =>
  asAdmin<AdminGuideDto[]>(database, identity, async (tx) => ({ kind: 'ok', value: await listGuides(tx) }));

export const createGuide = (database: Database, identity: Identity, value: GuideValue) =>
  asAdmin<true>(database, identity, async (tx) => {
    await insertGuide(tx, value);
    return { kind: 'ok', value: true };
  });

export const saveGuide = (database: Database, identity: Identity, id: string, value: GuideValue, status: 'draft' | 'published' | 'hidden') =>
  asAdmin<true>(database, identity, async (tx) => ((await updateGuide(tx, id, value, status)) === 0 ? { kind: 'not_found' } : { kind: 'ok', value: true }));
