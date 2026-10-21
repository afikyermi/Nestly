// The staff's work (I14 completion, Afik 21.10.2026, decisions-in-force.md §9): the Moderator's "my work", the Admin's home, escalation to the
// Admin and children's tracker trends. The caller is already authenticated; each call is one identity transaction. The database decides what each
// key reads (every count reads through the caller's policies) and who may escalate; this layer answers a missing key with `forbidden` before the
// work, and counts only the areas the caller's keys cover.

import {
  GUIDE_RECHECK_MONTHS,
  INVITATION_EXPIRING_HOURS,
  REPORT_SPIKE_MIN,
  isPastTarget,
  timeTargetHours,
  type AdminOverview,
  type ChildTrends,
  type ChildTrendsQuery,
  type EscalateRequest,
  type MyWork,
  type QueueItem,
  type WorkItem,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readQueue, readStaffAccess } from '../repositories/admin-repository.js';
import {
  countChildSafetyTargets,
  countEscalatedTargets,
  countGuidesToRecheck,
  countInvitations,
  countOpenSupport,
  countQueuedImages,
  insertEscalation,
  readChildTrends,
  readReportPace,
  readTeamActivity,
  readWeekMetrics,
} from '../repositories/staff-work-repository.js';
import { readModerators } from '../repositories/team-repository.js';
import type { Outcome } from './admin-service.js';

function workItemOf(item: QueueItem, now: Date): WorkItem {
  const hours = timeTargetHours(item.priority);
  return {
    targetKind: item.targetKind,
    targetId: item.targetId,
    priority: item.priority,
    waitingSince: item.firstReportedAt,
    timeTargetHours: hours,
    pastTarget: isPastTarget(item.firstReportedAt, hours, now),
  };
}

/** The oldest waiting report (by its first report) and the next in the queue's order (priority first). */
function queueHeads(queue: readonly QueueItem[], now: Date): { oldest: WorkItem | null; next: WorkItem | null; pastTarget: number } {
  const first = queue[0];
  const oldest = [...queue].sort((a, b) => Date.parse(a.firstReportedAt) - Date.parse(b.firstReportedAt))[0];
  return {
    next: first === undefined ? null : workItemOf(first, now),
    oldest: oldest === undefined ? null : workItemOf(oldest, now),
    pastTarget: queue.filter((item) => isPastTarget(item.firstReportedAt, timeTargetHours(item.priority), now)).length,
  };
}

/** GET /api/admin/my-work: what waits for this staff member, by the areas its keys cover. */
export async function readMyWork(database: Database, identity: Identity): Promise<Outcome<{ work: MyWork }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const access = await readStaffAccess(tx);
    if (access === undefined) return { kind: 'forbidden' };
    const keys = access.permissions;
    const now = new Date();
    const counters: MyWork['counters'] = {};
    let heads: ReturnType<typeof queueHeads> = { oldest: null, next: null, pastTarget: 0 };
    if (keys.includes('REPORTS_VIEW')) {
      const queue = await readQueue(tx);
      heads = queueHeads(queue, now);
      counters.openReports = queue.length;
      counters.childSafetyReports = await countChildSafetyTargets(tx);
      counters.pastTargetReports = heads.pastTarget;
      counters.escalatedReports = await countEscalatedTargets(tx);
    }
    if (keys.includes('CONTENT_MODERATE')) counters.queuedImages = await countQueuedImages(tx);
    if (keys.includes('SUPPORT_VIEW')) counters.openSupport = await countOpenSupport(tx);
    return { kind: 'ok', work: { permissions: [...keys], counters, oldest: heads.oldest, next: heads.next } };
  });
}

async function adminOverview(tx: IdentityTx): Promise<AdminOverview> {
  const now = new Date();
  const queue = await readQueue(tx);
  const heads = queueHeads(queue, now);
  const invitations = await countInvitations(tx, INVITATION_EXPIRING_HOURS);
  const pace = await readReportPace(tx);
  const dailyAverage = Math.round((pace.weekBefore / 7) * 10) / 10;
  const moderators = await readModerators(tx);
  const activity = await readTeamActivity(tx);
  return {
    childSafetyOpen: await countChildSafetyTargets(tx),
    attention: {
      openReports: queue.length,
      pastTargetReports: heads.pastTarget,
      escalatedReports: await countEscalatedTargets(tx),
      queuedImages: await countQueuedImages(tx),
      openSupport: await countOpenSupport(tx),
      openInvitations: invitations.open,
      expiringInvitations: invitations.expiring,
      guidesToRecheck: await countGuidesToRecheck(tx, GUIDE_RECHECK_MONTHS),
      reportSpike: { lastDay: pace.lastDay, dailyAverage, isSpike: pace.lastDay >= REPORT_SPIKE_MIN && pace.lastDay >= 2 * dailyAverage },
    },
    metrics: await readWeekMetrics(tx),
    team: moderators.map((member) => ({
      userId: member.userId,
      label: member.label,
      status: member.status,
      keyCount: member.permissions.length,
      lastActionAt: activity.get(member.userId)?.lastActionAt ?? null,
      actionsThisWeek: activity.get(member.userId)?.actionsThisWeek ?? 0,
    })),
  };
}

/** GET /api/admin/overview: the Admin's home (the Admin only; a Moderator has "my work"). */
export async function readAdminOverview(database: Database, identity: Identity): Promise<Outcome<{ overview: AdminOverview }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const access = await readStaffAccess(tx);
    if (access?.role !== 'admin') return { kind: 'forbidden' };
    return { kind: 'ok', overview: await adminOverview(tx) };
  });
}

/** POST /api/admin/reports/escalate: a Moderator asks the Admin to decide (the policy refuses the Admin and a Moderator without REPORTS_VIEW). */
export async function escalateReport(database: Database, identity: Identity, request: EscalateRequest): Promise<Outcome<object>> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const access = await readStaffAccess(tx);
      if (access?.role !== 'moderator' || !access.permissions.includes('REPORTS_VIEW')) return { kind: 'forbidden' };
      return (await insertEscalation(tx, request.targetKind, request.targetId, request.note)) ? { kind: 'ok' } : { kind: 'not_found' };
    });
  } catch (error) {
    const code = readDatabaseFault(error)?.code;
    if (code === '23505') return { kind: 'not_applicable' }; // already escalated
    if (code === '42501') return { kind: 'forbidden' };
    throw error;
  }
}

/** GET /api/admin/child-trends: CHILD_DATA_VIEW only (the function checks it too, and audits every query). */
export async function readChildTrendsView(database: Database, identity: Identity, query: ChildTrendsQuery): Promise<Outcome<{ trends: ChildTrends }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const access = await readStaffAccess(tx);
    if (access === undefined || !access.permissions.includes('CHILD_DATA_VIEW')) return { kind: 'forbidden' };
    const cells = await readChildTrends(tx, query);
    return { kind: 'ok', trends: { ...query, cells } };
  });
}
