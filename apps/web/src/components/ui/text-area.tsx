import type { ChangeEventHandler, FocusEventHandler } from 'react';
import { cn } from '@/lib/cn';
import { inputStyles } from './text-input';

// Exactly the props of a multi-line text field (like TextInput: no className, no passthrough). The text is the user's own, in the
// Hebrew form, so the box reads right to left.
export interface TextAreaProps {
  value?: string;
  defaultValue?: string;
  /** Visible lines before the box scrolls; default 6. */
  rows?: number;
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
export function TextArea({ rows = 6, error, 'aria-invalid': ariaInvalid, ...rest }: TextAreaProps) {
  const invalid = error ?? ariaInvalid;
  return (
    <textarea
      {...rest}
      rows={rows}
      dir="rtl"
      aria-invalid={invalid ? true : undefined}
      className={cn(inputStyles, 'min-h-32 resize-y py-3')}
    />
  );
}
