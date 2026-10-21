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
  /** I13: the caller's promotions (the promotion screen and billing), and whether the Directory serves a promoted card. */
  promotions: Array<{ id: string; state: 'running' | 'stopped' | 'ended'; stoppedBy: 'owner' | 'staff' | null }>;
  promotedCard: boolean;
  sent: ProSent[];
}
export const PROMO = PID(60);

const AT = '2026-06-15T09:00:00.000Z';

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
  const net: ProNet = { kind: 'regular', following: false, offered: false, promotions: [], promotedCard: false, sent: [], ...start };
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
  await page.route('**/api/feed**', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [], nextCursor: null, configVersion: 1 }),
  );

  await page.route(
    (url) =>
      url.pathname === '/api/account/kind' ||
      url.pathname.startsWith('/api/professional') ||
      url.pathname.startsWith('/api/outreach') ||
      url.pathname === '/api/chat/start' ||
      url.pathname === '/api/register/professional' ||
      url.pathname === '/api/reports' ||
      url.pathname.startsWith('/api/promotions') ||
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
        const promoted = net.promotedCard ? [{ promotionId: PROMO, card: card(PID(61), 'רותם צלמת', 'photography', 'eilat', 4, 800, null) }] : [];
        return json(route, 200, { professionals: field === null ? all : all.filter((c) => c.field === field), promoted });
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
          reviews: [{ id: PID(50), rating: 5, text: 'ליווי מדהים', at: AT }],
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
          reviews: [],
          articles: net.sent.some((s) => s.path === '/api/professional/articles' && s.method === 'POST')
            ? [{ id: ARTICLE, title: 'הנקה בשבוע הראשון', body: 'גוף', field: 'lactation', status: 'published', at: AT, isMine: true, isTakenDown: false }]
            : [],
        });
      }
      if (path === `/api/professionals/${DANA}/follow`) {
        net.following = method === 'PUT';
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (path === `/api/professionals/${DANA}/reviews`) return json(route, 201, { status: 'created' });
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
            offersPerDay: 10,
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
      if (path === `/api/posts/${POST}/offer-help`) {
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
      // I13: the promotion screen (PG-041), billing (PG-042) and a paid click; sample prices, simulated payment
      if (path === '/api/promotions' && method === 'GET') {
        const plans =
          net.kind === 'professional'
            ? [
                { key: 'profile_7', targetKind: 'profile', days: 7, samplePriceIls: 49 },
                { key: 'profile_30', targetKind: 'profile', days: 30, samplePriceIls: 149 },
                { key: 'post_3', targetKind: 'post', days: 3, samplePriceIls: 19 },
              ]
            : [{ key: 'listing_3', targetKind: 'listing', days: 3, samplePriceIls: 9 }];
        const zero = { impressions: 0, clicks: 0, follows: 0, chatStarts: 0 };
        return json(route, 200, {
          plans,
          promotions: net.promotions.map((p) => ({
            id: p.id,
            targetKind: 'profile',
            planKey: 'profile_7',
            state: p.state,
            startsAt: AT,
            endsAt: '2026-06-22T09:00:00.000Z',
            stoppedAt: p.state === 'stopped' ? AT : null,
            stoppedBy: p.stoppedBy,
            postId: null,
            listingId: null,
            targetLabel: null,
            counts: { ...zero, impressions: 12, clicks: 2 },
          })),
          posts: [{ id: POST, excerpt: 'שלושה טיפים להנקה' }],
          analytics:
            net.kind === 'professional'
              ? {
                  days: 30,
                  organic: { profileViews: 40, profileViewers: 25, postViews: 120, postReach: 80, followers: 12, engagement: 17, chatStarts: 3 },
                  paid: { ...zero, impressions: 12, clicks: 2, profileVisits: 2, sampleSpentIls: 49, costPerClickIls: 24.5 },
                }
              : null,
        });
      }
      if (path === '/api/promotions' && method === 'POST') {
        net.promotions.unshift({ id: PROMO, state: 'running', stoppedBy: null });
        return json(route, 201, { promotionId: PROMO, receipt: { reference: PID(62), amountIls: 49, isSimulated: true } });
      }
      if (path === '/api/promotions/billing') {
        return json(route, 200, {
          payments: net.promotions.map(() => ({ id: PID(63), planKey: 'profile_7', targetKind: 'profile', amountIls: 49, isSimulated: true, reference: PID(62), at: AT })),
        });
      }
      if (/^\/api\/promotions\/[^/]+\/(stop|click)$/.test(path)) {
        if (path.endsWith('/stop')) net.promotions = net.promotions.map((p) => (p.id === path.split('/')[3] ? { ...p, state: 'stopped', stoppedBy: 'owner' } : p));
        return route.fulfill({ status: 204, headers: CORS });
      }
      return json(route, 404, { error: 'unstubbed' });
    },
  );
  return net;
}
