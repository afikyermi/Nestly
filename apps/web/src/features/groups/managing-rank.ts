import { groupRoleRank, type GroupDetail } from '@nestly/shared';

/**
 * The rank the caller manages the Group with now (FR-GRP-003, OP-070): a Group Moderator or Admin who is muted manages nothing until the
 * mute ends, so the screen offers them a member's controls. `myRole` stays the Role they hold; the database decides either way.
 */
export function managingRank(group: GroupDetail): number {
  return group.managementPaused === null ? groupRoleRank(group.myRole) : groupRoleRank('member');
}
