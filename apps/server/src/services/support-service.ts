// Support (I8; FR-ADMIN-001/002, FR-CHAT-004, BR-043, AC-024, AC-053). The caller is already authenticated; each call is one identity transaction.
// A Regular or Professional sends a request and replies in its own thread while it is open; staff read the inbox with SUPPORT_VIEW and reply,
// note and change the status with SUPPORT_HANDLE, on the admin screens only (nestly.staff_view). The database decides all of it and writes the
// Audit entry; this layer answers a staff member without the key with `forbidden` before the work and names a database refusal.
// Request and reply texts never reach a log line (NFR-PRIV-001, BR-052).

import type { PermissionKey, ReportedMessage, SupportDetail, SupportInbox, SupportList, SupportStatus, SupportThread, SupportTopic, TargetUser } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { enableStaffView, readStaffAccess, readTargetUser } from '../repositories/admin-repository.js';
import { markRead } from '../repositories/chat-repository.js';
import { openReportedMessage } from '../repositories/message-reports-repository.js';
import {
  insertSupportMessage,
  insertSupportRequest,
  readInbox,
  readOwnRequests,
  readOwnThread,
  readRequestDetail,
  readRequestStatus,
  updateRequestStatus,
} from '../repositories/support-repository.js';
import type { Outcome, Refusal } from './admin-service.js';
import type { ChatOutcome } from './chat-service.js';

// ---- the user's side ----------------------------------------------------------------------------------------------------------

/** POST /api/support: 42501 (staff, or an account that may not) is not_allowed; NS023 the daily limit. */
export async function createSupportRequest(database: Database, identity: Identity, topic: SupportTopic, text: string): Promise<ChatOutcome<{ id: string }>> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const id = await insertSupportRequest(tx, topic, text);
      await markRead(tx, { supportRequestId: id });
      return { kind: 'ok', id };
    });
  } catch (error) {
    switch (readDatabaseFault(error)?.code) {
      case '42501':
        return { kind: 'not_allowed' };
      case 'NS023':
        return { kind: 'rate_limited' };
      case '23514':
        return { kind: 'invalid' };
      default:
        throw error;
    }
  }
}

/** GET /api/support: the caller's requests. */
export async function listOwnRequests(database: Database, identity: Identity): Promise<SupportList['requests']> {
  return inIdentityTransaction(database, identity, (tx) => readOwnRequests(tx));
}

/** GET /api/support/:id: the caller's request and its thread; opening it marks it read. */
export async function openOwnThread(database: Database, identity: Identity, requestId: string): Promise<ChatOutcome<{ thread: SupportThread }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const thread = await readOwnThread(tx, requestId);
    if (thread === undefined) return { kind: 'unavailable' };
    await markRead(tx, { supportRequestId: requestId });
    return { kind: 'ok', thread };
  });
}

/** POST /api/support/:id/messages: the user replies while the request is not closed (409 closed after, FR-CHAT-004). */
export async function replyOwn(database: Database, identity: Identity, requestId: string, text: string): Promise<ChatOutcome<object>> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      await insertSupportMessage(tx, requestId, text, false);
      await markRead(tx, { supportRequestId: requestId });
      return { kind: 'ok' };
    });
  } catch (error) {
    if (readDatabaseFault(error)?.code !== '42501') throw error;
    const status = await inIdentityTransaction(database, identity, (tx) => readRequestStatus(tx, requestId));
    return { kind: status === 'closed' ? 'closed' : 'unavailable' };
  }
}

// ---- the staff's side (the admin screens) -------------------------------------------------------------------------------------

/** The caller's keys on the admin screens (nestly.staff_view on), or a refusal when it lacks one of `keys`. */
async function staffGate(tx: IdentityTx, ...keys: PermissionKey[]): Promise<Refusal | readonly PermissionKey[]> {
  const access = await readStaffAccess(tx);
  if (access === undefined || !keys.every((key) => access.permissions.includes(key))) return { kind: 'forbidden' };
  await enableStaffView(tx);
  return access.permissions;
}
const isRefusal = (value: Refusal | readonly PermissionKey[]): value is Refusal => 'kind' in value;

/** GET /api/admin/support (SUPPORT_VIEW). */
export async function readSupportInbox(database: Database, identity: Identity, status: SupportStatus | undefined): Promise<Outcome<{ items: SupportInbox['items'] }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const gate = await staffGate(tx, 'SUPPORT_VIEW');
    if (isRefusal(gate)) return gate;
    return { kind: 'ok', items: await readInbox(tx, status) };
  });
}

/** GET /api/admin/support/:id (SUPPORT_VIEW). */
export async function readSupportRequest(database: Database, identity: Identity, requestId: string): Promise<Outcome<{ detail: SupportDetail }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const gate = await staffGate(tx, 'SUPPORT_VIEW');
    if (isRefusal(gate)) return gate;
    const detail = await readRequestDetail(tx, requestId);
    return detail === undefined ? { kind: 'not_found' } : { kind: 'ok', detail };
  });
}

/** POST /api/admin/support/:id/messages (SUPPORT_HANDLE): a reply as Support, or an internal note. A reply to a closed request is 409. */
export async function replyAsSupport(database: Database, identity: Identity, requestId: string, text: string, internal: boolean): Promise<Outcome<object>> {
  return inIdentityTransaction(database, identity, async (tx): Promise<Outcome<object>> => {
    const gate = await staffGate(tx, 'SUPPORT_HANDLE');
    if (isRefusal(gate)) return gate;
    const status = await readRequestStatus(tx, requestId);
    if (status === undefined) return { kind: 'not_found' };
    if (status === 'closed' && !internal) return { kind: 'not_applicable' };
    await insertSupportMessage(tx, requestId, text, internal);
    return { kind: 'ok' };
  });
}

/** POST /api/admin/support/:id/status (SUPPORT_HANDLE): a closed request is not reopened (409). */
export async function changeSupportStatus(database: Database, identity: Identity, requestId: string, status: SupportStatus): Promise<Outcome<object>> {
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<Outcome<object>> => {
      const gate = await staffGate(tx, 'SUPPORT_HANDLE');
      if (isRefusal(gate)) return gate;
      const current = await readRequestStatus(tx, requestId);
      if (current === undefined) return { kind: 'not_found' };
      if (current === status) return { kind: 'ok' };
      if (current === 'closed') return { kind: 'not_applicable' };
      return (await updateRequestStatus(tx, requestId, status)) === 0 ? { kind: 'forbidden' } : { kind: 'ok' };
    });
  } catch (error) {
    if (readDatabaseFault(error)?.code === '42501') return { kind: 'not_applicable' };
    throw error;
  }
}

/** POST /api/admin/reports/message (REPORTS_VIEW): the audited opening of a reported message (§9.6), and its sender's account for USER_VIEW. */
export async function viewReportedMessage(
  database: Database,
  identity: Identity,
  messageId: string,
): Promise<Outcome<{ message: ReportedMessage }>> {
  return inIdentityTransaction(database, identity, async (tx): Promise<Outcome<{ message: ReportedMessage }>> => {
    const gate = await staffGate(tx, 'REPORTS_VIEW');
    if (isRefusal(gate)) return gate;
    const opened = await openReportedMessage(tx, messageId);
    if (opened === undefined) return { kind: 'not_found' };
    const user: TargetUser | undefined = gate.includes('USER_VIEW') ? await readTargetUser(tx, opened.senderId) : undefined;
    return { kind: 'ok', message: { ...opened, user: user ?? null } };
  });
}
