import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NotificationItem } from '@nestly/shared';
import { useSessionAccount } from '@/hooks/use-session-account';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/api/notifications';

/** The bell polls while the app is open (the MVP polls; realtime comes later). */
export const POLL_MS = 30_000;

export type NotificationsState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: NotificationItem[]; unreadCount: number }
  | { kind: 'failed' }
  | { kind: 'unavailable' }; // the account has no notifications (an Admin or Moderator): the bell is not shown

export interface NotificationsApi {
  state: NotificationsState;
  refresh: () => Promise<void>;
  /** Mark all as read; false when it failed. */
  markAll: () => Promise<boolean>;
  markOne: (id: string) => Promise<void>;
}

const Context = createContext<NotificationsApi | null>(null);

export function useNotifications(): NotificationsApi {
  const value = useContext(Context);
  if (value === null) throw new Error('useNotifications is used outside a NotificationsProvider.');
  return value;
}

// One place holds the notifications the bell and the page show, so marking read on one updates the other at once. It loads when the
// signed-in app opens, then every POLL_MS; a failed poll keeps what was shown.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const account = useSessionAccount();
  const [state, setState] = useState<NotificationsState>({ kind: 'loading' });
  const runs = useRef(0);

  const token = useCallback(async (): Promise<string | null> => (account === null ? null : await account.getAccessToken().catch(() => null)), [account]);

  const refresh = useCallback(async () => {
    const run = (runs.current += 1);
    const accessToken = await token();
    if (accessToken === null) return;
    const outcome = await fetchNotifications(accessToken);
    if (run !== runs.current) return;
    if (outcome.kind === 'list') setState({ kind: 'ready', items: outcome.data.items, unreadCount: outcome.data.unreadCount });
    else if (outcome.kind === 'unauthenticated' || outcome.kind === 'account-unavailable') void account?.recheck();
    else setState((current) => (current.kind === 'ready' ? current : { kind: 'failed' }));
  }, [token, account]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const markAll = useCallback(async (): Promise<boolean> => {
    const accessToken = await token();
    if (accessToken === null) return false;
    const outcome = await markAllNotificationsRead(accessToken);
    if (outcome.kind !== 'done') return false;
    setState((current) => (current.kind === 'ready' ? { kind: 'ready', items: current.items.map((i) => ({ ...i, isRead: true })), unreadCount: 0 } : current));
    return true;
  }, [token]);

  const markOne = useCallback(
    async (id: string) => {
      const accessToken = await token();
      if (accessToken === null) return;
      const outcome = await markNotificationRead(accessToken, id);
      if (outcome.kind !== 'done') return;
      setState((current) => {
        if (current.kind !== 'ready') return current;
        const wasUnread = current.items.some((i) => i.id === id && !i.isRead);
        return {
          kind: 'ready',
          items: current.items.map((i) => (i.id === id ? { ...i, isRead: true } : i)),
          unreadCount: Math.max(0, current.unreadCount - (wasUnread ? 1 : 0)),
        };
      });
    },
    [token],
  );

  const value = useMemo(() => ({ state, refresh, markAll, markOne }), [state, refresh, markAll, markOne]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
