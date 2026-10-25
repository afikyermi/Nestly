import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NotificationList } from "./NotificationList";
import { useNotifications } from "./NotificationsProvider";
import {
  EMPTY_TEXT,
  LOAD_FAILED_TEXT,
  LOAD_MORE_FAILED_TEXT,
  LOAD_MORE_LABEL,
  MARK_ALL_LABEL,
  MARK_FAILED_TEXT,
  RETRY_LABEL,
} from "./notification-texts";

// The notifications page (FR-NOTIF-001, AC-040): the latest notifications with their unread state and deep link, and "סימון הכול כנקרא".
// The data is the provider's, the same the bell shows; marking read here updates the bell at once.
export function NotificationsScreen() {
  const { state, refresh, markAll, markOne, loadMore, watchList } = useNotifications();
  // the page shows the list: it follows every poll, as it always did
  useEffect(() => watchList(), [watchList]);
  const [markFailed, setMarkFailed] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  // OP-059: opening the page asks for a fresh list (a Friend's child's birthday is delivered then). Not when the app itself opened
  // on this page: the provider's first load is that request.
  const openedReady = useRef(state.kind === "ready");
  useEffect(() => {
    if (openedReady.current) void refresh();
  }, [refresh]);

  if (state.kind === "loading")
    return <p role="status" className="text-muted-foreground" />;
  if (state.kind !== "ready") {
    return (
      <div>
        <p role="alert">{LOAD_FAILED_TEXT}</p>
        <Button variant="text" onClick={() => void refresh()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="soft"
          onClick={() => {
            setMarkFailed(false);
            void markAll().then((ok) => setMarkFailed(!ok));
          }}
        >
          {MARK_ALL_LABEL}
        </Button>
      </div>
      {markFailed ? (
        <p role="alert" className="mt-2 text-small text-destructive">
          {MARK_FAILED_TEXT}
        </p>
      ) : null}
      {state.items.length === 0 ? (
        <p className="mt-4 text-body text-muted-foreground">{EMPTY_TEXT}</p>
      ) : (
        <NotificationList
          className="mt-3 rounded-md bg-card shadow-card"
          items={state.items}
          onOpen={(item) => {
            if (!item.isRead) void markOne(item.id);
          }}
        />
      )}
      {state.nextCursor !== null ? (
        <div className="mt-3">
          <Button
            variant="soft"
            onClick={() => {
              setMoreFailed(false);
              void loadMore().then((ok) => setMoreFailed(!ok));
            }}
          >
            {LOAD_MORE_LABEL}
          </Button>
          {moreFailed ? (
            <p role="alert" className="mt-2 text-small text-destructive">
              {LOAD_MORE_FAILED_TEXT}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
