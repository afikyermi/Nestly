// File a report (I3 F3.7; FR-MOD-001, UC-26). The caller is already authenticated; each call is one identity transaction. A stopped account is
// told apart first (403, ERR-037), as the other writes do; a Regular or a Professional account may report. Every other refusal is the
// database's SQLSTATE, which the route maps (42501, 23503 and the self CHECK 404; 23505 409). Filing a report changes nothing the reported side
// can see (S-35): no event, no count, no notification, and no log line names a reporter, a target or the text.

import type { ReportWrite } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import { insertReport } from '../repositories/reports-repository.js';

export type ReportOutcome = { readonly kind: 'received' } | { readonly kind: 'stopped' } | { readonly kind: 'not_allowed' };

/** More than one own users row cannot happen with the primary key; seeing them means a policy is wrong. */
export class ReportsFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'ReportsFault';
  }
}

/** The caller files one report. A refused target throws with its SQLSTATE. */
export async function fileReport(database: Database, identity: Identity, report: ReportWrite): Promise<ReportOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<ReportOutcome> => {
    const accounts = await readOwnAccounts(tx);
    if (accounts.length > 1) throw new ReportsFault('more than one own users row');
    const [account] = accounts;
    if (account === undefined) return { kind: 'not_allowed' };
    if (account.status !== 'active') return { kind: 'stopped' };
    await insertReport(tx, report);
    return { kind: 'received' };
  });
}
