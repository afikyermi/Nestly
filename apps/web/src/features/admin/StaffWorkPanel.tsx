import { useId, useState } from 'react';
import { ESCALATION_NOTE_MIN, type ReportDetail, type TargetUser } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { useAdminCall } from '@/hooks/use-admin-call';
import { useStaffAccess } from '@/hooks/use-staff-access';
import { postPath } from '@/lib/post-link';
import { userProfilePath } from '@/lib/profile-link';
import { escalateReport } from '@/services/api/staff-work';
import { formatAdminTime } from './admin-format';
import { FORBIDDEN_TEXT, KIND_ACTION_LABELS, LOAD_FAILED_TEXT } from './admin-texts';
import {
  ACCOUNT_AGE,
  AUTHOR_CARD_TITLE,
  CONTEXT_ANONYMOUS,
  CONTEXT_EMPTY,
  CONTEXT_POST,
  CONTEXT_REPORTED,
  CONTEXT_THREAD,
  CONTEXT_TITLE,
  ENFORCEMENTS_YEAR,
  ESCALATE_LABEL,
  ESCALATE_NOTE_LABEL,
  ESCALATE_SEND,
  ESCALATED_ALREADY,
  ESCALATION_SHOWN,
  HANDLING_TITLE,
  ME,
  NEXT_STEP,
  NOT_OPENED,
  OPEN_PAGE_LABEL,
  OPENED_BY,
  SOMEONE,
} from './staff-work-texts';

/** The page a staff member opens for an independent review of the target (a post, a comment's post, a profile), or null. */
function reviewPath(detail: ReportDetail): string | null {
  if (detail.targetKind === 'post') return postPath(detail.targetId);
  if (detail.targetKind === 'comment' && detail.context?.post != null) return postPath(detail.context.post.id);
  if (detail.targetKind === 'user') return userProfilePath(detail.targetId);
  return null;
}

// The report's work panel (I14 completion, Afik 21.10.2026): the item's context (§9.7: a comment's post and the whole thread, as the staff member's
// policies show them), the author card (account age, enforcement steps of the last 12 months, the next step on the ladder), the handling status
// (§9.10: who opened it, an escalation) and, for a Moderator, "escalate to the Admin" with a note (§9.9). Display and one call; the database decides.
export function StaffWorkPanel({ detail, user, isOpen, onEscalated }: { detail: ReportDetail; user: TargetUser | null; isOpen: boolean; onEscalated: () => void }) {
  const id = useId();
  const access = useStaffAccess();
  const call = useAdminCall();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const handling = detail.handling;
  const page = reviewPath(detail);
  const isModerator = access.kind === 'staff' && access.role === 'moderator';
  const trimmed = note.trim();

  const escalate = async () => {
    if (pending || trimmed.length < ESCALATION_NOTE_MIN) return;
    setPending(true);
    const outcome = await call((token) => escalateReport(token, detail.targetKind, detail.targetId, trimmed));
    setPending(false);
    if (outcome.kind === 'ok') {
      // the screen says it (this panel reloads with the report)
      setNote('');
      onEscalated();
    } else {
      setMessage({ ok: false, text: outcome.kind === 'not-applicable' ? ESCALATED_ALREADY : outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {page === null ? null : (
        <div>
          <Button variant="text" href={page}>
            {OPEN_PAGE_LABEL}
          </Button>
        </div>
      )}
      {detail.context === undefined ? null : (
        <section aria-labelledby={`${id}-context`} className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <h4 id={`${id}-context`} className="text-h3">
            {CONTEXT_TITLE}
          </h4>
          {detail.context.post === null ? null : (
            <div className="flex flex-col gap-1">
              <p className="text-label">{CONTEXT_POST}</p>
              <p className="whitespace-pre-wrap" dir="auto">
                {detail.context.post.text ?? ''}
              </p>
            </div>
          )}
          <p className="text-label">{CONTEXT_THREAD}</p>
          {detail.context.comments.length === 0 ? (
            <p className="text-small text-muted-foreground">{CONTEXT_EMPTY}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.context.comments.map((comment) => (
                <li key={comment.id} className={`rounded-md bg-muted p-2 ${comment.parentId === null ? '' : 'ms-6'}`} data-reported={comment.isReported ? 'true' : undefined}>
                  <p className="text-small text-muted-foreground">
                    {comment.isAnonymous ? `${CONTEXT_ANONYMOUS} · ` : ''}
                    {formatAdminTime(comment.createdAt)}
                    {comment.isReported ? ` · ${CONTEXT_REPORTED}` : ''}
                  </p>
                  <p className="whitespace-pre-wrap" dir="auto">
                    {comment.text ?? ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {user === null || detail.authorCard == null ? null : (
        <section aria-labelledby={`${id}-author`} className="flex flex-col gap-1 rounded-lg border border-border p-4">
          <h4 id={`${id}-author`} className="text-h3">
            {AUTHOR_CARD_TITLE}
          </h4>
          <p>{user.fullName ?? ''}</p>
          <p className="text-small">{ACCOUNT_AGE(detail.authorCard.accountAgeDays)}</p>
          <p className="text-small">{ENFORCEMENTS_YEAR(detail.authorCard.enforcementsLastYear)}</p>
          <p className="text-small">
            {NEXT_STEP}: {KIND_ACTION_LABELS[user.suggestion.kind]}
          </p>
        </section>
      )}
      {handling === undefined ? null : (
        <section aria-labelledby={`${id}-handling`} className="flex flex-col gap-1 rounded-lg border border-border p-4">
          <h4 id={`${id}-handling`} className="text-h3">
            {HANDLING_TITLE}
          </h4>
          {handling.openings.filter((opening) => !opening.isMe).length === 0 ? <p className="text-small">{NOT_OPENED}</p> : null}
          <ul className="flex flex-col gap-1 text-small">
            {handling.openings.map((opening, index) => (
              <li key={index}>{OPENED_BY(opening.isMe ? ME : (opening.label ?? SOMEONE), formatAdminTime(opening.at))}</li>
            ))}
          </ul>
          {handling.escalation === null ? null : (
            <p className="text-small">{ESCALATION_SHOWN(handling.escalation.isMe ? ME : (handling.escalation.label ?? SOMEONE), handling.escalation.note)}</p>
          )}
        </section>
      )}
      {isModerator && isOpen && handling?.escalation === null ? (
        <section aria-labelledby={`${id}-escalate`} className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <h4 id={`${id}-escalate`} className="text-h3">
            {ESCALATE_LABEL}
          </h4>
          <FormField label={ESCALATE_NOTE_LABEL} htmlFor={`${id}-escalate-note`}>
            {(control) => <TextArea {...control} rows={2} dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />}
          </FormField>
          <div>
            <Button variant="soft" pending={pending} disabled={trimmed.length < ESCALATION_NOTE_MIN} onClick={() => void escalate()}>
              {ESCALATE_SEND}
            </Button>
          </div>
        </section>
      ) : null}
      {message === null ? null : message.ok ? <p role="status">{message.text}</p> : <InlineAlert>{message.text}</InlineAlert>}
    </div>
  );
}
