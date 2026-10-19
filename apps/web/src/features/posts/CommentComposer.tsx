import { useEffect, useId, useRef } from 'react';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { commentCharactersLeft, type ComposerState } from './comments-state';
import { COMMENT_INVALID_TEXT, COMMENT_REQUIRED_TEXT, COMMENT_TOO_LONG_TEXT, COMMENT_FORM_LABEL, commentRemainingText, REPLY_FORM_LABEL, SEND_LABEL, SENDING_TEXT } from './comments-texts';
import { CANCEL_LABEL } from './posts-texts';

/** The counter speaks only at this many characters left or fewer. */
const COUNTER_FROM = 100;

export interface CommentComposerProps {
  /** A comment under the post, or a reply under a comment: the label and the box's name. */
  mode: 'comment' | 'reply';
  state: ComposerState;
  /** Whose name the comment carries (F3.4 c14): under the box, linked by aria-describedby. */
  notice: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** Reply only: closes the box without sending. */
  onCancel?: () => void;
}

// The comment and reply box (F3.3 w1, F3.4; FR-FEED-003): the text, the name notice, a counter in the limit's last 100 characters, send. Display only: what
// sending does comes in as props. The text is the person's own, so the box reads right to left and nothing in it is markup.
export function CommentComposer({ mode, state, notice, onChange, onSend, onCancel }: CommentComposerProps) {
  const ids = useId();
  const boxRef = useRef<HTMLFormElement>(null);
  const label = mode === 'comment' ? COMMENT_FORM_LABEL : REPLY_FORM_LABEL;
  const { text, error, sending, failure, focusTick } = state;
  const left = commentCharactersLeft(text);

  useEffect(() => {
    if (focusTick > 0) boxRef.current?.querySelector('textarea')?.focus();
  }, [focusTick]);

  return (
    <form
      ref={boxRef}
      aria-label={label}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sending) onSend();
      }}
    >
      {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
      <div className="flex flex-col gap-1.5">
        <FormField label={label} htmlFor={`${ids}-text`} hint={notice} {...(error === null ? {} : { error: error === 'required' ? COMMENT_REQUIRED_TEXT : error === 'invalid' ? COMMENT_INVALID_TEXT : COMMENT_TOO_LONG_TEXT })}>
          {(control) => <TextArea {...control} rows={3} value={text} onChange={(event) => onChange(event.target.value)} />}
        </FormField>
        {/* The polite region is always mounted; it speaks only in the limit's last 100 characters. */}
        <p role="status" className="text-small text-muted-foreground empty:sr-only">
          {left <= COUNTER_FROM ? commentRemainingText(left) : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={sending} aria-disabled={sending ? true : undefined}>
          {sending ? SENDING_TEXT : SEND_LABEL}
        </Button>
        {onCancel !== undefined ? (
          <Button variant="text" onClick={onCancel}>
            {CANCEL_LABEL}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
