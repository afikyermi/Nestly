import { useState } from "react";
import { Link } from "react-router";
import { PATHS } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { BellIcon, SettingsIcon } from "@/components/ui/icons";
import { settingsSectionHash } from "@/lib/settings-sections";
import { NotificationList } from "./NotificationList";
import { useNotifications } from "./NotificationsProvider";
import {
  BELL_LABEL,
  EMPTY_TEXT,
  LOAD_FAILED_TEXT,
  MARK_ALL_LABEL,
  MARK_FAILED_TEXT,
  RETRY_LABEL,
  SETTINGS_LABEL,
  unreadBellLabel,
  VIEW_ALL_LABEL,
} from "./notification-texts";

const DROPDOWN_ITEMS = 6;

// The bell of the top bar (FR-NOTIF-001, AC-040): a badge with the unread count, and a dropdown of the latest notifications with
// "סימון הכול כנקרא", "כל ההתראות" and a settings icon. Opening a notification marks it read and follows its link; the target checks the
// permission again. The count is announced as part of the button's name.
export function NotificationBell() {
  const { state, refresh, markAll, markOne } = useNotifications();
  const [open, setOpen] = useState(false);
  const [markFailed, setMarkFailed] = useState(false);
  const unread = state.kind === "ready" ? state.unreadCount : 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
      label={BELL_LABEL}
      className="w-80 sm:w-96"
      trigger={
        <button
          type="button"
          aria-label={unreadBellLabel(unread)}
          data-notification-bell=""
          className="relative inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
        >
          <BellIcon />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              data-unread-count=""
              className="absolute end-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-caption font-semibold text-primary-foreground"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
        <Button
          variant="text"
          onClick={() => {
            setMarkFailed(false);
            void markAll().then((ok) => setMarkFailed(!ok));
          }}
        >
          {MARK_ALL_LABEL}
        </Button>
        <Link
          to={`${PATHS.settings}${settingsSectionHash("notifications")}`}
          aria-label={SETTINGS_LABEL}
          onClick={() => setOpen(false)}
          className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted"
        >
          <SettingsIcon />
        </Link>
      </div>
      {markFailed ? (
        <p role="alert" className="px-3 py-2 text-small text-destructive">
          {MARK_FAILED_TEXT}
        </p>
      ) : null}
      {state.kind === "ready" && state.items.length > 0 ? (
        <NotificationList
          items={state.items.slice(0, DROPDOWN_ITEMS)}
          onOpen={(item) => {
            setOpen(false);
            if (!item.isRead) void markOne(item.id);
          }}
        />
      ) : state.kind === "failed" ? (
        <div className="px-3 py-4">
          <p className="text-body">{LOAD_FAILED_TEXT}</p>
          <Button variant="text" onClick={() => void refresh()}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : (
        <p className="px-3 py-4 text-body text-muted-foreground">
          {state.kind === "loading" ? "" : EMPTY_TEXT}
        </p>
      )}
      <div className="border-t border-border px-3 py-1">
        <Link
          to={PATHS.notifications}
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4"
        >
          {VIEW_ALL_LABEL}
        </Link>
      </div>
    </Popover>
  );
}
