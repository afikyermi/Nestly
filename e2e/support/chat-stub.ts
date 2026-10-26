// Shared by e2e/chat.spec.ts (I8: the Chat Center, a conversation, the Support form and thread, the Support inbox; FR-CHAT-001..004,
// FR-ADMIN-001/002, FR-SERV-009). The stub plays the server: /api/chat/*, /api/support/*, /api/users/:id/chat-block, /api/reports and
// /api/admin/support/* answer the shapes of packages/shared/src/validation/chat.ts and record what was sent. The auth, /api/me, /api/profile and
// /api/feed stubs repeat admin-stub.ts.
import type { Page } from '@playwright/test';
import { CORS, EMAIL, NOW, json, session } from './journeys-stub';

export const CID = (n: number): string => `c8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const DANA = CID(1);
export const LIOR = CID(2);
export const CONV = CID(10);
export const REQ = CID(20);
export const SUP = CID(30);
export const MSG_OPEN = CID(40);
export const MSG_THEIRS = CID(41);

export interface ChatSent {
  method: string;
  path: string;
  body: Record<string, unknown>;
}
export interface ChatNet {
  staff: boolean;
  incoming: boolean;
  canSend: boolean;
  blockedByMe: boolean;
  messages: Array<{ id: string; text: string; at: string; mine: boolean; isOpening: boolean }>;
  supportStatus: 'open' | 'in_progress' | 'closed';
  supportMessages: Array<{ id: string; text: string; at: string; author: 'user' | 'support'; internal: boolean }>;
  sent: ChatSent[];
}

const AT = '2026-06-15T09:00:00.000Z';

export async function setupChat(page: Page, start: Partial<ChatNet> = {}): Promise<ChatNet> {
  const net: ChatNet = {
    staff: false,
    incoming: true,
    canSend: true,
    blockedByMe: false,
    messages: [
      { id: MSG_OPEN, text: 'היי, ראיתי את הפוסט שלך', at: AT, mine: false, isOpening: true },
      { id: MSG_THEIRS, text: 'אשמח לדבר', at: AT, mine: false, isOpening: false },
    ],
    supportStatus: 'open',
    supportMessages: [{ id: CID(50), text: 'בודקים ונחזור אלייך', at: AT, author: 'support', internal: false }],
    sent: [],
    ...start,
  };
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
  await page.route('**/api/me', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false }),
  );
  await page.route('**/api/profile', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { fullName: 'נועה לוי', parentGender: 'woman' }),
  );
  await page.route('**/api/feed**', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [], next: null }),
  );

  // The Chat badge's count comes from the bell's light poll (GET /api/notifications/counts); /api/chat/unread below is its fallback only.
  await page.route('**/api/notifications/counts', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { unreadCount: 0, chatUnread: net.incoming ? 2 : 1, latestId: null }),
  );

  const record = (method: string, path: string, raw: unknown) => {
    const body: Record<string, unknown> = typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw)) : {};
    net.sent.push({ method, path, body });
    return body;
  };

  await page.route(
    (url) => url.pathname.startsWith('/api/chat') || url.pathname.startsWith('/api/support') || url.pathname.startsWith('/api/admin/') || /^\/api\/users\/[^/]+\/chat-block$/.test(url.pathname) || url.pathname === '/api/reports',
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();
      const body = method === 'GET' ? {} : record(method, path, req.postData() === null ? null : req.postDataJSON());
      if (path === '/api/admin/access') {
        return json(route, 200, net.staff ? { staff: true, role: 'admin', permissions: ['SUPPORT_VIEW', 'SUPPORT_HANDLE', 'REPORTS_VIEW'] } : { staff: false });
      }
      if (path === '/api/chat/unread') return json(route, 200, { count: net.incoming ? 2 : 1 });
      if (path === '/api/chat') {
        return json(route, 200, {
          conversations: net.incoming ? [] : [{ id: CONV, otherUserId: DANA, otherName: 'דנה כהן', lastMessage: { text: 'אשמח לדבר', at: AT, mine: false }, unread: 1, canSend: net.canSend }],
          incoming: net.incoming ? [{ id: REQ, userId: DANA, name: 'דנה כהן', text: 'היי, ראיתי את הפוסט שלך', at: AT }] : [],
          outgoing: [],
          support: [{ id: SUP, topic: 'bug', status: net.supportStatus, lastMessage: { text: 'בודקים ונחזור אלייך', at: AT, fromSupport: true }, unread: 1 }],
          unreadTotal: net.incoming ? 2 : 2,
        });
      }
      if (path === `/api/chat/requests/${REQ}/accept`) {
        net.incoming = false;
        return json(route, 200, { conversationId: CONV });
      }
      if (path === `/api/chat/conversations/${CONV}`) {
        return json(route, 200, { id: CONV, otherUserId: DANA, otherName: 'דנה כהן', canSend: net.canSend, blockedByMe: net.blockedByMe, messages: net.messages });
      }
      if (path === `/api/chat/conversations/${CONV}/messages`) {
        if (!net.canSend) return json(route, 403, { error: 'blocked' });
        net.messages.push({ id: CID(60 + net.messages.length), text: String(body['text']), at: AT, mine: true, isOpening: false });
        return json(route, 201, { id: CID(99), at: AT });
      }
      if (path === `/api/users/${DANA}/chat-block`) {
        net.canSend = method !== 'PUT';
        net.blockedByMe = method === 'PUT';
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (path === '/api/chat/start') {
        return json(route, 200, { kind: 'request' });
      }
      if (path === '/api/reports') return json(route, 201, { received: true });
      if (path === '/api/support' && method === 'POST') return json(route, 201, { id: CID(31) });
      if (path === '/api/support') {
        const created = net.sent.some((s) => s.path === '/api/support');
        return json(route, 200, { requests: created ? [{ id: CID(31), topic: 'privacy_safety', status: 'open', createdAt: AT, unread: 0 }] : [] });
      }
      if (path === `/api/support/${SUP}`) {
        return json(route, 200, {
          id: SUP,
          topic: 'bug',
          status: net.supportStatus,
          text: 'הכפתור לא עובד',
          createdAt: AT,
          messages: net.supportMessages.filter((m) => !m.internal).map((m) => ({ id: m.id, text: m.text, at: m.at, fromSupport: m.author === 'support' })),
        });
      }
      if (path === `/api/support/${SUP}/messages`) {
        net.supportMessages.push({ id: CID(70 + net.supportMessages.length), text: String(body['text']), at: AT, author: 'user', internal: false });
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (path === '/api/admin/support') {
        return json(route, 200, {
          items: [{ id: SUP, topic: 'bug', status: net.supportStatus, createdAt: AT, updatedAt: AT, userId: LIOR, userName: 'ליאור אברהם', text: 'הכפתור לא עובד' }],
        });
      }
      if (path === `/api/admin/support/${SUP}`) {
        return json(route, 200, { id: SUP, topic: 'bug', status: net.supportStatus, text: 'הכפתור לא עובד', createdAt: AT, userId: LIOR, userName: 'ליאור אברהם', messages: net.supportMessages });
      }
      if (path === `/api/admin/support/${SUP}/messages`) {
        net.supportMessages.push({ id: CID(80 + net.supportMessages.length), text: String(body['text']), at: AT, author: 'support', internal: body['internal'] === true });
        return json(route, 200, {});
      }
      if (path === `/api/admin/support/${SUP}/status`) {
        const next = body['status'];
        if (next === 'open' || next === 'in_progress' || next === 'closed') net.supportStatus = next;
        return json(route, 200, {});
      }
      return json(route, 404, { error: 'unstubbed' });
    },
  );
  return net;
}
