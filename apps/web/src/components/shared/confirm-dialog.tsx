import type { ReactNode } from 'react';
import { AlertCancel, AlertDescription, AlertPanel, AlertTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { InlineAlert } from './inline-alert';

export interface ConfirmDialogProps {
  open: boolean;
  /** The question, shown as the heading; it names the dialog. */
  title: ReactNode;
  /** What follows from confirming, if anything is to be said; it describes the dialog. */
  description?: ReactNode;
  /** The confirming control's label. */
  confirmLabel: string;
  /** The cancelling control's label. */
  cancelLabel: string;
  /** The confirmed work is in flight: the confirm control shows a loader and does nothing on a second press. */
  pending?: boolean;
  /** Why the last confirm failed, shown in the dialog as an alert. */
  failure?: string | null;
  onConfirm: () => void;
  /** Cancel, Escape, a press on the backdrop: the caller closes the dialog (or keeps it while `pending`). */
  onCancel: () => void;
  /** Where focus goes when it closes; unset or null: back to the element that opened it. */
  finalFocus?: (() => HTMLElement | null) | undefined;
}

// A confirmation before an action that cannot be undone (SRS §4.2 Modal). Display only: what confirming does comes in as
// onConfirm. Focus opens on cancel, stays inside, Escape and a backdrop press cancel (the screen's Back too, via useBackCloses), and goes back to the opener (or `finalFocus`) on close.
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, title, description, confirmLabel, cancelLabel, pending = false, failure = null, onConfirm, onCancel, finalFocus } = props;
  return (
    <AlertPanel
      open={open}
      described={description !== undefined}
      finalFocus={finalFocus}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertTitle>{title}</AlertTitle>
      {description !== undefined ? <AlertDescription>{description}</AlertDescription> : null}
      {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
      <div className="flex flex-col gap-3">
        <Button size="lg" block pending={pending} aria-disabled={pending ? true : undefined} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <AlertCancel>
          <Button variant="text" className="self-center">
            {cancelLabel}
          </Button>
        </AlertCancel>
      </div>
    </AlertPanel>
  );
}
