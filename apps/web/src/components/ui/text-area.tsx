import type { ChangeEventHandler, FocusEventHandler } from 'react';
import { cn } from '@/lib/cn';
import { inputStyles } from './text-input';

// Exactly the props of a multi-line text field (like TextInput: no className, no passthrough). The text is the user's own, in the
// Hebrew form, so the box reads right to left.
export interface TextAreaProps {
  value?: string;
  defaultValue?: string;
  /** Which way the text reads: right to left (default), or `auto`, from its first strong character (F3.7's report text). */
  dir?: 'rtl' | 'auto';
  /** Visible lines before the box scrolls; default 6. */
  rows?: number;
  /**
   * `box` (default): a tall field. `pill` (redesign 27.10.2026): one line in a rounded field that grows with the text, as the feed's
   * composer at rest and a comment field.
   */
  shape?: 'box' | 'pill';
  /** `error` sets `aria-invalid`; FormField hands its own invalid state over as `aria-invalid`. */
  error?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
}

// Its accessible name comes from FormField (`id`) or `aria-label`; it has none of its own.
export function TextArea({ rows = 6, shape = 'box', dir = 'rtl', error, 'aria-invalid': ariaInvalid, ...rest }: TextAreaProps) {
  const invalid = error ?? ariaInvalid;
  return (
    <textarea
      {...rest}
      rows={shape === 'pill' ? 1 : rows}
      dir={dir}
      aria-invalid={invalid ? true : undefined}
      className={cn(inputStyles, shape === 'pill' ? 'max-h-60 min-h-11 resize-none rounded-xl py-2.5 field-sizing-content' : 'min-h-32 resize-y py-3')}
    />
  );
}
