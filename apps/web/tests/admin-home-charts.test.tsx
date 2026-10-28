// The Admin's home, its charts (FR-ADMIN-014, AC-216, Afik 28.10.2026): the community's last 30 days — registrations, accounts that came in,
// posts and reports, day by day — each an image named by its title with the same numbers as a table, and a link to the full data screen.
// They load on their own: while they load, or when they fail, the rest of the home is there; a retry asks again; an account the server
// refuses sees no charts. Who may read the numbers is the server's (ANALYTICS_VIEW); this is what the screen shows.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminOverview, AnalyticsView } from '@nestly/shared';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminHomeCharts } from '@/features/admin/AdminHomeCharts';
import { AdminHomeScreen } from '@/features/admin/AdminHomeScreen';

const api = vi.hoisted(() => ({
  fetchAnalytics: vi.fn(),
  fetchAdminOverview: vi.fn(),
  // one account for every render, as the session gives it
  account: { getAccessToken: () => Promise.resolve('tok'), recheck: () => Promise.resolve() },
}));

vi.mock('@/hooks/use-session-account', () => ({ useSessionAccount: () => api.account }));
vi.mock('@/services/api/team', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchAnalytics: (...args: unknown[]): unknown => api.fetchAnalytics(...args),
}));
vi.mock('@/services/api/staff-work', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchAdminOverview: (...args: unknown[]): unknown => api.fetchAdminOverview(...args),
}));

const days = (counts: number[]) => counts.map((count, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, count }));
const view: AnalyticsView = {
  days: 30,
  accounts: {
    byType: { regular: 120, professional: 8, moderator: 2, admin: 1 },
    byStatus: { active: 128, suspended: 2, banned: 1, deletionScheduled: 0 },
    registrations: days([1, 2, 3]).map((d) => ({ day: d.day, regular: d.count, professional: 1 })),
  },
  content: { posts: days([4, 0, 6]), comments: days([1]), likes: days([1]), postsPerAuthor: [] },
  friendships: { requested: 0, accepted: 0 },
  moderation: { reports: days([0, 0, 0]), byReason: [], open: 0, actionTaken: 0, dismissed: 0, medianHoursToClose: null, enforcements: { warning: 0, suspension: 0, ban: 0 } },
  support: { requests: days([1]), byTopic: [], byStatus: { open: 0, inProgress: 0, closed: 0 }, answered: 0, medianHoursToFirstReply: null },
  groups: { active: { public: 0, private: 0 }, created: 0, publicMembers: 0, publicJoins: 0, publicPosts: 0, publicComments: 0 },
  professionals: { active: 0, byField: [], follows: 0, chatStarts: 0, reviews: 0 },
  marketplace: { active: 0, byCategory: [], created: 0, sold: 0, chats: 0, soldByDay: [] },
  usage: { dailyLogins: days([7, 9, 8]), profileViews: [], postViews: [] },
};
const overview: AdminOverview = {
  childSafetyOpen: 0,
  accountDeletions: { pending: 0, overdue: 0 },
  attention: { openReports: 0, pastTargetReports: 0, escalatedReports: 0, queuedImages: 0, openSupport: 0, openInvitations: 0, draftGuides: 0, reportSpike: { lastDay: 0, dailyAverage: 0, isSpike: false } },
  metrics: [{ key: 'posts', current: 5, previous: 3 }],
  team: [],
};

const renderCharts = () =>
  render(
    <MemoryRouter>
      <AdminHomeCharts />
    </MemoryRouter>,
  );

beforeEach(() => {
  api.fetchAnalytics.mockReset();
  api.fetchAdminOverview.mockReset();
});

describe('[FR-ADMIN-014 AC-216] the Admin home charts', () => {
  it('[AC-216] asks for the last 30 days and draws registrations, logins, posts and reports, each with its table, and links to all the data', async () => {
    api.fetchAnalytics.mockResolvedValue({ kind: 'ok', value: view });
    renderCharts();
    expect(screen.getByRole('status', { name: 'טוענים את הגרפים' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'הרשמות ליום' })).toBeInTheDocument();
    expect(api.fetchAnalytics).toHaveBeenCalledWith('tok', 30);
    expect(screen.getByRole('heading', { name: 'הקהילה ב-30 הימים האחרונים' })).toBeInTheDocument();
    for (const title of ['הרשמות ליום', 'חשבונות שנכנסו', 'פוסטים ליום']) expect(screen.getByRole('img', { name: title })).toBeInTheDocument();
    // registrations are Regular and Professional together: 2, 3, 4 a day
    const table = screen.getByRole('table', { name: 'הרשמות ליום · הנתונים בטבלה' });
    expect(within(table).getAllByRole('cell').map((cell) => cell.textContent?.trim())).toEqual(['2', '3', '4']);
    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['01.10', '02.10', '03.10']);
    expect(screen.getByText('9 בתקופה · 3 ביום בממוצע')).toBeInTheDocument();
    // a period with no report says so instead of drawing empty bars
    expect(screen.getByText('דיווחים ליום: אין נתונים בתקופה הזו')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'לכל הנתונים' })).toHaveAttribute('href', '/admin/analytics');
  });

  it('[AC-216] a failure says so in place, and a retry asks again', async () => {
    api.fetchAnalytics.mockResolvedValueOnce({ kind: 'failed' }).mockResolvedValueOnce({ kind: 'ok', value: view });
    renderCharts();
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את הגרפים. אפשר לנסות שוב');
    await userEvent.click(screen.getByRole('button', { name: 'ניסיון חוזר' }));
    expect(await screen.findByRole('img', { name: 'פוסטים ליום' })).toBeInTheDocument();
    expect(api.fetchAnalytics).toHaveBeenCalledTimes(2);
  });

  it('[AC-216] an account the server refuses sees no charts', async () => {
    api.fetchAnalytics.mockResolvedValue({ kind: 'forbidden' });
    const { container } = renderCharts();
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('[AC-216] on the home, a failure of the charts leaves the week, what needs attention and the team in place', async () => {
    api.fetchAdminOverview.mockResolvedValue({ kind: 'ok', value: overview });
    api.fetchAnalytics.mockResolvedValue({ kind: 'failed' });
    render(
      <MemoryRouter>
        <AdminHomeScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את הגרפים');
    expect(screen.getByRole('heading', { name: 'השבוע לעומת השבוע הקודם' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'דורש תשומת לב' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'מצב הצוות' })).toBeInTheDocument();
    // the charts' section comes right after the week's numbers
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(['השבוע לעומת השבוע הקודם', 'הקהילה ב-30 הימים האחרונים']);
  });
});
