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
import type { BellCountsResponse, NotificationItem } from "@nestly/shared";
import { BellPollContext, type BellPoll } from "@/hooks/use-bell-poll";
import { useSessionAccount } from "@/hooks/use-session-account";
import { useTabVisibility } from "@/hooks/use-tab-visibility";
import {
  fetchBellCounts,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/api/notifications";

/** The bell polls while the app is open (the MVP polls; realtime comes later). */
export const POLL_MS = 30_000;
/** After a failed list, the background refresh of the list waits 60 s, then 120 s, 240 s, at most 5 min; the counts keep their 30 s. */
export const LIST_BACKOFF_MS = [60_000, 120_000, 240_000, 300_000] as const;

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
  /**
   * A list is on screen (the open bell, the notifications page): while any is, every poll also fetches the full list, as before the light
   * poll. Returns the call that stops watching.
   */
  watchList: () => () => void;
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

// The poll is light: GET /api/notifications/counts (the unread notifications, the unread Chat, the newest listed notification), and the full
// list is fetched only when the count or the newest notification changed, or while a list is on screen. One place holds the notifications the bell and the page show, so marking read on one updates the other at once. It loads when the
// signed-in app opens, then every POLL_MS while the tab is visible, and at once when the tab is shown again; a failed poll keeps what was
// shown. An Admin or Moderator account (403 forbidden) has no notifications: the state is `unavailable` and polling stops (AC-033).
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const account = useSessionAccount();
  const [state, setState] = useState<NotificationsState>({ kind: "loading" });
  const runs = useRef(0);
  /** The list's own failures in a row, when the background may ask for it again, and whether a list request is still open. */
  const listFailures = useRef(0);
  const nextListAt = useRef(0);
  const listOpen = useRef(false);
  const [poll, setPoll] = useState<BellPoll | null>(null);
  /** What the list last fetched says the server has: the unread count and the newest notification's id. */
  const seen = useRef<{ unread: number; latest: string | null } | null>(null);
  const watchers = useRef(0);
  const stateKind = useRef(state.kind);
  stateKind.current = state.kind;
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
    // the background never stacks a list on an open one, nor asks again before the wait after a failure (a list someone opened does)
    if (poll && (listOpen.current || Date.now() < nextListAt.current)) return;
    const run = (runs.current += 1);
    const accessToken = await token();
    if (accessToken === null) return;
    listOpen.current = true;
    const outcome = await fetchNotifications(accessToken, null, poll).finally(() => {
      listOpen.current = false;
    });
    if (outcome.kind === "list") {
      listFailures.current = 0;
      nextListAt.current = 0;
    } else if (outcome.kind === "failed") {
      const wait = LIST_BACKOFF_MS[Math.min(listFailures.current, LIST_BACKOFF_MS.length - 1)] ?? POLL_MS;
      listFailures.current += 1;
      nextListAt.current = Date.now() + wait;
    }
    if (run !== runs.current) return;
    if (outcome.kind === "forbidden") setState({ kind: "unavailable" });
    else if (outcome.kind === "list") {
      const fresh = outcome.data;
      seen.current = { unread: fresh.unreadCount, latest: fresh.items[0]?.id ?? null };
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

  // One light poll: the counters, then the list only when something it shows may have changed.
  const check = useCallback(async () => {
    const accessToken = await token();
    if (accessToken === null) return;
    const outcome = await fetchBellCounts(accessToken);
    if (outcome.kind === "counts") {
      const counts: BellCountsResponse = outcome.data;
      setPoll((current) => ({ chatUnread: counts.chatUnread, seq: (current?.seq ?? 0) + 1 }));
      const known = seen.current;
      const changed = known === null || known.unread !== counts.unreadCount || known.latest !== counts.latestId;
      if (changed || watchers.current > 0 || stateKind.current !== "ready") await refresh({ poll: true });
    } else if (outcome.kind === "forbidden") setState({ kind: "unavailable" });
    else if (outcome.kind === "unauthenticated" || outcome.kind === "account-unavailable") void account?.recheck();
    else if (stateKind.current !== "ready") await refresh({ poll: true });
  }, [token, account, refresh]);

  useEffect(() => {
    if (stopped) return;
    const visible = () => visibility?.isTabVisible?.() ?? true;
    if (visible()) void refresh();
    const timer = setInterval(() => {
      if (visible()) void check();
    }, POLL_MS);
    const stopListening = visibility?.onTabVisible(() => void check());
    return () => {
      clearInterval(timer);
      stopListening?.();
    };
  }, [refresh, check, stopped, visibility]);

  const markAll = useCallback(async (): Promise<boolean> => {
    const accessToken = await token();
    if (accessToken === null) return false;
    const outcome = await markAllNotificationsRead(accessToken);
    if (outcome.kind !== "done") return false;
    if (seen.current !== null) seen.current = { ...seen.current, unread: 0 };
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
        if (wasUnread && seen.current !== null) seen.current = { ...seen.current, unread: Math.max(0, seen.current.unread - 1) };
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

  const watchList = useCallback(() => {
    watchers.current += 1;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      watchers.current -= 1;
    };
  }, []);

  const value = useMemo(
    () => ({ state, refresh, markAll, markOne, loadMore, watchList }),
    [state, refresh, markAll, markOne, loadMore, watchList],
  );
  return (
    <Context.Provider value={value}>
      <BellPollContext.Provider value={poll}>{children}</BellPollContext.Provider>
    </Context.Provider>
  );
}
