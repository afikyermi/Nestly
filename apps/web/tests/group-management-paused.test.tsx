// A muted Group Moderator or Admin manages nothing until the mute ends (FR-GRP-003, OP-070, AC-185): the Group page says so in one line and
// offers no management control — no Join Requests, invitations to approve, blocked list, details or member actions — while the enforcement
// history stays readable. An unmuted manager keeps every control. The database refuses the actions either way; this is what the screen offers.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GroupDetail, GroupMember } from '@nestly/shared';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupScreen } from '@/features/groups/GroupScreen';
import { highlightRule, managementPausedLine } from '@/features/groups/groups-texts';
import { managingRank } from '@/features/groups/managing-rank';
import { formatPostTime } from '@/lib/format-post-time';

const GROUP = 'e0000000-0000-4000-8000-000000000001';
const ME = 'a0000000-0000-4000-8000-000000000011';
const OTHER = 'a0000000-0000-4000-8000-000000000012';
const UNTIL = '2026-11-02T12:00:00.000Z';

const api = vi.hoisted(() => ({
  fetchGroup: vi.fn(),
  listRequests: vi.fn(),
  listAwaitingInvitations: vi.fn(),
  listBans: vi.fn(),
  listEnforcements: vi.fn(),
  listMembers: vi.fn(),
  listMyEnforcements: vi.fn(),
  // one account for every render, as the session gives it: a new object each render would reload the Group without end
  account: { getAccessToken: () => Promise.resolve('tok'), recheck: () => Promise.resolve() },
}));

vi.mock('@/hooks/use-session-account', () => ({
  useSessionAccount: () => api.account,
}));
vi.mock('@/hooks/use-posting-right', () => ({ usePostingProfile: () => ({ right: 'allowed', fullName: 'דנה כהן' }), usePostingRight: () => 'allowed' }));
vi.mock('@/hooks/use-staff-access', () => ({ useStaffAccess: () => ({ kind: 'none' }) }));
vi.mock('@/services/api/groups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchGroup: (...args: unknown[]): unknown => api.fetchGroup(...args),
  listRequests: (...args: unknown[]): unknown => api.listRequests(...args),
  listAwaitingInvitations: (...args: unknown[]): unknown => api.listAwaitingInvitations(...args),
  listBans: (...args: unknown[]): unknown => api.listBans(...args),
  listEnforcements: (...args: unknown[]): unknown => api.listEnforcements(...args),
  listMembers: (...args: unknown[]): unknown => api.listMembers(...args),
  listMyEnforcements: (...args: unknown[]): unknown => api.listMyEnforcements(...args),
}));

const detail = (role: GroupDetail['myRole'], paused: boolean): GroupDetail => ({
  id: GROUP,
  name: 'הליכות בוקר עם עגלה',
  description: null,
  privacy: 'private',
  memberCount: 12,
  myRole: role,
  state: 'member',
  rules: null,
  pinnedPostId: null,
  notificationMode: 'highlights',
  invitationId: null,
  createdAt: '2026-06-01T09:00:00.000Z',
  myMute: paused ? { until: UNTIL, reason: 'spam', reasonText: null } : null,
  highlightThreshold: 3,
  managementPaused: paused ? { until: UNTIL } : null,
});

const members: GroupMember[] = [
  { userId: ME, fullName: 'דנה כהן', role: 'admin', isMe: true, joinedAt: '2026-06-15T09:00:00.000Z' },
  { userId: OTHER, fullName: 'יוסי כהן', role: 'member', isMe: false, joinedAt: '2026-06-01T09:00:00.000Z' },
];
const record = {
  id: 'b0000000-0000-4000-8000-000000000031', userId: ME, fullName: 'דנה כהן', kind: 'warn_mute' as const, reason: 'spam' as const,
  reasonText: null, muteUntil: UNTIL, createdAt: '2026-10-26T12:00:00.000Z',
};

function open(group: GroupDetail) {
  api.fetchGroup.mockResolvedValue({ kind: 'ok', value: group });
  render(
    <MemoryRouter>
      <GroupScreen groupId={GROUP} discussion={() => null} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const fn of [api.fetchGroup, api.listRequests, api.listAwaitingInvitations, api.listBans, api.listEnforcements, api.listMembers, api.listMyEnforcements]) fn.mockReset();
  api.listRequests.mockResolvedValue({ kind: 'ok', value: [{ userId: OTHER, fullName: 'מירי אברהם', at: '2026-10-26T10:00:00.000Z' }] });
  api.listAwaitingInvitations.mockResolvedValue({ kind: 'ok', value: [] });
  api.listBans.mockResolvedValue({ kind: 'ok', value: [] });
  api.listEnforcements.mockResolvedValue({ kind: 'ok', value: [record] });
  api.listMembers.mockResolvedValue({ kind: 'ok', value: members });
  api.listMyEnforcements.mockResolvedValue({ kind: 'ok', value: [] });
});

describe('[FR-GRP-003 OP-070 AC-185 PG-035] a muted Group manager', () => {
  it('[AC-185] sees one line that management is paused until the mute ends, the Role still shown', async () => {
    open(detail('admin', true));
    const line = await screen.findByText(managementPausedLine(formatPostTime(UNTIL)));
    expect(line.getAttribute('role')).toBe('note');
    expect(line.textContent).toBe(`בזמן ההשתקה פעולות הניהול בקבוצה מושהות עד ${formatPostTime(UNTIL)}`);
    expect(screen.getByText(/· מנהל$/).tagName).toBe('P');
  });

  it('[AC-185] the management tab holds only the enforcement history: no requests, invitations, blocked list or details are asked for or shown', async () => {
    const user = userEvent.setup();
    open(detail('admin', true));
    await user.click(await screen.findByRole('tab', { name: 'ניהול' }));
    expect(await screen.findByRole('region', { name: 'היסטוריית אכיפה' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'בקשות הצטרפות' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'הזמנות שמחכות לאישור' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'חסומים בקבוצה' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'פרטי הקבוצה' })).toBeNull();
    expect(screen.queryByText('אין חסומים')).toBeNull();
    expect(api.listRequests).not.toHaveBeenCalled();
    expect(api.listAwaitingInvitations).not.toHaveBeenCalled();
    expect(api.listBans).not.toHaveBeenCalled();
    expect(api.listEnforcements).toHaveBeenCalled();
  });

  it('[AC-185] the members list offers no action on anyone', async () => {
    const user = userEvent.setup();
    open(detail('admin', true));
    await user.click(await screen.findByRole('tab', { name: 'חברים' }));
    expect(await screen.findByText('יוסי כהן')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'פעולות על יוסי כהן' })).toBeNull();
  });

  it('[FR-GRP-003] an unmuted Admin keeps every control and sees no paused line', async () => {
    const user = userEvent.setup();
    open(detail('admin', false));
    await user.click(await screen.findByRole('tab', { name: 'ניהול' }));
    const requests = await screen.findByRole('region', { name: 'בקשות הצטרפות' });
    expect(await within(requests).findByText('מירי אברהם')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'חסומים בקבוצה' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'פרטי הקבוצה' })).toBeTruthy();
    expect(screen.queryByText(/פעולות הניהול בקבוצה מושהות/)).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'חברים' }));
    expect(await screen.findByRole('button', { name: 'פעולות על יוסי כהן' })).toBeTruthy();
  });

  it('[FR-GRP-003] a plain member has no management tab and no paused line', async () => {
    open(detail('member', false));
    expect(await screen.findByRole('tab', { name: 'חברים' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'ניהול' })).toBeNull();
    expect(screen.queryByText(/פעולות הניהול בקבוצה מושהות/)).toBeNull();
  });

  it('[OP-070] the rank the screen manages with: a muted Moderator or Admin a member\'s, the Owner and the unmuted their own', () => {
    expect(managingRank(detail('admin', true))).toBe(1);
    expect(managingRank(detail('moderator', true))).toBe(1);
    expect(managingRank(detail('admin', false))).toBe(3);
    expect(managingRank(detail('owner', false))).toBe(4);
  });
});

describe('[FR-ALG-010 BR-060 OP-077] the Highlights rule on "על הקבוצה"', () => {
  it('counts different people other than the author, each once', () => {
    expect(highlightRule(3)).toBe('פוסט נכנס לעיקרי הדברים ולפיד הראשי של החברים כש-3 אנשים שונים, מלבד מי שכתב אותו, סימנו לייק או הגיבו עליו (כל אדם נספר פעם אחת)');
    expect(highlightRule(3)).not.toContain('לייקים ותגובות');
  });
});
