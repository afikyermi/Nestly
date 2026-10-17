import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { FriendEntry, FriendLists, FriendRequestEntry } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ACCEPT_LABEL,
  CANCEL_REQUEST_LABEL,
  DECLINE_LABEL,
  DIALOG_CANCEL_LABEL,
  friendName,
  FRIENDS_EMPTY_TEXT,
  FRIENDS_TITLE,
  INCOMING_EMPTY_TEXT,
  INCOMING_TITLE,
  LOAD_FAILED_TEXT,
  REMOVE_DESCRIPTION,
  REMOVE_LABEL,
  removeTitle,
  requestFromName,
  requestToName,
  RETRY_LABEL,
  SENT_EMPTY_TEXT,
  SENT_TITLE,
  LOADING_TEXT,
} from './friends-texts';

/** The action in flight: one at a time (c14). Removal is in flight inside its dialog (`confirm.saving`). */
export interface FriendsBusy {
  action: 'accept' | 'decline' | 'cancel';
  userId: string;
}

/** The removal dialog: the Friend it names, and whether the DELETE is in flight or has failed. */
export interface RemoveConfirm {
  userId: string;
  fullName: string;
  saving: boolean;
  failure: string | null;
}

/** What the page shows. The container (FriendsScreen) owns the flow; this draws one state. */
export type FriendsView =
  | { kind: 'loading' }
  | { kind: 'load-failed'; message: string }
  | {
      kind: 'loaded';
      lists: FriendLists;
      busy: FriendsBusy | null;
      /** The last action's failure, or the "no longer available" notice (c14). Kept with the entry in its list. */
      failure: string | null;
      /** The text of the polite status region: what just happened. Empty: nothing. */
      status: string;
      confirm: RemoveConfirm | null;
    };

/** Where focus goes after a change, once per `tick`: a list's heading (the entry that held it is gone) or the message. */
export interface FriendsFocus {
  target: 'incoming' | 'sent' | 'friends' | 'message';
  tick: number;
}

export interface FriendsContentProps {
  view: FriendsView;
  focus?: FriendsFocus;
  onRetry?: () => void;
  onAccept?: (userId: string) => void;
  onDecline?: (userId: string) => void;
  onCancelRequest?: (userId: string) => void;
  /** Opens the removal dialog for the Friend; nothing is sent yet. */
  onRemove?: (userId: string) => void;
  onConfirmRemove?: () => void;
  onCancelRemove?: () => void;
}

interface RowProps {
  entry: FriendEntry | FriendRequestEntry;
  children: ReactNode;
}

// One person: the avatar (decorative, the name is beside it), the name (its own direction, so a Latin name does not reorder the
// row), and the actions. Every action's accessible name holds the visible label and the person's name (S3).
function PersonRow({ entry, children }: RowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Avatar name={entry.fullName} decorative />
      <span className="min-w-0 flex-1 break-words text-body text-card-foreground">
        <bdi dir="auto">{entry.fullName}</bdi>
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </li>
  );
}

interface ListSectionProps {
  id: string;
  title: string;
  emptyText: string;
  focusKey: 'incoming' | 'sent' | 'friends';
  count: number;
  children: ReactNode;
}

function ListSection({ id, title, emptyText, focusKey, count, children }: ListSectionProps) {
  return (
    <section aria-labelledby={id} data-testid={`friends-${focusKey}`}>
      <h2 id={id} tabIndex={-1} data-friends-focus={focusKey} className="text-h3">
        {title}
      </h2>
      <div className="mt-3 rounded-lg bg-card p-4 shadow-card md:p-5">
        {count === 0 ? (
          <p className="text-body text-muted-foreground">{emptyText}</p>
        ) : (
          <ul aria-labelledby={id} className="flex flex-col gap-4">
            {children}
          </ul>
        )}
      </div>
    </section>
  );
}

// The Friends page's body (PG-036, FR-REL-001; F2.4b): the requests the person received (accept, decline), the requests they sent
// (cancel) and their Friends (remove, after a confirmation naming the Friend), each list with its own empty text. Display only:
// the actions come in as props. While loading, no list is drawn (c14).
export function FriendsContent(props: FriendsContentProps) {
  const { view, focus, onRetry, onAccept, onDecline, onCancelRequest, onRemove, onConfirmRemove, onCancelRemove } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const incomingId = useId();
  const sentId = useId();
  const friendsId = useId();
  // The focus tick when the removal dialog opened: if focus was moved since, the entry that opened it is gone (c15).
  const latestTick = useRef(0);
  const openedAtTick = useRef(0);
  latestTick.current = focus?.tick ?? 0;
  const confirming = view.kind === 'loaded' && view.confirm !== null;

  useEffect(() => {
    if (confirming) openedAtTick.current = latestTick.current;
  }, [confirming]);

  useEffect(() => {
    if (focus === undefined || focus.tick === 0) return;
    const root = rootRef.current;
    if (root === null) return;
    const selector = focus.target === 'message' ? '[data-friends-message]' : `[data-friends-focus="${focus.target}"]`;
    root.querySelector<HTMLElement>(selector)?.focus();
  }, [focus]);

  const loaded = view.kind === 'loaded' ? view : null;
  const status = view.kind === 'loading' ? LOADING_TEXT : loaded !== null ? loaded.status : '';
  const busy = loaded?.busy ?? null;
  const locked = busy !== null || loaded?.confirm?.saving === true;
  const lockedProp = locked ? ({ 'aria-disabled': true } as const) : {};
  const pending = (action: FriendsBusy['action'], userId: string): boolean => busy?.action === action && busy.userId === userId;

  return (
    <div ref={rootRef}>
      {/* One polite region for the page, present from the first render so its changes are announced. Never drawn. */}
      <p role="status" data-testid="friends-status" className="sr-only">
        {status}
      </p>
      {view.kind === 'loading' ? (
        <div data-testid="friends-loading" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
          <Skeleton className="w-3/4" />
        </div>
      ) : null}
      {view.kind === 'load-failed' ? (
        <div data-testid="friends-load-failed" className="flex flex-col items-start gap-4">
          <div data-friends-message tabIndex={-1} className="w-full">
            <InlineAlert>{view.message}</InlineAlert>
          </div>
          {/* The text of the load failure only: a stopped account has nothing to retry (ERR-037). */}
          {view.message === LOAD_FAILED_TEXT ? (
            <Button variant="soft" onClick={onRetry}>
              {RETRY_LABEL}
            </Button>
          ) : null}
        </div>
      ) : null}
      {loaded !== null ? (
        <div data-testid="friends-lists" className="flex flex-col gap-8">
          {loaded.failure !== null ? (
            <div data-friends-message tabIndex={-1}>
              <InlineAlert>{loaded.failure}</InlineAlert>
            </div>
          ) : null}
          <ListSection id={incomingId} title={INCOMING_TITLE} emptyText={INCOMING_EMPTY_TEXT} focusKey="incoming" count={loaded.lists.incoming.length}>
            {loaded.lists.incoming.map((entry) => (
              <PersonRow key={entry.userId} entry={entry}>
                <Button
                  variant="soft"
                  pending={pending('accept', entry.userId)}
                  {...lockedProp}
                  onClick={() => onAccept?.(entry.userId)}
                >
                  {ACCEPT_LABEL}
                  <span className="sr-only"> {requestFromName(entry.fullName)}</span>
                </Button>
                <Button
                  variant="text"
                  pending={pending('decline', entry.userId)}
                  {...lockedProp}
                  onClick={() => onDecline?.(entry.userId)}
                >
                  {DECLINE_LABEL}
                  <span className="sr-only"> {requestFromName(entry.fullName)}</span>
                </Button>
              </PersonRow>
            ))}
          </ListSection>
          <ListSection id={sentId} title={SENT_TITLE} emptyText={SENT_EMPTY_TEXT} focusKey="sent" count={loaded.lists.sent.length}>
            {loaded.lists.sent.map((entry) => (
              <PersonRow key={entry.userId} entry={entry}>
                <Button
                  variant="text"
                  pending={pending('cancel', entry.userId)}
                  {...lockedProp}
                  onClick={() => onCancelRequest?.(entry.userId)}
                >
                  {CANCEL_REQUEST_LABEL}
                  <span className="sr-only"> {requestToName(entry.fullName)}</span>
                </Button>
              </PersonRow>
            ))}
          </ListSection>
          <ListSection id={friendsId} title={FRIENDS_TITLE} emptyText={FRIENDS_EMPTY_TEXT} focusKey="friends" count={loaded.lists.friends.length}>
            {loaded.lists.friends.map((entry) => (
              <PersonRow key={entry.userId} entry={entry}>
                <Button variant="text" {...lockedProp} onClick={() => onRemove?.(entry.userId)}>
                  {REMOVE_LABEL}
                  <span className="sr-only"> {friendName(entry.fullName)}</span>
                </Button>
              </PersonRow>
            ))}
          </ListSection>
          {loaded.confirm !== null ? (
            <ConfirmDialog
              open
              title={removeTitle(loaded.confirm.fullName)}
              description={REMOVE_DESCRIPTION}
              confirmLabel={REMOVE_LABEL}
              cancelLabel={DIALOG_CANCEL_LABEL}
              pending={loaded.confirm.saving}
              failure={loaded.confirm.failure}
              onConfirm={() => onConfirmRemove?.()}
              onCancel={() => onCancelRemove?.()}
              finalFocus={() =>
                latestTick.current > openedAtTick.current
                  ? (rootRef.current?.querySelector<HTMLElement>('[data-friends-focus="friends"]') ?? null)
                  : null
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
