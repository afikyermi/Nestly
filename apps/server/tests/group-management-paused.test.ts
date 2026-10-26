import { describe, expect, it } from 'vitest';
import type { GroupDetailRow } from '../src/repositories/groups-repository.js';
import { managingRole, notManaging } from '../src/services/groups-service.js';

// FR-GRP-003, OP-070, AC-185: a muted Group Moderator or Admin manages nothing until the mute ends. The database refuses every management
// action (their rank answers a member's); the server reads the paused state from it and names a management refusal `muted`, so the screen
// says why instead of showing an empty list. The answers through the real database: tests/db/group-rules.db.test.ts.

const row = (myRole: GroupDetailRow['myRole'], managementPaused: boolean): GroupDetailRow => ({
  id: 'e0000000-0000-4000-8000-000000000001', name: 'ניהול בהפסקה', description: null, privacy: 'public', memberRows: 4, myRole,
  requested: false, invitationId: null, blocked: false, rules: null, pinnedPostId: null, mode: null, createdAt: '2026-10-26T09:00:00.000Z',
  muteUntil: managementPaused ? '2026-10-27T09:00:00.000Z' : null, muteReason: managementPaused ? 'spam' : null, muteReasonText: null,
  highlightThreshold: 3, managementPaused,
});

describe('[FR-GRP-003 OP-070 AC-185] the Role a caller manages a Group with', () => {
  it('a muted Admin or Moderator manages as a member and is refused as muted', () => {
    for (const role of ['admin', 'moderator'] as const) {
      expect(managingRole(row(role, true))).toBe('member');
      expect(notManaging(row(role, true))).toEqual({ kind: 'muted' });
    }
  });
  it('an unmuted manager keeps the Role; a member or an outsider is refused as not allowed', () => {
    expect(managingRole(row('admin', false))).toBe('admin');
    expect(managingRole(row('owner', false))).toBe('owner');
    expect(managingRole(row(null, false))).toBeNull();
    expect(notManaging(row('member', false))).toEqual({ kind: 'not_allowed' });
    expect(notManaging(row(null, false))).toEqual({ kind: 'not_allowed' });
  });
});
