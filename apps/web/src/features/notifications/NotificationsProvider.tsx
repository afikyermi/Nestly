import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NotificationItem } from "@nestly/shared";
import { useSessionAccount } from "@/hooks/use-session-account";
import { useTabVisibility } from "@/hooks/use-tab-visibility";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/api/notifications";

/** The bell polls while the app is open (the MVP polls; realtime comes later). */
export const POLL_MS = 30_000;

export type NotificationsState =
  | { kind: "loading" }
  | {
      kind: "ready";
      items: NotificationItem[];
      unreadCount: number;
      /** The next older page, or null. */
      nextCursor: string | null;
      /** Older pages were loaded on the page: a poll keeps them under the fresh first page. */
      hasOlder: boolean;
    }
  | { kind: "failed" }
  | { kind: "unavailable" }; // the account has no notifications (an Admin or Moderator): the bell is not shown

export interface NotificationsApi {
  state: NotificationsState;
  /** A fresh first page; `poll` for the background refresh only. */
  refresh: (options?: { readonly poll?: boolean }) => Promise<void>;
  /** Mark all as read; false when it failed. */
  markAll: () => Promise<boolean>;
  markOne: (id: string) => Promise<void>;
  /** The next older page; false when it failed. */
  loadMore: () => Promise<boolean>;
}

const Context = createContext<NotificationsApi | null>(null);

export function useNotifications(): NotificationsApi {
  const value = useContext(Context);
  if (value === null)
    throw new Error(
      "useNotifications is used outside a NotificationsProvider.",
    );
  return value;
}

// One place holds the notifications the bell and the page show, so marking read on one updates the other at once. It loads when the
// signed-in app opens, then every POLL_MS while the tab is visible, and at once when the tab is shown again; a failed poll keeps what was
// shown. An Admin or Moderator account (403 forbidden) has no notifications: the state is `unavailable` and polling stops (AC-033).
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const account = useSessionAccount();
  const [state, setState] = useState<NotificationsState>({ kind: "loading" });
  const runs = useRef(0);
  const visibility = useTabVisibility();
  const stopped = state.kind === "unavailable";

  const token = useCallback(
    async (): Promise<string | null> =>
      account === null
        ? null
        : await account.getAccessToken().catch(() => null),
    [account],
  );

  const refresh = useCallback(async ({ poll = false }: { readonly poll?: boolean } = {}) => {
    const run = (runs.current += 1);
    const accessToken = await token();
    if (accessToken === null) return;
    const outcome = await fetchNotifications(accessToken, null, poll);
    if (run !== runs.current) return;
    if (outcome.kind === "forbidden") setState({ kind: "unavailable" });
    else if (outcome.kind === "list") {
      const fresh = outcome.data;
      setState((current) => {
        if (current.kind !== "ready" || !current.hasOlder)
          return { kind: "ready", items: fresh.items, unreadCount: fresh.unreadCount, nextCursor: fresh.nextCursor, hasOlder: false };
        // keep the older pages already shown, under the fresh first page
        const ids = new Set(fresh.items.map((i) => i.id));
        const lastFresh = fresh.items.at(-1)?.createdAt ?? "";
        const older = current.items.filter((i) => !ids.has(i.id) && i.createdAt <= lastFresh);
        return { kind: "ready", items: [...fresh.items, ...older], unreadCount: fresh.unreadCount, nextCursor: current.nextCursor, hasOlder: true };
      });
    }
    else if (
      outcome.kind === "unauthenticated" ||
      outcome.kind === "account-unavailable"
    )
      void account?.recheck();
    else
      setState((current) =>
        current.kind === "ready" ? current : { kind: "failed" },
      );
  }, [token, account]);

  useEffect(() => {
    if (stopped) return;
    const visible = () => visibility?.isTabVisible?.() ?? true;
    if (visible()) void refresh();
    const timer = setInterval(() => {
      if (visible()) void refresh({ poll: true });
    }, POLL_MS);
    const stopListening = visibility?.onTabVisible(() => void refresh({ poll: true }));
    return () => {
      clearInterval(timer);
      stopListening?.();
    };
  }, [refresh, stopped, visibility]);

  const markAll = useCallback(async (): Promise<boolean> => {
    const accessToken = await token();
    if (accessToken === null) return false;
    const outcome = await markAllNotificationsRead(accessToken);
    if (outcome.kind !== "done") return false;
    setState((current) =>
      current.kind === "ready"
        ? {
            ...current,
            items: current.items.map((i) => ({ ...i, isRead: true })),
            unreadCount: 0,
          }
        : current,
    );
    return true;
  }, [token]);

  const markOne = useCallback(
    async (id: string) => {
      const accessToken = await token();
      if (accessToken === null) return;
      const outcome = await markNotificationRead(accessToken, id);
      if (outcome.kind !== "done") return;
      setState((current) => {
        if (current.kind !== "ready") return current;
        const wasUnread = current.items.some((i) => i.id === id && !i.isRead);
        return {
          ...current,
          items: current.items.map((i) =>
            i.id === id ? { ...i, isRead: true } : i,
          ),
          unreadCount: Math.max(0, current.unreadCount - (wasUnread ? 1 : 0)),
        };
      });
    },
    [token],
  );

  const cursor = state.kind === "ready" ? state.nextCursor : null;
  const loadMore = useCallback(async (): Promise<boolean> => {
    if (cursor === null) return true;
    const accessToken = await token();
    if (accessToken === null) return false;
    const outcome = await fetchNotifications(accessToken, cursor);
    if (outcome.kind !== "list") return false;
    setState((current) => {
      if (current.kind !== "ready") return current;
      const ids = new Set(current.items.map((i) => i.id));
      return {
        ...current,
        items: [...current.items, ...outcome.data.items.filter((i) => !ids.has(i.id))],
        nextCursor: outcome.data.nextCursor,
        hasOlder: true,
      };
    });
    return true;
  }, [cursor, token]);

  const value = useMemo(
    () => ({ state, refresh, markAll, markOne, loadMore }),
    [state, refresh, markAll, markOne, loadMore],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
