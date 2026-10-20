import type { BlockedAccount } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BLOCKED_EMPTY_TEXT,
  BLOCKED_HEADING,
  BLOCKED_LIST_LABEL,
  BLOCKED_LOADING_TEXT,
  NO_NAME_TEXT,
  ofName,
  UNBLOCK_LABEL,
} from '@/lib/block-texts';
import { RETRY_LABEL } from '@/lib/friend-texts';

/** What the section shows. The container (BlockedUsersSection) owns the flow; this draws one state. */
export type BlockedUsersView =
  | { kind: 'loading' }
  | { kind: 'load-failed'; message: string }
  | {
      kind: 'list';
      blocked: BlockedAccount[];
      /** The account whose unblock is in flight, or null. One at a time. */
      busy: string | null;
      /** The last unblock's failure, or null. */
      failure: string | null;
      /** The polite status line: what just happened. */
      status: string;
    };

export interface BlockedUsersContentProps {
  view: BlockedUsersView;
  onRetry?: () => void;
  onUnblock?: (userId: string) => void;
}

// The blocked list in Settings (FR-REL-002): the accounts the signed-in person blocked, each with "ביטול החסימה". Display only. Under the
// Privacy & Security section's heading, so its own heading is an h3.
export function BlockedUsersContent({ view, onRetry, onUnblock }: BlockedUsersContentProps) {
  const status = view.kind === 'loading' ? BLOCKED_LOADING_TEXT : view.kind === 'list' ? view.status : '';
  return (
    <section aria-labelledby="blocked-users-title" className="flex flex-col gap-3">
      <h3 id="blocked-users-title" className="text-label">
        {BLOCKED_HEADING}
      </h3>
      <p role="status" className="sr-only">
        {status}
      </p>
      {view.kind === 'loading' ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
        </div>
      ) : null}
      {view.kind === 'load-failed' ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert>{view.message}</InlineAlert>
          <Button variant="soft" onClick={onRetry}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : null}
      {view.kind === 'list' ? (
        <>
          {view.failure !== null ? <InlineAlert>{view.failure}</InlineAlert> : null}
          {view.blocked.length === 0 ? (
            <p className="text-small text-muted-foreground">{BLOCKED_EMPTY_TEXT}</p>
          ) : (
            <ul aria-label={BLOCKED_LIST_LABEL} className="flex flex-col gap-2">
              {view.blocked.map((account) => {
                const name = account.fullName ?? NO_NAME_TEXT;
                return (
                  <li key={account.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <bdi dir="auto" className="min-w-0 wrap-anywhere">
                      {name}
                    </bdi>
                    <Button
                      variant="soft"
                      pending={view.busy === account.userId}
                      {...(view.busy !== null ? { 'aria-disabled': true } : {})}
                      onClick={() => onUnblock?.(account.userId)}
                    >
                      {UNBLOCK_LABEL}
                      <span className="sr-only"> {ofName(name)}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
