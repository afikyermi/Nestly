import { Link } from "react-router";
import type { NotificationItem } from "@nestly/shared";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { formatPostTime } from "@/lib/format-post-time";
import { hrefOf, sentenceOf, UNREAD_MARK } from "./notification-texts";

export interface NotificationListProps {
  items: readonly NotificationItem[];
  /** An item was chosen (a plain click): the caller marks it read. The link itself opens the target. */
  onOpen: (item: NotificationItem) => void;
  /** Placement only. */
  className?: string;
}

// The notifications as a list of links (FR-NOTIF-001): who and what, when, unread or read, and the deep link. Display only: marking read
// comes in as onOpen. An unread item has a dot and the word "חדשה" for assistive technology, never colour alone.
export function NotificationList({
  items,
  onOpen,
  className,
}: NotificationListProps) {
  return (
    <ul className={cn("flex flex-col", className)}>
      {items.map((item) => (
        <li key={item.id} className="border-b border-border last:border-b-0">
          <Link
            to={hrefOf(item)}
            onClick={() => onOpen(item)}
            data-notification-type={item.type}
            className={cn(
              "flex min-h-14 items-center gap-3 px-3 py-2 no-underline hover:bg-muted",
              item.isRead ? "text-muted-foreground" : "text-foreground",
            )}
          >
            <Avatar name={item.actorName ?? ""} decorative />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn("text-body", item.isRead ? "" : "font-semibold")}
              >
                {sentenceOf(item)}
              </span>
              <time
                dateTime={item.createdAt}
                className="text-caption text-muted-foreground"
              >
                {formatPostTime(item.createdAt)}
              </time>
            </span>
            {item.isRead ? null : (
              <>
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full bg-primary"
                />
                <span className="sr-only">{UNREAD_MARK}</span>
              </>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
