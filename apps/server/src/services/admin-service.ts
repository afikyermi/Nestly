// The admin core (FR-MOD-002, FR-MOD-003, FR-ADMIN-005; BR-074). The caller is already authenticated; each call is one identity transaction.
// The database decides: which rows a Permission-Key holder reads (RLS), which move is legal and by whom (content_hold, users_status_guard,
// the enforcement policies), and the Audit entry (triggers). This layer answers a staff member who lacks the key with `forbidden` before
// the work (a friendlier 403 than an empty result), and names a database refusal; it never decides on its own what a key allows.

import type {
  AdminAccess,
  AuditPage,
  EnforceRequest,
  HandleReportsRequest,
  ModerateContentRequest,
  PermissionKey,
  QueueItem,
  ReportDetail,
  ReportTargetKind,
  TargetUser,
  UserList,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import type { MediaStorage } from '../media/storage-admin.js';
import type { PostImageRow } from '../repositories/media-repository.js';
import { imagesByPost, readPostImageRows } from './posts-service.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import {
  closeReports,
  hasOpenReports,
  insertEnforcement,
  moveContent,
  readAuditPage,
  readContent,
  readQueue,
  readReportsOn,
  readStaffAccess,
  readTargetUser,
  readUsers,
  revealAuthor,
  setAuditReason,
} from '../repositories/admin-repository.js';

export type Refusal = { readonly kind: 'forbidden' } | { readonly kind: 'not_found' } | { readonly kind: 'invalid' } | { readonly kind: 'reason_required' } | { readonly kind: 'not_applicable' };
export type Outcome<T> = ({ readonly kind: 'ok' } & T) | Refusal;

const PAGE = 50;

/** The staff member's keys, or a refusal when the account is no staff account or lacks `key`. */
async function require_(tx: IdentityTx, ...keys: PermissionKey[]): Promise<Refusal | AdminAccess> {
  const access = await readStaffAccess(tx);
  if (access === undefined || !keys.every((key) => access.permissions.includes(key))) return { kind: 'forbidden' };
  return access;
}
const refused = (value: Refusal | AdminAccess): value is Refusal => 'kind' in value;

/** A refusal the database gave, by SQLSTATE: the policies and triggers (42501), a missing reason (NS011), an action that does not apply (NS013). */
function databaseRefusal(error: unknown): Refusal | undefined {
  const fault = readDatabaseFault(error);
  switch (fault?.code) {
    case '42501':
      return { kind: 'forbidden' };
    case 'NS011':
      return { kind: 'reason_required' };
    case 'NS013':
      return { kind: 'not_applicable' };
    case 'NS012':
    case '23503':
      return { kind: 'not_found' };
    case '23514':
    case '22P02':
      return { kind: 'invalid' };
    default:
      return undefined;
  }
}

/** A write that touched no row: the target is there but the policies refused the move (403), or there is nothing open to act on (404). */
async function missingOrRefused(tx: IdentityTx, kind: ReportTargetKind, targetId: string): Promise<Refusal> {
  return (await hasOpenReports(tx, kind, targetId)) ? { kind: 'forbidden' } : { kind: 'not_found' };
}

async function guarded<T>(work: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
  try {
    return await work();
  } catch (error) {
    const refusal = databaseRefusal(error);
    if (refusal === undefined) throw error;
    return refusal;
  }
}

export async function readAccess(database: Database, identity: Identity): Promise<Outcome<{ access: AdminAccess }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const access = await readStaffAccess(tx);
    return access === undefined ? { kind: 'forbidden' } : { kind: 'ok', access };
  });
}

/** The same, but an account that is not staff is an answer (`access: null`), not a refusal: the menu asks every account. */
export async function readAccessOrNone(database: Database, identity: Identity): Promise<Outcome<{ access: AdminAccess | null }>> {
  const outcome = await readAccess(database, identity);
  return outcome.kind === 'forbidden' ? { kind: 'ok', access: null } : outcome;
}

export async function readAudit(database: Database, identity: Identity, before: { at: string; id: string } | undefined): Promise<Outcome<{ page: AuditPage }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const gate = await require_(tx, 'AUDIT_LOG_VIEW');
    if (refused(gate)) return gate;
    const { entries, cursors } = await readAuditPage(tx, before, PAGE + 1);
    const more = entries.length > PAGE;
    return { kind: 'ok', page: { entries: entries.slice(0, PAGE), next: more ? (cursors[PAGE - 1] ?? null) : null } };
  });
}

export async function readReportQueue(database: Database, identity: Identity): Promise<Outcome<{ items: QueueItem[] }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const gate = await require_(tx, 'REPORTS_VIEW');
    if (refused(gate)) return gate;
    return { kind: 'ok', items: await readQueue(tx) };
  });
}

export async function readReportDetail(
  database: Database,
  identity: Identity,
  kind: ReportTargetKind,
  targetId: string,
  storage?: MediaStorage,
): Promise<Outcome<{ detail: ReportDetail }>> {
  let imageRows: PostImageRow[] = [];
  const outcome = await inIdentityTransaction(database, identity, async (tx): Promise<Outcome<{ detail: ReportDetail }>> => {
    const gate = await require_(tx, 'REPORTS_VIEW');
    if (refused(gate)) return gate;
    const reports = await readReportsOn(tx, kind, targetId);
    if (reports.length === 0) return { kind: 'not_found' };
    const content = kind === 'user' ? undefined : await readContent(tx, kind, targetId);
    if (kind === 'post' && content !== undefined) imageRows = await readPostImageRows(tx, storage, [targetId]);
    // The account an enforcement would act on: the reported account, or the named author of the content (an anonymous author is revealed
    // by its own audited call, never here). Needs USER_VIEW; without it the screen shows no account.
    const userId = kind === 'user' ? targetId : (content?.authorId ?? undefined);
    const canSeeUsers = gate.permissions.includes('USER_VIEW');
    const user = userId !== undefined && canSeeUsers ? await readTargetUser(tx, userId) : undefined;
    return {
      kind: 'ok',
      detail: {
        targetKind: kind,
        targetId,
        content: content === undefined ? null : { text: content.text, status: content.status, isAnonymous: content.isAnonymous },
        reports: reports.map((report) => ({ ...report, reasonLabel: report.reasonLabel })),
        user: user ?? null,
      },
    };
  });
  // I5: the reported post's images, as the staff member's policies show them, signed after the transaction
  if (outcome.kind !== 'ok' || outcome.detail.content === null || imageRows.length === 0) return outcome;
  const images = (await imagesByPost(storage, imageRows)).get(targetId);
  return images === undefined ? outcome : { ...outcome, detail: { ...outcome.detail, content: { ...outcome.detail.content, images } } };
}

/** Closes the open reports on a target; with `moderation`, moves the content in the same transaction (a failure rolls both back). */
export async function handleReports(database: Database, identity: Identity, request: HandleReportsRequest): Promise<Outcome<{ closed: number }>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      const gate = await require_(tx, 'REPORTS_VIEW', ...(request.moderation === undefined ? [] : (['CONTENT_MODERATE'] as const)));
      if (refused(gate)) return gate;
      if (request.moderation !== undefined) {
        if (request.targetKind === 'user') return { kind: 'invalid' };
        await setAuditReason(tx, request.moderation.reason);
        if ((await moveContent(tx, request.targetKind, request.targetId, request.moderation.status)) === 0) return missingOrRefused(tx, request.targetKind, request.targetId);
      }
      const closed = await closeReports(tx, request.targetKind, request.targetId, request.resolution, request.note ?? request.moderation?.reason);
      return closed === 0 ? missingOrRefused(tx, request.targetKind, request.targetId) : { kind: 'ok', closed };
    }),
  );
}

export async function moderateContent(database: Database, identity: Identity, request: ModerateContentRequest): Promise<Outcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      const gate = await require_(tx, 'REPORTS_VIEW', 'CONTENT_MODERATE');
      if (refused(gate)) return gate;
      await setAuditReason(tx, request.reason);
      if ((await moveContent(tx, request.targetKind, request.targetId, request.status)) === 0) {
        return (await readContent(tx, request.targetKind, request.targetId)) === undefined ? { kind: 'not_found' } : { kind: 'forbidden' };
      }
      return { kind: 'ok' };
    }),
  );
}

export async function revealAnonymousAuthor(database: Database, identity: Identity, postId: string): Promise<Outcome<{ author: { userId: string; fullName: string | null } }>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      const gate = await require_(tx, 'REPORTS_VIEW', 'CONTENT_MODERATE');
      if (refused(gate)) return gate;
      return { kind: 'ok', author: await revealAuthor(tx, postId) };
    }),
  );
}

export async function enforce(database: Database, identity: Identity, request: EnforceRequest): Promise<Outcome<{ user: TargetUser }>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      const needed: PermissionKey = request.kind === 'warning' ? 'USER_WARN' : request.kind === 'suspension' || request.kind === 'reinstate' ? 'USER_SUSPEND' : 'USER_BAN';
      const gate = await require_(tx, needed);
      if (refused(gate)) return gate;
      // An account that does not exist is a 404, not a refusal (seen with USER_VIEW, as the screens that offer the action are).
      if (gate.permissions.includes('USER_VIEW') && (await readTargetUser(tx, request.userId)) === undefined) return { kind: 'not_found' };
      await insertEnforcement(tx, request);
      const user = await readTargetUser(tx, request.userId);
      return user === undefined ? { kind: 'not_found' } : { kind: 'ok', user };
    }),
  );
}

export async function readUser(database: Database, identity: Identity, userId: string): Promise<Outcome<{ user: TargetUser }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const gate = await require_(tx, 'USER_VIEW');
    if (refused(gate)) return gate;
    const user = await readTargetUser(tx, userId);
    return user === undefined ? { kind: 'not_found' } : { kind: 'ok', user };
  });
}

export async function listUsers(database: Database, identity: Identity, search: string): Promise<Outcome<{ users: UserList['users'] }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const gate = await require_(tx, 'USER_VIEW');
    if (refused(gate)) return gate;
    return { kind: 'ok', users: await readUsers(tx, search) };
  });
}
