// Shared by e2e/professionals.spec.ts (I11: the directory, a Professional's page, the Professional's home, Offer Help, articles, the profile edit and
// a Professional's registration). The stub plays the server: /api/account/kind, /api/professionals*, /api/professional/*, /api/outreach*,
// /api/posts/:id/offer-help, /api/chat/start and /api/register/professional answer the shapes of packages/shared/src/validation/professionals.ts and
// record what was sent. The auth, /api/me, /api/profile and /api/feed stubs repeat chat-stub.ts.
import type { Page } from '@playwright/test';
import { CORS, EMAIL, NOW, json, session } from './journeys-stub';

export const PID = (n: number): string => `b1100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ME = 'f0000000-0000-4000-8000-0000000000f1';
export const DANA = PID(1);
export const SHAI = PID(2);
export const POST = PID(10);
export const OFFER = PID(20);
export const CONV = PID(30);
export const ARTICLE = PID(40);
export const FEED_POST = PID(60);
export const MY_REVIEW = PID(51);
export const REVIEW_OF_ME = PID(52);

export interface ProSent {
  method: string;
  path: string;
  query: string;
  body: Record<string, unknown>;
}
export interface ProNet {
  kind: 'regular' | 'professional';
  following: boolean;
  offered: boolean;
  sent: ProSent[];
  /** I11-C (§11.21): the viewer's own review of DANA, written, edited (editedAt) or deleted through the stub. */
  myReview: { rating: number; text: string; editedAt: string | null } | null;
  /** I11-C (§13.2): the feed holds one Regular's post the Professional may Offer Help on (FEED_POST). */
  feedPost: boolean;
  /** The Chat unread count (the Professional's "שיחות" tab badge, §11.20). */
  unread: number;
  /** How many times the feed was read. */
  feedReads: number;
}

const AT = '2026-06-15T09:00:00.000Z';
const EDITED_AT = '2026-06-15T11:00:00.000Z';

const card = (id: string, fullName: string, field: string, area: string, years: number, price: number, rating: number | null) => ({
  id,
  fullName,
  businessName: null,
  field,
  fieldOther: null,
  yearsExperience: years,
  area,
  priceFrom: price,
  rating,
  reviewCount: rating === null ? 0 : 3,
});

export async function setupProfessionals(page: Page, start: Partial<ProNet> = {}): Promise<ProNet> {
  const net: ProNet = { kind: 'regular', following: false, offered: false, sent: [], myReview: null, feedPost: false, unread: 0, feedReads: 0, ...start };
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
    if (req.method() === 'GET' && req.url().includes('/auth/v1/user')) return json(route, 200, { id: ME, email: EMAIL, app_metadata: { provider: 'email' } });
    return json(route, 404, { error: 'unstubbed' });
  });
  await page.route('**/api/me', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { state: 'active', recoveryQuestions: 'set', mustSetPassword: false }),
  );
  await page.route('**/api/profile', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : net.kind === 'regular'
        ? json(route, 200, { fullName: 'נועה לוי', parentGender: 'woman' })
        : json(route, 404, { error: 'no_profile' }),
  );
  const feedUnit = () => ({
    id: FEED_POST,
    source: 'organic',
    audience: 'everyone',
    stageTag: null,
    createdAt: AT,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    kind: 'post',
    body: 'מחפשת עזרה עם הנקה בשבוע הראשון',
    isMine: false,
    isAnonymous: false,
    author: { name: 'רינה כהן' },
    ...(net.kind === 'professional' ? { offerHelp: net.offered ? 'sent' : 'available' } : {}),
  });
  await page.route('**/api/feed**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : ((net.feedReads += 1), json(route, 200, { items: net.feedPost ? [feedUnit()] : [], nextCursor: null, configVersion: 1 })),
  );
  await page.route('**/api/posts/*/comments**', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [], nextCursor: null }),
  );
  await page.route('**/api/chat/unread', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { count: net.unread }),
  );

  await page.route(
    (url) =>
      url.pathname === '/api/account/kind' ||
      url.pathname.startsWith('/api/professional') ||
      url.pathname.startsWith('/api/outreach') ||
      url.pathname === '/api/chat/start' ||
      url.pathname === '/api/register/professional' ||
      url.pathname === '/api/reports' ||
      /^\/api\/posts\/[^/]+\/offer-help$/.test(url.pathname),
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();
      const raw: unknown = method === 'GET' || req.postData() === null ? {} : req.postDataJSON();
      const body: Record<string, unknown> = typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw)) : {};
      if (method !== 'GET') net.sent.push({ method, path, query: url.search, body });
      else net.sent.push({ method, path, query: url.search, body: {} });
      if (path === '/api/account/kind') return json(route, 200, { kind: net.kind });
      // I11 follow-ups: the following list (PG-039) and a report on a review or an article (FR-MOD-001)
      if (path === '/api/professionals/following') {
        return json(route, 200, { professionals: net.following ? [card(DANA, 'דנה דולה', 'doula', 'tel_aviv', 9, 1500, 4.5)] : [] });
      }
      if (path === '/api/reports') return json(route, 201, { received: true });
      if (path === '/api/professionals') {
        const field = url.searchParams.get('field');
        const all = [card(DANA, 'דנה דולה', 'doula', 'tel_aviv', 9, 1500, 4.5), card(SHAI, 'שי שינה', 'sleep', 'haifa', 3, 400, null)];
        return json(route, 200, { professionals: field === null ? all : all.filter((c) => c.field === field) });
      }
      if (path === `/api/professionals/${DANA}`) {
        return json(route, 200, {
          ...card(DANA, 'דנה דולה', 'doula', 'tel_aviv', 9, 1500, 4.5),
          gender: 'woman',
          about: 'ליווי לידה בבית ובבית חולים',
          isMe: false,
          isFollowing: net.following,
          conversationId: null,
          canChat: true,
          reviewableConversationId: CONV,
          myReview: net.myReview === null ? null : { id: MY_REVIEW, at: AT, ...net.myReview },
          reviews: [
            ...(net.myReview === null ? [] : [{ id: MY_REVIEW, at: AT, ...net.myReview }]),
            { id: PID(50), rating: 5, text: 'ליווי מדהים', at: AT, editedAt: null },
          ],
          articles: [{ id: ARTICLE, title: 'שלושה דברים לפני הלידה', body: 'גוף המאמר', field: 'doula', status: 'published', at: AT, isMine: false, isTakenDown: false }],
        });
      }
      if (path === `/api/professionals/${ME}`) {
        return json(route, 200, {
          ...card(ME, 'נועה המקצועית', 'lactation', 'center', 5, 300, null),
          gender: null,
          about: null,
          isMe: true,
          isFollowing: false,
          conversationId: null,
          canChat: false,
          reviewableConversationId: null,
          myReview: null,
          reviews: [{ id: REVIEW_OF_ME, rating: 1, text: 'לא הגיעה לפגישה', at: AT, editedAt: null }],
          articles: net.sent.some((s) => s.path === '/api/professional/articles' && s.method === 'POST')
            ? [{ id: ARTICLE, title: 'הנקה בשבוע הראשון', body: 'גוף', field: 'lactation', status: 'published', at: AT, isMine: true, isTakenDown: false }]
            : [],
        });
      }
      if (path === `/api/professionals/${DANA}/follow`) {
        net.following = method === 'PUT';
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (path === `/api/professionals/${DANA}/reviews`) {
        const rating = typeof body.rating === 'number' ? body.rating : 0;
        const text = typeof body.text === 'string' ? body.text : '';
        if (method === 'POST') net.myReview = { rating, text, editedAt: null };
        if (method === 'PUT') net.myReview = { rating, text, editedAt: EDITED_AT };
        if (method === 'DELETE') net.myReview = null;
        return method === 'POST' ? json(route, 201, { status: 'created' }) : route.fulfill({ status: 204, headers: CORS });
      }
      if (path === '/api/chat/start') return json(route, 200, { kind: 'conversation', conversationId: CONV });
      if (path === '/api/professional/home') {
        return json(route, 200, {
          dashboard: {
            userId: ME,
            fullName: 'נועה המקצועית',
            field: 'lactation',
            fieldOther: null,
            followers: 12,
            chatStarts30d: 3,
            rating: 4.5,
            reviewCount: 2,
            engagement30d: 17,
            posts30d: 4,
            articles: 1,
            offersToday: net.offered ? 1 : 0,
            offersPerDay: 100,
            unreadChats: 2,
            acceptedOffersNew: 1,
            reviewsNew: 0,
            offersAccepted: 3,
            offersDeclined: 1,
            profileMissing: ['businessName', 'about'],
          },
          helpRequests: [{ postId: POST, excerpt: 'מישהי מכירה יועצת הנקה טובה?', isAnonymous: true, authorName: null, at: AT, offered: net.offered }],
        });
      }
      if (path === `/api/posts/${POST}/offer-help` || path === `/api/posts/${FEED_POST}/offer-help`) {
        net.offered = true;
        return json(route, 201, { id: OFFER });
      }
      if (path === '/api/professional/profile') return route.fulfill({ status: 204, headers: CORS });
      if (path === '/api/professional/articles') return json(route, 201, { id: ARTICLE });
      if (path === '/api/outreach') {
        return json(route, 200, {
          received: [
            {
              id: OFFER,
              professionalId: DANA,
              professionalName: 'דנה דולה',
              field: 'doula',
              fieldOther: null,
              postId: POST,
              postExcerpt: 'מחפשת דולה לאזור המרכז',
              text: 'אשמח לעזור, יש לי ניסיון של 9 שנים',
              status: 'pending',
              at: AT,
              conversationId: null,
            },
          ],
          sent: [],
        });
      }
      if (path === `/api/outreach/${OFFER}/accept`) return json(route, 200, { conversationId: CONV });
      if (path === '/api/register/professional') return json(route, 201, { status: 'created' });
      return json(route, 404, { error: 'unstubbed' });
    },
  );
  return net;
}
