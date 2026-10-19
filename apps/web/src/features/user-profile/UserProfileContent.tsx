import { useEffect, useRef } from 'react';
import { formatChildAge, type ProfileView, type RelationshipState } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ReportSheet, type ReportSheetProps } from '@/components/domain/report-sheet';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { documentTitle } from '@/lib/document-title';
import { DIALOG_CANCEL_LABEL, RATE_LIMITED_TEXT, REMOVE_DESCRIPTION, REMOVE_LABEL, removeTitle, RETRY_LABEL } from '@/lib/friend-texts';
import { GENDER_LABELS } from '@/lib/profile-fields';
import { REPORT_PROFILE_LABEL } from '@/lib/report-texts';
import { PersonLists } from './PersonLists';
import {
  ACCEPT_LABEL,
  CANCEL_LABEL,
  CHILD_AGES_LABEL,
  CHILDREN_COUNT_LABEL,
  DECLINE_LABEL,
  EMPTY_JOURNEY_TEXT,
  friendName,
  GENDER_LABEL,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  PREGNANCY_LABEL,
  PREGNANT_TEXT,
  REMOVE_FRIEND_LABEL,
  requestFromName,
  SEND_LABEL,
  TITLE,
  toName,
  UNAVAILABLE_TEXT,
} from './user-profile-texts';

/** The action in flight: one at a time (c28). Removal is in flight inside its dialog (`confirm.saving`). */
export type ProfileBusy = 'send' | 'accept' | 'decline' | 'cancel';

/** The removal dialog (F2.4b's): whether the DELETE is in flight or has failed. */
export interface ProfileRemoveConfirm {
  saving: boolean;
  failure: string | null;
}

/** What the screen shows. The container (UserProfileScreen) owns the flow; this draws one state. */
export type UserProfileView =
  | { kind: 'loading' }
  | { kind: 'unavailable' } // 404: one text for every reason (c29)
  | { kind: 'rate-limited' } // 429: ERR-032's general message, no profile (c29)
  | { kind: 'load-failed'; message: string }
  | {
      kind: 'loaded';
      profile: ProfileView;
      busy: ProfileBusy | null;
      /** The last action's failure, or the "no longer available" notice (c28). */
      failure: string | null;
      /** The text of the polite status region: what just happened. Empty: nothing. */
      status: string;
      confirm: ProfileRemoveConfirm | null;
    };

/** Where focus goes after a change, once per `tick`: the relationship action (the pressed button was replaced) or the message. */
export interface UserProfileFocus {
  target: 'action' | 'message';
  tick: number;
}

export interface UserProfileContentProps {
  view: UserProfileView;
  focus?: UserProfileFocus;
  onRetry?: () => void;
  onSend?: () => void;
  onCancelRequest?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  /** Opens the removal dialog; nothing is sent yet. */
  onRemove?: () => void;
  onConfirmRemove?: () => void;
  onCancelRemove?: () => void;
  /** Opens the report window (F3.7 c9); the button shows on a loaded profile only. */
  onReport?: () => void;
  /** The report window (F3.7 c10), open while set; it closes onto the report button. */
  report?: Omit<ReportSheetProps, 'finalFocus'> | null;
}

const FOCUS_ACTION = '[data-profile-action] button, [data-profile-action] a';
const REPORT_BUTTON = '[data-profile-report]';

// The Journey Summary (§1.4, FR-PRIV-001): the count, the ages when returned, "בהריון", or the sentence; exactly what the API returned.
function Summary({ profile }: { profile: ProfileView }) {
  const ages = profile.childAges !== null && profile.childAges.length > 0 ? profile.childAges.map((age) => formatChildAge(age.years, age.months)) : null;
  const items: { key: string; label: string; value: string }[] = [
    ...(profile.gender !== null ? [{ key: 'gender', label: GENDER_LABEL, value: GENDER_LABELS[profile.gender] }] : []),
    ...(profile.childrenCount > 0 ? [{ key: 'count', label: CHILDREN_COUNT_LABEL, value: String(profile.childrenCount) }] : []),
    ...(ages !== null ? [{ key: 'ages', label: CHILD_AGES_LABEL, value: ages.join(', ') }] : []),
    ...(profile.isPregnant ? [{ key: 'pregnancy', label: PREGNANCY_LABEL, value: PREGNANT_TEXT }] : []),
  ];
  if (items.length === 0 && !profile.showsEmptyJourneySentence) return null;
  return (
    <div data-testid="user-profile-summary" className="flex flex-col gap-3 rounded-lg bg-card p-4 text-body text-card-foreground shadow-card wrap-anywhere md:p-5">
      {items.length > 0 ? (
        <dl className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.key} data-testid={`user-profile-${item.key}`}>
              <dt className="inline font-semibold">{item.label}:</dt> <dd className="inline">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {profile.showsEmptyJourneySentence ? <p data-testid="user-profile-empty-journey">{EMPTY_JOURNEY_TEXT}</p> : null}
    </div>
  );
}

interface ActionsProps {
  name: string;
  relationship: RelationshipState;
  busy: ProfileBusy | null;
  locked: boolean;
  props: UserProfileContentProps;
}

// The actions of the relationship state (c28): one place, one state at a time. A Professional viewer has no state and no action.
function Actions({ name, relationship, busy, locked, props }: ActionsProps) {
  const lockedProp = locked ? ({ 'aria-disabled': true } as const) : {};
  return (
    <div data-profile-action className="flex flex-wrap items-center gap-2">
      {relationship === 'none' ? (
        <Button pending={busy === 'send'} {...lockedProp} onClick={props.onSend}>
          {SEND_LABEL}
          <span className="sr-only"> {toName(name)}</span>
        </Button>
      ) : null}
      {relationship === 'sent' ? (
        <Button variant="soft" pending={busy === 'cancel'} {...lockedProp} onClick={props.onCancelRequest}>
          {CANCEL_LABEL}
          <span className="sr-only"> {toName(name)}</span>
        </Button>
      ) : null}
      {relationship === 'received' ? (
        <>
          <Button variant="soft" pending={busy === 'accept'} {...lockedProp} onClick={props.onAccept}>
            {ACCEPT_LABEL}
            <span className="sr-only"> {requestFromName(name)}</span>
          </Button>
          <Button variant="text" pending={busy === 'decline'} {...lockedProp} onClick={props.onDecline}>
            {DECLINE_LABEL}
            <span className="sr-only"> {requestFromName(name)}</span>
          </Button>
        </>
      ) : null}
      {relationship === 'friends' ? (
        <Button variant="text" {...lockedProp} onClick={props.onRemove}>
          {REMOVE_FRIEND_LABEL}
          <span className="sr-only"> {friendName(name)}</span>
        </Button>
      ) : null}
    </div>
  );
}

// Another person's profile (§1.4 Basic Public Profile, FR-PRIV-001, FR-REL-001; F2.4c2) inside the shell's `main`: the name, the
// Journey Summary as returned, the person's Friends and the Friends in common, and the actions of the relationship. Display only: the
// actions come in as props. While loading, no profile is drawn (c29). F3.7: a quiet "דיווח על הפרופיל" and its window. The document title is generic: no name outlives the screen.
export function UserProfileContent(props: UserProfileContentProps) {
  const { view, focus, onRetry, onConfirmRemove, onCancelRemove, onReport, report = null } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focus === undefined || focus.tick === 0) return;
    const root = rootRef.current;
    if (root === null) return;
    const target = focus.target === 'message' ? '[data-profile-message]' : FOCUS_ACTION;
    (root.querySelector<HTMLElement>(target) ?? root.querySelector<HTMLElement>('h1'))?.focus();
  }, [focus]);

  const loaded = view.kind === 'loaded' ? view : null;
  const status = view.kind === 'loading' ? LOADING_TEXT : loaded !== null ? loaded.status : '';
  const locked = loaded !== null && (loaded.busy !== null || loaded.confirm?.saving === true);
  const heading = loaded !== null ? loaded.profile.fullName : view.kind === 'unavailable' ? UNAVAILABLE_TEXT : TITLE;

  return (
    <div ref={rootRef} className="flex min-w-0 max-w-md flex-col gap-6">
      <title>{documentTitle(view.kind === 'unavailable' ? UNAVAILABLE_TEXT : TITLE)}</title>
      <div className="flex items-center gap-3">
        {loaded !== null ? <Avatar name={loaded.profile.fullName} decorative /> : null}
        <h1 tabIndex={-1} className="min-w-0 wrap-anywhere text-h2">
          <bdi dir="auto">{heading}</bdi>
        </h1>
      </div>
      {/* One polite region for the screen, present from the first render so its changes are announced. Never drawn. */}
      <p role="status" data-testid="user-profile-status" className="sr-only">
        {status}
      </p>
      {view.kind === 'loading' ? (
        <div data-testid="user-profile-loading" className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-card md:p-5">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
          <Skeleton className="w-3/4" />
        </div>
      ) : null}
      {view.kind === 'rate-limited' ? (
        <div data-testid="user-profile-rate-limited" data-profile-message tabIndex={-1}>
          <InlineAlert>{RATE_LIMITED_TEXT}</InlineAlert>
        </div>
      ) : null}
      {view.kind === 'load-failed' ? (
        <div data-testid="user-profile-load-failed" className="flex flex-col items-start gap-4">
          <div data-profile-message tabIndex={-1} className="w-full">
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
        <>
          {loaded.failure !== null ? (
            <div data-profile-message tabIndex={-1}>
              <InlineAlert>{loaded.failure}</InlineAlert>
            </div>
          ) : null}
          {loaded.profile.relationship !== null ? (
            <Actions name={loaded.profile.fullName} relationship={loaded.profile.relationship} busy={loaded.busy} locked={locked} props={props} />
          ) : null}
          {/* F3.7 c9: quiet, below the relationship actions; named "דיווח על הפרופיל של <name>" (screen.md). The own profile never comes here. */}
          <div>
            <Button variant="text" data-profile-report onClick={onReport}>
              {REPORT_PROFILE_LABEL}
              <span className="sr-only"> {friendName(loaded.profile.fullName)}</span>
            </Button>
          </div>
          <Summary profile={loaded.profile} />
          <PersonLists name={loaded.profile.fullName} friends={loaded.profile.friends} mutualFriends={loaded.profile.mutualFriends} />
          {loaded.confirm !== null ? (
            <ConfirmDialog
              open
              title={removeTitle(loaded.profile.fullName)}
              description={REMOVE_DESCRIPTION}
              confirmLabel={REMOVE_LABEL}
              cancelLabel={DIALOG_CANCEL_LABEL}
              pending={loaded.confirm.saving}
              failure={loaded.confirm.failure}
              onConfirm={() => onConfirmRemove?.()}
              onCancel={() => onCancelRemove?.()}
              finalFocus={() => rootRef.current?.querySelector<HTMLElement>(FOCUS_ACTION) ?? null}
            />
          ) : null}
          {report !== null ? <ReportSheet {...report} finalFocus={() => rootRef.current?.querySelector<HTMLElement>(REPORT_BUTTON) ?? null} /> : null}
        </>
      ) : null}
    </div>
  );
}
