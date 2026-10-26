// Performance plan י1–י3: what the browser asks for when a page opens and on a screen change, with nothing the user sees changed.
//   י1: the own user id (the feed, its Stories tray) is the access token's `sub`, read locally: no call to Auth.
//   י2: the Chat badge reads the bell's light counters (GET /api/notifications/counts), never GET /api/chat/unread, while the bell has them;
//       on a screen change, one counts request. An account the bell has nothing for (403) keeps the Chat's own badge request.
//   י3: a staff account (the shell's account-kind or staff-access answer says so) sends no notifications request at all.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { SessionAccountContext } from '@/hooks/use-session-account';
import { AccountKindProvider, type AccountKindState } from '@/hooks/use-account-kind';
import { StaffAccessProvider, type StaffAccessState } from '@/hooks/use-staff-access';
import type { SessionAccount } from '@/services/session/session-source';
import { readOwnUserId } from '@/services/session/own-user-id';
import { ChatTopBarButton } from '@/features/chat/ChatTopBarButton';
import { NotificationsProvider, useNotifications } from '@/features/notifications/NotificationsProvider';

const USER = 'a0000000-0000-4000-8000-0000000000a1';
const part = (o: object): string => btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const TOKEN = `${part({ alg: 'ES256', typ: 'JWT' })}.${part({ sub: USER, role: 'authenticated' })}.sig`;

let calls: string[];
let countsStatus: number;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  countsStatus = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      calls.push(path);
      if (path === '/api/notifications/counts')
        return Promise.resolve(countsStatus === 200 ? reply(200, { unreadCount: 0, chatUnread: 4, latestId: null }) : reply(countsStatus, { error: 'forbidden' }));
      if (path === '/api/chat/unread') return Promise.resolve(reply(200, { count: 7 }));
      if (path.startsWith('/api/notifications')) return Promise.resolve(countsStatus === 200 ? reply(200, { items: [], unreadCount: 0, nextCursor: null }) : reply(countsStatus, { error: 'forbidden' }));
      return Promise.resolve(reply(404, { error: 'unstubbed' }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const account: SessionAccount = {
  signInWithPassword: () => Promise.reject(new Error('unused')),
  signInWithGoogle: () => Promise.reject(new Error('unused')),
  discardGoogleStart: () => undefined,
  googleAccount: () => Promise.reject(new Error('unused')),
  recheck: () => Promise.resolve(),
  getAccessToken: () => Promise.resolve(TOKEN),
  clearNotice: () => undefined,
  markRecoveryQuestionsSet: () => undefined,
  endAfterPasswordChange: () => Promise.resolve(),
};

function Probe() {
  const { state } = useNotifications();
  return <p data-testid="bell">{state.kind}</p>;
}
const shell = (children: ReactNode, kind: AccountKindState = 'regular', staff: StaffAccessState = { kind: 'none' }) => (
  <MemoryRouter>
    <SessionAccountContext.Provider value={account}>
      <StaffAccessProvider value={staff}>
        <AccountKindProvider value={kind}>
          <NotificationsProvider>{children}</NotificationsProvider>
        </AccountKindProvider>
      </StaffAccessProvider>
    </SessionAccountContext.Provider>
  </MemoryRouter>
);
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const count = (path: string) => calls.filter((c) => c === path).length;

describe('[י1] the own user id comes from the token', () => {
  it('is the token\'s sub, with no request at all (no Auth /user call)', async () => {
    expect(await readOwnUserId(account)).toBe(USER);
    expect(calls).toEqual([]);
  });
  it('is null without a session or with a token it cannot read', async () => {
    expect(await readOwnUserId(null)).toBeNull();
    expect(await readOwnUserId({ ...account, getAccessToken: () => Promise.resolve(null) })).toBeNull();
    expect(await readOwnUserId({ ...account, getAccessToken: () => Promise.resolve('not-a-token') })).toBeNull();
    expect(await readOwnUserId({ ...account, getAccessToken: () => Promise.reject(new Error('down')) })).toBeNull();
  });
});

describe('[י2] the Chat badge reads the bell\'s counters', () => {
  it('on open and on every screen change: one counts request each, never /api/chat/unread; the badge shows the count', async () => {
    const view = render(shell(<ChatTopBarButton current="/feed" />));
    await settle();
    expect(count('/api/notifications/counts')).toBe(1);
    expect(count('/api/chat/unread')).toBe(0);
    expect(screen.getByTestId('chat-button').textContent).toContain('4');
    view.rerender(shell(<ChatTopBarButton current="/groups" />));
    await settle();
    expect(count('/api/notifications/counts')).toBe(2);
    expect(count('/api/chat/unread')).toBe(0);
    expect(count('/api/notifications')).toBe(1); // the bell's own first load, unchanged
  });

  it('an account the bell has nothing for (403 on the counters) keeps the Chat\'s own badge request', async () => {
    countsStatus = 403;
    render(shell(<ChatTopBarButton current="/feed" />, 'unknown', { kind: 'none' }));
    await settle();
    await settle();
    expect(count('/api/chat/unread')).toBe(1);
    expect(screen.getByTestId('chat-button').textContent).toContain('7');
  });
});

describe('[י3] a staff account sends no notifications request', () => {
  it.each([
    ['the account kind says staff', 'staff' as const, { kind: 'loading' } as const],
    ['the staff access says staff', 'loading' as const, { kind: 'staff', role: 'moderator', permissions: [] } as const],
  ])('%s: nothing is asked, and the bell is unavailable', async (_label, kind, staff) => {
    render(shell(<Probe />, kind, staff));
    await settle();
    expect(calls.filter((c) => c.startsWith('/api/notifications'))).toEqual([]);
    expect(screen.getByTestId('bell').textContent).toBe('unavailable');
  });

  it('waits for either answer: nothing is asked while both are loading, the list once the account is known to be a community one', async () => {
    const view = render(shell(<Probe />, 'loading', { kind: 'loading' }));
    await settle();
    expect(calls).toEqual([]);
    view.rerender(shell(<Probe />, 'regular', { kind: 'loading' }));
    await settle();
    expect(count('/api/notifications')).toBe(1);
  });
});
