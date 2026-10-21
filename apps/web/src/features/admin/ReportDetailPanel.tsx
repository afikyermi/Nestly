import { useId, useState } from 'react';
import type { PermissionKey, ReportDetail } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { formatAdminTime } from './admin-format';
import { ReportImages } from './ReportImages';
import {
  ACTIONS_HEADING,
  ANONYMOUS_NOTE,
  CLOSE_ONLY_LABEL,
  CONTENT_GONE_TEXT,
  OPEN_PRIVATE_LABEL,
  PRIVATE_GROUP_DENIED_TEXT,
  PRIVATE_GROUP_TEXT,
  CONTENT_HEADING,
  CONTENT_STATUS_LABELS,
  COPIED_TEXT_LABEL,
  DETAIL_TITLE,
  DISMISS_LABEL,
  HIDE_LABEL,
  KIND_LABELS,
  NOTE_LABEL,
  REASON_LABEL,
  REASON_REQUIRED_TEXT,
  REMOVE_LABEL,
  REPORTS_HEADING,
  RESTORE_LABEL,
  REVEAL_LABEL,
  revealedText,
} from './admin-texts';

export type ReportAction =
  | { type: 'dismiss'; note?: string }
  | { type: 'close'; note?: string }
  | { type: 'hide' | 'remove'; reason: string }
  | { type: 'restore'; reason: string }
  | { type: 'reveal' };

export interface ReportDetailPanelProps {
  detail: ReportDetail;
  permissions: readonly PermissionKey[];
  /** The author named by "חשיפת המחבר", once revealed. */
  revealed: { fullName: string | null } | null;
  pending: boolean;
  failure: string | null;
  /** Whether the open reports on this target are still open (a closed one has nothing to close). */
  isOpen: boolean;
  onAction: (action: ReportAction) => void;
  /** I10 (NFR-PRIV-002): open the reported Private Group content (audited). */
  onOpenPrivate?: () => void;
}

// One reported post, comment or profile (FR-MOD-003): the text as it is now, the reports on it with their copy of the text, and the actions the keys allow.
// Closing a report and moving the content are one step; the reason of a move goes to the Audit Log. What the database allows is the Permission Key.
export function ReportDetailPanel({ detail, permissions, revealed, pending, failure, isOpen, onAction, onOpenPrivate }: ReportDetailPanelProps) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const canModerate = permissions.includes('CONTENT_MODERATE') && detail.targetKind !== 'user';
  const canClose =
    permissions.includes('REPORTS_VIEW') &&
    (detail.targetKind === 'user'
      ? permissions.some((key) => key === 'USER_WARN' || key === 'USER_SUSPEND' || key === 'USER_BAN')
      : permissions.includes('CONTENT_MODERATE'));
  const content = detail.content;
  const moved = content !== null && (content.status === 'hidden' || content.status === 'removed');

  function withReason(type: 'hide' | 'remove' | 'restore') {
    if (reason.trim() === '') {
      setProblem(REASON_REQUIRED_TEXT);
      return;
    }
    setProblem(null);
    onAction({ type, reason: reason.trim() });
  }
  const trimmedNote = note.trim();

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4">
      <h3 id={`${id}-h`} className="text-h2">
        {DETAIL_TITLE} · {KIND_LABELS[detail.targetKind]}
      </h3>
      {detail.targetKind === 'user' ? null : (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-4">
          <h4 className="text-label">{CONTENT_HEADING}</h4>
          {content === null && detail.privateGroup === true ? (
            permissions.includes('PRIVATE_GROUP_MODERATE') ? (
              <div className="flex flex-col items-start gap-2">
                <p>{PRIVATE_GROUP_TEXT}</p>
                {onOpenPrivate === undefined ? null : (
                  <Button variant="soft" onClick={onOpenPrivate}>
                    {OPEN_PRIVATE_LABEL}
                  </Button>
                )}
              </div>
            ) : (
              <p>{PRIVATE_GROUP_DENIED_TEXT}</p>
            )
          ) : content === null ? (
            <p>{CONTENT_GONE_TEXT}</p>
          ) : (
            <>
              <p className="whitespace-pre-wrap" dir="auto">
                {content.text}
              </p>
              <p className="text-small text-muted-foreground">{CONTENT_STATUS_LABELS[content.status] ?? content.status}</p>
              {content.isAnonymous ? <p className="text-small">{ANONYMOUS_NOTE}</p> : null}
              {content.images === undefined || content.images.length === 0 ? null : <ReportImages images={content.images} permissions={permissions} hasGround={detail.reports.some((report) => report.status === 'open' || report.resolution === 'action_taken')} />}
            </>
          )}
        </div>
      )}
      <div>
        <h4 className="text-label">{REPORTS_HEADING}</h4>
        <ul className="mt-1 flex flex-col gap-2">
          {detail.reports.map((report) => (
            <li key={report.id} className="rounded-md border border-border p-3 text-small">
              <p>
                {report.reasonLabel} · {formatAdminTime(report.createdAt)}
              </p>
              {report.details === null ? null : <p dir="auto">{report.details}</p>}
              {report.copiedText === null ? null : (
                <p className="text-muted-foreground" dir="auto">
                  {COPIED_TEXT_LABEL}: {report.copiedText}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      <div className="flex flex-col gap-4 rounded-lg border border-border p-4" role="group" aria-labelledby={`${id}-actions`}>
        <h4 id={`${id}-actions`} className="text-h3">
          {ACTIONS_HEADING}
        </h4>
        {isOpen && canClose ? (
          <FormField label={NOTE_LABEL} optional>
            {(control) => <TextArea {...control} rows={2} dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />}
          </FormField>
        ) : null}
        {isOpen && canClose ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="soft" pending={pending} onClick={() => onAction({ type: 'dismiss', ...(trimmedNote === '' ? {} : { note: trimmedNote }) })}>
              {DISMISS_LABEL}
            </Button>
            <Button variant="soft" pending={pending} onClick={() => onAction({ type: 'close', ...(trimmedNote === '' ? {} : { note: trimmedNote }) })}>
              {CLOSE_ONLY_LABEL}
            </Button>
          </div>
        ) : null}
        {canModerate && content !== null ? (
          <>
            <FormField label={REASON_LABEL} {...(problem === null ? {} : { error: problem })}>
              {(control) => <TextArea {...control} rows={2} dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />}
            </FormField>
            <div className="flex flex-wrap gap-3">
              {isOpen && !moved ? (
                <>
                  <Button pending={pending} onClick={() => withReason('hide')}>
                    {HIDE_LABEL}
                  </Button>
                  <Button pending={pending} onClick={() => withReason('remove')}>
                    {REMOVE_LABEL}
                  </Button>
                </>
              ) : null}
              {moved ? (
                <Button variant="soft" pending={pending} onClick={() => withReason('restore')}>
                  {RESTORE_LABEL}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
        {detail.targetKind === 'post' && content?.isAnonymous === true && isOpen && permissions.includes('REPORTS_VIEW') && permissions.includes('CONTENT_MODERATE') ? (
          <div className="flex flex-col items-start gap-2">
            {revealed === null ? (
              <Button variant="soft" pending={pending} onClick={() => onAction({ type: 'reveal' })}>
                {REVEAL_LABEL}
              </Button>
            ) : (
              <p role="status">{revealedText(revealed.fullName)}</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
