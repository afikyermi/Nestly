import { useId, type FormEvent } from 'react';
import { FieldError } from '@/components/shared/field-message';
import { Button } from '@/components/ui/button';
import { SendIcon } from '@/components/ui/icons';
import { TextArea } from '@/components/ui/text-area';

export interface MessageComposerProps {
  /** The field's accessible name (its label, read by screen readers only). */
  label: string;
  /** The send button's accessible name and tooltip. */
  sendLabel: string;
  text: string;
  onTextChange: (text: string) => void;
  /** The field's error, under the row. */
  problem: string | null;
  sending: boolean;
  /** Announced while sending, in a polite status region. */
  sendingText?: string;
  /** The form's name, from the thread heading. */
  labelledBy?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

// A thread's composer (redesign 27.10.2026): one rounded line that grows with the text, and a round plum send button at its side.
// The label is kept for screen readers; the send button shows its loader while sending and ignores a second activation.
export function MessageComposer({ label, sendLabel, text, onTextChange, problem, sending, sendingText, labelledBy, onSubmit }: MessageComposerProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1.5" {...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy })}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextArea
            id={id}
            shape="pill"
            dir="auto"
            value={text}
            aria-describedby={problem === null ? undefined : errorId}
            aria-invalid={problem === null ? undefined : true}
            onChange={(event) => onTextChange(event.target.value)}
          />
        </div>
        <Button type="submit" iconOnly label={sendLabel} pending={sending} className="bg-primary text-primary-foreground hover:bg-primary-strong">
          <SendIcon className="size-5" />
        </Button>
      </div>
      {problem === null ? null : <FieldError id={errorId}>{problem}</FieldError>}
      {sendingText === undefined ? null : (
        <span role="status" className="sr-only">
          {sending ? sendingText : ''}
        </span>
      )}
    </form>
  );
}
