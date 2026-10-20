import { describe, expect, it } from 'vitest';
import {
  PERMISSION_KEYS,
  checkAuditQuery,
  checkEnforce,
  checkHandleReports,
  checkModerateContent,
  checkRevealAuthor,
  ladderSuggestion,
  violationWeight,
} from '../src/index.js';

// The admin core's shared rules (FR-MOD-002, FR-MOD-003, BR-074): strict bodies, trimmed reasons, the ladder. Expected values are the SRS's.
const ID = '11111111-1111-4111-8111-111111111111';

describe('[FR-ADMIN-004 SRS 3.1] the Permission Keys', () => {
  it('are the fourteen assignable ones, none of the Admin-only keys', () => {
    expect(PERMISSION_KEYS).toHaveLength(14);
    for (const adminOnly of ['MODERATOR_MANAGE', 'SECURITY_SETTINGS_MANAGE', 'BILLING_FINANCE_MANAGE', 'LEGAL_POLICY_MANAGE']) expect(PERMISSION_KEYS).not.toContain(adminOnly);
  });
});

describe('[BR-074 AC-107] the ladder', () => {
  it('suggests a warning, then 24 hours, 7 days, 30 days, then a ban', () => {
    expect([0, 1, 2, 3, 4, 7].map((n) => ladderSuggestion(n))).toEqual([
      { kind: 'warning', hours: null },
      { kind: 'suspension', hours: 24 },
      { kind: 'suspension', hours: 168 },
      { kind: 'suspension', hours: 720 },
      { kind: 'ban', hours: null },
      { kind: 'ban', hours: null },
    ]);
  });
  it('counts a warning or suspension once and a ban as the whole ladder; an unban or reinstatement not at all', () => {
    expect([violationWeight('warning'), violationWeight('suspension'), violationWeight('ban'), violationWeight('unban'), violationWeight('reinstate')]).toEqual([1, 1, 4, 0, 0]);
  });
});

describe('[FR-MOD-003] handling a report', () => {
  const base = { targetKind: 'post', targetId: ID, resolution: 'dismissed' };
  it('takes a target, a resolution, an optional note and an optional moderation with a reason', () => {
    expect(checkHandleReports(base).ok).toBe(true);
    expect(checkHandleReports({ ...base, note: '  fine  ' })).toEqual({ ok: true, value: { ...base, note: 'fine' } });
    expect(checkHandleReports({ ...base, resolution: 'action_taken', moderation: { status: 'hidden', reason: 'rude' } }).ok).toBe(true);
  });
  it('refuses an unknown key (no actor can be named), a blank or over-long reason, a bad id, a bad resolution', () => {
    expect(checkHandleReports({ ...base, handledBy: ID }).ok).toBe(false);
    expect(checkHandleReports({ ...base, moderation: { status: 'hidden', reason: '   ' } }).ok).toBe(false);
    expect(checkHandleReports({ ...base, note: 'x'.repeat(1001) }).ok).toBe(false);
    expect(checkHandleReports({ ...base, targetId: 'nope' }).ok).toBe(false);
    expect(checkHandleReports({ ...base, resolution: 'later' }).ok).toBe(false);
    expect(checkHandleReports({ ...base, moderation: { status: 'deleted', reason: 'x' } }).ok).toBe(false);
  });
  it('moderating content needs a post or comment, a status and a reason', () => {
    expect(checkModerateContent({ targetKind: 'comment', targetId: ID, status: 'removed', reason: 'spam' }).ok).toBe(true);
    expect(checkModerateContent({ targetKind: 'user', targetId: ID, status: 'removed', reason: 'spam' }).ok).toBe(false);
    expect(checkModerateContent({ targetKind: 'post', targetId: ID, status: 'removed' }).ok).toBe(false);
  });
  it('a reveal names a post and nothing else', () => {
    expect(checkRevealAuthor({ postId: ID }).ok).toBe(true);
    expect(checkRevealAuthor({ postId: ID, userId: ID }).ok).toBe(false);
  });
});

describe('[FR-MOD-002 AC-028 AC-110] an enforcement', () => {
  it('a suspension needs a duration; no other kind takes one', () => {
    expect(checkEnforce({ userId: ID, kind: 'suspension', reason: 'rude', durationHours: 24 }).ok).toBe(true);
    expect(checkEnforce({ userId: ID, kind: 'suspension', reason: 'rude' }).ok).toBe(false);
    expect(checkEnforce({ userId: ID, kind: 'warning', reason: 'rude', durationHours: 24 }).ok).toBe(false);
    expect(checkEnforce({ userId: ID, kind: 'suspension', reason: 'rude', durationHours: 0 }).ok).toBe(false);
    expect(checkEnforce({ userId: ID, kind: 'suspension', reason: 'rude', durationHours: 9000 }).ok).toBe(false);
  });
  it('always has a reason; the child-safety mark belongs to a ban; the actor cannot be named', () => {
    expect(checkEnforce({ userId: ID, kind: 'warning', reason: '' }).ok).toBe(false);
    expect(checkEnforce({ userId: ID, kind: 'ban', reason: 'child', childSafety: true, reportId: ID }).ok).toBe(true);
    expect(checkEnforce({ userId: ID, kind: 'warning', reason: 'x', childSafety: true }).ok).toBe(false);
    expect(checkEnforce({ userId: ID, kind: 'ban', reason: 'x', actorId: ID }).ok).toBe(false);
  });
});

describe('[FR-ADMIN-005] the audit page query', () => {
  it('takes an ISO time or nothing', () => {
    expect(checkAuditQuery({}).ok).toBe(true);
    expect(checkAuditQuery({ before: '2026-10-20T10:00:00.000Z' }).ok).toBe(true);
    expect(checkAuditQuery({ before: 'yesterday' }).ok).toBe(false);
    expect(checkAuditQuery({ limit: 5 }).ok).toBe(false);
  });
});
