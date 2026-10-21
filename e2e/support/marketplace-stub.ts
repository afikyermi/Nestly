// Shared by e2e/marketplace.spec.ts (I12: the Marketplace, a listing page, the listing form, "My listings", and the staff's listings and Sponsored
// Products). The stub plays the server: /api/marketplace* and /api/admin/listings*, /api/admin/sponsored* answer the shapes of
// packages/shared/src/validation/marketplace.ts and record what was sent. The auth, /api/me, /api/profile and /api/feed stubs repeat
// professionals-stub.ts; the staff screens add e2e/support/admin-stub.ts first.
import type { Page, Route } from '@playwright/test';
import { CORS, EMAIL, NOW, json, session } from './journeys-stub';

export const MID = (n: number): string => `b1200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ME = 'f0000000-0000-4000-8000-0000000000f1';
export const SELLER = MID(1);
export const STROLLER = MID(10);
export const CRIB = MID(11);
export const MINE = MID(12);
export const SPONSORED = MID(20);
export const CONV = MID(30);

export interface MarketSent {
  method: string;
  path: string;
  body: Record<string, unknown>;
}
export interface MarketNet {
  mineStatus: 'active' | 'sold';
  hidden: boolean;
  sponsoredStatus: 'draft' | 'published' | 'paused' | 'removed';
  sent: MarketSent[];
}

const AT = '2026-06-15T09:00:00.000Z';
const LATER = '2026-08-14T09:00:00.000Z';

export const listingCard = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  category: 'strollers',
  condition: 'like_new',
  price: 450,
  city: 'tel_aviv',
  status: 'active',
  isHidden: false,
  isExpired: false,
  isMine: false,
  sellerName: 'שירה כהן',
  createdAt: AT,
  expiresAt: LATER,
  image: null,
  ...over,
});

const sponsoredItem = (status: string) => ({
  id: SPONSORED,
  sponsorName: 'בייבי סטור',
  title: 'קופון 10% לעגלות',
  description: 'דוגמה: קופון לדוגמה בלבד',
  category: 'strollers',
  linkUrl: 'https://example.com/coupon',
  status,
  publishedAt: status === 'draft' ? null : AT,
  updatedAt: AT,
  image: null,
});

function record(net: MarketNet, route: Route): void {
  const req = route.request();
  const raw: unknown = req.postData() === null ? {} : req.postDataJSON();
  net.sent.push({ method: req.method(), path: new URL(req.url()).pathname, body: typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw)) : {} });
}

/** The signed-in Regular account, its session and its shell's reads. */
async function signedIn(page: Page): Promise<void> {
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
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { fullName: 'נועה לוי', parentGender: 'woman' }),
  );
  await page.route('**/api/feed**', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [], nextCursor: null, configVersion: 1 }),
  );
  await page.route('**/api/account/kind', (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { kind: 'regular' })));
}

/** The Marketplace endpoints. With `account`, the Regular session and shell reads too (the staff specs bring theirs from admin-stub.ts). */
export async function setupMarketplace(page: Page, start: Partial<MarketNet> = {}, account = true): Promise<MarketNet> {
  const net: MarketNet = { mineStatus: 'active', hidden: false, sponsoredStatus: 'draft', sent: [], ...start };
  if (account) await signedIn(page);
  await page.route(
    (url) => url.pathname.startsWith('/api/marketplace') || url.pathname.startsWith('/api/admin/listings') || url.pathname.startsWith('/api/admin/sponsored'),
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      record(net, route);
      const path = new URL(req.url()).pathname;
      const method = req.method();
      const sent = net.sent.at(-1)?.body ?? {};
      if (path === '/api/marketplace') {
        const all = [listingCard(STROLLER, 'עגלת תינוק כחולה'), listingCard(CRIB, 'מיטת תינוק', { category: 'furniture', price: null, city: 'haifa' })];
        const listings = typeof sent.category === 'string' ? all.filter((card) => card.category === sent.category) : all;
        const { id, sponsorName, title, description, category, linkUrl, image } = sponsoredItem('published');
        return json(route, 200, { listings, sponsored: [{ id, sponsorName, title, description, category, linkUrl, image }] });
      }
      if (path === '/api/marketplace/mine') return json(route, 200, { listings: [listingCard(MINE, 'כיסא אוכל', { category: 'feeding', isMine: true, status: net.mineStatus, sellerName: 'נועה לוי' })] });
      if (path === '/api/marketplace/listings' && method === 'POST') return json(route, 201, { id: MINE });
      if (path === `/api/marketplace/listings/${STROLLER}`) {
        return json(route, 200, { ...listingCard(STROLLER, 'עגלת תינוק כחולה'), sellerId: SELLER, images: [], updatedAt: AT, conversationId: null });
      }
      if (path === `/api/marketplace/listings/${MINE}`) {
        return json(route, 200, { ...listingCard(MINE, 'כיסא אוכל', { category: 'feeding', isMine: true, status: net.mineStatus, sellerName: 'נועה לוי' }), sellerId: ME, images: [], updatedAt: AT, conversationId: null });
      }
      if (path === `/api/marketplace/listings/${STROLLER}/contact`) return json(route, 200, { conversationId: CONV });
      if (path === `/api/marketplace/listings/${MINE}/status`) {
        net.mineStatus = sent.status === 'sold' ? 'sold' : 'active';
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (path === '/api/admin/listings/search') {
        return json(route, 200, { listings: [{ ...listingCard(STROLLER, 'עגלת תינוק כחולה', { isHidden: net.hidden }), sellerId: SELLER }] });
      }
      if (path === `/api/admin/listings/${STROLLER}/visibility`) {
        net.hidden = sent.hidden === true;
        return json(route, 200, {});
      }
      if (path === '/api/admin/sponsored' && method === 'GET') return json(route, 200, { items: [] });
      if (path === '/api/admin/sponsored' && method === 'POST') return json(route, 201, sponsoredItem('draft'));
      if (path === `/api/admin/sponsored/${SPONSORED}/status`) {
        net.sponsoredStatus = sent.status === 'published' ? 'published' : sent.status === 'paused' ? 'paused' : 'removed';
        return json(route, 200, sponsoredItem(net.sponsoredStatus));
      }
      return json(route, 404, { error: 'unstubbed' });
    },
  );
  return net;
}
