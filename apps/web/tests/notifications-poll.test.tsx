// FR-NOTIF-001 (AC-040): the bell's poll is light. Every 30 s the app asks GET /api/notifications/counts (the unread notifications, the unread
// Chat and the newest listed notification); the full list is fetched only when the count or the newest notification changed, or while a list is
// on screen (the open bell, the notifications page). Nothing the user sees comes later than with the list poll it replaces.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { useBellPoll } from '@/hooks/use-bell-poll';
import { NotificationsProvider, POLL_MS, useNotifications } from '@/features/notifications/NotificationsProvider';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'a0000000-0000-4000-8000-000000000002';

const item = (id: string, isRead = false) => ({
  id, type: 'post_comment', actor: 'named', actorName: 'דנה לוי', targetKind: 'post', targetId: A, createdAt: '2026-10-20T09:00:00.000Z', isRead,
});

let counts: { unreadCount: number; chatUnread: number; latestId: string | null };
let items: ReturnType<typeof item>[];
let calls: string[];
let countsStatus: number;

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers();
  counts = { unreadCount: 1, chatUnread: 2, latestId: A };
  items = [item(A)];
  calls = [];
  countsStatus = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      calls.push(path);
      if (path === '/api/notifications/counts') return Promise.resolve(countsStatus === 200 ? reply(200, counts) : reply(countsStatus, { error: 'forbidden' }));
      return Promise.resolve(reply(200, { items, unreadCount: items.filter((i) => !i.isRead).length, nextCursor: null }));
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const account: SessionAccount = {
  signInWithPassword: () => Promise.reject(new Error('unused')),
  signInWithGoogle: () => Promise.reject(new Error('unused')),
  discardGoogleStart: () => undefined,
  googleAccount: () => Promise.resolve(null),
  recheck: () => Promise.resolve(),
  getAccessToken: () => Promise.resolve('token'),
  clearNotice: () => undefined,
  markRecoveryQuestionsSet: () => undefined,
  endAfterPasswordChange: () => Promise.resolve(),
};

function Probe() {
  const { state, watchList } = useNotifications();
  const poll = useBellPoll();
  return (
    <div>
      <p data-testid="unread">{state.kind === 'ready' ? state.unreadCount : state.kind}</p>
      <p data-testid="chat">{poll === null ? 'none' : poll.chatUnread}</p>
      <button onClick={() => void watchList()}>watch</button>
    </div>
  );
}
const wrap = (children: ReactNode) => (
  <SessionAccountContext.Provider value={account}>
    <NotificationsProvider>{children}</NotificationsProvider>
  </SessionAccountContext.Provider>
);
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
const listCalls = () => calls.filter((c) => c.startsWith('/api/notifications') && !c.endsWith('/counts')).length;
const countCalls = () => calls.filter((c) => c.endsWith('/counts')).length;

describe('[AC-040] the light bell poll', () => {
  it('asks only for the counters while nothing changed: one request, the list not fetched again', async () => {
    render(wrap(<Probe />));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(listCalls()).toBe(1); // the first load
    await tick();
    await tick();
    expect(countCalls()).toBe(2);
    expect(listCalls()).toBe(1);
    expect(screen.getByTestId('chat').textContent).toBe('2'); // the Chat count still arrives every poll
  });

  it('fetches the list when the unread count changes, and when only the newest notification changed', async () => {
    render(wrap(<Probe />));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    items = [item(B), item(A)];
    counts = { ...counts, unreadCount: 2, latestId: B };
    await tick();
    expect(listCalls()).toBe(2);
    expect(screen.getByTestId('unread').textContent).toBe('2');
    // one read elsewhere and one new arrival: the same count, a different newest one
    const C = 'a0000000-0000-4000-8000-000000000003';
    items = [item(C), item(B, true), item(A)];
    counts = { ...counts, latestId: C };
    await tick();
    expect(listCalls()).toBe(3);
    await tick();
    expect(listCalls()).toBe(3);
  });

  it('keeps fetching the list on every poll while a list is on screen', async () => {
    render(wrap(<Probe />));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => screen.getByText('watch').click());
    await tick();
    await tick();
    expect(listCalls()).toBe(3);
  });

  it('stops polling for an account that has no notifications (403 forbidden)', async () => {
    countsStatus = 403;
    render(wrap(<Probe />));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await tick();
    expect(screen.getByTestId('unread').textContent).toBe('unavailable');
    await tick();
    expect(countCalls()).toBe(1);
  });
});
