// Shared by e2e/admin.spec.ts (I4: the admin shell, the report queue, the audit log, accounts and enforcement; FR-MOD-002/003, FR-ADMIN-005).
// The stub plays the server: GET /api/admin/access answers the role and keys (or { staff: false }); the queue, one report's detail, the audit
// pages, the account search and one account answer the shapes of packages/shared/src/validation/admin.ts; the actions answer 200 and record
// their bodies. The auth, /api/me and /api/profile stubs repeat friends-stub.ts.
import type { Page } from '@playwright/test';
import { CORS, EMAIL, NOW, json, session } from './journeys-stub';

export const ID = (n: number): string => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const KEYS = ['REPORTS_VIEW', 'CONTENT_MODERATE', 'USER_VIEW', 'USER_WARN', 'USER_SUSPEND', 'USER_BAN', 'AUDIT_LOG_VIEW'] as const;

export interface Sent {
  method: string;
  path: string;
  body: Record<string, unknown>;
}
export interface Net {
  staff: boolean;
  /** The staff role /api/admin/access reports (an Admin also sees the Admin-only tabs). */
  role: 'admin' | 'moderator';
  permissions: readonly string[];
  queue: Array<{ targetKind: 'post' | 'comment' | 'user'; targetId: string; reportCount: number; priority: number; topReasonLabel: string; isRising: boolean; firstReportedAt: string }>;
  userStatus: 'active' | 'suspended' | 'banned';
  history: Array<{ kind: string; reason: string; createdAt: string; stepSkipped: boolean }>;
  auditPages: number;
  /** I5: the image approval queue's items (ids). */
  mediaQueue: string[];
  sent: Sent[];
}

export const POST_CHILD = ID(1);
export const POST_SPAM = ID(2);
export const USER_RINA = ID(3);
export const CHILD_REPORT = ID(9);

export async function setupAdmin(page: Page, start: Partial<Net> = {}): Promise<Net> {
  const net: Net = {
    staff: true,
    role: 'admin',
    permissions: KEYS,
    queue: [
      { targetKind: 'post', targetId: POST_SPAM, reportCount: 1, priority: 4, topReasonLabel: 'ספאם או פרסום לא קשור', isRising: false, firstReportedAt: '2026-06-10T09:00:00.000Z' },
      { targetKind: 'post', targetId: POST_CHILD, reportCount: 3, priority: 1, topReasonLabel: 'תוכן שמסכן ילד', isRising: false, firstReportedAt: '2026-06-14T09:00:00.000Z' },
    ],
    userStatus: 'active',
    history: [],
    auditPages: 2,
    mediaQueue: [ID(70), ID(71)],
    sent: [],
    ...start,
  };
  // the server orders the queue: child safety first
  net.queue.sort((a, b) => a.priority - b.priority);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    Reflect.set(window, 'nestlyRealSession', true);
  });
  const far = Math.floor(new Date(2100, 0, 1).getTime() / 1000);
  await page.route('https://e2e-stub.invalid/auth/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().includes('/token')) return json(route, 200, session(far));
    if (req.url().includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, { id: 'u-1', email: EMAIL, app_metadata: { provider: 'email' } });
    return json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false });
  });
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { fullName: 'מנהלת מערכת', parentGender: 'woman' });
  });
  await page.route('**/api/feed**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, { items: [], next: null });
  });
  await page.route('**/api/admin/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const path = url.pathname;
    if (req.method() === 'POST') {
      const parsed: unknown = req.postDataJSON();
      const body: Record<string, unknown> = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
      net.sent.push({ method: 'POST', path, body });
      if (path === '/api/admin/reports/handle') {
        net.queue = net.queue.filter((item) => item.targetId !== body['targetId']);
        return json(route, 200, { closed: 1 });
      }
      if (path === '/api/admin/enforcements') {
        const kind = body['kind'];
        net.history.unshift({ kind: String(kind), reason: String(body['reason']), createdAt: '2026-06-15T09:00:00.000Z', stepSkipped: false });
        if (kind === 'suspension') net.userStatus = 'suspended';
        if (kind === 'ban') net.userStatus = 'banned';
        return json(route, 200, { status: net.userStatus, suspendedUntil: net.userStatus === 'suspended' ? '2026-06-16T09:00:00.000Z' : null });
      }
      if (path.startsWith('/api/admin/media/')) {
        net.mediaQueue = net.mediaQueue.filter((id) => !path.includes(id));
        return json(route, 200, {});
      }
      return json(route, 200, {});
    }
    if (path === '/api/admin/media-queue') {
      return json(route, 200, {
        items: net.mediaQueue.map((id, index) => ({
          id,
          kind: index === 0 ? 'post' : 'profile',
          queueReason: index === 0 ? 'blocked' : 'unsure',
          topLabel: 'FEMALE_BREAST_EXPOSED',
          topScore: index === 0 ? 0.82 : 0.31,
          isChild: false,
          createdAt: '2026-06-14T09:00:00.000Z',
          url: null,
          width: 800,
          height: 600,
        })),
      });
    }
    if (path === '/api/admin/access') return json(route, 200, net.staff ? { staff: true, role: net.role, permissions: net.permissions } : { staff: false });
    // I14 completion: the staff homes and the children's trends
    if (path === '/api/admin/my-work') {
      const reports = net.permissions.includes('REPORTS_VIEW');
      const first = net.queue[0];
      const item = first === undefined ? null : { targetKind: first.targetKind, targetId: first.targetId, priority: first.priority, waitingSince: first.firstReportedAt, timeTargetHours: first.priority === 1 ? 1 : 24, pastTarget: true };
      return json(route, 200, {
        permissions: net.permissions,
        counters: reports ? { openReports: net.queue.length, childSafetyReports: net.queue.filter((q) => q.priority === 1).length, pastTargetReports: net.queue.length, escalatedReports: 0 } : {},
        oldest: reports ? item : null,
        next: reports ? item : null,
      });
    }
    if (path === '/api/admin/overview') {
      return json(route, 200, {
        childSafetyOpen: net.queue.filter((q) => q.priority === 1).length,
        attention: { openReports: net.queue.length, pastTargetReports: 1, escalatedReports: 1, queuedImages: net.mediaQueue.length, openSupport: 0, openInvitations: 1, expiringInvitations: 0, guidesToRecheck: 9, reportSpike: { lastDay: 6, dailyAverage: 1, isSpike: true } },
        metrics: ['registrations', 'posts', 'comments', 'reports', 'enforcements', 'support'].map((key, index) => ({ key, current: 10 + index, previous: 5 })),
        team: [{ userId: ID(70), label: 'נועה לוי', status: 'active', keyCount: 3, lastActionAt: '2026-06-14T09:00:00.000Z', actionsThisWeek: 4 }],
      });
    }
    if (path === '/api/admin/child-trends') {
      return json(route, 200, {
        metric: url.searchParams.get('metric'),
        field: url.searchParams.get('field'),
        dimension: 'child_sex',
        period: url.searchParams.get('period'),
        cells: [
          { bucket: 'girl', order: 1, children: 10, value: 125, suppressed: false },
          { bucket: 'boy', order: 2, children: null, value: null, suppressed: true },
          { bucket: 'unknown', order: 3, children: null, value: null, suppressed: true },
        ],
      });
    }
    if (path === '/api/admin/reports') return json(route, 200, { items: net.queue });
    if (path.startsWith('/api/admin/reports/')) {
      const [, , , , kind, id] = path.split('/');
      return json(route, 200, {
        targetKind: kind,
        targetId: id,
        content: {
          text: 'טקסט הפוסט שדווח',
          status: 'active',
          isAnonymous: false,
          // I5: the spam post carries one image that passed the check
          ...(id === POST_SPAM ? { images: [{ id: ID(72), state: 'ready', url: null, width: 800, height: 600 }] } : {}),
        },
        // The child-safety post's oldest report has another reason: the ban must cite the child-safety one (AC-110).
        reports: [
          { id: ID(8), status: 'open', reason: 'spam', reasonLabel: 'ספאם או פרסום לא קשור', details: null, copiedText: 'טקסט הפוסט שדווח', resolution: null, createdAt: '2026-06-13T09:00:00.000Z' },
          ...(id === POST_CHILD
            ? [{ id: CHILD_REPORT, status: 'open', reason: 'child_safety', reasonLabel: 'תוכן שמסכן ילד', details: null, copiedText: 'טקסט הפוסט שדווח', resolution: null, createdAt: '2026-06-14T09:00:00.000Z' }]
            : []),
        ],
        user: { userId: USER_RINA, accountType: 'regular', status: net.userStatus, suspendedUntil: null, fullName: 'רינה כהן', history: net.history, suggestion: { kind: 'warning', hours: null } },
        // I14 completion: the context, the author card and the handling status
        context: { post: null, comments: [{ id: ID(80), parentId: null, text: 'תגובה בשרשור', status: 'active', isAnonymous: false, createdAt: '2026-06-13T10:00:00.000Z', isReported: false }] },
        authorCard: { accountAgeDays: 400, enforcementsLastYear: 1 },
        handling: { openings: [{ label: null, isMe: true, at: '2026-06-15T08:00:00.000Z' }], escalation: null },
      });
    }
    if (path === '/api/admin/audit') {
      const before = url.searchParams.get('before');
      const first = before === null;
      const entries = (first ? ['user_ban', 'content_hidden'] : ['permission_granted']).map((action, index) => ({
        id: ID(100 + index + (first ? 0 : 10)),
        occurredAt: '2026-06-14T09:00:00.000Z',
        actorRole: 'admin',
        actorId: ID(50),
        action,
        targetKind: action === 'permission_granted' ? 'user' : 'post',
        targetId: ID(60 + index),
        reason: first ? 'סיבה לדוגמה' : null,
      }));
      return json(route, 200, { entries, next: first && net.auditPages > 1 ? `2026-06-13T09:00:00.000000Z|${ID(101)}` : null });
    }
    if (path === '/api/admin/users') return json(route, 200, { users: [{ userId: USER_RINA, accountType: 'regular', status: net.userStatus, fullName: 'רינה כהן' }] });
    if (path.startsWith('/api/admin/users/')) {
      return json(route, 200, { userId: USER_RINA, accountType: 'regular', status: net.userStatus, suspendedUntil: null, fullName: 'רינה כהן', history: net.history, suggestion: { kind: 'warning', hours: null } });
    }
    return json(route, 404, { error: 'not_found' });
  });
  return net;
}
