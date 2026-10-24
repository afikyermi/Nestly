import { useId } from 'react';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextArea } from '@/components/ui/text-area';
import { CANCEL, OFFER_ANONYMOUS_NOTE, OFFER_HELP, OFFER_SEND, OFFER_SENDING, OFFER_SHEET_INTRO, OFFER_TEXT_LABEL } from '@/lib/professional-texts';

export interface OfferHelpSheetProps {
  /** The post carries no name (AC-147): one more line says the identity stays hidden until an accept. */
  isAnonymous: boolean;
  text: string;
  /** The text's problem (empty, too long), shown on the field. */
  error: string | null;
  sending: boolean;
  /** Why the last send failed, as an alert in the window. */
  failure: string | null;
  onTextChange: (text: string) => void;
  onSend: () => void;
  /** ביטול, Escape, a press outside: the caller closes the window (or keeps it while `sending`). */
  onCancel: () => void;
  /** Where focus goes when it closes; unset or null: back to the element that opened it. */
  finalFocus?: (() => HTMLElement | null) | undefined;
}

// The Offer Help window (FR-SERV-005, §13.2) on the shared sheet: what an offer is (a first message the author accepts or declines; only an
// accept opens a conversation), the first message, send and cancel. Display only: what sending does comes in as props. Focus starts in the text.
export function OfferHelpSheet(props: OfferHelpSheetProps) {
  const { isAnonymous, text, error, sending, failure, onTextChange, onSend, onCancel, finalFocus } = props;
  const ids = useId();
  return (
    <SheetPanel
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      onOpened={(panel) => panel.querySelector<HTMLElement>('textarea')?.focus()}
      finalFocus={finalFocus}
    >
      <SheetTitle>{OFFER_HELP}</SheetTitle>
      <SheetDescription>{isAnonymous ? `${OFFER_SHEET_INTRO} ${OFFER_ANONYMOUS_NOTE}` : OFFER_SHEET_INTRO}</SheetDescription>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!sending) onSend();
        }}
      >
        {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
        <FormField label={OFFER_TEXT_LABEL} htmlFor={`${ids}-text`} {...(error === null ? {} : { error })}>
          {(control) => <TextArea {...control} dir="auto" rows={4} value={text} onChange={(event) => onTextChange(event.target.value)} />}
        </FormField>
        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" block pending={sending} aria-disabled={sending ? true : undefined}>
            {sending ? OFFER_SENDING : OFFER_SEND}
          </Button>
          <Button variant="text" className="self-center" aria-disabled={sending ? true : undefined} onClick={onCancel}>
            {CANCEL}
          </Button>
        </div>
      </form>
    </SheetPanel>
  );
}
