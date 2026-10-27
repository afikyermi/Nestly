import { useId } from 'react';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SheetDescription, SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextArea } from '@/components/ui/text-area';
import { CheckIcon, HelpIcon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { CANCEL, OFFER_ANONYMOUS_NOTE, OFFER_HELP, OFFERED, OFFER_SEND, OFFER_SENDING, OFFER_SHEET_INTRO, OFFER_TEXT_LABEL } from '@/lib/professional-texts';

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

/** Where an Offer Help window returns focus: the control below, in the card or on the post page. */
export const OFFER_CONTROL_SELECTOR = '[data-offer-help], [data-offer-sent]';

// A Professional's Offer Help control in a post's action row (FR-SERV-005; the feed card and the post page): "הצעת עזרה", or once sent
// "נשלחה הצעה" (one per post), which can take focus back from the window. Display only.
export function OfferHelpControl({ sent, onOffer }: { sent: boolean; onOffer: () => void }) {
  // Redesign 27.10.2026 (NFR-USAB-004): the last action of the row, pushed to its far end, with its own icon (a hand holding a heart, never
  // the like's nest); the icon alone below 1024 with its name and a tooltip, icon and word from 1024. Sent: the same icon in grey with a ✓.
  return sent ? (
    <Tooltip label={OFFERED}>
      <span
        tabIndex={-1}
        className="relative ms-auto inline-flex size-11 items-center justify-center gap-2 text-label text-muted-foreground lg:ms-0 lg:w-auto lg:flex-1"
        data-offer-sent=""
      >
        <HelpIcon />
        <span aria-hidden="true" className="absolute end-1 top-1.5 grid size-3.5 place-items-center rounded-full bg-muted-foreground text-primary-foreground ring-2 ring-card lg:hidden">
          <CheckIcon className="size-2.5" />
        </span>
        <span className="sr-only lg:not-sr-only">{OFFERED}</span>
      </span>
    </Tooltip>
  ) : (
    <Tooltip label={OFFER_HELP}>
      <button
        type="button"
        data-offer-help=""
        aria-label={OFFER_HELP}
        onClick={onOffer}
        className="ms-auto inline-flex size-11 items-center justify-center gap-2 rounded-full text-label font-bold text-primary-strong transition-colors duration-fast ease-standard hover:bg-muted lg:ms-0 lg:w-auto lg:flex-1 lg:rounded-md"
      >
        <HelpIcon />
        <span aria-hidden="true" className="hidden lg:inline">
          {OFFER_HELP}
        </span>
      </button>
    </Tooltip>
  );
}
