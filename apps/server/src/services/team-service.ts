// The Moderators team (I14): the Admin's team screen and invitations (FR-ADMIN-004), joining with a code, System Announcements
// (FR-ADMIN-008), the community settings' report reasons (FR-ADMIN-007), the Admin Analytics (FR-ADMIN-010, FR-ADMIN-003) and the staff inbox
// (AC-044). Each call is one identity transaction. The database decides who reads and writes what and audits every change; this layer
// answers a caller who lacks the role or key with `forbidden` before the work, and names a database refusal.

import { createHash, randomBytes } from 'node:crypto';
import type {
  AnalyticsPeriod,
  AnalyticsView,
  Announcement,
  AnnouncementRequest,
  InvitationCreated,
  PermissionKey,
  PublishedAnnouncement,
  ReportReasonCreate,
  ReportReasonRow,
  ReportReasonUpdate,
  StaffInbox,
  TeamView,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readStaffAccess } from '../repositories/admin-repository.js';
import {
  announcementExists,
  callerStaffRole,
  hasOwnAccount,
  holdsKey,
  insertAnnouncement,
  insertInvitation,
  insertModeratorAccount,
  insertReportReason,
  isModerator,
  markInvitation,
  nameAnalytics,
  nameInvitation,
  readAnalytics,
  readAnnouncement,
  readAnnouncements,
  readInbox,
  readInvitations,
  readModerators,
  readPublishedAnnouncements,
  readReportReasons,
  replaceKeys,
  revokeInvitation,
  setAnnouncementStatus,
  updateAnnouncement,
  updateReportReason,
} from '../repositories/team-repository.js';
import type { Outcome, Refusal } from './admin-service.js';

/** The SHA-256 (hex) of an invitation code: the only form the database keeps. */
export function hashInvitationCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function databaseRefusal(error: unknown): Refusal | undefined {
  switch (readDatabaseFault(error)?.code) {
    case '42501':
      return { kind: 'forbidden' };
    case '23514':
    case '22P02':
      return { kind: 'invalid' };
    case '23505':
      return { kind: 'not_applicable' };
    default:
      return undefined;
  }
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

async function adminOnly(tx: IdentityTx): Promise<boolean> {
  return (await callerStaffRole(tx)) === 'admin';
}

function holds(tx: IdentityTx, key: PermissionKey): Promise<boolean> {
  return holdsKey(tx, key);
}

// ---- the team ----------------------------------------------------------------------------------------------------------------

export async function readTeam(database: Database, identity: Identity): Promise<Outcome<{ team: TeamView }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    if (!(await adminOnly(tx))) return { kind: 'forbidden' };
    return { kind: 'ok', team: { moderators: await readModerators(tx), invitations: await readInvitations(tx) } };
  });
}

/** A new invitation: a random code (32 bytes, base64url), of which only the hash is stored; the code is answered once. */
export async function inviteModerator(database: Database, identity: Identity, note: string): Promise<Outcome<{ invitation: InvitationCreated }>> {
  const code = randomBytes(32).toString('base64url');
  return guarded<{ invitation: InvitationCreated }>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await adminOnly(tx))) return { kind: 'forbidden' };
      const row = await insertInvitation(tx, hashInvitationCode(code), note);
      return row === undefined ? { kind: 'forbidden' } : { kind: 'ok', invitation: { id: row.id, code, expiresAt: row.expiresAt } };
    }),
  );
}

export async function revokeModeratorInvitation(database: Database, identity: Identity, id: string): Promise<Outcome<Record<never, never>>> {
  return guarded<Record<never, never>>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await adminOnly(tx))) return { kind: 'forbidden' };
      return (await revokeInvitation(tx, id)) ? { kind: 'ok' } : { kind: 'not_found' };
    }),
  );
}

/** Sets a Moderator's keys to exactly this set (BR-022, BR-023: the Admin alone; each change audited with Before/After). */
export async function setModeratorKeys(database: Database, identity: Identity, userId: string, keys: readonly PermissionKey[]): Promise<Outcome<Record<never, never>>> {
  return guarded<Record<never, never>>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await adminOnly(tx))) return { kind: 'forbidden' };
      if (!(await isModerator(tx, userId))) return { kind: 'not_found' };
      await replaceKeys(tx, userId, keys);
      return { kind: 'ok' };
    }),
  );
}

export type JoinOutcome = { readonly kind: 'joined' } | { readonly kind: 'invalid_code' } | { readonly kind: 'has_account' };

/** The signed-in account with no Nestly row becomes a Moderator with the invitation whose code it holds: in one transaction the invitation
 *  is marked, then the account is created (the database's deferred check makes one code one Moderator). */
export async function joinTeam(database: Database, identity: Identity, code: string): Promise<JoinOutcome> {
  const codeHash = hashInvitationCode(code);
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<JoinOutcome> => {
      if (await hasOwnAccount(tx)) return { kind: 'has_account' };
      await nameInvitation(tx, codeHash);
      if (!(await markInvitation(tx, codeHash))) return { kind: 'invalid_code' };
      await insertModeratorAccount(tx);
      return { kind: 'joined' };
    });
  } catch (error) {
    const code = readDatabaseFault(error)?.code;
    if (code === '23505') return { kind: 'has_account' };
    if (code === '42501' || code === '23503') return { kind: 'invalid_code' };
    throw error;
  }
}

// ---- System Announcements ------------------------------------------------------------------------------------------------------

export async function listAnnouncements(database: Database, identity: Identity): Promise<Outcome<{ items: Announcement[] }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    if (!(await holds(tx, 'SYSTEM_ANNOUNCEMENTS'))) return { kind: 'forbidden' };
    return { kind: 'ok', items: await readAnnouncements(tx) };
  });
}

export async function createAnnouncement(database: Database, identity: Identity, request: AnnouncementRequest): Promise<Outcome<{ item: Announcement }>> {
  return guarded<{ item: Announcement }>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await holds(tx, 'SYSTEM_ANNOUNCEMENTS'))) return { kind: 'forbidden' };
      const item = await insertAnnouncement(tx, request);
      return item === undefined ? { kind: 'forbidden' } : { kind: 'ok', item };
    }),
  );
}

export async function editAnnouncement(database: Database, identity: Identity, id: string, request: AnnouncementRequest): Promise<Outcome<{ item: Announcement | null }>> {
  return guarded<{ item: Announcement | null }>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await holds(tx, 'SYSTEM_ANNOUNCEMENTS'))) return { kind: 'forbidden' };
      const item = await updateAnnouncement(tx, id, request);
      if (item !== undefined) return { kind: 'ok', item };
      // nothing written: unknown (404), removed (409), or the same text (200, nothing changed)
      const current = await readAnnouncement(tx, id);
      if (current === undefined) return { kind: 'not_found' };
      return current.status === 'removed' ? { kind: 'not_applicable' } : { kind: 'ok', item: current };
    }),
  );
}

export async function changeAnnouncementStatus(database: Database, identity: Identity, id: string, status: 'published' | 'removed'): Promise<Outcome<{ item: Announcement }>> {
  return guarded<{ item: Announcement }>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await holds(tx, 'SYSTEM_ANNOUNCEMENTS'))) return { kind: 'forbidden' };
      const item = await setAnnouncementStatus(tx, id, status);
      if (item !== undefined) return { kind: 'ok', item };
      return (await announcementExists(tx, id)) ? { kind: 'not_applicable' } : { kind: 'not_found' };
    }),
  );
}

/** The published announcements for the feed (inside the feed's own transaction). */
export function publishedAnnouncements(tx: IdentityTx): Promise<PublishedAnnouncement[]> {
  return readPublishedAnnouncements(tx);
}

// ---- report reasons ----------------------------------------------------------------------------------------------------------------

export async function listReportReasons(database: Database, identity: Identity): Promise<Outcome<{ items: ReportReasonRow[] }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    if (!(await holds(tx, 'COMMUNITY_CONFIG'))) return { kind: 'forbidden' };
    return { kind: 'ok', items: await readReportReasons(tx, false) };
  });
}

/** The reasons a reporter may choose now (any active account). */
export async function activeReportReasons(database: Database, identity: Identity): Promise<Array<{ key: string; label: string }>> {
  const rows = await inIdentityTransaction(database, identity, (tx) => readReportReasons(tx, true));
  return rows.map(({ key, label }) => ({ key, label }));
}

export async function changeReportReason(database: Database, identity: Identity, key: string, change: ReportReasonUpdate): Promise<Outcome<{ item: ReportReasonRow }>> {
  return guarded<{ item: ReportReasonRow }>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await holds(tx, 'COMMUNITY_CONFIG'))) return { kind: 'forbidden' };
      const item = await updateReportReason(tx, key, change);
      return item === undefined ? { kind: 'not_found' } : { kind: 'ok', item };
    }),
  );
}

/** A new reason; its key is the server's: `custom_` and 8 random hex characters. */
export async function addReportReason(database: Database, identity: Identity, reason: ReportReasonCreate): Promise<Outcome<{ item: ReportReasonRow }>> {
  const key = `custom_${randomBytes(4).toString('hex')}`;
  return guarded<{ item: ReportReasonRow }>(() =>
    inIdentityTransaction(database, identity, async (tx) => {
      if (!(await holds(tx, 'COMMUNITY_CONFIG'))) return { kind: 'forbidden' };
      const item = await insertReportReason(tx, key, reason);
      return item === undefined ? { kind: 'forbidden' } : { kind: 'ok', item };
    }),
  );
}

// ---- the analytics and the inbox ---------------------------------------------------------------------------------------------------

export async function readAdminAnalytics(database: Database, identity: Identity, days: AnalyticsPeriod): Promise<Outcome<{ view: AnalyticsView }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    if (!(await holds(tx, 'ANALYTICS_VIEW'))) return { kind: 'forbidden' };
    await nameAnalytics(tx);
    return { kind: 'ok', view: await readAnalytics(tx, days) };
  });
}

export async function readStaffInbox(database: Database, identity: Identity): Promise<Outcome<{ inbox: StaffInbox }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const access = await readStaffAccess(tx);
    if (access === undefined) return { kind: 'forbidden' };
    return { kind: 'ok', inbox: await readInbox(tx, access.permissions) };
  });
}
